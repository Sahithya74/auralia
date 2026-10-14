import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { PwaPrompt } from './components/PwaPrompt';
import { FullPageLoader } from './components/ui/Spinner';
import { AuthProvider } from './contexts/AuthContext';
import './lib/i18n';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<FullPageLoader label="Loading" />}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <PwaPrompt />
        </AuthProvider>
      </BrowserRouter>
    </Suspense>
  </StrictMode>,
);
