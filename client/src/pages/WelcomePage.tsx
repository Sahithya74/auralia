import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Orb } from '../components/companion/Orb';
import { BrandLogo } from '../components/layout/AppChrome';
import { LanguageChips } from '../components/LanguagePicker';
import { ButtonLink } from '../components/ui/Button';
import { Icon } from '../components/ui/Icons';

export function WelcomePage() {
  const { t, i18n } = useTranslation();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-surface px-5 pt-5 safe-bottom">
      <header className="flex items-center gap-2">
        <BrandLogo />
        <span className="flex flex-col">
          <span className="font-display text-headline-sm leading-none tracking-tight text-on-surface lowercase">auralia</span>
          <span className="text-label-sm text-on-surface-variant">{t('nav.sanctuary')}</span>
        </span>
      </header>

      <main id="main" className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
        <LanguageChips value={i18n.language} onChange={(code) => void i18n.changeLanguage(code)} />

        <Orb size={150} variant="home" label="anbu" />

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col gap-2">
          <h1 className="font-display text-headline-lg tracking-tight text-on-surface sm:text-display-lg">{t('welcome.title')}</h1>
          <p className="mx-auto max-w-md text-body-lg text-on-surface-variant">{t('welcome.subtitle')}</p>
        </motion.div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          <ButtonLink to="/register" size="lg" block>
            {t('welcome.create')}
          </ButtonLink>
          <ButtonLink to="/login" size="lg" variant="secondary" block>
            {t('welcome.signIn')}
          </ButtonLink>
        </div>
      </main>

      <footer className="mb-2 flex flex-col items-center gap-1 text-center text-label-sm text-on-surface-variant">
        <p className="flex items-center gap-1.5">
          <Icon name="verified_user" size={14} className="text-tertiary" />
          {t('welcome.privacyNote')}
        </p>
        <p>{t('welcome.aiNote')}</p>
      </footer>
    </div>
  );
}
