// Publica dist/ en la rama gh-pages. Usa un worktree desechable para no tocar
// el arbol de trabajo ni la rama en la que estes.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const BRANCH = 'gh-pages';

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

if (readdirSync(dist).length === 0) {
  throw new Error('dist/ esta vacio: ejecuta primero "npm run build"');
}

// GitHub Pages pasa el sitio por Jekyll salvo que exista este archivo, y Jekyll
// descarta los directorios que empiezan por guion bajo.
writeFileSync(join(dist, '.nojekyll'), '');

const worktree = mkdtempSync(join(tmpdir(), 'gh-pages-'));
const remoteHasBranch = git('ls-remote', '--heads', 'origin', BRANCH) !== '';

try {
  if (remoteHasBranch) {
    git('fetch', 'origin', `${BRANCH}:refs/remotes/origin/${BRANCH}`, '--force');
    git('worktree', 'add', '--force', '-B', BRANCH, worktree, `origin/${BRANCH}`);
    // Vaciar el contenido anterior, conservando el directorio .git del worktree.
    for (const entry of readdirSync(worktree)) {
      if (entry !== '.git') rmSync(join(worktree, entry), { recursive: true, force: true });
    }
  } else {
    git('worktree', 'add', '--force', '--detach', worktree);
    execFileSync('git', ['checkout', '--orphan', BRANCH], { cwd: worktree, stdio: 'ignore' });
    execFileSync('git', ['rm', '-rf', '--quiet', '.'], { cwd: worktree, stdio: 'ignore' });
  }

  cpSync(dist, worktree, { recursive: true });

  execFileSync('git', ['add', '--all'], { cwd: worktree, stdio: 'inherit' });
  const pending = execFileSync('git', ['status', '--porcelain'], { cwd: worktree, encoding: 'utf8' });
  if (pending.trim() === '') {
    console.log('No hay cambios que publicar.');
  } else {
    execFileSync('git', ['commit', '-m', `Publicar sitio (${new Date().toISOString()})`], {
      cwd: worktree,
      stdio: 'inherit',
    });
    execFileSync('git', ['push', 'origin', `HEAD:${BRANCH}`], { cwd: worktree, stdio: 'inherit' });
    console.log(`\nPublicado en la rama ${BRANCH}.`);
  }
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'ignore' });
}
