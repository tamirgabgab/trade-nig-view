import panel from '../components/IndicatorSettingsPanel.module.css';
import { DWELLING_SERIES, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import styles from './Planner.module.css';
import { PlannerField } from './PlannerField.tsx';
import { percent, shekels } from './plannerFormat.ts';
import { PlannerSelect } from './PlannerSelect.tsx';

const VALUE_MODES = [
  ['assumed', 'Assumed growth'],
  ['historical', 'Dwelling price index (CBS)'],
] as const;

/** The purchase, the sale, and how the apartment's value moves between them. */
export function PlannerHomeBasics() {
  const { price, equity, start, end, value } = usePlannerHomeStore((s) => s.home);
  const update = usePlannerHomeStore((s) => s.update);
  const assumed = value.mode === 'assumed';
  const loan = price - equity;
  return (
    <fieldset className={styles.section}>
      <legend>Apartment</legend>
      <div className={styles.grid}>
        <PlannerField
          label="Price ₪"
          value={price}
          min={1}
          step={10_000}
          onChange={(next) => {
            update({ price: next });
          }}
        />
        <PlannerField
          label="Equity ₪"
          value={equity}
          step={10_000}
          onChange={(next) => {
            update({ equity: next });
          }}
        />
        <label>
          Bought on
          <input
            className={panel.control}
            type="date"
            value={start}
            onChange={(event) => {
              update({ start: event.target.value });
            }}
          />
        </label>
        <label>
          Sold on
          <input
            className={panel.control}
            type="date"
            value={end}
            onChange={(event) => {
              update({ end: event.target.value });
            }}
          />
        </label>
        <PlannerSelect
          label="Value path"
          value={value.mode}
          options={VALUE_MODES}
          onChange={(mode) => {
            update({ value: { ...value, mode } });
          }}
        />
        <PlannerSelect
          label="Region of the index"
          value={value.series}
          options={DWELLING_SERIES}
          disabled={assumed}
          onChange={(series) => {
            update({ value: { ...value, series } });
          }}
        />
        <PlannerField
          label="Growth % a year"
          value={value.mean}
          min={-20}
          max={50}
          step={0.1}
          disabled={!assumed}
          onChange={(mean) => {
            update({ value: { ...value, mean } });
          }}
        />
        <PlannerField
          label="Growth standard deviation %"
          value={value.sd}
          max={100}
          step={0.5}
          disabled={!assumed}
          onChange={(sd) => {
            update({ value: { ...value, sd } });
          }}
        />
        <label className={panel.check}>
          <input
            type="checkbox"
            checked={value.random}
            disabled={!assumed}
            onChange={(event) => {
              update({ value: { ...value, random: event.target.checked } });
            }}
          />
          Draw a value path
        </label>
      </div>
      <p className={styles.note}>
        {loan >= 0
          ? `The loan: ${shekels(loan)} (${percent(loan / price)} of the price). `
          : 'The equity is more than the price. '}
        The sale is on the last whole month from the purchase before “Sold on”.
      </p>
    </fieldset>
  );
}
