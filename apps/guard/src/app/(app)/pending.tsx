import { Ionicons } from '@expo/vector-icons';
import { Banner, Button, getClient, Screen, T, useApi, useTheme } from '@hb/mobile-core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export default function Pending() {
  const { t } = useTranslation();
  const api = useApi();
  const { colors } = useTheme();
  const profile = useQuery({ queryKey: ['guard', 'me'], queryFn: () => api.guards.me() });
  const suspended = profile.data?.status === 'SUSPENDED';

  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingVertical: 32 }}>
        <Ionicons
          name={suspended ? 'ban' : 'hourglass-outline'}
          size={64}
          color={suspended ? colors.danger : colors.primary}
        />
      </View>
      {suspended ? (
        <Banner
          tone="danger"
          title={t('pending.suspended')}
          message={t('pending.suspendedHint', { reason: profile.data?.rejectionReason ?? '—' })}
        />
      ) : (
        <>
          <T variant="title" center>
            {t('pending.title')}
          </T>
          <T variant="muted" center>
            {t('pending.subtitle')}
          </T>
        </>
      )}
      <Button
        title={t('pending.refresh')}
        variant="secondary"
        icon="refresh"
        loading={profile.isRefetching}
        onPress={() => void profile.refetch()}
      />
      <Button
        title={t('pending.logout')}
        variant="ghost"
        onPress={() => void getClient().logout()}
      />
    </Screen>
  );
}
