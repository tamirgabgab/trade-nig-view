import { FALLBACK_THEME, readChartTheme, withAlpha } from './theme.ts';

describe('withAlpha', () => {
  it('converts 6- and 3-digit hex colors', () => {
    expect(withAlpha('#089981', 0.5)).toBe('rgba(8, 153, 129, 0.5)');
    expect(withAlpha('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('returns other color syntaxes unchanged', () => {
    expect(withAlpha('rgb(1 2 3)', 0.5)).toBe('rgb(1 2 3)');
  });
});

describe('readChartTheme', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--color-up');
  });

  it('reads tokens from CSS custom properties', () => {
    document.documentElement.style.setProperty('--color-up', '#00ff00');
    expect(readChartTheme().up).toBe('#00ff00');
  });

  it('falls back when a token is missing', () => {
    expect(readChartTheme().down).toBe(FALLBACK_THEME.down);
  });
});
