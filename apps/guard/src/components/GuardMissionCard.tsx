import { Badge, Card, fmtDateTime, Row, T, type Tone } from '@hb/mobile-core';
import {
  formatDistance,
  missionStatusLabel,
  transportModeLabel,
  type MissionDto,
  type MissionStatus,
} from '@hb/shared';
import { router } from 'expo-router';

const tone: Partial<Record<MissionStatus, Tone>> = {
  ASSIGNED: 'primary',
  GUARD_EN_ROUTE: 'warning',
  IN_PROGRESS: 'success',
};

export function GuardMissionCard({ mission: m }: { mission: MissionDto }) {
  return (
    <Card onPress={() => router.push(`/mission/${m.id}`)}>
      <Row>
        <T variant="label" style={{ flex: 1 }}>
          {fmtDateTime(m.departureAt)}
        </T>
        <Badge label={missionStatusLabel[m.status]} tone={tone[m.status] ?? 'neutral'} />
      </Row>
      <T>
        {m.client.firstName} {m.client.lastName} · {transportModeLabel[m.route.mode]} ·{' '}
        {formatDistance(m.route.distanceMeters)}
      </T>
      <T variant="small" numberOfLines={1}>
        {m.route.waypoints[0]?.address ?? 'Départ'} →{' '}
        {m.route.waypoints[m.route.waypoints.length - 1]?.address ?? 'Arrivée'}
      </T>
    </Card>
  );
}
