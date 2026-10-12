import { errorMessage } from '@hb/api-client';
import type { MfaSetupResponse } from '@hb/shared';
import { KeyRound, Shield } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, client } from '../lib/client';

type Step =
  | { kind: 'password' }
  | { kind: 'mfa'; mfaToken: string }
  | { kind: 'setup'; mfaToken: string; enrollment: MfaSetupResponse | null };

/** Connexion admin : mot de passe puis code de double authentification (obligatoire). */
export function LoginPage() {
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await client.handleLogin(await api.auth.login({ email, password }));
      if (res.status === 'OK') {
        if (res.user.role !== 'ADMIN') {
          await client.logout();
          throw new Error('Cet espace est réservé à l’équipe de supervision.');
        }
        return;
      }
      setCode('');
      if (res.status === 'MFA_REQUIRED') setStep({ kind: 'mfa', mfaToken: res.mfaToken });
      else
        setStep({
          kind: 'setup',
          mfaToken: res.mfaToken,
          enrollment: await api.auth.mfaSetup(res.mfaToken),
        });
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (step.kind === 'password') return;
    void run(async () => {
      const res =
        step.kind === 'mfa'
          ? await api.auth.mfaVerify(step.mfaToken, code)
          : await api.auth.mfaEnable(step.mfaToken, code);
      await client.handleLogin(res);
    });
  };

  return (
    <div className="login">
      <div className="card login-card">
        <div className="brand">
          <span className="brand-mark">
            <Shield size={18} />
          </span>
          <span>
            HB<small className="muted">Supervision des protections</small>
          </span>
        </div>

        {step.kind === 'password' ? (
          <form className="stack" onSubmit={submitPassword}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <div className="error-box">{error}</div>}
            <button className="btn primary" disabled={busy}>
              Continuer
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={submitCode}>
            <div className="row">
              <KeyRound size={18} />
              <h2>
                {step.kind === 'mfa'
                  ? 'Double authentification'
                  : 'Activez la double authentification'}
              </h2>
            </div>
            {step.kind === 'setup' && (
              <>
                <p className="muted" style={{ margin: 0 }}>
                  Obligatoire pour les comptes admin. Scannez ce QR code avec votre application
                  d’authentification (Google Authenticator, Authy, 1Password…), puis saisissez le
                  code affiché.
                </p>
                {step.enrollment && (
                  <>
                    <img
                      className="qr"
                      src={step.enrollment.qrCodeDataUrl}
                      alt="QR code d’activation"
                    />
                    <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>
                      Clé manuelle : <span className="mono">{step.enrollment.secret}</span>
                    </p>
                  </>
                )}
              </>
            )}
            {step.kind === 'mfa' && (
              <p className="muted" style={{ margin: 0 }}>
                Saisissez le code à 6 chiffres de votre application d’authentification.
              </p>
            )}
            <input
              className="input code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              aria-label="Code à 6 chiffres"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            {error && <div className="error-box">{error}</div>}
            <button className="btn primary" disabled={busy || code.length !== 6}>
              Valider
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setStep({ kind: 'password' })}
            >
              Revenir
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
