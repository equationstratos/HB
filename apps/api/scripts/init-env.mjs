// Crée apps/api/.env à partir de .env.example avec des secrets aléatoires.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.env');
if (existsSync(target)) {
  console.log('apps/api/.env existe déjà : rien à faire.');
  // Les anciennes versions traçaient les trajets en lignes droites par défaut.
  if (/^ROUTING_PROVIDER=straight\s*$/m.test(readFileSync(target, 'utf8'))) {
    console.log(
      'À noter : ROUTING_PROVIDER=straight trace les trajets à vol d’oiseau. Remplacez-le par ' +
        'ROUTING_PROVIDER=osrm dans apps/api/.env pour suivre les rues, puis relancez l’API.',
    );
  }
  process.exit(0);
}
const env = readFileSync(join(root, '.env.example'), 'utf8')
  .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${randomBytes(48).toString('hex')}`)
  .replace(
    /^DATA_ENCRYPTION_KEY=.*$/m,
    `DATA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
  );
writeFileSync(target, env, { mode: 0o600 });
console.log('apps/api/.env créé avec des secrets aléatoires.');
