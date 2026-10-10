import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@hb/api-client';
import { normalizePhone } from '@hb/shared';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { phoneTestCode, rememberPhoneTestCode } from '../phone-test-code';
import { getClient, useApi, useSession } from '../session';
import { useTheme } from '../theme';
import { Banner, Button, Card, ErrorText, Field, Row, Screen, T } from '../ui/primitives';

/*
 * Écrans d'authentification partagés par les deux applis. Ils lisent leurs textes dans les
 * clés « auth.* », « verifyPhone.* », « consent.* », « security.* » et « common.* » de l'appli.
 */

export function LoginScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = mfaToken
        ? await api.auth.mfaVerify(mfaToken, code)
        : await api.auth.login({ email: email.trim(), password });
      if (res.status === 'MFA_REQUIRED') setMfaToken(res.mfaToken);
      else if (res.status === 'MFA_SETUP_REQUIRED')
        setError('Ce compte doit se connecter depuis l’espace de supervision.');
      else {
        await getClient().handleLogin(res);
        router.replace('/');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="title">{mfaToken ? t('auth.mfaTitle') : t('auth.loginTitle')}</T>
      {mfaToken ? (
        <>
          <T variant="muted">{t('auth.mfaHint')}</T>
          <Field
            label={t('auth.code')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
          />
        </>
      ) : (
        <>
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="username"
          />
          <Field
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
          />
        </>
      )}
      <ErrorText error={error} />
      <Button
        title={t('auth.submitLogin')}
        onPress={() => void submit()}
        loading={busy}
        disabled={mfaToken ? code.length !== 6 : !email || !password}
      />
      <Button
        title={t('common.back')}
        variant="ghost"
        onPress={() => (mfaToken ? setMfaToken(null) : router.back())}
      />
    </Screen>
  );
}

export function RegisterScreen({ role }: { role: 'CLIENT' | 'GUARD' }) {
  const { t } = useTranslation();
  const api = useApi();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const res = await api.auth.register({
        ...form,
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: normalizePhone(form.phone),
        role,
      });
      rememberPhoneTestCode(res.user.id, res.phoneCode?.testCode);
      await getClient().handleLogin(res);
      router.replace('/');
    } catch (e) {
      const fieldErrors =
        (e as { fieldErrors?: { path: string; message: string }[] }).fieldErrors ?? [];
      setErrors(Object.fromEntries(fieldErrors.map((f) => [f.path, f.message])));
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="title">{t('auth.registerTitle')}</T>
      <Row gap={12}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('auth.firstName')}
            value={form.firstName}
            onChangeText={set('firstName')}
            autoComplete="given-name"
            error={errors.firstName}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t('auth.lastName')}
            value={form.lastName}
            onChangeText={set('lastName')}
            autoComplete="family-name"
            error={errors.lastName}
          />
        </View>
      </Row>
      <Field
        label={t('auth.email')}
        value={form.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={errors.email}
      />
      <Field
        label={t('auth.phone')}
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="06 12 34 56 78"
        hint={t('auth.phoneHint')}
        error={errors.phone}
      />
      <Field
        label={t('auth.password')}
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint={t('auth.passwordHint')}
        error={errors.password}
      />
      <T variant="small">{t('auth.terms')}</T>
      <ErrorText error={error} />
      <Button
        title={t('auth.submitRegister')}
        onPress={() => void submit()}
        loading={busy}
        disabled={Object.values(form).some((v) => !v)}
      />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

export function VerifyPhoneScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const { user } = useSession();
  // Serveur de test : aucun SMS ne part, le code fourni par l'API est affiché et pré-rempli.
  const [testCode, setTestCode] = useState(() => phoneTestCode(user?.id));
  const [code, setCode] = useState(testCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.auth.verifyPhone(code);
      if (user) rememberPhoneTestCode(user.id, undefined);
      getClient().setUser(await api.me.get());
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      const sent = await api.auth.sendPhoneCode();
      setInfo(t('verifyPhone.sent'));
      if (sent.testCode) {
        if (user) rememberPhoneTestCode(user.id, sent.testCode);
        setTestCode(sent.testCode);
        setCode(sent.testCode);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen>
      <T variant="title">{t('verifyPhone.title')}</T>
      <T variant="muted">{t('verifyPhone.subtitle', { phone: user?.phone ?? '' })}</T>
      {testCode && (
        <Banner
          tone="warning"
          icon="flask-outline"
          title={t('verifyPhone.testTitle')}
          message={t('verifyPhone.testMessage', { code: testCode })}
        />
      )}
      <Field
        label={t('auth.code')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        autoFocus
        style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
      />
      <ErrorText error={error} />
      {info && <T variant="muted">{info}</T>}
      <Button
        title={t('common.continue')}
        onPress={() => void verify()}
        loading={busy}
        disabled={code.length !== 6}
      />
      <Button title={t('verifyPhone.resend')} variant="ghost" onPress={() => void resend()} />
      <Button
        title={t('profile.logout')}
        variant="ghost"
        onPress={() => void getClient().logout()}
      />
    </Screen>
  );
}

export function ConsentScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    try {
      getClient().setUser(await api.me.consent(true));
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        <Ionicons name="location" size={56} color={colors.primary} />
      </View>
      <T variant="title" center>
        {t('consent.title')}
      </T>
      <T variant="muted" center>
        {t('consent.subtitle')}
      </T>
      <Card>
        {(['point1', 'point2', 'point3'] as const).map((k) => (
          <Row key={k} gap={10} style={{ alignItems: 'flex-start' }}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <T style={{ flex: 1 }}>{t(`consent.${k}`)}</T>
          </Row>
        ))}
      </Card>
      <ErrorText error={error} />
      <Button title={t('consent.accept')} onPress={() => void accept()} loading={busy} />
    </Screen>
  );
}

/** Activation facultative de la double authentification. */
export function SecurityScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const { user } = useSession();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user?.mfaEnabled) {
    return (
      <Screen>
        <Banner tone="success" icon="shield-checkmark" title={t('security.enabled')} />
      </Screen>
    );
  }

  const start = async () => {
    setError(null);
    try {
      const res = await api.auth.selfMfaSetup();
      setSetup(res);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.auth.selfMfaEnable(code);
      getClient().setUser(await api.me.get());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="muted">{t('security.intro')}</T>
      {!setup ? (
        <Button title={t('security.start')} icon="shield-checkmark" onPress={() => void start()} />
      ) : (
        <>
          <Button
            title={t('security.openApp')}
            variant="secondary"
            icon="open-outline"
            onPress={() => void Linking.openURL(setup.otpauthUrl)}
          />
          <T variant="muted">{t('security.secret', { secret: setup.secret })}</T>
          <Button
            title={t('security.copy')}
            variant="ghost"
            icon="copy-outline"
            onPress={() => void Clipboard.setStringAsync(setup.secret)}
          />
          <Field
            label={t('auth.code')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
          />
          <Button
            title={t('security.confirm')}
            onPress={() => void confirm()}
            loading={busy}
            disabled={code.length !== 6}
          />
        </>
      )}
      <ErrorText error={error} />
    </Screen>
  );
}
