/**
 * The OHLC forecast (P3, ADR 0010) as one series primitive: from the origin bar, a shaded fan of
 * the close's central 50 / 80 / 95 % intervals for the next k bars, a faint median candle per bar
 * and thin whiskers to the 80 % high and low. Drawn at logical indexes past the origin, so it
 * lands in the empty space right of the last bar (or over the bars that replay reveals).
 */
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
} from 'lightweight-charts';

import { withAlpha } from './theme.ts';

/** One bar ahead: the median candle, the 80 % high and low, the close's interval bounds. */
export interface ForecastBar {
  index: number;
  open: number;
  high: number;
  low: number;
  close: number;
  high80: number;
  low80: number;
  /** Close bounds, outer to inner: [95 % low, 80 % low, 50 % low, 50 % high, 80 % high, 95 % high]. */
  bands: readonly [number, number, number, number, number, number];
}

export interface ForecastView {
  /** The origin bar and its close: the fan starts there. */
  origin: number;
  close: number;
  bars: readonly ForecastBar[];
}

export interface ForecastColors {
  up: string;
  down: string;
  fan: string;
}

/** Fill of the 95, 80 and 50 % bands (they overlap: the inner ones look darker). */
const BAND_ALPHA = [0.08, 0.1, 0.14] as const;
const CANDLE_ALPHA = 0.45;

export class ForecastLayer implements ISeriesPrimitive {
  private view: ForecastView | null = null;
  private requestUpdate: (() => void) | null = null;

  private readonly renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      const view = this.view;
      if (view === null || view.bars.length === 0) return;
      target.useMediaCoordinateSpace(({ context }) => {
        const colors = this.colors();
        const x0 = this.indexToX(view.origin);
        const y0 = this.priceToY(view.close);
        const xs = view.bars.map((b) => this.indexToX(b.index));
        if (x0 === null || y0 === null || xs.some((x) => x === null)) return;
        const at = (i: number) => xs[i] ?? 0;
        // The fan: each band from the origin's close through the bars' bounds and back.
        for (let band = 0; band < 3; band += 1) {
          const lower = view.bars.map((b) => this.priceToY(b.bands[band] ?? Number.NaN));
          const upper = view.bars.map((b) => this.priceToY(b.bands[5 - band] ?? Number.NaN));
          if ([...lower, ...upper].some((y) => y === null)) continue;
          context.beginPath();
          context.moveTo(x0, y0);
          upper.forEach((y, i) => {
            context.lineTo(at(i), y ?? y0);
          });
          for (let i = lower.length - 1; i >= 0; i -= 1) context.lineTo(at(i), lower[i] ?? y0);
          context.closePath();
          context.fillStyle = withAlpha(colors.fan, BAND_ALPHA[band] ?? 0.1);
          context.fill();
        }
        // Median candles and the 80 % whiskers.
        const width = view.bars.length > 1 ? Math.abs(at(1) - at(0)) : Math.abs(at(0) - x0);
        const body = Math.max(1, width * 0.6);
        view.bars.forEach((b, i) => {
          const x = at(i);
          const [o, c, h, l, h80, l80] = [b.open, b.close, b.high, b.low, b.high80, b.low80].map(
            (p) => this.priceToY(p),
          );
          if ([o, c, h, l, h80, l80].some((y) => y === null)) return;
          const color = withAlpha(b.close >= b.open ? colors.up : colors.down, CANDLE_ALPHA);
          context.strokeStyle = color;
          context.fillStyle = color;
          context.lineWidth = 1;
          context.setLineDash([2, 2]);
          context.beginPath();
          context.moveTo(x, h80 ?? 0);
          context.lineTo(x, l80 ?? 0);
          context.stroke();
          context.setLineDash([]);
          context.beginPath();
          context.moveTo(x, h ?? 0);
          context.lineTo(x, l ?? 0);
          context.stroke();
          const top = Math.min(o ?? 0, c ?? 0);
          context.fillRect(x - body / 2, top, body, Math.max(1, Math.abs((o ?? 0) - (c ?? 0))));
        });
      });
    },
  };

  private readonly paneView: IPrimitivePaneView = {
    zOrder: () => 'top',
    renderer: () => this.renderer,
  };

  constructor(
    private readonly indexToX: (index: number) => number | null,
    private readonly priceToY: (price: number) => number | null,
    private readonly colors: () => ForecastColors,
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

  set(view: ForecastView | null): void {
    this.view = view;
    this.requestUpdate?.();
  }
}
