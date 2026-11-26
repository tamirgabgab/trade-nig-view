import type { ReactNode } from 'react';

import { CsvButton } from './CsvButton.tsx';
import type { CsvCell } from './csv.ts';
import styles from './Planner.module.css';

interface PlannerHeadingProps<T> {
  children: ReactNode;
  /** What the rows are, in the download's name: "exit months". */
  csv: string;
  rows: readonly T[];
  /** The fields of a row that go into the file, which are its headers too. */
  fields: readonly (keyof T & string)[];
}

/** The heading of a results table, with the table itself as a CSV file. */
export function PlannerHeading<T>({ children, csv, rows, fields }: PlannerHeadingProps<T>) {
  return (
    <div className={styles.headingRow}>
      <h2 className={styles.heading}>{children}</h2>
      <CsvButton
        name={csv}
        headers={fields}
        // Every field named is a number, a text or null in the API's rows.
        rows={() => rows.map((row) => fields.map((field) => row[field] as CsvCell))}
      />
    </div>
  );
}
