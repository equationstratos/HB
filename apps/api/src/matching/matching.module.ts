import { Module } from '@nestjs/common';
import { MissionsModule } from '../missions/missions.module';
import { MatchingService } from './matching.service';
import { OffersController } from './offers.controller';

@Module({
  imports: [MissionsModule],
  controllers: [OffersController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
