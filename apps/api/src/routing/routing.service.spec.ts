import { Logger } from '@nestjs/common';
import {
  ComputedRoute,
  MODE_SPEED_MPS,
  RouteWaypoint,
  straightLineRoute,
  TransportMode,
} from '@hb/shared';
import {
  OsrmRoutingProvider,
  RoutingProvider,
  StraightLineRoutingProvider,
} from '../integrations/routing.provider';
import { RoutingService } from './routing.service';

const CHATELET: RouteWaypoint = { lat: 48.8584, lng: 2.347 };
const HOTEL_DE_VILLE: RouteWaypoint = { lat: 48.8565, lng: 2.3525 };
const BASTILLE: RouteWaypoint = { lat: 48.8532, lng: 2.3691 };

/** Tracé « dans les rues » factice : un détour par un point intermédiaire. */
function streetRoute(points: RouteWaypoint[], mode: TransportMode): ComputedRoute {
  const [a, b] = [points[0]!, points[points.length - 1]!];
  return {
    mode,
    geometry: {
      type: 'LineString',
      coordinates: [
        [a.lng, a.lat],
        [b.lng, a.lat],
        [b.lng, b.lat],
      ],
    },
    distanceMeters: 1000,
    durationSeconds: 700,
    approximate: false,
    provider: 'osrm',
  };
}

function fakeProvider(
  compute: (points: RouteWaypoint[], mode: TransportMode) => Promise<ComputedRoute>,
): RoutingProvider & { compute: jest.Mock } {
  return { name: 'osrm', compute: jest.fn(compute) };
}

describe('RoutingService', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('renvoie le tracé du fournisseur tel quel', async () => {
    const provider = fakeProvider(async (points, mode) => streetRoute(points, mode));
    const route = await new RoutingService(provider).compute({
      mode: 'WALK',
      points: [CHATELET, BASTILLE],
    });
    expect(provider.compute).toHaveBeenCalledWith([CHATELET, BASTILLE], 'WALK');
    expect(route).toEqual(streetRoute([CHATELET, BASTILLE], 'WALK'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('retombe sur une ligne droite signalée approximative si le fournisseur échoue', async () => {
    const provider = fakeProvider(async () => {
      throw new Error('OSRM 503');
    });
    const route = await new RoutingService(provider).compute({
      mode: 'BIKE',
      points: [CHATELET, BASTILLE],
    });
    expect(route).toEqual(straightLineRoute([CHATELET, BASTILLE], 'BIKE'));
    expect(route.approximate).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('OSRM 503'));
  });

  it('trace les transports tronçon par tronçon, à pied dans les rues', async () => {
    const provider = fakeProvider(async (points, mode) => streetRoute(points, mode));
    const route = await new RoutingService(provider).compute({
      mode: 'TRANSIT',
      points: [CHATELET, HOTEL_DE_VILLE, BASTILLE],
    });
    expect(provider.compute.mock.calls).toEqual([
      [[CHATELET, HOTEL_DE_VILLE], 'WALK'],
      [[HOTEL_DE_VILLE, BASTILLE], 'WALK'],
    ]);
    // Deux tronçons de trois points, le point de jonction n'est pas répété.
    expect(route.geometry.coordinates).toEqual([
      [CHATELET.lng, CHATELET.lat],
      [HOTEL_DE_VILLE.lng, CHATELET.lat],
      [HOTEL_DE_VILLE.lng, HOTEL_DE_VILLE.lat],
      [BASTILLE.lng, HOTEL_DE_VILLE.lat],
      [BASTILLE.lng, BASTILLE.lat],
    ]);
    expect(route).toMatchObject({
      mode: 'TRANSIT',
      distanceMeters: 2000,
      durationSeconds: Math.round(2000 / MODE_SPEED_MPS.TRANSIT),
      approximate: false,
      provider: 'osrm',
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('remplace par une ligne droite le seul tronçon en échec', async () => {
    const provider = fakeProvider(async (points, mode) => {
      if (points[0] === HOTEL_DE_VILLE) throw new Error('OSRM : NoRoute');
      return streetRoute(points, mode);
    });
    const route = await new RoutingService(provider).compute({
      mode: 'TRANSIT',
      points: [CHATELET, HOTEL_DE_VILLE, BASTILLE],
    });
    const straight = straightLineRoute([HOTEL_DE_VILLE, BASTILLE], 'TRANSIT');
    expect(route.geometry.coordinates).toEqual([
      [CHATELET.lng, CHATELET.lat],
      [HOTEL_DE_VILLE.lng, CHATELET.lat],
      [HOTEL_DE_VILLE.lng, HOTEL_DE_VILLE.lat],
      [BASTILLE.lng, BASTILLE.lat],
    ]);
    expect(route.distanceMeters).toBe(1000 + straight.distanceMeters);
    expect(route.durationSeconds).toBe(
      Math.round((1000 + straight.distanceMeters) / MODE_SPEED_MPS.TRANSIT),
    );
    expect(route.approximate).toBe(true);
    expect(route.provider).toBe('osrm');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Tronçon 2/2'));
  });

  it('signale un trajet en transports entièrement approximatif si le service est en panne', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const service = new RoutingService(new OsrmRoutingProvider('https://routing.openstreetmap.de'));
    const route = await service.compute({
      mode: 'TRANSIT',
      points: [CHATELET, HOTEL_DE_VILLE, BASTILLE],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url] of fetchMock.mock.calls) expect(String(url)).toContain('/routed-foot/');
    expect(route.geometry.coordinates).toEqual([
      [CHATELET.lng, CHATELET.lat],
      [HOTEL_DE_VILLE.lng, HOTEL_DE_VILLE.lat],
      [BASTILLE.lng, BASTILLE.lat],
    ]);
    expect(route.approximate).toBe(true);
    expect(route.provider).toBe('straight-line');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('garde l’estimation des transports avec le fournisseur « straight », sans alerte', async () => {
    const points = [CHATELET, HOTEL_DE_VILLE, BASTILLE];
    const route = await new RoutingService(new StraightLineRoutingProvider()).compute({
      mode: 'TRANSIT',
      points,
    });
    const expected = straightLineRoute(points, 'TRANSIT');
    expect(route.geometry).toEqual(expected.geometry);
    expect(route.approximate).toBe(true);
    expect(route.provider).toBe('straight-line');
    // Arrondi par tronçon : au plus un mètre d'écart par tronçon.
    expect(Math.abs(route.distanceMeters - expected.distanceMeters)).toBeLessThanOrEqual(2);
    expect(warn).not.toHaveBeenCalled();
  });
});
