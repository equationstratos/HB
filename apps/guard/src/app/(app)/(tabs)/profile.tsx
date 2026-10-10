import { Ionicons } from '@expo/vector-icons';
import {
  Badge,
  Card,
  fmtDateTime,
  getClient,
  Row,
  Screen,
  Stars,
  T,
  useApi,
  useSession,
  useTheme,
  type IconName,
} from '@hb/mobile-core';
import { guardStatusLabel, maskPhone } from '@hb/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

function Item({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ paddingVertical: 6 }}>
      <Row gap={12}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <T style={{ flex: 1 }}>{label}</T>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Row>
    </Pressable>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const { user } = useSession();
  const api = useApi();
  const profile = useQuery({ queryKey: ['guard', 'me'], queryFn: () => api.guards.me() });
  const ratings = useQuery({ queryKey: ['guard', 'ratings'], queryFn: () => api.guards.ratings() });
  const p = profile.data;

  return (
    <Screen>
      <T variant="title">{t('profile.title')}</T>
      <Card>
        <T variant="heading">
          {user?.firstName} {user?.lastName}
        </T>
        <T variant="muted">{user?.email}</T>
        <Row>
          <T variant="muted">{user ? maskPhone(user.phone) : ''}</T>
          {user?.phoneVerified && (
            <Badge label={t('profile.phoneVerified')} tone="success" icon="checkmark" />
          )}
        </Row>
        {p && (
          <Badge
            label={guardStatusLabel[p.status]}
            tone={p.status === 'APPROVED' ? 'success' : 'warning'}
          />
        )}
      </Card>
      <Card>
        <T variant="label">{t('profile.rating')}</T>
        {p?.ratingAvg ? (
          <Row>
            <Stars value={p.ratingAvg} size={20} />
            <T variant="muted">
              {p.ratingAvg.toFixed(1).replace('.', ',')} · {p.ratingCount} avis
            </T>
          </Row>
        ) : (
          <T variant="muted">{t('profile.noRating')}</T>
        )}
        {(ratings.data ?? []).slice(0, 5).map((r) => (
          <View key={r.id} style={{ gap: 2, paddingTop: 6 }}>
            <Row>
              <Stars value={r.score} size={13} />
              <T variant="small">
                {r.clientFirstName} · {fmtDateTime(r.createdAt)}
              </T>
            </Row>
            {r.comment && <T variant="muted">« {r.comment} »</T>}
          </View>
        ))}
      </Card>
      <Card>
        <Item
          icon="map"
          label={t('profile.application')}
          onPress={() => router.push('/application')}
        />
        <Item icon="key" label={t('profile.security')} onPress={() => router.push('/security')} />
      </Card>
      <Item icon="log-out" label={t('profile.logout')} onPress={() => void getClient().logout()} />
    </Screen>
  );
}
