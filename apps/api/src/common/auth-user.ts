import { Role } from '@prisma/client';

/** Utilisateur authentifié, tel qu'extrait du jeton d'accès. */
export interface AuthUser {
  id: string;
  role: Role;
  /** La session a passé la double authentification. */
  mfa: boolean;
  /** Famille du jeton de rafraîchissement (identifie la session). */
  sessionId: string;
}

/** Contexte d'une action pour le journal d'audit. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}
