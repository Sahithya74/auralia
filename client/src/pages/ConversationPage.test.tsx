import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../lib/api/types';
import ConversationPage from './ConversationPage';

const streamChat = vi.fn();
vi.mock('../lib/api/chatStream', () => ({ streamChat: (...args: unknown[]) => streamChat(...args) }));
vi.mock('../hooks/useHealth', () => ({ useHealth: () => ({ ai: { mock: false } }) }));

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
