import { render, screen, within } from '@testing-library/react';

import type { Forecast, Validation } from '../api/forecast.ts';
import { ForecastValidation } from './ForecastValidation.tsx';

const row = (model: Validation['model'], h: number, pinball: number): Validation => ({
  model,
  h,
  n: 500,
  pinball,
  coverage: [0.5, 0.8, 0.95],
  r2: -0.001,
  hitRate: 0.5,
});

function forecast(k: number, naive = 0.01): Forecast {
  const horizons = Array.from({ length: k }, (_, i) => ({
    h: i + 1,
    open: [],
    high: [],
    low: [],
    close: [],
    pUp: 0.5,
    expectedRange: 0.02,
  }));
  return {
    symbol: 'AAPL',
    model: 'c',
    auto: true,
    params: { window: 500, ridge: 100, lags: 3 },
    lastTime: '2026-11-20',
    lastClose: 100,
    levels: [0.025, 0.1, 0.25, 0.5, 0.75, 0.9, 0.975],
    horizons,
    validation: horizons.flatMap((h) => [
      row('naive', h.h, naive),
      row('a', h.h, naive * 1.02),
      row('c', h.h, naive * 0.97),
    ]),
    coefficients: [],
    tuning: [],
  };
}

describe('ForecastValidation', () => {
  it('shows each model against the naive one at the picked horizon', () => {
    render(<ForecastValidation forecast={forecast(3)} />);
    const table = screen.getByRole('table', { name: 'Validation out of sample' });
    expect(within(table).getByRole('row', { name: /A: OLS/ })).toHaveTextContent('+2.0%');
    expect(within(table).getByRole('row', { name: /C: Ridge/ })).toHaveTextContent('-3.0%');
  });

  it('falls back to the last horizon there is when k shrinks', () => {
    const { rerender } = render(<ForecastValidation forecast={forecast(5)} />);
    const select = screen.getByLabelText('Bars ahead');
    (select as HTMLSelectElement).value = '5';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    rerender(<ForecastValidation forecast={forecast(2)} />);
    const table = screen.getByRole('table', { name: 'Validation out of sample' });
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + three models
  });

  it('shows no ratio against a naive loss of zero (a flat series)', () => {
    render(<ForecastValidation forecast={forecast(1, 0)} />);
    const table = screen.getByRole('table', { name: 'Validation out of sample' });
    expect(within(table).getByRole('row', { name: /C: Ridge/ })).not.toHaveTextContent(
      /Infinity|NaN/,
    );
  });
});
