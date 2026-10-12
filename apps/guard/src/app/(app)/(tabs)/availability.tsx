import { errorMessage } from '@hb/api-client';
import { Button, Card, ErrorText, Row, Screen, T, useApi, useTheme } from '@hb/mobile-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, Text } from 'react-native';

interface Day {
  enabled: boolean;
  start: number;
  end: number;
}

const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;
const DEFAULT: Day = { enabled: false, start: 18 * 60, end: 24 * 60 };

function Stepper({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const { colors } = useTheme();
  const btn = (label: string, delta: number) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => onChange(Math.min(max, Math.max(min, value + delta)))}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
  return (
    <Row gap={6}>
      {btn('−', -30)}
      <T variant="label" style={{ minWidth: 52, textAlign: 'center' }}>
        {fmt(value)}
      </T>
      {btn('+', 30)}
    </Row>
  );
}

/** Créneaux hebdomadaires pendant lesquels le garde accepte des réservations programmées. */
export default function Availability() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const profile = useQuery({ queryKey: ['guard', 'me'], queryFn: () => api.guards.me() });
  const [days, setDays] = useState<Day[]>(Array.from({ length: 7 }, () => ({ ...DEFAULT })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const labels = t('availability.days', { returnObjects: true }) as string[];

  useEffect(() => {
    if (!profile.data) return;
    const next = Array.from({ length: 7 }, () => ({ ...DEFAULT }));
    for (const s of profile.data.availability)
      next[s.dayOfWeek - 1] = { enabled: true, start: s.startMinute, end: s.endMinute };
    setDays(next);
  }, [profile.data]);

  const update = (i: number, patch: Partial<Day>) =>
    setDays((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const slots = days
        .map((d, i) => ({
          dayOfWeek: i + 1,
          startMinute: d.start,
          endMinute: d.end,
          enabled: d.enabled,
        }))
        .filter((s) => s.enabled && s.startMinute < s.endMinute)
        .map(({ enabled: _enabled, ...s }) => s);
      await api.guards.setAvailability({ slots, timezone: 'Europe/Paris' });
      await queryClient.invalidateQueries({ queryKey: ['guard', 'me'] });
      setInfo(t('availability.saved'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="title">{t('availability.title')}</T>
      <T variant="muted">{t('availability.hint')}</T>
      {days.map((d, i) => (
        <Card key={i} style={{ paddingVertical: 12 }}>
          <Row>
            <T variant="label" style={{ flex: 1 }}>
              {labels[i]}
            </T>
            <Switch
              value={d.enabled}
              onValueChange={(v) => update(i, { enabled: v })}
              trackColor={{ true: colors.primary }}
            />
          </Row>
          {d.enabled && (
            <Row style={{ justifyContent: 'space-between' }}>
              <Stepper
                value={d.start}
                min={0}
                max={d.end - 30}
                onChange={(v) => update(i, { start: v })}
              />
              <T variant="muted">→</T>
              <Stepper
                value={d.end}
                min={d.start + 30}
                max={1440}
                onChange={(v) => update(i, { end: v })}
              />
            </Row>
          )}
        </Card>
      ))}
      <ErrorText error={error} />
      {info && <T variant="muted">{info}</T>}
      <Button
        title={t('availability.save')}
        icon="save"
        loading={busy}
        onPress={() => void save()}
      />
    </Screen>
  );
}
