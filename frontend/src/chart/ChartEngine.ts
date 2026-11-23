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
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineWidth,
  type LogicalRange as LwcLogicalRange,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';

import type { Bar } from '../api/bars.ts';
import type { OutputInfo } from '../api/indicators.ts';
import { BandFill } from './bandFill.ts';
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
  toHistogram,
  toHollowCandles,
  toLine,
  toMarkers,
  toValueLine,
  toVolume,
  type ChartTime,
  type LogicalRange,
  type MarkerPoint,
  type MarkerSource,
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
/** Height of an indicator pane relative to the price pane (stretch factor 1). */
const PANE_STRETCH = 0.3;
const LEVEL_ALPHA = 0.6;

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

/**
 * One indicator output: a line or histogram over the price (or in the indicator's own pane), or
 * markers (arrows on the price bars: +1 = up arrow below the bar, -1 = down arrow above it, null =
 * none).
 */
export interface IndicatorLine {
  /** Stable id (instance uid + output name). */
  key: string;
  /** The indicator instance: the lines of an own-pane indicator share one pane. */
  group: string;
  /** Output name (a `fill_to` style names another output of the same group). */
  output: string;
  /** In its own pane below the price (an oscillator) instead of over the price. */
  ownPane: boolean;
  plot: OutputInfo['plot'];
  /** One value per bar given to `setBars` (null = no value, e.g. warm-up). */
  values: readonly (number | null)[];
  color: string;
  lineWidth: number;
  visible: boolean;
  /**
   * The backend output style: marker `up` / `down`, histogram `up` / `up_weak` / `down` /
   * `down_weak`, a fill (`fill_to` + `fill`), `price_scale: 'volume'`, `format: 'volume'`.
   */
  style: Readonly<Record<string, string>>;
  /** Dashed horizontal levels of the indicator's pane (on its first line). */
  levels: readonly number[];
}

/** Top of each own-pane indicator's pane (by group), in px from the top of the chart. */
export type PaneLayout = Readonly<Record<string, number>>;
export type PaneLayoutListener = (layout: PaneLayout) => void;

interface LineEntry {
  series: ISeriesApi<'Line'> | ISeriesApi<'Histogram'>;
  plot: OutputInfo['plot'];
  group: string;
  ownPane: boolean;
  values: readonly (number | null)[] | null;
  times: readonly ChartTime[] | null;
  style: Readonly<Record<string, string>> | null;
  levels: string;
  priceLines: IPriceLine[];
  fill: BandFill | null;
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
  private markerData: (Omit<MarkerPoint, 'time'> & { time: Time })[] = [];
  private markers: ISeriesMarkersPluginApi<Time> | null = null;
  private readonly container: HTMLElement;
  private readonly paneListeners = new Set<PaneLayoutListener>();
  private paneLayout: PaneLayout = {};
  private readonly paneObserver: ResizeObserver | null;
  private layoutFrame = 0;

  constructor(container: HTMLElement, theme: ChartTheme = readChartTheme()) {
    this.theme = theme;
    this.container = container;
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
    // Pane resizes (window, separator drags, panes added or removed) move the pane legends.
    this.paneObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.schedulePaneLayout);
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
   * Show exactly these indicator lines (others are removed, with their panes when empty). Call
   * after `setBars`: values are matched to the current bars by index. Data is only re-sent when
   * values, bars or colours changed.
   */
  setIndicatorLines(all: readonly IndicatorLine[]): void {
    const lines = all.filter((line) => line.plot !== 'markers');
    this.setMarkers(
      all
        .filter((line) => line.plot === 'markers' && line.visible)
        .map((line) => ({
          values: line.values,
          color: line.color,
          upColor: line.style.up,
          downColor: line.style.down,
        })),
    );
    const keep = new Map(lines.map((line) => [line.key, line]));
    for (const [key, entry] of this.lines) {
      const line = keep.get(key);
      if (line !== undefined && line.plot === entry.plot && line.ownPane === entry.ownPane)
        continue;
      this.chart.removeSeries(entry.series);
      this.lines.delete(key);
    }
    this.removeEmptyPanes();

    for (const line of lines) {
      const entry = this.lines.get(line.key) ?? this.addLine(line);
      const volumeScale = line.style.price_scale === 'volume';
      const format =
        volumeScale || line.style.format === 'volume'
          ? { type: 'volume' as const }
          : { type: 'price' as const, ...priceFormat(this.decimals) };
      entry.series.applyOptions({
        color: line.color,
        visible: line.visible,
        priceFormat: format,
        ...(line.plot === 'histogram' ? {} : { lineWidth: toLineWidth(line.lineWidth) }),
      });
      if (
        entry.values !== line.values ||
        entry.times !== this.times ||
        entry.style !== line.style
      ) {
        entry.series.setData(
          withTime(
            line.plot === 'histogram'
              ? toHistogram(line.values, this.times, {
                  up: line.style.up ?? line.color,
                  upWeak: line.style.up_weak ?? line.color,
                  down: line.style.down ?? line.color,
                  downWeak: line.style.down_weak ?? line.color,
                })
              : toValueLine(line.values, this.times),
          ),
        );
        entry.values = line.values;
        entry.times = this.times;
        entry.style = line.style;
      }
      this.setLevels(entry, line.levels);
    }

    for (const line of lines) {
      const entry = this.lines.get(line.key);
      const target = line.style.fill_to;
      if (entry === undefined || target === undefined) continue;
      if (entry.fill === null) {
        entry.fill = new BandFill();
        entry.series.attachPrimitive(entry.fill);
      }
      const other = keep.get(`${line.group}:${target}`);
      entry.fill.set(line.values, other?.values ?? [], line.style.fill ?? line.color, line.visible);
    }
    this.schedulePaneLayout();
  }

