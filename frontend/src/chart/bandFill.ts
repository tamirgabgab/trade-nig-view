/**
 * Shading between two lines of one indicator (Bollinger Bands, RSI bands): a series primitive
 * attached to the upper line, drawn behind the series from the two value arrays.
 */
import type {
  IChartApi,
  Logical,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
} from 'lightweight-charts';

type Target = Parameters<NonNullable<IPrimitivePaneRenderer['drawBackground']>>[0];
type Values = readonly (number | null)[];

export class BandFill implements ISeriesPrimitive {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private upper: Values = [];
  private lower: Values = [];
  private color = 'transparent';
  private visible = true;

  private readonly renderer: IPrimitivePaneRenderer = {
    draw: () => undefined,
    drawBackground: (target) => {
      this.draw(target);
    },
  };

  private readonly view: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: () => this.renderer,
  };

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter): void {
    this.chart = chart;
    this.series = series;
    this.requestUpdate = requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }

  /** Values by bar index (as the series data), the fill colour and visibility. */
  set(upper: Values, lower: Values, color: string, visible: boolean): void {
    this.upper = upper;
    this.lower = lower;
    this.color = color;
    this.visible = visible;
    this.requestUpdate?.();
  }

  private draw(target: Target): void {
    const { chart, series } = this;
    if (chart === null || series === null || !this.visible) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (range === null) return;
    const from = Math.max(Math.floor(range.from) - 1, 0);
    const to = Math.min(Math.ceil(range.to) + 1, this.upper.length - 1);
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      context.fillStyle = this.color;
      let run: [number, number, number][] = [];
      const flush = () => {
        if (run.length > 1) {
          context.beginPath();
          run.forEach(([x, top], i) => {
            if (i === 0) context.moveTo(x, top);
            else context.lineTo(x, top);
          });
          for (let i = run.length - 1; i >= 0; i--) {
            const point = run[i];
            if (point !== undefined) context.lineTo(point[0], point[2]);
          }
          context.closePath();
          context.fill();
        }
        run = [];
      };
      for (let i = from; i <= to; i++) {
        const upper = this.upper[i];
        const lower = this.lower[i];
        const x = chart.timeScale().logicalToCoordinate(i as Logical);
        const top = upper === null || upper === undefined ? null : series.priceToCoordinate(upper);
        const bottom =
          lower === null || lower === undefined ? null : series.priceToCoordinate(lower);
        if (x === null || top === null || bottom === null) {
          flush();
          continue;
        }
        run.push([x * horizontalPixelRatio, top * verticalPixelRatio, bottom * verticalPixelRatio]);
      }
      flush();
    });
  }
}
