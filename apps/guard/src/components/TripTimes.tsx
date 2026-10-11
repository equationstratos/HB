import { fmtTime, Row, T } from '@hb/mobile-core';
import { formatDuration, tripWindow } from '@hb/shared';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

/** Début, durée et fin du trajet : réels une fois connus, sinon prévus. */
export function TripTimes({ mission }: { mission: Parameters<typeof tripWindow>[0] }) {
  const { t } = useTranslation();
  const w = tripWindow(mission);
  const cells: [string, string][] = [
    [t('trip.start'), fmtTime(w.start)],
    [t('trip.duration'), formatDuration(w.durationSeconds)],
    [t('trip.end'), fmtTime(w.end)],
  ];
  return (
    <Row gap={12}>
      {cells.map(([label, value]) => (
        <View key={label} style={{ flex: 1, gap: 2 }}>
          <T variant="small">{label}</T>
          <T variant="label">{value}</T>
        </View>
      ))}
    </Row>
  );
}
