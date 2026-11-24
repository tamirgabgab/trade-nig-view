import { useState } from 'react';

import type { Forecast, Validation } from '../api/forecast.ts';
import styles from './ForecastPanel.module.css';

const NAMES: Record<Validation['model'], string> = {
  naive: 'Naive',
  a: 'A: OLS',
  c: 'C: Ridge + HAR',
};
const pct = (v: number | null, digits = 1) => (v === null ? '—' : `${(v * 100).toFixed(digits)}%`);

/**
 * Walk-forward scores of the three models at one horizon: the pinball loss against the naive
 * benchmark (negative = better), the coverage of the close's 50 / 80 / 95 % intervals, the
 * out-of-sample R² of the return and the hit rate.
 */
export function ForecastValidation({ forecast }: { forecast: Forecast }) {
  const [h, setH] = useState(1);
  const rows = forecast.validation.filter((v) => v.h === h);
  const naive = rows.find((v) => v.model === 'naive')?.pinball ?? null;
  return (
    <div>
      <label className={styles.field}>
        Bars ahead
        <select
          className={styles.select}
          value={h}
          onChange={(event) => {
            setH(Number(event.target.value));
          }}
        >
          {forecast.horizons.map((x) => (
            <option key={x.h} value={x.h}>
              {x.h}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.scroll}>
        <table className={styles.table} aria-label="Validation out of sample">
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col" title="Mean pinball loss against the naive model; lower is better">
                vs naive
              </th>
              <th scope="col" title="Share of closes inside the 50 / 80 / 95 % intervals">
                In 50/80/95
              </th>
              <th scope="col" title="Out-of-sample R² of the return against a zero-mean walk">
                R²
              </th>
              <th scope="col" title="Right directions among the forecasts that pick one">
                Hit
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.model} aria-current={v.model === forecast.model ? 'true' : undefined}>
                <th scope="row">{NAMES[v.model]}</th>
                <td>
                  {naive === null || v.model === 'naive'
                    ? '—'
                    : `${v.pinball <= naive ? '' : '+'}${(((v.pinball - naive) / naive) * 100).toFixed(1)}%`}
                </td>
                <td>{v.coverage.map((c) => pct(c, 0).replace('%', '')).join('/')}</td>
                <td>{v.r2 === null ? '—' : v.r2.toFixed(3)}</td>
                <td>{pct(v.hitRate, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        {rows[0]?.n ?? 0} forecasts out of sample, each made with bars up to its own date only.
      </p>
    </div>
  );
}
