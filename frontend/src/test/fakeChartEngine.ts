/**
 * Test double for chart/ChartEngine.ts (jsdom has no canvas). Use with
 * `vi.mock('../chart/ChartEngine.ts', () => import('../test/fakeChartEngine.ts'))`.
 */
import type { Bar } from '../api/bars.ts';
import type { CrosshairListener, SetBarsOptions } from '../chart/ChartEngine.ts';

export const engines: FakeChartEngine[] = [];

export class FakeChartEngine {
  readonly calls: { bars: readonly Bar[]; options: SetBarsOptions }[] = [];
  disposed = false;
  private listener: CrosshairListener | null = null;

  constructor() {
    engines.push(this);
  }

  setBars(bars: readonly Bar[], options: SetBarsOptions): void {
    this.calls.push({ bars, options });
  }

  onCrosshairMove(listener: CrosshairListener): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  dispose(): void {
    this.disposed = true;
  }

  /** Simulate the crosshair moving onto bar `index` (null = off the data). */
  hover(index: number | null): void {
    this.listener?.(index);
  }
}

/** The live (not disposed) engine; fails if there is none. */
export function liveEngine(): FakeChartEngine {
  const engine = engines.filter((e) => !e.disposed).at(-1);
  if (engine === undefined) throw new Error('No live chart engine');
  return engine;
}

export { FakeChartEngine as ChartEngine };
