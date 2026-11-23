import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/client.ts';
import { useSymbols } from '../api/market.ts';
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
  const symbols = useSymbols().data;
  const activeName = useWatchlistStore((s) => s.active);
  const setActive = useWatchlistStore((s) => s.setActive);
  const lists = query.data ?? [];
  const active = lists.find((l) => l.name === activeName) ?? lists[0];

  /** The list's current revision once every queued save is done (for a delete). */
  const settledRevision = async (name: string): Promise<number> => {
    await queue;
    return cached(client).find((l) => l.name === name)?.revision ?? 0;
  };

  const edit = (change: (sections: readonly WatchlistSection[]) => WatchlistSection[]) => {
    if (active === undefined) return;
    const { name } = active;
    // Symbols gone from the universe would make every save fail: they leave the list.
    const known = symbols === undefined ? null : new Set(symbols.map((s) => s.symbol));
    const sections = change(active.sections).map((s) =>
      known === null ? s : { ...s, symbols: s.symbols.filter((x) => known.has(x)) },
    );
    put(client, { ...active, sections });
    queue = queue.then(async () => {
      const latest = cached(client).find((l) => l.name === name);
      if (latest === undefined) return;
      try {
        const saved = await saveWatchlist(name, latest.revision, latest.sections);
        // Only the revision: the sections may already hold a newer edit, saved next.
        client.setQueryData<Watchlist[]>(WATCHLISTS_KEY, (old = []) =>
          old.map((l) => (l.name === name ? { ...l, revision: saved.revision } : l)),
        );
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
      const old = active.name;
      await queue;
      const sections = cached(client).find((l) => l.name === old)?.sections ?? active.sections;
      const problem = await saveAsNew(name, sections);
      if (problem !== null) return problem;
      const revision = await settledRevision(old);
      if (revision > 0) await deleteWatchlist(old, revision);
      client.setQueryData<Watchlist[]>(WATCHLISTS_KEY, (all = []) =>
        all.filter((l) => l.name !== old),
      );
      return null;
    },
    remove: async () => {
      if (active === undefined) return;
      const { name } = active;
      try {
        const revision = await settledRevision(name);
        if (revision > 0) await deleteWatchlist(name, revision);
      } catch (error) {
        failed(client, error);
        return;
      }
      const rest = cached(client).filter((l) => l.name !== name);
      setActive(rest[0]?.name ?? 'Default');
      // The last one gone: the backend offers its built-in Default again.
      if (rest.length === 0) void client.invalidateQueries({ queryKey: WATCHLISTS_KEY });
      else client.setQueryData(WATCHLISTS_KEY, rest);
      useUiStore.getState().showToast(`Deleted the watchlist “${name}”`);
    },
  };
}
