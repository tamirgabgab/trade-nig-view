import { memo, useEffect, useRef } from 'react';

import type { Bar } from '../api/bars.ts';
import { ChartEngine, type IndicatorLine } from '../chart/ChartEngine.ts';
import type { ChartType, ScaleMode } from '../chart/chartTypes.ts';
import type { LogicalRange } from '../chart/seriesData.ts';
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
}: ChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const shownKeyRef = useRef<string | null>(null);
  const focusSeqRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const engine = new ChartEngine(container);
    const offHover = engine.onCrosshairMove(onHover);
    const offRange = engine.onVisibleRangeChange(onVisibleRangeChange);
    engineRef.current = engine;
    return () => {
      offHover();
      offRange();
      engine.dispose();
      engineRef.current = null;
      shownKeyRef.current = null;
    };
  }, [onHover, onVisibleRangeChange]);

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

  // After the bars: line values are matched to the bars by index.
  useEffect(() => {
    engineRef.current?.setIndicatorLines(lines);
  }, [lines, bars]);

  useEffect(() => {
    engineRef.current?.setScale({ mode: scaleMode, autoScale });
  }, [scaleMode, autoScale]);

  // Each focus request is applied once (a new object with the same `seq` is ignored).
  useEffect(() => {
    const engine = engineRef.current;
    if (focus === null || engine === null || focus.seq === focusSeqRef.current) return;
    engine.setVisibleRange(focus.range);
    focusSeqRef.current = focus.seq;
  }, [focus]);

  return <div ref={containerRef} className={styles.canvas} data-testid="chart-canvas" />;
});
