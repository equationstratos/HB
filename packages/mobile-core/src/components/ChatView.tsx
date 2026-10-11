import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@hb/api-client';
import type { MessageDto, Role } from '@hb/shared';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { markMessagesSeen, useActiveChat } from '../chat-notifications';
import { fmtTime } from '../format';
import { useRealtime, useSocketEvent } from '../realtime';
import { useApi, useSession } from '../session';
import { useTheme } from '../theme';
import { ErrorText, T } from '../ui/primitives';

const ROLE_NAME: Record<Role, string> = { CLIENT: 'Cliente', GUARD: 'Garde', ADMIN: 'Équipe' };

/** Clavier affiché (événements « will » sur iOS, « did » sur Android). */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true)),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false)),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, []);
  return visible;
}

/** Messagerie d'une mission, mise à jour en temps réel. */
export function ChatView({
  missionId,
  quickReplies = [],
}: {
  missionId: string;
  quickReplies?: string[];
}) {
  const api = useApi();
  const { user } = useSession();
  const { colors, radius } = useTheme();
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const list = useRef<FlatList<MessageDto>>(null);
  const input = useRef<TextInput>(null);
  const anchor = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  // Position de la conversation dans la fenêtre (sous l'en-tête), pour remonter la barre de
  // saisie exactement au-dessus du clavier.
  const [top, setTop] = useState(0);
  useActiveChat(missionId);

  useEffect(() => {
    api.missions.messages(missionId).then(
      (loaded) => {
        setMessages(loaded);
        // Conversation ouverte : ces messages sont lus, rien à signaler plus tard.
        void markMessagesSeen(missionId, loaded).catch(() => undefined);
      },
      (e: unknown) => setError(errorMessage(e)),
    );
  }, [api, missionId]);

  useSocketEvent('chat:message', (m) => {
    if (m.missionId !== missionId) return;
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  });

  // Reconnexion du temps réel : rattrape les messages arrivés pendant la coupure.
  const { connected } = useRealtime();
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current) {
      api.missions.messages(missionId).then(
        (loaded) =>
          setMessages((prev) => [
            ...loaded,
            ...prev.filter((p) => !loaded.some((l) => l.id === p.id)),
          ]),
        () => undefined,
      );
    }
    wasConnected.current = connected;
  }, [api, missionId, connected]);

  useEffect(() => {
    if (messages.length) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length, keyboard]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      const m = await api.missions.sendMessage(missionId, trimmed);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      // Une réponse rapide n'efface pas le texte en cours de saisie.
      setBody((current) => (current.trim() === trimmed ? '' : current));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      // Android affiche l'appli bord à bord : le clavier ne redimensionne plus la fenêtre,
      // la conversation remonte donc d'elle-même sur les deux plateformes.
      behavior="padding"
      keyboardVerticalOffset={top}
    >
      {/* Repère du haut de la conversation dans la fenêtre, sous l'en-tête. */}
      <View ref={anchor} onLayout={() => anchor.current?.measureInWindow((_x, y) => setTop(y))} />
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <T variant="muted" center>
            Aucun message pour l’instant.
          </T>
        }
        renderItem={({ item }) => {
          const mine = item.senderId === user?.id;
          return (
            <View
              style={{
                alignSelf:
                  item.senderRole === 'ADMIN' ? 'center' : mine ? 'flex-end' : 'flex-start',
                maxWidth: '82%',
                backgroundColor:
                  item.senderRole === 'ADMIN'
                    ? colors.warningSoft
                    : mine
                      ? colors.primary
                      : colors.surface,
                borderRadius: radius.lg,
                borderWidth: mine ? 0 : 1,
                borderColor: colors.border,
                paddingHorizontal: 14,
                paddingVertical: 9,
              }}
            >
              {!mine && (
                <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 2 }}>
                  {ROLE_NAME[item.senderRole]}
                </Text>
              )}
              <Text style={{ color: mine ? colors.primaryText : colors.text, fontSize: 15 }}>
                {item.body}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: mine ? 'rgba(255,255,255,0.75)' : colors.textMuted,
                  marginTop: 3,
                  alignSelf: 'flex-end',
                }}
              >
                {fmtTime(item.createdAt)}
              </Text>
            </View>
          );
        }}
      />
      {quickReplies.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          {quickReplies.map((q) => (
            <Pressable
              key={q}
              onPress={() => void send(q)}
              disabled={sending}
              style={{
                minHeight: 36,
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 999,
                paddingHorizontal: 12,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 13 }}>{q}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={{ paddingHorizontal: 16 }}>
        <ErrorText error={error} />
      </View>
      {/* Toute la barre ouvre le clavier, pas seulement le texte du champ. Clavier fermé, elle
          reste au-dessus de la barre de navigation du téléphone. */}
      <Pressable
        onPress={() => input.current?.focus()}
        accessible={false}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 10,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 10 + (keyboard ? 0 : insets.bottom),
          borderTopWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <TextInput
          ref={input}
          value={body}
          onChangeText={setBody}
          placeholder="Votre message…"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Votre message"
          multiline
          style={{
            flex: 1,
            minHeight: 48,
            maxHeight: 120,
            color: colors.text,
            fontSize: 16,
            paddingHorizontal: 14,
            paddingTop: 12,
            paddingBottom: 12,
            textAlignVertical: 'center',
            borderRadius: radius.md,
            backgroundColor: colors.surfaceMuted,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
          disabled={sending || !body.trim()}
          onPress={() => void send(body)}
          hitSlop={6}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: sending || !body.trim() ? 0.5 : 1,
          }}
        >
          <Ionicons name="send" size={20} color={colors.primaryText} />
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
