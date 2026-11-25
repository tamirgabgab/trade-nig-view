import { expect, test, type Page } from '@playwright/test';

import { freshStart } from './fixtures.ts';

/** The drawings the backend has for AAPL (the e2e backend starts empty). */
async function saved(page: Page) {
  const response = await page.request.get('/api/drawings/AAPL');
  return (await response.json()) as {
    revision: number;
    drawings: { type: string; points: { time: number; price: number }[] }[];
  };
}

test.beforeEach(async ({ page }) => {
  // Each test starts without drawings (another test may have left one).
  const { revision, drawings } = await saved(page);
  if (drawings.length > 0) {
    await page.request.put('/api/drawings/AAPL', { data: { revision, drawings: [] } });
  }
  await freshStart(page);
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

test('draw a Fib retracement, reload, switch to 1W, then remove it from the trash menu', async ({
  page,
}) => {
  const box = await page.getByTestId('chart-canvas').boundingBox();
  if (box === null) throw new Error('no chart');
  const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });

  // From a low to a high: a drag with the Fib retracement tool (Alt+F).
  await page.keyboard.press('Alt+f');
  const low = at(250, 320);
  const high = at(550, 120);
  await page.mouse.move(low.x, low.y);
  await page.mouse.down();
  await page.mouse.move(high.x, high.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('toolbar', { name: 'Fib retracement toolbar' })).toBeVisible();
  await expect
    .poll(async () => (await saved(page)).drawings.map((d) => d.type))
    .toEqual(['fib_retracement']);
  const drawn = await saved(page);
  await page.screenshot({ path: 'test-results/fib-1d.png' });

  // A reload and a switch to weekly bars keep the drawing as saved: same times and prices.
  await page.reload();
  await page.getByRole('button', { name: '1 week' }).click();
  await expect(page.getByLabel('Price legend')).toContainText('1W');
  await page.screenshot({ path: 'test-results/fib-1w.png' });
  expect((await saved(page)).drawings).toEqual(drawn.drawings);

  // The trash menu removes it after a confirmation that names it.
  await page.getByRole('button', { name: 'Remove objects' }).click();
  await page.getByRole('menuitem', { name: 'Remove 1 drawing…' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Remove all drawings?' });
  await confirm.getByRole('button', { name: 'Remove 1 drawing' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Removed 1 drawing' })).toBeVisible();
  await expect.poll(async () => (await saved(page)).drawings).toEqual([]);
});

/** Pick a tool from the measurement group's menu. */
async function pickMeasureTool(page: Page, name: string) {
  await page.getByRole('button', { name: 'Forecasting and measurement tools: all tools' }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}

test('Return tool: two points, then the equivalent return per month', async ({ page }) => {
  const box = await page.getByTestId('chart-canvas').boundingBox();
  if (box === null) throw new Error('no chart');
  await pickMeasureTool(page, 'Return');
  await page.mouse.click(box.x + 200, box.y + 300);
  await page.mouse.move(box.x + 500, box.y + 150, { steps: 4 });
  await page.mouse.click(box.x + 500, box.y + 150);
  await expect
    .poll(async () => (await saved(page)).drawings.map((d) => d.type))
    .toEqual(['return_range']);

  // Its settings: the unit T of the equivalent return.
  await page.mouse.dblclick(box.x + 350, box.y + 225);
  const panel = page.getByRole('dialog', { name: /Return/ });
  await panel.getByLabel('Return per').selectOption('month');
  await expect
    .poll(async () => {
      const doc = (await saved(page)) as { drawings: { props?: { unit?: string } }[] };
      return doc.drawings[0]?.props?.unit;
    })
    .toBe('month');
});

test('Statistics tool: a range opens the panel with its return distribution', async ({ page }) => {
  const box = await page.getByTestId('chart-canvas').boundingBox();
  if (box === null) throw new Error('no chart');
  await pickMeasureTool(page, 'Statistics');
  await page.mouse.move(box.x + 150, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 600, box.y + 200, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await saved(page)).drawings.map((d) => d.type))
    .toEqual(['stats_range']);

  const returns = page.getByRole('region', { name: 'Returns' });
  await expect(returns.getByRole('img', { name: /Histogram of the returns/ })).toBeVisible();
  await expect(returns.getByRole('row', { name: /Standard deviation/ })).toContainText('%');
  await expect(
    page
      .getByRole('region', { name: 'Curvature' })
      .getByRole('img', { name: /change of the returns/ }),
  ).toBeVisible();

  // Switching to simple open-to-close returns is saved on the drawing.
  await page.getByLabel('From').selectOption('open');
  await expect
    .poll(async () => {
      const doc = (await saved(page)) as { drawings: { props?: { basis?: string } }[] };
      return doc.drawings[0]?.props?.basis;
    })
    .toBe('open');
});

test('Trade plan tool: entry, target and stop open the tab with the chances', async ({ page }) => {
  const box = await page.getByTestId('chart-canvas').boundingBox();
  if (box === null) throw new Error('no chart');
  await pickMeasureTool(page, 'Trade plan');
  // Entry in the middle of the history, the target up and 15-odd bars later, the stop below.
  await page.mouse.click(box.x + 300, box.y + 300);
  await page.mouse.move(box.x + 420, box.y + 220, { steps: 4 });
  await page.mouse.click(box.x + 420, box.y + 220);
  await page.mouse.move(box.x + 420, box.y + 350, { steps: 4 });
  await page.mouse.click(box.x + 420, box.y + 350);
  await expect
    .poll(async () => (await saved(page)).drawings.map((d) => d.type))
    .toEqual(['trade_plan']);

  const chances = page.getByRole('table', { name: 'Plan chances' });
  await expect(chances.getByRole('row', { name: /Target first/ })).toContainText('%', {
    timeout: 30_000,
  });
  await expect(page.getByRole('table', { name: /Expected R by target and stop/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Reliability/ })).toBeVisible();
  await expect(page.getByText(/What happened:/)).toBeVisible(); // a plan drawn in the past
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'test-results/trade-plan.png' });

  // The risk % is saved on the drawing.
  await page.getByLabel('Risk %').fill('2');
  await page.getByLabel('Risk %').press('Enter'); // committed on Enter or blur
  await expect
    .poll(async () => {
      const doc = (await saved(page)) as { drawings: { props?: { risk_pct?: number } }[] };
      return doc.drawings[0]?.props?.risk_pct;
    })
    .toBe(2);
});
