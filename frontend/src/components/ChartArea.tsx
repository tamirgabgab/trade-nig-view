import { ChevronsRight } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBarHistory } from '../api/bars.ts';
import { useSymbols } from '../api/market.ts';
import { transformFor } from '../chart/chartTypes.ts';
import type { PaneLayout } from '../chart/ChartEngine.ts';
import type { LogicalRange } from '../chart/seriesData.ts';
import { barSeconds, logicalRangeFrom, RANGE_INTERVAL, rangeStart } from '../chart/visibleRange.ts';
import { DEFAULT_SYMBOL, useChartStore } from '../store/chartStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useThemeStore } from '../store/themeStore.ts';
import { EMPHASIS_MS, useUiStore, type SnapshotMode } from '../store/uiStore.ts';
import { readChartTheme } from '../chart/theme.ts';
import { formatPrice } from './formatNumber.ts';
import { copyImage, downloadImage, snapshotFileName, withTitleBand } from './snapshot.ts';
import styles from './ChartArea.module.css';
import { ChartView, type FocusRequest } from './ChartView.tsx';
import { IconButton } from './IconButton.tsx';
import { IndicatorLegend } from './IndicatorLegend.tsx';
import { IndicatorSettingsPanel } from './IndicatorSettingsPanel.tsx';
import { ChartContextMenu } from './ChartContextMenu.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { LegendOHLC } from './LegendOHLC.tsx';
import { MarketStatus } from './MarketStatus.tsx';
import { legendValues } from './legendValues.ts';
import { presentLines } from './presentLines.ts';
import { Toast } from './Toast.tsx';
import { usePresence } from './usePresence.ts';
import { useChartIndicators } from './useChartIndicators.ts';
import { useDelayedFlag } from './useDelayedFlag.ts';

