import styles from './Planner.module.css';

/** A column: its header and the text of a row's cell. */
export type PlannerColumn<T> = [header: string, cell: (row: T, index: number) => string];

interface PlannerTableProps<T> {
  label: string;
  columns: PlannerColumn<T>[];
  rows: T[];
}

/** A read-only results table. */
export function PlannerTable<T>({ label, columns, rows }: PlannerTableProps<T>) {
  return (
    // The frame scrolls sideways when the table is wider than its column.
    <div className={styles.tableFrame}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            {columns.map(([header]) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map(([header, cell]) => (
                <td key={header}>{cell(row, index)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
