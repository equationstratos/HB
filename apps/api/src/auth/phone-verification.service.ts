import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { APP_NAME } from '@hb/shared';
import { CryptoService } from '../common/crypto.service';
import { SMS_PROVIDER, SmsProvider } from '../integrations/sms.provider';
import { PrismaService } from '../prisma/prisma.service';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_DELAY_MS = 60_000;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

/** Vérification du numéro de téléphone par code SMS. */
@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async send(userId: string): Promise<{ expiresInSeconds: number }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const recent = await this.prisma.phoneVerification.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
      orderBy: { createdAt: 'desc' },
    });
    const last = recent[0];
    if (last && Date.now() - last.createdAt.getTime() < RESEND_DELAY_MS) {
      throw new HttpException(
        'Patientez une minute avant de redemander un code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (recent.length >= MAX_PER_HOUR) {
      throw new HttpException(
        'Trop de codes demandés, réessayez plus tard',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.crypto.randomDigits(6);
    await this.prisma.phoneVerification.create({
      data: {
        userId,
        phone: user.phone,
        codeHash: this.crypto.hmac(`${userId}:${code}`),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    await this.sms.send(
      user.phone,
      `${APP_NAME} : votre code de vérification est ${code}. Il expire dans 10 minutes.`,
    );
    return { expiresInSeconds: CODE_TTL_MS / 1000 };
  }

  async verify(userId: string, code: string): Promise<void> {
    const pending = await this.prisma.phoneVerification.findFirst({
      where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending || pending.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Code expiré, demandez-en un nouveau');
    }
    if (pending.codeHash !== this.crypto.hmac(`${userId}:${code}`)) {
      await this.prisma.phoneVerification.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Code incorrect');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.phoneVerification.update({
        where: { id: pending.id },
        data: { consumedAt: now },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { phoneVerifiedAt: now } }),
    ]);
  }
}
