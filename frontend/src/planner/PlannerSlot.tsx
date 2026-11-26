import { useEffect, useId, useRef } from 'react';

import panel from '../components/IndicatorSettingsPanel.module.css';
import { homesOf, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { formsOf, SLOTS, usePlannerStore, type Slot } from '../store/plannerStore.ts';
import styles from './Planner.module.css';

/** Whether option B's forms differ from option A's: making the two the same would lose them. */
function differ(): boolean {
  const forms = formsOf(usePlannerStore.getState());
  const homes = homesOf(usePlannerHomeStore.getState());
  return JSON.stringify([forms.a, homes.a]) !== JSON.stringify([forms.b, homes.b]);
}

/**
 * Whether the planner's two options share one set of forms, and when they do not, which of
 * them the Market and the Apartment tabs show (one switch for both tabs).
 */
export function PlannerSlot() {
  const same = usePlannerStore((s) => s.same);
  const slot = usePlannerStore((s) => s.slot);
  const confirming = usePlannerStore((s) => s.joining);
  const box = useRef<HTMLInputElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  // The safe answer takes the focus, so the question is heard and Enter keeps both options.
  useEffect(() => {
    if (confirming) keep.current?.focus();
  }, [confirming]);
  const setConfirming = (joining: boolean) => {
    usePlannerStore.setState({ joining });
    // Answered: the keyboard goes back to the box the question came from.
    if (!joining) box.current?.focus();
  };
  const group = useId();
  const market = usePlannerStore.getState();
  const home = usePlannerHomeStore.getState();
  const choose = (next: Slot) => {
    market.swap(next);
    home.swap(next);
  };
  // The same: option A on screen, and option B read from A's forms from here on.
  const join = () => {
    choose('a');
    market.setSame(true);
    setConfirming(false);
  };
  // Apart: option B starts as a copy of option A as it is now.
  const part = () => {
    market.copyToOther();
    home.copyToOther();
    market.setSame(false);
  };
  return (
    <div className={styles.slot}>
      <label>
        <input
          ref={box}
          type="checkbox"
          checked={same}
          onChange={(event) => {
            // Forms of option B that differ from A's would be lost: that is asked first.
            if (!event.target.checked) part();
            else if (differ()) setConfirming(true);
            else join();
          }}
        />
        Option B is the same as option A
      </label>
      <div className={styles.segments} role="radiogroup" aria-label="Option being edited">
        {SLOTS.map((each) => (
          <label key={each}>
            <input
              type="radio"
              name={group}
              checked={slot === each}
              disabled={same}
              onChange={() => {
                choose(each);
              }}
            />
            Option {each.toUpperCase()}
          </label>
        ))}
      </div>
      {confirming && (
        <div
          className={styles.buttons}
          role="alertdialog"
          aria-label="Option B’s forms differ from option A’s. Replace option B with option A?"
        >
          <button type="button" className={panel.secondary} onClick={join}>
            Replace option B with option A
          </button>
          <button
            type="button"
            className={panel.secondary}
            ref={keep}
            onClick={() => {
              setConfirming(false);
            }}
          >
            Keep both options
          </button>
        </div>
      )}
      <p className={styles.note}>
        {same
          ? 'The Compare tab makes both options from these forms: an apartment against the same money in this mix. Untick the box to give option B forms of its own.'
          : 'The Market and the Apartment tabs show this option. Option B started as a copy of option A; ticking the box makes it a copy of option A again.'}
      </p>
    </div>
  );
}
