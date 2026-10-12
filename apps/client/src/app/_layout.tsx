import '../setup';
import { Loading, RealtimeProvider, SessionProvider, useSession, useTheme } from '@hb/mobile-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

function Navigator() {
  const { restoring, user } = useSession();
  const { colors, dark } = useTheme();

  // Changement de compte (déconnexion comprise) : rien de l'ancien compte ne reste en cache.
  const userId = user?.id ?? null;
  const previousUserId = useRef(userId);
  useEffect(() => {
    if (previousUserId.current && previousUserId.current !== userId) queryClient.clear();
    previousUserId.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!restoring) void SplashScreen.hideAsync();
  }, [restoring]);

  if (restoring) return <Loading />;
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.text },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RealtimeProvider>
          <Navigator />
        </RealtimeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
