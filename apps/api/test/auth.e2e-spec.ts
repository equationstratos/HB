import { TokenService } from '../src/auth/token.service';
import { MfaService } from '../src/auth/mfa.service';
import { CryptoService } from '../src/common/crypto.service';
import { AppConfig } from '../src/config/app-config.service';
import {
  PASSWORD,
  TestApp,
  consent,
  createAdmin,
  createTestApp,
  loginAdmin,
  register,
  toSession,
  uniquePhone,
  verifyPhone,
} from './helpers';

describe('AAA — authentification, autorisation, traçabilité', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('inscription et connexion', () => {
    it('inscrit une cliente et donne accès à son profil', async () => {
      const client = await register(t, 'CLIENT', 'Camille');
      expect(client.user.role).toBe('CLIENT');
      expect(client.user.phoneVerified).toBe(false);
      const me = await t.http().get('/api/me').set(client.auth).expect(200);
      expect(me.body.email).toBe(client.user.email);
      // Le mot de passe n'est jamais renvoyé.
      expect(JSON.stringify(me.body)).not.toContain('passwordHash');
    });

    it('refuse un email déjà utilisé, un mot de passe faible et l’inscription d’un admin', async () => {
      const client = await register(t, 'CLIENT', 'Lea');
      const base = {
        password: PASSWORD,
        firstName: 'X',
        lastName: 'Y',
        phone: uniquePhone(),
        role: 'CLIENT',
      };
      await t
        .http()
        .post('/api/auth/register')
        .send({ ...base, email: client.user.email })
        .expect(409);
      await t
        .http()
        .post('/api/auth/register')
        .send({ ...base, email: 'faible@exemple.fr', password: 'court' })
        .expect(400);
      await t
        .http()
        .post('/api/auth/register')
        .send({ ...base, email: 'pirate@exemple.fr', role: 'ADMIN' })
        .expect(400);
    });

    it('serveur de test sans vrais SMS : renvoie le code pour que l’appli l’affiche', async () => {
      const signUp = (firstName: string, phone: string) =>
        t
          .http()
          .post('/api/auth/register')
          .send({
            email: `${firstName.toLowerCase()}.${Date.now()}@exemple.fr`,
            password: PASSWORD,
            firstName,
            lastName: 'Martin',
            phone,
            role: 'CLIENT',
          })
          .expect(201);

      // SMS réellement envoyés : le code n'apparaît jamais dans la réponse.
      const real = await signUp('Clara', uniquePhone());
      expect(real.body.phoneCode).toEqual({ expiresInSeconds: 600 });

      t.sms.simulated = true;
      try {
        // SMS simulés mais vrais appels : le numéro pourrait être appelé sans avoir été prouvé.
        t.telephony.simulated = false;
        const realCalls = await signUp('Lina', uniquePhone());
        expect(realCalls.body.phoneCode).toEqual({ expiresInSeconds: 600 });
        t.telephony.simulated = true;

        const phone = uniquePhone();
        const res = await signUp('Elsa', phone);
        const session = toSession(res.body);
        const testCode = res.body.phoneCode.testCode as string;
        expect(testCode).toMatch(/^\d{6}$/);
        expect(t.sms.lastTo(phone)).toContain(testCode);

        // « Renvoyer le code » (après le délai d'une minute) renvoie aussi le nouveau code.
        await t.prisma.phoneVerification.updateMany({
          where: { userId: session.user.id },
          data: { createdAt: new Date(Date.now() - 120_000) },
        });
        const resent = await t
          .http()
          .post('/api/auth/phone/send-code')
          .set(session.auth)
          .expect(200);
        expect(resent.body.testCode).toMatch(/^\d{6}$/);
        expect(t.sms.lastTo(phone)).toContain(resent.body.testCode);

        await t
          .http()
          .post('/api/auth/phone/verify')
          .set(session.auth)
          .send({ code: resent.body.testCode })
          .expect(204);
        const me = await t.http().get('/api/me').set(session.auth).expect(200);
        expect(me.body.phoneVerified).toBe(true);
      } finally {
        t.sms.simulated = false;
        t.telephony.simulated = true;
      }
    });

    it('exige un jeton pour les routes protégées', async () => {
      await t.http().get('/api/me').expect(401);
      await t.http().get('/api/me').set('Authorization', 'Bearer faux.jeton.jwt').expect(401);
    });

    it('verrouille le compte après 5 échecs et le journalise', async () => {
      const client = await register(t, 'CLIENT', 'Nina');
      for (let i = 0; i < 5; i++) {
        await t
          .http()
          .post('/api/auth/login')
          .send({ email: client.user.email, password: 'mauvais-mdp-1' })
          .expect(401);
      }
      // Même le bon mot de passe est refusé pendant le verrouillage.
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: client.user.email, password: PASSWORD })
        .expect(403);
      const locked = await t.prisma.auditLog.findFirst({
        where: { action: 'auth.account_locked', entityId: client.user.id },
      });
      expect(locked).not.toBeNull();
    });
  });

  describe('jetons de rafraîchissement', () => {
    it('fait tourner le jeton et révoque toute la session si un ancien jeton est réutilisé', async () => {
      const client = await register(t, 'CLIENT', 'Ines');
      const first = await t
        .http()
        .post('/api/auth/refresh')
        .send({ refreshToken: client.refreshToken })
        .expect(200);
      const rotated = first.body.tokens.refreshToken as string;
      expect(rotated).not.toBe(client.refreshToken);

      // Rejeu de l'ancien jeton bien après sa rotation (vol supposé) : refus et révocation.
      const oldId = client.refreshToken.split('.')[0]!;
      await t.prisma.refreshToken.update({
        where: { id: oldId },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });
      await t
        .http()
        .post('/api/auth/refresh')
        .send({ refreshToken: client.refreshToken })
        .expect(401);
      await t.http().post('/api/auth/refresh').send({ refreshToken: rotated }).expect(401);

      const reuse = await t.prisma.auditLog.findFirst({
        where: { action: 'auth.refresh_reuse_detected', entityId: client.user.id },
      });
      expect(reuse).not.toBeNull();
    });

    it('tolère deux rafraîchissements simultanés du même jeton (plusieurs onglets)', async () => {
      const client = await register(t, 'CLIENT', 'Alix');
      const [a, b] = await Promise.all([
        t.http().post('/api/auth/refresh').send({ refreshToken: client.refreshToken }),
        t.http().post('/api/auth/refresh').send({ refreshToken: client.refreshToken }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      // La session reste valide : les deux nouveaux jetons fonctionnent.
      const next = [a.body.tokens.refreshToken, b.body.tokens.refreshToken] as string[];
      for (const refreshToken of next) {
        await t.http().post('/api/auth/refresh').send({ refreshToken }).expect(200);
      }
    });

    it('place le jeton de l’admin web dans un cookie httpOnly', async () => {
      const client = await register(t, 'CLIENT', 'Zoe');
      const res = await t
        .http()
        .post('/api/auth/login')
        .set('X-Client', 'web')
        .send({ email: client.user.email, password: PASSWORD })
        .expect(200);
      expect(res.body.tokens.refreshToken).toBe('');
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain('hb_rt=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
    });
  });

  describe('vérification du téléphone', () => {
    it('refuse un mauvais code puis valide le bon', async () => {
      const client = await register(t, 'CLIENT', 'Maya');
      await t
        .http()
        .post('/api/auth/phone/verify')
        .set(client.auth)
        .send({ code: '000000' })
        .expect(400);
      await verifyPhone(t, client);
      const me = await t.http().get('/api/me').set(client.auth).expect(200);
      expect(me.body.phoneVerified).toBe(true);
    });
  });

  describe('double authentification des admins', () => {
    it('signale une clé de chiffrement changée au lieu d’une erreur 500', async () => {
      // Secret 2FA chiffré avec une autre clé : .env recréé sur une base existante.
      const admin = await createAdmin(t, 'Claire');
      const other = new CryptoService({
        get: () => Buffer.alloc(32, 9).toString('base64'),
      } as unknown as AppConfig);
      await t.prisma.user.update({
        where: { email: admin.email },
        data: { totpSecret: other.encrypt(admin.secret) },
      });
      const step1 = await t
        .http()
        .post('/api/auth/login')
        .send({ email: admin.email, password: PASSWORD })
        .expect(200);
      const res = await t
        .http()
        .post('/api/auth/mfa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: MfaService.generate(admin.secret) })
        .expect(503);
      expect(res.body.message).toMatch(/Clé de chiffrement du serveur changée/);
      expect(t.app.get(CryptoService).canDecrypt(other.encrypt('x'))).toBe(false);
    });

    it('ne délivre aucun jeton admin sans code TOTP, et refuse le rejeu d’un code', async () => {
      const admin = await createAdmin(t, 'Sophie');
      const step1 = await t
        .http()
        .post('/api/auth/login')
        .send({ email: admin.email, password: PASSWORD })
        .expect(200);
      expect(step1.body).toEqual({ status: 'MFA_REQUIRED', mfaToken: expect.any(String) });
      expect(step1.body.tokens).toBeUndefined();

      await t
        .http()
        .post('/api/auth/mfa/verify')
        .send({ mfaToken: step1.body.mfaToken, code: '123456' })
        .expect(401);

      const code = MfaService.generate(admin.secret);
      const ok = await t
        .http()
        .post('/api/auth/mfa/verify')
        .send({ mfaToken: step1.body.mfaToken, code })
        .expect(200);
      const session = toSession(ok.body);
      await t.http().get('/api/admin/overview').set(session.auth).expect(200);

      // Même code une seconde fois : rejeu refusé.
      const again = await t
        .http()
        .post('/api/auth/login')
        .send({ email: admin.email, password: PASSWORD })
        .expect(200);
      await t
        .http()
        .post('/api/auth/mfa/verify')
        .send({ mfaToken: again.body.mfaToken, code })
        .expect(401);
    });

    it('impose la configuration de la 2FA à un admin qui ne l’a pas encore', async () => {
      const admin = await createAdmin(t, 'Julie');
      await t.prisma.user.update({
        where: { email: admin.email },
        data: { totpEnabledAt: null, totpSecret: null },
      });
      const login = await t
        .http()
        .post('/api/auth/login')
        .send({ email: admin.email, password: PASSWORD })
        .expect(200);
      expect(login.body.status).toBe('MFA_SETUP_REQUIRED');
      const setup = await t
        .http()
        .post('/api/auth/mfa/setup')
        .send({ mfaToken: login.body.mfaToken })
        .expect(200);
      expect(setup.body.otpauthUrl).toContain('otpauth://totp/');
      expect(setup.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      const enabled = await t
        .http()
        .post('/api/auth/mfa/enable')
        .send({ mfaToken: login.body.mfaToken, code: MfaService.generate(setup.body.secret) })
        .expect(200);
      expect(enabled.body.user.mfaEnabled).toBe(true);
    });

    it('refuse une session admin qui n’a pas passé la 2FA', async () => {
      await createAdmin(t, 'Nadia');
      const adminUser = await t.prisma.user.findFirstOrThrow({
        where: { firstName: 'Nadia', role: 'ADMIN' },
      });
      const tokens = await t.app
        .get(TokenService)
        .issueSession(adminUser, false, { ip: null, userAgent: null });
      await t
        .http()
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(403);
    });
  });

  describe('autorisation par rôle', () => {
    it('interdit l’administration aux clientes et aux gardes', async () => {
      const client = await register(t, 'CLIENT', 'Emma');
      const guard = await register(t, 'GUARD', 'Hugo');
      await t.http().get('/api/admin/overview').set(client.auth).expect(403);
      await t.http().get('/api/admin/overview').set(guard.auth).expect(403);
      await t.http().get('/api/guards/me').set(client.auth).expect(403);
      await t.http().post('/api/missions').set(guard.auth).send({}).expect(403);
    });

    it('coupe immédiatement l’accès d’un compte suspendu', async () => {
      const admin = await loginAdmin(t, await createAdmin(t, 'Claire'));
      const client = await register(t, 'CLIENT', 'Lou');
      await t.http().get('/api/me').set(client.auth).expect(200);
      await t
        .http()
        .post(`/api/admin/users/${client.user.id}/suspend`)
        .set(admin.auth)
        .send({ reason: 'Comportement abusif' })
        .expect(204);
      await t.http().get('/api/me').set(client.auth).expect(403);
      await t
        .http()
        .post('/api/auth/refresh')
        .send({ refreshToken: client.refreshToken })
        .expect(401);
    });
  });

  describe('journal d’audit', () => {
    it('est en ajout seul : modification et suppression sont refusées par la base', async () => {
      const client = await register(t, 'CLIENT', 'Rose');
      await consent(t, client);
      const entry = await t.prisma.auditLog.findFirstOrThrow({
        where: { actorId: client.user.id },
      });
      await expect(
        t.prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'falsifié' } }),
      ).rejects.toThrow(/ajout seul/);
      await expect(t.prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(
        /ajout seul/,
      );
    });

    it('trace l’inscription, la connexion et le consentement', async () => {
      const client = await register(t, 'CLIENT', 'Jade');
      await consent(t, client);
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: client.user.email, password: PASSWORD })
        .expect(200);
      const actions = (
        await t.prisma.auditLog.findMany({ where: { actorId: client.user.id } })
      ).map((a) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining(['auth.register', 'user.location_consent', 'auth.login']),
      );
    });
  });
});
