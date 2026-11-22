import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useChartStore } from '../store/chartStore.ts';
import { engines, liveEngine } from '../test/fakeChartEngine.ts';
import {
  AAPL_BARS,
  barsBody,
  jsonResponse,
  QUOTES,
  renderWithQuery,
  stubApi,
  SYMBOLS,
} from '../test/render.tsx';
import { ChartArea } from './ChartArea.tsx';
import { IntervalSwitcher } from './IntervalSwitcher.tsx';
import { Watchlist } from './Watchlist.tsx';

vi.mock('../chart/ChartEngine.ts', () => import('../test/fakeChartEngine.ts'));

const requested: string[] = [];

function stubBars(): void {
  stubApi({
    '/api/symbols': { body: SYMBOLS },
    '/api/quotes': { body: QUOTES },
    '/api/bars': (url) => {
      const symbol = url.searchParams.get('symbol') ?? '';
      const interval = url.searchParams.get('interval') ?? '';
      requested.push(`${symbol} ${interval}`);
      return jsonResponse(barsBody(symbol, interval, AAPL_BARS));
    },
  });
}

function legend(): HTMLElement {
  return screen.getByLabelText('Price legend');
}

function field(name: string): string | null {
  return legend().querySelector(`[data-field="${name}"]`)?.textContent ?? null;
}

beforeEach(() => {
  engines.length = 0;
  requested.length = 0;
  localStorage.clear();
  useChartStore.setState({ symbol: 'AAPL', interval: '1D' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChartArea', () => {
  it('draws the selected symbol and shows the last bar in the legend', async () => {
    stubBars();
    renderWithQuery(<ChartArea />);

    expect(await within(legend()).findByText('Apple Inc. · 1D · NASDAQ')).toBeInTheDocument();
    expect(field('C')).toBe('342.56');
    expect(field('O')).toBe('348.00');
    expect(field('change')).toBe('-6.65 (-1.90%)');
    expect(field('Vol')).toBe('62.35M');
    expect(legend().querySelector('[data-field="C"]')).toHaveClass('down');

    const call = liveEngine().calls.at(-1);
    expect(call?.bars).toHaveLength(3);
    expect(call?.options).toEqual({ decimals: 2, hasVolume: true, resetView: true });
  });

  it('follows the crosshair and returns to the last bar when it leaves', async () => {
    stubBars();
    renderWithQuery(<ChartArea />);
    await waitFor(() => {
      expect(field('C')).toBe('342.56');
    });

    act(() => {
      liveEngine().hover(1);
    });
    expect(field('C')).toBe('349.21');
    expect(field('change')).toBe('+5.11 (+1.49%)');
    expect(legend().querySelector('[data-field="C"]')).toHaveClass('up');

    act(() => {
      liveEngine().hover(0);
    });
    expect(field('change')).toBeNull(); // first bar: no previous close

    act(() => {
      liveEngine().hover(null);
    });
    expect(field('C')).toBe('342.56');
  });

  it('switches symbol from the watchlist and interval from the toolbar', async () => {
    const user = userEvent.setup();
    stubBars();
    renderWithQuery(
      <>
        <IntervalSwitcher />
        <ChartArea />
        <Watchlist />
      </>,
    );
    await waitFor(() => {
      expect(requested).toContain('AAPL 1D');
    });

    await user.click(await screen.findByText('TSLA'));
    expect(await within(legend()).findByText('Tesla, Inc. · 1D · NASDAQ')).toBeInTheDocument();
    expect(screen.getByText('TSLA').closest('tr')).toHaveAttribute('aria-current', 'true');

    await user.click(screen.getByRole('button', { name: '1 week' }));
    expect(await within(legend()).findByText('Tesla, Inc. · 1W · NASDAQ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 week' })).toHaveAttribute('aria-pressed', 'true');

    expect(requested).toEqual(['AAPL 1D', 'TSLA 1D', 'TSLA 1W']);
    // One view reset per data set that arrived (the empty placeholder before AAPL does not count).
    const resets = liveEngine().calls.filter((c) => c.options.resetView && c.bars.length > 0);
    expect(resets).toHaveLength(3);
    expect(useChartStore.getState()).toMatchObject({ symbol: 'TSLA', interval: '1W' });
  });

  it('selects a watchlist row with the keyboard', async () => {
    const user = userEvent.setup();
    stubBars();
    renderWithQuery(<Watchlist />);

    const row = (await screen.findByText('SPX')).closest('tr');
    row?.focus();
    await user.keyboard('{Enter}');

    expect(useChartStore.getState().symbol).toBe('^GSPC');
  });

  it('shows 1h bars after switching to the 1 hour interval', async () => {
    const user = userEvent.setup();
    const hourly = AAPL_BARS.map((bar, i) => ({ ...bar, time: 1_770_301_800 + i * 3600 }));
    stubApi({
      '/api/symbols': { body: SYMBOLS },
      '/api/bars': (url) => {
        const interval = url.searchParams.get('interval') ?? '';
        requested.push(`AAPL ${interval}`);
        return jsonResponse(barsBody('AAPL', interval, interval === '1h' ? hourly : AAPL_BARS));
      },
    });
    renderWithQuery(
      <>
        <IntervalSwitcher />
        <ChartArea />
      </>,
    );
    await within(legend()).findByText('Apple Inc. · 1D · NASDAQ');

    await user.click(screen.getByRole('button', { name: '1 hour' }));
    expect(await within(legend()).findByText('Apple Inc. · 1h · NASDAQ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 hour' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      liveEngine()
        .calls.at(-1)
        ?.bars.map((bar) => bar.time),
    ).toEqual(hourly.map((bar) => bar.time));
    expect(field('C')).toBe('342.56');
    expect(requested).toEqual(['AAPL 1D', 'AAPL 1h']);
  });

  it('falls back to the default symbol when the remembered one left the universe', async () => {
    useChartStore.setState({ symbol: 'GOLD' });
    stubBars();
    renderWithQuery(<ChartArea />);

    await waitFor(() => {
      expect(useChartStore.getState().symbol).toBe('AAPL');
    });
    expect(await within(legend()).findByText('Apple Inc. · 1D · NASDAQ')).toBeInTheDocument();
  });

  it('hides volume and uses the symbol decimals for forex', async () => {
    useChartStore.setState({ symbol: 'GBPUSD=X' });
    stubBars();
    renderWithQuery(<ChartArea />);

    await within(legend()).findByText('British Pound / US Dollar · 1D · FX');
    expect(field('Vol')).toBeNull();
    expect(field('C')).toBe('342.56000');
    expect(liveEngine().calls.at(-1)?.options).toMatchObject({ decimals: 5, hasVolume: false });
  });

  it('shows the error and retries', async () => {
    const user = userEvent.setup();
    let fail = true;
    stubApi({
      '/api/symbols': { body: SYMBOLS },
      '/api/bars': () =>
        fail
          ? jsonResponse({ title: 'Data unavailable', detail: 'No data for AAPL', code: 'x' }, 503)
          : jsonResponse(barsBody('AAPL', '1D', AAPL_BARS)),
    });
    renderWithQuery(<ChartArea />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load AAPL (1D)');
    expect(alert).toHaveTextContent('No data for AAPL');

    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(field('C')).toBe('342.56');
  });

  it('disposes the chart engine on unmount', async () => {
    stubBars();
    const { unmount } = renderWithQuery(<ChartArea />);
    await waitFor(() => {
      expect(field('C')).toBe('342.56');
    });
    const engine = liveEngine();

    unmount();
    expect(engine.disposed).toBe(true);
  });
});
