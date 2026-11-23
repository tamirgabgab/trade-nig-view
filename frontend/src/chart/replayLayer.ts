/**
 * Replay start picking (R7): a vertical line at the bar under the pointer and the bars after it
 * shaded, the part of the chart the replay hides. One series primitive over the bars.
 */
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
} from 'lightweight-charts';

import { withAlpha } from './theme.ts';

const SHADE_ALPHA = 0.6;

export class ReplayLayer implements ISeriesPrimitive {
  private index: number | null = null;
  private requestUpdate: (() => void) | null = null;

  private readonly renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        if (this.index === null) return;
        const x = this.indexToX(this.index);
        if (x === null) return;
        const { background, accent } = this.colors();
        context.fillStyle = withAlpha(background, SHADE_ALPHA);
        context.fillRect(x, 0, mediaSize.width - x, mediaSize.height);
        context.fillStyle = accent;
        context.fillRect(Math.round(x) - 1, 0, 2, mediaSize.height);
      });
    },
  };

  private readonly paneView: IPrimitivePaneView = {
    zOrder: () => 'top',
    renderer: () => this.renderer,
  };

  constructor(
    private readonly indexToX: (index: number) => number | null,
    private readonly colors: () => { background: string; accent: string },
  ) {}

  attached({ requestUpdate }: SeriesAttachedParameter): void {
    this.requestUpdate = requestUpdate;
  }

  detached(): void {
    this.requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  /** The bar the replay would start at (null: not picking). */
  set(index: number | null): void {
    if (index === this.index) return;
    this.index = index;
    this.requestUpdate?.();
  }
}
