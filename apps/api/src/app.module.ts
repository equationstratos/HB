import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { CallsModule } from './calls/calls.module';
import { ChatModule } from './chat/chat.module';
import { CommonModule } from './common/common.module';
import { AppConfigModule } from './config/config.module';
import { GuardProfilesModule } from './guard-profiles/guard-profiles.module';
import { HealthController } from './health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { QueueModule } from './jobs/queue.module';
import { WorkersModule } from './jobs/workers.module';
import { MatchingModule } from './matching/matching.module';
import { MissionsModule } from './missions/missions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';
import { RatingsModule } from './ratings/ratings.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RoutingModule } from './routing/routing.module';
import { SosModule } from './sos/sos.module';
import { TrackingModule } from './tracking/tracking.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // Socle
    AppConfigModule,
    PrismaModule,
    CommonModule,
    IntegrationsModule,
    QueueModule,
    RealtimeModule,
    NotificationsModule,
    AccessModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: () => Number(process.env.THROTTLE_LIMIT_PER_MINUTE ?? 120),
        },
      ],
    }),
    // AAA
    AuditModule,
    AuthModule,
    UsersModule,
    // Métier
    GuardProfilesModule,
    PlansModule,
    RoutingModule,
    MissionsModule,
    MatchingModule,
    TrackingModule,
    SosModule,
    ChatModule,
    CallsModule,
    RatingsModule,
    AdminModule,
    WorkersModule,
  ],
  controllers: [HealthController],
  providers: [
    // Ordre d'exécution : limitation de débit, authentification, autorisation.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
