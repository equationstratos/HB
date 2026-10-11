import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BankAccountInput, bankAccountSchema } from '@hb/shared';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { WalletService } from './wallet.service';

/** Gains du garde connecté : il ne voit jamais que les siens. */
@ApiTags('Garde')
@ApiBearerAuth()
@Roles('GUARD')
@Controller('guards/me')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('wallet')
  get(@CurrentUser() user: AuthUser) {
    return this.wallet.wallet(user.id);
  }

  @Put('bank-account')
  @ApiZodBody(bankAccountSchema)
  bankAccount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(bankAccountSchema)) body: BankAccountInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.wallet.setBankAccount(user, body, meta);
  }

  /** Virement de tout le solde disponible vers le compte enregistré. */
  @Post('payouts')
  requestPayout(@CurrentUser() user: AuthUser, @Meta() meta: RequestMeta) {
    return this.wallet.requestPayout(user, meta);
  }
}
