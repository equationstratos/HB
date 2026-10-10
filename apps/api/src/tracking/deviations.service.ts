import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeviationType, Mission } from '@prisma/client';
import {
  DeviationAckInput,
  DeviationDto,
  deviationTypeLabel,
  formatDistance,
  isSignalLost,
} from '@hb/shared';
import { MissionAccessService } from '../access/mission-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { AppConfig } from '../config/app-config.service';
import { MissionQueue } from '../jobs/mission-queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SosService } from '../sos/sos.service';
import { toDeviationDto } from '../sos/sos.mapper';

export interface DeviationContext {
  lat?: number | null;
  lng?: number | null;
  distanceMeters?: number | null;
}

/**
 * Écarts de trajet, arrêts prolongés, retards et pertes de signal.
 * Chaque alerte prévient le garde et l'équipe, et demande à la cliente si tout va bien ;
 * sans réponse, elle est escaladée en SOS.
 */
@Injectable()
export class DeviationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MissionAccessService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly queue: MissionQueue,
    private readonly sos: SosService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  async raise(
    mission: Mission,
    type: DeviationType,
    ctx: DeviationContext = {},
  ): Promise<DeviationDto | null> {
    const existing = await this.prisma.routeDeviation.findFirst({
      where: { missionId: mission.id, type, status: { not: 'RESOLVED' } },
    });
    if (existing) return null;

    const deviation = await this.prisma.routeDeviation.create({
      data: {
        missionId: mission.id,
        type,
        lat: ctx.lat ?? null,
        lng: ctx.lng ?? null,
        distanceMeters: ctx.distanceMeters ?? null,
      },
    });
    const dto = toDeviationDto(deviation);
    this.realtime.toMissionAndParties(mission, 'alert:deviation', dto);

    const label = deviationTypeLabel[type];
    const detail = ctx.distanceMeters
      ? ` (${formatDistance(ctx.distanceMeters)} du trajet prévu)`
      : '';
    await this.notifications.toUsers([mission.guardId], {
      title: `⚠️ ${label}`,
      body: `Vérifiez la situation de la cliente${detail}.`,
      data: { missionId: mission.id, deviationId: deviation.id },
      critical: true,
    });
    await this.notifications.toUsers([mission.clientId], {
      title: 'Tout va bien ?',
      body: 'Nous avons remarqué un changement sur votre trajet. Répondez pour rassurer votre garde.',
      data: { missionId: mission.id, deviationId: deviation.id },
      critical: true,
    });
    await this.audit.log({
      actor: 'SYSTEM',
      action: 'deviation.raised',
      entityType: 'RouteDeviation',
      entityId: deviation.id,
      metadata: { missionId: mission.id, type, ...ctx },
    });
    await this.queue.scheduleEscalation(
      deviation.id,
      this.config.get('DEVIATION_ESCALATION_SECONDS') * 1000,
    );
    return dto;
  }

  /** Réponse de la cliente à « Tout va bien ? ». « Non » déclenche un SOS. */
  async clientAnswer(
    user: AuthUser,
    deviationId: string,
    input: DeviationAckInput,
    meta: RequestMeta,
  ): Promise<DeviationDto> {
    const deviation = await this.prisma.routeDeviation.findUnique({
      where: { id: deviationId },
      include: { mission: true },
    });
    if (!deviation || deviation.mission.clientId !== user.id)
      throw new NotFoundException('Alerte introuvable');
    const now = new Date();
    const updated = await this.prisma.routeDeviation.update({
      where: { id: deviationId },
      data: input.ok
        ? {
            clientConfirmedOk: true,
            status: 'RESOLVED',
            resolvedAt: now,
            resolvedById: user.id,
            note: input.note ?? 'La cliente confirme que tout va bien',
          }
        : { clientConfirmedOk: false, note: input.note ?? 'La cliente demande de l’aide' },
    });
    await this.audit.log({
      actor: user,
      action: input.ok ? 'deviation.client_ok' : 'deviation.client_needs_help',
      entityType: 'RouteDeviation',
      entityId: deviationId,
      meta,
    });
    this.emitUpdate(updated, deviation.mission);
    if (!input.ok) {
      await this.sos.raise(
        user,
        deviation.missionId,
        {
          lat: deviation.lat ?? undefined,
          lng: deviation.lng ?? undefined,
          message: 'La cliente a répondu qu’elle avait besoin d’aide',
        },
        meta,
      );
    }
    return toDeviationDto(updated);
  }

  async acknowledge(
    user: AuthUser,
    deviationId: string,
    note: string | undefined,
    meta: RequestMeta,
  ): Promise<DeviationDto> {
    const deviation = await this.loadForResponder(user, deviationId);
    if (deviation.status !== 'OPEN') return toDeviationDto(deviation);
    const updated = await this.prisma.routeDeviation.update({
      where: { id: deviationId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedById: user.id,
        note: note ?? deviation.note,
      },
    });
    await this.audit.log({
      actor: user,
      action: 'deviation.acknowledged',
      entityType: 'RouteDeviation',
      entityId: deviationId,
      meta,
    });
    this.emitUpdate(updated, deviation.mission);
    return toDeviationDto(updated);
  }

  async resolve(
    user: AuthUser,
    deviationId: string,
    note: string | undefined,
    meta: RequestMeta,
  ): Promise<DeviationDto> {
    const deviation = await this.loadForResponder(user, deviationId);
    if (deviation.status === 'RESOLVED') return toDeviationDto(deviation);
    const updated = await this.prisma.routeDeviation.update({
      where: { id: deviationId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: user.id,
        note: note ?? deviation.note,
      },
    });
    await this.audit.log({
      actor: user,
      action: 'deviation.resolved',
      entityType: 'RouteDeviation',
      entityId: deviationId,
      meta,
    });
    this.emitUpdate(updated, deviation.mission);
    return toDeviationDto(updated);
  }

  async listForMission(user: AuthUser, missionId: string): Promise<DeviationDto[]> {
    await this.access.loadForViewer(missionId, user);
    const rows = await this.prisma.routeDeviation.findMany({
      where: { missionId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDeviationDto);
  }

  /** Signal rétabli : la perte de signal se clôt d'elle-même. */
  async resolveSignalLost(mission: Pick<Mission, 'id' | 'clientId' | 'guardId'>): Promise<void> {
    const open = await this.prisma.routeDeviation.findMany({
      where: { missionId: mission.id, type: 'SIGNAL_LOST', status: { not: 'RESOLVED' } },
    });
    for (const d of open) {
      const updated = await this.prisma.routeDeviation.update({
        where: { id: d.id },
        data: { status: 'RESOLVED', resolvedAt: new Date(), note: 'Signal rétabli' },
      });
      this.emitUpdate(updated, mission);
    }
  }

  // --------------------------------------------------------------- Jobs

  async escalate(deviationId: string): Promise<void> {
    const deviation = await this.prisma.routeDeviation.findUnique({
      where: { id: deviationId },
      include: { mission: true },
    });
    if (
      !deviation ||
      deviation.status !== 'OPEN' ||
      deviation.clientConfirmedOk !== null ||
      deviation.escalatedAt
    )
      return;
    if (deviation.mission.status !== 'IN_PROGRESS') return;
    await this.prisma.routeDeviation.update({
      where: { id: deviationId },
      data: { escalatedAt: new Date() },
    });
    await this.sos.raiseAutomatic(deviation.mission, deviation);
  }

  async lateCheck(missionId: string, routeVersion: number): Promise<void> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      include: { route: true },
    });
    if (!mission || mission.status !== 'IN_PROGRESS' || mission.route?.version !== routeVersion)
      return;
    const last = await this.prisma.locationPing.findFirst({
      where: { missionId, userId: mission.clientId },
      orderBy: { recordedAt: 'desc' },
    });
    await this.raise(mission, 'LATE', { lat: last?.lat, lng: last?.lng });
  }

  async signalSweep(now = new Date()): Promise<void> {
    const active = await this.prisma.mission.findMany({
      where: { status: 'IN_PROGRESS', startedAt: { not: null } },
    });
    for (const mission of active) {
      if (
        isSignalLost(
          mission.lastClientPingAt?.toISOString() ?? null,
          mission.startedAt!.toISOString(),
          now,
        )
      ) {
        await this.raise(mission, 'SIGNAL_LOST');
      }
    }
  }

  private emitUpdate(
    d: Parameters<typeof toDeviationDto>[0],
    mission: Pick<Mission, 'id' | 'clientId' | 'guardId'>,
  ): void {
    this.realtime.toMissionAndParties(mission, 'alert:deviation-updated', toDeviationDto(d));
  }

  private async loadForResponder(user: AuthUser, deviationId: string) {
    const deviation = await this.prisma.routeDeviation.findUnique({
      where: { id: deviationId },
      include: { mission: true },
    });
    if (!deviation) throw new NotFoundException('Alerte introuvable');
    if (user.role === 'ADMIN') return deviation;
    if (user.role === 'GUARD' && deviation.mission.guardId === user.id) return deviation;
    if (user.role === 'CLIENT')
      throw new ForbiddenException('Répondez à « Tout va bien ? » depuis votre écran de mission');
    throw new NotFoundException('Alerte introuvable');
  }
}