  /**
   * Call `listener` with the top of every indicator pane whenever the panes move. Returns an
   * unsubscribe function.
   */
  onPaneLayout(listener: PaneLayoutListener): () => void {
    this.paneListeners.add(listener);
    listener(this.paneLayout);
    return () => {
      this.paneListeners.delete(listener);
    };
  }

  private addLine(line: IndicatorLine): LineEntry {
    const sibling = line.ownPane
      ? [...this.lines.values()].find((e) => e.ownPane && e.group === line.group)
      : undefined;
    const pane = !line.ownPane
      ? 0
      : (sibling?.series.getPane().paneIndex() ?? this.chart.panes().length);
    const options = {
      priceLineVisible: false,
      lastValueVisible: true,
      ...(line.style.price_scale === 'volume' ? { priceScaleId: VOLUME_SCALE_ID } : {}),
    };
    const series =
      line.plot === 'histogram'
        ? this.chart.addSeries(HistogramSeries, options, pane)
        : this.chart.addSeries(LineSeries, { ...options, crosshairMarkerRadius: 3 }, pane);
    if (line.ownPane && sibling === undefined) {
      series.getPane().setStretchFactor(PANE_STRETCH);
      const element = series.getPane().getHTMLElement();
      if (element !== null) this.paneObserver?.observe(element);
    }
    const entry: LineEntry = {
      series,
      plot: line.plot,
      group: line.group,
      ownPane: line.ownPane,
      values: null,
      times: null,
      style: null,
      levels: '',
      priceLines: [],
      fill: null,
    };
    this.lines.set(line.key, entry);
    return entry;
  }

  private setLevels(entry: LineEntry, levels: readonly number[]): void {
    const key = levels.join(',');
    if (key === entry.levels) return;
    for (const priceLine of entry.priceLines) entry.series.removePriceLine(priceLine);
    entry.priceLines = levels.map((price) =>
      entry.series.createPriceLine({
        price,
        color: withAlpha(this.theme.textMuted, LEVEL_ALPHA),
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      }),
    );
    entry.levels = key;
  }

  /** Indicator panes left without series (their indicator was removed) are closed. */
  private removeEmptyPanes(): void {
    const panes = this.chart.panes();
    for (let i = panes.length - 1; i > 0; i--) {
      if (panes[i]?.getSeries().length === 0) this.chart.removePane(i);
    }
  }

  private readonly schedulePaneLayout = (): void => {
    if (this.layoutFrame !== 0) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.emitPaneLayout();
    });
  };

  private emitPaneLayout(): void {
    const origin = this.container.getBoundingClientRect().top;
    const layout: Record<string, number> = {};
    for (const entry of this.lines.values()) {
      if (!entry.ownPane || entry.group in layout) continue;
      const element = entry.series.getPane().getHTMLElement();
      if (element !== null) layout[entry.group] = element.getBoundingClientRect().top - origin;
    }
    const same =
      Object.keys(layout).length === Object.keys(this.paneLayout).length &&
      Object.entries(layout).every(([group, top]) => this.paneLayout[group] === top);
    if (same) return;
    this.paneLayout = layout;
    for (const listener of this.paneListeners) listener(layout);
  }

  /** Marker outputs sit on the main series, so they follow the candles' highs and lows. */
  private setMarkers(lines: readonly MarkerSource[]): void {
    this.markerData = withTime(toMarkers(lines, this.times));
    this.renderMarkers();
  }

  private renderMarkers(): void {
    if (this.markers === null) {
      if (this.markerData.length === 0) return;
      this.markers = createSeriesMarkers(this.main, this.markerData);
    } else {
      this.markers.setMarkers(this.markerData);
    }
  }

  /** Switch the main series' type, keeping data, markers and viewport. */
  setChartType(type: ChartType): void {
    if (type === this.chartType) return;
    this.markers?.detach();
    this.markers = null;
    this.chart.removeSeries(this.main);
    this.chartType = type;
    this.main = this.createMainSeries(type);
    this.renderMain();
    this.renderMarkers();
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
    cancelAnimationFrame(this.layoutFrame);
    this.paneObserver?.disconnect();
    this.paneListeners.clear();
    this.listeners.clear();
    this.rangeListeners.clear();
    this.lines.clear();
    this.markers = null;
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
