import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MessageInput, MessageListQuery, messageListQuerySchema, messageSchema } from '@hb/shared';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { ChatService } from './chat.service';

@ApiTags('Messagerie')
@ApiBearerAuth()
@Controller('missions/:id/messages')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Meta() meta: RequestMeta,
    @Query(new ZodPipe(messageListQuerySchema)) query: MessageListQuery,
  ) {
    return this.chat.list(user, id, meta, query.after);
  }

  @Post()
  @ApiZodBody(messageSchema)
  send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(messageSchema)) body: MessageInput,
  ) {
    return this.chat.send(user, id, body.body);
  }
}
