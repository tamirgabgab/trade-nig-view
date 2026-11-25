import { render, screen, within } from '@testing-library/react';

import { parseRegime } from '../api/regime.ts';
import { REGIME_BODY } from '../test/regimeBody.ts';
import { RegimeDetails } from './RegimeDetails.tsx';

describe('RegimeDetails', () => {
  it('shows the verdict, the map with today and the rule edge by regime', () => {
    render(<RegimeDetails regime={parseRegime(REGIME_BODY)} />);
    expect(screen.getByRole('heading', { name: /Trending over the last 252 bars/ })).toBeVisible();
    expect(screen.getByText(/trend tools fit/)).toBeVisible();
    const map = screen.getByRole('table', { name: 'Regime map' });
    expect(within(map).getByRole('row', { name: /Trending/ })).toHaveTextContent('20% (now)');
    const rules = screen.getByRole('table', { name: 'Rule edge by regime' });
    const rsi = within(rules).getByRole('row', { name: /RSI below 30/ });
    expect(rsi).toHaveTextContent('-1.20%');
    expect(rsi).toHaveTextContent('—'); // no signals in the other regimes
  });
});
