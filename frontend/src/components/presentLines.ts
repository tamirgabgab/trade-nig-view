import type { IndicatorLine } from '../chart/ChartEngine.ts';
import { withAlpha } from '../chart/theme.ts';

/** Opacity of the other indicators' lines while one legend row is hovered. */
export const DIMMED_ALPHA = 0.2;

/**
 * Presentation-only tweaks of the indicator lines: while a legend row is focused the other
 * indicators dim; a just-added indicator is drawn 2 px thicker. Values are untouched, so the
 * engine only re-applies options, never re-sends data.
 */
export function presentLines(
  lines: readonly IndicatorLine[],
  focus: string | null,
  emphasis: string | null,
): readonly IndicatorLine[] {
  if (focus === null && emphasis === null) return lines;
  return lines.map((line) => {
    if (focus !== null && line.group !== focus) {
      return { ...line, color: withAlpha(line.color, DIMMED_ALPHA) };
    }
    if (line.group === emphasis) return { ...line, lineWidth: line.lineWidth + 2 };
    return line;
  });
}
