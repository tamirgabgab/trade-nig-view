import { ComboLab, type ComboBlock } from './ComboLab.tsx';
import { EventLab, type EventBlock } from './EventLab.tsx';
import styles from './Lab.module.css';
import { ParamLab, type ParamBlock } from './ParamLab.tsx';

type Block = ParamBlock | EventBlock | ComboBlock;

function parse(source: string): Block | null {
  try {
    const value: unknown = JSON.parse(source);
    if (typeof value !== 'object' || value === null) return null;
    const kind = (value as { kind?: unknown }).kind;
    return kind === 'param' || kind === 'event' || kind === 'combo' ? (value as Block) : null;
  } catch {
    return null;
  }
}

/**
 * A ```lab block of a learn page (JSON) as its interactive widget: `param` (move one
 * parameter), `event` (what followed a signal) or `combo` (combine up to three rules).
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
  }
}
