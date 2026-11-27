import { useReturnPreview, type ReturnShape } from '../api/synthetic.ts';
import { DistributionChart } from './DistributionChart.tsx';
import { useDebounced } from './lab/useDebounced.ts';
import styles from './SyntheticSymbolDialog.module.css';

const pct = (v: number) => `${v.toFixed(1)} %`;
const moment = (v: number | null) => (v === null ? '∞' : v.toFixed(2));

/** What a parametric symbol's statistics draw (null: nothing to ask): the daily returns as a
 *  histogram over the family's density, and the drawn numbers next to the targets. */
export function ReturnPreview({
  shape,
  seed,
  bars,
}: {
  shape: ReturnShape | null;
  seed: number;
  bars: number;
}) {
  const request = useDebounced(shape === null ? null : { shape, seed, bars }, 300);
  const preview = useReturnPreview(request);
  if (shape === null) return null;
  if (preview.error !== null) {
    return (
      <p className={styles.error} role="alert">
        No preview: {preview.error.message}
      </p>
    );
  }
  const p = preview.data;
  if (p === undefined) return <p className={styles.hint}>Drawing the preview…</p>;
  const curve = p.curveX.map((x, i) => [x, p.curveCounts[i] ?? 0] as const);
  return (
    <section className={styles.preview} aria-label="Preview">
      <DistributionChart
        dist={p}
        curve={curve}
        label="Histogram of the daily returns over the distribution's density"
      />
      <table className={styles.stats}>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">Drawn</th>
            <th scope="col">Asked</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Mean a year</th>
            <td>{pct(p.meanPct)}</td>
            <td>{pct(shape.meanPct)}</td>
          </tr>
          <tr>
            <th scope="row">Daily σ × √year</th>
            <td>{pct(p.volPct)}</td>
            <td>{pct(shape.volPct)}</td>
          </tr>
          <tr>
            <th scope="row">Skewness</th>
            <td>{moment(p.skewness)}</td>
            <td>{moment(p.familySkewness)}</td>
          </tr>
          <tr>
            <th scope="row">Excess kurtosis</th>
            <td>{moment(p.excessKurtosis)}</td>
            <td>{moment(p.familyExcessKurtosis)}</td>
          </tr>
        </tbody>
      </table>
      <p className={styles.hint}>
        Asked skewness and kurtosis are the distribution&apos;s; memory, jumps and GARCH change them
        {shape.memory !== 0 && ', and with memory σ is the spread of a whole year'}.
      </p>
      {p.floored > 0 && (
        <p className={styles.warning} role="note">
          The floor (a fall of 99 % a day at most) caught {p.floored} days: lower σ or the jumps.
        </p>
      )}
    </section>
  );
}
