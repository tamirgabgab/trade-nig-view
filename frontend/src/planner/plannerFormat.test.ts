import { percent, price, shekels } from './plannerFormat.ts';

describe('planner formats', () => {
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
