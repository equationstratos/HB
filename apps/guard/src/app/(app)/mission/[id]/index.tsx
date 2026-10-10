import { errorMessage } from '@hb/api-client';
import {
  Banner,
  Button,
  Card,
  ErrorText,
  fmtDateTime,
  fmtTime,
  Loading,
  MissionSteps,
  RouteMap,
  Row,
  Screen,
  SosButton,
  T,
  useApi,
  useLocationSharing,
  useMissionLive,
  useSocketEvent,
  useTheme,
} from '@hb/mobile-core';
import {
  deviationTypeLabel,
  formatDistance,
  formatDuration,
  missionStatusLabel,
  SOS_STATUSES,
  transportModeLabel,
} from '@hb/shared';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

/** Mission du garde : rejoindre la cliente, la suivre à distance, réagir aux alertes. */
export default function GuardMission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const api = useApi();
  const { colors } = useTheme();
  const live = useMissionLive(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const m = live.mission;
  const tracking = m?.status === 'GUARD_EN_ROUTE' || m?.status === 'IN_PROGRESS';
  const sharing = useLocationSharing(id, tracking, {
    title: t('mission.sharing'),
    body: m?.client.firstName ?? '',
    color: colors.primary,
  });

  useSocketEvent('alert:sos', (a) => {
    if (a.missionId === id) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  });
  useSocketEvent('route:updated', ({ missionId }) => {
    if (missionId === id) setNotice(t('mission.routeChanged'));
  });

  if (live.loading || !m) return <Loading />;

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (success) setNotice(success);
      live.refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const me = sharing.last ? { lat: sharing.last.lat, lng: sharing.last.lng } : live.guard;
  const sos = live.openSos[0];
  const lastAlert = sos?.lat != null && sos.lng != null ? { lat: sos.lat, lng: sos.lng } : null;

  return (
    <Screen edges={['left', 'right']}>
      <Stack.Screen options={{ title: missionStatusLabel[m.status] }} />

      {sos && (
        <Banner
          tone="danger"
          icon="alert-circle"
          title={t('mission.sosTitle')}
          message={sos.message ?? t('mission.sosClient')}
        >
          <Row gap={8}>
            {sos.status === 'OPEN' && (
              <Button
                title={t('mission.intervene')}
                variant="danger"
                small
                style={{ flex: 1 }}
                loading={busy === 'ack'}
                onPress={() =>
                  void run('ack', () => api.sos.acknowledge(sos.id, 'Le garde intervient'))
                }
              />
            )}
            <Button
              title={t('mission.call')}
              variant="secondary"
              small
              icon="call"
              style={{ flex: 1 }}
              onPress={() =>
                void run('call', async () => setNotice((await api.missions.call(id)).message))
              }
            />
            <Button
              title="17"
              variant="secondary"
              small
              onPress={() => void Linking.openURL('tel:17')}
            />
          </Row>
        </Banner>
      )}
      {live.openDeviations.map((d) => (
        <Banner
          key={d.id}
          tone="warning"
          icon="warning"
          title={t('mission.deviation', { type: deviationTypeLabel[d.type] })}
          message={
            d.distanceMeters
              ? t('mission.deviationDistance', { distance: formatDistance(d.distanceMeters) })
              : undefined
          }
        >
          <Row gap={8}>
            {d.status === 'OPEN' && (
              <Button
                title={t('mission.handle')}
                small
                style={{ flex: 1 }}
                onPress={() => void run(`d-${d.id}`, () => api.deviations.acknowledge(d.id))}
              />
            )}
            <Button
              title={t('mission.resolve')}
              variant="secondary"
              small
              style={{ flex: 1 }}
              onPress={() => void run(`r-${d.id}`, () => api.deviations.resolve(d.id))}
            />
          </Row>
        </Banner>
      ))}
      {notice && <Banner tone="primary" icon="information-circle" title={notice} />}

      <MissionSteps status={m.status} />

      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <T variant="small">{t('mission.client')}</T>
            <T variant="heading">
              {m.client.firstName} {m.client.lastName}
            </T>
          </View>
          <View
            style={{
              backgroundColor: colors.primarySoft,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
              alignItems: 'center',
            }}
          >
            <T variant="small">{t('mission.codeWord')}</T>
            <T variant="heading" style={{ color: colors.primary }}>
              {m.codeWord}
            </T>
          </View>
        </Row>
        <T variant="small">{t('mission.codeWordHint')}</T>
        {m.notes && <T variant="muted">{t('mission.notes', { notes: m.notes })}</T>}
        {m.status !== 'COMPLETED' && m.status !== 'CANCELLED' && (
          <Row gap={8}>
            <Button
              title={t('mission.message')}
              icon="chatbubble-ellipses"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push(`/mission/${id}/chat`)}
            />
            <Button
              title={t('mission.call')}
              icon="call"
              variant="secondary"
              style={{ flex: 1 }}
              loading={busy === 'call'}
              onPress={() =>
                void run('call', async () => setNotice((await api.missions.call(id)).message))
              }
            />
          </Row>
        )}
      </Card>

      <RouteMap
        line={m.route.geometry.coordinates}
        waypoints={m.route.waypoints}
        client={live.client}
        guard={me}
        alert={lastAlert}
        height={320}
      />
      <Card>
        <T variant="label">
          {fmtDateTime(m.departureAt)} · {transportModeLabel[m.route.mode]}
        </T>
        <T variant="muted">
          {formatDistance(m.route.distanceMeters)} · {formatDuration(m.route.durationSeconds)}
          {m.status === 'IN_PROGRESS'
            ? ` · arrivée prévue ${fmtTime(m.route.expectedArrivalAt)}`
            : ''}
        </T>
        {m.route.waypoints.map((w, i) => (
          <T key={i} variant="small">
            {i === 0 ? 'Départ' : i === m.route.waypoints.length - 1 ? 'Arrivée' : `Étape ${i}`} :{' '}
            {w.address ?? `${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}`}
          </T>
        ))}
        {tracking && <T variant="small">{t('mission.sharing')}</T>}
        {tracking && sharing.sharing && !sharing.background && (
          <T variant="small">{t('mission.sharingForeground')}</T>
        )}
        <ErrorText error={sharing.error} />
      </Card>

      <ErrorText error={error} />
      {m.status === 'ASSIGNED' && (
        <Button
          title={t('mission.goEnRoute')}
          icon="navigate"
          loading={busy === 'step'}
          onPress={() => void run('step', () => api.missions.setStatus(id, 'GUARD_EN_ROUTE'))}
        />
      )}
      {m.status === 'GUARD_EN_ROUTE' && (
        <Button
          title={t('mission.start')}
          icon="eye"
          loading={busy === 'step'}
          onPress={() => void run('step', () => api.missions.setStatus(id, 'IN_PROGRESS'))}
        />
      )}
      {m.status === 'IN_PROGRESS' && (
        <Button
          title={t('mission.finish')}
          icon="flag"
          variant="secondary"
          loading={busy === 'step'}
          onPress={() => void run('step', () => api.missions.setStatus(id, 'COMPLETED'))}
        />
      )}
      {m.status === 'COMPLETED' && (
        <Banner tone="success" icon="checkmark-circle" title={t('mission.completed')} />
      )}
      {SOS_STATUSES.includes(m.status) && (
        <SosButton
          label="SOS garde"
          disabled={busy === 'sos'}
          onTrigger={() =>
            void run(
              'sos',
              () =>
                api.missions.sos(
                  id,
                  me
                    ? { lat: me.lat, lng: me.lng, message: 'Le garde demande du renfort' }
                    : { message: 'Le garde demande du renfort' },
                ),
              t('mission.sosSent'),
            )
          }
        />
      )}
    </Screen>
  );
}
