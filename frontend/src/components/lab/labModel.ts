import { isActive, type IndicatorInfo, type ParamInfo, type Params } from '../../api/indicators.ts';
import type { Condition, LabIndicator, LabIndicatorResult, Op, Operand } from '../../api/lab.ts';
import type { MiniLine, MiniPane } from './MiniChart.tsx';

/** One side of a rule in a lab block: an indicator output, a price, or a number. */
export type OperandSpec =
  | { indicator: LabIndicator; output: string }
  | { price: 'open' | 'high' | 'low' | 'close' }
  | { value: number };

/** A rule as written in a page's lab block, e.g. "RSI 14 below 30". */
export interface RuleSpec {
  label: string;
  left: OperandSpec;
  op: Op;
  right: OperandSpec;
}

const sameParams = (a: Params, b: Params) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

/** The lab request parts for these rules: each distinct indicator once (params compared after
 *  the defaults are filled in, so `{}` and the default length are one), rules pointing at it. */
export function buildRules(
  rules: readonly RuleSpec[],
  specs: readonly IndicatorInfo[] = [],
): {
  indicators: LabIndicator[];
  conditions: Condition[];
} {
  const indicators: LabIndicator[] = [];
  const operand = (spec: OperandSpec): Operand => {
    if (!('indicator' in spec)) return spec;
    const { id, params } = spec.indicator;
    const full = withDefaults(
      specs.find((s) => s.id === id),
      params,
    );
    let index = indicators.findIndex((i) => i.id === id && sameParams(i.params, full));
    if (index < 0) index = indicators.push({ id, params: full }) - 1;
    return { indicator: index, output: spec.output };
  };
  const conditions = rules.map((r) => ({
    left: operand(r.left),
    op: r.op,
    right: operand(r.right),
  }));
  return { indicators, conditions };
}

/** What a computed indicator adds to a MiniChart: lines over the price, or a pane below it. */
export function chartLines(
  spec: IndicatorInfo | undefined,
  result: LabIndicatorResult | undefined,
  only?: readonly string[],
): { overlays: MiniLine[]; pane: MiniPane | null } {
  if (spec === undefined || result === undefined) return { overlays: [], pane: null };
  const lines = spec.outputs
    .filter((o) => o.plot !== 'markers' && result.outputs[o.name] !== undefined)
    // Switched-off outputs (RSI's optional MA) have no line.
    .filter((o) => isActive(spec, o, result.params))
    .filter((o) => only === undefined || only.includes(o.name))
    .map((o) => ({
      key: `${result.id}:${o.name}`,
      label: o.label,
      color: o.color,
      values: result.outputs[o.name] ?? [],
      shift: result.displayShift,
    }));
  if (spec.overlay) return { overlays: lines, pane: null };
  const levels = spec.levels.length > 0 ? spec.levels : undefined;
  const bounded = spec.levels.length > 0 && spec.levels.every((l) => l >= 0 && l <= 100);
  return {
    overlays: [],
    pane: {
      lines,
      ...(levels ? { levels } : {}),
      ...(bounded ? { domain: [0, 100] as const } : {}),
    },
  };
}

/** The params a lab block asks for, over the indicator's defaults. */
export function withDefaults(spec: IndicatorInfo | undefined, params: Params | undefined): Params {
  const defaults = Object.fromEntries((spec?.params ?? []).map((p) => [p.name, p.default]));
  return { ...defaults, ...(params ?? {}) };
}

/** Why a lab cannot run: the registry failed or has no such indicator (null while it loads). */
export function missingIndicator(
  registry: { isError: boolean; data?: readonly IndicatorInfo[] | undefined },
  spec: IndicatorInfo | undefined,
  id: string,
): string | null {
  if (registry.isError) return 'Could not load the indicator list.';
  return registry.data !== undefined && spec === undefined ? `Unknown indicator '${id}'.` : null;
}

export const SLIDER_CAP = 200;

/** A range input for `param`: it only yields `min + k·step`, so `min` goes onto the step grid
 *  (bb_mult's 0.001 would make 2.0 unreachable); `max` is capped but never below `value`. */
export function sliderRange(
  param: ParamInfo | undefined,
  value: number,
  bounds: { min?: number | undefined; max?: number | undefined } = {},
): { min: number; max: number; step: number } {
  const step = param?.step ?? (param?.type === 'int' ? 1 : 0.1);
  const min = Number((Math.ceil((bounds.min ?? param?.min ?? 0) / step - 1e-9) * step).toFixed(10));
  const max = Math.max(
    bounds.max ?? Math.min(param?.max ?? SLIDER_CAP, SLIDER_CAP),
    value,
    min + step,
  );
  return { min, max, step };
}

/** A log return as a percent change: ln(C_{t+h}/C_t) → (e^r − 1) · 100. */
export function logToPercent(r: number): number {
  return (Math.exp(r) - 1) * 100;
}

export const OP_LABEL: Record<Op, string> = {
  lt: 'below',
  gt: 'above',
  crosses_above: 'crosses above',
  crosses_below: 'crosses below',
};
