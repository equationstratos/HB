import { errorMessage } from '@hb/api-client';
import {
  Card,
  currentPosition,
  ErrorText,
  Row,
  T,
  useApi,
  useSocketEvent,
  useTheme,
} from '@hb/mobile-core';
import { GUARD_BUSY_STATUSES, type GuardMissionDto, type OfferDto } from '@hb/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GuardMissionCard } from '@/components/GuardMissionCard';
import { OfferCard } from '@/components/OfferCard';

/** Accueil garde : disponibilité, propositions en temps réel, missions attribuées. */
export default function Missions() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { colors, spacing } = useTheme();
  const profile = useQuery({ queryKey: ['guard', 'me'], queryFn: () => api.guards.me() });
  const offers = useQuery({ queryKey: ['offers'], queryFn: () => api.offers.list() });
  const missions = useQuery({
    queryKey: ['missions', 'mine'],
    queryFn: () =>
      api.missions.list<GuardMissionDto>({ status: [...GUARD_BUSY_STATUSES], pageSize: 20 }),
  });
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile.data) setAvailable(profile.data.availableNow);
  }, [profile.data]);

  // Position rafraîchie toutes les 2 minutes tant que le garde est disponible.
  useEffect(() => {
    if (!available) return;
    const ping = async () => {
      const pos = await currentPosition();
      if (pos) await api.guards.setPresence({ available: true, ...pos }).catch(() => undefined);
    };
    const timer = setInterval(() => void ping(), 120_000);
    return () => clearInterval(timer);
  }, [available, api]);

  useSocketEvent('offer:new', (offer) => {
    queryClient.setQueryData<OfferDto[]>(['offers'], (list = []) => [
      offer,
      ...list.filter((o) => o.id !== offer.id),
    ]);
  });
  useSocketEvent('offer:revoked', ({ offerId }) => {
    queryClient.setQueryData<OfferDto[]>(['offers'], (list = []) =>
      list.filter((o) => o.id !== offerId),
    );
  });
  useSocketEvent('mission:updated', () => void missions.refetch());

  const toggle = async (value: boolean) => {
    setAvailable(value);
    setError(null);
    try {
      const pos = value ? await currentPosition() : null;
      await api.guards.setPresence({ available: value, ...(pos ?? {}) });
      void profile.refetch();
    } catch (e) {
      setAvailable(!value);
      setError(errorMessage(e));
    }
  };

  const removeOffer = (id: string) => {
    queryClient.setQueryData<OfferDto[]>(['offers'], (list = []) =>
      list.filter((o) => o.id !== id),
    );
    void missions.refetch();
  };

  const mine = [...(missions.data?.items ?? [])].sort((a, b) =>
    a.departureAt.localeCompare(b.departureAt),
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={offers.isRefetching || missions.isRefetching}
            onRefresh={() => {
              void offers.refetch();
              void missions.refetch();
            }}
          />
        }
      >
        <Card
          style={{
            borderColor: available ? colors.success : colors.border,
            borderWidth: available ? 2 : 1,
          }}
        >
          <Row>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="heading">{t('home.available')}</T>
              <T variant="muted">{available ? t('home.availableOn') : t('home.availableOff')}</T>
            </View>
            <Switch
              value={available}
              onValueChange={(v) => void toggle(v)}
              trackColor={{ true: colors.success }}
            />
          </Row>
          <ErrorText error={error} />
        </Card>

        <T variant="heading">{t('home.offers')}</T>
        {(offers.data ?? []).length === 0 && <T variant="muted">{t('home.noOffers')}</T>}
        {offers.data?.map((o) => (
          <OfferCard key={o.id} offer={o} onDone={removeOffer} />
        ))}

        <T variant="heading">{t('home.mine')}</T>
        {mine.length === 0 && <T variant="muted">{t('home.noMissions')}</T>}
        {mine.map((m) => (
          <GuardMissionCard key={m.id} mission={m} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
