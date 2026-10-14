import request from 'supertest';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { prisma } from '../../src/db.js';
import { bearer, chatBody, describeDb, makeApp, registerUser, resetDatabase, setPrivacy } from './helpers.js';

describeDb('settings, export and account deletion', () => {
  let app = makeApp();
  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
  });
  afterAll(() => prisma.$disconnect());

  it('persists the language preference and rejects unsupported languages', async () => {
    const user = await registerUser(app);
    for (const code of ['ta', 'ml', 'kn', 'te', 'hi', 'en']) {
      await request(app).patch('/api/users/me').set(bearer(user.token)).send({ preferredLanguage: code }).expect(200);
      const me = await request(app).get('/api/users/me').set(bearer(user.token)).expect(200);
      expect(me.body.user.preferredLanguage).toBe(code);
    }
    await request(app).patch('/api/users/me').set(bearer(user.token)).send({ preferredLanguage: 'fr' }).expect(400);
  });

  it('updates preferences and onboarding completion', async () => {
    const user = await registerUser(app);
    await request(app)
      .patch('/api/users/me/preferences')
      .set(bearer(user.token))
      .send({ responseStyle: 'LISTEN', voiceRate: 0.9, textSize: 'lg' })
      .expect(200);
    const res = await request(app)
      .patch('/api/users/me')
      .set(bearer(user.token))
      .send({ interactionMode: 'VOICE', onboardingCompleted: true })
      .expect(200);
    expect(res.body.user).toMatchObject({
      interactionMode: 'VOICE',
      onboardingCompleted: true,
      preferences: { responseStyle: 'LISTEN', voiceRate: 0.9, textSize: 'lg' },
    });
    // History can only be changed through privacy settings.
    await request(app).patch('/api/users/me/preferences').set(bearer(user.token)).send({ historyEnabled: true }).expect(400);
  });

  it('memories can be edited, disabled and deleted', async () => {
    const user = await registerUser(app);
    await setPrivacy(app, user, { memoryMode: 'PERSONAL' }).expect(200);
    const created = await request(app)
      .post('/api/memories')
      .set(bearer(user.token))
      .send({ content: 'You like jasmine tea', category: 'PREFERENCE', kind: 'STATED' })
      .expect(201);
    const id = created.body.memory.id;
    const edited = await request(app)
      .patch(`/api/memories/${id}`)
      .set(bearer(user.token))
      .send({ content: 'You like ginger tea', enabled: false })
      .expect(200);
    expect(edited.body.memory).toMatchObject({ content: 'You like ginger tea', enabled: false });
    await request(app).delete(`/api/memories/${id}`).set(bearer(user.token)).expect(204);
    expect(await prisma.memory.count({ where: { userId: user.id } })).toBe(0);
  });

  it('exports the account without secrets', async () => {
    const user = await registerUser(app);
    await setPrivacy(app, user, { memoryMode: 'PERSONAL', historyEnabled: true }).expect(200);
    await request(app).post('/api/memories').set(bearer(user.token)).send({ content: 'You like evenings' }).expect(201);
    await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('hello'));
    const res = await request(app).post('/api/account/export').set(bearer(user.token)).expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.account.memories).toHaveLength(1);
    expect(res.body.account.conversations[0].messages).toHaveLength(2);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('tokenHash');
  });

  it('deletes the account and everything in it after re-entering the password', async () => {
    const user = await registerUser(app);
    await setPrivacy(app, user, { memoryMode: 'PERSONAL', historyEnabled: true }).expect(200);
    await request(app).post('/api/memories').set(bearer(user.token)).send({ content: 'x' }).expect(201);
    await request(app).post('/api/chat/stream').set(bearer(user.token)).send(chatBody('hello'));

    await request(app).delete('/api/account').set(bearer(user.token)).send({ password: 'wrong password' }).expect(401);
    await request(app).delete('/api/account').set(bearer(user.token)).send({ password: user.password }).expect(204);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.memory.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.conversation.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
    await request(app).get('/api/users/me').set(bearer(user.token)).expect(401);
    await request(app).post('/api/auth/refresh').set('X-Anbu-Client', 'web').set('Cookie', user.cookie).expect(401);
  });
});

describeDb('rate limiting', () => {
  afterAll(() => prisma.$disconnect());

  it('locks out repeated failed sign-ins', async () => {
    await resetDatabase();
    const app = makeApp();
    const user = await registerUser(app);
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong password' }).expect(401);
    }
    const blocked = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password }).expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('limits chat requests per user', async () => {
    await resetDatabase();
    const app = makeApp();
    const user = await registerUser(app);
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await request(app).post('/api/chat').set(bearer(user.token)).send(chatBody(`m${i}`))).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
