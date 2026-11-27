import { expect, test, type Page } from '@playwright/test';

import { freshStart } from './fixtures.ts';

/** Synthetic symbols (K0): create from the symbol search, chart it at 1h, keep it in a watchlist
 *  across a reload, edit it from the legend, delete it from the watchlist. */

const legend = (page: Page) => page.getByLabel('Price legend');
// Unique per run: the e2e backend's app.db lives as long as the whole Playwright run.
const NAME = `E${Date.now().toString(36).slice(-6).toUpperCase()}`;
const SYMBOL = `SYN:${NAME}`;

test.beforeEach(async ({ page }) => {
  await freshStart(page);
  await expect(legend(page).locator('[data-field="C"]')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  const found = await page.request.get(`/api/synthetic/${encodeURIComponent(SYMBOL)}`);
  if (found.ok()) {
    const { revision } = (await found.json()) as { revision: number };
    await page.request.delete(
      `/api/synthetic/${encodeURIComponent(SYMBOL)}?revision=${String(revision)}`,
    );
  }
});

test('create, chart, keep, edit and delete a synthetic symbol', async ({ page }) => {
  // On a minute interval first: the synthetic symbol must move it to 1h.
  await page.getByRole('button', { name: 'Minute intervals' }).click();
  await page.getByRole('menuitemradio', { name: /15 minutes/ }).click();

  await page.keyboard.press('s');
  const search = page.getByRole('dialog', { name: 'Symbol search' });
  await search.getByRole('button', { name: 'New synthetic symbol…' }).click();
  const dialog = page.getByRole('dialog', { name: 'New synthetic symbol' });
  await dialog.getByLabel('Name', { exact: true }).fill(NAME.toLowerCase());
  await dialog.getByLabel('Full name').fill('E2E uptrend');
  await dialog.getByLabel('Scenario').selectOption('uptrend');
  await dialog.getByLabel('Bars (days)').fill('300');
  await expect(dialog).toContainText(/Ends on \d{4}-\d{2}-\d{2}\./);
  await dialog.getByRole('button', { name: 'Create symbol' }).click();
  await expect(dialog).toBeHidden();

  // The chart opens on it, at 1h (no minute bars), marked synthetic.
  await expect(legend(page)).toContainText('E2E uptrend · 1h · Synthetic');
  await expect(legend(page).getByRole('img', { name: 'Synthetic' })).toBeVisible();
  await expect(legend(page).locator('[data-field="C"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Minute intervals' })).toBeDisabled();
  await page
    .getByRole('group', { name: 'Interval' })
    .getByRole('button', { name: '1 day' })
    .click();
  await expect(legend(page)).toContainText('E2E uptrend · 1D · Synthetic');

  // Into the watchlist by hand; still there, and still charted, after a reload.
  await page.getByRole('button', { name: 'Add symbol to the watchlist' }).click();
  const add = page.getByRole('dialog', { name: /^Add to / });
  await page.keyboard.type(NAME);
  await add.getByRole('option', { name: new RegExp(SYMBOL) }).click();
  const row = page.getByRole('row', { name: new RegExp(`^${SYMBOL}`) });
  await expect(row).toBeVisible();
  await page.reload();
  await expect(legend(page)).toContainText('E2E uptrend · 1D · Synthetic');
  await expect(row).toBeVisible();

  // Edit in place from the legend: what points at it is listed.
  await legend(page)
    .getByRole('button', { name: `Edit ${SYMBOL}` })
    .click();
  const edit = page.getByRole('dialog', { name: `Edit ${SYMBOL}` });
  await expect(edit.getByRole('note')).toContainText('watchlist Default');
  const before = await legend(page).locator('[data-field="C"]').textContent();
  await edit.getByLabel('Seed').fill('424242');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(legend(page).locator('[data-field="C"]')).not.toHaveText(before ?? '');

  // Compared on a minute chart: listed, with why there is no line.
  await page.getByRole('row', { name: /^AAPL/ }).click();
  await page.getByRole('button', { name: 'Minute intervals' }).click();
  await page.getByRole('menuitemradio', { name: /15 minutes/ }).click();
  await page.getByRole('button', { name: 'Compare with another symbol' }).click();
  await page.keyboard.type(NAME);
  await page
    .getByRole('dialog', { name: 'Compare with' })
    .getByRole('option', { name: new RegExp(SYMBOL) })
    .click();
  const compared = page.getByRole('list', { name: 'Compared symbols' });
  await expect(compared).toContainText('no minute bars');
  await page.getByRole('row', { name: new RegExp(`^${SYMBOL}`) }).click();
  await expect(legend(page)).toContainText('E2E uptrend · 1h · Synthetic');

  // Delete from the watchlist row: the row goes, the chart moves to the default symbol.
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: `Delete ${SYMBOL}…` }).click();
  const confirm = page.getByRole('dialog', { name: `Edit ${SYMBOL}` });
  await confirm.getByRole('button', { name: `Delete ${SYMBOL}` }).click();
  await expect(confirm).toBeHidden();
  await expect(row).toBeHidden();
  await expect(legend(page)).toContainText('Apple');
  await expect(compared).toBeHidden();
  expect((await page.request.get(`/api/synthetic/${encodeURIComponent(SYMBOL)}`)).status()).toBe(
    404,
  );
});
