import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AuthTokens } from '@hb/shared';
import { RequestMeta } from '../common/auth-user';
import { AppConfig } from '../config/app-config.service';
import { CryptoService } from '../common/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface AccessPayload {
  sub: string;
  role: Role;
  mfa: boolean;
  sid: string;
  typ: 'access';
}

interface MfaPayload {
  sub: string;
  typ: 'mfa';
}

/**
 * Jetons d'accès JWT courts + jetons de rafraîchissement opaques à rotation.
 * Un jeton de rafraîchissement déjà utilisé qui revient est le signe d'un vol : toute la
 * famille (la session) est alors révoquée.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async issueSession(
    user: { id: string; role: Role },
    mfa: boolean,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const familyId = this.crypto.randomToken(16);
    const refreshToken = await this.createRefreshToken(user.id, familyId, mfa, meta);
    return this.bundle(user, familyId, mfa, refreshToken);
  }

  async rotate(raw: string, meta: RequestMeta): Promise<{ tokens: AuthTokens; userId: string }> {
    const [id, secret] = raw.split('.');
    if (!id || !secret) throw new UnauthorizedException('Session invalide');

    const existing = await this.prisma.refreshToken.findUnique({
      where: { id },
      include: { user: { select: { id: true, role: true, status: true } } },
    });
    if (!existing || existing.tokenHash !== this.crypto.sha256(secret)) {
      throw new UnauthorizedException('Session invalide');
    }

    if (existing.revokedAt) {
      // Deux rafraîchissements simultanés (deux onglets, requêtes parallèles) : le second
      // arrive avec le jeton que le premier vient de remplacer. Toléré quelques secondes si
      // la session est toujours active.
      const graceMs = this.config.get('REFRESH_REUSE_GRACE_SECONDS') * 1000;
      if (existing.replacedById && Date.now() - existing.revokedAt.getTime() <= graceMs) {
        const alive = await this.prisma.refreshToken.count({
          where: { familyId: existing.familyId, revokedAt: null, expiresAt: { gt: new Date() } },
        });
        if (alive > 0 && existing.user.status === 'ACTIVE') {
          const next = await this.createRefreshToken(
            existing.userId,
            existing.familyId,
            existing.mfa,
            meta,
          );
          return {
            tokens: this.bundle(existing.user, existing.familyId, existing.mfa, next),
            userId: existing.userId,
          };
        }
      }
      // Réutilisation d'un jeton déjà consommé : on coupe toute la session.
      await this.revokeFamily(existing.familyId);
      await this.audit.log({
        actor: { id: existing.userId, role: existing.user.role },
        action: 'auth.refresh_reuse_detected',
        entityType: 'User',
        entityId: existing.userId,
        metadata: { familyId: existing.familyId },
        meta,
      });
      throw new UnauthorizedException('Session révoquée, veuillez vous reconnecter');
    }
    if (existing.expiresAt < new Date()) throw new UnauthorizedException('Session expirée');
    if (existing.user.status !== 'ACTIVE') throw new UnauthorizedException('Compte suspendu');

    const next = await this.createRefreshToken(
      existing.userId,
      existing.familyId,
      existing.mfa,
      meta,
    );
    const nextId = next.split('.')[0]!;
    // Révocation conditionnelle : si deux requêtes arrivent en même temps, une seule fait la
    // rotation ; l'autre garde le jeton qu'elle vient de créer si la rotation est toute récente.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: nextId },
    });
    if (count === 0) {
      const fresh = await this.prisma.refreshToken.findUnique({ where: { id: existing.id } });
      const graceMs = this.config.get('REFRESH_REUSE_GRACE_SECONDS') * 1000;
      const concurrent =
        fresh?.replacedById && fresh.revokedAt && Date.now() - fresh.revokedAt.getTime() <= graceMs;
      if (!concurrent) {
        await this.revokeFamily(existing.familyId);
        throw new UnauthorizedException('Session révoquée, veuillez vous reconnecter');
      }
    }
    return {
      tokens: this.bundle(existing.user, existing.familyId, existing.mfa, next),
      userId: existing.userId,
    };
  }

  async revokeByRaw(raw: string): Promise<string | null> {
    const [id] = raw.split('.');
    if (!id) return null;
    const token = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!token) return null;
    await this.revokeFamily(token.familyId);
    return token.userId;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  verifyAccess(token: string): AccessPayload {
    const payload = this.jwt.verify<AccessPayload>(token, { audience: 'access' });
    if (payload.typ !== 'access') throw new UnauthorizedException();
    return payload;
  }

  /** Jeton court qui autorise uniquement l'étape de double authentification. */
  signMfaToken(userId: string): string {
    return this.jwt.sign({ sub: userId, typ: 'mfa' } satisfies MfaPayload, {
      audience: 'mfa',
      expiresIn: 300,
    });
  }

  verifyMfaToken(token: string): string {
    try {
      const payload = this.jwt.verify<MfaPayload>(token, { audience: 'mfa' });
      if (payload.typ !== 'mfa') throw new Error();
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Étape de vérification expirée, reconnectez-vous');
    }
  }

  private bundle(
    user: { id: string; role: Role },
    familyId: string,
    mfa: boolean,
    refreshToken: string,
  ): AuthTokens {
    const ttl = this.config.get('JWT_ACCESS_TTL_SECONDS');
    const payload: AccessPayload = {
      sub: user.id,
      role: user.role,
      mfa,
      sid: familyId,
      typ: 'access',
    };
    return {
      accessToken: this.jwt.sign(payload, { audience: 'access', expiresIn: ttl }),
      refreshToken,
      expiresIn: ttl,
    };
  }

  private async createRefreshToken(
    userId: string,
    familyId: string,
    mfa: boolean,
    meta: RequestMeta,
  ): Promise<string> {
    const secret = this.crypto.randomToken(32);
    const expiresAt = new Date(Date.now() + this.config.get('REFRESH_TTL_DAYS') * 86_400_000);
    const row = await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        mfa,
        tokenHash: this.crypto.sha256(secret),
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return `${row.id}.${secret}`;
  }
}
