import {
  DeviationDto,
  LocationDto,
  MessageDto,
  MissionDto,
  MissionRouteDto,
  OfferDto,
  SosAlertDto,
} from '@hb/shared';
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
  joinMission,
  loginAdmin,
  register,
  sleep,
  submitApplication,
  verifyPhone,
  waitFor,
} from './helpers';

/** Position à environ 330 m au nord du trajet Châtelet → Bastille. */
const OFF_ROUTE = { lat: 48.8592, lng: 2.358 };
const ON_ROUTE = { lat: 48.8559, lng: 2.358 };

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

describe('Parcours complet d’une protection', () => {
  let t: TestApp;
  let admin: Session;
  let client: Session;
  let guard: Session;
  let pendingGuard: Session;
  let adminSocket: Socket;
  let clientSocket: Socket;
  let guardSocket: Socket;
  let pendingGuardSocket: Socket;
  let missionId: string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await loginAdmin(t, await createAdmin(t));

    client = await register(t, 'CLIENT', 'Camille');
    await verifyPhone(t, client);
    await consent(t, client);
    await t
      .http()
      .post('/api/me/emergency-contacts')
      .set(client.auth)
      .send({ name: 'Maman', phone: '+33699887766', relation: 'Mère' })
      .expect(201);

    guard = await approvedGuard(t, admin, 'Karim', { lat: 48.8566, lng: 2.3522 });
    await t
      .http()
      .post('/api/guards/me/presence')
      .set(guard.auth)
      .send({ available: true, lat: 48.8575, lng: 2.35 })
      .expect(200);

    // Garde inscrit et disponible tout près, mais pas encore validé par l'admin.
    pendingGuard = await register(t, 'GUARD', 'Paul');
    await verifyPhone(t, pendingGuard);
    await consent(t, pendingGuard);
    await submitApplication(t, pendingGuard, { lat: 48.858, lng: 2.3475 });
    await t
      .http()
      .post('/api/guards/me/presence')
      .set(pendingGuard.auth)
      .send({ available: true })
      .expect(403);

    await t
      .http()
      .put('/api/me/push-token')
      .set(client.auth)
      .send({ token: 'ExponentPushToken[cliente]' })
      .expect(204);
    await t
      .http()
      .put('/api/me/push-token')
      .set(guard.auth)
      .send({ token: 'ExponentPushToken[garde]' })
      .expect(204);

    [adminSocket, clientSocket, guardSocket, pendingGuardSocket] = await Promise.all([
      connect(t, admin),
      connect(t, client),
      connect(t, guard),
      connect(t, pendingGuard),
    ]);
  });

  afterAll(async () => {
    await t.close();
  });

  it('refuse une connexion temps réel sans jeton valide', async () => {
    await expect(connect(t, { ...client, token: 'invalide' })).rejects.toThrow(/unauthorized/);
  });

  it('calcule un aperçu du trajet avant la commande', async () => {
    const res = await t
      .http()
      .post('/api/routes/preview')
      .set(client.auth)
      .send({ mode: 'WALK', points: ROUTE_POINTS })
      .expect(200);
    expect(res.body.geometry.type).toBe('LineString');
    expect(res.body.distanceMeters).toBeGreaterThan(1500);
    expect(res.body.durationSeconds).toBeGreaterThan(0);
  });

  it('crée la mission avec le trajet validé et propose l’offre au seul garde validé', async () => {
    const offerPromise = waitFor<OfferDto>(guardSocket, 'offer:new');
    let pendingGuardGotOffer = false;
    pendingGuardSocket.on('offer:new', () => (pendingGuardGotOffer = true));

    const res = await t
      .http()
      .post('/api/missions')
      .set(client.auth)
      .send({
        type: 'ONE_OFF',
        route: { mode: 'WALK', points: ROUTE_POINTS },
        notes: 'Sortie du théâtre',
      })
      .expect(201);
    const mission = res.body as MissionDto;
    missionId = mission.id;
    expect(mission.status).toBe('SEARCHING');
    expect(mission.route.waypoints).toHaveLength(2);
    expect(mission.route.toleranceMeters).toBe(150);
    expect(mission.codeWord).toEqual(expect.any(String));

    const offer = await offerPromise;
    expect(offer.missionId).toBe(missionId);
    expect(offer.mission.route.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    // Rien sur l'identité de la cliente avant l'acceptation.
    expect(JSON.stringify(offer)).not.toContain('Camille');

    await sleep(300);
    expect(pendingGuardGotOffer).toBe(false);
    const pendingOffers = await t.prisma.missionOffer.count({
      where: { guardId: pendingGuard.user.id },
    });
    expect(pendingOffers).toBe(0);
  });

  it('attribue la mission au garde qui accepte', async () => {
    const offers = await t.http().get('/api/offers').set(guard.auth).expect(200);
    expect(offers.body).toHaveLength(1);

    const assigned = waitFor<MissionDto>(
      clientSocket,
      'mission:updated',
      (m) => m.status === 'ASSIGNED',
    );
    await t.http().post(`/api/offers/${offers.body[0].id}/accept`).set(guard.auth).expect(200);
    const mission = await assigned;
    expect(mission.guard?.firstName).toBe('Karim');
    // Minimisation : la cliente ne voit que l'initiale du nom du garde.
    expect(mission.guard?.lastName).toBe('M.');

    // Une seconde acceptation est refusée.
    await t.http().post(`/api/offers/${offers.body[0].id}/accept`).set(guard.auth).expect(410);
  });

  it('cache la mission aux autres clientes', async () => {
    const intruder = await register(t, 'CLIENT', 'Intruse');
    await t.http().get(`/api/missions/${missionId}`).set(intruder.auth).expect(404);
    await t.http().get(`/api/missions/${missionId}/locations`).set(intruder.auth).expect(404);
    await t
      .http()
      .post(`/api/missions/${missionId}/messages`)
      .set(intruder.auth)
      .send({ body: 'Coucou' })
      .expect(404);
    const intruderSocket = await connect(t, intruder);
    const ack = await intruderSocket.emitWithAck('mission:join', { missionId });
    expect(ack.ok).toBe(false);
  });

  it('refuse les positions tant que le suivi n’a pas commencé', async () => {
    await t
      .http()
      .post(`/api/missions/${missionId}/locations`)
      .set(client.auth)
      .send({ pings: [{ ...ON_ROUTE, recordedAt: ago(1) }] })
      .expect(409);
  });

  it('suit la progression : garde en route puis protection en cours', async () => {
    await t
      .http()
      .post(`/api/missions/${missionId}/status`)
      .set(client.auth)
      .send({ status: 'GUARD_EN_ROUTE' })
      .expect(403);
    await t
      .http()
      .post(`/api/missions/${missionId}/status`)
      .set(guard.auth)
      .send({ status: 'COMPLETED' })
      .expect(409);

    const enRoute = waitFor<MissionDto>(
      clientSocket,
      'mission:updated',
      (m) => m.status === 'GUARD_EN_ROUTE',
    );
    await t
      .http()
      .post(`/api/missions/${missionId}/status`)
      .set(guard.auth)
      .send({ status: 'GUARD_EN_ROUTE' })
      .expect(200);
    await enRoute;

    await joinMission(clientSocket, missionId);
    await joinMission(guardSocket, missionId);

    const res = await t
      .http()
      .post(`/api/missions/${missionId}/status`)
      .set(guard.auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(res.body.startedAt).toEqual(expect.any(String));
  });

  it('partage les positions en direct avec la cliente, le garde et l’admin', async () => {
    const atClient = waitFor<LocationDto>(clientSocket, 'location', (l) => l.role === 'GUARD');
    const atAdmin = waitFor<LocationDto>(adminSocket, 'location', (l) => l.role === 'GUARD');
    await t
      .http()
      .post(`/api/missions/${missionId}/locations`)
      .set(guard.auth)
      .send({ pings: [{ lat: 48.8579, lng: 2.348, accuracy: 10, recordedAt: ago(2) }] })
      .expect(202);
    expect((await atClient).lat).toBeCloseTo(48.8579);
    await atAdmin;

    const atGuard = waitFor<LocationDto>(guardSocket, 'location', (l) => l.role === 'CLIENT');
    const res = await t
      .http()
      .post(`/api/missions/${missionId}/locations`)
      .set(client.auth)
      .send({
        pings: [
          { ...ROUTE_POINTS[0], accuracy: 8, recordedAt: ago(600) },
          { ...ON_ROUTE, accuracy: 8, recordedAt: ago(570) },
          // Position trop ancienne ou dans le futur : ignorée.
          { ...ON_ROUTE, accuracy: 8, recordedAt: ago(3600) },
          { ...ON_ROUTE, accuracy: 8, recordedAt: new Date(Date.now() + 3_600_000).toISOString() },
        ],
      })
      .expect(202);
    expect(res.body.accepted).toBe(2);
    await atGuard;
    expect(await t.prisma.routeDeviation.count({ where: { missionId } })).toBe(0);
  });

  it('relaie la messagerie entre la cliente et le garde', async () => {
    const received = waitFor<MessageDto>(clientSocket, 'chat:message');
    await t
      .http()
      .post(`/api/missions/${missionId}/messages`)
      .set(guard.auth)
      .send({ body: 'Je suis à 50 m derrière vous.' })
      .expect(201);
    const message = await received;
    expect(message.senderRole).toBe('GUARD');
    const history = await t
      .http()
      .get(`/api/missions/${missionId}/messages`)
      .set(client.auth)
      .expect(200);
    expect(history.body).toHaveLength(1);
  });

  it('met en relation par appel masqué sans exposer les numéros', async () => {
    const res = await t.http().post(`/api/missions/${missionId}/call`).set(client.auth).expect(200);
    expect(res.body.callId).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain(guard.user.phone);
    expect(t.telephony.calls.at(-1)).toEqual({
      caller: client.user.phone,
      callee: guard.user.phone,
      reference: res.body.callId,
    });
    await t.http().post(`/api/missions/${missionId}/call`).set(client.auth).expect(429);
  });

  it('détecte un écart de trajet de plus de 60 s et prévient le garde et l’admin', async () => {
    const atGuard = waitFor<DeviationDto>(
      guardSocket,
      'alert:deviation',
      (d) => d.type === 'OFF_ROUTE',
    );
    const atAdmin = waitFor<DeviationDto>(
      adminSocket,
      'alert:deviation',
      (d) => d.type === 'OFF_ROUTE',
    );

    // 30 s hors trajet : pas encore d'alerte.
    await t
      .http()
      .post(`/api/missions/${missionId}/locations`)
      .set(client.auth)
      .send({
        pings: [
          { ...OFF_ROUTE, accuracy: 10, recordedAt: ago(540) },
          { ...OFF_ROUTE, accuracy: 10, recordedAt: ago(510) },
        ],
      })
      .expect(202);
    expect(await t.prisma.routeDeviation.count({ where: { missionId } })).toBe(0);

    // 70 s hors trajet : alerte.
    await t
      .http()
      .post(`/api/missions/${missionId}/locations`)
      .set(client.auth)
      .send({ pings: [{ ...OFF_ROUTE, accuracy: 10, recordedAt: ago(470) }] })
      .expect(202);

    const deviation = await atGuard;
    await atAdmin;
    expect(deviation.distanceMeters).toBeGreaterThan(250);
    expect(t.push.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: 'ExponentPushToken[cliente]',
          title: 'Tout va bien ?',
          priority: 'high',
        }),
        expect.objectContaining({ to: 'ExponentPushToken[garde]', title: '⚠️ Écart de trajet' }),
      ]),
    );

    // La cliente répond « tout va bien » : l'alerte est close et ne sera pas escaladée.
    const answer = await t
      .http()
      .post(`/api/deviations/${deviation.id}/answer`)
      .set(client.auth)
      .send({ ok: true })
      .expect(200);
    expect(answer.body.status).toBe('RESOLVED');
  });

  it('laisse la cliente modifier son trajet en cours de route', async () => {
    const atGuard = waitFor<{ missionId: string; route: MissionRouteDto }>(
      guardSocket,
      'route:updated',
    );
    const res = await t
      .http()
      .put(`/api/missions/${missionId}/route`)
      .set(client.auth)
      .send({
        mode: 'WALK',
        points: [
          { ...OFF_ROUTE, address: 'Rue de Rivoli' },
          { lat: 48.8606, lng: 2.3637, address: 'Place des Vosges' },
        ],
      })
      .expect(200);
    expect(res.body.route.version).toBe(2);
    const update = await atGuard;
    expect(update.route.waypoints[1]?.address).toBe('Place des Vosges');
    await t
      .http()
      .put(`/api/missions/${missionId}/route`)
      .set(guard.auth)
      .send({ mode: 'WALK', points: ROUTE_POINTS })
      .expect(403);
  });

  it('déclenche un SOS : admin alerté, contact d’urgence prévenu, prise en charge tracée', async () => {
    const atAdmin = waitFor<SosAlertDto>(adminSocket, 'alert:sos');
    const atGuard = waitFor<SosAlertDto>(guardSocket, 'alert:sos');
    const res = await t
      .http()
      .post(`/api/missions/${missionId}/sos`)
      .set(client.auth)
      .send({ lat: 48.858, lng: 2.36 })
      .expect(201);
    const alert = await atAdmin;
    await atGuard;
    expect(alert.id).toBe(res.body.id);
    expect(t.sms.lastTo('+33699887766')).toContain('https://maps.google.com/?q=48.858,2.36');

    // Second appui immédiat : même alerte, pas de doublon.
    const again = await t
      .http()
      .post(`/api/missions/${missionId}/sos`)
      .set(client.auth)
      .send({})
      .expect(201);
    expect(again.body.id).toBe(alert.id);

    await t
      .http()
      .post(`/api/sos/${alert.id}/acknowledge`)
      .set(guard.auth)
      .send({ note: "J'interviens" })
      .expect(200);
    await t.http().post(`/api/sos/${alert.id}/resolve`).set(guard.auth).send({}).expect(403);
    const resolved = await t
      .http()
      .post(`/api/sos/${alert.id}/resolve`)
      .set(admin.auth)
      .send({ note: 'Fausse alerte' })
      .expect(200);
    expect(resolved.body.status).toBe('RESOLVED');
  });

  it('escalade en SOS un écart resté sans réponse de la cliente', async () => {
    const autoSos = waitFor<SosAlertDto>(
      adminSocket,
      'alert:sos',
      (a) => (a.message ?? '').includes('Escalade automatique'),
      10_000,
    );
    // Nouveau tracé (version 2) : départ OFF_ROUTE → place des Vosges. On s'en écarte vers le sud.
    const away = { lat: 48.8545, lng: 2.36 };
    await t
      .http()
      .post(`/api/missions/${missionId}/locations`)
      .set(client.auth)
      .send({
        pings: [
          { ...away, accuracy: 10, recordedAt: ago(200) },
          { ...away, accuracy: 10, recordedAt: ago(120) },
        ],
      })
      .expect(202);
    const sos = await autoSos;
    expect(sos.raisedByRole).toBe('CLIENT');
    const deviation = await t.prisma.routeDeviation.findFirstOrThrow({
      where: { missionId, status: 'OPEN' },
    });
    expect(deviation.escalatedAt).not.toBeNull();
    await t
      .http()
      .post(`/api/sos/${sos.id}/resolve`)
      .set(admin.auth)
      .send({ note: 'Cliente rappelée' })
      .expect(200);
  });

  it('montre la protection sur la carte en direct de l’admin', async () => {
    const live = await t.http().get('/api/admin/live').set(admin.auth).expect(200);
    const entry = live.body.find((m: { id: string }) => m.id === missionId);
    expect(entry.lastClientLocation).not.toBeNull();
    expect(entry.lastGuardLocation).not.toBeNull();
    expect(entry.route.version).toBe(2);
    expect(entry.client.lastName).toBe('Martin');

    const contacts = await t
      .http()
      .get(`/api/admin/missions/${missionId}/contacts`)
      .set(admin.auth)
      .expect(200);
    expect(contacts.body.client.phone).toBe(client.user.phone);
    expect(contacts.body.emergencyContacts[0].phone).toBe('+33699887766');
    await t.http().get(`/api/admin/missions/${missionId}/contacts`).set(guard.auth).expect(403);
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'mission.contacts_viewed', entityId: missionId },
      }),
    ).toBe(1);
  });

  it('termine la protection et coupe l’accès aux positions', async () => {
    const done = waitFor<MissionDto>(
      guardSocket,
      'mission:updated',
      (m) => m.status === 'COMPLETED',
    );
    await t
      .http()
      .post(`/api/missions/${missionId}/status`)
      .set(client.auth)
      .send({ status: 'COMPLETED' })
      .expect(200);
    await done;
    await t.http().get(`/api/missions/${missionId}/locations`).set(client.auth).expect(403);
    await t.http().get(`/api/missions/${missionId}/locations`).set(admin.auth).expect(200);
    const open = await t.prisma.routeDeviation.count({
      where: { missionId, status: { not: 'RESOLVED' } },
    });
    expect(open).toBe(0);
  });

  it('permet une seule notation du garde par la cliente', async () => {
    await t
      .http()
      .post(`/api/missions/${missionId}/rating`)
      .set(guard.auth)
      .send({ score: 5 })
      .expect(403);
    await t
      .http()
      .post(`/api/missions/${missionId}/rating`)
      .set(client.auth)
      .send({ score: 5, comment: 'Très rassurant' })
      .expect(201);
    await t
      .http()
      .post(`/api/missions/${missionId}/rating`)
      .set(client.auth)
      .send({ score: 1 })
      .expect(409);
    // La moyenne n'est visible que de l'équipe, jamais du garde.
    const profile = await t
      .http()
      .get(`/api/admin/guards/${guard.user.id}`)
      .set(admin.auth)
      .expect(200);
    expect(profile.body.ratingAvg).toBe(5);
    expect(profile.body.ratingCount).toBe(1);
  });

  it('signale à l’admin une mission sans garde disponible, qu’il attribue à la main', async () => {
    const unassigned = waitFor<MissionDto>(adminSocket, 'mission:unassigned');
    // Lyon : aucun garde à moins de 30 km.
    const res = await t
      .http()
      .post('/api/missions')
      .set(client.auth)
      .send({
        type: 'ONE_OFF',
        route: {
          mode: 'WALK',
          points: [
            { lat: 45.764, lng: 4.8357 },
            { lat: 45.7578, lng: 4.832 },
          ],
        },
      })
      .expect(201);
    const mission = await unassigned;
    expect(mission.id).toBe(res.body.id);

    const assigned = await t
      .http()
      .post(`/api/admin/missions/${mission.id}/assign`)
      .set(admin.auth)
      .send({ guardId: guard.user.id })
      .expect(200);
    expect(assigned.body.status).toBe('ASSIGNED');

    const cancelled = await t
      .http()
      .post(`/api/missions/${mission.id}/cancel`)
      .set(client.auth)
      .send({ reason: 'Plus besoin' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('trace chaque étape dans le journal d’audit', async () => {
    const entries = await t.prisma.auditLog.findMany({ where: { entityId: missionId } });
    const actions = new Set(entries.map((e) => e.action));
    for (const action of [
      'mission.created',
      'mission.offers_sent',
      'mission.accepted',
      'mission.guard_en_route',
      'mission.in_progress',
      'mission.route_updated',
      'mission.completed',
      'mission.locations_viewed',
    ]) {
      expect(actions).toContain(action);
    }
    const all = (await t.prisma.auditLog.findMany()).map((e) => e.action);
    expect(all).toEqual(
      expect.arrayContaining([
        'guard.approved',
        'deviation.raised',
        'deviation.client_ok',
        'sos.raised',
        'sos.resolved',
        'sos.auto_escalated',
        'mission.rated',
        'mission.call',
      ]),
    );

    const page = await t
      .http()
      .get('/api/admin/audit?action=mission.&pageSize=5')
      .set(admin.auth)
      .expect(200);
    expect(page.body.items).toHaveLength(5);
    expect(page.body.total).toBeGreaterThan(5);
  });
});
