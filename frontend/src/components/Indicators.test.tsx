import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '../App.tsx';
import { useChartStore } from '../store/chartStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { liveEngine } from '../test/fakeChartEngine.ts';
import {
  AAPL_BARS,
  barsBody,
  HEALTH_OK,
  INDICATORS,
  jsonResponse,
  MA_CROSS_SPEC,
  QUOTES,
  renderWithQuery,
  stubApi,
  SYMBOLS,
} from '../test/render.tsx';

vi.mock('../chart/ChartEngine.ts', () => import('../test/fakeChartEngine.ts'));

interface ComputeBody {
  id: string;
  params: Record<string, number | string>;
  start: number;
  end: number;
}

let computes: ComputeBody[] = [];
let computeStatus = 200;
let registry: unknown[] = INDICATORS;

/** A fake compute: value = close + length (easy to check), no warm-up on the first bar only. */
/** An oscillator in its own pane (backend `obv`): volume-formatted values, a zero level. */
const OBV_SPEC = {
  id: 'obv',
  version: 1,
  name: 'On Balance Volume',
  short_name: 'OBV',
  category: 'volume',
  overlay: false,
  inputs: ['close', 'volume'],
  params: [],
  outputs: [
    {
      name: 'obv',
      label: 'OBV',
      plot: 'line',
      color: '#2962FF',
      line_width: 2,
      style: { format: 'volume' },
    },
  ],
  levels: [0],
  learn_slug: 'obv',
  description: 'Cumulative volume signed by the close-to-close change.',
};

function compute(body: ComputeBody) {
  if (body.id === 'obv') {
    return {
      id: body.id,
      version: 1,
      params: body.params,
      time: AAPL_BARS.map((b) => b.time),
      outputs: { obv: [0, 48_700_000, -13_650_000] },
      warmup: 0,
      lookback: 1_000_000_000,
    };
  }
  if (body.id === 'ma_cross') {
    return {
      id: body.id,
      version: 1,
      params: body.params,
      time: AAPL_BARS.map((b) => b.time),
      outputs: {
        fast: AAPL_BARS.map((b) => b.close + 1),
        slow: AAPL_BARS.map((b) => b.close - 1),
        crosses: AAPL_BARS.map((_, i) => (i === 1 ? 1 : i === 2 ? -1 : null)),
      },
      warmup: 0,
      lookback: 525,
    };
  }
  const length = Number(body.params['length']);
  return {
    id: body.id,
    version: 1,
    params: body.params,
    time: AAPL_BARS.map((b) => b.time),
    outputs: { ma: AAPL_BARS.map((b, i) => (i === 0 ? null : b.close + length)) },
    warmup: 1,
    lookback: 250,
  };
}

