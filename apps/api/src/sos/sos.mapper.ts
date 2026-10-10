import { RouteDeviation, SosAlert } from '@prisma/client';
import { DeviationDto, SosAlertDto } from '@hb/shared';
import { iso } from '../common/iso';

export function toSosDto(a: SosAlert): SosAlertDto {
  return {
    id: a.id,
    missionId: a.missionId,
    raisedById: a.raisedById,
    raisedByRole: a.raisedByRole,
    lat: a.lat,
    lng: a.lng,
    message: a.message,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    acknowledgedAt: iso(a.acknowledgedAt),
    acknowledgedById: a.acknowledgedById,
    resolvedAt: iso(a.resolvedAt),
    note: a.note,
  };
}

export function toDeviationDto(d: RouteDeviation): DeviationDto {
  return {
    id: d.id,
    missionId: d.missionId,
    type: d.type,
    status: d.status,
    lat: d.lat,
    lng: d.lng,
    distanceMeters: d.distanceMeters,
    clientConfirmedOk: d.clientConfirmedOk,
    createdAt: d.createdAt.toISOString(),
    acknowledgedAt: iso(d.acknowledgedAt),
    resolvedAt: iso(d.resolvedAt),
    note: d.note,
  };
}
