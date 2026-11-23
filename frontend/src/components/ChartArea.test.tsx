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
import { ChartArea, LOAD_OLDER_THRESHOLD } from './ChartArea.tsx';
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
  useChartStore.setState(useChartStore.getInitialState());
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
    expect(call?.options).toEqual({
      decimals: 2,
      hasVolume: true,
      resetView: true,
      timeZone: 'Asia/Jerusalem',
    });
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

  describe('history paging', () => {
    /** `count` consecutive calendar days ending 2026-11-20 (weekends included, for simplicity). */
    const days = (count: number) =>
      Array.from({ length: count }, (_, i) => {
        const time = new Date(Date.UTC(2026, 10, 20 - (count - 1 - i))).toISOString().slice(0, 10);
        return { time, open: 10, high: 11, low: 9, close: 10.5, volume: 100 };
      });

    /** Serve `all` in pages of `size` bars, newest first, honouring `before=`. */
    function stubPaged(all: ReturnType<typeof days>, size: number): void {
      stubApi({
        '/api/symbols': { body: SYMBOLS },
        '/api/bars': (url) => {
          const before = url.searchParams.get('before');
          const interval = url.searchParams.get('interval') ?? '';
          const transform = url.searchParams.get('transform') ?? 'none';
          requested.push(`${interval} ${transform} ${before ?? '-'}`);
          const end =
            before === null
              ? all.length
              : all.findIndex((bar) => Date.parse(`${bar.time}T00:00:00Z`) / 1000 >= +before);
          const page = all.slice(Math.max(end - size, 0), end);
          return jsonResponse({
            ...barsBody('AAPL', interval, page),
            has_more_before: end - size > 0,
          });
        },
      });
    }

    it('loads the older page when the user scrolls near the first bar, keeping the view', async () => {
      const all = days(30);
      stubPaged(all, 20);
      renderWithQuery(<ChartArea />);
      await waitFor(() => {
        expect(liveEngine().calls.at(-1)?.bars).toHaveLength(20);
      });

      act(() => {
        liveEngine().scrollTo({ from: LOAD_OLDER_THRESHOLD + 1, to: 100 });
      });
      expect(requested).toHaveLength(1); // far from the edge: nothing to load

      act(() => {
        liveEngine().scrollTo({ from: 3, to: 19 });
      });
      await waitFor(() => {
        expect(liveEngine().calls.at(-1)?.bars).toHaveLength(30);
      });
      const cursor = String(Date.parse(`${all[10]?.time ?? ''}T00:00:00Z`) / 1000);
      expect(requested).toEqual(['1D none -', `1D none ${cursor}`]);
      expect(liveEngine().calls.at(-1)?.options.resetView).toBe(false);
      expect(
        liveEngine()
          .calls.at(-1)
          ?.bars.map((b) => b.time),
      ).toEqual(all.map((b) => b.time));

      // History is exhausted: scrolling to the edge again requests nothing.
      act(() => {
        liveEngine().scrollTo({ from: 0, to: 19 });
      });
      expect(requested).toHaveLength(2);
    });

    it('loads older pages until a range button is covered, then shows that range', async () => {
      const all = days(800);
      stubPaged(all, 300);
      renderWithQuery(<ChartArea />);
      await waitFor(() => {
        expect(liveEngine().calls.at(-1)?.bars).toHaveLength(300);
      });

      act(() => {
        useChartStore.getState().selectRange('YTD');
      });
      // 2026-01-01 … 2026-11-20 is 324 days: one older page is needed.
      await waitFor(() => {
        expect(liveEngine().ranges).toHaveLength(1);
      });
      expect(requested).toHaveLength(2);
      const loaded = liveEngine().calls.at(-1)?.bars ?? [];
      expect(loaded).toHaveLength(600);
      const first = loaded.findIndex((bar) => bar.time === '2026-01-01');
      expect(liveEngine().ranges[0]).toEqual({ from: first - 0.5, to: 599 + 5 });
      expect(useChartStore.getState()).toMatchObject({ interval: '1D', range: 'YTD' });
    });

    it('asks the backend for Heikin Ashi bars and swaps the series type', async () => {
      stubPaged(days(10), 20);
      renderWithQuery(<ChartArea />);
      await waitFor(() => {
        expect(liveEngine().calls.at(-1)?.bars).toHaveLength(10);
      });

      act(() => {
        useChartStore.getState().setChartType('heikin_ashi');
      });
      await waitFor(() => {
        expect(requested).toEqual(['1D none -', '1D heikin_ashi -']);
      });
      expect(liveEngine().chartTypes.at(-1)).toBe('heikin_ashi');

      act(() => {
        useChartStore.getState().setChartType('line');
      });
      expect(liveEngine().chartTypes.at(-1)).toBe('line');
      // Line is drawn from plain bars again (tests disable the cache, so they are refetched).
      await waitFor(() => {
        expect(requested.at(-1)).toBe('1D none -');
      });
    });

    it('passes the scale mode and auto-fit to the chart', async () => {
      stubPaged(days(10), 20);
      renderWithQuery(<ChartArea />);
      await waitFor(() => {
        expect(liveEngine().calls.at(-1)?.bars).toHaveLength(10);
      });
      act(() => {
        useChartStore.getState().toggleScaleMode('log');
        useChartStore.getState().setAutoScale(false);
      });
      expect(liveEngine().scales.at(-1)).toEqual({ mode: 'log', autoScale: false });

      // A double-click on the price axis turns auto-fit back on: the toggle follows.
      act(() => {
        liveEngine().emitAutoScale(true);
      });
      expect(useChartStore.getState().autoScale).toBe(true);
    });

    it('offers a jump back to the latest bar after scrolling into the past', async () => {
      stubPaged(days(10), 20);
      const user = userEvent.setup();
      renderWithQuery(<ChartArea />);
      await waitFor(() => {
        expect(liveEngine().calls.at(-1)?.bars).toHaveLength(10);
      });
      expect(screen.queryByRole('button', { name: 'Scroll to the latest bar' })).toBeNull();

      act(() => {
        liveEngine().scrollTo({ from: 0, to: 5 });
      });
      await user.click(screen.getByRole('button', { name: 'Scroll to the latest bar' }));
      expect(liveEngine().scrolledToLatest).toBe(1);

      act(() => {
        liveEngine().scrollTo({ from: 3, to: 14 });
      });
      expect(screen.queryByRole('button', { name: 'Scroll to the latest bar' })).toBeNull();
    });
  });
});
