import type { IndicatorLine } from '../chart/ChartEngine.ts';
import { withAlpha } from '../chart/theme.ts';

/** Opacity of the other indicators' lines while one legend row is hovered. */
export const DIMMED_ALPHA = 0.2;

/** Style keys holding colours drawn by the engine: histogram bars, markers, band fills. */
const COLOR_KEYS = new Set(['up', 'up_weak', 'down', 'down_weak', 'fill']);

function dim(style: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(style).map(([key, value]) => [
      key,
      COLOR_KEYS.has(key) ? withAlpha(value, DIMMED_ALPHA) : value,
    ]),
  );
}

/**
 * Presentation-only tweaks of the indicator lines: while a legend row is focused the other
 * indicators dim (lines, histogram bars, markers and fills); a just-added indicator is drawn
 * 2 px thicker (the library caps widths at 4 px; the legend row glow marks it too). Values are
 * untouched; a dimmed style makes the engine re-send that series' data with the new colours.
 */
export function presentLines(
  lines: readonly IndicatorLine[],
  focus: string | null,
  emphasis: string | null,
): readonly IndicatorLine[] {
  if (focus === null && emphasis === null) return lines;
  return lines.map((line) => {
    if (focus !== null && line.group !== focus) {
      return { ...line, color: withAlpha(line.color, DIMMED_ALPHA), style: dim(line.style) };
    }
    if (line.group === emphasis) return { ...line, lineWidth: line.lineWidth + 2 };
    return line;
  });
}
