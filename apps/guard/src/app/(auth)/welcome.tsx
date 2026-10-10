import { Ionicons } from '@expo/vector-icons';
import { Button, Row, Screen, T, useTheme } from '@hb/mobile-core';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export default function Welcome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const points = [
    { icon: 'shield-checkmark', text: t('welcome.point1') },
    { icon: 'navigate', text: t('welcome.point2') },
    { icon: 'call', text: t('welcome.point3') },
  ] as const;
  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 12 }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 26,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="eye" size={46} color="#fff" />
        </View>
      </View>
      <T variant="title" center style={{ fontSize: 32 }}>
        {t('welcome.title')}
      </T>
      <T variant="muted" center style={{ fontSize: 16, lineHeight: 24 }}>
        {t('welcome.subtitle')}
      </T>
      <View style={{ gap: 14, paddingVertical: 12 }}>
        {points.map((p) => (
          <Row key={p.icon} gap={12}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={p.icon} size={18} color={colors.primary} />
            </View>
            <T style={{ flex: 1 }}>{p.text}</T>
          </Row>
        ))}
      </View>
      <Button title={t('welcome.signup')} onPress={() => router.push('/register')} />
      <Button
        title={t('welcome.login')}
        variant="secondary"
        onPress={() => router.push('/login')}
      />
    </Screen>
  );
}
