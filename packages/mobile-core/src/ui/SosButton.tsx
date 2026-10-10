import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';

const HOLD_MS = 1500;

/**
 * Bouton SOS à appui long : impossible à déclencher par erreur dans une poche,
 * mais assez rapide pour une vraie urgence. Vibrations au début et au déclenchement.
 */
export function SosButton({
  onTrigger,
  disabled,
  label = 'SOS',
}: {
  onTrigger: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    if (disabled) return;
    setHolding(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
    timer.current = setTimeout(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setHolding(false);
      progress.setValue(0);
      onTrigger();
    }, HOLD_MS);
  };

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Alerte SOS"
      accessibilityHint="Maintenez appuyé pour déclencher l'alerte"
      onPressIn={start}
      onPressOut={cancel}
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: colors.danger,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width,
          backgroundColor: 'rgba(0,0,0,0.25)',
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingVertical: 18,
        }}
      >
        <Ionicons name="alert-circle" size={26} color="#fff" />
        <View>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20, letterSpacing: 1 }}>
            {label}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
            {holding ? 'Maintenez…' : 'Maintenir appuyé'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
