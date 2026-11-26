import type { TaxPresets } from '../api/planner.ts';
import { TAX_PRESETS } from '../test/plannerHomeBody.ts';
import {
  DEFAULT_HOME,
  homesOf,
  newTrack,
  resolveTaxes,
  sanitizeHome,
  savedKey,
  toHomeRequest,
  usePlannerHomeStore,
  type HomeForm,
} from './plannerHomeStore.ts';
import { DEFAULT_FORM } from './plannerStore.ts';

const PRESETS = TAX_PRESETS as TaxPresets;
const NO_SAVED = { purchase: {}, betterment: {} };
const [SINGLE, ADDITIONAL] = PRESETS.purchase.map((p) => p.brackets);
const BETTERMENT = { rate_pct: 25, single_home: false, ceiling: 5_008_000, linear: true };

beforeEach(() => {
  usePlannerHomeStore.setState({ ...sanitizeHome(null) });
});

describe('resolveTaxes', () => {
  it('reads a built-in table, an edited one, a saved one and "no tax"', () => {
    expect(resolveTaxes(DEFAULT_HOME, NO_SAVED, PRESETS)).toEqual({
      purchase: SINGLE,
      betterment: PRESETS.betterment[0]?.spec,
    });
    const edited: HomeForm = {
      ...DEFAULT_HOME,
      purchaseTax: { preset: 'single_home_2026', edited: [{ up_to: null, rate_pct: 1 }] },
    };
    expect(resolveTaxes(edited, NO_SAVED, PRESETS)?.purchase).toEqual([
      { up_to: null, rate_pct: 1 },
    ]);
    const mine: HomeForm = {
      ...DEFAULT_HOME,
      purchaseTax: { preset: savedKey('Mine'), edited: null },
    };
    const saved = { ...NO_SAVED, purchase: { Mine: ADDITIONAL ?? [] } };
    expect(resolveTaxes(mine, saved, PRESETS)?.purchase).toBe(ADDITIONAL);
    const none: HomeForm = { ...DEFAULT_HOME, purchaseTax: { preset: 'none', edited: null } };
    expect(resolveTaxes(none, NO_SAVED, PRESETS)?.purchase).toEqual([]);
  });

  it('is null until the built-in tables arrive; a lost table reads as the default one', () => {
    expect(resolveTaxes(DEFAULT_HOME, NO_SAVED, undefined)).toBeNull();
    const gone: HomeForm = {
      ...DEFAULT_HOME,
      purchaseTax: { preset: 'a_table_of_an_older_version', edited: null },
      betterment: { preset: savedKey('Deleted'), edited: null },
    };
    expect(resolveTaxes(gone, NO_SAVED, undefined)).toBeNull();
    // Never "no tax", and never a form stuck without a table to pick.
    expect(resolveTaxes(gone, NO_SAVED, PRESETS)).toEqual({
      purchase: SINGLE,
      betterment: PRESETS.betterment[0]?.spec,
    });
  });
});

describe('toHomeRequest', () => {
  it('maps the form to the API body, in the API’s units', () => {
    const home: HomeForm = {
      ...DEFAULT_HOME,
      tracks: [
        { ...newTrack('prime', 1), years: 20 },
        // A typed fraction of a whole-number field is rounded, not refused by the API.
        {
          ...newTrack('variable_linked', 2),
          repayment: 'grace',
          graceMonths: 12.4,
          resetYears: 2.5,
        },
        // Grace months typed before the repayment was changed are not sent.
        { ...newTrack('fixed_linked', 1), graceMonths: 24, graceFull: true },
      ],
      value: { ...DEFAULT_HOME.value, random: true },
    };
    const taxes = { purchase: SINGLE ?? [], betterment: BETTERMENT };
    const request = toHomeRequest(home, DEFAULT_FORM.inflation, taxes);
    expect(request.tracks).toEqual([
      {
        share: 1,
        months: 240,
        kind: 'prime',
        rate_pct: -0.5,
        linked: false,
        reset_years: 5,
        repayment: 'spitzer',
        grace_months: 0,
        grace_full: false,
      },
      expect.objectContaining({
        kind: 'variable',
        linked: true,
        grace_months: 12,
        reset_years: 3,
      }),
      expect.objectContaining({ kind: 'fixed', linked: true, grace_months: 0 }),
    ]);
    expect(request.purchase).toEqual({
      tax_brackets: SINGLE,
      lawyer_pct: 0.6,
      broker_pct: 2.4,
      renovation: 0,
    });
    expect(request.sale).toEqual({
      costs_pct: 2.4,
      early_repayment_pct: 0,
      betterment: taxes.betterment,
    });
    // Not the inflation's seed: the two draws must not move together.
    expect(request.value.seed).toBe(2);
    expect(request.inflation).toEqual({
      mode: 'assumed',
      mean_pct: 2.5,
      sd_pct: 0,
      persistence: 0,
      seed: null,
    });
    expect(request.rent.mode).toBe('live');
  });
});

