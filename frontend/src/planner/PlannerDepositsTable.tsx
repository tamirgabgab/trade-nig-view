import type { DepositRow } from '../api/planner.ts';
import styles from './Planner.module.css';
import { price, shekels } from './plannerFormat.ts';

/** One row per deposit: what it bought and at what price, and what it is worth at the end. */
export function PlannerDepositsTable({ deposits }: { deposits: DepositRow[] }) {
  return (
    <table className={styles.table} aria-label="Deposits">
      <thead>
        <tr>
          <th>Date</th>
          <th>Deposit</th>
          <th>Bought (price × USD/ILS)</th>
          <th>Value at the end</th>
          <th>Gross gain</th>
          <th>Tax</th>
          <th>Net gain</th>
        </tr>
      </thead>
      <tbody>
        {deposits.map((row, index) => (
          <tr key={index}>
            <td>{row.date}</td>
            <td>{shekels(row.amount)}</td>
            <td>
              {row.lots
                .map(
                  (lot) =>
                    `${lot.symbol} ${price(lot.price)}${lot.fx === 1 ? '' : ` × ${price(lot.fx)}`}`,
                )
                .join('; ')}
            </td>
            <td>{shekels(row.value)}</td>
            <td className={row.gross_gain < 0 ? styles.bad : undefined}>
              {shekels(row.gross_gain)}
            </td>
            <td>{shekels(row.tax)}</td>
            <td className={row.net_gain < 0 ? styles.bad : undefined}>{shekels(row.net_gain)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
