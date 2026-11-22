/**
 * Test double for chart/ChartEngine.ts (jsdom has no canvas). Use with
 * `vi.mock('../chart/ChartEngine.ts', () => import('../test/fakeChartEngine.ts'))`.
 */
import type { Bar } from '../api/bars.ts';
import type {
  CrosshairListener,
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
  disposed = false;
  private listener: CrosshairListener | null = null;
  private rangeListener: VisibleRangeListener | null = null;

  constructor() {
    engines.push(this);
  }

  setBars(bars: readonly Bar[], options: SetBarsOptions): void {
    this.calls.push({ bars, options });
  }

  setChartType(type: ChartType): void {
    this.chartTypes.push(type);
  }

  setScale(options: ScaleOptions): void {
    this.scales.push(options);
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

  onVisibleRangeChange(listener: VisibleRangeListener): () => void {
    this.rangeListener = listener;
    return () => {
      this.rangeListener = null;
    };
  }

  dispose(): void {
    this.disposed = true;
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
