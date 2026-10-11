import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, ErrorText, fmtDateTime, Row, T, useApi, useTheme } from '@hb/mobile-core';
import { missionStatusLabel, transportModeLabel, type GuardMissionDto } from '@hb/shared';
import { errorMessage } from '@hb/api-client';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TripTimes } from '@/components/TripTimes';

/**
 * Historique des trajets du garde : pour la discrétion de la cliente, seulement la date, le
 * début, la durée et la fin (le serveur n'envoie ni nom, ni adresses, ni note).
 */
export default function HistoryScreen() {
  const api = useApi();
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const history = useQuery({
    queryKey: ['missions', 'history'],
    queryFn: () =>
      api.missions.list<GuardMissionDto>({ status: ['COMPLETED', 'CANCELLED'], pageSize: 50 }),
  });
  const items = history.data?.items ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={history.isRefetching}
            onRefresh={() => void history.refetch()}
          />
        }
      >
        <T variant="title">{t('history.title')}</T>
        <T variant="muted">{t('history.subtitle')}</T>
        <ErrorText error={history.error ? errorMessage(history.error) : null} />
        {history.isSuccess && items.length === 0 && (
          <Card>
            <Row>
              <Ionicons name="time-outline" size={22} color={colors.textMuted} />
              <T variant="muted" style={{ flex: 1 }}>
                {t('history.empty')}
              </T>
            </Row>
          </Card>
        )}
        {items.map((m) => (
          <Card key={m.id} onPress={() => router.push(`/mission/${m.id}`)}>
            <Row>
              <T variant="label" style={{ flex: 1 }}>
                {fmtDateTime(m.startedAt ?? m.departureAt)}
              </T>
              <Badge
                tone={m.status === 'COMPLETED' ? 'success' : 'neutral'}
                label={missionStatusLabel[m.status]}
              />
            </Row>
            <TripTimes mission={m} />
            <View>
              <T variant="small">{transportModeLabel[m.route.mode]}</T>
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
