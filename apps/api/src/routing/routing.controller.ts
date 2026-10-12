import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RouteRequestInput, routeRequestSchema } from '@hb/shared';
import { Throttle } from '@nestjs/throttler';
import { ApiZodBody } from '../common/api-zod.decorator';
import { Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RoutingService } from './routing.service';

@ApiTags('Trajets')
@ApiBearerAuth()
@Controller('routes')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  /** Aperçu de l'itinéraire avant validation par la cliente. */
  @Post('preview')
  @HttpCode(200)
  @Roles('CLIENT', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiZodBody(routeRequestSchema)
  preview(@Body(new ZodPipe(routeRequestSchema)) body: RouteRequestInput) {
    return this.routing.compute(body);
  }
}
