import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { SafetyInfo } from '../../lib/api/types';
import { Icon } from '../ui/Icons';

/** Shown alongside a reply whenever the safety layer flags a message. Always rendered, even if the AI fails. */
export function SafetyCard({ safety }: { safety: SafetyInfo }) {
  const { t } = useTranslation();
  const titleId = useId();
  if (safety.level === 'none' || safety.resources.length === 0) return null;
  const urgent = safety.level === 'urgent';

  return (
    <aside
      aria-labelledby={titleId}
      className={`flex w-full max-w-[90%] flex-col gap-3 rounded-lg p-5 shadow-sm ${urgent ? 'bg-error-container' : 'bg-tertiary-fixed/60'}`}
    >
      <h3 id={titleId} className="font-display text-headline-sm text-on-surface">
        {urgent ? t('safety.titleUrgent') : t('safety.title')}
      </h3>
      <p className="text-body-md text-on-surface-variant">{t('safety.body')}</p>
      <ul className="flex flex-col gap-2">
        {safety.resources.map((r) => (
          <li key={r.id}>
            <a
              href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
              className="flex min-h-14 items-center gap-3 rounded-full bg-surface-container-lowest py-2 pr-5 pl-2 shadow-sm hover:bg-surface-container-low"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-primary ${urgent ? 'bg-error' : 'bg-tertiary'}`}>
                <Icon name="call" size={20} />
              </span>
              <span className="flex flex-col">
                <span className="text-label-lg font-semibold text-on-surface">{t(`safety.resources.${r.id}.name`)}</span>
                <span className="text-label-sm text-on-surface-variant">{t(`safety.resources.${r.id}.note`)}</span>
              </span>
              <span className="sr-only">{t('safety.call', { phone: r.phone })}</span>
            </a>
          </li>
        ))}
      </ul>
      {safety.categories.includes('abuse') && <p className="text-label-md text-on-surface-variant">{t('safety.privacyTip')}</p>}
    </aside>
  );
}
