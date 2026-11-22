import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBarHistory } from '../api/bars.ts';
import { useSymbols } from '../api/market.ts';
import { transformFor } from '../chart/chartTypes.ts';
import type { LogicalRange } from '../chart/seriesData.ts';
import { barSeconds, logicalRangeFrom, RANGE_INTERVAL, rangeStart } from '../chart/visibleRange.ts';
import { DEFAULT_SYMBOL, useChartStore } from '../store/chartStore.ts';
import styles from './ChartArea.module.css';
import { ChartView, type FocusRequest } from './ChartView.tsx';
import { LegendOHLC } from './LegendOHLC.tsx';
import { legendValues } from './legendValues.ts';
import { useDelayedFlag } from './useDelayedFlag.ts';

interface ChartAreaProps {
  className?: string | undefined;
}

const DEFAULT_DECIMALS = 2;
/** Load the next older page when fewer than this many bars are left of the viewport. */
export const LOAD_OLDER_THRESHOLD = 50;
/** Loaders: nothing for fast loads, a thin progress bar after this delay, a skeleton after 1 s. */
const PROGRESS_DELAY_MS = 150;
const SKELETON_DELAY_MS = 1000;

/** Chart region: the selected symbol's chart (type, scale, range from the store) and its legend. */
export function ChartArea({ className }: ChartAreaProps) {
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const chartType = useChartStore((s) => s.chartType);
  const scaleMode = useChartStore((s) => s.scaleMode);
  const autoScale = useChartStore((s) => s.autoScale);
  const adjusted = useChartStore((s) => s.adjusted);
  const rangeRequest = useChartStore((s) => s.rangeRequest);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const symbols = useSymbols().data;
  const transform = transformFor(chartType);
  const history = useBarHistory({ symbol, interval, adjusted, transform });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const data = history.data;
  const bars = history.bars;
  const shownSymbol = data?.symbol ?? symbol;
  const shownInterval = data?.interval ?? interval;
  const info = symbols?.find((s) => s.symbol === shownSymbol);
  const selected = symbols?.find((s) => s.symbol === symbol);
  const decimals = info?.decimals ?? DEFAULT_DECIMALS;
  const hasVolume = info?.hasVolume ?? true;
  const name = selected?.display ?? symbol;

  // A symbol remembered from an older universe (renamed or removed) falls back to the default.
  useEffect(() => {
    if (symbols === undefined || symbols.length === 0) return;
    if (symbols.some((s) => s.symbol === symbol)) return;
    setSymbol(symbols.find((s) => s.symbol === DEFAULT_SYMBOL)?.symbol ?? symbols[0]?.symbol ?? '');
  }, [symbols, symbol, setSymbol]);

  // Scrolling near the oldest loaded bar fetches the page before it. The handler must be stable
  // (ChartView re-creates the chart when it changes), so it reads the latest state from a ref.
  const latest = useRef(history);
  useEffect(() => {
    latest.current = history;
  });
  const onVisibleRangeChange = useCallback((range: LogicalRange | null) => {
    const h = latest.current;
    if (range !== null && range.from < LOAD_OLDER_THRESHOLD && h.hasOlder && !h.isLoadingOlder) {
      h.loadOlder();
    }
  }, []);

  // Range buttons: once bars of the range's interval are in, load older pages until the range's
  // start is covered (or history ends), then show it. The focus is derived from the loaded bars;
  // ChartView applies each request `seq` once, so later paging does not move the view again.
  const times = useMemo(() => bars.map((bar) => barSeconds(bar.time)), [bars]);
  const rangeTarget = useMemo(() => {
    if (rangeRequest === null || history.isLoading || data === undefined) return null;
    if (data.symbol !== symbol || data.interval !== RANGE_INTERVAL[rangeRequest.id]) return null;
    const start = rangeStart(rangeRequest.id, times);
    return { start, covered: (times[0] ?? 0) <= start || !history.hasOlder };
  }, [rangeRequest, history.isLoading, history.hasOlder, data, symbol, times]);
  useEffect(() => {
    const h = latest.current;
    if (rangeTarget !== null && !rangeTarget.covered && !h.isLoadingOlder) h.loadOlder();
  }, [rangeTarget, history.isLoadingOlder]);
  const focus = useMemo<FocusRequest | null>(
    () =>
      rangeRequest !== null && rangeTarget?.covered === true
        ? { range: logicalRangeFrom(times, rangeTarget.start), seq: rangeRequest.seq }
        : null,
    [rangeRequest, rangeTarget, times],
  );

  const showProgress = useDelayedFlag(
    history.isLoading || history.isLoadingOlder,
    PROGRESS_DELAY_MS,
  );
  const showSkeleton = useDelayedFlag(history.isLoading && bars.length === 0, SKELETON_DELAY_MS);

  let status: string | undefined;
  if (history.isLoading) {
    status = `Loading ${name}…`;
  } else if (data?.stale) {
    status = 'Cached data (refresh failed)';
  }

  return (
    <main
      className={[styles.area, className].join(' ')}
      aria-label="Chart"
      aria-busy={history.isLoading}
    >
      {showProgress && (
        <div
          className={styles.progress}
          role="progressbar"
          aria-label={history.isLoadingOlder ? 'Loading older bars' : `Loading ${name}`}
        />
      )}
      <LegendOHLC
        title={info?.name ?? shownSymbol}
        interval={shownInterval}
        exchange={info?.exchange ?? ''}
        values={legendValues(bars, hoverIndex)}
        decimals={decimals}
        hasVolume={hasVolume}
        status={status}
      />
      <ChartView
        bars={bars}
        decimals={decimals}
        hasVolume={hasVolume}
        viewKey={`${shownSymbol}|${shownInterval}`}
        chartType={chartType}
        scaleMode={scaleMode}
        autoScale={autoScale}
        focus={focus}
        onHover={setHoverIndex}
        onVisibleRangeChange={onVisibleRangeChange}
      />
      {history.isLoadingOlder && (
        <p className={styles.olderPill} role="status">
          Loading older bars…
        </p>
      )}
      {showSkeleton && (
        <div className={styles.skeleton} aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} style={{ height: `${String(30 + ((i * 37) % 45))}%` }} />
          ))}
        </div>
      )}
      {history.isError && (
        <div className={styles.overlay} role="alert">
          <p className={styles.overlayTitle}>
            Could not load {name} ({interval})
          </p>
          <p className={styles.overlayText}>{history.error?.message}</p>
          <button type="button" className={styles.retry} onClick={history.refetch}>
            Try again
          </button>
        </div>
      )}
      {data !== undefined && bars.length === 0 && !history.isError && !history.isLoading && (
        <div className={styles.overlay}>
          <p className={styles.overlayTitle}>No bars for {name}</p>
        </div>
      )}
    </main>
  );
}
