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

test('planner: the apartment against the same money in the market, for one plan and over history', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  const planner = page.getByRole('region', { name: 'Planner' });
  // The market side: AAPL in shekels as they are (offline, the USD/ILS rate starts in 2015).
  await planner.getByLabel('Ticker 1').fill('aapl');
  await planner.getByLabel('Convert dollar assets by the USD/ILS rate').uncheck();
  // The apartment: its value and its rates from history, so the windows differ.
  await planner.getByRole('tab', { name: 'Apartment' }).click();
  const home = planner.getByRole('tabpanel', { name: 'Apartment' });
  await home.getByLabel('Value path', { exact: true }).selectOption('historical');
  await home.getByLabel('Bank of Israel rate', { exact: true }).selectOption('historical');

  await planner.getByRole('tab', { name: 'Compare' }).click();
  const compare = planner.getByRole('tabpanel', { name: 'Compare' });
  await expect(home).toBeHidden();
  await compare.getByRole('button', { name: 'Compare' }).click();
  await expect(
    compare.getByRole('heading', { name: 'Apartment against market: 2015-01-15 to 2025-01-15' }),
  ).toBeVisible();
  const card = (label: string) =>
    compare.locator('dl').getByText(label, { exact: true }).locator('..');
  // Both options put in the same money: the equity and the purchase costs, then every month.
  await expect(card('Put in by each')).toContainText('₪');
  await expect(card('Apartment: worth at the end')).toContainText('₪');
  await expect(card('Market: yearly return')).toContainText('%');
  await expect(compare.getByRole('heading', { name: 'Breakeven rates' })).toBeVisible();
  await expect(card('Apartment appreciation')).toContainText(/% a year|None in range/);
  await expect(compare.getByRole('table', { name: 'Win map' })).toBeHidden();

  // What the answer depends on: the apartment's return by source, the moves, who leads.
  const parts = compare.getByRole('table', { name: 'Apartment return' });
  await expect(parts.getByRole('row')).toHaveCount(6);
  await expect(parts.getByRole('row').last()).toContainText(/The apartment’s yearly return.*%/);
  const moves = compare.getByRole('table', { name: 'Sensitivity' });
  await expect(moves.getByRole('row')).toHaveCount(6);
  await expect(moves.getByRole('row').filter({ hasText: 'Rent, 10%' })).toContainText('₪');
  await expect(
    compare.getByRole('img', { name: 'How apartment minus market changes when one input moves' }),
  ).toBeVisible();
  await expect(card('Leads at the end')).toContainText(/Apartment|Market|A tie/);
  const lead = compare.getByRole('img', { name: 'End value by exit month: Apartment and Market' });
  await expect(lead.locator('polyline')).toHaveCount(3);
  // A forced sale at the default 10 % off; at 0 % it is the sale itself, and the line is gone.
  const liquidity = compare.getByRole('table', { name: 'Liquidity' });
  await expect(liquidity.getByRole('row').filter({ hasText: 'forced sale at −10%' })).toBeVisible();
  await compare.getByLabel('Forced sale discount %').fill('0');
  await compare.getByRole('button', { name: 'Compare' }).click();
  await expect(liquidity.getByRole('row').filter({ hasText: 'forced sale at −0%' })).toBeVisible();
  await expect(lead.locator('polyline')).toHaveCount(2);
  await compare.getByLabel('Forced sale discount %').fill('10');

  // Over history: a start every month from AAPL's first bar to a sale inside the index.
  await compare.getByRole('button', { name: 'Run history' }).click();
  await expect(
    compare.getByRole('heading', { name: /^History: 176 starts, 2002-01-15 to/ }),
  ).toBeVisible();
  await expect(card('Windows')).toContainText('176');
  await expect(card('Independent terms, about')).toContainText('2.5');
  await expect(card('P(apartment > market)')).toContainText('%');
  await expect(
    compare.getByText('Earlier starts cannot run: AAPL has no data before'),
  ).toBeVisible();
  const map = compare.getByRole('table', { name: 'Win map' });
  // A row per start year (2002 to 2021) under the header; ten years from 2017 is past the data.
  await expect(map.getByRole('row')).toHaveCount(21);
  const row = (year: string) => map.getByRole('row').filter({ hasText: new RegExp(`^${year}`) });
  await expect(row('2010').getByRole('cell').nth(1)).toHaveText(/^[+−]\d+\.\d\d$/);
  await expect(row('2017').getByRole('cell').nth(1)).toHaveText('—');

  // With its own account the apartment's side is renamed, and the mirror follows its deposits.
  await compare.getByLabel('Option A: its own market deposits').check();
  await compare.getByRole('button', { name: 'Compare' }).click();
  await expect(
    compare.getByRole('heading', { name: /^Apartment and account against market/ }),
  ).toBeVisible();
  await expect(map).toBeHidden();

  // A comparison that cannot run says why, with no earlier results under it.
  await planner.getByRole('tab', { name: 'Apartment' }).click();
  await home.getByLabel('Equity ₪').fill('99000000');
  await planner.getByRole('tab', { name: 'Compare' }).click();
  await compare.getByRole('button', { name: 'Compare' }).click();
  await expect(compare.getByRole('alert')).toContainText('The equity cannot exceed the price');
  await expect(compare.getByRole('heading', { name: 'Breakeven rates' })).toBeHidden();
});

