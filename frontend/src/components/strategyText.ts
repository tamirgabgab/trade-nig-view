import type { Condition, Operand, RulesStrategy } from '../api/strategies.ts';

/** Readable rules for the Strategy tab (P4 B0); the rule builder arrives in B2. */

const OPS: Record<Condition['op'], string> = {
  lt: '<',
  gt: '>',
  crosses_above: 'crosses above',
  crosses_below: 'crosses below',
};

type Indicators = NonNullable<RulesStrategy['indicators']>;

export function operandText(op: Operand, indicators: Indicators): string {
  const ago = op.ago > 0 ? ` ${String(op.ago)} bars ago` : '';
  if (op.value !== null && op.value !== undefined) return String(op.value);
  if (op.price !== null && op.price !== undefined) return `${op.price}${ago}`;
  const ind = indicators[op.indicator ?? -1];
  if (ind === undefined) return '?';
  const params = Object.values(ind.params ?? {}).join(', ');
  const name = `${ind.id.toUpperCase()}${params === '' ? '' : `(${params})`}`;
  const output = op.output === ind.id || op.output === 'ma' ? '' : ` ${op.output ?? ''}`;
  const interval = ind.interval === null || ind.interval === undefined ? '' : ` ${ind.interval}`;
  return `${name}${output}${interval}${ago}`;
}

export function conditionText(c: Condition, indicators: Indicators): string {
  return `${operandText(c.left, indicators)} ${OPS[c.op]} ${operandText(c.right, indicators)}`;
}

/** One line per group (its conditions ANDed); the groups are ORed. */
export function groupsText(groups: readonly Condition[][], indicators: Indicators): string[] {
  return groups.map((g) => g.map((c) => conditionText(c, indicators)).join(' and '));
}

type Exits = NonNullable<RulesStrategy['exits']>;

function levelText(level: NonNullable<Exits['stop']>, atrLength: number): string {
  return level.kind === 'percent'
    ? `${String(level.value)} %`
    : `${String(level.value)} × ATR(${String(atrLength)})`;
}

/** The exits as the engine (B1) will run them. */
export function exitsText(exits: Exits | undefined): string[] {
  const e: Partial<Exits> = exits ?? {};
  const atr = e.atr_length ?? 14;
  return [
    ...((e.on_opposite ?? true) ? ['on the other side’s entry'] : []),
    ...(e.stop ? [`stop ${levelText(e.stop, atr)}`] : []),
    ...(e.target ? [`target ${levelText(e.target, atr)}`] : []),
    ...(e.trailing ? [`trailing stop ${levelText(e.trailing, atr)}`] : []),
    ...(e.time_stop_bars ? [`after ${String(e.time_stop_bars)} bars`] : []),
  ];
}
