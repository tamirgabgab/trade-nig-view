/**
 * ChartEngine: the only module that talks to lightweight-charts (v5). React components create one
 * per chart container and drive it through this small API; they never touch the library directly.
 */
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type LineWidth,
  type LogicalRange as LwcLogicalRange,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';

import type { Bar } from '../api/bars.ts';
import type { ChartType, ScaleMode } from './chartTypes.ts';
import { rafLatest, type RafLatest } from './rafLatest.ts';
import {
  chartTimes,
  crosshairIndex,
  hasIntradayTimes,
  initialRange,
  prependedCount,
  priceFormat,
  toCandles,
  toHollowCandles,
  toLine,
  toValueLine,
  toVolume,
  type ChartTime,
  type LogicalRange,
} from './seriesData.ts';
import { readChartTheme, withAlpha, type ChartTheme } from './theme.ts';
import { DISPLAY_TIME_ZONE } from './timeZone.ts';

/** Price pane margins: the main series keeps the top 75%, leaving room for volume below. */
const MAIN_MARGINS = { top: 0.08, bottom: 0.22 };
/** Volume uses the bottom 20% of the price pane, on its own hidden scale. */
const VOLUME_MARGINS = { top: 0.8, bottom: 0 };
const VOLUME_ALPHA = 0.5;
const AREA_TOP_ALPHA = 0.28;
const AREA_BOTTOM_ALPHA = 0.02;
const VOLUME_SCALE_ID = 'volume';

const SCALE_MODES: Record<ScaleMode, PriceScaleMode> = {
  normal: PriceScaleMode.Normal,
  log: PriceScaleMode.Logarithmic,
  percent: PriceScaleMode.Percentage,
};

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
  /**
   * Jump to the latest bars (new symbol or interval); false keeps the user's viewport. When the
   * new bars are the old ones with older history in front, the viewport stays on the same bars.
   */
  resetView: boolean;
  /** IANA zone intraday bars are shown in (default: Israel time). */
  timeZone?: string;
}

export interface ScaleOptions {
  mode: ScaleMode;
  autoScale: boolean;
}

/** One indicator output drawn as a line on the price pane. */
export interface IndicatorLine {
  /** Stable id (instance uid + output name). */
  key: string;
  /** One value per bar given to `setBars` (null = no value, e.g. warm-up). */
  values: readonly (number | null)[];
  color: string;
  lineWidth: number;
  visible: boolean;
}

interface LineEntry {
  series: ISeriesApi<'Line'>;
  values: readonly (number | null)[] | null;
  times: readonly ChartTime[] | null;
}

function toLineWidth(width: number): LineWidth {
  return Math.min(Math.max(Math.round(width), 1), 4) as LineWidth;
}

export type CrosshairListener = (index: number | null) => void;
export type VisibleRangeListener = (range: LogicalRange | null) => void;

