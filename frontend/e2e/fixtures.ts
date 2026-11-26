import type { Page } from '@playwright/test';
/**
 * Reads the synthetic e2e fixtures (e2e/data) so the tests check the legend against the source
 * CSV rather than against hard-coded numbers (the golden model of the smoke test).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');

export interface DailyRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

export function dailyRows(file: string): DailyRow[] {
  const lines = readFileSync(join(DATA, 'daily', file), 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1);
  return lines.map((line) => {
    const [date = '', open, high, low, close, adjClose, volume] = line.split(',');
    return {
      date,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      adjClose: Number(adjClose),
      volume: Number(volume),
    };
  });
}

/** One price column of an intraday fixture (`folder` is its base interval, e.g. '5m'), oldest
 *  first. */
export function intradayColumn(folder: string, file: string, column: 'open' | 'close'): number[] {
  const lines = readFileSync(join(DATA, folder, file), 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1);
  const index = column === 'open' ? 1 : 4;
  return lines.map((line) => Number(line.split(',')[index]));
}

/** Dividend-adjusted OHLC of a row (the default ADJ mode): every price times adj_close / close. */
export function adjusted(row: DailyRow): Pick<DailyRow, 'open' | 'high' | 'low' | 'close'> {
  const k = row.adjClose / row.close;
  return { open: row.open * k, high: row.high * k, low: row.low * k, close: row.adjClose };
}

/** The legend's price format: fixed decimals with thousands separators. */
export function price(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** The value, or a test failure when it is missing (instead of a non-null assertion). */
export function present<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture has no ${what}`);
  return value;
}

/**
 * A clean start for every test: no saved layouts or watchlists on the (shared) e2e backend and
 * nothing in localStorage, so no test opens on another test's chart.
 */
export async function freshStart(page: Page): Promise<void> {
  for (const kind of ['layouts', 'watchlists'] as const) {
    const response = await page.request.get(`/api/${kind}`);
    const docs = ((await response.json()) as Record<string, { name: string; revision: number }[]>)[
      kind
    ];
    for (const doc of docs ?? []) {
      if (doc.revision > 0) {
        await page.request.delete(
          `/api/${kind}/${encodeURIComponent(doc.name)}?revision=${String(doc.revision)}`,
        );
      }
    }
  }
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
}
