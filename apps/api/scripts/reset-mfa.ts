// Réinitialise la double authentification d'un compte, depuis l'ordinateur du serveur :
//   pnpm --filter @hb/api run admin:reset-mfa admin@hb.local
// À la connexion suivante, l'admin scanne un nouveau QR code (Authy, Google Authenticator…).
// Utile quand le secret enregistré ne se déchiffre plus (DATA_ENCRYPTION_KEY changée) ou que
// le téléphone a été perdu. Ses sessions sont fermées et l'opération est tracée.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage : pnpm --filter @hb/api run admin:reset-mfa <email>');
    process.exitCode = 1;
    return;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Aucun compte avec l’email ${email}.`);
    process.exitCode = 1;
    return;
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.auditLog.create({
      data: {
        actorRole: 'SYSTEM',
        action: 'auth.mfa_reset',
        entityType: 'User',
        entityId: user.id,
        metadata: { via: 'ligne de commande' },
      },
    }),
  ]);
  console.log(
    `Double authentification réinitialisée pour ${email}. À la prochaine connexion, ` +
      'scannez le nouveau QR code dans votre application d’authentification.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
