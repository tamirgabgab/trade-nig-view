import { useUiStore } from '../store/uiStore.ts';
import { opensIndicators } from './indicatorSearch.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import { TOOL_SHORTCUTS } from './drawingTools.ts';
import { useHistoryStore } from '../store/historyStore.ts';
import {
  altKey,
  copiesSnapshot,
  opensPalette,
  opensShortcuts,
  redoesChart,
  savesLayout,
  undoesChart,
} from './keyTarget.ts';
import { opensSymbolSearch } from './symbolSearch.ts';
import { useGlobalHotkey } from './useGlobalHotkey.ts';
import { saveLayoutNow } from '../store/layoutSync.ts';

/** Every global keyboard shortcut of the app, in one place (the `?` dialog lists them). */
export function useAppHotkeys(): void {
  const ui = useUiStore.getState;
  // A typed letter or digit opens symbol search with that key as the query, as on TradingView.
  useGlobalHotkey(opensSymbolSearch, (event) => {
    ui().openModal('symbols', event.key.toUpperCase());
  });
  useGlobalHotkey(savesLayout, saveLayoutNow);
  useGlobalHotkey(undoesChart, () => {
    useHistoryStore.getState().undo();
  });
  useGlobalHotkey(redoesChart, () => {
    useHistoryStore.getState().redo();
  });
  useGlobalHotkey(opensIndicators, () => {
    ui().openModal('indicators');
  });
  useGlobalHotkey(opensShortcuts, () => {
    ui().openModal('shortcuts');
  });
  useGlobalHotkey(opensPalette, () => {
    ui().openModal('palette');
  });
  useGlobalHotkey(copiesSnapshot, () => {
    ui().requestSnapshot('copy');
  });
  // Drawing tools (Alt+T trend line, Alt+H horizontal, Alt+V vertical, Alt+F Fib) and hide all.
  for (const t of TOOL_SHORTCUTS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a constant list: same order every render
    useGlobalHotkey(altKey(`Key${t.shortcut?.slice(-1) ?? ''}`), () => {
      useDrawingStore.getState().setTool(t.type, t.group);
    });
  }
  useGlobalHotkey(altKey('KeyH', true), () => {
    useDrawingStore.getState().toggle('hideAll');
  });
}
