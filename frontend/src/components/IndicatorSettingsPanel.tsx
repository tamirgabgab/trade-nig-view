import { RotateCcw, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import {
  defaultParams,
  effectiveParams,
  isActive,
  optionLabel,
  type IndicatorInfo,
  type ParamInfo,
  type Params,
} from '../api/indicators.ts';
import { LINE_WIDTHS, useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import styles from './IndicatorSettingsPanel.module.css';
import { parseParamInput } from './paramInput.ts';
import { usePresence } from './usePresence.ts';
import { valueOutputs, type IndicatorView } from './useChartIndicators.ts';

/** Changes to number fields reach the chart this long after the last keystroke. */
export const APPLY_DELAY_MS = 250;

interface IndicatorSettingsPanelProps {
  views: readonly IndicatorView[];
}

/** Side panel with the open instance's inputs and style; every change applies live. */
export function IndicatorSettingsPanel({ views }: IndicatorSettingsPanelProps) {
  const { shown: uid, closing } = usePresence(useUiStore((s) => s.settingsFor));
  const view = views.find((v) => v.instance.uid === uid);
  if (view?.spec === undefined) return null;
  return <SettingsForm key={view.instance.uid} view={view} spec={view.spec} closing={closing} />;
}

function isNumeric(param: ParamInfo): boolean {
  return param.type === 'int' || param.type === 'float';
}

function draftOf(spec: IndicatorInfo, params: Params): Record<string, string> {
  return Object.fromEntries(
    spec.params.filter(isNumeric).map((p) => [p.name, String(params[p.name] ?? p.default)]),
  );
}

function SettingsForm({
  view,
  spec,
  closing,
}: {
  view: IndicatorView;
  spec: IndicatorInfo;
  closing: boolean;
}) {
  const uid = view.instance.uid;
  const close = useUiStore((s) => s.openSettings);
  const setParams = useIndicatorStore((s) => s.setParams);
  const setStyle = useIndicatorStore((s) => s.setStyle);
  const resetStyles = useIndicatorStore((s) => s.resetStyles);
  const [draft, setDraft] = useState(() => draftOf(spec, view.params));
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const pending = useRef<Params>({});
  const timer = useRef<number | undefined>(undefined);

  // Merge into the latest stored params (another field may have changed meanwhile).
  const commit = (patch: Params) => {
    const current = useIndicatorStore.getState().instances.find((i) => i.uid === uid);
    if (current === undefined) return;
    setParams(uid, { ...effectiveParams(spec, current.params), ...patch });
  };
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  const flush = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length > 0) commitRef.current(patch);
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  // Focus the first field on open; on close apply what is still pending and restore focus.
  useEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.querySelector<HTMLElement>('input, select')?.focus();
    return () => {
      flushRef.current();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const onNumber = (param: ParamInfo, text: string) => {
    setDraft((d) => ({ ...d, [param.name]: text }));
    const parsed = parseParamInput(param, text);
    if (!parsed.ok) return;
    pending.current = { ...pending.current, [param.name]: parsed.value };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, APPLY_DELAY_MS);
  };

  const reset = () => {
    window.clearTimeout(timer.current);
    pending.current = {};
    const defaults = defaultParams(spec);
    setParams(uid, defaults);
    resetStyles(uid);
    setDraft(draftOf(spec, defaults));
    setTouched(new Set());
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(null);
    }
  };

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      data-closing={closing || undefined}
      inert={closing}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {view.label}
        </h2>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Close settings"
          onClick={() => {
            close(null);
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.body}>
        <section aria-labelledby={`${titleId}-inputs`}>
          <h3 id={`${titleId}-inputs`} className={styles.section}>
            Inputs
          </h3>
          {spec.params.map((param) => {
            const id = `${titleId}-${param.name}`;
            // Inputs of a switched-off option (e.g. RSI smoothing length while Smoothing is None).
            const disabled = !isActive(spec, param, view.params);
            if (isNumeric(param)) {
              const text = draft[param.name] ?? '';
              const parsed = parseParamInput(param, text);
              const showError = !parsed.ok && touched.has(param.name);
              return (
                <div key={param.name} className={styles.field}>
                  <label htmlFor={id} className={styles.label}>
                    {param.label}
                  </label>
                  <input
                    id={id}
                    className={styles.control}
                    type="number"
                    inputMode={param.type === 'int' ? 'numeric' : 'decimal'}
                    min={param.min ?? undefined}
                    max={param.max ?? undefined}
                    step={param.step ?? (param.type === 'int' ? 1 : 'any')}
                    value={text}
                    disabled={disabled}
                    aria-invalid={showError || undefined}
                    aria-describedby={showError ? `${id}-error` : undefined}
                    onChange={(event) => {
                      onNumber(param, event.target.value);
                    }}
                    onBlur={() => {
                      setTouched((t) => new Set(t).add(param.name));
                    }}
                  />
                  {showError && (
                    <p id={`${id}-error`} className={styles.error}>
                      {parsed.error}
                    </p>
                  )}
                </div>
              );
            }
            if (param.type === 'bool') {
              return (
                <label key={param.name} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={view.params[param.name] === true}
                    disabled={disabled}
                    onChange={(event) => {
                      commit({ [param.name]: event.target.checked });
                    }}
                  />
                  {param.label}
                </label>
              );
            }
            return (
              <div key={param.name} className={styles.field}>
                <label htmlFor={id} className={styles.label}>
                  {param.label}
                </label>
                <select
                  id={id}
                  className={styles.control}
                  value={String(view.params[param.name] ?? param.default)}
                  disabled={disabled}
                  onChange={(event) => {
                    commit({ [param.name]: event.target.value });
                  }}
                >
                  {param.options.map((option) => (
                    <option key={option} value={option}>
                      {optionLabel(param, option)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </section>
        <section aria-labelledby={`${titleId}-style`}>
          <h3 id={`${titleId}-style`} className={styles.section}>
            Style
          </h3>
          {valueOutputs(view).map((output) => (
            <div key={output.name} className={styles.styleRow}>
              <span className={styles.label}>{output.label}</span>
              <input
                type="color"
                className={styles.color}
                aria-label={`${output.label} colour`}
                value={output.color}
                onChange={(event) => {
                  setStyle(uid, output.name, {
                    color: event.target.value,
                    lineWidth: output.lineWidth,
                  });
                }}
              />
              <select
                className={styles.control}
                aria-label={`${output.label} line width`}
                value={output.lineWidth}
                onChange={(event) => {
                  setStyle(uid, output.name, {
                    color: output.color,
                    lineWidth: Number(event.target.value),
                  });
                }}
              >
                {LINE_WIDTHS.map((width) => (
                  <option key={width} value={width}>
                    {width}px
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.secondary} onClick={reset}>
          <RotateCcw size={14} aria-hidden="true" />
          Reset to defaults
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={() => {
            close(null);
          }}
        >
          Close
        </button>
      </div>
    </aside>
  );
}
