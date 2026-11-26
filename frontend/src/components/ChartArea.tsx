import { ChevronsRight } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBarHistory, useCompareBars, type Bar } from '../api/bars.ts';
import { useSymbols } from '../api/market.ts';
import { transformFor } from '../chart/chartTypes.ts';
import { useGaps } from '../api/analysis.ts';
import type { ChartEngine, ChartPointer, CompareBars, PaneLayout } from '../chart/ChartEngine.ts';
import type { ForecastView } from '../chart/forecastLayer.ts';
import type { GapZone } from '../chart/gapLayer.ts';
import type { LogicalRange } from '../chart/seriesData.ts';
import { barSeconds, logicalRangeFrom, RANGE_INTERVAL, rangeStart } from '../chart/visibleRange.ts';
import { DEFAULT_SYMBOL, useChartStore } from '../store/chartStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useChartDataStore } from '../store/chartDataStore.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import { useForecastOriginStore } from '../store/forecastOriginStore.ts';
import { useLayoutStore } from '../store/layoutStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { registerViewCapture, scheduleSave } from '../store/layoutSync.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { useStructureStore } from '../store/structureStore.ts';
import { useThemeStore } from '../store/themeStore.ts';
import { EMPHASIS_MS, useUiStore } from '../store/uiStore.ts';
import styles from './ChartArea.module.css';
import { ChartView, type FocusRequest } from './ChartView.tsx';
import { HistoryNote } from './HistoryNote.tsx';
import { IconButton } from './IconButton.tsx';
import { IndicatorLegend } from './IndicatorLegend.tsx';
import { IndicatorSettingsPanel } from './IndicatorSettingsPanel.tsx';
import { ChartBackdrop } from './ChartBackdrop.tsx';
import { ChartContextMenu } from './ChartContextMenu.tsx';
import { CompareLegend } from './CompareLegend.tsx';
import { DrawingFloatToolbar } from './DrawingFloatToolbar.tsx';
import { DrawingSettingsPanel } from './DrawingSettingsPanel.tsx';
import { localDate } from './formatClock.ts';
import { ForecastTooltip } from './ForecastTooltip.tsx';
import { forecastView } from './forecastView.ts';
import { useChartForecast } from './useChartForecast.ts';
import { RemoveConfirm } from './RemoveConfirm.tsx';
import { LegendOHLC } from './LegendOHLC.tsx';
import { MarketStatus } from './MarketStatus.tsx';
import { legendValues } from './legendValues.ts';
import { presentLines } from './presentLines.ts';
import { Toast } from './Toast.tsx';
import { usePresence } from './usePresence.ts';
import { useChartIndicators } from './useChartIndicators.ts';
import { useChartSnapshot } from './useChartSnapshot.ts';
import { useDrawingManager, useDrawingsSync } from './useDrawings.ts';
import { useDelayedFlag } from './useDelayedFlag.ts';
import { altKey, stepsReplay } from './keyTarget.ts';
import { ReplayBar } from './ReplayBar.tsx';
import { useGlobalHotkey } from './useGlobalHotkey.ts';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';

// Markdown + KaTeX load with the first learn page, not with the chart.
const LearnDrawer = lazy(() =>
  import('./LearnDrawer.tsx').then((m) => ({ default: m.LearnDrawer })),
);

interface ChartAreaProps {
  className?: string | undefined;
}

