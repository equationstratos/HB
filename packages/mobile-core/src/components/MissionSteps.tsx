import { Ionicons } from '@expo/vector-icons';
import type { MissionStatus } from '@hb/shared';
import { Text, View } from 'react-native';
import { useTheme } from '../theme';

const STEPS: { status: MissionStatus[]; label: string }[] = [
  { status: ['SEARCHING', 'UNASSIGNED', 'REQUESTED'], label: 'Recherche' },
  { status: ['ASSIGNED'], label: 'Garde trouvé' },
  { status: ['GUARD_EN_ROUTE'], label: 'En route' },
  { status: ['IN_PROGRESS'], label: 'Suivi' },
  { status: ['COMPLETED'], label: 'Arrivée' },
];

/** Progression de la mission en cinq étapes. */
export function MissionSteps({ status }: { status: MissionStatus }) {
  const { colors } = useTheme();
  const current = STEPS.findIndex((s) => s.status.includes(status));
  return (
    <View
      style={{ flexDirection: 'row', justifyContent: 'space-between' }}
      accessibilityLabel={`Étape ${current + 1} sur ${STEPS.length}`}
    >
      {STEPS.map((s, i) => {
        const done = i < current || status === 'COMPLETED';
        const active = i === current && status !== 'COMPLETED';
        const color = done ? colors.success : active ? colors.primary : colors.border;
        return (
          <View key={s.label} style={{ alignItems: 'center', flex: 1, gap: 4 }}>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: done || active ? color : colors.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {done ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : (
                <Text
                  style={{
                    color: active ? '#fff' : colors.textMuted,
                    fontWeight: '700',
                    fontSize: 12,
                  }}
                >
                  {i + 1}
                </Text>
              )}
            </View>
            <Text
              style={{
                fontSize: 11,
                color: active ? colors.text : colors.textMuted,
                fontWeight: active ? '700' : '500',
              }}
            >
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
