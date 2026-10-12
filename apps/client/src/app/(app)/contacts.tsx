import { errorMessage } from '@hb/api-client';
import { Button, Card, ErrorText, Field, Row, Screen, T, useApi } from '@hb/mobile-core';
import { normalizePhone } from '@hb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function Contacts() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api.me.contacts() });
  const [form, setForm] = useState({ name: '', phone: '', relation: '' });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['contacts'] });
  const add = useMutation({
    mutationFn: () =>
      api.me.addContact({
        name: form.name.trim(),
        phone: normalizePhone(form.phone),
        relation: form.relation.trim() || undefined,
      }),
    onSuccess: () => {
      setForm({ name: '', phone: '', relation: '' });
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.me.removeContact(id),
    onSuccess: refresh,
  });

  return (
    <Screen edges={['left', 'right']}>
      <T variant="muted">{t('profile.contactsHint')}</T>
      {contacts.data?.length === 0 && <T variant="muted">{t('contacts.empty')}</T>}
      {contacts.data?.map((c) => (
        <Card key={c.id}>
          <Row>
            <T variant="label" style={{ flex: 1 }}>
              {c.name} {c.relation ? `(${c.relation})` : ''}
            </T>
            <Button
              title={t('contacts.remove')}
              variant="ghost"
              small
              onPress={() => remove.mutate(c.id)}
            />
          </Row>
          <T variant="muted">{c.phone}</T>
        </Card>
      ))}
      <Card>
        <Field
          label={t('contacts.name')}
          value={form.name}
          onChangeText={(name) => setForm({ ...form, name })}
        />
        <Field
          label={t('contacts.phone')}
          value={form.phone}
          onChangeText={(phone) => setForm({ ...form, phone })}
          keyboardType="phone-pad"
          placeholder="06 12 34 56 78"
        />
        <Field
          label={t('contacts.relation')}
          value={form.relation}
          onChangeText={(relation) => setForm({ ...form, relation })}
        />
        <ErrorText error={add.error ? errorMessage(add.error) : null} />
        <Button
          title={t('contacts.add')}
          icon="person-add"
          loading={add.isPending}
          disabled={!form.name || !form.phone}
          onPress={() => add.mutate()}
        />
      </Card>
    </Screen>
  );
}
