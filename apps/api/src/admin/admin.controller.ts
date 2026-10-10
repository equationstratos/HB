import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdminAssignInput,
  adminAssignSchema,
  AuditQuery,
  auditQuerySchema,
  CancelMissionInput,
  cancelMissionSchema,
  GuardListQuery,
  guardListQuerySchema,
  MissionListQuery,
  missionListQuerySchema,
  paginationSchema,
  PlanInput,
  planSchema,
  PlanUpdateInput,
  planUpdateSchema,
  ReasonInput,
  reasonSchema,
  UserListQuery,
  userListQuerySchema,
} from '@hb/shared';
import { Response } from 'express';
import { Audit } from '../audit/audit.decorator';
import { AuditService } from '../audit/audit.service';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { GuardProfilesService } from '../guard-profiles/guard-profiles.service';
import { MatchingService } from '../matching/matching.service';
import { MissionsService } from '../missions/missions.service';
import { SubscriptionsService } from '../plans/subscriptions.service';
import { RatingsService } from '../ratings/ratings.service';
import { AdminService } from './admin.service';

@ApiTags('Administration')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly missions: MissionsService,
    private readonly matching: MatchingService,
    private readonly guards: GuardProfilesService,
    private readonly subscriptions: SubscriptionsService,
    private readonly ratings: RatingsService,
    private readonly audit: AuditService,
  ) {}

  // ----------------------------------------------------------- Supervision

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('live')
  live(@CurrentUser() user: AuthUser, @Meta() meta: RequestMeta) {
    return this.admin.live(user, meta);
  }

  @Get('alerts')
  alerts() {
    return this.admin.alerts();
  }

  // ------------------------------------------------------------- Missions

  @Get('missions')
  missionsList(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(missionListQuerySchema)) query: MissionListQuery,
  ) {
    return this.missions.list(user, query);
  }

  @Get('missions/:id')
  mission(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.missions.get(user, id);
  }

  /** Gardes suggérés pour une attribution manuelle. */
  @Get('missions/:id/candidates')
  async candidates(@Param('id') id: string) {
    const mission = await this.missions.findOrThrow(id);
    if (!mission.route) return [];
    const candidates = await this.matching.findCandidates(
      mission,
      mission.route,
      mission.guardId ? [mission.guardId] : [],
    );
    const profiles = await this.guards.list({ page: 1, pageSize: 100, status: ['APPROVED'] });
    const byId = new Map(profiles.items.map((g) => [g.userId, g]));
    return candidates.map((c) => ({ ...c, guard: byId.get(c.guardId) ?? null }));
  }

  @Post('missions/:id/assign')
  @HttpCode(200)
  @ApiZodBody(adminAssignSchema)
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(adminAssignSchema)) body: AdminAssignInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.missions.assign(user, id, body.guardId, meta);
  }

  @Post('missions/:id/relaunch')
  @HttpCode(200)
  relaunch(@CurrentUser() user: AuthUser, @Param('id') id: string, @Meta() meta: RequestMeta) {
    return this.missions.relaunch(user, id, meta);
  }

  @Post('missions/:id/cancel')
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

  // ---------------------------------------------------------------- Gardes

  @Get('guards')
  guardsList(@Query(new ZodPipe(guardListQuerySchema)) query: GuardListQuery) {
    return this.guards.list(query);
  }

  @Get('guards/:userId')
  guard(@Param('userId') userId: string) {
    return this.guards.adminGet(userId);
  }

  @Post('guards/:userId/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.guards.approve(user, userId, meta);
  }

  @Post('guards/:userId/reject')
  @HttpCode(200)
  @ApiZodBody(reasonSchema)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.guards.reject(user, userId, body.reason, meta);
  }

  @Post('guards/:userId/suspend')
  @HttpCode(200)
  @ApiZodBody(reasonSchema)
  suspendGuard(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.guards.suspend(user, userId, body.reason, meta);
  }

  @Get('guard-documents/:documentId')
  async document(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.guards.downloadDocument(user, documentId, meta);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(file.data);
  }

  // ---------------------------------------------------------- Utilisateurs

  @Get('users')
  users(@Query(new ZodPipe(userListQuerySchema)) query: UserListQuery) {
    return this.admin.users(query);
  }

  @Post('users/:id/suspend')
  @HttpCode(204)
  @ApiZodBody(reasonSchema)
  async suspendUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
    @Meta() meta: RequestMeta,
  ) {
    await this.admin.suspendUser(user, id, body.reason, meta);
  }

  @Post('users/:id/reactivate')
  @HttpCode(204)
  async reactivateUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Meta() meta: RequestMeta,
  ) {
    await this.admin.reactivateUser(user, id, meta);
  }

  // ------------------------------------------------- Offres et abonnements

  @Get('plans')
  plans() {
    return this.subscriptions.listPlans(true);
  }

  @Post('plans')
  @Audit('plan.created', 'Plan', '')
  @ApiZodBody(planSchema)
  createPlan(@Body(new ZodPipe(planSchema)) body: PlanInput) {
    return this.subscriptions.createPlan(body);
  }

  @Patch('plans/:id')
  @Audit('plan.updated', 'Plan')
  @ApiZodBody(planUpdateSchema)
  updatePlan(@Param('id') id: string, @Body(new ZodPipe(planUpdateSchema)) body: PlanUpdateInput) {
    return this.subscriptions.updatePlan(id, body);
  }

  @Get('subscriptions')
  subscriptionsList(
    @Query(new ZodPipe(paginationSchema)) query: { page: number; pageSize: number },
  ) {
    return this.subscriptions.adminList(query.page, query.pageSize);
  }

  @Get('ratings/low')
  lowRated() {
    return this.ratings.lowRated();
  }

  // ------------------------------------------------------- Journal d'audit

  @Get('audit')
  auditLog(@Query(new ZodPipe(auditQuerySchema)) query: AuditQuery) {
    return this.audit.list(query);
  }
}
