import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { parseCatalog, parseSignals, type RulesStrategy } from '../api/strategies.ts';
import { CONFLICT_COLOR, signalSources } from '../chart/signalMarkers.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useStrategyStore } from '../store/strategyStore.ts';
import { jsonResponse, renderWithQuery, stubApi } from '../test/render.tsx';
import { StrategyPanel } from './StrategyPanel.tsx';
import { capText, exitsText, groupsText, operandText } from './strategyText.ts';

const PROFILES = [
  ['day', 'Day', ['5m', '15m'], ['1h', '1D'], 'day', 10, false],
  ['swing', 'Swing', ['1h'], ['1D'], 'week', 10, true],
  ['position', 'Position', ['1D'], ['1W'], 'month', 10, true],
  ['long_term', 'Long-term', ['1W', '1M'], ['1M'], 'year', 12, true],
].map(([id, label, decision, context, period, cap, overnight]) => ({
  id,
  label,
  description: `${String(label)} trader.`,
  decision_intervals: decision,
  context_intervals: context,
  cap_period: period,
  default_max_trades: cap,
  overnight,
  no_entry_last_minutes: 0,
}));

const close = { price: 'close' as const };
const ma = (i: number) => ({ indicator: i, output: 'ma' });

const CROSS: RulesStrategy = {
  kind: 'rules',
  profile: 'position',
  description: 'A cross.',
  indicators: [
    { id: 'sma', params: { length: 20 } },
    { id: 'sma', params: { length: 30 }, interval: '1W' },
  ],
  long: {
    entry: [
      [
        { left: close, op: 'crosses_above', right: ma(0) },
        { left: close, op: 'gt', right: ma(1) },
      ],
    ],
    exit: [[{ left: close, op: 'crosses_below', right: ma(0) }]],
  },
  short: { entry: [[{ left: close, op: 'lt', right: { value: 5 } }]], exit: [] },
  exits: { stop: { kind: 'atr', value: 3 }, time_stop_bars: 10 },
};

const CATALOG = {
  saved: [{ name: 'Mine', revision: 2, updated_at: '', kind: 'rules', profile: 'swing' }],
  examples: [{ name: 'Example: cross', strategy: CROSS }],
  python: [
    {
      module: 'breakout',
      description: 'A breakout.',
      params: [{ name: 'length', type: 'int', default: 55, label: 'Bars', min: 4, max: 400 }],
      error: null,
    },
    { module: 'broken', description: '', params: [], error: 'broken.py line 1: SyntaxError' },
  ],
};

const SIGNALS = {
  symbol: 'AAPL',
  interval: '1D',
  bars: 5000,
  long_entry: ['2024-01-02', '2024-02-01'],
  long_exit: ['2024-01-20'],
  short_entry: [],
  short_exit: [],
  conflict: [],
  warnings: [],
};

describe('strategy text', () => {
  const ind = CROSS.indicators ?? [];
  it('names operands, conditions and groups', () => {
    expect(operandText(ma(1), ind)).toBe('SMA(30) 1W');
    expect(operandText({ price: 'close', ago: 2 }, ind)).toBe('close 2 bars ago');
    expect(operandText({ value: 30 }, ind)).toBe('30');
    expect(operandText({ indicator: 0, output: 'upper' }, ind)).toBe('SMA(20) upper');
    expect(groupsText(CROSS.long?.entry ?? [], ind)).toEqual([
      'close crosses above SMA(20) and close > SMA(30) 1W',
    ]);
  });

  it('describes the exits and the cap', () => {
    expect(exitsText(CROSS.exits)).toEqual([
      'on the other side’s entry',
      'stop 3 × ATR(14)',
      'after 10 bars',
    ]);
    expect(exitsText({ on_opposite: false, target: { kind: 'percent', value: 5 } })).toEqual([
      'target 5 %',
    ]);
    const profile = { capPeriod: 'month' } as Parameters<typeof capText>[1];
    expect(capText(10, profile)).toBe('10 a month');
  });
});

describe('signal markers', () => {
  it('one fixed-look source per kind, nothing without marks', () => {
    expect(signalSources([], 3, { up: 'g', down: 'r' })).toEqual([]);
    const sources = signalSources(
      [
        { index: 0, kind: 'long_entry' },
        { index: 2, kind: 'conflict' },
        { index: 9, kind: 'short_entry' }, // not a bar: dropped
      ],
      3,
      { up: 'g', down: 'r' },
    );
    expect(sources.map((s) => [s.shape, s.position, s.color])).toEqual([
      ['arrowUp', 'belowBar', 'g'],
      ['circle', 'aboveBar', 'g'],
      ['arrowDown', 'aboveBar', 'r'],
      ['circle', 'belowBar', 'r'],
      ['square', 'aboveBar', CONFLICT_COLOR],
    ]);
    expect(sources[0]?.values).toEqual([1, null, null]);
    expect(sources[4]?.values).toEqual([null, null, 1]);
  });
});

