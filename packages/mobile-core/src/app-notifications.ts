import type { AppNotificationDto } from '@hb/shared';
import * as Notifications from 'expo-notifications';
import {
  ensureNotificationChannels,
  hasRemotePush,
  loadDiscreetMode,
  MISSIONS_CHANNEL,
} from './push';
import { useSocketEvent } from './realtime';

/**
 * Notifications de l'API reçues par le temps réel (statut de la protection, propositions de
 * mission, alertes, virements), affichées par l'appli elle-même : les APK de test n'ont pas
 * de service push. Avec le push (projet EAS + Firebase), c'est lui qui les affiche.
 * Les messages ont leur propre logique (chat-notifications : conversation ouverte, relève).
 */

/** Dernières notifications affichées : une même notification n'apparaît qu'une fois. */
const shown: string[] = [];

async function present(n: AppNotificationDto): Promise<void> {
  if (n.data.type === 'message' || hasRemotePush() || shown.includes(n.id)) return;
  shown.push(n.id);
  if (shown.length > 50) shown.shift();
  const discreet = await loadDiscreetMode();
  await ensureNotificationChannels();
  // Mode discret : texte neutre et sans son, sauf pour les alertes de sécurité.
  const neutral = discreet && !n.critical;
  await Notifications.scheduleNotificationAsync({
    identifier: `server-${n.id}`,
    content: {
      title: neutral ? 'Nouvelle information' : n.title,
      body: neutral ? 'Ouvrez l’appli pour la consulter.' : n.body,
      data: { ...n.data, critical: n.critical },
      sound: neutral ? false : 'default',
    },
    trigger: { channelId: n.critical ? 'alerts' : MISSIONS_CHANNEL },
  });
}

/** À placer dans l'espace connecté de chaque appli. */
export function useServerNotifications(): void {
  useSocketEvent('notification', (n) => {
    void present(n).catch(() => undefined);
  });
}
