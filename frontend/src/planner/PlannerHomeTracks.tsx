import { Plus, X } from 'lucide-react';

import panel from '../components/IndicatorSettingsPanel.module.css';
import {
  newTrack,
  TRACK_RATE,
  usePlannerHomeStore,
  type HomeTrack,
} from '../store/plannerHomeStore.ts';
import styles from './Planner.module.css';
import { PlannerField } from './PlannerField.tsx';
import { PlannerSelect } from './PlannerSelect.tsx';

const TYPES = [
  ['fixed', 'Fixed rate, unlinked'],
  ['fixed_linked', 'Fixed rate, CPI-linked'],
  ['prime', 'Prime'],
  ['variable', 'Variable rate, unlinked'],
  ['variable_linked', 'Variable rate, CPI-linked'],
] as const;

const REPAYMENTS = [
  ['spitzer', 'Spitzer (equal payments)'],
  ['equal_principal', 'Equal principal'],
  ['grace', 'Grace, then Spitzer'],
  ['balloon', 'Balloon (all at the end)'],
] as const;

const RATE_MODES = [
  ['assumed', 'Assumed'],
  ['historical', 'Actual (Bank of Israel)'],
] as const;

/** What a track's rate field holds, by its type. */
function rateLabel(type: HomeTrack['type']): string {
  if (type === 'prime') return 'Spread on prime %';
  return type.startsWith('variable') ? 'First rate %' : 'Rate %';
}

/** Up to three mortgage tracks, and the Bank of Israel rate prime and variable tracks follow. */
export function PlannerHomeTracks() {
  const tracks = usePlannerHomeStore((s) => s.home.tracks);
  const rates = usePlannerHomeStore((s) => s.home.rates);
  const update = usePlannerHomeStore((s) => s.update);
  const change = (index: number, changes: Partial<HomeTrack>) => {
    update({ tracks: tracks.map((t, i) => (i === index ? { ...t, ...changes } : t)) });
  };
  const assumed = rates.mode === 'assumed';
  return (
    <fieldset className={styles.section}>
      <legend>Mortgage</legend>
      {tracks.map((track, index) => {
        const name = `Track ${String(index + 1)}`;
        const variable = track.type.startsWith('variable');
        return (
          <fieldset key={index} className={styles.track}>
            <legend>
              {name}
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove track ${String(index + 1)}`}
                onClick={() => {
                  update({ tracks: tracks.filter((_, i) => i !== index) });
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </legend>
            <div className={styles.grid}>
              <PlannerSelect
                label={`${name} type`}
                text="Type"
                className={styles.wide}
                value={track.type}
                options={TYPES}
                onChange={(type) => {
                  // The field means something else for each type: never carry a rate over.
                  change(index, { type, rate: TRACK_RATE[type] });
                }}
              />
              <PlannerField
                label={`${name} share`}
                text="Share of the loan"
                value={track.share}
                min={0.01}
                max={100_000}
                onChange={(share) => {
                  change(index, { share });
                }}
              />
              <PlannerField
                label={`${name} years`}
                text="Years"
                value={track.years}
                min={1}
                max={40}
                onChange={(years) => {
                  change(index, { years });
                }}
              />
              <PlannerField
                label={`${name} ${rateLabel(track.type).toLowerCase()}`}
                text={rateLabel(track.type)}
                value={track.rate}
                min={-5}
                max={30}
                step={0.05}
                onChange={(rate) => {
                  change(index, { rate });
                }}
              />
              <PlannerField
                label={`${name} rate resets every (years)`}
                text="Rate resets every (years)"
                value={track.resetYears}
                min={1}
                max={10}
                disabled={!variable}
                onChange={(resetYears) => {
                  change(index, { resetYears });
                }}
              />
              <PlannerSelect
                label={`${name} repayment`}
                text="Repayment"
                value={track.repayment}
                options={REPAYMENTS}
                onChange={(repayment) => {
                  change(index, { repayment });
                }}
              />
              <PlannerField
                label={`${name} grace months`}
                text="Grace months"
                value={track.graceMonths}
                max={479}
                disabled={track.repayment !== 'grace'}
                onChange={(graceMonths) => {
                  change(index, { graceMonths });
                }}
              />
              <label className={`${panel.check} ${styles.wide}`}>
                <input
                  type="checkbox"
                  aria-label={`${name}: the interest accrues until the principal is paid`}
                  checked={track.graceFull}
                  disabled={track.repayment !== 'grace' && track.repayment !== 'balloon'}
                  onChange={(event) => {
                    change(index, { graceFull: event.target.checked });
                  }}
                />
                The interest accrues, unpaid (full grace)
              </label>
            </div>
          </fieldset>
        );
      })}
      <button
        type="button"
        className={panel.secondary}
        disabled={tracks.length >= 3}
        onClick={() => {
          update({ tracks: [...tracks, newTrack('fixed', 33)] });
        }}
      >
        <Plus size={14} aria-hidden="true" />
        Add track
      </button>
      <div className={styles.grid}>
        <PlannerSelect
          label="Bank of Israel rate"
          value={rates.mode}
          options={RATE_MODES}
          onChange={(mode) => {
            update({ rates: { ...rates, mode } });
          }}
        />
        <PlannerField
          label="Assumed rate %"
          value={rates.base}
          max={100}
          step={0.25}
          disabled={!assumed}
          onChange={(base) => {
            update({ rates: { ...rates, base } });
          }}
        />
        <PlannerField
          label="Rate shock %"
          value={rates.shock}
          min={-10}
          max={20}
          step={0.25}
          disabled={!assumed}
          onChange={(shock) => {
            update({ rates: { ...rates, shock } });
          }}
        />
        <PlannerField
          label="Shock after (months)"
          value={rates.shockAfterMonths}
          max={480}
          disabled={!assumed}
          onChange={(shockAfterMonths) => {
            update({ rates: { ...rates, shockAfterMonths } });
          }}
        />
      </div>
      <p className={styles.note}>
        Prime is the Bank of Israel rate + 1.5%. A variable track keeps its rate until a reset, then
        moves by the change in the Bank of Israel rate since the last one. A shock moves the assumed
        rate once, to test the payments.
      </p>
    </fieldset>
  );
}
