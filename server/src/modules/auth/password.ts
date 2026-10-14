import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

// Compared against when the email is unknown, so a missing account and a wrong
// password take about the same time to reject.
const DUMMY_HASH = bcrypt.hashSync('anbu-timing-equaliser', env.BCRYPT_ROUNDS);

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return Boolean(hash) && ok;
}
