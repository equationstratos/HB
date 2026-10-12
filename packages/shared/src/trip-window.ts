/** Horaires d'un trajet : réels une fois connus, sinon prévus. */
export interface TripWindow {
  /** Début réel du suivi, sinon départ prévu. */
  start: string;
  /** Fin réelle, sinon estimée. */
  end: string;
  durationSeconds: number;
  /** Vrai tant que le trajet n'est pas terminé : la fin n'est qu'une estimation. */
  estimated: boolean;
}

/**
 * Début, durée et fin d'un trajet, sans rien sur la cliente : c'est ce que le garde voit de
 * ses missions. L'arrivée prévue du trajet vaut départ + durée prévue ; le serveur la recalcule
 * au début réel du suivi et à chaque modification du trajet.
 */
export function tripWindow(trip: {
  departureAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  route: { expectedArrivalAt: string };
}): TripWindow {
  const start = trip.startedAt ?? trip.departureAt;
  const end = trip.completedAt ?? trip.route.expectedArrivalAt;
  return {
    start,
    end,
    durationSeconds: Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000)),
    estimated: !trip.completedAt,
  };
}
