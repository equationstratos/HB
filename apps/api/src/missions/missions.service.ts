import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MissionStatus, Prisma } from '@prisma/client';
import {
  CODE_WORDS,
  CreateMissionInput,
  DEFAULT_TOLERANCE_METERS,
  canTransition,
  expectedArrival,
  GUARD_BUSY_STATUSES,
  GuardMissionDto,
  INITIAL_MONITOR_STATE,
  lateMarginSeconds,
  MissionDto,
  MissionListQuery,
  missionStatusLabel,
  OPEN_MISSION_STATUSES,
  Paginated,
  ROUTE_EDITABLE_STATUSES,
  RouteRequestInput,
  slotEnd,
  transitionExists,
} from '@hb/shared';
import {
  MissionAccessService,
  missionInclude,
  MissionWithRelations,
} from '../access/mission-access.service';
import { MissionEvents } from '../access/mission-events.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CryptoService } from '../common/crypto.service';
import { MissionQueue } from '../jobs/mission-queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../plans/subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RoutingService } from '../routing/routing.service';
import { WalletService } from '../wallet/wallet.service';
import { toMissionDto, toMissionView, toRouteDto } from './mission.mapper';

/** En dessous de ce délai, une réservation est traitée comme « maintenant ». */
const IMMEDIATE_WINDOW_MS = 30 * 60_000;
const MAX_ADVANCE_MS = 60 * 86_400_000;

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MissionAccessService,
    private readonly events: MissionEvents,
    private readonly routing: RoutingService,
    private readonly subscriptions: SubscriptionsService,
    private readonly queue: MissionQueue,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly wallet: WalletService,
  ) {}

  static isImmediate(departureAt: Date, now = new Date()): boolean {
    return departureAt.getTime() - now.getTime() < IMMEDIATE_WINDOW_MS;
  }

  /** Réservation d'une protection avec le trajet validé par la cliente. */
  async create(user: AuthUser, input: CreateMissionInput, meta: RequestMeta): Promise<MissionDto> {
    const client = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!client.phoneVerifiedAt)
      throw new ForbiddenException('Vérifiez votre numéro de téléphone avant de réserver');
    if (!client.locationConsentAt) {
      throw new ForbiddenException(
        'Autorisez le partage de votre position pour être protégée pendant le trajet',
      );
    }

    const now = new Date();
    const departureAt = input.departureAt ? new Date(input.departureAt) : now;
    if (departureAt.getTime() < now.getTime() - 60_000)
      throw new BadRequestException("L'heure de départ est passée");
    if (departureAt.getTime() > now.getTime() + MAX_ADVANCE_MS) {
      throw new BadRequestException('Réservation possible jusqu’à 60 jours à l’avance');
    }

    // Le tracé est toujours recalculé côté serveur : on ne fait pas confiance au client.
    const route = await this.routing.compute(input.route);
    const slotEndAt = slotEnd(departureAt, route.durationSeconds);

    const overlapping = await this.prisma.mission.count({
      where: {
        clientId: user.id,
        status: { in: [...OPEN_MISSION_STATUSES] },
        departureAt: { lt: slotEndAt },
        slotEndAt: { gt: departureAt },
      },
    });
    if (overlapping > 0)
      throw new ConflictException('Vous avez déjà une protection sur ce créneau');

    const immediate = MissionsService.isImmediate(departureAt, now);
    const searchDeadlineAt = immediate
      ? new Date(now.getTime() + 10 * 60_000)
      : new Date(Math.max(now.getTime() + 2 * 60_000, departureAt.getTime() - 10 * 60_000));

    const mission = await this.prisma.$transaction(async (tx) => {
      const subscriptionId =
        input.type === 'SUBSCRIPTION' ? await this.subscriptions.consume(tx, user.id) : null;
      return tx.mission.create({
        data: {
          clientId: user.id,
          type: input.type,
          subscriptionId,
          // REQUESTED → SEARCHING est immédiat : la recherche démarre dès l'enregistrement.
          status: 'SEARCHING',
          departureAt,
          slotEndAt,
          searchDeadlineAt,
          codeWord: this.crypto.pick(CODE_WORDS),
          notes: input.notes ?? null,
          route: {
            create: {
              mode: route.mode,
              waypoints: input.route.points as unknown as Prisma.InputJsonValue,
              geometry: route.geometry as unknown as Prisma.InputJsonValue,
              distanceMeters: route.distanceMeters,
              durationSeconds: route.durationSeconds,
              approximate: route.approximate,
              provider: route.provider,
              toleranceMeters: DEFAULT_TOLERANCE_METERS[route.mode],
              expectedArrivalAt: expectedArrival(departureAt, route.durationSeconds),
            },
          },
        },
        include: missionInclude,
      });
    });

    await this.audit.log({
      actor: user,
      action: 'mission.created',
      entityType: 'Mission',
      entityId: mission.id,
      metadata: {
        type: mission.type,
        mode: route.mode,
        departureAt: departureAt.toISOString(),
        immediate,
      },
      meta,
    });
    await this.queue.scheduleDispatch(mission.id, 1);
    await this.events.publish(mission);
    return toMissionDto(mission, 'CLIENT');
  }

  async list(
    user: AuthUser,
    query: MissionListQuery,
  ): Promise<Paginated<MissionDto | GuardMissionDto>> {
    const where: Prisma.MissionWhereInput = {
      ...(user.role === 'CLIENT' ? { clientId: user.id } : {}),
      ...(user.role === 'GUARD' ? { guardId: user.id } : {}),
      status: query.status ? { in: query.status } : undefined,
      departureAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.mission.count({ where }),
      this.prisma.mission.findMany({
        where,
        include: missionInclude,
        orderBy: { departureAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: rows.map((m) => toMissionView(m, user.role, 'list')),
    };
  }

  async get(user: AuthUser, id: string): Promise<MissionDto | GuardMissionDto> {
    return toMissionView(await this.access.loadForViewer(id, user), user.role);
  }

  /** Progression de la mission par le garde (en route, suivi commencé) ou la fin du trajet. */
  async updateStatus(
    user: AuthUser,
    id: string,
    next: MissionStatus,
    meta: RequestMeta,
  ): Promise<MissionDto | GuardMissionDto> {
    const mission = await this.access.loadForParty(id, user);
    if (!canTransition(mission.status, next, user.role)) {
      if (transitionExists(mission.status, next)) {
        throw new ForbiddenException(
          user.role === 'CLIENT'
            ? 'Cette étape est signalée par votre garde'
            : 'Cette action ne vous revient pas',
        );
      }
      throw new ConflictException(
        `Impossible de passer de « ${missionStatusLabel[mission.status]} » à « ${missionStatusLabel[next]} »`,
      );
    }
    const now = new Date();
    const data: Prisma.MissionUncheckedUpdateManyInput = { status: next };
    if (next === 'GUARD_EN_ROUTE') data.enRouteAt = now;
    if (next === 'IN_PROGRESS') {
      data.startedAt = now;
      data.monitorState = INITIAL_MONITOR_STATE as unknown as Prisma.InputJsonValue;
    }
    if (next === 'COMPLETED') {
      data.completedAt = now;
      // Fin de mission et gain du garde dans la même transaction : jamais l'un sans l'autre.
      const earning = await this.prisma.$transaction(async (tx) => {
        await this.transition(mission, data, tx);
        return this.wallet.creditMission(tx, { ...mission, completedAt: now });
      });
      if (earning) await this.wallet.auditEarning(earning);
    } else {
      await this.transition(mission, data);
    }
    let updated = await this.access.load(id);

    if (next === 'IN_PROGRESS' && updated.route) {
      // L'heure d'arrivée prévue part du début réel du suivi.
      const arrival = expectedArrival(now, updated.route.durationSeconds);
      await this.prisma.missionRoute.update({
        where: { missionId: id },
        data: { expectedArrivalAt: arrival },
      });
      await this.queue.scheduleLateCheck(
        id,
        updated.route.version,
        new Date(arrival.getTime() + lateMarginSeconds(updated.route.durationSeconds) * 1000),
      );
      updated = await this.access.load(id);
    }
    if (next === 'COMPLETED') await this.closeMission(updated, 'Mission terminée');

    await this.audit.log({
      actor: user,
      action: `mission.${next.toLowerCase()}`,
      entityType: 'Mission',
      entityId: id,
      meta,
    });
    await this.events.publish(updated);

    const notice: Partial<Record<MissionStatus, [string, string]>> = {
      GUARD_EN_ROUTE: ['Votre garde est en route', `Mot de code : ${updated.codeWord}`],
      IN_PROGRESS: ['Protection en cours', 'Votre garde vous suit discrètement. Bon trajet !'],
      COMPLETED: ['Protection terminée', 'Merci ! Pensez à noter votre garde.'],
    };
    const text = notice[next];
    if (text) {
      const recipient = user.role === 'CLIENT' ? updated.guardId : updated.clientId;
      await this.notifications.toUsers([recipient], {
        title: text[0],
        body: text[1],
        data: { missionId: id },
      });
    }
    return toMissionView(updated, user.role);
  }

  async cancel(
    user: AuthUser,
    id: string,
    reason: string | undefined,
    meta: RequestMeta,
  ): Promise<MissionDto | GuardMissionDto> {
    const mission =
      user.role === 'ADMIN' ? await this.access.load(id) : await this.access.loadForParty(id, user);
    if (!canTransition(mission.status, 'CANCELLED', user.role)) {
      throw new ConflictException(
        user.role === 'CLIENT' && mission.status === 'IN_PROGRESS'
          ? 'Une protection en cours ne peut pas être annulée : terminez-la ou contactez l’assistance'
          : 'Cette mission ne peut plus être annulée',
      );
    }
    await this.transition(mission, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledById: user.id,
      cancelReason: reason ?? null,
    });
    if (!mission.startedAt) await this.subscriptions.refund(mission.subscriptionId);
    await this.revokePendingOffers(id);
    const updated = await this.access.load(id);
    await this.closeMission(updated, 'Mission annulée');
    await this.audit.log({
      actor: user,
      action: 'mission.cancelled',
      entityType: 'Mission',
      entityId: id,
      metadata: { reason },
      meta,
    });
    await this.events.publish(updated);
    const others = [updated.clientId, updated.guardId].filter((uid) => uid && uid !== user.id);
    await this.notifications.toUsers(others, {
      title: 'Protection annulée',
      body: reason ? `Motif : ${reason}` : 'La protection a été annulée.',
      data: { missionId: id },
    });
    return toMissionView(updated, user.role);
  }

  /** La cliente modifie son trajet (avant ou pendant la protection). */
  async updateRoute(
    user: AuthUser,
    id: string,
    input: RouteRequestInput,
    meta: RequestMeta,
  ): Promise<MissionDto> {
    const mission = await this.access.loadForParty(id, user);
    if (user.role !== 'CLIENT')
      throw new ForbiddenException('Seule la cliente peut modifier son trajet');
    if (!ROUTE_EDITABLE_STATUSES.includes(mission.status) || !mission.route) {
      throw new ConflictException('Le trajet ne peut plus être modifié');
    }
    const route = await this.routing.compute(input);
    const started = mission.status === 'IN_PROGRESS';
    const base = started ? new Date() : mission.departureAt;
    const version = mission.route.version + 1;
    const arrival = expectedArrival(base, route.durationSeconds);

    await this.prisma.$transaction([
      this.prisma.missionRoute.update({
        where: { missionId: id },
        data: {
          mode: route.mode,
          waypoints: input.points as unknown as Prisma.InputJsonValue,
          geometry: route.geometry as unknown as Prisma.InputJsonValue,
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
          approximate: route.approximate,
          provider: route.provider,
          toleranceMeters: DEFAULT_TOLERANCE_METERS[route.mode],
          expectedArrivalAt: arrival,
          version,
        },
      }),
      this.prisma.mission.update({
        where: { id },
        data: {
          ...(started ? {} : { slotEndAt: slotEnd(mission.departureAt, route.durationSeconds) }),
          // La surveillance repart de zéro sur le nouveau tracé.
          ...(started
            ? { monitorState: INITIAL_MONITOR_STATE as unknown as Prisma.InputJsonValue }
            : {}),
        },
      }),
    ]);
    if (started) {
      await this.queue.scheduleLateCheck(
        id,
        version,
        new Date(arrival.getTime() + lateMarginSeconds(route.durationSeconds) * 1000),
      );
    }

    const updated = await this.access.load(id);
    await this.audit.log({
      actor: user,
      action: 'mission.route_updated',
      entityType: 'Mission',
      entityId: id,
      metadata: { version, mode: route.mode, distanceMeters: route.distanceMeters },
      meta,
    });
    this.realtime.toMission(id, 'route:updated', {
      missionId: id,
      route: toRouteDto(updated.route!),
    });
    await this.events.publish(updated);
    await this.notifications.toUsers([updated.guardId], {
      title: 'Trajet modifié',
      body: 'La cliente a modifié son trajet. Consultez le nouveau tracé.',
      data: { missionId: id },
      critical: started,
    });
    return toMissionDto(updated, 'CLIENT');
  }

  /** Attribution manuelle ou réattribution par l'admin. */
  async assign(
    admin: AuthUser,
    id: string,
    guardId: string,
    meta: RequestMeta,
  ): Promise<MissionDto> {
    const mission = await this.access.load(id);
    const allowed: MissionStatus[] = ['SEARCHING', 'UNASSIGNED', 'ASSIGNED', 'GUARD_EN_ROUTE'];
    if (!allowed.includes(mission.status))
      throw new ConflictException('Cette mission ne peut plus être réattribuée');
    if (mission.guardId === guardId) throw new ConflictException('Ce garde est déjà attribué');

    const guard = await this.prisma.guardProfile.findUnique({
      where: { userId: guardId },
      include: { user: true },
    });
    if (!guard || guard.status !== 'APPROVED' || guard.user.status !== 'ACTIVE') {
      throw new BadRequestException('Ce garde ne peut pas recevoir de mission');
    }
    await this.assertGuardFree(guardId, mission.departureAt, mission.slotEndAt, id);

    const previousGuardId = mission.guardId;
    await this.transition(mission, {
      guardId,
      status: 'ASSIGNED',
      assignedAt: new Date(),
      enRouteAt: null,
    });
    await this.revokePendingOffers(id);
    if (previousGuardId) {
      this.realtime.removeFromMission(previousGuardId, id);
      await this.notifications.toUsers([previousGuardId], {
        title: 'Mission réattribuée',
        body: "L'équipe a confié cette mission à un autre garde.",
        data: { missionId: id },
      });
    }
    const updated = await this.access.load(id);
    await this.audit.log({
      actor: admin,
      action: previousGuardId ? 'mission.reassigned' : 'mission.assigned_by_admin',
      entityType: 'Mission',
      entityId: id,
      metadata: { guardId, previousGuardId },
      meta,
    });
    await this.events.publish(updated);
    await this.notifications.toUsers([guardId], {
      title: 'Nouvelle mission attribuée',
      body: `Départ le ${updated.departureAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
      data: { missionId: id },
      critical: true,
    });
    await this.notifications.toUsers([updated.clientId], {
      title: 'Garde attribué',
      body: `${updated.guard?.firstName ?? 'Votre garde'} assurera votre protection.`,
      data: { missionId: id },
    });
    return toMissionDto(updated, 'ADMIN');
  }

  /** Relance la recherche automatique d'une mission restée sans garde. */
  async relaunch(admin: AuthUser, id: string, meta: RequestMeta): Promise<MissionDto> {
    const mission = await this.access.load(id);
    if (!canTransition(mission.status, 'SEARCHING', 'ADMIN')) {
      throw new ConflictException('Seule une mission sans garde peut être relancée');
    }
    const lastWave = await this.prisma.missionOffer.aggregate({
      where: { missionId: id },
      _max: { wave: true },
    });
    const now = new Date();
    await this.transition(mission, {
      status: 'SEARCHING',
      searchDeadlineAt: new Date(
        Math.max(now.getTime() + 10 * 60_000, mission.departureAt.getTime() - 10 * 60_000),
      ),
    });
    await this.queue.scheduleDispatch(id, (lastWave._max.wave ?? 0) + 1);
    await this.audit.log({
      actor: admin,
      action: 'mission.search_relaunched',
      entityType: 'Mission',
      entityId: id,
      meta,
    });
    return toMissionDto(await this.events.publish(id), 'ADMIN');
  }

  /** Un garde ne peut pas avoir deux missions qui se chevauchent. */
  async assertGuardFree(
    guardId: string,
    from: Date,
    to: Date,
    excludeMissionId?: string,
  ): Promise<void> {
    const busy = await this.prisma.mission.count({
      where: {
        guardId,
        id: excludeMissionId ? { not: excludeMissionId } : undefined,
        status: { in: [...GUARD_BUSY_STATUSES] },
        departureAt: { lt: to },
        slotEndAt: { gt: from },
      },
    });
    if (busy > 0) throw new ConflictException('Ce garde a déjà une mission sur ce créneau');
  }

  /** Mise à jour conditionnelle : échoue si le statut a changé entre-temps (course). */
  private async transition(
    mission: MissionWithRelations,
    data: Prisma.MissionUncheckedUpdateManyInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const { count } = await db.mission.updateMany({
      where: { id: mission.id, status: mission.status, guardId: mission.guardId },
      data,
    });
    if (count === 0) throw new ConflictException('La mission vient d’être modifiée, rechargez-la');
  }

  private async revokePendingOffers(missionId: string): Promise<void> {
    const pending = await this.prisma.missionOffer.findMany({
      where: { missionId, status: 'PENDING' },
    });
    if (pending.length === 0) return;
    await this.prisma.missionOffer.updateMany({
      where: { id: { in: pending.map((o) => o.id) } },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    });
    for (const o of pending)
      this.realtime.toUser(o.guardId, 'offer:revoked', { offerId: o.id, missionId });
  }

  /** Fin de mission : alertes d'écart closes, salle temps réel fermée. */
  private async closeMission(mission: MissionWithRelations, note: string): Promise<void> {
    await this.prisma.routeDeviation.updateMany({
      where: { missionId: mission.id, status: { not: 'RESOLVED' } },
      data: { status: 'RESOLVED', resolvedAt: new Date(), note },
    });
    this.realtime.closeMissionRoom(mission.id);
  }

  async findOrThrow(id: string): Promise<MissionWithRelations> {
    const m = await this.prisma.mission.findUnique({ where: { id }, include: missionInclude });
    if (!m) throw new NotFoundException('Mission introuvable');
    return m;
  }
}
