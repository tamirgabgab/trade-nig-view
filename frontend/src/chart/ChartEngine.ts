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
} from 'lightweight-charts';

import type { Bar } from '../api/bars.ts';
import { rafLatest, type RafLatest } from './rafLatest.ts';
import { crosshairIndex, initialRange, priceFormat, toCandles, toVolume } from './seriesData.ts';
import { readChartTheme, withAlpha, type ChartTheme } from './theme.ts';

/** Price pane margins: candles keep the top 75%, leaving room for volume below. */
const CANDLE_MARGINS = { top: 0.08, bottom: 0.22 };
/** Volume uses the bottom 20% of the price pane, on its own hidden scale. */
const VOLUME_MARGINS = { top: 0.8, bottom: 0 };
const VOLUME_ALPHA = 0.5;
const VOLUME_SCALE_ID = 'volume';

export interface SetBarsOptions {
  /** Decimal places of the instrument's prices (universe `decimals`). */
  decimals: number;
  /** False for indices and forex, which have no meaningful volume. */
  hasVolume: boolean;
  /** Jump to the latest bars (new symbol or interval); false keeps the user's viewport. */
  resetView: boolean;
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
      timeScale: { borderColor: theme.border, rightOffset: 5 },
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
  setBars(bars: readonly Bar[], { decimals, hasVolume, resetView }: SetBarsOptions): void {
    this.barCount = bars.length;
    this.candles.applyOptions({ priceFormat: { type: 'price', ...priceFormat(decimals) } });
    this.candles.setData(toCandles(bars));

    this.volume.applyOptions({ visible: hasVolume });
    this.volume.setData(
      hasVolume
        ? toVolume(
            bars,
            withAlpha(this.theme.up, VOLUME_ALPHA),
            withAlpha(this.theme.down, VOLUME_ALPHA),
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
