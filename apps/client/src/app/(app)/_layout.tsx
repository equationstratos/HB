import {
  loadDiscreetMode,
  registerForPush,
  useApi,
  useMessageNotifications,
  useNotificationNavigation,
  useServerNotifications,
  useSession,
  useTheme,
} from '@hb/mobile-core';
import { Redirect, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/** Espace connecté : téléphone vérifié puis consentement à la géolocalisation obligatoires. */
export default function AppLayout() {
  const { user } = useSession();
  const api = useApi();
  const segments = useSegments() as string[];
  const { colors } = useTheme();
  const { t } = useTranslation();
  const page = segments[segments.length - 1];
  // Nouveaux messages et statut de la protection : notifications affichées par l'appli,
  // qui ouvrent le bon écran au toucher.
  useMessageNotifications();
  useServerNotifications();
  useNotificationNavigation(
    user?.role === 'CLIENT' && user.phoneVerified && !!user.locationConsentAt,
  );

  useEffect(() => {
    if (!user) return;
    void loadDiscreetMode();
    void registerForPush(api);
  }, [user?.id, api]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Redirect href="/welcome" />;
  if (user.role !== 'CLIENT') return <Redirect href="/welcome" />;
  if (!user.phoneVerified && page !== 'verify-phone') return <Redirect href="/verify-phone" />;
  if (user.phoneVerified && !user.locationConsentAt && page !== 'consent')
    return <Redirect href="/consent" />;

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        headerBackTitle: t('common.back'),
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="verify-phone" options={{ headerShown: false }} />
      <Stack.Screen name="consent" options={{ headerShown: false }} />
      <Stack.Screen name="book" options={{ title: t('book.title'), presentation: 'modal' }} />
      <Stack.Screen name="mission/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="mission/[id]/chat" options={{ title: t('mission.chatTitle') }} />
      <Stack.Screen
        name="mission/[id]/rate"
        options={{ title: t('mission.rate'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="mission/[id]/edit-route"
        options={{ title: t('book.editTitle'), presentation: 'modal' }}
      />
      <Stack.Screen name="contacts" options={{ title: t('contacts.title') }} />
      <Stack.Screen name="subscription" options={{ title: t('subscription.title') }} />
      <Stack.Screen name="security" options={{ title: t('security.title') }} />
    </Stack>
  );
}
