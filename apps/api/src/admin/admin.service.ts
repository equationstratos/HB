import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MissionStatus, Prisma } from '@prisma/client';
import {
  AdminAlertsDto,
  AdminOverviewDto,
  AdminUserDto,
  LiveMissionDto,
  Paginated,
  UserListQuery,
} from '@hb/shared';
import { missionInclude } from '../access/mission-access.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { toMissionDto } from '../missions/mission.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { toDeviationDto, toSosDto } from '../sos/sos.mapper';
import { TrackingService } from '../tracking/tracking.service';
import { toUserDto } from '../users/user.mapper';

const LIVE_STATUSES: MissionStatus[] = ['ASSIGNED', 'GUARD_EN_ROUTE', 'IN_PROGRESS'];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: TrackingService,
    private readonly tokens: TokenService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  async overview(): Promise<AdminOverviewDto> {
    const now = new Date();
    const [
      activeMissions,
      upcomingMissions,
      unassignedMissions,
      openSos,
      openDeviations,
      pendingGuards,
      approvedGuards,
      availableGuards,
    ] = await Promise.all([
      this.prisma.mission.count({ where: { status: { in: ['GUARD_EN_ROUTE', 'IN_PROGRESS'] } } }),
      this.prisma.mission.count({
        where: {
          status: { in: ['SEARCHING', 'ASSIGNED'] },
          departureAt: { gte: new Date(now.getTime() - 3_600_000) },
        },
      }),
      this.prisma.mission.count({ where: { status: 'UNASSIGNED' } }),
      this.prisma.sosAlert.count({ where: { status: { not: 'RESOLVED' } } }),
      this.prisma.routeDeviation.count({ where: { status: { not: 'RESOLVED' } } }),
      this.prisma.guardProfile.count({ where: { status: 'PENDING' } }),
      this.prisma.guardProfile.count({ where: { status: 'APPROVED' } }),
      this.prisma.guardProfile.count({ where: { status: 'APPROVED', availableNow: true } }),
    ]);
    return {
      activeMissions,
      upcomingMissions,
      unassignedMissions,
      openSos,
      openDeviations,
      pendingGuards,
      approvedGuards,
      availableGuards,
    };
  }

  /** Protections en cours avec dernières positions et alertes ouvertes (carte en direct). */
  async live(admin: AuthUser, meta: RequestMeta): Promise<LiveMissionDto[]> {
    const missions = await this.prisma.mission.findMany({
      where: { status: { in: LIVE_STATUSES } },
      include: {
        ...missionInclude,
        sosAlerts: { where: { status: { not: 'RESOLVED' } }, orderBy: { createdAt: 'desc' } },
        deviations: { where: { status: { not: 'RESOLVED' } }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { departureAt: 'asc' },
    });
    await this.audit.log({
      actor: admin,
      action: 'admin.live_viewed',
      metadata: { missions: missions.length },
      meta,
    });
    return Promise.all(
      missions.map(async (m) => ({
        ...toMissionDto(m, 'ADMIN'),
        lastClientLocation: await this.tracking.latest(m.id, m.clientId),
        lastGuardLocation: await this.tracking.latest(m.id, m.guardId),
        openSos: m.sosAlerts.map(toSosDto),
        openDeviations: m.deviations.map(toDeviationDto),
      })),
    );
  }

  async alerts(): Promise<AdminAlertsDto> {
    const [sos, deviations] = await Promise.all([
      this.prisma.sosAlert.findMany({
        where: { status: { not: 'RESOLVED' } },
        include: { mission: { include: missionInclude } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.routeDeviation.findMany({
        where: { status: { not: 'RESOLVED' } },
        include: { mission: { include: missionInclude } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      sos: sos.map((a) => ({ ...toSosDto(a), mission: toMissionDto(a.mission, 'ADMIN') })),
      deviations: deviations.map((d) => ({
        ...toDeviationDto(d),
        mission: toMissionDto(d.mission, 'ADMIN'),
      })),
    };
  }

  async users(query: UserListQuery): Promise<Paginated<AdminUserDto>> {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      OR: query.q
        ? [
            { email: { contains: query.q, mode: 'insensitive' } },
            { firstName: { contains: query.q, mode: 'insensitive' } },
            { lastName: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q } },
          ]
        : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          guardProfile: { select: { status: true } },
          _count: { select: { clientMissions: true, guardMissions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: rows.map((u) => ({
        ...toUserDto(u),
        missionsCount: u._count.clientMissions + u._count.guardMissions,
        guardStatus: u.guardProfile?.status ?? null,
      })),
    };
  }

  /** Suspension immédiate : sessions révoquées, connexions temps réel coupées. */
  async suspendUser(
    admin: AuthUser,
    userId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<void> {
    if (userId === admin.id)
      throw new BadRequestException('Vous ne pouvez pas suspendre votre propre compte');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED', suspendedReason: reason },
    });
    if (user.role === 'GUARD') {
      await this.prisma.guardProfile.update({ where: { userId }, data: { availableNow: false } });
      await this.prisma.missionOffer.updateMany({
        where: { guardId: userId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
    }
    await this.tokens.revokeAllForUser(userId);
    this.realtime.disconnectUser(userId);
    await this.audit.log({
      actor: admin,
      action: 'user.suspended',
      entityType: 'User',
      entityId: userId,
      metadata: { reason },
      meta,
    });
  }

  async reactivateUser(admin: AuthUser, userId: string, meta: RequestMeta): Promise<void> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, status: 'SUSPENDED' },
      data: { status: 'ACTIVE', suspendedReason: null, failedLoginCount: 0, lockedUntil: null },
    });
    if (count === 0) throw new NotFoundException('Aucun compte suspendu avec cet identifiant');
    await this.audit.log({
      actor: admin,
      action: 'user.reactivated',
      entityType: 'User',
      entityId: userId,
      meta,
    });
  }
}
