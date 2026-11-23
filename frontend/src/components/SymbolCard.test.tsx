import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useChartStore } from '../store/chartStore.ts';
import { QUOTES, renderWithQuery, stubApi, SYMBOLS } from '../test/render.tsx';
import { SymbolCard } from './SymbolCard.tsx';
import { Watchlist } from './Watchlist.tsx';

beforeEach(() => {
  stubApi({ '/api/symbols': { body: SYMBOLS }, '/api/quotes': { body: QUOTES } });
  useChartStore.setState({ symbol: 'AAPL' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SymbolCard', () => {
  it('shows the charted symbol with price, change, ranges and market status', async () => {
    renderWithQuery(<SymbolCard />);
    const card = await screen.findByRole('region', { name: 'Symbol details' });
    expect(await within(card).findByText('342.56')).toBeInTheDocument();
    expect(card).toHaveTextContent('Apple Inc.');
    expect(card).toHaveTextContent('-6.65 (-1.90%)');
    expect(card).toHaveTextContent("Day's range340.10350.20");
    expect(card).toHaveTextContent('52-week range250.00360.00');
    expect(within(card).getByLabelText(/^Market (open|closed)$/)).toBeInTheDocument();
  });

  it('collapses to its header', async () => {
    const user = userEvent.setup();
    renderWithQuery(<SymbolCard />);
    const toggle = await screen.findByRole('button', { name: /AAPL/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText("Day's range")).not.toBeInTheDocument();
  });
});

describe('Watchlist sparkline', () => {
  it('draws the last closes, green when they rose', async () => {
    const { container } = renderWithQuery(<Watchlist />);
    await screen.findByText('342.56');
    const row = container.querySelector('[data-symbol="AAPL"]');
    const line = row?.querySelector('polyline');
    expect(line?.getAttribute('points')?.split(' ')).toHaveLength(4);
    expect(row?.querySelector('svg')?.getAttribute('class')).toMatch(/up/);
  });
});
