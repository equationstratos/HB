import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { LocationPing, Prisma } from '@prisma/client';
import {
  evaluatePing,
  INITIAL_MONITOR_STATE,
  LineString,
  LocationBatchInput,
  LocationDto,
  LOCATION_RETENTION_DAYS,
  monitorConfigFor,
  MonitorEvent,
  MonitorState,
  RouteWaypoint,
  TRACKING_STATUSES,
} from '@hb/shared';
import { MissionAccessService, MissionWithRelations } from '../access/mission-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DeviationsService } from './deviations.service';

/** Positions acceptées : pas plus vieilles que 15 min (file hors-ligne), pas dans le futur. */
const MAX_PING_AGE_MS = 15 * 60_000;
const MAX_CLOCK_SKEW_MS = 60_000;

export function toLocationDto(p: LocationPing): LocationDto {
  return {
    missionId: p.missionId,
    userId: p.userId,
    role: p.role,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    recordedAt: p.recordedAt.toISOString(),
  };
}

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MissionAccessService,
    private readonly realtime: RealtimeService,
    private readonly deviations: DeviationsService,
    private readonly audit: AuditService,
  ) {}

  /** Réception d'un lot de positions de la cliente ou du garde. */
  async ingest(
    user: AuthUser,
    missionId: string,
    input: LocationBatchInput,
  ): Promise<{ accepted: number }> {
    const mission = await this.access.loadForParty(missionId, user);
    if (!TRACKING_STATUSES.includes(mission.status)) {
      throw new ConflictException("Le suivi n'est pas actif pour cette mission");
    }
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { locationConsentAt: true },
    });
    if (!account.locationConsentAt)
      throw new ForbiddenException('Partage de position non autorisé');

    const now = Date.now();
    const pings = input.pings
      .map((p) => ({ ...p, t: Date.parse(p.recordedAt) }))
      .filter((p) => p.t >= now - MAX_PING_AGE_MS && p.t <= now + MAX_CLOCK_SKEW_MS)
      .sort((a, b) => a.t - b.t);
    if (pings.length === 0) return { accepted: 0 };

    await this.prisma.locationPing.createMany({
      data: pings.map((p) => ({
        missionId,
        userId: user.id,
        role: user.role,
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy ?? null,
        speed: p.speed ?? null,
        heading: p.heading ?? null,
        recordedAt: new Date(p.t),
      })),
    });

    const latest = pings[pings.length - 1]!;
    const latestAt = new Date(latest.t);
    if (user.role === 'CLIENT') {
      await this.prisma.mission.updateMany({
        where: {
          id: missionId,
          OR: [{ lastClientPingAt: null }, { lastClientPingAt: { lt: latestAt } }],
        },
        data: { lastClientPingAt: latestAt },
      });
    } else {
      await this.prisma.mission.updateMany({
        where: {
          id: missionId,
          OR: [{ lastGuardPingAt: null }, { lastGuardPingAt: { lt: latestAt } }],
        },
        data: { lastGuardPingAt: latestAt },
      });
      await this.prisma.guardProfile.update({
        where: { userId: user.id },
        data: { lastLat: latest.lat, lastLng: latest.lng, lastLocationAt: latestAt },
      });
    }

    this.realtime.toMission(missionId, 'location', {
      missionId,
      userId: user.id,
      role: user.role,
      lat: latest.lat,
      lng: latest.lng,
      accuracy: latest.accuracy ?? null,
      recordedAt: latestAt.toISOString(),
    });

    if (user.role === 'CLIENT') {
      await this.deviations.resolveSignalLost(mission);
      if (mission.status === 'IN_PROGRESS' && mission.route) await this.monitor(mission, pings);
    }
    return { accepted: pings.length };
  }

  /** Surveillance du trajet : évalue chaque position contre le tracé prévu. */
  private async monitor(
    mission: MissionWithRelations,
    pings: (LocationBatchInput['pings'][number] & { t: number })[],
  ): Promise<void> {
    const route = mission.route!;
    const monitored = {
      coordinates: (route.geometry as unknown as LineString).coordinates,
      waypoints: route.waypoints as unknown as RouteWaypoint[],
    };
    const config = monitorConfigFor(route.mode, route.toleranceMeters);
    const raised: { event: MonitorEvent; lat: number; lng: number; distance: number }[] = [];

    // Verrou de ligne : deux lots simultanés ne doivent pas écraser l'état l'un de l'autre.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Mission" WHERE id = ${mission.id} FOR UPDATE`;
      const fresh = await tx.mission.findUniqueOrThrow({
        where: { id: mission.id },
        select: { monitorState: true },
      });
      let state = (fresh.monitorState as unknown as MonitorState | null) ?? INITIAL_MONITOR_STATE;
      for (const p of pings) {
        const result = evaluatePing(
          state,
          { lat: p.lat, lng: p.lng, accuracy: p.accuracy, recordedAt: new Date(p.t).toISOString() },
          monitored,
          config,
        );
        state = result.state;
        for (const event of result.events)
          raised.push({ event, lat: p.lat, lng: p.lng, distance: result.distanceToRouteMeters });
      }
      await tx.mission.update({
        where: { id: mission.id },
        data: { monitorState: state as unknown as Prisma.InputJsonValue },
      });
    });

    for (const { event, lat, lng, distance } of raised) {
      if (event.type === 'OFF_ROUTE') {
        await this.deviations.raise(mission, 'OFF_ROUTE', {
          lat,
          lng,
          distanceMeters: Math.round(distance),
        });
      } else if (event.type === 'STOPPED') {
        await this.deviations.raise(mission, 'STOPPED', { lat, lng });
      }
    }
  }

  /**
   * Trace récente de la mission. Les parties n'y ont accès que pendant la protection ;
   * l'admin y a toujours accès, et chaque consultation est tracée.
   */
  async track(user: AuthUser, missionId: string, meta: RequestMeta): Promise<LocationDto[]> {
    const mission = await this.access.loadForViewer(missionId, user);
    if (user.role === 'ADMIN') {
      await this.audit.log({
        actor: user,
        action: 'mission.locations_viewed',
        entityType: 'Mission',
        entityId: missionId,
        meta,
      });
    } else if (!TRACKING_STATUSES.includes(mission.status)) {
      throw new ForbiddenException('Positions disponibles uniquement pendant la protection');
    }
    const pings = await this.prisma.locationPing.findMany({
      where: { missionId },
      orderBy: { recordedAt: 'desc' },
      take: 500,
    });
    return pings.reverse().map(toLocationDto);
  }

  async latest(missionId: string, userId: string | null): Promise<LocationDto | null> {
    if (!userId) return null;
    const ping = await this.prisma.locationPing.findFirst({
      where: { missionId, userId },
      orderBy: { recordedAt: 'desc' },
    });
    return ping ? toLocationDto(ping) : null;
  }

  /** RGPD : suppression des positions des missions terminées depuis plus de 30 jours. */
  async purgeOld(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - LOCATION_RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.locationPing.deleteMany({
      where: {
        mission: {
          OR: [
            { status: 'COMPLETED', completedAt: { lt: before } },
            { status: 'CANCELLED', cancelledAt: { lt: before } },
          ],
        },
      },
    });
    if (count > 0) {
      await this.audit.log({
        actor: 'SYSTEM',
        action: 'gdpr.locations_purged',
        metadata: { count, before: before.toISOString() },
      });
    }
    return count;
  }
}
