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
  await bar.getByLabel('Start date').press('Enter');
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

test('a learn page exercise starts the replay on its symbol, date and indicator', async ({
  page,
}) => {
  // The SMA page with an exercise card on NVDA; the chart starts on AAPL, then goes weekly.
  await page.route('**/api/learn/sma', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    const block = {
      kind: 'replay',
      symbol: 'NVDA',
      date: '2024-01-02',
      indicators: [{ id: 'sma', params: { length: 50 } }],
    };
    body['markdown'] = `# SMA\n\n## Exercise\n\n\`\`\`lab\n${JSON.stringify(block)}\n\`\`\`\n`;
    await route.fulfill({ response, json: body });
  });
  const start = dailyRows('NVDA.csv').find((r) => r.date === '2024-01-02');
  await page
    .getByRole('group', { name: 'Interval' })
    .getByRole('button', { name: '1 week' })
    .click();

  await page.getByRole('button', { name: 'Learn pages' }).click();
  await page.keyboard.type('Simple Moving');
  await page.keyboard.press('Enter');
  const card = page.getByRole('region', { name: 'Replay exercise' });
  await expect(card).toContainText('NVDA, daily, from 2024-01-02 with SMA 50');
  await card.getByRole('button', { name: 'Start in Replay' }).click();

  await expect(page.getByRole('toolbar', { name: 'Bar replay' })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(field(page, 'C')).toHaveText(price(adjusted(present(start, 'start bar')).close));
  await expect(page.getByRole('list', { name: 'Indicators on the chart' })).toContainText('SMA 50');
  await expect(
    page.getByRole('group', { name: 'Interval' }).getByRole('button', { name: '1 day' }),
  ).toHaveAttribute('aria-pressed', 'true');
});
