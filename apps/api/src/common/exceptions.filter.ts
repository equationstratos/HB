import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { EncryptionKeyMismatchError } from './crypto.service';

/** Format d'erreur homogène, sans fuite de détails internes. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    if (!res || typeof res.status !== 'function') throw exception;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { statusCode: status, message: body }
          : { statusCode: status, ...body };
      res.status(status).json(payload);
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        res
          .status(HttpStatus.CONFLICT)
          .json({ statusCode: 409, message: 'Cette ressource existe déjà' });
        return;
      }
      if (exception.code === 'P2025') {
        res
          .status(HttpStatus.NOT_FOUND)
          .json({ statusCode: 404, message: 'Ressource introuvable' });
        return;
      }
    }

    if (exception instanceof EncryptionKeyMismatchError) {
      // Erreur de configuration du serveur, pas un bug : on dit quoi faire, sans pile d'appels.
      this.logger.error(exception.message);
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: 503,
        message:
          process.env.NODE_ENV === 'production'
            ? 'Service momentanément indisponible'
            : 'Clé de chiffrement du serveur changée : voir la console de l’API et le README (Dépannage).',
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, message: 'Erreur interne, veuillez réessayer' });
  }
}
