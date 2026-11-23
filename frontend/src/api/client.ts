/**
 * Minimal JSON client for the ChartLab API. Errors follow RFC 9457 problem+json.
 * Response types come from the backend OpenAPI schema: `src/api/schema.ts` is generated
 * (`scripts/gen-api.ps1`), never edited by hand, and the `check:api` gate fails when it is stale.
 */

import type { components } from './schema.ts';

/** Response and model schemas of the API, exactly as the backend declares them. */
export type Schemas = components['schemas'];

export interface Problem {
  title: string;
  status: number;
  detail: string;
  code: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(problem: Problem) {
    super(problem.detail || problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toProblem(status: number, statusText: string, body: unknown): Problem {
  if (isRecord(body) && typeof body['detail'] === 'string') {
    return {
      title: typeof body['title'] === 'string' ? body['title'] : statusText,
      status,
      detail: body['detail'],
      code: typeof body['code'] === 'string' ? body['code'] : 'unknown',
    };
  }
  return { title: statusText, status, detail: statusText, code: 'unknown' };
}

/**
 * GET `/api${path}` and validate the body with `parse`.
 * `parse` receives `unknown` so every response is checked at runtime, never blindly cast.
 */
export async function apiGet<T>(
  path: string,
  parse: (body: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  const response = await fetch(`/api${path}`, { ...init, headers });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(toProblem(response.status, response.statusText, body));
  }
  return parse(body);
}

/** POST `body` as JSON to `/api${path}` and validate the response with `parse`. */
export async function apiPost<T>(
  path: string,
  body: unknown,
  parse: (body: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  return apiGet(path, parse, { ...init, method: 'POST', headers, body: JSON.stringify(body) });
}

/** PUT `body` as JSON to `/api${path}` and validate the response with `parse`. */
export async function apiPut<T>(
  path: string,
  body: unknown,
  parse: (body: unknown) => T,
  init: RequestInit = {},
): Promise<T> {
  return apiGet(path, parse, {
    ...init,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Field reader that only accepts keys of the schema type `T`, so a renamed or removed API field
 * breaks the build instead of silently reading `undefined`. Values stay `unknown` and are checked.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T only narrows the keys
export function fieldsOf<T>(record: Record<string, unknown>): (key: keyof T & string) => unknown {
  return (key) => record[key];
}

export { isRecord };

/** DELETE `path` on top of `revision`; a missing document counts as deleted. */
export async function apiDelete(path: string, revision: number): Promise<void> {
  const response = await fetch(`/api${path}?revision=${String(revision)}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(toProblem(response.status, response.statusText, body));
  }
}
