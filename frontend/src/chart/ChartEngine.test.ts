import type { Bar } from '../api/bars.ts';
import { ChartEngine } from './ChartEngine.ts';
import { FALLBACK_THEME } from './theme.ts';

interface FakeSeries {
  kind: string;
  options: Record<string, unknown>;
  setData: ReturnType<typeof vi.fn>;
  applyOptions: ReturnType<typeof vi.fn>;
}

const lwc = vi.hoisted(() => {
  const state = {
    chartOptions: undefined as unknown,
    appliedOptions: [] as unknown[],
    series: [] as FakeSeries[],
    crosshair: undefined as ((param: { time?: unknown; logical?: number }) => void) | undefined,
    priceScaleOptions: new Map<string, unknown>(),
    setVisibleLogicalRange: vi.fn(),
    remove: vi.fn(),
    unsubscribe: vi.fn(),
  };
  const chart = {
    addSeries: (definition: { kind: string }, options: Record<string, unknown>) => {
      const series: FakeSeries = {
        kind: definition.kind,
        options,
        setData: vi.fn(),
        applyOptions: vi.fn(),
      };
      state.series.push(series);
      return series;
    },
    priceScale: (id: string) => ({
      applyOptions: (options: unknown) => state.priceScaleOptions.set(id, options),
    }),
    timeScale: () => ({ setVisibleLogicalRange: state.setVisibleLogicalRange }),
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
  return { state, createChart };
});

vi.mock('lightweight-charts', () => ({
  createChart: lwc.createChart,
  CandlestickSeries: { kind: 'Candlestick' },
  HistogramSeries: { kind: 'Histogram' },
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

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  lwc.state.series = [];
  lwc.state.crosshair = undefined;
  lwc.state.priceScaleOptions.clear();
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
  const [candles, volume] = lwc.state.series;
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
});
