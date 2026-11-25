import type { Forecast } from '../../api/forecast.ts';
import { atLevel, bandColor, type Outcome } from '../forecastOutcome.ts';
import { extent, scale } from '../plotScale.ts';
import styles from './Lab.module.css';

const W = 560;
const H = 180;
const HISTORY = 80;

/**
 * The last closes and the forecast's fan (50 / 80 / 95 % of the close) with its median; with
 * `outcomes`, the actual closes after the origin as a line and dots in their band's colour.
 */
export function ForecastFanChart({
  closes,
  forecast,
  outcomes = [],
  history = HISTORY,
}: {
  closes: readonly number[];
  forecast: Forecast;
  outcomes?: readonly Outcome[];
  history?: number;
}) {
  const past = closes.slice(-history);
  const k = forecast.horizons.length;
  const q = (values: readonly number[], level: number) => atLevel(forecast.levels, values, level);
  const lows = forecast.horizons.map((h) => q(h.close, 0.025));
  const highs = forecast.horizons.map((h) => q(h.close, 0.975));
  const x = scale([0, past.length - 1 + k], [4, W - 4]);
  const y = scale(extent([...past, ...lows, ...highs, ...outcomes.map((o) => o.actual)], 0.05), [
    H - 4,
    4,
  ]);
  const last = past.length - 1;
  const band = (lo: number, hi: number) => {
    const upper = forecast.horizons.map(
      (h, i) => `${x(last + i + 1).toFixed(1)},${y(q(h.close, hi)).toFixed(1)}`,
    );
    const lower = forecast.horizons
      .map((h, i) => `${x(last + i + 1).toFixed(1)},${y(q(h.close, lo)).toFixed(1)}`)
      .reverse();
    const start = `${x(last).toFixed(1)},${y(forecast.lastClose).toFixed(1)}`;
    return [start, ...upper, ...lower].join(' ');
  };
  return (
    <svg
      className={styles.fan}
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      role="img"
      aria-label={`The last ${String(past.length)} closes and the forecast of the next ${String(k)}${
        outcomes.length > 0 ? `, with the ${String(outcomes.length)} actual closes` : ''
      }`}
    >
      {(
        [
          [0.025, 0.975],
          [0.1, 0.9],
          [0.25, 0.75],
        ] as const
      ).map(([lo, hi]) => (
        <polygon key={lo} className={styles.fanBand} points={band(lo, hi)} />
      ))}
      <polyline
        className={styles.fanHistory}
        points={past.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(' ')}
      />
      <polyline
        className={styles.fanMedian}
        points={[
          `${x(last).toFixed(1)},${y(forecast.lastClose).toFixed(1)}`,
          ...forecast.horizons.map(
            (h, i) => `${x(last + i + 1).toFixed(1)},${y(q(h.close, 0.5)).toFixed(1)}`,
          ),
        ].join(' ')}
      />
      {outcomes.length > 0 && (
        <polyline
          className={styles.fanActual}
          points={[
            `${x(last).toFixed(1)},${y(forecast.lastClose).toFixed(1)}`,
            ...outcomes.map((o) => `${x(last + o.h).toFixed(1)},${y(o.actual).toFixed(1)}`),
          ].join(' ')}
        />
      )}
      {outcomes.map((o) => (
        <circle
          key={o.h}
          className={styles.fanDot}
          cx={x(last + o.h)}
          cy={y(o.actual)}
          r={4}
          style={{ fill: bandColor(o.band) }}
        >
          <title>{`+${String(o.h)}: ${o.band === null ? 'outside 95 %' : `inside ${String(o.band)} %`}`}</title>
        </circle>
      ))}
    </svg>
  );
}
