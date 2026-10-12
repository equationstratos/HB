import { errorMessage } from '@hb/api-client';
import {
  Button,
  Card,
  ErrorText,
  fmtTime,
  RouteMap,
  Row,
  T,
  useApi,
  useTheme,
} from '@hb/mobile-core';
import { formatDistance, formatDuration, transportModeLabel, type OfferDto } from '@hb/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

function countdown(expiresAt: string): string {
  const s = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return s >= 3600
    ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Proposition de mission : trajet, horaire, distance ; acceptation en un geste. Rien sur
 * l'identité de la cliente.
 */
export function OfferCard({ offer, onDone }: { offer: OfferDto; onDone: (id: string) => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const { colors } = useTheme();
  const [left, setLeft] = useState(countdown(offer.expiresAt));
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = offer.mission;
  const immediate = new Date(m.departureAt).getTime() - Date.now() < 30 * 60_000;

  useEffect(() => {
    const timer = setInterval(() => setLeft(countdown(offer.expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [offer.expiresAt]);

  const act = async (kind: 'accept' | 'decline') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'accept') {
        const { missionId } = await api.offers.accept(offer.id);
        onDone(offer.id);
        router.push(`/mission/${missionId}`);
      } else {
        await api.offers.decline(offer.id);
        onDone(offer.id);
      }
    } catch (e) {
      setError(errorMessage(e));
      if (kind === 'accept') setTimeout(() => onDone(offer.id), 2500);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ borderColor: colors.primary, borderWidth: 1.5 }}>
      <Row>
        <T variant="heading" style={{ flex: 1 }}>
          {t('home.departure', { when: immediate ? t('home.now') : fmtTime(m.departureAt) })}
        </T>
        <T variant="small" style={{ color: colors.warning, fontWeight: '700' }}>
          {t('home.expiresIn', { time: left })}
        </T>
      </Row>
      <T variant="muted">
        {transportModeLabel[m.route.mode]} · {formatDistance(m.route.distanceMeters)} ·{' '}
        {formatDuration(m.route.durationSeconds)}
      </T>
      <T variant="small">
        {m.route.waypoints[0]?.address ?? 'Départ'} →{' '}
        {m.route.waypoints[m.route.waypoints.length - 1]?.address ?? 'Arrivée'}
      </T>
      <T variant="small">
        {t('home.fromYou', { distance: formatDistance(offer.distanceToStartMeters) })}
      </T>
      <RouteMap line={m.route.geometry.coordinates} waypoints={m.route.waypoints} height={150} />
      <ErrorText error={error} />
      <Row gap={8}>
        <Button
          title={t('home.decline')}
          variant="secondary"
          style={{ flex: 1 }}
          loading={busy === 'decline'}
          onPress={() => void act('decline')}
        />
        <Button
          title={t('home.accept')}
          icon="checkmark"
          style={{ flex: 2 }}
          loading={busy === 'accept'}
          onPress={() => void act('accept')}
        />
      </Row>
    </Card>
  );
}
