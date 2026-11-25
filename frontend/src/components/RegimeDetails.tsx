import type { Regime, RegimeLabel } from '../api/regime.ts';
import styles from './ForecastPanel.module.css';

const LABELS: Record<RegimeLabel, string> = {
  trend: 'Trending',
  random: 'Random',
  reversion: 'Mean-reverting',
};
const ORDER: readonly RegimeLabel[] = ['trend', 'random', 'reversion'];
const SHORT: Record<RegimeLabel, string> = {
  trend: 'Trend',
  random: 'Random',
  reversion: 'Revert',
};
const f2 = (x: number | null) => (x === null || !Number.isFinite(x) ? '—' : x.toFixed(2));
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : '—');

/**
 * The regime report (the Regime tab and the learn widget): the verdict and its test, Hurst and
 * MF-DFA, the regime x volatility map with today's cell, and the rules' edge by regime.
 */
export function RegimeDetails({ regime }: { regime: Regime }) {
  const r = regime;
  const rules = [...new Set(r.rules.map((x) => x.rule))];
  const stat = (rule: string, label: RegimeLabel) =>
    r.rules.find((x) => x.rule === rule && x.regime === label);
  const width = (s: Regime['spectrumWindow']) => f2(s?.width ?? null);

  return (
    <>
      <section className={styles.section} aria-label="Verdict">
        <h3 className={styles.heading}>
          {LABELS[r.label]} over the last {r.window} bars
        </h3>
        <p className={styles.summary}>
          Chow-Denning z = {f2(r.cd)}, bootstrap p = {r.pBootstrap.toFixed(3)} (normal{' '}
          {r.pAsymptotic.toFixed(3)}).{' '}
          {r.label === 'random'
            ? 'No significant memory in the returns.'
            : r.label === 'trend'
              ? 'Moves tended to continue: trend tools fit.'
              : 'Moves tended to be undone: range tools fit.'}
        </p>
        <table className={styles.table} aria-label="Variance ratios">
          <thead>
            <tr>
              <th scope="col">q bars</th>
              <th scope="col">VR</th>
              <th scope="col">z*</th>
            </tr>
          </thead>
          <tbody>
            {r.ratios.map((x) => (
              <tr key={x.q}>
                <th scope="row">{x.q}</th>
                <td>{f2(x.vr)}</td>
                <td>{f2(x.z)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={styles.section} aria-label="Hurst">
        <h3 className={styles.heading}>Hurst (DFA)</h3>
        <p className={styles.summary}>
          H = {f2(r.hurstWindow)} on the window (a random walk gives {f2(r.hurstNull[0])}–
          {f2(r.hurstNull[1])}), {f2(r.hurstHistory)} on the whole history.
        </p>
        <table className={styles.table} aria-label="Generalised Hurst H(q)">
          <thead>
            <tr>
              <th scope="col">q</th>
              {(r.spectrumHistory?.qs ?? []).map((q) => (
                <th key={q} scope="col">
                  {q}
                </th>
              ))}
              <th scope="col" title="H(-2) - H(4): big and small moves scale differently">
                Width
              </th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Window', r.spectrumWindow],
                ['History', r.spectrumHistory],
              ] as const
            ).map(([name, s]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {(s?.h ?? (r.spectrumHistory?.qs ?? []).map(() => null)).map((h, i) => (
                  <td key={i}>{f2(h)}</td>
                ))}
                <td>{width(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={styles.section} aria-label="Regime map">
        <h3 className={styles.heading}>Regime and volatility: share of the history</h3>
        <p className={styles.note}>
          As the chart&apos;s tint: the 2.49 test on each bar&apos;s past year (the verdict above
          uses the bootstrap).
        </p>
        <table className={styles.table} aria-label="Regime map">
          <thead>
            <tr>
              <th scope="col">Regime</th>
              <th scope="col">Calm</th>
              <th scope="col">Wild</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((label) => (
              <tr key={label}>
                <th scope="row">{LABELS[label]}</th>
                {[false, true].map((high) => {
                  const cell = r.cells.find((c) => c.regime === label && c.highVolatility === high);
                  const now = r.tint === label && r.highVolatility === high;
                  return (
                    <td key={String(high)} aria-current={now}>
                      {cell === undefined ? '—' : `${(cell.share * 100).toFixed(0)}%`}
                      {now ? ' (now)' : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={styles.section} aria-label="Event study">
        <h3 className={styles.heading}>Did the rules work in their regime? ({r.forward} bars)</h3>
        <div className={styles.scroll}>
          <table className={styles.table} aria-label="Rule edge by regime">
            <thead>
              <tr>
                <th scope="col">Rule (long)</th>
                {ORDER.map((label) => (
                  <th key={label} scope="col">
                    {SHORT[label]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule}>
                  <th scope="row">{rule}</th>
                  {ORDER.map((label) => {
                    const s = stat(rule, label);
                    return (
                      <td
                        key={label}
                        title={
                          s === undefined
                            ? 'Fewer than two signals'
                            : `n ${String(s.n)}, t ${f2(s.t)}, hit ${(s.hitRate * 100).toFixed(0)}%`
                        }
                      >
                        {s === undefined ? '—' : pct(s.edge)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          Edge: the mean forward return after the signals minus after every bar of that regime
          (hover for n and t). A |t| below 2 is noise.
        </p>
      </section>
    </>
  );
}
