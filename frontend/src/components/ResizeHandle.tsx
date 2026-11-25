import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

import { PANEL_WIDTHS, usePanelWidthStore, type Panel } from '../store/panelWidthStore.ts';
import styles from './ResizeHandle.module.css';

const STEP = 24;
/** Room the chart keeps when a panel is widened. */
const CHART_ROOM = 360;

/**
 * The left edge of a right-hand panel: drag it left to widen the panel, right to narrow it;
 * ←/→ move it by 24 px, a double click restores the default width. Remembered between visits.
 */
export function ResizeHandle({ panel, label }: { panel: Panel; label: string }) {
  const width = usePanelWidthStore((s) => s[panel]);
  const setWidth = usePanelWidthStore((s) => s.setWidth);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const { min, max, initial } = PANEL_WIDTHS[panel];
  const apply = (next: number) => {
    setWidth(panel, Math.min(next, Math.max(window.innerWidth - CHART_ROOM, min)));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={styles.handle}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
      }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        if (drag.current !== null) apply(drag.current.width + drag.current.x - event.clientX);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => {
        setWidth(panel, initial);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        const delta = { ArrowLeft: STEP, ArrowRight: -STEP }[event.key];
        if (delta === undefined) return;
        event.preventDefault();
        apply(width + delta);
      }}
    />
  );
}
