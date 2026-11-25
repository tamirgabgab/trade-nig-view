import type { Forecast } from '../api/forecast.ts';
import { formatPrice } from './formatNumber.ts';
import { atLevel } from './forecastOutcome.ts';
import styles from './ForecastTooltip.module.css';

/**
 * Over a forecast candle: its bar ahead, the median close, the close's 50 / 80 / 95 % ranges and
 * P(up), next to the pointer. A click on the fan opens the Forecast tab.
 */
export function ForecastTooltip({
  forecast,
  h,
  x,
  y,
  left,
  up,
  decimals,
}: {
  forecast: Forecast;
  h: number;
  x: number;
  y: number;
  /** Open left of / above the pointer (near the chart's right or bottom edge). */
  left: boolean;
  up: boolean;
  decimals: number;
}) {
  const hz = forecast.horizons[h - 1];
  if (hz === undefined) return null;
  const q = (level: number) => formatPrice(atLevel(forecast.levels, hz.close, level), decimals);
  return (
    <div
      className={styles.tooltip}
      style={{
        left: x + (left ? -14 : 14),
        top: y + (up ? -14 : 14),
        transform: `translate(${left ? '-100%' : '0'}, ${up ? '-100%' : '0'})`,
      }}
      role="tooltip"
    >
      <div className={styles.title}>
        Forecast +{h} bar{h === 1 ? '' : 's'}
      </div>
      <dl className={styles.rows}>
        <dt>Median close</dt>
        <dd>{q(0.5)}</dd>
        <dt>50 %</dt>
        <dd>
          {q(0.25)} – {q(0.75)}
        </dd>
        <dt>80 %</dt>
        <dd>
          {q(0.1)} – {q(0.9)}
        </dd>
        <dt>95 %</dt>
        <dd>
          {q(0.025)} – {q(0.975)}
        </dd>
        <dt>P(up)</dt>
        <dd>{(hz.pUp * 100).toFixed(1)}%</dd>
      </dl>
      <div className={styles.hint}>Click the fan for the details</div>
    </div>
  );
}
