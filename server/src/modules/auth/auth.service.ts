import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../db.js';
import { mailer } from '../../services/mailer.js';
import { conflict, unauthorized, badRequest } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { toPublicUser, type PublicUser } from '../users/user.view.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';
import { hashPassword, verifyPassword } from './password.js';
import { generateOpaqueToken, hashToken, signAccessToken } from './tokens.js';

export interface SessionResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: PublicUser;
}

const DAY_MS = 86_400_000;
// Two tabs refreshing at the same moment both present the same token; the loser
// gets REFRESH_RACE (and retries with the new cookie) instead of a forced logout.
const REFRESH_RACE_GRACE_MS = 20_000;

async function issueSession(userId: string, familyId: string = randomUUID()): Promise<Omit<SessionResult, 'user'>> {
  const refreshToken = generateOpaqueToken();
  const now = Date.now();
  await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(now + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    },
  });
  // Retention: drop this user's expired tokens and ones revoked over a day ago.
  await prisma.refreshToken.deleteMany({
    where: {
      userId,
      OR: [{ expiresAt: { lt: new Date(now) } }, { revokedAt: { lt: new Date(now - DAY_MS) } }],
    },
  });
  return { accessToken: signAccessToken(userId), expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, refreshToken };
}

async function loadPublicUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { preferences: true } });
  if (!user) throw unauthorized();
  return toPublicUser(user);
}

export async function register(input: RegisterInput & { preferredLanguage?: string }): Promise<SessionResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw conflict('EMAIL_IN_USE', 'An account with this email already exists. Try signing in.');

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        preferredLanguage: input.preferredLanguage ?? 'en',
        preferences: { create: {} },
      },
      include: { preferences: true },
    });
    logger.info('auth.registered', { userId: user.id });
    return { ...(await issueSession(user.id)), user: toPublicUser(user) };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('EMAIL_IN_USE', 'An account with this email already exists. Try signing in.');
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<SessionResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email }, include: { preferences: true } });
  const ok = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !ok) {
    logger.info('auth.login_failed');
    throw unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  return { ...(await issueSession(user.id)), user: toPublicUser(user) };
}

export async function refreshSession(rawToken: string | undefined): Promise<SessionResult> {
  if (!rawToken) throw unauthorized('NO_SESSION', 'Please sign in.');
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!existing) throw unauthorized('REFRESH_INVALID', 'Please sign in again.');

  const now = new Date();
  if (existing.revokedAt) {
    if (now.getTime() - existing.revokedAt.getTime() < REFRESH_RACE_GRACE_MS) {
      throw unauthorized('REFRESH_RACE', 'Please try again.');
    }
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    logger.warn('auth.refresh_reuse_detected', { userId: existing.userId });
    throw unauthorized('REFRESH_REUSED', 'Please sign in again.');
  }
  if (existing.expiresAt <= now) throw unauthorized('REFRESH_EXPIRED', 'Your session expired. Please sign in again.');

  // Conditional update: only one concurrent request can rotate a given token.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: now },
  });
  if (count === 0) throw unauthorized('REFRESH_RACE', 'Please try again.');

  const session = await issueSession(existing.userId, existing.familyId);
  return { ...session, user: await loadPublicUser(existing.userId) };
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { familyId: true },
  });
  if (!existing) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return;

  const token = generateOpaqueToken();
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000),
      },
    }),
  ]);
  const link = `${env.APP_BASE_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  // Not awaited, so response time doesn't reveal whether the account exists.
  void mailer.sendPasswordReset(user.email, link);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw badRequest('RESET_INVALID', 'This reset link is invalid or has expired. Please request a new one.');
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Signing out everywhere: a reset usually means the old password was at risk.
    prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  logger.info('auth.password_reset', { userId: record.userId });
}
