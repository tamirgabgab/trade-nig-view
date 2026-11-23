import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
});
