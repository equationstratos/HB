import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { APP_NAME } from '@hb/shared';

authenticator.options = { window: 1, step: 30 };

/** Double authentification TOTP (Google Authenticator, Authy, 1Password…). */
@Injectable()
export class MfaService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  async enrollment(
    email: string,
    secret: string,
  ): Promise<{ otpauthUrl: string; qrCodeDataUrl: string }> {
    const otpauthUrl = authenticator.keyuri(email, APP_NAME, secret);
    return { otpauthUrl, qrCodeDataUrl: await toDataURL(otpauthUrl) };
  }

  /**
   * Vérifie un code et renvoie le pas de temps correspondant, ou null.
   * Le pas permet de refuser un code déjà utilisé (rejeu).
   */
  verify(code: string, secret: string, lastStep: number | null): number | null {
    const delta = authenticator.checkDelta(code, secret);
    if (delta === null) return null;
    const step = Math.floor(Date.now() / 30_000) + delta;
    if (lastStep !== null && step <= lastStep) return null;
    return step;
  }

  /** Utilisé par les tests et le seed. */
  static generate(secret: string): string {
    return authenticator.generate(secret);
  }
}
