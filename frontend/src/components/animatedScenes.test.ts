import {
  auroraBlobs,
  candleField,
  stepCandles,
  tickerOffset,
  tickerText,
} from './animatedScenes.ts';

describe('animated scenes', () => {
  it('drifts up candles up and down candles down, wrapping around the box', () => {
    const field = candleField(40);
    expect(field).toEqual(candleField(40)); // seeded
    expect(field.every((c) => (c.up ? c.speed < 0 : c.speed > 0))).toBe(true);
    const later = stepCandles(field, 1);
    field.forEach((c, i) => {
      const moved = later[i];
      if (moved === undefined) throw new Error('lost a candle');
      expect(moved.y).toBeCloseTo(c.y + c.speed, 12);
    });
    // Far past the top: back at the bottom.
    const rising = { x: 0.5, y: -0.2, up: true, body: 0.05, wick: 0.03, speed: -0.01 };
    expect(stepCandles([rising], 0)[0]?.y).toBeGreaterThan(0.9);
  });

  it('writes the tape from the quotes with a price, and scrolls it with wrapping', () => {
    expect(
      tickerText([
        { display: 'AAPL', last: 23.56, changePct: 0.77 },
        { display: 'MSFT', last: 586.91, changePct: -5.08 },
        { display: 'XYZ', last: null, changePct: null },
      ]),
    ).toBe('AAPL 23.56 +0.77%     MSFT 586.91 -5.08%');
    expect(tickerOffset(10, 24, 100)).toBe(40);
    expect(tickerOffset(1, 24, 0)).toBe(0);
  });

  it('moves the aurora lights slowly, inside the box', () => {
    const now = auroraBlobs(0);
    const soon = auroraBlobs(1);
    expect(now).toHaveLength(3);
    now.forEach((b, i) => {
      const next = soon[i];
      if (next === undefined) throw new Error('lost a light');
      expect(Math.hypot(next.x - b.x, next.y - b.y)).toBeLessThan(0.05); // under 5 % a second
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(1);
    });
  });
});
