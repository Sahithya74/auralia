import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { TrashIcon } from '../components/ui/Icons';
import { Banner, PageShell } from '../components/ui/Layout';
import { Spinner } from '../components/ui/Spinner';
import { useUser } from '../contexts/AuthContext';
import { conversationApi } from '../lib/api/endpoints';
import type { ConversationDetail } from '../lib/api/types';

export default function HistoryDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useUser();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    conversationApi
      .get(id)
      .then(setConversation)
      .catch(() => setError(true));
  }, [id]);

  return (
    <PageShell title={conversation?.title ?? t('history.title')} back="/history">
      {error && <Banner tone="error">{t('common.error')}</Banner>}
      {!conversation && !error && (
        <div className="flex justify-center py-6 text-terracotta-600">
          <Spinner label={t('common.loading')} />
        </div>
      )}
      {conversation && (
        <>
          <ol className="flex flex-col gap-3">
            {conversation.messages.map((m) => (
              <li key={m.id} className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                <p
                  lang={m.language}
                  className={`max-w-[88%] whitespace-pre-wrap rounded-3xl px-4 py-3 shadow-soft ${
                    m.role === 'USER' ? 'rounded-br-lg bg-terracotta-100' : 'rounded-bl-lg border border-line/60 bg-cream-50'
                  }`}
                >
                  <span className="sr-only">{m.role === 'USER' ? t('history.you') : t('history.anbu')}: </span>
                  {m.content}
                </p>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            {user.persistence.transcripts && (
              <Button block onClick={() => navigate('/talk', { state: { continueConversation: conversation } })}>
                {t('history.continue')}
              </Button>
            )}
            <Button block variant="secondary" icon={<TrashIcon size={18} />} onClick={() => setConfirmDelete(true)}>
              {t('history.delete')}
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={confirmDelete}
        title={t('history.delete')}
        onClose={() => setConfirmDelete(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await conversationApi.remove(id);
                  navigate('/history', { replace: true });
                } catch {
                  setConfirmDelete(false);
                  setError(true);
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {t('history.deleteConfirm')}
      </Dialog>
    </PageShell>
  );
}
