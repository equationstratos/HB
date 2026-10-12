import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditOptions {
  action: string;
  entityType?: string;
  /** Paramètre de route portant l'identifiant de l'entité (par défaut « id »). */
  idParam?: string;
}

/** Journalise automatiquement l'action après une réponse réussie. */
export const Audit = (action: string, entityType?: string, idParam = 'id') =>
  SetMetadata(AUDIT_KEY, { action, entityType, idParam } satisfies AuditOptions);
