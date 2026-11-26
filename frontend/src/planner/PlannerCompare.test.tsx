import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DEFAULT_HOME, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { DEFAULT_FORM, usePlannerStore } from '../store/plannerStore.ts';
import { SCENARIO_RESULT, STUDY_RESULT } from '../test/plannerCompareBody.ts';
import { TAX_PRESETS } from '../test/plannerHomeBody.ts';
import { jsonResponse, renderWithQuery, stubApi } from '../test/render.tsx';
import { PlannerCompare } from './PlannerCompare.tsx';

beforeEach(() => {
  usePlannerStore.setState({ form: DEFAULT_FORM });
  usePlannerHomeStore.setState({ home: DEFAULT_HOME, saved: { purchase: {}, betterment: {} } });
});

const body = (init: RequestInit | undefined): unknown =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
const card = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement;

describe('PlannerCompare', () => {
  it('compares the two tabs’ plan once the tax tables are there', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/run': (_url, init) => {
        sent.push(body(init));
        return jsonResponse(SCENARIO_RESULT);
      },
    });
    renderWithQuery(<PlannerCompare hidden={false} />);
    const compare = screen.getByRole('button', { name: 'Compare' });
    expect(compare).toBeDisabled();
    await screen.findByText(/^Set the apartment and the market mix/);
    await vi.waitFor(() => {
      expect(compare).toBeEnabled();
    });
    await user.click(compare);

    expect(
      await screen.findByRole('heading', {
        name: 'Apartment against market: 2015-01-15 to 2025-01-15',
      }),
    ).toBeInTheDocument();
    expect(card('Put in by each')).toHaveTextContent('₪900,000');
    expect(card('Apartment: worth at the end')).toHaveTextContent('₪2,100,000');
    expect(card('Apartment minus market')).toHaveTextContent('−₪400,000');
    expect(card('Market: yearly return')).toHaveTextContent('12.07%');
    expect(card('Market: net worth averaged over time')).toHaveTextContent('₪1,400,000');
    // The breakeven rates: one without a root, and the rent as shekels a month.
    expect(card('Apartment appreciation')).toHaveTextContent('6.25% a year');
    expect(card('Mortgage rates')).toHaveTextContent('None in range');
    expect(card('Rent')).toHaveTextContent('₪8,250 a month');
    expect(screen.getByText('After the last published CPI it is held flat')).toBeVisible();
    expect(screen.queryByRole('table', { name: 'Win map' })).not.toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      x: { home: { start: '2015-01-15', price: 2_000_000 }, market: null },
      y: { market: { assets: [{ symbol: 'SPY' }] } },
      end: '2025-01-15',
    });
  });

  it('runs history with the range, the step and the rates switch, and shows the win map', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/run': { body: SCENARIO_RESULT },
      '/api/planner/study': (_url, init) => {
        sent.push(body(init));
        return jsonResponse(STUDY_RESULT);
      },
    });
    renderWithQuery(<PlannerCompare hidden={false} />);
    const history = screen.getByRole('button', { name: 'Run history' });
    await vi.waitFor(() => {
      expect(history).toBeEnabled();
    });
    await user.type(screen.getByLabelText('First start'), '2002-01-01');
    await user.selectOptions(screen.getByLabelText('A start every'), '3');
    await user.click(screen.getByRole('checkbox', { name: /^Move the tracks’ rates/ }));
    await user.click(
      screen.getByRole('checkbox', { name: /also makes the Market tab’s deposits/ }),
    );
    await user.click(history);

    expect(
      await screen.findByRole('heading', { name: 'History: 3 starts, 2002-01-15 to 2002-03-15' }),
    ).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      first_start: '2002-01-01',
      last_start: null,
      step_months: 3,
      follow_rates: false,
      horizons_years: [5, 10, 15, 20, 25, 30],
      x: { market: { deposits: [{ date: '2015-01-02' }] } },
    });
    // The apartment's side is named for its account, in the cards and in the map.
    expect(card('P(apartment and account > market)')).toHaveTextContent('33.33%');
    expect(card('Independent terms, about')).toHaveTextContent('1.0');
    expect(card('Median difference')).toHaveTextContent('−₪120,000');
    expect(
      screen.getByText('Earlier starts cannot run: AAPL has no data before 2001-12-24.'),
    ).toBeVisible();
    expect(screen.queryByText(/^Later starts cannot run/)).not.toBeInTheDocument();
    const map = screen.getByRole('table', { name: 'Win map' });
    expect(within(map).getAllByRole('row')).toHaveLength(3);
    expect(card('Apartment and account: worth at the end')).toHaveTextContent('₪2,100,000');
  });

  it('shows why a comparison cannot run and drops the earlier results', async () => {
    const user = userEvent.setup();
    let fail = false;
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/run': () =>
        fail
          ? jsonResponse({ detail: 'SPY has no data before 2021-02-22', status: 422 }, 422)
          : jsonResponse(SCENARIO_RESULT),
    });
    renderWithQuery(<PlannerCompare hidden={false} />);
    const compare = screen.getByRole('button', { name: 'Compare' });
    await vi.waitFor(() => {
      expect(compare).toBeEnabled();
    });
    await user.click(compare);
    await screen.findByRole('heading', { name: 'Breakeven rates' });
    fail = true;
    await user.click(compare);
    expect(await screen.findByRole('alert')).toHaveTextContent('SPY has no data before');
    expect(screen.queryByRole('heading', { name: 'Breakeven rates' })).not.toBeInTheDocument();
  });
});
