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

/**
 * Enregistre le jeton push auprès de l'API. Silencieux en cas d'échec : sur Expo Go
 * Android ou sur simulateur, les notifications distantes ne sont pas disponibles.
 */
export async function registerForPush(api: ApiEndpoints): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alerts', {
        name: 'Alertes de sécurité',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 400, 200, 400],
        bypassDnd: true,
      });
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Informations',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    if (!Device.isDevice) return null;
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;
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