test('planner: a simulation of the comparison, its distribution and the handles a and b', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  const planner = page.getByRole('region', { name: 'Planner' });
  await planner.getByLabel('Ticker 1').fill('aapl');
  await planner.getByLabel('Convert dollar assets by the USD/ILS rate').uncheck();
  await planner.getByRole('tab', { name: 'Apartment' }).click();
  const home = planner.getByRole('tabpanel', { name: 'Apartment' });
  await home.getByLabel('Value path', { exact: true }).selectOption('historical');
  await home.getByLabel('Bank of Israel rate', { exact: true }).selectOption('historical');
  await planner.getByRole('tab', { name: 'Compare' }).click();
  const compare = planner.getByRole('tabpanel', { name: 'Compare' });

  // A block bootstrap of the history AAPL, the dwelling index and the rate share.
  await compare.getByLabel('Worlds').fill('60');
  await compare.getByLabel('Monthly net income ₪').fill('25000');
  await compare.getByRole('button', { name: 'Simulate' }).click();
  await expect(
    compare.getByRole('heading', { name: 'Simulation: 60 worlds, block bootstrap' }),
  ).toBeVisible();
  const card = (label: string) =>
    compare.locator('dl').getByText(label, { exact: true }).locator('..');
  await expect(card('P(apartment > market)')).toContainText('%');
  await expect(card('History resampled')).toContainText('295 months');
  await expect(card('Independent terms in it, about')).toContainText('2.5');
  const risk = compare.getByRole('table', { name: 'Risk' });
  const row = (label: string) => risk.getByRole('row').filter({ hasText: label });
  // The apartment has a loan and a payment; the market side has an account.
  await expect(row('A payment above the share of income').getByRole('cell').nth(1)).toHaveText(
    /%$/,
  );
  await expect(row('A payment above the share of income').getByRole('cell').nth(2)).toHaveText('—');
  await expect(row('Time the account is below its deposits').getByRole('cell').nth(1)).toHaveText(
    '—',
  );
  // The same money split between the two, from all in the market to all in the apartment.
  const split = compare.getByRole('table', { name: 'Split' });
  await expect(split.getByRole('row')).toHaveCount(6);
  await expect(split.getByRole('row').nth(3)).toContainText('50%');

  // The handles: sliders that move with the keyboard and by dragging; the share follows.
  const a = compare.getByRole('slider', { name: 'Lower bound a' });
  const b = compare.getByRole('slider', { name: 'Upper bound b' });
  const chance = compare.getByText(/^Market: .* of the worlds end/);
  await expect(chance).toContainText('95% interval of the simulation');
  const before = Number(await a.getAttribute('aria-valuenow'));
  await a.focus();
  await page.keyboard.press('Home');
  expect(Number(await a.getAttribute('aria-valuenow'))).toBeLessThan(before);
  await b.focus();
  await page.keyboard.press('End');
  // From the first bar to the last one, about every world is inside.
  await expect(chance).toContainText(/Market: (9\d|100)\.\d\d% of the worlds/);
  const box = await b.boundingBox();
  if (box === null) throw new Error('The handle is not on the page');
  const wide = Number(await b.getAttribute('aria-valuenow'));
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x - 200, box.y + 30, { steps: 5 });
  await page.mouse.up();
  expect(Number(await b.getAttribute('aria-valuenow'))).toBeLessThan(wide);
  await expect(compare.getByLabel('Upper bound b', { exact: true }).last()).not.toHaveValue('');
  // Both handles on the right end: b is on top and cannot go left, so the drag moves a.
  await b.focus();
  await page.keyboard.press('End');
  await a.focus();
  await page.keyboard.press('End');
  const top = Number(await a.getAttribute('aria-valuenow'));
  const end = await b.boundingBox();
  if (end === null) throw new Error('The handle is not on the page');
  await page.mouse.move(end.x + end.width / 2, end.y + 30);
  await page.mouse.down();
  await page.mouse.move(end.x - 150, end.y + 30, { steps: 5 });
  await page.mouse.up();
  expect(Number(await a.getAttribute('aria-valuenow'))).toBeLessThan(top);
  expect(Number(await b.getAttribute('aria-valuenow'))).toBe(top);

  // Another measure, and a modelled market in place of the mix.
  await compare.getByLabel('Measure').selectOption('xirr_real');
  await expect(chance).toContainText('% and');
  await compare.getByLabel('Simulation method').selectOption('monte_carlo');
  await compare.getByLabel('Estimate the market from the mix’s history').uncheck();
  await compare.getByLabel('Market mean % a year').fill('6');
  await compare.getByLabel('Market volatility % a year').fill('15');
  await compare.getByRole('button', { name: 'Simulate' }).click();
  await expect(
    compare.getByRole('heading', { name: 'Simulation: 60 worlds, Monte Carlo' }),
  ).toBeVisible();
  await expect(card('Modelled market')).toContainText('6.00% a year, σ 15.00%');
});

