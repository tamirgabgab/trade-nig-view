import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useChartStore } from '../store/chartStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { MinuteIntervalMenu } from './MinuteIntervalMenu.tsx';

beforeEach(() => {
  useChartStore.setState(useChartStore.getInitialState());
  useReplayStore.setState(useReplayStore.getInitialState());
});

describe('MinuteIntervalMenu', () => {
  it('lists the minute intervals with the days the provider keeps', async () => {
    const user = userEvent.setup();
    render(<MinuteIntervalMenu />);
    const button = screen.getByRole('button', { name: 'Minute intervals' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);

    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      '1 minute~30 days',
      '2 minutes~30 days',
      '5 minutes~60 days',
      '15 minutes~60 days',
      '30 minutes~60 days',
      '90 minutes~60 days',
    ]);
  });

  it('switches the chart to the picked interval and shows it pressed', async () => {
    const user = userEvent.setup();
    render(<MinuteIntervalMenu />);
    await user.click(screen.getByRole('button', { name: 'Minute intervals' }));
    await user.click(screen.getByRole('menuitemradio', { name: /15 minutes/ }));

    expect(useChartStore.getState().interval).toBe('15m');
    const button = screen.getByRole('button', { name: 'Minute intervals: 15 minutes' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('15m ▾');
  });

  it('is locked during a bar replay', () => {
    useReplayStore.setState({ mode: 'on' });
    render(<MinuteIntervalMenu />);
    expect(screen.getByRole('button', { name: 'Minute intervals' })).toBeDisabled();
  });
});
