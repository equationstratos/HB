import { ChatView, useTheme } from '@hb/mobile-core';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

const QUICK = [
  'Je suis derrière vous',
  'J’arrive dans 5 min',
  'Tout va bien ?',
  'Je vous ai repérée',
];

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ChatView missionId={id} quickReplies={QUICK} />
    </View>
  );
}
