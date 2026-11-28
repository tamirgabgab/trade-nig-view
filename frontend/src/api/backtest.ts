import { useQuery } from '@tanstack/react-query';

import { apiPost, fieldsOf, isRecord, type Schemas } from './client.ts';
import type { Strategy } from './strategies.ts';

/** A strategy run on the chart's symbol (P4 B1, ADR 0037). The results tab grows in B2. */

export type Metrics = Schemas['Metrics'];

export interface BacktestResult {
  interval: string;
  bars: number;
  maxTrades: number;
  /** H: the decision bars each reversal window spans. */
  reversalWindow: number;
  strategy: Metrics;
  buyAndHold: Metrics;
  hindsight: { netProfit: number; cagr: number | null };
  decisions: Schemas['DecisionsOut'];
  openAtEnd: boolean;
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number.NaN);
const numOrNull = (v: unknown) => (typeof v === 'number' ? v : null);

function parseMetrics(v: unknown): Metrics {
  if (!isRecord(v)) throw new Error('Unexpected metrics');
  const f = fieldsOf<Metrics>(v);
  return {
    net_profit: num(f('net_profit')),
    total_return: num(f('total_return')),
    cagr: numOrNull(f('cagr')),
    volatility: numOrNull(f('volatility')),
    sharpe: numOrNull(f('sharpe')),
    sortino: numOrNull(f('sortino')),
    max_drawdown: num(f('max_drawdown')),
    max_drawdown_bars: num(f('max_drawdown_bars')),
    calmar: numOrNull(f('calmar')),
    trades: num(f('trades')),
    win_rate: numOrNull(f('win_rate')),
    profit_factor: numOrNull(f('profit_factor')),
    expectancy: numOrNull(f('expectancy')),
    avg_r: numOrNull(f('avg_r')),
    exposure: num(f('exposure')),
  };
}

export function parseBacktest(body: unknown): BacktestResult {
  if (!isRecord(body)) throw new Error('Unexpected backtest response');
  const f = fieldsOf<Schemas['BacktestResponse']>(body);
  const top = f('hindsight');
  const d = f('decisions');
  if (!isRecord(top) || !isRecord(d)) throw new Error('Unexpected backtest response');
  const g = fieldsOf<Schemas['DecisionsOut']>(d);
  const scores = g('scores');
  return {
    interval: String(f('interval')),
    bars: num(f('bars')),
    maxTrades: num(f('max_trades')),
    reversalWindow: num(f('reversal_window')),
    strategy: parseMetrics(f('strategy')),
    buyAndHold: parseMetrics(f('buy_and_hold')),
    hindsight: { netProfit: num(top['net_profit']), cagr: numOrNull(top['cagr']) },
    decisions: {
      skipped_by_cap: num(g('skipped_by_cap')),
      conflicts: num(g('conflicts')),
      conflict_long: num(g('conflict_long')),
      conflict_short: num(g('conflict_short')),
      conflict_none: num(g('conflict_none')),
      opposite: num(g('opposite')),
      reversed: num(g('reversed')),
      closed: num(g('closed')),
      held: num(g('held')),
      scores: isRecord(scores)
        ? Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, num(v)]))
        : {},
    },
    openAtEnd: f('open_at_end') === true,
  };
}

export interface BacktestQuery {
  symbol: string;
  /** Null: the profile's default decision interval. */
  interval: string | null;
  strategy: Strategy;
  settings: { capital: number; cost_pct: number };
}

/** Runs once per distinct query (null: not asked yet). */
export function useBacktest(query: BacktestQuery | null) {
  return useQuery({
    queryKey: ['backtest', query],
    enabled: query !== null,
    staleTime: Infinity,
    retry: false,
    queryFn: () => apiPost('/backtest', query, parseBacktest),
  });
}
