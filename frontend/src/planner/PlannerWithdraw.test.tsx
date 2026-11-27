import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sanitizePersisted, usePlannerStore } from '../store/plannerStore.ts';
import {
  WITHDRAW_HOME_RESULT,
  WITHDRAW_LOTS_RESULT,
  WITHDRAW_MANY_RESULT,
  WITHDRAW_RESULT,
  WITHDRAW_SOLD_RESULT,
} from '../test/plannerWithdrawBody.ts';
import { jsonResponse, renderWithQuery, stubApi } from '../test/render.tsx';
import { PAGE_PREFIX, useUiStore } from '../store/uiStore.ts';
import { PlannerPage } from './PlannerPage.tsx';
import { PlannerWithdraw } from './PlannerWithdraw.tsx';

beforeEach(() => {
  usePlannerStore.setState({ ...sanitizePersisted(null) });
});

const body = (init: RequestInit | undefined): unknown =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
const card = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement;
/** A folded section of the form: its summary's title. */
const fold = (title: string) => screen.getByText(title, { selector: 'summary > :first-child' });

function stub(result: unknown = WITHDRAW_RESULT) {
  const sent: unknown[] = [];
  stubApi({
    '/api/planner/withdraw': (_url, init) => {
      sent.push(body(init));
      return jsonResponse(result);
    },
  });
  return sent;
}

