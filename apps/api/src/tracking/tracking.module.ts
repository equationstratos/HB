import { Module } from '@nestjs/common';
import { SosModule } from '../sos/sos.module';
import { DeviationsService } from './deviations.service';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [SosModule],
  controllers: [TrackingController],
  providers: [TrackingService, DeviationsService],
  exports: [TrackingService, DeviationsService],
})
export class TrackingModule {}
