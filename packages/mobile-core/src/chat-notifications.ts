import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  messageAuthorLabel,
  messageExcerpt,
  pendingChatNotifications,
  type ChatMark,
  type MessageDto,
} from '@hb/shared';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { ensureNotificationChannels, loadDiscreetMode, MESSAGES_CHANNEL } from './push';
import { useSocketEvent } from './realtime';
import { applyStoredServerUrl } from './server';
import { getClient, useSession } from './session';

/**
 * Notifications des nouveaux messages, affichées par l'appli elle-même (notifications
 * locales) : les APK de test n'ont pas de service push.
 * - appli ouverte : à l'arrivée du message par le temps réel, sauf conversation à l'écran ;
 * - en arrière-plan pendant une mission : relève périodique depuis la tâche de suivi GPS.
 * Un repère par mission (dernier message traité) garantit qu'un message n'est signalé qu'une
 * fois, quel que soit le chemin par lequel il arrive.
 */

const MARKS_KEY = 'hb.chat.notified';
/** Repères conservés : les missions les plus récentes suffisent. */
const MAX_MARKS = 20;
/** Intervalle minimal entre deux relèves des messages. */
const POLL_EVERY_MS = 15_000;

type Marks = Record<string, ChatMark>;

async function readMarks(): Promise<Marks> {
  try {
    return JSON.parse((await AsyncStorage.getItem(MARKS_KEY)) ?? '{}') as Marks;
  } catch {
    return {};
  }
}

async function saveMark(marks: Marks, missionId: string, mark: ChatMark): Promise<void> {
  // Ordre d'insertion conservé : la mission mise à jour passe en dernier.
  const others = Object.entries(marks).filter(([id]) => id !== missionId);
  const kept = [...others.slice(-(MAX_MARKS - 1)), [missionId, mark] as const];
  await AsyncStorage.setItem(MARKS_KEY, JSON.stringify(Object.fromEntries(kept)));
}

let activeChat: string | null = null;

/** Conversation affichée à l'écran, appli au premier plan. */
function chatOnScreen(missionId: string): boolean {
  return activeChat === missionId && AppState.currentState === 'active';
}

let queue: Promise<void> = Promise.resolve();

/** Un traitement à la fois : le temps réel et la relève ne signalent jamais en double. */
function serialized(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

async function present(m: MessageDto): Promise<void> {
  const discreet = await loadDiscreetMode();
  await ensureNotificationChannels();
  await Notifications.scheduleNotificationAsync({
    // Un même message ne peut pas apparaître deux fois.
    identifier: `message-${m.id}`,
    content: {
      // Mode discret : ni auteur ni texte, et aucun son.
      title: discreet ? 'Nouveau message' : messageAuthorLabel[m.senderRole],
      body: discreet ? 'Ouvrez l’appli pour le lire.' : messageExcerpt(m.body),
      data: { type: 'message', missionId: m.missionId, messageId: m.id },
      sound: discreet ? false : 'default',
    },
    trigger: { channelId: MESSAGES_CHANNEL },
  });
}

function processMessages(
  missionId: string,
  messages: MessageDto[],
  selfId: string,
  silent: boolean,
): Promise<void> {
  return serialized(async () => {
    const marks = await readMarks();
    const mark = marks[missionId] ?? null;
    const res = pendingChatNotifications(messages, mark, selfId);
    if (!res.mark || res.mark === mark) return;
    await saveMark(marks, missionId, res.mark);
    if (silent || chatOnScreen(missionId)) return;
    for (const m of res.notify) await present(m);
  });
}

/** Messages affichés dans la conversation ouverte : lus, la relève ne les signalera pas. */
export function markMessagesSeen(missionId: string, messages: MessageDto[]): Promise<void> {
  return processMessages(missionId, messages, '', true);
}

let lastPoll = 0;
let polling: Promise<void> | null = null;

/**
 * Relève des nouveaux messages d'une mission en cours, au plus toutes les 15 s. Appelée par
 * la tâche de suivi GPS, qui continue de tourner appli en arrière-plan.
 */
export function pollMessages(missionId: string): Promise<void> {
  if (polling) return polling;
  if (Date.now() - lastPoll < POLL_EVERY_MS) return Promise.resolve();
  lastPoll = Date.now();
  polling = (async () => {
    // Dans la tâche en arrière-plan, l'appli peut avoir été relancée sans interface.
    await applyStoredServerUrl();
    const client = getClient();
    if (!client.accessToken) await client.restore();
    const self = client.snapshot.user?.id;
    if (!self) return;
    const mark = (await readMarks())[missionId];
    const messages = await client.api.missions.messages(missionId, mark?.createdAt);
    await processMessages(missionId, messages, self, false);
  })()
    // Réseau indisponible : la prochaine relève rattrapera les messages.
    .catch(() => undefined)
    .finally(() => {
      polling = null;
    });
  return polling;
}

/** Appli ouverte : notification à l'arrivée d'un message de l'autre personne. */
export function useMessageNotifications(): void {
  const { user } = useSession();
  useSocketEvent('chat:message', (m) => {
    if (user) void processMessages(m.missionId, [m], user.id, false).catch(() => undefined);
  });
}

async function dismissMessageNotifications(missionId: string): Promise<void> {
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    const ofMission = shown.filter((n) => {
      const data = n.request.content.data as { type?: unknown; missionId?: unknown } | null;
      return data?.type === 'message' && data.missionId === missionId;
    });
    await Promise.all(
      ofMission.map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {
    // Sans conséquence : la notification reste simplement affichée.
  }
}

/**
 * Conversation à l'écran (ChatView) : pas de notification pour ses messages, et celles déjà
 * affichées sont retirées, aussi au retour dans l'appli.
 */
export function useActiveChat(missionId: string): void {
  useFocusEffect(
    useCallback(() => {
      activeChat = missionId;
      void dismissMessageNotifications(missionId);
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void dismissMessageNotifications(missionId);
      });
      return () => {
        sub.remove();
        if (activeChat === missionId) activeChat = null;
      };
    }, [missionId]),
  );
}

const opened = new Set<string>();

/**
 * Toucher une notification de message (locale ou push) ouvre la conversation de la mission,
 * y compris quand elle a lancé l'appli. `ready` : l'espace connecté est affiché.
 */
export function useOpenChatFromNotifications(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const { identifier, content } = response.notification.request;
      const data = content.data as { type?: unknown; missionId?: unknown } | null;
      if (data?.type !== 'message' || typeof data.missionId !== 'string') return;
      if (opened.has(identifier)) return;
      opened.add(identifier);
      Notifications.clearLastNotificationResponse();
      router.navigate(`/mission/${data.missionId}/chat`);
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [ready]);
}
