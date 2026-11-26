import { render, screen } from '@testing-library/react';

import { SCENARIO_RESULT } from '../test/plannerCompareBody.ts';
import { PlannerLeadChart } from './PlannerLeadChart.tsx';

const POINTS = SCENARIO_RESULT.average.points;

function chart(lead = SCENARIO_RESULT.lead, points = POINTS) {
  render(
    <PlannerLeadChart points={points} lead={lead} names={['Apartment', 'Market']} discount={0.1} />,
  );
  return screen.getByRole('img', { name: 'End value by exit month: Apartment and Market' });
}

describe('PlannerLeadChart', () => {
  it('draws both options and the forced sale of the one with an apartment', () => {
    const svg = chart();
    const series = [...svg.querySelectorAll('polyline')].map((line) => line.dataset['series']);
    expect(series).toEqual(['x_forced', 'x', 'y']);
    const titles = [...svg.querySelectorAll('title')].map((t) => t.textContent);
    expect(titles).toContain('Apartment after 80 months (2021-09-15): ₪1,700,000');
    expect(titles).toContain('Market after 120 months (2025-01-15): ₪2,500,000');
    expect(titles).toContain(
      'Apartment, forced sale at −10% after 40 months (2018-05-15): ₪800,000',
    );
    // Named at the lines' ends and in the legend, not by colour alone.
    expect(screen.getAllByText('Apartment').length).toBeGreaterThan(0);
    expect(screen.getByText('Apartment, forced sale at −10%')).toBeInTheDocument();
  });

  it('marks the month from which the leader stays ahead', () => {
    chart();
    expect(screen.getByText('Market leads from month 120')).toBeInTheDocument();
  });

  it('has no forced-sale line without an apartment, and no mark without a leader', () => {
    const bare = POINTS.map((p) => ({ ...p, x_forced: null }));
    const svg = chart({ leader: null, since_months: null, x_share: 0.5, step_months: 40 }, bare);
    expect(svg.querySelectorAll('polyline')).toHaveLength(2);
    expect(screen.queryByText(/leads from/)).not.toBeInTheDocument();
  });
});
