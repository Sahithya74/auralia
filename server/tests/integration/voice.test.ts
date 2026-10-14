import { ApiError } from '@google/genai';
import request from 'supertest';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { MockProvider } from '../../src/ai/providers/mock.js';
import { GeminiSpeech } from '../../src/ai/speech/geminiSpeech.js';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { bearer, describeDb, registerUser, resetDatabase } from './helpers.js';

function fakeSpeech(fail = false) {
  const spoken: string[] = [];
  const speech = new GeminiSpeech(
    { apiKey: 'test-key', models: ['voice-a'], voice: 'Sulafat', firstAudioTimeoutMs: 1000 },
    async (_model, req) => {
      spoken.push(req.text);
      return (async function* () {
        if (fail) throw new ApiError({ message: 'busy', status: 503 });
        yield Buffer.alloc(480, 1);
        yield Buffer.alloc(480, 2);
      })();
    },
  );
  return { speech, spoken };
}

const binary = (res: request.Response, callback: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describeDb('natural voice', () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it('streams the reply as PCM audio and says nothing about the text in the response', async () => {
    const { speech, spoken } = fakeSpeech();
    const app = createApp({ ai: new MockProvider(0), speech });
    const user = await registerUser(app);
    const res = await request(app)
      .post('/api/voice/speech')
      .set(bearer(user.token))
      .send({ text: '**I hear you.** Take your time.', language: 'ta' })
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-type']).toContain('audio/L16');
    expect((res.body as Buffer).length).toBe(960);
    expect(spoken).toEqual(['I hear you. Take your time.']);
  });

  it('answers 503 when no voice is available, so the app can use the device voice', async () => {
    const app = createApp({ ai: new MockProvider(0), speech: fakeSpeech(true).speech });
    const user = await registerUser(app);
    const res = await request(app).post('/api/voice/speech').set(bearer(user.token)).send({ text: 'Hello', language: 'en' }).expect(503);
    expect(res.body.error.code).toBe('VOICE_BUSY');
  });

  it('answers 501 when natural voice is turned off, and reports it in health', async () => {
    const app = createApp({ ai: new MockProvider(0), speech: null });
    const user = await registerUser(app);
    await request(app).post('/api/voice/speech').set(bearer(user.token)).send({ text: 'Hello', language: 'en' }).expect(501);
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body.voice).toEqual({ natural: false });
  });

  it('requires sign-in and validates input', async () => {
    const app = createApp({ ai: new MockProvider(0), speech: fakeSpeech().speech });
    await request(app).post('/api/voice/speech').send({ text: 'Hello', language: 'en' }).expect(401);
    const user = await registerUser(app);
    await request(app).post('/api/voice/speech').set(bearer(user.token)).send({ text: '', language: 'en' }).expect(400);
    await request(app).post('/api/voice/speech').set(bearer(user.token)).send({ text: 'x'.repeat(1501), language: 'en' }).expect(400);
    await request(app).post('/api/voice/speech').set(bearer(user.token)).send({ text: 'Hello', language: 'fr' }).expect(400);
  });
});
