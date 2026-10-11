import type { ApiEndpoints } from '@hb/api-client';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { prefs } from './storage';

let discreet = false;

/** Mode discret : notifications silencieuses, sauf les alertes de sécurité. */
export async function setDiscreetMode(on: boolean): Promise<void> {
  discreet = on;
  await prefs.set('discreet', on);
}

export async function loadDiscreetMode(): Promise<boolean> {
  discreet = await prefs.get('discreet', false);
  return discreet;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const critical = notification.request.content.data?.critical === true;
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: critical || !discreet,
      shouldSetBadge: false,
    };
  },
});

/** Canal Android des messages de la mission (notifications distantes et locales). */
export const MESSAGES_CHANNEL = 'messages';

let channels: Promise<void> | null = null;

/** Canaux Android, créés une fois (aussi depuis la tâche GPS en arrière-plan). */
export function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channels ??= (async () => {
    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Alertes de sécurité',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400],
      bypassDnd: true,
    });
    await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL, {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      // Écran verrouillé : la notification apparaît, mais pas le texte du message.
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: 'default',
      vibrationPattern: [0, 250, 150, 250],
    });
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Informations',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  })().catch((error: unknown) => {
    channels = null;
    throw error;
  });
  return channels;
}

/**
 * Canaux et autorisation d'afficher des notifications (Android 13+ : POST_NOTIFICATIONS).
 * Nécessaire aussi sans jeton push : les notifications locales des messages en dépendent.
 */
export async function prepareNotifications(): Promise<boolean> {
  await ensureNotificationChannels();
  const current = await Notifications.getPermissionsAsync();
  return current.granted || (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Enregistre le jeton push auprès de l'API. Silencieux en cas d'échec : sur Expo Go
 * Android, sur simulateur ou dans un APK sans projet EAS ni Firebase, les notifications
 * distantes ne sont pas disponibles (les notifications locales restent possibles).
 */
export async function registerForPush(api: ApiEndpoints): Promise<string | null> {
  try {
    if (!(await prepareNotifications())) return null;
    if (!Device.isDevice) return null;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId ?? Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined))
      .data;
    await api.me.setPushToken(token);
    return token;
  } catch {
    return null;
  }
}
