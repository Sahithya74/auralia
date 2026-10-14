import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../lib/api/types';
import ConversationPage from './ConversationPage';

const streamChat = vi.fn();
vi.mock('../lib/api/chatStream', () => ({ streamChat: (...args: unknown[]) => streamChat(...args) }));
let health: { ai: { mock: boolean }; voice?: { natural: boolean } } = { ai: { mock: false } };
vi.mock('../hooks/useHealth', () => ({ useHealth: () => health }));

/** Natural-voice playback stand-in: each call waits until the test says it has finished. */
const natural = vi.hoisted(() => ({ supported: false, calls: [] as { text: string; finish: () => void }[] }));
vi.mock('../lib/voice/naturalVoice', () => ({
  isNaturalVoiceSupported: () => natural.supported,
  isSlowConnection: () => false,
  unlockAudio: () => undefined,
  playNaturalVoice: (text: string) => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    natural.calls.push({ text, finish });
    return { started: Promise.resolve(true), finished, stop: () => finish() };
  },
}));

let currentUser: User;
vi.mock('../contexts/AuthContext', () => ({
  useUser: () => currentUser,
  useAuth: () => ({ user: currentUser, updateUser: vi.fn().mockResolvedValue(currentUser) }),
}));

function makeUser(memoryMode: User['memoryMode'], interactionMode: User['interactionMode'] = 'BOTH'): User {
  return {
    id: 'u1',
    name: 'Meena',
    email: 'meena@example.test',
    preferredLanguage: 'en',
    interactionMode,
    memoryMode,
    onboardingCompleted: true,
    createdAt: new Date().toISOString(),
    preferences: {
      responseStyle: 'BALANCED',
      historyEnabled: false,
      codeMixing: true,
      voiceOutputEnabled: true,
      voiceRate: 1,
      voiceInputReview: false,
      captionsEnabled: true,
      reducedMotion: true,
      textSize: 'md',
      highContrast: false,
      dailyPromptEnabled: true,
      analyticsConsent: false,
    },
    persistence: { mode: memoryMode, transcripts: false, memories: memoryMode === 'PERSONAL' },
  };
}

function renderPage(url = '/talk?mode=text') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/talk" element={<ConversationPage />} />
        <Route path="/reflect" element={<p>reflection page</p>} />
        <Route path="/home" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

type Handler = ((event: unknown) => void) | null;

/** A scripted stand-in for the browser's speech recognition. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  aborted = false;
  onresult: Handler = null;
  onerror: Handler = null;
  onend: Handler = null;
  onspeechend: Handler = null;
  start() {
    FakeRecognition.instances.push(this);
  }
  stop() {
    this.onend?.({});
  }
  abort() {
    this.aborted = true;
    this.onerror?.({ error: 'aborted' });
    this.onend?.({});
  }
  say(text: string) {
    const result = Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: [result] });
    this.onend?.({});
  }
  silence() {
    this.onerror?.({ error: 'no-speech' });
    this.onend?.({});
  }
}

/** Finds text inside the message list (replies are also announced in a screen-reader live region). */
const findReply = (text: RegExp) => screen.findByText(text, { selector: 'li *' });

function replyWith(text: string, safety = { level: 'none', categories: [], resources: [] }) {
  streamChat.mockImplementation(async (_body, handlers) => {
    handlers.onMeta({ safety, ai: { mock: false } });
    for (const word of text.split(' ')) handlers.onDelta(word + ' ');
    handlers.onDone({ conversationId: null, persisted: false, staticFallback: false, timing: { prepareMs: 1, firstTokenMs: 2, totalMs: 3 } });
  });
}

