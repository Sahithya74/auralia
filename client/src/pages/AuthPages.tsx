import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Orb } from '../components/companion/Orb';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Form';
import { Banner, Card } from '../components/ui/Layout';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/api/client';
import { authApi } from '../lib/api/endpoints';

function useAuthError() {
  const { t } = useTranslation();
  return (err: unknown) => {
    const code = err instanceof ApiError ? err.code : 'UNKNOWN';
    return t(`auth.errors.${code}`, { defaultValue: t('common.error') });
  };
}

function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <main id="main" className="flex flex-col items-center gap-5">
        <Link to="/" aria-label="Anbu">
          <Orb size={72} variant="home" />
        </Link>
        <h1 className="font-display text-center text-3xl font-semibold text-ink">{title}</h1>
        <Card className="w-full">{children}</Card>
        {footer && <div className="text-center text-ink-soft">{footer}</div>}
      </main>
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const describeError = useAuthError();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(user.onboardingCompleted ? (from && from !== '/login' ? from : '/home') : '/onboarding', { replace: true });
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link className="font-semibold text-terracotta-600 underline-offset-4 hover:underline" to="/register">
            {t('auth.registerLink')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Banner tone="error">{error}</Banner>}
        <TextField label={t('auth.emailLabel')} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label={t('auth.passwordLabel')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" size="lg" block loading={busy}>
          {t('auth.loginSubmit')}
        </Button>
        <Link to="/forgot-password" className="text-center font-semibold text-terracotta-600 underline-offset-4 hover:underline">
          {t('auth.forgot')}
        </Link>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const describeError = useAuthError();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tooShort = password.length > 0 && password.length < 8;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return;
    setBusy(true);
    setError(null);
    try {
      await register({ name, email, password });
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.registerTitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link className="font-semibold text-terracotta-600 underline-offset-4 hover:underline" to="/login">
            {t('auth.signInLink')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Banner tone="error">{error}</Banner>}
        <TextField
          label={t('auth.nameLabel')}
          placeholder={t('auth.namePlaceholder')}
          autoComplete="given-name"
          maxLength={80}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField label={t('auth.emailLabel')} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label={t('auth.passwordLabel')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint')}
          error={tooShort ? t('auth.passwordHint') : undefined}
          minLength={8}
          maxLength={128}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" block loading={busy} disabled={!name.trim() || !email || password.length < 8}>
          {t('auth.registerSubmit')}
        </Button>
        <p className="text-center text-sm text-ink-faint">{t('welcome.aiNote')}</p>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const describeError = useAuthError();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.forgotTitle')}
      footer={
        <Link className="font-semibold text-terracotta-600 underline-offset-4 hover:underline" to="/login">
          {t('auth.backToSignIn')}
        </Link>
      }
    >
      {sent ? (
        <Banner tone="success">{t('auth.forgotSent')}</Banner>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <p className="text-ink-soft">{t('auth.forgotIntro')}</p>
          {error && <Banner tone="error">{error}</Banner>}
          <TextField label={t('auth.emailLabel')} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="lg" block loading={busy} disabled={!email}>
            {t('auth.forgotSubmit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const describeError = useAuthError();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mismatch || password.length < 8) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.resetTitle')}
      footer={
        <Link className="font-semibold text-terracotta-600 underline-offset-4 hover:underline" to="/login">
          {t('auth.backToSignIn')}
        </Link>
      }
    >
      {!token ? (
        <Banner tone="error">{t('auth.missingToken')}</Banner>
      ) : done ? (
        <Banner tone="success">{t('auth.resetDone')}</Banner>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {error && <Banner tone="error">{error}</Banner>}
          <TextField label={t('auth.newPassword')} type="password" autoComplete="new-password" hint={t('auth.passwordHint')} value={password} onChange={(e) => setPassword(e.target.value)} />
          <TextField
            label={t('auth.confirmPassword')}
            type="password"
            autoComplete="new-password"
            error={mismatch ? t('auth.mismatch') : undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" size="lg" block loading={busy} disabled={password.length < 8 || mismatch || !confirm}>
            {t('auth.resetSubmit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
