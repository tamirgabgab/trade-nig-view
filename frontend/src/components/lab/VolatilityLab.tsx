import { useState } from 'react';

import type { LabInterval, LabSource, Scenario } from '../../api/lab.ts';
import { ESTIMATORS, useLabVolatility, type Estimator } from '../../api/volatility.ts';
import { VolatilityDetails } from '../VolatilityDetails.tsx';
import styles from './Lab.module.css';
import { SourcePicker } from './SourcePicker.tsx';

export interface VolatilityBlock {
  kind: 'volatility';
  scenario?: Scenario;
  interval?: LabInterval;
  estimator?: Estimator;
}

/** Enough bars for 30 independent months of HAR training and a year of squeeze ranks. */
const BARS = 2000;

/**
 * The volatility cone on a random stock (a scenario) or a real symbol: the cone, the HAR
 * forecast, the squeeze against its base rate and the estimators' scores.
 */
export function VolatilityLab({ block }: { block: VolatilityBlock }) {
  const [source, setSource] = useState<LabSource>({
    kind: 'synthetic',
    scenario: block.scenario ?? 'accumulation',
    seed: 1,
    bars: BARS,
    interval: block.interval ?? '1D',
  });
  const [estimator, setEstimator] = useState<Estimator>(block.estimator ?? 'yang_zhang');
  const result = useLabVolatility({ source, estimator });
  const v = result.data;

  return (
    <section className={styles.lab} aria-label="Volatility lab">
      <SourcePicker source={source} onChange={setSource} />
      <div className={styles.controls}>
        <select
          className={styles.select}
          aria-label="Estimator"
          value={estimator}
          onChange={(event) => {
            setEstimator(event.target.value as Estimator);
          }}
        >
          {ESTIMATORS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
      {result.isError ? (
        <p className={styles.error} role="alert">
          Could not measure the volatility: {result.error.message}
        </p>
      ) : v === undefined ? (
        <p className={styles.note}>Measuring the volatility…</p>
      ) : (
        <VolatilityDetails v={v} annual />
      )}
    </section>
  );
}
