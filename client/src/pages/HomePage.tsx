import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Orb } from '../components/companion/Orb';
import { AppScaffold } from '../components/layout/AppChrome';
import { Icon } from '../components/ui/Icons';
import { Banner } from '../components/ui/Layout';
import { useUser } from '../contexts/AuthContext';
import { useHealth } from '../hooks/useHealth';
import { useLanguageSwitch } from '../hooks/useLanguageSwitch';
import { conversationApi } from '../lib/api/endpoints';
import type { ConversationSummary, Mood } from '../lib/api/types';
import { languageInfo } from '../lib/i18n/languages';
import { KEYS, local } from '../lib/storage';

const MOODS: { mood: Mood; chip: string; dot: string }[] = [
  { mood: 'carrying', chip: 'bg-secondary-fixed/50 text-on-secondary-fixed', dot: 'bg-primary-container' },
  { mood: 'tired', chip: 'bg-secondary-container/40 text-on-secondary-container', dot: 'bg-secondary' },
  { mood: 'peaceful', chip: 'bg-tertiary-fixed/60 text-on-tertiary-container', dot: 'bg-tertiary' },
  { mood: 'need_to_talk', chip: 'bg-surface-container-highest text-on-surface', dot: 'bg-outline' },
];

const QUOTES = ['home.quote1', 'home.quote2', 'home.quote3'] as const;

function greetingKey(hour: number) {
  if (hour < 5) return 'home.greetingNight';
  if (hour < 12) return 'home.greetingMorning';
  if (hour < 17) return 'home.greetingAfternoon';
  if (hour < 22) return 'home.greetingEvening';
  return 'home.greetingNight';
}

const todayKey = () => new Date().toISOString().slice(0, 10);
const dayOfYear = () => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);

