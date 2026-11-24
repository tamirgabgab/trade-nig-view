import type { Volatility } from '../api/volatility.ts';
import styles from './ForecastPanel.module.css';
import { VolatilityCone } from './VolatilityCone.tsx';
import { HORIZON_LABELS, pct0, pct1, volScale } from './volatilityFormat.ts';

/**
 * Everything the cone says (the Volatility tab and the learn widget): the cone, the numbers per
 * horizon, the squeeze against its base rate, where the variance comes from and the estimators'
 * scores.
 */
export function VolatilityDetails({ v, annual }: { v: Volatility; annual: boolean }) {
  const k = volScale(v, annual);
  const vol = (x: number | null) => (x === null ? '—' : (x * k).toFixed(1));
  const vol0 = (x: number | null) => (x === null ? '—' : (x * k).toFixed(0));
  const s = v.squeeze;
  const main = HORIZON_LABELS[v.main]?.toLowerCase() ?? v.main;
  const evidence =
    s === null || s.p === null || s.ci[0] === null || s.ci[1] === null
      ? null
      : s.ci[0] > s.baseRate
        ? 'more likely than after any bar'
        : s.ci[1] < s.baseRate
          ? 'less likely than after any bar'
          : 'no evidence either way (the interval holds the base rate)';

  return (
    <>
      <section className={styles.section} aria-label="Cone">
        <VolatilityCone v={v} annual={annual} />
        <div className={styles.scroll}>
          <table className={styles.table} aria-label="Volatility per horizon">
            <thead>
              <tr>
                <th scope="col">Horizon</th>
                <th scope="col">Now</th>
                <th scope="col">Rank</th>
                <th scope="col" title="The HAR forecast of the next h bars: median (10-90 %)">
                  HAR
                </th>
                <th scope="col">In 80 %</th>
              </tr>
            </thead>
            <tbody>
              {v.horizons.map((h) => (
                <tr key={h.label} aria-current={h.label === v.main}>
                  <th scope="row" title={`${String(h.bars)} bars`}>
                    {HORIZON_LABELS[h.label] ?? h.label}
                  </th>
                  <td title={`95 % interval ${vol0(h.ci[0])}–${vol0(h.ci[1])}`}>
                    {vol(h.current)}
                  </td>
                  <td>{h.rank.toFixed(0)}</td>
                  {h.forecast === null ? (
                    <td title="Fewer than 30 independent outcomes in the history">—</td>
                  ) : (
                    <td>
                      {vol(h.forecast.median)} ({vol0(h.forecast.low)}–{vol0(h.forecast.high)})
                    </td>
                  )}
                  <td>{pct0(h.forecast?.coverage ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          {annual ? '% a year' : '% a bar'} ({v.barsPerYear.toFixed(0)} bars a year). Now (hover:
          its 95 % interval); Rank: % of the history&apos;s windows at or below today. HAR: the next
          h bars, median (10–90 %); In 80 %: how often 500 past forecasts held the outcome.
        </p>
      </section>
      {s !== null && (
        <section className={styles.section} aria-label="Squeeze">
          <h3 className={styles.heading}>
            Squeeze ({main}){s.active ? ': now in a squeeze' : ''}
          </h3>
          <p className={styles.summary}>
            Rank among the last year: {s.rank === null ? '—' : s.rank.toFixed(0)} (squeeze at{' '}
            {String(s.threshold)} or below).
          </p>
          <table className={styles.table} aria-label="Squeeze statistics">
            <tbody>
              <tr>
                <th
                  scope="row"
                  title={`P(the next ${main} is ${String(s.factor)} times wilder | squeeze)`}
                >
                  P(×{String(s.factor)} | squeeze)
                </th>
                <td>
                  {pct0(s.p)} ({pct0(s.ci[0])}–{pct0(s.ci[1])})
                </td>
              </tr>
              <tr>
                <th scope="row" title="P(expansion) after any bar">
                  Base rate
                </th>
                <td>{pct0(s.baseRate)}</td>
              </tr>
              <tr>
                <th scope="row" title="Squeeze bars (those at least h bars apart)">
                  Events
                </th>
                <td>
                  {String(s.events)} ({String(s.independent)})
                </td>
              </tr>
              <tr>
                <th scope="row" title={`Median |${main} return| after a squeeze / after any bar`}>
                  |Move| after / any
                </th>
                <td>
                  {pct1(s.moveEvents[0])} / {pct1(s.moveAll[0])}
                </td>
              </tr>
            </tbody>
          </table>
          {evidence !== null && <p className={styles.summary}>Expansion: {evidence}.</p>}
        </section>
      )}
      <section className={styles.section} aria-label="Sources">
        <h3 className={styles.heading}>Where the variance comes from</h3>
        <table className={styles.table} aria-label="Variance shares">
          <thead>
            <tr>
              <th scope="col">Share</th>
              <th scope="col">Last {main}</th>
              <th scope="col">History</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" title="A stop does not protect against a gap">
                Overnight gaps
              </th>
              <td>{pct0(v.overnight.window)}</td>
              <td>{pct0(v.overnight.history)}</td>
            </tr>
            <tr>
              <th scope="row">Falling bars</th>
              <td>{pct0(v.downside.window)}</td>
              <td>{pct0(v.downside.history)}</td>
            </tr>
          </tbody>
        </table>
      </section>
      {v.scores.length > 0 && (
        <section className={styles.section} aria-label="Estimators">
          <h3 className={styles.heading}>Which estimator forecasts best ({main})</h3>
          <table className={styles.table} aria-label="Estimator scores">
            <thead>
              <tr>
                <th scope="col">Estimator</th>
                <th scope="col">QLIKE</th>
                {v.realized && <th scope="col">vs 1h realised</th>}
              </tr>
            </thead>
            <tbody>
              {v.scores.map((sc, i) => (
                <tr key={sc.estimator} aria-current={sc.estimator === v.estimator}>
                  <th scope="row">
                    {sc.label}
                    {i === 0 ? ' (best)' : ''}
                  </th>
                  <td>{sc.qlike.toFixed(3)}</td>
                  {v.realized && <td>{sc.bias === null ? '—' : `×${sc.bias.toFixed(2)}`}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.note}>
            Lower is better: each forecast of the next {main}&apos;s squared returns, scored on{' '}
            {String(v.scores[0]?.n ?? 0)} past bars.
          </p>
        </section>
      )}
    </>
  );
}
