import type { Validation } from '../api/forecast.ts';
import { pct, pitVerdict } from './forecastOutcome.ts';
import styles from './ForecastPanel.module.css';

const NOMINAL = [0.5, 0.8, 0.95] as const;
const MODELS: readonly { model: Validation['model']; name: string; className: string }[] = [
  { model: 'naive', name: 'Naive', className: 'barNaive' },
  { model: 'a', name: 'A', className: 'barA' },
  { model: 'c', name: 'C', className: 'barC' },
];
const W = 300;
const LABEL = 40;
const ROW = 10;
const GROUP = 3 * ROW + 10;
const PIT_H = 90;
/** The right column with each bar's model and share. */
const VALUES = 64;

/**
 * Calibration out of sample at one horizon: the share of closes inside the 50 / 80 / 95 %
 * intervals for each model against its target, and the PIT histogram of the chart's model
 * (where each outcome fell in its forecast: flat if calibrated).
 */
export function ForecastCalibration({
  rows,
  model,
}: {
  rows: readonly Validation[];
  model: Validation['model'];
}) {
  const x = (share: number) => LABEL + share * (W - LABEL - VALUES);
  const shown = MODELS.filter((m) => rows.some((r) => r.model === m.model));
  const pit = rows.find((r) => r.model === model);
  const top = Math.max(0.2, ...(pit?.pit ?? [])) * 1.1;
  const y = (share: number) => PIT_H - 14 - (share / top) * (PIT_H - 20);
  const bin = (W - LABEL) / 10;
  return (
    <div className={styles.calibration}>
      <svg
        viewBox={`0 0 ${String(W)} ${String(NOMINAL.length * GROUP)}`}
        role="img"
        aria-label="Coverage of the 50, 80 and 95 % intervals against their targets"
      >
        {NOMINAL.map((nominal, g) => (
          <g key={nominal}>
            <text className={styles.axis} x={0} y={g * GROUP + 1.5 * ROW + 4}>
              {pct(nominal)}
            </text>
            {shown.map((m, i) => {
              const share = rows.find((r) => r.model === m.model)?.coverage[g] ?? 0;
              const rowTop = g * GROUP + i * ROW;
              return (
                <g key={m.model}>
                  <rect
                    className={styles[m.className]}
                    x={LABEL}
                    y={rowTop + 1}
                    width={Math.max(x(share) - LABEL, 1)}
                    height={ROW - 3}
                  >
                    <title>{`${m.name}: ${pct(share)} inside (target ${pct(nominal)})`}</title>
                  </rect>
                  <text className={styles.axis} x={W - VALUES + 6} y={rowTop + ROW - 2}>
                    {m.name} {pct(share)}
                  </text>
                </g>
              );
            })}
            <line
              className={styles.target}
              x1={x(nominal)}
              x2={x(nominal)}
              y1={g * GROUP - 2}
              y2={g * GROUP + 3 * ROW + 1}
            />
          </g>
        ))}
      </svg>
      <p className={styles.note}>The dashed line is each interval&apos;s target.</p>
      {pit !== undefined && pit.pit.length === 10 && (
        <>
          <svg
            viewBox={`0 0 ${String(W)} ${String(PIT_H)}`}
            role="img"
            aria-label="Where the actual closes fell in their forecasts (PIT histogram)"
          >
            <text className={styles.axis} x={0} y={12}>
              PIT
            </text>
            {pit.pit.map((share, i) => (
              <rect
                key={i}
                className={styles.barC}
                x={LABEL + i * bin + 1}
                y={y(share)}
                width={bin - 2}
                height={PIT_H - 14 - y(share)}
              >
                <title>{`${String(i * 10)}–${String(i * 10 + 10)} %: ${pct(share)}`}</title>
              </rect>
            ))}
            <line className={styles.target} x1={LABEL} x2={W} y1={y(0.1)} y2={y(0.1)} />
            {[0, 50, 100].map((t) => (
              <text
                key={t}
                className={styles.axis}
                x={LABEL + (t / 100) * (W - LABEL)}
                y={PIT_H - 2}
                textAnchor={t === 0 ? 'start' : t === 100 ? 'end' : 'middle'}
              >
                {t}
              </text>
            ))}
          </svg>
          <p className={styles.note}>
            Where each actual close fell in its forecast, 0 to 100 (dashed: 10 % per bin if
            calibrated). {pitVerdict(pit.pit, pit.n)}
          </p>
        </>
      )}
    </div>
  );
}
