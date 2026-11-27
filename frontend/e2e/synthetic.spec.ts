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

const HOME = `${SYMBOL}H`;
const STATS = `${SYMBOL}P`;

test.afterEach(async ({ page }) => {
  for (const symbol of [SYMBOL, HOME, STATS]) {
    const found = await page.request.get(`/api/synthetic/${encodeURIComponent(symbol)}`);
    if (found.ok()) {
      const { revision } = (await found.json()) as { revision: number };
      await page.request.delete(
        `/api/synthetic/${encodeURIComponent(symbol)}?revision=${String(revision)}`,
      );
    }
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
  // In the watchlist the badge stands for the prefix, and the row keeps every column in view.
  const row = page.getByRole('row', { name: new RegExp(`^${NAME} Synthetic`) });
  await expect(row).toBeVisible();
  const overflow = () =>
    row
      .locator('td')
      .last()
      .evaluate((cell) => {
        const panel = cell.closest('table')?.parentElement;
        const right = panel?.getBoundingClientRect().right ?? 0;
        return Math.max(0, Math.round(cell.getBoundingClientRect().right - right));
      });
  // 1 px: the table was already that much wider than the panel before K0 (rounding).
  await expect.poll(overflow).toBeLessThanOrEqual(1);
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
  await row.click();
  await expect(legend(page)).toContainText('E2E uptrend · 1h · Synthetic');

  // A saved layout on it, to open after the delete.
  const layout = {
    revision: 0,
    symbol: SYMBOL,
    interval: '1D',
    chart_type: 'candles',
    scale_mode: 'normal',
    indicators: [],
  };
  expect((await page.request.put('/api/layouts/On%20synthetic', { data: layout })).ok()).toBe(true);

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

  // The watchlist lost it on the server (a new revision): editing it still saves.
  await page.getByRole('row', { name: /^MSFT/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove MSFT from the watchlist' }).click();
  await expect(page.getByRole('row', { name: /^MSFT/ })).toBeHidden();
  await expect
    .poll(async () => {
      const body = (await (await page.request.get('/api/watchlists')).json()) as {
        watchlists: { sections: { symbols: string[] }[] }[];
      };
      return body.watchlists[0]?.sections.flatMap((x) => x.symbols).includes('MSFT');
    })
    .toBe(false);

  // A saved layout on the deleted symbol opens on the default symbol.
  await page.getByRole('button', { name: 'Symbol search: AAPL' }).click();
  await page.keyboard.type('NVDA');
  await page.keyboard.press('Enter');
  await expect(legend(page)).toContainText('NVIDIA');
  await page.getByRole('button', { name: /^Layout: / }).click();
  await page.getByRole('menuitem', { name: 'Open layout…' }).click();
  await page.getByRole('button', { name: /^On synthetic / }).click();
  await expect(legend(page)).toContainText('Apple Inc. · 1D');
});

test('a dwelling-price symbol: created, charted without volume, causal, explained', async ({
  page,
}) => {
  await page.keyboard.press('s');
  await page
    .getByRole('dialog', { name: 'Symbol search' })
    .getByRole('button', { name: 'New synthetic symbol…' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'New synthetic symbol' });
  await dialog.getByLabel('Kind').selectOption('dwelling');
  await dialog.getByLabel('Name', { exact: true }).fill(HOME.slice(4).toLowerCase());
  await dialog.getByLabel('Full name').fill('Dwelling prices, Israel');
  // The learn page opens inside the dialog and the form comes back as it was.
  await dialog.getByRole('button', { name: 'How it is built' }).click();
  await expect(dialog.getByRole('heading', { name: 'What it answers' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Back to the form' }).click();
  await expect(dialog.getByLabel('Full name')).toHaveValue('Dwelling prices, Israel');
  await dialog.getByRole('button', { name: 'Create symbol' }).click();
  await expect(dialog).toBeHidden();

  await expect(legend(page)).toContainText('Dwelling prices, Israel · 1D · Synthetic');
  await expect(legend(page).locator('[data-field="C"]')).toBeVisible();
  await expect(legend(page).locator('[data-field="Vol"]')).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Interval' })
    .getByRole('button', { name: '1 hour' })
    .click();
  await expect(legend(page)).toContainText('Dwelling prices, Israel · 1h · Synthetic');

  // Made causal from the legend: the last bar is now the weekday before today.
  await legend(page)
    .getByRole('button', { name: `Edit ${HOME}` })
    .click();
  const edit = page.getByRole('dialog', { name: `Edit ${HOME}` });
  await expect(edit.getByLabel('Kind')).toBeDisabled();
  await edit.getByLabel('Between months').selectOption('causal');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(edit).toBeHidden();
  const bars = (await (
    await page.request.get(`/api/bars?symbol=${encodeURIComponent(HOME)}&interval=1D&limit=1`)
  ).json()) as { bars: { time: string }[] };
  const yesterday = new Date(Date.now() - 86_400_000);
  while (yesterday.getUTCDay() === 0 || yesterday.getUTCDay() === 6) {
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  }
  expect(bars.bars[0]?.time).toBe(yesterday.toISOString().slice(0, 10));
});

test('a parametric symbol: its statistics previewed, then charted with volume', async ({
  page,
}) => {
  await page.keyboard.press('s');
  await page
    .getByRole('dialog', { name: 'Symbol search' })
    .getByRole('button', { name: 'New synthetic symbol…' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'New synthetic symbol' });
  await dialog.getByLabel('Kind').selectOption('parametric');
  // The form scrolls, its buttons stay at the bottom: a problem shows where they are, in view.
  await dialog.getByRole('button', { name: 'Create symbol' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Name');
  await expect(dialog.getByRole('alert')).toBeInViewport();
  await dialog.getByLabel('Name', { exact: true }).fill(STATS.slice(4).toLowerCase());
  await dialog.getByLabel('Full name').fill('Fat tails and jumps');
  await dialog.getByLabel('Bars (days)').fill('600');
  await dialog.getByLabel('Distribution', { exact: true }).selectOption('student_t');
  await dialog.getByLabel('Degrees of freedom ν').fill('4');
  await dialog.getByText('Layers: memory, jumps, GARCH').click();
  await dialog.getByLabel('Jumps a year λ').fill('3');
  // The backend draws the preview: a histogram over the density, the drawn numbers by the asked.
  const preview = dialog.getByRole('region', { name: 'Preview' });
  await expect(
    preview.getByRole('img', {
      name: "Histogram of the daily returns over the distribution's density",
    }),
  ).toBeVisible();
  await expect(preview.getByRole('row', { name: /Excess kurtosis/ })).toContainText('∞');
  await expect(preview.getByRole('row', { name: /Mean a year/ })).toContainText('7.0 %');
  await dialog.getByRole('button', { name: 'Create symbol' }).click();
  await expect(dialog).toBeHidden();

  await expect(legend(page)).toContainText('Fat tails and jumps · 1D · Synthetic');
  await expect(legend(page).locator('[data-field="Vol"]')).toBeVisible();
  const bars = (await (
    await page.request.get(`/api/bars?symbol=${encodeURIComponent(STATS)}&interval=1D`)
  ).json()) as { bars: unknown[] };
  expect(bars.bars).toHaveLength(600);
  await page
    .getByRole('group', { name: 'Interval' })
    .getByRole('button', { name: '1 hour' })
    .click();
  await expect(legend(page)).toContainText('Fat tails and jumps · 1h · Synthetic');
});
