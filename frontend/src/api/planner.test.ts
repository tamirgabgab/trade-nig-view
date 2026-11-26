import { parseDepths, parseMarket } from './planner.ts';

const SUMMARY = {
  deposited: 1000,
  value: 1200,
  proceeds: 1200,
  gross_gain: 200,
  taxable_gain: 200,
  tax: 50,
  net_value: 1150,
  net_gain: 150,
  deposit_fees: 0,
  commissions: 0,
  account_fees: 0,
  dividend_tax: 0,
  xirr_gross: 0.1,
  xirr_net: null,
  net_value_real: 1100,
  xirr_net_real: null,
  inflation_yearly: 0.025,
};
const BODY = { summary: SUMMARY, deposits: [], assets: [], path: [], warnings: [] };

describe('parseMarket', () => {
  it('accepts a result and keeps its numbers', () => {
    expect(parseMarket(BODY).summary.net_value).toBe(1150);
  });

  it('rejects a missing list or a number that is not finite', () => {
    expect(() => parseMarket(null)).toThrow('Unexpected');
    expect(() => parseMarket({ ...BODY, deposits: undefined })).toThrow('Unexpected');
    expect(() => parseMarket({ ...BODY, summary: { ...SUMMARY, taxable_gain: null } })).toThrow(
      'taxable_gain',
    );
  });
});

describe('parseDepths', () => {
  it('accepts a list of rows only', () => {
    expect(parseDepths([{ symbol: 'SPY' }])).toHaveLength(1);
    expect(() => parseDepths({})).toThrow('Unexpected');
    expect(() => parseDepths([1])).toThrow('Unexpected');
  });
});
