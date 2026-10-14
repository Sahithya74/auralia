import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { AppScaffold } from '../components/layout/AppChrome';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { ChoiceCard, TextField, Toggle } from '../components/ui/Form';
import { Icon, type IconName } from '../components/ui/Icons';
import { Banner } from '../components/ui/Layout';
import { FullPageLoader } from '../components/ui/Spinner';
import { useAuth, useUser } from '../contexts/AuthContext';
import { useHealth } from '../hooks/useHealth';
import { useLanguageSwitch } from '../hooks/useLanguageSwitch';
import { ApiError } from '../lib/api/client';
import { conversationApi, memoryApi, privacyApi } from '../lib/api/endpoints';
import type { Memory, MemoryCategory, MemoryMode, PrivacySettings } from '../lib/api/types';

type Change = { memoryMode?: MemoryMode; historyEnabled?: boolean };

const MODES: { value: MemoryMode; key: 'session' | 'none' | 'personal'; icon: IconName }[] = [
  { value: 'SESSION', key: 'session', icon: 'hourglass_top_fill' },
  { value: 'NONE', key: 'none', icon: 'air' },
  { value: 'PERSONAL', key: 'personal', icon: 'bookmark_heart' },
];

const CATEGORY_STYLE: Record<MemoryCategory, { icon: IconName; bg: string; fg: string }> = {
  PEOPLE: { icon: 'face', bg: 'bg-secondary-fixed', fg: 'text-on-secondary-fixed' },
  WELLBEING: { icon: 'local_cafe', bg: 'bg-tertiary-fixed', fg: 'text-on-tertiary-fixed-variant' },
  PREFERENCE: { icon: 'favorite', bg: 'bg-primary-fixed', fg: 'text-primary' },
  ROUTINE: { icon: 'history', bg: 'bg-surface-container-high', fg: 'text-on-surface-variant' },
  GOAL: { icon: 'star_shine', bg: 'bg-primary-fixed', fg: 'text-primary' },
  OTHER: { icon: 'eco', bg: 'bg-tertiary-fixed', fg: 'text-on-tertiary-fixed-variant' },
};

const PROVIDER_NAMES: Record<string, string> = { anthropic: 'Anthropic (Claude)', gemini: 'Google (Gemini)' };

function useRelativeTime() {
  const { i18n } = useTranslation();
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
  return (iso: string) => {
    const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
    if (Math.abs(days) < 1) return rtf.format(0, 'day');
    if (Math.abs(days) < 7) return rtf.format(days, 'day');
    if (Math.abs(days) < 30) return rtf.format(Math.round(days / 7), 'week');
    return rtf.format(Math.round(days / 30), 'month');
  };
}

