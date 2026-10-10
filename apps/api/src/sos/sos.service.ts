import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Mission, RouteDeviation } from '@prisma/client';
import { APP_NAME, deviationTypeLabel, SOS_STATUSES, SosAlertDto, SosInput } from '@hb/shared';
import { MissionAccessService } from '../access/mission-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { SMS_PROVIDER, SmsProvider } from '../integrations/sms.provider';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { toSosDto } from './sos.mapper';

/** Fenêtre pendant laquelle un second appui sur SOS renvoie l'alerte déjà ouverte. */
const DEDUP_MS = 60_000;

@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MissionAccessService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /** Bouton SOS de la cliente ou du garde. */
  async raise(
    user: AuthUser,
    missionId: string,
    input: SosInput,
    meta: RequestMeta,
  ): Promise<SosAlertDto> {
    const mission = await this.access.loadForParty(missionId, user);
    if (!SOS_STATUSES.includes(mission.status))
      throw new ConflictException('Aucune protection active pour cette mission');

    const recent = await this.prisma.sosAlert.findFirst({
      where: { missionId, status: 'OPEN', createdAt: { gte: new Date(Date.now() - DEDUP_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) return toSosDto(recent);

    let { lat, lng } = input;
    if (lat === undefined || lng === undefined) {
      const last = await this.prisma.locationPing.findFirst({
        where: { missionId, userId: mission.clientId },
        orderBy: { recordedAt: 'desc' },
      });
      lat = last?.lat;
      lng = last?.lng;
    }

    const alert = await this.prisma.sosAlert.create({
      data: {
        missionId,
        raisedById: user.id,
        raisedByRole: user.role,
        lat: lat ?? null,
        lng: lng ?? null,
        message: input.message ?? null,
      },
    });
    await this.broadcast(
      mission,
      alert.id,
      user.role === 'CLIENT' ? mission.guardId : mission.clientId,
    );
    await this.audit.log({
      actor: user,
      action: 'sos.raised',
      entityType: 'SosAlert',
      entityId: alert.id,
      metadata: { missionId, lat, lng },
      meta,
    });
    if (user.role === 'CLIENT') await this.alertEmergencyContacts(mission, lat, lng);
    return toSosDto(alert);
  }

  /** Escalade automatique d'un écart de trajet resté sans réponse de la cliente. */
  async raiseAutomatic(mission: Mission, deviation: RouteDeviation): Promise<SosAlertDto> {
    const alert = await this.prisma.sosAlert.create({
      data: {
        missionId: mission.id,
        raisedById: mission.clientId,
        raisedByRole: 'CLIENT',
        automatic: true,
        lat: deviation.lat,
        lng: deviation.lng,
        message: `Escalade automatique : ${deviationTypeLabel[deviation.type].toLowerCase()} sans réponse de la cliente`,
      },
    });
    await this.broadcast(mission, alert.id, mission.guardId);
    await this.audit.log({
      actor: 'SYSTEM',
      action: 'sos.auto_escalated',
      entityType: 'SosAlert',
      entityId: alert.id,
      metadata: { missionId: mission.id, deviationId: deviation.id },
    });
    return toSosDto(alert);
  }

  /** « J'interviens » : prise en charge par le garde ou un admin. */
  async acknowledge(
    user: AuthUser,
    alertId: string,
    note: string | undefined,
    meta: RequestMeta,
  ): Promise<SosAlertDto> {
    const alert = await this.loadForResponder(user, alertId);
    if (alert.status !== 'OPEN') return toSosDto(alert);
    const updated = await this.prisma.sosAlert.update({
      where: { id: alertId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedById: user.id,
        note: note ?? alert.note,
      },
    });
    this.realtime.toMissionAndParties(alert.mission, 'alert:sos-updated', toSosDto(updated));
    await this.audit.log({
      actor: user,
      action: 'sos.acknowledged',
      entityType: 'SosAlert',
      entityId: alertId,
      meta,
    });
    return toSosDto(updated);
  }

  async resolve(
    user: AuthUser,
    alertId: string,
    note: string | undefined,
    meta: RequestMeta,
  ): Promise<SosAlertDto> {
    if (user.role !== 'ADMIN')
      throw new ForbiddenException('Seule l’équipe peut clôturer une alerte SOS');
    const alert = await this.loadForResponder(user, alertId);
    if (alert.status === 'RESOLVED') return toSosDto(alert);
    const now = new Date();
    const updated = await this.prisma.sosAlert.update({
      where: { id: alertId },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
        resolvedById: user.id,
        acknowledgedAt: alert.acknowledgedAt ?? now,
        acknowledgedById: alert.acknowledgedById ?? user.id,
        note: note ?? alert.note,
      },
    });
    this.realtime.toMissionAndParties(alert.mission, 'alert:sos-updated', toSosDto(updated));
    await this.audit.log({
      actor: user,
      action: 'sos.resolved',
      entityType: 'SosAlert',
      entityId: alertId,
      metadata: { note },
      meta,
    });
    return toSosDto(updated);
  }

  async listForMission(user: AuthUser, missionId: string): Promise<SosAlertDto[]> {
    await this.access.loadForViewer(missionId, user);
    const alerts = await this.prisma.sosAlert.findMany({
      where: { missionId },
      orderBy: { createdAt: 'desc' },
    });
    return alerts.map(toSosDto);
  }

  private async broadcast(
    mission: Mission,
    alertId: string,
    otherPartyId: string | null,
  ): Promise<void> {
    const alert = await this.prisma.sosAlert.findUniqueOrThrow({ where: { id: alertId } });
    const dto = toSosDto(alert);
    this.realtime.toMissionAndParties(mission, 'alert:sos', dto);
    await this.notifications.toUsers([otherPartyId], {
      title: '🚨 Alerte SOS',
      body: dto.message ?? 'Une alerte a été déclenchée. Ouvrez l’application immédiatement.',
      data: { missionId: mission.id, sosId: alertId },
      critical: true,
    });
  }

  private async alertEmergencyContacts(
    mission: Mission,
    lat?: number,
    lng?: number,
  ): Promise<void> {
    const [client, contacts] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: mission.clientId } }),
      this.prisma.emergencyContact.findMany({ where: { userId: mission.clientId } }),
    ]);
    const where =
      lat !== undefined && lng !== undefined
        ? ` Dernière position : https://maps.google.com/?q=${lat},${lng}`
        : '';
    const body = `ALERTE ${APP_NAME} : ${client.firstName} a déclenché une alerte pendant son trajet.${where} Notre équipe est mobilisée. En cas de danger immédiat, appelez le 17 ou le 112.`;
    await Promise.all(
      contacts.map((c) =>
        this.sms
          .send(c.phone, body)
          .catch((e) => this.logger.warn(`SMS au contact d'urgence échoué : ${String(e)}`)),
      ),
    );
  }

  private async loadForResponder(user: AuthUser, alertId: string) {
    const alert = await this.prisma.sosAlert.findUnique({
      where: { id: alertId },
      include: { mission: true },
    });
    if (!alert) throw new NotFoundException('Alerte introuvable');
    const allowed =
      user.role === 'ADMIN' || (user.role === 'GUARD' && alert.mission.guardId === user.id);
    if (!allowed) throw new NotFoundException('Alerte introuvable');
    return alert;
  }
}
