import panel from '../components/IndicatorSettingsPanel.module.css';
import { toCsv, type CsvCell } from './csv.ts';

interface CsvButtonProps {
  /** What the rows are, in the button's name and the file's: "exit months". */
  name: string;
  headers: readonly string[];
  /** Built on the click, so a table that is never downloaded costs nothing. */
  rows: () => readonly (readonly CsvCell[])[];
}

/** Saves a table of the results as `<name>.csv`. */
export function CsvButton({ name, headers, rows }: CsvButtonProps) {
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([toCsv(headers, rows())], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      type="button"
      className={panel.secondary}
      aria-label={`Download ${name} as CSV`}
      onClick={download}
    >
      CSV
    </button>
  );
}
