import { normalizeServerUrl, REQUIRED_API_LEVEL } from '@hb/shared';
import { useEffect, useState } from 'react';
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

export interface ServerCheck {
  reachable: boolean;
  /** Serveur assez récent pour cette version de l'appli. */
  upToDate: boolean;
}

/** Vérifie que l'API répond à cette adresse et qu'elle est assez récente pour l'appli. */
export async function inspectServer(url: string): Promise<ServerCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    if (!res.ok) return { reachable: false, upToDate: false };
    // Les serveurs d'avant le niveau d'API n'envoient pas apiLevel.
    const body = (await res.json().catch(() => ({}))) as { apiLevel?: unknown };
    const level = typeof body.apiLevel === 'number' ? body.apiLevel : 1;
    return { reachable: true, upToDate: level >= REQUIRED_API_LEVEL };
  } catch {
    return { reachable: false, upToDate: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Vérifie que l'API répond à cette adresse. */
export async function checkServer(url: string): Promise<boolean> {
  return (await inspectServer(url)).reachable;
}

const checks = new Map<string, Promise<ServerCheck>>();

/**
 * Vrai quand le serveur choisi répond mais est trop ancien pour l’appli (vérifié une fois
 * par adresse). Un serveur injoignable n'est pas signalé ici : les écrans le montrent déjà.
 */
export function useServerOutdated(): boolean {
  const url = currentServerUrl();
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    let active = true;
    let check = checks.get(url);
    if (!check) {
      check = inspectServer(url);
      checks.set(url, check);
    }
    void check.then((result) => {
      if (!result.reachable) checks.delete(url); // nouvel essai au prochain affichage
      if (active) setOutdated(result.reachable && !result.upToDate);
    });
    return () => {
      active = false;
    };
  }, [url]);
  return outdated;
}

export { normalizeServerUrl };
