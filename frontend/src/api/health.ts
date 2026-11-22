import { useQuery } from '@tanstack/react-query';

import { apiGet, fieldsOf, isRecord, type Schemas } from './client.ts';

export type Health = Pick<Schemas['HealthResponse'], 'status' | 'version' | 'offline'>;

export function parseHealth(body: unknown): Health {
  if (isRecord(body)) {
    const field = fieldsOf<Schemas['HealthResponse']>(body);
    const version = field('version');
    const offline = field('offline');
    if (field('status') === 'ok' && typeof version === 'string' && typeof offline === 'boolean') {
      return { status: 'ok', version, offline };
    }
  }
  throw new Error('Unexpected /api/health response');
}

export const HEALTH_POLL_MS = 10_000;

/** Polls GET /api/health so the status badge reacts when the backend stops or starts. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet('/health', parseHealth, { signal }),
    refetchInterval: HEALTH_POLL_MS,
    retry: false,
    staleTime: 0,
  });
}
