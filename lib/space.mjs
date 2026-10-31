import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inside } from './catalog.mjs';

const exec = promisify(execFile);
const targets = new Map([
  ['node_modules', 'dependencies'], ['vendor', 'dependencies'], ['.venv', 'dependencies'], ['venv', 'dependencies'], ['Pods', 'dependencies'],
  ['.next', 'build'], ['.nuxt', 'build'], ['.output', 'build'], ['dist', 'build'], ['build', 'build'], ['target', 'build'],
  ['.cache', 'cache'], ['.turbo', 'cache'], ['.parcel-cache', 'cache'], ['.pytest_cache', 'cache'], ['__pycache__', 'cache'], ['coverage', 'cache'],
]);
const skip = new Set(['.git', 'storage', 'uploads', 'wp-admin', 'wp-includes', 'wp-content']);

export function createSpaceAnalyzer({ runner = exec, maxDirectories = 20000, maxDepth = 6, timeout = 30000 } = {}) {
  let state = { phase: 'idle', running: false, visited: 0, measured: 0, total: 0, startedAt: null, finishedAt: null, warnings: [], candidates: [] };
  const snapshot = () => ({ ...state, candidates: state.candidates.map(item => ({ ...item })), warnings: [...state.warnings], totalBytes: state.candidates.reduce((sum, item) => sum + (item.bytes || 0), 0) });
  return {
    get: snapshot,
    start(projects) {
      if (state.running) return snapshot();
      state = { phase: 'discovering', running: true, visited: 0, measured: 0, total: 0, startedAt: new Date().toISOString(), finishedAt: null, warnings: [], candidates: [] };
      const warn = text => { if (state.warnings.length < 30) state.warnings.push(text); };
      async function work() {
        const seen = new Set();
        const ordered = [...projects].sort((a, b) => b.path.length - a.path.length);
        const found = [];
        for (const project of ordered) {
          const queue = [{ path: project.path, depth: 0 }];
          for (let i = 0; i < queue.length; i++) {
            const { path, depth } = queue[i];
            if (seen.has(path)) continue;
            seen.add(path);
            if (state.visited >= maxDirectories) break;
            state.visited++;
            let entries;
            try {
              if (await realpath(path) !== path || !inside(path, project.path)) { warn(`Percorso cambiato o simbolico: ${path}`); continue; }
              entries = await readdir(path, { withFileTypes: true });
            } catch { warn(`Cartella non leggibile: ${path}`); continue; }
            for (const entry of entries) {
              if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
              const next = join(path, entry.name);
              if (targets.has(entry.name)) found.push({ projectId: project.id, projectName: project.name, projectPath: project.path, path: next, category: targets.get(entry.name), status: 'pending', bytes: null, error: null });
              else if (!skip.has(entry.name) && !entry.name.startsWith('.') && !/\.(app|bundle|framework)$/i.test(entry.name)) {
                if (depth < maxDepth) queue.push({ path: next, depth: depth + 1 });
                else warn(`Profondità massima raggiunta: ${next}`);
              }
            }
          }
        }
        if (state.visited >= maxDirectories) warn(`Analisi limitata a ${maxDirectories} cartelle. I risultati possono essere incompleti.`);
        // Keep disjoint directory trees, including for overlapping configured sources.
        found.sort((a, b) => a.path.length - b.path.length);
        for (const candidate of found) if (!state.candidates.some(other => inside(candidate.path, other.path))) state.candidates.push(candidate);
        state.phase = 'measuring'; state.total = state.candidates.length;
        const queue = [...state.candidates];
        async function worker() {
          while (queue.length) {
            const item = queue.shift();
            try {
              if (await realpath(item.path) !== item.path) throw new Error('changed');
              const { stdout } = await runner('/usr/bin/du', ['-sk', '-P', item.path], { timeout, maxBuffer: 1024 ** 2, cwd: '/', env: { ...process.env, LC_ALL: 'C' } });
              const match = stdout.match(/^\s*(\d+)\s/);
              if (!match) throw new Error('invalid');
              item.bytes = Number(match[1]) * 1024; item.status = 'complete';
            } catch { item.status = 'error'; item.error = 'Dimensione non disponibile: percorso cambiato, accesso negato o tempo limite raggiunto.'; }
            state.measured++;
          }
        }
        await Promise.all([worker(), worker()]);
      }
      work().catch(() => warn('Analisi interrotta da un errore locale.')).finally(() => { state.running = false; state.phase = 'complete'; state.finishedAt = new Date().toISOString(); });
      return snapshot();
    },
  };
}
