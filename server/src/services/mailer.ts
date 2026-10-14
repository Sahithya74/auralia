import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { errorMeta, logger } from '../utils/logger.js';

export interface Mailer {
  sendPasswordReset(to: string, link: string): Promise<void>;
}

class ConsoleMailer implements Mailer {
  async sendPasswordReset(_to: string, link: string): Promise<void> {
    // The reset link is a credential: print it only on a developer machine.
    if (env.NODE_ENV === 'development') {
      process.stdout.write(`\n[DEV ONLY - email not configured] Password reset link:\n${link}\n\n`);
    } else {
      logger.warn('mail.not_configured', { purpose: 'password_reset' });
    }
  }
}

class SmtpMailer implements Mailer {
  private transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  async sendPasswordReset(to: string, link: string): Promise<void> {
    try {
      await this.transport.sendMail({
        from: env.SMTP_FROM,
        to,
        subject: 'Reset your Anbu password',
        text:
          `Someone (hopefully you) asked to reset the password for your Anbu account.\n\n` +
          `Open this link within ${env.PASSWORD_RESET_TTL_MINUTES} minutes to choose a new password:\n${link}\n\n` +
          `If you didn't ask for this, you can ignore this email - your password won't change.`,
      });
    } catch (err) {
      logger.error('mail.send_failed', { purpose: 'password_reset', ...errorMeta(err) });
    }
  }
}

export const mailer: Mailer = env.MAIL_TRANSPORT === 'smtp' ? new SmtpMailer() : new ConsoleMailer();
