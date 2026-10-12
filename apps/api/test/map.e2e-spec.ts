import { DEFAULT_MAP_ATTRIBUTION } from '@hb/shared';
import { TestApp, createTestApp, sleep } from './helpers';

/** Le fournisseur de tuiles n'est jamais joint pendant les tests : fetch est simulé. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x2a]);
const png = () => new Response(PNG, { headers: { 'Content-Type': 'image/png' } });

describe('Fond de carte relayé par l’API', () => {
  let t: TestApp;
  let upstream: jest.SpyInstance;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    upstream = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(png()));
  });

  afterEach(() => upstream.mockRestore());

  it('donne les réglages de la carte sans authentification', async () => {
    const res = await t.http().get('/api/map/config').expect(200);
    expect(res.body).toEqual({
      tileUrl: '/api/map/tiles/{z}/{x}/{y}.png',
      attribution: DEFAULT_MAP_ATTRIBUTION,
      maxZoom: 19,
    });
  });

  it('refuse des coordonnées invalides sans interroger le fournisseur', async () => {
    const invalid = [
      '20/0/0', // zoom trop grand
      '1/2/0', // hors de la carte
      '1/0/2',
      '19/524288/0',
      '0/0/-1',
      '01/0/0',
      '1.5/0/0',
      '1e1/0/0',
      'a/0/0',
    ];
    for (const path of invalid) {
      await t.http().get(`/api/map/tiles/${path}.png`).expect(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('sert la tuile sans jeton, avec des en-têtes adaptés à la WebView, puis depuis le cache', async () => {
    const res = await t.http().get('/api/map/tiles/12/2074/1409.png').expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=604800');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    // Limite propre aux tuiles, bien plus large que celle des autres routes.
    expect(res.headers['x-ratelimit-limit']).toBe('1200');
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);

    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tile.openstreetmap.org/12/2074/1409.png');
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^HB\//);

    // Un jeton invalide n'empêche pas l'affichage de la carte.
    await t
      .http()
      .get('/api/map/tiles/12/2074/1409.png')
      .set('Authorization', 'Bearer invalide')
      .expect(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('ne demande qu’une fois une tuile réclamée en même temps', async () => {
    let release!: (res: Response) => void;
    upstream.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)));
    const requests = Array.from({ length: 4 }, () =>
      t
        .http()
        .get('/api/map/tiles/13/4149/2818.png')
        .then((res) => res.status),
    );
    while (upstream.mock.calls.length === 0) await sleep(10);
    await sleep(200); // les autres requêtes attendent la même tuile
    release(png());
    expect(await Promise.all(requests)).toEqual([200, 200, 200, 200]);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('répond 502 si le fournisseur échoue, sans garder l’échec en cache', async () => {
    upstream
      .mockResolvedValueOnce(new Response('indisponible', { status: 503 }))
      .mockRejectedValueOnce(new DOMException('délai dépassé', 'TimeoutError'));
    await t.http().get('/api/map/tiles/14/8298/5636.png').expect(502);
    await t.http().get('/api/map/tiles/14/8298/5636.png').expect(502);
    await t.http().get('/api/map/tiles/14/8298/5636.png').expect(200);
    expect(upstream).toHaveBeenCalledTimes(3);
  });
});
