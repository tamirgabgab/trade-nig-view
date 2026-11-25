import type { PlanCalibration } from '../api/tradePlan.ts';
import styles from './ReliabilityChart.module.css';

const S = 160;
const PAD = 22;

/**
 * The reliability diagram: per 10 % bin the mean forecast P(target) (x) against the share that
 * hit the target (y), dot area by count; a calibrated forecast lies on the diagonal.
 */
export function ReliabilityChart({ calibration }: { calibration: PlanCalibration }) {
  const scale = (v: number) => PAD + v * (S - 2 * PAD);
  const max = Math.max(1, ...calibration.count);
  return (
    <figure className={styles.figure}>
      <svg
        viewBox={`0 0 ${String(S)} ${String(S)}`}
        role="img"
        aria-label="Reliability: forecast P(target) against the observed share"
      >
        <line
          className={styles.grid}
          x1={scale(0)}
          y1={S - scale(0)}
          x2={scale(1)}
          y2={S - scale(1)}
        />
        <line
          className={styles.grid}
          x1={scale(0)}
          y1={S - scale(0)}
          x2={scale(1)}
          y2={S - scale(0)}
        />
        <line
          className={styles.grid}
          x1={scale(0)}
          y1={S - scale(0)}
          x2={scale(0)}
          y2={S - scale(1)}
        />
        {calibration.forecast.map((f, i) => {
          const o = calibration.observed[i];
          const n = calibration.count[i] ?? 0;
          if (f === null || o === null || o === undefined || n === 0) return null;
          return (
            <circle
              key={i}
              className={styles.dot}
              cx={scale(f)}
              cy={S - scale(o)}
              r={2 + 4 * Math.sqrt(n / max)}
            >
              <title>{`forecast ${(f * 100).toFixed(0)}%, observed ${(o * 100).toFixed(0)}% (${String(n)})`}</title>
            </circle>
          );
        })}
        <text className={styles.tick} x={scale(0)} y={S - 6}>
          0
        </text>
        <text className={styles.tickEnd} x={scale(1)} y={S - 6}>
          forecast 100%
        </text>
        <text className={styles.tick} x={2} y={scale(0) - 8}>
          observed
        </text>
      </svg>
    </figure>
  );
}
