import type { ForecastView } from '../chart/forecastLayer.ts';
import type { GapZone } from '../chart/gapLayer.ts';
import type { SignalMark } from '../chart/signalMarkers.ts';
import type { Anchor, DrawingView, Point } from '../drawings/types.ts';
/**
 * Test double for chart/ChartEngine.ts (jsdom has no canvas). Use with
 * `vi.mock('../chart/ChartEngine.ts', () => import('../test/fakeChartEngine.ts'))`.
 */
import type { Bar } from '../api/bars.ts';
import type {
  ChartDisplay,
  ChartPointer,
  CompareBars,
  CrosshairListener,
  IndicatorLine,
  PaneLayout,
  PaneLayoutListener,
  PointerListener,
  ScaleOptions,
  SetBarsOptions,
  VisibleRangeListener,
} from '../chart/ChartEngine.ts';
import type { ChartType } from '../chart/chartTypes.ts';
import type { LogicalRange } from '../chart/seriesData.ts';

export const engines: FakeChartEngine[] = [];

export class FakeChartEngine {
  readonly calls: { bars: readonly Bar[]; options: SetBarsOptions }[] = [];
  readonly chartTypes: ChartType[] = [];
  readonly scales: ScaleOptions[] = [];
  readonly ranges: LogicalRange[] = [];
  readonly lineCalls: (readonly IndicatorLine[])[] = [];
  disposed = false;
  private listener: CrosshairListener | null = null;
  private rangeListener: VisibleRangeListener | null = null;
  private paneListener: PaneLayoutListener | null = null;

  constructor() {
    engines.push(this);
  }

  setBars(bars: readonly Bar[], options: SetBarsOptions): void {
    this.calls.push({ bars, options });
  }

  setIndicatorLines(lines: readonly IndicatorLine[]): void {
    this.lineCalls.push(lines);
  }

  /** Lines of the latest `setIndicatorLines` call. */
  get lines(): readonly IndicatorLine[] {
    return this.lineCalls.at(-1) ?? [];
  }

  setChartType(type: ChartType): void {
    this.chartTypes.push(type);
  }

  setScale(options: ScaleOptions): void {
    this.scales.push(options);
  }

  stretches: Readonly<Record<string, number>> = {};

  visibleLogicalRange(): LogicalRange | null {
    return this.ranges.at(-1) ?? null;
  }

  paneStretches(): Record<string, number> {
    return { ...this.stretches };
  }

  setPaneStretches(stretches: Readonly<Record<string, number>>): void {
    this.stretches = stretches;
  }

  setVisibleRange(range: LogicalRange): void {
    this.ranges.push(range);
  }

  onCrosshairMove(listener: CrosshairListener): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  compare: readonly CompareBars[] = [];

  setCompare(compare: readonly CompareBars[]): void {
    this.compare = compare;
  }

  pointerListener: PointerListener | null = null;
  clickListener: ((at: ChartPointer) => void) | null = null;

  onPointer(listener: PointerListener): () => void {
    this.pointerListener = listener;
    return () => {
      this.pointerListener = null;
    };
  }

  onClick(listener: (at: ChartPointer) => void): () => void {
    this.clickListener = listener;
    return () => {
      this.clickListener = null;
    };
  }

  onVisibleRangeChange(listener: VisibleRangeListener): () => void {
    this.rangeListener = listener;
    return () => {
      this.rangeListener = null;
    };
  }

  autoScaleListener: ((autoScale: boolean) => void) | null = null;
  scrolledToLatest = 0;

  onPaneLayout(listener: PaneLayoutListener): () => void {
    this.paneListener = listener;
    return () => {
      this.paneListener = null;
    };
  }

  onAutoScaleChange(listener: (autoScale: boolean) => void): () => void {
    this.autoScaleListener = listener;
    return () => {
      this.autoScaleListener = null;
    };
  }

  /** Simulate the user dragging (false) or double-clicking (true) the price axis. */
  emitAutoScale(autoScale: boolean): void {
    this.autoScaleListener?.(autoScale);
  }

  themes = 0;
  /** Last drawings shown, and the pan/zoom switch (drawing interaction). */
  drawingView: DrawingView | null = null;
  panZoom = true;
  private readonly host = document.createElement('div');

  element(): HTMLElement {
    return this.host;
  }

  /** 10 px per bar from x = 0 and 1 px per price unit down from y = 200 (bar times: 1, 2, 3…). */
  project(anchor: Anchor): Point | null {
    return { x: (anchor.time - 1) * 10, y: 200 - anchor.price };
  }

  unproject(point: Point): { anchor: Anchor; logical: number } | null {
    const logical = point.x / 10;
    return { anchor: { time: Math.round(logical + 1), price: 200 - point.y }, logical };
  }

  barAt(): undefined {
    return undefined;
  }

  priceToY(price: number): number {
    return 200 - price;
  }

  paneSize(): { width: number; height: number } {
    return { width: 800, height: 400 };
  }

  setPanZoom(enabled: boolean): void {
    this.panZoom = enabled;
  }

  setDrawings(view: DrawingView): void {
    this.drawingView = view;
  }

  gapZones: readonly GapZone[] = [];
  shownBar: number | null = null;

  replayPick: number | null = null;

  /** Bar under a pointer: one bar per 10 px from the left edge. */
  barIndexAtClientX(clientX: number): number | null {
    const bars = this.calls.at(-1)?.bars ?? [];
    return bars.length === 0 ? null : Math.min(Math.floor(clientX / 10), bars.length - 1);
  }

  setReplayPick(index: number | null): void {
    this.replayPick = index;
  }

  setGaps(zones: readonly GapZone[]): void {
    this.gapZones = zones;
  }

  signals: readonly SignalMark[] = [];

  setSignals(marks: readonly SignalMark[]): void {
    this.signals = marks;
  }

  forecast: ForecastView | null = null;

  setForecast(view: ForecastView | null): void {
    this.forecast = view;
  }

  showBar(index: number): void {
    this.shownBar = index;
  }

  snapshot(): HTMLCanvasElement {
    return document.createElement('canvas');
  }

  display: ChartDisplay | null = null;

  setDisplay(display: ChartDisplay): void {
    this.display = display;
  }

  setTheme(): void {
    this.themes += 1;
  }

  resets = 0;

  resetView(): void {
    this.resets += 1;
  }

  priceAt(y: number): number | null {
    return y < 100 ? 200 - y : null;
  }

  scrollToLatest(): void {
    this.scrolledToLatest += 1;
  }

  dispose(): void {
    this.disposed = true;
  }

  /** Simulate the indicator panes being laid out with these tops. */
  layoutPanes(layout: PaneLayout): void {
    this.paneListener?.(layout);
  }

  /** Simulate the crosshair moving onto bar `index` (null = off the data). */
  hover(index: number | null): void {
    this.listener?.(index);
  }

  /** Simulate the user scrolling or zooming to `range`. */
  scrollTo(range: LogicalRange | null): void {
    this.rangeListener?.(range);
  }
}

/** The live (not disposed) engine; fails if there is none. */
export function liveEngine(): FakeChartEngine {
  const engine = engines.filter((e) => !e.disposed).at(-1);
  if (engine === undefined) throw new Error('No live chart engine');
  return engine;
}

export { FakeChartEngine as ChartEngine };
