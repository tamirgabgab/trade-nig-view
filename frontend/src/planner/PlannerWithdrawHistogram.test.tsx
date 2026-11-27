import { render, screen } from '@testing-library/react';

import { wholePercent } from './plannerFormat.ts';
import { PlannerWithdrawHistogram } from './PlannerWithdrawHistogram.tsx';

const draw = (values: number[]) =>
  render(
    <PlannerWithdrawHistogram
      values={values}
      ranOut={0}
      start={1}
      noun="starts"
      unit="as a percent of the start"
      format={wholePercent}
    />,
  );
const anchor = (text: RegExp) => screen.getByText(text).getAttribute('text-anchor');
const row = (text: RegExp) => screen.getByText(text).getAttribute('y');

describe('PlannerWithdrawHistogram', () => {
  it('puts two close marks’ labels outward on one row when they fit', () => {
    draw([0.1, 0.5, 0.9, 0.92, 2, 3]);
    expect([anchor(/^Median/), anchor(/^The start/)]).toEqual(['end', 'start']);
    expect(row(/^Median/)).toBe(row(/^The start/));
  });

  it('stacks them on two rows when an outward label would leave the chart', () => {
    // The start sits near the right edge: a label to its right would be cut off.
    draw([0.2, 0.3, 0.95, 0.96, 0.97, 0.98, 1.05]);
    expect(anchor(/^The start/)).toBe('end');
    expect(row(/^Median/)).not.toBe(row(/^The start/));
  });
});
