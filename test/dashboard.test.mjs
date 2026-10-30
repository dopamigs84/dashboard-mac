import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { readConfig, scan } from '../lib/catalog.mjs';
import { createDashboard } from '../server.mjs';

// Default tests exercise the exact request handler without opening a socket.
// npm run test:http runs the same assertions against real HTTP on loopback.
async function client(server, t) {
  if (process.env.DASHBOARD_HTTP_TEST === '1') {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    return (path, options) => fetch(base + path, options);
  }
  return (path, options = {}) => new Promise(resolve => {
    const req = Readable.from(options.body ? [Buffer.from(options.body)] : []);
    req.url = path;
    req.method = options.method || 'GET';
    req.headers = { host: '127.0.0.1:4317', ...Object.fromEntries(Object.entries(options.headers || {}).map(([key, value]) => [key.toLowerCase(), value])) };
    const headers = new Headers();
    const res = {
      headersSent: false, status: 200,
      setHeader(key, value) { headers.set(key, value); },
      writeHead(status, extraHeaders) { this.status = status; this.headersSent = true; for (const [key, value] of Object.entries(extraHeaders || {})) headers.set(key, value); },
      end(body = '') { resolve({ status: this.status, headers, json: async () => JSON.parse(String(body)), text: async () => String(body) }); },
    };
    server.emit('request', req, res);
  });
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-mac-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const home = join(dir, 'home');
  const mamp = join(dir, 'htdocs');
  const create = async (path, file, contents = '') => { await mkdir(path, { recursive: true }); if (file) await writeFile(join(path, file), contents); };
  await create(join(home, 'work', 'hello & world'), 'package.json', JSON.stringify({ dependencies: { next: '16' }, description: 'A test project' }));
  await create(join(home, 'work', 'hello & world', 'packages', 'internal'), 'package.json', '{}');
  await create(join(home, 'node_modules', 'ignored'), 'package.json', '{}');
  await create(join(home, '.hidden', 'ignored'), 'index.html');
  await create(join(home, 'deep', 'one', 'two', 'three', 'missed'), 'index.php');
  await create(join(mamp, 'PHP app'), 'index.php');
  await create(join(mamp, 'plain-folder'));
  const outside = join(dir, 'outside');
  await create(outside, 'package.json', '{}');
  await symlink(outside, join(home, 'linked'));
  const configFile = join(dir, 'config.json');
  const config = { roots: [{ id: 'home', label: 'Home', path: home, depth: 4 }, { id: 'mamp', label: 'MAMP', path: mamp, depth: 2, includeChildren: true }], exclude: ['node_modules'], maxDirectories: 1000, mampBaseUrl: 'http://localhost', projectUrls: {} };
  await writeFile(configFile, JSON.stringify(config));
  return { dir, home, mamp, configFile, config, create };
}

test('scan finds projects, preserves spaces, excludes dependencies, symlinks, hidden and nested projects', async t => {
  const fixtureData = await fixture(t);
  const result = await scan(await readConfig(fixtureData.configFile));
  assert.deepEqual(result.projects.map(p => p.name).sort(), ['PHP app', 'hello & world', 'plain-folder']);
  assert.equal(result.projects.find(p => p.name === 'hello & world').type, 'Next.js');
  assert.equal(result.projects.find(p => p.name === 'PHP app').url, 'http://localhost/PHP%20app/');
  assert.deepEqual(result.warnings, []);
  const again = await scan(await readConfig(fixtureData.configFile));
  assert.deepEqual(result.projects.map(p => p.id), again.projects.map(p => p.id));
});

test('scan reports unavailable roots and directory limits; config rejects duplicate IDs', async t => {
  const { config, configFile, home } = await fixture(t);
  config.roots.push({ id: 'missing', label: 'Missing', path: join(home, 'missing'), depth: 2 });
  const result = await scan({ ...config, maxDirectories: 2 });
  assert.equal(result.warnings.length, 2);
  config.roots.push(config.roots[0]);
  await writeFile(configFile, JSON.stringify(config));
  await assert.rejects(readConfig(configFile), /univoco/);
});

