import { describe, expect, it } from 'vitest';
import { CHAT_NOTIFY_MAX, messageExcerpt, pendingChatNotifications } from '../chat';
import { messageListQuerySchema } from '../schemas';
import type { MessageDto } from '../types';

const NOW = Date.parse('2026-10-10T18:00:00.000Z');
const CLIENT = 'cliente-1';
const GUARD = 'garde-1';

function msg(id: string, senderId: string, secondsAgo: number): MessageDto {
  return {
    id,
    missionId: 'mission-1',
    senderId,
    senderRole: senderId === GUARD ? 'GUARD' : 'CLIENT',
    body: `Message ${id}`,
    createdAt: new Date(NOW - secondsAgo * 1000).toISOString(),
  };
}

describe('messageExcerpt', () => {
  it('garde un message court tel quel, sur une ligne', () => {
    expect(messageExcerpt('  Je suis\nderrière   vous ')).toBe('Je suis derrière vous');
  });

  it('coupe un message long avec des points de suspension', () => {
    const excerpt = messageExcerpt('a'.repeat(300), 100);
    expect(excerpt).toHaveLength(100);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});

describe('pendingChatNotifications', () => {
  it('signale les messages de l’autre personne, jamais les siens', () => {
    const messages = [msg('m1', GUARD, 30), msg('m2', CLIENT, 20), msg('m3', GUARD, 10)];
    const res = pendingChatNotifications(messages, null, CLIENT, NOW);
    expect(res.notify.map((m) => m.id)).toEqual(['m1', 'm3']);
    expect(res.mark).toEqual({ id: 'm3', createdAt: messages[2]!.createdAt });
  });

  it('ne signale qu’une fois un message reçu deux fois (temps réel puis relève)', () => {
    const m1 = msg('m1', GUARD, 10);
    const first = pendingChatNotifications([m1], null, CLIENT, NOW);
    expect(first.notify).toHaveLength(1);
    const again = pendingChatNotifications([m1], first.mark, CLIENT, NOW);
    expect(again.notify).toHaveLength(0);
    expect(again.mark).toBe(first.mark);
  });

  it('avance le repère sur ses propres messages sans rien signaler', () => {
    const mine = msg('m1', CLIENT, 5);
    const res = pendingChatNotifications([mine], null, CLIENT, NOW);
    expect(res.notify).toHaveLength(0);
    expect(res.mark?.id).toBe('m1');
  });

  it('trie les messages et départage deux messages de la même milliseconde', () => {
    const a = msg('a', GUARD, 10);
    const b = { ...msg('b', GUARD, 10), createdAt: a.createdAt };
    const res = pendingChatNotifications([b, a], { id: 'a', createdAt: a.createdAt }, CLIENT, NOW);
    expect(res.notify.map((m) => m.id)).toEqual(['b']);
  });

  it('sans repère, ignore les anciens messages mais avance le repère', () => {
    const res = pendingChatNotifications([msg('old', GUARD, 3600)], null, CLIENT, NOW);
    expect(res.notify).toHaveLength(0);
    expect(res.mark?.id).toBe('old');
  });

  it('avec un repère, signale même un message ancien resté en attente', () => {
    const mark = { id: 'm0', createdAt: new Date(NOW - 7200_000).toISOString() };
    const res = pendingChatNotifications([msg('m1', GUARD, 3600)], mark, CLIENT, NOW);
    expect(res.notify.map((m) => m.id)).toEqual(['m1']);
  });

  it('limite le nombre de notifications d’un coup aux plus récentes', () => {
    const messages = Array.from({ length: 6 }, (_, i) => msg(`m${i}`, GUARD, 60 - i));
    const res = pendingChatNotifications(messages, null, CLIENT, NOW);
    expect(res.notify).toHaveLength(CHAT_NOTIFY_MAX);
    expect(res.notify.at(-1)?.id).toBe('m5');
  });
});

describe('messageListQuerySchema', () => {
  it('accepte une date ISO ou rien, refuse le reste', () => {
    expect(messageListQuerySchema.parse({})).toEqual({});
    expect(messageListQuerySchema.parse({ after: '2026-10-10T18:00:00.000Z' }).after).toBe(
      '2026-10-10T18:00:00.000Z',
    );
    expect(messageListQuerySchema.safeParse({ after: 'hier' }).success).toBe(false);
  });
});
