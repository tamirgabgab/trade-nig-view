/**
 * Gap zones (R5) as one series primitive under the bars: a box from the gap's bar to the bar that
 * filled it, or to the right edge while it is open. Open gaps take the up/down colour, filled ones
 * a faded grey.
 */
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
} from 'lightweight-charts';

import { withAlpha } from './theme.ts';

/** A gap zone by bar index (`end` null = still open). */
export interface GapZone {
  start: number;
  end: number | null;
  top: number;
  bottom: number;
  direction: 'up' | 'down';
}

export interface GapColors {
  up: string;
  down: string;
  filled: string;
}

const OPEN_ALPHA = 0.2;
const FILLED_ALPHA = 0.1;

export class GapLayer implements ISeriesPrimitive {
  private zones: readonly GapZone[] = [];
  private requestUpdate: (() => void) | null = null;

  private readonly renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        const colors = this.colors();
        for (const zone of this.zones) {
          const x1 = this.indexToX(zone.start);
          const x2 = zone.end === null ? mediaSize.width : this.indexToX(zone.end);
          const y1 = this.priceToY(zone.top);
          const y2 = this.priceToY(zone.bottom);
          if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
          context.fillStyle =
            zone.end === null
              ? withAlpha(zone.direction === 'up' ? colors.up : colors.down, OPEN_ALPHA)
              : withAlpha(colors.filled, FILLED_ALPHA);
          context.fillRect(x1, Math.min(y1, y2), x2 - x1, Math.abs(y2 - y1));
        }
      });
    },
  };

  private readonly paneView: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: () => this.renderer,
  };

  constructor(
    private readonly indexToX: (index: number) => number | null,
    private readonly priceToY: (price: number) => number | null,
    private readonly colors: () => GapColors,
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

  set(zones: readonly GapZone[]): void {
    this.zones = zones;
    this.requestUpdate?.();
  }
}
