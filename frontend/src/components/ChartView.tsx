import { memo, useEffect, useRef } from 'react';

import type { Bar } from '../api/bars.ts';
import { ChartEngine } from '../chart/ChartEngine.ts';
import styles from './ChartArea.module.css';

interface ChartViewProps {
  bars: readonly Bar[];
  decimals: number;
  hasVolume: boolean;
  /** Identifies the data set (symbol + interval). A new key resets the view to the latest bars. */
  viewKey: string;
  /** Bar index under the crosshair, or null when it is off the data. Must be a stable function. */
  onHover: (index: number | null) => void;
}

/** Hosts one ChartEngine in a div. Re-renders only when its props change (memo). */
export const ChartView = memo(function ChartView({
  bars,
  decimals,
  hasVolume,
  viewKey,
  onHover,
}: ChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const shownKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const engine = new ChartEngine(container);
    const unsubscribe = engine.onCrosshairMove(onHover);
    engineRef.current = engine;
    return () => {
      unsubscribe();
      engine.dispose();
      engineRef.current = null;
      shownKeyRef.current = null;
    };
  }, [onHover]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    engine.setBars(bars, { decimals, hasVolume, resetView: shownKeyRef.current !== viewKey });
    // Mark the data set as shown only once it has bars: the empty placeholder before the first
    // response must not consume the reset, or the chart would open on the oldest bars.
    if (bars.length > 0) shownKeyRef.current = viewKey;
  }, [bars, decimals, hasVolume, viewKey]);

  return <div ref={containerRef} className={styles.canvas} data-testid="chart-canvas" />;
});
