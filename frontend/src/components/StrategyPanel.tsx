import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  deleteStrategy,
  fetchStrategy,
  saveStrategy,
  useProfiles,
  useStrategyCatalog,
  type PythonFile,
  type RulesStrategy,
  type SignalKind,
  type Strategy,
} from '../api/strategies.ts';
import { CONFLICT_COLOR } from '../chart/signalMarkers.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useStrategyStore, type CurrentStrategy } from '../store/strategyStore.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import f from './ForecastPanel.module.css';
import { NumberField } from './NumberField.tsx';
import styles from './StrategyPanel.module.css';
import { capText, exitsText, groupsText } from './strategyText.ts';
import { useChartSignals } from './useChartSignals.ts';

const ROWS: { kind: SignalKind; label: string; glyph: string; color: string }[] = [
  { kind: 'long_entry', label: 'Long entries', glyph: '▲', color: 'var(--color-up)' },
  { kind: 'long_exit', label: 'Long exits', glyph: '●', color: 'var(--color-up)' },
  { kind: 'short_entry', label: 'Short entries', glyph: '▼', color: 'var(--color-down)' },
  { kind: 'short_exit', label: 'Short exits', glyph: '●', color: 'var(--color-down)' },
  { kind: 'conflict', label: 'Both entries', glyph: '■', color: CONFLICT_COLOR },
];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function pythonStrategy(file: PythonFile, profile: Strategy['profile']): Strategy {
  return {
    kind: 'python',
    profile,
    module: file.module,
    description: file.description,
    params: Object.fromEntries(file.params.map((p) => [p.name, p.default])),
  };
}

function Rules({ strategy }: { strategy: RulesStrategy }) {
  const ind = strategy.indicators ?? [];
  const side = (label: string, rules: RulesStrategy['long']) => {
    const entry = groupsText(rules?.entry ?? [], ind);
    const exit = groupsText(rules?.exit ?? [], ind);
    return (
      <>
        <p className={styles.side}>{label}</p>
        {entry.length === 0 ? (
          <p className={f.note}>No entries.</p>
        ) : (
          <ul className={styles.rules} aria-label={`${label} rules`}>
            {entry.map((text, i) => (
              <li key={`e${String(i)}`}>{`${i > 0 ? 'or ' : ''}enter when ${text}`}</li>
            ))}
            {exit.map((text, i) => (
              <li key={`x${String(i)}`}>{`${i > 0 ? 'or ' : ''}exit when ${text}`}</li>
            ))}
          </ul>
        )}
      </>
    );
  };
  const filters = groupsText(strategy.filters ?? [], ind);
  const exits = exitsText(strategy.exits);
  return (
    <>
      {side('Long', strategy.long)}
      {side('Short', strategy.short)}
      {filters.length > 0 && <p className={f.note}>Entries only while {filters.join(', or ')}.</p>}
      {exits.length > 0 && <p className={f.note}>Also exits {exits.join(', ')}.</p>}
    </>
  );
}

/**
 * The Strategy tab (P4 B0): pick a trader profile and a strategy (saved, an example or a Python
 * file in `strategies/`), and see on the chart where it would enter and leave, long and short.
 * The trades themselves come with the backtest engine (B1).
 */
