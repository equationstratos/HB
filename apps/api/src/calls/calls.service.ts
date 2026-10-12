import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { MissionStatus } from '@prisma/client';
import { CallResponseDto } from '@hb/shared';
import { MissionAccessService } from '../access/mission-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { TELEPHONY_PROVIDER, TelephonyProvider } from '../integrations/telephony.provider';
import { PrismaService } from '../prisma/prisma.service';

const CALL_STATUSES: MissionStatus[] = ['ASSIGNED', 'GUARD_EN_ROUTE', 'IN_PROGRESS'];
const MIN_INTERVAL_MS = 20_000;

/** Appel masqué entre la cliente et le garde : aucun vrai numéro n'est jamais exposé. */
@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MissionAccessService,
    private readonly audit: AuditService,
    @Inject(TELEPHONY_PROVIDER) private readonly telephony: TelephonyProvider,
  ) {}

  async call(user: AuthUser, missionId: string, meta: RequestMeta): Promise<CallResponseDto> {
    const mission = await this.access.loadForParty(missionId, user);
    if (!CALL_STATUSES.includes(mission.status) || !mission.guard) {
      throw new ConflictException('L’appel est possible dès qu’un garde est attribué');
    }
    const recent = await this.prisma.callSession.findFirst({
      where: {
        missionId,
        callerId: user.id,
        createdAt: { gte: new Date(Date.now() - MIN_INTERVAL_MS) },
      },
    });
    if (recent)
      throw new HttpException(
        'Un appel est déjà en cours de mise en relation',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const [caller, callee] =
      user.role === 'CLIENT' ? [mission.client, mission.guard] : [mission.guard, mission.client];
    if (!caller.phoneVerifiedAt || !callee.phoneVerifiedAt) {
      throw new ForbiddenException('Les deux numéros doivent être vérifiés pour passer un appel');
    }

    const session = await this.prisma.callSession.create({
      data: {
        missionId,
        callerId: caller.id,
        calleeId: callee.id,
        provider: this.telephony.name,
        status: 'initiated',
      },
    });
    try {
      const result = await this.telephony.bridgeCall({
        caller: caller.phone,
        callee: callee.phone,
        reference: session.id,
      });
      await this.prisma.callSession.update({
        where: { id: session.id },
        data: { providerCallId: result.providerCallId, status: result.status },
      });
      await this.audit.log({
        actor: user,
        action: 'mission.call',
        entityType: 'CallSession',
        entityId: session.id,
        metadata: { missionId },
        meta,
      });
      return {
        callId: session.id,
        status: result.status,
        message:
          this.telephony.name === 'console'
            ? 'Appel simulé (mode développement) : voir la console de l’API.'
            : 'Vous allez recevoir un appel du numéro de la plateforme. Décrochez pour être mise en relation.',
      };
    } catch (error) {
      await this.prisma.callSession.update({
        where: { id: session.id },
        data: { status: 'failed' },
      });
      throw new HttpException(
        'Appel impossible pour le moment, utilisez la messagerie',
        HttpStatus.BAD_GATEWAY,
        {
          cause: error,
        },
      );
    }
  }
}
