import type {
  AlertStatus,
  DeviationType,
  GuardDocumentType,
  GuardStatus,
  MissionStatus,
  MissionType,
  OfferStatus,
  PayoutStatus,
  Role,
  TransportMode,
} from './enums';

/** Libellés français des énumérations, partagés par les trois applis. */

export const missionStatusLabel: Record<MissionStatus, string> = {
  REQUESTED: 'Demandée',
  SEARCHING: 'Recherche d’un garde',
  ASSIGNED: 'Garde attribué',
  GUARD_EN_ROUTE: 'Garde en route',
  IN_PROGRESS: 'Protection en cours',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  UNASSIGNED: 'Aucun garde trouvé',
};

export const missionTypeLabel: Record<MissionType, string> = {
  ONE_OFF: 'Ponctuelle',
  SUBSCRIPTION: 'Abonnement',
};

export const transportModeLabel: Record<TransportMode, string> = {
  WALK: 'À pied',
  BIKE: 'À vélo',
  CAR: 'Voiture / VTC',
  TRANSIT: 'Transports en commun',
};

export const guardStatusLabel: Record<GuardStatus, string> = {
  DRAFT: 'Candidature à compléter',
  PENDING: 'En attente de validation',
  APPROVED: 'Validé',
  REJECTED: 'Refusé',
  SUSPENDED: 'Suspendu',
};

export const guardDocumentTypeLabel: Record<GuardDocumentType, string> = {
  ID_CARD: 'Pièce d’identité',
  CNAPS_CARD: 'Carte professionnelle CNAPS',
  OTHER: 'Autre document',
};

export const deviationTypeLabel: Record<DeviationType, string> = {
  OFF_ROUTE: 'Écart de trajet',
  STOPPED: 'Arrêt prolongé',
  LATE: 'Retard',
  SIGNAL_LOST: 'Signal perdu',
};

export const alertStatusLabel: Record<AlertStatus, string> = {
  OPEN: 'Ouverte',
  ACKNOWLEDGED: 'Prise en charge',
  RESOLVED: 'Résolue',
};

export const offerStatusLabel: Record<OfferStatus, string> = {
  PENDING: 'En attente',
  ACCEPTED: 'Acceptée',
  DECLINED: 'Refusée',
  EXPIRED: 'Expirée',
};

export const roleLabel: Record<Role, string> = {
  CLIENT: 'Cliente',
  GUARD: 'Garde',
  ADMIN: 'Admin',
};

export const payoutStatusLabel: Record<PayoutStatus, string> = {
  REQUESTED: 'Demandé',
  PAID: 'Payé',
  REJECTED: 'Refusé',
};
