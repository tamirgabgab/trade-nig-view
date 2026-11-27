import panel from '../components/IndicatorSettingsPanel.module.css';
import type { WithdrawHome } from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerField } from './PlannerField.tsx';
import { PlannerFold } from './PlannerFold.tsx';
import { shekels } from './plannerFormat.ts';
import { PlannerLearn } from './PlannerLearn.tsx';
import { PlannerSelect } from './PlannerSelect.tsx';

const GROWTH = [
  ['assumed', 'An assumed yearly rate'],
  ['index', 'The dwelling price index (history)'],
] as const;
const USE = [
  ['live', 'Lived in'],
  ['rent_out', 'Rented out'],
] as const;
const ROLE = [
  ['kept', 'Kept (sold only if forced)'],
  ['on_date', 'Sold on a date'],
  ['when_empty', 'Sold when the account runs out'],
] as const;
const BETTERMENT = [
  ['single_home', 'A single home (exempt up to the ceiling)'],
  ['full', '25% of the real gain'],
] as const;

interface PlannerWithdrawHomeProps {
  home: WithdrawHome;
  set: (changes: Partial<WithdrawHome>) => void;
}

const SOLD = {
  kept: 'kept',
  on_date: 'sold on a date',
  when_empty: 'sold when the account runs out',
} as const;

/** The apartment in a few words, for its folded section. */
const summary = (home: WithdrawHome) =>
  home.include
    ? `${shekels(home.value)}, ${home.use === 'live' ? 'lived in' : 'rented out'}, ${SOLD[home.role]}`
    : 'Not included';

/** An apartment owned on the first day of a withdrawal plan: its value, use, costs and sale. */
export function PlannerWithdrawHome({ home, set }: PlannerWithdrawHomeProps) {
  return (
    <PlannerFold title="The apartment" state={summary(home)} initiallyOpen={home.include}>
      <label className={panel.check}>
        <input
          type="checkbox"
          checked={home.include}
          onChange={(event) => {
            set({ include: event.target.checked });
          }}
        />
        Include an apartment I own
      </label>
      {home.include && (
        <>
          <div className={styles.grid}>
            <PlannerField
              label="Value today ₪"
              value={home.value}
              min={100_000}
              step={50_000}
              onChange={(value) => {
                set({ value });
              }}
            />
            <PlannerSelect
              label="It grows by"
              value={home.growth}
              options={GROWTH}
              onChange={(growth) => {
                set({ growth });
              }}
            />
            {home.growth === 'assumed' && (
              <PlannerField
                label="Yearly growth %"
                value={home.growthPct}
                min={-20}
                max={30}
                step={0.5}
                onChange={(growthPct) => {
                  set({ growthPct });
                }}
              />
            )}
            <PlannerSelect
              label="The apartment is"
              value={home.use}
              options={USE}
              onChange={(use) => {
                set({ use });
              }}
            />
            {home.use === 'rent_out' && (
              <>
                <PlannerField
                  label="Rent ₪ a month"
                  value={home.rent}
                  step={100}
                  onChange={(rent) => {
                    set({ rent });
                  }}
                />
                <PlannerField
                  label="Vacancy %"
                  value={home.vacancy}
                  max={100}
                  step={1}
                  onChange={(vacancy) => {
                    set({ vacancy });
                  }}
                />
                <PlannerField
                  label="Rent tax %"
                  value={home.rentTax}
                  max={100}
                  step={1}
                  onChange={(rentTax) => {
                    set({ rentTax });
                  }}
                />
              </>
            )}
            <PlannerField
              label="Maintenance % a year"
              value={home.maintenance}
              max={10}
              step={0.1}
              onChange={(maintenance) => {
                set({ maintenance });
              }}
            />
            <PlannerField
              label="Insurance ₪ a year"
              value={home.insurance}
              step={100}
              onChange={(insurance) => {
                set({ insurance });
              }}
            />
          </div>
          <div className={styles.grid}>
            <PlannerField
              label="Mortgage left ₪"
              value={home.loan}
              step={10_000}
              onChange={(loan) => {
                set({ loan });
              }}
            />
            {home.loan > 0 && (
              <>
                <PlannerField
                  label="Its rate %"
                  value={home.loanRate}
                  max={30}
                  step={0.1}
                  onChange={(loanRate) => {
                    set({ loanRate });
                  }}
                />
                <PlannerField
                  label="Years left"
                  value={home.loanYears}
                  min={1}
                  max={50}
                  step={1}
                  onChange={(loanYears) => {
                    set({ loanYears });
                  }}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={home.loanLinked}
                    onChange={(event) => {
                      set({ loanLinked: event.target.checked });
                    }}
                  />
                  Linked to the CPI
                </label>
              </>
            )}
          </div>
          <div className={styles.grid}>
            <PlannerSelect
              className={styles.wide}
              label="Its sale"
              value={home.role}
              options={ROLE}
              onChange={(role) => {
                set({ role });
              }}
            />
            {home.role === 'on_date' && (
              <PlannerField
                label="Sold after, years"
                value={home.sellAfter}
                min={1}
                max={100}
                step={1}
                onChange={(sellAfter) => {
                  set({ sellAfter });
                }}
              />
            )}
            <PlannerField
              label="Selling costs %"
              value={home.selling}
              max={20}
              step={0.1}
              onChange={(selling) => {
                set({ selling });
              }}
            />
            {home.loan > 0 && (
              <PlannerField
                label="Early repayment %"
                value={home.earlyRepayment}
                max={20}
                step={0.1}
                onChange={(earlyRepayment) => {
                  set({ earlyRepayment });
                }}
              />
            )}
            <PlannerSelect
              className={styles.wide}
              label="Betterment tax"
              value={home.betterment}
              options={BETTERMENT}
              onChange={(betterment) => {
                set({ betterment });
              }}
            />
            <PlannerField
              label="Cost ₪ (optional)"
              value={home.cost}
              step={10_000}
              onChange={(cost) => {
                set({ cost });
              }}
            />
            <label>
              Bought on (optional)
              <input
                className={panel.control}
                type="date"
                value={home.bought}
                onChange={(event) => {
                  set({ bought: event.target.value });
                }}
              />
            </label>
          </div>
          <p className={styles.note}>
            Only cash counts here: a rent received, less its vacancy and tax, pays part of the
            withdrawal; the mortgage and the owner costs are paid from the account first. Living in
            it gives no cash. A sale puts what it leaves (after its costs, the loan and the
            betterment tax) into the account. Kept or not, it is sold in the month the account can
            no longer pay its costs (under a percent rule that is also when it runs out, so the two
            roles are one). Without its cost and purchase day, only the growth from the first day is
            taxed.
          </p>
          <PlannerLearn page="rent-or-buy">Rent or buy: the apartment’s ledger</PlannerLearn>
        </>
      )}
    </PlannerFold>
  );
}
