import { expect, test, type Page } from '@playwright/test';

import { adjusted, dailyRows, freshStart, price, present } from './fixtures.ts';

const field = (page: Page, name: string) =>
  page.getByLabel('Price legend').locator(`[data-field="${name}"]`);

test.beforeEach(async ({ page }) => {
  await freshStart(page);
  await expect(field(page, 'C')).toBeVisible();
});

test('replay AAPL from 2024-01-02: step 5 bars, the legend shows bar 5 and nothing after it', async ({
  page,
}) => {
  const rows = dailyRows('AAPL.csv');
  const start = rows.findIndex((r) => r.date === '2024-01-02');
  expect(start).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Bar replay' }).click();
  const bar = page.getByRole('toolbar', { name: 'Bar replay' });
  await bar.getByLabel('Start date').fill('2024-01-02');
  await expect(field(page, 'C')).toHaveText(
    price(adjusted(present(rows[start], 'start bar')).close),
  );
  await expect(
    page.getByRole('group', { name: 'Interval' }).getByRole('button').first(),
  ).toBeDisabled();

  // Five steps with Shift+→ (the chart has the focus, not a text field).
  await page.getByTestId('chart-canvas').click({ position: { x: 20, y: 20 } });
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowRight');
  await page.mouse.move(0, 0);
  const fifth = adjusted(present(rows[start + 5], 'bar 5'));
  await expect(field(page, 'C')).toHaveText(price(fifth.close));
  await expect(field(page, 'O')).toHaveText(price(fifth.open));
  await expect(bar).toContainText(
    present(rows[start + 5], 'bar 5')
      .date.slice(8, 10)
      .replace(/^0/, ''),
  );

  // Play runs on by itself; exit returns to the latest bar.
  await bar.getByRole('button', { name: 'Play', exact: true }).click();
  await bar.getByLabel('Replay speed').selectOption('10');
  await expect(field(page, 'C')).not.toHaveText(price(fifth.close));
  await bar.getByRole('button', { name: 'Exit replay' }).click();
  await page.mouse.move(0, 0); // the replay bar floats over the chart: no crosshair
  const last = adjusted(present(rows.at(-1), 'last bar'));
  await expect(field(page, 'C')).toHaveText(price(last.close));
});
