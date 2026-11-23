import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { groupSymbols, parseQuotes, parseSymbols } from '../api/market.ts';
import { useUiStore } from '../store/uiStore.ts';
import { useWatchlistStore } from '../store/watchlistStore.ts';
import {
  defaultWatchlists,
  jsonResponse,
  QUOTES,
  renderWithQuery,
  stubApi,
  SYMBOLS,
} from '../test/render.tsx';
import { SymbolSearchDialog } from './SymbolSearchDialog.tsx';
import { Watchlist } from './Watchlist.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function rowFor(display: string): Promise<HTMLElement> {
  const cell = await screen.findByText(display);
  const row = cell.closest('tr');
  if (!row) throw new Error(`No row for ${display}`);
  return row;
}

describe('Watchlist', () => {
  it('shows last, change and change % with direction colors', async () => {
    stubApi({ '/api/symbols': { body: SYMBOLS }, '/api/quotes': { body: QUOTES } });
    renderWithQuery(<Watchlist />);

    const spx = await rowFor('SPX');
    expect(await within(spx).findByText('6,910.39')).toBeInTheDocument();
    expect(within(spx).getByText('-265.44')).toHaveClass('down');
    expect(within(spx).getByText('-3.70%')).toHaveClass('down');

    const gbp = await rowFor('GBPUSD');
    expect(within(gbp).getByText('1.30809')).toBeInTheDocument();
    expect(within(gbp).getByText('0.00061')).toHaveClass('up');
  });

  it('shows a dash with the reason for a failed symbol without breaking the others', async () => {
    stubApi({ '/api/symbols': { body: SYMBOLS }, '/api/quotes': { body: QUOTES } });
    renderWithQuery(<Watchlist />);

    const tsla = await rowFor('TSLA');
    const na = await within(tsla).findByTitle(/^No data for TSLA/);
    expect(na).toHaveTextContent('—');
    expect(na).toHaveAttribute('title', 'No data for TSLA: yahoo: rate limited');
    expect(await within(await rowFor('AAPL')).findByText('342.56')).toBeInTheDocument();
  });

  it('shows dashes while prices are loading', async () => {
    stubApi({
      '/api/symbols': { body: SYMBOLS },
      '/api/quotes': () => new Promise<Response>(() => undefined),
    });
    renderWithQuery(<Watchlist />);

    const aapl = await rowFor('AAPL');
    expect(within(aapl).getAllByText('—')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent('Loading prices');
  });

  it('offers a retry when the symbol list fails', async () => {
    stubApi({ '/api/symbols': { status: 500, body: { detail: 'boom', title: 'Error' } } });
    renderWithQuery(<Watchlist />);

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('market parsers', () => {
  it('groups symbols by section in universe order', () => {
    const groups = groupSymbols(parseSymbols(SYMBOLS)).map(([group, members]) => [
      group,
      members.map((m) => m.display),
    ]);
    expect(groups).toEqual([
      ['Indices', ['SPX']],
      ['Stocks', ['AAPL', 'TSLA']],
      ['Forex', ['GBPUSD']],
    ]);
  });

  it('rejects malformed responses', () => {
    expect(() => parseSymbols({})).toThrow('Unexpected /api/symbols response');
    expect(() => parseQuotes([{ symbol: 'A', last: 'x' }])).toThrow();
  });

  it('edits the list: drag to reorder, right-click to remove, + to add; each change is saved', async () => {
    const user = userEvent.setup();
    useUiStore.setState(useUiStore.getInitialState());
    useWatchlistStore.setState({ active: 'Default' });
    const saved: { revision: number; sections: { title: string; symbols: string[] }[] }[] = [];
    stubApi({
      '/api/symbols': { body: SYMBOLS },
      '/api/quotes': { body: QUOTES },
      '/api/watchlists': { body: defaultWatchlists() },
      '/api/watchlists/Default': (_url, init) => {
        const body = JSON.parse(init?.body as string) as (typeof saved)[number];
        saved.push(body);
        return jsonResponse({ ...body, name: 'Default', revision: saved.length, updated_at: '' });
      },
    });
    renderWithQuery(
      <>
        <Watchlist />
        <SymbolSearchDialog />
      </>,
    );
    const symbols = () =>
      [...document.querySelectorAll('tr[data-symbol]')].map((r) => r.getAttribute('data-symbol'));
    await rowFor('TSLA');
    expect(symbols()).toEqual(['^GSPC', 'AAPL', 'TSLA', 'GBPUSD=X']);

    // Drag TSLA above AAPL.
    fireEvent.dragStart(await rowFor('TSLA'));
    fireEvent.drop(await rowFor('AAPL'));
    await waitFor(() => {
      expect(symbols()).toEqual(['^GSPC', 'TSLA', 'AAPL', 'GBPUSD=X']);
    });

    fireEvent.contextMenu(await rowFor('AAPL'));
    await user.click(screen.getByRole('menuitem', { name: 'Remove AAPL from the watchlist' }));
    await waitFor(() => {
      expect(symbols()).toEqual(['^GSPC', 'TSLA', 'GBPUSD=X']);
    });

    await user.click(screen.getByRole('button', { name: 'Add symbol to the watchlist' }));
    const search = screen.getByRole('dialog', { name: 'Add to Default' });
    await user.type(within(search).getByRole('combobox'), 'AAPL');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(symbols()).toEqual(['^GSPC', 'TSLA', 'GBPUSD=X', 'AAPL']);
    });

    // Saved in order, each on the previous revision.
    await waitFor(() => {
      expect(saved.map((b) => b.revision)).toEqual([0, 1, 2]);
    });
    expect(saved.at(-1)?.sections.at(-1)?.symbols).toEqual(['GBPUSD=X', 'AAPL']);
  });

  it('keeps an edit made while the previous one is saving, and drops symbols gone from the universe', async () => {
    useUiStore.setState(useUiStore.getInitialState());
    useWatchlistStore.setState({ active: 'Mine' });
    const saved: { revision: number; sections: { symbols: string[] }[] }[] = [];
    let release: (() => void) | undefined;
    stubApi({
      '/api/symbols': { body: SYMBOLS },
      '/api/quotes': { body: QUOTES },
      '/api/watchlists': {
        body: {
          watchlists: [
            {
              name: 'Mine',
              revision: 1,
              updated_at: '',
              schema_version: 1,
              sections: [{ title: 'All', symbols: ['AAPL', 'TSLA', 'GONE', '^GSPC'] }],
            },
          ],
        },
      },
      '/api/watchlists/Mine': (_url, init) => {
        const body = JSON.parse(init?.body as string) as (typeof saved)[number];
        saved.push(body);
        const reply = jsonResponse({ ...body, name: 'Mine', revision: body.revision + 1 });
        // The first save is slow: the second edit happens meanwhile.
        return saved.length > 1
          ? reply
          : new Promise<Response>((resolve) => {
              release = () => {
                void reply.then(resolve);
              };
            });
      },
    });
    renderWithQuery(<Watchlist />);
    const symbols = () =>
      [...document.querySelectorAll('tr[data-symbol]')].map((r) => r.getAttribute('data-symbol'));
    fireEvent.contextMenu(await rowFor('AAPL'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove AAPL from the watchlist' }));
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    fireEvent.contextMenu(await rowFor('TSLA'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove TSLA from the watchlist' }));
    release?.();
    await waitFor(() => {
      expect(saved).toHaveLength(2);
    });
    expect(saved.map((b) => [b.revision, b.sections[0]?.symbols])).toEqual([
      [1, ['TSLA', '^GSPC']],
      [2, ['^GSPC']],
    ]);
    await waitFor(() => {
      expect(symbols()).toEqual(['^GSPC']);
    });
  });
});
