import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuthTokens,
  LoginInput,
  loginSchema,
  LoginResponse,
  MfaSetupInput,
  mfaSetupSchema,
  MfaVerifyInput,
  mfaVerifySchema,
  PhoneVerifyInput,
  phoneVerifySchema,
  RefreshInput,
  refreshSchema,
  PhoneCodeSentDto,
  RegisterInput,
  RegisterResponse,
  registerSchema,
} from '@hb/shared';
import { Request, Response } from 'express';
import { z } from 'zod';
import { ApiZodBody } from '../common/api-zod.decorator';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { CurrentUser, Public } from '../common/decorators';
import { Meta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { AppConfig } from '../config/app-config.service';
import { AuthService } from './auth.service';
import { PhoneVerificationService } from './phone-verification.service';

export const REFRESH_COOKIE = 'hb_rt';
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/** Limite stricte sur les routes sensibles (force brute), par IP et par minute. */
const STRICT = {
  default: { limit: () => Number(process.env.AUTH_THROTTLE_LIMIT_PER_MINUTE ?? 10), ttl: 60_000 },
};

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly phone: PhoneVerificationService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle(STRICT)
  @Post('register')
  @ApiZodBody(registerSchema)
  async register(
    @Body(new ZodPipe(registerSchema)) body: RegisterInput,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterResponse> {
    return this.withCookie(req, res, await this.auth.register(body, meta));
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.withCookie(req, res, await this.auth.login(body, meta));
  }

  @Public()
  @Throttle(STRICT)
  @Post('mfa/setup')
  @HttpCode(200)
  @ApiZodBody(mfaSetupSchema)
  mfaSetup(@Body(new ZodPipe(mfaSetupSchema)) body: MfaSetupInput) {
    return this.auth.mfaSetup(body.mfaToken);
  }

  @Public()
  @Throttle(STRICT)
  @Post('mfa/enable')
  @HttpCode(200)
  @ApiZodBody(mfaVerifySchema)
  async mfaEnable(
    @Body(new ZodPipe(mfaVerifySchema)) body: MfaVerifyInput,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.withCookie(req, res, await this.auth.mfaEnable(body.mfaToken, body.code, meta));
  }

  @Public()
  @Throttle(STRICT)
  @Post('mfa/verify')
  @HttpCode(200)
  @ApiZodBody(mfaVerifySchema)
  async mfaVerify(
    @Body(new ZodPipe(mfaVerifySchema)) body: MfaVerifyInput,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.withCookie(req, res, await this.auth.mfaVerify(body.mfaToken, body.code, meta));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiZodBody(refreshSchema)
  async refresh(
    @Body(new ZodPipe(refreshSchema)) body: RefreshInput,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = body.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    try {
      const result = await this.auth.refresh(raw, meta);
      return { ...result, tokens: this.applyCookie(req, res, result.tokens) };
    } catch (error) {
      if (this.isWeb(req)) this.clearCookie(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiZodBody(refreshSchema)
  async logout(
    @Body(new ZodPipe(refreshSchema)) body: RefreshInput,
    @CurrentUser() user: AuthUser | undefined,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const raw = body.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    await this.auth.logout(raw, user, meta);
    this.clearCookie(res);
  }

  @ApiBearerAuth()
  @Throttle(STRICT)
  @Post('phone/send-code')
  @HttpCode(200)
  sendPhoneCode(@CurrentUser() user: AuthUser): Promise<PhoneCodeSentDto> {
    return this.phone.send(user.id);
  }

  @ApiBearerAuth()
  @Throttle(STRICT)
  @Post('phone/verify')
  @HttpCode(204)
  @ApiZodBody(phoneVerifySchema)
  async verifyPhone(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(phoneVerifySchema)) body: PhoneVerifyInput,
  ) {
    await this.phone.verify(user.id, body.code);
  }

  @ApiBearerAuth()
  @Post('me/mfa/setup')
  @HttpCode(200)
  selfMfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.selfMfaSetup(user);
  }

  @ApiBearerAuth()
  @Throttle(STRICT)
  @Post('me/mfa/enable')
  @HttpCode(204)
  @ApiZodBody(codeSchema)
  async selfMfaEnable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(codeSchema)) body: { code: string },
    @Meta() meta: RequestMeta,
  ) {
    await this.auth.selfMfaEnable(user, body.code, meta);
  }

  // --- Admin web : le jeton de rafraîchissement vit dans un cookie httpOnly, jamais en JS. ---

  private isWeb(req: Request): boolean {
    return req.headers['x-client'] === 'web';
  }

  private withCookie<R extends LoginResponse>(req: Request, res: Response, result: R): R {
    if (result.status !== 'OK') return result;
    return { ...result, tokens: this.applyCookie(req, res, result.tokens) };
  }

  private applyCookie(req: Request, res: Response, tokens: AuthTokens): AuthTokens {
    if (!this.isWeb(req)) return tokens;
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.config.get('REFRESH_TTL_DAYS') * 86_400_000,
    });
    return { ...tokens, refreshToken: '' };
  }

  private clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }
}
