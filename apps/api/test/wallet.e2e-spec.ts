import {
  AdminPayoutDetailDto,
  AdminPayoutDto,
  GuardWalletDto,
  MissionDto,
  OfferDto,
  PayoutDto,
} from '@hb/shared';
import { Socket } from 'socket.io-client';
import { TokenService } from '../src/auth/token.service';
import { CryptoService } from '../src/common/crypto.service';
import { WalletService } from '../src/wallet/wallet.service';
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
  sleep,
  verifyPhone,
  waitFor,
} from './helpers';

const IBAN = 'FR76 3000 6000 0112 3456 7890 189';
const IBAN_RAW = IBAN.replace(/ /g, '');
const PARIS = { lat: 48.8575, lng: 2.35 };

describe('Gains des gardes et virements', () => {
  let t: TestApp;
  let admin: Session;
  let client: Session;
  let guard: Session;
  let otherGuard: Session;
  let adminSocket: Socket;
  let guardSocket: Socket;
  let firstMissionId: string;
  let firstPayoutId: string;

  /** Parcours réel : réservation, offre acceptée, en route, suivi commencé. */
  async function startMission(): Promise<string> {
    const created = await t
      .http()
      .post('/api/missions')
      .set(client.auth)
      .send({ type: 'ONE_OFF', route: { mode: 'WALK', points: ROUTE_POINTS } })
      .expect(201);
    const missionId = (created.body as MissionDto).id;
    let offer: OfferDto | undefined;
    for (let i = 0; i < 80 && !offer; i++) {
      const offers = await t.http().get('/api/offers').set(guard.auth).expect(200);
      offer = (offers.body as OfferDto[]).find((o) => o.missionId === missionId);
      if (!offer) await sleep(100);
    }
    if (!offer) throw new Error('Offre non reçue par le garde');
    await t.http().post(`/api/offers/${offer.id}/accept`).set(guard.auth).expect(200);
    for (const status of ['GUARD_EN_ROUTE', 'IN_PROGRESS']) {
      await t
        .http()
        .post(`/api/missions/${missionId}/status`)
        .set(guard.auth)
        .send({ status })
        .expect(200);
    }
    return missionId;
  }

  async function complete(missionId: string, by: Session = client): Promise<void> {
    await t
      .http()
      .post(`/api/missions/${missionId}/status`)
      .set(by.auth)
      .send({ status: 'COMPLETED' })
      .expect(200);
  }

  const wallet = async (s: Session = guard) =>
    (await t.http().get('/api/guards/me/wallet').set(s.auth).expect(200)).body as GuardWalletDto;

  const requestPayout = (s: Session = guard) =>
    t.http().post('/api/guards/me/payouts').set(s.auth).send({});

  beforeAll(async () => {
    t = await createTestApp();
    admin = await loginAdmin(t, await createAdmin(t));
    client = await register(t, 'CLIENT', 'Camille');
    await verifyPhone(t, client);
    await consent(t, client);
    guard = await approvedGuard(t, admin, 'Karim', { lat: 48.8566, lng: 2.3522 });
    otherGuard = await approvedGuard(t, admin, 'Paul', { lat: 48.8566, lng: 2.3522 });
    await t
      .http()
      .post('/api/guards/me/presence')
      .set(guard.auth)
      .send({ available: true, ...PARIS })
      .expect(200);
    await t
      .http()
      .put('/api/me/push-token')
      .set(guard.auth)
      .send({ token: 'ExponentPushToken[garde]' })
      .expect(204);
    adminSocket = await connect(t, admin);
    guardSocket = await connect(t, guard);
  });

  afterAll(async () => {
    await t.close();
  });

  describe('gains', () => {
    it('crédite le garde à la fin de la mission, avec 30 minutes facturées au minimum', async () => {
      firstMissionId = await startMission();
      await complete(firstMissionId);

      const earnings = await t.prisma.guardEarning.findMany({
        where: { missionId: firstMissionId },
      });
      expect(earnings).toHaveLength(1);
      expect(earnings[0]).toMatchObject({
        guardId: guard.user.id,
        billedMinutes: 30,
        hourlyRateCents: 2000,
        amountCents: 1000,
      });
      const w = await wallet();
      expect(w.availableCents).toBe(1000);
      expect(w.totalEarnedCents).toBe(1000);
      expect(
        await t.prisma.auditLog.count({
          where: { action: 'guard.earning_credited', entityId: firstMissionId },
        }),
      ).toBe(1);
    });

    it('compte chaque minute commencée et arrondit au centime', async () => {
      const missionId = await startMission();
      // Suivi commencé il y a 46 min 30 s : 47 minutes facturées, 2000 × 47 / 60 = 1566,67.
      await t.prisma.mission.update({
        where: { id: missionId },
        data: { startedAt: new Date(Date.now() - 46.5 * 60_000) },
      });
      await complete(missionId, guard);
      const earning = await t.prisma.guardEarning.findUniqueOrThrow({ where: { missionId } });
      expect(earning.billedMinutes).toBe(47);
      expect(earning.amountCents).toBe(1567);
      expect((await wallet()).availableCents).toBe(2567);
    });

    it('ne crédite jamais deux fois la même mission', async () => {
      await t
        .http()
        .post(`/api/missions/${firstMissionId}/status`)
        .set(client.auth)
        .send({ status: 'COMPLETED' })
        .expect(409);
      const mission = await t.prisma.mission.findUniqueOrThrow({ where: { id: firstMissionId } });
      const again = await t.prisma.$transaction((tx) =>
        t.app.get(WalletService).creditMission(tx, { ...mission, completedAt: new Date() }),
      );
      expect(again).toBeNull();
      expect(await t.prisma.guardEarning.count({ where: { missionId: firstMissionId } })).toBe(1);
      expect((await wallet()).totalEarnedCents).toBe(2567);
    });

    it('détaille les gains sans le nom ni la note de la cliente', async () => {
      await t
        .http()
        .post(`/api/missions/${firstMissionId}/rating`)
        .set(client.auth)
        .send({ score: 2, comment: 'Trop visible' })
        .expect(201);
      const w = await wallet();
      expect(w.earnings).toHaveLength(2);
      const first = w.earnings.find((e) => e.missionId === firstMissionId)!;
      expect(first).toEqual({
        id: expect.any(String),
        missionId: firstMissionId,
        startedAt: expect.any(String),
        endedAt: expect.any(String),
        durationMinutes: expect.any(Number),
        billedMinutes: 30,
        hourlyRateCents: 2000,
        amountCents: 1000,
      });
      expect(w).toMatchObject({
        payoutMinCents: 1000,
        hourlyRateCents: 2000,
        minBilledMinutes: 30,
      });
      const json = JSON.stringify(w);
      for (const forbidden of ['Camille', client.user.id, 'Trop visible', 'score', 'rating']) {
        expect(json).not.toContain(forbidden);
      }
    });
  });

  describe('compte bancaire', () => {
    it('refuse un virement tant qu’aucun compte n’est enregistré', async () => {
      const res = await requestPayout().expect(400);
      expect(res.body.message).toContain('compte bancaire');
    });

    it('refuse un IBAN invalide', async () => {
      for (const iban of ['FR76 3000 6000 0112 3456 7890 188', 'FR76 3000', 'pas un iban']) {
        await t
          .http()
          .put('/api/guards/me/bank-account')
          .set(guard.auth)
          .send({ holderName: 'Karim Benali', iban })
          .expect(400);
      }
      await t
        .http()
        .put('/api/guards/me/bank-account')
        .set(guard.auth)
        .send({ holderName: '', iban: IBAN })
        .expect(400);
    });

    it('chiffre l’IBAN et ne le renvoie que masqué', async () => {
      const res = await t
        .http()
        .put('/api/guards/me/bank-account')
        .set(guard.auth)
        .send({ holderName: 'Karim Benali', iban: IBAN.toLowerCase() })
        .expect(200);
      expect(res.body).toEqual({
        holderName: 'Karim Benali',
        ibanMasked: 'FR76 •••• •••• 0189',
        updatedAt: expect.any(String),
      });

      const row = await t.prisma.guardBankAccount.findUniqueOrThrow({
        where: { guardId: guard.user.id },
      });
      expect(row.ibanEncrypted).not.toContain(IBAN_RAW);
      expect(row.ibanEncrypted).not.toContain('30006000');
      expect(t.app.get(CryptoService).decrypt(row.ibanEncrypted)).toBe(IBAN_RAW);
      expect(row.ibanLast4).toBe('0189');

      const w = await wallet();
      expect(w.bankAccount?.ibanMasked).toBe('FR76 •••• •••• 0189');
      expect(JSON.stringify(w)).not.toContain('30006000');

      const audit = await t.prisma.auditLog.findFirstOrThrow({
        where: { action: 'guard.bank_account_updated', actorId: guard.user.id },
      });
      expect(audit.metadata).toEqual({ country: 'FR', replaced: false });
      expect(JSON.stringify(audit)).not.toContain('0189');
    });
  });

  describe('demandes de virement', () => {
    it('refuse un virement sous le minimum', async () => {
      await t
        .http()
        .put('/api/guards/me/bank-account')
        .set(otherGuard.auth)
        .send({ holderName: 'Paul Martin', iban: 'DE89 3704 0044 0532 0130 00' })
        .expect(200);
      const res = await requestPayout(otherGuard).expect(400);
      expect(res.body.message).toContain('10 €');
      expect(await t.prisma.guardPayout.count()).toBe(0);
    });

    it('vire tout le solde : la demande remet le solde à zéro et prévient l’équipe', async () => {
      const atAdmin = waitFor<AdminPayoutDto>(adminSocket, 'payout:requested');
      const res = await requestPayout().expect(201);
      const payout = res.body as PayoutDto;
      firstPayoutId = payout.id;
      expect(payout).toMatchObject({
        amountCents: 2567,
        status: 'REQUESTED',
        holderName: 'Karim Benali',
        ibanMasked: 'FR76 •••• •••• 0189',
        processedAt: null,
      });
      const notified = await atAdmin;
      expect(notified.id).toBe(payout.id);
      expect(notified.guard.id).toBe(guard.user.id);

      const w = await wallet();
      expect(w.availableCents).toBe(0);
      expect(w.totalEarnedCents).toBe(2567);
      expect(w.pendingPayout?.id).toBe(payout.id);
      expect(w.payouts.map((p) => p.status)).toEqual(['REQUESTED']);

      const row = await t.prisma.guardPayout.findUniqueOrThrow({ where: { id: payout.id } });
      expect(t.app.get(CryptoService).decrypt(row.ibanEncrypted)).toBe(IBAN_RAW);
      expect(
        await t.prisma.auditLog.count({
          where: { action: 'guard.payout_requested', entityId: payout.id, actorId: guard.user.id },
        }),
      ).toBe(1);
    });

    it('refuse une seconde demande tant que la première est en attente', async () => {
      const res = await requestPayout().expect(409);
      expect(res.body.message).toContain('déjà en cours');
    });

    it('n’accepte qu’une demande en attente par garde, même hors de l’API', async () => {
      const first = await t.prisma.guardPayout.findUniqueOrThrow({ where: { id: firstPayoutId } });
      const { id: _id, ...copy } = first;
      await expect(t.prisma.guardPayout.create({ data: copy })).rejects.toMatchObject({
        code: 'P2002',
      });
    });
  });

  describe('traitement par l’équipe', () => {
    it('liste les demandes et montre l’IBAN complet, consultation tracée', async () => {
      const list = await t
        .http()
        .get('/api/admin/payouts?status=REQUESTED')
        .set(admin.auth)
        .expect(200);
      expect(list.body.total).toBe(1);
      const item = list.body.items[0] as AdminPayoutDto;
      expect(item.guard).toEqual({
        id: guard.user.id,
        firstName: 'Karim',
        lastName: 'Martin',
        email: guard.user.email,
      });
      expect(JSON.stringify(list.body)).not.toContain('30006000');

      const detail = await t
        .http()
        .get(`/api/admin/payouts/${firstPayoutId}`)
        .set(admin.auth)
        .expect(200);
      expect((detail.body as AdminPayoutDetailDto).iban).toBe(IBAN);
      // L'équipe voit les gains couverts par le virement, et le changement récent de compte.
      const body = detail.body as AdminPayoutDetailDto;
      expect(body.earnings.length).toBeGreaterThan(0);
      expect(body.earnings.reduce((sum, e) => sum + e.amountCents, 0)).toBe(body.amountCents);
      expect(body.bankAccountRecentlyChanged).toBe(true);
      expect(body.bankAccountChangedAt).not.toBeNull();
      expect(
        await t.prisma.auditLog.count({
          where: { action: 'admin.payout_viewed', entityId: firstPayoutId, actorId: admin.user.id },
        }),
      ).toBe(1);
      await t.http().get('/api/admin/payouts/inconnu').set(admin.auth).expect(404);
    });

    it('marque un virement comme payé, une seule fois', async () => {
      const atGuard = waitFor<PayoutDto>(
        guardSocket,
        'payout:updated',
        (p) => p.id === firstPayoutId,
      );
      const res = await t
        .http()
        .post(`/api/admin/payouts/${firstPayoutId}/paid`)
        .set(admin.auth)
        .send({ bankReference: 'VIR-2026-0001' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'PAID',
        bankReference: 'VIR-2026-0001',
        processedAt: expect.any(String),
      });
      // Le garde est prévenu en temps réel, sans les coordonnées de l'équipe.
      const pushed = await atGuard;
      expect(pushed).toMatchObject({ status: 'PAID', ibanMasked: 'FR76 •••• •••• 0189' });
      expect(pushed).not.toHaveProperty('guard');
      await t
        .http()
        .post(`/api/admin/payouts/${firstPayoutId}/paid`)
        .set(admin.auth)
        .send({})
        .expect(409);
      await t
        .http()
        .post(`/api/admin/payouts/${firstPayoutId}/reject`)
        .set(admin.auth)
        .send({ reason: 'Trop tard' })
        .expect(409);
      expect(t.push.sent).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ to: 'ExponentPushToken[garde]', title: 'Virement effectué' }),
        ]),
      );
      const w = await wallet();
      expect(w.availableCents).toBe(0);
      expect(w.pendingPayout).toBeNull();
      expect(
        await t.prisma.auditLog.count({
          where: { action: 'payout.paid', entityId: firstPayoutId },
        }),
      ).toBe(1);
    });

    it('sérialise deux demandes simultanées : une seule aboutit', async () => {
      await complete(await startMission());
      expect((await wallet()).availableCents).toBe(1000);

      const results = await Promise.all([requestPayout(), requestPayout(), requestPayout()]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      expect(
        await t.prisma.guardPayout.count({
          where: { guardId: guard.user.id, status: 'REQUESTED' },
        }),
      ).toBe(1);
      expect((await wallet()).availableCents).toBe(0);
    });

    it('refuse un virement avec un motif : le montant revient dans le solde', async () => {
      const pending = (await wallet()).pendingPayout!;
      await t
        .http()
        .post(`/api/admin/payouts/${pending.id}/reject`)
        .set(admin.auth)
        .send({})
        .expect(400);
      const atGuard = waitFor<PayoutDto>(guardSocket, 'payout:updated', (p) => p.id === pending.id);
      const res = await t
        .http()
        .post(`/api/admin/payouts/${pending.id}/reject`)
        .set(admin.auth)
        .send({ reason: 'IBAN au nom d’un tiers' })
        .expect(200);
      expect(await atGuard).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'IBAN au nom d’un tiers',
      });
      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'IBAN au nom d’un tiers',
      });

      const w = await wallet();
      expect(w.availableCents).toBe(1000);
      expect(w.pendingPayout).toBeNull();
      expect(w.payouts.map((p) => p.status)).toEqual(['REJECTED', 'PAID']);
      expect(t.push.sent).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ to: 'ExponentPushToken[garde]', title: 'Virement refusé' }),
        ]),
      );
      expect(
        await t.prisma.auditLog.count({
          where: { action: 'payout.rejected', entityId: pending.id },
        }),
      ).toBe(1);

      // Le solde rendu peut de nouveau être viré.
      await requestPayout().expect(201);
    });
  });

  describe('droits d’accès', () => {
    it('réserve la cagnotte au garde concerné', async () => {
      await t.http().get('/api/guards/me/wallet').set(client.auth).expect(403);
      await t
        .http()
        .put('/api/guards/me/bank-account')
        .set(client.auth)
        .send({ holderName: 'Camille Martin', iban: IBAN })
        .expect(403);
      await requestPayout(client).expect(403);
      await t.http().get('/api/guards/me/wallet').set(admin.auth).expect(403);
      await requestPayout(admin).expect(403);
      await t.http().get('/api/guards/me/wallet').expect(401);

      // Un autre garde ne voit que sa propre cagnotte.
      const other = await wallet(otherGuard);
      expect(other.availableCents).toBe(0);
      expect(other.earnings).toEqual([]);
      expect(other.payouts).toEqual([]);
      expect(other.bankAccount?.holderName).toBe('Paul Martin');
    });

    it('réserve le traitement des virements aux admins ayant passé la 2FA', async () => {
      for (const s of [client, guard]) {
        await t.http().get('/api/admin/payouts').set(s.auth).expect(403);
        await t.http().get(`/api/admin/payouts/${firstPayoutId}`).set(s.auth).expect(403);
        await t
          .http()
          .post(`/api/admin/payouts/${firstPayoutId}/paid`)
          .set(s.auth)
          .send({})
          .expect(403);
        await t
          .http()
          .post(`/api/admin/payouts/${firstPayoutId}/reject`)
          .set(s.auth)
          .send({ reason: 'Essai interdit' })
          .expect(403);
      }

      await createAdmin(t, 'Nadia');
      const noMfa = await t.prisma.user.findFirstOrThrow({
        where: { firstName: 'Nadia', role: 'ADMIN' },
      });
      const tokens = await t.app
        .get(TokenService)
        .issueSession(noMfa, false, { ip: null, userAgent: null });
      await t
        .http()
        .get(`/api/admin/payouts/${firstPayoutId}`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(403);
      expect(
        await t.prisma.auditLog.count({
          where: { action: 'admin.payout_viewed', actorId: noMfa.id },
        }),
      ).toBe(0);
    });

    it('pagine la liste de l’équipe, des plus récentes aux plus anciennes', async () => {
      const page = await t
        .http()
        .get('/api/admin/payouts?pageSize=2&page=1')
        .set(admin.auth)
        .expect(200);
      expect(page.body.total).toBe(3);
      expect(page.body.items).toHaveLength(2);
      expect(page.body.items[0].status).toBe('REQUESTED');
      const paid = await t.http().get('/api/admin/payouts?status=PAID').set(admin.auth).expect(200);
      expect(paid.body.items.map((p: AdminPayoutDto) => p.id)).toEqual([firstPayoutId]);
      await t.http().get('/api/admin/payouts?status=INCONNU').set(admin.auth).expect(400);
    });
  });
});
