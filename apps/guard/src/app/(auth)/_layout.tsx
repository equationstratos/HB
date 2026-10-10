import { useSession } from '@hb/mobile-core';
import { Redirect, Stack } from 'expo-router';

export default function AuthLayout() {
  const { user } = useSession();
  if (user) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
