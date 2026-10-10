import { AppConfig } from '../config/app-config.service';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  const config = { get: () => Buffer.alloc(32, 3).toString('base64') } as unknown as AppConfig;
  const crypto = new CryptoService(config);

  it('chiffre et déchiffre un secret (AES-256-GCM)', () => {
    const encrypted = crypto.encrypt('JBSWY3DPEHPK3PXP');
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(crypto.decrypt(encrypted)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produit un chiffré différent à chaque fois', () => {
    expect(crypto.encrypt('a')).not.toBe(crypto.encrypt('a'));
  });

  it('détecte toute altération du chiffré', () => {
    const [iv, tag, data] = crypto.encrypt('secret').split('.');
    const tampered = [iv, tag, Buffer.from('xxxxxx').toString('base64url')].join('.');
    expect(() => crypto.decrypt(tampered)).toThrow();
    expect(data).toBeDefined();
  });

  it('génère des codes numériques de la bonne longueur', () => {
    expect(crypto.randomDigits(6)).toMatch(/^\d{6}$/);
  });
});
