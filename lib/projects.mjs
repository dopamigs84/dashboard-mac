import { readFile, writeFile, mkdir, rename, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const fail = (status, message) => Object.assign(new Error(message), { status });
const defaults = () => ({ description: '', client: '', status: 'active', notes: '', updatedAt: null });

export function createProjectStore({ storageDir }) {
  const file = join(storageDir, 'projects.json');
  let data, loading;
  let writes = Promise.resolve();
  async function load() {
    if (data) return;
    if (!loading) loading = (async () => {
      try { const parsed = JSON.parse(await readFile(file, 'utf8')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); data = parsed; }
      catch (error) { if (error.code === 'ENOENT') data = {}; else throw fail(500, 'Impossibile leggere le note salvate. Controlla .local/projects.json.'); }
    })().finally(() => { loading = null; });
    await loading;
  }
  return {
    async list(projects) { await load(); return { metadata: Object.fromEntries(projects.map(p => [p.id, { ...defaults(), ...data[p.id] }])) }; },
    async get(id) { await load(); return { ...defaults(), ...data[id] }; },
    async save(id, input) {
      await load();
      const limits = { description: 1000, client: 200, notes: 6000 };
      if (!input || Object.keys(limits).some(key => typeof input[key] !== 'string' || input[key].length > limits[key] || input[key].includes('\0')) || !['active', 'paused', 'archived'].includes(input.status)) throw fail(400, 'Controlla descrizione, cliente, note e stato del progetto.');
      const value = { description: input.description.trim(), client: input.client.trim(), notes: input.notes, status: input.status, updatedAt: new Date().toISOString() };
      const task = writes.catch(() => {}).then(async () => {
        const next = { ...data, [id]: value };
        await mkdir(storageDir, { recursive: true, mode: 0o700 });
        await writeFile(file + '.tmp', JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
        await rename(file + '.tmp', file);
        data = next;
      });
      writes = task;
      await task;
      return value;
    },
  };
}

export function repositoryWebUrl(raw) {
  if (!raw) return null;
  let value = raw.trim();
  if (/^[\w.-]+@[\w.-]+:[^/]/.test(value)) value = 'https://' + value.replace(/^[^@]+@/, '').replace(':', '/');
  try {
    const url = new URL(value);
    if (url.protocol === 'ssh:') return repositoryWebUrl(`https://${url.hostname}${url.pathname}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    url.pathname = url.pathname.replace(/\.git\/?$/, '');
    return url.href;
  } catch { return null; }
}

export function parseGitStatus(output) {
  const counts = { changedEntries: 0, staged: 0, unstaged: 0, untracked: 0, conflicts: 0 };
  const files = [];
  const entries = output.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    counts.changedEntries++;
    if (code === '??') counts.untracked++;
    else {
      if (code[0] !== ' ' && code[0] !== '?') counts.staged++;
      if (code[1] !== ' ' && code[1] !== '?') counts.unstaged++;
      if (code.includes('U') || ['AA', 'DD'].includes(code)) counts.conflicts++;
    }
    if (files.length < 30) files.push({ code, path });
    if (code.includes('R') || code.includes('C')) i++;
  }
  return { ...counts, files };
}

export function createGitReader({ runner = exec, now = Date.now } = {}) {
  const cache = new Map();
  return { async get(project, { fresh = false } = {}) {
    const prior = cache.get(project.path);
    if (prior?.pending) return prior.pending;
    if (!fresh && prior && now() - prior.time < 10000) return prior.value;
    const git = (...args) => runner('/usr/bin/git', ['-c', 'core.fsmonitor=false', '-C', project.path, ...args], { timeout: 10000, maxBuffer: 1024 ** 2, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } }).then(result => result.stdout.replace(/\r?\n$/, ''));
    const pending = (async () => {
      if (await realpath(project.path).catch(() => null) !== project.path) return { state: 'error', message: 'La cartella è cambiata. Aggiorna i progetti.' };
      let top;
      try { top = await git('rev-parse', '--show-toplevel'); }
      catch (cause) { return /not a git repository/i.test(cause.stderr || '') ? { state: 'none', message: 'Questa cartella non è un repository Git.' } : { state: 'error', message: 'Git non è disponibile o non può leggere questo repository.' }; }
      if (await realpath(top).catch(() => null) !== project.path) return { state: 'parent', message: 'La cartella fa parte di un repository più ampio. Apri il progetto che contiene la radice Git.' };
      try {
        const [status, branch, last, remote, upstream] = await Promise.all([
          git('status', '--porcelain=v1', '-z', '--untracked-files=normal'),
          git('symbolic-ref', '--short', '-q', 'HEAD').catch(() => 'HEAD scollegato'),
          git('log', '-1', '--format=%H%x00%s%x00%aI').catch(() => ''),
          git('config', '--get', 'remote.origin.url').catch(() => ''),
          git('rev-list', '--left-right', '--count', 'HEAD...@{upstream}').catch(() => ''),
        ]);
        const [hash, subject, date] = last.split('\0');
        const counts = upstream.match(/^(\d+)\s+(\d+)$/);
        return { state: 'ready', branch, ...parseGitStatus(status), lastCommit: hash ? { hash, subject, date } : null, repositoryUrl: repositoryWebUrl(remote), ahead: counts ? Number(counts[1]) : null, behind: counts ? Number(counts[2]) : null, sampledAt: new Date(now()).toISOString() };
      } catch { return { state: 'error', message: 'Impossibile leggere lo stato Git completo (limite di tempo o output raggiunto).' }; }
    })();
    cache.set(project.path, { pending });
    const value = await pending;
    cache.set(project.path, { value, time: now() });
    return value;
  } };
}
