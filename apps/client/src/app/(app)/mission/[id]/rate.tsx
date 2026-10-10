import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@hb/api-client';
import { Button, ErrorText, Field, Row, Screen, T, useApi } from '@hb/mobile-core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

export default function Rate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.missions.rate(id, { score, comment: comment.trim() || undefined });
      void queryClient.invalidateQueries({ queryKey: ['mission', id] });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['left', 'right']}>
      <T variant="heading">{t('rate.title')}</T>
      <Row gap={10} style={{ justifyContent: 'center', paddingVertical: 12 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Pressable
            key={i}
            onPress={() => setScore(i)}
            accessibilityRole="button"
            accessibilityLabel={`${i} sur 5`}
          >
            <Ionicons name={i <= score ? 'star' : 'star-outline'} size={40} color="#F5A524" />
          </Pressable>
        ))}
      </Row>
      <Field
        label={t('rate.comment')}
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={1000}
      />
      <ErrorText error={error} />
      <Button title={t('rate.submit')} onPress={() => void submit()} loading={busy} />
    </Screen>
  );
}
