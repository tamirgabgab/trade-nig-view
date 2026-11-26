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
