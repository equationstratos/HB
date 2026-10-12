import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { EncryptionKeyCheck } from './encryption-key.check';

@Global()
@Module({
  providers: [CryptoService, EncryptionKeyCheck],
  exports: [CryptoService],
})
export class CommonModule {}
