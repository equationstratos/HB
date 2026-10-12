import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoginResponse, REALTIME_NAMESPACE, UserDto } from '@hb/shared';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { AuthService } from '../src/auth/auth.service';
import { MfaService } from '../src/auth/mfa.service';
import { CryptoService } from '../src/common/crypto.service';
import { PUSH_PROVIDER, MemoryPushProvider } from '../src/integrations/push.provider';
import { MemorySmsProvider, SMS_PROVIDER } from '../src/integrations/sms.provider';
import {
  MemoryTelephonyProvider,
  TELEPHONY_PROVIDER,
} from '../src/integrations/telephony.provider';
import { PrismaService } from '../src/prisma/prisma.service';

export const PASSWORD = 'MotDePasse2026!';

/** Paris : place du Châtelet → Bastille, environ 2 km à pied. */
export const ROUTE_POINTS = [
  { lat: 48.8584, lng: 2.347, address: 'Place du Châtelet, Paris' },
  { lat: 48.8532, lng: 2.3691, address: 'Place de la Bastille, Paris' },
];

export interface TestApp {
  app: INestApplication;
  url: string;
  prisma: PrismaService;
  sms: MemorySmsProvider;
  push: MemoryPushProvider;
  telephony: MemoryTelephonyProvider;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export interface Session {
  user: UserDto;
  token: string;
  refreshToken: string;
  auth: { Authorization: string };
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  setupApp(app);
  await app.listen(0);
  const server = app.getHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  const sockets: Socket[] = [];
  (globalThis as { __sockets?: Socket[] }).__sockets = sockets;
  return {
    app,
    url: `http://127.0.0.1:${port}`,
    prisma,
    sms: app.get(SMS_PROVIDER),
    push: app.get(PUSH_PROVIDER),
    telephony: app.get(TELEPHONY_PROVIDER),
    http: () => request(server),
    close: async () => {
      sockets.forEach((s) => s.disconnect());
      await app.close();
    },
  };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;
export function uniquePhone(): string {
  counter += 1;
  return `+3361${String(process.pid % 1000).padStart(3, '0')}${String(counter).padStart(4, '0')}`;
}

export async function register(
  t: TestApp,
  role: 'CLIENT' | 'GUARD',
  firstName: string,
): Promise<Session> {
  const email = `${firstName.toLowerCase()}.${Date.now()}.${counter}@exemple.fr`;
  const res = await t
    .http()
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, firstName, lastName: 'Martin', phone: uniquePhone(), role })
    .expect(201);
  const body = res.body as LoginResponse & { status: 'OK' };
  return toSession(body);
}

export function toSession(body: LoginResponse): Session {
  if (body.status !== 'OK') throw new Error(`Connexion incomplète : ${body.status}`);
  return {
    user: body.user,
    token: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
    auth: { Authorization: `Bearer ${body.tokens.accessToken}` },
  };
}

/** Vérifie le téléphone avec le code reçu par SMS (fournisseur en mémoire). */
export async function verifyPhone(t: TestApp, s: Session): Promise<void> {
  const sms = t.sms.lastTo(s.user.phone);
  const code = sms?.match(/\d{6}/)?.[0];
  if (!code) throw new Error('Aucun code SMS reçu');
  await t.http().post('/api/auth/phone/verify').set(s.auth).send({ code }).expect(204);
}

export async function consent(t: TestApp, s: Session): Promise<void> {
  await t.http().post('/api/me/consent').set(s.auth).send({ location: true }).expect(200);
}

/** Admin créé en base (jamais par inscription publique), 2FA déjà active. */
export async function createAdmin(
  t: TestApp,
  firstName = 'Alice',
): Promise<{ email: string; secret: string }> {
  const crypto = t.app.get(CryptoService);
  const mfa = t.app.get(MfaService);
  const secret = mfa.generateSecret();
  const email = `${firstName.toLowerCase()}.admin.${Date.now()}@exemple.fr`;
  await t.prisma.user.create({
    data: {
      email,
      phone: uniquePhone(),
      firstName,
      lastName: 'Admin',
      role: 'ADMIN',
      passwordHash: await AuthService.hashPassword(PASSWORD),
      phoneVerifiedAt: new Date(),
      totpSecret: crypto.encrypt(secret),
      totpEnabledAt: new Date(),
    },
  });
  return { email, secret };
}

export async function loginAdmin(
  t: TestApp,
  admin: { email: string; secret: string },
): Promise<Session> {
  const first = await t
    .http()
    .post('/api/auth/login')
    .send({ email: admin.email, password: PASSWORD })
    .expect(200);
  expect(first.body.status).toBe('MFA_REQUIRED');
  const res = await t
    .http()
    .post('/api/auth/mfa/verify')
    .send({ mfaToken: first.body.mfaToken, code: MfaService.generate(admin.secret) })
    .expect(200);
  return toSession(res.body);
}

/** Garde complet : téléphone vérifié, documents, candidature envoyée puis validée. */
export async function approvedGuard(
  t: TestApp,
  admin: Session,
  firstName: string,
  base: { lat: number; lng: number },
): Promise<Session> {
  const guard = await register(t, 'GUARD', firstName);
  await verifyPhone(t, guard);
  await consent(t, guard);
  await submitApplication(t, guard, base);
  await t.http().post(`/api/admin/guards/${guard.user.id}/approve`).set(admin.auth).expect(200);
  return guard;
}

export async function submitApplication(
  t: TestApp,
  guard: Session,
  base: { lat: number; lng: number },
): Promise<void> {
  await t
    .http()
    .put('/api/guards/me/profile')
    .set(guard.auth)
    .send({
      cnapsCardNumber: 'CAR-075-2030-01-01-20250000001',
      baseLat: base.lat,
      baseLng: base.lng,
      serviceRadiusKm: 10,
    })
    .expect(200);
  const pdf = Buffer.from('%PDF-1.4\n% document de test\n');
  for (const type of ['ID_CARD', 'CNAPS_CARD']) {
    await t
      .http()
      .post('/api/guards/me/documents')
      .set(guard.auth)
      .field('type', type)
      .attach('file', pdf, { filename: `${type}.pdf`, contentType: 'application/pdf' })
      .expect(201);
  }
  await t.http().post('/api/guards/me/submit').set(guard.auth).expect(200);
}

export function connect(t: TestApp, s: Session): Promise<Socket> {
  const socket = io(`${t.url}${REALTIME_NAMESPACE}`, {
    auth: { token: s.token },
    transports: ['websocket'],
    reconnection: false,
  });
  (globalThis as { __sockets?: Socket[] }).__sockets?.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

/** Attend un événement temps réel qui satisfait le prédicat. */
export function waitFor<T = unknown>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Événement « ${event} » non reçu en ${timeoutMs} ms`));
    }, timeoutMs);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

export async function joinMission(socket: Socket, missionId: string): Promise<void> {
  const res = await socket.emitWithAck('mission:join', { missionId });
  if (!res?.ok) throw new Error(`Impossible de rejoindre la mission : ${res?.error}`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
