import { Ionicons } from '@expo/vector-icons';
import {
  Badge,
  Card,
  getClient,
  loadDiscreetMode,
  Row,
  Screen,
  setDiscreetMode,
  T,
  useSession,
  useTheme,
  type IconName,
} from '@hb/mobile-core';
import { maskPhone } from '@hb/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch } from 'react-native';

function Item({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ paddingVertical: 6 }}>
      <Row gap={12}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <Row gap={0} style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
          <T>{label}</T>
          {hint && <T variant="small">{hint}</T>}
        </Row>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Row>
    </Pressable>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { colors } = useTheme();
  const [discreet, setDiscreet] = useState(false);

  useEffect(() => {
    void loadDiscreetMode().then(setDiscreet);
  }, []);

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
      </Card>
      <Card>
        <Item
          icon="people"
          label={t('profile.contacts')}
          hint={t('profile.contactsHint')}
          onPress={() => router.push('/contacts')}
        />
        <Item
          icon="card"
          label={t('profile.subscription')}
          onPress={() => router.push('/subscription')}
        />
        <Item icon="key" label={t('profile.security')} onPress={() => router.push('/security')} />
      </Card>
      <Card>
        <Row gap={12}>
          <Ionicons name="moon" size={20} color={colors.primary} />
          <Row gap={0} style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
            <T>{t('profile.discreet')}</T>
            <T variant="small">{t('profile.discreetHint')}</T>
          </Row>
          <Switch
            value={discreet}
            onValueChange={(v) => {
              setDiscreet(v);
              void setDiscreetMode(v);
            }}
            trackColor={{ true: colors.primary }}
          />
        </Row>
      </Card>
      <Item icon="log-out" label={t('profile.logout')} onPress={() => void getClient().logout()} />
    </Screen>
  );
}
