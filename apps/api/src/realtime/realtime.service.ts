import { Injectable } from '@nestjs/common';
import { rooms, ServerToClientEvents } from '@hb/shared';
import { Namespace } from 'socket.io';

type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

/** Émission d'événements temps réel vers les salles autorisées. */
@Injectable()
export class RealtimeService {
  private server: Namespace | null = null;

  attach(server: Namespace): void {
    this.server = server;
  }

  toUser<E extends EventName>(userId: string, event: E, payload: Payload<E>): void {
    this.server?.to(rooms.user(userId)).emit(event, payload as never);
  }

  toAdmins<E extends EventName>(event: E, payload: Payload<E>): void {
    this.server?.to(rooms.admins).emit(event, payload as never);
  }

  /** Salle de la mission (cliente et garde qui l'ont rejointe) + tous les admins. */
  toMission<E extends EventName>(missionId: string, event: E, payload: Payload<E>): void {
    this.server?.to([rooms.mission(missionId), rooms.admins]).emit(event, payload as never);
  }

  /**
   * Alerte : salle de la mission + admins + cliente et garde directement (même s'ils n'ont
   * pas l'écran de mission ouvert). Socket.IO n'envoie qu'une fois à chaque connexion.
   */
  toMissionAndParties<E extends EventName>(
    mission: { id: string; clientId: string; guardId: string | null },
    event: E,
    payload: Payload<E>,
  ): void {
    const targets = [rooms.mission(mission.id), rooms.admins, rooms.user(mission.clientId)];
    if (mission.guardId) targets.push(rooms.user(mission.guardId));
    this.server?.to(targets).emit(event, payload as never);
  }

  /** Retire un utilisateur de la salle d'une mission (garde remplacé, mission close). */
  removeFromMission(userId: string, missionId: string): void {
    this.server?.in(rooms.user(userId)).socketsLeave(rooms.mission(missionId));
  }

  closeMissionRoom(missionId: string): void {
    this.server?.in(rooms.mission(missionId)).socketsLeave(rooms.mission(missionId));
  }

  /** Coupe immédiatement les connexions d'un compte suspendu. */
  disconnectUser(userId: string): void {
    this.server?.in(rooms.user(userId)).disconnectSockets(true);
  }
}
