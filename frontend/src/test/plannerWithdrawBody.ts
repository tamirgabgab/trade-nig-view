/** A POST /api/planner/withdraw body: a fixed 10,000 a month from 30,000, two months paid. */
const row = (month: number, date: string, net: number, balance: number) => ({
  month,
  date,
  prices: 1,
  due: month === 0 ? 0 : 10_000,
  sold: net === 0 ? 0 : net + 500,
  commission: 0,
  tax: net === 0 ? 0 : 500,
  fee: 0,
  net,
  net_real: net,
  balance,
  balance_floor: Math.max(balance - 3_000, 0),
  balance_ceiling: balance + 1_500,
  net_floor: net,
  net_ceiling: net,
  home: 0,
  home_cash: 0,
  invested: 0,
});

const summary = (cost_share: number, balance: number, depleted: number | null) => ({
  cost_share,
  taken: 27_000,
  taken_real: 26_400,
  tax: 1_500,
  fees: 120,
  commissions: 30,
  balance,
  balance_real: balance,
  liquidation: balance,
  depleted_month: depleted,
  depleted_on: depleted === null ? null : '2030-04-15',
  months_paid: depleted === null ? 3 : depleted - 1,
  lowest_net_real: depleted === null ? 9_800 : 7_000,
  home_worth: 0,
  net_worth: balance,
  net_worth_real: balance,
  home_cash: 0,
  invested: 0,
  home_sold_month: null as number | null,
  home_sold_on: null as string | null,
  home_sale: null as 'planned' | 'empty' | 'forced' | null,
});

export const WITHDRAW_RESULT = {
  start: '2030-01-15',
  end: '2030-04-15',
  months: 3,
  summary: summary(0.5, 0, 3),
  floor: summary(0, 0, 3),
  ceiling: summary(1, 1_500, null),
  rows: [
    row(0, '2030-01-15', 0, 30_000),
    row(1, '2030-02-15', 10_000, 19_500),
    row(2, '2030-03-15', 10_000, 9_000),
    row(3, '2030-04-15', 7_000, 0),
  ],
  warnings: ['After the last published CPI it is held flat'],
};

/**
 * The same plan with an apartment worth 1,900,000 net that pays 2,000 a month: the floor's account
 * empties in month 2 and the apartment is sold then; the others keep it.
 */
const withHome = (rows: typeof WITHDRAW_RESULT.rows) =>
  rows.map((r) => ({ ...r, home: 1_900_000, home_cash: r.month === 0 ? 0 : 2_000 }));

export const WITHDRAW_HOME_RESULT = {
  ...WITHDRAW_RESULT,
  summary: {
    ...WITHDRAW_RESULT.summary,
    home_worth: 1_900_000,
    net_worth: 1_900_000,
    net_worth_real: 1_850_000,
    home_cash: 6_000,
    liquidation: 1_900_000,
  },
  floor: {
    ...WITHDRAW_RESULT.floor,
    home_sold_month: 2,
    home_sold_on: '2030-03-15',
    home_sale: 'forced' as const,
    invested: 1_900_000,
  },
  ceiling: { ...WITHDRAW_RESULT.ceiling, home_worth: 1_900_000 },
  rows: withHome(WITHDRAW_RESULT.rows),
};

/** The apartment sold on a date: month 2, for 1,900,000 put into the account. */
export const WITHDRAW_SOLD_RESULT = {
  ...WITHDRAW_HOME_RESULT,
  summary: {
    ...WITHDRAW_HOME_RESULT.summary,
    home_worth: 0,
    net_worth: 0,
    home_sold_month: 2,
    home_sold_on: '2030-03-15',
    home_sale: 'planned' as const,
    invested: 1_900_000,
  },
};
