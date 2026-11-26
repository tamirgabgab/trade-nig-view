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
  // The earlier run's results are gone: never an error above someone else's numbers.
  await expect(deposits).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  await expect(planner.getByLabel('Ticker 1')).toHaveValue('AAPL');
  await expect(planner.getByLabel('Deposit date 1')).toHaveValue('1990-01-02');

  // Back to the chart, which kept its state; typing there opens symbol search again.
  await page.getByRole('button', { name: 'Back to the chart' }).click();
  await expect(planner).toBeHidden();
  await expect(page.getByLabel('Price legend')).toContainText('Apple Inc.');
});

test('planner: an apartment with one fixed track, a saved purchase-tax table and a plan that cannot run', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  const planner = page.getByRole('region', { name: 'Planner' });
  await planner.getByRole('tab', { name: 'Apartment' }).click();
  const home = planner.getByRole('tabpanel', { name: 'Apartment' });
  await expect(home.getByRole('heading', { name: 'Planner: apartment' })).toBeVisible();
  await expect(planner.getByRole('tabpanel', { name: 'Market' })).toBeHidden();

  // ₪600,000 at a fixed 4% over 20 years: ₪3,636 a month, as a bank calculator shows it.
  await home.getByLabel('Price ₪').fill('1000000');
  await home.getByLabel('Equity ₪').fill('400000');
  await expect(home.getByText('The loan: ₪600,000 (60.00% of the price)')).toBeVisible();
  await home.getByRole('button', { name: 'Remove track 3' }).click();
  await home.getByRole('button', { name: 'Remove track 2' }).click();
  await home.getByLabel('Track 1 years').fill('20');
  await home.getByLabel('Track 1 rate %').fill('4');
  await home.getByRole('button', { name: 'Run' }).click();
  const cards = home.locator('dl');
  const card = (label: string) => cards.getByText(label, { exact: true }).locator('..');
  await expect(card('First payment')).toContainText('₪3,636');
  await expect(card('Loan')).toContainText('₪600,000');
  // A single home under the first bracket pays no purchase tax.
  await expect(card('Purchase tax')).toContainText('₪0');
  await expect(home.getByRole('table', { name: 'Mortgage tracks' }).getByRole('row')).toHaveCount(
    2,
  );
  // Ten years to the sale (a row per month and the purchase day); the loan runs for twenty.
  await expect(home.getByRole('table', { name: 'Until the sale' }).getByRole('row')).toHaveCount(
    122,
  );
  await expect(home.getByRole('table', { name: 'Mortgage schedule' }).getByRole('row')).toHaveCount(
    241,
  );

  // An additional home pays 8% from the first shekel; an edited table is saved under a name.
  const table = home.getByLabel('Purchase tax table', { exact: true });
  await table.selectOption({ label: 'Additional home (2026)' });
  await home.getByRole('button', { name: 'Run' }).click();
  await expect(card('Purchase tax')).toContainText('₪80,000');
  await home.getByLabel('Purchase tax bracket 1 rate %').fill('5');
  await expect(home.getByText('Changed: save it under a name').first()).toBeVisible();
  await home.getByLabel('Purchase tax: name to save under').fill('Mine');
  await home.getByRole('button', { name: 'Save purchase tax table' }).click();
  await expect(table).toHaveValue('saved:Mine');
  await home.getByRole('button', { name: 'Run' }).click();
  await expect(card('Purchase tax')).toContainText('₪50,000');

  // A plan that cannot run says why, with no results of the earlier one under it.
  await home.getByLabel('Equity ₪').fill('1200000');
  await home.getByRole('button', { name: 'Run' }).click();
  await expect(home.getByRole('alert')).toContainText('The equity cannot exceed the price');
  await expect(cards).toBeHidden();

  // The inputs and the saved table survive a reload; the market tab is still the first one.
  await page.reload();
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  await expect(planner.getByRole('heading', { name: 'Planner: market account' })).toBeVisible();
  await planner.getByRole('tab', { name: 'Apartment' }).click();
  await expect(table).toHaveValue('saved:Mine');
  await expect(home.getByLabel('Purchase tax bracket 1 rate %')).toHaveValue('5');
  await expect(home.getByLabel('Track 1 years')).toHaveValue('20');
});
