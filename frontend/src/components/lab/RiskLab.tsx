import { useState } from 'react';

import type { LabInterval, LabSource, Scenario } from '../../api/lab.ts';
import { useLabRisk } from '../../api/risk.ts';
import { RiskDetails } from '../RiskDetails.tsx';
import styles from './Lab.module.css';
import { SourcePicker } from './SourcePicker.tsx';

export interface RiskBlock {
  kind: 'risk';
  scenario?: Scenario;
  interval?: LabInterval;
}

/** Enough bars for a year of standardised returns and 1,000 backtested ones. */
const BARS = 2000;

/** VaR and ES on a random stock (a scenario) or a real symbol, with the backtests. */
export function RiskLab({ block }: { block: RiskBlock }) {
  const [source, setSource] = useState<LabSource>({
    kind: 'synthetic',
    scenario: block.scenario ?? 'accumulation',
    seed: 1,
    bars: BARS,
    interval: block.interval ?? '1D',
  });
  const result = useLabRisk(source);
  const risk = result.data;
  return (
    <section className={styles.lab} aria-label="Risk lab">
      <SourcePicker source={source} onChange={setSource} />
      {result.isError ? (
        <p className={styles.error} role="alert">
          Could not measure the risk: {result.error.message}
        </p>
      ) : risk === undefined ? (
        <p className={styles.note}>Measuring the tails and backtesting…</p>
      ) : (
        <RiskDetails risk={risk} position={null} />
      )}
    </section>
  );
}
