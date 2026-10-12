import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { TrackingModule } from '../tracking/tracking.module';
import { MissionsProcessor } from './missions.processor';

@Module({
  imports: [MatchingModule, TrackingModule],
  providers: [MissionsProcessor],
})
export class WorkersModule {}
