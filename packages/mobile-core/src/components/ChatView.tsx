import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@hb/api-client';
import type { MessageDto, Role } from '@hb/shared';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fmtTime } from '../format';
import { useSocketEvent } from '../realtime';
import { useApi, useSession } from '../session';
import { useTheme } from '../theme';
import { ErrorText, T } from '../ui/primitives';

const ROLE_NAME: Record<Role, string> = { CLIENT: 'Cliente', GUARD: 'Garde', ADMIN: 'Équipe' };

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

  useEffect(() => {
    api.missions.messages(missionId).then(setMessages, (e: unknown) => setError(errorMessage(e)));
  }, [api, missionId]);

  useSocketEvent('chat:message', (m) => {
    if (m.missionId !== missionId) return;
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  });

  useEffect(() => {
    if (messages.length) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      const m = await api.missions.sendMessage(missionId, trimmed);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setBody('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 }}>
          {quickReplies.map((q) => (
            <Pressable
              key={q}
              onPress={() => void send(q)}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
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
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          padding: 12,
          borderTopWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Votre message…"
          placeholderTextColor={colors.textMuted}
          multiline
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 15,
            maxHeight: 110,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceMuted,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
          disabled={sending || !body.trim()}
          onPress={() => void send(body)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: sending || !body.trim() ? 0.5 : 1,
          }}
        >
          <Ionicons name="send" size={18} color={colors.primaryText} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
