import { MissionStatus, Role } from './enums';

type Actor = Role | 'SYSTEM';

interface Transition {
  from: MissionStatus;
  to: MissionStatus;
  by: readonly Actor[];
}

const S = MissionStatus;

/**
 * Transitions autorisées et qui peut les déclencher.
 * La réattribution d'un garde par l'admin n'est pas une transition : elle change le garde
 * sans changer le statut.
 */
export const MISSION_TRANSITIONS: readonly Transition[] = [
  { from: S.REQUESTED, to: S.SEARCHING, by: ['SYSTEM'] },
  { from: S.SEARCHING, to: S.ASSIGNED, by: [Role.GUARD, Role.ADMIN] },
  { from: S.SEARCHING, to: S.UNASSIGNED, by: ['SYSTEM'] },
  { from: S.UNASSIGNED, to: S.ASSIGNED, by: [Role.ADMIN] },
  { from: S.UNASSIGNED, to: S.SEARCHING, by: [Role.ADMIN] },
  { from: S.ASSIGNED, to: S.GUARD_EN_ROUTE, by: [Role.GUARD] },
  { from: S.GUARD_EN_ROUTE, to: S.IN_PROGRESS, by: [Role.GUARD] },
  { from: S.IN_PROGRESS, to: S.COMPLETED, by: [Role.GUARD, Role.CLIENT, Role.ADMIN] },
  { from: S.REQUESTED, to: S.CANCELLED, by: [Role.CLIENT, Role.ADMIN] },
  { from: S.SEARCHING, to: S.CANCELLED, by: [Role.CLIENT, Role.ADMIN] },
  { from: S.UNASSIGNED, to: S.CANCELLED, by: [Role.CLIENT, Role.ADMIN] },
  { from: S.ASSIGNED, to: S.CANCELLED, by: [Role.CLIENT, Role.ADMIN] },
  { from: S.GUARD_EN_ROUTE, to: S.CANCELLED, by: [Role.CLIENT, Role.ADMIN] },
  { from: S.IN_PROGRESS, to: S.CANCELLED, by: [Role.ADMIN] },
];

export function canTransition(from: MissionStatus, to: MissionStatus, actor: Actor): boolean {
  return MISSION_TRANSITIONS.some((t) => t.from === from && t.to === to && t.by.includes(actor));
}

/** Vrai si la transition existe pour au moins un acteur. */
export function transitionExists(from: MissionStatus, to: MissionStatus): boolean {
  return MISSION_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export function allowedNextStatuses(from: MissionStatus, actor: Actor): MissionStatus[] {
  return MISSION_TRANSITIONS.filter((t) => t.from === from && t.by.includes(actor)).map(
    (t) => t.to,
  );
}

/** Missions pas encore terminées (à venir ou en cours). */
export const OPEN_MISSION_STATUSES: readonly MissionStatus[] = [
  S.REQUESTED,
  S.SEARCHING,
  S.UNASSIGNED,
  S.ASSIGNED,
  S.GUARD_EN_ROUTE,
  S.IN_PROGRESS,
];

/** Missions qui occupent un garde (utilisé pour détecter les chevauchements). */
export const GUARD_BUSY_STATUSES: readonly MissionStatus[] = [
  S.ASSIGNED,
  S.GUARD_EN_ROUTE,
  S.IN_PROGRESS,
];

/**
 * Statuts pendant lesquels les positions GPS sont échangées entre la cliente et le garde.
 * En dehors de ces statuts, personne (hors admin) ne peut lire de position.
 */
export const TRACKING_STATUSES: readonly MissionStatus[] = [S.GUARD_EN_ROUTE, S.IN_PROGRESS];

/** Statuts pendant lesquels un SOS peut être déclenché. */
export const SOS_STATUSES: readonly MissionStatus[] = [S.ASSIGNED, S.GUARD_EN_ROUTE, S.IN_PROGRESS];

/** Statuts pendant lesquels la cliente peut modifier son trajet. */
export const ROUTE_EDITABLE_STATUSES: readonly MissionStatus[] = [
  S.SEARCHING,
  S.UNASSIGNED,
  S.ASSIGNED,
  S.GUARD_EN_ROUTE,
  S.IN_PROGRESS,
];

export function isTrackingStatus(status: MissionStatus): boolean {
  return TRACKING_STATUSES.includes(status);
}

export function isOpenStatus(status: MissionStatus): boolean {
  return OPEN_MISSION_STATUSES.includes(status);
}
