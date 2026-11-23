import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/client.ts';
import {
  deleteWatchlist,
  saveWatchlist,
  useWatchlists,
  WATCHLISTS_KEY,
  type Watchlist,
  type WatchlistSection,
} from '../api/watchlists.ts';
import { useUiStore } from '../store/uiStore.ts';
import { useWatchlistStore } from '../store/watchlistStore.ts';

/** Saves run one after another, each on the revision the previous one returned. */
let queue: Promise<unknown> = Promise.resolve();

function cached(client: QueryClient): Watchlist[] {
  return client.getQueryData<Watchlist[]>(WATCHLISTS_KEY) ?? [];
}

function put(client: QueryClient, list: Watchlist): void {
  client.setQueryData<Watchlist[]>(WATCHLISTS_KEY, (old = []) =>
    old.some((l) => l.name === list.name)
      ? old.map((l) => (l.name === list.name ? list : l))
      : [...old, list],
  );
}

function failed(client: QueryClient, error: unknown): void {
  const reason =
    error instanceof ApiError && error.status === 409
      ? 'it was changed in another window; showing that version'
      : error instanceof Error
        ? error.message
        : String(error);
  useUiStore.getState().showToast(`Could not save the watchlist: ${reason}`);
  void client.invalidateQueries({ queryKey: WATCHLISTS_KEY });
}

/**
 * The watchlists and the edits of the shown one: shown at once, saved in the background (in
 * order); a failed save says why and reloads the lists.
 */
export function useWatchlistEditor() {
  const client = useQueryClient();
  const query = useWatchlists();
  const activeName = useWatchlistStore((s) => s.active);
  const setActive = useWatchlistStore((s) => s.setActive);
  const lists = query.data ?? [];
  const active = lists.find((l) => l.name === activeName) ?? lists[0];

  const edit = (change: (sections: readonly WatchlistSection[]) => WatchlistSection[]) => {
    if (active === undefined) return;
    const { name } = active;
    put(client, { ...active, sections: change(active.sections) });
    queue = queue.then(async () => {
      const latest = cached(client).find((l) => l.name === name);
      if (latest === undefined) return;
      try {
        put(client, await saveWatchlist(name, latest.revision, latest.sections));
      } catch (error) {
        failed(client, error);
      }
    });
  };

  /** Save the shown list's sections under `name` (a new list); an error to show, or null. */
  const saveAsNew = async (name: string, sections: WatchlistSection[]): Promise<string | null> => {
    try {
      put(client, await saveWatchlist(name, 0, sections));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        return `A watchlist named “${name}” already exists.`;
      }
      throw error;
    }
    setActive(name);
    return null;
  };

  return {
    query,
    lists,
    active,
    edit,
    select: setActive,
    create: (name: string) => saveAsNew(name, []),
    rename: async (name: string) => {
      if (active === undefined || name === active.name) return null;
      const problem = await saveAsNew(name, active.sections);
      if (problem !== null) return problem;
      if (active.revision > 0) await deleteWatchlist(active.name, active.revision);
      client.setQueryData<Watchlist[]>(WATCHLISTS_KEY, (old = []) =>
        old.filter((l) => l.name !== active.name),
      );
      return null;
    },
    remove: async () => {
      if (active === undefined) return;
      if (active.revision > 0) await deleteWatchlist(active.name, active.revision);
      const rest = lists.filter((l) => l.name !== active.name);
      setActive(rest[0]?.name ?? 'Default');
      // The last one gone: the backend offers its built-in Default again.
      if (rest.length === 0) void client.invalidateQueries({ queryKey: WATCHLISTS_KEY });
      else client.setQueryData(WATCHLISTS_KEY, rest);
      useUiStore.getState().showToast(`Deleted the watchlist “${active.name}”`);
    },
  };
}
