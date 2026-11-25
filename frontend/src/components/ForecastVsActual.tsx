import type { Bar } from '../api/bars.ts';
import type { Forecast } from '../api/forecast.ts';
import { formatBarTime } from './formatClock.ts';
import { formatPrice } from './formatNumber.ts';
import { bandColor, outcomeSummary, type Band, type Outcome } from './forecastOutcome.ts';
import { ForecastFanChart } from './lab/ForecastFanChart.tsx';
import styles from './ForecastPanel.module.css';

const HISTORY = 12;
const LEGEND: readonly [Band, string][] = [
  [50, 'inside 50 %'],
  [80, 'inside 80 %'],
  [95, 'inside 95 %'],
  [null, 'outside'],
];

const percentile = (p: number) => (p === 0 ? '<1' : p === 99 ? '>99' : String(p));
const signed = (v: number, text: string) => `${v > 0 ? '+' : ''}${text}`;

/**
 * The forecast against what happened next: the fan with the actual closes as dots in their
 * band's colour, a one-line score and, per bar ahead, the median, the actual close, the error,
 * the band and the actual close's percentile in the forecast.
 */
export function ForecastVsActual({
  forecast,
  bars,
  outcomes,
  decimals,
  zone,
}: {
  forecast: Forecast;
  bars: readonly Bar[];
  outcomes: readonly Outcome[];
  decimals: number;
  zone: string;
}) {
  const origin = bars.findIndex((bar) => bar.time === forecast.lastTime);
  const closes = bars.slice(0, origin + 1).map((bar) => bar.close);
  return (
    <>
      <p className={styles.outcomeSummary} role="status">
        {outcomeSummary(outcomes, forecast.horizons.length)}
      </p>
      <ul className={styles.legend} aria-label="Bands">
        {LEGEND.map(([band, label]) => (
          <li key={label}>
            <span className={styles.swatch} style={{ background: bandColor(band) }} />
            {label}
          </li>
        ))}
      </ul>
      <ForecastFanChart closes={closes} forecast={forecast} outcomes={outcomes} history={HISTORY} />
      <div className={styles.scroll}>
        <table className={styles.table} aria-label="Forecast vs actual">
          <thead>
            <tr>
              <th scope="col">Bar</th>
              <th scope="col">Median</th>
              <th scope="col">Actual</th>
              <th scope="col" title="Actual minus the median close">
                Error
              </th>
              <th scope="col" title="The narrowest forecast interval that holds the actual close">
                Band
              </th>
              <th scope="col" title="Where the actual close falls in the forecast, 0 to 100">
                Pctl
              </th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <tr key={o.h}>
                <th scope="row" title={formatBarTime(o.time, zone)}>
                  +{o.h}
                </th>
                <td>{formatPrice(o.median, decimals)}</td>
                <td>{formatPrice(o.actual, decimals)}</td>
                <td>{signed(o.error, `${(o.errorPct * 100).toFixed(2)}%`)}</td>
                <td>
                  <span className={styles.swatch} style={{ background: bandColor(o.band) }} />
                  {o.band === null ? 'out' : `${String(o.band)} %`}
                </td>
                <td>{percentile(o.percentile)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
