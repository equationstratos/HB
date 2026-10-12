import {
  REALTIME_NAMESPACE,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@hb/shared';
import { io, type Socket } from 'socket.io-client';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Connexion temps réel authentifiée. Le jeton est relu à chaque (re)connexion, ce qui
 * suffit pour suivre les rafraîchissements de session.
 */
export function connectRealtime(origin: string, getToken: () => string | null): RealtimeSocket {
  return io(`${origin.replace(/\/$/, '')}${REALTIME_NAMESPACE}`, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: getToken() }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });
}

/** Rejoint la salle d'une mission (positions, messages, alertes). */
export async function joinMission(socket: RealtimeSocket, missionId: string): Promise<boolean> {
  const res = await socket
    .timeout(5000)
    .emitWithAck('mission:join', { missionId })
    .catch(() => null);
  return !!res?.ok;
}
