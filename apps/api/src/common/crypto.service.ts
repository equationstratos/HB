import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
} from 'crypto';
import { AppConfig } from '../config/app-config.service';

/**
 * Donnée chiffrée avec une autre clé que DATA_ENCRYPTION_KEY : en pratique, un nouveau
 * apps/api/.env (nouvelle installation, nouveau téléchargement) sur une base existante.
 */
export class EncryptionKeyMismatchError extends Error {
  constructor() {
    super(
      'Donnée chiffrée illisible avec DATA_ENCRYPTION_KEY : la clé de apps/api/.env a changé ' +
        'depuis son enregistrement (voir README, section « Dépannage »).',
    );
    this.name = 'EncryptionKeyMismatchError';
  }
}

/** Chiffrement des secrets au repos et génération d'aléas sûrs. */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    this.key = Buffer.from(config.get('DATA_ENCRYPTION_KEY'), 'base64');
  }

  /** AES-256-GCM. Format : iv.tag.chiffré, en base64url. */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, data].map((b) => b.toString('base64url')).join('.');
  }

  decrypt(payload: string): string {
    const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
    if (!iv || !tag || !data) throw new Error('Donnée chiffrée invalide');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      // Étiquette d'authentification refusée : la donnée a été chiffrée avec une autre clé.
      throw new EncryptionKeyMismatchError();
    }
  }

  /** Vrai si la donnée se déchiffre avec la clé actuelle. */
  canDecrypt(payload: string): boolean {
    try {
      this.decrypt(payload);
      return true;
    } catch {
      return false;
    }
  }

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  hmac(value: string): string {
    return createHmac('sha256', this.key).update(value).digest('hex');
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  randomDigits(length: number): string {
    let out = '';
    for (let i = 0; i < length; i++) out += String(randomInt(0, 10));
    return out;
  }

  pick<T>(items: readonly T[]): T {
    return items[randomInt(0, items.length)]!;
  }
}
