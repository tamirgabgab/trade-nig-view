import { type Sequence, type ShuffleRequest, useShufflePreview } from '../api/synthetic.ts';
import { useDebounced } from './lab/useDebounced.ts';
import { extent, scale } from './plotScale.ts';
import styles from './SyntheticSymbolDialog.module.css';

const W = 300;
const H = 120;
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`;

const ROWS: readonly [string, (m: Sequence) => string][] = [
  ['Total return', (m) => pct(m.totalReturnPct)],
  ['Deepest drawdown', (m) => pct(m.maxDrawdownPct)],
  ['Worst year', (m) => `${pct(m.worstYearPct)} (${String(m.worstYear)})`],
  ['Longest losing streak', (m) => `${String(m.longestLosingStreak)} days`],
];

/** A shuffled copy against its source (null: nothing to ask): both closes on a log scale, and
 *  their sequences side by side. */
export function ShufflePreview({
  request,
  sourceName,
}: {
  request: ShuffleRequest | null;
  sourceName: string;
}) {
  const preview = useShufflePreview(useDebounced(request, 300));
  if (request === null) return null;
  if (preview.error !== null) {
    return (
      <p className={styles.error} role="alert">
        No preview: {preview.error.message}
      </p>
    );
  }
  const p = preview.data;
  if (p === undefined) return <p className={styles.hint}>Shuffling the preview…</p>;
  const x = scale([0, Math.max(p.dates.length - 1, 1)], [4, W - 4]);
  const y = scale(extent([...p.sourceClose, ...p.copyClose], 0.04), [H - 4, 4], true);
  const line = (closes: number[]) =>
    closes.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
  return (
    <section className={styles.preview} aria-label="Preview">
      <svg
        className={styles.paths}
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        role="img"
        aria-label={`${sourceName} and its shuffled copy, log scale`}
      >
        <polyline className={styles.sourceLine} points={line(p.sourceClose)} />
        <polyline className={styles.copyLine} points={line(p.copyClose)} />
      </svg>
      <p className={styles.hint}>
        <span className={styles.sourceKey}>{sourceName}</span> against{' '}
        <span className={styles.copyKey}>the copy</span>: {String(p.bars)} days from {p.start} to{' '}
        {p.end}, {String(p.blocks)} blocks.
      </p>
      <table className={styles.stats}>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">{sourceName}</th>
            <th scope="col">Copy</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, show]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{show(p.sourceMeasures)}</td>
              <td>{show(p.copyMeasures)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
