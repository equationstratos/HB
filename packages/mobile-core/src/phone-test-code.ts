/**
 * Code de vérification du téléphone renvoyé par un serveur de test, où aucun SMS ne part.
 * Gardé en mémoire entre l'inscription et l'écran de vérification, pour une seule utilisatrice
 * et jusqu'à son expiration.
 */
let pending: { userId: string; code: string; expiresAt: number } | null = null;

export function rememberPhoneTestCode(
  userId: string,
  code: string | undefined,
  expiresInSeconds = 0,
): void {
  pending = code ? { userId, code, expiresAt: Date.now() + expiresInSeconds * 1000 } : null;
}

export function phoneTestCode(userId: string | undefined): string | null {
  if (!pending || pending.userId !== userId || pending.expiresAt <= Date.now()) return null;
  return pending.code;
}
