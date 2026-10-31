import { readFile, writeFile, mkdir, rename, realpath, stat } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inside } from './catalog.mjs';
import { parseWorkingDirectories } from './resources.mjs';

const exec = promisify(execFile);
const error = (status, message) => Object.assign(new Error(message), { status });
const active = job => job && ['running', 'stopping'].includes(job.status);
const safeUrl = value => {
  if (!value) return '';
  try { const url = new URL(value); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* invalid */ }
  throw error(400, 'Inserisci un indirizzo http:// o https:// senza credenziali.');
};

export function parseListeners(output) {
  let pid, name;
  const listeners = new Map();
  for (const line of output.split('\n')) {
    if (/^p\d+$/.test(line)) { pid = Number(line.slice(1)); name = ''; }
    else if (line.startsWith('c')) name = line.slice(1);
    else if (pid && line.startsWith('n')) {
      const match = line.slice(1).match(/^(.*):(\d+)$/);
      if (!match) continue;
      const port = Number(match[2]);
      if (port < 1 || port > 65535) continue;
      const address = match[1];
      listeners.set(`${pid}:${address}:${port}`, { pid, name, address, port });
    }
  }
  return [...listeners.values()].sort((a, b) => a.port - b.port || a.pid - b.pid);
}

export function createPortMonitor({ runner = exec, now = Date.now } = {}) {
  let cached, cachedAt = 0, pending;
  return { async get(projects, { fresh = false } = {}) {
    if (fresh || !cached || now() - cachedAt > 3000) {
      if (!pending) pending = (async () => {
        const options = { timeout: 7000, maxBuffer: 4 * 1024 ** 2, cwd: '/', env: { ...process.env, LC_ALL: 'C' } };
        const warnings = [];
        let output = '';
        try { output = (await runner('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn'], options)).stdout; }
        catch (cause) {
          if (cause.stdout) { output = cause.stdout; warnings.push('Elenco delle porte parziale: alcuni processi non sono leggibili.'); }
          else if (cause.code !== 1 || cause.stderr?.trim()) warnings.push('Impossibile leggere le porte occupate in questa sessione.');
        }
        let directories = new Map();
        try { directories = parseWorkingDirectories((await runner('/usr/sbin/lsof', ['-nP', '-a', '-d', 'cwd', '-Fpn'], options)).stdout); }
        catch (cause) { if (cause.stdout) directories = parseWorkingDirectories(cause.stdout); warnings.push('Associazione delle porte ai progetti incompleta.'); }
        cached = { listeners: parseListeners(output), directories, warnings, sampledAt: new Date(now()).toISOString() };
        cachedAt = now();
      })().finally(() => { pending = null; });
      await pending;
    }
    const ordered = [...projects].sort((a, b) => b.path.length - a.path.length);
    return { sampledAt: cached.sampledAt, warnings: cached.warnings, listeners: cached.listeners.map(listener => {
      const cwd = cached.directories.get(listener.pid);
      const project = cwd && ordered.find(project => inside(cwd, project.path));
      const local = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(listener.address);
      return { ...listener, projectId: project?.id || null, projectName: project?.name || null, url: `http://${local ? 'localhost' : '127.0.0.1'}:${listener.port}` };
    }) };
  } };
}

