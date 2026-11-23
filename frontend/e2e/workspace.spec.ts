import { expect, test, type Page } from '@playwright/test';

import { freshStart } from './fixtures.ts';

const legend = (page: Page) => page.getByLabel('Price legend');
const layoutButton = (page: Page) => page.getByRole('button', { name: /^Layout: / });

async function drawings(page: Page, symbol: string) {
  const response = await page.request.get(`/api/drawings/${symbol}`);
  return ((await response.json()) as { drawings: { id: string }[] }).drawings;
}

async function addIndicator(page: Page, query: string) {
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: 'Indicators' });
  await page.keyboard.type(query);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await freshStart(page);
  await expect(legend(page).locator('[data-field="C"]')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  // Leave NVDA without drawings for the other tests.
  const doc = (await (await page.request.get('/api/drawings/NVDA')).json()) as { revision: number };
  await page.request.put('/api/drawings/NVDA', { data: { revision: doc.revision, drawings: [] } });
});

test('a configured workspace survives a reload; undo and redo; layouts and watchlists', async ({
  page,
}) => {
  // Symbol, interval, two indicators, three horizontal lines.
  await page.getByRole('row', { name: /^NVDA/ }).click();
  await page.getByRole('button', { name: '1 week' }).click();
  await expect(legend(page)).toContainText('NVIDIA Corporation · 1W');
  await addIndicator(page, 'ema');
  await addIndicator(page, 'rsi');
  const box = await page.getByTestId('chart-canvas').boundingBox();
  if (box === null) throw new Error('no chart');
  for (const y of [150, 250, 350]) {
    await page.keyboard.press('Alt+h');
    await page.mouse.click(box.x + 300, box.y + y);
  }
  await expect.poll(async () => (await drawings(page, 'NVDA')).length).toBe(3);
  await expect(layoutButton(page)).toHaveAttribute('aria-label', 'Layout: Unnamed (Saved)');

  await page.reload();
  await expect(legend(page)).toContainText('NVIDIA Corporation · 1W');
  await expect(page.getByRole('list', { name: 'Indicators on the chart' })).toContainText('EMA 9');
  await expect(page.getByText('RSI 14', { exact: false }).first()).toBeVisible();

  // One history: undo the last line, then the interval switch; redo both.
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.keyboard.press('Alt+h');
  await page.mouse.click(box.x + 300, box.y + 450);
  await expect.poll(async () => (await drawings(page, 'NVDA')).length).toBe(4);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await drawings(page, 'NVDA')).length).toBe(3);
  await page.keyboard.press('Control+y');
  await expect.poll(async () => (await drawings(page, 'NVDA')).length).toBe(4);

  // Rename the layout, make a copy, change it, open the first again.
  await layoutButton(page).click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await page.getByLabel('Layout name').fill('Swing');
  await page.getByRole('button', { name: 'Rename layout' }).click();
  await expect(layoutButton(page)).toHaveAttribute('aria-label', /^Layout: Swing \(/);
  await layoutButton(page).click();
  await page.getByRole('menuitem', { name: 'Make a copy…' }).click();
  await page.getByRole('button', { name: 'Save copy' }).click();
  await expect(layoutButton(page)).toHaveAttribute('aria-label', /^Layout: Swing copy/);
  await page
    .getByRole('group', { name: 'Interval' })
    .getByRole('button', { name: '1 day' })
    .click();
  await expect(legend(page)).toContainText('· 1D ·');
  await expect(layoutButton(page)).toHaveAttribute('aria-label', 'Layout: Swing copy (Saved)');
  await layoutButton(page).click();
  await page.getByRole('menuitem', { name: 'Open layout…' }).click();
  await page.getByRole('button', { name: /^Swing NVDA · 1W/ }).click();
  await expect(legend(page)).toContainText('NVIDIA Corporation · 1W');

  // A new watchlist with one symbol, still there after a reload.
  await page.getByRole('button', { name: /^Watchlist: / }).click();
  await page.getByRole('menuitem', { name: 'Create a new list…' }).click();
  await page.getByLabel('List name').fill('Tech');
  await page.getByRole('button', { name: 'Create list' }).click();
  await page.getByRole('button', { name: 'Add symbol to the watchlist' }).click();
  await page.keyboard.type('NVDA');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row', { name: /^NVDA/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Watchlist: Tech' })).toBeVisible();
  await expect(page.locator('tr[data-symbol]')).toHaveCount(1);
});
