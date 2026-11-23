import type { Bar } from '../api/bars.ts';
import { ChartEngine, type IndicatorLine } from './ChartEngine.ts';
import { FALLBACK_THEME } from './theme.ts';

interface FakeSeries {
  kind: string;
  options: Record<string, unknown>;
  setData: ReturnType<typeof vi.fn>;
  applyOptions: ReturnType<typeof vi.fn>;
  pane: FakePane;
  priceLines: { price: number }[];
  primitives: unknown[];
  getPane: () => FakePane;
  createPriceLine: (options: { price: number }) => { price: number };
  removePriceLine: (line: { price: number }) => void;
  attachPrimitive: (primitive: unknown) => void;
}

interface FakePane {
  stretch: number;
  paneIndex: () => number;
  getSeries: () => FakeSeries[];
  setStretchFactor: (factor: number) => void;
  getHTMLElement: () => HTMLElement | null;
}

const lwc = vi.hoisted(() => {
  const state = {
    chartOptions: undefined as unknown,
    appliedOptions: [] as unknown[],
    series: [] as FakeSeries[],
    panes: [] as FakePane[],
    crosshair: undefined as ((param: { time?: unknown; logical?: number }) => void) | undefined,
    priceScaleOptions: new Map<string, unknown>(),
    removed: [] as FakeSeries[],
    visible: null as { from: number; to: number } | null,
    rangeHandler: undefined as ((range: { from: number; to: number } | null) => void) | undefined,
    setVisibleLogicalRange: vi.fn(),
    markerPlugins: [] as {
      series: unknown;
      markers: unknown[];
      detached: boolean;
      setMarkers: (markers: unknown[]) => void;
      detach: () => void;
    }[],
    remove: vi.fn(),
    unsubscribe: vi.fn(),
  };
  const pane = (): FakePane => {
    const element = document.createElement('div');
    const self: FakePane = {
      stretch: 1,
      paneIndex: () => state.panes.indexOf(self),
      getSeries: () => state.series.filter((s) => s.pane === self),
      setStretchFactor: (factor) => {
        self.stretch = factor;
      },
      getHTMLElement: () => element,
    };
    return self;
  };
  const chart = {
    addSeries: (definition: { kind: string }, options: Record<string, unknown>, index = 0) => {
      while (state.panes.length <= index) state.panes.push(pane());
      const target = state.panes[index] ?? pane();
      const series: FakeSeries = {
        kind: definition.kind,
        options,
        setData: vi.fn(),
        applyOptions: vi.fn(),
        pane: target,
        priceLines: [],
        primitives: [],
        getPane: () => target,
        createPriceLine: (line) => {
          series.priceLines.push(line);
          return line;
        },
        removePriceLine: (line) => {
          series.priceLines = series.priceLines.filter((l) => l !== line);
        },
        attachPrimitive: (primitive) => {
          series.primitives.push(primitive);
        },
      };
      state.series.push(series);
      return series;
    },
    removeSeries: (series: FakeSeries) => {
      state.removed.push(series);
      state.series = state.series.filter((s) => s !== series);
    },
    panes: () => state.panes,
    removePane: (index: number) => {
      state.panes.splice(index, 1);
    },
    priceScale: (id: string) => ({
      applyOptions: (options: unknown) => state.priceScaleOptions.set(id, options),
    }),
    timeScale: () => ({
      setVisibleLogicalRange: state.setVisibleLogicalRange,
      getVisibleLogicalRange: () => state.visible,
      subscribeVisibleLogicalRangeChange: (handler: typeof state.rangeHandler) => {
        state.rangeHandler = handler;
      },
      unsubscribeVisibleLogicalRangeChange: () => {
        state.rangeHandler = undefined;
      },
    }),
    subscribeCrosshairMove: (handler: typeof state.crosshair) => {
      state.crosshair = handler;
    },
    unsubscribeCrosshairMove: state.unsubscribe,
    applyOptions: (options: unknown) => state.appliedOptions.push(options),
    remove: state.remove,
  };
  const createChart = (_container: HTMLElement, options: unknown) => {
    state.chartOptions = options;
    return chart;
  };
  const createSeriesMarkers = (series: unknown, markers: unknown[]) => {
    const plugin = {
      series,
      markers,
      detached: false,
      setMarkers: (next: unknown[]) => {
        plugin.markers = next;
      },
      detach: () => {
        plugin.detached = true;
      },
    };
    state.markerPlugins.push(plugin);
    return plugin;
  };
  return { state, createChart, createSeriesMarkers };
});

