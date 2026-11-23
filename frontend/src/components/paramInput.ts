import type { ParamInfo } from '../api/indicators.ts';

export type ParsedInput = { ok: true; value: number } | { ok: false; error: string };

function range(param: ParamInfo): string {
  const fmt = (v: number) => v.toLocaleString('en-US');
  if (param.min !== null && param.max !== null)
    return ` from ${fmt(param.min)} to ${fmt(param.max)}`;
  if (param.min !== null) return ` of at least ${fmt(param.min)}`;
  if (param.max !== null) return ` of at most ${fmt(param.max)}`;
  return '';
}

/** A number field's text as the parameter's value, or a message saying what fits. */
export function parseParamInput(param: ParamInfo, text: string): ParsedInput {
  const kind = param.type === 'int' ? 'a whole number' : 'a number';
  const error = `${param.label} needs ${kind}${range(param)}.`;
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error };
  if (param.type === 'int' && !Number.isInteger(value)) return { ok: false, error };
  if (param.min !== null && value < param.min) return { ok: false, error };
  if (param.max !== null && value > param.max) return { ok: false, error };
  return { ok: true, value };
}
