import {
  DEFAULT_FORM,
  formsOf,
  linked,
  sanitizePersisted,
  toRequest,
  usePlannerStore,
  type PlannerForm,
} from './plannerStore.ts';

describe('toRequest', () => {
  it('maps the form to the API body, in the API’s units', () => {
    const form: PlannerForm = {
      ...DEFAULT_FORM,
      assets: [
        { symbol: ' spy ', weight: 60, currency: 'USD', dividendYield: 0 },
        { symbol: '', weight: 10, currency: 'USD', dividendYield: 0 },
        { symbol: '^GSPC', weight: 40, currency: 'USD', dividendYield: 1.8 },
      ],
      deposits: [
        { date: '2020-01-02', amount: 5000, time: '17:30' },
        { date: '', amount: 100, time: '' },
        { date: '2020-06-01', amount: 2000, time: '' },
      ],
      fees: { deposit: 0.1, buy: 0.2, sell: 0.3, management: 0.4, monthly: 15 },
      fill: { mode: 'estimated', granularity: 'fine', random: true },
    };
    const request = toRequest(form);
    expect(request.assets).toEqual([
      { symbol: 'SPY', weight: 60, currency: 'USD', dividend_yield_pct: 0 },
      { symbol: '^GSPC', weight: 40, currency: 'USD', dividend_yield_pct: 1.8 },
    ]);
    expect(request.deposits).toEqual([
      { date: '2020-01-02', amount: 5000, time: '17:30' },
      { date: '2020-06-01', amount: 2000, time: null },
    ]);
    expect(request.fees).toEqual({
      deposit_pct: 0.1,
      buy_pct: 0.2,
      sell_pct: 0.3,
      management_pct: 0.4,
      monthly_fee: 15,
    });
    expect(request.fill).toEqual({ mode: 'estimated', granularity: 'fine', seed: 1 });
    expect(request.inflation.seed).toBeNull();
    expect(request.timezone).toBe('Asia/Jerusalem');
    expect(request.recurring?.[0]).toEqual({
      start: '2015-02-01',
      amount: 1500,
      every_months: 1,
      count: 119,
      indexed: false,
    });
  });
});

describe('sanitizePersisted', () => {
  it('keeps a saved form and drops anything else', () => {
    const saved = { form: { ...DEFAULT_FORM, end: '2030-01-01' } };
    expect(sanitizePersisted(saved).form.end).toBe('2030-01-01');
    expect(sanitizePersisted(null).form).toBe(DEFAULT_FORM);
    expect(sanitizePersisted({ form: { assets: 'SPY' } }).form).toBe(DEFAULT_FORM);
    // A form saved before a section existed.
    const older: Record<string, unknown> = { ...DEFAULT_FORM };
    delete older['fees'];
    expect(sanitizePersisted({ form: older }).form).toBe(DEFAULT_FORM);
  });
});

describe('two options', () => {
  const B: PlannerForm = { ...DEFAULT_FORM, end: '2031-01-02', useFx: false };

  beforeEach(() => {
    usePlannerStore.setState({ ...sanitizePersisted(null) });
  });

  it('edits the active option and keeps the other as it is', () => {
    const { update, swap } = usePlannerStore.getState();
    update({ end: '2030-01-01' });
    swap('b');
    expect(usePlannerStore.getState().slot).toBe('b');
    expect(usePlannerStore.getState().form.end).toBe(DEFAULT_FORM.end);
    update({ useFx: false });
    const { a, b } = formsOf(usePlannerStore.getState());
    expect([a.end, a.useFx, b.end, b.useFx]).toEqual(['2030-01-01', true, DEFAULT_FORM.end, false]);
    swap('b'); // already there: nothing moves
    expect(formsOf(usePlannerStore.getState()).a.end).toBe('2030-01-01');
    swap('a');
    expect(usePlannerStore.getState().form.end).toBe('2030-01-01');
  });

  it('keeps one inflation for both options', () => {
    const inflation = { ...DEFAULT_FORM.inflation, mean: 4 };
    usePlannerStore.getState().update({ inflation });
    const { a, b } = formsOf(usePlannerStore.getState());
    expect([a.inflation.mean, b.inflation.mean]).toEqual([4, 4]);
  });

  it('copies the active option over the other, and resets only the active one', () => {
    usePlannerStore.setState({ form: B });
    usePlannerStore.getState().copyToOther();
    expect(formsOf(usePlannerStore.getState()).b).toEqual(B);
    usePlannerStore.getState().reset();
    const { a, b } = formsOf(usePlannerStore.getState());
    expect([a, b]).toEqual([DEFAULT_FORM, B]);
  });

  it('says what each option contains, and holds the comparison’s settings', () => {
    const { setContents, setCompare } = usePlannerStore.getState();
    expect(usePlannerStore.getState().contents).toEqual({
      a: { home: true, deposits: false },
      b: { home: false, deposits: false },
    });
    setContents('b', { deposits: true });
    setCompare({ discount: 15 });
    const state = usePlannerStore.getState();
    expect(state.contents.b).toEqual({ home: false, deposits: true });
    expect([state.compare.discount, state.compare.followRates, state.compare.step]).toEqual([
      15,
      true,
      1,
    ]);
    expect(state.compare.simulation.runs).toBe(1000);
  });

  it('starts with option B the same as option A, a comparison reading A twice', () => {
    const state = usePlannerStore.getState();
    expect(state.same).toBe(true);
    usePlannerStore.setState({ other: B });
    const forms = formsOf(usePlannerStore.getState());
    expect(linked(true, forms)).toEqual({ a: DEFAULT_FORM, b: DEFAULT_FORM });
    expect(linked(false, forms)).toEqual({ a: DEFAULT_FORM, b: B });
    state.setSame(false);
    expect(usePlannerStore.getState().same).toBe(false);
  });

  it('reads a form saved before there were two options as option A, with B the same', () => {
    const old = sanitizePersisted({ form: B });
    expect([old.same, old.slot, old.form, old.other]).toEqual([true, 'a', B, B]);
    expect(old.contents.a).toEqual({ home: true, deposits: false });
    expect(old.compare.discount).toBe(10);
  });

  it('keeps every good part of a saved state and replaces only what is damaged', () => {
    const kept = sanitizePersisted({
      same: false,
      slot: 'b',
      form: B,
      other: 'broken',
      contents: { a: { home: false, deposits: true }, b: 7 },
      compare: { discount: 25, step: 'x' },
    });
    expect([kept.slot, kept.form, kept.other]).toEqual(['b', B, DEFAULT_FORM]);
    expect(kept.contents).toEqual({
      a: { home: false, deposits: true },
      b: { home: false, deposits: false },
    });
    expect([kept.compare.discount, kept.compare.step]).toEqual([25, 1]);
    expect(sanitizePersisted({ slot: 'c', form: B }).slot).toBe('a');
    // While the two are the same, option A is the one on screen: B's form goes aside.
    const same = sanitizePersisted({ slot: 'b', form: B, other: DEFAULT_FORM });
    expect([same.same, same.slot, same.form, same.other]).toEqual([true, 'a', DEFAULT_FORM, B]);
  });
});
