import { ComboLab, type ComboBlock } from './ComboLab.tsx';
import { EventLab, type EventBlock } from './EventLab.tsx';
import { FilterLab, type FilterBlock } from './FilterLab.tsx';
import styles from './Lab.module.css';
import { ParamLab, type ParamBlock } from './ParamLab.tsx';
import { ReplayLab, type ReplayBlock } from './ReplayLab.tsx';

type Block = ParamBlock | EventBlock | ComboBlock | ReplayBlock | FilterBlock;
type Json = Record<string, unknown>;

const isText = (v: unknown) => typeof v === 'string';
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const OPS: readonly unknown[] = ['lt', 'gt', 'crosses_above', 'crosses_below'];
const isAgo = (side: unknown) =>
  !isObject(side) ||
  side['ago'] === undefined ||
  (Number.isInteger(side['ago']) && (side['ago'] as number) >= 0);
const INTERVALS: readonly unknown[] = [undefined, '1D', '1h'];
const isTexts = (v: unknown) => v === undefined || (Array.isArray(v) && v.every(isText));
const isRule = (r: unknown) =>
  isObject(r) &&
  isText(r['label']) &&
  isObject(r['left']) &&
  isObject(r['right']) &&
  OPS.includes(r['op']) &&
  isAgo(r['left']) &&
  isAgo(r['right']);

/** The fields each kind cannot do without: a typo shows the error line instead of crashing. */
const SHAPES: Record<Block['kind'], (b: Json) => boolean> = {
  param: (b) => isText(b['indicator']) && isText(b['vary']) && INTERVALS.includes(b['interval']),
  event: (b) =>
    isText(b['indicator']) &&
    isText(b['output']) &&
    OPS.includes(b['op']) &&
    typeof b['value'] === 'number' &&
    INTERVALS.includes(b['interval']),
  combo: (b) =>
    Array.isArray(b['rules']) &&
    b['rules'].length > 0 &&
    b['rules'].every(isRule) &&
    INTERVALS.includes(b['interval']),
  replay: (b) =>
    isText(b['symbol']) &&
    isText(b['date']) &&
    isTexts(b['steps']) &&
    (b['reveal'] === undefined || isText(b['reveal'])) &&
    INTERVALS.includes(b['interval']),
  filter: (b) => isText(b['indicator']),
};

function parse(source: string): Block | null {
  try {
    const value: unknown = JSON.parse(source);
    if (!isObject(value)) return null;
    const shape = SHAPES[value['kind'] as Block['kind']] as ((b: Json) => boolean) | undefined;
    return shape?.(value) === true ? (value as unknown as Block) : null;
  } catch {
    return null;
  }
}

/**
 * A ```lab block of a learn page (JSON) as its interactive widget: `param` (move one
 * parameter), `event` (what followed a signal), `combo` (combine up to three rules) or `replay`
 * (an exercise: start the bar replay on a symbol and date) or `filter` (a linear indicator's
 * measured Filter view).
 */
export function LabBlock({ source }: { source: string }) {
  const block = parse(source);
  if (block === null) {
    return (
      <p className={styles.error} role="alert">
        This interactive example could not be read.
      </p>
    );
  }
  switch (block.kind) {
    case 'param':
      return <ParamLab block={block} />;
    case 'event':
      return <EventLab block={block} />;
    case 'combo':
      return <ComboLab block={block} />;
    case 'replay':
      return <ReplayLab block={block} />;
    case 'filter':
      return <FilterLab block={block} />;
  }
}
