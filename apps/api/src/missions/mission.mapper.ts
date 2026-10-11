import { GuardProfile, MissionRoute, Role, User } from '@prisma/client';
import {
  GUARD_BUSY_STATUSES,
  GuardMissionDto,
  LineString,
  MissionDto,
  MissionRouteDto,
  PersonSummaryDto,
  RouteWaypoint,
} from '@hb/shared';
import { MissionWithRelations } from '../access/mission-access.service';
import { iso } from '../common/iso';

/** Vues complètes de la mission ; le garde a la sienne (toGuardMissionDto). */
export type Viewer = 'CLIENT' | 'ADMIN';

export function toRouteDto(route: MissionRoute): MissionRouteDto {
  return {
    mode: route.mode,
    waypoints: route.waypoints as unknown as RouteWaypoint[],
    geometry: route.geometry as unknown as LineString,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    approximate: route.approximate,
    toleranceMeters: route.toleranceMeters,
    expectedArrivalAt: route.expectedArrivalAt.toISOString(),
    version: route.version,
  };
}

/**
 * Minimisation des données : la cliente ne connaît de son garde que le prénom et l'initiale
 * du nom (le garde en sait encore moins, voir toGuardMissionDto). L'admin voit l'identité
 * complète.
 */
function person(user: User, viewer: Role, profile?: GuardProfile | null): PersonSummaryDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: viewer === 'ADMIN' ? user.lastName : `${user.lastName.charAt(0)}.`,
    ...(profile ? { ratingAvg: profile.ratingAvg, ratingCount: profile.ratingCount } : {}),
  };
}

/** Champs communs à toutes les vues : déroulé et trajet, sans personne ni note. */
function missionBase(m: MissionWithRelations) {
  if (!m.route) throw new Error(`Mission ${m.id} sans trajet`);
  return {
    id: m.id,
    status: m.status,
    type: m.type,
    departureAt: m.departureAt.toISOString(),
    slotEndAt: m.slotEndAt.toISOString(),
    codeWord: m.codeWord,
    notes: m.notes,
    route: toRouteDto(m.route),
    createdAt: m.createdAt.toISOString(),
    assignedAt: iso(m.assignedAt),
    enRouteAt: iso(m.enRouteAt),
    startedAt: iso(m.startedAt),
    completedAt: iso(m.completedAt),
    cancelledAt: iso(m.cancelledAt),
    cancelReason: m.cancelReason,
  };
}

/**
 * Vue du garde : ni la note laissée par la cliente, ni sa propre moyenne, ni le nom de famille
 * de la cliente. Son prénom n'est donné que pour une mission active consultée seule
 * (`detail`), pour l'aborder avec le mot de code ; rien dans les listes ni une fois la mission
 * terminée ou annulée.
 */
export function toGuardMissionDto(
  m: MissionWithRelations,
  scope: 'list' | 'detail',
): GuardMissionDto {
  const showFirstName = scope === 'detail' && GUARD_BUSY_STATUSES.includes(m.status);
  return {
    ...missionBase(m),
    client: { id: m.client.id, ...(showFirstName ? { firstName: m.client.firstName } : {}) },
    guard: m.guard ? person(m.guard, 'GUARD') : null,
  };
}

/** Vue de la mission selon le rôle de la personne connectée. */
export function toMissionView(
  m: MissionWithRelations,
  role: Role,
  scope: 'list' | 'detail' = 'detail',
): MissionDto | GuardMissionDto {
  return role === 'GUARD' ? toGuardMissionDto(m, scope) : toMissionDto(m, role);
}

export function toMissionDto(m: MissionWithRelations, viewer: Viewer): MissionDto {
  return {
    ...missionBase(m),
    client: person(m.client, viewer),
    guard: m.guard ? person(m.guard, viewer, m.guard.guardProfile) : null,
    rating: m.rating
      ? {
          id: m.rating.id,
          missionId: m.id,
          score: m.rating.score,
          comment: m.rating.comment,
          createdAt: m.rating.createdAt.toISOString(),
        }
      : null,
  };
}
