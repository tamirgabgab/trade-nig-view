import { expect, test, type Page } from '@playwright/test';

import { adjusted, dailyRows, freshStart, intradayCloses, present, price } from './fixtures.ts';

const legend = (page: Page) => page.getByLabel('Price legend');
const field = (page: Page, name: string) => legend(page).locator(`[data-field="${name}"]`);

test.beforeEach(async ({ page }) => {
  await freshStart(page);
});

test('symbol search, interval and log scale end to end', async ({ page }) => {
  const aapl = dailyRows('AAPL.csv');
  const last = adjusted(present(aapl.at(-1), 'AAPL bars'));
  await expect(legend(page)).toContainText('Apple Inc. · 1D · NASDAQ');
  await expect(field(page, 'C')).toHaveText(price(last.close));
  await expect(field(page, 'O')).toHaveText(price(last.open));

  // Typing on the chart opens symbol search with the typed letters.
  await page.getByTestId('chart-canvas').click();
  await page.keyboard.type('nv');
  const search = page.getByRole('dialog', { name: 'Symbol search' });
  await expect(search.getByRole('combobox', { name: 'Symbol' })).toHaveValue('NV');
  await expect(search.getByRole('option').first()).toContainText('NVDA');
  await page.keyboard.press('Enter');
  await expect(search).toBeHidden();
  await expect(legend(page)).toContainText('NVIDIA Corporation · 1D · NASDAQ');

  // Weekly bar of the fixture's last week (Mon 2026-11-16 … Fri 2026-11-20).
  await page.getByRole('button', { name: '1 week' }).click();
  await expect(legend(page)).toContainText('NVIDIA Corporation · 1W · NASDAQ');
  const week = dailyRows('NVDA.csv')
    .filter((row) => row.date >= '2026-11-16')
    .map(adjusted);
  await expect(field(page, 'O')).toHaveText(price(present(week[0], 'week').open));
  await expect(field(page, 'H')).toHaveText(price(Math.max(...week.map((r) => r.high))));
  await expect(field(page, 'L')).toHaveText(price(Math.min(...week.map((r) => r.low))));
  await expect(field(page, 'C')).toHaveText(price(present(week.at(-1), 'week').close));

  const log = page.getByRole('button', { name: 'Logarithmic scale' });
  await log.click();
  await expect(log).toHaveAttribute('aria-pressed', 'true');

  // Settings survive a reload (localStorage).
  await page.reload();
  await expect(legend(page)).toContainText('NVIDIA Corporation · 1W · NASDAQ');
  await expect(page.getByRole('button', { name: 'Logarithmic scale' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('range buttons switch interval and chart types redraw', async ({ page }) => {
  await expect(legend(page)).toContainText('Apple Inc. · 1D · NASDAQ');

  await page.getByRole('button', { name: '5 days' }).click();
  await expect(legend(page)).toContainText('Apple Inc. · 5m · NASDAQ');
  await expect(page.getByRole('button', { name: '5 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '1 year' }).click();
  await expect(legend(page)).toContainText('Apple Inc. · 1D · NASDAQ');

  const heikin = page.waitForRequest((r) => r.url().includes('transform=heikin_ashi'));
  await page.getByRole('button', { name: /Chart type/ }).click();
  await page.getByRole('menuitemradio', { name: 'Heikin Ashi' }).click();
  await heikin;
  await page.mouse.move(0, 0); // off the chart, so the legend shows the last bar, not a hovered one
  await expect(page.getByRole('button', { name: 'Chart type: Heikin Ashi' })).toBeVisible();
  // HA close = (O + H + L + C) / 4 of the real bar.
  const aapl = dailyRows('AAPL.csv');
  const last = adjusted(present(aapl.at(-1), 'AAPL bars'));
  await expect(field(page, 'C')).toHaveText(
    price((last.open + last.high + last.low + last.close) / 4),
  );

  await page.getByRole('button', { name: /Chart type/ }).click();
  await page.getByRole('menuitemradio', { name: 'Line' }).click();
  await page.mouse.move(0, 0);
  await expect(field(page, 'C')).toHaveText(price(last.close));
});

test('the minutes menu picks 15m bars built from 5m and notes how far back they go', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Minute intervals' }).click();
  await expect(page.getByRole('menuitemradio', { name: /1 minute/ })).toContainText('~30 days');
  await page.getByRole('menuitemradio', { name: /15 minutes/ }).click();
  await expect(legend(page)).toContainText('Apple Inc. · 15m · NASDAQ');
  await expect(page.getByRole('button', { name: 'Minute intervals: 15 minutes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The last 15m bar (15:45-16:00) closes with the session's last 5m bar.
  await page.mouse.move(0, 0);
  await expect(field(page, 'C')).toHaveText(
    price(present(intradayCloses('5m', 'AAPL.csv').at(-1), '5m')),
  );
  await expect(legend(page)).toContainText(
    /15m data since 2026-10-26 \(\d+ days\)/, // offline: no provider window
  );
  // Daily bars carry no note.
  await page
    .getByRole('group', { name: 'Interval' })
    .getByRole('button', { name: '1 day' })
    .click();
  await expect(legend(page)).not.toContainText('data since');
});

test('scrolling back to the oldest loaded bar loads older history', async ({ page }) => {
  // AAPL has 6,500 daily bars; the first response holds the newest 5,000.
  await expect(legend(page)).toContainText('Apple Inc. · 1D · NASDAQ');
  const canvas = page.getByTestId('chart-canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('chart canvas not visible');
  const older = page.waitForRequest((r) => r.url().includes('before='), { timeout: 20_000 });

  // Zoom all the way out, then drag the chart to the right (towards older bars).
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 600);
  const state = { found: false };
  older
    .then(() => {
      state.found = true;
    })
    .catch(() => undefined); // the `await older` below reports a timeout
  for (let i = 0; i < 40; i++) {
    if (state.found) break;
    await page.mouse.move(box.x + 100, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 100, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
  }
  await older;
  await expect(page.getByRole('status').filter({ hasText: 'Loading older bars' })).toBeHidden();
});

test('no horizontal page overflow at 1280 and 960 px', async ({ page }) => {
  for (const width of [1280, 960]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(legend(page)).toContainText('Apple Inc.');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow at ${String(width)} px`).toBeLessThanOrEqual(0);
  }
});

test('half a screen: the watchlist floats over the chart and picks a symbol', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 800 });
  await expect(legend(page)).toContainText('Apple Inc.');
  const watchlist = page.getByRole('region', { name: 'Watchlist' });
  await expect(watchlist).toBeHidden();

  await page.getByRole('button', { name: 'Show watchlist' }).click();
  await watchlist.locator('tr[data-symbol="NVDA"]').click();
  await expect(legend(page)).toContainText('NVIDIA');
  await page.keyboard.press('Escape');
  await expect(watchlist).toBeHidden();
});

test('? lists the keyboard shortcuts', async ({ page }) => {
  await expect(legend(page)).toContainText('Apple Inc.');
  await page.getByTestId('chart-canvas').click();
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toContainText('Add an indicator');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the camera menu saves the chart as a PNG with a title band', async ({ page }) => {
  await expect(legend(page)).toContainText('Apple Inc.');
  await page.getByRole('button', { name: 'Take a snapshot' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download PNG' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^AAPL_1D_\d{4}-\d{2}-\d{2}\.png$/);
  await expect(page.getByRole('status').filter({ hasText: 'Chart saved as' })).toBeVisible();
});

test('Ctrl+K finds a symbol and an action', async ({ page }) => {
  await expect(legend(page)).toContainText('Apple Inc.');
  await page.getByTestId('chart-canvas').click();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('nvda');
  await page.keyboard.press('Enter');
  await expect(legend(page)).toContainText('NVIDIA');

  await page.keyboard.press('Control+k');
  await page.keyboard.type('light');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('right-click opens the chart menu', async ({ page }) => {
  // Bars loaded (the close is shown): only then is there a price under the pointer.
  await expect(legend(page).locator('[data-field="C"]')).toBeVisible();
  await page.getByTestId('chart-canvas').click({ button: 'right', position: { x: 300, y: 200 } });
  const menu = page.getByRole('menu', { name: 'Chart' });
  await expect(menu.getByRole('menuitem', { name: /^Copy price \d/ })).toBeVisible();
  await menu.getByRole('menuitemcheckbox', { name: 'Logarithmic scale' }).click();
  await expect(page.getByRole('button', { name: 'Logarithmic scale' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the side panel and the learn panel widen by a drag on their left edge, and stay so', async ({
  page,
}) => {
  const panel = page.getByRole('region', { name: 'Watchlist' });
  const before = (await panel.boundingBox())?.width ?? 0;
  const handle = page.getByRole('separator', { name: 'Resize the side panel' });
  const box = await handle.boundingBox();
  if (box === null) throw new Error('no handle');
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 200, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeCloseTo(before + 200, -1);

  // The learn panel too, by the keyboard; both widths survive a reload.
  await page.getByRole('button', { name: 'Learn pages' }).click();
  await page.keyboard.type('Simple Moving');
  await page.keyboard.press('Enter');
  const learn = page.getByRole('separator', { name: 'Resize the learn panel' });
  await learn.focus();
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft');
  await expect(learn).toHaveAttribute('aria-valuenow', '676');
  await page.reload();
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeCloseTo(before + 200, -1);
});

test('appearance: theme, accent, text size, chart backgrounds with an image, heatmap; kept on reload', async ({
  page,
}) => {
  await expect(field(page, 'C')).toBeVisible();
  const html = page.locator('html');
  const backdrop = page.getByTestId('chart-backdrop');
  // On by default: the watchlist heatmap (and the watermark, drawn on the canvas).
  const heatmap = page.getByRole('region', { name: "Day's change heatmap" });
  await heatmap.getByRole('button', { name: /NVDA/ }).click();
  await expect(legend(page)).toContainText('NVIDIA');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await page.locator('label', { hasText: 'Midnight' }).click();
  await expect(html).toHaveAttribute('data-theme', 'midnight');
  await page.locator('label', { hasText: 'Purple' }).click();
  await expect(html).toHaveAttribute('data-accent', 'purple');
  await page.getByLabel('Text size').selectOption('1.25');
  await page.getByLabel('Chart background').selectOption('topo');
  await expect(backdrop).toHaveAttribute('data-backdrop', 'topo');
  await expect(backdrop.locator('path').first()).toBeAttached();

  // The user's image: shrunk, stored in this browser, drawn dimmed behind the chart.
  await page.getByLabel('Chart background').selectOption('image');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.getByLabel('Choose a background image').setInputFiles({
    name: 'wall.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(page.getByRole('button', { name: 'Remove image' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'midnight');
  await expect(html).toHaveAttribute('data-accent', 'purple');
  await expect(backdrop).toHaveAttribute('data-backdrop', 'image');
  await expect(backdrop.locator('[style*="data:image/jpeg"]')).toBeAttached();
  expect(
    await html.evaluate((el) => getComputedStyle(el).getPropertyValue('--text-scale').trim()),
  ).toBe('1.25');
});
