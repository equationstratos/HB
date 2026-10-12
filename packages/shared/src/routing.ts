import { type TransportMode } from './enums';
import { haversineMeters, type LatLng, type LineString, type Position } from './geo';

export interface RouteWaypoint extends LatLng {
  address?: string | null;
}

export interface ComputedRoute {
  mode: TransportMode;
  geometry: LineString;
  distanceMeters: number;
  durationSeconds: number;
  /** Vrai si le tracé est une approximation (lignes droites entre les points). */
  approximate: boolean;
  provider: string;
}

/** Vitesse moyenne en milieu urbain, en mètres par seconde. */
export const MODE_SPEED_MPS: Record<TransportMode, number> = {
  WALK: 1.3,
  BIKE: 4.2,
  CAR: 7.5,
  TRANSIT: 5.0,
};

/**
 * Facteur de détour appliqué aux lignes droites pour estimer la distance réelle
 * (les rues ne vont jamais tout droit).
 */
export const STRAIGHT_LINE_DETOUR: Record<TransportMode, number> = {
  WALK: 1.3,
  BIKE: 1.3,
  CAR: 1.4,
  TRANSIT: 1.2,
};

/**
 * Tolérance d'écart par défaut, en mètres. Plus large pour les transports en commun et la
 * voiture, dont le tracé est moins prévisible.
 */
export const DEFAULT_TOLERANCE_METERS: Record<TransportMode, number> = {
  WALK: 150,
  BIKE: 200,
  CAR: 400,
  TRANSIT: 600,
};

/** Durée d'immobilité au-delà de laquelle on s'inquiète (hors étapes). */
export const STOPPED_THRESHOLD_MS: Record<TransportMode, number> = {
  WALK: 8 * 60_000,
  BIKE: 8 * 60_000,
  CAR: 15 * 60_000,
  TRANSIT: 15 * 60_000,
};

/** Tracé « ligne droite entre étapes », utilisé en test, en secours et pour les transports. */
export function straightLineRoute(
  points: readonly RouteWaypoint[],
  mode: TransportMode,
): ComputedRoute {
  const coordinates: Position[] = points.map((p) => [p.lng, p.lat]);
  let crow = 0;
  for (let i = 1; i < points.length; i++) crow += haversineMeters(points[i - 1]!, points[i]!);
  const distanceMeters = Math.round(crow * STRAIGHT_LINE_DETOUR[mode]);
  return {
    mode,
    geometry: { type: 'LineString', coordinates },
    distanceMeters,
    durationSeconds: Math.round(distanceMeters / MODE_SPEED_MPS[mode]),
    approximate: true,
    provider: 'straight-line',
  };
}

/** Marge accordée avant de déclarer un retard : 25 % de la durée, au moins 10 minutes. */
export function lateMarginSeconds(durationSeconds: number): number {
  return Math.max(10 * 60, Math.round(durationSeconds * 0.25));
}

export function expectedArrival(departureAt: Date, durationSeconds: number): Date {
  return new Date(departureAt.getTime() + durationSeconds * 1000);
}

/** Fin du créneau occupé par le garde : arrivée prévue + marge de retard. */
export function slotEnd(departureAt: Date, durationSeconds: number): Date {
  return new Date(
    departureAt.getTime() + (durationSeconds + lateMarginSeconds(durationSeconds)) * 1000,
  );
}
