import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Orb } from '../components/companion/Orb';
import { Button } from '../components/ui/Button';
import { ChoiceCard, Toggle } from '../components/ui/Form';
import { CheckIcon, LeafIcon, MicIcon, PenIcon, ShieldIcon } from '../components/ui/Icons';
import { Banner } from '../components/ui/Layout';
import { useAuth, useUser } from '../contexts/AuthContext';
import type { InteractionMode, MemoryMode, ResponseStyle } from '../lib/api/types';
import { LANGUAGES } from '../lib/i18n/languages';
import { isRecognitionAvailable } from '../lib/voice/capabilities';

const STEPS = ['language', 'interaction', 'memory', 'style', 'about'] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingPage() {
  const { t, i18n } = useTranslation();
  const user = useUser();
  const { updateUser, updatePreferences, updatePrivacy } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('language');
  const [language, setLanguage] = useState(user.preferredLanguage);
  const [interaction, setInteraction] = useState<InteractionMode>(user.interactionMode);
  const [memoryMode, setMemoryMode] = useState<MemoryMode>(user.memoryMode);
  const [history, setHistory] = useState(user.preferences.historyEnabled);
  const [style, setStyle] = useState<ResponseStyle>(user.preferences.responseStyle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const index = STEPS.indexOf(step);
  const voiceAvailable = isRecognitionAvailable();

  async function saveAndGo(next: Step | 'done') {
    setBusy(true);
    setError(false);
    try {
      if (step === 'language') await updateUser({ preferredLanguage: language });
      if (step === 'interaction') await updateUser({ interactionMode: interaction });
      if (step === 'memory') await updatePrivacy({ memoryMode, historyEnabled: memoryMode === 'PERSONAL' && history });
      if (step === 'style') await updatePreferences({ responseStyle: style });
      if (next === 'done') {
        await updateUser({ onboardingCompleted: true });
        navigate('/home', { replace: true });
        return;
      }
      setStep(next);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const next = () => void saveAndGo(index === STEPS.length - 1 ? 'done' : STEPS[index + 1]!);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-4 safe-bottom">
      <header className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-faint">{t('onboarding.stepOf', { current: index + 1, total: STEPS.length })}</p>
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-2 rounded-full transition-all ${i <= index ? 'w-6 bg-terracotta-500' : 'w-2 bg-cream-300'}`} />
          ))}
        </div>
        {step !== 'about' ? (
          <Button variant="ghost" size="sm" onClick={() => void saveAndGo('about')} disabled={busy}>
            {t('onboarding.skipAll')}
          </Button>
        ) : (
          <span className="w-10" />
        )}
      </header>

      <main id="main" className="flex flex-1 flex-col py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3 }}
            className="flex flex-1 flex-col gap-5"
          >
            {step === 'language' && (
              <>
                <StepHeading title={t('onboarding.language.title')} body={t('onboarding.language.body')} />
                <div role="radiogroup" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {LANGUAGES.map((l) => (
                    <ChoiceCard
                      key={l.code}
                      name="language"
                      value={l.code}
                      checked={language === l.code}
                      onChange={(code) => {
                        setLanguage(code);
                        void i18n.changeLanguage(code);
                      }}
                      title={l.nativeName}
                      lang={l.code}
                      description={l.code === 'en' ? undefined : l.englishName}
                    />
                  ))}
                </div>
              </>
            )}

            {step === 'interaction' && (
              <>
                <StepHeading title={t('onboarding.interaction.title')} />
                <div role="radiogroup" className="flex flex-col gap-3">
                  <ChoiceCard name="interaction" value="VOICE" checked={interaction === 'VOICE'} onChange={() => setInteraction('VOICE')} icon={<MicIcon />} title={t('onboarding.interaction.voiceTitle')} description={t('onboarding.interaction.voiceBody')} />
                  <ChoiceCard name="interaction" value="TEXT" checked={interaction === 'TEXT'} onChange={() => setInteraction('TEXT')} icon={<PenIcon />} title={t('onboarding.interaction.textTitle')} description={t('onboarding.interaction.textBody')} />
                  <ChoiceCard name="interaction" value="BOTH" checked={interaction === 'BOTH'} onChange={() => setInteraction('BOTH')} icon={<LeafIcon />} title={t('onboarding.interaction.bothTitle')} description={t('onboarding.interaction.bothBody')} />
                </div>
                {!voiceAvailable && interaction !== 'TEXT' && <Banner tone="warning">{t('onboarding.interaction.voiceUnavailable')}</Banner>}
              </>
            )}

            {step === 'memory' && (
              <>
                <StepHeading title={t('onboarding.memory.title')} body={t('onboarding.memory.body')} />
                <div role="radiogroup" className="flex flex-col gap-3">
                  <ChoiceCard name="memory" value="NONE" checked={memoryMode === 'NONE'} onChange={() => setMemoryMode('NONE')} title={t('onboarding.memory.noneTitle')} description={t('onboarding.memory.noneBody')} />
                  <ChoiceCard name="memory" value="SESSION" checked={memoryMode === 'SESSION'} onChange={() => setMemoryMode('SESSION')} title={t('onboarding.memory.sessionTitle')} description={t('onboarding.memory.sessionBody')} badge={t('onboarding.memory.recommended')} />
                  <ChoiceCard name="memory" value="PERSONAL" checked={memoryMode === 'PERSONAL'} onChange={() => setMemoryMode('PERSONAL')} title={t('onboarding.memory.personalTitle')} description={t('onboarding.memory.personalBody')} />
                </div>
                {memoryMode === 'PERSONAL' && (
                  <div className="rounded-3xl border border-line bg-cream-50 px-4">
                    <Toggle label={t('onboarding.memory.history')} hint={t('onboarding.memory.historyHint')} checked={history} onChange={setHistory} />
                  </div>
                )}
                <p className="flex gap-2 text-sm text-ink-faint">
                  <ShieldIcon size={18} className="shrink-0" />
                  {t('onboarding.memory.providerNote')}
                </p>
              </>
            )}

            {step === 'style' && (
              <>
                <StepHeading title={t('onboarding.style.title')} />
                <div role="radiogroup" className="flex flex-col gap-3">
                  <ChoiceCard name="style" value="LISTEN" checked={style === 'LISTEN'} onChange={() => setStyle('LISTEN')} title={t('onboarding.style.listenTitle')} description={t('onboarding.style.listenBody')} />
                  <ChoiceCard name="style" value="SOLUTIONS" checked={style === 'SOLUTIONS'} onChange={() => setStyle('SOLUTIONS')} title={t('onboarding.style.solutionsTitle')} description={t('onboarding.style.solutionsBody')} />
                  <ChoiceCard name="style" value="BALANCED" checked={style === 'BALANCED'} onChange={() => setStyle('BALANCED')} title={t('onboarding.style.balancedTitle')} description={t('onboarding.style.balancedBody')} />
                </div>
              </>
            )}

            {step === 'about' && (
              <div className="flex flex-col items-center gap-5">
                <Orb size={120} variant="home" />
                <StepHeading title={t('onboarding.about.title')} center />
                <ul className="flex flex-col gap-3">
                  {(['point1', 'point2', 'point3', 'point4'] as const).map((key) => (
                    <li key={key} className="flex gap-3 rounded-2xl bg-cream-50 p-4 text-ink shadow-soft">
                      <CheckIcon className="mt-0.5 shrink-0 text-sage-700" />
                      <span>{t(`onboarding.about.${key}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="flex flex-col gap-3 pb-2">
        {error && <Banner tone="error">{t('common.error')}</Banner>}
        <div className="flex gap-3">
          {index > 0 && (
            <Button variant="secondary" size="lg" onClick={() => setStep(STEPS[index - 1]!)} disabled={busy}>
              {t('common.back')}
            </Button>
          )}
          <Button size="lg" block onClick={next} loading={busy}>
            {step === 'about' ? t('onboarding.about.start') : t('common.continue')}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function StepHeading({ title, body, center }: { title: string; body?: string; center?: boolean }) {
  return (
    <div className={`flex flex-col gap-2 ${center ? 'text-center' : ''}`}>
      <h1 className="font-display text-3xl font-semibold leading-tight text-ink">{title}</h1>
      {body && <p className="text-lg text-ink-soft">{body}</p>}
    </div>
  );
}
