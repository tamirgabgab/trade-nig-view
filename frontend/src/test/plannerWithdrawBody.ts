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