export function createRuntimeManager({ storageDir, spawnProcess = spawn, signalGroup = (pid, signal) => process.kill(-pid, signal), stopDelay = 3000 } = {}) {
  const jobs = new Map();
  const suggestions = new Map();
  let profiles;
  let loading;
  let writing = Promise.resolve();
  let shuttingDown = false;
  const store = join(storageDir, 'launch.json');
  async function load() {
    if (profiles) return;
    if (!loading) loading = (async () => {
      try {
        const data = JSON.parse(await readFile(store, 'utf8'));
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Formato non valido');
        profiles = data;
      } catch (cause) { if (cause.code === 'ENOENT') profiles = {}; else throw error(500, 'Impossibile leggere .local/launch.json. Controlla il file prima di avviare progetti.'); }
    })().finally(() => { loading = null; });
    await loading;
  }
  async function directory(project, subdirectory) {
    const actual = await realpath(project.path).catch(() => null);
    if (actual !== project.path) throw error(409, 'La cartella del progetto è cambiata. Aggiorna la scansione.');
    if (isAbsolute(subdirectory)) throw error(400, 'La cartella di avvio deve essere relativa al progetto.');
    const target = await realpath(resolve(project.path, subdirectory)).catch(() => null);
    if (!target || !inside(target, project.path) || !(await stat(target)).isDirectory()) throw error(400, 'Scegli una cartella esistente all’interno del progetto.');
    return target;
  }
  function describe(project) {
    const job = jobs.get(project.id);
    return { id: project.id, name: project.name, path: project.path, profile: profiles?.[project.id] || { command: '', directory: '.', url: '' }, suggestions: suggestions.get(project.path) || [], status: job?.status || 'idle', pid: job?.pid || null, startedAt: job?.startedAt || null, endedAt: job?.endedAt || null, exitCode: job?.exitCode ?? null, error: job?.error || null };
  }
  function append(job, text) {
    job.logs = (job.logs + text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')).slice(-64000);
  }
  async function finishStop(job) {
    if (!active(job) && !job.groupAlive) return;
    try { signalGroup(job.pid, 'SIGTERM'); }
    catch (cause) { if (cause.code !== 'ESRCH') { job.error = 'macOS non consente di fermare questo gruppo di processi.'; throw error(503, job.error); } }
    job.status = 'stopping';
    job.error = null;
    append(job, '\n[dashboard] Arresto richiesto.\n');
    await new Promise(resolve => {
      const timer = setTimeout(() => {
        try { signalGroup(job.pid, 'SIGKILL'); } catch (cause) { if (cause.code !== 'ESRCH') job.error = 'Arresto non completato. Verifica i processi nel terminale.'; }
        resolve();
      }, stopDelay);
      job.stopped.then(() => { clearTimeout(timer); resolve(); });
    });
    if (job.error) throw error(503, job.error);
    job.status = 'exited'; job.groupAlive = false;
    job.endedAt ||= new Date().toISOString();
  }
  return {
    async list(projects) {
      await load();
      for (const project of projects) {
        if (!suggestions.has(project.path)) {
          let commands = [];
          try {
            const file = join(project.path, 'package.json');
            if ((await stat(file)).size < 256000) {
              const pkg = JSON.parse(await readFile(file, 'utf8'));
              commands = ['dev', 'start', 'serve'].filter(name => typeof pkg.scripts?.[name] === 'string').map(name => `npm run ${name}`);
            }
          } catch { /* Projects without package.json use manually configured commands. */ }
          suggestions.set(project.path, commands);
        }
      }
      const all = new Map(projects.map(p => [p.id, p]));
      for (const job of jobs.values()) if (active(job) && !all.has(job.project.id)) all.set(job.project.id, job.project);
      return { projects: [...all.values()].map(describe) };
    },
    async configure(project, input) {
      await load();
      if (active(jobs.get(project.id))) throw error(409, 'Ferma il progetto prima di modificare il comando.');
      if (typeof input.command !== 'string' || !input.command.trim() || input.command.length > 1500 || input.command.includes('\0') || typeof input.directory !== 'string' || input.directory.length > 500 || typeof input.url !== 'string') throw error(400, 'Indica comando, cartella relativa e indirizzo del progetto.');
      const profile = { command: input.command.trim(), directory: input.directory.trim() || '.', url: safeUrl(input.url.trim()) };
      await directory(project, profile.directory);
      const write = writing.catch(() => {}).then(async () => {
        if (active(jobs.get(project.id))) throw error(409, 'Ferma il progetto prima di modificare il comando.');
        const next = { ...profiles, [project.id]: profile };
        await mkdir(storageDir, { recursive: true, mode: 0o700 });
        await writeFile(store + '.tmp', JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
        await rename(store + '.tmp', store);
        profiles = next;
      });
      writing = write;
      await write;
      return describe(project);
    },
    async start(project) {
      await load();
      if (shuttingDown) throw error(409, 'La dashboard si sta chiudendo.');
      if (active(jobs.get(project.id))) throw error(409, 'Il progetto è già avviato dalla dashboard.');
      const profile = profiles[project.id];
      if (!profile?.command) throw error(400, 'Configura e salva il comando prima di avviare il progetto.');
      const cwd = await directory(project, profile.directory);
      if (shuttingDown) throw error(409, 'La dashboard si sta chiudendo.');
      if (active(jobs.get(project.id))) throw error(409, 'Il progetto è già avviato dalla dashboard.');
      let resolveStopped;
      const job = { project, status: 'running', logs: '', error: null, exitCode: null, startedAt: new Date().toISOString(), endedAt: null, groupAlive: true, stopped: new Promise(resolve => { resolveStopped = resolve; }) };
      const child = spawnProcess('/bin/zsh', ['-lc', profile.command], { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
      job.pid = child.pid;
      jobs.set(project.id, job);
      append(job, `[dashboard] ${profile.command}\n[cartella] ${cwd}\n\n`);
      for (const stream of [child.stdout, child.stderr]) { stream?.setEncoding('utf8'); stream?.on('data', text => append(job, text)); }
      child.on('error', cause => { job.status = 'error'; job.groupAlive = false; job.error = `Avvio non riuscito: ${cause.message}`; append(job, '\n' + job.error); resolveStopped(); });
      child.on('close', (code, signal) => {
        job.exitCode = code; job.endedAt = new Date().toISOString();
        // A child that exits while a descendant still owns the pipes does not emit close yet.
        job.groupAlive = false; job.status = code && job.status !== 'stopping' ? 'error' : 'exited';
        append(job, `\n[dashboard] Terminato (${(signal || code) ?? 'sconosciuto'}).\n`);
        resolveStopped();
      });
      return describe(project);
    },
    async stop(id) {
      const job = jobs.get(id);
      if (!job) throw error(404, 'Questo progetto non è stato avviato dalla dashboard.');
      if (job.stopping) await job.stopping;
      else { job.stopping = finishStop(job).finally(() => { job.stopping = null; }); await job.stopping; }
      return describe(job.project);
    },
    logs(id) { const job = jobs.get(id); if (!job) return { logs: '', status: 'idle' }; return { logs: job.logs, status: job.status }; },
    async shutdown() { shuttingDown = true; await Promise.allSettled([...jobs.keys()].map(id => this.stop(id))); },
  };
}
