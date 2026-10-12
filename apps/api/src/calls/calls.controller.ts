import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { CallsService } from './calls.service';

@ApiTags('Appel masqué')
@ApiBearerAuth()
@Controller('missions/:id/call')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post()
  @HttpCode(200)
  @Roles('CLIENT', 'GUARD')
  call(@CurrentUser() user: AuthUser, @Param('id') id: string, @Meta() meta: RequestMeta) {
    return this.calls.call(user, id, meta);
  }
}
