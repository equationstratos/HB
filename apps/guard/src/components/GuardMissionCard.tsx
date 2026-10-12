import { Badge, Card, Row, T, type Tone } from '@hb/mobile-core';
import {
  formatDistance,
  missionStatusLabel,
  transportModeLabel,
  type GuardMissionDto,
  type MissionStatus,
} from '@hb/shared';
import { router } from 'expo-router';
import { TripTimes } from './TripTimes';

const tone: Partial<Record<MissionStatus, Tone>> = {
  ASSIGNED: 'primary',
  GUARD_EN_ROUTE: 'warning',
  IN_PROGRESS: 'success',
};

const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Mission en liste : date, horaires et trajet, jamais l'identité de la cliente. */
export function GuardMissionCard({ mission: m }: { mission: GuardMissionDto }) {
  return (
    <Card onPress={() => router.push(`/mission/${m.id}`)}>
      <Row>
        <T variant="label" style={{ flex: 1 }}>
          {day.format(new Date(m.departureAt))}
        </T>
        <Badge label={missionStatusLabel[m.status]} tone={tone[m.status] ?? 'neutral'} />
      </Row>
      <TripTimes mission={m} />
      <T>
        {transportModeLabel[m.route.mode]} · {formatDistance(m.route.distanceMeters)}
      </T>
      <T variant="small" numberOfLines={1}>
        {m.route.waypoints[0]?.address ?? 'Départ'} →{' '}
        {m.route.waypoints[m.route.waypoints.length - 1]?.address ?? 'Arrivée'}
      </T>
    </Card>
  );
}
