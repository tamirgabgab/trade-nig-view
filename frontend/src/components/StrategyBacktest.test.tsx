import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { parseBacktest } from '../api/backtest.ts';
import type { Strategy } from '../api/strategies.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useStrategyStore } from '../store/strategyStore.ts';
import { jsonResponse, renderWithQuery, stubApi } from '../test/render.tsx';
import { StrategyBacktest } from './StrategyBacktest.tsx';

const metrics = (over: Record<string, unknown>) => ({
  net_profit: 0,
  total_return: 0,
  cagr: null,
  volatility: null,
  sharpe: null,
  sortino: null,
  max_drawdown: 0,
  max_drawdown_bars: 0,
  calmar: null,
  trades: 0,
  win_rate: null,
  profit_factor: null,
  expectancy: null,
  avg_r: null,
  exposure: 0,
  ...over,
});

const BODY = {
  symbol: 'AAPL',
  interval: '1D',
  bars: 5000,
  max_trades: 10,
  reversal_window: 20,
  strategy: metrics({
    net_profit: 52000,
    cagr: 0.084,
    max_drawdown: -0.21,
    trades: 61,
    sharpe: 0.9,
  }),
  buy_and_hold: metrics({ net_profit: 120000, cagr: 0.11, max_drawdown: -0.5, trades: 1 }),
  hindsight: { net_profit: 90000, total_return: 0.9, cagr: 0.12 },
  decisions: {
    skipped_by_cap: 2,
    conflicts: 3,
    conflict_long: 1,
    conflict_short: 0,
    conflict_none: 2,
    opposite: 7,
    reversed: 4,
    closed: 1,
    held: 2,
    scores: { reverse: 0.1, close: -0.001, hold: 0.05 },
  },
  open_at_end: true,
  trades: [],
  time: [],
  equity: [],
  buy_and_hold_equity: [],
};

const PROFILES = [
  {
    id: 'position',
    label: 'Position',
    description: '',
    decision_intervals: ['1D'],
    context_intervals: ['1W'],
    cap_period: 'month',
    default_max_trades: 10,
    overnight: true,
  },
];

const STRATEGY: Strategy = { kind: 'python', profile: 'position', module: 'm', description: '' };

describe('StrategyBacktest', () => {
  let posted: unknown[] = [];

  beforeEach(() => {
    posted = [];
    useStrategyStore.setState({ profile: 'position', current: null, show: false });
    useChartStore.setState({ symbol: 'AAPL', interval: '1D' });
    stubApi({
      '/api/strategy-profiles': { body: PROFILES },
      '/api/backtest': (_url, init) => {
        posted.push(JSON.parse(init?.body as string));
        return jsonResponse(BODY);
      },
    });
  });

  it('parses the response', () => {
    const r = parseBacktest(BODY);
    expect(r.strategy.cagr).toBe(0.084);
    expect(r.hindsight).toEqual({ netProfit: 90000, cagr: 0.12 });
    expect(r.decisions.scores).toEqual({ reverse: 0.1, close: -0.001, hold: 0.05 });
    expect(() => parseBacktest({ ...BODY, decisions: null })).toThrow();
  });

  it('runs the strategy against buy-and-hold, with its costs', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StrategyBacktest strategy={STRATEGY} />);
    const cost = screen.getByRole('spinbutton', { name: 'Cost % a fill' });
    await user.clear(cost);
    await user.type(cost, '0.1{Enter}');
    await user.click(screen.getByRole('button', { name: 'Run backtest' }));
    const table = await screen.findByRole('table', { name: 'Backtest results' });
    const row = (name: string) => within(table).getByRole('row', { name: new RegExp(name) });
    expect(row('Net profit')).toHaveTextContent('52,000');
    expect(row('Net profit')).toHaveTextContent('120,000');
    expect(row('Net annual return')).toHaveTextContent('8.40%');
    expect(row('Max drawdown')).toHaveTextContent('-21.00%');
    expect(row('Sharpe')).toHaveTextContent('0.90');
    expect(row('Win rate')).toHaveTextContent('—');
    expect(screen.getByText(/Hindsight ceiling/)).toHaveTextContent('12.00%');
    expect(screen.getByText(/opposite entries/)).toHaveTextContent(
      '7 opposite entries in a position (reversed 4, closed 1, held 2)',
    );
    expect(screen.getByText(/After an opposite entry/)).toHaveTextContent(
      'over 20 bars, a year: reverse 10.00%, close -0.10%, hold 5.00%',
    );
    expect(screen.getByText(/entries over the cap/)).toHaveTextContent(
      '2 entries over the cap of 10 a month',
    );
    // Editing the cost without running again leaves the note on the cost of the run shown.
    await user.clear(cost);
    await user.type(cost, '0.5{Enter}');
    expect(screen.getByText(/a fill, the whole equity/)).toHaveTextContent('0.1% a fill');
    expect(posted).toEqual([
      {
        symbol: 'AAPL',
        interval: '1D',
        strategy: STRATEGY,
        settings: { capital: 100000, cost_pct: 0.1 },
      },
    ]);
  });
});
