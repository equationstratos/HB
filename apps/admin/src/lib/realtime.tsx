import { connectRealtime, type RealtimeSocket } from '@hb/api-client';
import { deviationTypeLabel, formatPrice, type LocationDto } from '@hb/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { client } from './client';
import { fullName } from './format';
import { useSession } from './session';
import { playAlarm } from './sound';
import { useToast } from './toasts';

export interface LivePositions {
  client?: LocationDto;
  guard?: LocationDto;
}

interface RealtimeState {
  socket: RealtimeSocket | null;
  connected: boolean;
  /** Dernières positions reçues, par mission. */
  positions: Record<string, LivePositions>;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
}

const RealtimeContext = createContext<RealtimeState>({
  socket: null,
  connected: false,
  positions: {},
  soundOn: true,
  setSoundOn: () => undefined,
});

/**
 * Connexion temps réel de l'admin : alertes, positions, changements de statut.
 * Chaque événement rafraîchit les données concernées.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [positions, setPositions] = useState<Record<string, LivePositions>>({});
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  useEffect(() => {
    if (!user) return;
    const s = connectRealtime(client.origin, () => client.accessToken);
    setSocket(s);
    const invalidate = (...keys: string[]) =>
      keys.forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('location', (loc) => {
      setPositions((prev) => ({
        ...prev,
        [loc.missionId]: {
          ...prev[loc.missionId],
          [loc.role === 'CLIENT' ? 'client' : 'guard']: loc,
        },
      }));
    });
    s.on('mission:updated', (m) => {
      queryClient.setQueryData(['mission', m.id], m);
      invalidate('live', 'missions', 'overview');
    });
    s.on('mission:unassigned', (m) => {
      toast({
        tone: 'warning',
        title: 'Aucun garde trouvé',
        body: `Protection de ${fullName(m.client)} à attribuer manuellement.`,
      });
      if (soundRef.current) playAlarm('warning');
      invalidate('missions', 'overview');
    });
    s.on('alert:sos', (a) => {
      toast({
        tone: 'danger',
        title: '🚨 Alerte SOS',
        body: a.message ?? 'Une alerte vient d’être déclenchée.',
      });
      if (soundRef.current) playAlarm('sos');
      invalidate('alerts', 'live', 'overview');
    });
    s.on('alert:deviation', (d) => {
      toast({
        tone: 'warning',
        title: deviationTypeLabel[d.type],
        body: 'Vérifiez la situation de la cliente.',
      });
      if (soundRef.current) playAlarm('warning');
      invalidate('alerts', 'live', 'overview');
    });
    s.on('alert:sos-updated', () => invalidate('alerts', 'live', 'overview'));
    s.on('alert:deviation-updated', () => invalidate('alerts', 'live', 'overview'));
    s.on('route:updated', ({ missionId }) => invalidate('live', 'mission', missionId));
    s.on('chat:message', (msg) => invalidate('messages', msg.missionId));
    s.on('guard:application', () => {
      toast({
        tone: 'info',
        title: 'Nouvelle candidature de garde',
        body: 'Une candidature attend votre validation.',
      });
      invalidate('guards', 'overview');
    });
    s.on('payout:requested', (p) => {
      toast({
        tone: 'info',
        title: 'Demande de virement',
        body: `${fullName(p.guard)} demande le virement de ${formatPrice(p.amountCents)}.`,
      });
      invalidate('payouts');
    });

    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user, queryClient, toast]);

  const value = useMemo(
    () => ({ socket, connected, positions, soundOn, setSoundOn }),
    [socket, connected, positions, soundOn],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);
