import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { SCENARIOS, type Scenario } from '../api/lab.ts';
import {
  deleteSynthetic,
  describeReferences,
  DWELLING_SERIES,
  getReferences,
  MAX_BARS,
  MIN_BARS,
  saveSynthetic,
  SYNTHETIC_PREFIX,
  type Currency,
  type DwellingDefinition,
  type DwellingSeries,
  type ScenarioDefinition,
  type SyntheticDefinition,
  type SyntheticSymbol,
} from '../api/synthetic.ts';
import { DEFAULT_SYMBOL, useChartStore } from '../store/chartStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import confirm from './ConfirmDialog.module.css';
import panel from './IndicatorSettingsPanel.module.css';
import { LearnPage } from './LearnPage.tsx';
import {
  barsInRange,
  definitionProblem,
  FIRST_DAY,
  firstDateEndingBefore,
  lastDate,
  MAX_LAG,
  MAX_NOISE_PCT,
} from './syntheticChecks.ts';
import styles from './SyntheticSymbolDialog.module.css';

const DEFAULT_BARS = 2500;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type Common = Pick<SyntheticDefinition, 'name' | 'fullName' | 'seed' | 'firstPrice'>;

function blankScenario(common: Common): ScenarioDefinition {
  return {
    ...common,
    kind: 'scenario',
    scenario: 'random_walk',
    firstDate: firstDateEndingBefore(today(), DEFAULT_BARS),
    bars: DEFAULT_BARS,
    currency: 'ILS',
  };
}

function blankDwelling(common: Common): DwellingDefinition {
  return {
    ...common,
    kind: 'dwelling',
    series: 'dwelling',
    noisePct: 0.2,
    causal: false,
    lagMonths: 2,
  };
}

function common(def: SyntheticDefinition): Common {
  return { name: def.name, fullName: def.fullName, seed: def.seed, firstPrice: def.firstPrice };
}

interface FormProps {
  /** The stored symbol being edited, or null to create one. */
  stored: SyntheticSymbol | null;
  /** Open on the delete confirmation (the watchlist's "Delete…"). */
  deleteFirst: boolean;
  onClose: () => void;
}

/** The definition's fields, and for a stored symbol Save as copy and Delete (with what points at
 *  it). */
