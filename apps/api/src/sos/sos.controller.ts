import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AlertNoteInput, alertNoteSchema, SosInput, sosSchema } from '@hb/shared';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { SosService } from './sos.service';

@ApiTags('SOS')
@ApiBearerAuth()
@Controller()
export class SosController {
  constructor(private readonly sos: SosService) {}

  /** Bouton SOS : jamais limité en débit, c'est une alerte de sécurité. */
  @Post('missions/:id/sos')
  @SkipThrottle()
  @HttpCode(201)
  @Roles('CLIENT', 'GUARD')
  @ApiZodBody(sosSchema)
  raise(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(sosSchema)) body: SosInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.sos.raise(user, id, body, meta);
  }

  @Get('missions/:id/sos')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sos.listForMission(user, id);
  }

  @Post('sos/:id/acknowledge')
  @HttpCode(200)
  @Roles('GUARD', 'ADMIN')
  @ApiZodBody(alertNoteSchema)
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(alertNoteSchema)) body: AlertNoteInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.sos.acknowledge(user, id, body.note, meta);
  }

  @Post('sos/:id/resolve')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiZodBody(alertNoteSchema)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(alertNoteSchema)) body: AlertNoteInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.sos.resolve(user, id, body.note, meta);
  }
}
