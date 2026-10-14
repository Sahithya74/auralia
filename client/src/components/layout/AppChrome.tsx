import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LANGUAGES, languageInfo } from '../../lib/i18n/languages';
import { Icon } from '../ui/Icons';

export function BrandLogo({ className = 'h-8 w-8' }: { className?: string }) {
  return <img src="/images/auralia-logo.png" alt="" className={`${className} object-contain`} width={32} height={32} />;
}

/** Pill-shaped language switcher; a native <select> keeps it accessible and gives phones their own picker. */
export function LanguagePill({ value, onChange, disabled, tone = 'low' }: { value: string; onChange(code: string): void; disabled?: boolean; tone?: 'low' | 'high' }) {
  const { t } = useTranslation();
  const id = useId();
  const current = languageInfo(value);
  const label = current.code === 'en' ? current.nativeName : `${current.nativeName} / Eng`;
  return (
    <div
      className={`relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-on-surface-variant shadow-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-container ${
        tone === 'high' ? 'bg-surface-container-high' : 'bg-surface-container-low'
      } ${disabled ? 'opacity-60' : 'hover:text-on-surface'}`}
    >
      <Icon name="translate" size={16} className="text-primary" />
      <span className="text-label-sm font-medium whitespace-nowrap" lang={current.code} aria-hidden="true">
        {label}
      </span>
      <label htmlFor={id} className="sr-only">
        {t('lang.label')}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.nativeName}
          </option>
        ))}
      </select>
    </div>
  );
}

function AccountButton() {
  const { t } = useTranslation();
  return (
    <Link
      to="/settings"
      aria-label={t('common.settings')}
      title={t('common.settings')}
      className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary transition-transform active:scale-95"
    >
      <Icon name="person" size={19} />
    </Link>
  );
}

interface BrandBarProps {
  section: string;
  language: string;
  onLanguageChange(code: string): void;
}

/** Top bar for the main sections (Sanctuary, Peace & Privacy, Settings...). */
export function BrandTopBar({ section, language, onLanguageChange }: BrandBarProps) {
  const { t } = useTranslation();
  return (
    <header className="pt-safe fixed inset-x-0 top-0 z-40 bg-surface/85 shadow-bar backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-2 px-5">
        <Link to="/home" className="flex min-w-0 items-center gap-2">
          <BrandLogo />
          <span className="flex min-w-0 flex-col justify-center">
            <span className="font-display text-headline-sm leading-none tracking-tight text-on-surface lowercase">auralia</span>
            <span className="truncate text-label-sm text-on-surface-variant">{section}</span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <LanguagePill value={language} onChange={onLanguageChange} />
          <Link
            to="/privacy"
            aria-label={t('common.privacyCentre')}
            title={t('common.privacyCentre')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-tertiary hover:bg-surface-container-low"
          >
            <Icon name="verified_user" size={20} />
          </Link>
          <AccountButton />
        </div>
      </div>
    </header>
  );
}

/** Top bar for a conversation: back, logo, session title, privacy lock. */
export function SessionTopBar({ title, onBack, lockLabel }: { title: string; onBack(): void; lockLabel: string }) {
  const { t } = useTranslation();
  return (
    <header className="pt-safe fixed inset-x-0 top-0 z-40 bg-surface/85 shadow-bar backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-2 px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <Icon name="arrow_back" size={22} />
          </button>
          <BrandLogo />
          <h1 className="truncate font-display text-headline-sm text-on-surface">{title}</h1>
        </div>
        <div className="flex items-center gap-1">
          <span className="flex h-9 w-9 items-center justify-center text-tertiary" title={lockLabel} role="img" aria-label={lockLabel}>
            <Icon name="lock" size={20} />
          </span>
          <AccountButton />
        </div>
      </div>
    </header>
  );
}

/** Bottom navigation: Sanctuary · Talk with Anbu · Peace & Privacy. */
export function BottomNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const item = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-14 min-w-14 flex-col items-center justify-center transition-colors ${
      isActive ? 'font-medium text-primary' : 'text-on-surface-variant hover:text-on-surface'
    }`;
  return (
    <nav aria-label={t('nav.label')} className="pb-safe fixed inset-x-0 bottom-0 z-40 bg-surface/90 shadow-bar-up backdrop-blur-xl">
      <div className="relative mx-auto flex h-20 max-w-lg items-center justify-around px-5">
        <NavLink to="/home" className={item}>
          <Icon name="spa" size={24} />
          <span className="mt-1 text-label-sm">{t('nav.sanctuary')}</span>
        </NavLink>
        <div className="relative -top-5 flex flex-col items-center">
          <button
            type="button"
            onClick={() => navigate('/talk?mode=voice')}
            aria-label={t('nav.talk')}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-on-primary shadow-fab transition-all hover:bg-primary active:scale-95"
          >
            <Icon name="graphic_eq" size={28} />
          </button>
          <span className="mt-1.5 text-label-sm text-on-surface-variant" aria-hidden="true">
            {t('nav.talk')}
          </span>
        </div>
        <NavLink to="/privacy" className={item}>
          <Icon name="eco" size={24} />
          <span className="mt-1 text-label-sm">{t('nav.privacy')}</span>
        </NavLink>
      </div>
    </nav>
  );
}

/** Page frame used by the main sections: top bar, scrolling content, bottom nav. */
export function AppScaffold({
  section,
  language,
  onLanguageChange,
  children,
}: BrandBarProps & { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <BrandTopBar section={section} language={language} onLanguageChange={onLanguageChange} />
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-5 pt-16 pb-28">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
