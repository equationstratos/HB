import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RatingInput, ratingSchema } from '@hb/shared';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { RatingsService } from './ratings.service';

@ApiTags('Notation')
@ApiBearerAuth()
@Controller('missions/:id/rating')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post()
  @Roles('CLIENT')
  @ApiZodBody(ratingSchema)
  rate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ratingSchema)) body: RatingInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.ratings.rate(user, id, body, meta);
  }
}