export function SyntheticForm({ stored, deleteFirst, onClose }: FormProps) {
  const client = useQueryClient();
  const setSymbol = useChartStore((s) => s.setSymbol);
  const chartSymbol = useChartStore((s) => s.symbol);
  // One draft per kind, so switching the kind keeps what was typed in the other.
  const [kind, setKind] = useState<SyntheticDefinition['kind']>(
    stored?.definition.kind ?? 'scenario',
  );
  const [scenarioDraft, setScenarioDraft] = useState<ScenarioDefinition>(() => {
    const start: Common = stored
      ? common(stored.definition)
      : { name: '', fullName: '', seed: Math.floor(Math.random() * 1_000_000), firstPrice: 100 };
    return stored?.definition.kind === 'scenario' ? stored.definition : blankScenario(start);
  });
  const [dwellingDraft, setDwellingDraft] = useState<DwellingDefinition>(() =>
    stored?.definition.kind === 'dwelling'
      ? stored.definition
      : blankDwelling(common(stored?.definition ?? scenarioDraft)),
  );
  const def: SyntheticDefinition = kind === 'dwelling' ? dwellingDraft : scenarioDraft;
  // The learn page, read inside the dialog (a modal covers the learn drawer); the form stays.
  const [learning, setLearning] = useState(false);
  // A new one (or a copy) is named by the user; an edit keeps its name.
  const [copying, setCopying] = useState(false);
  const editing = stored !== null && !copying;
  const [dateTouched, setDateTouched] = useState(stored !== null);
  // What points at the stored symbol: null while asked, then the text, or why it is not known.
  const [refs, setRefs] = useState<{ text: string } | { error: string } | null>(null);
  const [deleting, setDeleting] = useState(deleteFirst);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stored === null) return;
    let live = true;
    getReferences(stored.symbol)
      .then((r) => {
        if (live) setRefs({ text: describeReferences(r) });
      })
      .catch((e: unknown) => {
        if (live) setRefs({ error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      live = false;
    };
  }, [stored]);

  // Name, full name, seed and first price are shared by both drafts.
  const setCommon = (change: Partial<Common>) => {
    setScenarioDraft((d) => ({ ...d, ...change }));
    setDwellingDraft((d) => ({ ...d, ...change }));
    setError(null);
  };
  const setScenario = (change: Partial<ScenarioDefinition>) => {
    setScenarioDraft((d) => {
      const next = { ...d, ...change };
      // Until a first date is picked, the series keeps ending on the last weekday before today
      // (for a length in range only: the count walks day by day).
      return change.bars !== undefined && !dateTouched && barsInRange(next.bars)
        ? { ...next, firstDate: firstDateEndingBefore(today(), next.bars) }
        : next;
    });
    setError(null);
  };
  const setDwelling = (change: Partial<DwellingDefinition>) => {
    setDwellingDraft((d) => ({ ...d, ...change }));
    setError(null);
  };

  const save = async () => {
    const problem = definitionProblem(def, today());
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const saved = await saveSynthetic(def, editing ? stored.revision : 0);
      // The symbol list first: the chart drops a symbol it does not list.
      await client.invalidateQueries({ queryKey: ['symbols'] });
      // Its bars, quotes and indicators are cached under many keys: refetch them all.
      void client.invalidateQueries();
      if (!editing) setSymbol(saved.symbol);
      useUiStore.getState().showToast(`${editing ? 'Saved' : 'Created'} ${saved.symbol}`);
      onClose();
    } catch (e: unknown) {
      setError(
        e instanceof Error && 'code' in e && e.code === 'revision_conflict' && !editing
          ? `${SYNTHETIC_PREFIX}${def.name} exists already: choose another name.`
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (stored === null) return;
    setBusy(true);
    try {
      await deleteSynthetic(stored.symbol, stored.revision);
      // The chart moves to the default symbol, as a saved layout on the deleted one opens.
      if (chartSymbol === stored.symbol) setSymbol(DEFAULT_SYMBOL);
      useChartStore.getState().removeCompare(stored.symbol);
      // The watchlists lost it (new revisions), its drawings are gone: refetch everything.
      void client.invalidateQueries();
      useUiStore.getState().showToast(`Deleted ${stored.symbol}`);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (deleting && stored !== null) {
    return (
      <div className={styles.form}>
        <p className={confirm.message}>
          Delete {stored.symbol}?{' '}
          {refs === null
            ? 'Checking what points at it…'
            : 'error' in refs
              ? `What points at it is not known (${refs.error}): it leaves every watchlist and its drawings are deleted.`
              : refs.text
                ? `It leaves every watchlist and its drawings are deleted. Points at it: ${refs.text}.`
                : 'Nothing points at it.'}
        </p>
        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={confirm.actions}>
          <button
            type="button"
            className={confirm.cancel}
            onClick={() => {
              setDeleting(false);
            }}
          >
            Keep it
          </button>
          <button
            type="button"
            className={confirm.danger}
            disabled={busy || refs === null}
            onClick={() => void remove()}
          >
            Delete {stored.symbol}
          </button>
        </div>
      </div>
    );
  }

  const last =
    def.kind === 'scenario' && /^\d{4}-\d{2}-\d{2}$/.test(def.firstDate) && barsInRange(def.bars)
      ? lastDate(def.firstDate, def.bars)
      : '';
  const scenario = SCENARIOS.find((s) => s.id === scenarioDraft.scenario);
  return (
    <>
      {learning && (
        <div className={styles.learn}>
          <button
            type="button"
            className={confirm.cancel}
            onClick={() => {
              setLearning(false);
            }}
          >
            Back to the form
          </button>
          <LearnPage slug="synthetic-symbols" />
        </div>
      )}
      <form
        className={styles.form}
        hidden={learning}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={styles.field}>
          <label htmlFor="synthetic-kind">Kind</label>
          <select
            id="synthetic-kind"
            className={panel.control}
            value={kind}
            disabled={editing}
            onChange={(event) => {
              setKind(event.target.value === 'dwelling' ? 'dwelling' : 'scenario');
              setError(null);
            }}
          >
            <option value="scenario">Lab scenario</option>
            <option value="dwelling">Dwelling prices (CBS)</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="synthetic-name">Name</label>
          <span className={styles.ticker}>
            <span className={styles.prefix} aria-hidden="true">
              {SYNTHETIC_PREFIX}
            </span>
            <input
              id="synthetic-name"
              ref={nameRef}
              className={panel.control}
              value={def.name}
              readOnly={editing}
              maxLength={12}
              spellCheck={false}
              autoComplete="off"
              aria-describedby="synthetic-name-hint"
              onChange={(event) => {
                setCommon({ name: event.target.value.toUpperCase() });
              }}
            />
          </span>
        </div>
        <p id="synthetic-name-hint" className={styles.hint}>
          {editing
            ? 'The name and the kind stay: save a copy to change them.'
            : 'A–Z, 0–9, ".", "-", "_"; 12 at most, starting with a letter.'}
        </p>
        <div className={styles.field}>
          <label htmlFor="synthetic-full-name">Full name</label>
          <input
            id="synthetic-full-name"
            className={panel.control}
            value={def.fullName}
            maxLength={60}
            onChange={(event) => {
              setCommon({ fullName: event.target.value });
            }}
          />
        </div>
        {kind === 'scenario' ? (
          <>
            <div className={styles.field}>
              <label htmlFor="synthetic-scenario">Scenario</label>
              <select
                id="synthetic-scenario"
                className={panel.control}
                value={scenarioDraft.scenario}
                onChange={(event) => {
                  setScenario({ scenario: event.target.value as Scenario });
                }}
              >
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {scenario && <p className={styles.hint}>{scenario.hint}</p>}
          </>
        ) : (
          <div className={styles.field}>
            <label htmlFor="synthetic-series">Index</label>
            <select
              id="synthetic-series"
              className={panel.control}
              value={dwellingDraft.series}
              onChange={(event) => {
                setDwelling({ series: event.target.value as DwellingSeries });
              }}
            >
              {DWELLING_SERIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor="synthetic-seed">Seed</label>
          <input
            id="synthetic-seed"
            className={panel.control}
            type="number"
            min={0}
            max={1_000_000}
            step={1}
            value={def.seed}
            onChange={(event) => {
              setCommon({ seed: event.target.valueAsNumber });
            }}
          />
        </div>
        {kind === 'scenario' ? (
          <>
            <div className={styles.field}>
              <label htmlFor="synthetic-bars">Bars (days)</label>
              <input
                id="synthetic-bars"
                className={panel.control}
                type="number"
                min={MIN_BARS}
                max={MAX_BARS}
                step={1}
                value={scenarioDraft.bars}
                onChange={(event) => {
                  setScenario({ bars: event.target.valueAsNumber });
                }}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="synthetic-first-date">First date</label>
              <input
                id="synthetic-first-date"
                className={panel.control}
                type="date"
                value={scenarioDraft.firstDate}
                min={FIRST_DAY}
                max={today()}
                onChange={(event) => {
                  setDateTouched(true);
                  setScenario({ firstDate: event.target.value });
                }}
              />
            </div>
          </>
        ) : (
          <>
            <div className={styles.field}>
              <label htmlFor="synthetic-noise">Noise (% a day)</label>
              <input
                id="synthetic-noise"
                className={panel.control}
                type="number"
                min={0}
                max={MAX_NOISE_PCT}
                step={0.05}
                value={dwellingDraft.noisePct}
                onChange={(event) => {
                  setDwelling({ noisePct: event.target.valueAsNumber });
                }}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="synthetic-causal">Between months</label>
              <select
                id="synthetic-causal"
                className={panel.control}
                value={dwellingDraft.causal ? 'causal' : 'interpolated'}
                onChange={(event) => {
                  setDwelling({ causal: event.target.value === 'causal' });
                }}
              >
                <option value="interpolated">Interpolated (looks ahead)</option>
                <option value="causal">Causal (from publication)</option>
              </select>
            </div>
            {dwellingDraft.causal && (
              <div className={styles.field}>
                <label htmlFor="synthetic-lag">Publication lag (months)</label>
                <input
                  id="synthetic-lag"
                  className={panel.control}
                  type="number"
                  min={0}
                  max={MAX_LAG}
                  step={1}
                  value={dwellingDraft.lagMonths}
                  onChange={(event) => {
                    setDwelling({ lagMonths: event.target.valueAsNumber });
                  }}
                />
              </div>
            )}
          </>
        )}
        <div className={styles.field}>
          <label htmlFor="synthetic-first-price">First price</label>
          <input
            id="synthetic-first-price"
            className={panel.control}
            type="number"
            min={0.01}
            step="any"
            value={def.firstPrice}
            onChange={(event) => {
              setCommon({ firstPrice: event.target.valueAsNumber });
            }}
          />
        </div>
        {kind === 'scenario' && (
          <div className={styles.field}>
            <label htmlFor="synthetic-currency">Currency</label>
            <select
              id="synthetic-currency"
              className={panel.control}
              value={scenarioDraft.currency}
              onChange={(event) => {
                setScenario({ currency: event.target.value as Currency });
              }}
            >
              <option value="ILS">ILS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        )}
        <p className={styles.hint}>
          {kind === 'dwelling'
            ? dwellingDraft.causal
              ? 'Each value holds from its assumed publication, so no bar knows a later one. '
              : 'The close runs between month dates, so a day already knows the next month. '
            : last && `Ends on ${last}. `}
          {kind === 'dwelling' && 'In shekels, no volume; the index sets the dates. '}
          Each day has seven 1h bars, 09:30–16:00 New York.{' '}
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setLearning(true);
            }}
          >
            How it is built
          </button>
        </p>
        {editing && refs !== null && 'text' in refs && refs.text && (
          <p className={styles.warning} role="note">
            Saving changes its bars everywhere it is used: {refs.text}.
          </p>
        )}
        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          {editing && (
            <>
              <button
                type="button"
                className={confirm.cancel}
                onClick={() => {
                  setDeleting(true);
                }}
              >
                Delete…
              </button>
              <button
                type="button"
                className={confirm.cancel}
                onClick={() => {
                  setCopying(true);
                  setCommon({ name: '' });
                  nameRef.current?.focus();
                }}
              >
                Save as copy…
              </button>
            </>
          )}
          <span className={styles.spacer} />
          <button type="button" className={confirm.cancel} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={panel.primary} disabled={busy}>
            {editing ? 'Save' : copying ? 'Save copy' : 'Create symbol'}
          </button>
        </div>
      </form>
    </>
  );
}
