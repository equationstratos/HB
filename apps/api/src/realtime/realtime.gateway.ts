import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { isOpenStatus, REALTIME_NAMESPACE, rooms } from '@hb/shared';
import { Namespace, Socket } from 'socket.io';
import { MissionAccessService } from '../access/mission-access.service';
import { TokenService } from '../auth/token.service';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';

type AuthedSocket = Socket & { data: { user: AuthUser } };

@WebSocketGateway({ namespace: REALTIME_NAMESPACE, cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly access: MissionAccessService,
  ) {}

  afterInit(server: Namespace): void {
    this.realtime.attach(server);
    // Le jeton d'accès est vérifié dès la poignée de main : aucune connexion anonyme.
    server.use((socket, next) => {
      void (async () => {
        try {
          const raw = (socket.handshake.auth as { token?: unknown })?.token;
          if (typeof raw !== 'string') throw new Error('missing token');
          const payload = this.tokens.verifyAccess(raw);
          const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, role: true, status: true },
          });
          if (!user || user.status !== 'ACTIVE') throw new Error('inactive');
          if (user.role === 'ADMIN' && !payload.mfa) throw new Error('mfa');
          socket.data.user = {
            id: user.id,
            role: user.role,
            mfa: payload.mfa,
            sessionId: payload.sid,
          };
          next();
        } catch {
          next(new Error('unauthorized'));
        }
      })();
    });
  }

  async handleConnection(socket: AuthedSocket): Promise<void> {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    await socket.join(rooms.user(user.id));
    if (user.role === 'ADMIN') await socket.join(rooms.admins);
  }

  @SubscribeMessage('mission:join')
  async joinMission(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { missionId?: unknown },
  ): Promise<{ ok: boolean; error?: string }> {
    const user = socket.data.user;
    if (typeof body?.missionId !== 'string') return { ok: false, error: 'missionId manquant' };
    const mission = await this.prisma.mission.findUnique({
      where: { id: body.missionId },
      select: { clientId: true, guardId: true, status: true },
    });
    if (!mission || !this.access.canView(mission, user) || !isOpenStatus(mission.status)) {
      return { ok: false, error: 'Accès refusé' };
    }
    await socket.join(rooms.mission(body.missionId));
    this.logger.debug(`${user.role} ${user.id} a rejoint la mission ${body.missionId}`);
    return { ok: true };
  }

  @SubscribeMessage('mission:leave')
  async leaveMission(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { missionId?: unknown },
  ) {
    if (typeof body?.missionId === 'string') await socket.leave(rooms.mission(body.missionId));
  }
}
