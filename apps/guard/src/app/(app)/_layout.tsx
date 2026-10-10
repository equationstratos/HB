import {
  Loading,
  loadDiscreetMode,
  registerForPush,
  useApi,
  useMessageNotifications,
  useOpenChatFromNotifications,
  useSession,
  useTheme,
} from '@hb/mobile-core';
import { useQuery } from '@tanstack/react-query';
import { Redirect, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Espace garde : téléphone vérifié, consentement, puis candidature validée par l'admin
 * avant tout accès aux missions.
 */
export default function AppLayout() {
  const { user } = useSession();
  const api = useApi();
  const segments = useSegments() as string[];
  const { colors } = useTheme();
  const { t } = useTranslation();
  const page = segments[segments.length - 1];
  const ready = !!user && user.phoneVerified && !!user.locationConsentAt;
  // Rechargé régulièrement : la validation par l'admin débloque l'accès aux missions.
  const profile = useQuery({
    queryKey: ['guard', 'me'],
    queryFn: () => api.guards.me(),
    enabled: ready,
    refetchInterval: 60_000,
  });
  // Nouveaux messages : notification hors de la conversation, qui s'ouvre au toucher.
  useMessageNotifications();
  useOpenChatFromNotifications(
    ready && user?.role === 'GUARD' && profile.data?.status === 'APPROVED',
  );

  useEffect(() => {
    if (!user) return;
    void loadDiscreetMode();
    void registerForPush(api);
  }, [user?.id, api]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Redirect href="/welcome" />;
  if (user.role !== 'GUARD') return <Redirect href="/welcome" />;
  if (!user.phoneVerified && page !== 'verify-phone') return <Redirect href="/verify-phone" />;
  if (user.phoneVerified && !user.locationConsentAt && page !== 'consent')
    return <Redirect href="/consent" />;
  if (ready && profile.isLoading) return <Loading />;

  const status = profile.data?.status;
  if (ready && status) {
    if ((status === 'DRAFT' || status === 'REJECTED') && page !== 'application')
      return <Redirect href="/application" />;
    if ((status === 'PENDING' || status === 'SUSPENDED') && page !== 'pending')
      return <Redirect href="/pending" />;
    if (status === 'APPROVED' && page === 'pending') return <Redirect href="/" />;
  }

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
      <Stack.Screen name="pending" options={{ headerShown: false }} />
      <Stack.Screen name="application" options={{ title: t('application.title') }} />
      <Stack.Screen name="mission/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="mission/[id]/chat" options={{ title: t('mission.chatTitle') }} />
      <Stack.Screen name="security" options={{ title: t('security.title') }} />
    </Stack>
  );
}
