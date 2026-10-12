import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestMeta } from './auth-user';

export function requestMeta(req: Request): RequestMeta {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: typeof ua === 'string' ? ua.slice(0, 300) : null,
  };
}

/** Injecte l'IP et le user-agent de la requête. */
export const Meta = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestMeta =>
  requestMeta(ctx.switchToHttp().getRequest<Request>()),
);
