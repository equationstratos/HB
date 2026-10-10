/**
 * Code de vérification du téléphone renvoyé par un serveur de test, où aucun SMS ne part.
 * Gardé en mémoire entre l'inscription et l'écran de vérification, pour une seule utilisatrice.
 */
let pending: { userId: string; code: string } | null = null;

export function rememberPhoneTestCode(userId: string, code: string | undefined): void {
  pending = code ? { userId, code } : null;
}

export function phoneTestCode(userId: string | undefined): string | null {
  return pending && pending.userId === userId ? pending.code : null;
}
