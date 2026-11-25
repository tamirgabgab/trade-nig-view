import { ESTIMATORS, useVolatility, type VolatilityQuery } from '../api/volatility.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import {
  FACTORS,
  SQUEEZE_HORIZONS,
  THRESHOLDS,
  useVolatilityStore,
} from '../store/volatilityStore.ts';
import { formatBarTime } from './formatClock.ts';
import styles from './ForecastPanel.module.css';
import { LearnLink } from './LearnLink.tsx';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';
import { VolatilityDetails } from './VolatilityDetails.tsx';
import { HORIZON_LABELS } from './volatilityFormat.ts';

/**
 * The Volatility tab (P3 V1): the volatility cone of the chart's symbol, from the bars up to the
 * last one or, while replaying, up to the cursor; its estimator, units and squeeze definition.
 */
export function VolatilityPanel() {
  const zone = useDisplayTimeZone();
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const adjusted = useChartStore((s) => s.adjusted);
  const prefs = useVolatilityStore((s) => s.prefs);
  const set = useVolatilityStore((s) => s.setPrefs);
  const replaying = useReplayStore((s) => s.mode === 'on' && s.symbol === symbol);
  const cursor = useReplayStore((s) => s.cursor);
  const query: VolatilityQuery = {
    symbol,
    interval,
    adjusted,
    estimator: prefs.estimator,
    horizon: prefs.horizon,
    threshold: prefs.threshold,
    factor: prefs.factor,
    origin: replaying && cursor !== null ? barSeconds(cursor) : null,
  };
  const result = useVolatility(query);
  const v = result.data;

  return (
    <div className={styles.panel}>
      <div className={styles.settings}>
        <label className={styles.field}>
          Estimator
          <select
            className={styles.select}
            value={prefs.estimator}
            onChange={(event) => {
              set({ estimator: event.target.value as (typeof ESTIMATORS)[number]['id'] });
            }}
          >
            {ESTIMATORS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Units
          <select
            className={styles.select}
            value={prefs.annual ? 'year' : 'bar'}
            onChange={(event) => {
              set({ annual: event.target.value === 'year' });
            }}
          >
            <option value="year">% a year</option>
            <option value="bar">% a bar</option>
          </select>
        </label>
        <label className={styles.field}>
          Squeeze over
          <select
            className={styles.select}
            value={prefs.horizon}
            onChange={(event) => {
              set({ horizon: event.target.value as (typeof SQUEEZE_HORIZONS)[number] });
            }}
          >
            {SQUEEZE_HORIZONS.map((h) => (
              <option key={h} value={h}>
                {HORIZON_LABELS[h]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Rank ≤
          <select
            className={styles.select}
            value={prefs.threshold}
            onChange={(event) => {
              set({ threshold: Number(event.target.value) });
            }}
          >
            {THRESHOLDS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Expansion ×
          <select
            className={styles.select}
            value={prefs.factor}
            onChange={(event) => {
              set({ factor: Number(event.target.value) });
            }}
          >
            {FACTORS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>
      {result.isError ? (
        <p className={styles.empty} role="alert">
          No volatility cone: {result.error.message}
        </p>
      ) : v === undefined ? (
        <p className={styles.empty} role="status">
          Measuring the volatility…
        </p>
      ) : (
        <>
          <h3 className={`${styles.heading} ${styles.section}`}>
            {v.symbol} at {formatBarTime(v.lastTime, zone)}
          </h3>
          <VolatilityDetails v={v} annual={prefs.annual} />
          <p className={`${styles.note} ${styles.section}`}>
            From past bars only (
            <LearnLink target="historical-volatility">how it is measured</LearnLink>
            ). A research tool, not investment advice.
          </p>
        </>
      )}
    </div>
  );
}