test('request handler contract: session, scan, safe opening, origin/host guards, stale paths and malformed input', async t => {
  const { home, configFile, create } = await fixture(t);
  const calls = [];
  const resourceCalls = [];
  const resourceMonitor = { get: async projects => { resourceCalls.push(projects); return { projects: projects.map(p => ({ id: p.id })) }; }, startDisk: projects => ({ running: true, completed: 0, total: projects.length }) };
  const server = createDashboard({ configFile, opener: async (...args) => { calls.push(args); }, resourceMonitor });
  const request = await client(server, t);
  const session = await (await request('/api/session')).json();
  assert.match(session.token, /^[0-9a-f]{64}$/);
  const headers = { 'X-Dashboard-Token': session.token, 'Content-Type': 'application/json' };
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 200, 'A link from another website can open the dashboard document');
  assert.equal((await request('/style.css')).headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal((await request('/config.json')).status, 404);
  assert.equal((await request('/api/projects')).status, 403);
  assert.equal((await request('/api/resources')).status, 403);
  assert.equal((await request('/api/resources/disk', { method: 'POST' })).status, 403);
  assert.equal(resourceCalls.length, 0);
  assert.equal((await request('/api/session', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await request('/api/session', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/session', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const catalog = await (await request('/api/projects', { headers })).json();
  assert.equal(catalog.projects.length, 3);
  assert.equal((await (await request('/api/resources', { headers })).json()).projects.length, 3);
  const diskResponse = await request('/api/resources/disk', { method: 'POST', headers });
  assert.equal(diskResponse.status, 202);
  assert.deepEqual(await diskResponse.json(), { running: true, completed: 0, total: 3 });
  assert.equal((await request('/api/resources/disk', { headers })).status, 405);
  const project = catalog.projects.find(p => p.name === 'hello & world');
  const open = input => request('/api/open', { method: 'POST', headers, body: JSON.stringify(input) });
  assert.equal((await open({ id: project.id, app: 'finder' })).status, 200);
  assert.deepEqual(calls[0].slice(0, 2), ['/usr/bin/open', [project.path]]);
  assert.equal((await open({ id: project.id, app: 'vscode' })).status, 200);
  assert.deepEqual(calls[1][1], ['-a', 'Visual Studio Code', project.path]);
  assert.equal((await open({ id: project.id, app: 'terminal' })).status, 400);
  assert.equal((await open({ id: project.id, app: 'finder', path: '/etc' })).status, 400);
  assert.equal((await open({ id: '/etc', app: 'finder' })).status, 404);
  assert.equal((await open(null)).status, 400);
  assert.equal((await request('/api/open', { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await request('/api/open', { method: 'POST', headers, body: 'a'.repeat(5000) })).status, 413);
  assert.equal((await request('/api/open', { method: 'POST', headers: { 'X-Dashboard-Token': session.token }, body: '{}' })).status, 415);
  assert.equal((await request('/api/open', { headers })).status, 405);
  assert.equal((await request('/api/scan', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  await create(join(home, 'new-project'), 'index.html');
  assert.equal((await (await request('/api/projects', { headers })).json()).projects.length, 3);
  const scans = await Promise.all([1, 2].map(() => request('/api/scan', { method: 'POST', headers }).then(response => response.json())));
  assert.equal(scans[0].projects.length, 4);
  assert.deepEqual(scans[0], scans[1]);
  await rm(project.path, { recursive: true });
  await symlink(home, project.path);
  assert.equal((await open({ id: project.id, app: 'finder' })).status, 403);
  assert.equal(calls.length, 2, 'Invalid requests must never launch a native application');
});

test('API reports native opener failures and keeps the server usable', async t => {
  const { configFile } = await fixture(t);
  const server = createDashboard({ configFile, opener: async () => { throw new Error('not installed'); } });
  const request = await client(server, t);
  const { token } = await (await request('/api/session')).json();
  const headers = { 'X-Dashboard-Token': token, 'Content-Type': 'application/json' };
  const catalog = await (await request('/api/projects', { headers })).json();
  const response = await request('/api/open', { method: 'POST', headers, body: JSON.stringify({ id: catalog.projects[0].id, app: 'vscode' }) });
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /VS Code/);
  assert.equal((await request('/api/projects', { headers })).status, 200);
});
