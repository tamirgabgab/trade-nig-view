import { useTradePlan, type TradePlanQuery } from '../api/tradePlan.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { timeToLogical } from '../drawings/anchors.ts';
import { useChartDataStore } from '../store/chartDataStore.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { useDebounced } from './lab/useDebounced.ts';
import { LearnLink } from './LearnLink.tsx';
import styles from './ForecastPanel.module.css';
import { ReliabilityChart } from './ReliabilityChart.tsx';
import { TradePlanHeat } from './TradePlanHeat.tsx';

const MAX_HORIZON = 250;
const pct = (x: number | null | undefined) =>
  x === null || x === undefined || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(1)}%`;
const r = (x: number | null) => (x === null || !Number.isFinite(x) ? '—' : `${x.toFixed(2)}R`);
const ACTUAL: Record<string, string> = {
  target: 'hit the target',
  stop: 'hit the stop',
  neither: 'hit neither by the last bar',
  open: 'still running',
  not_filled: 'never reached the entry',
};

/**
 * The Trade plan tab: the selected (or last) Trade plan drawing's chances from the history's own
 * paths at today's volatility: fill, target, stop, the expected result, the position size, the EV
 * heat map and the calibration of past plans. Stops at the replay cursor.
 */
export function TradePlanPanel() {
  const drawings = useDrawingStore((s) => s.drawings);
  const selectedId = useDrawingStore((s) => s.selectedId);
  const update = useDrawingStore((s) => s.update);
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const adjusted = useChartStore((s) => s.adjusted);
  const bars = useChartDataStore((s) => s.data?.bars);
  const decimals = useChartDataStore((s) => s.data?.decimals ?? 2);
  const replaying = useReplayStore((s) => s.mode === 'on' && s.symbol === symbol);
  const cursor = useReplayStore((s) => s.cursor);
  const plans = drawings.filter((d) => d.type === 'trade_plan' && !d.hidden);
  const drawn = plans.find((d) => d.id === selectedId) ?? plans.at(-1);
  const [entry, target, stop] = drawn?.points ?? [];
  const times = bars?.map((b) => barSeconds(b.time)) ?? [];
  const h =
    entry === undefined || target === undefined || times.length === 0
      ? 0
      : Math.min(
          MAX_HORIZON,
          Math.max(
            1,
            Math.round(timeToLogical(times, target.time) - timeToLogical(times, entry.time)),
          ),
        );
  const query = useDebounced<TradePlanQuery | null>(
    entry === undefined || target === undefined || stop === undefined
      ? null
      : {
          symbol,
          interval,
          adjusted,
          time: entry.time,
          entry: entry.price,
          target: target.price,
          stop: stop.price,
          h,
          cursor: replaying && cursor !== null ? barSeconds(cursor) : null,
        },
    300,
  );
  const result = useTradePlan(query);
  const plan = result.data;

  if (drawn === undefined || entry === undefined || target === undefined || stop === undefined) {
    return (
      <p className={styles.empty}>
        Draw a plan with the Trade plan tool (measurement tools in the left toolbar): click the
        entry, the target (its time is the holding time) and the stop.
      </p>
    );
  }
  const account = drawn.props.account ?? 10_000;
  const riskPct = drawn.props.risk_pct ?? 1;
  const perShare = Math.abs(entry.price - stop.price);
  const shares = perShare > 0 ? Math.floor((account * riskPct) / 100 / perShare) : 0;
  const setProp = (name: 'account' | 'risk_pct', value: number) => {
    if (!Number.isFinite(value) || value <= 0 || (name === 'risk_pct' && value > 100)) return;
    update(drawn.id, (d) => ({ ...d, props: { ...d.props, [name]: value } }));
  };
  const s = plan?.summary ?? null;
  const unit = plan === undefined ? null : plan.sigma * Math.sqrt(plan.h);
  const distance = (price: number) =>
    unit === null || unit <= 0 ? 0 : Math.abs(Math.log(price / entry.price)) / unit;

  return (
    <div className={styles.panel}>
      <div className={styles.settings}>
        <label className={styles.field}>
          Account
          <input
            className={styles.input}
            type="number"
            min={1}
            step={1000}
            value={account}
            onChange={(event) => {
              setProp('account', Number(event.target.value));
            }}
          />
        </label>
        <label className={styles.field}>
          Risk %
          <input
            className={styles.input}
            type="number"
            min={0.1}
            max={100}
            step={0.25}
            value={riskPct}
            onChange={(event) => {
              setProp('risk_pct', Number(event.target.value));
            }}
          />
        </label>
      </div>
      <p className={`${styles.summary} ${styles.section}`}>
        {target.price > entry.price ? 'Long' : 'Short'} for {h} bars: {shares} shares risk{' '}
        {((account * riskPct) / 100).toFixed(0)} to the stop.
        {plan !== undefined && Math.abs(entry.price - plan.originClose) > 1e-9 * entry.price && (
          <>
            {' '}
            The entry is an order ({entry.price > plan.originClose ? 'above' : 'below'} the close of{' '}
            {plan.originClose.toFixed(decimals)}): it fills only if the price reaches it.
          </>
        )}
      </p>
      {result.isError ? (
        <p className={styles.empty} role="alert">
          No plan: {result.error.message}
        </p>
      ) : plan === undefined ? (
        <p className={styles.empty} role="status">
          Playing the plan on the history…
        </p>
      ) : (
        <>
          <section className={styles.section} aria-label="Chances">
            <h3 className={styles.heading}>Chances ({s?.paths ?? 0} past paths)</h3>
            {s === null ? (
              <p className={styles.summary}>No past path reached the entry.</p>
            ) : (
              <table className={styles.table} aria-label="Plan chances">
                <tbody>
                  <tr>
                    <th scope="row">Entry filled</th>
                    <td>{pct(s.pFill)}</td>
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      title="Given the fill; the range gives every bar that touched both levels to the stop, then to the target"
                    >
                      Target first
                    </th>
                    <td>
                      {pct(s.pTarget)} ({pct(s.pTargetBounds[0])}–{pct(s.pTargetBounds[1])})
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Stop first</th>
                    <td>{pct(s.pStop)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Neither by bar {plan.h}</th>
                    <td>{pct(s.pNeither)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Mean bars to the exit</th>
                    <td>{s.bars.toFixed(1)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Expected result</th>
                    <td>
                      {r(s.evR)} ({pct(s.evReturn)})
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" title="Gaps beyond the stop make it worse than -1R">
                      Loss when stopped
                    </th>
                    <td>{r(s.lossR)}</td>
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      title="E[R] / E[R²]: the fraction of the account to risk, if the odds were exact"
                    >
                      Kelly
                    </th>
                    <td>{s.kelly === null || s.kelly <= 0 ? '0 (no edge)' : pct(s.kelly)}</td>
                  </tr>
                  <tr>
                    <th scope="row" title="Gambler's ruin with the history's drift, no time limit">
                      Brownian reference
                    </th>
                    <td>{pct(plan.reference)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {plan.actual !== null && (
              <p className={styles.summary}>
                What happened: {ACTUAL[plan.actual]}
                {plan.actualR === null ? '' : ` (${r(plan.actualR)})`}.
              </p>
            )}
          </section>
          <section className={styles.section} aria-label="Heat map">
            <h3 className={styles.heading}>Expected R by distance (× σ√h)</h3>
            <TradePlanHeat
              multiples={plan.multiples}
              heat={plan.heat}
              current={[distance(stop.price), distance(target.price)]}
            />
          </section>
          {plan.calibration !== null && (
            <section className={styles.section} aria-label="Calibration">
              <h3 className={styles.heading}>Calibration out of sample</h3>
              <ReliabilityChart calibration={plan.calibration} />
              <p className={styles.summary}>
                Brier {plan.calibration.brier.toFixed(3)} against{' '}
                {plan.calibration.brierBase.toFixed(3)} for the base rate ({plan.calibration.n} past
                plans).
              </p>
            </section>
          )}
          <p className={styles.note}>
            From past bars only (<LearnLink target="trade-plan">how it is measured</LearnLink>). A
            research tool, not investment advice.
          </p>
        </>
      )}
    </div>
  );
}
