import type { Forecast } from '../api/forecast.ts';
import { formatPrice } from './formatNumber.ts';
import { atLevel } from './forecastOutcome.ts';
import styles from './ForecastPanel.module.css';

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** One row per bar ahead: the median close, its 80 % interval, P(up) and the expected range. */
export function ForecastHorizons({ forecast, decimals }: { forecast: Forecast; decimals: number }) {
  const q = (values: readonly number[], level: number) =>
    formatPrice(atLevel(forecast.levels, values, level), decimals);
  return (
    <table className={styles.table} aria-label="Forecast per bar ahead">
      <thead>
        <tr>
          <th scope="col">Bar</th>
          <th scope="col">Median close</th>
          <th scope="col">80 % range</th>
          <th scope="col">P(up)</th>
          <th scope="col">Range</th>
        </tr>
      </thead>
      <tbody>
        {forecast.horizons.map((h) => (
          <tr key={h.h}>
            <th scope="row">+{h.h}</th>
            <td>{q(h.close, 0.5)}</td>
            <td>
              {q(h.close, 0.1)} – {q(h.close, 0.9)}
            </td>
            <td>{pct(h.pUp)}</td>
            <td>{pct(h.expectedRange)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
