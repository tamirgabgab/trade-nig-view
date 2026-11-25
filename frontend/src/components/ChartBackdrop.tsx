import { useMemo } from 'react';

import { useWeeklyHistory, type Bar } from '../api/bars.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { useBackdropImageStore } from '../store/backdropImageStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { dayChange, ghostPath, pulseAlpha, topoPaths } from './backdrop.ts';
import styles from './ChartBackdrop.module.css';

/** The SVG backdrops' box (scaled to cover the chart). */
const W = 1600;
const H = 900;
const TOPO = topoPaths(W, H);

/**
 * What is drawn behind the (transparent) chart, in Settings → Appearance: the theme's colour or a
 * gradient, topographic lines, the symbol's ghost history or the user's image (dimmed and blurred);
 * then the Market pulse tint by the day's change and the symbol watermark. Static: nothing moves
 * on its own. In replay only the bars up to the cursor count (`bars` are the shown bars).
 */
export function ChartBackdrop({
  bars,
  symbol,
  label,
  adjusted,
  zone,
}: {
  bars: readonly Bar[];
  symbol: string;
  /** The watermark: e.g. "AAPL · 1D". */
  label: string;
  adjusted: boolean;
  zone: string;
}) {
  const s = useSettingsStore();
  const image = useBackdropImageStore((state) => state.image);
  const weekly = useWeeklyHistory(symbol, adjusted, s.backdrop === 'ghost');
  const last = bars.at(-1);
  const ghost = useMemo(() => {
    if (s.backdrop !== 'ghost' || weekly.data === undefined || last === undefined) return '';
    const until = barSeconds(last.time);
    const closes = weekly.data.bars.filter((b) => barSeconds(b.time) <= until).map((b) => b.close);
    return ghostPath(closes, W, H);
  }, [s.backdrop, weekly.data, last]);
  const change = s.pulse ? dayChange(bars, zone) : null;

  return (
    <div
      className={[styles.backdrop, s.backdrop === 'gradient' ? styles.gradient : ''].join(' ')}
      data-testid="chart-backdrop"
      data-backdrop={s.backdrop}
      aria-hidden="true"
    >
      {s.backdrop === 'image' && image !== null && (
        <>
          <div
            className={styles.image}
            style={{ backgroundImage: `url(${image})`, filter: `blur(${String(s.imageBlur)}px)` }}
          />
          <div className={styles.dim} style={{ opacity: s.imageDim }} />
        </>
      )}
      {s.backdrop === 'topo' && (
        <svg
          className={styles.svg}
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          preserveAspectRatio="xMidYMid slice"
        >
          {TOPO.map((d, i) => (
            <path key={i} className={styles.topo} d={d} />
          ))}
        </svg>
      )}
      {ghost !== '' && (
        <svg
          className={styles.svg}
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          preserveAspectRatio="none"
        >
          <path className={styles.ghost} d={ghost} />
        </svg>
      )}
      {change !== null && change !== 0 && (
        <div
          className={styles.pulse}
          data-pulse={change > 0 ? 'up' : 'down'}
          style={{ opacity: pulseAlpha(change) }}
        />
      )}
      {s.watermark && <div className={styles.watermark}>{label}</div>}
    </div>
  );
}
