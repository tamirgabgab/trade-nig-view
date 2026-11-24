import { expect, test } from '@playwright/test';

import { freshStart } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await freshStart(page);
  await expect(page.getByLabel('Price legend').locator('[data-field="C"]')).toBeVisible();
});

test('gaps, previous-week levels and pivots from the Structure menu; Data window and Gaps tabs', async ({
  page,
}) => {
  const structure = page.getByRole('button', { name: 'Market structure' });
  await structure.click();
  await page.getByRole('menuitemcheckbox', { name: 'Gaps' }).click();
  await structure.click();
  await page.getByRole('menuitemcheckbox', { name: 'Previous week high, low, close' }).click();
  await structure.click();
  await page.getByRole('menuitemcheckbox', { name: 'Pivot points high/low' }).click();
  const legend = page.getByLabel('Price legend');
  await expect(legend).toContainText('Prev HLC');
  await expect(legend).toContainText('Pivots');

  // The Gaps tab lists the chart's gaps; a click scrolls the chart to one.
  await page.getByRole('button', { name: 'Show gaps' }).click();
  const gaps = page.getByRole('region', { name: 'Gaps' });
  await expect(gaps.getByRole('list', { name: 'Gaps' }).getByRole('button').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/structure.png' });
  await gaps.getByRole('list', { name: 'Gaps' }).getByRole('button').last().click();

  // The Data window shows the bar under the crosshair, with the indicator values.
  await page.getByRole('button', { name: 'Show data window' }).click();
  const data = page.getByRole('region', { name: 'Data window' });
  await expect(data).toContainText('Close');
  await expect(data).toContainText('Prev high');
  const date = data.locator('p').first();
  const before = await date.innerText();
  const box = await page.getByTestId('chart-canvas').boundingBox();
  if (box === null) throw new Error('no chart');
  await page.mouse.move(box.x + 300, box.y + 200);
  await expect(date).not.toHaveText(before);
  // The legend and the Data window show the same bar's close.
  await expect(data).toContainText(await legend.locator('[data-field="C"]').innerText());
  await page.screenshot({ path: 'test-results/data-window.png' });
});

test('forecast: the next bars on the chart and the Forecast tab with its validation', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Market structure' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Forecast (next bars)' }).click();
  await page.getByRole('button', { name: 'Show forecast' }).click();
  const perBar = page.getByRole('table', { name: 'Forecast per bar ahead' });
  await expect(perBar.getByRole('row')).toHaveCount(6, { timeout: 30_000 }); // header + 5 bars
  const validation = page.getByRole('table', { name: 'Validation out of sample' });
  await expect(validation.getByRole('row', { name: /Naive/ })).toBeVisible();
  await expect(validation.getByRole('row', { name: /C: Ridge/ })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'test-results/forecast.png' });

  // Three bars ahead: three rows.
  await page.getByLabel('Bars ahead').first().selectOption('3');
  await expect(perBar.getByRole('row')).toHaveCount(4, { timeout: 30_000 });
});

test('the Forecasting OHLC learn page runs the forecast on a random stock', async ({ page }) => {
  await page.getByRole('button', { name: 'Learn pages' }).click();
  await page.keyboard.type('Forecasting');
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('complementary', { name: 'Forecasting OHLC' });
  const lab = drawer.getByRole('region', { name: 'Forecast lab' });
  await lab.scrollIntoViewIfNeeded();
  await expect(lab.getByRole('img', { name: /forecast of the next 5/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    lab.getByRole('table', { name: 'Forecast per bar ahead' }).getByRole('row'),
  ).toHaveCount(6);
  await expect(lab.getByRole('table', { name: 'Validation out of sample' })).toBeVisible();
});
