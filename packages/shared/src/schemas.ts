import { z } from 'zod';
import {
  GUARD_DOCUMENT_TYPES,
  GUARD_STATUSES,
  MISSION_STATUSES,
  MISSION_TYPES,
  MissionStatus,
  PAYOUT_STATUSES,
  TRANSPORT_MODES,
} from './enums';
import { isValidIban, normalizeIban } from './wallet';

/** Numéro au format international E.164 (+33612345678). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Numéro de téléphone invalide (format international attendu)');

export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères')
  .max(128)
  .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre')
  .regex(/\d/, 'Le mot de passe doit contenir au moins un chiffre');

const nameSchema = z.string().trim().min(1).max(60);
const otpCodeSchema = z.string().regex(/^\d{6}$/, 'Code à 6 chiffres attendu');
const isoDateTime = z.iso.datetime({ offset: true });

// ---------- Authentification ----------

export const registerSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  /** Les comptes admin ne se créent jamais par inscription publique. */
  role: z.enum(['CLIENT', 'GUARD']),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  /** Facultatif : l'admin web l'envoie dans un cookie httpOnly. */
  refreshToken: z.string().min(10).max(512).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(10),
  code: otpCodeSchema,
});
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const mfaSetupSchema = z.object({ mfaToken: z.string().min(10) });
export type MfaSetupInput = z.infer<typeof mfaSetupSchema>;

export const phoneVerifySchema = z.object({ code: otpCodeSchema });
export type PhoneVerifyInput = z.infer<typeof phoneVerifySchema>;

// ---------- Profil ----------

export const updateProfileSchema = z
  .object({ firstName: nameSchema, lastName: nameSchema })
  .partial();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: phoneSchema,
  relation: z.string().trim().max(40).optional(),
});
export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;

export const consentSchema = z.object({ location: z.boolean() });
export type ConsentInput = z.infer<typeof consentSchema>;

export const pushTokenSchema = z.object({ token: z.string().max(256).nullable() });
export type PushTokenInput = z.infer<typeof pushTokenSchema>;

// ---------- Géographie et trajet ----------

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const waypointSchema = latLngSchema.extend({
  address: z.string().trim().max(200).nullish(),
});
export type WaypointInput = z.infer<typeof waypointSchema>;

export const routeRequestSchema = z.object({
  mode: z.enum(TRANSPORT_MODES),
  /** Départ, étapes facultatives, arrivée. */
  points: z.array(waypointSchema).min(2, 'Un départ et une arrivée sont nécessaires').max(10),
});
export type RouteRequestInput = z.infer<typeof routeRequestSchema>;

// ---------- Missions ----------

export const createMissionSchema = z.object({
  route: routeRequestSchema,
  /** Absent ou null : départ immédiat. */
  departureAt: isoDateTime.nullish(),
  type: z.enum(MISSION_TYPES),
  notes: z.string().trim().max(500).optional(),
});
export type CreateMissionInput = z.infer<typeof createMissionSchema>;

export const missionStatusUpdateSchema = z.object({
  status: z.enum([
    MissionStatus.GUARD_EN_ROUTE,
    MissionStatus.IN_PROGRESS,
    MissionStatus.COMPLETED,
  ]),
});
export type MissionStatusUpdateInput = z.infer<typeof missionStatusUpdateSchema>;

export const cancelMissionSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});
export type CancelMissionInput = z.infer<typeof cancelMissionSchema>;

export const locationPingSchema = latLngSchema.extend({
  accuracy: z.number().min(0).max(10_000).nullish(),
  speed: z.number().nullish(),
  heading: z.number().nullish(),
  recordedAt: isoDateTime,
});
export type LocationPingInput = z.infer<typeof locationPingSchema>;

export const locationBatchSchema = z.object({
  pings: z.array(locationPingSchema).min(1).max(200),
});
export type LocationBatchInput = z.infer<typeof locationBatchSchema>;

export const messageSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});
export type MessageInput = z.infer<typeof messageSchema>;

export const sosSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  message: z.string().trim().max(300).optional(),
});
export type SosInput = z.infer<typeof sosSchema>;

