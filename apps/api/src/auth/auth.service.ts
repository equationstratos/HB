import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { LoginInput, LoginResponse, MfaSetupResponse, RegisterInput } from '@hb/shared';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CryptoService } from '../common/crypto.service';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto } from '../users/user.mapper';
import { MfaService } from './mfa.service';
import { PhoneVerificationService } from './phone-verification.service';
import { TokenService } from './token.service';

/** Paramètres argon2id (recommandations OWASP 2024). */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService implements OnModuleInit {
  /** Hash factice pour que la durée de réponse ne révèle pas si un email existe. */
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mfa: MfaService,
    private readonly phone: PhoneVerificationService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash(this.crypto.randomToken(16), ARGON2_OPTIONS);
  }

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async register(input: RegisterInput, meta: RequestMeta): Promise<LoginResponse> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new ConflictException('Un compte existe déjà avec cet email');

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        passwordHash: await AuthService.hashPassword(input.password),
        guardProfile: input.role === 'GUARD' ? { create: {} } : undefined,
      },
    });
    await this.audit.log({
      actor: { id: user.id, role: user.role },
      action: 'auth.register',
      entityType: 'User',
      entityId: user.id,
      meta,
    });
    await this.phone.send(user.id).catch(() => undefined);
    const tokens = await this.tokens.issueSession(user, false, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { status: 'OK', user: toUserDto(user), tokens };
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      await argon2.verify(this.dummyHash, input.password).catch(() => false);
      await this.audit.log({
        actor: null,
        action: 'auth.login_failed',
        metadata: { email: input.email, reason: 'unknown_email' },
        meta,
      });
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({
        actor: user,
        action: 'auth.login_locked',
        entityType: 'User',
        entityId: user.id,
        meta,
      });
      throw new ForbiddenException(
        'Compte temporairement verrouillé après plusieurs échecs. Réessayez plus tard.',
      );
    }

    const valid = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!valid) {
      await this.registerFailure(user, meta);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (user.status !== 'ACTIVE') {
      await this.audit.log({
        actor: user,
        action: 'auth.login_suspended',
        entityType: 'User',
        entityId: user.id,
        meta,
      });
      throw new ForbiddenException('Ce compte est suspendu. Contactez le support.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    // Double authentification : obligatoire pour les admins, facultative pour les autres.
    if (user.totpEnabledAt) {
      await this.audit.log({
        actor: user,
        action: 'auth.mfa_challenge',
        entityType: 'User',
        entityId: user.id,
        meta,
      });
      return { status: 'MFA_REQUIRED', mfaToken: this.tokens.signMfaToken(user.id) };
    }
    if (user.role === 'ADMIN') {
      return { status: 'MFA_SETUP_REQUIRED', mfaToken: this.tokens.signMfaToken(user.id) };
    }
    return this.completeLogin(user, false, meta);
  }

  async mfaSetup(mfaToken: string): Promise<MfaSetupResponse> {
    const user = await this.userFromMfaToken(mfaToken);
    if (user.totpEnabledAt)
      throw new BadRequestException('La double authentification est déjà active');
    return this.startEnrollment(user);
  }

  async mfaEnable(mfaToken: string, code: string, meta: RequestMeta): Promise<LoginResponse> {
    const user = await this.userFromMfaToken(mfaToken);
    await this.confirmEnrollment(user, code, meta);
    return this.completeLogin(user, true, meta);
  }

  async mfaVerify(mfaToken: string, code: string, meta: RequestMeta): Promise<LoginResponse> {
    const user = await this.userFromMfaToken(mfaToken);
    if (!user.totpEnabledAt || !user.totpSecret)
      throw new BadRequestException('Double authentification non configurée');
    const step = this.mfa.verify(code, this.crypto.decrypt(user.totpSecret), user.totpLastStep);
    if (step === null) {
      await this.audit.log({
        actor: user,
        action: 'auth.mfa_failed',
        entityType: 'User',
        entityId: user.id,
        meta,
      });
      await this.registerFailure(user, meta);
      throw new UnauthorizedException('Code incorrect');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
    return this.completeLogin(user, true, meta);
  }

  /** Activation facultative de la 2FA par une cliente ou un garde déjà connecté. */
  async selfMfaSetup(auth: AuthUser): Promise<MfaSetupResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
    if (user.totpEnabledAt)
      throw new BadRequestException('La double authentification est déjà active');
    return this.startEnrollment(user);
  }

  async selfMfaEnable(auth: AuthUser, code: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
    await this.confirmEnrollment(user, code, meta);
  }

  async refresh(raw: string | undefined, meta: RequestMeta) {
    if (!raw) throw new UnauthorizedException('Session absente');
    const { tokens, userId } = await this.tokens.rotate(raw, meta);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { user: toUserDto(user), tokens };
  }

  async logout(
    raw: string | undefined,
    auth: AuthUser | undefined,
    meta: RequestMeta,
  ): Promise<void> {
    let userId = auth?.id ?? null;
    if (raw) userId = (await this.tokens.revokeByRaw(raw)) ?? userId;
    if (auth?.sessionId) await this.tokens.revokeFamily(auth.sessionId);
    if (!userId) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (user)
      await this.audit.log({
        actor: user,
        action: 'auth.logout',
        entityType: 'User',
        entityId: userId,
        meta,
      });
  }

  private async startEnrollment(user: User): Promise<MfaSetupResponse> {
    const secret = this.mfa.generateSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: this.crypto.encrypt(secret), totpEnabledAt: null, totpLastStep: null },
    });
    return { secret, ...(await this.mfa.enrollment(user.email, secret)) };
  }

  private async confirmEnrollment(user: User, code: string, meta: RequestMeta): Promise<void> {
    if (user.totpEnabledAt)
      throw new BadRequestException('La double authentification est déjà active');
    if (!user.totpSecret)
      throw new BadRequestException("Commencez par générer le QR code d'activation");
    const step = this.mfa.verify(code, this.crypto.decrypt(user.totpSecret), null);
    if (step === null) throw new UnauthorizedException('Code incorrect');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpEnabledAt: new Date(), totpLastStep: step },
    });
    await this.audit.log({
      actor: user,
      action: 'auth.mfa_enabled',
      entityType: 'User',
      entityId: user.id,
      meta,
    });
  }

  private async completeLogin(user: User, mfa: boolean, meta: RequestMeta): Promise<LoginResponse> {
    const tokens = await this.tokens.issueSession(user, mfa, meta);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.log({
      actor: user,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      metadata: { mfa },
      meta,
    });
    return { status: 'OK', user: toUserDto(updated), tokens };
  }

  private async userFromMfaToken(mfaToken: string): Promise<User> {
    const userId = this.tokens.verifyMfaToken(mfaToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Compte indisponible');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        'Compte temporairement verrouillé après plusieurs échecs. Réessayez plus tard.',
      );
    }
    return user;
  }

  private async registerFailure(user: User, meta: RequestMeta): Promise<void> {
    const max = this.config.get('LOGIN_MAX_FAILURES');
    const failures = user.failedLoginCount + 1;
    const lock = failures >= max;
    await this.prisma.user.update({
      where: { id: user.id },
      data: lock
        ? {
            failedLoginCount: 0,
            lockedUntil: new Date(Date.now() + this.config.get('LOGIN_LOCK_MINUTES') * 60_000),
          }
        : { failedLoginCount: failures },
    });
    await this.audit.log({
      actor: user,
      action: lock ? 'auth.account_locked' : 'auth.login_failed',
      entityType: 'User',
      entityId: user.id,
      metadata: { failures },
      meta,
    });
  }
}
