import { expect, test, type Page } from '@playwright/test';

import { adjusted, dailyRows, price } from './fixtures.ts';

/** Reference EMA (SMA seed, alpha = 2/(n+1)), independent of the backend implementation. */
function ema(values: readonly number[], n: number): number {
  let level = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (const value of values.slice(n)) level += (2 / (n + 1)) * (value - level);
  return level;
}

const indicators = (page: Page) => page.getByRole('list', { name: 'Indicators on the chart' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await expect(page.getByLabel('Price legend')).toContainText('Apple Inc. · 1D · NASDAQ');
});

test('add EMA 20, change it to 50, hide and remove it', async ({ page }) => {
  const closes = dailyRows('AAPL.csv').map((row) => adjusted(row).close);

  await page.getByTestId('chart-canvas').click();
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: 'Indicators' });
  await page.keyboard.type('ema');
  await expect(dialog.getByRole('option').first()).toContainText('Exponential Moving Average');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await page.mouse.move(0, 0);

  const row = indicators(page).getByRole('listitem').first();
  await expect(row).toContainText('EMA 9 close');
  await expect(row.locator('[data-output="ma"]')).toHaveText(price(ema(closes, 9)));

  await row.getByRole('button', { name: 'Settings: EMA 9 close' }).click();
  const panel = page.getByRole('dialog', { name: /EMA/ });
  const length = panel.getByRole('spinbutton', { name: 'Length' });
  await length.fill('20');
  await expect(row).toContainText('EMA 20 close');
  await expect(row.locator('[data-output="ma"]')).toHaveText(price(ema(closes, 20)));

  await length.fill('50');
  await expect(row).toContainText('EMA 50 close');
  await expect(row.locator('[data-output="ma"]')).toHaveText(price(ema(closes, 50)));
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toBeHidden();

  // Survives a reload.
  await page.reload();
  await page.mouse.move(0, 0);
  await expect(indicators(page)).toContainText('EMA 50 close');

  await page.getByRole('button', { name: 'Hide EMA 50 close' }).click();
  await expect(page.getByRole('button', { name: 'Show EMA 50 close' })).toBeVisible();
  await expect(indicators(page).locator('[data-output="ma"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove EMA 50 close' }).click();
  await expect(indicators(page)).toBeHidden();
});

function sma(values: readonly number[], n: number): number {
  return values.slice(-n).reduce((a, b) => a + b, 0) / n;
}

async function addIndicator(page: Page, query: string, name: string) {
  await page.getByTestId('chart-canvas').click();
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: 'Indicators' });
  await page.keyboard.type(query);
  await expect(dialog.getByRole('option').first()).toContainText(name);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await page.mouse.move(0, 0);
}

test('composites: Envelope with an EMA basis and MA Cross', async ({ page }) => {
  const closes = dailyRows('AAPL.csv').map((row) => adjusted(row).close);

  await addIndicator(page, 'envelope', 'Envelope');
  const envelope = indicators(page).getByRole('listitem').first();
  await expect(envelope).toContainText('Env 20 10 close SMA');
  const basis = sma(closes, 20);
  await expect(envelope.locator('[data-output="basis"]')).toHaveText(price(basis));
  await expect(envelope.locator('[data-output="upper"]')).toHaveText(price(basis * 1.1));
  await expect(envelope.locator('[data-output="lower"]')).toHaveText(price(basis * 0.9));

  await envelope.getByRole('button', { name: /^Settings: Env/ }).click();
  const panel = page.getByRole('dialog', { name: /^Env/ });
  await panel.getByRole('combobox', { name: 'Basis MA type' }).selectOption({ label: 'EMA' });
  await expect(envelope).toContainText('Env 20 10 close EMA');
  await expect(envelope.locator('[data-output="basis"]')).toHaveText(price(ema(closes, 20)));
  await panel.getByRole('button', { name: 'Close', exact: true }).click();

  await addIndicator(page, 'cross', 'Moving Average Cross');
  const cross = indicators(page).getByRole('listitem').nth(1);
  await expect(cross).toContainText('MA Cross SMA 9 SMA 21 close');
  await expect(cross.locator('[data-output]')).toHaveCount(2);
  await expect(cross.locator('[data-output="fast"]')).toHaveText(price(sma(closes, 9)));
  await expect(cross.locator('[data-output="slow"]')).toHaveText(price(sma(closes, 21)));
});
