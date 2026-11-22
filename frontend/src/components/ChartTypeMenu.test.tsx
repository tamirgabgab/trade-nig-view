import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useChartStore } from '../store/chartStore.ts';
import { ChartTypeMenu } from './ChartTypeMenu.tsx';

beforeEach(() => {
  useChartStore.setState(useChartStore.getInitialState());
});

describe('ChartTypeMenu', () => {
  it('names the current type and lists every type as a radio item', async () => {
    const user = userEvent.setup();
    render(<ChartTypeMenu />);
    const button = screen.getByRole('button', { name: 'Chart type: Candles' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual([
      'Candles',
      'Hollow candles',
      'Bars',
      'Line',
      'Area',
      'Heikin Ashi',
    ]);
    expect(screen.getByRole('menuitemradio', { name: 'Candles' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Candles' })).toHaveFocus();
  });

  it('picks a type with the mouse and closes', async () => {
    const user = userEvent.setup();
    render(<ChartTypeMenu />);
    await user.click(screen.getByRole('button', { name: /Chart type/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Heikin Ashi' }));

    expect(useChartStore.getState().chartType).toBe('heikin_ashi');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chart type: Heikin Ashi' })).toHaveFocus();
  });

  it('works from the keyboard: arrows open and move (wrapping), Enter picks, Esc closes', async () => {
    const user = userEvent.setup();
    render(<ChartTypeMenu />);
    screen.getByRole('button', { name: /Chart type/ }).focus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Candles' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: 'Heikin Ashi' })).toHaveFocus();
    await user.keyboard('{Home}{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Bars' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(useChartStore.getState().chartType).toBe('bars');

    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitemradio', { name: 'Heikin Ashi' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(useChartStore.getState().chartType).toBe('bars');
    expect(screen.getByRole('button', { name: 'Chart type: Bars' })).toHaveFocus();
  });

  it('closes on a click outside', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ChartTypeMenu />
        <p>outside</p>
      </>,
    );
    await user.click(screen.getByRole('button', { name: /Chart type/ }));
    await user.click(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
