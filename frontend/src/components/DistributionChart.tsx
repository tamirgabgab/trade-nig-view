import type { Distribution } from '../drawings/returnStats.ts';
import { extent, scale } from './plotScale.ts';
import styles from './StatisticsPanel.module.css';

const W = 300;
const H = 120;
const BOTTOM = 16;
const CURVE_POINTS = 80;

const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;

/**
 * A histogram of `dist` with the normal curve of the same mean and standard deviation over it
 * (expected count per bin: n x bin width x the normal density), so fat tails and skew show.
 */
export function DistributionChart({ dist, label }: { dist: Distribution; label: string }) {
  const { edges, counts, n, mean, std } = dist;
  const lo = edges[0] ?? 0;
  const hi = edges.at(-1) ?? 1;
  const width = (hi - lo) / Math.max(counts.length, 1);
  const normal = Number.isFinite(std) && std > 0;
  const curve = normal
    ? Array.from({ length: CURVE_POINTS + 1 }, (_, i) => {
        const v = lo + ((hi - lo) * i) / CURVE_POINTS;
        const z = (v - mean) / std;
        return [v, (n * width * Math.exp(-0.5 * z * z)) / (std * Math.sqrt(2 * Math.PI))] as const;
      })
    : [];
  const x = scale([lo, hi], [4, W - 4]);
  const y = scale([0, extent([...counts, ...curve.map(([, c]) => c)], 0.08)[1]], [H - BOTTOM, 4]);

  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label={label}>
        {counts.map((c, i) => {
          const x0 = x(edges[i] ?? lo) + 0.5;
          const x1 = x(edges[i + 1] ?? hi) - 0.5;
          return (
            <rect
              key={i}
              className={styles.bin}
              x={x0}
              width={Math.max(x1 - x0, 1)}
              y={y(c)}
              height={H - BOTTOM - y(c)}
            >
              <title>{`${pct(edges[i] ?? lo)} to ${pct(edges[i + 1] ?? hi)}: ${String(c)}`}</title>
            </rect>
          );
        })}
        {curve.length > 0 && (
          <polyline
            className={styles.normal}
            points={curve.map(([v, c]) => `${x(v).toFixed(1)},${y(c).toFixed(1)}`).join(' ')}
          />
        )}
        {lo <= 0 && hi >= 0 && (
          <line className={styles.zero} x1={x(0)} x2={x(0)} y1={2} y2={H - BOTTOM} />
        )}
        <text className={styles.tick} x={4} y={H - 3}>
          {pct(lo)}
        </text>
        <text className={styles.tickEnd} x={W - 4} y={H - 3}>
          {pct(hi)}
        </text>
      </svg>
    </figure>
  );
}
