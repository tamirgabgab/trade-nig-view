import type { Volatility } from '../api/volatility.ts';
import { extent, niceTicks, scale } from './plotScale.ts';
import styles from './VolatilityCone.module.css';
import { HORIZON_LABELS, volScale } from './volatilityFormat.ts';

const W = 300;
const H = 150;
const LEFT = 34;
const RIGHT = 20;
const TOP = 6;
const BOTTOM = 16;
/** Percentile pairs of the bands (indexes into `levels`: 0/100, 10/90, 25/75) and their fill. */
const BANDS = [
  [0, 6, 0.1],
  [1, 5, 0.16],
  [2, 4, 0.24],
] as const;

/**
 * The volatility cone: per horizon (x, evenly spaced) the history's percentile bands of the
 * estimator, its median, today's value with its 95 % interval (red) and the HAR forecast's median
 * and 10-90 % range (dashed), in % a year or % a bar.
 */
export function VolatilityCone({ v, annual }: { v: Volatility; annual: boolean }) {
  const k = volScale(v, annual);
  const hs = v.horizons;
  const all = hs.flatMap((h) => [
    ...h.percentiles,
    h.current,
    h.ci[0],
    h.ci[1],
    h.forecast?.low ?? null,
    h.forecast?.high ?? null,
  ]);
  const [lo, hi] = extent(
    all.map((x) => (x === null ? null : x * k)),
    0.06,
  );
  const y = scale([Math.max(lo, 0), hi], [H - BOTTOM, TOP]);
  const x = (i: number) =>
    hs.length > 1 ? LEFT + ((W - LEFT - RIGHT) * i) / (hs.length - 1) : (LEFT + W - RIGHT) / 2;
  const line = (values: (number | null)[]) =>
    values
      .map((val, i) => (val === null ? null : `${x(i).toFixed(1)},${y(val * k).toFixed(1)}`))
      .filter((p) => p !== null)
      .join(' ');
  const polygon = (a: number, b: number) =>
    [
      ...hs.map((h, i) => `${x(i).toFixed(1)},${y((h.percentiles[b] ?? 0) * k).toFixed(1)}`),
      ...hs
        .map((h, i) => `${x(i).toFixed(1)},${y((h.percentiles[a] ?? 0) * k).toFixed(1)}`)
        .reverse(),
    ].join(' ');
  const forecasts = hs.map((h) => h.forecast?.median ?? null);
  const unit = annual ? '% / year' : '% / bar';

  return (
    <figure className={styles.figure}>
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        role="img"
        aria-label={`Volatility cone of ${v.symbol}, ${unit}`}
      >
        {niceTicks(Math.max(lo, 0), hi, 4).map((t) => (
          <g key={t}>
            <line className={styles.grid} x1={LEFT} x2={W - RIGHT} y1={y(t)} y2={y(t)} />
            <text className={styles.tickEnd} x={LEFT - 4} y={y(t) + 3}>
              {t.toFixed(t < 10 ? 1 : 0)}
            </text>
          </g>
        ))}
        {BANDS.map(([a, b, alpha]) => (
          <polygon key={a} className={styles.band} points={polygon(a, b)} opacity={alpha} />
        ))}
        <polyline
          className={styles.median}
          points={line(hs.map((h) => h.percentiles[3] ?? null))}
        />
        {forecasts.some((f) => f !== null) && (
          <polyline className={styles.forecast} points={line(forecasts)} />
        )}
        {hs.map((h, i) =>
          h.forecast === null ? null : (
            <line
              key={`f${h.label}`}
              className={styles.forecastRange}
              x1={x(i) + 5}
              x2={x(i) + 5}
              y1={y(h.forecast.low * k)}
              y2={y(h.forecast.high * k)}
            />
          ),
        )}
        {hs.map((h, i) => (
          <g key={h.label}>
            {h.ci[0] !== null && h.ci[1] !== null && (
              <line
                className={styles.ci}
                x1={x(i)}
                x2={x(i)}
                y1={y(h.ci[0] * k)}
                y2={y(h.ci[1] * k)}
              />
            )}
            <circle className={styles.now} cx={x(i)} cy={y(h.current * k)} r={3}>
              <title>{`${HORIZON_LABELS[h.label] ?? h.label}: ${(h.current * k).toFixed(1)} ${unit}, rank ${h.rank.toFixed(0)}`}</title>
            </circle>
            <text className={styles.label} x={x(i)} y={H - 3}>
              {HORIZON_LABELS[h.label] ?? h.label}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className={styles.legend}>
        <span>
          <span className={`${styles.swatch} ${styles.swatchBand}`} />
          History: min-max, 10-90, 25-75 %, median
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.swatchNow}`} />
          Today (95 % interval)
        </span>
        <span>- - HAR forecast (10-90 %)</span>
      </figcaption>
    </figure>
  );
}
