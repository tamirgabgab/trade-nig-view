import { useState } from 'react';

import { useLabForecast, type ForecastModel } from '../../api/forecast.ts';
import { useLab, type LabInterval, type LabSource, type Scenario } from '../../api/lab.ts';
import { ForecastHorizons } from '../ForecastHorizons.tsx';
import { ForecastValidation } from '../ForecastValidation.tsx';
import styles from './Lab.module.css';
import { ForecastFanChart } from './ForecastFanChart.tsx';
import { SourcePicker } from './SourcePicker.tsx';

export interface ForecastBlock {
  kind: 'forecast';
  scenario?: Scenario;
  interval?: LabInterval;
  k?: number;
  model?: ForecastModel;
}

/** Enough bars to tune (500 origins) and validate (500 more) the forecast out of sample. */
const BARS = 2000;

/**
 * The OHLC forecast on a random stock (a scenario) or a real symbol: the fan of the next k
 * closes, the forecast per bar ahead and the walk-forward validation against the naive model.
 */
export function ForecastLab({ block }: { block: ForecastBlock }) {
  const [source, setSource] = useState<LabSource>({
    kind: 'synthetic',
    scenario: block.scenario ?? 'volatility_regime',
    seed: 1,
    bars: BARS,
    interval: block.interval ?? '1D',
  });
  const [k, setK] = useState(block.k ?? 5);
  const [model, setModel] = useState<ForecastModel>(block.model ?? 'c');
  const forecast = useLabForecast({ source, k, model });
  const bars = useLab({ source, indicators: [], conditions: [], horizon: 1 });
  const f = forecast.data;

  return (
    <section className={styles.lab} aria-label="Forecast lab">
      <SourcePicker source={source} onChange={setSource} />
      <div className={styles.controls}>
        <label className={styles.slider}>
          <span>Bars ahead</span>
          <input
            type="range"
            min={1}
            max={20}
            value={k}
            onChange={(event) => {
              setK(Number(event.target.value));
            }}
          />
          <output className={styles.value}>{k}</output>
        </label>
        <select
          className={styles.select}
          aria-label="Model"
          value={model}
          onChange={(event) => {
            setModel(event.target.value === 'a' ? 'a' : 'c');
          }}
        >
          <option value="c">C: Ridge + HAR</option>
          <option value="a">A: OLS</option>
        </select>
      </div>
      {forecast.isError ? (
        <p className={styles.error} role="alert">
          Could not forecast: {forecast.error.message}
        </p>
      ) : f === undefined || bars.data === undefined ? (
        <p className={styles.note}>Tuning and validating the models (a few seconds)…</p>
      ) : (
        <>
          <ForecastFanChart closes={bars.data.close} forecast={f} />
          <ForecastHorizons forecast={f} decimals={2} />
          <ForecastValidation forecast={f} />
        </>
      )}
    </section>
  );
}
