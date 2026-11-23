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

/** Alt+S: copy the chart image. `code`, not `key`: Option+S on a Mac types "ß". */
export function copiesSnapshot(event: KeyboardEvent): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyS';
}
