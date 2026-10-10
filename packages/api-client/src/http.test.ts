import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { Http } from './http';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Http', () => {
  it('ajoute le jeton et sérialise la requête', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const http = new Http({
      baseUrl: 'http://api/api/',
      getAccessToken: () => 'abc',
      refreshAccessToken: async () => null,
      fetchImpl,
    });
    await http.request('POST', '/missions', {
      body: { a: 1 },
      query: { status: ['SEARCHING', 'ASSIGNED'], page: 2, empty: '' },
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://api/api/missions?status=SEARCHING%2CASSIGNED&page=2');
    expect(init.headers.Authorization).toBe('Bearer abc');
    expect(init.body).toBe('{"a":1}');
  });

  it('rafraîchit une seule fois la session pour des requêtes simultanées en 401', async () => {
    let token = 'expiré';
    const refresh = vi.fn(async () => {
      token = 'neuf';
      return token;
    });
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
      (init.headers as Record<string, string>).Authorization === 'Bearer neuf'
        ? jsonResponse(200, { ok: 1 })
        : jsonResponse(401, {}),
    );
    const http = new Http({
      baseUrl: 'http://api',
      getAccessToken: () => token,
      refreshAccessToken: refresh,
      fetchImpl: fetchImpl as never,
    });
    await Promise.all([http.request('GET', '/a'), http.request('GET', '/b')]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('transforme les erreurs en ApiError avec le message du serveur', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        message: 'Données invalides',
        errors: [{ path: 'phone', message: 'Numéro invalide' }],
      }),
    );
    const http = new Http({
      baseUrl: 'http://api',
      getAccessToken: () => null,
      refreshAccessToken: async () => null,
      fetchImpl,
    });
    const error = (await http
      .request('POST', '/x', { body: {} })
      .catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.fieldErrors[0]?.path).toBe('phone');
  });

  it('signale une erreur réseau', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    const http = new Http({
      baseUrl: 'http://api',
      getAccessToken: () => null,
      refreshAccessToken: async () => null,
      fetchImpl,
    });
    const error = (await http.request('GET', '/x').catch((e: unknown) => e)) as ApiError;
    expect(error.isNetwork).toBe(true);
  });
});
