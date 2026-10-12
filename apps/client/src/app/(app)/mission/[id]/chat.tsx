import { ChatView, useTheme } from '@hb/mobile-core';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

const QUICK = [
  'Tout va bien',
  'Je change de trottoir',
  'Je m’arrête un instant',
  'Je me sens suivie',
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
