import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { LanguagePill } from '../components/layout/AppChrome';
import { Button } from '../components/ui/Button';
import { ChoiceCard, TextField, Toggle } from '../components/ui/Form';
import { ChevronRightIcon, ShieldIcon, SpeakerIcon } from '../components/ui/Icons';
import { Banner, Card, PageShell, SectionTitle } from '../components/ui/Layout';
import { useAuth, useUser } from '../contexts/AuthContext';
import type { Preferences, ResponseStyle, TextSize } from '../lib/api/types';
import { languageInfo } from '../lib/i18n/languages';
import { KEYS, local } from '../lib/storage';
import { detectVoiceSupport, type VoiceSupport } from '../lib/voice/capabilities';
import { SpeechPlayer } from '../lib/voice/speechPlayer';

const player = new SpeechPlayer({ onSpeakingChange: () => undefined });

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const user = useUser();
  const { updateUser, updatePreferences, logout } = useAuth();
  const navigate = useNavigate();
  const prefs = user.preferences;
  const lang = languageInfo(user.preferredLanguage);

  const [error, setError] = useState(false);
  const [name, setName] = useState(user.name);
  const [support, setSupport] = useState<VoiceSupport | null>(null);
  const [showTiming, setShowTiming] = useState(local.get(KEYS.showTiming) === 'true');
  const [rate, setRate] = useState(prefs.voiceRate);

  useEffect(() => {
    void detectVoiceSupport(lang.speechTag).then(setSupport);
  }, [lang.speechTag]);
  useEffect(() => () => player.stop(), []);

  const save = (changes: Partial<Preferences>) => {
    setError(false);
    updatePreferences(changes).catch(() => setError(true));
  };

  return (
    <PageShell title={t('settings.title')} back="/home">
      {error && <Banner tone="error">{t('common.error')}</Banner>}

      <Card>
        <SectionTitle>{t('settings.languageTitle')}</SectionTitle>
        <div className="py-2">
          <LanguagePill tone="high"
            value={user.preferredLanguage}
            onChange={(code) => {
              void i18n.changeLanguage(code);
              updateUser({ preferredLanguage: code }).catch(() => setError(true));
            }}
          />
        </div>
        <Toggle label={t('settings.codeMixing')} hint={t('settings.codeMixingHint')} checked={prefs.codeMixing} onChange={(v) => save({ codeMixing: v })} />
      </Card>

      <Card>
        <SectionTitle>{t('settings.voiceTitle')}</SectionTitle>
        <dl className="mb-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-2xl bg-cream-200/60 p-3 text-sm">
          <dt className="col-span-2 font-semibold text-ink">{t('settings.voiceSupport', { lang: lang.nativeName })}</dt>
          <dd className="text-ink-soft">{t('settings.voiceInput')}</dd>
          <dd className="font-semibold">{support?.recognition === 'available' ? t('settings.available') : t('settings.unavailable')}</dd>
          <dd className="text-ink-soft">{t('settings.voiceOutputLabel')}</dd>
          <dd className="font-semibold">{support?.synthesis === 'available' ? t('settings.available') : t('settings.unavailable')}</dd>
        </dl>
        <Toggle label={t('settings.voiceOutput')} checked={prefs.voiceOutputEnabled} onChange={(v) => save({ voiceOutputEnabled: v })} />
        <div className="flex flex-col gap-2 py-3">
          <label htmlFor="voice-rate" className="font-semibold text-ink">
            {t('settings.voiceRate')}
          </label>
          <div className="flex items-center gap-3 text-sm text-ink-faint">
            <span>{t('settings.slower')}</span>
            <input
              id="voice-rate"
              type="range"
              min={0.7}
              max={1.3}
              step={0.1}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              onPointerUp={() => save({ voiceRate: rate })}
              onKeyUp={() => save({ voiceRate: rate })}
              className="flex-1 accent-terracotta-600"
            />
            <span>{t('settings.faster')}</span>
          </div>
          <Button
            variant="soft"
            size="sm"
            className="self-start"
            icon={<SpeakerIcon size={18} />}
            disabled={support?.synthesis !== 'available'}
            onClick={() => player.speak(t('settings.voiceTestPhrase'), { lang: lang.speechTag, rate, voice: support?.voice ?? null })}
          >
            {t('settings.voiceTest')}
          </Button>
        </div>
        <Toggle label={t('settings.voiceReview')} hint={t('settings.voiceReviewHint')} checked={prefs.voiceInputReview} onChange={(v) => save({ voiceInputReview: v })} />
        <p className="text-sm text-ink-faint">{t('voice.providerNote')}</p>
      </Card>

      <Card>
        <SectionTitle>{t('settings.styleTitle')}</SectionTitle>
        <div role="radiogroup" className="flex flex-col gap-2">
          {(
            [
              ['LISTEN', 'listen'],
              ['SOLUTIONS', 'solutions'],
              ['BALANCED', 'balanced'],
            ] as [ResponseStyle, string][]
          ).map(([value, key]) => (
            <ChoiceCard
              key={value}
              name="style"
              value={value}
              checked={prefs.responseStyle === value}
              onChange={() => save({ responseStyle: value })}
              title={t(`onboarding.style.${key}Title`)}
              description={t(`onboarding.style.${key}Body`)}
            />
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>{t('settings.accessibilityTitle')}</SectionTitle>
        <fieldset className="py-2">
          <legend className="mb-2 font-semibold text-ink">{t('settings.textSize')}</legend>
          <div className="flex gap-2">
            {(['md', 'lg', 'xl'] as TextSize[]).map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={prefs.textSize === size}
                onClick={() => save({ textSize: size })}
                className={`min-h-11 flex-1 rounded-2xl border font-semibold ${
                  prefs.textSize === size ? 'border-terracotta-500 bg-terracotta-100 text-terracotta-700' : 'border-line bg-cream-50 text-ink-soft'
                } ${size === 'md' ? 'text-sm' : size === 'lg' ? 'text-base' : 'text-lg'}`}
              >
                {t(`settings.text${size === 'md' ? 'Md' : size === 'lg' ? 'Lg' : 'Xl'}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <Toggle label={t('settings.reducedMotion')} checked={prefs.reducedMotion} onChange={(v) => save({ reducedMotion: v })} />
        <Toggle label={t('settings.highContrast')} checked={prefs.highContrast} onChange={(v) => save({ highContrast: v })} />
        <Toggle label={t('settings.captions')} checked={prefs.captionsEnabled} onChange={(v) => save({ captionsEnabled: v })} />
      </Card>

      <Card>
        <SectionTitle>{t('settings.promptsTitle')}</SectionTitle>
        <Toggle label={t('settings.dailyPrompt')} hint={t('settings.dailyPromptHint')} checked={prefs.dailyPromptEnabled} onChange={(v) => save({ dailyPromptEnabled: v })} />
      </Card>

      <Link to="/privacy" className="flex items-center gap-3 rounded-[1.75rem] border border-line bg-cream-50 p-5 shadow-soft hover:bg-cream-200">
        <ShieldIcon className="text-sage-700" />
        <span className="flex-1 font-semibold">{t('common.privacyCentre')}</span>
        <ChevronRightIcon />
      </Link>

      <Card>
        <SectionTitle>{t('settings.accountTitle')}</SectionTitle>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name !== user.name) updateUser({ name: name.trim() }).catch(() => setError(true));
          }}
        >
          <TextField className="flex-1" label={t('settings.name')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={!name.trim() || name === user.name}>
            {t('common.save')}
          </Button>
        </form>
        <p className="mt-3 text-sm text-ink-soft">
          {t('settings.email')}: <span className="font-semibold text-ink">{user.email}</span>
        </p>
        <p className="mt-1 text-sm text-ink-faint">{t('settings.passwordNote')}</p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={async () => {
            await logout();
            navigate('/', { replace: true });
          }}
        >
          {t('settings.signOut')}
        </Button>
      </Card>

      <Card>
        <SectionTitle>{t('settings.advancedTitle')}</SectionTitle>
        <Toggle
          label={t('settings.showTiming')}
          hint={t('settings.showTimingHint')}
          checked={showTiming}
          onChange={(v) => {
            setShowTiming(v);
            local.set(KEYS.showTiming, String(v));
          }}
        />
      </Card>
    </PageShell>
  );
}
