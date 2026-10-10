import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUSH_PROVIDER, PushProvider } from '../integrations/push.provider';

export interface Notification {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Alerte de sécurité : priorité haute, canal « alertes ». */
  critical?: boolean;
}

/** Notifications push. Ne lève jamais d'erreur : une notification perdue ne bloque rien. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  async toUsers(userIds: (string | null | undefined)[], n: Notification): Promise<void> {
    const ids = userIds.filter((id): id is string => !!id);
    if (ids.length === 0) return;
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids }, pushToken: { not: null }, status: 'ACTIVE' },
        select: { pushToken: true },
      });
      const messages = users.map((u) => ({
        to: u.pushToken!,
        title: n.title,
        body: n.body,
        data: n.data,
        priority: n.critical ? ('high' as const) : ('default' as const),
        sound: 'default' as const,
        channelId: n.critical ? 'alerts' : 'default',
      }));
      if (messages.length > 0) await this.push.send(messages);
    } catch (error) {
      this.logger.warn(`Échec d'envoi de notification « ${n.title} » : ${String(error)}`);
    }
  }
}
