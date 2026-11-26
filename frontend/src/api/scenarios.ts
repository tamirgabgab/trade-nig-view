import { apiDelete, apiGet, apiPut, isRecord } from './client.ts';

export interface ScenarioSummary {
  name: string;
  revision: number;
}

/** A saved planner scenario: `state` is checked by the planner when it is loaded. */
export interface SavedScenario extends ScenarioSummary {
  state: unknown;
}

const path = (name: string) => `/planner/scenarios/${encodeURIComponent(name)}`;

function parseSummary(body: unknown): ScenarioSummary {
  if (!isRecord(body) || typeof body['name'] !== 'string' || typeof body['revision'] !== 'number') {
    throw new Error('Unexpected scenario response');
  }
  return { name: body['name'], revision: body['revision'] };
}

function parseSummaries(body: unknown): ScenarioSummary[] {
  if (!isRecord(body) || !Array.isArray(body['scenarios'])) {
    throw new Error('Unexpected /api/planner/scenarios response');
  }
  return (body['scenarios'] as unknown[]).map(parseSummary);
}

/** The saved scenarios, newest first. */
export const fetchScenarios = () => apiGet('/planner/scenarios', parseSummaries);

export const fetchScenario = (name: string): Promise<SavedScenario> =>
  apiGet(path(name), (body) => ({
    ...parseSummary(body),
    state: isRecord(body) ? body['state'] : null,
  }));

/** Save on top of `revision` (0 = a new scenario). */
export const saveScenario = (name: string, revision: number, state: object) =>
  apiPut(path(name), { revision, state }, parseSummary);

export const deleteScenario = (name: string, revision: number) => apiDelete(path(name), revision);
