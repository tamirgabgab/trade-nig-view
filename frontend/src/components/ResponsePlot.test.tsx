import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ResponsePlot } from './ResponsePlot.tsx';

const SHORT = { key: 'a', label: 'SMA 3', color: 'red', x: [0, 1, 2], y: [1 / 3, 2 / 3, 1] };
const LONG = {
  key: 'b',
  label: 'EMA 9',
  color: 'blue',
  x: [0, 1, 2, 3, 4],
  y: [0.2, 0.36, 0.49, 0.59, 0.67],
};

describe('ResponsePlot', () => {
  it('reads every series with the arrow keys, past the end of the shorter one', async () => {
    const user = userEvent.setup();
    render(
      <ResponsePlot
        title="Step"
        xLabel="bar"
        series={[SHORT, LONG]}
        formatY={(v) => v.toFixed(2)}
      />,
    );
    await user.tab();
    await user.keyboard('{ArrowRight}');
    const readout = screen.getByRole('status');
    expect(readout).toHaveTextContent('bar 0');
    expect(readout).toHaveTextContent('0.33SMA 3');

    await user.keyboard('{ArrowLeft}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(readout).toHaveTextContent('bar 4');
    expect(readout).toHaveTextContent('—SMA 3');
    expect(readout).toHaveTextContent('0.67EMA 9');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
