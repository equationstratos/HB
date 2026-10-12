// Crée apps/api/.env à partir de .env.example avec des secrets aléatoires.
//
// Les secrets (JWT_ACCESS_SECRET, DATA_ENCRYPTION_KEY) sont aussi gardés hors du projet, dans
// ~/.hb/api-secrets.env (ou HB_SECRETS_FILE) : une nouvelle installation sur le même ordinateur
// (nouveau téléchargement, autre dossier) les reprend, et peut donc relire les données déjà
// chiffrées dans la base (double authentification des admins, IBAN des gardes).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.env');
const SECRET_KEYS = ['JWT_ACCESS_SECRET', 'DATA_ENCRYPTION_KEY'];
const secretsFile = process.env.HB_SECRETS_FILE || join(homedir(), '.hb', 'api-secrets.env');

/** Valeurs des clés secrètes d'un fichier .env (hors valeurs d'exemple). */
function readSecrets(file) {
  if (!existsSync(file)) return {};
  const secrets = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match && SECRET_KEYS.includes(match[1]) && !/change-me|REPLACE_WITH/.test(match[2])) {
      secrets[match[1]] = match[2];
    }
  }
  return secrets;
}

/** Garde les secrets de ce .env pour les prochaines installations, s'ils ne le sont pas déjà. */
function saveSecrets(secrets) {
  if (existsSync(secretsFile) || SECRET_KEYS.some((key) => !secrets[key])) return;
  try {
    mkdirSync(dirname(secretsFile), { recursive: true, mode: 0o700 });
    writeFileSync(
      secretsFile,
      `# Secrets de l'API HB, repris par les nouvelles installations sur cet ordinateur.\n${SECRET_KEYS.map((key) => `${key}=${secrets[key]}`).join('\n')}\n`,
      { mode: 0o600 },
    );
    console.log(`Secrets de l’API gardés dans ${secretsFile} pour les prochaines installations.`);
  } catch (error) {
    console.log(`Impossible d’écrire ${secretsFile} : ${error.message}`);
  }
}

// --upgrade : met à jour un .env existant (pnpm run update:server).
const upgrade = process.argv.includes('--upgrade');
if (existsSync(target)) {
  saveSecrets(readSecrets(target));
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
// Nouvelle installation : secrets d'une installation précédente sur cet ordinateur, sinon neufs.
const previous = readSecrets(secretsFile);
const secrets = {
  JWT_ACCESS_SECRET: previous.JWT_ACCESS_SECRET ?? randomBytes(48).toString('hex'),
  DATA_ENCRYPTION_KEY: previous.DATA_ENCRYPTION_KEY ?? randomBytes(32).toString('base64'),
};
const env = readFileSync(join(root, '.env.example'), 'utf8')
  .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${secrets.JWT_ACCESS_SECRET}`)
  .replace(/^DATA_ENCRYPTION_KEY=.*$/m, `DATA_ENCRYPTION_KEY=${secrets.DATA_ENCRYPTION_KEY}`);
writeFileSync(target, env, { mode: 0o600 });
if (previous.DATA_ENCRYPTION_KEY) {
  console.log(`apps/api/.env créé avec les secrets de l’installation précédente (${secretsFile}).`);
} else {
  console.log('apps/api/.env créé avec des secrets aléatoires.');
  saveSecrets(secrets);
}
