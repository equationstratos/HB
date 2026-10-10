import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@hb/api-client';
import {
  Banner,
  Button,
  Card,
  Chip,
  currentPosition,
  ErrorText,
  Field,
  Row,
  Screen,
  T,
  useApi,
  useTheme,
} from '@hb/mobile-core';
import { guardDocumentTypeLabel, type GuardDocumentType } from '@hb/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const REQUIRED: GuardDocumentType[] = ['ID_CARD', 'CNAPS_CARD'];
const RADII = [5, 10, 15, 20, 30];

/** Candidature du garde : carte CNAPS, zone d'intervention, pièces justificatives. */
export default function Application() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const profile = useQuery({ queryKey: ['guard', 'me'], queryFn: () => api.guards.me() });
  const p = profile.data;
  const [cnaps, setCnaps] = useState('');
  const [bio, setBio] = useState('');
  const [base, setBase] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [radius, setRadius] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!p) return;
    setCnaps(p.cnapsCardNumber ?? '');
    setBio(p.bio ?? '');
    setRadius(p.serviceRadiusKm);
    if (p.baseLat !== null && p.baseLng !== null) setBase({ lat: p.baseLat, lng: p.baseLng });
  }, [p?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!base) return;
    Location.reverseGeocodeAsync({ latitude: base.lat, longitude: base.lng })
      .then(([a]) => setPlace(a ? (a.city ?? a.district ?? a.formattedAddress ?? null) : null))
      .catch(() => setPlace(null));
  }, [base]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['guard', 'me'] });

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    setError(null);
    setInfo(null);
    try {
      await fn();
      await refresh();
      if (success) setInfo(success);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run(
      'save',
      () => {
        if (!base) throw new Error(t('application.zoneMissing'));
        return api.guards.updateProfile({
          cnapsCardNumber: cnaps.trim(),
          bio: bio.trim() || undefined,
          baseLat: base.lat,
          baseLng: base.lng,
          serviceRadiusKm: radius,
        });
      },
      t('application.saved'),
    );

  const upload = async (type: GuardDocumentType, source: 'camera' | 'file') => {
    let file: { uri: string; name: string; type: string } | null = null;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      const asset = res.canceled ? null : res.assets[0];
      if (asset)
        file = {
          uri: asset.uri,
          name: asset.fileName ?? `${type.toLowerCase()}.jpg`,
          type: asset.mimeType ?? 'image/jpeg',
        };
    } else {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      const asset = res.canceled ? null : res.assets[0];
      if (asset)
        file = { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/pdf' };
    }
    if (file) await run(`doc-${type}`, () => api.guards.uploadDocument(type, file));
  };

  const submit = () =>
    run('submit', async () => {
      await api.guards.submit();
      router.replace('/pending');
    });

  return (
    <Screen edges={['left', 'right']}>
      {p?.status === 'REJECTED' ? (
        <Banner
          tone="danger"
          icon="alert-circle"
          title={t('application.rejected', { reason: p.rejectionReason ?? '' })}
        />
      ) : (
        p?.status !== 'APPROVED' && (
          <Banner tone="primary" icon="information-circle" title={t('application.draft')} />
        )
      )}

      <Field
        label={t('application.cnaps')}
        value={cnaps}
        onChangeText={setCnaps}
        autoCapitalize="characters"
        hint={t('application.cnapsHint')}
      />
      <Field
        label={t('application.bio')}
        value={bio}
        onChangeText={setBio}
        multiline
        maxLength={500}
      />

      <Card>
        <T variant="label">{t('application.zone')}</T>
        <T variant="muted">
          {base
            ? t('application.zoneSet', {
                place: place ?? `${base.lat.toFixed(3)}, ${base.lng.toFixed(3)}`,
              })
            : t('application.zoneMissing')}
        </T>
        <Button
          title={t('application.useMyPosition')}
          icon="locate"
          variant="secondary"
          small
          onPress={() => void currentPosition().then((pos) => pos && setBase(pos))}
        />
        <T variant="label">{t('application.radius')}</T>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {RADII.map((r) => (
            <Chip key={r} label={`${r} km`} selected={radius === r} onPress={() => setRadius(r)} />
          ))}
        </Row>
      </Card>
      <Button
        title={t('application.saveProfile')}
        variant="secondary"
        loading={busy === 'save'}
        onPress={() => void save()}
      />

      {p?.status !== 'APPROVED' && (
        <>
          <T variant="heading">{t('application.documents')}</T>
          {REQUIRED.map((type) => {
            const doc = p?.documents.find((d) => d.type === type);
            return (
              <Card key={type}>
                <Row>
                  <Ionicons
                    name={doc ? 'checkmark-circle' : 'document-outline'}
                    size={20}
                    color={doc ? colors.success : colors.textMuted}
                  />
                  <T variant="label" style={{ flex: 1 }}>
                    {guardDocumentTypeLabel[type]}
                  </T>
                </Row>
                <T variant="small">
                  {doc
                    ? t('application.docUploaded', { name: doc.originalName })
                    : t('application.docMissing')}
                </T>
                <Row gap={8}>
                  <Button
                    title={t('application.takePhoto')}
                    icon="camera"
                    variant="secondary"
                    small
                    style={{ flex: 1 }}
                    loading={busy === `doc-${type}`}
                    onPress={() => void upload(type, 'camera')}
                  />
                  <Button
                    title={t('application.pickFile')}
                    icon="folder-open"
                    variant="secondary"
                    small
                    style={{ flex: 1 }}
                    onPress={() => void upload(type, 'file')}
                  />
                </Row>
              </Card>
            );
          })}
        </>
      )}

      <ErrorText error={error} />
      {info && <T variant="muted">{info}</T>}
      {p?.status !== 'APPROVED' && (
        <Button
          title={t('application.submit')}
          icon="send"
          loading={busy === 'submit'}
          onPress={() => void submit()}
        />
      )}
    </Screen>
  );
}
