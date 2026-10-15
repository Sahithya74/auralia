import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Composer, type ComposerHandle } from '../components/chat/Composer';
import { MessageBubble, replyParts } from '../components/chat/MessageBubble';
import { SafetyCard } from '../components/chat/SafetyCard';
import { Orb, type OrbState } from '../components/companion/Orb';
import { LanguagePill, SessionTopBar } from '../components/layout/AppChrome';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { ChoiceCard } from '../components/ui/Form';
import { Icon } from '../components/ui/Icons';
import { Banner } from '../components/ui/Layout';
import { useAuth, useUser } from '../contexts/AuthContext';
import { toContext, useConversation, type ReplyEvents, type UiMessage } from '../hooks/useConversation';
import { useHealth } from '../hooks/useHealth';
import { useOnline } from '../hooks/useOnline';
import type { ConversationDetail, Mood, ResponseStyle } from '../lib/api/types';
import { isSupported, languageInfo } from '../lib/i18n/languages';
import { reflectionHandoff } from '../lib/reflectionHandoff';
import { KEYS, local } from '../lib/storage';
import { detectVoiceSupport, isNeuralVoice, type VoiceSupport } from '../lib/voice/capabilities';
import { isNaturalVoiceResting, isNaturalVoiceSupported, isSlowConnection, unlockAudio } from '../lib/voice/naturalVoice';
import { canListenPatiently, startRecognition, type RecognitionError, type Recognizer } from '../lib/voice/recognition';
import { SpeechPlayer, type SpeakOptions } from '../lib/voice/speechPlayer';
import { keepScreenOn } from '../lib/voice/wakeLock';

const MOODS: Mood[] = ['carrying', 'tired', 'peaceful', 'need_to_talk'];
const STATES: OrbState[] = ['idle', 'listening', 'thinking', 'speaking'];
const SUGGESTIONS = ['chat.suggest1', 'chat.suggest2', 'chat.suggest3'] as const;
const STATE_DOT: Record<OrbState, string> = {
  idle: 'bg-outline',
  listening: 'bg-primary',
  thinking: 'bg-secondary',
  speaking: 'bg-tertiary',
};
/** Live conversation: a pause this long ends her turn; this much silence counts as not speaking. */
const PATIENT_SILENCE_MS = 1500;
const NO_SPEECH_MS = 8000;
/** Coming back to the page within this long carries a live conversation on without a tap. */
const RESUME_WITHIN_MS = 10 * 60_000;
const MAIN_BUTTON_ICON = { idle: 'mic', listening: 'pause', thinking: 'hourglass_top', speaking: 'stop' } as const;

