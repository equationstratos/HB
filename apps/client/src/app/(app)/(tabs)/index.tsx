import { Ionicons } from '@expo/vector-icons';
import {
  Banner,
  Button,
  Card,
  Row,
  ServerUpdateBanner,
  T,
  useApi,
  useSession,
  useSocketEvent,
  useTheme,
} from '@hb/mobile-core';
import { OPEN_MISSION_STATUSES } from '@hb/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MissionCard } from '@/components/MissionCard';

export default function Home() {
  const { t } = useTranslation();
  const api = useApi();
  const { user } = useSession();
  const { colors, spacing } = useTheme();
  const missions = useQuery({
    queryKey: ['missions', 'open'],
    queryFn: () => api.missions.list({ status: [...OPEN_MISSION_STATUSES], pageSize: 20 }),
  });
  useSocketEvent('mission:updated', () => void missions.refetch());

  const open = [...(missions.data?.items ?? [])].sort((a, b) =>
    a.departureAt.localeCompare(b.departureAt),
  );
  const active = open.find((m) => m.status === 'GUARD_EN_ROUTE' || m.status === 'IN_PROGRESS');
  const upcoming = open.filter((m) => m.id !== active?.id);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={missions.isRefetching}
            onRefresh={() => void missions.refetch()}
          />
        }
      >
        <View>
          <T variant="title">{t('home.hello', { name: user?.firstName ?? '' })}</T>
          <T variant="muted">{t('home.subtitle')}</T>
        </View>

        <ServerUpdateBanner />

        {active && (
          <Card
            onPress={() => router.push(`/mission/${active.id}`)}
            style={{ borderColor: colors.success, borderWidth: 2 }}
          >
            <Row>
              <Ionicons name="shield-checkmark" size={22} color={colors.success} />
              <T variant="heading" style={{ flex: 1 }}>
                {t('home.active')}
              </T>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Row>
            <T variant="muted">
              {active.route.waypoints[active.route.waypoints.length - 1]?.address ?? ''}
            </T>
          </Card>
        )}

        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary, gap: 12 }}>
          <T variant="heading" style={{ color: colors.primaryText }}>
            {t('home.book')}
          </T>
          <T style={{ color: colors.primaryText, opacity: 0.9 }}>{t('home.bookHint')}</T>
          <Button
            title={t('home.book')}
            variant="secondary"
            icon="navigate"
            onPress={() => router.push('/book')}
          />
        </Card>

        <T variant="heading">{t('home.upcoming')}</T>
        {upcoming.length === 0 && !missions.isLoading && (
          <T variant="muted">{t('home.noUpcoming')}</T>
        )}
        {upcoming.map((m) => (
          <MissionCard key={m.id} mission={m} />
        ))}

        <Banner tone="neutral" icon="call" title={t('home.emergency')} />
      </ScrollView>
    </SafeAreaView>
  );
}
