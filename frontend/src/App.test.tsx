import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from './App.tsx';
import { useChartStore } from './store/chartStore.ts';
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

  it('selects one drawing tool at a time', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const toolbar = screen.getByRole('navigation', { name: 'Drawing tools' });
    const cursor = within(toolbar).getByRole('button', { name: 'Cross cursor' });
    const fib = within(toolbar).getByRole('button', { name: 'Gann and Fibonacci tools' });

    expect(cursor).toHaveAttribute('aria-pressed', 'true');
    await user.click(fib);

    expect(fib).toHaveAttribute('aria-pressed', 'true');
    expect(cursor).toHaveAttribute('aria-pressed', 'false');
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
});
