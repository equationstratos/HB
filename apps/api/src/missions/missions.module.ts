import { Module } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module';
import { RoutingModule } from '../routing/routing.module';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';

@Module({
  imports: [RoutingModule, PlansModule],
  controllers: [MissionsController],
  providers: [MissionsService],
  exports: [MissionsService],
})
export class MissionsModule {}