export function StrategyPanel() {
  const profiles = useProfiles().data ?? [];
  const catalog = useStrategyCatalog();
  const profileId = useStrategyStore((s) => s.profile);
  const current = useStrategyStore((s) => s.current);
  const show = useStrategyStore((s) => s.show);
  const { setProfile, choose, edit, setShow } = useStrategyStore.getState();
  const chartInterval = useChartStore((s) => s.interval);
  const setChartInterval = useChartStore((s) => s.setInterval);
  const { result, profile, onDecision } = useChartSignals();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const saved = (catalog.data?.saved ?? []).filter((s) => s.profile === profileId);
  const examples = (catalog.data?.examples ?? []).filter((e) => e.strategy.profile === profileId);
  const files = catalog.data?.python ?? [];
  const file =
    current?.source === 'python' ? files.find((p) => p.module === current.name) : undefined;

  const pick = (current: CurrentStrategy | null, defaultName = '') => {
    choose(current);
    setName(defaultName);
    setMessage(null);
  };

  const onChoose = (value: string) => {
    const [source, ...rest] = value.split(':');
    const key = rest.join(':');
    if (source === 'saved') {
      fetchStrategy(key).then(
        ({ revision, strategy }) => {
          pick({ source: 'saved', name: key, revision, strategy }, key);
        },
        (e: unknown) => {
          setMessage(errorText(e));
        },
      );
    } else if (source === 'example') {
      const ex = examples.find((e) => e.name === key);
      if (ex !== undefined) {
        pick(
          { source: 'example', name: key, revision: 0, strategy: ex.strategy },
          key.replace(/^Example: /, ''),
        );
      }
    } else if (source === 'python') {
      const py = files.find((p) => p.module === key);
      if (py !== undefined) {
        pick(
          { source: 'python', name: key, revision: 0, strategy: pythonStrategy(py, profileId) },
          key,
        );
      }
    } else {
      pick(null);
    }
  };

  const save = () => {
    if (current === null) return;
    const text = name.trim();
    const own = current.source === 'saved' && current.name === text;
    if (text === '') {
      setMessage('Give the strategy a name.');
      return;
    }
    if (!own && (catalog.data?.saved ?? []).some((s) => s.name === text)) {
      setMessage(`There is a strategy “${text}”: choose another name.`);
      return;
    }
    saveStrategy(text, own ? current.revision : 0, current.strategy).then(
      (revision) => {
        choose({ source: 'saved', name: text, revision, strategy: current.strategy });
        setMessage(`Saved as “${text}”.`);
        void client.invalidateQueries({ queryKey: ['strategies'] });
      },
      (e: unknown) => {
        setMessage(errorText(e));
      },
    );
  };

  const remove = () => {
    if (current === null) return;
    setDeleting(false);
    deleteStrategy(current.name, current.revision).then(
      () => {
        pick(null);
        setMessage(`Deleted “${current.name}”.`);
        void client.invalidateQueries({ queryKey: ['strategies'] });
      },
      (e: unknown) => {
        setMessage(errorText(e));
      },
    );
  };

  const strategy = current?.strategy;
  const maxTrades = strategy?.max_trades ?? profile?.defaultMaxTrades ?? 10;
  const decision = profile?.decisionIntervals[0];

  return (
    <div className={f.panel}>
      <div className={styles.profiles} role="group" aria-label="Trader profile">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.profile}
            aria-pressed={p.id === profileId}
            onClick={() => {
              setProfile(p.id);
              const first = p.decisionIntervals[0];
              if (first !== undefined && !p.decisionIntervals.includes(chartInterval)) {
                setChartInterval(first);
              }
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {profile !== undefined && (
        <div className={f.section}>
          <p className={f.note}>{profile.description}</p>
          <dl className={styles.facts}>
            <dt>Decides on</dt>
            <dd>{profile.decisionIntervals.join(' or ')} bars</dd>
            <dt>Context</dt>
            <dd>
              {profile.contextIntervals.length > 0
                ? `${profile.contextIntervals.join(', ')} (once its bar has closed)`
                : 'none'}
            </dd>
            <dt>Trade cap</dt>
            <dd>{capText(profile.defaultMaxTrades, profile)} by default (a parameter)</dd>
            <dt>Overnight</dt>
            <dd>{profile.overnight ? 'held' : 'flat at the close'}</dd>
          </dl>
        </div>
      )}

      <div className={f.section}>
        <label className={f.field}>
          Strategy
          <select
            className={`${f.select} ${styles.choose}`}
            value={current === null ? '' : `${current.source}:${current.name}`}
            onChange={(event) => {
              onChoose(event.target.value);
            }}
          >
            <option value="">Choose…</option>
            {saved.length > 0 && (
              <optgroup label="Saved">
                {saved.map((s) => (
                  <option key={s.name} value={`saved:${s.name}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            {examples.length > 0 && (
              <optgroup label="Examples">
                {examples.map((e) => (
                  <option key={e.name} value={`example:${e.name}`}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
            )}
            {files.length > 0 && (
              <optgroup label="Python files">
                {files.map((p) => (
                  <option key={p.module} value={`python:${p.module}`}>
                    {p.module}.py
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {catalog.isError && <p className={styles.error}>{errorText(catalog.error)}</p>}
        {strategy === undefined ? (
          <p className={f.note}>Choose a strategy to see where it would enter and leave.</p>
        ) : (
          <>
            {strategy.description !== '' && <p className={f.note}>{strategy.description}</p>}
            {strategy.kind === 'rules' ? (
              <Rules strategy={strategy} />
            ) : file?.error ? (
              <p className={styles.error} role="alert">
                {file.error}
              </p>
            ) : (
              <div className={f.settings}>
                {file?.params.map((p) =>
                  p.type === 'bool' ? (
                    <label key={p.name} className={f.check}>
                      <input
                        type="checkbox"
                        checked={strategy.params?.[p.name] === true}
                        onChange={(event) => {
                          edit({
                            ...strategy,
                            params: { ...strategy.params, [p.name]: event.target.checked },
                          });
                        }}
                      />
                      {p.label}
                    </label>
                  ) : (
                    <NumberField
                      key={p.name}
                      label={p.label}
                      value={Number(strategy.params?.[p.name] ?? p.default)}
                      min={(p.min ?? -1e12) - (p.type === 'int' ? 1 : 1e-9)}
                      max={p.max ?? 1e12}
                      step={p.type === 'int' ? 1 : 0.1}
                      onCommit={(v) => {
                        edit({ ...strategy, params: { ...strategy.params, [p.name]: v } });
                      }}
                    />
                  ),
                )}
              </div>
            )}
            {profile !== undefined && (
              <div className={f.settings}>
                <NumberField
                  label={`Trades a ${profile.capPeriod} at most`}
                  value={maxTrades}
                  min={0}
                  max={10_000}
                  step={1}
                  onCommit={(v) => {
                    edit({ ...strategy, max_trades: Math.round(v) });
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {strategy !== undefined && (
        <div className={f.section}>
          <div className={styles.actions}>
            <button
              type="button"
              className={f.button}
              aria-pressed={show}
              onClick={() => {
                setShow(!show);
              }}
            >
              {show ? 'Hide signals' : 'Show signals on the chart'}
            </button>
          </div>
          {show && !onDecision && decision !== undefined && (
            <p className={f.note}>
              Signals are computed on the {profile?.decisionIntervals.join(' or ')} bars of this
              profile.{' '}
              <button
                type="button"
                className={f.button}
                onClick={() => {
                  setChartInterval(decision);
                }}
              >
                Switch the chart to {decision}
              </button>
            </p>
          )}
          {show && result.isError && (
            <p className={styles.error} role="alert">
              {errorText(result.error)}
            </p>
          )}
          {show && result.isFetching && result.data === undefined && (
            <p className={f.note} role="status">
              Computing the signals…
            </p>
          )}
          {show && onDecision && result.data !== undefined && (
            <>
              <table className={f.table} aria-label="Signals">
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.kind}>
                      <th scope="row">
                        <span className={styles.glyph} style={{ color: row.color }} aria-hidden>
                          {row.glyph}
                        </span>
                        {row.label}
                      </th>
                      <td>{result.data.times[row.kind].length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={f.note}>
                Over {result.data.bars} {result.data.interval} bars, from past bars only. No trades
                yet: the backtest engine (next round) fills them at the next open, under the cap.
                “Both entries” are settled by the side whose closed trades earned more a year, net.
              </p>
            </>
          )}
        </div>
      )}

      {strategy !== undefined && (
        <div className={f.section}>
          <div className={styles.actions}>
            <label className={f.field}>
              Name
              <input
                className={f.input}
                style={{ width: 160 }}
                value={name}
                maxLength={60}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </label>
            <button type="button" className={f.button} onClick={save}>
              Save strategy
            </button>
            {current?.source === 'saved' && (
              <button
                type="button"
                className={f.button}
                onClick={() => {
                  setDeleting(true);
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
      {message !== null && (
        <p className={`${f.note} ${f.section}`} role="status">
          {message}
        </p>
      )}
      {deleting && current !== null && (
        <ConfirmDialog
          title={`Delete the strategy “${current.name}”?`}
          message="The saved strategy is removed. Examples and Python files stay."
          confirmLabel="Delete strategy"
          onConfirm={remove}
          onCancel={() => {
            setDeleting(false);
          }}
        />
      )}
      <p className={`${f.note} ${f.section}`}>Paper research only, not investment advice.</p>
    </div>
  );
}
