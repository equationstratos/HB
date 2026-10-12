// Développement de l'API : compilation continue et redémarrage à chaque modification.
// Remplace « nest start --watch », qui passe le chemin complet du projet à un shell sans
// l'échapper : un dossier dont le nom contient une parenthèse, par exemple « HB(1) », empêchait
// l'API de démarrer (« /bin/sh: Syntax error: "(" unexpected »). Ici, aucun shell.
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nestCli = createRequire(import.meta.url).resolve('@nestjs/cli/bin/nest.js');
const entry = join(root, 'dist', 'main.js');

const children = [];
let stopping = false;

function stop(code) {
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  process.exitCode = code;
}

function run(args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (!stopping) stop(code ?? (signal ? 1 : 0));
  });
  return child;
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

// Compilation en continu (dist est vidé au démarrage) ; l'API démarre après la première
// compilation complète, puis node --watch la relance à chaque fichier recompilé.
rmSync(join(root, 'dist'), { recursive: true, force: true });
run([nestCli, 'build', '--watch']);
let seen = 0;
const waiting = setInterval(() => {
  seen = existsSync(entry) ? seen + 1 : 0;
  if (seen < 2 || stopping) return;
  clearInterval(waiting);
  run(['--enable-source-maps', '--watch', entry]);
}, 500);
