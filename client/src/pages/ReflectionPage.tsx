import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Orb } from '../components/companion/Orb';
import { Button } from '../components/ui/Button';
import { TextArea } from '../components/ui/Form';
import { CheckIcon } from '../components/ui/Icons';
import { Banner, Card } from '../components/ui/Layout';
import { useUser } from '../contexts/AuthContext';
import { ApiError } from '../lib/api/client';
import { memoryApi, reflectApi } from '../lib/api/endpoints';
import type { MemorySuggestion } from '../lib/api/types';
import { reflectionHandoff } from '../lib/reflectionHandoff';

type Load<T> = { status: 'idle' } | { status: 'loading' } | { status: 'error'; code: string } | { status: 'ready'; value: T };

function errorCode(err: unknown) {
  return err instanceof ApiError ? err.code : 'AI_ERROR';
}

/**
 * Everything here is optional and only happens if she asks. The transcript
 * passed in lives only in this page's memory and is dropped when she leaves.
 */
export default function ReflectionPage() {
  const { t } = useTranslation();
  const user = useUser();
  const navigate = useNavigate();
  const [state] = useState(() => reflectionHandoff.get());
  useEffect(() => () => reflectionHandoff.clear(), []);

  const [summary, setSummary] = useState<Load<string>>({ status: 'idle' });
  const [steps, setSteps] = useState<Load<string[]>>({ status: 'idle' });
  const [chosenStep, setChosenStep] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Load<(MemorySuggestion & { selected: boolean })[]>>({ status: 'idle' });
  const [own, setOwn] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mock, setMock] = useState(false);

  if (!state?.messages?.length) return <Navigate to="/home" replace />;
  const { messages, language } = state;
  const canSave = user.persistence.memories;

  async function loadSummary() {
    setSummary({ status: 'loading' });
    try {
      const res = await reflectApi.text('summary', language, messages);
      setMock(res.ai.mock);
      setSummary({ status: 'ready', value: res.text });
    } catch (err) {
      setSummary({ status: 'error', code: errorCode(err) });
    }
  }

  async function loadSteps() {
    setSteps({ status: 'loading' });
    try {
      const res = await reflectApi.text('next_step', language, messages);
      setMock(res.ai.mock);
      const lines = res.text
        .split('\n')
        .map((l) => l.replace(/^[\s\-*•\d.)]+/, '').trim())
        .filter(Boolean)
        .slice(0, 3);
      setSteps({ status: 'ready', value: lines });
    } catch (err) {
      setSteps({ status: 'error', code: errorCode(err) });
    }
  }

  async function loadSuggestions() {
    setSuggestions({ status: 'loading' });
    try {
      const res = await reflectApi.memorySuggestions(language, messages);
      setMock(res.ai.mock);
      // Nothing is pre-selected: she chooses each item deliberately.
      setSuggestions({ status: 'ready', value: res.suggestions.map((s) => ({ ...s, selected: false })) });
    } catch (err) {
      setSuggestions({ status: 'error', code: errorCode(err) });
    }
  }

  async function saveSelected() {
    const chosen = suggestions.status === 'ready' ? suggestions.value.filter((s) => s.selected) : [];
    const items = [
      ...chosen.map(({ content, category, kind, sensitive }) => ({ content, category, kind, sensitive })),
      ...(own.trim() ? [{ content: own.trim(), kind: 'STATED' as const }] : []),
    ];
    if (items.length === 0) return;
    setSaving(true);
    try {
      for (const item of items) await memoryApi.create(item);
      setSaved(true);
      setOwn('');
      if (suggestions.status === 'ready') {
        setSuggestions({ status: 'ready', value: suggestions.value.filter((s) => !s.selected) });
      }
    } catch {
      setSuggestions({ status: 'error', code: 'AI_ERROR' });
    } finally {
      setSaving(false);
    }
  }

  const failure = (code: string) => (
    <Banner tone="error">{t(`chat.errors.${code}`, { defaultValue: t('common.error') })}</Banner>
  );
  const selectedCount = (suggestions.status === 'ready' ? suggestions.value.filter((s) => s.selected).length : 0) + (own.trim() ? 1 : 0);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-6 safe-bottom">
      <main id="main" className="flex flex-1 flex-col gap-4 pb-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Orb size={110} variant="home" />
          <h1 className="font-display text-3xl font-semibold text-ink">{t('reflect.title')}</h1>
          <p className="text-lg text-ink-soft">{t('reflect.body')}</p>
        </div>

        {mock && <Banner tone="warning">{t('reflect.mockNote')}</Banner>}

        <Card>
          <h2 className="font-display mb-2 text-lg font-semibold">{t('reflect.summaryTitle')}</h2>
          {summary.status === 'ready' ? (
            <p className="whitespace-pre-wrap text-ink" lang={language}>
              {summary.value}
            </p>
          ) : (
            <>
              {summary.status === 'error' && failure(summary.code)}
              <Button variant="soft" onClick={loadSummary} loading={summary.status === 'loading'}>
                {t('reflect.summaryAction')}
              </Button>
            </>
          )}
        </Card>

        <Card>
          <h2 className="font-display mb-2 text-lg font-semibold">{t('reflect.nextTitle')}</h2>
          {steps.status === 'ready' ? (
            chosenStep ? (
              <p className="flex gap-2 font-semibold text-sage-700" lang={language}>
                <CheckIcon className="shrink-0" />
                {t('reflect.nextChosen', { step: chosenStep })}
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-ink-faint">{t('reflect.nextChoose')}</p>
                <div className="flex flex-col gap-2">
                  {steps.value.map((step) => (
                    <button
                      key={step}
                      type="button"
                      lang={language}
                      onClick={() => setChosenStep(step)}
                      className="rounded-2xl border border-line bg-cream-50 px-4 py-3 text-left text-ink hover:border-sage-500 hover:bg-sage-100"
                    >
                      {step}
                    </button>
                  ))}
                </div>
              </>
            )
          ) : (
            <>
              {steps.status === 'error' && failure(steps.code)}
              <Button variant="soft" onClick={loadSteps} loading={steps.status === 'loading'}>
                {t('reflect.nextAction')}
              </Button>
            </>
          )}
        </Card>

        <Card>
          <h2 className="font-display mb-2 text-lg font-semibold">{t('reflect.saveTitle')}</h2>
          {!canSave ? (
            <div className="flex flex-col gap-3">
              <p className="text-ink-soft">{t('reflect.saveDisabled')}</p>
              <Link to="/privacy" className="font-semibold text-terracotta-600 underline-offset-4 hover:underline">
                {t('reflect.changeSetting')}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {saved && <Banner tone="success">{t('reflect.saveDone')}</Banner>}
              {suggestions.status === 'error' && failure(suggestions.code)}
              {suggestions.status === 'ready' ? (
                suggestions.value.length === 0 ? (
                  !saved && <p className="text-ink-soft">{t('reflect.saveNone')}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {suggestions.value.map((s, i) => (
                      <li key={`${i}-${s.content}`}>
                        <label className="flex cursor-pointer gap-3 rounded-2xl border border-line bg-cream-50 p-3 has-[:checked]:border-sage-500 has-[:checked]:bg-sage-100">
                          <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 accent-sage-700"
                            checked={s.selected}
                            onChange={(e) =>
                              setSuggestions({
                                status: 'ready',
                                value: suggestions.value.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)),
                              })
                            }
                          />
                          <span className="flex flex-col gap-1">
                            <span className="text-ink" lang={language}>
                              {s.content}
                            </span>
                            <span className="text-xs text-ink-faint">
                              {s.kind === 'STATED' ? t('memories.stated') : t('memories.interpretation')}
                            </span>
                            {s.sensitive && <span className="text-xs font-semibold text-terracotta-700">{t('reflect.saveSensitive')}</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <Button variant="soft" onClick={loadSuggestions} loading={suggestions.status === 'loading'}>
                  {t('reflect.saveAction')}
                </Button>
              )}
              <TextArea label={t('reflect.ownLabel')} placeholder={t('reflect.ownPlaceholder')} rows={2} maxLength={500} value={own} onChange={(e) => setOwn(e.target.value)} lang={language} />
              <Button onClick={saveSelected} loading={saving} disabled={selectedCount === 0}>
                {t('reflect.saveSelected')}
              </Button>
            </div>
          )}
        </Card>

        <Button size="lg" block variant="secondary" onClick={() => navigate('/home', { replace: true })}>
          {t('reflect.finish')}
        </Button>
      </main>
    </div>
  );
}
