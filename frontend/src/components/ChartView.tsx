import { memo, useEffect, useRef } from 'react';

import type { Bar } from '../api/bars.ts';
import { ChartEngine, type IndicatorLine, type PaneLayoutListener } from '../chart/ChartEngine.ts';
import type { ChartType, ScaleMode } from '../chart/chartTypes.ts';
import type { LogicalRange } from '../chart/seriesData.ts';
import { readChartTheme } from '../chart/theme.ts';
import type { SnapshotMode } from '../store/uiStore.ts';
import styles from './ChartArea.module.css';

/** A viewport the chart should jump to; `seq` changes on every request (same range re-applies). */
export interface FocusRequest {
  range: LogicalRange;
  seq: number;
}

interface ChartViewProps {
  bars: readonly Bar[];
  decimals: number;
  hasVolume: boolean;
  /** Identifies the data set (symbol + interval + settings). A new key resets the view. */
  viewKey: string;
  chartType: ChartType;
  scaleMode: ScaleMode;
  autoScale: boolean;
  focus: FocusRequest | null;
  /** Indicator lines, values aligned with `bars`. */
  lines: readonly IndicatorLine[];
  /** Bar index under the crosshair, or null when it is off the data. Must be a stable function. */
  onHover: (index: number | null) => void;
  /** Visible logical range after every scroll or zoom. Must be a stable function. */
  onVisibleRangeChange: (range: LogicalRange | null) => void;
  /** Tops of the indicator panes whenever they move. Must be a stable function. */
  onPaneLayout: PaneLayoutListener;
  /** Auto-fit turned off or on from the price axis (drag, double-click). Must be stable. */
  onAutoScaleChange: (autoScale: boolean) => void;
  /** Bumped to scroll to the latest bar (0 = never asked). */
  scrollToLatest: number;
  /** UI theme: a change repaints the chart from the CSS tokens. */
  theme: string;
  /** Each new request (by `seq`) calls `onSnapshot` once with the chart image. */
  snapshot: { seq: number; mode: SnapshotMode } | null;
  /** Must be a stable function. */
  onSnapshot: (image: HTMLCanvasElement, mode: SnapshotMode) => void;
}

/** Hosts one ChartEngine in a div. Re-renders only when its props change (memo). */
export const ChartView = memo(function ChartView({
  bars,
  decimals,
  hasVolume,
  viewKey,
  chartType,
  scaleMode,
  autoScale,
  focus,
  lines,
  onHover,
  onVisibleRangeChange,
  onPaneLayout,
  onAutoScaleChange,
  scrollToLatest,
  theme,
  snapshot,
  onSnapshot,
}: ChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const shownKeyRef = useRef<string | null>(null);
  const focusSeqRef = useRef<number | null>(null);
  const themeRef = useRef(theme);
  const snapshotSeqRef = useRef(snapshot?.seq ?? 0);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const engine = new ChartEngine(container);
    const offHover = engine.onCrosshairMove(onHover);
    const offRange = engine.onVisibleRangeChange(onVisibleRangeChange);
    const offPanes = engine.onPaneLayout(onPaneLayout);
    const offAutoScale = engine.onAutoScaleChange(onAutoScaleChange);
    engineRef.current = engine;
    return () => {
      offHover();
      offRange();
      offPanes();
      offAutoScale();
      engine.dispose();
      engineRef.current = null;
      shownKeyRef.current = null;
    };
  }, [onHover, onVisibleRangeChange, onPaneLayout, onAutoScaleChange]);

  // Chart type first, so the bars below are drawn once with the right series.
  useEffect(() => {
    engineRef.current?.setChartType(chartType);
  }, [chartType]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    engine.setBars(bars, { decimals, hasVolume, resetView: shownKeyRef.current !== viewKey });
    // Mark the data set as shown only once it has bars: the empty placeholder before the first
    // response must not consume the reset, or the chart would open on the oldest bars.
    if (bars.length > 0) shownKeyRef.current = viewKey;
  }, [bars, decimals, hasVolume, viewKey]);

  // The engine reads the theme when created; repaint only when it changes.
  useEffect(() => {
    if (theme === themeRef.current) return;
    themeRef.current = theme;
    engineRef.current?.setTheme(readChartTheme());
  }, [theme]);

  // After the bars (and a theme repaint): line values are matched to the bars by index.
  useEffect(() => {
    engineRef.current?.setIndicatorLines(lines);
  }, [lines, bars, theme]);

  useEffect(() => {
    engineRef.current?.setScale({ mode: scaleMode, autoScale });
  }, [scaleMode, autoScale]);

  useEffect(() => {
    if (scrollToLatest > 0) engineRef.current?.scrollToLatest();
  }, [scrollToLatest]);

  useEffect(() => {
    const engine = engineRef.current;
    if (snapshot === null || engine === null || snapshot.seq === snapshotSeqRef.current) return;
    snapshotSeqRef.current = snapshot.seq;
    onSnapshot(engine.snapshot(), snapshot.mode);
  }, [snapshot, onSnapshot]);

  // Each focus request is applied once (a new object with the same `seq` is ignored).
  useEffect(() => {
    const engine = engineRef.current;
    if (focus === null || engine === null || focus.seq === focusSeqRef.current) return;
    engine.setVisibleRange(focus.range);
    focusSeqRef.current = focus.seq;
  }, [focus]);

  return <div ref={containerRef} className={styles.canvas} data-testid="chart-canvas" />;
});
