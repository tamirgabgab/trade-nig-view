import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DEFAULT_HOME, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { HOME_RESULT, TAX_PRESETS } from '../test/plannerHomeBody.ts';
import { jsonResponse, renderWithQuery, stubApi } from '../test/render.tsx';
import { PlannerHome } from './PlannerHome.tsx';

beforeEach(() => {
  usePlannerHomeStore.setState({ home: DEFAULT_HOME, saved: { purchase: {}, betterment: {} } });
});

describe('PlannerHome', () => {
  it('runs only once the tax tables are there, with the picked tables in the request', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/home': (_url, init) => {
        sent.push(JSON.parse(typeof init?.body === 'string' ? init.body : '{}'));
        return jsonResponse(HOME_RESULT);
      },
    });
    renderWithQuery(<PlannerHome hidden={false} />);
    const run = screen.getByRole('button', { name: 'Run' });
    expect(run).toBeDisabled();
    expect(screen.getByText('Loading the tax tables…')).toBeInTheDocument();

    const table = await screen.findByRole('combobox', { name: 'Purchase tax table' });
    expect(run).toBeEnabled();
    await user.selectOptions(table, 'additional_home_2026');
    await user.click(screen.getByRole('checkbox', { name: /^Single home: exempt/ }));
    await user.click(run);

    const cards = await screen.findByText('First payment', { selector: 'dt' });
    expect(cards.parentElement).toHaveTextContent('₪3,636');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      purchase: { tax_brackets: TAX_PRESETS.purchase[1]?.brackets },
      sale: { betterment: { rate_pct: 25, single_home: false, ceiling: 5_008_000 } },
    });
    expect(screen.getByText(/^Changed: save it/)).toBeInTheDocument();
    expect(screen.getByText('After the last published CPI it is held flat')).toBeVisible();
    const schedule = screen.getByRole('table', { name: 'Mortgage schedule' });
    expect(within(schedule).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Yearly return, real').parentElement).toHaveTextContent('—');
  });

  it('shows why a plan cannot run and drops the earlier results', async () => {
    const user = userEvent.setup();
    let fail = false;
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/home': () =>
        fail
          ? jsonResponse({ detail: 'The equity cannot exceed the price', status: 422 }, 422)
          : jsonResponse(HOME_RESULT),
    });
    renderWithQuery(<PlannerHome hidden={false} />);
    await screen.findByRole('combobox', { name: 'Purchase tax table' });
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('table', { name: 'Mortgage tracks' });
    fail = true;
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The equity cannot exceed');
    expect(screen.queryByRole('table', { name: 'Mortgage tracks' })).not.toBeInTheDocument();
  });

  it('says so when the plan’s table is gone, and uses the first built-in one', async () => {
    usePlannerHomeStore.setState({
      home: { ...DEFAULT_HOME, purchaseTax: { preset: 'a_table_of_2020', edited: null } },
    });
    stubApi({ '/api/planner/tax-presets': { body: TAX_PRESETS } });
    renderWithQuery(<PlannerHome hidden={false} />);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'no longer there; “Single home (2026)” is used',
    );
    expect(screen.getByRole('spinbutton', { name: 'Purchase tax bracket 2 rate %' })).toHaveValue(
      3.5,
    );
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  it('shows what a higher Bank of Israel rate does to the payments, or why nothing moves', async () => {
    const user = userEvent.setup();
    let stress: unknown[] = [];
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/home': () => jsonResponse({ ...HOME_RESULT, stress }),
    });
    renderWithQuery(<PlannerHome hidden={false} />);
    const run = screen.getByRole('button', { name: 'Run' });
    await vi.waitFor(() => {
      expect(run).toBeEnabled();
    });
    await user.click(run);
    expect(await screen.findByText(/^Every track has a fixed rate/)).toBeVisible();
    expect(screen.queryByRole('table', { name: 'Rate stress' })).not.toBeInTheDocument();

    stress = [
      { rise: 0.01, highest_payment: 3_950.5, paid: 7_500 },
      { rise: 0.02, highest_payment: 4_325.55, paid: 7_900 },
    ];
    await user.click(run);
    const table = await screen.findByRole('table', { name: 'Rate stress' });
    const rows = within(table)
      .getAllByRole('row')
      .map((row) =>
        within(row)
          .queryAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    // Against the plan's own highest payment over the whole term (3,635.88).
    expect(rows.slice(1)).toEqual([
      ['+1 point', '₪3,951', '+₪315', '₪7,500'],
      ['+2 points', '₪4,326', '+₪690', '₪7,900'],
    ]);
  });

  it('never runs without the tax tables', async () => {
    stubApi({ '/api/planner/tax-presets': { status: 503, body: { detail: 'down' } } });
    renderWithQuery(<PlannerHome hidden={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
  });
});
