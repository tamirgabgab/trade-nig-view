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