describe('ConversationPage', () => {
  beforeEach(() => {
    streamChat.mockReset();
  });

  it('falls back to typing with a clear message when the browser has no speech recognition', async () => {
    currentUser = makeUser('SESSION', 'VOICE');
    renderPage('/talk?mode=voice');
    expect(await screen.findByText(/Speaking to Anbu isn't supported in this browser/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start speaking' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Type instead' }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start speaking' })).not.toBeInTheDocument();
  });

  describe('live voice conversation', () => {
    const speechWindow = window as unknown as { SpeechRecognition?: unknown };
    beforeEach(() => {
      FakeRecognition.instances = [];
      speechWindow.SpeechRecognition = FakeRecognition;
      return () => {
        delete speechWindow.SpeechRecognition;
        health = { ai: { mock: false } };
        natural.supported = false;
        natural.calls = [];
      };
    });

    async function startTalking() {
      const start = await screen.findByRole('button', { name: 'Start speaking' });
      await waitFor(() => expect(start).toBeEnabled());
      await userEvent.click(start);
    }

    it('greets her in the natural voice and only listens once Anbu has finished speaking', async () => {
      health = { ai: { mock: false }, voice: { natural: true } };
      natural.supported = true;
      currentUser = makeUser('SESSION', 'VOICE');
      replyWith('I am right here with you.');
      renderPage('/talk?mode=voice');
      await startTalking();

      await waitFor(() => expect(natural.calls).toHaveLength(1));
      expect(natural.calls[0]!.text).toContain('Meena');
      expect(FakeRecognition.instances).toHaveLength(0);
      await act(async () => natural.calls[0]!.finish());
      await waitFor(() => expect(FakeRecognition.instances).toHaveLength(1));

      act(() => FakeRecognition.instances[0]!.say('I had a hard day'));
      await waitFor(() => expect(natural.calls).toHaveLength(2));
      expect(natural.calls[1]!.text).toBe('I am right here with you.');
      // Not listening while Anbu is still talking, so the microphone never hears her.
      await new Promise((r) => setTimeout(r, 1000));
      expect(FakeRecognition.instances).toHaveLength(1);
      await act(async () => natural.calls[1]!.finish());
      await waitFor(() => expect(FakeRecognition.instances).toHaveLength(2));
    });

    it('quietly tries again once when the connection drops, and the conversation carries on', async () => {
      currentUser = makeUser('SESSION', 'VOICE');
      let calls = 0;
      streamChat.mockImplementation(async (_body, handlers) => {
        calls++;
        if (calls === 1) {
          handlers.onError({ code: 'AI_NETWORK', retryable: true, partial: false });
          return;
        }
        handlers.onMeta({ safety: { level: 'none', categories: [], resources: [] }, ai: { mock: false } });
        handlers.onDelta('Still here with you. ');
        handlers.onDone({ conversationId: null, persisted: false, staticFallback: false, timing: { prepareMs: 1, firstTokenMs: 1, totalMs: 1 } });
      });
      renderPage('/talk?mode=voice');
      await startTalking();
      act(() => FakeRecognition.instances[0]!.say('hello'));
      expect(await screen.findByText(/Still here with you\./, { selector: 'p' }, { timeout: 4000 })).toBeInTheDocument();
      expect(streamChat).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(FakeRecognition.instances).toHaveLength(2));
    });

    it('keeps listening after each reply without another tap, until she pauses', async () => {
      currentUser = makeUser('SESSION', 'VOICE');
      replyWith('That sounds like a long day.');
      renderPage('/talk?mode=voice');
      const start = await screen.findByRole('button', { name: 'Start speaking' });
      await waitFor(() => expect(start).toBeEnabled());
      await userEvent.click(start);
      expect(FakeRecognition.instances).toHaveLength(1);

      FakeRecognition.instances[0]!.say('I am so tired');
      expect(await screen.findByText(/That sounds like a long day\./, { selector: 'p' })).toBeInTheDocument();
      expect(streamChat.mock.calls[0]![0]).toMatchObject({ channel: 'voice' });

      // Her turn again, with no button press.
      await waitFor(() => expect(FakeRecognition.instances).toHaveLength(2));
      expect(FakeRecognition.instances[1]!.lang).toBe('en-IN');

      await userEvent.click(screen.getByRole('button', { name: 'Pause conversation' }));
      expect(FakeRecognition.instances[1]!.aborted).toBe(true);
      expect(screen.getByRole('button', { name: 'Start speaking' })).toBeEnabled();
    });

    it('pauses itself after a long silence and can continue', async () => {
      currentUser = makeUser('SESSION', 'VOICE');
      renderPage('/talk?mode=voice');
      const start = await screen.findByRole('button', { name: 'Start speaking' });
      await waitFor(() => expect(start).toBeEnabled());
      await userEvent.click(start);

      for (let turn = 1; turn <= 3; turn++) {
        await waitFor(() => expect(FakeRecognition.instances).toHaveLength(turn));
        FakeRecognition.instances[turn - 1]!.silence();
      }
      expect(await screen.findByText(/It went quiet/)).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 300));
      expect(FakeRecognition.instances).toHaveLength(3);

      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(FakeRecognition.instances).toHaveLength(4);
      expect(streamChat).not.toHaveBeenCalled();
    });
  });

  it('streams a reply into the conversation and sends recent context in the chosen language', async () => {
    currentUser = makeUser('SESSION');
    replyWith('It sounds exhausting.');
    renderPage();
    await userEvent.type(screen.getByRole('textbox'), 'Nobody asks if I am tired{Enter}');
    expect(await findReply(/It sounds exhausting\./)).toBeInTheDocument();
    const body = streamChat.mock.calls[0]![0];
    expect(body).toMatchObject({ language: 'en', messages: [{ role: 'user', content: 'Nobody asks if I am tired' }] });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps session context in this tab only in Session mode', async () => {
    currentUser = makeUser('SESSION');
    replyWith('I hear you.');
    renderPage();
    await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}');
    await findReply(/I hear you\./);
    await waitFor(() => expect(window.sessionStorage.getItem('anbu.conversation.u1')).toContain('hello'));
    expect(window.localStorage.getItem('anbu.conversation.u1')).toBeNull();
  });

  it('stores nothing in the browser in No-memory mode', async () => {
    currentUser = makeUser('NONE');
    replyWith('I hear you.');
    renderPage();
    await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}');
    await findReply(/I hear you\./);
    expect(window.sessionStorage.length).toBe(0);
    expect(Object.keys(window.localStorage).some((k) => k.includes('conversation'))).toBe(false);
  });

  it('shows support resources when the safety layer flags a message', async () => {
    currentUser = makeUser('SESSION');
    replyWith('I am glad you told me.', {
      level: 'concern',
      categories: ['self_harm'],
      resources: [
        { id: 'emergency', phone: '112' },
        { id: 'telemanas', phone: '14416' },
      ],
    } as never);
    renderPage();
    await userEvent.type(screen.getByRole('textbox'), 'I want to die{Enter}');
    expect(await screen.findByText("You don't have to face this alone")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tele-MANAS/ })).toHaveAttribute('href', 'tel:14416');
  });

  it('can stop a reply mid-stream and shows a retry for failures', async () => {
    currentUser = makeUser('SESSION');
    streamChat.mockImplementation(
      (_body, handlers, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          handlers.onDelta('Let me think');
          signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    );
    renderPage();
    await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Stop reply' }));
    expect(await screen.findByText('You stopped this reply.')).toBeInTheDocument();

    streamChat.mockImplementation(async (_body, handlers) => handlers.onError({ code: 'AI_BUSY', retryable: true, partial: false }));
    await userEvent.type(screen.getByRole('textbox'), 'again{Enter}');
    expect(await findReply(/Anbu is very busy right now/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('asks before ending, then offers the optional reflection', async () => {
    currentUser = makeUser('SESSION');
    replyWith('Take care.');
    renderPage();
    await userEvent.type(screen.getByRole('textbox'), 'bye{Enter}');
    await findReply(/Take care\./);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(await screen.findByRole('button', { name: 'End conversation' }));
    expect(await screen.findByText('reflection page')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('anbu.conversation.u1')).toBeNull();
  });
});
