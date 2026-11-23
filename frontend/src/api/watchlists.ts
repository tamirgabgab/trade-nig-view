import { useQuery } from '@tanstack/react-query';

import { apiGet, apiPut, isRecord } from './client.ts';

export interface WatchlistSection {
  title: string;
  symbols: string[];
}

export interface Watchlist {
  name: string;
  /** 0 = the built-in default, not saved yet. */
  revision: number;
  sections: WatchlistSection[];
}

const path = (name: string) => `/watchlists/${encodeURIComponent(name)}`;

export function parseWatchlist(body: unknown): Watchlist {
  if (!isRecord(body) || typeof body['name'] !== 'string') {
    throw new Error('Unexpected watchlist response');
  }
  const raw = Array.isArray(body['sections']) ? (body['sections'] as unknown[]) : [];
  return {
    name: body['name'],
    revision: typeof body['revision'] === 'number' ? body['revision'] : 0,
    sections: raw.flatMap((s) =>
      isRecord(s) && typeof s['title'] === 'string' && Array.isArray(s['symbols'])
        ? [
            {
              title: s['title'],
              symbols: (s['symbols'] as unknown[]).filter(
                (x): x is string => typeof x === 'string',
              ),
            },
          ]
        : [],
    ),
  };
}

function parseWatchlists(body: unknown): Watchlist[] {
  if (!isRecord(body) || !Array.isArray(body['watchlists'])) {
    throw new Error('Unexpected watchlists response');
  }
  return (body['watchlists'] as unknown[]).map(parseWatchlist);
}

export const WATCHLISTS_KEY = ['watchlists'] as const;

/** Every watchlist (a built-in Default from the universe until one is saved). */
export function useWatchlists() {
  return useQuery({
    queryKey: WATCHLISTS_KEY,
    queryFn: ({ signal }) => apiGet('/watchlists', parseWatchlists, { signal }),
    staleTime: Infinity,
  });
}

export function saveWatchlist(
  name: string,
  revision: number,
  sections: readonly WatchlistSection[],
): Promise<Watchlist> {
  return apiPut(path(name), { revision, sections }, parseWatchlist);
}

export async function deleteWatchlist(name: string, revision: number): Promise<void> {
  const response = await fetch(`/api${path(name)}?revision=${String(revision)}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not delete the watchlist (${String(response.status)})`);
  }
}