beforeEach(() => {
  localStorage.clear();
  useChartStore.setState(useChartStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
  useIndicatorStore.setState(useIndicatorStore.getInitialState());
  computes = [];
  computeStatus = 200;
  registry = INDICATORS;
  stubApi({
    '/api/health': { body: HEALTH_OK },
    '/api/symbols': { body: SYMBOLS },
    '/api/quotes': { body: QUOTES },
    '/api/bars': { body: barsBody('AAPL', '1D', AAPL_BARS) },
    '/api/indicators': () => jsonResponse(registry),
    '/api/indicators/compute': (_url, init) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as ComputeBody;
      computes.push(body);
      if (computeStatus !== 200) {
        return jsonResponse(
          {
            title: 'Unprocessable',
            status: 422,
            detail: "'length' must be >= 1",
            code: 'invalid_params',
          },
          computeStatus,
        );
      }
      return jsonResponse(compute(body));
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function legend() {
  return screen.getByRole('list', { name: 'Indicators on the chart' });
}

async function addEma(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Apple Inc. · 1D · NASDAQ');
  await user.keyboard('/');
  const dialog = await screen.findByRole('dialog', { name: 'Indicators' });
  await user.keyboard('ema');
  await within(dialog).findByRole('option', { name: /Exponential Moving Average/ });
  await user.keyboard('{Enter}');
  await screen.findByText('EMA 9');
}

describe('indicators on the chart', () => {
  it('adds an EMA from the "/" dialog and draws it over the loaded bars', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    // First visit: a hint says how to add an indicator; it is gone once one was added.
    expect(await screen.findByText(/to add an indicator/)).toBeInTheDocument();
    await addEma(user);

    expect(screen.queryByText(/to add an indicator/)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Indicators' })).not.toBeInTheDocument();
    expect(computes[0]).toEqual({
      symbol: 'AAPL',
      interval: '1D',
      adjusted: true,
      transform: 'none',
      id: 'ema',
      params: { length: 9, source: 'close', offset: 0 },
      start: Date.UTC(2026, 10, 18) / 1000,
      end: Date.UTC(2026, 10, 20) / 1000,
    });
    await waitFor(() => {
      expect(liveEngine().lines).toEqual([
        {
          key: expect.stringMatching(/^ema-\d+:ma$/) as unknown,
          group: expect.stringMatching(/^ema-\d+$/) as unknown,
          output: 'ma',
          ownPane: false,
          plot: 'line',
          values: [null, 349.21 + 9, 342.56 + 9],
          color: '#FF6D00',
          lineWidth: 2,
          visible: true,
          style: {},
          levels: [],
          levelFill: null,
        },
      ]);
    });
    // Legend: latest value, then the value under the crosshair, a dash during warm-up.
    const row = within(legend()).getByText('EMA 9').closest('li');
    if (row === null) throw new Error('no legend row');
    expect(within(row).getByText('351.56')).toBeInTheDocument();
    act(() => {
      liveEngine().hover(0);
    });
    await within(row).findByText('—');
  });

  it('applies settings live, validates on blur, resets, hides and removes', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    await addEma(user);

    await user.click(screen.getByRole('button', { name: 'Edit settings: EMA 9' }));
    const panel = screen.getByRole('dialog', { name: 'EMA 9' });
    const length = within(panel).getByRole('spinbutton', { name: 'Length' });
    expect(length).toHaveFocus();

    await user.clear(length);
    await user.type(length, '20');
    await within(legend()).findByText('EMA 20');
    expect(computes.at(-1)?.params['length']).toBe(20);
    // Debounced: typing "2" then "0" did not send a compute for length 2.
    expect(computes.some((c) => c.params['length'] === 2)).toBe(false);

    await user.clear(length);
    await user.type(length, '0');
    await user.tab();
    expect(
      within(panel).getByText('Length needs a whole number from 1 to 5,000.'),
    ).toBeInTheDocument();
    expect(length).toHaveAttribute('aria-invalid', 'true');
    expect(computes.some((c) => c.params['length'] === 0)).toBe(false);
    await user.clear(length);
    await user.type(length, '50');
    expect(within(panel).queryByText(/needs a whole number/)).not.toBeInTheDocument();
    await within(legend()).findByText('EMA 50');

    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Source' }), 'hl2');
    await within(legend()).findByText('EMA 50 hl2');
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'EMA line width' }), '3');
    await waitFor(() => {
      expect(liveEngine().lines[0]?.lineWidth).toBe(3);
    });

    await user.click(within(panel).getByRole('button', { name: 'Reset to defaults' }));
    await within(legend()).findByText('EMA 9');
    expect(length).toHaveValue(9);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /EMA/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide EMA 9' }));
    await waitFor(() => {
      expect(liveEngine().lines[0]?.visible).toBe(false);
    });
    await user.click(screen.getByRole('button', { name: 'Show EMA 9' }));
    await user.click(screen.getByRole('button', { name: 'Remove EMA 9' }));
    expect(screen.queryByRole('list', { name: 'Indicators on the chart' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(liveEngine().lines).toEqual([]);
    });

    // The removal can be undone from the toast, settings included.
    const toast = screen.getByText('Removed EMA 9').closest('div');
    if (toast === null) throw new Error('no toast');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('list', { name: 'Indicators on the chart' })).toHaveTextContent(
      'EMA 9',
    );
    expect(toast).not.toBeInTheDocument();
  });

  it('opens from the toolbar, filters, and says when nothing matches', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    await user.click(screen.getByRole('button', { name: 'Add indicator' }));
    const dialog = screen.getByRole('dialog', { name: 'Indicators' });
    expect(await within(dialog).findAllByRole('option')).toHaveLength(4);
    await user.keyboard('zzz');
    expect(within(dialog).getByRole('status')).toHaveTextContent('No indicator matches “zzz”.');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Indicators' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add indicator' })).toHaveFocus();
  });

  it('shows a compute error on the legend row', async () => {
    computeStatus = 422;
    const user = userEvent.setup();
    renderWithQuery(<App />);
    await addEma(user);
    const alert = await within(legend()).findByRole('alert');
    expect(alert).toHaveTextContent("'length' must be >= 1");
  });

  it('right-click: copy the price, reset the view, remove all indicators after a named confirm', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    useIndicatorStore.getState().add('wma', { length: 30, source: 'close', offset: 0 });
    useIndicatorStore.getState().add('ema', { length: 9, source: 'close', offset: 0 });
    const user = userEvent.setup();
    // After setup: user-event installs its own clipboard stub.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithQuery(<App />);
    await screen.findByText('WMA 30');
    const canvas = screen.getByTestId('chart-canvas');

    // The fake engine prices y = 40 at 160.
    fireEvent.contextMenu(canvas, { clientX: 100, clientY: 40 });
    await user.click(screen.getByRole('menuitem', { name: 'Copy price 160.00' }));
    expect(writeText).toHaveBeenCalledWith('160.00');

    fireEvent.contextMenu(canvas, { clientX: 100, clientY: 40 });
    await user.click(screen.getByRole('menuitem', { name: 'Reset chart view' }));
    expect(liveEngine().resets).toBe(1);

    fireEvent.contextMenu(canvas, { clientX: 100, clientY: 40 });
    await user.click(screen.getByRole('menuitem', { name: 'Remove all indicators…' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Remove all indicators?' });
    expect(confirm).toHaveTextContent('WMA 30, EMA 9');
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: 'Remove 2 indicators' }));
    expect(screen.queryByRole('list', { name: 'Indicators on the chart' })).not.toBeInTheDocument();

    const toast = screen.getByText('Removed 2 indicators').closest('div');
    if (toast === null) throw new Error('no toast');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('list', { name: 'Indicators on the chart' })).toHaveTextContent(
      'WMA 30',
    );
  });

  it('restores saved indicators on the next visit', async () => {
    useIndicatorStore.getState().add('wma', { length: 30, source: 'close', offset: 0 });
    renderWithQuery(<App />);
    await screen.findByText('WMA 30');
    await waitFor(() => {
      expect(computes.map((c) => c.id)).toEqual(['wma']);
    });
  });

  it('draws a composite: two lines in the legend, crosses as markers, MA type names', async () => {
    registry = [...INDICATORS, MA_CROSS_SPEC];
    useIndicatorStore.getState().add('ma_cross', {
      fast_type: 'hma',
      fast_length: 9,
      slow_type: 'sma',
      slow_length: 21,
    });
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const label = await within(legend()).findByText('MA Cross HMA 9 21');
    const row = label.closest('li');
    if (row === null) throw new Error('no legend row');
    await waitFor(() => {
      expect(row.querySelectorAll('[data-output]')).toHaveLength(2);
    });
    expect(row.querySelector('[data-output="crosses"]')).toBeNull();
    await waitFor(() => {
      expect(liveEngine().lines.map((l) => [l.plot, l.style.up ?? null])).toEqual([
        ['line', null],
        ['line', null],
        ['markers', '#089981'],
      ]);
    });
    expect(liveEngine().lines[2]?.values.slice(0, 3)).toEqual([null, 1, -1]);

    await user.click(screen.getByRole('button', { name: 'Edit settings: MA Cross HMA 9 21' }));
    const panel = screen.getByRole('dialog', { name: 'MA Cross HMA 9 21' });
    const fastType = within(panel).getByRole('combobox', { name: 'Fast MA type' });
    expect(within(fastType).getByRole('option', { name: 'HMA (Hull)' })).toBeInTheDocument();
    expect(within(panel).queryByRole('combobox', { name: 'Crosses line width' })).toBeNull();
    await user.selectOptions(fastType, 'ema');
    await within(legend()).findByText('MA Cross EMA 9 21');
    expect(computes.at(-1)?.params['fast_type']).toBe('ema');
  });

  it('puts an oscillator in its own pane with a legend at the top of that pane', async () => {
    registry = [...INDICATORS, OBV_SPEC];
    useIndicatorStore.getState().add('obv', {});
    renderWithQuery(<App />);
    await waitFor(() => {
      expect(liveEngine().lines).toHaveLength(1);
    });
    const [line] = liveEngine().lines;
    expect(line).toMatchObject({ ownPane: true, levels: [0], style: { format: 'volume' } });
    expect(screen.queryByRole('list', { name: 'Indicators on the chart' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'OBV pane' })).toBeNull();

    act(() => {
      liveEngine().layoutPanes({ [line?.group ?? '']: 320 });
    });
    const pane = screen.getByRole('list', { name: 'OBV pane' });
    expect(pane.parentElement).toHaveStyle({ top: '320px' });
    await waitFor(() => {
      expect(pane.querySelector('[data-output="obv"]')).toHaveTextContent('-13.65M');
    });
  });
});
