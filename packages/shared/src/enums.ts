/**
 * Énumérations du domaine. Les valeurs sont identiques aux enums Prisma de l'API,
 * ce qui permet de les échanger telles quelles en JSON.
 */

function values<T extends Record<string, string>>(obj: T): [T[keyof T], ...T[keyof T][]] {
  return Object.values(obj) as [T[keyof T], ...T[keyof T][]];
}

export const Role = {
  CLIENT: 'CLIENT',
  GUARD: 'GUARD',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ROLES = values(Role);

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const GuardStatus = {
  /** Compte créé, candidature pas encore envoyée. */
  DRAFT: 'DRAFT',
  /** Candidature envoyée, en attente de validation par l'admin. */
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type GuardStatus = (typeof GuardStatus)[keyof typeof GuardStatus];
export const GUARD_STATUSES = values(GuardStatus);

export const GuardDocumentType = {
  ID_CARD: 'ID_CARD',
  CNAPS_CARD: 'CNAPS_CARD',
  OTHER: 'OTHER',
} as const;
export type GuardDocumentType = (typeof GuardDocumentType)[keyof typeof GuardDocumentType];
export const GUARD_DOCUMENT_TYPES = values(GuardDocumentType);

export const MissionStatus = {
  REQUESTED: 'REQUESTED',
  SEARCHING: 'SEARCHING',
  ASSIGNED: 'ASSIGNED',
  GUARD_EN_ROUTE: 'GUARD_EN_ROUTE',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  UNASSIGNED: 'UNASSIGNED',
} as const;
export type MissionStatus = (typeof MissionStatus)[keyof typeof MissionStatus];
export const MISSION_STATUSES = values(MissionStatus);

export const MissionType = {
  /** Protection ponctuelle, sans abonnement. */
  ONE_OFF: 'ONE_OFF',
  /** Protection décomptée du quota de l'abonnement. */
  SUBSCRIPTION: 'SUBSCRIPTION',
} as const;
export type MissionType = (typeof MissionType)[keyof typeof MissionType];
export const MISSION_TYPES = values(MissionType);

export const TransportMode = {
  WALK: 'WALK',
  BIKE: 'BIKE',
  CAR: 'CAR',
  TRANSIT: 'TRANSIT',
} as const;
export type TransportMode = (typeof TransportMode)[keyof typeof TransportMode];
export const TRANSPORT_MODES = values(TransportMode);

export const OfferStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const AlertStatus = {
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED',
} as const;
export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];

export const DeviationType = {
  /** La cliente s'écarte du trajet prévu au-delà de la tolérance. */
  OFF_ROUTE: 'OFF_ROUTE',
  /** La cliente est immobile depuis trop longtemps hors d'une étape. */
  STOPPED: 'STOPPED',
  /** La cliente n'est pas arrivée à l'heure prévue + marge. */
  LATE: 'LATE',
  /** Plus aucune position reçue du téléphone de la cliente. */
  SIGNAL_LOST: 'SIGNAL_LOST',
} as const;
export type DeviationType = (typeof DeviationType)[keyof typeof DeviationType];
export const DEVIATION_TYPES = values(DeviationType);

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const PayoutStatus = {
  /** Demandé par le garde, en attente du virement par l'équipe. */
  REQUESTED: 'REQUESTED',
  /** Virement effectué par l'équipe. */
  PAID: 'PAID',
  /** Refusé par l'équipe : le montant revient dans le solde du garde. */
  REJECTED: 'REJECTED',
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];
export const PAYOUT_STATUSES = values(PayoutStatus);
