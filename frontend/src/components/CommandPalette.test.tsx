import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '../App.tsx';
import { useChartStore } from '../store/chartStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useThemeStore } from '../store/themeStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import {
  AAPL_BARS,
  barsBody,
  HEALTH_OK,
  INDICATORS,
  QUOTES,
  renderWithQuery,
  stubApi,
  SYMBOLS,
} from '../test/render.tsx';
import { opensPalette } from './keyTarget.ts';

vi.mock('../chart/ChartEngine.ts', () => import('../test/fakeChartEngine.ts'));

beforeEach(() => {
  useChartStore.setState(useChartStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
  useThemeStore.setState({ theme: 'dark' });
  useIndicatorStore.setState({ instances: [], seq: 0 });
  stubApi({
    '/api/health': { body: HEALTH_OK },
    '/api/symbols': { body: SYMBOLS },
    '/api/quotes': { body: QUOTES },
    '/api/bars': { body: barsBody('AAPL', '1D', AAPL_BARS) },
    '/api/indicators': { body: INDICATORS },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function runFromPalette(user: ReturnType<typeof userEvent.setup>, query: string) {
  await user.keyboard('{Control>}k{/Control}');
  const palette = screen.getByRole('dialog', { name: 'Command palette' });
  await user.keyboard(query);
  await within(palette).findAllByRole('option');
  await user.keyboard('{Enter}');
  expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
}

describe('CommandPalette', () => {
  it('runs a symbol, a scale toggle, a theme switch and an indicator from one search', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    await screen.findByText('Apple Inc. · 1D · NASDAQ');

    await runFromPalette(user, 'gbpusd');
    expect(useChartStore.getState().symbol).toBe('GBPUSD=X');

    await runFromPalette(user, 'log');
    expect(useChartStore.getState().scaleMode).toBe('log');

    await runFromPalette(user, 'light');
    expect(useThemeStore.getState().theme).toBe('light');

    await runFromPalette(user, 'add ema');
    expect(useIndicatorStore.getState().instances.map((i) => i.id)).toEqual(['ema']);

    // Actions on an indicator that is on the chart.
    await runFromPalette(user, 'ema 9 remove');
    expect(useIndicatorStore.getState().instances).toEqual([]);
    expect(screen.getByText('Removed EMA 9')).toBeInTheDocument();
  });

  it('says when nothing matches and closes with Esc', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('zzzz');
    const palette = screen.getByRole('dialog', { name: 'Command palette' });
    expect(within(palette).getByRole('status')).toHaveTextContent('Nothing matches “zzzz”');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('opens with Ctrl+K or Cmd+K, also from a text field', () => {
    const key = (init: KeyboardEventInit) => opensPalette(new KeyboardEvent('keydown', init));
    expect(key({ key: 'k', ctrlKey: true })).toBe(true);
    expect(key({ key: 'K', metaKey: true })).toBe(true);
    expect(key({ key: 'k' })).toBe(false);
    expect(key({ key: 'k', ctrlKey: true, altKey: true })).toBe(false);
  });
});
