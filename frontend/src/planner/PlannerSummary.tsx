import type { MarketSummary } from '../api/planner.ts';
import styles from './Planner.module.css';
import { percent, shekels } from './plannerFormat.ts';

/** The totals of a run: what went in, what it is worth, and what is left after fees and tax. */
export function PlannerSummary({ summary }: { summary: MarketSummary }) {
  const fees = summary.deposit_fees + summary.commissions + summary.account_fees;
  const cards: [string, string, string?][] = [
    ['Deposited', shekels(summary.deposited)],
    ['Value at the end', shekels(summary.value)],
    ['Gross gain', shekels(summary.gross_gain), 'After fees and the sell commission, before tax'],
    ['Capital-gains tax', shekels(summary.tax), `On a gain of ${shekels(summary.taxable_gain)}`],
    ['Net value', shekels(summary.net_value)],
    ['Net gain', shekels(summary.net_gain)],
    ['Yearly return, gross', percent(summary.xirr_gross), 'XIRR: money-weighted, before tax'],
    ['Yearly return, net', percent(summary.xirr_net), 'XIRR after tax'],
    [
      'Yearly return, net, real',
      percent(summary.xirr_net_real),
      `After inflation of ${percent(summary.inflation_yearly)} a year`,
    ],
    ['Net value, real', shekels(summary.net_value_real), 'In shekels of the first deposit’s day'],
    ['Fees paid', shekels(fees), 'Deposit fees, commissions and account fees'],
    ['Dividend tax', shekels(summary.dividend_tax), 'Taken from dividends before reinvesting'],
  ];
  return (
    <dl className={styles.cards}>
      {cards.map(([label, value, note]) => (
        <div key={label} className={styles.card} title={note}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
