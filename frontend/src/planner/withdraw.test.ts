import { DEFAULT_FORM, DEFAULT_WITHDRAW } from '../store/plannerStore.ts';
import { byYear, mixLabel, toWithdraw } from './withdraw.ts';
import { WITHDRAW_RESULT } from '../test/plannerWithdrawBody.ts';
import type { WithdrawResult } from '../api/planner.ts';

describe('toWithdraw', () => {
  it('sends the settings in the API’s units, with the Market tab’s mix, fees and taxes', () => {
    const form = { ...DEFAULT_FORM, fees: { ...DEFAULT_FORM.fees, sell: 0.5 } };
    const request = toWithdraw({ ...DEFAULT_WITHDRAW, years: 7.5, costShare: 30 }, form);
    expect(request).toMatchObject({
      start: DEFAULT_WITHDRAW.start,
      months: 90,
      capital: DEFAULT_WITHDRAW.capital,
      cost_share_pct: 30,
      rule: { kind: 'fixed', amount: DEFAULT_WITHDRAW.amount, indexed: true, percent: 4 },
      returns: { mode: 'mix', yearly_pct: 5 },
      inflation: { mode: 'assumed', mean_pct: 2.5 },
    });
    expect(request.market).toEqual({
      assets: [{ symbol: 'SPY', weight: 100, currency: 'USD', dividend_yield_pct: 0 }],
      use_fx: true,
      fees: { deposit_pct: 0, buy_pct: 0, sell_pct: 0.5, management_pct: 0, monthly_fee: 0 },
      taxes: { gains_pct: 25, dividend_pct: 25, base: 'nominal' },
      // Sent because the request's shape asks for it; a withdrawal sells at the close.
      fill: { mode: 'close', granularity: 'medium', seed: null },
    });
  });
});

describe('mixLabel', () => {
  it('names the tickers and their shares, as the Market tab holds them', () => {
    const assets = [
      { symbol: 'spy', weight: 60, currency: 'USD' as const, dividendYield: 0 },
      { symbol: '', weight: 10, currency: 'USD' as const, dividendYield: 0 },
      { symbol: 'QQQ', weight: 20, currency: 'USD' as const, dividendYield: 0 },
    ];
    expect(mixLabel({ ...DEFAULT_FORM, assets })).toBe('SPY 75%, QQQ 25%');
    expect(mixLabel(DEFAULT_FORM)).toBe('SPY 100%');
  });
});

describe('byYear', () => {
  it('adds the months up by year of the plan, the last one as long as it is', () => {
    const { rows }: WithdrawResult = WITHDRAW_RESULT;
    const [, first] = rows;
    if (first === undefined) throw new Error('the fixture has months');
    expect(byYear(rows)).toEqual([
      { year: 1, months: 3, net: 27_000, netReal: 27_000, tax: 1_500, costs: 0, balance: 0 },
    ]);
    const long = Array.from({ length: 15 }, (_, month) => ({
      ...first,
      month,
      net: month === 0 ? 0 : 100,
      net_real: month === 0 ? 0 : 50,
      tax: month === 0 ? 0 : 1,
      fee: month === 0 ? 0 : 2,
      commission: month === 0 ? 0 : 3,
      balance: 1_000 - month,
    }));
    expect(byYear(long)).toEqual([
      { year: 1, months: 12, net: 1_200, netReal: 600, tax: 12, costs: 60, balance: 988 },
      { year: 2, months: 2, net: 200, netReal: 100, tax: 2, costs: 10, balance: 986 },
    ]);
  });
});
