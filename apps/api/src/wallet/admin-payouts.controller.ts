import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PayoutListQuery,
  payoutListQuerySchema,
  PayoutPaidInput,
  payoutPaidSchema,
  ReasonInput,
  reasonSchema,
} from '@hb/shared';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { WalletService } from './wallet.service';

/** Virements demandés par les gardes, exécutés à la main par l'équipe. */
@ApiTags('Administration')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  list(@Query(new ZodPipe(payoutListQuerySchema)) query: PayoutListQuery) {
    return this.wallet.adminList(query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Meta() meta: RequestMeta) {
    return this.wallet.adminGet(user, id, meta);
  }

  @Post(':id/paid')
  @HttpCode(200)
  @ApiZodBody(payoutPaidSchema)
  paid(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(payoutPaidSchema)) body: PayoutPaidInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.wallet.markPaid(user, id, body.bankReference, meta);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiZodBody(reasonSchema)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.wallet.reject(user, id, body.reason, meta);
  }
}
