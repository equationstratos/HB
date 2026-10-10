import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@hb/api-client';
import type { LocationPingInput } from '@hb/shared';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useRef, useState } from 'react';
import { applyStoredServerUrl } from './server';
import { getClient } from './session';

/**
 * Partage de position pendant une protection, uniquement pendant la mission active :
 * - en arrière-plan quand c'est possible (development build, autorisation « Toujours ») ;
 * - au premier plan sinon (Expo Go) ;
 * - file d'attente hors-ligne : aucune position perdue dans un tunnel ou un parking.
 */

const TASK = 'hb-location-sharing';
const ACTIVE_KEY = 'hb.tracking.missionId';
const QUEUE_KEY = 'hb.tracking.queue';
const MAX_QUEUE = 1000;

interface Queued {
  missionId: string;
  ping: LocationPingInput;
}

function toPing(loc: Location.LocationObject): LocationPingInput {
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy,
    speed: loc.coords.speed,
    heading: loc.coords.heading,
    recordedAt: new Date(loc.timestamp).toISOString(),
  };
}

const queueKey = (q: Queued) => `${q.missionId}|${q.ping.recordedAt}|${q.ping.lat}|${q.ping.lng}`;

async function readQueue(): Promise<Queued[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '[]') as Queued[];
  } catch {
    return [];
  }
}

async function enqueue(missionId: string, locations: Location.LocationObject[]): Promise<void> {
  const queue = await readQueue();
  queue.push(...locations.map((l) => ({ missionId, ping: toPing(l) })));
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
}

let flushing: Promise<void> | null = null;

/** Envoie les positions en attente, par lots. */
export function flushLocations(): Promise<void> {
  flushing ??= (async () => {
    // Dans la tâche en arrière-plan, l'appli peut avoir été relancée sans interface.
    await applyStoredServerUrl();
    const client = getClient();
    if (!client.accessToken) await client.restore();
    let queue = await readQueue();
    while (queue.length > 0) {
      const missionId = queue[0]!.missionId;
      const batch = queue.filter((q) => q.missionId === missionId).slice(0, 100);
      try {
        await client.api.missions.sendLocations(
          missionId,
          batch.map((b) => b.ping),
        );
      } catch (error) {
        // Réseau indisponible : on garde la file pour plus tard.
        if (!(error instanceof ApiError) || error.isNetwork || error.status >= 500) return;
        // Mission terminée ou accès refusé : ces positions n'ont plus lieu d'être envoyées.
      }
      // De nouvelles positions ont pu arriver pendant l'envoi : on relit la file.
      const sent = new Set(batch.map(queueKey));
      queue = (await readQueue()).filter((q) => !sent.has(queueKey(q)));
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** À appeler au chargement du module racine : la tâche doit exister avant tout démarrage. */
export function defineLocationTask(): void {
  if (TaskManager.isTaskDefined(TASK)) return;
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    TASK,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      const missionId = await AsyncStorage.getItem(ACTIVE_KEY);
      if (!missionId) return;
      await enqueue(missionId, data.locations);
      await flushLocations();
    },
  );
}

export async function requestForegroundLocation(): Promise<boolean> {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  return granted;
}

export async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (!(await requestForegroundLocation())) return null;
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 });
  const loc =
    last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  return { lat: loc.coords.latitude, lng: loc.coords.longitude };
}

export interface SharingState {
  sharing: boolean;
  background: boolean;
  error: string | null;
  last: LocationPingInput | null;
}

/**
 * Partage la position tant que `active` est vrai, puis s'arrête de lui-même.
 * `notice` : texte de la notification permanente Android pendant le suivi.
 */
export function useLocationSharing(
  missionId: string | null,
  active: boolean,
  notice: { title: string; body: string; color: string },
): SharingState {
  const [state, setState] = useState<SharingState>({
    sharing: false,
    background: false,
    error: null,
    last: null,
  });
  const noticeRef = useRef(notice);
  noticeRef.current = notice;

  useEffect(() => {
    if (!missionId || !active) return;
    let cancelled = false;
    let watch: Location.LocationSubscription | null = null;
    let background = false;

    void (async () => {
      if (!(await requestForegroundLocation())) {
        setState((s) => ({
          ...s,
          error: 'Autorisez la localisation pour être suivie pendant votre trajet.',
        }));
        return;
      }
      await AsyncStorage.setItem(ACTIVE_KEY, missionId);
      try {
        const bg = await Location.requestBackgroundPermissionsAsync();
        if (bg.granted) {
          await Location.startLocationUpdatesAsync(TASK, {
            accuracy: Location.Accuracy.High,
            distanceInterval: 15,
            timeInterval: 10_000,
            deferredUpdatesInterval: 10_000,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            activityType: Location.ActivityType.Fitness,
            foregroundService: {
              notificationTitle: noticeRef.current.title,
              notificationBody: noticeRef.current.body,
              notificationColor: noticeRef.current.color,
              killServiceOnDestroy: false,
            },
          });
          background = true;
        }
      } catch {
        // Expo Go ne permet pas le suivi en arrière-plan : on reste au premier plan.
        background = false;
      }
      if (cancelled) return;
      // Au premier plan, on suit aussi la position pour l'affichage (et l'envoi si pas d'arrière-plan).
      watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5_000 },
        (loc) => {
          setState((s) => ({ ...s, last: toPing(loc) }));
          if (!background) void enqueue(missionId, [loc]).then(flushLocations);
        },
      );
      setState((s) => ({ ...s, sharing: true, background, error: null }));
    })();

    const timer = setInterval(() => void flushLocations(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      watch?.remove();
      void (async () => {
        if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
          await Location.stopLocationUpdatesAsync(TASK).catch(() => undefined);
        }
        await AsyncStorage.removeItem(ACTIVE_KEY);
        await flushLocations();
      })();
      setState({ sharing: false, background: false, error: null, last: null });
    };
  }, [missionId, active]);

  return state;
}
