import { percent, price, shekels, signedShekels } from './plannerFormat.ts';

describe('planner formats', () => {
  it('signs a change in shekels, and leaves a change of nothing unsigned', () => {
    expect(signedShekels(300_000)).toBe('+₪300,000');
    expect(signedShekels(-340_000.4)).toBe('−₪340,000');
    expect(signedShekels(0.3)).toBe('₪0');
    expect(signedShekels(-0.3)).toBe('₪0');
  });

  it('shows shekels rounded, with a real minus sign', () => {
    expect(shekels(1234567.4)).toBe('₪1,234,567');
    expect(shekels(-62.5)).toBe('−₪63');
    expect(shekels(-0.2)).toBe('₪0');
  });

  it('shows fractions as percentages and a dash for no value', () => {
    expect(percent(0.07123)).toBe('7.12%');
    expect(percent(-0.5)).toBe('-50.00%');
    expect(percent(null)).toBe('—');
  });

  it('shows prices with 2 to 4 decimals', () => {
    expect(price(412.3)).toBe('412.30');
    expect(price(3.6542)).toBe('3.6542');
  });
});
