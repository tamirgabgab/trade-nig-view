import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  document.addEventListener('fullscreenchange', onChange);
  return () => {
    document.removeEventListener('fullscreenchange', onChange);
  };
}

/** Whether the page is in fullscreen (F11 or the top-bar button). */
export function useFullscreen(): boolean {
  return useSyncExternalStore(subscribe, () => document.fullscreenElement !== null);
}
