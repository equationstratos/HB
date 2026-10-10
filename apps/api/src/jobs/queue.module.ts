import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';
import { MISSIONS_QUEUE, MissionQueue } from './mission-queue.service';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        connection: { url: config.get('REDIS_URL') },
        prefix: process.env.BULL_PREFIX ?? 'hb',
      }),
    }),
    BullModule.registerQueue({ name: MISSIONS_QUEUE }),
  ],
  providers: [MissionQueue],
  exports: [MissionQueue, BullModule],
})
export class QueueModule {}
