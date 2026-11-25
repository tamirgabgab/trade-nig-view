import { fireEvent, render, screen, within } from '@testing-library/react';

import { parseRisk } from '../api/risk.ts';
import { RISK_BODY } from '../test/riskBody.ts';
import { RiskDetails } from './RiskDetails.tsx';

describe('RiskDetails', () => {
  it('shows the long 99 % next-bar VaR / ES, the position and a rejected backtest', () => {
    render(<RiskDetails risk={parseRisk(RISK_BODY)} position={10_000} />);
    const table = screen.getByRole('table', { name: 'VaR and ES by method' });
    const fhs = within(table).getByRole('row', { name: /Historical/ });
    expect(fhs).toHaveTextContent('5.00%');
    expect(fhs).toHaveTextContent('6.00%');
    expect(fhs).toHaveTextContent('600'); // the ES on 10,000
    const tests = screen.getByRole('table', { name: 'VaR backtests' });
    expect(within(tests).getByRole('row', { name: /Historical/ })).toHaveTextContent('30 / 10');
    expect(screen.getByText(/a fat, power-law tail/)).toBeVisible();
    // The week horizon has only the normal method.
    fireEvent.change(screen.getByLabelText('Horizon'), { target: { value: 'week' } });
    expect(within(table).getByRole('row', { name: /Normal/ })).toHaveTextContent('10.00%');
  });
});
