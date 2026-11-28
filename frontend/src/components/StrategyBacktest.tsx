import { useState } from 'react';

import { useBacktest, type BacktestQuery, type Metrics } from '../api/backtest.ts';
import type { Strategy } from '../api/strategies.ts';
import { useChartStore } from '../store/chartStore.ts';
import f from './ForecastPanel.module.css';
import { formatPercent, formatPrice } from './formatNumber.ts';
import { NumberField } from './NumberField.tsx';
import styles from './StrategyPanel.module.css';
import { useChartSignals } from './useChartSignals.ts';

const pct = (v: number | null) => (v === null ? '—' : formatPercent(v * 100));
const ratio = (v: number | null) => (v === null ? '—' : v.toFixed(2));

const ROWS: { label: string; value: (m: Metrics) => string }[] = [
  { label: 'Net profit', value: (m) => formatPrice(m.net_profit, 0) },
  { label: 'Net annual return', value: (m) => pct(m.cagr) },
  { label: 'Total return', value: (m) => pct(m.total_return) },
  { label: 'Max drawdown', value: (m) => pct(m.max_drawdown) },
  { label: 'Sharpe', value: (m) => ratio(m.sharpe) },
  { label: 'Trades', value: (m) => String(m.trades) },
  { label: 'Win rate', value: (m) => pct(m.win_rate) },
  { label: 'Profit factor', value: (m) => ratio(m.profit_factor) },
  { label: 'Exposure', value: (m) => pct(m.exposure) },
];

/**
 * Run the strategy on the chart's symbol (P4 B1): the strategy against buy-and-hold over the same
 * bars, net of costs, and the hindsight ceiling. B2 adds the equity curve and the trades.
 */
export function StrategyBacktest({ strategy }: { strategy: Strategy }) {
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const { profile, onDecision } = useChartSignals();
  const [capital, setCapital] = useState(100_000);
  const [cost, setCost] = useState(0.05);
  const [query, setQuery] = useState<BacktestQuery | null>(null);
  const result = useBacktest(query);
  // A result shown belongs to the strategy and the symbol on screen.
  const shown = query !== null && query.strategy === strategy && query.symbol === symbol;
  const data = shown ? result.data : undefined;
  const d = data?.decisions;

  return (
    <div className={f.section}>
      <h3 className={f.heading}>Backtest</h3>
      <div className={styles.actions}>
        <NumberField
          label="Capital"
          value={capital}
          min={0}
          max={1e12}
          step={1000}
          onCommit={setCapital}
        />
        <NumberField
          label="Cost % a fill"
          value={cost}
          min={-1e-9}
          max={5}
          step={0.01}
          onCommit={setCost}
        />
        <button
          type="button"
          className={f.button}
          onClick={() => {
            setQuery({
              symbol,
              interval: onDecision ? interval : null,
              strategy,
              settings: { capital, cost_pct: cost },
            });
          }}
        >
          Run backtest
        </button>
      </div>
      {shown && result.isFetching && (
        <p className={f.note} role="status">
          Running the backtest…
        </p>
      )}
      {shown && result.isError && (
        <p className={styles.error} role="alert">
          {result.error.message}
        </p>
      )}
      {data !== undefined && d !== undefined && (
        <>
          <table className={f.table} aria-label="Backtest results">
            <thead>
              <tr>
                <th scope="col">Net of costs</th>
                <th scope="col">Strategy</th>
                <th scope="col">Buy &amp; hold</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value(data.strategy)}</td>
                  <td>{row.value(data.buyAndHold)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={f.note}>
            Hindsight ceiling (reversals and conflicts decided with the future: not achievable): net
            annual return {pct(data.hindsight.cagr)}, net profit{' '}
            {formatPrice(data.hindsight.netProfit, 0)}.
          </p>
          <p className={f.note}>
            {d.opposite} opposite entries in a position (reversed {d.reversed}, closed {d.closed},
            held {d.held}); {d.conflicts} bars with both entries (long {d.conflict_long}, short{' '}
            {d.conflict_short}, neither {d.conflict_none}); {d.skipped_by_cap} entries over the cap
            of {data.maxTrades} a {profile?.capPeriod ?? 'period'}.
          </p>
          {Object.keys(d.scores).length > 0 && (
            <p className={f.note}>
              After an opposite entry, over {data.reversalWindow} bars, a year: reverse{' '}
              {pct(d.scores['reverse'] ?? null)}, close {pct(d.scores['close'] ?? null)}, hold{' '}
              {pct(d.scores['hold'] ?? null)}.
            </p>
          )}
          <p className={f.note}>
            Over {data.bars} {data.interval} bars, {query?.settings.cost_pct}% a fill, the whole
            equity in each trade
            {data.openAtEnd ? '; the trade still open is closed at the last close' : ''}.
          </p>
        </>
      )}
    </div>
  );
}
