import { API_LEVEL, AppNotificationDto, OfferDto } from '@hb/shared';
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

/** La cliente et le garde sont prévenus du statut de la protection, chacun avec son texte. */
describe('Notifications du statut de la protection', () => {
  let t: TestApp;
  let client: Session;
  let guard: Session;
  let clientSocket: Socket;
  let guardSocket: Socket;
  let missionId: string;

  const CLIENT_TOKEN = 'ExponentPushToken[cliente]';
  const GUARD_TOKEN = 'ExponentPushToken[garde]';
  const pushedTo = (token: string) => t.push.sent.filter((p) => p.to === token);
  const setStatus = (who: Session, status: string) =>
    t.http().post(`/api/missions/${missionId}/status`).set(who.auth).send({ status }).expect(200);

  beforeAll(async () => {
    t = await createTestApp();
    const admin = await loginAdmin(t, await createAdmin(t));
    client = await register(t, 'CLIENT', 'Nora');
    await verifyPhone(t, client);
    await consent(t, client);
    guard = await approvedGuard(t, admin, 'Paul', { lat: 48.8566, lng: 2.3522 });
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
    clientSocket = await connect(t, client);
    guardSocket = await connect(t, guard);
  });

  afterAll(async () => {
    await t.close();
  });

  it('indique son niveau d’API, pour que les applis signalent un serveur trop ancien', async () => {
    const health = await t.http().get('/api/health').expect(200);
    expect(health.body.apiLevel).toBe(API_LEVEL);
  });

  it('prévient le garde d’une proposition, aussi par le temps réel', async () => {
    const offer = waitFor<OfferDto>(guardSocket, 'offer:new');
    const live = waitFor<AppNotificationDto>(
      guardSocket,
      'notification',
      (n) => n.data.type === 'offer',
    );
    missionId = (
      await t
        .http()
        .post('/api/missions')
        .set(client.auth)
        .send({ type: 'ONE_OFF', route: { mode: 'WALK', points: ROUTE_POINTS } })
        .expect(201)
    ).body.id;
    await offer;
    const n = await live;
    expect(n).toMatchObject({ title: 'Nouvelle mission proposée', critical: true });
    expect(n.data).toMatchObject({ type: 'offer', missionId });
    expect(n.id).toEqual(expect.any(String));
  });

  it('prévient la cliente à chaque étape franchie par le garde, jamais le garde lui-même', async () => {
    const offers = await t.http().get('/api/offers').set(guard.auth).expect(200);
    const found = waitFor<AppNotificationDto>(
      clientSocket,
      'notification',
      (n) => n.data.status === 'ASSIGNED',
    );
    await t.http().post(`/api/offers/${offers.body[0].id}/accept`).set(guard.auth).expect(200);
    expect((await found).title).toBe('Garde trouvé');

    const guardBefore = pushedTo(GUARD_TOKEN).length;
    const enRoute = waitFor<AppNotificationDto>(
      clientSocket,
      'notification',
      (n) => n.data.status === 'GUARD_EN_ROUTE',
    );
    await setStatus(guard, 'GUARD_EN_ROUTE');
    const n = await enRoute;
    expect(n.title).toBe('Votre garde est en route');
    expect(n.data).toEqual({ type: 'status', missionId, status: 'GUARD_EN_ROUTE' });

    await setStatus(guard, 'IN_PROGRESS');
    expect(pushedTo(CLIENT_TOKEN).map((p) => p.title)).toEqual(
      expect.arrayContaining(['Garde trouvé', 'Votre garde est en route', 'Protection en cours']),
    );
    // Le garde a lui-même changé ces statuts : rien ne lui est envoyé.
    expect(pushedTo(GUARD_TOKEN)).toHaveLength(guardBefore);
  });

  it('prévient le garde quand la cliente termine la protection, avec son propre texte', async () => {
    const clientBefore = pushedTo(CLIENT_TOKEN).length;
    const done = waitFor<AppNotificationDto>(
      guardSocket,
      'notification',
      (n) => n.data.status === 'COMPLETED',
    );
    await setStatus(client, 'COMPLETED');
    const n = await done;
    expect(n).toMatchObject({
      title: 'Protection terminée',
      body: 'Votre gain a été ajouté à votre solde.',
    });
    expect(pushedTo(GUARD_TOKEN).at(-1)).toMatchObject({ title: 'Protection terminée' });
    expect(pushedTo(CLIENT_TOKEN)).toHaveLength(clientBefore);
  });
});
