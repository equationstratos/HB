import type {
  AdminPayoutDto,
  DeviationDto,
  GuardMissionDto,
  LocationDto,
  MessageDto,
  MissionDto,
  MissionRouteDto,
  OfferDto,
  PayoutDto,
  SosAlertDto,
} from './types';

/** Espace de noms Socket.IO de la plateforme. */
export const REALTIME_NAMESPACE = '/rt';

/** Événements envoyés par le serveur. */
export interface ServerToClientEvents {
  /** Chacun reçoit sa vue : GuardMissionDto pour le garde. */
  'mission:updated': (mission: MissionDto | GuardMissionDto) => void;
  'mission:unassigned': (mission: MissionDto) => void;
  'route:updated': (payload: { missionId: string; route: MissionRouteDto }) => void;
  location: (location: LocationDto) => void;
  'chat:message': (message: MessageDto) => void;
  'offer:new': (offer: OfferDto) => void;
  'offer:revoked': (payload: { offerId: string; missionId: string }) => void;
  'alert:sos': (alert: SosAlertDto) => void;
  'alert:sos-updated': (alert: SosAlertDto) => void;
  'alert:deviation': (deviation: DeviationDto) => void;
  'alert:deviation-updated': (deviation: DeviationDto) => void;
  'guard:application': (payload: { userId: string }) => void;
  /** Demande de virement d'un garde, à traiter par l'équipe. */
  'payout:requested': (payout: AdminPayoutDto) => void;
  /** Virement payé ou refusé par l'équipe, envoyé au garde concerné. */
  'payout:updated': (payout: PayoutDto) => void;
}

/** Événements envoyés par les applis. */
export interface ClientToServerEvents {
  'mission:join': (
    payload: { missionId: string },
    ack: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  'mission:leave': (payload: { missionId: string }) => void;
}

export const rooms = {
  user: (userId: string) => `user:${userId}`,
  mission: (missionId: string) => `mission:${missionId}`,
  admins: 'admins',
} as const;
