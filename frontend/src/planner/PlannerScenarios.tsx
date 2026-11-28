import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { deleteScenario, fetchScenario, fetchScenarios, saveScenario } from '../api/scenarios.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import styles from './Planner.module.css';
import { applyScenario, captureScenario, parseScenarioState } from './scenarioState.ts';
import { useHomeTaxes } from './useHomeTaxes.ts';

const KEY = ['planner', 'scenarios'];

/**
 * The comparisons kept under a name by the backend (in its database, not in this browser):
 * both options, what each contains and the Compare tab's settings.
 */
export function PlannerScenarios({ onLoaded }: { onLoaded?: () => void } = {}) {
  const client = useQueryClient();
  const { presets } = useHomeTaxes();
  const list = useQuery({ queryKey: KEY, queryFn: fetchScenarios });
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saved = list.data ?? [];
  const typed = name.trim();
  const existing = saved.find((s) => s.name === typed);
  const picked = saved.find((s) => s.name === chosen);
  const act = (work: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setDone('');
    setConfirming(false);
    work()
      .then(setDone)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The request failed');
        // A save on top of a stale revision fails: the next try starts from the list as it is.
        void client.invalidateQueries({ queryKey: KEY });
      })
      .finally(() => {
        setBusy(false);
      });
  };
  // The tax tables go into the scenario and the list gives the revision: it waits for both.
  const canSave = !busy && typed !== '' && presets !== undefined && list.isSuccess;
  const save = () => {
    // The name is the scenario's address: the backend takes no "/" and no name of dots only.
    if (typed.includes('/') || /^\.+$/.test(typed)) {
      setError('Use a name without "/" that is not only dots.');
      return;
    }
    act(async () => {
      await saveScenario(typed, existing?.revision ?? 0, captureScenario(presets));
      await client.invalidateQueries({ queryKey: KEY });
      setChosen(typed);
      return `Saved “${typed}”`;
    });
  };
  const load = () => {
    act(async () => {
      applyScenario(parseScenarioState((await fetchScenario(chosen)).state));
      setName(chosen);
      onLoaded?.();
      return `Loaded “${chosen}”`;
    });
  };
  const remove = () => {
    if (picked === undefined) return;
    act(async () => {
      await deleteScenario(picked.name, picked.revision);
      await client.invalidateQueries({ queryKey: KEY });
      setChosen('');
      return `Deleted “${picked.name}”`;
    });
  };

  return (
    <fieldset className={styles.section}>
      <legend>Saved scenarios</legend>
      <div className={styles.grid}>
        <label>
          Scenario name
          <input
            className={panel.control}
            type="text"
            maxLength={60}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            onKeyDown={(event) => {
              // Enter in a form's text field submits the form: here it saves, not compares.
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (canSave) save();
            }}
          />
        </label>
        <button
          type="button"
          className={`${panel.secondary ?? ''} ${styles.beside ?? ''}`}
          disabled={!canSave}
          onClick={save}
        >
          {existing ? `Replace “${typed}”` : 'Save scenario'}
        </button>
        {saved.length > 0 && (
          <>
            <label className={styles.wide}>
              Saved scenario
              <select
                className={panel.control}
                value={chosen}
                onChange={(event) => {
                  setChosen(event.target.value);
                  setConfirming(false);
                }}
              >
                <option value="">Choose…</option>
                {saved.map((scenario) => (
                  <option key={scenario.name} value={scenario.name}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={`${styles.buttons ?? ''} ${styles.wide ?? ''}`}>
              {confirming && picked ? (
                <>
                  <button type="button" className={panel.secondary} onClick={remove}>
                    Delete “{picked.name}”
                  </button>
                  <button
                    type="button"
                    className={panel.secondary}
                    onClick={() => {
                      setConfirming(false);
                    }}
                  >
                    Keep it
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={panel.secondary}
                    disabled={busy || picked === undefined}
                    onClick={load}
                  >
                    Load scenario
                  </button>
                  <button
                    type="button"
                    className={panel.secondary}
                    disabled={busy || picked === undefined}
                    onClick={() => {
                      setConfirming(true);
                    }}
                  >
                    Delete scenario
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {list.isSuccess && saved.length === 0 && (
        <p className={styles.note}>No saved scenario yet.</p>
      )}
      {list.isError && (
        <p className={styles.error} role="alert">
          The saved scenarios could not be read. Check that the backend is running.
        </p>
      )}
      <p className={styles.note} role="status">
        {done}
      </p>
      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.note}>
        A scenario holds both options, what each contains and this tab’s settings. Loading one
        replaces what the three tabs hold now.
      </p>
    </fieldset>
  );
}
