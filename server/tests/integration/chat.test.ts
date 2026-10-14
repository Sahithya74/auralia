import request from 'supertest';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { MOCK_LABEL } from '../../src/ai/providers/mock.js';
import { prisma } from '../../src/db.js';
import { bearer, chatBody, describeDb, makeApp, parseSse, registerUser, resetDatabase } from './helpers.js';

describeDb('chat', () => {
  let app = makeApp();
  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
  });
  afterAll(() => prisma.$disconnect());

  it('streams meta, deltas and done as server-sent events, with timing', async () => {
    const user = await registerUser(app);
    const res = await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('Hello Anbu')).expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseSse(res.text);
    expect(events[0]).toEqual({
      event: 'meta',
      data: { safety: { level: 'none', categories: [], resources: [] }, ai: { mock: true } },
    });
    const text = events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    expect(text.startsWith(MOCK_LABEL)).toBe(true);
    const done = events.at(-1)!;
    expect(done.event).toBe('done');
    expect(done.data.timing).toMatchObject({ prepareMs: expect.any(Number), firstTokenMs: expect.any(Number), totalMs: expect.any(Number) });
  });

  it('replies in the requested language', async () => {
    const user = await registerUser(app);
    const res = await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('வணக்கம்', { language: 'ta' }));
    const text = parseSse(res.text).filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    expect(text).toContain('(Tamil)');
  });

  it('validates input', async () => {
    const user = await registerUser(app);
    await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('hi', { language: 'fr' })).expect(400);
    await request(app)
      .post('/api/chat/stream')
      .set(bearer(user.token))
      .send(chatBody('hi', { messages: [{ role: 'assistant', content: 'hello' }] }))
      .expect(400);
    await request(app).post('/api/chat/stream').set(bearer(user.token)).send({ language: 'en', messages: [] }).expect(400);
  });

  it('rejects a duplicate submission of the same request', async () => {
    const user = await registerUser(app);
    const body = chatBody('only once');
    await request(app).post('/api/chat/stream').set(bearer(user.token)).send(body).expect(200);
    const dup = await request(app).post('/api/chat/stream').set(bearer(user.token)).send(body).expect(409);
    expect(dup.body.error.code).toBe('DUPLICATE_REQUEST');
  });

  it('reports provider failure as a retryable error event', async () => {
    const user = await registerUser(app);
    const res = await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('__mock_fail__'));
    const events = parseSse(res.text);
    expect(events.at(-1)).toEqual({ event: 'error', data: { code: 'AI_BUSY', retryable: true, partial: false } });
    const json = await request(app).post('/api/chat').set(bearer(user.token)).send(chatBody('__mock_fail__')).expect(503);
    expect(json.body.error).toMatchObject({ code: 'AI_BUSY', details: { retryable: true } });
  });

  it('routes risky messages through the safety layer with support resources', async () => {
    const user = await registerUser(app);
    const res = await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('I want to die'));
    const meta = parseSse(res.text)[0]!;
    expect(meta.data.safety.level).toBe('concern');
    expect(meta.data.safety.categories).toEqual(['self_harm']);
    expect(meta.data.safety.resources.map((r: { id: string }) => r.id)).toEqual(['emergency', 'telemanas']);
  });

  it('never leaves a flagged message without a reply when the provider fails', async () => {
    const user = await registerUser(app);
    const res = await request(app)
      .post('/api/chat/stream')
      .set(bearer(user.token))
      .send(chatBody('__mock_fail__ my husband beats me', { language: 'hi' }));
    const events = parseSse(res.text);
    const text = events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    expect(text).toContain('181');
    expect(text).toContain('सुरक्षा');
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { staticFallback: true } });
  });

  it('reflection: summary works in any mode; memory suggestions need Personal memory', async () => {
    const user = await registerUser(app);
    const messages = [
      { role: 'user', content: 'I am tired' },
      { role: 'assistant', content: 'That sounds hard' },
    ];
    const summary = await request(app)
      .post('/api/chat/reflect')
      .set(bearer(user.token))
      .send({ kind: 'summary', language: 'en', messages })
      .expect(200);
    expect(summary.body.text).toContain(MOCK_LABEL);
    await request(app)
      .post('/api/chat/reflect')
      .set(bearer(user.token))
      .send({ kind: 'memory_suggestions', language: 'en', messages })
      .expect(403);
  });
});
