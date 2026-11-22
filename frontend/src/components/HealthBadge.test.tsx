import { screen } from '@testing-library/react';

import { renderWithQuery, stubFetchJson } from '../test/render.tsx';
import { HealthBadge } from './HealthBadge.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HealthBadge', () => {
  it('shows ok with the backend version', async () => {
    stubFetchJson(200, { status: 'ok', version: '0.1.0', offline: false, providers: [] });
    renderWithQuery(<HealthBadge />);

    const badge = await screen.findByRole('status', { name: 'API' });
    expect(badge).toHaveAttribute('data-state', 'ok');
    expect(badge).toHaveAttribute('title', 'Backend v0.1.0');
  });

  it('flags offline mode', async () => {
    stubFetchJson(200, { status: 'ok', version: '0.1.0', offline: true, providers: [] });
    renderWithQuery(<HealthBadge />);

    expect(await screen.findByRole('status', { name: 'API offline data' })).toHaveAttribute(
      'data-state',
      'ok',
    );
  });

  it('shows down when the backend is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    renderWithQuery(<HealthBadge />);

    expect(await screen.findByRole('status', { name: 'API down' })).toHaveAttribute(
      'data-state',
      'down',
    );
  });
});