const DEFAULT_DECIMALS = 2;
/** Room the forecast tooltip needs right of and below the pointer (else it flips). */
const TOOLTIP_ROOM = { width: 230, height: 190 };
/** Bars a forecast needs before its origin, plus k (the backend's MIN_TRAIN 60 + HAR 22 + 1). */
const MIN_FORECAST_BARS = 83;
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
  // Minute charts follow the market; a replay shows a fixed past.
  const live = useReplayStore((s) => s.mode === 'off');
  const history = useBarHistory({ symbol, interval, adjusted, transform }, live);
  const hoverIndex = useChartDataStore((s) => s.hoverIndex);
  const setHoverIndex = useChartDataStore((s) => s.setHoverIndex);
  const [paneLayout, setPaneLayout] = useState<PaneLayout>({});
  const setAutoScale = useChartStore((s) => s.setAutoScale);
  const learn = usePresence(useUiStore((s) => s.learnFor));
  // The chart engine, for one-shot actions (jump to latest, reset view, snapshot).
  const engineRef = useRef<ChartEngine | null>(null);
  const attachDrawings = useDrawingManager();
  const gapZonesRef = useRef<readonly GapZone[]>([]);
  const forecastRef = useRef<ForecastView | null>(null);
  const compareRef = useRef<readonly CompareBars[]>([]);
  // The forecast candle under the pointer (its tooltip); a click on the fan opens the Forecast tab.
  const [forecastHover, setForecastHover] = useState<{
    h: number;
    x: number;
    y: number;
    left: boolean;
    up: boolean;
  } | null>(null);
  const forecastAt = useCallback((at: ChartPointer | null) => {
    const view = forecastRef.current;
    if (at === null || view === null) return null;
    const index = Math.round(at.logical);
    const bar = view.bars.find((b) => b.index === index);
    return bar === undefined ? null : { h: index - view.origin, bar };
  }, []);
  const unsubscribeForecast = useRef<() => void>(() => undefined);
  const onEngine = useCallback(
    (engine: ChartEngine | null) => {
      engineRef.current = engine;
      attachDrawings(engine);
      engine?.setGaps(gapZonesRef.current);
      engine?.setForecast(forecastRef.current);
      engine?.setCompare(compareRef.current);
      unsubscribeForecast.current();
      if (engine === null) return;
      const offPointer = engine.onPointer((at) => {
        const found = forecastAt(at);
        if (found === null || at === null) {
          setForecastHover(null);
          return;
        }
        // Near the right or bottom edge the tooltip opens left of or above the pointer.
        const { clientWidth, clientHeight } = engine.element();
        setForecastHover({
          h: found.h,
          x: at.x,
          y: at.y,
          left: at.x > clientWidth - TOOLTIP_ROOM.width,
          up: at.y > clientHeight - TOOLTIP_ROOM.height,
        });
      });
      const offClick = engine.onClick((at) => {
        // Not a click that draws, erases or picks a drawing.
        const drawing = useDrawingStore.getState();
        if (drawing.tool !== null || drawing.pointerTool !== null || drawing.hoverId !== null) {
          return;
        }
        const found = forecastAt(at);
        // Inside the 95 % band of a forecast bar.
        if (found !== null && at.price >= found.bar.bands[0] && at.price <= found.bar.bands[5]) {
          useUiStore.getState().openSidebar('forecast');
        }
      });
      unsubscribeForecast.current = () => {
        offPointer();
        offClick();
      };
    },
    [attachDrawings, forecastAt],
  );
  useDrawingsSync(symbol);
  // Alt+R: back to the latest bars at the default zoom.
  useGlobalHotkey(altKey('KeyR'), () => {
    engineRef.current?.resetView();
  });
  // The right-click point, and the bar under it (for "Forecast from this bar").
  const [menuAt, setMenuAt] = useState<{
    x: number;
    y: number;
    price: number | null;
    bar: Bar | null;
    index: number;
  } | null>(null);
  const contextMenu = usePresence(menuAt);
  // Stable: ActionMenu re-subscribes its click-away listener when onClose changes.
  const closeContextMenu = useCallback(() => {
    setMenuAt(null);
  }, []);
  const [offLatest, setOffLatest] = useState(false);
  // Until the first indicator is ever added (uids are never reused, so seq counts additions).
  const firstRun = useIndicatorStore((s) => s.seq === 0);
  const theme = useThemeStore((s) => s.theme);
  const timeZone = useDisplayTimeZone();
  const upColor = useSettingsStore((s) => s.upColor);
  const downColor = useSettingsStore((s) => s.downColor);
  const lastPriceLine = useSettingsStore((s) => s.lastPriceLine);
  const showVolume = useSettingsStore((s) => s.volume);
  const quietVolume = useSettingsStore((s) => s.quietVolume);
  const textScale = useSettingsStore((s) => s.textScale);
  const accent = useSettingsStore((s) => s.accent);
  const showWatermark = useSettingsStore((s) => s.watermark);
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
  const allBars = history.bars;
  // Bar replay (R7): only the bars up to the cursor are shown.
  const replay = useReplayStore();
  const replayOn = replay.mode === 'on' && replay.symbol === symbol && replay.cursor !== null;
  const cursorIndex = useMemo(() => {
    if (!replayOn || replay.cursor === null) return -1;
    const at = barSeconds(replay.cursor);
    return allBars.findLastIndex((bar) => barSeconds(bar.time) <= at);
  }, [replayOn, replay.cursor, allBars]);
  const bars = useMemo(
    () => (replayOn ? allBars.slice(0, cursorIndex + 1) : allBars),
    [replayOn, allBars, cursorIndex],
  );
  const shownCount = useRef(bars.length);
  useEffect(() => {
    shownCount.current = bars.length;
  });
  const shownSymbol = data?.symbol ?? symbol;
  const shownInterval = data?.interval ?? interval;
  const info = symbols?.find((s) => s.symbol === shownSymbol);
  const watermark = showWatermark ? `${info?.display ?? shownSymbol} · ${shownInterval}` : null;
  const display = useMemo(
    () => ({
      upColor,
      downColor,
      lastPriceLine,
      volume: showVolume,
      quietVolume,
      fontSize: Math.round(12 * textScale),
      watermark,
    }),
    [upColor, downColor, lastPriceLine, showVolume, quietVolume, textScale, watermark],
  );
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

  useChartSnapshot(engineRef, {
    bars,
    decimals,
    info,
    symbol: shownSymbol,
    interval: shownInterval,
  });
  const onVisibleRangeChange = useCallback((range: LogicalRange | null) => {
    const h = latest.current;
    if (range !== null && range.from < LOAD_OLDER_THRESHOLD && h.hasOlder && !h.isLoadingOlder) {
      h.loadOlder();
    }
    setOffLatest(range !== null && range.to < shownCount.current - 1);
    scheduleSave();
  }, []);

  // The layout reads the pane sizes and the visible bars from the chart when it saves.
  useEffect(() => {
    registerViewCapture(() => {
      const engine = engineRef.current;
      const shown = latest.current.bars;
      const range = engine?.visibleLogicalRange() ?? null;
      const at = (i: number) => shown[Math.min(Math.max(Math.round(i), 0), shown.length - 1)]?.time;
      const from = range === null ? undefined : at(range.from);
      const to = range === null ? undefined : at(range.to);
      return {
        stretches: engine?.paneStretches() ?? {},
        visibleRange: from === undefined || to === undefined ? null : { from, to },
      };
    });
    return () => {
      registerViewCapture(null);
    };
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
  // Computed over all the loaded bars (a replay step does not ask the backend again) and shown up
  // to the cursor: every indicator's value at bar k uses only bars <= k (tested for each one).
  const computed = useChartIndicators(series, allBars);
  const indicators = useMemo(() => {
    if (bars.length === allBars.length) return computed;
    const cut = <T extends { values: readonly (number | null)[] }>(o: T): T => ({
      ...o,
      values: o.values.slice(0, bars.length),
    });
    return {
      ...computed,
      views: computed.views.map((v) => ({ ...v, outputs: v.outputs.map(cut) })),
      lines: computed.lines.map(cut),
    };
  }, [computed, bars.length, allBars.length]);

  // A layout just opened: once its bars are in, restore its pane sizes and visible bars.
  const pendingView = useLayoutStore((s) => s.pending);
  useEffect(() => {
    const engine = engineRef.current;
    if (pendingView === null || engine === null || data === undefined || history.isLoading) return;
    if (data.symbol !== pendingView.symbol || data.interval !== pendingView.interval) return;
    engine.setPaneStretches(pendingView.stretches);
    const range = pendingView.visibleRange;
    if (range !== null && times.length > 0) {
      const index = (t: string | number) => {
        const i = times.findIndex((s) => s >= barSeconds(t));
        return i < 0 ? times.length - 1 : i;
      };
      engine.setVisibleRange({ from: index(range.from), to: index(range.to) });
    }
    useLayoutStore.setState({ pending: null });
  }, [pendingView, data, history.isLoading, times]);

  // Gap zones of the loaded bars (Structure menu), shared with the Gaps panel.
  const structure = useStructureStore();
  const allGaps = useGaps(series, {
    enabled: structure.gaps,
    minPct: structure.gapMinPct,
    partial: structure.gapPartial,
  });
  const barIndex = useMemo(() => new Map(bars.map((bar, i) => [bar.time, i])), [bars]);
  // In a replay a gap after the cursor is unknown, and one filled after it is still open.
  const gaps = useMemo(
    () =>
      allGaps.flatMap((g) =>
        !barIndex.has(g.time)
          ? []
          : [
              // In a replay the deepest fill so far is unknown (the backend's is over all bars).
              !replayOn
                ? g
                : g.filledTime !== null && barIndex.has(g.filledTime)
                  ? g
                  : { ...g, filledTime: null, fillPrice: null },
            ],
      ),
    [allGaps, barIndex, replayOn],
  );
  useEffect(() => {
    gapZonesRef.current = gaps.map((g) => ({
      start: barIndex.get(g.time) ?? 0,
      end: g.filledTime === null ? null : (barIndex.get(g.filledTime) ?? null),
      top: g.top,
      bottom: g.bottom,
      direction: g.direction,
    }));
    engineRef.current?.setGaps(gapZonesRef.current);
  }, [gaps, barIndex]);

  // The forecast (Structure menu), one query shared with the Forecast tab; drawn from its origin
  // bar (the last one, the frozen replay origin or a past bar), so a stale symbol's forecast is
  // not drawn; the actual closes shown after it get a dot in their band's colour.
  const forecast = useChartForecast(structure.forecast);
  useEffect(() => {
    const f = structure.forecast ? forecast.data : undefined;
    const origin = f === undefined ? undefined : barIndex.get(f.lastTime);
    forecastRef.current =
      f === undefined || origin === undefined
        ? null
        : forecastView(f, origin, transform === 'none' ? bars : []); // Heikin Ashi: no real closes
    engineRef.current?.setForecast(forecastRef.current);
  }, [structure.forecast, forecast.data, barIndex, bars, transform]);

  // Compare: the other symbols' bars, drawn as lines on the chart's own bar times.
  const compareSymbols = useChartStore((s) => s.compare);
  const compareData = useCompareBars(compareSymbols, shownInterval, adjusted);
  const compared = useMemo(
    () =>
      compareSymbols.flatMap((symbol, i) => {
        const other = symbols?.find((x) => x.symbol === symbol);
        // Listed (and removable) while loading or when its bars never come: no line then.
        return [
          {
            symbol,
            display: other?.display ?? symbol,
            bars: compareData[i]?.bars ?? [],
            decimals: other?.decimals ?? DEFAULT_DECIMALS,
          },
        ];
      }),
    [compareSymbols, symbols, compareData],
  );
  useEffect(() => {
    const drawn = compared.filter((c) => c.bars.length > 0);
    compareRef.current = drawn;
    engineRef.current?.setCompare(drawn);
  }, [compared]);

  // A past-bar forecast ends with another symbol or interval, a replay, or the forecast off.
  const setForecastOrigin = useForecastOriginStore((s) => s.setOrigin);
  useEffect(() => {
    setForecastOrigin(null);
  }, [symbol, interval, setForecastOrigin]);
  useEffect(() => {
    if (replay.mode !== 'off' || !structure.forecast) setForecastOrigin(null);
  }, [replay.mode, structure.forecast, setForecastOrigin]);

  // What the side panels (Data window, Gaps) show.
  const setChartData = useChartDataStore((s) => s.setData);
  useEffect(() => {
    setChartData({ bars, decimals, hasVolume, views: indicators.views, gaps });
  }, [setChartData, bars, decimals, hasVolume, indicators.views, gaps]);
  // A gap picked in the Gaps panel: scroll the chart to it.
  const focusBar = useChartDataStore((s) => s.focus);
  useEffect(() => {
    if (focusBar === null) return;
    const index = barIndex.get(focusBar.time);
    if (index !== undefined) engineRef.current?.showBar(index);
    // Only a new request scrolls (not new bars).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBar]);
  const shownLines = useMemo(
    () => presentLines(indicators.lines, legendFocus, emphasis),
    [indicators.lines, legendFocus, emphasis],
  );
  // Oscillators get their own pane and a legend at its top; the rest are listed over the price.
  const priceViews = indicators.views.filter((view) => view.spec?.overlay !== false);
  const paneViews = indicators.views.filter((view) => view.spec?.overlay === false);

  // Replay: another symbol ends it; picking marks the bar under the pointer, a click starts there.
  useEffect(() => {
    if (replay.mode !== 'off' && replay.symbol !== symbol) replay.exit();
  }, [replay, symbol]);
  const picking = replay.mode === 'picking';
  useEffect(() => {
    engineRef.current?.setReplayPick(picking ? hoverIndex : null);
  }, [picking, hoverIndex]);
  useEffect(() => {
    const engine = engineRef.current;
    if (!picking || engine === null) return;
    const element = engine.element();
    const onPick = (event: PointerEvent) => {
      // The bar under the click itself (a tap has no hover before it).
      const index = engine.barIndexAtClientX(event.clientX);
      const bar = index === null ? undefined : allBars[index];
      if (event.button !== 0 || bar === undefined) return;
      useReplayStore.getState().setCursor(bar.time, true);
    };
    element.addEventListener('pointerdown', onPick, true);
    return () => {
      element.removeEventListener('pointerdown', onPick, true);
    };
  }, [picking, allBars]);
  // A replay started at a date (a learn page's exercise): its last bar on or before that day, once
  // this symbol's bars are in. A day before the loaded history leaves the pick to the user.
  const startDay = picking && replay.symbol === symbol ? replay.startDay : null;
  const loaded = !history.isLoading && data?.symbol === symbol && data.interval === interval;
  useEffect(() => {
    if (startDay === null || !loaded) return;
    const bar = allBars.findLast((b) => localDate(b.time, timeZone) <= startDay);
    if (bar === undefined) {
      useReplayStore.setState({ startDay: null });
      // E.g. an hourly exercise older than the ~730 days of 1h bars the data source keeps.
      useUiStore
        .getState()
        .showToast(`No bars on or before ${startDay} here: pick a start bar on the chart.`);
    } else useReplayStore.getState().setCursor(bar.time, true);
  }, [startDay, loaded, allBars, timeZone]);
  // Keep the cursor in view while replaying (unless the user scrolled back); a new start bar
  // always comes into view.
  const jumps = useRef(replay.jumps);
  useEffect(() => {
    if (!replayOn) return;
    const jumped = jumps.current !== replay.jumps;
    jumps.current = replay.jumps;
    if (jumped || !offLatest) engineRef.current?.scrollToLatest();
    // The cursor moved: offLatest is read, not followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayOn, cursorIndex, replay.jumps]);
  // Leaving the replay: back to the present.
  const wasReplaying = useRef(false);
  useEffect(() => {
    if (wasReplaying.current && !replayOn) engineRef.current?.scrollToLatest();
    wasReplaying.current = replayOn;
  }, [replayOn]);
  const step = useCallback(() => {
    const next = allBars[cursorIndex + 1];
    if (next === undefined) {
      useReplayStore.getState().setPlaying(false);
      useUiStore.getState().showToast('The replay reached the latest bar');
      return;
    }
    useReplayStore.getState().setCursor(next.time);
  }, [allBars, cursorIndex]);
  useEffect(() => {
    if (!replayOn || !replay.playing) return;
    const timer = window.setTimeout(step, 1000 / replay.speed);
    return () => {
      window.clearTimeout(timer);
    };
  }, [replayOn, replay.playing, replay.speed, step]);
  useGlobalHotkey((event) => replayOn && stepsReplay(event), step);

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

  const backdrop = useMemo(
    () => <ChartBackdrop bars={bars} symbol={shownSymbol} adjusted={adjusted} zone={timeZone} />,
    [bars, shownSymbol, adjusted, timeZone],
  );

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
        <CompareLegend compare={compared} time={bars[hoverIndex ?? bars.length - 1]?.time} />
        <IndicatorLegend
          views={priceViews}
          hoverIndex={hoverIndex}
          barCount={bars.length}
          decimals={decimals}
        />
        {data !== undefined && data.providerWindowDays !== null && (
          <HistoryNote
            interval={data.interval}
            start={data.historyStart}
            windowDays={data.providerWindowDays}
            last={bars.at(-1)?.time}
            zone={timeZone}
          />
        )}
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
        display={display}
        timeZone={timeZone}
        chartType={chartType}
        scaleMode={scaleMode}
        autoScale={autoScale}
        focus={focus}
        lines={shownLines}
        onHover={setHoverIndex}
        onVisibleRangeChange={onVisibleRangeChange}
        onPaneLayout={setPaneLayout}
        onAutoScaleChange={setAutoScale}
        onEngine={onEngine}
        onContextMenu={(at) => {
          const i = engineRef.current?.barIndexAtClientX(at.x) ?? -1;
          setMenuAt({ ...at, bar: bars[i] ?? null, index: i });
        }}
        theme={`${theme}/${accent}`}
        backdrop={backdrop}
      />
      {forecastHover !== null && structure.forecast && forecast.data !== undefined && (
        <ForecastTooltip
          forecast={forecast.data}
          h={forecastHover.h}
          x={forecastHover.x}
          y={forecastHover.y}
          left={forecastHover.left}
          up={forecastHover.up}
          decimals={decimals}
        />
      )}
      {offLatest && (
        <IconButton
          className={styles.latest}
          label="Scroll to the latest bar"
          icon={<ChevronsRight size={18} />}
          tooltipSide="left"
          onClick={() => {
            engineRef.current?.scrollToLatest();
          }}
        />
      )}
      {contextMenu.shown !== null && (
        <ChartContextMenu
          at={contextMenu.shown}
          decimals={decimals}
          forecastBar={
            replay.mode === 'off' &&
            contextMenu.shown.bar !== null &&
            contextMenu.shown.index >= MIN_FORECAST_BARS + structure.forecastSettings.k &&
            contextMenu.shown.bar.time !== bars.at(-1)?.time
              ? contextMenu.shown.bar.time
              : null
          }
          attrs={contextMenu.attrs}
          onClose={closeContextMenu}
          onResetView={() => {
            engineRef.current?.resetView();
          }}
        />
      )}
      <RemoveConfirm views={indicators.views} />
      {replay.mode !== 'off' && replay.symbol === symbol && (
        <ReplayBar bars={allBars} cursorIndex={cursorIndex} onStep={step} />
      )}
      <DrawingFloatToolbar />
      <IndicatorSettingsPanel views={indicators.views} />
      <DrawingSettingsPanel />
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
