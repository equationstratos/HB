import { MessageDto, MissionDto, OfferDto } from '@hb/shared';
import { Socket } from 'socket.io-client';
import {
  ROUTE_POINTS,
  Session,
  TestApp,
  approvedGuard,
  connect,
  consent,
  createAdmin,
  createTestApp,
  loginAdmin,
  register,
  verifyPhone,
  waitFor,
} from './helpers';

const CLIENT_TOKEN = 'ExponentPushToken[cliente-chat]';
const GUARD_TOKEN = 'ExponentPushToken[garde-chat]';

describe('Messagerie : notifications et relève des nouveaux messages', () => {
  let t: TestApp;
  let admin: Session;
  let client: Session;
  let guard: Session;
  let guardSocket: Socket;
  let missionId: string;

  const send = (s: Session, body: string) =>
    t
      .http()
      .post(`/api/missions/${missionId}/messages`)
      .set(s.auth)
      .send({ body })
      .expect(201)
      .then((res) => res.body as MessageDto);

  const pushesFor = (token: string) => t.push.sent.filter((p) => p.to === token);

  beforeAll(async () => {
    t = await createTestApp();
    admin = await loginAdmin(t, await createAdmin(t));

    client = await register(t, 'CLIENT', 'Camille');
    await verifyPhone(t, client);
    await consent(t, client);

    guard = await approvedGuard(t, admin, 'Karim', { lat: 48.8566, lng: 2.3522 });
    await t
      .http()
      .post('/api/guards/me/presence')
      .set(guard.auth)
      .send({ available: true, lat: 48.8575, lng: 2.35 })
      .expect(200);

    for (const [s, token] of [
      [client, CLIENT_TOKEN],
      [guard, GUARD_TOKEN],
    ] as const) {
      await t.http().put('/api/me/push-token').set(s.auth).send({ token }).expect(204);
    }

    // Le garde ne rejoint jamais la salle de la mission : il reçoit les messages par sa salle
    // personnelle, quel que soit l'écran ouvert dans l'appli.
    guardSocket = await connect(t, guard);
    const offerPromise = waitFor<OfferDto>(guardSocket, 'offer:new');
    const res = await t
      .http()
      .post('/api/missions')
      .set(client.auth)
      .send({ type: 'ONE_OFF', route: { mode: 'WALK', points: ROUTE_POINTS } })
      .expect(201);
    missionId = (res.body as MissionDto).id;
    const offer = await offerPromise;
    await t.http().post(`/api/offers/${offer.id}/accept`).set(guard.auth).expect(200);
  });

  beforeEach(() => {
    t.push.sent.length = 0;
  });

  afterAll(async () => {
    await t.close();
  });

  it('prévient le garde quand la cliente écrit, sans le contenu ni le prénom', async () => {
    const atGuard = waitFor<MessageDto>(guardSocket, 'chat:message');
    const message = await send(client, 'Je sors du métro, je porte un manteau rouge');

    expect((await atGuard).id).toBe(message.id);
    expect(pushesFor(CLIENT_TOKEN)).toHaveLength(0);
    expect(pushesFor(GUARD_TOKEN)).toEqual([
      {
        to: GUARD_TOKEN,
        title: 'Nouveau message',
        body: 'La cliente vous a écrit.',
        data: { type: 'message', missionId, messageId: message.id, critical: false },
        priority: 'high',
        sound: 'default',
        channelId: 'messages',
      },
    ]);
    const text = JSON.stringify(t.push.sent);
    expect(text).not.toContain('manteau');
    expect(text).not.toContain('Camille');
  });

  it('prévient la cliente quand le garde écrit, jamais le garde lui-même', async () => {
    const message = await send(guard, 'Je suis à 50 m derrière vous.');
    expect(pushesFor(GUARD_TOKEN)).toHaveLength(0);
    expect(pushesFor(CLIENT_TOKEN)).toEqual([
      expect.objectContaining({
        title: 'Nouveau message',
        body: 'Votre garde vous a écrit.',
        data: expect.objectContaining({ type: 'message', missionId, messageId: message.id }),
        channelId: 'messages',
      }),
    ]);
    expect(JSON.stringify(t.push.sent)).not.toContain('50 m');
  });

  it('prévient la cliente et le garde quand l’équipe écrit', async () => {
    await send(admin, 'L’équipe de supervision suit votre trajet.');
    expect(t.push.sent.map((p) => p.to).sort()).toEqual([CLIENT_TOKEN, GUARD_TOKEN].sort());
    expect(t.push.sent[0]?.body).toBe('L’équipe de supervision vous a écrit.');
  });

  it('ne renvoie avec ?after= que les messages postérieurs', async () => {
    const all = await t
      .http()
      .get(`/api/missions/${missionId}/messages`)
      .set(client.auth)
      .expect(200);
    const history = all.body as MessageDto[];
    expect(history).toHaveLength(3);

    const after = await t
      .http()
      .get(`/api/missions/${missionId}/messages`)
      .query({ after: history[0]!.createdAt })
      .set(guard.auth)
      .expect(200);
    expect((after.body as MessageDto[]).map((m) => m.id)).toEqual(
      history.slice(1).map((m) => m.id),
    );

    const none = await t
      .http()
      .get(`/api/missions/${missionId}/messages`)
      .query({ after: history[2]!.createdAt })
      .set(client.auth)
      .expect(200);
    expect(none.body).toEqual([]);

    await t
      .http()
      .get(`/api/missions/${missionId}/messages`)
      .query({ after: 'hier soir' })
      .set(client.auth)
      .expect(400);
  });

  it('garde les mêmes droits d’accès avec ?after=', async () => {
    const after = new Date(0).toISOString();
    const intruder = await register(t, 'CLIENT', 'Intruse');
    const otherGuard = await register(t, 'GUARD', 'Paul');
    for (const s of [intruder, otherGuard]) {
      await t
        .http()
        .get(`/api/missions/${missionId}/messages`)
        .query({ after })
        .set(s.auth)
        .expect(404);
    }
    await t.http().get(`/api/missions/${missionId}/messages`).query({ after }).expect(401);
  });
});
