import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@hb/api-client';
import {
  Banner,
  Button,
  Card,
  Chip,
  currentPosition,
  ErrorText,
  RouteMap,
  Row,
  T,
  useApi,
  useTheme,
} from '@hb/mobile-core';
import {
  formatDistance,
  formatDuration,
  transportModeLabel,
  TRANSPORT_MODES,
  type ComputedRoute,
  type RouteWaypoint,
  type TransportMode,
} from '@hb/shared';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';

export type Slot = RouteWaypoint | null;

const MODE_ICONS = { WALK: 'walk', BIKE: 'bicycle', CAR: 'car', TRANSIT: 'bus' } as const;

async function describe(lat: number, lng: number): Promise<string | null> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!a) return null;
    return a.formattedAddress ?? [a.streetNumber, a.street, a.city].filter(Boolean).join(' ');
  } catch {
    return null;
  }
}

/**
 * Construction du trajet surveillé : départ, étapes, arrivée, mode de déplacement.
 * L'itinéraire est recalculé à chaque changement pour un aperçu fidèle.
 */
export function RouteBuilder({
  initialSlots,
  initialMode = 'WALK',
  departureAt,
  onChange,
}: {
  initialSlots?: Slot[];
  initialMode?: TransportMode;
  /** Heure de départ prévue, pour annoncer l'heure d'arrivée (maintenant par défaut). */
  departureAt?: Date | null;
  onChange: (value: {
    mode: TransportMode;
    points: RouteWaypoint[];
    preview: ComputedRoute | null;
  }) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const { colors, radius } = useTheme();
  const [slots, setSlots] = useState<Slot[]>(initialSlots ?? [null, null]);
  const [texts, setTexts] = useState<string[]>(
    (initialSlots ?? [null, null]).map((s) => s?.address ?? ''),
  );
  const [mode, setMode] = useState<TransportMode>(initialMode);
  const [active, setActive] = useState(initialSlots ? -1 : 0);
  const [preview, setPreview] = useState<ComputedRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const labelOf = (i: number) =>
    i === 0 ? t('book.start') : i === slots.length - 1 ? t('book.end') : t('book.stop', { n: i });
  const points = slots.filter((s): s is RouteWaypoint => !!s);
  const complete = slots.every(Boolean) && slots.length >= 2;

  // Position actuelle comme départ par défaut.
  useEffect(() => {
    if (initialSlots) return;
    void (async () => {
      const pos = await currentPosition();
      if (!pos) return;
      const address = (await describe(pos.lat, pos.lng)) ?? t('book.myPosition');
      setSlots((s) => (s[0] ? s : [{ ...pos, address }, ...s.slice(1)]));
      setTexts((tx) => (tx[0] ? tx : [address, ...tx.slice(1)]));
      setActive((a) => (a === 0 ? 1 : a));
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Aperçu de l'itinéraire dès que le trajet est complet.
  useEffect(() => {
    if (!complete) {
      setPreview(null);
      onChange({ mode, points, preview: null });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setBusy(true);
      api.routes
        .preview({ mode, points })
        .then((route) => {
          if (cancelled) return;
          setPreview(route);
          setError(null);
          onChange({ mode, points, preview: route });
        })
        .catch((e: unknown) => !cancelled && setError(errorMessage(e)))
        .finally(() => !cancelled && setBusy(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [JSON.stringify(slots), mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSlot = (i: number, value: Slot, text?: string) => {
    setSlots((s) => s.map((x, j) => (j === i ? value : x)));
    if (text !== undefined) setTexts((tx) => tx.map((x, j) => (j === i ? text : x)));
  };

  const search = async (i: number) => {
    const query = texts[i]?.trim();
    if (!query) return;
    setError(null);
    try {
      const [hit] = await Location.geocodeAsync(query);
      if (!hit) throw new Error(t('book.notFound'));
      setSlot(i, { lat: hit.latitude, lng: hit.longitude, address: query });
      setActive(slots.findIndex((s, j) => j > i && !s));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const fillWithMyPosition = async (i: number) => {
    const pos = await currentPosition();
    if (!pos) return;
    const address = (await describe(pos.lat, pos.lng)) ?? t('book.myPosition');
    setSlot(i, { ...pos, address }, address);
  };

  const onMapPress = async (p: { lat: number; lng: number }) => {
    const target = active >= 0 ? active : slots.findIndex((s) => !s);
    if (target < 0) return;
    const address = (await describe(p.lat, p.lng)) ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
    setSlot(target, { ...p, address }, address);
    const next = slots.findIndex((s, j) => j !== target && !s);
    setActive(next);
  };

  const addStop = () => {
    const at = slots.length - 1;
    setSlots((s) => [...s.slice(0, at), null, ...s.slice(at)]);
    setTexts((tx) => [...tx.slice(0, at), '', ...tx.slice(at)]);
    setActive(at);
  };

  const removeStop = (i: number) => {
    setSlots((s) => s.filter((_, j) => j !== i));
    setTexts((tx) => tx.filter((_, j) => j !== i));
    setActive(-1);
  };

  return (
    <View style={{ gap: 14 }}>
      <RouteMap
        line={preview?.geometry.coordinates}
        waypoints={points}
        onPress={(p) => void onMapPress(p)}
        height={260}
      />
      {active >= 0 && active < slots.length && (
        <T variant="small">{t('book.tapMap', { label: labelOf(active) })}</T>
      )}

      <Card style={{ gap: 10 }}>
        {slots.map((slot, i) => (
          <View key={i} style={{ gap: 6 }}>
            <Row>
              <Ionicons
                name={
                  i === 0
                    ? 'radio-button-on'
                    : i === slots.length - 1
                      ? 'location'
                      : 'ellipse-outline'
                }
                size={16}
                color={
                  i === 0
                    ? colors.success
                    : i === slots.length - 1
                      ? colors.primary
                      : colors.warning
                }
              />
              <T variant="label" style={{ flex: 1 }}>
                {labelOf(i)}
              </T>
              {i > 0 && i < slots.length - 1 && (
                <Pressable onPress={() => removeStop(i)} accessibilityLabel="Retirer l’étape">
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </Pressable>
              )}
            </Row>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: active === i ? colors.primary : colors.border,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
                paddingLeft: 12,
              }}
            >
              <TextInput
                value={texts[i] ?? ''}
                onChangeText={(v) => setTexts((tx) => tx.map((x, j) => (j === i ? v : x)))}
                onFocus={() => setActive(i)}
                onSubmitEditing={() => void search(i)}
                returnKeyType="search"
                placeholder={t('book.addressPlaceholder')}
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, paddingVertical: 11, color: colors.text, fontSize: 15 }}
              />
              {slot && (
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={colors.success}
                  style={{ marginRight: 6 }}
                />
              )}
              <Pressable
                onPress={() => void search(i)}
                style={{ padding: 10 }}
                accessibilityLabel={t('book.search')}
              >
                <Ionicons name="search" size={18} color={colors.primary} />
              </Pressable>
              {i === 0 && (
                <Pressable
                  onPress={() => void fillWithMyPosition(i)}
                  style={{ padding: 10 }}
                  accessibilityLabel={t('book.myPosition')}
                >
                  <Ionicons name="locate" size={18} color={colors.primary} />
                </Pressable>
              )}
            </View>
          </View>
        ))}
        {slots.length < 10 && (
          <Button title={t('book.addStop')} icon="add" variant="ghost" small onPress={addStop} />
        )}
      </Card>

      <T variant="label">{t('book.mode')}</T>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {TRANSPORT_MODES.map((m) => (
          <Chip
            key={m}
            label={transportModeLabel[m]}
            icon={MODE_ICONS[m]}
            selected={mode === m}
            onPress={() => setMode(m)}
          />
        ))}
      </Row>
      {mode === 'TRANSIT' && <T variant="small">{t('book.transitHint')}</T>}

      {preview && (
        <Banner
          tone="primary"
          icon="navigate"
          title={t('book.summary', {
            distance: formatDistance(preview.distanceMeters),
            duration: formatDuration(preview.durationSeconds),
            eta: new Date(
              (departureAt?.getTime() ?? Date.now()) + preview.durationSeconds * 1000,
            ).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          })}
          message={preview.approximate ? t('book.approximate') : undefined}
        />
      )}
      {busy && <T variant="small">{t('common.loading')}</T>}
      <ErrorText error={error} />
    </View>
  );
}
