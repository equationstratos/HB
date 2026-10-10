import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [PlansController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class PlansModule {}
