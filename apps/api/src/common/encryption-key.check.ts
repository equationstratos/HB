import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from './crypto.service';

/**
 * Au démarrage : les secrets déjà chiffrés en base (2FA des admins, IBAN des gardes) doivent
 * se déchiffrer avec DATA_ENCRYPTION_KEY. Sinon, le .env a été recréé (nouvelle installation,
 * nouveau téléchargement) sur une base existante : on le dit tout de suite, avec la solution,
 * au lieu d'erreurs à la connexion.
 */
@Injectable()
export class EncryptionKeyCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger('Chiffrement');

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const [admins, accounts] = await Promise.all([
        this.prisma.user.findMany({
          where: { totpSecret: { not: null } },
          select: { email: true, totpSecret: true },
          take: 20,
        }),
        this.prisma.guardBankAccount.count(),
      ]);
      const unreadable = admins.filter((u) => !this.crypto.canDecrypt(u.totpSecret!));
      const sample = await this.prisma.guardBankAccount.findFirst({
        select: { ibanEncrypted: true },
      });
      const ibansUnreadable = !!sample && !this.crypto.canDecrypt(sample.ibanEncrypted);
      if (unreadable.length === 0 && !ibansUnreadable) return;
      this.logger.error(
        [
          'DATA_ENCRYPTION_KEY (apps/api/.env) ne correspond pas aux données déjà enregistrées :',
          ...(unreadable.length > 0
            ? [
                `  - double authentification illisible pour : ${unreadable.map((u) => u.email).join(', ')}`,
              ]
            : []),
          ...(ibansUnreadable ? [`  - IBAN des gardes illisibles (${accounts} compte(s))`] : []),
          'Solutions :',
          '  1. Reprendre DATA_ENCRYPTION_KEY dans le apps/api/.env de l’installation précédente ;',
          '  2. ou réinitialiser la double authentification : pnpm --filter @hb/api run admin:reset-mfa <email>',
          '     (les gardes devront aussi ressaisir leur IBAN).',
        ].join('\n'),
      );
    } catch (error) {
      this.logger.warn(`Vérification de la clé de chiffrement impossible : ${String(error)}`);
    }
  }
}
