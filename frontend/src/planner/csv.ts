export type CsvCell = string | number | null;

/** The byte-order mark: with it Excel reads the file as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** A text cell: never the start of a formula, and quoted when it would break the row. */
function text(value: string): string {
  // A spreadsheet runs a cell that starts with one of these; an apostrophe makes it text.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * Rows as a CSV file Excel opens as it is: UTF-8 with a byte-order mark, CRLF line ends, the
 * numbers raw (no thousands separators, no symbols) and the dates as they come (ISO).
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const line = (cells: readonly CsvCell[]) =>
    cells
      .map((cell) => (cell === null ? '' : typeof cell === 'number' ? String(cell) : text(cell)))
      .join(',');
  return `${BOM}${[headers, ...rows].map((row) => `${line(row)}\r\n`).join('')}`;
}
