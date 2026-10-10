import {
  APP_NAME,
  ComputedRoute,
  LineString,
  Position,
  RouteWaypoint,
  straightLineRoute,
  TransportMode,
} from '@hb/shared';

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
 * Les serveurs publics exigent une application identifiable : nom, version et adresse du
 * projet (politique d'usage de routing.openstreetmap.de).
 */
export const ROUTING_USER_AGENT = `${APP_NAME}/0.1 (+https://github.com/equationstratos/HB)`;

/** Profil OSRM par mode. Les transports en commun sont tracés à pied, d'arrêt en arrêt. */
const OSRM_PROFILES: Record<TransportMode, 'foot' | 'bike' | 'car'> = {
  WALK: 'foot',
  BIKE: 'bike',
  CAR: 'car',
  TRANSIT: 'foot',
};

/** Réponse OSRM non vérifiée : chaque champ est contrôlé avant usage. */
interface OsrmResponse {
  code?: unknown;
  routes?: unknown;
}

interface OsrmRoute {
  geometry?: unknown;
  distance?: unknown;
  duration?: unknown;
}

/** Tracé GeoJSON reçu du serveur, vérifié avant d'être enregistré puis surveillé. */
function parseLineString(value: unknown): LineString {
  const geometry = value as { type?: unknown; coordinates?: unknown } | null | undefined;
  const coordinates = geometry?.coordinates;
  if (geometry?.type !== 'LineString' || !Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('OSRM : tracé invalide');
  }
  return {
    type: 'LineString',
    coordinates: coordinates.map((c: unknown): Position => {
      if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) {
        throw new Error('OSRM : coordonnée invalide');
      }
      return [c[0] as number, c[1] as number];
    }),
  };
}

function parseAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('OSRM : distance ou durée invalide');
  }
  return Math.round(value);
}

/**
 * Serveur OSRM. Par défaut, celui de FOSSGIS (OpenStreetMap Allemagne), qui expose un serveur
 * par profil : https://routing.openstreetmap.de/routed-{foot|bike|car}. Un serveur OSRM ne sert
 * que le profil avec lequel ses données ont été préparées : pour en héberger plusieurs, placer
 * `{profile}` dans OSRM_URL (ex. https://osrm.example.org/{profile}).
 */
export class OsrmRoutingProvider implements RoutingProvider {
  readonly name = 'osrm';

  constructor(private readonly baseUrl: string) {}

  async compute(points: RouteWaypoint[], mode: TransportMode): Promise<ComputedRoute> {
    const profile = OSRM_PROFILES[mode];
    const root = this.baseUrl.replace(/\/+$/, '');
    const base = root.includes('{profile}')
      ? root.replaceAll('{profile}', profile)
      : root.includes('routing.openstreetmap.de')
        ? `${root}/routed-${profile}`
        : root;
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    // Le segment « driving » est ignoré par osrm-routed : c'est le serveur qui fixe le profil.
    const res = await fetch(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson`, {
      headers: { Accept: 'application/json', 'User-Agent': ROUTING_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Les erreurs OSRM ont aussi un corps JSON ({ code, message }) ; un proxy peut renvoyer du HTML.
    const json = (await res.json().catch(() => null)) as OsrmResponse | null;
    const code = typeof json?.code === 'string' ? json.code : null;
    if (!res.ok) throw new Error(`OSRM ${res.status}${code ? ` (${code})` : ''}`);
    const routes: unknown[] = json && Array.isArray(json.routes) ? json.routes : [];
    const route = routes[0] as OsrmRoute | null | undefined;
    if (code !== 'Ok' || !route) throw new Error(`OSRM : ${code ?? 'réponse illisible'}`);
    return {
      mode,
      geometry: parseLineString(route.geometry),
      distanceMeters: parseAmount(route.distance),
      durationSeconds: parseAmount(route.duration),
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
