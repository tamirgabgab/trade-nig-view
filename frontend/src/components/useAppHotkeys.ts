import { useUiStore } from '../store/uiStore.ts';
import { opensIndicators } from './indicatorSearch.ts';
import { copiesSnapshot, opensPalette, opensShortcuts } from './keyTarget.ts';
import { opensSymbolSearch } from './symbolSearch.ts';
import { useGlobalHotkey } from './useGlobalHotkey.ts';

/** Every global keyboard shortcut of the app, in one place (the `?` dialog lists them). */
export function useAppHotkeys(): void {
  const ui = useUiStore.getState;
  // A typed letter or digit opens symbol search with that key as the query, as on TradingView.
  useGlobalHotkey(opensSymbolSearch, (event) => {
    ui().openSymbolSearch(event.key.toUpperCase());
  });
  useGlobalHotkey(opensIndicators, () => {
    ui().setIndicatorsDialog(true);
  });
  useGlobalHotkey(opensShortcuts, () => {
    ui().setShortcutsOpen(true);
  });
  useGlobalHotkey(opensPalette, () => {
    ui().setPaletteOpen(true);
  });
  useGlobalHotkey(copiesSnapshot, () => {
    ui().requestSnapshot('copy');
  });
}
