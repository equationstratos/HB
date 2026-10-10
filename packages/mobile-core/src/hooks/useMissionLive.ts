import { joinMission } from '@hb/api-client';
import type { DeviationDto, LatLng, MissionDto, SosAlertDto } from '@hb/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useRealtime, useSocketEvent } from '../realtime';
import { useApi } from '../session';

export interface MissionLive {
  mission: MissionDto | undefined;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  client: LatLng | null;
  guard: LatLng | null;
  openDeviations: DeviationDto[];
  openSos: SosAlertDto[];
}

/**
 * État d'une mission tenu à jour en temps réel : statut, trajet, positions, alertes.
 */
export function useMissionLive(missionId: string): MissionLive {
  const api = useApi();
  const queryClient = useQueryClient();
  const { socket, connected } = useRealtime();
  const key = ['mission', missionId];
  const query = useQuery({ queryKey: key, queryFn: () => api.missions.get(missionId) });
  const [client, setClient] = useState<LatLng | null>(null);
  const [guard, setGuard] = useState<LatLng | null>(null);
  const [deviations, setDeviations] = useState<DeviationDto[]>([]);
  const [sos, setSos] = useState<SosAlertDto[]>([]);
  const status = query.data?.status;

  const loadAlerts = useCallback(async () => {
    const [d, s] = await Promise.all([
      api.missions.deviations(missionId).catch(() => []),
      api.missions.sosList(missionId).catch(() => []),
    ]);
    setDeviations(d);
    setSos(s);
  }, [api, missionId]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  // Rejoindre la salle de la mission (positions, messages) tant qu'elle est ouverte.
  useEffect(() => {
    if (!socket || !connected || !status) return;
    if (status === 'COMPLETED' || status === 'CANCELLED') return;
    void joinMission(socket, missionId);
  }, [socket, connected, status, missionId]);

  // Dernières positions connues au chargement.
  useEffect(() => {
    if (status !== 'GUARD_EN_ROUTE' && status !== 'IN_PROGRESS') return;
    api.missions
      .locations(missionId)
      .then((locs) => {
        const lastOf = (role: string) => [...locs].reverse().find((l) => l.role === role);
        const c = lastOf('CLIENT');
        const g = lastOf('GUARD');
        if (c) setClient({ lat: c.lat, lng: c.lng });
        if (g) setGuard({ lat: g.lat, lng: g.lng });
      })
      .catch(() => undefined);
  }, [api, missionId, status]);

  useSocketEvent('mission:updated', (m) => {
    if (m.id === missionId) queryClient.setQueryData(key, m);
  });
  useSocketEvent('route:updated', ({ missionId: id, route }) => {
    if (id !== missionId) return;
    queryClient.setQueryData<MissionDto>(key, (prev) => (prev ? { ...prev, route } : prev));
  });
  useSocketEvent('location', (l) => {
    if (l.missionId !== missionId) return;
    if (l.role === 'CLIENT') setClient({ lat: l.lat, lng: l.lng });
    if (l.role === 'GUARD') setGuard({ lat: l.lat, lng: l.lng });
  });
  const upsert = <T extends { id: string }>(list: T[], item: T) => [
    item,
    ...list.filter((x) => x.id !== item.id),
  ];
  useSocketEvent(
    'alert:deviation',
    (d) => d.missionId === missionId && setDeviations((l) => upsert(l, d)),
  );
  useSocketEvent(
    'alert:deviation-updated',
    (d) => d.missionId === missionId && setDeviations((l) => upsert(l, d)),
  );
  useSocketEvent('alert:sos', (a) => a.missionId === missionId && setSos((l) => upsert(l, a)));
  useSocketEvent(
    'alert:sos-updated',
    (a) => a.missionId === missionId && setSos((l) => upsert(l, a)),
  );

  return {
    mission: query.data,
    loading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
      void loadAlerts();
    },
    client,
    guard,
    openDeviations: deviations.filter((d) => d.status !== 'RESOLVED'),
    openSos: sos.filter((a) => a.status !== 'RESOLVED'),
  };
}
