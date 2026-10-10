/**
 * Environnement des tests e2e : base dédiée (jamais la base de développement),
 * fournisseurs externes en mémoire pour relire SMS, appels et notifications.
 */
const testDb = process.env.TEST_DATABASE_URL ?? 'postgresql://hb:hb@localhost:5432/hb_test';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: testDb,
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  BULL_PREFIX: `hbtest-${process.pid}`,
  JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-test-secret',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  SMS_PROVIDER: 'memory',
  TELEPHONY_PROVIDER: 'memory',
  PUSH_PROVIDER: 'memory',
  ROUTING_PROVIDER: 'straight',
  STORAGE_PROVIDER: 'local',
  UPLOAD_DIR: `/tmp/hb-test-uploads-${process.pid}`,
  THROTTLE_LIMIT_PER_MINUTE: '100000',
  AUTH_THROTTLE_LIMIT_PER_MINUTE: '100000',
  DEVIATION_ESCALATION_SECONDS: '2',
  CORS_ORIGINS: 'http://localhost:5173',
});
