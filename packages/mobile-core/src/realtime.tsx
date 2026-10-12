import { connectRealtime, type RealtimeSocket } from '@hb/api-client';
import type { ServerToClientEvents } from '@hb/shared';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { getClient, useSession } from './session';

interface RealtimeState {
  socket: RealtimeSocket | null;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeState>({ socket: null, connected: false });

/** Connexion temps réel ouverte tant que la personne est connectée. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return;
    const client = getClient();
    const s = connectRealtime(client.origin, () => client.accessToken);
    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    // Retour au premier plan : on se reconnecte tout de suite.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !s.connected) s.connect();
    });
    return () => {
      sub.remove();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user]);

  return (
    <RealtimeContext.Provider value={{ socket, connected }}>{children}</RealtimeContext.Provider>
  );
}

export const useRealtime = () => useContext(RealtimeContext);

/** Abonnement à un événement temps réel, nettoyé automatiquement. */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
): void {
  const { socket } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const listener = ((...args: Parameters<ServerToClientEvents[E]>) =>
      (ref.current as (...a: unknown[]) => void)(...args)) as never;
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
