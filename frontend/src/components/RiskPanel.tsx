import { useState } from 'react';

import { useRisk, type RiskQuery } from '../api/risk.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { formatBarTime } from './formatClock.ts';
import styles from './ForecastPanel.module.css';
import { LearnLink } from './LearnLink.tsx';
import { NumberField } from './NumberField.tsx';
import { RiskDetails } from './RiskDetails.tsx';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';

/**
 * The Risk tab (P3 R2): VaR and ES of the chart's symbol for the next bar, week and month by four
 * methods, with the backtests; at the last bar or, while replaying, at the cursor.
 */
export function RiskPanel() {
  const zone = useDisplayTimeZone();
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const adjusted = useChartStore((s) => s.adjusted);
  const replaying = useReplayStore((s) => s.mode === 'on' && s.symbol === symbol);
  const cursor = useReplayStore((s) => s.cursor);
  const [position, setPosition] = useState(10_000);
  const query: RiskQuery = {
    symbol,
    interval,
    adjusted,
    origin: replaying && cursor !== null ? barSeconds(cursor) : null,
  };
  const result = useRisk(query);
  const risk = result.data;

  return (
    <div className={styles.panel}>
      <div className={styles.settings}>
        <NumberField
          label="Position"
          value={position}
          min={0}
          max={1e12}
          step={1000}
          onCommit={setPosition}
        />
      </div>
      {result.isError ? (
        <p className={styles.empty} role="alert">
          No VaR: {result.error.message}
        </p>
      ) : risk === undefined ? (
        <p className={styles.empty} role="status">
          Measuring the tails and backtesting…
        </p>
      ) : (
        <>
          <h3 className={`${styles.heading} ${styles.section}`}>
            {risk.symbol} at {formatBarTime(risk.lastTime, zone)}
          </h3>
          <RiskDetails risk={risk} position={position} />
          <p className={`${styles.note} ${styles.section}`}>
            From past bars only (<LearnLink target="value-at-risk">how it is measured</LearnLink>).
            A research tool, not investment advice.
          </p>
        </>
      )}
    </div>
  );
}
