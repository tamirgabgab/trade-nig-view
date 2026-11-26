import panel from '../components/IndicatorSettingsPanel.module.css';
import { usePlannerStore, type PlannerForm } from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerNumber } from './PlannerNumber.tsx';

const FILL_MODES: { value: PlannerForm['fill']['mode']; label: string }[] = [
  { value: 'close', label: 'Close' },
  { value: 'open', label: 'Open' },
  { value: 'mid', label: 'Mid-range (H + L) / 2' },
  { value: 'linear', label: 'Line from open to close' },
  { value: 'piecewise', label: 'Lines O → L → H → C by the bar’s direction' },
  { value: 'piecewise_random', label: 'Lines through H and L in a random order' },
  { value: 'estimated', label: 'Estimated (random-walk table)' },
];

const TAX_BASES: { value: PlannerForm['taxes']['base']; label: string }[] = [
  { value: 'nominal', label: 'Nominal gain (₪)' },
  { value: 'real', label: 'Real gain (cost indexed by the CPI)' },
  { value: 'currency', label: 'Gain in the asset’s currency (cost indexed by USD/ILS)' },
];

/** Fees, taxes and the fill price inside a bar. */
export function PlannerOptions() {
  const { fees, taxes, fill } = usePlannerStore((s) => s.form);
  const update = usePlannerStore((s) => s.update);
  return (
    <>
      <fieldset className={styles.section}>
        <legend>Fees</legend>
        <div className={styles.grid}>
          <label>
            Deposit fee %
            <PlannerNumber
              label="Deposit fee %"
              value={fees.deposit}
              max={100}
              step={0.05}
              onChange={(deposit) => {
                update({ fees: { ...fees, deposit } });
              }}
            />
          </label>
          <label>
            Buy commission %
            <PlannerNumber
              label="Buy commission %"
              value={fees.buy}
              max={100}
              step={0.05}
              onChange={(buy) => {
                update({ fees: { ...fees, buy } });
              }}
            />
          </label>
          <label>
            Sell commission %
            <PlannerNumber
              label="Sell commission %"
              value={fees.sell}
              max={100}
              step={0.05}
              onChange={(sell) => {
                update({ fees: { ...fees, sell } });
              }}
            />
          </label>
          <label>
            Management fee % a year
            <PlannerNumber
              label="Management fee % a year"
              value={fees.management}
              max={100}
              step={0.05}
              onChange={(management) => {
                update({ fees: { ...fees, management } });
              }}
            />
          </label>
          <label>
            Account fee ₪ a month
            <PlannerNumber
              label="Account fee ₪ a month"
              value={fees.monthly}
              onChange={(monthly) => {
                update({ fees: { ...fees, monthly } });
              }}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className={styles.section}>
        <legend>Taxes</legend>
        <div className={styles.grid}>
          <label>
            Capital gains %
            <PlannerNumber
              label="Capital gains %"
              value={taxes.gains}
              max={100}
              onChange={(gains) => {
                update({ taxes: { ...taxes, gains } });
              }}
            />
          </label>
          <label>
            Dividends %
            <PlannerNumber
              label="Dividends %"
              value={taxes.dividend}
              max={100}
              onChange={(dividend) => {
                update({ taxes: { ...taxes, dividend } });
              }}
            />
          </label>
          <label className={styles.wide}>
            Taxed on
            <select
              className={panel.control}
              value={taxes.base}
              onChange={(event) => {
                const base = TAX_BASES.find((b) => b.value === event.target.value)?.value;
                if (base !== undefined) update({ taxes: { ...taxes, base } });
              }}
            >
              {TAX_BASES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className={styles.section}>
        <legend>Buy price inside the day</legend>
        <div className={styles.grid}>
          <label className={styles.wide}>
            Model
            <select
              className={panel.control}
              value={fill.mode}
              onChange={(event) => {
                const mode = FILL_MODES.find((m) => m.value === event.target.value)?.value;
                if (mode !== undefined) update({ fill: { ...fill, mode } });
              }}
            >
              {FILL_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Table detail
            <select
              className={panel.control}
              value={fill.granularity}
              disabled={fill.mode !== 'estimated'}
              onChange={(event) => {
                const granularity = (['coarse', 'medium', 'fine'] as const).find(
                  (g) => g === event.target.value,
                );
                if (granularity !== undefined) update({ fill: { ...fill, granularity } });
              }}
            >
              <option value="coarse">Coarse (10 × 10)</option>
              <option value="medium">Medium (20 × 20)</option>
              <option value="fine">Fine (40 × 40)</option>
            </select>
          </label>
          <label className={panel.check}>
            <input
              type="checkbox"
              checked={fill.random}
              onChange={(event) => {
                update({ fill: { ...fill, random: event.target.checked } });
              }}
            />
            Draw the time at random
          </label>
        </div>
        <p className={styles.note}>
          Without a time and without a draw, each purchase uses the model’s expected price.
        </p>
      </fieldset>
    </>
  );
}
