/**
 * Chart patterns (XABCD, ABCD, head and shoulders): the labels of their points and the
 * Fibonacci ratios traders read on them. Pure, in data space (prices), so tested without a canvas.
 *
 * - **XABCD** (harmonic): the B retracement AB/XA, then BC/AB, CD/BC and the D retracement AD/XA,
 *   each the ratio of two legs' price moves.
 * - **ABCD**: BC/AB and CD/BC.
 * - **Head and shoulders**: seven points (start, left shoulder, neck, head, neck, right shoulder,
 *   end); the neckline runs through the two neck points.
 */
import type { Anchor, DrawingType } from './types.ts';

export type PatternType = Extract<DrawingType, 'xabcd' | 'abcd' | 'head_shoulders'>;

export const PATTERN_LABELS: Record<PatternType, readonly string[]> = {
  xabcd: ['X', 'A', 'B', 'C', 'D'],
  abcd: ['A', 'B', 'C', 'D'],
  head_shoulders: ['', 'Left shoulder', '', 'Head', '', 'Right shoulder', ''],
};

export const isPattern = (type: DrawingType): type is PatternType => type in PATTERN_LABELS;

/** A ratio drawn on the dashed line between points `from` and `to`. */
export interface PatternRatio {
  from: number;
  to: number;
  value: number;
}

/** |price move of leg (i, j)| / |price move of leg (k, l)|; NaN on a flat denominator. */
function legRatio(points: readonly Anchor[], [i, j]: number[], [k, l]: number[]): number {
  const move = (a = 0, b = 0) => Math.abs((points[b]?.price ?? 0) - (points[a]?.price ?? 0));
  const den = move(k, l);
  return den === 0 ? Number.NaN : move(i, j) / den;
}

/** The pattern's ratios, each with the line it labels (point indexes). */
export function patternRatios(type: PatternType, points: readonly Anchor[]): PatternRatio[] {
  const r = (from: number, to: number, leg: number[], base: number[]) => ({
    from,
    to,
    value: legRatio(points, leg, base),
  });
  switch (type) {
    case 'xabcd': // X=0 A=1 B=2 C=3 D=4
      return [
        r(0, 2, [1, 2], [0, 1]), // AB / XA, on X–B
        r(1, 3, [2, 3], [1, 2]), // BC / AB, on A–C
        r(2, 4, [3, 4], [2, 3]), // CD / BC, on B–D
        r(0, 4, [1, 4], [0, 1]), // AD / XA, on X–D
      ];
    case 'abcd': // A=0 B=1 C=2 D=3
      return [r(0, 2, [1, 2], [0, 1]), r(1, 3, [2, 3], [1, 2])];
    case 'head_shoulders':
      return [];
  }
}
