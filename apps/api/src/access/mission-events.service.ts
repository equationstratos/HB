import { Injectable } from '@nestjs/common';
import { RealtimeService } from '../realtime/realtime.service';
import { toGuardMissionDto, toMissionDto } from '../missions/mission.mapper';
import { MissionAccessService, MissionWithRelations } from './mission-access.service';

/**
 * Diffuse l'état d'une mission à chaque destinataire, avec la vue qui lui correspond
 * (la cliente ne reçoit jamais la vue admin, le garde ni note ni nom de famille, etc.).
 */
@Injectable()
export class MissionEvents {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly access: MissionAccessService,
  ) {}

  async publish(missionOrId: MissionWithRelations | string): Promise<MissionWithRelations> {
    const mission =
      typeof missionOrId === 'string' ? await this.access.load(missionOrId) : missionOrId;
    this.realtime.toUser(mission.clientId, 'mission:updated', toMissionDto(mission, 'CLIENT'));
    if (mission.guardId)
      this.realtime.toUser(
        mission.guardId,
        'mission:updated',
        toGuardMissionDto(mission, 'detail'),
      );
    this.realtime.toAdmins('mission:updated', toMissionDto(mission, 'ADMIN'));
    return mission;
  }
}
