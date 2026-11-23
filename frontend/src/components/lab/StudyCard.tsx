import type { Study } from '../../api/lab.ts';
import styles from './Lab.module.css';
import { logToPercent } from './labModel.ts';
import { StudyHistogram } from './StudyHistogram.tsx';

const pct = (r: number | null, digits = 2) =>
  r === null ? '—' : `${logToPercent(r) >= 0 ? '+' : ''}${logToPercent(r).toFixed(digits)} %`;
const share = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(0)} %`);

/**
 * An event study's result: what followed the signal vs what follows any bar, the edge with its
 * 95 % interval and a plain verdict, and the two return distributions.
 */
export function StudyCard({ study }: { study: Study }) {
  const [lo, hi] = study.ci95;
  const decided = lo !== null && hi !== null && (lo > 0 || hi < 0);
  const verdict =
    study.events.n < 10
      ? `Only ${String(study.events.n)} events: too few to say anything.`
      : decided
        ? 'The 95 % interval excludes zero: on this sample the rule did differ from an average bar.'
        : 'The 95 % interval includes zero: no evidence that the rule beats an average bar here.';

  return (
    <div className={styles.study}>
      <table className={styles.stats}>
        <thead>
          <tr>
            <th scope="col">{study.horizon}-bar return</th>
            <th scope="col">Count</th>
            <th scope="col">Mean</th>
            <th scope="col">Median</th>
            <th scope="col">Up</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">After the signal</th>
            <td>{study.events.n}</td>
            <td>{pct(study.events.mean)}</td>
            <td>{pct(study.events.median)}</td>
            <td>{share(study.events.hitRate)}</td>
          </tr>
          <tr>
            <th scope="row">Any bar</th>
            <td>{study.baseline.n}</td>
            <td>{pct(study.baseline.mean)}</td>
            <td>{pct(study.baseline.median)}</td>
            <td>{share(study.baseline.hitRate)}</td>
          </tr>
        </tbody>
      </table>
      <p className={styles.edge}>
        Edge {pct(study.edge)} · 95 % interval [{pct(lo)}, {pct(hi)}] · t ={' '}
        {study.tStat === null ? '—' : study.tStat.toFixed(2)}
      </p>
      <p className={styles.verdict} data-decided={decided || undefined}>
        {verdict}
      </p>
      <StudyHistogram study={study} />
      <p className={styles.note}>
        At most one signal counts per look-ahead window; one sample, one rule. Not a backtest and
        not investment advice.
      </p>
    </div>
  );
}
