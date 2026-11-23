import { expect, test, type Page } from '@playwright/test';

import { adjusted, dailyRows, freshStart, price } from './fixtures.ts';

/** Reference EMA (SMA seed, alpha = 2/(n+1)), independent of the backend implementation. */
function ema(values: readonly number[], n: number): number {
  let level = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (const value of values.slice(n)) level += (2 / (n + 1)) * (value - level);
  return level;
}

const indicators = (page: Page) => page.getByRole('list', { name: 'Indicators on the chart' });

test.beforeEach(async ({ page }) => {
  await freshStart(page);
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
  await expect(row).toContainText('EMA 9');
  await expect(row.locator('[data-output="ma"]')).toHaveText(price(ema(closes, 9)));

  await row.getByRole('button', { name: 'Edit settings: EMA 9' }).click();
  const panel = page.getByRole('dialog', { name: /EMA/ });
  const length = panel.getByRole('spinbutton', { name: 'Length' });
  await length.fill('20');
  await expect(row).toContainText('EMA 20');
  await expect(row.locator('[data-output="ma"]')).toHaveText(price(ema(closes, 20)));

  await length.fill('50');
  await expect(row).toContainText('EMA 50');
  await expect(row.locator('[data-output="ma"]')).toHaveText(price(ema(closes, 50)));
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toBeHidden();

  // Survives a reload.
  await page.reload();
  await page.mouse.move(0, 0);
  await expect(indicators(page)).toContainText('EMA 50');

  await page.getByRole('button', { name: 'Hide EMA 50' }).click();
  await expect(page.getByRole('button', { name: 'Show EMA 50' })).toBeVisible();
  await expect(indicators(page).locator('[data-output="ma"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove EMA 50' }).click();
  await expect(indicators(page)).toBeHidden();

  // Undo brings it back with its settings.
  await page
    .getByRole('status')
    .filter({ hasText: 'Removed EMA 50' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(indicators(page)).toContainText('EMA 50');
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
  await expect(envelope).toContainText('Env 20 10');
  const basis = sma(closes, 20);
  await expect(envelope.locator('[data-output="basis"]')).toHaveText(price(basis));
  await expect(envelope.locator('[data-output="upper"]')).toHaveText(price(basis * 1.1));
  await expect(envelope.locator('[data-output="lower"]')).toHaveText(price(basis * 0.9));

  await envelope.getByRole('button', { name: /^Edit settings: Env/ }).click();
  const panel = page.getByRole('dialog', { name: /^Env/ });
  await panel.getByRole('combobox', { name: 'Basis MA type' }).selectOption({ label: 'EMA' });
  await expect(envelope).toContainText('Env 20 10 EMA');
  await expect(envelope.locator('[data-output="basis"]')).toHaveText(price(ema(closes, 20)));
  await panel.getByRole('button', { name: 'Close', exact: true }).click();

  await addIndicator(page, 'cross', 'Moving Average Cross');
  const cross = indicators(page).getByRole('listitem').nth(1);
  await expect(cross).toContainText('MA Cross 9 21');
  await expect(cross.locator('[data-output]')).toHaveCount(2);
  await expect(cross.locator('[data-output="fast"]')).toHaveText(price(sma(closes, 9)));
  await expect(cross.locator('[data-output="slow"]')).toHaveText(price(sma(closes, 21)));
});

test('learn drawer: KaTeX page and the measured filter view of SMA 9', async ({ page }) => {
  await addIndicator(page, 'sma', 'Simple Moving Average');
  await indicators(page).getByRole('button', { name: 'Learn: Simple Moving Average' }).click();

  const drawer = page.getByRole('complementary', { name: 'Simple Moving Average' });
  await expect(drawer.locator('.katex').first()).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Formula' })).toBeVisible();

  await drawer.getByRole('tab', { name: 'Filter view' }).click();
  const table = drawer.getByRole('table');
  // A 9-tap boxcar: lag (n - 1) / 2 = 4, NRF 1 / n, unit DC gain.
  await expect(table.getByRole('row', { name: /^Lag \(bars\)/ })).toContainText('4.00');
  await expect(table.getByRole('row', { name: /Noise/ })).toContainText('0.111');
  await expect(table.getByRole('row', { name: /DC gain/ })).toContainText('1.000');
  await expect(drawer.getByRole('figure', { name: /Magnitude/ })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

/** Reference RSI: Wilder averages (alpha = 1/n) seeded with the mean of the first n changes. */
function rsi(values: readonly number[], n: number): number {
  const changes = values.slice(1).map((value, i) => value - (values[i] ?? value));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / n;
  let gain = mean(changes.slice(0, n).map((c) => Math.max(c, 0)));
  let loss = mean(changes.slice(0, n).map((c) => Math.max(-c, 0)));
  for (const c of changes.slice(n)) {
    gain += (Math.max(c, 0) - gain) / n;
    loss += (Math.max(-c, 0) - loss) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

/** Population standard deviation of the last n values. */
function stdev(values: readonly number[], n: number): number {
  const window = values.slice(-n);
  const mean = sma(window, n);
  return Math.sqrt(window.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
}

test('oscillator pane: RSI next to Bollinger Bands, change BB length, remove RSI', async ({
  page,
}) => {
  const closes = dailyRows('AAPL.csv').map((row) => adjusted(row).close);

  await addIndicator(page, 'rsi', 'Relative Strength Index');
  const pane = page.getByRole('list', { name: 'RSI 14 pane' });
  await expect(pane).toBeVisible();
  await expect(pane.locator('[data-output="rsi"]')).toHaveText(price(rsi(closes, 14)));
  // The price legend does not list an indicator that has its own pane.
  await expect(indicators(page)).toBeHidden();

  // Smoothing inputs stay greyed out until a smoothing is picked.
  await pane.getByRole('button', { name: 'Edit settings: RSI 14' }).click();
  const rsiPanel = page.getByRole('dialog', { name: /^RSI/ });
  await expect(rsiPanel.getByRole('spinbutton', { name: 'Smoothing length' })).toBeDisabled();
  await rsiPanel.getByRole('combobox', { name: 'Smoothing' }).selectOption({ label: 'SMA' });
  await expect(rsiPanel.getByRole('spinbutton', { name: 'Smoothing length' })).toBeEnabled();
  // The pane's legend is named after the instance label.
  await expect(page.getByRole('list', { name: 'RSI 14 SMA 14 pane' })).toBeVisible();
  await rsiPanel.getByRole('combobox', { name: 'Smoothing' }).selectOption({ label: 'None' });
  await rsiPanel.getByRole('button', { name: 'Close', exact: true }).click();

  await addIndicator(page, 'bollinger', 'Bollinger Bands');
  const bands = indicators(page).getByRole('listitem').first();
  await expect(bands).toContainText('BB 20 2');
  const check = async (n: number) => {
    const basis = sma(closes, n);
    const width = 2 * stdev(closes, n);
    await expect(bands.locator('[data-output="basis"]')).toHaveText(price(basis));
    await expect(bands.locator('[data-output="upper"]')).toHaveText(price(basis + width));
    await expect(bands.locator('[data-output="lower"]')).toHaveText(price(basis - width));
  };
  await check(20);

  await bands.getByRole('button', { name: /^Edit settings: BB/ }).click();
  const bbPanel = page.getByRole('dialog', { name: /^BB/ });
  await bbPanel.getByRole('spinbutton', { name: 'Length' }).fill('30');
  await expect(bands).toContainText('BB 30 2');
  await check(30);
  await bbPanel.getByRole('button', { name: 'Close', exact: true }).click();

  await pane.getByRole('button', { name: 'Remove RSI 14' }).click();
  await expect(pane).toBeHidden();
  await expect(bands).toContainText('BB 30 2');
});
