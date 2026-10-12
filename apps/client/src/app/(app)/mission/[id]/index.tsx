import { errorMessage } from '@hb/api-client';
import {
  Badge,
  Banner,
  Button,
  Card,
  currentPosition,
  ErrorText,
  fmtDateTime,
  fmtTime,
  Loading,
  MissionSteps,
  RouteMap,
  Row,
  Screen,
  SosButton,
  Stars,
  T,
  useApi,
  useLocationSharing,
  useMissionLive,
  useTheme,
} from '@hb/mobile-core';
import {
  allowedNextStatuses,
  deviationTypeLabel,
  formatDistance,
  formatDuration,
  missionStatusLabel,
  ROUTE_EDITABLE_STATUSES,
  SOS_STATUSES,
  transportModeLabel,
} from '@hb/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { statusTone } from '@/components/MissionCard';

export default function MissionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const api = useApi();
  const { colors } = useTheme();
  const live = useMissionLive(id);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const m = live.mission;
  const tracking = m?.status === 'GUARD_EN_ROUTE' || m?.status === 'IN_PROGRESS';
  const sharing = useLocationSharing(id, tracking, {
    title: t('mission.sharing'),
    body: m?.route.waypoints[m.route.waypoints.length - 1]?.address ?? '',
    color: colors.primary,
  });

  if (live.loading || !m) return <Loading />;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      live.refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const sos = () =>
    void run('sos', async () => {
      const pos = sharing.last ?? (await currentPosition());
      await api.missions.sos(id, pos ? { lat: pos.lat, lng: pos.lng } : {});
      setNotice(t('mission.sosSent'));
    });

  const call = () =>
    void run('call', async () => {
      const res = await api.missions.call(id);
      setNotice(res.message);
    });

  const cancel = () =>
    Alert.alert(t('mission.cancelConfirm'), undefined, [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('common.yes'),
        style: 'destructive',
        onPress: () => void run('cancel', () => api.missions.cancel(id)),
      },
    ]);

  const pending = live.openDeviations.find((d) => d.clientConfirmedOk === null);
  const me = sharing.last ? { lat: sharing.last.lat, lng: sharing.last.lng } : live.client;
  const canCancel = allowedNextStatuses(m.status, 'CLIENT').includes('CANCELLED');
  const end = m.route.waypoints[m.route.waypoints.length - 1];

  return (
    <Screen edges={['left', 'right']}>
      <Stack.Screen options={{ title: missionStatusLabel[m.status] }} />

      {pending && (
        <Banner
          tone="danger"
          icon="help-buoy"
          title={t('mission.okTitle')}
          message={t('mission.okMessage', { type: deviationTypeLabel[pending.type].toLowerCase() })}
        >
          <Row gap={8}>
            <Button
              title={t('mission.imOk')}
              small
              style={{ flex: 1 }}
              loading={busy === 'ok'}
              onPress={() => void run('ok', () => api.deviations.answer(pending.id, true))}
            />
            <Button
              title={t('mission.needHelp')}
              small
              variant="danger"
              style={{ flex: 1 }}
              loading={busy === 'help'}
              onPress={() => void run('help', () => api.deviations.answer(pending.id, false))}
            />
          </Row>
        </Banner>
      )}
      {notice && (
        <Banner
          tone={live.openSos.length ? 'danger' : 'success'}
          icon="information-circle"
          title={notice}
        >
          {live.openSos.length > 0 && (
            <Button
              title={t('mission.call17')}
              variant="danger"
              small
              icon="call"
              onPress={() => void Linking.openURL('tel:17')}
            />
          )}
        </Banner>
      )}

      <MissionSteps status={m.status} />

      {m.status === 'SEARCHING' && (
        <Card>
          <Row gap={12}>
            <ActivityIndicator color={colors.primary} />
            <T style={{ flex: 1 }}>{t('mission.searching')}</T>
          </Row>
        </Card>
      )}
      {m.status === 'UNASSIGNED' && (
        <Banner tone="warning" icon="time" title={t('mission.unassigned')} />
      )}
      {m.status === 'COMPLETED' && (
        <Banner tone="success" icon="checkmark-circle" title={t('mission.completed')} />
      )}
      {m.status === 'CANCELLED' && (
        <Banner tone="neutral" icon="close-circle" title={t('mission.cancelled')} />
      )}

      {m.guard && m.status !== 'COMPLETED' && m.status !== 'CANCELLED' && (
        <Card>
          <T variant="small">{t('mission.yourGuard')}</T>
          <Row>
            <T variant="heading" style={{ flex: 1 }}>
              {m.guard.firstName} {m.guard.lastName}
            </T>
            <Stars value={m.guard.ratingAvg} />
          </Row>
          <View
            style={{ backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, gap: 2 }}
          >
            <T variant="small">{t('mission.codeWord')}</T>
            <T variant="title" style={{ color: colors.primary }}>
              {m.codeWord}
            </T>
            <T variant="small">{t('mission.codeWordHint')}</T>
          </View>
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
              onPress={call}
            />
          </Row>
        </Card>
      )}

      <RouteMap
        line={m.route.geometry.coordinates}
        waypoints={m.route.waypoints}
        client={me}
        guard={live.guard}
        height={300}
      />
      <Card>
        <Row>
          <T variant="label" style={{ flex: 1 }}>
            {fmtDateTime(m.departureAt)}
          </T>
          <Badge label={transportModeLabel[m.route.mode]} tone={statusTone[m.status]} />
        </Row>
        <T variant="muted">
          {formatDistance(m.route.distanceMeters)} · {formatDuration(m.route.durationSeconds)} ·{' '}
          {end?.address ?? ''}
        </T>
        {m.status === 'IN_PROGRESS' && (
          <T variant="small">Arrivée prévue vers {fmtTime(m.route.expectedArrivalAt)}</T>
        )}
        {tracking && (
          <Row gap={6}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: sharing.sharing ? colors.success : colors.warning,
              }}
            />
            <T variant="small">{t('mission.sharing')}</T>
          </Row>
        )}
        {tracking && sharing.sharing && !sharing.background && (
          <T variant="small">{t('mission.sharingForeground')}</T>
        )}
        <ErrorText error={sharing.error} />
      </Card>

      {SOS_STATUSES.includes(m.status) && <SosButton onTrigger={sos} disabled={busy === 'sos'} />}

      <ErrorText error={error} />
      {m.status === 'IN_PROGRESS' && (
        <Button
          title={t('mission.arrived')}
          icon="home"
          loading={busy === 'done'}
          onPress={() => void run('done', () => api.missions.setStatus(id, 'COMPLETED'))}
        />
      )}
      {ROUTE_EDITABLE_STATUSES.includes(m.status) && (
        <Button
          title={t('mission.editRoute')}
          icon="git-branch"
          variant="secondary"
          onPress={() => router.push(`/mission/${id}/edit-route`)}
        />
      )}
      {m.status === 'COMPLETED' && !m.rating && (
        <Button
          title={t('mission.rate')}
          icon="star"
          onPress={() => router.push(`/mission/${id}/rate`)}
        />
      )}
      {m.rating && <Stars value={m.rating.score} size={22} />}
      {canCancel && (
        <Button
          title={t('mission.cancel')}
          variant="ghost"
          loading={busy === 'cancel'}
          onPress={cancel}
        />
      )}
    </Screen>
  );
}
