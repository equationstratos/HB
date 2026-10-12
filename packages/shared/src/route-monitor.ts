import { DeviationType, type TransportMode } from './enums';
import { haversineMeters, projectOnPolyline, type LatLng, type Position } from './geo';
import { DEFAULT_TOLERANCE_METERS, STOPPED_THRESHOLD_MS } from './routing';

/**
 * Surveillance du trajet : fonctions pures, appelées par l'API à chaque position reçue de la
 * cliente. L'état est conservé en base entre deux positions.
 */

export interface MonitorState {
  lastPingAt: string | null;
  offRouteSince: string | null;
  offRouteAlerted: boolean;
  stationaryAnchor: LatLng | null;
  stationarySince: string | null;
  stoppedAlerted: boolean;
  /** Distance la plus avancée atteinte le long du tracé. */
  progressMeters: number;
}

export const INITIAL_MONITOR_STATE: MonitorState = {
  lastPingAt: null,
  offRouteSince: null,
  offRouteAlerted: false,
  stationaryAnchor: null,
  stationarySince: null,
  stoppedAlerted: false,
  progressMeters: 0,
};

export interface MonitorConfig {
  toleranceMeters: number;
  /** Durée hors trajet avant alerte. */
  offRouteGraceMs: number;
  stoppedThresholdMs: number;
  /** Rayon dans lequel on considère la cliente immobile. */
  stationaryRadiusMeters: number;
  /** Rayon autour d'une étape où un arrêt est normal. */
  waypointRadiusMeters: number;
  /** Au-delà de cette imprécision GPS, la position ne sert pas à juger un écart. */
  maxAccuracyMeters: number;
}

export function monitorConfigFor(mode: TransportMode, toleranceMeters?: number): MonitorConfig {
  return {
    toleranceMeters: toleranceMeters ?? DEFAULT_TOLERANCE_METERS[mode],
    offRouteGraceMs: 60_000,
    stoppedThresholdMs: STOPPED_THRESHOLD_MS[mode],
    stationaryRadiusMeters: 40,
    waypointRadiusMeters: 100,
    maxAccuracyMeters: 200,
  };
}

export interface MonitorPing extends LatLng {
  accuracy?: number | null;
  recordedAt: string;
}

export interface MonitoredRoute {
  coordinates: readonly Position[];
  /** Départ, étapes et arrivée. */
  waypoints: readonly LatLng[];
}

export type MonitorEvent =
  | { type: typeof DeviationType.OFF_ROUTE; distanceMeters: number; since: string }
  | { type: typeof DeviationType.STOPPED; since: string }
  | { type: 'BACK_ON_ROUTE' };

export interface MonitorResult {
  state: MonitorState;
  events: MonitorEvent[];
  distanceToRouteMeters: number;
}

const ms = (iso: string) => new Date(iso).getTime();

export function evaluatePing(
  previous: MonitorState,
  ping: MonitorPing,
  route: MonitoredRoute,
  config: MonitorConfig,
): MonitorResult {
  const events: MonitorEvent[] = [];
  const projection = projectOnPolyline(ping, route.coordinates);

  // Positions reçues dans le désordre (envoi par lots) : on ne revient pas en arrière.
  if (previous.lastPingAt && ms(ping.recordedAt) < ms(previous.lastPingAt)) {
    return { state: previous, events, distanceToRouteMeters: projection.distanceMeters };
  }

  const state: MonitorState = { ...previous, lastPingAt: ping.recordedAt };
  const reliable = (ping.accuracy ?? 0) <= config.maxAccuracyMeters;

  if (reliable) {
    // On retire l'imprécision annoncée pour ne pas alerter sur un GPS approximatif.
    const effective = Math.max(0, projection.distanceMeters - (ping.accuracy ?? 0));
    if (effective > config.toleranceMeters) {
      state.offRouteSince ??= ping.recordedAt;
      const elapsed = ms(ping.recordedAt) - ms(state.offRouteSince);
      if (!state.offRouteAlerted && elapsed >= config.offRouteGraceMs) {
        state.offRouteAlerted = true;
        events.push({
          type: DeviationType.OFF_ROUTE,
          distanceMeters: Math.round(projection.distanceMeters),
          since: state.offRouteSince,
        });
      }
    } else {
      if (state.offRouteAlerted) events.push({ type: 'BACK_ON_ROUTE' });
      state.offRouteSince = null;
      state.offRouteAlerted = false;
      state.progressMeters = Math.max(state.progressMeters, projection.alongMeters);
    }
  }

  // Immobilité prolongée.
  if (
    !state.stationaryAnchor ||
    haversineMeters(state.stationaryAnchor, ping) > config.stationaryRadiusMeters
  ) {
    state.stationaryAnchor = { lat: ping.lat, lng: ping.lng };
    state.stationarySince = ping.recordedAt;
    state.stoppedAlerted = false;
  } else if (!state.stoppedAlerted && state.stationarySince) {
    const still = ms(ping.recordedAt) - ms(state.stationarySince);
    const nearWaypoint = route.waypoints.some(
      (w) => haversineMeters(w, ping) <= config.waypointRadiusMeters,
    );
    if (still >= config.stoppedThresholdMs && !nearWaypoint) {
      state.stoppedAlerted = true;
      events.push({ type: DeviationType.STOPPED, since: state.stationarySince });
    }
  }

  return { state, events, distanceToRouteMeters: projection.distanceMeters };
}

/** Signal perdu : aucune position depuis ce délai pendant une mission en cours. */
export const SIGNAL_LOST_AFTER_MS = 3 * 60_000;

export function isSignalLost(lastPingAt: string | null, startedAt: string, now: Date): boolean {
  const reference = lastPingAt ?? startedAt;
  return now.getTime() - ms(reference) >= SIGNAL_LOST_AFTER_MS;
}