test('planner: two options of their own, a saved scenario and a CSV file', async ({ page }) => {
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  const planner = page.getByRole('region', { name: 'Planner' });
  const market = planner.getByRole('tabpanel', { name: 'Market' });
  await market.getByLabel('Ticker 1').fill('aapl');
  await market.getByLabel('Convert dollar assets by the USD/ILS rate').uncheck();
  // Apart from option A, option B starts as a copy of it; here it becomes a dearer apartment.
  await expect(market.getByRole('radio', { name: 'Option B' })).toBeDisabled();
  await market.getByLabel('Option B is the same as option A').uncheck();
  await planner.getByRole('tab', { name: 'Apartment' }).click();
  const home = planner.getByRole('tabpanel', { name: 'Apartment' });
  await expect(home.getByLabel('Option B is the same as option A')).not.toBeChecked();
  await home.getByRole('radio', { name: 'Option B' }).click();
  await home.getByLabel('Price ₪').fill('3000000');
  await home.getByLabel('Equity ₪').fill('900000');
  // The switch is one for both tabs: the Market tab now shows option B's mix too.
  await planner.getByRole('tab', { name: 'Market' }).click();
  await expect(market.getByRole('radio', { name: 'Option B' })).toBeChecked();
  await expect(market.getByLabel('Ticker 1')).toHaveValue('AAPL');

  await planner.getByRole('tab', { name: 'Compare' }).click();
  const compare = planner.getByRole('tabpanel', { name: 'Compare' });
  await compare.getByLabel('Option B: apartment').check();
  await compare.getByRole('button', { name: 'Compare' }).click();
  await expect(
    compare.getByRole('heading', { name: /^Apartment A against apartment B: 2015-01-15/ }),
  ).toBeVisible();
  const card = (label: string) =>
    compare.locator('dl').getByText(label, { exact: true }).locator('..');
  await expect(card('Apartment B: worth at the end')).toContainText('₪');

  // Saved under a name, lost from the forms, and loaded back as it was.
  await compare.getByLabel('Scenario name').fill('Two apartments');
  await compare.getByRole('button', { name: 'Save scenario' }).click();
  await expect(compare.getByRole('status')).toContainText('Saved “Two apartments”');
  await planner.getByRole('tab', { name: 'Apartment' }).click();
  await home.getByLabel('Price ₪').fill('1234567');
  await planner.getByRole('tab', { name: 'Compare' }).click();
  await compare.getByLabel('Saved scenario').selectOption('Two apartments');
  await compare.getByRole('button', { name: 'Load scenario' }).click();
  await expect(compare.getByRole('status')).toContainText('Loaded “Two apartments”');
  await planner.getByRole('tab', { name: 'Apartment' }).click();
  await expect(home.getByRole('radio', { name: 'Option A' })).toBeChecked();
  await home.getByRole('radio', { name: 'Option B' }).click();
  await expect(home.getByLabel('Price ₪')).toHaveValue('3000000');
  // It survives a reload: it is kept by the backend, not by the browser.
  await page.reload();
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  await planner.getByRole('tab', { name: 'Compare' }).click();
  await expect(compare.getByLabel('Saved scenario').getByRole('option')).toHaveText([
    'Choose…',
    'Two apartments',
  ]);

  // The exit months as a file: raw numbers, a row a month checked.
  await compare.getByRole('button', { name: 'Compare' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    compare.getByRole('button', { name: 'Download CSV: exit months' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('exit months.csv');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const file = Buffer.concat(chunks);
  // The byte-order mark, then the rows (it would be lost by trimming the text).
  expect([...file.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const lines = file.subarray(3).toString('utf8').trimEnd().split('\r\n');
  expect(lines[0]).toBe('months,date,x,y,x_forced,y_forced');
  expect(lines).toHaveLength(61);
  expect(lines[60]).toMatch(/^120,2025-01-15,\d+\.?\d*,\d+\.?\d*,/);

  await compare.getByLabel('Saved scenario').selectOption('Two apartments');
  await compare.getByRole('button', { name: 'Delete scenario' }).click();
  await compare.getByRole('button', { name: 'Delete “Two apartments”' }).click();
  await expect(compare.getByText('No saved scenario yet.')).toBeVisible();
});

test('planner: a learn page opens over the planner, from the section it explains', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  const planner = page.getByRole('region', { name: 'Planner' });
  await planner.getByRole('tab', { name: 'Apartment' }).click();
  const home = planner.getByRole('tabpanel', { name: 'Apartment' });
  await home.getByRole('link', { name: 'Mortgage tracks' }).click();
  const drawer = page.getByRole('complementary', { name: 'Mortgage tracks' });
  // Really on top of the planner: a covered link could not be clicked.
  await expect(
    drawer.getByRole('heading', { name: 'The payment, by repayment type' }),
  ).toBeVisible();
  await expect(drawer.getByText('₪3,635.88', { exact: false }).first()).toBeVisible();
  await drawer.getByRole('link', { name: 'the three kinds of yearly rate' }).click();
  const xirr = page.getByRole('complementary', { name: 'Yearly return (XIRR)' });
  await expect(xirr.getByRole('heading', { name: 'Three kinds of yearly rate' })).toBeVisible();
  await expect(xirr.locator('.katex').first()).toBeVisible();
  await xirr.getByRole('button', { name: 'Close learn panel' }).click();
  await expect(xirr).toBeHidden();
  // The planner is still there, as it was.
  await expect(home.getByLabel('Price ₪')).toBeVisible();
});

test('planner: withdrawals from a capital, on an assumed return and on the mix', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  const planner = page.getByRole('region', { name: 'Planner' });
  await planner.getByRole('tab', { name: 'Withdraw' }).click();
  const withdraw = planner.getByRole('tabpanel', { name: 'Withdraw' });
  const card = (label: string) =>
    withdraw.locator('dl').getByText(label, { exact: true }).locator('..');

  // A known answer through the whole stack: 1,000,000 that does not grow, all of it cost,
  // 10,000 a month not indexed. Five years leave 400,000.
  await withdraw.getByLabel('The account grows by').selectOption('assumed');
  await withdraw.getByLabel('Yearly return %').fill('0');
  await withdraw.getByLabel('Starts on').fill('2030-01-15');
  await withdraw.getByLabel('Years', { exact: true }).fill('5');
  await withdraw.getByLabel('Cost share %').fill('100');
  await withdraw.getByLabel('Amount ₪ a month, net').fill('10000');
  await withdraw.getByLabel('Rises with the CPI').uncheck();
  await withdraw.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(
    withdraw.getByRole('heading', { name: 'Withdrawals: 2030-01-15 to 2035-01-15' }),
  ).toBeVisible();
  await expect(card('Lasts')).toContainText('All 5 years');
  await expect(card('Left at the end')).toContainText('₪400,000');
  await expect(card('Taken, net')).toContainText('₪600,000');
  await expect(card('Tax paid')).toContainText('₪0');
  // Ten years: the hundredth month takes the last of it.
  await withdraw.getByLabel('Years', { exact: true }).fill('10');
  await withdraw.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(card('The money ends')).toContainText('2038-06-15');
  await expect(
    withdraw.getByRole('table', { name: 'Withdrawals by year' }).getByRole('row'),
  ).toHaveCount(11);

  // A percent of AAPL's history: the balance moves with the market and never ends.
  await planner.getByRole('tab', { name: 'Market' }).click();
  await planner.getByLabel('Ticker 1').fill('aapl');
  await planner.getByLabel('Convert dollar assets by the USD/ILS rate').uncheck();
  await planner.getByRole('tab', { name: 'Withdraw' }).click();
  await withdraw.getByLabel('The account grows by').selectOption('mix');
  await expect(withdraw.getByText('Runs the Market tab’s mix: AAPL 100%')).toBeVisible();
  await withdraw.getByLabel('Starts on').fill('2010-01-15');
  await withdraw.getByLabel('Cost share %').fill('50');
  await withdraw.getByLabel('Withdrawal rule').selectOption('percent');
  await withdraw.getByLabel('Sold % a year').fill('4');
  await withdraw.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(
    withdraw.getByRole('heading', { name: 'Withdrawals: 2010-01-15 to 2020-01-15' }),
  ).toBeVisible();
  await expect(card('Income, first month')).toContainText('₪');
  const bounds = withdraw.getByRole('table', { name: 'Tax bounds' });
  await expect(bounds.getByRole('row')).toHaveCount(4);
  await expect(withdraw.getByRole('img', { name: /^Balance and monthly income/ })).toBeVisible();
  // The settings are kept: a reload shows the percent rule again.
  await page.reload();
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  await planner.getByRole('tab', { name: 'Withdraw' }).click();
  await expect(withdraw.getByLabel('Withdrawal rule')).toHaveValue('percent');
});

test('planner: withdrawals with an apartment, kept and then sold when the account runs out', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  const planner = page.getByRole('region', { name: 'Planner' });
  await planner.getByRole('tab', { name: 'Withdraw' }).click();
  const withdraw = planner.getByRole('tabpanel', { name: 'Withdraw' });
  const card = (label: string) =>
    withdraw.locator('dl').getByText(label, { exact: true }).locator('..');

  // J0's known answer, 1,000,000 that does not grow paying 10,000 a month, beside an apartment
  // worth 2,000,000 that does not grow and costs nothing: the account ends in month 101.
  await withdraw.getByLabel('The account grows by').selectOption('assumed');
  await withdraw.getByLabel('Yearly return %').fill('0');
  await withdraw.getByLabel('Starts on').fill('2030-01-15');
  await withdraw.getByLabel('Years', { exact: true }).fill('10');
  await withdraw.getByLabel('Cost share %').fill('100');
  await withdraw.getByLabel('Amount ₪ a month, net').fill('10000');
  await withdraw.getByLabel('Rises with the CPI').uncheck();
  await withdraw.getByLabel('Include an apartment I own').check();
  await withdraw.getByLabel('Yearly growth %').fill('0');
  await withdraw.getByLabel('Maintenance % a year').fill('0');
  await withdraw.getByLabel('Insurance ₪ a year').fill('0');
  await withdraw.getByLabel('Selling costs %').fill('0');
  await withdraw.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(card('The money ends')).toContainText('2038-06-15');
  await expect(card('The apartment')).toContainText('Kept');
  await expect(card('Net worth at the end')).toContainText('₪2,000,000');

  // Sold when the account runs out: its 2,000,000 pays the last 20 months, and 1,800,000 is left.
  await withdraw.getByLabel('Its sale').selectOption('when_empty');
  await withdraw.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(card('Lasts')).toContainText('All 10 years');
  await expect(card('The apartment')).toContainText('Sold on 2038-06-15');
  await expect(card('Net worth at the end')).toContainText('₪1,800,000');
});

test('planner: a withdrawal plan over every start of history, and over simulated worlds', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Planner: home vs market' }).click();
  const planner = page.getByRole('region', { name: 'Planner' });
  await planner.getByRole('tab', { name: 'Market' }).click();
  await planner.getByLabel('Ticker 1').fill('aapl');
  await planner.getByLabel('Convert dollar assets by the USD/ILS rate').uncheck();
  await planner.getByRole('tab', { name: 'Withdraw' }).click();
  const withdraw = planner.getByRole('tabpanel', { name: 'Withdraw' });
  const card = (label: string) =>
    withdraw.locator('dl').getByText(label, { exact: true }).locator('..');

  // Ten years of 6,000 a month from 1,000,000 of AAPL: every start its bars allow.
  await withdraw.getByLabel('Starts on').fill('2010-01-15');
  await withdraw.getByLabel('Amount ₪ a month, net').fill('6000');
  await withdraw.getByRole('button', { name: 'Run history' }).click();
  await expect(
    withdraw.getByRole('heading', { name: 'History: 179 starts, 2002-01-15 to 2016-11-15' }),
  ).toBeVisible();
  await expect(card('Lasts in')).toContainText('of the 179 starts');
  await expect(card('Sustainable amount')).toContainText('₪');
  await expect(
    withdraw.getByRole('img', { name: /^What is left, as a percent of the start/ }),
  ).toBeVisible();
  await expect(
    withdraw.getByRole('img', { name: /^The share of the starts still paying/ }),
  ).toBeVisible();
  await expect(withdraw.getByText(/hold only about 2\.5 separate terms of 10 years/)).toBeVisible();

  // Fifty worlds cut from the same history.
  await withdraw.getByLabel('Worlds', { exact: true }).fill('50');
  await withdraw.getByRole('button', { name: 'Simulate' }).click();
  await expect(
    withdraw.getByRole('heading', { name: 'Simulation: 50 worlds, cut from history' }),
  ).toBeVisible();
  await expect(card('Lasts in')).toContainText('of the 50 worlds');
  // The simulation replaced the history: one study at a time beside the plan.
  await expect(withdraw.getByRole('heading', { name: /^History:/ })).toHaveCount(0);
});
