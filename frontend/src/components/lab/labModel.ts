import { isActive, type IndicatorInfo, type Params } from '../../api/indicators.ts';
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

const sameIndicator = (a: LabIndicator, b: LabIndicator) =>
  a.id === b.id && JSON.stringify(a.params) === JSON.stringify(b.params);

/** The lab request parts for these rules: each distinct indicator once, rules pointing at it. */
export function buildRules(rules: readonly RuleSpec[]): {
  indicators: LabIndicator[];
  conditions: Condition[];
} {
  const indicators: LabIndicator[] = [];
  const operand = (spec: OperandSpec): Operand => {
    if (!('indicator' in spec)) return spec;
    let index = indicators.findIndex((i) => sameIndicator(i, spec.indicator));
    if (index < 0) index = indicators.push(spec.indicator) - 1;
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
