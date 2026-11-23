import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from './App.tsx';
import { newDrawing } from './drawings/manager.ts';
import { useChartStore } from './store/chartStore.ts';
import { useDrawingStore } from './store/drawingStore.ts';
import { useSettingsStore } from './store/settingsStore.ts';
import { useThemeStore } from './store/themeStore.ts';
import { useUiStore } from './store/uiStore.ts';
import { liveEngine } from './test/fakeChartEngine.ts';
import {
  AAPL_BARS,
  barsBody,
  HEALTH_OK,
  QUOTES,
  renderWithQuery,
  stubApi,
  SYMBOLS,
} from './test/render.tsx';

vi.mock('./chart/ChartEngine.ts', () => import('./test/fakeChartEngine.ts'));

beforeEach(() => {
  useChartStore.setState(useChartStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
  useThemeStore.setState({ theme: 'dark' });
  useDrawingStore.setState({ tool: null, lastTool: {}, magnet: 'off' });
  stubApi({
    '/api/health': { body: HEALTH_OK },
    '/api/symbols': { body: SYMBOLS },
    '/api/quotes': { body: QUOTES },
    '/api/bars': { body: barsBody('AAPL', '1D', AAPL_BARS) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App shell', () => {
  it('switches between the dark and light theme and repaints the chart', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    expect(document.documentElement.dataset['theme']).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(liveEngine().themes).toBe(1);
    expect(JSON.parse(localStorage.getItem('chartlab.theme') ?? '{}')).toMatchObject({
      state: { theme: 'light' },
    });

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('renders the five layout regions', () => {
    renderWithQuery(<App />);

    expect(screen.getByRole('toolbar', { name: 'Chart toolbar' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Drawing tools' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Chart' })).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Watchlist and details' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('contentinfo', { name: 'Chart range and scale' })).toBeInTheDocument();
  });

  it('gives every button an accessible name', () => {
    renderWithQuery(<App />);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

  it('selects one drawing tool at a time, and back to the cursor', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const toolbar = screen.getByRole('navigation', { name: 'Drawing tools' });
    const cursor = within(toolbar).getByRole('button', { name: 'Cross cursor' });
    const trend = within(toolbar).getByRole('button', { name: 'Trend line' });

    expect(cursor).toHaveAttribute('aria-pressed', 'true');
    await user.click(trend);
    expect(trend).toHaveAttribute('aria-pressed', 'true');
    expect(cursor).toHaveAttribute('aria-pressed', 'false');

    // The group's arrow lists its tools; picking one makes it the group's button.
    await user.click(within(toolbar).getByRole('button', { name: 'Trend line tools: all tools' }));
    await user.click(screen.getByRole('menuitemradio', { name: /^Horizontal line/ }));
    const horizontal = within(toolbar).getByRole('button', { name: 'Horizontal line' });
    expect(horizontal).toHaveAttribute('aria-pressed', 'true');

    await user.click(cursor);
    expect(horizontal).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles magnet mode', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const magnet = screen.getByRole('button', { name: 'Magnet mode' });

    await user.click(magnet);
    expect(magnet).toHaveAttribute('aria-pressed', 'true');
    await user.click(magnet);
    expect(magnet).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps log and percent scale mutually exclusive', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const log = screen.getByRole('button', { name: 'Logarithmic scale' });
    const percent = screen.getByRole('button', { name: 'Percent scale' });

    await user.click(log);
    await user.click(percent);

    expect(percent).toHaveAttribute('aria-pressed', 'true');
    expect(log).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks exactly one visible-range button as selected', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const group = screen.getByRole('group', { name: 'Visible range' });

    await user.click(within(group).getByRole('button', { name: '5 years' }));

    const pressed = within(group)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((button) => button.textContent)).toEqual(['5Y']);
  });

  it('lists watchlist sections from the API', async () => {
    renderWithQuery(<App />);
    const table = await within(screen.getByRole('complementary')).findByRole('table');

    for (const title of ['Indices', 'Stocks', 'Forex']) {
      expect(within(table).getByText(title)).toBeInTheDocument();
    }
    expect(within(table).getByText('AAPL')).toBeInTheDocument();
  });

  it('shows the selected symbol on the symbol button', async () => {
    renderWithQuery(<App />);
    expect(await screen.findByRole('button', { name: 'Symbol search: AAPL' })).toBeInTheDocument();
  });

  it('removes all drawings from the trash menu after a confirmation, with undo', async () => {
    const user = userEvent.setup();
    const line = newDrawing(
      'trend_line',
      [
        { time: 1, price: 10 },
        { time: 2, price: 11 },
      ],
      'a',
    );
    stubApi({
      '/api/health': { body: HEALTH_OK },
      '/api/symbols': { body: SYMBOLS },
      '/api/quotes': { body: QUOTES },
      '/api/bars': { body: barsBody('AAPL', '1D', AAPL_BARS) },
      '/api/drawings/AAPL': { body: { symbol: 'AAPL', revision: 1, drawings: [line] } },
    });
    renderWithQuery(<App />);
    await waitFor(() => {
      expect(useDrawingStore.getState().drawings).toHaveLength(1);
    });

    await user.click(screen.getByRole('button', { name: 'Remove objects' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove 1 drawing…' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Remove all drawings?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove 1 drawing' }));
    expect(useDrawingStore.getState().drawings).toEqual([]);

    const toast = screen.getByText('Removed 1 drawing').closest('div');
    if (toast === null) throw new Error('no toast');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(useDrawingStore.getState().drawings).toEqual([line]);
  });

  it('applies chart settings live: time zone, volume, last-price line, candle colours', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({
      timeZone: 'Asia/Jerusalem',
      upColor: null,
      downColor: null,
      lastPriceLine: true,
      volume: true,
    });
    renderWithQuery(<App />);
    await user.click(screen.getByRole('button', { name: 'Open chart settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Chart settings' });

    await user.selectOptions(within(dialog).getByLabelText('Time zone'), 'UTC');
    expect(screen.getByTitle('Chart time zone: UTC')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Volume' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Last price line' }));
    fireEvent.change(within(dialog).getByLabelText('Up'), { target: { value: '#2962ff' } });
    expect(liveEngine().display).toEqual({
      upColor: '#2962ff',
      downColor: null,
      lastPriceLine: false,
      volume: false,
    });
    await user.click(within(dialog).getByRole('button', { name: 'Reset colors' }));
    expect(liveEngine().display?.upColor).toBeNull();
  });
});
