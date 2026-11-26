import { Plus, X } from 'lucide-react';

import panel from '../components/IndicatorSettingsPanel.module.css';
import {
  usePlannerStore,
  type PlannerDeposit,
  type PlannerRecurring,
} from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerNumber } from './PlannerNumber.tsx';

const NEW_DEPOSIT: PlannerDeposit = { date: '', amount: 10_000, time: '' };
const NEW_RECURRING: PlannerRecurring = {
  start: '',
  amount: 1000,
  everyMonths: 1,
  count: 12,
  indexed: false,
};

/** One-off deposits, recurring deposits and the day everything is sold. */
export function PlannerDeposits() {
  const { deposits, recurring, end } = usePlannerStore((s) => s.form);
  const update = usePlannerStore((s) => s.update);
  const changeDeposit = (index: number, changes: Partial<PlannerDeposit>) => {
    update({ deposits: deposits.map((d, i) => (i === index ? { ...d, ...changes } : d)) });
  };
  const changeRecurring = (index: number, changes: Partial<PlannerRecurring>) => {
    update({ recurring: recurring.map((r, i) => (i === index ? { ...r, ...changes } : r)) });
  };
  return (
    <fieldset className={styles.section}>
      <legend>Deposits (₪)</legend>
      <table className={`${styles.rows} ${styles.deposits}`}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Amount</th>
            <th title="Israel time of the purchase, if known; else the fill model decides">Time</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {deposits.map((deposit, index) => (
            <tr key={index}>
              <td>
                <input
                  className={panel.control}
                  type="date"
                  aria-label={`Deposit date ${String(index + 1)}`}
                  value={deposit.date}
                  onChange={(event) => {
                    changeDeposit(index, { date: event.target.value });
                  }}
                />
              </td>
              <td>
                <PlannerNumber
                  label={`Deposit amount ${String(index + 1)}`}
                  value={deposit.amount}
                  min={1}
                  step={100}
                  onChange={(amount) => {
                    changeDeposit(index, { amount });
                  }}
                />
              </td>
              <td>
                <input
                  className={panel.control}
                  type="time"
                  aria-label={`Deposit time ${String(index + 1)}`}
                  value={deposit.time}
                  onChange={(event) => {
                    changeDeposit(index, { time: event.target.value });
                  }}
                />
              </td>
              <td>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove deposit ${String(index + 1)}`}
                  onClick={() => {
                    update({ deposits: deposits.filter((_, i) => i !== index) });
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className={panel.secondary}
        onClick={() => {
          update({ deposits: [...deposits, NEW_DEPOSIT] });
        }}
      >
        <Plus size={14} aria-hidden="true" />
        Add deposit
      </button>
      <table className={`${styles.rows} ${styles.recurring}`}>
        <thead>
          <tr>
            <th>Recurring from</th>
            <th>Amount</th>
            <th title="Months between deposits">Every</th>
            <th title="Number of deposits">Times</th>
            <th title="Raise the amount once a year with the CPI">CPI</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {recurring.map((plan, index) => (
            <tr key={index}>
              <td>
                <input
                  className={panel.control}
                  type="date"
                  aria-label={`Recurring start ${String(index + 1)}`}
                  value={plan.start}
                  onChange={(event) => {
                    changeRecurring(index, { start: event.target.value });
                  }}
                />
              </td>
              <td>
                <PlannerNumber
                  label={`Recurring amount ${String(index + 1)}`}
                  value={plan.amount}
                  min={1}
                  step={100}
                  onChange={(amount) => {
                    changeRecurring(index, { amount });
                  }}
                />
              </td>
              <td>
                <PlannerNumber
                  label={`Months between deposits ${String(index + 1)}`}
                  value={plan.everyMonths}
                  min={1}
                  max={12}
                  onChange={(everyMonths) => {
                    changeRecurring(index, { everyMonths: Math.round(everyMonths) });
                  }}
                />
              </td>
              <td>
                <PlannerNumber
                  label={`Number of deposits ${String(index + 1)}`}
                  value={plan.count}
                  min={1}
                  max={1200}
                  onChange={(count) => {
                    changeRecurring(index, { count: Math.round(count) });
                  }}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Index to the CPI ${String(index + 1)}`}
                  checked={plan.indexed}
                  onChange={(event) => {
                    changeRecurring(index, { indexed: event.target.checked });
                  }}
                />
              </td>
              <td>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove recurring deposit ${String(index + 1)}`}
                  onClick={() => {
                    update({ recurring: recurring.filter((_, i) => i !== index) });
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className={panel.secondary}
        onClick={() => {
          update({ recurring: [...recurring, NEW_RECURRING] });
        }}
      >
        <Plus size={14} aria-hidden="true" />
        Add recurring deposit
      </button>
      <label className={styles.inline}>
        Sell everything on
        <input
          className={panel.control}
          type="date"
          value={end}
          onChange={(event) => {
            update({ end: event.target.value });
          }}
        />
      </label>
    </fieldset>
  );
}
