/**
 * The animated chart backgrounds (Settings → Appearance, opt-in): pure scene state and steps,
 * drawn by AnimatedBackdrop. Everything is faint (opacity ≤ 0.12, the ticker's text 0.3) so the
 * bars stay the hero; time is in seconds.
 */

/** A small seeded random generator (mulberry32): the same scene on every visit. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One drifting candle, in a unit box (x, y in 0..1; body and wick as fractions of the height). */
export interface DriftCandle {
  x: number;
  y: number;
  up: boolean;
  body: number;
  wick: number;
  /** Vertical speed, box heights a second (up candles rise, down candles sink). */
  speed: number;
}

export function candleField(count = 28, seed = 11): DriftCandle[] {
  const rand = random(seed);
  return Array.from({ length: count }, () => {
    const up = rand() < 0.55;
    return {
      x: rand(),
      y: rand(),
      up,
      body: 0.03 + 0.06 * rand(),
      wick: 0.02 + 0.04 * rand(),
      speed: (0.006 + 0.012 * rand()) * (up ? -1 : 1),
    };
  });
}

/** The candles after `dt` seconds: each moves at its speed and wraps around the box. */
export function stepCandles(candles: readonly DriftCandle[], dt: number): DriftCandle[] {
  return candles.map((c) => {
    const y = c.y + c.speed * dt;
    const span = 1 + c.body + 2 * c.wick;
    return { ...c, y: y < -c.body - c.wick ? y + span : y > 1 + c.wick ? y - span : y };
  });
}

/** The ticker tape's text: each watchlist symbol with its last price and day's change. */
export function tickerText(
  quotes: readonly { display: string; last: number | null; changePct: number | null }[],
): string {
  return quotes
    .filter((q) => q.last !== null)
    .map((q) => {
      const pct =
        q.changePct === null ? '' : ` ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`;
      return `${q.display} ${(q.last ?? 0).toFixed(2)}${pct}`;
    })
    .join('     ');
}

/** The tape's offset (px) after `t` seconds at `speed` px/s, wrapping every `width` px. */
export const tickerOffset = (t: number, speed: number, width: number) =>
  width <= 0 ? 0 : (t * speed) % width;

/** One soft light of the aurora: centre (unit box), radius (of the box's larger side), hue slot. */
export interface AuroraBlob {
  x: number;
  y: number;
  r: number;
  slot: 0 | 1 | 2;
}

/** The aurora at time `t`: three lights drifting on slow Lissajous paths (periods 40–70 s). */
export function auroraBlobs(t: number): AuroraBlob[] {
  const w = (period: number) => (2 * Math.PI * t) / period;
  return [
    { x: 0.3 + 0.2 * Math.sin(w(47)), y: 0.3 + 0.15 * Math.cos(w(61)), r: 0.55, slot: 0 },
    { x: 0.7 + 0.2 * Math.cos(w(53)), y: 0.45 + 0.2 * Math.sin(w(41)), r: 0.5, slot: 1 },
    { x: 0.5 + 0.25 * Math.sin(w(67)), y: 0.75 + 0.1 * Math.cos(w(43)), r: 0.45, slot: 2 },
  ];
}
