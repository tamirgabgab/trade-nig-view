import { DEFAULT_HOME } from '../store/plannerHomeStore.ts';
import { DEFAULT_FORM } from '../store/plannerStore.ts';
import { toScenario } from './compare.ts';

const TAXES = {
  purchase: [{ up_to: null, rate_pct: 8 }],
  betterment: { rate_pct: 25, single_home: false, ceiling: 5_008_000, linear: true, brackets: [] },
};

describe('toScenario', () => {
  it('sets the apartment against an empty account in the market tab’s mix', () => {
    const request = toScenario(DEFAULT_FORM, DEFAULT_HOME, TAXES, false);
    expect(request.end).toBe(DEFAULT_HOME.end);
    expect(request.inflation).toMatchObject({ mode: 'assumed', mean_pct: 2.5 });
    expect(request.x).toMatchObject({
      home: {
        start: DEFAULT_HOME.start,
        price: 2_000_000,
        purchase: { tax_brackets: TAXES.purchase },
      },
      market: null,
    });
    // The apartment carries no end or inflation of its own: the scenario has one of each.
    expect(request.x.home).not.toHaveProperty('end');
    expect(request.x.home).not.toHaveProperty('inflation');
    expect(request.y).toEqual({
      market: {
        assets: [{ symbol: 'SPY', weight: 100, currency: 'USD', dividend_yield_pct: 0 }],
        use_fx: true,
        fees: { deposit_pct: 0, buy_pct: 0, sell_pct: 0, management_pct: 0, monthly_fee: 0 },
        taxes: { gains_pct: 25, dividend_pct: 25, base: 'nominal' },
        fill: { mode: 'close', granularity: 'medium', seed: null },
      },
    });
  });

  it('gives the apartment’s side the market tab’s deposits when it has its own account', () => {
    const request = toScenario(DEFAULT_FORM, DEFAULT_HOME, TAXES, true);
    expect(request.x.market).toMatchObject({
      assets: [{ symbol: 'SPY' }],
      deposits: [{ date: '2015-01-02', amount: 10_000 }],
      recurring: [{ start: '2015-02-01', amount: 1500, count: 119 }],
    });
    expect(request.y.market).not.toHaveProperty('deposits');
  });
});
