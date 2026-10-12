import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, fmtDateTime, Row, T, useTheme, type Tone } from '@hb/mobile-core';
import {
  formatDistance,
  missionStatusLabel,
  transportModeLabel,
  type MissionDto,
  type MissionStatus,
} from '@hb/shared';
import { router } from 'expo-router';

export const statusTone: Record<MissionStatus, Tone> = {
  REQUESTED: 'neutral',
  SEARCHING: 'primary',
  ASSIGNED: 'primary',
  GUARD_EN_ROUTE: 'warning',
  IN_PROGRESS: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'neutral',
  UNASSIGNED: 'danger',
};

export function MissionCard({ mission: m }: { mission: MissionDto }) {
  const { colors } = useTheme();
  const from = m.route.waypoints[0]?.address ?? 'Départ';
  const to = m.route.waypoints[m.route.waypoints.length - 1]?.address ?? 'Arrivée';
  return (
    <Card onPress={() => router.push(`/mission/${m.id}`)}>
      <Row>
        <T variant="label" style={{ flex: 1 }}>
          {fmtDateTime(m.departureAt)}
        </T>
        <Badge label={missionStatusLabel[m.status]} tone={statusTone[m.status]} />
      </Row>
      <Row gap={6}>
        <Ionicons name="radio-button-on" size={12} color={colors.success} />
        <T numberOfLines={1} style={{ flex: 1 }}>
          {from}
        </T>
      </Row>
      <Row gap={6}>
        <Ionicons name="location" size={12} color={colors.primary} />
        <T numberOfLines={1} style={{ flex: 1 }}>
          {to}
        </T>
      </Row>
      <T variant="small">
        {transportModeLabel[m.route.mode]} · {formatDistance(m.route.distanceMeters)}
        {m.guard ? ` · ${m.guard.firstName}` : ''}
      </T>
    </Card>
  );
}
