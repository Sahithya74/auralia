import { useTranslation } from 'react-i18next';
import { Orb } from '../components/companion/Orb';
import { ButtonLink } from '../components/ui/Button';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <Orb size={110} variant="home" />
      <h1 className="font-display text-3xl font-semibold text-ink">{t('notFound.title')}</h1>
      <ButtonLink to="/">{t('notFound.home')}</ButtonLink>
    </main>
  );
}
