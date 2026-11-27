import { DEFAULT_FORM, DEFAULT_WITHDRAW } from '../store/plannerStore.ts';
import {
  byYear,
  leftValues,
  mixLabel,
  toWithdraw,
  toWithdrawSimulate,
  toWithdrawStudy,
} from './withdraw.ts';
import {
  WITHDRAW_HOME_RESULT,
  WITHDRAW_MANY_RESULT,
  WITHDRAW_RESULT,
} from '../test/plannerWithdrawBody.ts';
import type { WithdrawResult } from '../api/planner.ts';

const ASSET = { symbol: 'SPY', weight: 100, currency: 'USD' as const, dividendYield: 0 };

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
    });
    // A Market tab with no ticker is still a request: an assumed return does not read the mix.
    const empty = { ...DEFAULT_FORM, assets: [{ ...ASSET, symbol: '' }] };
    const assumed = toWithdraw({ ...DEFAULT_WITHDRAW, returns: 'assumed' }, empty);
    expect(assumed.market?.assets).toEqual([]);
    // No apartment unless it is included.
    expect(request.home ?? null).toBeNull();
  });

  it('sends an included apartment in the API’s units', () => {
    const home = {
      ...DEFAULT_WITHDRAW.home,
      include: true,
      use: 'rent_out' as const,
      loan: 400_000,
      loanYears: 12.5,
      role: 'on_date' as const,
      sellAfter: 7,
    };
    const request = toWithdraw({ ...DEFAULT_WITHDRAW, home }, DEFAULT_FORM);
    expect(request.home).toEqual({
      value: 2_000_000,
      growth: 'assumed',
      growth_pct: 3,
      use: 'rent_out',
      rent: 5_500,
      vacancy_pct: 4,
      rent_tax_pct: 10,
      maintenance_pct: 0.5,
      insurance: 1_500,
      loan: 400_000,
      loan_rate_pct: 4,
      loan_months: 150,
      loan_linked: false,
      role: 'on_date',
      sell_after_months: 84,
      selling_pct: 2.4,
      early_repayment_pct: 0,
      betterment: 'single_home',
      cost: null,
      bought: null,
    });
    const known = { ...home, cost: 1_200_000, bought: '2012-05-01' };
    expect(toWithdraw({ ...DEFAULT_WITHDRAW, home: known }, DEFAULT_FORM).home).toMatchObject({
      cost: 1_200_000,
      bought: '2012-05-01',
    });
    // One of the two is sent as typed, for the API to say the other is missing.
    const half = { ...home, bought: '2005-06-01' };
    expect(toWithdraw({ ...DEFAULT_WITHDRAW, home: half }, DEFAULT_FORM).home).toMatchObject({
      cost: null,
      bought: '2005-06-01',
    });
  });
});

