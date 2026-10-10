import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SubscribeInput, subscribeSchema } from '@hb/shared';
import { Audit } from '../audit/audit.decorator';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Formules et abonnements')
@ApiBearerAuth()
@Controller()
export class PlansController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('plans')
  plans() {
    return this.subscriptions.listPlans();
  }

  @Get('subscriptions/me')
  @Roles('CLIENT')
  async mine(@CurrentUser() user: AuthUser) {
    return { subscription: await this.subscriptions.mine(user.id) };
  }

  @Post('subscriptions')
  @Roles('CLIENT')
  @Audit('subscription.created', 'Subscription', '')
  @ApiZodBody(subscribeSchema)
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(subscribeSchema)) body: SubscribeInput,
  ) {
    return this.subscriptions.subscribe(user.id, body.planId);
  }

  @Post('subscriptions/me/cancel')
  @Roles('CLIENT')
  @HttpCode(204)
  @Audit('subscription.cancelled', 'Subscription', '')
  async cancel(@CurrentUser() user: AuthUser) {
    await this.subscriptions.cancel(user.id);
  }
}
