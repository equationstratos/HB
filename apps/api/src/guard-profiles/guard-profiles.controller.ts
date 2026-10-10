import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  AvailabilityInput,
  availabilitySchema,
  GuardApplicationInput,
  guardApplicationSchema,
  guardDocumentUploadSchema,
  MAX_DOCUMENT_BYTES,
  PresenceInput,
  presenceSchema,
} from '@hb/shared';
import { memoryStorage } from 'multer';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { GuardProfilesService, UploadedDocument } from './guard-profiles.service';

@ApiTags('Garde')
@ApiBearerAuth()
@Roles('GUARD')
@Controller('guards/me')
export class GuardProfilesController {
  constructor(private readonly guards: GuardProfilesService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.guards.getMine(user.id);
  }

  @Put('profile')
  @ApiZodBody(guardApplicationSchema)
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(guardApplicationSchema)) body: GuardApplicationInput,
  ) {
    return this.guards.updateProfile(user.id, body);
  }

  @Post('submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AuthUser, @Meta() meta: RequestMeta) {
    return this.guards.submit(user, meta);
  }

  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['ID_CARD', 'CNAPS_CARD', 'OTHER'] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(guardDocumentUploadSchema))
    body: { type: 'ID_CARD' | 'CNAPS_CARD' | 'OTHER' },
    @UploadedFile() file: UploadedDocument | undefined,
    @Meta() meta: RequestMeta,
  ) {
    return this.guards.uploadDocument(user, body.type, file, meta);
  }

  @Delete('documents/:documentId')
  @HttpCode(204)
  async deleteDocument(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Meta() meta: RequestMeta,
  ) {
    await this.guards.deleteDocument(user, documentId, meta);
  }

  @Put('availability')
  @ApiZodBody(availabilitySchema)
  availability(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(availabilitySchema)) body: AvailabilityInput,
  ) {
    return this.guards.setAvailability(user.id, body);
  }

  @Post('presence')
  @HttpCode(200)
  @ApiZodBody(presenceSchema)
  presence(@CurrentUser() user: AuthUser, @Body(new ZodPipe(presenceSchema)) body: PresenceInput) {
    return this.guards.setPresence(user, body);
  }

  @Get('ratings')
  ratings(@CurrentUser() user: AuthUser) {
    return this.guards.myRatings(user.id);
  }
}
