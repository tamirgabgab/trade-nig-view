import { DEFAULT_HOME } from '../store/plannerHomeStore.ts';
import { DEFAULT_FORM, type OptionContents, type Slot } from '../store/plannerStore.ts';
import { optionNames, toScenario, type ComparedOptions } from './compare.ts';

const TAXES = {
  purchase: [{ up_to: null, rate_pct: 8 }],
  betterment: { rate_pct: 25, single_home: false, ceiling: 5_008_000, linear: true, brackets: [] },
};
const QQQ = { ...DEFAULT_FORM, assets: [{ ...DEFAULT_FORM.assets[0]!, symbol: 'QQQ' }] };
const contents = (
  a: Partial<OptionContents>,
  b: Partial<OptionContents>,
): Record<Slot, OptionContents> => ({
  a: { home: true, deposits: false, ...a },
  b: { home: false, deposits: false, ...b },
});

function options(changes: Partial<ComparedOptions> = {}): ComparedOptions {
  return {
    market: { a: DEFAULT_FORM, b: QQQ },
    home: { a: DEFAULT_HOME, b: { ...DEFAULT_HOME, price: 3_000_000 } },
    taxes: { a: TAXES, b: TAXES },
    contents: contents({}, {}),
    discount: 10,
    ...changes,
  };
}

describe('toScenario', () => {
  it('sets option A’s apartment against the same money in option B’s mix', () => {
    const request = toScenario(options());
    expect(request.end).toBe(DEFAULT_HOME.end);
    expect(request.inflation).toMatchObject({ mode: 'assumed', mean_pct: 2.5 });
    expect(request.forced_discount_pct).toBe(10);
    expect(request.x.home).toMatchObject({
      start: DEFAULT_HOME.start,
      price: 2_000_000,
      purchase: { tax_brackets: TAXES.purchase },
    });
    // The apartment carries no end or inflation of its own: the scenario has one of each.
    expect(request.x.home).not.toHaveProperty('end');
    expect(request.x.home).not.toHaveProperty('inflation');
    // Each option's mix is its own Market tab, so a surplus is invested there; no deposits.
    expect(request.x.market).toEqual({
      assets: [{ symbol: 'SPY', weight: 100, currency: 'USD', dividend_yield_pct: 0 }],
      use_fx: true,
      fees: { deposit_pct: 0, buy_pct: 0, sell_pct: 0, management_pct: 0, monthly_fee: 0 },
      taxes: { gains_pct: 25, dividend_pct: 25, base: 'nominal' },
      fill: { mode: 'close', granularity: 'medium', seed: null },
    });
    expect(request.y.home ?? null).toBeNull();
    expect(request.y.market).toMatchObject({ assets: [{ symbol: 'QQQ' }] });
    expect(request.y.market).not.toHaveProperty('deposits');
  });

  it('adds an option’s own deposits, and its apartment, only when it contains them', () => {
    const request = toScenario(
      options({ contents: contents({ deposits: true }, { home: true, deposits: true }) }),
    );
    expect(request.x.market).toMatchObject({
      deposits: [{ date: '2015-01-02', amount: 10_000 }],
      recurring: [{ start: '2015-02-01', amount: 1500, count: 119 }],
    });
    expect(request.y.home).toMatchObject({ price: 3_000_000 });
    expect(request.y.market).toMatchObject({ assets: [{ symbol: 'QQQ' }], deposits: [{}] });
  });

  it('ends on the sale of the first apartment, or on the market’s end without one', () => {
    const late = { ...DEFAULT_HOME, end: '2030-06-15' };
    const only = options({
      home: { a: DEFAULT_HOME, b: late },
      contents: contents({ home: false, deposits: true }, { home: true }),
    });
    expect(toScenario(only).end).toBe('2030-06-15');
    const none = options({ contents: contents({ home: false, deposits: true }, {}) });
    expect(toScenario(none).end).toBe(DEFAULT_FORM.end);
  });
});

describe('optionNames', () => {
  it('names each option for what it contains, with a letter only when both are alike', () => {
    expect(optionNames(contents({}, {}))).toEqual(['Apartment', 'Market']);
    expect(optionNames(contents({ deposits: true }, {}))).toEqual([
      'Apartment and account',
      'Market',
    ]);
    expect(optionNames(contents({}, { home: true }))).toEqual(['Apartment A', 'Apartment B']);
    expect(optionNames(contents({ home: false }, { deposits: true }))).toEqual([
      'Market A',
      'Market B',
    ]);
    expect(
      optionNames(contents({ home: false, deposits: true }, { home: true, deposits: true })),
    ).toEqual(['Market', 'Apartment and account']);
  });
});
