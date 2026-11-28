import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { TaxPresets } from '../api/planner.ts';
import { DEFAULT_HOME, sanitizeHome, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { DEFAULT_FORM, sanitizePersisted, usePlannerStore } from '../store/plannerStore.ts';
import { SCENARIO_RESULT, SIMULATION_RESULT, STUDY_RESULT } from '../test/plannerCompareBody.ts';
import { TAX_PRESETS } from '../test/plannerHomeBody.ts';
import { jsonResponse, renderWithQuery, stubApi } from '../test/render.tsx';
import { PlannerCompare } from './PlannerCompare.tsx';
import { captureScenario } from './scenarioState.ts';

beforeEach(() => {
  usePlannerStore.setState({ ...sanitizePersisted(null) });
  usePlannerHomeStore.setState({ ...sanitizeHome(null) });
});

const body = (init: RequestInit | undefined): unknown =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
const SCENARIO_PRESETS = TAX_PRESETS as TaxPresets;
const ASSET = { symbol: 'SPY', weight: 100, currency: 'USD' as const, dividendYield: 0 };
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
    await screen.findByText(/^Set each option in the Market and the Apartment tabs/);
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
    // What the answer depends on: the apartment's return by source, adding up to it.
    const cells = (table: string, label: string) =>
      within(
        within(screen.getByRole('table', { name: table }))
          .getByText(label)
          .closest('tr') ?? document.body,
      )
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
    expect(cells('Apartment return', 'Appreciation')).toEqual(['Appreciation', '+4.10']);
    expect(cells('Apartment return', 'Costs and taxes')).toEqual(['Costs and taxes', '−2.09']);
    expect(cells('Apartment return', 'The apartment’s yearly return')).toEqual([
      'The apartment’s yearly return',
      '9.91%',
    ]);
    expect(screen.getByRole('table', { name: 'Sensitivity' })).toBeVisible();
    expect(card('Leads at the end')).toHaveTextContent('Market');
    expect(card('Stays ahead from')).toHaveTextContent('Month 120');
    expect(card('Exit months apartment leads')).toHaveTextContent('33.33%');
    expect(
      screen.getByRole('img', { name: 'End value by exit month: Apartment and Market' }),
    ).toBeVisible();
    // Both options' net worth along the plan, a line each, with its CSV.
    const worth = screen.getByRole('img', {
      name: 'Net worth along the plan: Apartment and Market',
    });
    expect(worth.querySelectorAll('polyline')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /net worth/i })).toBeInTheDocument();
    expect(cells('Liquidity', 'Cash at once')).toEqual(['Cash at once', '₪0', '₪2,500,000']);
    expect(cells('Liquidity', 'Apartment, forced sale at −10%')).toEqual([
      'Apartment, forced sale at −10%',
      '₪1,900,000',
      '—',
    ]);
    expect(card('Dwelling prices and the market')).toHaveTextContent('0.12');
    // The years behind the correlation, its interval and the exit step are on the page itself.
    expect(screen.getByText(/^An exit is checked every 40 months/)).toHaveTextContent(
      /over 30 years; its 95% interval is −0.25 to 0.46/,
    );
    expect(screen.getByText(/add up to the return, to the rounding shown/)).toBeVisible();
    // A later edit of the apartment's rent does not rescale the result that is on screen.
    act(() => {
      usePlannerHomeStore.getState().update({ rent: { ...DEFAULT_HOME.rent, monthly: 9_000 } });
    });
    expect(card('Rent')).toHaveTextContent('₪8,250 a month');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      x: {
        home: { start: '2015-01-15', price: 2_000_000 },
        market: { assets: [{ symbol: 'SPY' }] },
      },
      y: { market: { assets: [{ symbol: 'SPY' }] } },
      end: '2025-01-15',
      forced_discount_pct: 10,
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
    await user.click(screen.getByRole('checkbox', { name: 'Option A: its own market deposits' }));
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

  it('simulates with the form’s settings and shows the distribution', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/run': { body: SCENARIO_RESULT },
      '/api/planner/simulate': (_url, init) => {
        sent.push(body(init));
        return jsonResponse(SIMULATION_RESULT);
      },
    });
    renderWithQuery(<PlannerCompare hidden={false} />);
    const simulate = screen.getByRole('button', { name: 'Simulate' });
    await vi.waitFor(() => {
      expect(simulate).toBeEnabled();
    });
    // Both methods cut what is historical in blocks; a Monte Carlo adds a market model.
    expect(screen.getByRole('spinbutton', { name: 'Block length (months)' })).toBeVisible();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Simulation method' }),
      'monte_carlo',
    );
    expect(screen.getByRole('spinbutton', { name: 'Block length (months)' })).toBeVisible();
    const mean = screen.getByRole('spinbutton', { name: 'Market mean % a year' });
    expect(mean).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /^Estimate the market/ }));
    expect(mean).toBeEnabled();
    await user.click(simulate);

    expect(
      await screen.findByRole('heading', { name: 'Simulation: 4 worlds, block bootstrap' }),
    ).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      method: 'monte_carlo',
      runs: 1000,
      market_mean_pct: 7,
      market_sd_pct: 16,
      income: null,
      x: { home: { start: '2015-01-15' } },
      end: '2025-01-15',
    });
    expect(screen.getByRole('slider', { name: 'Lower bound a' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Risk' })).toBeVisible();
    // An estimated market fills the two fields, ready to be edited.
    await user.click(screen.getByRole('checkbox', { name: /^Estimate the market/ }));
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/run': { body: SCENARIO_RESULT },
      '/api/planner/simulate': {
        body: { ...SIMULATION_RESULT, market: { mean: 0.0912, sd: 0.1834, estimated: true } },
      },
    });
    await user.click(simulate);
    await vi.waitFor(() => {
      expect(mean).toHaveValue(9.12);
    });
    expect(screen.getByRole('spinbutton', { name: 'Market volatility % a year' })).toHaveValue(
      18.34,
    );
    expect(mean).toBeDisabled();
    // The plan as entered is shown with it; a plain Compare afterwards drops the simulation.
    expect(card('Put in by each')).toHaveTextContent('₪900,000');
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    await vi.waitFor(() => {
      expect(screen.queryByRole('table', { name: 'Risk' })).not.toBeInTheDocument();
    });
  });

  it('says why an apartment bought with nothing down has no return to share out', async () => {
    const user = userEvent.setup();
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/run': { body: { ...SCENARIO_RESULT, decomposition: null, correlation: null } },
    });
    renderWithQuery(<PlannerCompare hidden={false} />);
    const compare = screen.getByRole('button', { name: 'Compare' });
    await vi.waitFor(() => {
      expect(compare).toBeEnabled();
    });
    await user.click(compare);
    expect(await screen.findByText(/cannot be shared between its sources/)).toBeVisible();
    expect(screen.queryByRole('table', { name: 'Apartment return' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dwelling prices and the market')).not.toBeInTheDocument();
    expect(screen.getByText(/^An exit is checked every 40 months/)).not.toHaveTextContent(
      'correlation',
    );
  });

  it('reports a response without what the page needs, instead of breaking on it', async () => {
    const user = userEvent.setup();
    // An undefined field is not sent: the body an older backend would give.
    const older = { ...SCENARIO_RESULT, lead: undefined };
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/run': { body: older },
    });
    renderWithQuery(<PlannerCompare hidden={false} />);
    const compare = screen.getByRole('button', { name: 'Compare' });
    await vi.waitFor(() => {
      expect(compare).toBeEnabled();
    });
    await user.click(compare);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unexpected /api/planner/run response',
    );
  });

  it('compares two apartments when both options contain one, each from its own form', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    usePlannerStore.setState({ same: false });
    usePlannerHomeStore.setState({ other: { ...DEFAULT_HOME, price: 3_000_000 } });
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/run': (_url, init) => {
        sent.push(body(init));
        return jsonResponse(SCENARIO_RESULT);
      },
    });
    renderWithQuery(<PlannerCompare hidden={false} />);
    const compare = screen.getByRole('button', { name: 'Compare' });
    await vi.waitFor(() => {
      expect(compare).toBeEnabled();
    });
    // Option A is the apartment and option B the same money in the market, until told otherwise.
    const box = (name: string) => screen.getByRole('checkbox', { name });
    expect(
      ['Option A: apartment', 'Option A: its own market deposits', 'Option B: apartment'].map(
        (name) => (box(name) as HTMLInputElement).checked,
      ),
    ).toEqual([true, false, false]);
    await user.click(box('Option B: apartment'));
    await user.click(compare);
    expect(
      await screen.findByRole('heading', {
        name: 'Apartment A against apartment B: 2015-01-15 to 2025-01-15',
      }),
    ).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      x: { home: { price: 2_000_000 } },
      y: { home: { price: 3_000_000 }, market: { assets: [{ symbol: 'SPY' }] } },
    });
    expect(card('Apartment A: worth at the end')).toHaveTextContent('₪2,100,000');
    expect(usePlannerStore.getState().contents.b.home).toBe(true);
    // Each apartment is sold on its own "Sold on": another day of the month runs too (K4).
    expect(sent[0]).toMatchObject({
      x: { sold_on: DEFAULT_HOME.end },
      y: { sold_on: DEFAULT_HOME.end },
    });
    act(() => {
      usePlannerHomeStore.setState({ other: { ...DEFAULT_HOME, start: '2016-03-20' } });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(compare).toBeEnabled();
  });

  it('reads option B from option A’s forms while the two are the same, however A changed', async () => {
    const user = userEvent.setup();
    const sent: { y: { home: Record<string, unknown>; market: Record<string, unknown> } }[] = [];
    // Forms of option B left from an earlier time apart: they must not be read.
    usePlannerStore.setState({
      other: { ...DEFAULT_FORM, assets: [{ ...ASSET, symbol: 'OLD' }] },
    });
    usePlannerHomeStore.setState({ other: { ...DEFAULT_HOME, price: 9_999_999 } });
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/run': (_url, init) => {
        sent.push(body(init) as (typeof sent)[number]);
        return jsonResponse(SCENARIO_RESULT);
      },
    });
    renderWithQuery(<PlannerCompare hidden={false} />);
    const compare = screen.getByRole('button', { name: 'Compare' });
    await vi.waitFor(() => {
      expect(compare).toBeEnabled();
    });
    await user.click(screen.getByRole('checkbox', { name: 'Option B: apartment' }));
    const run = async () => {
      await user.click(compare);
      await vi.waitFor(() => {
        expect(compare).toBeEnabled();
      });
      return sent.at(-1)?.y;
    };
    // A field edited, in each tab.
    act(() => {
      usePlannerStore.getState().update({ assets: [{ ...ASSET, symbol: 'QQQ' }] });
      usePlannerHomeStore.getState().update({ price: 2_500_000 });
    });
    expect(await run()).toMatchObject({
      home: { price: 2_500_000 },
      market: { assets: [{ symbol: 'QQQ' }] },
    });
    // A tax table saved under a name and chosen.
    act(() => {
      usePlannerHomeStore.getState().savePurchaseTax('Mine', [{ up_to: null, rate_pct: 6 }]);
    });
    expect((await run())?.home['purchase']).toMatchObject({
      tax_brackets: [{ up_to: null, rate_pct: 6 }],
    });
    // The forms reset.
    act(() => {
      usePlannerStore.getState().reset();
      usePlannerHomeStore.getState().reset();
    });
    expect(await run()).toMatchObject({
      home: { price: DEFAULT_HOME.price },
      market: { assets: [{ symbol: 'SPY' }] },
    });
    expect(sent).toHaveLength(3);
  });

  it('runs the comparison again when a saved scenario is loaded', async () => {
    const user = userEvent.setup();
    const sent: { home?: { price?: number } }[] = [];
    // A scenario saved with another price; the page starts from the defaults.
    usePlannerStore.getState().update({ assets: [ASSET] });
    usePlannerHomeStore.getState().update({ price: 4_444_444 });
    const state = captureScenario(SCENARIO_PRESETS);
    usePlannerStore.setState({ ...sanitizePersisted(null) });
    usePlannerHomeStore.setState({ ...sanitizeHome(null) });
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/run': (_url, init) => {
        sent.push((body(init) as { x: { home?: { price?: number } } }).x);
        return jsonResponse(SCENARIO_RESULT);
      },
      '/api/planner/scenarios': {
        body: { scenarios: [{ name: 'Haifa', revision: 1, updated_at: '2026-11-26T10:00:00Z' }] },
      },
      '/api/planner/scenarios/Haifa': {
        body: { name: 'Haifa', revision: 1, updated_at: '2026-11-26T10:00:00Z', state },
      },
    });
    renderWithQuery(<PlannerCompare hidden={false} />);
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Saved scenario' }),
      'Haifa',
    );
    await user.click(screen.getByRole('button', { name: 'Load scenario' }));
    // No click on Compare: the loaded plan is compared by itself, with its own price.
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.home?.price).toBe(4_444_444);
    expect(await screen.findByRole('heading', { name: /against/ })).toBeInTheDocument();
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
