import { errorMessage } from '@hb/api-client';
import { Button, Card, Chip, ErrorText, Field, Row, Screen, T, useApi } from '@hb/mobile-core';
import {
  formatPrice,
  ONE_OFF_PRICE_CENTS,
  type ComputedRoute,
  type MissionType,
  type RouteWaypoint,
  type TransportMode,
} from '@hb/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RouteBuilder } from '@/components/RouteBuilder';

type When = 'now' | 'in30' | 'in60' | 'other';

function roundToQuarter(d: Date): Date {
  const r = new Date(d);
  r.setSeconds(0, 0);
  r.setMinutes(Math.ceil(r.getMinutes() / 15) * 15);
  return r;
}

/** Réservation : la cliente définit le trajet à surveiller, l'horaire et la formule. */
export default function Book() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [route, setRoute] = useState<{
    mode: TransportMode;
    points: RouteWaypoint[];
    preview: ComputedRoute | null;
  }>({
    mode: 'WALK',
    points: [],
    preview: null,
  });
  const [when, setWhen] = useState<When>('now');
  const [day, setDay] = useState(0);
  const [time, setTime] = useState(() => roundToQuarter(new Date(Date.now() + 2 * 3_600_000)));
  const [type, setType] = useState<MissionType>('ONE_OFF');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const subscription = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.subscriptions.mine(),
  });
  const sub = subscription.data?.subscription ?? null;

  const departureAt = useMemo((): Date | null => {
    if (when === 'now') return null;
    if (when === 'in30') return new Date(Date.now() + 30 * 60_000);
    if (when === 'in60') return new Date(Date.now() + 60 * 60_000);
    const d = new Date(time);
    const today = new Date();
    d.setFullYear(today.getFullYear(), today.getMonth(), today.getDate() + day);
    return d;
  }, [when, day, time]);

  const shift = (minutes: number) => setTime((t0) => new Date(t0.getTime() + minutes * 60_000));

  const submit = async () => {
    if (route.points.length < 2) return setError(t('book.needTwoPoints'));
    setBusy(true);
    setError(null);
    try {
      const mission = await api.missions.create({
        type,
        notes: notes.trim() || undefined,
        departureAt: departureAt?.toISOString() ?? null,
        route: { mode: route.mode, points: route.points },
      });
      void queryClient.invalidateQueries({ queryKey: ['missions'] });
      void queryClient.invalidateQueries({ queryKey: ['subscription'] });
      router.replace(`/mission/${mission.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['left', 'right']}>
      <RouteBuilder departureAt={departureAt} onChange={setRoute} />

      <T variant="label">{t('book.when')}</T>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {(['now', 'in30', 'in60', 'other'] as const).map((w) => (
          <Chip key={w} label={t(`book.${w}`)} selected={when === w} onPress={() => setWhen(w)} />
        ))}
      </Row>
      {when === 'other' && (
        <Card>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {[0, 1, 2, 3].map((d) => (
              <Chip
                key={d}
                label={
                  d === 0
                    ? t('book.today')
                    : d === 1
                      ? t('book.tomorrow')
                      : new Date(Date.now() + d * 86_400_000).toLocaleDateString('fr-FR', {
                          weekday: 'short',
                          day: 'numeric',
                        })
                }
                selected={day === d}
                onPress={() => setDay(d)}
              />
            ))}
          </Row>
          <Row gap={12} style={{ justifyContent: 'center', paddingTop: 8 }}>
            <Button title="−15 min" variant="secondary" small onPress={() => shift(-15)} />
            <T variant="title">
              {time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </T>
            <Button title="+15 min" variant="secondary" small onPress={() => shift(15)} />
          </Row>
        </Card>
      )}

      <T variant="label">{t('book.type')}</T>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        <Chip
          label={t('book.oneOff')}
          selected={type === 'ONE_OFF'}
          onPress={() => setType('ONE_OFF')}
        />
        <Chip
          label={t('book.subscription')}
          selected={type === 'SUBSCRIPTION'}
          onPress={() => sub && sub.missionsRemaining > 0 && setType('SUBSCRIPTION')}
        />
      </Row>
      <T variant="small">
        {type === 'ONE_OFF'
          ? t('book.oneOffHint', { price: formatPrice(ONE_OFF_PRICE_CENTS) })
          : sub
            ? t('book.subscriptionHint', { remaining: sub.missionsRemaining })
            : t('book.noSubscription')}
      </T>

      <Field
        label={t('book.notes')}
        placeholder={t('book.notesPlaceholder')}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={500}
      />
      <ErrorText error={error} />
      <Button
        title={t('book.confirm')}
        icon="shield-checkmark"
        onPress={() => void submit()}
        loading={busy}
        disabled={!route.preview}
      />
    </Screen>
  );
}
