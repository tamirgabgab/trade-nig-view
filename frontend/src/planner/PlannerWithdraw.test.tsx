import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sanitizePersisted, usePlannerStore } from '../store/plannerStore.ts';
import {
  WITHDRAW_HOME_RESULT,
  WITHDRAW_RESULT,
  WITHDRAW_SOLD_RESULT,
} from '../test/plannerWithdrawBody.ts';
import { jsonResponse, renderWithQuery, stubApi } from '../test/render.tsx';
import { PlannerWithdraw } from './PlannerWithdraw.tsx';

beforeEach(() => {
  usePlannerStore.setState({ ...sanitizePersisted(null) });
});

const body = (init: RequestInit | undefined): unknown =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
const card = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement;

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
