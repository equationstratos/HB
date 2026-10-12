import { Module } from '@nestjs/common';
import { AdminPayoutsController } from './admin-payouts.controller';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController, AdminPayoutsController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
