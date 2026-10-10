import { RouteWaypoint, TransportMode } from '@hb/shared';
import { validateEnv } from '../config/env';
import { OsrmRoutingProvider, ROUTING_USER_AGENT } from './routing.provider';

const POINTS: RouteWaypoint[] = [
  { lat: 48.8584, lng: 2.347, address: 'Place du Châtelet' },
  { lat: 48.8532, lng: 2.3691, address: 'Place de la Bastille' },
];

const GEOMETRY = {
  type: 'LineString',
  coordinates: [
    [2.34702, 48.85838],
    [2.35112, 48.85712],
    [2.36905, 48.85325],
  ],
};

const reply = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('OsrmRoutingProvider', () => {
  const provider = new OsrmRoutingProvider('https://routing.openstreetmap.de');
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    // Une réponse neuve par appel : le corps d'une Response ne se lit qu'une fois.
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () =>
        reply({ code: 'Ok', routes: [{ geometry: GEOMETRY, distance: 1987.4, duration: 1430.6 }] }),
      );
  });

  afterEach(() => fetchMock.mockRestore());

  const calledUrl = () => String(fetchMock.mock.calls[0]![0]);
  const calledInit = () => fetchMock.mock.calls[0]![1] as RequestInit;

  it.each<[TransportMode, string]>([
    ['WALK', 'routed-foot'],
    ['BIKE', 'routed-bike'],
    ['CAR', 'routed-car'],
    ['TRANSIT', 'routed-foot'],
  ])('interroge le serveur du bon profil (%s → %s)', async (mode, instance) => {
    await provider.compute(POINTS, mode);
    expect(calledUrl()).toBe(
      `https://routing.openstreetmap.de/${instance}/route/v1/driving/` +
        '2.347,48.8584;2.3691,48.8532?overview=full&geometries=geojson',
    );
  });

  it('s’identifie auprès du serveur et borne l’attente', async () => {
    await provider.compute(POINTS, 'WALK');
    const headers = calledInit().headers as Record<string, string>;
    expect(headers['User-Agent']).toBe(ROUTING_USER_AGENT);
    expect(ROUTING_USER_AGENT).toMatch(
      /^HB\/[\d.]+ \(\+https:\/\/github\.com\/equationstratos\/HB\)$/,
    );
    expect(calledInit().signal).toBeInstanceOf(AbortSignal);
  });

  it('renvoie le tracé complet dans les rues, distance et durée arrondies', async () => {
    const route = await provider.compute(POINTS, 'WALK');
    expect(route).toEqual({
      mode: 'WALK',
      geometry: GEOMETRY,
      distanceMeters: 1987,
      durationSeconds: 1431,
      approximate: false,
      provider: 'osrm',
    });
  });

  it('ignore l’altitude éventuelle des coordonnées', async () => {
    fetchMock.mockResolvedValue(
      reply({
        code: 'Ok',
        routes: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [2.347, 48.858, 35],
                [2.369, 48.853, 40],
              ],
            },
            distance: 10,
            duration: 8,
          },
        ],
      }),
    );
    const route = await provider.compute(POINTS, 'WALK');
    expect(route.geometry.coordinates).toEqual([
      [2.347, 48.858],
      [2.369, 48.853],
    ]);
  });

  it('utilise tel quel un serveur auto-hébergé', async () => {
    await new OsrmRoutingProvider('http://osrm.local:5000/').compute(POINTS, 'BIKE');
    expect(calledUrl()).toMatch(/^http:\/\/osrm\.local:5000\/route\/v1\/driving\/2\.347,48\.8584;/);
  });

  it('choisit le serveur auto-hébergé du profil avec {profile}', async () => {
    const own = new OsrmRoutingProvider('https://osrm.example.org/{profile}/');
    await own.compute(POINTS, 'CAR');
    await own.compute(POINTS, 'TRANSIT');
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(
      /^https:\/\/osrm\.example\.org\/car\/route\//,
    );
    expect(String(fetchMock.mock.calls[1]![0])).toMatch(
      /^https:\/\/osrm\.example\.org\/foot\/route\//,
    );
  });

  it.each([
    ['une erreur HTTP', reply('<html>Too Many Requests</html>', 429), /OSRM 429/],
    ['un code d’erreur OSRM', reply({ code: 'InvalidQuery', message: '…' }, 400), /InvalidQuery/],
    [
      'aucun itinéraire',
      reply({ code: 'NoRoute', message: 'Impossible route', routes: [] }),
      /NoRoute/,
    ],
    ['une réponse illisible', reply('pas du json'), /illisible/],
    [
      'un tracé invalide',
      reply({ code: 'Ok', routes: [{ geometry: 'encoded', distance: 1, duration: 1 }] }),
      /tracé invalide/,
    ],
    [
      'une coordonnée invalide',
      reply({
        code: 'Ok',
        routes: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [2.3, 48.8],
                [null, 48.9],
              ],
            },
            distance: 1,
            duration: 1,
          },
        ],
      }),
      /coordonnée invalide/,
    ],
    [
      'une durée manquante',
      reply({ code: 'Ok', routes: [{ geometry: GEOMETRY, distance: 12 }] }),
      /durée invalide/,
    ],
  ])('lève une erreur pour %s', async (_label, response, message) => {
    fetchMock.mockResolvedValue(response);
    await expect(provider.compute(POINTS, 'WALK')).rejects.toThrow(message);
  });

  it('propage une panne réseau', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(provider.compute(POINTS, 'WALK')).rejects.toThrow('fetch failed');
  });
});

describe('configuration des itinéraires', () => {
  it('trace dans les rues (OSRM) par défaut', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://hb:hb@localhost:5432/hb',
      JWT_ACCESS_SECRET: 'x'.repeat(32),
      DATA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    });
    expect(env.ROUTING_PROVIDER).toBe('osrm');
    expect(env.OSRM_URL).toBe('https://routing.openstreetmap.de');
  });
});
