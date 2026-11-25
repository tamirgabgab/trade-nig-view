import { useState } from 'react';

import type { LabInterval, LabSource, Scenario } from '../../api/lab.ts';
import { useLabRegime } from '../../api/regime.ts';
import { RegimeDetails } from '../RegimeDetails.tsx';
import styles from './Lab.module.css';
import { SourcePicker } from './SourcePicker.tsx';

export interface RegimeBlock {
  kind: 'regime';
  scenario?: Scenario;
  interval?: LabInterval;
}

/** Enough bars for a year's test and the regimes of several years. */
const BARS = 2000;

/** The market regime on a random stock (a scenario) or a real symbol, with its event study. */
export function RegimeLab({ block }: { block: RegimeBlock }) {
  const [source, setSource] = useState<LabSource>({
    kind: 'synthetic',
    scenario: block.scenario ?? 'regimes',
    seed: 1,
    bars: BARS,
    interval: block.interval ?? '1D',
  });
  const result = useLabRegime(source);
  const regime = result.data;
  return (
    <section className={styles.lab} aria-label="Regime lab">
      <SourcePicker source={source} onChange={setSource} />
      {result.isError ? (
        <p className={styles.error} role="alert">
          Could not test the regime: {result.error.message}
        </p>
      ) : regime === undefined ? (
        <p className={styles.note}>Testing the returns&apos; memory…</p>
      ) : (
        <RegimeDetails regime={regime} />
      )}
    </section>
  );
}
