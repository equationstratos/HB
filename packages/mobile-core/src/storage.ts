import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RefreshTokenStorage } from '@hb/api-client';
import * as SecureStore from 'expo-secure-store';

const REFRESH_KEY = 'hb.refreshToken';

/**
 * Jeton de rafraîchissement dans le trousseau sécurisé du téléphone.
 * Accessible après le premier déverrouillage pour que le suivi GPS en arrière-plan
 * puisse continuer d'envoyer les positions écran verrouillé.
 */
export const secureTokenStorage: RefreshTokenStorage = {
  get: () =>
    SecureStore.getItemAsync(REFRESH_KEY, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  set: async (token) => {
    if (token)
      await SecureStore.setItemAsync(REFRESH_KEY, token, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

/** Préférences non sensibles (mode discret…). */
export const prefs = {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await AsyncStorage.getItem(`hb.pref.${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(`hb.pref.${key}`, JSON.stringify(value));
  },
};
