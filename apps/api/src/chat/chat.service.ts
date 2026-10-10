import { ConflictException, Injectable } from '@nestjs/common';
import { Message, MissionStatus, Role } from '@prisma/client';
import { MessageDto } from '@hb/shared';
import { MissionAccessService } from '../access/mission-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

const CHAT_STATUSES: MissionStatus[] = ['ASSIGNED', 'GUARD_EN_ROUTE', 'IN_PROGRESS'];

function toMessageDto(m: Message & { sender: { role: Role } }): MessageDto {
  return {
    id: m.id,
    missionId: m.missionId,
    senderId: m.senderId,
    senderRole: m.sender.role,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Messagerie de mission entre la cliente, le garde et, si besoin, l'équipe. */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MissionAccessService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, missionId: string, meta: RequestMeta): Promise<MessageDto[]> {
    await this.access.loadForViewer(missionId, user);
    if (user.role === 'ADMIN') {
      await this.audit.log({
        actor: user,
        action: 'mission.chat_viewed',
        entityType: 'Mission',
        entityId: missionId,
        meta,
      });
    }
    const rows = await this.prisma.message.findMany({
      where: { missionId },
      include: { sender: { select: { role: true } } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return rows.map(toMessageDto);
  }

  async send(user: AuthUser, missionId: string, body: string): Promise<MessageDto> {
    const mission = await this.access.loadForViewer(missionId, user);
    if (!CHAT_STATUSES.includes(mission.status)) {
      throw new ConflictException(
        'La messagerie est ouverte dès qu’un garde est attribué, jusqu’à la fin de la protection',
      );
    }
    const message = await this.prisma.message.create({
      data: { missionId, senderId: user.id, body },
      include: { sender: { select: { role: true } } },
    });
    const dto = toMessageDto(message);
    this.realtime.toMissionAndParties(mission, 'chat:message', dto);

    const recipients = [mission.clientId, mission.guardId].filter((id) => id !== user.id);
    const from =
      user.role === 'ADMIN'
        ? "L'équipe"
        : user.role === 'GUARD'
          ? 'Votre garde'
          : mission.client.firstName;
    await this.notifications.toUsers(recipients, {
      title: `Message de ${from}`,
      body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      data: { missionId, messageId: message.id },
    });
    return dto;
  }
}
