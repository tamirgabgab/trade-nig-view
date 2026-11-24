import { useMemo } from 'react';

import { useChartDataStore } from '../store/chartDataStore.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import {
  rangeStats,
  type Distribution,
  type ReturnBasis,
  type ReturnKind,
} from '../drawings/returnStats.ts';
import { DistributionChart } from './DistributionChart.tsx';
import { formatBarTime } from './formatClock.ts';
import styles from './StatisticsPanel.module.css';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';

const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(3)}%` : '—');

function Numbers({ dist, rows }: { dist: Distribution; rows?: [string, string][] }) {
  return (
    <table className={styles.numbers}>
      <tbody>
        {(
          [
            ['Bars (n)', String(dist.n)],
            ['Mean', pct(dist.mean)],
            ['Standard deviation', pct(dist.std)],
            ['Min / max', `${pct(dist.min)} / ${pct(dist.max)}`],
            ...(rows ?? []),
          ] as [string, string][]
        ).map(([name, value]) => (
          <tr key={name}>
            <th scope="row">{name}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The Statistics tab: the distribution of the bar returns (and of their change, the curvature)
 * inside the selected Statistics range, or the last one drawn. Computed from the chart's bars,
 * so it follows ADJ and stops at the replay cursor.
 */
export function StatisticsPanel() {
  const zone = useDisplayTimeZone();
  const drawings = useDrawingStore((s) => s.drawings);
  const selectedId = useDrawingStore((s) => s.selectedId);
  const update = useDrawingStore((s) => s.update);
  const bars = useChartDataStore((s) => s.data?.bars);
  const heikinAshi = useChartStore((s) => s.chartType === 'heikin_ashi');
  const ranges = drawings.filter((d) => d.type === 'stats_range');
  const range = ranges.find((d) => d.id === selectedId) ?? ranges.at(-1);
  const kind: ReturnKind = range?.props.returns ?? 'log';
  const basis: ReturnBasis = range?.props.basis ?? 'close';
  const [a, b] = range?.points ?? [];
  const stats = useMemo(
    () =>
      bars === undefined || a === undefined || b === undefined
        ? null
        : rangeStats(bars, a.time, b.time, kind, basis),
    [bars, a, b, kind, basis],
  );

  if (range === undefined) {
    return (
      <p className={styles.empty}>
        Draw a range with the Statistics tool (measurement tools in the left toolbar) to see the
        distribution of the bars&apos; returns in it.
      </p>
    );
  }
  const k = stats?.barsPerYear ?? null;
  const returns = stats?.returns ?? null;
  const curvature = stats?.curvature ?? null;

  return (
    <div className={styles.panel}>
      <div className={styles.settings}>
        <label className={styles.field}>
          Returns
          <select
            className={styles.select}
            value={kind}
            onChange={(event) => {
              const returns = event.target.value as ReturnKind;
              update(range.id, (d) => ({ ...d, props: { ...d.props, returns } }));
            }}
          >
            <option value="log">Log</option>
            <option value="simple">Simple</option>
          </select>
        </label>
        <label className={styles.field}>
          From
          <select
            className={styles.select}
            value={basis}
            onChange={(event) => {
              const basis = event.target.value as ReturnBasis;
              update(range.id, (d) => ({ ...d, props: { ...d.props, basis } }));
            }}
          >
            <option value="close">Previous close</option>
            <option value="open">Open (within the bar)</option>
          </select>
        </label>
      </div>
      {heikinAshi && (
        <p className={styles.note} role="note">
          The chart shows Heikin Ashi bars, which are averages, not prices: switch the chart type to
          candles for real returns.
        </p>
      )}
      {stats === null ? (
        <p className={styles.empty}>No bars of this chart in the range.</p>
      ) : (
        <>
          <p className={styles.summary}>
            {formatBarTime(stats.firstTime, zone)} → {formatBarTime(stats.lastTime, zone)} ·{' '}
            {stats.bars} bars
            {ranges.length > 1 &&
              range.id !== selectedId &&
              ' (the last range drawn; select another to see it)'}
          </p>
          <section aria-label="Returns">
            <h3 className={styles.heading}>{kind === 'log' ? 'Log' : 'Simple'} return per bar</h3>
            {returns === null ? (
              <p className={styles.empty}>
                No returns: the range has only the chart&apos;s first bar.
              </p>
            ) : (
              <>
                <DistributionChart
                  dist={returns}
                  label="Histogram of the returns with a normal curve"
                />
                <Numbers
                  dist={returns}
                  rows={
                    k === null
                      ? []
                      : [
                          ['Annualised mean', pct(returns.mean * k)],
                          ['Annualised volatility', pct(returns.std * Math.sqrt(k))],
                          ['Bars per year', k.toFixed(1)],
                        ]
                  }
                />
              </>
            )}
          </section>
          <section aria-label="Curvature">
            <h3 className={styles.heading}>Curvature: change of the return</h3>
            {curvature === null ? (
              <p className={styles.empty}>Needs at least two returns.</p>
            ) : (
              <>
                <DistributionChart
                  dist={curvature}
                  label="Histogram of the change of the returns with a normal curve"
                />
                <Numbers dist={curvature} />
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
