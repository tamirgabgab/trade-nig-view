/**
 * ChartEngine: the only module that talks to lightweight-charts (v5). React components create one
 * per chart container and drive it through this small API; they never touch the library directly.
 */
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';

import type { Bar } from '../api/bars.ts';
import { rafLatest, type RafLatest } from './rafLatest.ts';
import {
  chartTimes,
  crosshairIndex,
  hasIntradayTimes,
  initialRange,
  priceFormat,
  toCandles,
  toVolume,
  type ChartTime,
} from './seriesData.ts';
import { readChartTheme, withAlpha, type ChartTheme } from './theme.ts';
import { DISPLAY_TIME_ZONE } from './timeZone.ts';

/** Price pane margins: candles keep the top 75%, leaving room for volume below. */
const CANDLE_MARGINS = { top: 0.08, bottom: 0.22 };
/** Volume uses the bottom 20% of the price pane, on its own hidden scale. */
const VOLUME_MARGINS = { top: 0.8, bottom: 0 };
const VOLUME_ALPHA = 0.5;
const VOLUME_SCALE_ID = 'volume';

/** lightweight-charts brands timestamps; our display-zone seconds are exactly that number. */
function withTime<P extends { time: ChartTime }>(
  points: P[],
): (Omit<P, 'time'> & { time: Time })[] {
  return points.map((point) => ({
    ...point,
    time: typeof point.time === 'number' ? (point.time as UTCTimestamp) : point.time,
  }));
}

export interface SetBarsOptions {
  /** Decimal places of the instrument's prices (universe `decimals`). */
  decimals: number;
  /** False for indices and forex, which have no meaningful volume. */
  hasVolume: boolean;
  /** Jump to the latest bars (new symbol or interval); false keeps the user's viewport. */
  resetView: boolean;
  /** IANA zone intraday bars are shown in (default: Israel time). */
  timeZone?: string;
}

export type CrosshairListener = (index: number | null) => void;

export class ChartEngine {
  private readonly chart: IChartApi;
  private readonly candles: ISeriesApi<'Candlestick'>;
  private readonly volume: ISeriesApi<'Histogram'>;
  private readonly theme: ChartTheme;
  private readonly listeners = new Set<CrosshairListener>();
  private readonly hover: RafLatest<number | null>;
  private barCount = 0;

  constructor(container: HTMLElement, theme: ChartTheme = readChartTheme()) {
    this.theme = theme;
    this.chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.textMuted,
        fontFamily: theme.fontFamily,
        fontSize: 12,
        attributionLogo: true, // required by the lightweight-charts license; keep it on
      },
      localization: { locale: 'en-US' },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.crosshair, labelBackgroundColor: theme.labelBackground },
        horzLine: { color: theme.crosshair, labelBackgroundColor: theme.labelBackground },
      },
      rightPriceScale: { borderColor: theme.border, scaleMargins: CANDLE_MARGINS },
      timeScale: { borderColor: theme.border, rightOffset: 5, secondsVisible: false },
    });

    this.candles = this.chart.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderUpColor: theme.up,
      borderDownColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    });

    this.volume = this.chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: VOLUME_SCALE_ID,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    this.chart.priceScale(VOLUME_SCALE_ID).applyOptions({ scaleMargins: VOLUME_MARGINS });

    this.hover = rafLatest((index) => {
      for (const listener of this.listeners) listener(index);
    });
    this.chart.subscribeCrosshairMove(this.handleCrosshairMove);
  }

  /** Replace the displayed bars (oldest first, as the API returns them). */
  setBars(
    bars: readonly Bar[],
    { decimals, hasVolume, resetView, timeZone = DISPLAY_TIME_ZONE }: SetBarsOptions,
  ): void {
    this.barCount = bars.length;
    const times = chartTimes(bars, timeZone);
    // Intraday bars need the time of day on the axis; daily and longer bars show dates only.
    this.chart.applyOptions({ timeScale: { timeVisible: hasIntradayTimes(bars) } });
    this.candles.applyOptions({ priceFormat: { type: 'price', ...priceFormat(decimals) } });
    this.candles.setData(withTime(toCandles(bars, times)));

    this.volume.applyOptions({ visible: hasVolume });
    this.volume.setData(
      hasVolume
        ? withTime(
            toVolume(
              bars,
              times,
              withAlpha(this.theme.up, VOLUME_ALPHA),
              withAlpha(this.theme.down, VOLUME_ALPHA),
            ),
          )
        : [],
    );

    if (resetView && bars.length > 0) {
      this.chart.timeScale().setVisibleLogicalRange(initialRange(bars.length));
    }
  }

  /**
   * Call `listener` with the bar index under the crosshair (null when off the data), at most
   * once per animation frame. Returns an unsubscribe function.
   */
  onCrosshairMove(listener: CrosshairListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.hover.cancel();
    this.listeners.clear();
    this.chart.unsubscribeCrosshairMove(this.handleCrosshairMove);
    this.chart.remove();
  }

  private readonly handleCrosshairMove = (param: MouseEventParams): void => {
    this.hover.push(crosshairIndex(param.logical, param.time !== undefined, this.barCount));
  };
}
