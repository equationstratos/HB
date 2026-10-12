import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthUser } from '../common/auth-user';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

/**
 * Authentification (premier « A ») : toute route exige un jeton d'accès valide, sauf
 * celles marquées @Public(). Le statut du compte est relu à chaque requête pour qu'une
 * suspension prenne effet immédiatement.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Authentification requise');
    }

    let payload;
    try {
      payload = this.tokens.verifyAccess(token);
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException('Session expirée');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true },
    });
    if (!user) throw new UnauthorizedException('Compte introuvable');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Ce compte est suspendu');

    req.user = { id: user.id, role: user.role, mfa: payload.mfa, sessionId: payload.sid };
    return true;
  }
}
