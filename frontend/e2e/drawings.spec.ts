import { expect, test, type Page } from '@playwright/test';

/** The drawings the backend has for AAPL (the e2e backend starts empty). */
async function saved(page: Page) {
  const response = await page.request.get('/api/drawings/AAPL');
  return (await response.json()) as {
    revision: number;
    drawings: { type: string; points: { time: number; price: number }[] }[];
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await expect(page.getByLabel('Price legend').locator('[data-field="C"]')).toBeVisible();
});

test('draw a trend line, reload, move it, delete it with Del', async ({ page }) => {
  const box = await page.getByTestId('chart-canvas').boundingBox();
  if (box === null) throw new Error('no chart');
  const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });

  // Two clicks with the trend line tool (Alt+T).
  await page.keyboard.press('Alt+t');
  await expect(page.getByRole('button', { name: 'Trend line', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.mouse.click(at(200, 300).x, at(200, 300).y);
  await page.mouse.move(at(500, 150).x, at(500, 150).y, { steps: 4 });
  await page.mouse.click(at(500, 150).x, at(500, 150).y);
  await expect(page.getByRole('toolbar', { name: 'Trend line toolbar' })).toBeVisible();
  await expect
    .poll(async () => (await saved(page)).drawings.map((d) => d.type))
    .toEqual(['trend_line']);
  const drawn = (await saved(page)).drawings[0]?.points ?? [];

  // Still there after a reload: select it again by clicking on it, then drag it up.
  await page.reload();
  await expect(page.getByLabel('Price legend').locator('[data-field="C"]')).toBeVisible();
  const mid = at(350, 225);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y - 40, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('toolbar', { name: 'Trend line toolbar' })).toBeVisible();
  await expect
    .poll(async () => (await saved(page)).drawings[0]?.points[0]?.price ?? 0)
    .toBeGreaterThan(drawn[0]?.price ?? Infinity);
  // Moving keeps the anchors' times (a vertical drag).
  expect((await saved(page)).drawings[0]?.points.map((p) => p.time)).toEqual(
    drawn.map((p) => p.time),
  );

  // Del deletes it (and offers Undo).
  await page.keyboard.press('Delete');
  await expect(page.getByRole('status').filter({ hasText: 'Removed Trend line' })).toBeVisible();
  await expect.poll(async () => (await saved(page)).drawings).toEqual([]);
});