describe('saved tax tables', () => {
  it('saves the table under a name, selects it, and falls back when it is deleted', () => {
    const { savePurchaseTax, deleteSaved, update } = usePlannerHomeStore.getState();
    update({ purchaseTax: { preset: 'additional_home_2026', edited: ADDITIONAL ?? [] } });
    savePurchaseTax('Mine', [{ up_to: null, rate_pct: 5 }]);
    let state = usePlannerHomeStore.getState();
    expect(state.home.purchaseTax).toEqual({ preset: 'saved:Mine', edited: null });
    expect(resolveTaxes(state.home, state.saved, PRESETS)?.purchase).toEqual([
      { up_to: null, rate_pct: 5 },
    ]);
    deleteSaved('purchase', 'Mine');
    state = usePlannerHomeStore.getState();
    expect(state.saved.purchase).toEqual({});
    expect(state.home.purchaseTax).toEqual(DEFAULT_HOME.purchaseTax);
  });
});

describe('sanitizeHome', () => {
  it('keeps a saved state and drops anything else', () => {
    const saved = { purchase: { Mine: [] }, betterment: {} };
    const kept = sanitizeHome({ home: { ...DEFAULT_HOME, price: 3_000_000 }, saved });
    expect(kept.home.price).toBe(3_000_000);
    expect(kept.saved).toBe(saved);
    expect(sanitizeHome(null)).toEqual({ home: DEFAULT_HOME, saved: NO_SAVED });
    // A form saved before a section existed keeps the saved tables.
    const older: Record<string, unknown> = { ...DEFAULT_HOME };
    delete older['rent'];
    expect(sanitizeHome({ home: older, saved })).toEqual({ home: DEFAULT_HOME, saved });
  });
});

describe('two apartments', () => {
  const B: HomeForm = { ...DEFAULT_HOME, price: 3_000_000, equity: 900_000 };

  it('edits the active one and keeps the other, with the saved tax tables shared', () => {
    const { update, swap, savePurchaseTax } = usePlannerHomeStore.getState();
    update({ price: 1_500_000 });
    swap('b');
    expect(usePlannerHomeStore.getState().home.price).toBe(DEFAULT_HOME.price);
    update({ price: 3_000_000 });
    savePurchaseTax('Mine', SINGLE ?? []);
    const state = usePlannerHomeStore.getState();
    const { a, b } = homesOf(state);
    expect([a.price, b.price]).toEqual([1_500_000, 3_000_000]);
    // The table is saved once; only the option that saved it names it.
    expect([a.purchaseTax.preset, b.purchaseTax.preset]).toEqual([
      DEFAULT_HOME.purchaseTax.preset,
      savedKey('Mine'),
    ]);
    expect(Object.keys(state.saved.purchase)).toEqual(['Mine']);
  });

  it('forgets a deleted table in both options', () => {
    const { savePurchaseTax, swap, update, deleteSaved } = usePlannerHomeStore.getState();
    savePurchaseTax('Mine', SINGLE ?? []);
    swap('b');
    update({ purchaseTax: { preset: savedKey('Mine'), edited: null } });
    deleteSaved('purchase', 'Mine');
    const { a, b } = homesOf(usePlannerHomeStore.getState());
    expect([a.purchaseTax, b.purchaseTax]).toEqual([
      DEFAULT_HOME.purchaseTax,
      DEFAULT_HOME.purchaseTax,
    ]);
  });

  it('copies the active apartment over the other', () => {
    usePlannerHomeStore.setState({ home: B });
    usePlannerHomeStore.getState().copyToOther();
    expect(homesOf(usePlannerHomeStore.getState())).toEqual({ a: B, b: B });
  });

  it('reads a state saved before there were two as option A, with its tables', () => {
    const saved = { purchase: { Mine: SINGLE ?? [] }, betterment: {} };
    const old = sanitizeHome({ home: B, saved });
    expect([old.slot, old.home, old.other, old.saved]).toEqual(['a', B, B, saved]);
  });

  it('gives an older form the fields it lacks', () => {
    const { ownSd: _ownSd, ...value } = DEFAULT_HOME.value;
    const old = sanitizeHome({ home: { ...B, value }, saved: NO_SAVED });
    expect(old.home.value.ownSd).toBe(0);
    expect(old.home.price).toBe(3_000_000);
  });

  it('sends the apartment’s own volatility', () => {
    const home = { ...DEFAULT_HOME, value: { ...DEFAULT_HOME.value, ownSd: 8 } };
    const taxes = { purchase: SINGLE ?? [], betterment: BETTERMENT };
    expect(toHomeRequest(home, DEFAULT_FORM.inflation, taxes).value).toMatchObject({
      own_sd_pct: 8,
    });
  });
});
