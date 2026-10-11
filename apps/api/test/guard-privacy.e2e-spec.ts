import { GuardMissionDto, MissionDto, OfferDto } from '@hb/shared';
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

const FIRST_NAME = 'Héloïse';
const LAST_NAME = 'Delacroix';
const COMMENT = 'Trop loin derrière moi';

/** Rien d'identifiant sur la cliente, ni aucune trace de notation. */
function expectNothingAboutClient(payload: unknown): void {
  const json = JSON.stringify(payload);
  expect(json).not.toContain(FIRST_NAME);
  expect(json).not.toContain(LAST_NAME);
  expect(json).not.toMatch(/rating|score/i);
  expect(json).not.toContain(COMMENT);
}

/** Prénom seul (mission active consultée seule) : jamais de nom ni de note. */
function expectFirstNameOnly(mission: GuardMissionDto): void {
  expect(mission.client).toEqual({ id: expect.any(String), firstName: FIRST_NAME });
  const json = JSON.stringify(mission);
  expect(json).not.toContain(LAST_NAME);
  expect(json).not.toMatch(/rating|score/i);
}

describe('Confidentialité côté garde : ni note, ni nom de la cliente', () => {
  let t: TestApp;
  let admin: Session;
  let client: Session;
  let guard: Session;
  let guardSocket: Socket;
  let missionId: string;

  const createMission = () =>
    t
      .http()
      .post('/api/missions')
      .set(client.auth)
      .send({ type: 'ONE_OFF', route: { mode: 'WALK', points: ROUTE_POINTS } })
      .expect(201);

  const setStatus = (status: string) =>
    t.http().post(`/api/missions/${missionId}/status`).set(guard.auth).send({ status }).expect(200);

  beforeAll(async () => {
    t = await createTestApp();
    admin = await loginAdmin(t, await createAdmin(t));

    client = await register(t, 'CLIENT', 'Heloise');
    await t.prisma.user.update({
      where: { id: client.user.id },
      data: { firstName: FIRST_NAME, lastName: LAST_NAME },
    });
    await verifyPhone(t, client);
    await consent(t, client);

    guard = await approvedGuard(t, admin, 'Karim', { lat: 48.8566, lng: 2.3522 });
    await t
      .http()
      .post('/api/guards/me/presence')
      .set(guard.auth)
      .send({ available: true, lat: 48.8575, lng: 2.35 })
      .expect(200);
    await t
      .http()
      .put('/api/me/push-token')
      .set(guard.auth)
      .send({ token: 'ExponentPushToken[garde]' })
      .expect(204);
    guardSocket = await connect(t, guard);
  });

  afterAll(async () => {
    await t.close();
  });

  it('propose la mission sans rien dire de la cliente', async () => {
    const pushed = waitFor<OfferDto>(guardSocket, 'offer:new');
    missionId = (await createMission()).body.id;
    const offer = await pushed;
    expect(offer.missionId).toBe(missionId);
    expectNothingAboutClient(offer);

    const offers = await t.http().get('/api/offers').set(guard.auth).expect(200);
    expect(offers.body).toHaveLength(1);
    expect(offers.body[0].mission).not.toHaveProperty('clientFirstName');
    expectNothingAboutClient(offers.body);
  });

  it('pendant la mission active, ne donne au garde que le prénom de la cliente', async () => {
    const offers = await t.http().get('/api/offers').set(guard.auth).expect(200);
    const assigned = waitFor<GuardMissionDto>(
      guardSocket,
      'mission:updated',
      (m) => m.id === missionId && m.status === 'ASSIGNED',
    );
    await t.http().post(`/api/offers/${offers.body[0].id}/accept`).set(guard.auth).expect(200);
    const live = await assigned;
    expectFirstNameOnly(live);
    // Sa propre note n'apparaît pas non plus dans la mission.
    expect(live.guard).toEqual({ id: guard.user.id, firstName: 'Karim', lastName: 'M.' });

    const detail = await t.http().get(`/api/missions/${missionId}`).set(guard.auth).expect(200);
    expectFirstNameOnly(detail.body);
    expect(detail.body).not.toHaveProperty('rating');

    const enRoute = await setStatus('GUARD_EN_ROUTE');
    expectFirstNameOnly(enRoute.body);
  });

  it('ne met aucun nom de cliente dans la liste des missions du garde', async () => {
    const list = await t.http().get('/api/missions').set(guard.auth).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].client).toEqual({ id: client.user.id });
    expectNothingAboutClient(list.body);
  });

  it('ne nomme jamais la cliente dans les notifications du garde', async () => {
    await t
      .http()
      .post(`/api/missions/${missionId}/messages`)
      .set(client.auth)
      .send({ body: 'Je sors du métro' })
      .expect(201);
    const toGuard = t.push.sent.filter((p) => p.to === 'ExponentPushToken[garde]');
    expect(toGuard.map((p) => p.title)).toEqual(
      expect.arrayContaining(['Nouvelle mission proposée', 'Message de Votre cliente']),
    );
    expectNothingAboutClient(toGuard);
  });

  it('laisse la vue de la cliente inchangée', async () => {
    const res = await t.http().get(`/api/missions/${missionId}`).set(client.auth).expect(200);
    const mission = res.body as MissionDto;
    expect(mission.client).toMatchObject({ firstName: FIRST_NAME, lastName: 'D.' });
    expect(mission.guard).toMatchObject({ firstName: 'Karim', lastName: 'M.', ratingCount: 0 });
    expect(mission.guard).toHaveProperty('ratingAvg', null);
    expect(mission).toHaveProperty('rating', null);
  });

  it('une fois la mission terminée, ne montre au garde ni prénom ni note', async () => {
    await setStatus('IN_PROGRESS');
    const done = waitFor<GuardMissionDto>(
      guardSocket,
      'mission:updated',
      (m) => m.id === missionId && m.status === 'COMPLETED',
    );
    const completed = await setStatus('COMPLETED');
    expect(completed.body.client).toEqual({ id: client.user.id });
    expectNothingAboutClient(completed.body);
    expectNothingAboutClient(await done);

    await t
      .http()
      .post(`/api/missions/${missionId}/rating`)
      .set(client.auth)
      .send({ score: 2, comment: COMMENT })
      .expect(201);

    const detail = await t.http().get(`/api/missions/${missionId}`).set(guard.auth).expect(200);
    expect(detail.body.status).toBe('COMPLETED');
    expect(detail.body.client).toEqual({ id: client.user.id });
    expectNothingAboutClient(detail.body);

    const history = await t
      .http()
      .get('/api/missions')
      .query({ status: 'COMPLETED' })
      .set(guard.auth)
      .expect(200);
    expect(history.body.items).toHaveLength(1);
    expectNothingAboutClient(history.body);
  });

  it('interdit au garde de lire ses notes et sa moyenne', async () => {
    await t.http().get('/api/guards/me/ratings').set(guard.auth).expect(404);
    await t.http().get('/api/admin/ratings/low').set(guard.auth).expect(403);
    await t.http().get(`/api/admin/guards/${guard.user.id}`).set(guard.auth).expect(403);

    const me = await t.http().get('/api/guards/me').set(guard.auth).expect(200);
    expect(me.body.status).toBe('APPROVED');
    expect(me.body).not.toHaveProperty('ratingAvg');
    expect(me.body).not.toHaveProperty('ratingCount');
    expectNothingAboutClient(me.body);

    const presence = await t
      .http()
      .post('/api/guards/me/presence')
      .set(guard.auth)
      .send({ available: true })
      .expect(200);
    expect(presence.body).not.toHaveProperty('ratingAvg');
  });

  it('garde la vue complète pour la cliente et l’équipe', async () => {
    const asClient = await t.http().get(`/api/missions/${missionId}`).set(client.auth).expect(200);
    expect(asClient.body.rating).toMatchObject({ score: 2, comment: COMMENT });
    expect(asClient.body.guard).toMatchObject({ ratingAvg: 2, ratingCount: 1 });

    const asAdmin = await t
      .http()
      .get(`/api/admin/missions/${missionId}`)
      .set(admin.auth)
      .expect(200);
    expect(asAdmin.body.client).toMatchObject({ firstName: FIRST_NAME, lastName: LAST_NAME });
    expect(asAdmin.body.rating).toMatchObject({ score: 2, comment: COMMENT });

    const profile = await t
      .http()
      .get(`/api/admin/guards/${guard.user.id}`)
      .set(admin.auth)
      .expect(200);
    expect(profile.body).toMatchObject({ ratingAvg: 2, ratingCount: 1 });
    const guards = await t.http().get('/api/admin/guards').set(admin.auth).expect(200);
    expect(guards.body.items[0]).toMatchObject({ ratingAvg: 2, ratingCount: 1 });

    // Assez de notes basses pour figurer dans la liste à examiner par l'équipe.
    await t.prisma.guardProfile.update({
      where: { userId: guard.user.id },
      data: { ratingSum: 6, ratingCount: 3, ratingAvg: 2 },
    });
    const low = await t.http().get('/api/admin/ratings/low').set(admin.auth).expect(200);
    expect(low.body).toHaveLength(1);
    expect(low.body[0].guard.id).toBe(guard.user.id);
    expect(low.body[0].recent[0]).toMatchObject({ score: 2, comment: COMMENT });
  });

  it('ne montre aucun nom au garde pour une mission annulée', async () => {
    const pushed = waitFor<OfferDto>(guardSocket, 'offer:new');
    missionId = (await createMission()).body.id;
    const offer = await pushed;
    await t.http().post(`/api/offers/${offer.id}/accept`).set(guard.auth).expect(200);

    const cancelled = waitFor<GuardMissionDto>(
      guardSocket,
      'mission:updated',
      (m) => m.id === missionId && m.status === 'CANCELLED',
    );
    await t
      .http()
      .post(`/api/missions/${missionId}/cancel`)
      .set(client.auth)
      .send({ reason: 'Plus besoin' })
      .expect(200);
    expectNothingAboutClient(await cancelled);

    const detail = await t.http().get(`/api/missions/${missionId}`).set(guard.auth).expect(200);
    expect(detail.body.status).toBe('CANCELLED');
    expect(detail.body.client).toEqual({ id: client.user.id });
    expectNothingAboutClient(detail.body);
  });
});
