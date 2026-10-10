import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { MatchingService } from './matching.service';

@ApiTags('Propositions de mission')
@ApiBearerAuth()
@Roles('GUARD')
@Controller('offers')
export class OffersController {
  constructor(private readonly matching: MatchingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.matching.listOffers(user);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string, @Meta() meta: RequestMeta) {
    return this.matching.accept(user, id, meta);
  }

  @Post(':id/decline')
  @HttpCode(204)
  async decline(@CurrentUser() user: AuthUser, @Param('id') id: string, @Meta() meta: RequestMeta) {
    await this.matching.decline(user, id, meta);
  }
}
