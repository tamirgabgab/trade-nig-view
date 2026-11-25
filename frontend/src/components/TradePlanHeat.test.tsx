import { render, screen, within } from '@testing-library/react';

import { TradePlanHeat } from './TradePlanHeat.tsx';

describe('TradePlanHeat', () => {
  it('lists EV per stop (rows) and target (columns) and outlines the drawn plan', () => {
    render(
      <TradePlanHeat
        multiples={[0.5, 1, 2]}
        heat={[
          [0.1, 0.2, null],
          [-0.3, 0.05, 0.4],
          [0, 0, 0],
        ]}
        current={[0.9, 1.8]}
      />,
    );
    const table = screen.getByRole('table', { name: /Expected R/ });
    const row = within(table).getAllByRole('row')[2]; // header, 0.5, then the 1 x stop row
    if (row === undefined) throw new Error('no row');
    const cells = within(row).getAllByRole('cell');
    expect(cells.map((c) => c.textContent)).toEqual(['-0.30', '0.05', '0.40']);
    expect(cells[2]).toHaveAttribute('aria-current', 'true'); // stop 0.9 -> 1, target 1.8 -> 2
    expect(within(table).getAllByRole('cell')[2]).toHaveTextContent('—');
  });
});
