import { MotionConfig } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';
import { RedirectIfAuthenticated, RequireAuth } from './components/RouteGuards';
import { FullPageLoader } from './components/ui/Spinner';
import { useAuth } from './contexts/AuthContext';
import { WelcomePage } from './pages/WelcomePage';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages';

const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const ConversationPage = lazy(() => import('./pages/ConversationPage'));
const ReflectionPage = lazy(() => import('./pages/ReflectionPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PrivacyCentrePage = lazy(() => import('./pages/PrivacyCentrePage'));
const MemoriesPage = lazy(() => import('./pages/MemoriesPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const HistoryDetailPage = lazy(() => import('./pages/HistoryDetailPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export default function App() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <MotionConfig reducedMotion={user?.preferences.reducedMotion ? 'always' : 'user'}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-cream-50 focus:px-4 focus:py-2 focus:shadow-soft"
      >
        {t('app.skipToContent')}
      </a>
      <Suspense fallback={<FullPageLoader label={t('app.loading')} />}>
        <Routes>
          <Route path="/" element={<RedirectIfAuthenticated><WelcomePage /></RedirectIfAuthenticated>} />
          <Route path="/login" element={<RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated>} />
          <Route path="/register" element={<RedirectIfAuthenticated><RegisterPage /></RedirectIfAuthenticated>} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/onboarding" element={<RequireAuth allowIncompleteOnboarding><OnboardingPage /></RequireAuth>} />
          <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/talk" element={<RequireAuth><ConversationPage /></RequireAuth>} />
          <Route path="/reflect" element={<RequireAuth><ReflectionPage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="/privacy" element={<RequireAuth><PrivacyCentrePage /></RequireAuth>} />
          <Route path="/privacy/memories" element={<RequireAuth><MemoriesPage /></RequireAuth>} />
          <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
          <Route path="/history/:id" element={<RequireAuth><HistoryDetailPage /></RequireAuth>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </MotionConfig>
  );
}
