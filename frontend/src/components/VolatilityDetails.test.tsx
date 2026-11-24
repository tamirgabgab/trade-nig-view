import { render, screen, within } from '@testing-library/react';

import { parseVolatility } from '../api/volatility.ts';
import { BODY } from '../test/volatilityBody.ts';
import { VolatilityDetails } from './VolatilityDetails.tsx';

describe('VolatilityDetails', () => {
  it('shows the horizons in % a year, the squeeze verdict and the scores', () => {
    render(<VolatilityDetails v={parseVolatility(BODY)} annual />);
    const table = screen.getByRole('table', { name: 'Volatility per horizon' });
    // 0.02 a bar x sqrt(252) = 31.7 % a year; the year has no HAR forecast.
    expect(within(table).getByRole('row', { name: /Month/ })).toHaveTextContent('31.7');
    expect(within(table).getByRole('row', { name: /Year/ })).toHaveTextContent('—');
    expect(screen.getByRole('img', { name: 'Volatility cone of AAPL, % / year' })).toBeVisible();
    // The interval 5-60 % holds the base rate of 10 %: no evidence.
    expect(screen.getByText(/no evidence either way/)).toBeVisible();
    expect(screen.getByRole('table', { name: 'Estimator scores' })).toHaveTextContent(
      'HAR forecast (best)',
    );
  });

  it('shows per-bar values and says when a squeeze is more likely to expand', () => {
    const body = { ...BODY, squeeze: { ...BODY.squeeze, ci: [0.15, 0.4], active: true } };
    render(<VolatilityDetails v={parseVolatility(body)} annual={false} />);
    const table = screen.getByRole('table', { name: 'Volatility per horizon' });
    expect(within(table).getByRole('row', { name: /Month/ })).toHaveTextContent('2.0');
    expect(screen.getByText(/more likely than after any bar/)).toBeVisible();
    expect(screen.getByRole('heading', { name: /now in a squeeze/ })).toBeVisible();
  });
});
