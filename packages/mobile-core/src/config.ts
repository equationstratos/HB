import Constants from 'expo-constants';

/**
 * URL de l'API. En développement sur téléphone, utilisez l'adresse IP de l'ordinateur
 * (ex. EXPO_PUBLIC_API_URL=http://192.168.1.20:3000/api), jamais « localhost ».
 */
export function apiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  if (extra?.apiUrl) return extra.apiUrl;
  // Adresse de la machine qui sert le bundle Metro (pratique avec Expo Go).
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:3000/api` : 'http://localhost:3000/api';
}