describe('parsers', () => {
  it('reads the catalog and the signals', () => {
    const catalog = parseCatalog(CATALOG);
    expect(catalog.saved[0]?.profile).toBe('swing');
    expect(catalog.python[0]?.params[0]?.min).toBe(4);
    expect(catalog.python[1]?.error).toContain('SyntaxError');
    expect(() => parseCatalog({ ...CATALOG, examples: [{ name: 'x', strategy: {} }] })).toThrow();
    expect(parseSignals(SIGNALS).times.long_entry).toEqual(['2024-01-02', '2024-02-01']);
  });
});

describe('StrategyPanel', () => {
  let posted: unknown[] = [];
  let saved: unknown[] = [];

  beforeEach(() => {
    posted = [];
    saved = [];
    useStrategyStore.setState({ profile: 'position', current: null, show: false });
    useChartStore.setState({ symbol: 'AAPL', interval: '1D' });
    stubApi({
      '/api/strategies/profiles': { body: PROFILES },
      '/api/strategies': { body: CATALOG },
      '/api/strategies/signals': (_url, init) => {
        posted.push(JSON.parse(String(init?.body)));
        return jsonResponse(SIGNALS);
      },
      '/api/strategies/My%20cross': (_url, init) => {
        saved.push(JSON.parse(String(init?.body)));
        return jsonResponse({ name: 'My cross', revision: 1, updated_at: '', strategy: CROSS });
      },
    });
  });

  it('shows the profile, an example strategy and its signals', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StrategyPanel />);
    const position = await screen.findByRole('button', { name: 'Position' });
    expect(position).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('10 a month by default (a parameter)')).toBeInTheDocument();

    const select = screen.getByRole('combobox', { name: 'Strategy' });
    // The saved strategy is a Swing one: not listed under Position.
    expect(within(select).queryByRole('option', { name: 'Mine' })).toBeNull();
    await user.selectOptions(select, 'example:Example: cross');
    const long = screen.getByRole('list', { name: 'Long rules' });
    expect(long).toHaveTextContent('enter when close crosses above SMA(20) and close > SMA(30) 1W');
    expect(long).toHaveTextContent('exit when close crosses below SMA(20)');

    await user.click(screen.getByRole('button', { name: 'Show signals on the chart' }));
    const table = await screen.findByRole('table', { name: 'Signals' });
    expect(within(table).getByRole('row', { name: /Long entries/ })).toHaveTextContent('2');
    expect(within(table).getByRole('row', { name: /Long exits/ })).toHaveTextContent('1');
    expect(posted).toEqual([{ symbol: 'AAPL', interval: '1D', strategy: CROSS }]);

    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'My cross');
    await user.click(screen.getByRole('button', { name: 'Save strategy' }));
    await waitFor(() => {
      expect(saved).toEqual([{ revision: 0, strategy: CROSS }]);
    });
    expect(await screen.findByText('Saved as “My cross”.')).toBeInTheDocument();
    expect(useStrategyStore.getState().current?.source).toBe('saved');
  });

  it('runs a Python file with its parameters, and reports a broken one', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StrategyPanel />);
    const select = await screen.findByRole('combobox', { name: 'Strategy' });
    await screen.findByRole('option', { name: 'breakout.py' });
    await user.selectOptions(select, 'python:breakout');
    expect(screen.getByRole('spinbutton', { name: 'Bars' })).toHaveValue(55);
    await user.click(screen.getByRole('button', { name: 'Show signals on the chart' }));
    await screen.findByRole('table', { name: 'Signals' });
    expect(posted[0]).toMatchObject({
      strategy: { kind: 'python', module: 'breakout', profile: 'position', params: { length: 55 } },
    });
    await user.selectOptions(select, 'python:broken');
    expect(screen.getByRole('alert')).toHaveTextContent('broken.py line 1: SyntaxError');
  });

  it('a profile switches the chart to its decision interval', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StrategyPanel />);
    await user.click(await screen.findByRole('button', { name: 'Swing' }));
    expect(useStrategyStore.getState().profile).toBe('swing');
    expect(useChartStore.getState().interval).toBe('1h');
    const select = screen.getByRole('combobox', { name: 'Strategy' });
    expect(within(select).getByRole('option', { name: 'Mine' })).toBeInTheDocument();
  });
});
