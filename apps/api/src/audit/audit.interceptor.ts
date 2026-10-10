import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../common/auth-user';
import { requestMeta } from '../common/request-meta';
import { AUDIT_KEY, AuditOptions } from './audit.decorator';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditOptions | undefined>(AUDIT_KEY, context.getHandler());
    if (!options || context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    return next.handle().pipe(
      tap((result) => {
        const param = options.idParam
          ? (req.params as Record<string, string | undefined>)[options.idParam]
          : undefined;
        const fromParams = typeof param === 'string' ? param : undefined;
        const fromResult =
          result && typeof result === 'object' && 'id' in result
            ? String((result as { id: unknown }).id)
            : null;
        void this.audit.log({
          actor: req.user ?? null,
          action: options.action,
          entityType: options.entityType,
          entityId: fromParams ?? fromResult,
          meta: requestMeta(req),
        });
      }),
    );
  }
}
