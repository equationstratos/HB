import { errorMessage } from '@hb/api-client';
import { Button, ErrorText, Loading, Screen, useApi } from '@hb/mobile-core';
import type { ComputedRoute, RouteWaypoint, TransportMode } from '@hb/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RouteBuilder } from '@/components/RouteBuilder';

/** Modification du trajet, avant ou pendant la protection (le garde est prévenu). */
export default function EditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const mission = useQuery({ queryKey: ['mission', id], queryFn: () => api.missions.get(id) });
  const [route, setRoute] = useState<{
    mode: TransportMode;
    points: RouteWaypoint[];
    preview: ComputedRoute | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!mission.data) return <Loading />;
  const m = mission.data;

  const save = async () => {
    if (!route) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.missions.updateRoute(id, {
        mode: route.mode,
        points: route.points,
      });
      queryClient.setQueryData(['mission', id], updated);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['left', 'right']}>
      <RouteBuilder
        initialSlots={m.route.waypoints}
        initialMode={m.route.mode}
        onChange={setRoute}
      />
      <ErrorText error={error} />
      <Button
        title={t('book.confirmEdit')}
        onPress={() => void save()}
        loading={busy}
        disabled={!route?.preview}
      />
    </Screen>
  );
}
