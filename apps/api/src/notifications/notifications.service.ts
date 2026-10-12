import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PUSH_PROVIDER, PushProvider } from '../integrations/push.provider';
import { RealtimeService } from '../realtime/realtime.service';

export interface Notification {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Alerte de sécurité : priorité haute, canal « alertes ». */
  critical?: boolean;
  /** Canal Android des notifications non critiques (« default » par défaut, « messages »). */
  channelId?: string;
  /** Remise immédiate même téléphone en veille (messages de la mission). */
  urgent?: boolean;
}

/**
 * Notifications : push, et copie par le temps réel que l'appli affiche elle-même (les APK de
 * test n'ont pas de push). Ne lève jamais d'erreur : une notification perdue ne bloque rien.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    private readonly realtime: RealtimeService,
  ) {}

  async toUsers(userIds: (string | null | undefined)[], n: Notification): Promise<void> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return;
    const live = {
      id: randomUUID(),
      title: n.title,
      body: n.body,
      data: n.data ?? {},
      critical: !!n.critical,
    };
    for (const id of ids) this.realtime.toUser(id, 'notification', live);
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids }, pushToken: { not: null }, status: 'ACTIVE' },
        select: { pushToken: true },
      });
      const messages = users.map((u) => ({
        to: u.pushToken!,
        title: n.title,
        body: n.body,
        // L'appli s'en sert pour faire sonner les alertes même en mode discret.
        data: { ...n.data, critical: !!n.critical },
        priority: n.critical || n.urgent ? ('high' as const) : ('default' as const),
        sound: 'default' as const,
        channelId: n.critical ? 'alerts' : (n.channelId ?? 'default'),
      }));
      if (messages.length > 0) await this.push.send(messages);
    } catch (error) {
      this.logger.warn(`Échec d'envoi de notification « ${n.title} » : ${String(error)}`);
    }
  }
}
