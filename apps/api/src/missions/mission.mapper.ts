import { GuardProfile, MissionRoute, User } from '@prisma/client';
import {
  LineString,
  MissionDto,
  MissionRouteDto,
  PersonSummaryDto,
  RouteWaypoint,
} from '@hb/shared';
import { MissionWithRelations } from '../access/mission-access.service';
import { iso } from '../common/iso';

export type Viewer = 'CLIENT' | 'GUARD' | 'ADMIN';

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
 * Minimisation des données : la cliente et le garde ne connaissent l'un de l'autre que le
 * prénom et l'initiale du nom. L'admin voit l'identité complète.
 */
function person(user: User, viewer: Viewer, profile?: GuardProfile | null): PersonSummaryDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: viewer === 'ADMIN' ? user.lastName : `${user.lastName.charAt(0)}.`,
    ...(profile ? { ratingAvg: profile.ratingAvg, ratingCount: profile.ratingCount } : {}),
  };
}

export function toMissionDto(m: MissionWithRelations, viewer: Viewer): MissionDto {
  if (!m.route) throw new Error(`Mission ${m.id} sans trajet`);
  return {
    id: m.id,
    status: m.status,
    type: m.type,
    departureAt: m.departureAt.toISOString(),
    slotEndAt: m.slotEndAt.toISOString(),
    codeWord: m.codeWord,
    notes: m.notes,
    client: person(m.client, viewer),
    guard: m.guard ? person(m.guard, viewer, m.guard.guardProfile) : null,
    route: toRouteDto(m.route),
    createdAt: m.createdAt.toISOString(),
    assignedAt: iso(m.assignedAt),
    enRouteAt: iso(m.enRouteAt),
    startedAt: iso(m.startedAt),
    completedAt: iso(m.completedAt),
    cancelledAt: iso(m.cancelledAt),
    cancelReason: m.cancelReason,
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
