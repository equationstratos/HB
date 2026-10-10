import { MfaService } from './mfa.service';

describe('MfaService', () => {
  const mfa = new MfaService();
  const secret = mfa.generateSecret();

  it('accepte un code valide et renvoie son pas de temps', () => {
    const step = mfa.verify(MfaService.generate(secret), secret, null);
    expect(step).toBe(Math.floor(Date.now() / 30_000));
  });

  it('refuse un code faux', () => {
    expect(mfa.verify('000000', secret, null)).toBeNull();
  });

  it('refuse le rejeu d’un code déjà utilisé', () => {
    const code = MfaService.generate(secret);
    const step = mfa.verify(code, secret, null);
    expect(step).not.toBeNull();
    expect(mfa.verify(code, secret, step)).toBeNull();
  });

  it('fournit un QR code d’enrôlement', async () => {
    const enrollment = await mfa.enrollment('admin@exemple.fr', secret);
    expect(enrollment.otpauthUrl).toContain('otpauth://totp/');
    expect(enrollment.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
