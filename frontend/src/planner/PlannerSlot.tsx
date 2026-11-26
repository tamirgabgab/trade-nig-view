import { useId } from 'react';

import { usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { usePlannerStore, type Slot } from '../store/plannerStore.ts';
import styles from './Planner.module.css';

const SLOTS: readonly Slot[] = ['a', 'b'];

/**
 * Whether the planner's two options share one set of forms, and when they do not, which of
 * them the Market and the Apartment tabs show (one switch for both tabs).
 */
export function PlannerSlot() {
  const same = usePlannerStore((s) => s.same);
  const slot = usePlannerStore((s) => s.slot);
  const group = useId();
  const market = usePlannerStore.getState();
  const home = usePlannerHomeStore.getState();
  const choose = (next: Slot) => {
    market.swap(next);
    home.swap(next);
  };
  const setSame = (next: boolean) => {
    // Option A is on screen while the two are the same; apart, B starts as a copy of it.
    if (next) choose('a');
    else {
      market.copyToOther();
      home.copyToOther();
    }
    market.setSame(next);
  };
  return (
    <div className={styles.slot}>
      <label>
        <input
          type="checkbox"
          checked={same}
          onChange={(event) => {
            setSame(event.target.checked);
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
      <p className={styles.note}>
        {same
          ? 'The Compare tab makes both options from these forms: an apartment against the same money in this mix. Untick the box to give option B forms of its own.'
          : 'The Market and the Apartment tabs show this option. Option B started as a copy of option A; ticking the box sets its forms aside, and unticking it again replaces them by a new copy.'}
      </p>
    </div>
  );
}
