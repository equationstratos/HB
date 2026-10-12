import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CancelMissionInput,
  cancelMissionSchema,
  CreateMissionInput,
  createMissionSchema,
  MissionListQuery,
  missionListQuerySchema,
  MissionStatusUpdateInput,
  missionStatusUpdateSchema,
  RouteRequestInput,
  routeRequestSchema,
} from '@hb/shared';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { MissionsService } from './missions.service';

@ApiTags('Missions')
@ApiBearerAuth()
@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Post()
  @Roles('CLIENT')
  @ApiZodBody(createMissionSchema)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createMissionSchema)) body: CreateMissionInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.missions.create(user, body, meta);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(missionListQuerySchema)) query: MissionListQuery,
  ) {
    return this.missions.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.missions.get(user, id);
  }

  @Post(':id/status')
  @HttpCode(200)
  @Roles('CLIENT', 'GUARD')
  @ApiZodBody(missionStatusUpdateSchema)
  status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(missionStatusUpdateSchema)) body: MissionStatusUpdateInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.missions.updateStatus(user, id, body.status, meta);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiZodBody(cancelMissionSchema)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(cancelMissionSchema)) body: CancelMissionInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.missions.cancel(user, id, body.reason, meta);
  }

  @Put(':id/route')
  @Roles('CLIENT')
  @ApiZodBody(routeRequestSchema)
  updateRoute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(routeRequestSchema)) body: RouteRequestInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.missions.updateRoute(user, id, body, meta);
  }
}
