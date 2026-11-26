import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sanitizeHome, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { sanitizePersisted, usePlannerStore } from '../store/plannerStore.ts';
import { HOME_RESULT, TAX_PRESETS } from '../test/plannerHomeBody.ts';
import { renderWithQuery, stubApi } from '../test/render.tsx';
import { PlannerPage } from './PlannerPage.tsx';
import { applyScenario, captureScenario } from './scenarioState.ts';

beforeEach(() => {
  usePlannerStore.setState({ ...sanitizePersisted(null) });
  usePlannerHomeStore.setState({ ...sanitizeHome(null) });
});

describe('PlannerPage', () => {
  it('asks once, for both tabs, before option B is replaced', async () => {
    const user = userEvent.setup();
    stubApi({ '/api/planner/tax-presets': { body: TAX_PRESETS } });
    usePlannerStore.setState({ same: false });
    usePlannerHomeStore.setState({ other: { ...sanitizeHome(null).home, price: 3_000_000 } });
    renderWithQuery(<PlannerPage className={undefined} />);
    const box = (tab: string) =>
      within(screen.getByRole('tabpanel', { name: tab, hidden: true })).getByRole('checkbox', {
        name: 'Option B is the same as option A',
        hidden: true,
      });
    await user.click(box('Market'));
    await user.click(screen.getByRole('tab', { name: 'Apartment' }));
    // The question opened in the Market tab is the same one here, and one answer closes it.
    await user.click(screen.getByRole('button', { name: 'Replace option B with option A' }));
    expect(box('Apartment')).toBeChecked();
    await user.click(screen.getByRole('tab', { name: 'Market' }));
    expect(box('Market')).toBeChecked();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Replace option B with option A', hidden: true }),
    ).not.toBeInTheDocument();
  });

  it('drops a tab’s results when its forms become another option’s or a loaded scenario’s', async () => {
    const user = userEvent.setup();
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/home': { body: HOME_RESULT },
    });
    renderWithQuery(<PlannerPage className={undefined} />);
    await user.click(screen.getByRole('tab', { name: 'Apartment' }));
    const home = () => screen.getByRole('tabpanel', { name: 'Apartment' });
    const results = () => screen.queryByText('First payment', { selector: 'dt' });
    const run = async () => {
      const button = within(home()).getByRole('button', { name: 'Run' });
      await vi.waitFor(() => {
        expect(button).toBeEnabled();
      });
      await user.click(button);
      await vi.waitFor(() => {
        expect(results()).toBeVisible();
      });
    };
    await run();
    // Apart, the numbers stay while option A is still the one on screen.
    await user.click(
      within(home()).getByRole('checkbox', { name: 'Option B is the same as option A' }),
    );
    expect(results()).toBeVisible();
    await user.click(within(home()).getByRole('radio', { name: 'Option B' }));
    expect(results()).not.toBeInTheDocument();

    await run();
    act(() => {
      applyScenario(captureScenario(TAX_PRESETS));
    });
    expect(results()).not.toBeInTheDocument();
    expect(usePlannerStore.getState().slot).toBe('a');
  });
});
