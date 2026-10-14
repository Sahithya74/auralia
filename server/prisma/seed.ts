// Development seed: creates ONE clearly fictional demo account.
// Never run against a production database.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed a production database.');
}
if (!process.env.VITEST && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env is optional if DATABASE_URL is already set
  }
}

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@anbu.example';
const DEMO_PASSWORD = 'demo-password-123';

async function main() {
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
  const user = await prisma.user.create({
    data: {
      name: 'Demo (fictional)',
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      preferredLanguage: 'ta',
      interactionMode: 'BOTH',
      memoryMode: 'PERSONAL',
      onboardingCompletedAt: new Date(),
      preferences: { create: { historyEnabled: false, responseStyle: 'BALANCED' } },
      memories: {
        create: [
          { content: '[Fictional sample] You like to talk in the evenings after dinner.', category: 'ROUTINE', kind: 'STATED' },
          { content: '[Fictional sample] A short walk sometimes helps you feel lighter.', category: 'WELLBEING', kind: 'INTERPRETATION' },
        ],
      },
    },
  });
  process.stdout.write(
    `Seeded fictional demo user ${user.email} / ${DEMO_PASSWORD} (Tamil, Personal memory, 2 sample memories).\n`,
  );
}

main()
  .catch((err) => {
    process.stderr.write(`Seed failed: ${(err as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
