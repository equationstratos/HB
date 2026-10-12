import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogDto, AuditQuery, Paginated } from '@hb/shared';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';

export type AuditActor = Pick<AuthUser, 'id' | 'role'> | 'SYSTEM' | null;

export interface AuditEntry {
  actor: AuditActor;
  action: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  meta?: RequestMeta;
}

/**
 * Traçabilité (le troisième « A ») : qui a fait quoi, quand, d'où.
 * Les entrées ne peuvent être ni modifiées ni supprimées (trigger PostgreSQL).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    const actor = entry.actor;
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actor && actor !== 'SYSTEM' ? actor.id : null,
          actorRole: actor === 'SYSTEM' ? 'SYSTEM' : (actor?.role ?? null),
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: entry.meta?.ip ?? null,
          userAgent: entry.meta?.userAgent ?? null,
        },
      });
    } catch (error) {
      // Une panne du journal ne doit jamais bloquer une alerte de sécurité.
      this.logger.error(`Échec d'écriture du journal d'audit (${entry.action})`, error as Error);
    }
  }

  async list(query: AuditQuery): Promise<Paginated<AuditLogDto>> {
    const where: Prisma.AuditLogWhereInput = {
      actorId: query.actorId,
      action: query.action ? { startsWith: query.action } : undefined,
      entityType: query.entityType,
      entityId: query.entityId,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true },
    });
    const emails = new Map(actors.map((a) => [a.id, a.email]));
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actorId: r.actorId,
        actorRole: r.actorRole as AuditLogDto['actorRole'],
        actorEmail: r.actorId ? (emails.get(r.actorId) ?? null) : null,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        ip: r.ip,
        userAgent: r.userAgent,
      })),
    };
  }
}
