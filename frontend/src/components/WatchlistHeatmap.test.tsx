import { fireEvent, render, screen } from '@testing-library/react';

import { WatchlistHeatmap } from './WatchlistHeatmap.tsx';

describe('WatchlistHeatmap', () => {
  it('shows a tile per symbol with its change, coloured by the move; a click picks it', () => {
    const pick = vi.fn();
    render(
      <WatchlistHeatmap
        tiles={[
          { symbol: 'AAPL', display: 'AAPL', changePct: 0.77 },
          { symbol: 'MSFT', display: 'MSFT', changePct: -5.08 },
          { symbol: 'SPX', display: 'SPX', changePct: null },
        ]}
        active="AAPL"
        onPick={pick}
      />,
    );
    const aapl = screen.getByRole('button', { name: /AAPL/ });
    expect(aapl).toHaveTextContent('+0.77%');
    expect(aapl).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /MSFT/ }).getAttribute('style')).toContain(
      'var(--color-down) 70%',
    );
    expect(screen.getByRole('button', { name: /SPX/ })).toHaveTextContent('—');
    fireEvent.click(screen.getByRole('button', { name: /MSFT/ }));
    expect(pick).toHaveBeenCalledWith('MSFT');
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<WatchlistHeatmap tiles={[]} active="AAPL" onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
