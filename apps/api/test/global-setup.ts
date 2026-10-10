import { execSync } from 'child_process';
import { resolve } from 'path';

/** Applique les migrations sur la base de test avant la suite e2e. */
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://hb:hb@localhost:5432/hb_test';
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
}
