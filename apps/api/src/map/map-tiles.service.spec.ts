import { BadGatewayException, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';
import { envSchema } from '../config/env';
import {
  MapTilesService,
  TILE_CACHE_MAX_ENTRIES,
  TILE_TTL_SECONDS,
  upstreamTileUrl,
} from './map-tiles.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = () => new Response(PNG, { headers: { 'Content-Type': 'image/png' } });

function service(): MapTilesService {
  const env: Record<string, string> = {
    MAP_TILE_URL: 'https://{s}.tuiles.example/{z}/{x}/{y}{r}.png?key=secret',
    MAP_TILE_USER_AGENT: 'HB/test',
  };
  return new MapTilesService({ get: (key: string) => env[key] } as unknown as AppConfig);
}

describe('adresse du fournisseur de tuiles', () => {
  it('remplace zoom, colonne, ligne, sous-domaine et suffixe haute densité', () => {
    expect(upstreamTileUrl('https://tile.openstreetmap.org/{z}/{x}/{y}.png', 12, 2074, 1409)).toBe(
      'https://tile.openstreetmap.org/12/2074/1409.png',
    );
    expect(upstreamTileUrl('https://{s}.carte.example/{z}/{x}/{y}{r}.png?key=k', 2, 1, 0)).toBe(
      'https://b.carte.example/2/1/0.png?key=k',
    );
  });

  it('n’accepte en configuration qu’une adresse http(s) avec {z}, {x} et {y}', () => {
    const valid = (url?: string) => envSchema.shape.MAP_TILE_URL.safeParse(url).success;
    expect(valid(undefined)).toBe(true); // OpenStreetMap par défaut
    expect(valid('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=k')).toBe(
      true,
    );
    expect(valid('https://tuiles.example/{z}/{x}.png')).toBe(false);
    expect(valid('ftp://tuiles.example/{z}/{x}/{y}.png')).toBe(false);
  });
});

describe('MapTilesService', () => {
  let upstream: jest.SpyInstance;

  beforeEach(() => {
    upstream = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(png()));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('identifie l’appli auprès du fournisseur et garde la tuile en cache', async () => {
    const tiles = service();
    const tile = await tiles.tile(12, 2074, 1409);
    expect(tile.contentType).toBe('image/png');
    expect(Buffer.compare(tile.data, PNG)).toBe(0);

    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://a.tuiles.example/12/2074/1409.png?key=secret');
    expect(init.headers).toMatchObject({ 'User-Agent': 'HB/test' });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    await tiles.tile(12, 2074, 1409);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('ne fait qu’une requête au fournisseur pour des demandes simultanées', async () => {
    let release!: (res: Response) => void;
    upstream.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)));
    const tiles = service();
    const waiting = [tiles.tile(5, 16, 11), tiles.tile(5, 16, 11), tiles.tile(5, 16, 11)];
    release(png());
    const results = await Promise.all(waiting);
    expect(upstream).toHaveBeenCalledTimes(1);
    results.forEach((tile) => expect(tile.contentType).toBe('image/png'));
  });

  it('répond 502 sans garder l’échec en cache', async () => {
    const tiles = service();
    upstream
      .mockResolvedValueOnce(new Response('indisponible', { status: 503 }))
      .mockResolvedValueOnce(
        new Response('<html>clé requise</html>', { headers: { 'Content-Type': 'text/html' } }),
      )
      .mockRejectedValueOnce(new DOMException('délai dépassé', 'TimeoutError'));
    for (let i = 0; i < 3; i++) {
      await expect(tiles.tile(3, 4, 2)).rejects.toBeInstanceOf(BadGatewayException);
    }
    await expect(tiles.tile(3, 4, 2)).resolves.toMatchObject({ contentType: 'image/png' });
    expect(upstream).toHaveBeenCalledTimes(4);
  });

  it('redemande une tuile après sa durée de conservation', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const tiles = service();
    await tiles.tile(10, 518, 352);
    now.mockReturnValue(1_000_000 + TILE_TTL_SECONDS * 1000 - 1);
    await tiles.tile(10, 518, 352);
    expect(upstream).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000_000 + TILE_TTL_SECONDS * 1000 + 1);
    await tiles.tile(10, 518, 352);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('écarte d’abord les tuiles les moins récemment vues', async () => {
    const tiles = service();
    for (let x = 0; x < TILE_CACHE_MAX_ENTRIES; x++) await tiles.tile(19, x, 0);
    await tiles.tile(19, 0, 0); // revue : passe en fin de file
    await tiles.tile(19, TILE_CACHE_MAX_ENTRIES, 0); // écarte la tuile x = 1
    expect(upstream).toHaveBeenCalledTimes(TILE_CACHE_MAX_ENTRIES + 1);

    await tiles.tile(19, 0, 0);
    expect(upstream).toHaveBeenCalledTimes(TILE_CACHE_MAX_ENTRIES + 1);
    await tiles.tile(19, 1, 0);
    expect(upstream).toHaveBeenCalledTimes(TILE_CACHE_MAX_ENTRIES + 2);
  });
});
