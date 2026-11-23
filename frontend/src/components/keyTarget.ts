/**
 * True for a key press with no Ctrl/Meta/Alt that nothing handled yet, typed outside a text
 * field: the shared condition of the global shortcuts (ticker letters, `/`, `?`).
 */
export function isBareKeyOutsideField(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return true;
  if (target.isContentEditable) return false;
  return !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** `?` typed outside a text field: the keyboard shortcuts dialog. */
export function opensShortcuts(event: KeyboardEvent): boolean {
  return event.key === '?' && isBareKeyOutsideField(event);
}

/** Ctrl+K (Cmd+K on a Mac), also inside text fields, as in most apps: the command palette. */
export function opensPalette(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k';
}

/** Alt+<letter> (no other modifier), by physical key: `code` is `KeyT` for Alt+T on any layout. */
export function altKey(code: string, shift = false): (event: KeyboardEvent) => boolean {
  return (event) =>
    event.altKey &&
    event.shiftKey === shift &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.code === code;
}

/** Not typed into a text field (those have their own Ctrl+Z). */
function outsideField(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return true;
  return !target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Ctrl+Z (Cmd+Z): undo the last chart change. */
export function undoesChart(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.code === 'KeyZ' &&
    outsideField(event)
  );
}

/** Ctrl+Y or Ctrl+Shift+Z: redo. */
export function redoesChart(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    ((!event.shiftKey && event.code === 'KeyY') || (event.shiftKey && event.code === 'KeyZ')) &&
    outsideField(event)
  );
}

/** Ctrl+S (Cmd+S): save the layout now (also inside fields, instead of the browser's save). */
export function savesLayout(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyS'
  );
}

/** Shift+→ outside text fields: the next replay bar. */
export function stepsReplay(event: KeyboardEvent): boolean {
  return (
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    event.key === 'ArrowRight' &&
    !event.defaultPrevented &&
    outsideField(event)
  );
}

/** Alt+S: copy the chart image. `code`, not `key`: Option+S on a Mac types "ß". */
export function copiesSnapshot(event: KeyboardEvent): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyS';
}