export class ChartEngine {
  private readonly chart: IChartApi;
  private main: ISeriesApi<SeriesType>;
  private readonly volume: ISeriesApi<'Histogram'>;
  private readonly theme: ChartTheme;
  private readonly listeners = new Set<CrosshairListener>();
  private readonly rangeListeners = new Set<VisibleRangeListener>();
  private readonly hover: RafLatest<number | null>;
  private chartType: ChartType = 'candles';
  private bars: readonly Bar[] = [];
  private times: ChartTime[] = [];
  private decimals = 2;
  private readonly lines = new Map<string, LineEntry>();

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
      rightPriceScale: { borderColor: theme.border, scaleMargins: MAIN_MARGINS },
      timeScale: { borderColor: theme.border, rightOffset: 5, secondsVisible: false },
    });

    this.volume = this.chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: VOLUME_SCALE_ID,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    this.chart.priceScale(VOLUME_SCALE_ID).applyOptions({ scaleMargins: VOLUME_MARGINS });
    this.main = this.createMainSeries(this.chartType);

    this.hover = rafLatest((index) => {
      for (const listener of this.listeners) listener(index);
    });
    this.chart.subscribeCrosshairMove(this.handleCrosshairMove);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.handleRangeChange);
  }

  /** Replace the displayed bars (oldest first, as the API returns them). */
  setBars(
    bars: readonly Bar[],
    { decimals, hasVolume, resetView, timeZone = DISPLAY_TIME_ZONE }: SetBarsOptions,
  ): void {
    const shift = resetView ? 0 : prependedCount(this.bars, bars);
    const before = shift > 0 ? this.chart.timeScale().getVisibleLogicalRange() : null;

    this.bars = bars;
    this.decimals = decimals;
    this.times = chartTimes(bars, timeZone);
    // Intraday bars need the time of day on the axis; daily and longer bars show dates only.
    this.chart.applyOptions({ timeScale: { timeVisible: hasIntradayTimes(bars) } });
    this.renderMain();

    this.volume.applyOptions({ visible: hasVolume });
    this.volume.setData(
      hasVolume
        ? withTime(
            toVolume(
              bars,
              this.times,
              withAlpha(this.theme.up, VOLUME_ALPHA),
              withAlpha(this.theme.down, VOLUME_ALPHA),
            ),
          )
        : [],
    );

    if (before !== null) {
      // Older bars were prepended: every bar index moved right by `shift`; keep the same bars.
      this.chart
        .timeScale()
        .setVisibleLogicalRange({ from: before.from + shift, to: before.to + shift });
    } else if (resetView && bars.length > 0) {
      this.chart.timeScale().setVisibleLogicalRange(initialRange(bars.length));
    }
  }

  /**
   * Show exactly these indicator lines (others are removed). Call after `setBars`: values are
   * matched to the current bars by index. Data is only re-sent when values or bars changed.
   */
  setIndicatorLines(lines: readonly IndicatorLine[]): void {
    const keep = new Set(lines.map((line) => line.key));
    for (const [key, entry] of this.lines) {
      if (keep.has(key)) continue;
      this.chart.removeSeries(entry.series);
      this.lines.delete(key);
    }
    for (const line of lines) {
      let entry = this.lines.get(line.key);
      if (entry === undefined) {
        const series = this.chart.addSeries(LineSeries, {
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerRadius: 3,
        });
        entry = { series, values: null, times: null };
        this.lines.set(line.key, entry);
      }
      entry.series.applyOptions({
        color: line.color,
        lineWidth: toLineWidth(line.lineWidth),
        visible: line.visible,
        priceFormat: { type: 'price', ...priceFormat(this.decimals) },
      });
      if (entry.values !== line.values || entry.times !== this.times) {
        entry.series.setData(withTime(toValueLine(line.values, this.times)));
        entry.values = line.values;
        entry.times = this.times;
      }
    }
  }

  /** Switch the main series' type, keeping data and viewport. */
  setChartType(type: ChartType): void {
    if (type === this.chartType) return;
    this.chart.removeSeries(this.main);
    this.chartType = type;
    this.main = this.createMainSeries(type);
    this.renderMain();
  }

  /** Price-axis mode (normal, logarithmic, percent) and auto-fit. */
  setScale({ mode, autoScale }: ScaleOptions): void {
    this.chart.priceScale('right').applyOptions({ mode: SCALE_MODES[mode], autoScale });
  }

  /** Show the bars between two logical indices (fractions allowed). */
  setVisibleRange(range: LogicalRange): void {
    this.chart.timeScale().setVisibleLogicalRange(range);
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

  /** Call `listener` whenever the visible logical range changes (scroll, zoom, new data). */
  onVisibleRangeChange(listener: VisibleRangeListener): () => void {
    this.rangeListeners.add(listener);
    return () => {
      this.rangeListeners.delete(listener);
    };
  }

  dispose(): void {
    this.hover.cancel();
    this.listeners.clear();
    this.rangeListeners.clear();
    this.lines.clear();
    this.chart.unsubscribeCrosshairMove(this.handleCrosshairMove);
    this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.handleRangeChange);
    this.chart.remove();
  }

  private createMainSeries(type: ChartType): ISeriesApi<SeriesType> {
    const { up, down, line } = this.theme;
    const options = { priceFormat: { type: 'price' as const, ...priceFormat(this.decimals) } };
    switch (type) {
      case 'bars':
        return this.chart.addSeries(BarSeries, { ...options, upColor: up, downColor: down });
      case 'line':
        return this.chart.addSeries(LineSeries, { ...options, color: line, lineWidth: 2 });
      case 'area':
        return this.chart.addSeries(AreaSeries, {
          ...options,
          lineColor: line,
          lineWidth: 2,
          topColor: withAlpha(line, AREA_TOP_ALPHA),
          bottomColor: withAlpha(line, AREA_BOTTOM_ALPHA),
        });
      case 'candles':
      case 'hollow':
      case 'heikin_ashi':
        return this.chart.addSeries(CandlestickSeries, {
          ...options,
          upColor: up,
          downColor: down,
          borderUpColor: up,
          borderDownColor: down,
          wickUpColor: up,
          wickDownColor: down,
        });
    }
  }

  private renderMain(): void {
    this.main.applyOptions({ priceFormat: { type: 'price', ...priceFormat(this.decimals) } });
    const { up, down } = this.theme;
    switch (this.chartType) {
      case 'line':
      case 'area':
        this.main.setData(withTime(toLine(this.bars, this.times)));
        return;
      case 'hollow':
        this.main.setData(withTime(toHollowCandles(this.bars, this.times, up, down)));
        return;
      case 'candles':
      case 'bars':
      case 'heikin_ashi':
        this.main.setData(withTime(toCandles(this.bars, this.times)));
    }
  }

  private readonly handleCrosshairMove = (param: MouseEventParams): void => {
    this.hover.push(crosshairIndex(param.logical, param.time !== undefined, this.bars.length));
  };

  private readonly handleRangeChange = (range: LwcLogicalRange | null): void => {
    const value = range === null ? null : { from: range.from, to: range.to };
    for (const listener of this.rangeListeners) listener(value);
  };
}
