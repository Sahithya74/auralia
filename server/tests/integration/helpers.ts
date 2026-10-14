import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { describe } from 'vitest';
import { createApp } from '../../src/app.js';
import { MockProvider } from '../../src/ai/providers/mock.js';
import { prisma } from '../../src/db.js';

export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);
/** Integration suites run only when a disposable test database is configured. */
export const describeDb = hasDatabase ? describe : describe.skip;

export function makeApp() {
  return createApp({ ai: new MockProvider(1) });
}

export async function resetDatabase(): Promise<void> {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.memory.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.userPreferences.deleteMany();
  await prisma.user.deleteMany();
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  cookie: string;
}

export async function registerUser(app: ReturnType<typeof makeApp>, name = 'Meena'): Promise<TestUser> {
  const email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'correct horse battery';
  const res = await request(app).post('/api/auth/register').send({ name, email, password }).expect(201);
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  return { id: res.body.user.id, email, password, token: res.body.accessToken, cookie: setCookie[0]!.split(';')[0]! };
}

export function setPrivacy(
  app: ReturnType<typeof makeApp>,
  user: TestUser,
  body: { memoryMode?: string; historyEnabled?: boolean; confirmDeletion?: boolean },
) {
  return request(app).patch('/api/privacy/settings').set(bearer(user.token)).send(body);
}

export function chatBody(content: string, extra: Record<string, unknown> = {}) {
  return { requestId: randomUUID(), language: 'en', messages: [{ role: 'user', content }], ...extra };
}

export interface SseEvent {
  event: string;
  data: any;
}

export function parseSse(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('event:'))
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)![1]!;
      const data = JSON.parse(/^data: (.*)$/m.exec(block)![1]!);
      return { event, data };
    });
}

export async function storedTranscriptCount(userId: string) {
  const conversations = await prisma.conversation.count({ where: { userId } });
  const messages = await prisma.message.count({ where: { conversation: { userId } } });
  return { conversations, messages };
}

/** Starts the app on a random port for tests that need real HTTP (e.g. aborting a stream). */
export async function listen(app: ReturnType<typeof makeApp>): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