export default function HomePage() {
  const { t } = useTranslation();
  const user = useUser();
  const navigate = useNavigate();
  const health = useHealth();
  const switchLanguage = useLanguageSwitch();
  const [mood, setMood] = useState<Mood | undefined>();
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const [reflectionVisible, setReflectionVisible] = useState(
    () => user.preferences.dailyPromptEnabled && local.get(KEYS.dailyPromptDismissed) !== todayKey(),
  );

  useEffect(() => {
    if (!user.persistence.transcripts) return;
    conversationApi
      .list()
      .then((list) => setRecent(list.slice(0, 3)))
      .catch(() => setRecent([]));
  }, [user.persistence.transcripts]);

  const start = (mode: 'voice' | 'text') => {
    const params = new URLSearchParams({ mode });
    if (mood) params.set('mood', mood);
    navigate(`/talk?${params.toString()}`);
  };

  return (
    <AppScaffold section={t('nav.sanctuary')} language={user.preferredLanguage} onLanguageChange={switchLanguage}>
      <div className="flex flex-col pb-9">
        {health?.ai.mock && (
          <div className="pt-4">
            <Banner tone="warning">{t('chat.mockBanner')}</Banner>
          </div>
        )}

        <section className="flex flex-col gap-2 pt-4">
          <div className="flex items-center justify-between">
            <Link
              to="/privacy"
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-3 py-1 text-tertiary hover:bg-surface-container"
            >
              <Icon name="lock" size={14} />
              <span className="text-label-sm">{t(`home.privacy.${user.memoryMode}`)}</span>
            </Link>
            <span className="inline-flex items-center gap-1 text-on-surface-variant/80">
              <Icon name="cloud_sync" size={16} className="text-tertiary-container" />
              <span className="text-label-sm">{t('home.safeSpace')}</span>
            </span>
          </div>
          <div className="flex flex-col">
            <h1 className="font-display text-headline-lg tracking-tight text-on-surface">
              {t(greetingKey(new Date().getHours()), { name: user.name })}
            </h1>
            <p className="mt-1 text-body-md text-on-surface-variant">{t('home.subtitle')}</p>
          </div>
        </section>

        <section className="my-6 flex flex-col items-center justify-center">
          <Orb size={176} variant="home" label="anbu" onClick={() => start(user.interactionMode === 'TEXT' ? 'text' : 'voice')} ariaLabel={t('home.talk')} />
          <div className="mt-2 flex items-center gap-2 rounded-full bg-surface-container-low px-4 py-1.5 text-on-surface-variant">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-soft-ping rounded-full bg-tertiary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-tertiary" />
            </span>
            <p className="text-label-md">{t('home.presence')}</p>
          </div>
        </section>

        <section className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={() => start('voice')}
            className="flex h-14 w-full items-center justify-between rounded-full bg-primary-strong px-6 text-on-primary shadow-md shadow-primary-container/20 transition-all hover:bg-primary active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <Icon name="mic" size={24} />
              <span className="text-label-lg font-semibold">{t('home.talk')}</span>
            </span>
            <Icon name="waves" size={20} className="opacity-80" />
          </button>
          <button
            type="button"
            onClick={() => start('text')}
            className="flex h-14 w-full items-center justify-between rounded-full bg-surface-container-high px-6 text-on-surface transition-all hover:bg-surface-container-highest active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <Icon name="draw" size={22} className="text-primary" />
              <span className="text-label-lg font-semibold">{t('home.write')}</span>
            </span>
            <Icon name="arrow_forward" size={20} className="text-on-surface-variant" />
          </button>
        </section>

        <section className="mt-6 flex flex-col gap-4 rounded-lg bg-surface-container-low p-6 shadow-sm" aria-labelledby="mood-title">
          <div className="flex flex-col">
            <h2 id="mood-title" className="font-display text-headline-sm text-on-surface">
              {t('home.moodQuestion')}
            </h2>
            <p className="mt-0.5 text-label-sm text-on-surface-variant">{t('home.moodHint')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MOODS.map(({ mood: m, chip, dot }) => (
              <button
                key={m}
                type="button"
                aria-pressed={mood === m}
                onClick={() => setMood((cur) => (cur === m ? undefined : m))}
                className={`flex h-14 items-center gap-2 rounded-full px-4 text-left transition-all active:scale-95 ${chip} ${
                  mood === m ? 'shadow-sm ring-2 ring-primary-container' : ''
                }`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
                <span className="text-label-md leading-tight font-medium">{t(`moods.${m}`)}</span>
              </button>
            ))}
          </div>
        </section>

        {reflectionVisible && (
          <section className="mt-4 flex flex-col gap-2 rounded-lg bg-surface-container p-6" aria-label={t('home.reflectionLabel')}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-primary">
                <Icon name="spa" size={18} />
                <span className="text-label-sm uppercase tracking-wider">{t('home.reflectionLabel')}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  local.set(KEYS.dailyPromptDismissed, todayKey());
                  setReflectionVisible(false);
                }}
                className="flex min-h-11 items-center gap-0.5 px-2 text-label-sm text-on-surface-variant hover:text-on-surface"
              >
                <span>{t('home.reflectionClose')}</span>
                <Icon name="close" size={14} />
              </button>
            </div>
            <blockquote className="font-display text-headline-sm leading-snug text-on-surface italic">
              “{t(QUOTES[dayOfYear() % QUOTES.length]!)}”
            </blockquote>
            <p className="text-right text-label-sm text-on-surface-variant">{t('home.reflectionFrom')}</p>
          </section>
        )}

        <section className="mt-6 flex items-center gap-4 rounded-lg bg-surface-container-low p-6">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full shadow-inner">
            <img src="/images/ritual-chai.jpg" alt={t('home.ritualImageAlt')} className="h-full w-full object-cover" width={64} height={64} />
          </div>
          <div className="flex min-w-0 flex-col">
            <h2 className="font-display text-headline-sm text-on-surface">{t('home.ritualTitle')}</h2>
            <p className="text-body-md text-on-surface-variant">{t('home.ritualBody')}</p>
          </div>
        </section>

        {user.persistence.transcripts && recent.length > 0 && (
          <section className="mt-6 rounded-lg bg-surface-container-low p-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-headline-sm text-on-surface">{t('home.recent')}</h2>
              <Link to="/history" className="flex min-h-11 items-center px-2 text-label-md font-semibold text-primary">
                {t('home.seeAll')}
              </Link>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {recent.map((c) => (
                <li key={c.id}>
                  <Link to={`/history/${c.id}`} className="flex items-center gap-3 py-3 hover:text-primary">
                    <span className="flex-1 truncate" lang={c.language}>
                      {c.title ?? t('history.untitled')}
                    </span>
                    <span className="text-label-sm text-on-surface-variant">{languageInfo(c.language).nativeName}</span>
                    <Icon name="chevron_right" size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppScaffold>
  );
}
