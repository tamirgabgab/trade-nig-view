import { useState } from 'react';

import { RISK_METHODS, type Risk, type RiskTail } from '../api/risk.ts';
import styles from './ForecastPanel.module.css';
import { HORIZON_LABELS } from './volatilityFormat.ts';

const LEVELS = [0.9, 0.95, 0.99];
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : '—');
const p = (x: number | null) => (x === null || !Number.isFinite(x) ? '—' : x.toFixed(2));
const whole = (x: number) => x.toLocaleString(undefined, { maximumFractionDigits: 0 });
const label = (h: string) => HORIZON_LABELS[h] ?? (h === 'bar' ? 'Next bar' : h);

/**
 * VaR and ES (the Risk tab and the learn widget): per horizon and level, every method's VaR /
 * ES for the side picked (a long's fall or a short's rise), optionally in money for a position;
 * the 1-bar backtests and the fitted tails.
 */
export function RiskDetails({ risk, position }: { risk: Risk; position: number | null }) {
  const [side, setSide] = useState<RiskTail>('long');
  const [level, setLevel] = useState(0.99);
  const rows = risk.estimates.filter((e) => e.tail === side && e.level === level);
  const horizons = [...new Set(risk.estimates.map((e) => e.horizon))];
  const [picked, setHorizon] = useState('bar');
  const horizon = horizons.includes(picked) ? picked : 'bar';
  const cell = (horizon: string, method: string) =>
    rows.find((e) => e.horizon === horizon && e.method === method);
  const tests = risk.backtests.filter((b) => b.tail === side && b.level === level);
  const fit = risk.tails.find((t) => t.tail === side);

  return (
    <>
      <div className={styles.settings}>
        <label className={styles.field}>
          Side
          <select
            className={styles.select}
            value={side}
            onChange={(event) => {
              setSide(event.target.value === 'short' ? 'short' : 'long');
            }}
          >
            <option value="long">Long (a fall)</option>
            <option value="short">Short (a rise)</option>
          </select>
        </label>
        <label className={styles.field}>
          Horizon
          <select
            className={styles.select}
            value={horizon}
            onChange={(event) => {
              setHorizon(event.target.value);
            }}
          >
            {horizons.map((h) => (
              <option key={h} value={h}>
                {label(h)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Confidence
          <select
            className={styles.select}
            value={level}
            onChange={(event) => {
              setLevel(Number(event.target.value));
            }}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {Math.round(l * 100)} %
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className={styles.section} aria-label="VaR and ES">
        <h3 className={styles.heading}>Loss over the {label(horizon).toLowerCase()}</h3>
        <table className={styles.table} aria-label="VaR and ES by method">
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">VaR</th>
              <th scope="col">ES</th>
              {position !== null && <th scope="col">ES on the position</th>}
            </tr>
          </thead>
          <tbody>
            {RISK_METHODS.map((m) => {
              const e = cell(horizon, m.id);
              return (
                <tr key={m.id} aria-current={m.id === 'fhs'}>
                  <th scope="row">{m.label}</th>
                  <td>{e === undefined ? '—' : pct(e.var)}</td>
                  <td>{e === undefined ? '—' : pct(e.es)}</td>
                  {position !== null && <td>{e === undefined ? '—' : whole(e.es * position)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className={styles.note}>
          VaR: a loss exceeded {Math.round((1 - level) * 100)} % of the time; ES: the mean loss when
          it is. From the real h-bar returns at today&apos;s volatility.
        </p>
      </section>
      <section className={styles.section} aria-label="Backtests">
        <h3 className={styles.heading}>Backtests, next bar ({tests[0]?.n ?? 0} past bars)</h3>
        <div className={styles.scroll}>
          <table className={styles.table} aria-label="VaR backtests">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col" title="Breaches against the expected count">
                  Breaches
                </th>
                <th scope="col" title="Kupiec: is the breach rate right? (p-value)">
                  Rate p
                </th>
                <th scope="col" title="Christoffersen: are breaches independent? (p-value)">
                  Cluster p
                </th>
                <th scope="col" title="Acerbi-Szekely Z2 for the ES (p-value): low = ES too small">
                  ES p
                </th>
              </tr>
            </thead>
            <tbody>
              {RISK_METHODS.map((m) => {
                const b = tests.find((t) => t.method === m.id);
                return (
                  <tr key={m.id}>
                    <th scope="row">{m.label}</th>
                    <td>
                      {b === undefined ? '—' : `${String(b.breaches)} / ${b.expected.toFixed(0)}`}
                    </td>
                    <td>{p(b?.kupiec ?? null)}</td>
                    <td>{p(b?.christoffersen ?? null)}</td>
                    <td>{p(b?.z2P ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>A p-value below 0.05 rejects the method on this history.</p>
      </section>
      {fit !== undefined && (
        <section className={styles.section} aria-label="Tail">
          <h3 className={styles.heading}>The {side === 'long' ? 'left' : 'right'} tail</h3>
          <p className={styles.summary}>
            ξ = {fit.xi.toFixed(2)} (
            {fit.xi > 0.05
              ? 'a fat, power-law tail'
              : fit.xi < -0.05
                ? 'a bounded tail'
                : 'about exponential'}
            ), from {fit.exceedances} losses beyond the 90th percentile.
          </p>
        </section>
      )}
    </>
  );
}
