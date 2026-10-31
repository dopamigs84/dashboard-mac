import http from 'node:http';
import { readFile, realpath, stat, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readConfig, scan, inside } from './lib/catalog.mjs';
import { createResourceMonitor } from './lib/resources.mjs';
import { createRuntimeManager, createPortMonitor } from './lib/runtime.mjs';
import { createProjectStore, createGitReader } from './lib/projects.mjs';
import { createSpaceAnalyzer } from './lib/space.mjs';

const base = dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/resources.js', ['resources.js', 'text/javascript; charset=utf-8']],
  ['/runtime.js', ['runtime.js', 'text/javascript; charset=utf-8']],
  ['/projects.js', ['projects.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
const fail = (status, message) => Object.assign(new Error(message), { status });

async function bodyJson(req, limit = 4096) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw fail(415, 'È richiesto un corpo JSON.');
  let body = '';
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    body += chunk;
    if (Buffer.byteLength(body) > limit) { req.resume(); throw fail(413, 'Richiesta troppo grande.'); }
  }
  try { return JSON.parse(body); } catch { throw fail(400, 'JSON non valido.'); }
}

export function createDashboard({ configFile = join(base, 'config.json'), opener = exec, resourceMonitor = createResourceMonitor(), runtimeManager = createRuntimeManager({ storageDir: join(base, '.local') }), portMonitor = createPortMonitor(), projectStore = createProjectStore({ storageDir: join(base, '.local') }), gitReader = createGitReader(), spaceAnalyzer = createSpaceAnalyzer() } = {}) {
  const token = randomBytes(32).toString('hex');
  let catalog;
  let scanning;
  const rescan = () => {
    if (!scanning) scanning = readConfig(configFile).then(scan).then(result => (catalog = result)).finally(() => { scanning = null; });
    return scanning;
  };
  const server = http.createServer(async (req, res) => {
    const json = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      const port = server.address()?.port ?? 4317;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host)) throw fail(403, 'Host non autorizzato.');
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw fail(403, 'Origine non autorizzata.');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (assets.has(url.pathname)) {
        if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Metodo non supportato.');
        const [file, type] = assets.get(url.pathname);
        const bytes = await readFile(join(base, 'public', file));
        res.writeHead(200, { 'Content-Type': type });
        res.end(req.method === 'HEAD' ? undefined : bytes);
        return;
      }
      if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Accesso consentito solo dalla dashboard locale.');
      if (url.pathname === '/api/session' && req.method === 'GET') {
        const vscode = await access('/Applications/Visual Studio Code.app').then(() => true).catch(() => false);
        return json(200, { token, version: '1.0.0', vscode });
      }
      if (!['/api/projects', '/api/scan', '/api/open', '/api/session', '/api/resources', '/api/resources/disk', '/api/runtime', '/api/runtime/config', '/api/runtime/start', '/api/runtime/stop', '/api/runtime/logs', '/api/ports', '/api/metadata', '/api/project', '/api/space', '/api/space/scan', '/api/space/open'].includes(url.pathname)) throw fail(404, 'Risorsa non trovata.');
      const provided = Buffer.from(req.headers['x-dashboard-token'] || '');
      const expected = Buffer.from(token);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw fail(403, 'Sessione scaduta. Ricarica la pagina.');
      if (url.pathname === '/api/projects' && req.method === 'GET') return json(200, catalog || await rescan());
      if (url.pathname === '/api/scan' && req.method === 'POST') return json(200, await rescan());
      if (url.pathname === '/api/metadata' && req.method === 'GET') return json(200, await projectStore.list((catalog || await rescan()).projects));
      if (url.pathname === '/api/metadata' && req.method === 'POST') {
        const input = await bodyJson(req, 32768);
        if (!input || typeof input.id !== 'string' || Object.keys(input).some(key => !['id', 'description', 'client', 'status', 'notes'].includes(key))) throw fail(400, 'Scheda progetto non valida.');
        if (!(catalog || await rescan()).projects.some(p => p.id === input.id)) throw fail(404, 'Progetto non trovato.');
        return json(200, await projectStore.save(input.id, input));
      }
      if (url.pathname === '/api/project' && req.method === 'GET') {
        const project = (catalog || await rescan()).projects.find(p => p.id === url.searchParams.get('id'));
        if (!project) throw fail(404, 'Progetto non trovato.');
        const [metadata, git, runtime, resources] = await Promise.allSettled([
          projectStore.get(project.id), gitReader.get(project, { fresh: url.searchParams.get('fresh') === '1' }), runtimeManager.list([project]), resourceMonitor.get([project]),
        ]);
        return json(200, { project, metadata: metadata.status === 'fulfilled' ? metadata.value : null, git: git.status === 'fulfilled' ? git.value : { state: 'error', message: 'Git non disponibile.' }, runtime: runtime.status === 'fulfilled' ? runtime.value.projects.find(p => p.id === project.id) : null, resource: resources.status === 'fulfilled' ? resources.value.projects.find(p => p.id === project.id) : null, warnings: [metadata, runtime, resources].filter(result => result.status === 'rejected').map(result => result.reason.message) });
      }
      if (url.pathname === '/api/space' && req.method === 'GET') return json(200, spaceAnalyzer.get());
      if (url.pathname === '/api/space/scan' && req.method === 'POST') return json(202, spaceAnalyzer.start((catalog || await rescan()).projects));
      if (url.pathname === '/api/space/open' && req.method === 'POST') {
        const input = await bodyJson(req);
        if (!input || typeof input.path !== 'string' || Object.keys(input).some(key => key !== 'path')) throw fail(400, 'Percorso non valido.');
        const item = spaceAnalyzer.get().candidates.find(item => item.path === input.path);
        if (!item || await realpath(item.path).catch(() => null) !== item.path || await realpath(item.projectPath).catch(() => null) !== item.projectPath || !inside(item.path, item.projectPath)) throw fail(404, 'Cartella non disponibile. Ripeti l’analisi.');
        await opener('/usr/bin/open', [item.path], { timeout: 10000 });
        return json(200, { ok: true });
      }
      if (url.pathname === '/api/resources' && req.method === 'GET') return json(200, await resourceMonitor.get((catalog || await rescan()).projects));
      if (url.pathname === '/api/resources/disk' && req.method === 'POST') return json(202, resourceMonitor.startDisk((catalog || await rescan()).projects));
      if (url.pathname === '/api/runtime' && req.method === 'GET') return json(200, await runtimeManager.list((catalog || await rescan()).projects));
      if (url.pathname === '/api/ports' && req.method === 'GET') return json(200, await portMonitor.get((catalog || await rescan()).projects));
      if (url.pathname === '/api/runtime/logs' && req.method === 'GET') {
        const id = url.searchParams.get('id');
        const list = await runtimeManager.list((catalog || await rescan()).projects);
        if (!list.projects.some(p => p.id === id)) throw fail(404, 'Progetto non trovato.');
        return json(200, runtimeManager.logs(id));
      }
      if (['/api/runtime/config', '/api/runtime/start', '/api/runtime/stop'].includes(url.pathname) && req.method === 'POST') {
        const input = await bodyJson(req);
        const configure = url.pathname.endsWith('/config');
        const keys = configure ? ['id', 'command', 'directory', 'url'] : ['id'];
        if (!input || typeof input.id !== 'string' || Object.keys(input).some(key => !keys.includes(key))) throw fail(400, 'Richiesta di gestione progetto non valida.');
        if (url.pathname.endsWith('/stop')) return json(200, await runtimeManager.stop(input.id));
        const projects = (catalog || await rescan()).projects;
        const project = projects.find(p => p.id === input.id);
        if (!project) throw fail(404, 'Progetto non trovato. Aggiorna la scansione.');
        if (configure) return json(200, await runtimeManager.configure(project, input));
        const { projects: runtime } = await runtimeManager.list(projects);
        const profile = runtime.find(p => p.id === input.id)?.profile;
        if (profile?.url) {
          const target = new URL(profile.url);
          if (['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
            const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
            const ports = await portMonitor.get(projects, { fresh: true });
            const occupied = ports.listeners.find(listener => listener.port === port);
            if (occupied) throw fail(409, `La porta ${port} è già occupata da ${occupied.name} (PID ${occupied.pid}). Verifica la sezione Porte occupate.`);
          }
        }
        return json(200, await runtimeManager.start(project));
      }
      if (url.pathname === '/api/open' && req.method === 'POST') {
        const input = await bodyJson(req);
        if (!input || typeof input.id !== 'string' || !['finder', 'vscode'].includes(input.app) || Object.keys(input).some(key => !['id', 'app'].includes(key))) throw fail(400, 'Indica un progetto e Finder oppure VS Code.');
        const project = catalog?.projects.find(item => item.id === input.id);
        if (!project) throw fail(404, 'Progetto non trovato. Aggiorna la scansione.');
        const actual = await realpath(project.path).catch(() => null);
        if (actual !== project.path || !catalog.roots.some(root => inside(actual, root.path))) throw fail(403, 'Il percorso è cambiato. Aggiorna la scansione.');
        if (!(await stat(actual)).isDirectory()) throw fail(404, 'La cartella non esiste più.');
        try {
          await opener('/usr/bin/open', input.app === 'vscode' ? ['-a', 'Visual Studio Code', actual] : [actual], { timeout: 10000 });
        } catch { throw fail(500, input.app === 'vscode' ? 'Impossibile aprire VS Code. Verifica che sia installato in Applicazioni.' : 'Impossibile aprire la cartella nel Finder.'); }
        return json(200, { ok: true });
      }
      throw fail(405, 'Metodo non supportato.');
    } catch (error) {
      if (!res.headersSent) json(error.status || 500, { error: error.status ? error.message : 'Operazione non riuscita. Verifica config.json e il terminale.' });
      if (!error.status) console.error(error.message);
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.stopProjects = () => runtimeManager.shutdown();
  server.once('close', () => { runtimeManager.shutdown(); });
  return server;
}

export function handleShutdown(server) {
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    console.log('\nChiusura della dashboard e dei progetti avviati…');
    await server.stopProjects();
    server.closeAllConnections();
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4317);
  const server = createDashboard();
  handleShutdown(server);
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `La porta ${port} è occupata. Prova PORT=4318 npm start.` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`\n  Dashboard Mac → http://127.0.0.1:${server.address().port}\n  Premi Ctrl+C per chiudere.\n`));
}