// Markdown + KaTeX load with the first learn page, not with the chart.
const LearnDrawer = lazy(() =>
  import('./LearnDrawer.tsx').then((m) => ({ default: m.LearnDrawer })),
);

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
  const [paneLayout, setPaneLayout] = useState<PaneLayout>({});
  const setAutoScale = useChartStore((s) => s.setAutoScale);
  const learn = usePresence(useUiStore((s) => s.learnFor));
  const [command, setCommand] = useState<{ seq: number; kind: 'latest' | 'reset' } | null>(null);
  const runCommand = (kind: 'latest' | 'reset') => {
    setCommand((c) => ({ seq: (c?.seq ?? 0) + 1, kind }));
  };
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; price: number | null } | null>(null);
  const contextMenu = usePresence(menuAt);
  // Stable: ActionMenu re-subscribes its click-away listener when onClose changes.
  const closeContextMenu = useCallback(() => {
    setMenuAt(null);
  }, []);
  const confirmClear = useUiStore((s) => s.confirmRemoveAll);
  const setConfirmClear = useUiStore((s) => s.setConfirmRemoveAll);
  const forgetIndicator = useUiStore((s) => s.forgetIndicator);
  const removeAll = useIndicatorStore((s) => s.removeAll);
  const restoreAll = useIndicatorStore((s) => s.restoreAll);
  const [offLatest, setOffLatest] = useState(false);
  // Until the first indicator is ever added (uids are never reused, so seq counts additions).
  const firstRun = useIndicatorStore((s) => s.seq === 0);
  const theme = useThemeStore((s) => s.theme);
  const legendFocus = useUiStore((s) => s.legendFocus);
  const emphasis = useUiStore((s) => s.emphasis);
  const setEmphasis = useUiStore((s) => s.setEmphasis);
  useEffect(() => {
    if (emphasis === null) return;
    const timer = window.setTimeout(() => {
      setEmphasis(null);
    }, EMPHASIS_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [emphasis, setEmphasis]);

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

  // Chart image: the title band names the symbol and its latest bar (read when the image comes).
  const snapshot = useUiStore((s) => s.snapshot);
  const showToast = useUiStore((s) => s.showToast);
  const snapshotText = useRef({ title: '', detail: '', file: '' });
  useEffect(() => {
    const last = legendValues(bars, null);
    const ohlc =
      last === null
        ? ''
        : `O ${formatPrice(last.open, decimals)}  H ${formatPrice(last.high, decimals)}  L ${formatPrice(last.low, decimals)}  C ${formatPrice(last.close, decimals)}`;
    snapshotText.current = {
      title: [info?.display ?? shownSymbol, info?.name, shownInterval, info?.exchange]
        .filter(Boolean)
        .join(' · '),
      detail: [ohlc, typeof last?.time === 'string' ? last.time : ''].filter(Boolean).join('   '),
      file: snapshotFileName(info?.display ?? shownSymbol, shownInterval, new Date()),
    };
  });
  const onSnapshot = useCallback(
    (image: HTMLCanvasElement, mode: SnapshotMode) => {
      const { title, detail, file } = snapshotText.current;
      const out = withTitleBand(image, title, detail, readChartTheme());
      const done =
        mode === 'copy'
          ? copyImage(out).then(() => 'Chart image copied')
          : downloadImage(out, file).then(() => `Chart saved as ${file}`);
      done.then(
        (message) => {
          showToast(message);
        },
        (error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          showToast(`Could not ${mode === 'copy' ? 'copy' : 'save'} the chart image (${reason})`);
        },
      );
    },
    [showToast],
  );
  const onVisibleRangeChange = useCallback((range: LogicalRange | null) => {
    const h = latest.current;
    if (range !== null && range.from < LOAD_OLDER_THRESHOLD && h.hasOlder && !h.isLoadingOlder) {
      h.loadOlder();
    }
    setOffLatest(range !== null && range.to < h.bars.length - 1);
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

  // Indicators are computed over exactly the loaded bars. While another data set loads, the
  // previous values stay on the previous bars (series = null pauses the queries).
  const series = useMemo(
    () =>
      history.isLoading || data === undefined
        ? null
        : { symbol: data.symbol, interval: data.interval, adjusted: data.adjusted, transform },
    [history.isLoading, data, transform],
  );
  const indicators = useChartIndicators(series, bars);
  const shownLines = useMemo(
    () => presentLines(indicators.lines, legendFocus, emphasis),
    [indicators.lines, legendFocus, emphasis],
  );
  // Oscillators get their own pane and a legend at its top; the rest are listed over the price.
  const priceViews = indicators.views.filter((view) => view.spec?.overlay !== false);
  const paneViews = indicators.views.filter((view) => view.spec?.overlay === false);

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
        badge={info && <MarketStatus info={info} compact />}
        flashKey={
          // Not while another data set loads (the old bars are still shown): no false flash.
          hoverIndex === null && !history.isLoading
            ? `${shownSymbol}|${shownInterval}|${String(adjusted)}|${chartType}`
            : null
        }
      >
        <IndicatorLegend
          views={priceViews}
          hoverIndex={hoverIndex}
          barCount={bars.length}
          decimals={decimals}
        />
        {firstRun && bars.length > 0 && (
          <p className={styles.hint}>
            Press <kbd>/</kbd> to add an indicator
          </p>
        )}
      </LegendOHLC>
      {paneViews.map((view) => {
        const top = paneLayout[view.instance.uid];
        return top === undefined ? null : (
          <div key={view.instance.uid} className={styles.paneLegend} style={{ top }}>
            <IndicatorLegend
              views={[view]}
              hoverIndex={hoverIndex}
              barCount={bars.length}
              decimals={decimals}
              label={`${view.label} pane`}
            />
          </div>
        );
      })}
      <ChartView
        bars={bars}
        decimals={decimals}
        hasVolume={hasVolume}
        viewKey={`${shownSymbol}|${shownInterval}`}
        chartType={chartType}
        scaleMode={scaleMode}
        autoScale={autoScale}
        focus={focus}
        lines={shownLines}
        onHover={setHoverIndex}
        onVisibleRangeChange={onVisibleRangeChange}
        onPaneLayout={setPaneLayout}
        onAutoScaleChange={setAutoScale}
        command={command}
        onContextMenu={setMenuAt}
        theme={theme}
        snapshot={snapshot}
        onSnapshot={onSnapshot}
      />
      {offLatest && (
        <IconButton
          className={styles.latest}
          label="Scroll to the latest bar"
          icon={<ChevronsRight size={18} />}
          tooltipSide="left"
          onClick={() => {
            runCommand('latest');
          }}
        />
      )}
      {contextMenu.shown !== null && (
        <ChartContextMenu
          at={contextMenu.shown}
          decimals={decimals}
          attrs={contextMenu.attrs}
          onClose={closeContextMenu}
          onResetView={() => {
            runCommand('reset');
          }}
          onRemoveAll={() => {
            setConfirmClear(true);
          }}
        />
      )}
      {confirmClear && (
        <ConfirmDialog
          title="Remove all indicators?"
          message={`This removes ${indicators.views.map((v) => v.label).join(', ')} from the chart, with their settings.`}
          confirmLabel={`Remove ${String(indicators.views.length)} indicator${indicators.views.length === 1 ? '' : 's'}`}
          onCancel={() => {
            setConfirmClear(false);
          }}
          onConfirm={() => {
            setConfirmClear(false);
            forgetIndicator();
            const removed = removeAll();
            const n = removed.length;
            showToast(`Removed ${String(n)} indicator${n === 1 ? '' : 's'}`, () => {
              restoreAll(removed);
            });
          }}
        />
      )}
      <IndicatorSettingsPanel views={indicators.views} />
      <Toast />
      {learn.shown !== null && (
        <Suspense fallback={null}>
          <LearnDrawer
            key={learn.key}
            views={indicators.views}
            learnFor={learn.shown}
            attrs={learn.attrs}
          />
        </Suspense>
      )}
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
