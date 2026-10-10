import { normalizeServerUrl } from '@hb/shared';
import { prefs } from './storage';
import { getClient } from './session';

const KEY = 'serverUrl';
let applied = false;

/** Applique l'adresse enregistrée (au démarrage, et dans la tâche GPS en arrière-plan). */
export async function applyStoredServerUrl(): Promise<void> {
  if (applied) return;
  applied = true;
  const stored = await prefs.get<string | null>(KEY, null);
  if (stored) getClient().setBaseUrl(stored);
}

export async function saveServerUrl(url: string): Promise<void> {
  await prefs.set(KEY, url);
  getClient().setBaseUrl(url);
}

export function currentServerUrl(): string {
  return getClient().baseUrl;
}

/** Vérifie que l'API répond à cette adresse. */
export async function checkServer(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export { normalizeServerUrl };
