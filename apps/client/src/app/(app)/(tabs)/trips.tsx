import { T, useApi, useTheme } from '@hb/mobile-core';
import { OPEN_MISSION_STATUSES } from '@hb/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshControl, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MissionCard } from '@/components/MissionCard';

export default function Trips() {
  const { t } = useTranslation();
  const api = useApi();
  const { colors, spacing } = useTheme();
  const missions = useQuery({
    queryKey: ['missions', 'all'],
    queryFn: () => api.missions.list({ pageSize: 50 }),
  });
  const items = missions.data?.items ?? [];
  const upcoming = items
    .filter((m) => OPEN_MISSION_STATUSES.includes(m.status))
    .sort((a, b) => a.departureAt.localeCompare(b.departureAt));
  const past = items.filter((m) => !OPEN_MISSION_STATUSES.includes(m.status));
  const sections = [
    { title: t('trips.upcoming'), data: upcoming },
    { title: t('trips.past'), data: past },
  ].filter((s) => s.data.length > 0);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={missions.isRefetching}
            onRefresh={() => void missions.refetch()}
          />
        }
        renderSectionHeader={({ section }) => (
          <T
            variant="heading"
            style={{ paddingTop: spacing.md, backgroundColor: colors.background }}
          >
            {section.title}
          </T>
        )}
        renderItem={({ item }) => <MissionCard mission={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={missions.isLoading ? null : <T variant="muted">{t('trips.empty')}</T>}
      />
    </SafeAreaView>
  );
}
