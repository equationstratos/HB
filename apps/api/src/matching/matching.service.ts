import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GuardAvailability, GuardProfile, MissionOffer, MissionRoute } from '@prisma/client';
import {
  boundingBox,
  GUARD_BUSY_STATUSES,
  haversineMeters,
  isCoveredByWeeklySlots,
  OfferDto,
  RouteWaypoint,
} from '@hb/shared';
import { missionInclude, MissionWithRelations } from '../access/mission-access.service';
import { MissionEvents } from '../access/mission-events.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { AppConfig } from '../config/app-config.service';
import { MissionQueue } from '../jobs/mission-queue.service';
import { toMissionDto, toRouteDto } from '../missions/mission.mapper';
import { MissionsService } from '../missions/missions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

/** Une position de garde plus ancienne que ce délai n'est plus fiable. */
const FRESH_LOCATION_MS = 15 * 60_000;

export interface Candidate {
  guardId: string;
  distanceMeters: number;
  ratingAvg: number | null;
}

type GuardRow = GuardProfile & { availability: GuardAvailability[] };

/**
 * Attribution automatique : les offres partent par vagues vers les gardes validés,
 * disponibles et proches du départ, triés par distance puis par note.
 * Le premier qui accepte obtient la mission.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly queue: MissionQueue,
    private readonly realtime: RealtimeService,
    private readonly events: MissionEvents,
    private readonly notifications: NotificationsService,
    private readonly missions: MissionsService,
    private readonly audit: AuditService,
  ) {}

  /** Exécute la vague `wave` d'offres pour une mission (job BullMQ). */
  async dispatchWave(missionId: string, wave: number): Promise<void> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      include: missionInclude,
    });
    if (!mission || mission.status !== 'SEARCHING' || !mission.route) return;

    await this.expirePendingOffers(missionId);

    const now = new Date();
    if (mission.searchDeadlineAt && mission.searchDeadlineAt <= now) {
      await this.markUnassigned(mission);
      return;
    }

    const alreadyOffered = await this.prisma.missionOffer.findMany({
      where: { missionId },
      select: { guardId: true },
    });
    const candidates = await this.findCandidates(
      mission,
      mission.route,
      alreadyOffered.map((o) => o.guardId),
    );
    if (candidates.length === 0) {
      await this.markUnassigned(mission);
      return;
    }

    const timeoutMs = this.waveTimeoutMs(mission.departureAt, now);
    const deadline = mission.searchDeadlineAt?.getTime() ?? now.getTime() + timeoutMs;
    const expiresAt = new Date(
      Math.min(now.getTime() + timeoutMs, Math.max(deadline, now.getTime() + 1000)),
    );

    await this.prisma.missionOffer.createMany({
      data: candidates.map((c) => ({
        missionId,
        guardId: c.guardId,
        wave,
        distanceMeters: Math.round(c.distanceMeters),
        expiresAt,
      })),
      skipDuplicates: true,
    });
    const offers = await this.prisma.missionOffer.findMany({
      where: { missionId, wave, status: 'PENDING' },
    });
    for (const offer of offers)
      this.realtime.toUser(offer.guardId, 'offer:new', this.toOfferDto(offer, mission));
    await this.notifications.toUsers(
      offers.map((o) => o.guardId),
      {
        title: 'Nouvelle mission proposée',
        body: `Départ ${MissionsService.isImmediate(mission.departureAt) ? 'immédiat' : 'programmé'} — répondez vite`,
        data: { missionId },
        critical: true,
      },
    );
    await this.audit.log({
      actor: 'SYSTEM',
      action: 'mission.offers_sent',
      entityType: 'Mission',
      entityId: missionId,
      metadata: { wave, guards: offers.map((o) => o.guardId) },
    });
    await this.queue.scheduleDispatch(missionId, wave + 1, expiresAt.getTime() - Date.now());
  }

  async findCandidates(
    mission: Pick<MissionWithRelations, 'id' | 'clientId' | 'departureAt' | 'slotEndAt'>,
    route: Pick<MissionRoute, 'waypoints'>,
    exclude: string[],
  ): Promise<Candidate[]> {
    const start = (route.waypoints as unknown as RouteWaypoint[])[0];
    if (!start) return [];
    const now = new Date();
    const immediate = MissionsService.isImmediate(mission.departureAt, now);
    const maxRadius = this.config.get('MATCHING_MAX_RADIUS_KM') * 1000;
    const box = boundingBox(start, maxRadius);
    const inBox = (latKey: 'baseLat' | 'lastLat', lngKey: 'baseLng' | 'lastLng') => ({
      [latKey]: { gte: box.minLat, lte: box.maxLat },
      [lngKey]: { gte: box.minLng, lte: box.maxLng },
    });

    // Pré-filtre SQL sur un carré géographique (index status + lat/lng), puis Haversine.
    const rows: GuardRow[] = await this.prisma.guardProfile.findMany({
      where: {
        status: 'APPROVED',
        userId: { notIn: [...exclude, mission.clientId] },
        user: { status: 'ACTIVE', phoneVerifiedAt: { not: null } },
        ...(immediate
          ? {
              availableNow: true,
              OR: [
                {
                  ...inBox('lastLat', 'lastLng'),
                  lastLocationAt: { gte: new Date(now.getTime() - FRESH_LOCATION_MS) },
                },
                inBox('baseLat', 'baseLng'),
              ],
            }
          : inBox('baseLat', 'baseLng')),
      },
      include: { availability: true },
    });

    const scored = rows
      .map((g) => {
        const fresh =
          immediate &&
          g.lastLat !== null &&
          g.lastLng !== null &&
          g.lastLocationAt !== null &&
          now.getTime() - g.lastLocationAt.getTime() < FRESH_LOCATION_MS;
        const from = fresh
          ? { lat: g.lastLat!, lng: g.lastLng! }
          : g.baseLat !== null && g.baseLng !== null
            ? { lat: g.baseLat, lng: g.baseLng }
            : null;
        if (!from) return null;
        return { g, distanceMeters: haversineMeters(from, start) };
      })
      .filter((x): x is { g: GuardRow; distanceMeters: number } => !!x)
      .filter(
        ({ g, distanceMeters }) => distanceMeters <= Math.min(maxRadius, g.serviceRadiusKm * 1000),
      )
      .filter(
        ({ g }) =>
          immediate ||
          isCoveredByWeeklySlots(
            mission.departureAt,
            mission.slotEndAt,
            g.availability,
            g.timezone,
          ),
      );

    if (scored.length === 0) return [];

    const busy = await this.prisma.mission.findMany({
      where: {
        guardId: { in: scored.map((s) => s.g.userId) },
        id: { not: mission.id },
        status: { in: [...GUARD_BUSY_STATUSES] },
        departureAt: { lt: mission.slotEndAt },
        slotEndAt: { gt: mission.departureAt },
      },
      select: { guardId: true },
    });
    const busyIds = new Set(busy.map((b) => b.guardId));

    return scored
      .filter(({ g }) => !busyIds.has(g.userId))
      .sort((a, b) => {
        // Distance par tranches de 500 m, puis meilleure note, puis distance exacte.
        const bucket = Math.floor(a.distanceMeters / 500) - Math.floor(b.distanceMeters / 500);
        if (bucket !== 0) return bucket;
        const rating = (b.g.ratingAvg ?? 4) - (a.g.ratingAvg ?? 4);
        if (rating !== 0) return rating;
        return a.distanceMeters - b.distanceMeters;
      })
      .slice(0, this.config.get('MATCHING_WAVE_SIZE'))
      .map(({ g, distanceMeters }) => ({
        guardId: g.userId,
        distanceMeters,
        ratingAvg: g.ratingAvg,
      }));
  }

  async listOffers(guard: AuthUser): Promise<OfferDto[]> {
    const offers = await this.prisma.missionOffer.findMany({
      where: { guardId: guard.id, status: 'PENDING', expiresAt: { gt: new Date() } },
      include: { mission: { include: missionInclude } },
      orderBy: { createdAt: 'desc' },
    });
    return offers
      .filter((o) => o.mission.status === 'SEARCHING')
      .map((o) => this.toOfferDto(o, o.mission));
  }

  /** Le premier garde qui accepte obtient la mission. */
  async accept(guard: AuthUser, offerId: string, meta: RequestMeta) {
    const offer = await this.loadOwnOffer(guard, offerId);
    if (offer.status !== 'PENDING' || offer.expiresAt <= new Date()) {
      throw new GoneException('Cette proposition a expiré');
    }
    const profile = await this.prisma.guardProfile.findUnique({ where: { userId: guard.id } });
    if (profile?.status !== 'APPROVED')
      throw new ForbiddenException('Votre compte garde doit être validé');
    const account = await this.prisma.user.findUniqueOrThrow({ where: { id: guard.id } });
    if (!account.locationConsentAt) {
      throw new ForbiddenException(
        'Autorisez le partage de votre position pour accepter une mission',
      );
    }
    const mission = offer.mission;
    await this.missions.assertGuardFree(
      guard.id,
      mission.departureAt,
      mission.slotEndAt,
      mission.id,
    );

    const won = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.mission.updateMany({
        where: { id: mission.id, status: 'SEARCHING', guardId: null },
        data: { status: 'ASSIGNED', guardId: guard.id, assignedAt: new Date() },
      });
      if (count === 0) {
        await tx.missionOffer.update({
          where: { id: offer.id },
          data: { status: 'EXPIRED', respondedAt: new Date() },
        });
        return false;
      }
      await tx.missionOffer.update({
        where: { id: offer.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      return true;
    });
    if (!won)
      throw new ConflictException('Un autre garde a accepté cette mission juste avant vous');

    await this.expirePendingOffers(mission.id);
    await this.audit.log({
      actor: guard,
      action: 'mission.accepted',
      entityType: 'Mission',
      entityId: mission.id,
      metadata: { offerId },
      meta,
    });
    const updated = await this.events.publish(mission.id);
    await this.notifications.toUsers([updated.clientId], {
      title: 'Garde trouvé',
      body: `${updated.guard?.firstName ?? 'Un garde'} assurera votre protection. Mot de code : ${updated.codeWord}`,
      data: { missionId: mission.id },
    });
    return { missionId: mission.id };
  }

  async decline(guard: AuthUser, offerId: string, meta: RequestMeta): Promise<void> {
    const offer = await this.loadOwnOffer(guard, offerId);
    if (offer.status !== 'PENDING') return;
    await this.prisma.missionOffer.update({
      where: { id: offer.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    await this.audit.log({
      actor: guard,
      action: 'mission.offer_declined',
      entityType: 'Mission',
      entityId: offer.missionId,
      meta,
    });
    const stillPending = await this.prisma.missionOffer.count({
      where: { missionId: offer.missionId, wave: offer.wave, status: 'PENDING' },
    });
    // Tous les gardes de la vague ont refusé : on passe tout de suite à la suivante.
    if (stillPending === 0 && offer.mission.status === 'SEARCHING') {
      await this.queue.promoteDispatch(offer.missionId, offer.wave + 1);
    }
  }

  private async markUnassigned(mission: MissionWithRelations): Promise<void> {
    const { count } = await this.prisma.mission.updateMany({
      where: { id: mission.id, status: 'SEARCHING' },
      data: { status: 'UNASSIGNED' },
    });
    if (count === 0) return;
    await this.expirePendingOffers(mission.id);
    this.logger.warn(`Aucun garde trouvé pour la mission ${mission.id}`);
    await this.audit.log({
      actor: 'SYSTEM',
      action: 'mission.unassigned',
      entityType: 'Mission',
      entityId: mission.id,
    });
    const updated = await this.events.publish(mission.id);
    this.realtime.toAdmins('mission:unassigned', toMissionDto(updated, 'ADMIN'));
    await this.notifications.toUsers([mission.clientId], {
      title: 'Recherche en cours',
      body: "Aucun garde n'est disponible pour l'instant : notre équipe s'en occupe personnellement.",
      data: { missionId: mission.id },
    });
  }

  private async expirePendingOffers(missionId: string): Promise<void> {
    const pending = await this.prisma.missionOffer.findMany({
      where: { missionId, status: 'PENDING' },
    });
    if (pending.length === 0) return;
    await this.prisma.missionOffer.updateMany({
      where: { id: { in: pending.map((o) => o.id) }, status: 'PENDING' },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    });
    for (const o of pending)
      this.realtime.toUser(o.guardId, 'offer:revoked', { offerId: o.id, missionId });
  }

  private async loadOwnOffer(guard: AuthUser, offerId: string) {
    const offer = await this.prisma.missionOffer.findUnique({
      where: { id: offerId },
      include: { mission: true },
    });
    if (!offer || offer.guardId !== guard.id)
      throw new NotFoundException('Proposition introuvable');
    return offer;
  }

  private waveTimeoutMs(departureAt: Date, now: Date): number {
    const seconds = MissionsService.isImmediate(departureAt, now)
      ? this.config.get('MATCHING_WAVE_TIMEOUT_SECONDS')
      : this.config.get('MATCHING_SCHEDULED_WAVE_TIMEOUT_SECONDS');
    return seconds * 1000;
  }

  private toOfferDto(offer: MissionOffer, mission: MissionWithRelations): OfferDto {
    return {
      id: offer.id,
      missionId: mission.id,
      status: offer.status,
      wave: offer.wave,
      expiresAt: offer.expiresAt.toISOString(),
      distanceToStartMeters: offer.distanceMeters,
      mission: {
        departureAt: mission.departureAt.toISOString(),
        slotEndAt: mission.slotEndAt.toISOString(),
        type: mission.type,
        route: toRouteDto(mission.route!),
        clientFirstName: mission.client.firstName,
      },
    };
  }
}
