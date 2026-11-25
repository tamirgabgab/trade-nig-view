/**
 * Chart colors read from the CSS design tokens (styles/tokens.css), so the canvas and the DOM use
 * the same palette. Fallbacks match the dark theme and apply when a token is missing (e.g. jsdom).
 */
export interface ChartTheme {
  background: string;
  text: string;
  textMuted: string;
  grid: string;
  border: string;
  crosshair: string;
  labelBackground: string;
  up: string;
  down: string;
  /** Line and area charts. */
  line: string;
  /** Forecast vs actual: the band an actual close fell in. */
  band50: string;
  band80: string;
  band95: string;
  bandOut: string;
  fontFamily: string;
}

export const FALLBACK_THEME: ChartTheme = {
  background: '#0f0f0f',
  text: '#d1d4dc',
  textMuted: '#8a8d96',
  grid: '#1c1c1c',
  border: '#2a2a2a',
  crosshair: '#6a6d78',
  labelBackground: '#2e2e2e',
  up: '#089981',
  down: '#f23645',
  line: '#2962ff',
  band50: '#22ab94',
  band80: '#f7c948',
  band95: '#ff9800',
  bandOut: '#f23645',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, sans-serif",
};

const TOKENS: Record<keyof ChartTheme, string> = {
  background: '--color-bg',
  text: '--color-text',
  textMuted: '--color-text-muted',
  grid: '--color-chart-grid',
  border: '--color-border',
  crosshair: '--color-chart-crosshair',
  labelBackground: '--color-active',
  up: '--color-up',
  down: '--color-down',
  line: '--color-accent',
  band50: '--color-band-50',
  band80: '--color-band-80',
  band95: '--color-band-95',
  bandOut: '--color-band-out',
  fontFamily: '--font-sans',
};

/** Read the theme from `element`'s computed style (default: the document root). */
export function readChartTheme(element: Element = document.documentElement): ChartTheme {
  const style = getComputedStyle(element);
  const theme = { ...FALLBACK_THEME };
  for (const key of Object.keys(TOKENS) as (keyof ChartTheme)[]) {
    const value = style.getPropertyValue(TOKENS[key]).trim();
    if (value !== '') theme[key] = value;
  }
  return theme;
}

/**
 * '#089981' + 0.5 -> 'rgba(8, 153, 129, 0.5)'; 'rgba(8, 153, 129, 0.5)' + 0.5 -> alpha 0.25.
 * Other colours are returned unchanged.
 */
export function withAlpha(color: string, alpha: number): string {
  // An rgba colour (e.g. a line already dimmed) multiplies its own alpha.
  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(color.trim());
  if (rgba !== null) {
    const [, r, g, b, a] = rgba;
    return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(Number(a) * alpha)})`;
  }
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (match?.[1] === undefined) return color;
  let hex = match[1];
  if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
