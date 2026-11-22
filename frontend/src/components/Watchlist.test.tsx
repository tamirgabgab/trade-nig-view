import { screen, within } from '@testing-library/react';

import { groupSymbols, parseQuotes, parseSymbols } from '../api/market.ts';
import { QUOTES, renderWithQuery, stubApi, SYMBOLS } from '../test/render.tsx';
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

  it('marks a failed symbol as n/a without breaking the others', async () => {
    stubApi({ '/api/symbols': { body: SYMBOLS }, '/api/quotes': { body: QUOTES } });
    renderWithQuery(<Watchlist />);

    const tsla = await rowFor('TSLA');
    const na = await within(tsla).findByText('n/a');
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
});
