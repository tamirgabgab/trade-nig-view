import type { MarkerSource } from './seriesData.ts';

/** A strategy signal on a bar (P4 B0): where the strategy would enter or leave. */
export type SignalMarkKind = 'long_entry' | 'long_exit' | 'short_entry' | 'short_exit' | 'conflict';

export interface SignalMark {
  /** Index into the bars given to `setBars`. */
  index: number;
  kind: SignalMarkKind;
}

/** The look of each signal (the legend in the Strategy tab says the same). */
export const SIGNAL_LOOK: Record<
  SignalMarkKind,
  {
    shape: NonNullable<MarkerSource['shape']>;
    position: 'aboveBar' | 'belowBar';
    side: 'up' | 'down' | 'both';
  }
> = {
  long_entry: { shape: 'arrowUp', position: 'belowBar', side: 'up' },
  long_exit: { shape: 'circle', position: 'aboveBar', side: 'up' },
  short_entry: { shape: 'arrowDown', position: 'aboveBar', side: 'down' },
  short_exit: { shape: 'circle', position: 'belowBar', side: 'down' },
  conflict: { shape: 'square', position: 'aboveBar', side: 'both' },
};

/** One fixed-look marker source per signal kind, over `n` bars. */
export function signalSources(
  marks: readonly SignalMark[],
  n: number,
  colors: { up: string; down: string; warning: string },
): MarkerSource[] {
  const kinds = Object.keys(SIGNAL_LOOK) as SignalMarkKind[];
  const values = new Map(kinds.map((k) => [k, new Array<number | null>(n).fill(null)]));
  let any = false;
  for (const { index, kind } of marks) {
    const row = values.get(kind);
    if (row === undefined || index < 0 || index >= n) continue;
    row[index] = 1;
    any = true;
  }
  if (!any) return [];
  return kinds.map((kind) => {
    const look = SIGNAL_LOOK[kind];
    return {
      values: values.get(kind) ?? [],
      color: look.side === 'both' ? colors.warning : look.side === 'up' ? colors.up : colors.down,
      shape: look.shape,
      position: look.position,
    };
  });
}
