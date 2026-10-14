import request from 'supertest';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '../../src/db.js';
import { hashToken } from '../../src/modules/auth/tokens.js';
import { mailer } from '../../src/services/mailer.js';
import { bearer, describeDb, makeApp, registerUser, resetDatabase } from './helpers.js';

const CLIENT = { 'X-Anbu-Client': 'web' };

describeDb('authentication', () => {
  let app = makeApp();
  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
  });
  afterAll(() => prisma.$disconnect());

  it('registers with a hashed password and an httpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Lakshmi', email: 'Lakshmi@Example.test', password: 'a good password', preferredLanguage: 'ta' })
      .expect(201);
    expect(res.body.user).toMatchObject({ email: 'lakshmi@example.test', preferredLanguage: 'ta', memoryMode: 'SESSION' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.accessToken).toEqual(expect.any(String));
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/anbu_rt=.+; .*HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'lakshmi@example.test' } });
    expect(stored.passwordHash).not.toContain('a good password');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects duplicate emails and invalid input without echoing values', async () => {
    const user = await registerUser(app);
    await request(app).post('/api/auth/register').send({ name: 'X', email: user.email, password: 'another password' }).expect(409);
    const res = await request(app).post('/api/auth/register').send({ name: '', email: 'not-an-email', password: 'short' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('not-an-email');
  });

  it('logs in with the same generic error for wrong password and unknown email', async () => {
    const user = await registerUser(app);
    const wrong = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong password' }).expect(401);
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.test', password: 'whatever1' }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    const ok = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password }).expect(200);
    expect(ok.body.user.id).toBe(user.id);
  });

  it('blocks protected routes without a valid access token', async () => {
    await request(app).get('/api/users/me').expect(401);
    await request(app).get('/api/users/me').set(bearer('not.a.jwt')).expect(401);
    await request(app).get('/api/memories').expect(401);
    await request(app).post('/api/chat/stream').send({}).expect(401);
  });

  it('rotates refresh tokens and detects reuse of an old one', async () => {
    const user = await registerUser(app);
    const first = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', user.cookie).expect(200);
    const newCookie = (first.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(newCookie).not.toBe(user.cookie);

    // Immediate replay looks like a two-tab race: rejected without killing the session.
    const race = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', user.cookie).expect(401);
    expect(race.body.error.code).toBe('REFRESH_RACE');

    // A replay well after rotation is treated as theft: the whole family is revoked.
    const oldHash = hashToken(user.cookie.split('=')[1]!);
    await prisma.refreshToken.update({ where: { tokenHash: oldHash }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    const reuse = await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', user.cookie).expect(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');
    await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', newCookie).expect(401);
  });

  it('requires the client header on cookie-authenticated endpoints (CSRF)', async () => {
    const user = await registerUser(app);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', user.cookie).expect(403);
    expect(res.body.error.code).toBe('CSRF_CHECK_FAILED');
  });

  it('logout revokes the refresh token', async () => {
    const user = await registerUser(app);
    await request(app).post('/api/auth/logout').set(CLIENT).set('Cookie', user.cookie).expect(204);
    await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', user.cookie).expect(401);
  });

  it('resets a password with a single-use emailed token', async () => {
    const user = await registerUser(app);
    const send = vi.spyOn(mailer, 'sendPasswordReset').mockResolvedValue();

    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.test' }).expect(200);
    const known = await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    expect(unknown.body).toEqual(known.body);
    expect(send).toHaveBeenCalledTimes(1);

    const link = send.mock.calls[0]![1];
    const token = new URL(link).searchParams.get('token')!;
    await request(app).post('/api/auth/reset-password').send({ token, password: 'brand new password' }).expect(200);
    await request(app).post('/api/auth/reset-password').send({ token, password: 'another new one' }).expect(400);
    await request(app).post('/api/auth/login').send({ email: user.email, password: user.password }).expect(401);
    await request(app).post('/api/auth/login').send({ email: user.email, password: 'brand new password' }).expect(200);
    // Existing sessions are signed out.
    await request(app).post('/api/auth/refresh').set(CLIENT).set('Cookie', user.cookie).expect(401);
    send.mockRestore();
  });
});
