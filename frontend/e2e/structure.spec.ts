import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
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
