import { useMemo } from 'react';

import { useWeeklyHistory, type Bar } from '../api/bars.ts';
import { useBackdropImageStore } from '../store/backdropImageStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { dayChange, ghostCloses, ghostPath, pulseAlpha, topoPaths } from './backdrop.ts';
import { AnimatedBackdrop } from './AnimatedBackdrop.tsx';
import styles from './ChartBackdrop.module.css';

/** The SVG backdrops' box (scaled to cover the chart). */
const W = 1600;
const H = 900;
const TOPO = topoPaths(W, H);

/**
 * What is drawn behind the (transparent) chart, in Settings → Appearance: the theme's colour or a
 * gradient, topographic lines, the symbol's ghost history or the user's image (dimmed and blurred);
 * then the Market pulse tint by the latest change (the watermark is a chart primitive). Static: nothing moves
 * on its own. In replay only the bars up to the cursor count (`bars` are the shown bars).
 */
export function ChartBackdrop({
  bars,
  symbol,
  adjusted,
  zone,
}: {
  bars: readonly Bar[];
  symbol: string;
  adjusted: boolean;
  zone: string;
}) {
  const backdrop = useSettingsStore((st) => st.backdrop);
  const pulse = useSettingsStore((st) => st.pulse);
  const imageDim = useSettingsStore((st) => st.imageDim);
  const imageBlur = useSettingsStore((st) => st.imageBlur);
  const image = useBackdropImageStore((st) => st.image);
  const weekly = useWeeklyHistory(symbol, adjusted, backdrop === 'ghost');
  const last = bars.at(-1);
  const ghost = useMemo(() => {
    if (backdrop !== 'ghost' || weekly.data === undefined || last === undefined) return '';
    return ghostPath(ghostCloses(weekly.data.bars, last), W, H);
  }, [backdrop, weekly.data, last]);
  const change = useMemo(() => (pulse ? dayChange(bars, zone) : null), [pulse, bars, zone]);

  return (
    <div
      className={[styles.backdrop, backdrop === 'gradient' ? styles.gradient : ''].join(' ')}
      data-testid="chart-backdrop"
      data-backdrop={backdrop}
      aria-hidden="true"
    >
      {backdrop === 'image' && image !== null && (
        <>
          <div
            className={styles.image}
            style={{ backgroundImage: `url(${image})`, filter: `blur(${String(imageBlur)}px)` }}
          />
          <div className={styles.dim} style={{ opacity: imageDim }} />
        </>
      )}
      {backdrop === 'topo' && (
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
      {(backdrop === 'candles' || backdrop === 'ticker' || backdrop === 'aurora') && (
        <AnimatedBackdrop kind={backdrop} />
      )}
      {change !== null && change !== 0 && (
        <div
          className={styles.pulse}
          data-pulse={change > 0 ? 'up' : 'down'}
          style={{ opacity: pulseAlpha(change) }}
        />
      )}
    </div>
  );
}
