import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  LOW_RATING_MIN_COUNT,
  LOW_RATING_THRESHOLD,
  LowRatedGuardDto,
  RatingDto,
  RatingInput,
} from '@hb/shared';
import { MissionAccessService } from '../access/mission-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MissionAccessService,
    private readonly audit: AuditService,
  ) {}

  /** La cliente note son garde une fois la protection terminée. */
  async rate(
    user: AuthUser,
    missionId: string,
    input: RatingInput,
    meta: RequestMeta,
  ): Promise<RatingDto> {
    const mission = await this.access.loadForParty(missionId, user);
    if (user.role !== 'CLIENT')
      throw new ForbiddenException('Seule la cliente peut noter la protection');
    if (mission.status !== 'COMPLETED' || !mission.guardId) {
      throw new ConflictException('La notation est possible une fois la protection terminée');
    }
    if (mission.rating) throw new ConflictException('Vous avez déjà noté cette protection');
    const guardId = mission.guardId;

    const rating = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rating.create({
        data: {
          missionId,
          clientId: user.id,
          guardId,
          score: input.score,
          comment: input.comment ?? null,
        },
      });
      const profile = await tx.guardProfile.update({
        where: { userId: guardId },
        data: { ratingSum: { increment: input.score }, ratingCount: { increment: 1 } },
      });
      await tx.guardProfile.update({
        where: { userId: guardId },
        data: { ratingAvg: Math.round((profile.ratingSum / profile.ratingCount) * 100) / 100 },
      });
      return created;
    });
    await this.audit.log({
      actor: user,
      action: 'mission.rated',
      entityType: 'Rating',
      entityId: rating.id,
      metadata: { missionId, guardId, score: input.score },
      meta,
    });
    return {
      id: rating.id,
      missionId,
      score: rating.score,
      comment: rating.comment,
      createdAt: rating.createdAt.toISOString(),
    };
  }

  /** Gardes dont la note moyenne passe sous le seuil : à examiner par l'équipe. */
  async lowRated(): Promise<LowRatedGuardDto[]> {
    const profiles = await this.prisma.guardProfile.findMany({
      where: {
        ratingCount: { gte: LOW_RATING_MIN_COUNT },
        ratingAvg: { lt: LOW_RATING_THRESHOLD },
      },
      include: { user: true },
      orderBy: { ratingAvg: 'asc' },
    });
    return Promise.all(
      profiles.map(async (p) => {
        const recent = await this.prisma.rating.findMany({
          where: { guardId: p.userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });
        return {
          guard: {
            id: p.userId,
            firstName: p.user.firstName,
            lastName: p.user.lastName,
            ratingAvg: p.ratingAvg,
            ratingCount: p.ratingCount,
          },
          ratingAvg: p.ratingAvg ?? 0,
          ratingCount: p.ratingCount,
          recent: recent.map((r) => ({
            id: r.id,
            missionId: r.missionId,
            score: r.score,
            comment: r.comment,
            createdAt: r.createdAt.toISOString(),
          })),
        };
      }),
    );
  }
}