export const ratingSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type RatingInput = z.infer<typeof ratingSchema>;

export const deviationAckSchema = z.object({
  /** Réponse de la cliente à « Tout va bien ? ». */
  ok: z.boolean(),
  note: z.string().trim().max(300).optional(),
});
export type DeviationAckInput = z.infer<typeof deviationAckSchema>;

const csvOf = <T extends readonly [string, ...string[]]>(allowed: T) =>
  z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(z.enum(allowed)));

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const missionListQuerySchema = paginationSchema.extend({
  status: csvOf(MISSION_STATUSES).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});
export type MissionListQuery = z.infer<typeof missionListQuerySchema>;

// ---------- Gardes ----------

export const guardApplicationSchema = z.object({
  cnapsCardNumber: z.string().trim().min(5).max(64),
  bio: z.string().trim().max(500).optional(),
  baseLat: z.number().min(-90).max(90),
  baseLng: z.number().min(-180).max(180),
  serviceRadiusKm: z.number().min(1).max(50),
});
export type GuardApplicationInput = z.infer<typeof guardApplicationSchema>;

export const guardDocumentUploadSchema = z.object({
  type: z.enum(GUARD_DOCUMENT_TYPES),
});

export const availabilitySlotSchema = z
  .object({
    /** 1 = lundi … 7 = dimanche (ISO 8601). */
    dayOfWeek: z.number().int().min(1).max(7),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((s) => s.startMinute < s.endMinute, {
    message: "L'heure de fin doit suivre l'heure de début",
  });
export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;

export const availabilitySchema = z.object({
  slots: z.array(availabilitySlotSchema).max(50),
  timezone: z.string().max(64).default('Europe/Paris'),
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export const presenceSchema = z.object({
  available: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type PresenceInput = z.infer<typeof presenceSchema>;

// ---------- Abonnements ----------

export const subscribeSchema = z.object({ planId: z.string().min(1) });
export type SubscribeInput = z.infer<typeof subscribeSchema>;

export const planSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,32}$/),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  missionsPerMonth: z.number().int().min(1).max(500),
  priceCents: z.number().int().min(0),
  active: z.boolean().default(true),
});
export type PlanInput = z.infer<typeof planSchema>;
export const planUpdateSchema = planSchema.partial();
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

// ---------- Admin ----------

export const adminAssignSchema = z.object({ guardId: z.string().min(1) });
export type AdminAssignInput = z.infer<typeof adminAssignSchema>;

export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type ReasonInput = z.infer<typeof reasonSchema>;

export const alertNoteSchema = z.object({ note: z.string().trim().max(500).optional() });
export type AlertNoteInput = z.infer<typeof alertNoteSchema>;

export const guardListQuerySchema = paginationSchema.extend({
  status: csvOf(GUARD_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});
export type GuardListQuery = z.infer<typeof guardListQuerySchema>;

export const userListQuerySchema = paginationSchema.extend({
  role: z.enum(['CLIENT', 'GUARD', 'ADMIN']).optional(),
  q: z.string().trim().max(100).optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const auditQuerySchema = paginationSchema.extend({
  actorId: z.string().optional(),
  action: z.string().max(100).optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

// ---------- Gains et virements des gardes ----------

/** IBAN saisi librement (espaces, minuscules) : normalisé, puis longueur et clé vérifiées. */
export const ibanSchema = z
  .string()
  .max(50)
  .transform(normalizeIban)
  .refine(isValidIban, 'IBAN invalide : vérifiez les caractères saisis');

export const bankAccountSchema = z.object({
  holderName: z.string().trim().min(2, 'Indiquez le titulaire du compte').max(70),
  iban: ibanSchema,
});
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

export const payoutListQuerySchema = paginationSchema.extend({
  status: csvOf(PAYOUT_STATUSES).optional(),
});
export type PayoutListQuery = z.infer<typeof payoutListQuerySchema>;

export const payoutPaidSchema = z.object({
  /** Référence du virement dans la banque de la plateforme (facultative). */
  bankReference: z.string().trim().max(100).optional(),
});
export type PayoutPaidInput = z.infer<typeof payoutPaidSchema>;
