import { expect, test } from '@playwright/test';

import { freshStart } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await freshStart(page);
  await expect(page.getByLabel('Price legend').locator('[data-field="C"]')).toBeVisible();
});

test('Strategy tab: a profile, an example and a Python file, their signals, save and reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Show strategy' }).click();
  const tab = page.getByRole('region', { name: 'Strategy' });
  await expect(tab.getByRole('button', { name: 'Position' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(tab).toContainText('10 a month by default (a parameter)');

  const select = tab.getByRole('combobox', { name: 'Strategy' });
  await select.selectOption({ label: 'Example: MA 20/50 cross with the weekly trend' });
  await expect(tab.getByRole('list', { name: 'Long rules' })).toContainText('SMA(30) 1W');
  await tab.getByRole('button', { name: 'Show signals on the chart' }).click();
  const signals = tab.getByRole('table', { name: 'Signals' });
  const longEntries = signals.getByRole('row', { name: /Long entries/ }).getByRole('cell');
  await expect(longEntries).not.toHaveText('0', { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/strategy-signals.png' });

  // The Python example in strategies/, with its parameters.
  await select.selectOption({ label: 'breakout_weekly_trend.py' });
  await expect(tab.getByRole('spinbutton', { name: 'Breakout bars' })).toHaveValue('55');
  await expect(signals.getByRole('row', { name: /Short entries/ })).toBeVisible();

  // Save it under a name; it is listed again after a reload.
  await tab.getByRole('textbox', { name: 'Name' }).fill('My breakout');
  await tab.getByRole('button', { name: 'Save strategy' }).click();
  await expect(tab).toContainText('Saved as “My breakout”.');
  await page.reload();
  await page.getByRole('button', { name: 'Show strategy' }).click();
  await expect(
    page.getByRole('region', { name: 'Strategy' }).getByRole('option', { name: 'My breakout' }),
  ).toBeAttached();

  // A Swing profile decides on hourly bars: the chart follows.
  await page
    .getByRole('region', { name: 'Strategy' })
    .getByRole('button', { name: 'Swing' })
    .click();
  await expect(page.getByLabel('Price legend')).toContainText('· 1h ·');
});
