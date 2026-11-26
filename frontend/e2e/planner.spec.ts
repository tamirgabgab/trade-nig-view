import { expect, test } from '@playwright/test';

import { dailyRows, freshStart, present } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await freshStart(page);
});

test('planner: deposits into AAPL give a row per deposit, the totals and the data history', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  const planner = page.getByRole('region', { name: 'Planner' });
  await expect(planner.getByRole('heading', { name: 'Planner: market account' })).toBeVisible();

  // Before running: how far back the ticker goes (offline: only AAPL has data).
  await planner.getByLabel('Ticker 1').fill('aapl');
  await planner.getByRole('button', { name: 'Check data history' }).click();
  const first = present(dailyRows('AAPL.csv')[0], 'AAPL bars').date;
  const history = planner.getByRole('table', { name: 'Assets history' });
  await expect(history.getByRole('row').nth(1)).toContainText(`AAPL${first}`);

  // One deposit of ₪10,000 and 119 monthly ones of ₪1,500 (the defaults): 120 rows.
  await planner.getByRole('button', { name: 'Run' }).click();
  const deposits = planner.getByRole('table', { name: 'Deposits' });
  await expect(deposits.getByRole('row')).toHaveCount(121);
  await expect(deposits.getByRole('row').nth(1)).toContainText('2015-01-02₪10,000AAPL');
  await expect(planner.getByText('Deposited').locator('..')).toContainText('₪188,500');
  await expect(planner.getByText('The earliest day a plan with this mix can start')).toContainText(
    first,
  );
  // Offline there is no Yahoo USD/ILS: the Bank of Israel's rate, with a warning.
  await expect(planner.getByText('Bank of Israel rate is used')).toBeVisible();

  // Without the exchange rate the same plan buys at a rate of 1 (no "× rate" in the rows).
  await planner.getByLabel('Convert dollar assets by the USD/ILS rate').uncheck();
  await planner.getByRole('button', { name: 'Run' }).click();
  await expect(planner.getByText('Bank of Israel rate is used')).toBeHidden();
  await expect(deposits.getByRole('row').nth(1)).not.toContainText('×');

  // A plan that cannot run says why; the inputs survive a reload.
  await planner.getByLabel('Deposit date 1').fill('1990-01-02');
  await planner.getByRole('button', { name: 'Run' }).click();
  await expect(planner.getByRole('alert')).toContainText(`AAPL has no data before ${first}`);
  await page.reload();
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  await expect(planner.getByLabel('Ticker 1')).toHaveValue('AAPL');
  await expect(planner.getByLabel('Deposit date 1')).toHaveValue('1990-01-02');

  // Back to the chart, which kept its state; typing there opens symbol search again.
  await page.getByRole('button', { name: 'Back to the chart' }).click();
  await expect(planner).toBeHidden();
  await expect(page.getByLabel('Price legend')).toContainText('Apple Inc.');
});
