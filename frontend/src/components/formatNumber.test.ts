import {
  direction,
  formatPercent,
  formatPrice,
  formatSigned,
  formatVolume,
} from './formatNumber.ts';

describe('number formatting', () => {
  it('formats prices with fixed decimals and separators', () => {
    expect(formatPrice(6910.39, 2)).toBe('6,910.39');
    expect(formatPrice(1.308094, 5)).toBe('1.30809');
    expect(formatPrice(342.5, 2)).toBe('342.50');
  });

  it('formats percents with two decimals', () => {
    expect(formatPercent(-1.9)).toBe('-1.90%');
    expect(formatPercent(26.2)).toBe('26.20%');
  });

  it('classifies direction', () => {
    expect(direction(1)).toBe('up');
    expect(direction(-0.01)).toBe('down');
    expect(direction(0)).toBe('flat');
    expect(direction(null)).toBe('flat');
  });

  it('formats volume compactly', () => {
    expect(formatVolume(950)).toBe('950');
    expect(formatVolume(62_350_000)).toBe('62.35M');
    expect(formatVolume(1_234_567_890)).toBe('1.23B');
    expect(formatVolume(45_000)).toBe('45K');
  });

  it('adds a plus sign to positive values only', () => {
    expect(formatSigned(0.38, 2)).toBe('+0.38');
    expect(formatSigned(-6.65, 2)).toBe('-6.65');
    expect(formatSigned(0, 2)).toBe('0.00');
  });
});
