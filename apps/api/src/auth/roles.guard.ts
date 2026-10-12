import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { AuthUser } from '../common/auth-user';
import { ROLES_KEY } from '../common/decorators';

/**
 * Autorisation (deuxième « A ») par rôle. Les contrôles plus fins (une cliente ne voit que
 * ses missions, etc.) sont faits dans les services.
 * Une session admin n'est acceptée que si elle a passé la double authentification.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (user?.role === 'ADMIN' && !user.mfa) {
      throw new ForbiddenException('Double authentification requise pour les comptes admin');
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException("Vous n'avez pas accès à cette ressource");
    }
    return true;
  }
}
