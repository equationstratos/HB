import { DEFAULT_MAP_ATTRIBUTION } from '@hb/shared';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: bool,

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET doit faire au moins 32 caractères'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /** Délai pendant lequel un jeton tout juste remplacé reste accepté (onglets, requêtes simultanées). */
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(60).default(10),
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'DATA_ENCRYPTION_KEY : 32 octets en base64',
    ),
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  THROTTLE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  AUTH_THROTTLE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),

  SMS_PROVIDER: z.enum(['console', 'twilio', 'memory']).default('console'),
  TELEPHONY_PROVIDER: z.enum(['console', 'twilio', 'memory']).default('console'),
  PUSH_PROVIDER: z.enum(['console', 'expo', 'memory']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),

  ROUTING_PROVIDER: z.enum(['straight', 'osrm', 'ors']).default('straight'),
  OSRM_URL: z.string().url().default('https://routing.openstreetmap.de'),
  ORS_API_KEY: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  /** Fond de carte relayé par l'API : {z}, {x}, {y}, et au besoin {s} (a, b ou c) et {r}. */
  MAP_TILE_URL: z
    .string()
    .url()
    .refine(
      (v) => /^https?:\/\//i.test(v) && ['{z}', '{x}', '{y}'].every((p) => v.includes(p)),
      'MAP_TILE_URL : adresse http(s) contenant {z}, {x} et {y}',
    )
    .default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  MAP_TILE_ATTRIBUTION: z.string().min(1).default(DEFAULT_MAP_ATTRIBUTION),
  /** Exigé par la politique d'usage des tuiles OpenStreetMap : identifie l'application. */
  MAP_TILE_USER_AGENT: z.string().min(1).default('HB/0.1 (+https://github.com/equationstratos/HB)'),

  MATCHING_WAVE_SIZE: z.coerce.number().int().min(1).default(5),
  MATCHING_WAVE_TIMEOUT_SECONDS: z.coerce.number().int().min(1).default(120),
  MATCHING_SCHEDULED_WAVE_TIMEOUT_SECONDS: z.coerce.number().int().min(1).default(900),
  MATCHING_MAX_RADIUS_KM: z.coerce.number().min(1).default(30),

  DEVIATION_ESCALATION_SECONDS: z.coerce.number().int().min(1).default(120),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (env.SMS_PROVIDER !== 'twilio' || env.TELEPHONY_PROVIDER !== 'twilio') {
      throw new Error('En production, SMS_PROVIDER et TELEPHONY_PROVIDER doivent valoir "twilio".');
    }
  }
  return env;
}
