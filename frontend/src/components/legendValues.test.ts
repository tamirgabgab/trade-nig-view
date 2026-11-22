import { AAPL_BARS } from '../test/render.tsx';
import { legendValues } from './legendValues.ts';

describe('legendValues', () => {
  it('uses the last bar when the crosshair is off the data', () => {
    const values = legendValues(AAPL_BARS, null);
    expect(values?.time).toBe('2026-11-20');
    expect(values?.change).toBeCloseTo(342.56 - 349.21, 10);
    expect(values?.changePct).toBeCloseTo((342.56 / 349.21 - 1) * 100, 10);
  });

  it('uses the hovered bar and its previous close', () => {
    const values = legendValues(AAPL_BARS, 1);
    expect(values?.close).toBe(349.21);
    expect(values?.change).toBeCloseTo(349.21 - 344.1, 10);
  });

  it('has no change for the first bar', () => {
    expect(legendValues(AAPL_BARS, 0)).toMatchObject({ change: null, changePct: null });
  });

  it('falls back to the last bar for an out-of-range index and handles no bars', () => {
    expect(legendValues(AAPL_BARS, 99)?.time).toBe('2026-11-20');
    expect(legendValues([], null)).toBeNull();
  });
});
