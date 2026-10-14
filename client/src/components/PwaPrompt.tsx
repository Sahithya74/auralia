import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui/Button';

/** Lets the user choose when to load a new version, so a conversation is never reloaded mid-sentence. */
export function PwaPrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-cream-50 p-4 shadow-soft">
      <p className="flex-1 text-sm text-ink">{needRefresh ? t('pwa.updateAvailable') : t('pwa.offlineReady')}</p>
      {needRefresh && (
        <Button size="sm" onClick={() => void updateServiceWorker(true)}>
          {t('pwa.update')}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        {t('common.close')}
      </Button>
    </div>
  );
}