vi.mock('lightweight-charts', () => ({
  createChart: lwc.createChart,
  createSeriesMarkers: lwc.createSeriesMarkers,
  AreaSeries: { kind: 'Area' },
  BarSeries: { kind: 'Bar' },
  CandlestickSeries: { kind: 'Candlestick' },
  HistogramSeries: { kind: 'Histogram' },
  LineSeries: { kind: 'Line' },
  LineStyle: { Dashed: 2 },
  PriceScaleMode: { Normal: 0, Logarithmic: 1, Percentage: 2 },
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 0 },
}));

const BARS: Bar[] = Array.from({ length: 200 }, (_, i) => ({
  time: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: i % 2 === 0 ? 101 + i : 99.5 + i,
  volume: 1000 + i,
}));

const EMA_LINE: IndicatorLine = {
  key: 'ema-1:ma',
  group: 'ema-1',
  output: 'ma',
  ownPane: false,
  plot: 'line',
  values: [],
  color: '#ff6d00',
  lineWidth: 2,
  visible: true,
  style: {},
  levels: [],
};

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  lwc.state.series = [];
  lwc.state.panes = [];
  lwc.state.crosshair = undefined;
  lwc.state.priceScaleOptions.clear();
  lwc.state.removed = [];
  lwc.state.visible = null;
  lwc.state.rangeHandler = undefined;
  lwc.state.appliedOptions = [];
  lwc.state.setVisibleLogicalRange.mockClear();
  lwc.state.remove.mockClear();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flushFrames(): void {
  const pending = frames;
  frames = [];
  for (const cb of pending) cb(0);
}

function engine(): { engine: ChartEngine; candles: FakeSeries; volume: FakeSeries } {
  const instance = new ChartEngine(document.createElement('div'), FALLBACK_THEME);
  // Volume is added first so the main series draws on top of it.
  const [volume, candles] = lwc.state.series;
  if (candles === undefined || volume === undefined) throw new Error('series not created');
  return { engine: instance, candles, volume };
}

