import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AlertNoteInput,
  alertNoteSchema,
  DeviationAckInput,
  deviationAckSchema,
  LocationBatchInput,
  locationBatchSchema,
} from '@hb/shared';
import { Throttle } from '@nestjs/throttler';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { DeviationsService } from './deviations.service';
import { TrackingService } from './tracking.service';

@ApiTags('Suivi GPS et surveillance du trajet')
@ApiBearerAuth()
@Controller()
export class TrackingController {
  constructor(
    private readonly tracking: TrackingService,
    private readonly deviations: DeviationsService,
  ) {}

  @Post('missions/:id/locations')
  @HttpCode(202)
  @Roles('CLIENT', 'GUARD')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @ApiZodBody(locationBatchSchema)
  ingest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(locationBatchSchema)) body: LocationBatchInput,
  ) {
    return this.tracking.ingest(user, id, body);
  }

  @Get('missions/:id/locations')
  track(@CurrentUser() user: AuthUser, @Param('id') id: string, @Meta() meta: RequestMeta) {
    return this.tracking.track(user, id, meta);
  }

  @Get('missions/:id/deviations')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deviations.listForMission(user, id);
  }

  /** Réponse de la cliente à « Tout va bien ? ». */
  @Post('deviations/:id/answer')
  @HttpCode(200)
  @Roles('CLIENT')
  @ApiZodBody(deviationAckSchema)
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(deviationAckSchema)) body: DeviationAckInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.deviations.clientAnswer(user, id, body, meta);
  }

  @Post('deviations/:id/acknowledge')
  @HttpCode(200)
  @Roles('GUARD', 'ADMIN')
  @ApiZodBody(alertNoteSchema)
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(alertNoteSchema)) body: AlertNoteInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.deviations.acknowledge(user, id, body.note, meta);
  }

  @Post('deviations/:id/resolve')
  @HttpCode(200)
  @Roles('GUARD', 'ADMIN')
  @ApiZodBody(alertNoteSchema)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(alertNoteSchema)) body: AlertNoteInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.deviations.resolve(user, id, body.note, meta);
  }
}
