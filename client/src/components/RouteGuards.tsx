import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FullPageLoader } from './ui/Spinner';

/** Protected screens: signed-out users go to sign-in; new users finish onboarding first. */
export function RequireAuth({ children, allowIncompleteOnboarding = false }: { children: ReactNode; allowIncompleteOnboarding?: boolean }) {
  const { status, user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  if (status === 'loading') return <FullPageLoader label={t('app.loading')} />;
  if (status === 'anonymous' || !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user.onboardingCompleted && !allowIncompleteOnboarding) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const { t } = useTranslation();
  if (status === 'loading') return <FullPageLoader label={t('app.loading')} />;
  if (status === 'authenticated' && user) return <Navigate to={user.onboardingCompleted ? '/home' : '/onboarding'} replace />;
  return <>{children}</>;
}
