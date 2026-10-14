import { execSync } from 'node:child_process';

export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    process.stdout.write(
      '\n[tests] TEST_DATABASE_URL is not set - database integration tests will be SKIPPED.\n' +
        '        Set it in server/.env to a disposable database whose name contains "test".\n\n',
    );
    return;
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run: TEST_DATABASE_URL database "${dbName}" must contain "test" (it gets wiped).`);
  }
  // Non-destructive: applies any pending migrations. Each test file clears its own rows.
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
