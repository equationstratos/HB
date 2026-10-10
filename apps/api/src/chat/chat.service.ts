import { ConflictException, Injectable } from '@nestjs/common';
import { Message, MissionStatus, Role } from '@prisma/client';
import { MessageDto, messageAuthorLabel } from '@hb/shared';
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

  /** `after` : seulement les messages postérieurs à cette date (relève des applis). */
  async list(
    user: AuthUser,
    missionId: string,
    meta: RequestMeta,
    after?: string,
  ): Promise<MessageDto[]> {
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
      where: { missionId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
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
    // Salle de la mission + salles personnelles de la cliente et du garde : le message
    // arrive dans l'appli quel que soit l'écran ouvert.
    this.realtime.toMissionAndParties(mission, 'chat:message', dto);

    // Confidentialité : la notification push ne contient ni le message ni de nom.
    const recipients = [mission.clientId, mission.guardId].filter((id) => id !== user.id);
    await this.notifications.toUsers(recipients, {
      title: 'Nouveau message',
      body: `${messageAuthorLabel[user.role]} vous a écrit.`,
      data: { type: 'message', missionId, messageId: message.id },
      channelId: 'messages',
      urgent: true,
    });
    return dto;
  }
}
