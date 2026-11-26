import { render, screen, within } from '@testing-library/react';

import { parseScenario } from '../api/planner.ts';
import { SCENARIO_RESULT } from '../test/plannerCompareBody.ts';
import { PlannerTornado } from './PlannerTornado.tsx';

const MOVES = parseScenario(SCENARIO_RESULT).sensitivity;

describe('PlannerTornado', () => {
  it('lists each input’s two moves, the largest effect first', () => {
    render(<PlannerTornado moves={MOVES} names={['Apartment', 'Market']} />);
    const table = screen.getByRole('table', { name: 'Sensitivity' });
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      ['Market return, 1 point a year', '+₪300,000', '−₪340,000'],
      ['Apartment appreciation, 1 point a year', '−₪210,000', '+₪230,000'],
      ['Mortgage rates, 1 point', '+₪60,000', '−₪90,000'],
      ['Rent, 10%', '−₪45,000', '+₪45,000'],
      // A move the plan cannot run with is a dash, not a zero.
      ['Capital-gains and betterment tax, 5 points', '—', '−₪20,000'],
    ]);
  });

  it('draws a bar for every move that ran, named for the move', () => {
    render(<PlannerTornado moves={MOVES} names={['Apartment', 'Market']} />);
    const chart = screen.getByRole('img', {
      name: 'How apartment minus market changes when one input moves',
    });
    const titles = [...chart.querySelectorAll('title')].map((t) => t.textContent);
    expect(titles).toHaveLength(9);
    expect(titles[0]).toBe('Market return down 1 point a year: +₪300,000');
    expect(titles[1]).toBe('Market return up 1 point a year: −₪340,000');
    expect(titles).toContain('Rent up 10%: +₪45,000');
  });

  it('says so when no input can be moved', () => {
    render(<PlannerTornado moves={[]} names={['Apartment', 'Market']} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('No input of this comparison can be moved.')).toBeVisible();
  });
});
