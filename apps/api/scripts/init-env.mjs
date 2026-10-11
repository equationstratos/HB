// Crée apps/api/.env à partir de .env.example avec des secrets aléatoires.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.env');
// --upgrade : met à jour un .env existant (pnpm run update:server).
const upgrade = process.argv.includes('--upgrade');
if (existsSync(target)) {
  if (!upgrade) {
    console.log('apps/api/.env existe déjà : rien à faire.');
    // Les anciennes versions traçaient les trajets en lignes droites par défaut.
    if (/^ROUTING_PROVIDER=straight\s*$/m.test(readFileSync(target, 'utf8'))) {
      console.log(
        'À noter : ROUTING_PROVIDER=straight trace les trajets à vol d’oiseau. Lancez ' +
          '« pnpm run update:server » ou remplacez-le par ROUTING_PROVIDER=osrm dans ' +
          'apps/api/.env pour suivre les rues, puis relancez l’API.',
      );
    }
    process.exit(0);
  }
  upgradeEnv();
  process.exit(0);
}

/**
 * Réglages ajoutés depuis la création du .env : copiés depuis .env.example avec leur valeur
 * par défaut. Les valeurs existantes ne sont jamais modifiées, sauf l'ancien défaut
 * ROUTING_PROVIDER=straight (trajets à vol d'oiseau), remplacé par osrm (trajets réels).
 */
function upgradeEnv() {
  const original = readFileSync(target, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  let env = original;
  const changes = [];
  if (/^ROUTING_PROVIDER=straight[ \t]*$/m.test(env)) {
    env = env.replace(/^ROUTING_PROVIDER=straight[ \t]*$/m, 'ROUTING_PROVIDER=osrm');
    changes.push('ROUTING_PROVIDER=osrm (trajets qui suivent les rues)');
  }
  const present = new Set(
    env
      .split(/\r?\n/)
      .map((line) => /^([A-Z0-9_]+)=/.exec(line)?.[1])
      .filter(Boolean),
  );
  const added = readFileSync(join(root, '.env.example'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => {
      const key = /^([A-Z0-9_]+)=/.exec(line)?.[1];
      return key && !present.has(key);
    });
  if (added.length > 0) {
    if (!env.endsWith('\n')) env += eol;
    env += `${eol}# Ajouté par la mise à jour${eol}${added.join(eol)}${eol}`;
    changes.push(...added.map((line) => line.split('=')[0]));
  }
  if (changes.length === 0) {
    console.log('apps/api/.env est à jour.');
    return;
  }
  writeFileSync(`${target}.bak`, original, { mode: 0o600 });
  writeFileSync(target, env, { mode: 0o600 });
  console.log(`apps/api/.env mis à jour (copie de l’ancien : .env.bak) : ${changes.join(', ')}.`);
}
const env = readFileSync(join(root, '.env.example'), 'utf8')
  .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${randomBytes(48).toString('hex')}`)
  .replace(
    /^DATA_ENCRYPTION_KEY=.*$/m,
    `DATA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
  );
writeFileSync(target, env, { mode: 0o600 });
console.log('apps/api/.env créé avec des secrets aléatoires.');
