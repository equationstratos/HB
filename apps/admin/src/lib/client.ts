import { ApiClient, cookieStorage } from '@hb/api-client';

/** Client unique de l'admin : même origine que l'API (proxy Vite en développement). */
export const client = new ApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api',
  storage: cookieStorage,
  web: true,
});

export const api = client.api;
