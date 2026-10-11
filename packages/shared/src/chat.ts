import type { Role } from './enums';
import type { MessageDto } from './types';

/**
 * Notifications de la messagerie : qui a écrit (jamais de nom, par confidentialité),
 * extrait du message et suivi des messages déjà signalés, partagés par l'API et les applis.
 */

/** Auteur d'un message tel qu'annoncé dans une notification. */
export const messageAuthorLabel: Record<Role, string> = {
  CLIENT: 'La cliente',
  GUARD: 'Votre garde',
  ADMIN: 'L’équipe de supervision',
};

/** Au plus ce nombre de notifications d'un coup : pas de rafale après une coupure réseau. */
export const CHAT_NOTIFY_MAX = 3;

/** Sans repère (première relève), seuls les messages plus récents que ceci sont signalés. */
export const CHAT_FIRST_SYNC_WINDOW_MS = 10 * 60_000;

/** Dernier message déjà traité pour une mission (signalé, ou vu dans la conversation). */
export interface ChatMark {
  id: string;
  createdAt: string;
}

/** Extrait d'un message sur une seule ligne, pour le texte d'une notification. */
export function messageExcerpt(body: string, max = 100): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Ordre total des messages : date, puis identifiant pour départager deux messages simultanés. */
function compare(a: ChatMark, b: ChatMark): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Messages à signaler parmi ceux reçus (temps réel ou relève), et nouveau repère.
 * - seuls les messages postérieurs au repère comptent : un message n'est signalé qu'une fois,
 *   qu'il arrive par le temps réel ou par la relève en arrière-plan ;
 * - jamais ses propres messages ;
 * - sans repère, seulement les messages récents : pas de notifications pour d'anciens
 *   messages après une réinstallation.
 */
export function pendingChatNotifications(
  messages: MessageDto[],
  mark: ChatMark | null,
  selfId: string,
  now = Date.now(),
): { notify: MessageDto[]; mark: ChatMark | null } {
  const fresh = messages.filter((m) => !mark || compare(m, mark) > 0).sort((a, b) => compare(a, b));
  const last = fresh.at(-1);
  if (!last) return { notify: [], mark };
  const notify = fresh
    .filter((m) => m.senderId !== selfId)
    .filter((m) => mark || now - Date.parse(m.createdAt) <= CHAT_FIRST_SYNC_WINDOW_MS)
    .slice(-CHAT_NOTIFY_MAX);
  return { notify, mark: { id: last.id, createdAt: last.createdAt } };
}
