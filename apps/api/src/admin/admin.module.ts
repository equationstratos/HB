import { Module } from '@nestjs/common';
import { GuardProfilesModule } from '../guard-profiles/guard-profiles.module';
import { MatchingModule } from '../matching/matching.module';
import { MissionsModule } from '../missions/missions.module';
import { PlansModule } from '../plans/plans.module';
import { RatingsModule } from '../ratings/ratings.module';
import { TrackingModule } from '../tracking/tracking.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    MissionsModule,
    MatchingModule,
    GuardProfilesModule,
    PlansModule,
    RatingsModule,
    TrackingModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
