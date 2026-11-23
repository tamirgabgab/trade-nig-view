import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '../App.tsx';
import { useChartStore } from '../store/chartStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import {
  AAPL_BARS,
  barsBody,
  HEALTH_OK,
  INDICATORS,
  jsonResponse,
  QUOTES,
  renderWithQuery,
  stubApi,
  SYMBOLS,
} from '../test/render.tsx';

vi.mock('../chart/ChartEngine.ts', () => import('../test/fakeChartEngine.ts'));

const PAGE =
  '# Simple Moving Average\n\n## Formula\n\n$$y_t = \\frac{1}{n}\\sum_{k=0}^{n-1} x_{t-k}$$\n';

interface ResponseBody {
  id: string;
  params: Record<string, number | string>;
}

let responses: ResponseBody[] = [];

/** An n-tap boxcar, as the backend measures it (lag (n - 1) / 2, NRF 1 / n). */
function boxcar(body: ResponseBody) {
  const n = Number(body.params['length']);
  const h = Array.from({ length: n }, () => 1 / n);
  return {
    id: body.id,
    outputs: [
      {
        name: 'ma',
        label: 'MA',
        linear: true,
        reason: null,
        step: h.map((_, k) => (k + 1) / n),
        ramp_lag: (n - 1) / 2,
        impulse: h,
        dc_gain: 1,
        // A float a hair below zero must not show as "-0.00".
        lag: body.id === 'ema' ? -1e-15 : (n - 1) / 2,
        nrf: 1 / n,
        frequency: { period: [2, 20, 200], magnitude_db: [-20, -3, 0], group_delay: [4, 4, 4] },
        truncated: false,
      },
    ],
  };
}

beforeEach(() => {
  localStorage.clear();
  useChartStore.setState(useChartStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
  useIndicatorStore.setState(useIndicatorStore.getInitialState());
  responses = [];
  stubApi({
    '/api/health': { body: HEALTH_OK },
    '/api/symbols': { body: SYMBOLS },
    '/api/quotes': { body: QUOTES },
    '/api/bars': { body: barsBody('AAPL', '1D', AAPL_BARS) },
    '/api/indicators': { body: INDICATORS },
    '/api/indicators/compute': () => jsonResponse({ detail: 'not needed' }, 500),
    '/api/learn/sma': { body: { slug: 'sma', markdown: PAGE } },
    '/api/learn/ema': { status: 404, body: { title: 'Not Found', detail: 'No learn page' } },
    '/api/indicators/response': (_url, init) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as ResponseBody;
      responses.push(body);
      if (body.id === 'smma') {
        return jsonResponse({ title: 'Unprocessable', status: 422, detail: 'bad params' }, 422);
      }
      return jsonResponse(boxcar(body));
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openLearn(user: ReturnType<typeof userEvent.setup>, id: string, name: string) {
  await screen.findByText('Apple Inc. · 1D · NASDAQ');
  useIndicatorStore.getState().add(id, { length: 9, source: 'close', offset: 0 });
  await user.click(await screen.findByRole('button', { name: `Learn: ${name}` }));
  return screen.findByRole('complementary', { name: name });
}

describe('learn drawer', () => {
  it('renders the learn page with KaTeX math, without repeating its title', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const drawer = await openLearn(user, 'sma', 'Simple Moving Average');

    expect(await within(drawer).findByRole('heading', { name: 'Formula' })).toBeInTheDocument();
    expect(drawer.querySelector('.katex')).not.toBeNull();
    expect(within(drawer).getAllByRole('heading', { level: 2 })).toHaveLength(2);
    expect(within(drawer).getByRole('tab', { name: 'Page' })).toHaveFocus();
  });

  it('shows the filter table and compares with another average', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const drawer = await openLearn(user, 'sma', 'Simple Moving Average');
    await user.click(within(drawer).getByRole('tab', { name: 'Filter view' }));

    const table = await within(drawer).findByRole('table');
    expect(within(table).getByRole('row', { name: /Lag \(bars\)/ })).toHaveTextContent('4.00');
    expect(within(table).getByRole('row', { name: /Noise/ })).toHaveTextContent('0.111');
    expect(responses[0]).toEqual({
      id: 'sma',
      params: { length: 9, source: 'close', offset: 0 },
    });

    await user.selectOptions(within(drawer).getByLabelText('Compare with'), 'wma');
    const length = within(drawer).getByLabelText('Length');
    await user.clear(length);
    await user.type(length, '5');
    await waitFor(() => {
      expect(within(table).getByRole('row', { name: /Lag \(bars\)/ })).toHaveTextContent('2.00');
    });
    expect(responses.at(-1)).toEqual({ id: 'wma', params: { length: 5 } });
    expect(within(drawer).getByRole('list', { name: 'Series' })).toHaveTextContent('WMA 5');

    await user.click(within(drawer).getByRole('button', { name: 'Add WMA to chart' }));
    expect(useIndicatorStore.getState().instances.map((i) => [i.id, i.params])).toEqual([
      ['sma', { length: 9, source: 'close', offset: 0 }],
      ['wma', { length: 5, source: 'close', offset: 0 }],
    ]);
  });

  it('rejects an out-of-range compare length without asking the backend', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const drawer = await openLearn(user, 'sma', 'Simple Moving Average');
    await user.click(within(drawer).getByRole('tab', { name: 'Filter view' }));
    await within(drawer).findByRole('table');

    await user.selectOptions(within(drawer).getByLabelText('Compare with'), 'ema');
    const length = within(drawer).getByLabelText('Length');
    await user.clear(length);
    await user.type(length, '0');
    expect(length).toHaveAttribute('aria-invalid', 'true');
    expect(within(drawer).queryByRole('button', { name: /Add EMA/ })).not.toBeInTheDocument();
    expect(responses.some((r) => r.id === 'ema' && r.params['length'] === 0)).toBe(false);
  });

  it('shows a tiny negative lag as zero', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const drawer = await openLearn(user, 'ema', 'Exponential Moving Average');
    await user.click(within(drawer).getByRole('tab', { name: 'Filter view' }));
    const table = await within(drawer).findByRole('table');
    expect(within(table).getByRole('row', { name: /Lag \(bars\)/ })).toHaveTextContent(
      /Lag \(bars\)0\.00$/,
    );
  });

  it('reports a missing page and closes with Escape and with the toggle', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const drawer = await openLearn(user, 'ema', 'Exponential Moving Average');
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('Could not load this page');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: /Exponential/ })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Learn: Exponential Moving Average' });
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await screen.findByRole('complementary', { name: /Exponential/ });
    await user.click(toggle);
    expect(screen.queryByRole('complementary', { name: /Exponential/ })).not.toBeInTheDocument();
  });

  it('reports a failed comparison instead of dropping it silently', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const drawer = await openLearn(user, 'sma', 'Simple Moving Average');
    await user.click(within(drawer).getByRole('tab', { name: 'Filter view' }));
    await within(drawer).findByRole('table');

    await user.selectOptions(within(drawer).getByLabelText('Compare with'), 'smma');
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('Could not measure SMMA');
  });
});