describe('ChartEngine', () => {
  it('keeps the attribution logo and auto-sizes to its container', () => {
    engine();
    expect(lwc.state.chartOptions).toMatchObject({
      autoSize: true,
      layout: { attributionLogo: true },
    });
  });

  it('creates candles on the price scale and volume on its own scale', () => {
    const { candles, volume } = engine();
    expect(candles.kind).toBe('Candlestick');
    expect(candles.options).toMatchObject({ upColor: FALLBACK_THEME.up });
    expect(volume.kind).toBe('Histogram');
    expect(volume.options).toMatchObject({
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
    });
    expect(lwc.state.priceScaleOptions.get('volume')).toEqual({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
  });

  it('sets candle and volume data and jumps to the latest bars on reset', () => {
    const { engine: chart, candles, volume } = engine();
    chart.setBars(BARS, { decimals: 3, hasVolume: true, resetView: true });

    expect(candles.setData).toHaveBeenCalledWith(
      expect.arrayContaining([{ time: BARS[0]?.time, open: 100, high: 102, low: 99, close: 101 }]),
    );
    expect(candles.applyOptions).toHaveBeenCalledWith({
      priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
    });
    const volumeData = volume.setData.mock.calls[0]?.[0] as { color: string }[];
    expect(volumeData).toHaveLength(200);
    expect(volumeData[0]?.color).toBe('rgba(8, 153, 129, 0.5)');
    expect(volumeData[1]?.color).toBe('rgba(242, 54, 69, 0.5)');
    expect(lwc.state.setVisibleLogicalRange).toHaveBeenCalledWith({ from: 50, to: 204 });
  });

  it('shows dates only for daily bars', () => {
    const { engine: chart } = engine();
    chart.setBars(BARS, { decimals: 2, hasVolume: true, resetView: true });
    expect(lwc.state.appliedOptions).toEqual([{ timeScale: { timeVisible: false } }]);
  });

  it('shows intraday bars in the display time zone with the time of day', () => {
    const { engine: chart, candles, volume } = engine();
    // 2026-07-06 13:30 UTC = 09:30 New York (EDT) = 16:30 Israel (IDT, UTC+3).
    const hourly: Bar[] = [{ ...BARS[0], time: 1_783_344_600 } as Bar];
    chart.setBars(hourly, { decimals: 2, hasVolume: true, resetView: true });

    const israel = 1_783_344_600 + 3 * 3600;
    expect(lwc.state.appliedOptions).toEqual([{ timeScale: { timeVisible: true } }]);
    expect(candles.setData).toHaveBeenCalledWith([expect.objectContaining({ time: israel })]);
    expect(volume.setData).toHaveBeenCalledWith([expect.objectContaining({ time: israel })]);

    chart.setBars(hourly, { decimals: 2, hasVolume: true, resetView: false, timeZone: 'UTC' });
    expect(candles.setData).toHaveBeenLastCalledWith([
      expect.objectContaining({ time: 1_783_344_600 }),
    ]);
  });

  it('keeps the viewport when the same data set is refreshed', () => {
    const { engine: chart } = engine();
    chart.setBars(BARS, { decimals: 2, hasVolume: true, resetView: false });
    expect(lwc.state.setVisibleLogicalRange).not.toHaveBeenCalled();
  });

  it('hides volume for symbols without it', () => {
    const { engine: chart, volume } = engine();
    chart.setBars(BARS, { decimals: 2, hasVolume: false, resetView: true });
    expect(volume.applyOptions).toHaveBeenCalledWith({ visible: false });
    expect(volume.setData).toHaveBeenCalledWith([]);
  });

  it('reports the hovered bar index once per frame', () => {
    const { engine: chart } = engine();
    chart.setBars(BARS, { decimals: 2, hasVolume: true, resetView: true });
    const seen: (number | null)[] = [];
    chart.onCrosshairMove((index) => seen.push(index));

    lwc.state.crosshair?.({ time: '2026-01-01', logical: 10.2 });
    lwc.state.crosshair?.({ time: '2026-01-02', logical: 11.7 });
    flushFrames();
    lwc.state.crosshair?.({ logical: 300 }); // right of the data: no time
    flushFrames();

    expect(seen).toEqual([12, null]);
  });

  it('stops listening and removes the chart on dispose', () => {
    const { engine: chart } = engine();
    const seen: (number | null)[] = [];
    chart.onCrosshairMove((index) => seen.push(index));
    lwc.state.crosshair?.({ time: '2026-01-01', logical: 1 });

    chart.dispose();
    flushFrames();

    expect(seen).toEqual([]);
    expect(lwc.state.unsubscribe).toHaveBeenCalled();
    expect(lwc.state.remove).toHaveBeenCalled();
  });
  it('swaps the main series for another chart type and re-renders the same bars', () => {
    const { engine: chart, candles } = engine();
    chart.setBars(BARS, { decimals: 2, hasVolume: true, resetView: true });

    chart.setChartType('line');
    const line = lwc.state.series.at(-1);
    expect(lwc.state.removed).toEqual([candles]);
    expect(line?.kind).toBe('Line');
    expect(line?.setData).toHaveBeenCalledWith(
      expect.arrayContaining([{ time: BARS[0]?.time, value: 101 }]),
    );

    chart.setChartType('area');
    expect(lwc.state.series.at(-1)?.kind).toBe('Area');
    chart.setChartType('bars');
    expect(lwc.state.series.at(-1)?.kind).toBe('Bar');
    chart.setChartType('bars');
    expect(lwc.state.removed).toHaveLength(3); // same type again: no-op
  });

  it('colours hollow candles by close-to-close change', () => {
    const { engine: chart } = engine();
    chart.setChartType('hollow');
    chart.setBars(BARS.slice(0, 2), { decimals: 2, hasVolume: true, resetView: true });
    const data = lwc.state.series.at(-1)?.setData.mock.calls.at(-1)?.[0] as {
      color: string;
      borderColor: string;
    }[];
    // Bar 0 closes above its open (hollow body); bar 1 closes below bar 0's close (red).
    expect(data.map((p) => p.borderColor)).toEqual([FALLBACK_THEME.up, FALLBACK_THEME.down]);
    expect(data.map((p) => p.color)).toEqual(['rgba(0, 0, 0, 0)', FALLBACK_THEME.down]);
  });

  it('maps scale modes and auto-fit to the right price scale', () => {
    const { engine: chart } = engine();
    chart.setScale({ mode: 'log', autoScale: false });
    expect(lwc.state.priceScaleOptions.get('right')).toEqual({ mode: 1, autoScale: false });
    chart.setScale({ mode: 'percent', autoScale: true });
    expect(lwc.state.priceScaleOptions.get('right')).toEqual({ mode: 2, autoScale: true });
  });

  it('keeps the same bars in view when older history is prepended', () => {
    const { engine: chart } = engine();
    const latest = BARS.slice(100);
    chart.setBars(latest, { decimals: 2, hasVolume: true, resetView: true });
    lwc.state.setVisibleLogicalRange.mockClear();
    lwc.state.visible = { from: 10, to: 60 };

    chart.setBars(BARS, { decimals: 2, hasVolume: true, resetView: false });
    expect(lwc.state.setVisibleLogicalRange).toHaveBeenCalledWith({ from: 110, to: 160 });
  });

  it('forwards visible-range changes until disposed', () => {
    const { engine: chart } = engine();
    const seen: unknown[] = [];
    chart.onVisibleRangeChange((range) => seen.push(range));
    lwc.state.rangeHandler?.({ from: 3, to: 40 });
    lwc.state.rangeHandler?.(null);
    chart.dispose();
    expect(seen).toEqual([{ from: 3, to: 40 }, null]);
    expect(lwc.state.rangeHandler).toBeUndefined();
  });

  it('draws indicator lines on the bars and re-sends data only when it changed', () => {
    const { engine: chart } = engine();
    chart.setBars(BARS.slice(0, 3), { decimals: 2, hasVolume: true, resetView: true });
    const values = [null, 101, 102];
    chart.setIndicatorLines([
      { ...EMA_LINE, values, color: '#ff6d00', lineWidth: 2, visible: true },
    ]);
    const line = lwc.state.series.at(-1);
    expect(line?.kind).toBe('Line');
    expect(line?.setData).toHaveBeenCalledWith([
      { time: '2026-01-01' },
      { time: '2026-01-02', value: 101 },
      { time: '2026-01-03', value: 102 },
    ]);
    expect(line?.applyOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#ff6d00', lineWidth: 2, visible: true }),
    );

    // Same values, new colour: options only.
    chart.setIndicatorLines([
      { ...EMA_LINE, values, color: '#2962ff', lineWidth: 9, visible: false },
    ]);
    expect(line?.setData).toHaveBeenCalledTimes(1);
    expect(line?.applyOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#2962ff', lineWidth: 4, visible: false }),
    );

    // New bars: the same values array is sent again against the new times.
    chart.setBars(BARS.slice(0, 3), { decimals: 2, hasVolume: true, resetView: false });
    chart.setIndicatorLines([
      { ...EMA_LINE, values, color: '#2962ff', lineWidth: 2, visible: true },
    ]);
    expect(line?.setData).toHaveBeenCalledTimes(2);

    chart.setIndicatorLines([]);
    expect(lwc.state.removed).toContain(line);
  });

  it('draws marker outputs as arrows on the main series and keeps them across chart types', () => {
    const { engine: chart } = engine();
    chart.setBars(BARS.slice(0, 4), { decimals: 2, hasVolume: true, resetView: true });
    const crosses = [null, 1, null, -1];
    const markers: IndicatorLine = {
      key: 'x-1:crosses',
      group: 'x-1',
      output: 'crosses',
      ownPane: false,
      plot: 'markers',
      values: crosses,
      color: '#089981',
      lineWidth: 2,
      visible: true,
      style: { up: '#00ff00', down: '#ff0000' },
      levels: [],
    };
    const before = lwc.state.series.length;
    chart.setIndicatorLines([markers]);
    expect(lwc.state.series.length).toBe(before);
    const plugin = lwc.state.markerPlugins.at(-1);
    expect(plugin?.series).toMatchObject({ kind: 'Candlestick' });
    expect(plugin?.markers).toEqual([
      { time: '2026-01-02', position: 'belowBar', shape: 'arrowUp', color: '#00ff00' },
      { time: '2026-01-04', position: 'aboveBar', shape: 'arrowDown', color: '#ff0000' },
    ]);

    chart.setChartType('line');
    expect(plugin?.detached).toBe(true);
    const moved = lwc.state.markerPlugins.at(-1);
    expect(moved).not.toBe(plugin);
    expect(moved?.series).toMatchObject({ kind: 'Line' });
    expect(moved?.markers).toHaveLength(2);

    chart.setIndicatorLines([{ ...markers, visible: false }]);
    expect(moved?.markers).toEqual([]);
  });

  it('puts each own-pane indicator in its own pane with levels, and closes the pane on removal', () => {
    const observed = new Set<Element | null>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(element: Element) {
          observed.add(element);
        }
        unobserve(element: Element) {
          observed.delete(element);
        }
        disconnect() {
          observed.clear();
        }
      },
    );
    const { engine: chart } = engine();
    chart.setBars(BARS.slice(0, 3), { decimals: 2, hasVolume: true, resetView: true });
    const rsi: IndicatorLine = {
      ...EMA_LINE,
      key: 'rsi-1:rsi',
      group: 'rsi-1',
      output: 'rsi',
      ownPane: true,
      values: [null, 40, 60],
      levels: [70, 50, 30],
    };
    const macd = (output: string, plot: IndicatorLine['plot']): IndicatorLine => ({
      ...EMA_LINE,
      key: `macd-1:${output}`,
      group: 'macd-1',
      output,
      ownPane: true,
      plot,
      values: [null, 1, -2],
      style: { up: 'U', up_weak: 'u', down: 'D', down_weak: 'd' },
    });
    chart.setIndicatorLines([rsi, macd('hist', 'histogram'), macd('macd', 'line')]);

    const [rsiSeries, hist, macdLine] = lwc.state.series.slice(-3);
    expect(rsiSeries?.pane.paneIndex()).toBe(1);
    expect(rsiSeries?.pane.stretch).toBe(0.3);
    expect(rsiSeries?.priceLines.map((l) => l.price)).toEqual([70, 50, 30]);
    expect(hist?.kind).toBe('Histogram');
    expect(hist?.pane.paneIndex()).toBe(2);
    expect(macdLine?.pane).toBe(hist?.pane);
    expect(hist?.setData).toHaveBeenCalledWith([
      { time: '2026-01-01' },
      { time: '2026-01-02', value: 1, color: 'u' },
      { time: '2026-01-03', value: -2, color: 'D' },
    ]);
    const rsiPane = rsiSeries?.pane.getHTMLElement();
    expect(observed.has(rsiPane ?? null)).toBe(true);

    // Removing the RSI closes its pane (no longer observed); the MACD pane moves up.
    chart.setIndicatorLines([macd('hist', 'histogram'), macd('macd', 'line')]);
    expect(lwc.state.removed).toContain(rsiSeries);
    expect(lwc.state.panes).toHaveLength(2);
    expect(hist?.pane.paneIndex()).toBe(1);
    expect(observed.has(rsiPane ?? null)).toBe(false);
    expect(observed.has(hist?.pane.getHTMLElement() ?? null)).toBe(true);
  });

  it('shades between two lines and draws volume-scale lines on the volume histogram', () => {
    const { engine: chart } = engine();
    chart.setBars(BARS.slice(0, 3), { decimals: 2, hasVolume: true, resetView: true });
    const band = (output: string, style: Record<string, string>): IndicatorLine => ({
      ...EMA_LINE,
      key: `bb-1:${output}`,
      group: 'bb-1',
      output,
      values: [null, 1, 2],
      style,
    });
    chart.setIndicatorLines([
      band('upper', { fill_to: 'lower', fill: 'rgba(0, 0, 255, 0.1)' }),
      band('lower', {}),
      { ...EMA_LINE, key: 'v-1:ma', group: 'v-1', style: { price_scale: 'volume' } },
    ]);
    const [upper, lower, volumeMa] = lwc.state.series.slice(-3);
    expect(upper?.pane.paneIndex()).toBe(0);
    expect(upper?.primitives).toHaveLength(1);
    expect(lower?.primitives).toHaveLength(0);
    expect(volumeMa?.options).toMatchObject({ priceScaleId: 'volume' });
    expect(volumeMa?.applyOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ priceFormat: { type: 'volume' }, visible: true }),
    );

    // A symbol without volume hides lines on the volume scale, not the others.
    chart.setBars(BARS.slice(0, 3), { decimals: 2, hasVolume: false, resetView: false });
    chart.setIndicatorLines([
      band('upper', { fill_to: 'lower', fill: 'rgba(0, 0, 255, 0.1)' }),
      band('lower', {}),
      { ...EMA_LINE, key: 'v-1:ma', group: 'v-1', style: { price_scale: 'volume' } },
    ]);
    expect(volumeMa?.applyOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: false }),
    );
    expect(upper?.applyOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: true }),
    );
  });
});
