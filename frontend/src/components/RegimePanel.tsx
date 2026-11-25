import { useRegime, type RegimeQuery } from '../api/regime.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { formatBarTime } from './formatClock.ts';
import styles from './ForecastPanel.module.css';
import { LearnLink } from './LearnLink.tsx';
import { RegimeDetails } from './RegimeDetails.tsx';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';

/**
 * The Regime tab (P3 G1): is the chart's symbol trending, random or mean-reverting over the last
 * year, with significance, and which rules worked in each regime; at the last bar or, while
 * replaying, at the cursor.
 */
export function RegimePanel() {
  const zone = useDisplayTimeZone();
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const adjusted = useChartStore((s) => s.adjusted);
  const replaying = useReplayStore((s) => s.mode === 'on' && s.symbol === symbol);
  const cursor = useReplayStore((s) => s.cursor);
  const query: RegimeQuery = {
    symbol,
    interval,
    adjusted,
    origin: replaying && cursor !== null ? barSeconds(cursor) : null,
  };
  const result = useRegime(query);
  const regime = result.data;

  return (
    <div className={styles.panel}>
      {result.isError ? (
        <p className={styles.empty} role="alert">
          No regime: {result.error.message}
        </p>
      ) : regime === undefined ? (
        <p className={styles.empty} role="status">
          Testing the returns&apos; memory…
        </p>
      ) : (
        <>
          <h3 className={`${styles.heading} ${styles.section}`}>
            {regime.symbol} at {formatBarTime(regime.lastTime, zone)}
          </h3>
          <RegimeDetails regime={regime} />
          <p className={`${styles.note} ${styles.section}`}>
            From past bars only (<LearnLink target="market-regime">how it is measured</LearnLink>).
            A research tool, not investment advice.
          </p>
        </>
      )}
    </div>
  );
}
