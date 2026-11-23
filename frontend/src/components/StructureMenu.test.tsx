import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useStructureStore } from '../store/structureStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { renderWithQuery, stubApi } from '../test/render.tsx';
import { StructureMenu } from './StructureMenu.tsx';

const line = (name: string, color: string) => ({
  name,
  label: name,
  plot: 'line',
  color,
  line_width: 1,
  style: { line_type: 'step' },
});

const PREV_HLC = {
  id: 'prev_hlc',
  version: 1,
  name: 'Previous Period High/Low/Close',
  short_name: 'Prev HLC',
  category: 'structure',
  overlay: true,
  inputs: ['high', 'low', 'close'],
  params: [
    {
      name: 'period',
      type: 'enum',
      default: 'day',
      label: 'Period',
      min: null,
      max: null,
      step: null,
      options: ['day', 'week', 'month'],
      option_labels: ['Day', 'Week', 'Month'],
    },
  ],
  outputs: [line('high', '#089981'), line('low', '#F23645'), line('close', '#787B86')],
  levels: [],
  level_fill: null,
  learn_slug: 'previous-hlc',
  description: '',
};

beforeEach(() => {
  useIndicatorStore.setState(useIndicatorStore.getInitialState());
  useStructureStore.setState({ gaps: false });
  useUiStore.setState(useUiStore.getInitialState());
  stubApi({ '/api/indicators': { body: [PREV_HLC] } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StructureMenu', () => {
  it('turns the gaps and a previous-period level on and off', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StructureMenu />);
    const open = () => user.click(screen.getByRole('button', { name: 'Market structure' }));

    await open();
    // Pivots are left out: the registry here has no such indicator.
    expect(screen.queryByRole('menuitemcheckbox', { name: /Pivot/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Gaps' }));
    expect(useStructureStore.getState().gaps).toBe(true);

    await open();
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Previous week high, low, close' }),
    );
    expect(useIndicatorStore.getState().instances).toMatchObject([
      { id: 'prev_hlc', params: { period: 'week' } },
    ]);

    await open();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Previous week high, low, close' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Previous day high, low, close' }),
    ).toHaveAttribute('aria-checked', 'false');
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'Previous week high, low, close' }),
    );
    expect(useIndicatorStore.getState().instances).toEqual([]);
  });
});
