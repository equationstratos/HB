import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Field, Screen, T } from '../ui/primitives';
import { currentServerUrl, inspectServer, normalizeServerUrl, saveServerUrl } from '../server';

/**
 * Réglage de l'adresse du serveur, pour les versions de test : l'appli peut viser
 * l'ordinateur qui fait tourner l'API (même Wi-Fi) ou un serveur hébergé.
 */
export function ServerScreen() {
  const { t } = useTranslation();
  const [value, setValue] = useState(currentServerUrl());
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'outdated' | 'ko'>('idle');

  const url = value.trim() ? normalizeServerUrl(value) : '';

  const test = async () => {
    setStatus('checking');
    const check = await inspectServer(url);
    setStatus(!check.reachable ? 'ko' : check.upToDate ? 'ok' : 'outdated');
  };

  const save = async () => {
    await saveServerUrl(url);
    router.back();
  };

  return (
    <Screen>
      <T variant="title">{t('server.title')}</T>
      <T variant="muted">{t('server.hint')}</T>
      <Field
        label={t('server.label')}
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setStatus('idle');
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="192.168.1.20"
        hint={url ? t('server.resolved', { url }) : undefined}
      />
      {status === 'ok' && <Banner tone="success" icon="checkmark-circle" title={t('server.ok')} />}
      {status === 'outdated' && (
        <Banner
          tone="warning"
          icon="cloud-download-outline"
          title={t('server.outdatedTitle')}
          message={t('server.outdatedMessage')}
        />
      )}
      {status === 'ko' && (
        <Banner
          tone="danger"
          icon="close-circle"
          title={t('server.ko')}
          message={t('server.koHint')}
        />
      )}
      <Button
        title={t('server.test')}
        variant="secondary"
        icon="pulse"
        loading={status === 'checking'}
        disabled={!url}
        onPress={() => void test()}
      />
      <Button title={t('server.save')} icon="save" disabled={!url} onPress={() => void save()} />
    </Screen>
  );
}
