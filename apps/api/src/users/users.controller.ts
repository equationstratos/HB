import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ConsentInput,
  consentSchema,
  EmergencyContactInput,
  emergencyContactSchema,
  PushTokenInput,
  pushTokenSchema,
  UpdateProfileInput,
  updateProfileSchema,
} from '@hb/shared';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { Audit } from '../audit/audit.decorator';
import { UsersService } from './users.service';

@ApiTags('Mon compte')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Patch()
  @ApiZodBody(updateProfileSchema)
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.users.update(user.id, body);
  }

  @Post('consent')
  @HttpCode(200)
  @Audit('user.location_consent', 'User', '')
  @ApiZodBody(consentSchema)
  consent(@CurrentUser() user: AuthUser, @Body(new ZodPipe(consentSchema)) body: ConsentInput) {
    return this.users.setLocationConsent(user.id, body.location);
  }

  @Put('push-token')
  @HttpCode(204)
  @ApiZodBody(pushTokenSchema)
  async pushToken(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(pushTokenSchema)) body: PushTokenInput,
  ) {
    await this.users.setPushToken(user.id, body.token);
  }

  @Get('emergency-contacts')
  @Roles('CLIENT')
  contacts(@CurrentUser() user: AuthUser) {
    return this.users.listContacts(user.id);
  }

  @Post('emergency-contacts')
  @Roles('CLIENT')
  @Audit('user.emergency_contact_added', 'EmergencyContact', '')
  @ApiZodBody(emergencyContactSchema)
  addContact(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(emergencyContactSchema)) body: EmergencyContactInput,
  ) {
    return this.users.addContact(user.id, body);
  }

  @Delete('emergency-contacts/:contactId')
  @Roles('CLIENT')
  @HttpCode(204)
  @Audit('user.emergency_contact_removed', 'EmergencyContact', 'contactId')
  async removeContact(@CurrentUser() user: AuthUser, @Param('contactId') contactId: string) {
    await this.users.removeContact(user.id, contactId);
  }
}
