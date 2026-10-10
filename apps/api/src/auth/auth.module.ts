import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MfaService } from './mfa.service';
import { PhoneVerificationService } from './phone-verification.service';
import { RolesGuard } from './roles.guard';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: { issuer: 'hb-api', algorithm: 'HS256' },
        verifyOptions: { issuer: 'hb-api', algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    MfaService,
    PhoneVerificationService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [TokenService, AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
