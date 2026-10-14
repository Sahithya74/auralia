import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db.js';
import { memoryGate } from '../../src/persistence/memoryGate.js';
import {
  bearer,
  chatBody,
  describeDb,
  listen,
  makeApp,
  parseSse,
  registerUser,
  resetDatabase,
  setPrivacy,
  storedTranscriptCount,
} from './helpers.js';

describeDb('memory mode enforcement', () => {
  let app = makeApp();
  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
  });
  afterAll(() => prisma.$disconnect());

  describe.each(['NONE', 'SESSION'] as const)('%s mode', (mode) => {
    it('stores no transcript across many exchanges, corrections, errors and both chat endpoints', async () => {
      const user = await registerUser(app);
      await setPrivacy(app, user, { memoryMode: mode }).expect(200);

      for (const text of ['first message', 'second message', '__mock_fail__']) {
        await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody(text));
      }
      await request(app)
        .post('/api/chat/stream')
        .set(bearer(user.token))
        .send(chatBody('corrected', { replacesLast: true, conversationId: 'made-up-id' }));
      await request(app).post('/api/chat').set(bearer(user.token)).send(chatBody('non-streaming')).expect(200);

      expect(await storedTranscriptCount(user.id)).toEqual({ conversations: 0, messages: 0 });
    });

    it('refuses to create memories even when the endpoint is called directly', async () => {
      const user = await registerUser(app);
      await setPrivacy(app, user, { memoryMode: mode }).expect(200);
      const res = await request(app).post('/api/memories').set(bearer(user.token)).send({ content: 'remember me' }).expect(403);
      expect(res.body.error.code).toBe('PERSISTENCE_BLOCKED');
      await expect(
        memoryGate.createMemory(user.id, { content: 'x', category: 'OTHER', kind: 'STATED', sensitive: false }),
      ).rejects.toMatchObject({ code: 'PERSISTENCE_BLOCKED' });
      expect(await prisma.memory.count({ where: { userId: user.id } })).toBe(0);
    });

    it('cannot turn history on without Personal memory', async () => {
      const user = await registerUser(app);
      await setPrivacy(app, user, { memoryMode: mode, historyEnabled: true }).expect(200);
      await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('hello'));
      expect(await storedTranscriptCount(user.id)).toEqual({ conversations: 0, messages: 0 });
      await request(app).get('/api/conversations').set(bearer(user.token)).expect(403);
    });
  });

  it('stores nothing when a stream is cancelled mid-reply, and frees the slot', async () => {
    const user = await registerUser(app);
    await setPrivacy(app, user, { memoryMode: 'PERSONAL', historyEnabled: true }).expect(200);
    const server = await listen(app);
    try {
      const controller = new AbortController();
      const res = await fetch(`${server.url}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(user.token) },
        body: JSON.stringify(chatBody('__mock_slow__ tell me a long story')),
        signal: controller.signal,
      });
      const reader = res.body!.getReader();
      let received = '';
      while (!received.includes('event: delta')) {
        const { value } = await reader.read();
        received += new TextDecoder().decode(value);
      }
      controller.abort();
      await new Promise((r) => setTimeout(r, 600));

      expect(await storedTranscriptCount(user.id)).toEqual({ conversations: 0, messages: 0 });
      // Two more streams are accepted, so the cancelled one released its slot.
      for (let i = 0; i < 2; i++) {
        await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('after cancel')).expect(200);
      }
    } finally {
      await server.close();
    }
  });

  it('Personal memory without history keeps memories but not transcripts', async () => {
    const user = await registerUser(app);
    await setPrivacy(app, user, { memoryMode: 'PERSONAL', historyEnabled: false }).expect(200);
    const chat = await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('hello'));
    expect(parseSse(chat.text).find((e) => e.event === 'done')!.data).toMatchObject({ persisted: false, conversationId: null });
    await request(app).post('/api/memories').set(bearer(user.token)).send({ content: 'You enjoy evening walks' }).expect(201);
    expect(await storedTranscriptCount(user.id)).toEqual({ conversations: 0, messages: 0 });
  });

  it('Personal memory with history stores and continues one conversation, and corrections replace the last exchange', async () => {
    const user = await registerUser(app);
    await setPrivacy(app, user, { memoryMode: 'PERSONAL', historyEnabled: true }).expect(200);

    const first = await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('I am tird'));
    const conversationId = parseSse(first.text).find((e) => e.event === 'done')!.data.conversationId;
    expect(conversationId).toEqual(expect.any(String));

    await request(app)
      .post('/api/chat/stream')
      .set(bearer(user.token))
      .send(chatBody('I am tired', { conversationId, replacesLast: true }));

    const convo = await request(app).get(`/api/conversations/${conversationId}`).set(bearer(user.token)).expect(200);
    expect(convo.body.conversation.messages.map((m: { role: string; content: string }) => [m.role, m.content.slice(0, 10)])).toEqual([
      ['USER', 'I am tired'],
      ['ASSISTANT', expect.any(String)],
    ]);
  });

  it('switching to No memory requires confirmation, then deletes stored data', async () => {
    const user = await registerUser(app);
    await setPrivacy(app, user, { memoryMode: 'PERSONAL', historyEnabled: true }).expect(200);
    await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('hello'));
    await request(app).post('/api/memories').set(bearer(user.token)).send({ content: 'x' }).expect(201);

    const blocked = await setPrivacy(app, user, { memoryMode: 'NONE' }).expect(409);
    expect(blocked.body.error).toMatchObject({ code: 'CONFIRM_DELETION', details: { conversations: 1, memories: 1 } });
    expect((await storedTranscriptCount(user.id)).conversations).toBe(1);

    const done = await setPrivacy(app, user, { memoryMode: 'NONE', confirmDeletion: true }).expect(200);
    expect(done.body).toMatchObject({ memoryMode: 'NONE', stored: { conversations: 0, memories: 0 } });
    expect(await storedTranscriptCount(user.id)).toEqual({ conversations: 0, messages: 0 });
    expect(await prisma.memory.count({ where: { userId: user.id } })).toBe(0);
  });

  it('turning history off deletes saved conversations but keeps memories', async () => {
    const user = await registerUser(app);
    await setPrivacy(app, user, { memoryMode: 'PERSONAL', historyEnabled: true }).expect(200);
    await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('hello'));
    await request(app).post('/api/memories').set(bearer(user.token)).send({ content: 'x' }).expect(201);
    await setPrivacy(app, user, { historyEnabled: false, confirmDeletion: true }).expect(200);
    expect(await storedTranscriptCount(user.id)).toEqual({ conversations: 0, messages: 0 });
    expect(await prisma.memory.count({ where: { userId: user.id } })).toBe(1);
  });
});
