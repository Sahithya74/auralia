import { motion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UiMessage } from '../../hooks/useConversation';
import { Icon } from '../ui/Icons';
import { SafetyCard } from './SafetyCard';

/** Splits a reply into its opening sentence, the middle, and a closing question (if any), as in the design. */
export function replyParts(text: string): { opening: string; body: string; question: string } {
  const sentences = text.trim().match(/[^.!?।]+[.!?।]+["'”’)]*\s*|[^.!?।]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (sentences.length <= 1) return { opening: text.trim(), body: '', question: '' };
  const [opening, ...rest] = sentences;
  const last = rest.at(-1) ?? '';
  const question = rest.length > 1 && last.endsWith('?') ? last : '';
  const body = (question ? rest.slice(0, -1) : rest).join(' ');
  return { opening: opening ?? '', body, question };
}

export function ThinkingIndicator() {
  const { t } = useTranslation();
  return (
    <li className="flex w-full flex-col items-start" aria-live="polite">
      <div className="mb-1 ml-1 flex items-center gap-1">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-fixed-dim text-primary">
          <Icon name="star_shine" size={10} />
        </span>
        <span className="text-label-sm text-tertiary">{t('chat.listeningDeeply')}</span>
      </div>
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-surface-container-low px-4 py-2 shadow-sm">
        <span className="flex items-center gap-1.5 py-1" aria-hidden="true">
          {['bg-primary', 'bg-primary-container', 'bg-secondary-container'].map((c, i) => (
            <motion.span
              key={c}
              className={`h-2 w-2 rounded-full ${c}`}
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </span>
        <span className="text-body-md text-on-surface-variant italic">{t('chat.statusThinking')}</span>
      </div>
    </li>
  );
}

interface MessageBubbleProps {
  message: UiMessage;
  language: string;
  time?: string;
  canReplay: boolean;
  canCorrect: boolean;
  showTiming: boolean;
  onReplay(text: string): void;
  onRetry(): void;
  onCorrect(message: UiMessage): void;
}

export function MessageBubble({ message, language, time, canReplay, canCorrect, showTiming, onReplay, onRetry, onCorrect }: MessageBubbleProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (message.role === 'user') {
    return (
      <li className="flex w-full flex-col items-end">
        <div lang={language} className="max-w-[85%] rounded-2xl rounded-tr-sm bg-secondary-container p-4 text-on-secondary-container shadow-sm">
          <span className="sr-only">{t('history.you')}: </span>
          <p className="text-body-md leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <div className="mt-1 mr-1 flex items-center gap-1.5">
          {time && <span className="text-label-sm text-on-surface-variant">{time}</span>}
          <Icon name="done_all_fill" size={14} className="text-tertiary" />
          {canCorrect && (
            <button
              type="button"
              onClick={() => onCorrect(message)}
              className="ml-1 flex min-h-9 items-center gap-1 rounded-full px-2 text-label-sm text-primary hover:bg-surface-container"
            >
              <Icon name="edit" size={14} />
              {t('chat.correct')}
            </button>
          )}
        </div>
      </li>
    );
  }

  if (message.status === 'streaming' && !message.content) return <ThinkingIndicator />;

  const { opening, body, question } = replyParts(message.content);
  const done = message.status === 'done';

  return (
    <li className="flex w-full flex-col items-start gap-2">
      <div className="ml-1 flex items-center gap-1">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-fixed text-primary">
          <Icon name="eco" size={12} />
        </span>
        <span className="text-label-sm font-medium text-on-surface-variant">{t('history.anbu')}</span>
      </div>
      {message.content && (
        <div lang={language} className="flex max-w-[90%] flex-col gap-2 rounded-2xl rounded-tl-sm bg-surface-container-lowest p-6 text-on-surface shadow-md">
          <span className="sr-only">{t('history.anbu')}: </span>
          <p className="font-display text-headline-sm text-on-surface">{opening}</p>
          {body && <p className="text-body-md leading-relaxed whitespace-pre-wrap text-on-surface">{body}</p>}
          {question && <p className="text-body-md leading-relaxed text-on-surface-variant">{question}</p>}
          {message.status === 'streaming' && <span aria-hidden="true" className="h-4 w-0.5 animate-pulse bg-primary-container" />}

          {done && (canReplay || message.content) && (
            <div className="mt-2 flex flex-col gap-1 rounded-xl bg-surface-container-low p-2">
              <div className="flex items-center justify-between gap-2">
                {canReplay ? (
                  <button
                    type="button"
                    onClick={() => onReplay(message.content)}
                    className="flex min-h-9 items-center gap-2 rounded-full bg-primary-fixed px-3.5 py-1.5 text-on-primary-fixed shadow-sm transition-colors hover:bg-secondary-fixed active:scale-95"
                  >
                    <Icon name="play_arrow" size={18} />
                    <span className="text-label-sm font-semibold">{t('chat.listenVoice')}</span>
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(message.content).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                  aria-label={copied ? t('chat.copied') : t('chat.copy')}
                  title={copied ? t('chat.copied') : t('chat.copy')}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
                >
                  <Icon name={copied ? 'check' : 'content_copy'} size={16} />
                </button>
              </div>
              {canReplay && (
                <div className="flex items-center gap-1 px-1 py-1" aria-hidden="true">
                  {[3, 5, 7, 4, 6, 8, 4, 6, 3, 5, 2].map((h, i) => (
                    <span key={i} className="w-1 rounded-full bg-primary/60" style={{ height: `${h * 0.25}rem`, opacity: 0.3 + h / 12 }} />
                  ))}
                  <span className="ml-2 flex-1 text-label-sm text-on-surface-variant">{t('chat.voiceTone')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {message.status === 'error' && (
        <div className="ml-2 flex flex-wrap items-center gap-2 text-label-md" role="alert">
          <span className="font-semibold text-error">
            {t(`chat.errors.${message.errorCode ?? 'AI_ERROR'}`, { defaultValue: t('chat.errors.AI_ERROR') })}
          </span>
          {message.retryable !== false && (
            <button type="button" onClick={onRetry} className="min-h-9 rounded-full bg-surface-container-high px-4 font-semibold text-on-surface hover:bg-surface-container-highest">
              {t('common.retry')}
            </button>
          )}
        </div>
      )}
      {message.status === 'stopped' && <p className="ml-2 text-label-md text-on-surface-variant">{t('chat.stopped')}</p>}

      {(time || (showTiming && message.timing)) && done && (
        <span className="ml-2 text-label-sm text-on-surface-variant">
          {time}
          {showTiming && message.timing && (
            <>
              {time ? ' · ' : ''}
              {t('chat.timing', {
                first: message.timing.firstTokenMs === null ? '-' : (message.timing.firstTokenMs / 1000).toFixed(1),
                total: (message.timing.totalMs / 1000).toFixed(1),
              })}
            </>
          )}
        </span>
      )}

      {message.safety && <SafetyCard safety={message.safety} />}
    </li>
  );
}
