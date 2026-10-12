import { Module } from '@nestjs/common';
import { GuardProfilesController } from './guard-profiles.controller';
import { GuardProfilesService } from './guard-profiles.service';

@Module({
  controllers: [GuardProfilesController],
  providers: [GuardProfilesService],
  exports: [GuardProfilesService],
})
export class GuardProfilesModule {}
