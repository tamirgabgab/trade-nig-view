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
  type Logical,
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
import { logicalToTime, logicalToX, timeToLogical } from '../drawings/anchors.ts';
import { spanBetween, type Span } from '../drawings/measure.ts';
import type { Anchor, DrawingView, Point } from '../drawings/types.ts';
import { DrawingLayer } from './drawingLayer.ts';
import { readChartTheme, withAlpha, type ChartTheme } from './theme.ts';
import { barSeconds } from './visibleRange.ts';
import { DISPLAY_TIME_ZONE } from './timeZone.ts';

/** Price pane margins: the main series keeps the top 75%, leaving room for volume below. */
const MAIN_MARGINS = { top: 0.08, bottom: 0.22 };
/** Volume uses the bottom 20% of the price pane, on its own hidden scale. */
const VOLUME_MARGINS = { top: 0.8, bottom: 0 };
const VOLUME_ALPHA = 0.35;
/** Opacity of the shaded band between two levels (RSI 30–70). */
const LEVEL_FILL_ALPHA = 0.08;
const SEPARATOR_HOVER_ALPHA = 0.35;
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
  /** Band between two levels shaded in the line's colour (on its first line), or null. */
  levelFill: readonly [number, number] | null;
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
  levelFill: BandFill | null;
  levelFillKey: string;
}

