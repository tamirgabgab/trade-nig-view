import { DEFAULT_FORM, sanitizePersisted, toRequest, type PlannerForm } from './plannerStore.ts';

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
