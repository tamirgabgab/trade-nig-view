/**
 * Minimal JSON client for the ChartLab API. Errors follow RFC 9457 problem+json.
 * From R1 on, response types are generated from the backend OpenAPI schema (src/api/schema.ts).
 */

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

export { isRecord };
