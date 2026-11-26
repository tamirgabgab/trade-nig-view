import { PlannerNumber, type PlannerNumberProps } from './PlannerNumber.tsx';

/** A labelled number field; `text` is the visible label when the accessible one is longer. */
export function PlannerField({ text, ...props }: PlannerNumberProps & { text?: string }) {
  return (
    <label>
      {text ?? props.label}
      <PlannerNumber {...props} />
    </label>
  );
}
