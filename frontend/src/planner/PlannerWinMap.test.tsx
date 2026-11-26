import { render, screen, within } from '@testing-library/react';

import { STUDY_RESULT } from '../test/plannerCompareBody.ts';
import styles from './Planner.module.css';
import { PlannerWinMap } from './PlannerWinMap.tsx';

describe('PlannerWinMap', () => {
  it('shows the gap of the yearly returns by start year and horizon, tinted by the winner', () => {
    render(<PlannerWinMap map={STUDY_RESULT.win_map} names={['Apartment', 'Market']} />);
    const map = screen.getByRole('table', { name: 'Win map' });
    const headers = within(map).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Start', '5 y', '10 y']);
    expect(
      within(map)
        .getAllByRole('rowheader')
        .map((h) => h.textContent),
    ).toEqual(['2002', '2003']);
    const cells = within(map).getAllByRole('cell');
    expect(cells.map((c) => c.textContent)).toEqual(['+6.00', '−0.50', '−3.00', '—']);
    // Six points ahead is the strongest tint; half a point behind the weakest; three, the third.
    expect(cells[0]).toHaveClass(styles.win4 ?? '');
    expect(cells[1]).toHaveClass(styles.lose1 ?? '');
    expect(cells[2]).toHaveClass(styles.lose3 ?? '');
    expect(cells[0]).toHaveAttribute(
      'title',
      'Apartment 8.00% a year, Market 2.00%: ₪300,000 at the end',
    );
    expect(cells[3]).toHaveAttribute('title', 'Cannot run on the data');
  });

  it('leaves a cell without a return untinted', () => {
    const map = {
      horizons_years: [5],
      rows: [{ start: '2002-01-15', cells: [{ x_xirr: null, y_xirr: 0.02, difference: 0 }] }],
    };
    render(<PlannerWinMap map={map} names={['Apartment', 'Market']} />);
    expect(screen.getByRole('cell')).toHaveTextContent('—');
  });
});