describe('toWithdraw from the Market tab’s plan', () => {
  it('sends the plan itself, and starts the withdrawals on its last day', () => {
    const request = toWithdraw(
      { ...DEFAULT_WITHDRAW, source: 'plan', returns: 'assumed' },
      DEFAULT_FORM,
    );
    expect(request).toMatchObject({
      start: DEFAULT_FORM.end,
      capital: 0,
      returns: { mode: 'mix' },
    });
    expect(request.plan).toMatchObject({
      end: DEFAULT_FORM.end,
      deposits: [{ date: '2015-01-02', amount: 10_000 }],
      recurring: [{ start: '2015-02-01', amount: 1500 }],
      assets: [{ symbol: 'SPY' }],
    });
    // A typed capital has no plan behind it.
    expect(toWithdraw(DEFAULT_WITHDRAW, DEFAULT_FORM).plan ?? null).toBeNull();
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
  it('adds the apartment’s cash and keeps its worth at the end of each year', () => {
    const [year] = byYear(WITHDRAW_HOME_RESULT.rows);
    expect(year).toMatchObject({ homeCash: 6_000, home: 1_900_000 });
  });

  it('adds the months up by year of the plan, the last one as long as it is', () => {
    const { rows }: WithdrawResult = WITHDRAW_RESULT;
    const [, first] = rows;
    if (first === undefined) throw new Error('the fixture has months');
    expect(byYear(rows)).toEqual([
      {
        year: 1,
        months: 3,
        net: 27_000,
        netReal: 27_000,
        tax: 1_500,
        costs: 0,
        balance: 0,
        homeCash: 0,
        home: 0,
      },
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
    expect(byYear(long)).toEqual(
      [
        { year: 1, months: 12, net: 1_200, netReal: 600, tax: 12, costs: 60, balance: 988 },
        { year: 2, months: 2, net: 200, netReal: 100, tax: 2, costs: 10, balance: 986 },
      ].map((year) => ({ ...year, homeCash: 0, home: 0 })),
    );
  });
});

describe('the requests of many realizations', () => {
  const many = DEFAULT_WITHDRAW.many;

  it('a study is the plan with the share an amount must last in', () => {
    const request = toWithdrawStudy(
      { ...DEFAULT_WITHDRAW, many: { ...many, sustain: 90 } },
      DEFAULT_FORM,
    );
    expect(request).toMatchObject({ months: 120, capital: 1_000_000, sustain_pct: 90 });
    expect(request).not.toHaveProperty('runs');
  });

  it('a simulation says how its worlds are made', () => {
    const boot = toWithdrawSimulate(DEFAULT_WITHDRAW, DEFAULT_FORM);
    expect(boot).toMatchObject({
      method: 'bootstrap',
      runs: 1000,
      seed: 1,
      block_months: 12,
      sustain_pct: 95,
      market_mean_pct: null,
      market_sd_pct: null,
    });
    // A modelled market: estimated from the mix, or typed.
    const model = { ...many, method: 'monte_carlo' as const };
    const estimated = toWithdrawSimulate({ ...DEFAULT_WITHDRAW, many: model }, DEFAULT_FORM);
    expect(estimated).toMatchObject({ method: 'monte_carlo', market_mean_pct: null });
    const typed = { ...model, estimate: false, mean: 6, sd: 18 };
    expect(toWithdrawSimulate({ ...DEFAULT_WITHDRAW, many: typed }, DEFAULT_FORM)).toMatchObject({
      market_mean_pct: 6,
      market_sd_pct: 18,
    });
    // Whole numbers reach the API whatever was typed.
    const typedHalf = { ...many, runs: 250.4, block: 12.5 };
    expect(
      toWithdrawSimulate({ ...DEFAULT_WITHDRAW, many: typedHalf }, DEFAULT_FORM),
    ).toMatchObject({ runs: 250, block_months: 13 });
    // On an assumed return the mean is that return: only the volatility is sent.
    const assumed = { ...DEFAULT_WITHDRAW, returns: 'assumed' as const, many: model };
    expect(toWithdrawSimulate(assumed, DEFAULT_FORM)).toMatchObject({
      market_mean_pct: null,
      market_sd_pct: 15,
    });
    // From the Market tab's plan the account grows by the mix: a hidden "assumed" is not read.
    const fromPlan = { ...assumed, source: 'plan' as const, many: { ...model, estimate: false } };
    expect(toWithdrawSimulate(fromPlan, DEFAULT_FORM)).toMatchObject({
      market_mean_pct: 5,
      market_sd_pct: 15,
    });
  });
});

describe('leftValues', () => {
  const { realizations, start_worth } = WITHDRAW_MANY_RESULT;

  it('gives what is left of the realizations that lasted, in the unit asked for', () => {
    // The window that ran out is counted apart.
    expect(leftValues(realizations, start_worth, { percent: false, real: false })).toEqual({
      values: [600_000, 1_500_000],
      ranOut: 1,
    });
    expect(leftValues(realizations, start_worth, { percent: true, real: false }).values).toEqual([
      0.6, 1.5,
    ]);
    // With an apartment the one that ran out still holds its worth: it stays among the values.
    const all = leftValues(realizations, start_worth, { percent: false, real: false, all: true });
    expect(all).toEqual({ values: [0, 600_000, 1_500_000], ranOut: 1 });
    const real = leftValues(realizations, start_worth, { percent: true, real: true }).values;
    expect(real[0]).toBeCloseTo(0.48);
    expect(real[1]).toBeCloseTo(1.2);
  });
});
