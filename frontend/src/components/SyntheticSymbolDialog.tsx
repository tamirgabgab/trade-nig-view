import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { SCENARIOS, type Scenario } from '../api/lab.ts';
import {
  MAX_BARS,
  MIN_BARS,
  deleteSynthetic,
  describeReferences,
  getReferences,
  getSynthetic,
  saveSynthetic,
  SYNTHETIC_PREFIX,
  type Currency,
  type SyntheticDefinition,
  type SyntheticSymbol,
} from '../api/synthetic.ts';
import { DEFAULT_SYMBOL, useChartStore } from '../store/chartStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import confirm from './ConfirmDialog.module.css';
import panel from './IndicatorSettingsPanel.module.css';
import { ModalShell } from './ModalShell.tsx';
import styles from './SyntheticSymbolDialog.module.css';
import { definitionProblem, firstDateEndingBefore, lastDate } from './syntheticForm.ts';
import { usePresence } from './usePresence.ts';

const DEFAULT_BARS = 2500;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function blank(): SyntheticDefinition {
  return {
    name: '',
    fullName: '',
    scenario: 'random_walk',
    seed: Math.floor(Math.random() * 1_000_000),
    firstDate: firstDateEndingBefore(today(), DEFAULT_BARS),
    firstPrice: 100,
    bars: DEFAULT_BARS,
    currency: 'ILS',
  };
}

interface FormProps {
  /** The stored symbol being edited, or null to create one. */
  stored: SyntheticSymbol | null;
  /** Open on the delete confirmation (the watchlist's "Delete…"). */
  deleteFirst: boolean;
  onClose: () => void;
}

function SyntheticForm({ stored, deleteFirst, onClose }: FormProps) {
  const client = useQueryClient();
  const setSymbol = useChartStore((s) => s.setSymbol);
  const chartSymbol = useChartStore((s) => s.symbol);
  const [def, setDef] = useState<SyntheticDefinition>(() => stored?.definition ?? blank());
  // A new one (or a copy) is named by the user; an edit keeps its name.
  const [copying, setCopying] = useState(false);
  const editing = stored !== null && !copying;
  const [dateTouched, setDateTouched] = useState(stored !== null);
  const [refs, setRefs] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(deleteFirst);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stored === null) return;
    let live = true;
    getReferences(stored.symbol)
      .then((r) => {
        if (live) setRefs(describeReferences(r));
      })
      .catch(() => {
        if (live) setRefs('');
      });
    return () => {
      live = false;
    };
  }, [stored]);

  const set = (change: Partial<SyntheticDefinition>) => {
    setDef((d) => {
      const next = { ...d, ...change };
      // Until a first date is picked, the series keeps ending on the last weekday before today.
      return change.bars !== undefined && !dateTouched
        ? { ...next, firstDate: firstDateEndingBefore(today(), next.bars) }
        : next;
    });
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
          {refs
            ? `It leaves every watchlist and its drawings are deleted. Points at it: ${refs}.`
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
            disabled={busy}
            onClick={() => void remove()}
          >
            Delete {stored.symbol}
          </button>
        </div>
      </div>
    );
  }

  const last = /^\d{4}-\d{2}-\d{2}$/.test(def.firstDate) ? lastDate(def.firstDate, def.bars) : '';
  const scenario = SCENARIOS.find((s) => s.id === def.scenario);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
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
              set({ name: event.target.value.toUpperCase() });
            }}
          />
        </span>
      </div>
      <p id="synthetic-name-hint" className={styles.hint}>
        {editing
          ? 'The name stays: save a copy to use another one.'
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
            set({ fullName: event.target.value });
          }}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="synthetic-scenario">Scenario</label>
        <select
          id="synthetic-scenario"
          className={panel.control}
          value={def.scenario}
          onChange={(event) => {
            set({ scenario: event.target.value as Scenario });
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
            set({ seed: event.target.valueAsNumber });
          }}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="synthetic-bars">Bars (days)</label>
        <input
          id="synthetic-bars"
          className={panel.control}
          type="number"
          min={MIN_BARS}
          max={MAX_BARS}
          step={1}
          value={def.bars}
          onChange={(event) => {
            set({ bars: event.target.valueAsNumber });
          }}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="synthetic-first-date">First date</label>
        <input
          id="synthetic-first-date"
          className={panel.control}
          type="date"
          value={def.firstDate}
          max={today()}
          onChange={(event) => {
            setDateTouched(true);
            set({ firstDate: event.target.value });
          }}
        />
      </div>
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
            set({ firstPrice: event.target.valueAsNumber });
          }}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="synthetic-currency">Currency</label>
        <select
          id="synthetic-currency"
          className={panel.control}
          value={def.currency}
          onChange={(event) => {
            set({ currency: event.target.value as Currency });
          }}
        >
          <option value="ILS">ILS</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <p className={styles.hint}>
        {last && `Ends on ${last}. `}Each day has seven 1h bars, 09:30–16:00 New York.
      </p>
      {editing && refs && (
        <p className={styles.warning} role="note">
          Saving changes its bars everywhere it is used: {refs}.
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
                set({ name: '' });
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
  );
}

/** Create or edit a synthetic symbol (opened from the symbol search, the legend or the
 *  watchlist): its definition, and, for a stored one, Save as copy and Delete. */
export function SyntheticSymbolDialog() {
  const modal = useUiStore((s) =>
    s.modal === 'synthetic' || s.modal === 'syntheticDelete' ? s.modal : null,
  );
  const seed = useUiStore((s) => s.symbolSeed);
  const closeModal = useUiStore((s) => s.closeModal);
  // Stable while open: a new object every render would reopen the dialog forever.
  const request = useMemo(() => (modal === null ? null : { modal, symbol: seed }), [modal, seed]);
  const { shown, attrs, key } = usePresence(request);
  const symbol = shown?.symbol ?? '';
  const stored = useQuery({
    queryKey: ['synthetic', symbol],
    queryFn: ({ signal }) => getSynthetic(symbol, signal),
    enabled: symbol !== '',
    staleTime: 0,
  });

  if (shown === null) return null;
  const close = () => {
    closeModal(shown.modal);
  };
  return (
    <ModalShell
      key={key}
      title={symbol === '' ? 'New synthetic symbol' : `Edit ${symbol}`}
      attrs={attrs}
      onClose={close}
      className={styles.dialog}
    >
      {symbol !== '' && stored.error !== null ? (
        <p className={styles.error} role="alert">
          {stored.error.message}
        </p>
      ) : symbol !== '' && stored.data === undefined ? (
        <p className={styles.hint}>Loading…</p>
      ) : (
        <SyntheticForm
          stored={symbol === '' ? null : (stored.data ?? null)}
          deleteFirst={shown.modal === 'syntheticDelete'}
          onClose={close}
        />
      )}
    </ModalShell>
  );
}
