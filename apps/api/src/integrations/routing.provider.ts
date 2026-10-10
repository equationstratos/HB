import { ComputedRoute, RouteWaypoint, straightLineRoute, TransportMode } from '@hb/shared';

export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');

export interface RoutingProvider {
  readonly name: string;
  compute(points: RouteWaypoint[], mode: TransportMode): Promise<ComputedRoute>;
}

export class StraightLineRoutingProvider implements RoutingProvider {
  readonly name = 'straight-line';

  async compute(points: RouteWaypoint[], mode: TransportMode): Promise<ComputedRoute> {
    return straightLineRoute(points, mode);
  }
}

const TIMEOUT_MS = 8000;

/**
 * Serveur OSRM. Par défaut, celui d'OpenStreetMap Allemagne qui expose les profils piéton,
 * vélo et voiture : https://routing.openstreetmap.de/routed-{foot|bike|car}.
 */
export class OsrmRoutingProvider implements RoutingProvider {
  readonly name = 'osrm';

  constructor(private readonly baseUrl: string) {}

  async compute(points: RouteWaypoint[], mode: TransportMode): Promise<ComputedRoute> {
    const profile = mode === 'WALK' ? 'foot' : mode === 'BIKE' ? 'bike' : 'car';
    const base = this.baseUrl.includes('routing.openstreetmap.de')
      ? `${this.baseUrl.replace(/\/$/, '')}/routed-${profile}`
      : this.baseUrl.replace(/\/$/, '');
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const res = await fetch(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const json = (await res.json()) as {
      code: string;
      routes?: { geometry: ComputedRoute['geometry']; distance: number; duration: number }[];
    };
    const route = json.routes?.[0];
    if (json.code !== 'Ok' || !route) throw new Error(`OSRM : ${json.code}`);
    return {
      mode,
      geometry: route.geometry,
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      approximate: false,
      provider: this.name,
    };
  }
}

/** OpenRouteService (clé d'API requise). */
export class OrsRoutingProvider implements RoutingProvider {
  readonly name = 'openrouteservice';

  constructor(private readonly apiKey: string) {}

  async compute(points: RouteWaypoint[], mode: TransportMode): Promise<ComputedRoute> {
    const profile =
      mode === 'WALK' ? 'foot-walking' : mode === 'BIKE' ? 'cycling-regular' : 'driving-car';
    const res = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
      method: 'POST',
      headers: { Authorization: this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OpenRouteService ${res.status}`);
    const json = (await res.json()) as {
      features?: {
        geometry: ComputedRoute['geometry'];
        properties: { summary: { distance: number; duration: number } };
      }[];
    };
    const feature = json.features?.[0];
    if (!feature) throw new Error('OpenRouteService : aucun itinéraire');
    return {
      mode,
      geometry: feature.geometry,
      distanceMeters: Math.round(feature.properties.summary.distance),
      durationSeconds: Math.round(feature.properties.summary.duration),
      approximate: false,
      provider: this.name,
    };
  }
}
