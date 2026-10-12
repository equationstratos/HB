import { Global, Module } from '@nestjs/common';
import { MissionAccessService } from './mission-access.service';
import { MissionEvents } from './mission-events.service';

@Global()
@Module({
  providers: [MissionAccessService, MissionEvents],
  exports: [MissionAccessService, MissionEvents],
})
export class AccessModule {}
