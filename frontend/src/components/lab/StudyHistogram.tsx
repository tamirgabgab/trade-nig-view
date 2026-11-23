import type { Study } from '../../api/lab.ts';
import { extent, scale } from '../plotScale.ts';
import styles from './Lab.module.css';
import { logToPercent } from './labModel.ts';

const pct = (r: number) => `${logToPercent(r) >= 0 ? '+' : ''}${logToPercent(r).toFixed(1)} %`;

const W = 560;
const H = 90;

/** The return distributions of an event study: any bar (wide bars) vs after the signal. */
export function StudyHistogram({ study }: { study: Study }) {
  const { edges, events, baseline } = study.histogram;
  if (edges.length < 2) return null;
  const x = scale([edges[0] ?? 0, edges.at(-1) ?? 1], [40, W - 8]);
  const y = scale([0, extent([...events, ...baseline], 0.1)[1]], [H - 18, 4]);
  const bars = (values: number[], cls: string, inset: number) =>
    values.map((v, i) => {
      const x0 = x(edges[i] ?? 0) + inset;
      const x1 = x(edges[i + 1] ?? 0) - inset;
      return (
        <rect
          key={`${cls}${String(i)}`}
          className={cls}
          x={x0}
          width={Math.max(x1 - x0, 1)}
          y={y(v)}
          height={H - 18 - y(v)}
        />
      );
    });
  return (
    <figure className={styles.histogram}>
      <figcaption>
        Distribution of {study.horizon}-bar returns: <span className={styles.keyBase}>any bar</span>{' '}
        vs <span className={styles.keyEvent}>after the signal</span>
      </figcaption>
      <svg viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label="Return distributions">
        {bars(baseline, styles.barBase ?? '', 0.5)}
        {bars(events, styles.barEvent ?? '', 3)}
        <line className={styles.zero} x1={x(0)} x2={x(0)} y1={2} y2={H - 18} />
        <text className={styles.histTick} x={x(edges[0] ?? 0)} y={H - 4}>
          {pct(edges[0] ?? 0)}
        </text>
        <text className={styles.histTickEnd} x={x(edges.at(-1) ?? 0)} y={H - 4}>
          {pct(edges.at(-1) ?? 0)}
        </text>
      </svg>
    </figure>
  );
}
