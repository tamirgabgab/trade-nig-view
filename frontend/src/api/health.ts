import { useQuery } from '@tanstack/react-query';

import { apiGet, isRecord } from './client.ts';

export interface Health {
  status: 'ok';
  version: string;
  offline: boolean;
}

export function parseHealth(body: unknown): Health {
  if (
    isRecord(body) &&
    body['status'] === 'ok' &&
    typeof body['version'] === 'string' &&
    typeof body['offline'] === 'boolean'
  ) {
    return { status: 'ok', version: body['version'], offline: body['offline'] };
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