export default function ConversationPage() {
  const { t, i18n } = useTranslation();
  const user = useUser();
  const { updateUser, updatePreferences } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const health = useHealth();
  const online = useOnline();
  const prefs = user.preferences;

  const moodParam = params.get('mood') as Mood | null;
  const mood = moodParam && MOODS.includes(moodParam) ? moodParam : undefined;
  const [view, setView] = useState<'voice' | 'text'>(() =>
    params.get('mode') ? (params.get('mode') === 'voice' ? 'voice' : 'text') : user.interactionMode === 'TEXT' ? 'text' : 'voice',
  );
  const showTiming = local.get(KEYS.showTiming) === 'true';
  const [openedAt] = useState(() => Date.now());

  const [language, setLanguage] = useState(user.preferredLanguage);
  const lang = languageInfo(language);
  const [announcement, setAnnouncement] = useState('');
  const [languageNotice, setLanguageNotice] = useState<string | null>(null);
  const timeFormat = new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' });
  const formatTime = (ms?: number) => (ms ? timeFormat.format(ms) : undefined);

  // --- What voice features this browser offers for the current language
  const [support, setSupport] = useState<VoiceSupport | null>(null);
  const recheckSupport = useCallback(() => {
    void detectVoiceSupport(lang.speechTag, prefs.voiceGender).then(setSupport);
  }, [lang.speechTag, prefs.voiceGender]);
  useEffect(recheckSupport, [recheckSupport]);
  const recognitionOk = support?.recognition === 'available';
  const synthesisOk = support?.synthesis === 'available';

  // --- Speech output: Anbu's natural voice from the server when available,
  // otherwise the device's own voice for the language.
  const naturalOk = Boolean(health?.voice?.natural) && isNaturalVoiceSupported();
  const canSpeak = prefs.voiceOutputEnabled && (naturalOk || synthesisOk);
  const [speaking, setSpeaking] = useState(false);
  const [preparingVoice, setPreparingVoice] = useState(false);
  const [pulse, setPulse] = useState(0);
  const playerRef = useRef<SpeechPlayer | null>(null);
  playerRef.current ??= new SpeechPlayer({
    onSpeakingChange: setSpeaking,
    onPreparingChange: setPreparingVoice,
    onBoundary: () => setPulse((p) => p + 1),
  });
  const player = playerRef.current;
  const speakOptions = useCallback((): SpeakOptions => {
    // The device voice starts sooner (sentence by sentence while the reply arrives). It is
    // used when it is itself a natural-sounding voice, on a very slow connection, or while
    // the server's voice is busy.
    const natural =
      naturalOk && !(synthesisOk && (isNeuralVoice(support?.voice) || isSlowConnection() || isNaturalVoiceResting()));
    return {
      lang: lang.speechTag,
      rate: prefs.voiceRate,
      voice: support?.voice ?? null,
      natural: natural ? { language, deviceFallback: synthesisOk, gender: prefs.voiceGender } : undefined,
    };
  }, [lang.speechTag, prefs.voiceRate, prefs.voiceGender, support, naturalOk, synthesisOk, language]);

  // --- Conversation
  const lastInputWasVoice = useRef(false);
  const speakThisReply = useRef(false);
  const autoRetries = useRef(0);
  const events = useRef<ReplyEvents>({});
  const convo = useConversation({ userId: user.id, keepInTab: user.memoryMode !== 'NONE', language, mood, events });

  useEffect(() => {
    events.current = {
      onReplyStart: () => {
        speakThisReply.current = canSpeak && (lastInputWasVoice.current || view === 'voice' || user.interactionMode === 'VOICE');
        if (speakThisReply.current) player.beginStream(speakOptions());
      },
      onDelta: (delta) => {
        if (speakThisReply.current) player.pushStream(delta);
      },
      onReplyEnd: (message, outcome) => {
        const spoke = speakThisReply.current;
        if (spoke) {
          if (outcome === 'done') player.endStream();
          else player.stop();
        } else if (outcome === 'done') {
          setAnnouncement(message.content);
        }
        speakThisReply.current = false;
        if (!liveRef.current || outcome === 'stopped') return;
        if (outcome === 'error') {
          // A dropped connection or a busy moment: quietly try once more before pausing.
          if (message.retryable !== false && autoRetries.current < 1) {
            autoRetries.current++;
            setTimeout(() => liveRef.current && convo.retry(), 1200);
          } else {
            pauseLive();
          }
          return;
        }
        autoRetries.current = 0;
        // Listen again once she has heard the reply. While it is still being
        // prepared or spoken the check waits, and the speech-finished effect takes over.
        scheduleListen(spoke ? 800 : 500);
      },
    };
  });

  // Continue a conversation opened from history.
  useEffect(() => {
    const state = location.state as { continueConversation?: ConversationDetail } | null;
    const c = state?.continueConversation;
    if (!c) return;
    convo.load(
      c.messages.map((m) => ({
        id: m.id,
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
        status: 'done',
        at: new Date(m.createdAt).getTime(),
      })),
      c.id,
    );
    if (isSupported(c.language)) setLanguage(c.language);
    setView('text');
    navigate(location.pathname + location.search, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Voice input
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [voiceError, setVoiceError] = useState<RecognitionError | null>(null);
  const recognizer = useRef<Recognizer | null>(null);
  const [draft, setDraft] = useState('');
  /** The draft holds speech-recognition output the user is reviewing or correcting. */
  const [draftFromVoice, setDraftFromVoice] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const composer = useRef<ComposerHandle>(null);

  const submit = (text: string, source: 'voice' | 'text') => {
    if (!text.trim() || convo.pending) return;
    if (source === 'text') unlockAudio();
    lastInputWasVoice.current = source === 'voice';
    void convo.send(text, { source, replacesLast: correcting, channel: source === 'voice' && view === 'voice' ? 'voice' : 'text' });
    setDraft('');
    setDraftFromVoice(false);
    setCorrecting(false);
    setInterim('');
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // --- Live conversation: after one tap, listen → reply → listen again, like a call.
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const pendingRef = useRef(false);
  pendingRef.current = convo.pending;
  const silentTurns = useRef(0);
  const listenTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [livePausedNote, setLivePausedNote] = useState(false);
  /** Quiet turns in a row (no speech heard, about 8 s each) before the live conversation pauses itself. */
  const MAX_SILENT_TURNS = 5;
  /** When she left the page during a live conversation, so it can carry on when she returns. */
  const awaySince = useRef<number | null>(null);

  const setLiveMode = (on: boolean) => {
    liveRef.current = on;
    setLive(on);
    if (!on) clearTimeout(listenTimer.current);
  };

  const startListening = () => {
    clearTimeout(listenTimer.current);
    if (recognizer.current) return;
    player.stop();
    if (convo.pending) convo.stop();
    setVoiceError(null);
    setInterim('');
    const patient = liveRef.current && canListenPatiently();
    const rec = startRecognition(lang.speechTag, {
      onInterim: setInterim,
      onFinal: (text) => {
        silentTurns.current = 0;
        if (prefs.voiceInputReview) {
          setLiveMode(false);
          setView('text');
          setDraft(text);
          setDraftFromVoice(true);
          setTimeout(() => composer.current?.focus(), 0);
        } else {
          submitRef.current(text, 'voice');
        }
      },
      onError: (error) => {
        if (error === 'no-speech' && liveRef.current) {
          // She may just be thinking. Keep listening quietly for a while.
          silentTurns.current += 1;
          if (silentTurns.current < MAX_SILENT_TURNS) {
            scheduleListen(200);
            return;
          }
          setLiveMode(false);
          setLivePausedNote(true);
          return;
        }
        if (liveRef.current) setLiveMode(false);
        setVoiceError(error);
        if (error === 'language-not-supported') recheckSupport();
      },
      onEnd: () => {
        setListening(false);
        recognizer.current = null;
      },
    }, patient ? { endSilenceMs: PATIENT_SILENCE_MS, noSpeechMs: NO_SPEECH_MS } : {});
    if (rec) {
      recognizer.current = rec;
      setListening(true);
    } else if (liveRef.current) {
      setLiveMode(false);
    }
  };
  const stopListening = () => recognizer.current?.stop();
  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;

  function scheduleListen(delayMs: number) {
    clearTimeout(listenTimer.current);
    listenTimer.current = setTimeout(() => {
      if (!liveRef.current || pendingRef.current || playerRef.current?.busy) return;
      // The previous recognizer may still be closing; try again shortly.
      if (recognizer.current) scheduleListen(150);
      else startListeningRef.current();
    }, delayMs);
  }

  function pauseLive() {
    setLiveMode(false);
    recognizer.current?.abort();
  }

  /** Starts a free-flowing conversation: a short spoken hello on the first turn, then listening. */
  const beginLive = () => {
    unlockAudio();
    autoRetries.current = 0;
    setLivePausedNote(false);
    setVoiceError(null);
    silentTurns.current = 0;
    setLiveMode(true);
    const greet = convo.messages.length === 0 && !greeting && canSpeak;
    if (greet) {
      const hello = t('chat.greeting', { name: user.name });
      setGreeting(hello);
      // Listening starts when the greeting finishes (speech-finished effect below).
      player.speak(hello, speakOptions());
    } else {
      startListening();
    }
  };

  // When Anbu finishes speaking during a live conversation, it's her turn again.
  const voiceBusy = speaking || preparingVoice;
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !voiceBusy && liveRef.current && !pendingRef.current) scheduleListen(350);
    wasBusy.current = voiceBusy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceBusy]);

  // Without a connection Anbu can't answer, so stop listening until she continues.
  useEffect(() => {
    if (!online && liveRef.current) pauseLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Opening the voice screen from a tap (e.g. "Talk with Anbu") starts talking right away.
  // Browsers only allow speech after the person has interacted with the page.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || view !== 'voice' || !support || !recognitionOk || !online) return;
    autoStarted.current = true;
    if (convo.messages.length === 0 && navigator.userActivation?.hasBeenActive) beginLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [support, recognitionOk, view]);

  // Keep the screen on while talking hands-free, so the phone doesn't lock mid-conversation.
  useEffect(() => {
    void keepScreenOn(live);
  }, [live]);

  // Don't keep the microphone open in the background. When she comes back to the
  // page soon, the conversation carries on by itself; after a long break it waits.
  const resumeRef = useRef<() => void>(() => undefined);
  resumeRef.current = () => {
    const away = awaySince.current;
    awaySince.current = null;
    if (away === null || !online || view !== 'voice') return;
    if (Date.now() - away > RESUME_WITHIN_MS) {
      setLivePausedNote(true);
      return;
    }
    silentTurns.current = 0;
    setLivePausedNote(false);
    setLiveMode(true);
    // If Anbu is still answering or speaking, listening starts when she finishes.
    if (!pendingRef.current && !playerRef.current?.busy) scheduleListen(300);
  };
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (liveRef.current) {
          awaySince.current = Date.now();
          pauseLive();
        }
      } else {
        resumeRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(listenTimer.current);
      liveRef.current = false;
      playerRef.current?.stop();
      recognizer.current?.abort();
      void keepScreenOn(false);
    },
    [],
  );

  // --- Language switching mid-conversation
  const changeLanguage = (code: string) => {
    player.stop();
    recognizer.current?.abort();
    setLanguage(code);
    void i18n.changeLanguage(code);
    updateUser({ preferredLanguage: code }).catch(() => undefined);
    setLanguageNotice(t('lang.changed', { lang: languageInfo(code).nativeName }));
    // Keep a live conversation going, now in the new language.
    if (liveRef.current) scheduleListen(600);
  };
  useEffect(() => {
    if (!languageNotice) return;
    const timer = setTimeout(() => setLanguageNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [languageNotice]);

  // --- Ending
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [toneOpen, setToneOpen] = useState(false);
  const endConversation = () => {
    player.stop();
    recognizer.current?.abort();
    convo.stop();
    const transcript = toContext(convo.messages);
    convo.reset();
    if (transcript.length >= 2) {
      reflectionHandoff.set({ messages: transcript, language });
      navigate('/reflect', { replace: true });
    } else {
      navigate('/home', { replace: true });
    }
  };
  const requestEnd = () => (convo.messages.length > 0 ? setConfirmEnd(true) : endConversation());

  // --- Scrolling (text view)
  const endRef = useRef<HTMLDivElement>(null);
  const lastContent = convo.messages.at(-1)?.content.length ?? 0;
  useEffect(() => {
    if (view === 'text') endRef.current?.scrollIntoView({ block: 'end', behavior: prefs.reducedMotion ? 'auto' : 'smooth' });
  }, [convo.messages.length, lastContent, prefs.reducedMotion, view]);

  const state: OrbState = listening ? 'listening' : speaking ? 'speaking' : convo.pending || preparingVoice ? 'thinking' : 'idle';
  const statusText = {
    idle: t('chat.statusIdle'),
    listening: t('chat.statusListening'),
    thinking: t('chat.statusThinking'),
    speaking: t('chat.statusSpeaking'),
  }[state];

  const privacyLine =
    user.memoryMode === 'NONE'
      ? t('chat.privacyNone')
      : user.memoryMode === 'SESSION'
        ? t('chat.privacySession')
        : user.persistence.transcripts
          ? t('chat.privacyHistory')
          : t('chat.privacyPersonal');

  const lastUserIndex = convo.messages.map((m) => m.role).lastIndexOf('user');
  const canCorrect = (m: UiMessage, index: number) =>
    m.source === 'voice' && index === lastUserIndex && !convo.pending && !listening && !correcting;
  const lastReply = [...convo.messages].reverse().find((m) => m.role === 'assistant');
  const canReplay = canSpeak;

  const voiceBanner = support
    ? support.recognition === 'no-api' && view === 'voice'
      ? t('voice.noApi')
      : support.recognition === 'language-rejected'
        ? t('voice.languageRejected', { lang: lang.nativeName })
        : prefs.voiceOutputEnabled && support.synthesis === 'no-voice' && !naturalOk && view === 'voice'
          ? t('voice.noVoice', { lang: lang.nativeName })
          : null
    : null;

  const notices = (
    <div className="flex flex-col gap-2 empty:hidden">
      {health?.ai.mock && <Banner tone="warning">{t('chat.mockBanner')}</Banner>}
      {!online && (
        <Banner tone="warning" icon={<Icon name="wifi_off" size={18} />}>
          {t('chat.offline')}
        </Banner>
      )}
      {languageNotice && <Banner tone="info">{languageNotice}</Banner>}
      {voiceBanner && <Banner tone="info">{voiceBanner}</Banner>}
      {livePausedNote && view === 'voice' && !live && (
        <Banner
          tone="info"
          action={
            <button type="button" className="font-semibold underline" onClick={beginLive}>
              {t('common.continue')}
            </button>
          }
        >
          {t('chat.livePaused')}
        </Banner>
      )}
      {voiceError && (
        <Banner
          tone={voiceError === 'no-speech' ? 'info' : 'error'}
          action={
            <button type="button" className="font-semibold underline" onClick={() => setVoiceError(null)}>
              {t('common.close')}
            </button>
          }
        >
          {t(`voice.errors.${voiceError}`)}
        </Banner>
      )}
    </div>
  );

  const liveRegions = (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="sr-only" aria-live="polite">
        {statusText}
      </div>
    </>
  );

  // ---------------------------------------------------------------- Voice view
  const voiceView = () => {
    const reply = lastReply?.content ? replyParts(lastReply.content) : null;
    // One tap starts the conversation; after that it flows on its own until she pauses it.
    // While Anbu speaks, tapping hands the turn back to her.
    const mainAction = () => {
      unlockAudio();
      if (state === 'speaking') {
        player.stop();
        if (live) startListening();
      } else if (live) pauseLive();
      else beginLive();
    };
    const buttonKey = state === 'speaking' ? 'speaking' : live ? 'listening' : 'idle';
    const buttonLabel = state === 'speaking' ? t('chat.stopSpeaking') : live ? t('chat.pauseLive') : t('chat.micStart');
    return (
      <div className="flex flex-col pb-8">
        <div className="flex items-center justify-between pt-2 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestEnd}
              aria-label={t('common.home')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface-variant shadow-sm transition-transform hover:text-on-surface active:scale-95"
            >
              <Icon name="arrow_back" size={20} />
            </button>
            <span className="flex items-center gap-1.5">
              <span className="font-display text-headline-sm font-semibold tracking-tight text-on-surface">anbu</span>
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary-container" aria-hidden="true" />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguagePill value={language} onChange={changeLanguage} disabled={listening} tone="high" />
            <button type="button" onClick={requestEnd} className="h-9 rounded-full px-3 text-label-sm font-semibold text-secondary hover:bg-surface-container-high">
              {t('chat.end')}
            </button>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between gap-1 rounded-full bg-surface-container-low p-1.5 shadow-sm" aria-hidden="true">
          {STATES.map((s) => (
            <span
              key={s}
              className={`flex-1 rounded-full px-1 py-1.5 text-center text-label-sm transition-all ${
                s === state ? 'bg-primary font-medium text-on-primary shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              {t(`chat.state.${s}`)}
            </span>
          ))}
        </div>

        {notices}

        <div className="relative my-2 flex min-h-[220px] w-full flex-col items-center justify-center">
          <Orb size={176} variant="session" state={state} label={t(`chat.orb.${state}`)} labelStyle="caps" pulse={pulse} />
          <div className="z-10 mt-1 flex items-center gap-2 rounded-full bg-surface-container-high px-4 py-1.5 text-label-md text-on-surface shadow-sm">
            <span className={`h-2.5 w-2.5 animate-pulse rounded-full ${STATE_DOT[state]}`} aria-hidden="true" />
            <span className="font-medium">{statusText}</span>
          </div>
          {listening && prefs.captionsEnabled && (
            <p className="mt-3 max-w-sm text-center text-body-md text-on-surface-variant" lang={language}>
              {interim || '…'}
            </p>
          )}
        </div>

        <div className="mt-3 mb-4 flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="flex items-center gap-1.5 text-secondary">
              <Icon name="spatial_audio_off" size={16} />
              <span className="text-label-sm font-semibold tracking-wider uppercase">{t('chat.thoughtSpace')}</span>
            </span>
            <button
              type="button"
              aria-pressed={prefs.captionsEnabled}
              onClick={() => void updatePreferences({ captionsEnabled: !prefs.captionsEnabled }).catch(() => undefined)}
              className="flex min-h-9 items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-label-sm text-on-surface-variant transition-all hover:text-on-surface active:scale-95"
            >
              <Icon name="subtitles" size={14} className="text-tertiary" />
              {prefs.captionsEnabled ? t('chat.captionsOn') : t('chat.captionsOff')}
            </button>
          </div>
          <div className="relative rounded-lg bg-surface-container-low p-5 shadow-sm" lang={language}>
            {reply ? (
              <>
                <p className="mb-2.5 font-display text-headline-md leading-relaxed text-on-surface italic">“{reply.opening}”</p>
                {(reply.body || reply.question) && (
                  <p className="text-body-lg leading-relaxed text-on-surface-variant">{[reply.body, reply.question].filter(Boolean).join(' ')}</p>
                )}
              </>
            ) : state === 'thinking' ? (
              <p className="font-display text-headline-md leading-relaxed text-on-surface italic">{t('chat.thoughtThinking')}</p>
            ) : greeting ? (
              <p className="font-display text-headline-md leading-relaxed text-on-surface italic">“{greeting}”</p>
            ) : (
              <>
                <p className="mb-2.5 font-display text-headline-md leading-relaxed text-on-surface italic">{t('chat.thoughtIdleQuote')}</p>
                <p className="text-body-lg leading-relaxed text-on-surface-variant">{t('chat.thoughtIdleBody')}</p>
              </>
            )}
            <div className="mt-4 flex items-center justify-between pt-3 text-label-sm text-on-surface-variant">
              <span className="flex items-center gap-1 text-tertiary">
                <Icon name="self_improvement" size={16} />
                <span>{t('chat.toneLabel')}</span>
              </span>
              {canReplay && lastReply?.status === 'done' && (
                <button
                  type="button"
                  onClick={() => {
                    unlockAudio();
                    player.speak(lastReply.content, speakOptions());
                  }}
                  className="flex min-h-9 items-center gap-1 transition-colors hover:text-primary"
                >
                  <Icon name="volume_up" size={16} />
                  <span>{t('chat.hearAgain')}</span>
                </button>
              )}
            </div>
          </div>
          {lastReply?.status === 'error' && (
            <div className="flex flex-wrap items-center gap-2 px-1 text-label-md" role="alert">
              <span className="font-semibold text-error">
                {t(`chat.errors.${lastReply.errorCode ?? 'AI_ERROR'}`, { defaultValue: t('chat.errors.AI_ERROR') })}
              </span>
              {lastReply.retryable !== false && (
                <button type="button" onClick={convo.retry} className="min-h-9 rounded-full bg-surface-container-high px-4 font-semibold">
                  {t('common.retry')}
                </button>
              )}
            </div>
          )}
          {lastReply?.safety && <SafetyCard safety={lastReply.safety} />}
        </div>

        <div className="mt-auto flex flex-col items-center pt-2">
          <div className="flex w-full max-w-sm items-center justify-between gap-2 px-2">
            <button
              type="button"
              onClick={() => {
                pauseLive();
                setView('text');
              }}
              className="flex h-12 items-center gap-2 rounded-full bg-surface-container px-4 text-label-md text-on-surface shadow-sm transition-all hover:bg-surface-container-high active:scale-95"
            >
              <Icon name="keyboard" size={20} className="text-primary" />
              <span>{t('chat.typeInstead')}</span>
            </button>
            <div className="relative flex items-center justify-center">
              {(state === 'listening' || state === 'speaking') && (
                <span className="pointer-events-none absolute h-24 w-24 animate-soft-ping rounded-full bg-secondary-fixed/50" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={mainAction}
                disabled={state !== 'speaking' && !live && (state === 'thinking' || !recognitionOk || !online)}
                aria-label={buttonLabel}
                className="relative z-10 flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition-all hover:bg-on-primary-fixed-variant active:scale-95 disabled:opacity-60"
              >
                <Icon name={MAIN_BUTTON_ICON[buttonKey]} size={32} />
                <span className="-mt-0.5 text-[0.6rem] font-semibold tracking-wider text-on-primary/90 uppercase">{t(`chat.button.${buttonKey}`)}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setToneOpen(true)}
              className="flex h-12 items-center gap-2 rounded-full bg-surface-container px-4 text-label-md text-on-surface shadow-sm transition-all hover:bg-surface-container-high active:scale-95"
            >
              <Icon name="tune" size={20} className="text-secondary" />
              <span>{t('chat.warmTone')}</span>
            </button>
          </div>
          {recognitionOk && (
            <p className="mt-4 max-w-xs text-center text-label-md text-on-surface-variant">{live ? t('chat.liveHint') : t('chat.startHint')}</p>
          )}
          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-label-sm text-on-surface-variant">
            <Icon name="verified_user" size={14} className="shrink-0 text-tertiary" />
            {privacyLine}
          </p>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------- Text view
  const textView = () => {
    const showSuggestions = !convo.pending && !listening && (convo.messages.length === 0 || lastReply?.status === 'done');
    return (
      <>
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-secondary-container/25 blur-3xl" />
          <div className="absolute top-1/3 -left-20 h-72 w-72 rounded-full bg-primary-fixed/20 blur-3xl" />
          <div className="absolute right-4 bottom-16 h-64 w-64 rounded-full bg-tertiary-fixed/30 blur-2xl" />
        </div>
        <div className="relative z-10 flex flex-col pt-1 pb-44">
          <section className="mb-4 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-1 py-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-secondary-container">
                  <span className="absolute h-full w-full animate-soft-ping rounded-full bg-primary-container/20" aria-hidden="true" />
                  <Icon name="spa_fill" size={18} className="text-primary" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-label-md font-medium text-on-surface">{t('history.anbu')}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary" aria-hidden="true" />
                    <span className="text-label-sm text-tertiary">{t('chat.calmPresence')}</span>
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1">
                <LanguagePill value={language} onChange={changeLanguage} disabled={listening} tone="high" />
                <span className="flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1.5 text-on-surface-variant">
                  <Icon name="history_toggle_off" size={14} />
                  <span className="text-label-sm">{t(`memoryModeShort.${user.memoryMode}`)}</span>
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-1.5 shadow-sm">
              <span className="flex items-center gap-1">
                <Icon name="arrow_left" size={16} className="text-tertiary" />
                <span className="text-label-sm text-on-surface-variant">{t('chat.sanctuaryLine')}</span>
              </span>
              <span className="text-label-sm text-tertiary">{formatTime(convo.messages[0]?.at ?? openedAt)}</span>
            </div>
          </section>

          {notices}

          {convo.messages.length === 0 && (
            <div className="mt-6 rounded-lg bg-surface-container-low p-6 text-center shadow-sm">
              <h2 className="font-display text-headline-sm text-on-surface">{t('chat.emptyTitle')}</h2>
              <p className="mt-1 text-body-md text-on-surface-variant">{t('chat.emptyBody')}</p>
            </div>
          )}

          <ol aria-label={t('chat.sessionTitle')} className="mt-2 flex w-full flex-col gap-6">
            {convo.messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                language={language}
                time={formatTime(m.at)}
                canReplay={canReplay}
                canCorrect={canCorrect(m, i)}
                showTiming={showTiming}
                onReplay={(text) => player.speak(text, speakOptions())}
                onRetry={convo.retry}
                onCorrect={(msg) => {
                  setDraft(msg.content);
                  setDraftFromVoice(true);
                  setCorrecting(true);
                  composer.current?.focus();
                }}
              />
            ))}
            {listening && <ThinkingListeningPill text={interim} captions={prefs.captionsEnabled} label={t('chat.statusListening')} language={language} />}
          </ol>

          {showSuggestions && (
            <div className="flex flex-wrap gap-2 pt-4">
              {SUGGESTIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => submit(t(key), 'text')}
                  disabled={!online}
                  className="rounded-full bg-surface-container px-3.5 py-1.5 text-label-md text-on-surface shadow-sm transition-colors hover:bg-secondary-container hover:text-on-secondary-container"
                >
                  “{t(key)}”
                </button>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="pb-safe fixed inset-x-0 bottom-0 z-40 bg-surface/90 px-5 pt-2 shadow-[0_-4px_24px_rgba(61,49,42,0.06)] backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-md flex-col gap-1.5 pb-1">
            {correcting && (
              <Banner
                tone="info"
                action={
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => {
                      setCorrecting(false);
                      setDraftFromVoice(false);
                      setDraft('');
                    }}
                  >
                    {t('chat.cancelCorrection')}
                  </button>
                }
              >
                {t('chat.correcting')}
              </Banner>
            )}
            {draftFromVoice && draft && !correcting && <p className="text-center text-label-sm text-on-surface-variant">{t('voice.reviewHint')}</p>}
            {(convo.pending || speaking) && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Icon name="stop" size={16} />}
                  onClick={() => (speaking ? player.stop() : convo.stop())}
                >
                  {speaking ? t('chat.stopSpeaking') : t('chat.stopReply')}
                </Button>
              </div>
            )}
            <Composer
              ref={composer}
              value={draft}
              onChange={(value) => {
                setDraft(value);
                if (!value) setDraftFromVoice(false);
              }}
              onSubmit={() => submit(draft, draftFromVoice ? 'voice' : 'text')}
              disabled={convo.pending || !online}
              placeholder={t('chat.placeholder')}
              language={language}
              leading={
                recognitionOk ? (
                  <button
                    type="button"
                    onClick={listening ? stopListening : startListening}
                    disabled={!online}
                    aria-pressed={listening}
                    aria-label={listening ? t('chat.micStop') : t('chat.micStart')}
                    title={listening ? t('chat.micStop') : t('chat.micStart')}
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-on-primary shadow-sm transition-all active:scale-95 disabled:opacity-60 ${
                      listening ? 'bg-tertiary' : 'bg-primary hover:bg-on-primary-fixed-variant'
                    }`}
                  >
                    <Icon name={listening ? 'stop' : 'mic'} size={22} />
                  </button>
                ) : undefined
              }
            />
            <p className="flex items-center justify-center gap-1.5 py-1 text-center text-label-sm text-on-surface-variant">
              <Icon name="lock" size={14} className="shrink-0 text-tertiary" />
              {privacyLine}
            </p>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <SessionTopBar title={t('chat.sessionTitle')} onBack={requestEnd} lockLabel={privacyLine} />
      <main id="main" className="relative mx-auto w-full max-w-2xl flex-1 px-5 pt-16">
        {view === 'voice' ? voiceView() : textView()}
        {liveRegions}
      </main>

      <Dialog
        open={confirmEnd}
        title={t('chat.endTitle')}
        onClose={() => setConfirmEnd(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
              {t('chat.keepTalking')}
            </Button>
            <Button onClick={endConversation}>{t('chat.endConfirm')}</Button>
          </>
        }
      >
        {user.memoryMode === 'NONE' ? t('chat.endBodyNone') : user.persistence.transcripts ? t('chat.endBodyHistory') : t('chat.endBodySession')}
      </Dialog>

      <Dialog
        open={toneOpen}
        title={t('settings.styleTitle')}
        onClose={() => setToneOpen(false)}
        actions={
          <Button variant="secondary" onClick={() => setToneOpen(false)}>
            {t('common.done')}
          </Button>
        }
      >
        <div role="radiogroup" className="flex flex-col gap-2">
          {(
            [
              ['LISTEN', 'listen'],
              ['SOLUTIONS', 'solutions'],
              ['BALANCED', 'balanced'],
            ] as [ResponseStyle, string][]
          ).map(([value, key]) => (
            <ChoiceCard
              key={value}
              name="tone"
              value={value}
              checked={prefs.responseStyle === value}
              onChange={() => void updatePreferences({ responseStyle: value }).catch(() => undefined)}
              title={t(`onboarding.style.${key}Title`)}
              description={t(`onboarding.style.${key}Body`)}
            />
          ))}
        </div>
      </Dialog>
    </div>
  );
}

/** While she speaks in the text view, her words appear here as live captions. */
function ThinkingListeningPill({ text, captions, label, language }: { text: string; captions: boolean; label: string; language: string }) {
  return (
    <li className="flex w-full flex-col items-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-dashed border-secondary-fixed-dim bg-secondary-fixed/40 px-4 py-3 text-on-secondary-container">
        <span className="flex items-center gap-2 text-label-sm text-secondary">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          {label}
        </span>
        {captions && (
          <p className="mt-1 text-body-md" lang={language}>
            {text || '…'}
          </p>
        )}
      </div>
    </li>
  );
}