describe('PlannerWithdraw', () => {
  it('runs a fixed amount and leads with when the money ends', async () => {
    const user = userEvent.setup();
    const sent = stub();
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    // The mix it will run, and whose it is.
    expect(screen.getByText(/^Runs the Market tab’s mix: SPY 100%/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(
      await screen.findByRole('heading', { name: 'Withdrawals: 2030-01-15 to 2030-04-15' }),
    ).toBeVisible();
    expect(sent[0]).toMatchObject({
      start: '2015-01-02',
      months: 120,
      capital: 1_000_000,
      cost_share_pct: 50,
      rule: { kind: 'fixed', amount: 4_000, indexed: true },
      returns: { mode: 'mix' },
      market: { assets: [{ symbol: 'SPY' }] },
    });
    expect(card('The money ends')).toHaveTextContent('2030-04-15');
    expect(card('The money ends')).toHaveAttribute(
      'title',
      expect.stringContaining('From month 3 no month is paid in full again'),
    );
    expect(card('Left at the end')).toHaveTextContent('₪0');
    expect(card('Taken, net')).toHaveTextContent('₪27,000');
    expect(card('Tax paid')).toHaveTextContent('₪1,500');
    expect(card('Fees and commissions')).toHaveTextContent('₪150');
    expect(screen.getByText('After the last published CPI it is held flat')).toBeVisible();
    // The two bounds of the tax beside the plan: for a fixed amount, how long it lasts.
    const bounds = screen.getByRole('table', { name: 'Tax bounds' });
    const rows = within(bounds)
      .getAllByRole('row')
      .map((r) =>
        within(r)
          .queryAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows.slice(1)).toEqual([
      ['0%: everything sold is gain', 'Until 2030-04-15', '₪0', '₪1,500'],
      ['50%: as entered', 'Until 2030-04-15', '₪0', '₪1,500'],
      ['100%: only growth is gain', 'All of it', '₪1,500', '₪1,500'],
    ]);
    // A row a year, and the months as a file.
    const years = screen.getByRole('table', { name: 'Withdrawals by year' });
    expect(within(years).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Download CSV: withdrawals' })).toBeVisible();
    expect(screen.getByRole('img', { name: /^Balance and monthly income/ })).toBeVisible();
  });

  it('runs a percent on an assumed return and leads with the income', async () => {
    const user = userEvent.setup();
    const lasting = {
      ...WITHDRAW_RESULT,
      summary: { ...WITHDRAW_RESULT.ceiling, cost_share: 0.5 },
    };
    const sent = stub(lasting);
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'The account grows by' }), [
      'assumed',
    ]);
    expect(screen.getByText(/^The Market tab’s mix is not used/)).toBeVisible();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Withdrawal rule' }), [
      'percent',
    ]);
    // The fields of the other rule and of the other source are not offered.
    expect(screen.queryByRole('spinbutton', { name: 'Amount ₪ a month, net' })).toBeNull();
    const percent = screen.getByRole('spinbutton', { name: 'Sold % a year' });
    await user.clear(percent);
    await user.type(percent, '6');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await screen.findByRole('heading', { name: /^Withdrawals:/ });
    expect(sent[0]).toMatchObject({
      rule: { kind: 'percent', percent: 6 },
      returns: { mode: 'assumed', yearly_pct: 5 },
    });
    expect(card('Income, first month')).toHaveTextContent('₪10,000');
    expect(card('Lowest month, real')).toHaveTextContent('₪9,800');
    expect(screen.queryByText('The money ends', { selector: 'dt' })).toBeNull();
    const bounds = screen.getByRole('table', { name: 'Tax bounds' });
    expect(
      within(bounds)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Cost share', 'Taken, net', 'Lowest month, real', 'Tax paid']);
    expect(usePlannerStore.getState().withdraw).toMatchObject({ rule: 'percent', percent: 6 });
  });

  it('shows when a percent was emptied by the fees, and counts one year as one', async () => {
    const user = userEvent.setup();
    stub({ ...WITHDRAW_RESULT, months: 12 });
    usePlannerStore.getState().setWithdraw({ rule: 'percent' });
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('heading', { name: /^Withdrawals:/ });
    // The fixture's plan ran out in month 3: under a percent that is said first.
    expect(card('The money ends')).toHaveTextContent('2030-04-15');
    expect(card('The money ends')).toHaveAttribute('title', expect.stringContaining('2 months'));
    expect(card('Income, first month')).toBeVisible();
    // The note no longer promises that the account never ends.
    expect(screen.getByText(/a fee larger than what is left can/)).toBeVisible();
  });

  it('counts a short month that the money came back after, and does not call it the end', async () => {
    const user = userEvent.setup();
    const back = {
      ...WITHDRAW_RESULT,
      summary: {
        ...WITHDRAW_RESULT.ceiling,
        months_paid: 2,
        short_months: 1,
        first_short_month: 2,
        first_short_on: '2030-03-15',
      },
    };
    stub(back);
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('heading', { name: /^Withdrawals:/ });
    expect(card('Lasts')).toHaveTextContent('All 3 months');
    expect(card('Lasts')).toHaveAttribute(
      'title',
      '1 month not paid in full, the first on 2030-03-15; the others were',
    );
  });

  it('says whose mix it runs when the two options have forms of their own', () => {
    stub();
    usePlannerStore.setState({ same: false });
    usePlannerStore.getState().swap('b');
    usePlannerStore.getState().update({
      assets: [{ symbol: 'QQQ', weight: 1, currency: 'USD', dividendYield: 0 }],
    });
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    expect(screen.getByText(/^Runs option B’s mix \(the one on screen\): QQQ 100%/)).toBeVisible();
  });

  it('includes an apartment the owner keeps, and shows it in what is left', async () => {
    const user = userEvent.setup();
    const sent = stub(WITHDRAW_HOME_RESULT);
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    // Its fields only when it is included.
    expect(screen.queryByRole('spinbutton', { name: 'Value today ₪' })).toBeNull();
    await user.click(fold('The apartment'));
    await user.click(screen.getByRole('checkbox', { name: 'Include an apartment I own' }));
    expect(screen.getByRole('spinbutton', { name: 'Value today ₪' })).toBeVisible();
    // Rent only when it is rented out; the year of a sale only when it is sold on a date.
    expect(screen.queryByRole('spinbutton', { name: 'Rent ₪ a month' })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'The apartment is' }), [
      'rent_out',
    ]);
    expect(screen.getByRole('spinbutton', { name: 'Rent ₪ a month' })).toBeVisible();
    expect(screen.queryByRole('spinbutton', { name: 'Sold after, years' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('heading', { name: /^Withdrawals:/ });
    expect(sent[0]).toMatchObject({
      home: { value: 2_000_000, use: 'rent_out', rent: 5_500, role: 'kept' },
    });
    expect(card('The apartment')).toHaveTextContent('Kept');
    expect(card('The apartment')).toHaveAttribute('title', expect.stringContaining('₪1,900,000'));
    expect(card('Net worth at the end')).toHaveTextContent('₪1,900,000');
    // At the floor of the tax the account emptied sooner, and the apartment was sold then.
    const bounds = screen.getByRole('table', { name: 'Tax bounds' });
    expect(
      within(bounds)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toContain('The apartment');
    expect(within(bounds).getByText('Forced sale on 2030-03-15')).toBeVisible();
    const years = screen.getByRole('table', { name: 'Withdrawals by year' });
    expect(within(years).getByRole('columnheader', { name: 'Apartment, cash' })).toBeVisible();
    expect(within(years).getByText('₪6,000')).toBeVisible();
  });

  it('sells the apartment on a date and says when', async () => {
    const user = userEvent.setup();
    const sent = stub(WITHDRAW_SOLD_RESULT);
    usePlannerStore.getState().setWithdraw({
      home: { ...usePlannerStore.getState().withdraw.home, include: true },
    });
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Its sale' }), ['on_date']);
    const after = screen.getByRole('spinbutton', { name: 'Sold after, years' });
    await user.clear(after);
    await user.type(after, '3');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('heading', { name: /^Withdrawals:/ });
    expect(sent[0]).toMatchObject({ home: { role: 'on_date', sell_after_months: 36 } });
    expect(card('The apartment')).toHaveTextContent('Sold on 2030-03-15');
    expect(card('The apartment')).toHaveAttribute(
      'title',
      expect.stringContaining('On the date set'),
    );
    expect(usePlannerStore.getState().withdraw.home).toMatchObject({
      role: 'on_date',
      sellAfter: 3,
    });
  });

  it('runs the plan on every start of history: what is left as a histogram', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    stubApi({
      '/api/planner/withdraw': () => jsonResponse(WITHDRAW_RESULT),
      '/api/planner/withdraw/study': (_url, init) => {
        sent.push(body(init));
        return jsonResponse(WITHDRAW_MANY_RESULT);
      },
    });
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.click(screen.getByRole('button', { name: 'Run history' }));

    expect(
      await screen.findByRole('heading', { name: 'History: 3 starts, 2002-01-15 to 2002-03-15' }),
    ).toBeVisible();
    expect(sent[0]).toMatchObject({ months: 120, sustain_pct: 95 });
    // The plan itself is run with it.
    expect(screen.getByRole('heading', { name: /^Withdrawals:/ })).toBeVisible();
    expect(card('Lasts in')).toHaveTextContent('67% of the 3 starts');
    expect(card('Lasts in')).toHaveAttribute('title', expect.stringContaining('33% to 100%'));
    expect(card('Sustainable amount')).toHaveTextContent('₪5,250');
    expect(card('Independent terms, about')).toHaveTextContent('1.0');
    // What is left: as a percent of the start, in shekels of the first day, the ran-out apart.
    const chart = screen.getByRole('img', { name: /^What is left, as a percent of the start/ });
    expect(chart).toBeVisible();
    expect(within(chart).getByText('Ran out: 1 of 3 (33%)')).toBeVisible();
    expect(screen.getByText(/^Of the 2 that lasted, the median is 84%/)).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: 'As a percent of the start' }));
    expect(screen.getByRole('img', { name: /^What is left, in shekels/ })).toBeVisible();
    expect(screen.getByText(/^Of the 2 that lasted, the median is ₪840,000/)).toBeVisible();
    // The share still paying over the years, and the bounds as numbers.
    expect(
      screen.getByRole('img', { name: /^The share of the starts still paying/ }),
    ).toBeVisible();
    const bounds = screen.getByRole('table', { name: 'Tax bounds over the starts' });
    expect(within(bounds).getAllByRole('row')).toHaveLength(4);
    expect(within(bounds).getByText('33%')).toBeVisible();
    expect(screen.getByText(/^Earlier starts cannot run: AAPL has no data before/)).toBeVisible();
    expect(
      screen.getByText('The CPI is assumed: every window has the same inflation'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download CSV: withdrawal starts' })).toBeVisible();
  });

  it('simulates worlds, and under a percent rule shows the income as a fan', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    const worlds = {
      ...WITHDRAW_MANY_RESULT,
      method: 'monte_carlo' as const,
      sustainable: null,
      before: null,
      evidence: { independent: null, history_months: null },
      market: { mean_pct: 6.4, sd_pct: 17.2, estimated: true },
      realizations: WITHDRAW_MANY_RESULT.realizations.map((r) => ({
        ...r,
        start: null,
        depleted_month: null,
      })),
    };
    stubApi({
      '/api/planner/withdraw': () => jsonResponse(WITHDRAW_RESULT),
      '/api/planner/withdraw/simulate': (_url, init) => {
        sent.push(body(init));
        return jsonResponse(worlds);
      },
    });
    usePlannerStore.getState().setWithdraw({ rule: 'percent' });
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.click(fold('History and simulated worlds'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'The worlds’ market' }), [
      'monte_carlo',
    ]);
    // A block length belongs to the bootstrap alone.
    expect(screen.queryByRole('spinbutton', { name: 'Block, months' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Simulate' }));

    expect(
      await screen.findByRole('heading', { name: 'Simulation: 3 worlds, a modelled market' }),
    ).toBeVisible();
    expect(sent[0]).toMatchObject({ method: 'monte_carlo', runs: 1000, market_mean_pct: null });
    expect(
      screen.getByText(/grows 6.4% a year with a volatility of 17.2%, both estimated/),
    ).toBeVisible();
    expect(screen.getByRole('img', { name: /^The monthly income by year/ })).toBeVisible();
    expect(screen.queryByText('Sustainable amount', { selector: 'dt' })).toBeNull();
    expect(screen.queryByText(/^Ran out/)).toBeNull();
    expect(usePlannerStore.getState().withdraw.many.method).toBe('monte_carlo');
  });

  it('shows a study whose own plan cannot run, and a histogram with none that lasted', async () => {
    const user = userEvent.setup();
    const none = {
      ...WITHDRAW_MANY_RESULT,
      method: 'bootstrap' as const,
      realizations: WITHDRAW_MANY_RESULT.realizations.map((r) => ({ ...r, depleted_month: 9 })),
    };
    stubApi({
      '/api/planner/withdraw': () =>
        jsonResponse({ detail: 'AAPL has no data after 2026-11-20', status: 422 }, 422),
      '/api/planner/withdraw/simulate': () => jsonResponse(none),
    });
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.click(screen.getByRole('button', { name: 'Simulate' }));
    expect(await screen.findByRole('heading', { name: /^Simulation: 3 worlds/ })).toBeVisible();
    expect(
      screen.getByText(/^The plan from the start entered cannot run on its own: AAPL has no data/),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    // Nothing lasted: the bar apart, and an axis without a NaN on it.
    const chart = screen.getByRole('img', { name: /^What is left/ });
    expect(within(chart).getByText('Ran out: 3 of 3 (100%)')).toBeVisible();
    expect(chart.textContent).not.toContain('NaN');
    expect(screen.getByText('None of the 3 worlds lasted.')).toBeVisible();
  });

  it('withdraws from what the Market tab’s plan accumulated, lot by lot', async () => {
    const user = userEvent.setup();
    const sent = stub(WITHDRAW_LOTS_RESULT);
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'The account is' }), ['plan']);
    // The capital, its cost share and the first day follow from the plan: they are not typed.
    expect(screen.queryByRole('spinbutton', { name: 'Starting capital ₪' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Cost share %' })).toBeNull();
    expect(screen.queryByLabelText('Starts on')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'The account grows by' })).toBeNull();
    expect(
      screen.getByText(/^The withdrawals start on 2025-01-02, the day the Market tab’s plan ends/),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('heading', { name: /^Withdrawals:/ });
    expect(sent[0]).toMatchObject({
      start: '2025-01-02',
      returns: { mode: 'mix' },
      plan: { end: '2025-01-02', assets: [{ symbol: 'SPY' }] },
    });
    expect(card('The account')).toHaveTextContent('₪310,000');
    expect(card('The account')).toHaveAttribute(
      'title',
      expect.stringContaining('120 deposits from 2015-01-02'),
    );
    // The tax is known lot by lot: no bounds to show.
    expect(screen.queryByRole('table', { name: 'Tax bounds' })).toBeNull();
    expect(screen.getByText(/oldest lot first/)).toBeVisible();
  });

  it('runs the two options side by side when each has settings of its own', async () => {
    const user = userEvent.setup();
    const sent = stub();
    const store = usePlannerStore.getState();
    store.copyToOther();
    store.setSame(false);
    store.swap('b');
    store.setWithdraw({ rule: 'percent', percent: 5 });
    store.swap('a');
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    expect(screen.getByRole('radio', { name: 'Option A' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Run' }));
    const table = await screen.findByRole('table', { name: 'Side by side' });
    expect(sent).toHaveLength(2);
    const rules = (sent as { rule: { kind: string } }[]).map((request) => request.rule.kind);
    expect(rules.sort()).toEqual(['fixed', 'percent']);
    const rows = within(table)
      .getAllByRole('row')
      .map((r) => within(r).queryAllByRole('cell')[0]?.textContent);
    expect(rows.slice(1)).toEqual(['A: ₪4,000 a month, net', 'B: 5% of the account a year']);
    // The full results are of the option on screen.
    expect(screen.getByRole('heading', { name: /^Option A: withdrawals/ })).toBeVisible();
  });

  it('raises the error when neither of the two options can run', async () => {
    const user = userEvent.setup();
    stubApi({
      '/api/planner/withdraw': () =>
        jsonResponse({ detail: 'SPY has no data after 2026-11-20', status: 422 }, 422),
    });
    usePlannerStore.getState().copyToOther();
    usePlannerStore.getState().setSame(false);
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('SPY has no data after');
    expect(screen.queryByRole('table', { name: 'Side by side' })).toBeNull();
  });

  it('shows the same months in reverse order beside the plan', async () => {
    const user = userEvent.setup();
    const back = { ...WITHDRAW_RESULT.ceiling, cost_share: 0.5, balance: 9_000 };
    stub({ ...WITHDRAW_RESULT, reversed: back });
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.click(screen.getByRole('button', { name: 'Run' }));
    const table = await screen.findByRole('table', { name: 'The months in reverse order' });
    const rows = within(table)
      .getAllByRole('row')
      .map((r) =>
        within(r)
          .queryAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows.slice(1)).toEqual([
      ['As it happened', 'Until 2030-04-15', '₪0', '₪27,000'],
      ['In reverse', 'All of it', '₪9,000', '₪27,000'],
    ]);
  });

  it('links each section to the learn page that explains it', async () => {
    const user = userEvent.setup();
    stub();
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(links).toEqual(
      expect.arrayContaining(['#cost-basis', '#withdrawals', '#sustainable-withdrawals']),
    );
    await user.click(screen.getByRole('link', { name: 'How much can be taken' }));
    expect(useUiStore.getState().learnFor).toBe(`${PAGE_PREFIX}sustainable-withdrawals`);
  });

  it('folds the apartment and the studies, and says in their summary what will run', async () => {
    const user = userEvent.setup();
    stub();
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    const apartment = fold('The apartment').closest('details');
    const studies = fold('History and simulated worlds').closest('details');
    expect([apartment?.open, studies?.open]).toEqual([false, false]);
    expect(apartment).toHaveTextContent('Not included');
    expect(studies).toHaveTextContent('1,000 worlds cut from the mix’s history; lasts in 95%');
    await user.click(fold('The apartment'));
    await user.click(screen.getByRole('checkbox', { name: 'Include an apartment I own' }));
    await user.click(fold('The apartment'));
    expect(apartment?.open).toBe(false);
    expect(apartment).toHaveTextContent('₪2,000,000, lived in, kept');
    // An apartment that was included opens with the tab.
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    const again = screen.getAllByText('The apartment', { selector: 'summary > :first-child' });
    expect(again.at(-1)?.closest('details')?.open).toBe(true);
  });

  it('puts the study a button ran before the plan, and the plan’s tables before its chart', async () => {
    const user = userEvent.setup();
    stubApi({
      '/api/planner/withdraw': () => jsonResponse(WITHDRAW_RESULT),
      '/api/planner/withdraw/study': () => jsonResponse(WITHDRAW_MANY_RESULT),
    });
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.click(screen.getByRole('button', { name: 'Run history' }));
    const history = await screen.findByRole('heading', { name: /^History:/ });
    const plan = screen.getByRole('heading', { name: /^Withdrawals:/ });
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(history, plan)).toBe(true);
    // The plan: its answer, then its tables, then the chart, and the file last.
    const bounds = screen.getByRole('table', { name: 'Tax bounds' });
    const years = screen.getByRole('table', { name: 'Withdrawals by year' });
    const chart = screen.getByRole('img', { name: /^Balance and monthly income/ });
    const file = screen.getByRole('button', { name: 'Download CSV: withdrawals' });
    expect([before(bounds, years), before(years, chart), before(chart, file)]).toEqual([
      true,
      true,
      true,
    ]);
    // The study's file comes after its charts too.
    const histogram = screen.getByRole('img', { name: /^What is left/ });
    const starts = screen.getByRole('button', { name: 'Download CSV: withdrawal starts' });
    expect(before(histogram, starts)).toBe(true);
  });

  it('keeps the results and the focus when the other option is put on screen', async () => {
    const user = userEvent.setup();
    stub();
    const store = usePlannerStore.getState();
    store.copyToOther();
    store.setSame(false);
    renderWithQuery(<PlannerPage className={undefined} />);
    await user.click(screen.getByRole('tab', { name: 'Withdraw' }));
    const panel = screen.getByRole('tabpanel', { name: 'Withdraw' });
    await user.click(within(panel).getByRole('button', { name: 'Run' }));
    await within(panel).findByRole('table', { name: 'Side by side' });
    await user.click(within(panel).getByRole('radio', { name: 'Option B' }));
    expect(within(panel).getByRole('radio', { name: 'Option B' })).toHaveFocus();
    expect(within(panel).getByRole('table', { name: 'Side by side' })).toBeVisible();
  });

  it('shows why a plan cannot run and drops the earlier results', async () => {
    const user = userEvent.setup();
    let fail = false;
    stubApi({
      '/api/planner/withdraw': () =>
        fail
          ? jsonResponse({ detail: 'SPY has no data before 2021-02-22', status: 422 }, 422)
          : jsonResponse(WITHDRAW_RESULT),
    });
    renderWithQuery(<PlannerWithdraw hidden={false} />);
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('heading', { name: /^Withdrawals:/ });
    fail = true;
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('SPY has no data before');
    expect(screen.queryByRole('heading', { name: /^Withdrawals:/ })).toBeNull();
  });
});
