import { stubFetchJson } from '../test/render.tsx';
import { ApiError, apiGet } from './client.ts';
import { parseHealth } from './health.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiGet', () => {
  it('parses a successful response', async () => {
    stubFetchJson(200, { status: 'ok', version: '1.2.3', offline: false, providers: [] });

    await expect(apiGet('/health', parseHealth)).resolves.toEqual({
      status: 'ok',
      version: '1.2.3',
      offline: false,
    });
  });

  it('turns problem+json into an ApiError', async () => {
    stubFetchJson(404, {
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Unknown symbol XYZ',
      code: 'symbol_not_found',
    });

    const error: unknown = await apiGet('/bars', parseHealth).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: 'symbol_not_found',
      message: 'Unknown symbol XYZ',
    });
  });

  it('rejects a body that does not match the expected shape', async () => {
    stubFetchJson(200, { status: 'ok' });

    await expect(apiGet('/health', parseHealth)).rejects.toThrow('Unexpected /api/health response');
  });
});
