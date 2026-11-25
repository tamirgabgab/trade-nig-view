import { useEffect, useMemo, useRef } from 'react';

import { useSymbols, useUniverseQuotes } from '../api/market.ts';
import { readChartTheme, withAlpha } from '../chart/theme.ts';
import { useReplayStore } from '../store/replayStore.ts';
import {
  auroraBlobs,
  candleField,
  stepCandles,
  tickerOffset,
  tickerText,
  type DriftCandle,
} from './animatedScenes.ts';
import styles from './ChartBackdrop.module.css';

export type AnimatedKind = 'candles' | 'ticker' | 'aurora';

/** Frames a second at most: a background does not need more. */
const FPS = 30;
const TICKER_SPEED = 24; // px a second
const TICKER_FONT = 13;

/**
 * An animated chart background on its own canvas behind the chart: drifting candles, a ticker
 * tape of the watchlist, or a slow aurora. At most 30 frames a second; paused while the tab is
 * hidden or a replay plays; one still frame when the system asks for reduced motion.
 */
export function AnimatedBackdrop({ kind }: { kind: AnimatedKind }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playing = useReplayStore((s) => s.playing);
  // Today's quotes would give away a replay's future: no tape while one runs.
  const replaying = useReplayStore((s) => s.mode !== 'off');
  const quotes = useUniverseQuotes().data;
  const symbols = useSymbols().data;
  const tape = useMemo(
    () =>
      replaying
        ? ''
        : tickerText(
            (quotes ?? []).map((q) => ({
              display: symbols?.find((s) => s.symbol === q.symbol)?.display ?? q.symbol,
              last: q.last,
              changePct: q.changePct,
            })),
          ),
    [quotes, symbols, replaying],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null) return;
    const ctx = context;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const theme = readChartTheme();
    let candles: DriftCandle[] = candleField();
    let frame = 0;
    let last = performance.now();
    let elapsed = 0;

    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (kind === 'candles') {
        for (const c of candles) {
          const x = c.x * w;
          const color = withAlpha(c.up ? theme.up : theme.down, 0.1);
          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, (c.y - c.wick) * h);
          ctx.lineTo(x, (c.y + c.body + c.wick) * h);
          ctx.stroke();
          ctx.fillRect(x - 5, c.y * h, 10, c.body * h);
        }
      } else if (kind === 'aurora') {
        const colors = [theme.line, theme.compare2, theme.up];
        for (const b of auroraBlobs(elapsed)) {
          const r = b.r * Math.max(w, h);
          const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, r);
          g.addColorStop(0, withAlpha(colors[b.slot] ?? theme.line, 0.12));
          g.addColorStop(1, withAlpha(colors[b.slot] ?? theme.line, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
      } else if (tape !== '') {
        ctx.font = `${String(TICKER_FONT)}px ${theme.fontFamily}`;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = withAlpha(theme.text, 0.3);
        const text = `${tape}     `;
        const width = ctx.measureText(text).width;
        const x = -tickerOffset(elapsed, TICKER_SPEED, width);
        const y = h * 0.86;
        for (let at = x; at < w; at += width) ctx.fillText(text, at, y);
      }
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      if (dt < 1 / FPS) return;
      last = now;
      // A long gap (a hidden tab) does not jump the scene.
      const step = Math.min(dt, 0.1);
      elapsed += step;
      candles = stepCandles(candles, step);
      draw();
    };

    draw();
    const animate = !reduced && !playing;
    const start = () => {
      if (!animate || frame !== 0 || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [kind, playing, tape]);

  return <canvas ref={canvasRef} className={styles.svg} data-animated={kind} />;
}
