import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Mission, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';

/** Relations chargées pour construire un MissionDto. */
export const missionInclude = {
  client: true,
  guard: { include: { guardProfile: true } },
  route: true,
  rating: true,
} satisfies Prisma.MissionInclude;

export type MissionWithRelations = Prisma.MissionGetPayload<{ include: typeof missionInclude }>;

/**
 * Autorisation fine sur les missions :
 * - l'admin voit tout ;
 * - une cliente ne voit que ses propres missions ;
 * - un garde ne voit que les missions qui lui sont attribuées.
 */
@Injectable()
export class MissionAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async load(missionId: string): Promise<MissionWithRelations> {
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      include: missionInclude,
    });
    if (!mission) throw new NotFoundException('Mission introuvable');
    return mission;
  }

  isParty(mission: Pick<Mission, 'clientId' | 'guardId'>, user: AuthUser): boolean {
    return (
      (user.role === 'CLIENT' && mission.clientId === user.id) ||
      (user.role === 'GUARD' && mission.guardId === user.id)
    );
  }

  canView(mission: Pick<Mission, 'clientId' | 'guardId'>, user: AuthUser): boolean {
    return user.role === 'ADMIN' || this.isParty(mission, user);
  }

  /** Charge la mission et vérifie que l'utilisateur peut la consulter. */
  async loadForViewer(missionId: string, user: AuthUser): Promise<MissionWithRelations> {
    const mission = await this.load(missionId);
    // Même réponse qu'une mission inexistante : on ne révèle pas l'existence des autres missions.
    if (!this.canView(mission, user)) throw new NotFoundException('Mission introuvable');
    return mission;
  }

  /** Charge la mission et vérifie que l'utilisateur en est la cliente ou le garde. */
  async loadForParty(missionId: string, user: AuthUser): Promise<MissionWithRelations> {
    const mission = await this.load(missionId);
    if (!this.isParty(mission, user)) {
      if (user.role === 'ADMIN')
        throw new ForbiddenException('Action réservée à la cliente et au garde');
      throw new NotFoundException('Mission introuvable');
    }
    return mission;
  }
}
