import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Gap } from '../api/analysis.ts';
import { useChartDataStore } from '../store/chartDataStore.ts';
import { useStructureStore } from '../store/structureStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { QUOTES, renderWithQuery, stubApi, SYMBOLS } from '../test/render.tsx';
import { RightSidebar } from './RightSidebar.tsx';

/** Pretend the window is narrower than 1100 px (or not). Motion reduced: exits are instant. */
function stubWindow(narrow: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('reduce') || narrow,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState());
  useSettingsStore.setState({ heatmap: false }); // rows are found by their symbol's text
  useStructureStore.setState({ gaps: true, gapMinPct: 1, gapPartial: false });
  stubApi({ '/api/symbols': { body: SYMBOLS }, '/api/quotes': { body: QUOTES } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const watchlist = () => screen.queryByRole('region', { name: 'Watchlist' });

describe('RightSidebar', () => {
  it('docks the watchlist on a wide window; the button collapses and restores it', async () => {
    stubWindow(false);
    const user = userEvent.setup();
    renderWithQuery(<RightSidebar />);
    expect(watchlist()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide watchlist' }));
    expect(watchlist()).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show watchlist' }));
    expect(watchlist()).toBeInTheDocument();
  });

  it('floats it on a narrow window, closed by the button, Esc or a click outside', async () => {
    stubWindow(true);
    const user = userEvent.setup();
    renderWithQuery(
      <>
        <button type="button">Outside</button>
        <RightSidebar />
      </>,
    );
    expect(watchlist()).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Show watchlist' });
    await user.click(toggle);
    expect(watchlist()).toBeInTheDocument();
    // An Esc that a dialog already handled leaves it open.
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    handled.preventDefault();
    window.dispatchEvent(handled);
    expect(watchlist()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(watchlist()).not.toBeInTheDocument();

    await user.click(toggle);
    await user.click(screen.getByText('SPX'));
    expect(watchlist()).toBeInTheDocument(); // clicks inside keep it open
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(watchlist()).not.toBeInTheDocument();
  });

  it('switches the panel between watchlist, data window and gaps', async () => {
    stubWindow(false);
    const user = userEvent.setup();
    const pivotsView = {
      instance: { uid: 'p1', id: 'pivots', params: {}, styles: {}, visible: true },
      spec: undefined,
      params: {},
      label: 'Pivots 1 1',
      error: null,
      isFetching: false,
      outputs: [
        {
          name: 'high',
          label: 'Pivot high',
          plot: 'markers' as const,
          style: { shape: 'circle', position: 'above' },
          color: '#f23645',
          lineWidth: 2,
          values: [null, 13],
          displayShift: 1,
        },
      ],
    };
    const gap: Gap = {
      time: '2026-11-18',
      filledTime: null,
      direction: 'up',
      kind: 'full',
      top: 12,
      bottom: 11,
      sizePct: 9.09,
      fillPrice: null,
    };
    useChartDataStore.getState().setData({
      bars: [
        { time: '2026-11-17', open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
        { time: '2026-11-18', open: 12.2, high: 13, low: 12, close: 12.5, volume: 2500 },
      ],
      decimals: 2,
      hasVolume: true,
      views: [pivotsView],
      gaps: [gap],
    });
    renderWithQuery(<RightSidebar />);

    await user.click(screen.getByRole('button', { name: 'Show data window' }));
    const data = screen.getByRole('region', { name: 'Data window' });
    expect(data).toHaveTextContent('Wed 18 Nov 2026');
    expect(data).toHaveTextContent('Close12.50');
    // The crosshair on the first bar shows that bar.
    act(() => {
      useChartDataStore.getState().setHoverIndex(0);
    });
    expect(data).toHaveTextContent('Close10.50');
    // The pivot of bar 1 (confirmed one bar later) shows on bar 0, where its dot is drawn.
    expect(within(data).getByRole('region', { name: 'Pivots 1 1' })).toHaveTextContent(
      'Pivot high13.00',
    );
    expect(watchlist()).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show gaps' }));
    const gaps = screen.getByRole('region', { name: 'Gaps' });
    expect(gaps).toHaveTextContent('1 gap, 1 open');
    await user.click(within(gaps).getByRole('button', { name: /9\.09%/ }));
    expect(useChartDataStore.getState().focus).toMatchObject({ time: '2026-11-18' });

    // Its own button closes it.
    await user.click(screen.getByRole('button', { name: 'Hide gaps' }));
    expect(screen.queryByRole('region', { name: 'Gaps' })).not.toBeInTheDocument();
  });
});
