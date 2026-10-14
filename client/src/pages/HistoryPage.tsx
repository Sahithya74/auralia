import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRightIcon, HistoryIcon } from '../components/ui/Icons';
import { Banner, Card, PageShell } from '../components/ui/Layout';
import { Spinner } from '../components/ui/Spinner';
import { ApiError } from '../lib/api/client';
import { conversationApi } from '../lib/api/endpoints';
import type { ConversationSummary } from '../lib/api/types';
import { languageInfo } from '../lib/i18n/languages';

export default function HistoryPage() {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [state, setState] = useState<'ok' | 'disabled' | 'error'>('ok');

  useEffect(() => {
    conversationApi
      .list()
      .then(setList)
      .catch((err) => setState(err instanceof ApiError && err.code === 'HISTORY_DISABLED' ? 'disabled' : 'error'));
  }, []);

  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <PageShell title={t('history.title')} back="/home">
      {state === 'disabled' && (
        <Banner tone="info" action={<Link to="/privacy" className="font-semibold underline">{t('common.privacyCentre')}</Link>}>
          {t('history.disabled')}
        </Banner>
      )}
      {state === 'error' && <Banner tone="error">{t('common.error')}</Banner>}
      {state === 'ok' && list === null && (
        <div className="flex justify-center py-6 text-terracotta-600">
          <Spinner label={t('common.loading')} />
        </div>
      )}
      {list && list.length === 0 && <p className="py-6 text-center text-ink-soft">{t('history.empty')}</p>}
      {list && list.length > 0 && (
        <ul className="flex flex-col gap-3">
          {list.map((c) => (
            <li key={c.id}>
              <Link to={`/history/${c.id}`} className="block">
                <Card as="div" className="flex items-center gap-3 hover:bg-cream-200">
                  <HistoryIcon className="shrink-0 text-sage-700" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold text-ink" lang={c.language}>
                      {c.title ?? t('history.untitled')}
                    </span>
                    <span className="text-sm text-ink-faint">
                      {date(c.updatedAt)} · {languageInfo(c.language).nativeName} · {t('history.messages', { count: c.messageCount })}
                    </span>
                  </span>
                  <ChevronRightIcon />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