export default function PrivacyCentrePage() {
  const { t } = useTranslation();
  const user = useUser();
  const { updatePrivacy, logout } = useAuth();
  const navigate = useNavigate();
  const switchLanguage = useLanguageSwitch();
  const health = useHealth();
  const relative = useRelativeTime();

  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ change: Change; conversations: number; memories: number } | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = useCallback(() => {
    privacyApi
      .get()
      .then(setSettings)
      .catch(() => setError(true));
    memoryApi
      .list()
      .then(setMemories)
      .catch(() => setMemories([]));
  }, []);
  useEffect(reload, [reload]);

  async function apply(change: Change, confirmDeletion = false) {
    setBusy(true);
    setError(false);
    try {
      await updatePrivacy({ ...change, confirmDeletion });
      setConfirm(null);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFIRM_DELETION') {
        const details = err.details as { conversations: number; memories: number };
        setConfirm({ change, conversations: details.conversations, memories: details.memories });
      } else {
        setError(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeMemory(memory: Memory) {
    try {
      await memoryApi.remove(memory.id);
      setMemories((list) => list.filter((m) => m.id !== memory.id));
      setNotice(t('privacy.memoryErased'));
      reload();
    } catch {
      setError(true);
    }
  }

  async function downloadData() {
    try {
      const data = await privacyApi.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `anbu-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(true);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setDeleteError(null);
    try {
      await privacyApi.deleteAccount(password);
      await logout();
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(err instanceof ApiError && err.code === 'INVALID_PASSWORD' ? t('privacy.wrongPassword') : t('common.error'));
      setBusy(false);
    }
  }

  if (!settings) {
    return error ? (
      <AppScaffold section={t('nav.privacy')} language={user.preferredLanguage} onLanguageChange={switchLanguage}>
        <div className="pt-4">
          <Banner tone="error">{t('common.error')}</Banner>
        </div>
      </AppScaffold>
    ) : (
      <FullPageLoader label={t('common.loading')} />
    );
  }

  const personal = settings.memoryMode === 'PERSONAL';
  const provider = PROVIDER_NAMES[health?.ai.provider ?? ''] ?? t('privacy.providerUnknown');

  return (
    <AppScaffold section={t('nav.privacy')} language={user.preferredLanguage} onLanguageChange={switchLanguage}>
      <div className="flex flex-col pt-4 pb-12">
        {error && (
          <div className="mb-4">
            <Banner tone="error">{t('common.error')}</Banner>
          </div>
        )}

        <section className="relative mb-6 w-full overflow-hidden rounded-xl bg-surface-container-low p-6 shadow-sm">
          <div className="pointer-events-none absolute -top-10 -right-10 h-44 w-44 rounded-full bg-secondary-container/40 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-tertiary-fixed/30 blur-2xl" aria-hidden="true" />
          <div className="relative z-10 flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-surface-container px-2.5 py-1 text-tertiary">
              <Icon name="lock_open_right_fill" size={16} />
              <span className="text-label-sm tracking-wider uppercase">{t('privacy.trustBadge')}</span>
            </span>
            <h1 className="mt-1 font-display text-headline-md text-on-surface">{t('privacy.title')}</h1>
            <p className="text-body-md leading-relaxed text-on-surface-variant">{t('privacy.intro')}</p>
          </div>
        </section>

        <section className="mb-9 flex flex-col gap-4" aria-labelledby="listens-title">
          <div className="flex items-center justify-between">
            <h2 id="listens-title" className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
              <Icon name="psychology_alt" size={20} className="text-primary" />
              {t('privacy.howListens')}
            </h2>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-label-sm text-on-surface-variant">{t('privacy.optionsCount')}</span>
          </div>
          <div role="radiogroup" aria-labelledby="listens-title" className="flex flex-col gap-2">
            {MODES.map(({ value, key, icon }) => (
              <ChoiceCard
                key={value}
                name="memory-mode"
                value={value}
                checked={settings.memoryMode === value}
                onChange={() => value !== settings.memoryMode && !busy && void apply({ memoryMode: value })}
                title={t(`onboarding.memory.${key}Title`)}
                description={t(`onboarding.memory.${key}Body`)}
                trailingIcon={icon}
                activeBadge={t('privacy.activeMode')}
              >
                {value === 'PERSONAL' && personal && (
                  <div className="mt-1 rounded-2xl bg-surface-container-low px-4">
                    <Toggle
                      label={t('privacy.historyToggle')}
                      hint={t('privacy.historyCount', { count: settings.stored.conversations })}
                      checked={settings.historyEnabled}
                      disabled={busy}
                      onChange={(v) => void apply({ historyEnabled: v })}
                    />
                    {settings.stored.conversations > 0 && (
                      <Link to="/history" className="mb-3 inline-flex min-h-10 items-center gap-1 text-label-md font-semibold text-primary">
                        {t('privacy.historyView')}
                        <Icon name="chevron_right" size={18} />
                      </Link>
                    )}
                  </div>
                )}
              </ChoiceCard>
            ))}
          </div>
        </section>

        <section className="mb-9 flex flex-col gap-4" aria-labelledby="memories-title">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="memories-title" className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
              <Icon name="filter_vintage" size={20} className="text-tertiary" />
              {t('privacy.managedMemories')}
            </h2>
            <span className="shrink-0 rounded-full bg-tertiary-fixed px-2.5 py-0.5 text-label-sm font-medium text-on-tertiary-container">
              {t('privacy.notesKept', { count: settings.stored.memories })}
            </span>
          </div>

          {notice && (
            <div className="flex items-center gap-2 rounded-lg bg-secondary-fixed p-3 text-on-secondary-fixed" role="status">
              <Icon name="done_all" size={18} />
              <span className="flex-1 text-label-md">{notice}</span>
            </div>
          )}

          {memories.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {memories.slice(0, 4).map((m) => {
                const style = CATEGORY_STYLE[m.category];
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-lowest p-4 shadow-sm">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.fg}`}>
                        <Icon name={style.icon} size={18} />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-body-lg text-on-surface">{m.content}</span>
                        <span className="mt-0.5 text-label-sm text-on-surface-variant">
                          {t('privacy.noted', { when: relative(m.createdAt) })} • {t(`memories.categories.${m.category}`)}
                          {m.kind === 'INTERPRETATION' ? ` • ${t('memories.interpretationShort')}` : ''}
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeMemory(m)}
                      aria-label={t('privacy.removeMemory', { memory: m.content })}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant transition-all hover:bg-error-container hover:text-error active:scale-95"
                    >
                      <Icon name="delete" size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-surface-container-low p-6 text-center">
              <Icon name="eco" size={32} className="text-outline" />
              <span className="text-label-lg font-semibold text-on-surface">{t('privacy.slateClear')}</span>
              <p className="text-body-md text-on-surface-variant">{personal ? t('memories.empty') : t('privacy.memoriesOff')}</p>
            </div>
          )}

          {(personal || memories.length > 0) && (
            <Link to="/privacy/memories" className="inline-flex min-h-10 items-center gap-1 self-start px-1 text-label-md font-semibold text-primary">
              {t('privacy.memoriesManage')}
              <Icon name="chevron_right" size={18} />
            </Link>
          )}

          <p className="flex items-start gap-2.5 px-2 text-body-md leading-relaxed text-on-surface-variant">
            <Icon name="star_shine" size={18} className="mt-0.5 shrink-0 text-primary" />
            {t('privacy.eraseNote')}
          </p>
        </section>

        <section className="relative mb-9 h-44 w-full overflow-hidden rounded-lg shadow-sm">
          <img src="/images/promise-tea.jpg" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-on-surface/85 via-on-surface/40 to-transparent p-4">
            <span className="text-label-sm tracking-wider text-primary-fixed uppercase">{t('privacy.promiseLabel')}</span>
            <p className="font-display text-headline-sm leading-snug text-on-primary">“{t('privacy.promiseQuote')}”</p>
          </div>
        </section>

        <section className="mb-9 flex flex-col gap-2 rounded-lg bg-surface-container p-4">
          <h2 className="flex items-center gap-2 text-tertiary">
            <Icon name="security_fill" size={20} />
            <span className="text-label-lg font-semibold text-on-surface">{t('privacy.pledgeTitle')}</span>
          </h2>
          <p className="text-body-md leading-relaxed text-on-surface-variant">{t('privacy.providers', { provider })}</p>
          <p className="text-body-md leading-relaxed text-on-surface-variant">{t('privacy.never')}</p>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <span className="inline-flex items-center gap-1 text-label-sm text-tertiary">
              <Icon name="verified" size={15} /> {t('privacy.zeroAds')}
            </span>
            <span className="inline-flex items-center gap-1 text-label-sm text-tertiary">
              <Icon name="lock" size={15} /> {t('privacy.encrypted')}
            </span>
          </div>
          <details className="group mt-1 rounded-2xl bg-surface-container-low px-4 py-2">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-label-md font-semibold text-on-surface">
              {t('privacy.explainTitle')}
              <Icon name="chevron_right" size={18} className="transition-transform group-open:rotate-90" />
            </summary>
            <dl className="flex flex-col gap-3 pb-2">
              {(['stored', 'limits'] as const).map((key) => (
                <div key={key}>
                  <dt className="text-label-md font-semibold text-on-surface">{t(`privacy.${key}Title`)}</dt>
                  <dd className="text-body-md text-on-surface-variant">{t(`privacy.${key}`)}</dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="mt-1 rounded-2xl bg-surface-container-low px-4">
            <Toggle
              label={t('privacy.analyticsToggle')}
              hint={t('privacy.analyticsHint')}
              checked={settings.analyticsConsent}
              disabled={busy}
              onChange={(v) => {
                setBusy(true);
                privacyApi
                  .update({ analyticsConsent: v })
                  .then(setSettings)
                  .catch(() => setError(true))
                  .finally(() => setBusy(false));
              }}
            />
          </div>
        </section>

        <section className="flex flex-col items-center gap-4 pt-1">
          <button
            type="button"
            onClick={() => setConfirmClearHistory(true)}
            disabled={settings.stored.conversations === 0}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-surface-container-highest text-on-surface transition-all duration-200 hover:bg-error-container hover:text-error active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-container-highest disabled:hover:text-on-surface"
          >
            <Icon name="delete_forever" size={20} />
            <span className="text-label-lg font-semibold">{t('privacy.historyDeleteAll')}</span>
          </button>
          <div className="flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-1 pt-1">
            <button type="button" onClick={downloadData} className="inline-flex min-h-11 items-center gap-1.5 text-label-md text-on-surface-variant transition-colors hover:text-primary">
              <Icon name="download" size={18} />
              {t('privacy.exportAction')}
            </button>
            <span className="h-1 w-1 rounded-full bg-outline-variant" aria-hidden="true" />
            <button type="button" onClick={() => setDeleteOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 text-label-md text-error transition-colors hover:text-on-error-container">
              <Icon name="person_remove" size={18} />
              {t('privacy.deleteAction')}
            </button>
          </div>
        </section>
      </div>

      <Dialog
        open={confirm !== null}
        title={t('privacy.confirmTitle')}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => confirm && void apply(confirm.change, true)}>
              {t('privacy.confirmAction')}
            </Button>
          </>
        }
      >
        {confirm && t('privacy.confirmBody', { conversations: confirm.conversations, memories: confirm.memories })}
      </Dialog>

      <Dialog
        open={confirmClearHistory}
        title={t('privacy.historyDeleteAll')}
        onClose={() => setConfirmClearHistory(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmClearHistory(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                setConfirmClearHistory(false);
                await conversationApi.removeAll().catch(() => setError(true));
                reload();
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {t('privacy.historyDeleteAllConfirm')}
      </Dialog>

      <Dialog
        open={deleteOpen}
        title={t('privacy.deleteConfirmTitle')}
        onClose={() => {
          setDeleteOpen(false);
          setPassword('');
          setDeleteError(null);
        }}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={busy} disabled={!password} onClick={deleteAccount}>
              {t('privacy.deleteConfirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p>{t('privacy.deleteConfirmBody')}</p>
          <TextField
            label={t('auth.passwordLabel')}
            type="password"
            autoComplete="current-password"
            value={password}
            error={deleteError ?? undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-label-sm text-on-surface-variant">{user.email}</p>
        </div>
      </Dialog>
    </AppScaffold>
  );
}
