/**
 * Background tints (a `background` indicator output, e.g. the market regime) as one series
 * primitive behind the bars: each run of bars with the same non-zero value is a full-height band
 * in that value's colour, from half a bar before its first bar to half a bar after its last.
 */
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
} from 'lightweight-charts';

import { withAlpha } from './theme.ts';

/** Bars `start`..`end` (indexes, inclusive) tinted `color`. */
export interface BackgroundRun {
  start: number;
  end: number;
  color: string;
}

const ALPHA = 0.1;

/** The runs of equal values in `values`: +1 in `up`, -1 in `down`, nothing for 0 or no value. */
export function backgroundRuns(
  values: readonly (number | null)[],
  up: string,
  down: string,
): BackgroundRun[] {
  const runs: BackgroundRun[] = [];
  values.forEach((v, i) => {
    const color = v === 1 ? up : v === -1 ? down : null;
    const last = runs.at(-1);
    if (color === null) return;
    if (last !== undefined && last.end === i - 1 && last.color === color) last.end = i;
    else runs.push({ start: i, end: i, color });
  });
  return runs;
}

export class BackgroundLayer implements ISeriesPrimitive {
  private runs: readonly BackgroundRun[] = [];
  private requestUpdate: (() => void) | null = null;

  private readonly renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        for (const run of this.runs) {
          const x1 = this.indexToX(run.start - 0.5);
          const x2 = this.indexToX(run.end + 0.5);
          if (x1 === null || x2 === null) continue;
          context.fillStyle = withAlpha(run.color, ALPHA);
          context.fillRect(x1, 0, x2 - x1, mediaSize.height);
        }
      });
    },
  };

  private readonly paneView: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: () => this.renderer,
  };

  constructor(private readonly indexToX: (index: number) => number | null) {}

  attached({ requestUpdate }: SeriesAttachedParameter): void {
    this.requestUpdate = requestUpdate;
  }

  detached(): void {
    this.requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  set(runs: readonly BackgroundRun[]): void {
    this.runs = runs;
    this.requestUpdate?.();
  }
}
