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
  SubscriptionStatus,
  TransportMode,
  UserStatus,
} from './enums';
import type { LineString } from './geo';
import type { RouteWaypoint } from './routing';

/** Réponses JSON de l'API. Les dates sont des chaînes ISO 8601. */

export interface UserDto {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  locationConsentAt: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Durée de validité du jeton d'accès, en secondes. */
  expiresIn: number;
}

export type LoginResponse =
  | { status: 'OK'; user: UserDto; tokens: AuthTokens }
  | { status: 'MFA_REQUIRED'; mfaToken: string }
  | { status: 'MFA_SETUP_REQUIRED'; mfaToken: string };

/** Envoi d'un code de vérification du téléphone. */
export interface PhoneCodeSentDto {
  expiresInSeconds: number;
  /**
   * Serveur de test qui n'envoie pas de vrais SMS : le code est renvoyé pour être affiché
   * dans l'appli. Jamais présent en production, où l'API refuse les SMS simulés.
   */
  testCode?: string;
}

/** Inscription : session ouverte et code de vérification du téléphone envoyé. */
export type RegisterResponse = Extract<LoginResponse, { status: 'OK' }> & {
  phoneCode?: PhoneCodeSentDto;
};

export interface MfaSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface EmergencyContactDto {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
}

export interface GuardDocumentDto {
  id: string;
  type: GuardDocumentType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface AvailabilitySlotDto {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

/** Profil du garde tel qu'il le voit : sans sa note, que seule l'équipe consulte. */
export interface GuardProfileDto {
  userId: string;
  status: GuardStatus;
  cnapsCardNumber: string | null;
  bio: string | null;
  baseLat: number | null;
  baseLng: number | null;
  serviceRadiusKm: number;
  availableNow: boolean;
  timezone: string;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  documents: GuardDocumentDto[];
  availability: AvailabilitySlotDto[];
}

export interface PersonSummaryDto {
  id: string;
  firstName: string;
  /** Initiale du nom uniquement, sauf pour l'admin. */
  lastName: string;
  ratingAvg?: number | null;
  ratingCount?: number;
}

export interface MissionRouteDto {
  mode: TransportMode;
  waypoints: RouteWaypoint[];
  geometry: LineString;
  distanceMeters: number;
  durationSeconds: number;
  approximate: boolean;
  toleranceMeters: number;
  expectedArrivalAt: string;
  version: number;
}

export interface RatingDto {
  id: string;
  missionId: string;
  score: number;
  comment: string | null;
  createdAt: string;
}

export interface MissionDto {
  id: string;
  status: MissionStatus;
  type: MissionType;
  departureAt: string;
  slotEndAt: string;
  codeWord: string;
  notes: string | null;
  client: PersonSummaryDto;
  guard: PersonSummaryDto | null;
  route: MissionRouteDto;
  createdAt: string;
  assignedAt: string | null;
  enRouteAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  rating: RatingDto | null;
}

/**
 * La cliente vue par son garde : jamais de nom de famille. Le prénom n'est transmis que pour
 * la mission active (attribuée, garde en route, suivi en cours) consultée seule, afin de
 * l'aborder avec le mot de code ; jamais dans les listes, les propositions ni l'historique.
 */
export interface ClientForGuardDto {
  id: string;
  firstName?: string;
}

/** Mission vue par le garde : identité minimale de la cliente et aucune note. */
export interface GuardMissionDto extends Omit<MissionDto, 'client' | 'guard' | 'rating'> {
  client: ClientForGuardDto;
  guard: Omit<PersonSummaryDto, 'ratingAvg' | 'ratingCount'> | null;
}

/** Proposition faite à un garde : rien sur l'identité de la cliente avant l'acceptation. */
export interface OfferDto {
  id: string;
  missionId: string;
  status: OfferStatus;
  wave: number;
  expiresAt: string;
  distanceToStartMeters: number;
  mission: {
    departureAt: string;
    slotEndAt: string;
    type: MissionType;
    route: MissionRouteDto;
  };
}

export interface LocationDto {
  missionId: string;
  userId: string;
  role: Role;
  lat: number;
  lng: number;
  accuracy: number | null;
  recordedAt: string;
}

export interface MessageDto {
  id: string;
  missionId: string;
  senderId: string;
  senderRole: Role;
  body: string;
  createdAt: string;
}

export interface SosAlertDto {
  id: string;
  missionId: string;
  raisedById: string;
  raisedByRole: Role;
  lat: number | null;
  lng: number | null;
  message: string | null;
  status: AlertStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedById: string | null;
  resolvedAt: string | null;
  note: string | null;
}

export interface DeviationDto {
  id: string;
  missionId: string;
  type: DeviationType;
  status: AlertStatus;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  clientConfirmedOk: boolean | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  note: string | null;
}

export interface CallResponseDto {
  callId: string;
  status: string;
  message: string;
}

/** Réglages du fond de carte. */
export interface MapConfigDto {
  /** Adresse des tuiles, relative au serveur ; Leaflet remplace {z}, {x} et {y}. */
  tileUrl: string;
  /** Texte simple, jamais interprété comme du HTML. */
  attribution: string;
  maxZoom: number;
}

export interface PlanDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  missionsPerMonth: number;
  priceCents: number;
  active: boolean;
}

export interface SubscriptionDto {
  id: string;
  plan: PlanDto;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  missionsUsed: number;
  missionsRemaining: number;
  /** Toujours faux en v1 : aucun encaissement n'est branché. */
  paymentActive: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogDto {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorRole: Role | 'SYSTEM' | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
}

export interface AdminOverviewDto {
  activeMissions: number;
  upcomingMissions: number;
  unassignedMissions: number;
  openSos: number;
  openDeviations: number;
  pendingGuards: number;
  approvedGuards: number;
  availableGuards: number;
}

export interface LiveMissionDto extends MissionDto {
  lastClientLocation: LocationDto | null;
  lastGuardLocation: LocationDto | null;
  openSos: SosAlertDto[];
  openDeviations: DeviationDto[];
}

export interface AdminGuardDto extends GuardProfileDto {
  user: UserDto;
  ratingAvg: number | null;
  ratingCount: number;
}

export interface AdminUserDto extends UserDto {
  missionsCount: number;
  guardStatus: GuardStatus | null;
}

export interface AdminAlertsDto {
  sos: (SosAlertDto & { mission: MissionDto })[];
  deviations: (DeviationDto & { mission: MissionDto })[];
}

export interface LowRatedGuardDto {
  guard: PersonSummaryDto;
  ratingAvg: number;
  ratingCount: number;
  recent: RatingDto[];
}

/** Coordonnées réservées à l'équipe, pour joindre les personnes pendant une alerte. */
export interface MissionContactsDto {
  client: { name: string; phone: string };
  guard: { name: string; phone: string } | null;
  emergencyContacts: { name: string; phone: string; relation: string | null }[];
}

// ---------- Gains et virements des gardes ----------

/** Gain d'une mission terminée. Jamais le nom ni la note de la cliente. */
export interface GuardEarningDto {
  id: string;
  missionId: string;
  /** Début du suivi (heure de départ prévue à défaut). */
  startedAt: string;
  endedAt: string;
  /** Durée réelle, en minutes commencées. */
  durationMinutes: number;
  /** Durée rémunérée, minimum compris. */
  billedMinutes: number;
  hourlyRateCents: number;
  amountCents: number;
}

export interface BankAccountDto {
  holderName: string;
  /** Seul l'IBAN masqué est renvoyé : « FR76 •••• •••• 1234 ». */
  ibanMasked: string;
  updatedAt: string;
}

export interface PayoutDto {
  id: string;
  amountCents: number;
  status: PayoutStatus;
  /** Compte de destination au moment de la demande. */
  holderName: string;
  ibanMasked: string;
  requestedAt: string;
  /** Date du virement ou du refus. */
  processedAt: string | null;
  bankReference: string | null;
  rejectionReason: string | null;
}

export interface GuardWalletDto {
  /** Gains moins les virements demandés ou payés. */
  availableCents: number;
  totalEarnedCents: number;
  payoutMinCents: number;
  hourlyRateCents: number;
  minBilledMinutes: number;
  bankAccount: BankAccountDto | null;
  pendingPayout: PayoutDto | null;
  earnings: GuardEarningDto[];
  payouts: PayoutDto[];
}

export interface AdminPayoutDto extends PayoutDto {
  guard: { id: string; firstName: string; lastName: string; email: string };
}

/** Détail d'un virement pour l'équipe : IBAN complet, consultation tracée. */
export interface AdminPayoutDetailDto extends AdminPayoutDto {
  iban: string;
}