/** The chart options that come from the theme (applied again when it changes). */
function themeOptions(theme: ChartTheme) {
  return {
    layout: {
      background: { type: ColorType.Solid, color: theme.background },
      textColor: theme.textMuted,
      fontFamily: theme.fontFamily,
      // Pane separators: a hairline that lights up on hover, to show the panes can be resized.
      panes: {
        enableResize: true,
        separatorColor: theme.border,
        separatorHoverColor: withAlpha(theme.line, SEPARATOR_HOVER_ALPHA),
      },
    },
    grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
    crosshair: {
      vertLine: { color: theme.crosshair, labelBackgroundColor: theme.labelBackground },
      horzLine: { color: theme.crosshair, labelBackgroundColor: theme.labelBackground },
    },
    rightPriceScale: { borderColor: theme.border },
    timeScale: { borderColor: theme.border },
  };
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
  private theme: ChartTheme;
  private readonly listeners = new Set<CrosshairListener>();
  private readonly rangeListeners = new Set<VisibleRangeListener>();
  private readonly hover: RafLatest<number | null>;
  private chartType: ChartType = 'candles';
  private bars: readonly Bar[] = [];
  /** Bar open times in UTC epoch seconds (drawing anchors map onto them). */
  private barTimes: number[] = [];
  private readonly drawingLayer = new DrawingLayer(
    (anchor) => this.project(anchor),
    () => ({
      background: this.theme.background,
      priceToY: (price) => this.priceToY(price),
      decimals: this.decimals,
      span: (a, b) => this.span(a, b),
    }),
  );
  private lastLines: readonly IndicatorLine[] = [];
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
  private hasVolume = true;
  private autoScale = true;
  private readonly autoScaleListeners = new Set<(autoScale: boolean) => void>();

  private readonly checkAutoScale = (): void => {
    const autoScale = this.chart.priceScale('right').options().autoScale;
    if (autoScale === this.autoScale) return;
    this.autoScale = autoScale;
    for (const listener of this.autoScaleListeners) listener(autoScale);
  };

  constructor(container: HTMLElement, theme: ChartTheme = readChartTheme()) {
    this.theme = theme;
    this.container = container;
    const colors = themeOptions(theme);
    this.chart = createChart(container, {
      ...colors,
      autoSize: true,
      layout: {
        ...colors.layout,
        fontSize: 12,
        attributionLogo: true, // required by the lightweight-charts license; keep it on
      },
      localization: { locale: 'en-US' },
      crosshair: { ...colors.crosshair, mode: CrosshairMode.Normal },
      rightPriceScale: { ...colors.rightPriceScale, scaleMargins: MAIN_MARGINS },
      timeScale: { ...colors.timeScale, rightOffset: 5, secondsVisible: false },
    });

    this.volume = this.chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: VOLUME_SCALE_ID,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    this.chart.priceScale(VOLUME_SCALE_ID).applyOptions({ scaleMargins: VOLUME_MARGINS });
    this.main = this.createMainSeries(this.chartType);
    this.main.attachPrimitive(this.drawingLayer);

    this.hover = rafLatest((index) => {
      for (const listener of this.listeners) listener(index);
    });
    this.chart.subscribeCrosshairMove(this.handleCrosshairMove);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.handleRangeChange);
    // Pane resizes (window, separator drags, panes added or removed) move the pane legends.
    this.paneObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.schedulePaneLayout);
    // Dragging the price axis turns auto-fit off and a double-click on it turns it back on (both
    // inside the library); report it so the "auto" toggle follows.
    // pointerup on the window: the drag may end outside the chart.
    window.addEventListener('pointerup', this.checkAutoScale);
    container.addEventListener('dblclick', this.checkAutoScale);
  }

  /** Replace the displayed bars (oldest first, as the API returns them). */
  setBars(
    bars: readonly Bar[],
    { decimals, hasVolume, resetView, timeZone = DISPLAY_TIME_ZONE }: SetBarsOptions,
  ): void {
    const shift = resetView ? 0 : prependedCount(this.bars, bars);
    const before = shift > 0 ? this.chart.timeScale().getVisibleLogicalRange() : null;

    this.bars = bars;
    this.barTimes = bars.map((bar) => barSeconds(bar.time));
    this.decimals = decimals;
    this.hasVolume = hasVolume;
    this.times = chartTimes(bars, timeZone);
    // Intraday bars need the time of day on the axis; daily and longer bars show dates only.
    this.chart.applyOptions({ timeScale: { timeVisible: hasIntradayTimes(bars) } });
    this.renderMain();

    this.volume.applyOptions({ visible: hasVolume });
    this.renderVolume();

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
    this.lastLines = all;
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
    const left: HTMLElement[] = [];
    for (const [key, entry] of this.lines) {
      const line = keep.get(key);
      if (line !== undefined && line.plot === entry.plot && line.ownPane === entry.ownPane)
        continue;
      const element = entry.ownPane ? entry.series.getPane().getHTMLElement() : null;
      if (element !== null) left.push(element);
      this.chart.removeSeries(entry.series);
      this.lines.delete(key);
    }
    this.removeEmptyPanes();
    const panes = new Set(this.chart.panes().map((pane) => pane.getHTMLElement()));
    for (const element of left) if (!panes.has(element)) this.paneObserver?.unobserve(element);

    for (const line of lines) {
      const entry = this.lines.get(line.key) ?? this.addLine(line);
      const volumeScale = line.style.price_scale === 'volume';
      const format =
        volumeScale || line.style.format === 'volume'
          ? { type: 'volume' as const }
          : { type: 'price' as const, ...priceFormat(this.decimals) };
      entry.series.applyOptions({
        color: line.color,
        // A volume-scale line has nothing to follow on a symbol without volume (forex, indices).
        visible: line.visible && (this.hasVolume || !volumeScale),
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
      this.setLevelFill(entry, line);
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
      levelFill: null,
      levelFillKey: '',
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

  /** Shade the band between two levels (RSI 30–70) behind the line, across the loaded bars. */
  private setLevelFill(entry: LineEntry, line: IndicatorLine): void {
    const band = line.levelFill;
    const key =
      band === null
        ? ''
        : `${band.join(',')}|${String(this.times.length)}|${line.color}|${String(line.visible)}`;
    if (key === entry.levelFillKey) return;
    entry.levelFillKey = key;
    if (band === null) {
      if (entry.levelFill !== null) entry.series.detachPrimitive(entry.levelFill);
      entry.levelFill = null;
      return;
    }
    if (entry.levelFill === null) {
      entry.levelFill = new BandFill();
      entry.series.attachPrimitive(entry.levelFill);
    }
    const [low, high] = band;
    entry.levelFill.set(
      this.times.map(() => high),
      this.times.map(() => low),
      withAlpha(line.color, LEVEL_FILL_ALPHA),
      line.visible,
    );
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
    this.chartType = type;
    this.recreateMain();
  }

  /** Repaint with another theme (light/dark), keeping data and viewport. */
  setTheme(theme: ChartTheme): void {
    this.theme = theme;
    this.chart.applyOptions(themeOptions(theme));
    this.recreateMain();
    this.renderVolume();
    // Level lines take their colour from the theme: redraw them (indicator data stays as is).
    for (const entry of this.lines.values()) entry.levels = '';
    this.setIndicatorLines(this.lastLines);
  }

  /** Volume bars coloured by candle direction (the colours come from the theme). */
  private renderVolume(): void {
    this.volume.setData(
      this.hasVolume
        ? withTime(
            toVolume(
              this.bars,
              this.times,
              withAlpha(this.theme.up, VOLUME_ALPHA),
              withAlpha(this.theme.down, VOLUME_ALPHA),
            ),
          )
        : [],
    );
  }

  private recreateMain(): void {
    this.markers?.detach();
    this.markers = null;
    this.chart.removeSeries(this.main);
    this.main = this.createMainSeries(this.chartType);
    this.main.attachPrimitive(this.drawingLayer);
    this.renderMain();
    this.renderMarkers();
  }

  /** Price-axis mode (normal, logarithmic, percent) and auto-fit. */
  setScale({ mode, autoScale }: ScaleOptions): void {
    this.chart.priceScale('right').applyOptions({ mode: SCALE_MODES[mode], autoScale });
    this.autoScale = this.chart.priceScale('right').options().autoScale;
  }

  /** Call `listener` when the user changes auto-fit on the price axis itself. */
  onAutoScaleChange(listener: (autoScale: boolean) => void): () => void {
    this.autoScaleListeners.add(listener);
    return () => {
      this.autoScaleListeners.delete(listener);
    };
  }

  /** The chart as an image (panes, axes, drawings; no crosshair). */
  snapshot(): HTMLCanvasElement {
    return this.chart.takeScreenshot();
  }

  /** Back to the opening view: the latest bars and an auto-fitted price axis. */
  resetView(): void {
    if (this.bars.length > 0) {
      this.chart.timeScale().setVisibleLogicalRange(initialRange(this.bars.length));
    }
    this.chart.priceScale('right').applyOptions({ autoScale: true });
    this.checkAutoScale();
  }

  /** Price at `y` px from the top of the chart, or null below the price pane. */
  priceAt(y: number): number | null {
    if (y < 0 || y > (this.chart.panes()[0]?.getHeight() ?? 0)) return null;
    return this.main.coordinateToPrice(y);
  }

  /** Show these drawings (plus the one being drawn) on the price pane. */
  setDrawings(view: DrawingView): void {
    this.drawingLayer.set(view);
  }

  /** Pixel position (price pane, CSS px) of a drawing anchor; null without bars. */
  project(anchor: Anchor): Point | null {
    const logical = timeToLogical(this.barTimes, anchor.time);
    if (Number.isNaN(logical)) return null;
    const x = logicalToX(logical, (i) => this.chart.timeScale().logicalToCoordinate(i as Logical));
    const y = this.main.priceToCoordinate(anchor.price);
    return x === null || y === null ? null : { x, y };
  }

  /** The anchor under a pixel of the price pane, with its bar index; null without bars. */
  unproject(point: Point): { anchor: Anchor; logical: number } | null {
    const logical = this.chart.timeScale().coordinateToLogical(point.x);
    const price = this.main.coordinateToPrice(point.y);
    if (logical === null || price === null || this.barTimes.length === 0) return null;
    return { anchor: { time: logicalToTime(this.barTimes, logical), price }, logical };
  }

  /** The bar at a logical index (for the magnet), if loaded. */
  barAt(logical: number): Bar | undefined {
    return this.bars[Math.round(logical)];
  }

  /** Bars from anchor `a` to anchor `b`, and the volume of the bars they cover. */
  span(a: Anchor, b: Anchor): Span | null {
    const from = timeToLogical(this.barTimes, a.time);
    const to = timeToLogical(this.barTimes, b.time);
    if (Number.isNaN(from) || Number.isNaN(to)) return null;
    const volume = this.hasVolume ? (i: number) => this.bars[i]?.volume ?? 0 : null;
    return spanBetween(from, to, volume);
  }

  /** Pixel y of a price on the price pane. */
  priceToY(price: number): number | null {
    return this.main.priceToCoordinate(price);
  }

  /** Size of the price pane's plot area in CSS px. */
  paneSize(): { width: number; height: number } {
    return {
      width: this.chart.timeScale().width(),
      height: this.chart.panes()[0]?.getHeight() ?? 0,
    };
  }

  /** Let the chart pan and zoom with the mouse, or not (while a drawing is drawn or dragged). */
  setPanZoom(enabled: boolean): void {
    this.chart.applyOptions({ handleScroll: enabled, handleScale: enabled });
  }

  /** The element the chart draws in (drawing interaction listens on it). */
  element(): HTMLElement {
    return this.container;
  }

  /** Scroll to the latest bar, keeping the zoom. */
  scrollToLatest(): void {
    this.chart.timeScale().scrollToRealTime();
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
    this.autoScaleListeners.clear();
    window.removeEventListener('pointerup', this.checkAutoScale);
    this.container.removeEventListener('dblclick', this.checkAutoScale);
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
