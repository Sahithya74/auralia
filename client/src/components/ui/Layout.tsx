import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../../contexts/AuthContext';
import { useLanguageSwitch } from '../../hooks/useLanguageSwitch';
import { AppScaffold } from '../layout/AppChrome';
import { IconButton } from './Button';
import { Icon } from './Icons';

export function Card({ children, className = '', as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={`rounded-lg bg-surface-container-low p-6 shadow-sm ${className}`}>{children}</Tag>;
}

/** Signed-in page frame: the app's top bar and bottom nav, plus a title row with a back button. */
export function PageShell({
  title,
  section,
  children,
  back,
  actions,
}: {
  title?: string;
  /** Section name under the "auralia" wordmark; defaults to the title. */
  section?: string;
  children: ReactNode;
  back?: string | true;
  actions?: ReactNode;
  narrow?: boolean;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUser();
  const switchLanguage = useLanguageSwitch();
  return (
    <AppScaffold section={section ?? title ?? ''} language={user.preferredLanguage} onLanguageChange={switchLanguage}>
      <div className="flex flex-col gap-4 pt-4 pb-9">
        {(title || back || actions) && (
          <div className="flex items-center gap-2">
            {back && (
              <IconButton label={t('common.back')} tone="soft" onClick={() => (back === true ? navigate(-1) : navigate(back))}>
                <Icon name="arrow_back" size={20} />
              </IconButton>
            )}
            {title && <h1 className="flex-1 font-display text-headline-lg tracking-tight text-on-surface">{title}</h1>}
            {actions}
          </div>
        )}
        {children}
      </div>
    </AppScaffold>
  );
}

export function Banner({
  tone = 'info',
  children,
  icon,
  action,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  children: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: 'bg-surface-container text-on-surface-variant',
    success: 'bg-tertiary-fixed/70 text-on-tertiary-container',
    warning: 'bg-primary-fixed/70 text-on-primary-fixed-variant',
    error: 'bg-error-container text-error',
  } as const;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-label-md font-medium ${tones[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

export function SectionTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 font-display text-headline-sm text-on-surface">
      {icon}
      {children}
    </h2>
  );
}
