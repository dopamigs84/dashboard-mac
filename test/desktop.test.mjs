import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeData, planLegacyImport, applyLegacyImport } from '../desktop/data.mjs';
import { startDesktopService } from '../desktop/service.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-desktop-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'projects');
  await mkdir(join(root, 'example'), { recursive: true });
  await writeFile(join(root, 'example', 'index.html'), '');
  const configFile = join(dir, 'config.json');
  await writeFile(configFile, JSON.stringify({ roots: [{ id: 'test', label: 'Test', path: root, depth: 1 }], exclude: [], maxDirectories: 50 }));
  const dataDir = join(dir, 'data');
  return { dir, dataDir, configFile };
}

test('desktop data lives outside bundled files and preserves an existing configuration', async t => {
  const { configFile, dataDir } = await fixture(t);
  const target = await initializeData(dataDir, configFile);
  assert.equal(await readFile(target, 'utf8'), await readFile(configFile, 'utf8'));
  await writeFile(target, '{"custom":true}');
  await initializeData(dataDir, configFile);
  assert.equal(await readFile(target, 'utf8'), '{"custom":true}');
  assert.notEqual(await readFile(configFile, 'utf8'), '{"custom":true}');
});

test('legacy import keeps source data and current desktop entries; invalid input changes nothing', async t => {
  const { dir, dataDir, configFile } = await fixture(t);
  await initializeData(dataDir, configFile);
  const legacy = join(dir, 'legacy');
  await mkdir(join(legacy, '.local'), { recursive: true });
  const legacyNotes = JSON.stringify({ old: { notes: 'From browser' }, shared: { notes: 'Old' } });
  await writeFile(join(legacy, '.local/projects.json'), legacyNotes);
  await writeFile(join(dataDir, 'projects.json'), JSON.stringify({ shared: { notes: 'Current desktop notes' } }));
  await writeFile(join(legacy, '.local/launch.json'), 'broken');
  await assert.rejects(planLegacyImport(legacy), /non valido/);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'projects.json'))), { shared: { notes: 'Current desktop notes' } });
  await writeFile(join(legacy, '.local/launch.json'), JSON.stringify({ old: { command: 'npm run dev', directory: '.', url: '' } }));
  await applyLegacyImport(dataDir, await planLegacyImport(legacy));
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'projects.json'))), { old: { notes: 'From browser' }, shared: { notes: 'Current desktop notes' } });
  assert.equal(JSON.parse(await readFile(join(dataDir, 'launch.json'))).old.command, 'npm run dev');
  assert.equal(await readFile(join(legacy, '.local/projects.json'), 'utf8'), legacyNotes);
});

test('desktop service owns its server, persists notes and releases its port on close', { skip: process.env.DASHBOARD_HTTP_TEST !== '1' }, async t => {
  const { configFile, dataDir } = await fixture(t);
  await initializeData(dataDir, configFile);
  const service = await startDesktopService({ configFile, dataDir, port: 0 });
  t.after(() => service.close());
  // Avoid a pooled socket from the previous server when reusing its port below.
  const request = (url, options = {}) => fetch(url, { ...options, headers: { Connection: 'close', ...options.headers } });
  const { token } = await (await request(service.url + '/api/session')).json();
  const headers = { 'X-Dashboard-Token': token, 'Content-Type': 'application/json' };
  const { projects } = await (await request(service.url + '/api/projects', { headers })).json();
  const metadata = { id: projects[0].id, description: 'Desktop', client: '', status: 'active', notes: 'Survives the app' };
  assert.equal((await request(service.url + '/api/metadata', { method: 'POST', headers, body: JSON.stringify(metadata) })).status, 200);
  assert.equal(JSON.parse(await readFile(join(dataDir, 'projects.json')))[metadata.id].notes, metadata.notes);
  const port = Number(new URL(service.url).port);
  await assert.rejects(startDesktopService({ configFile, dataDir, port }), { code: 'EADDRINUSE' });
  await service.close();
  const restarted = await startDesktopService({ configFile, dataDir, port });
  t.after(() => restarted.close());
  const session = await (await request(restarted.url + '/api/session')).json();
  const response = await request(restarted.url + '/api/metadata', { headers: { 'X-Dashboard-Token': session.token } });
  assert.equal((await response.json()).metadata[metadata.id].notes, metadata.notes);
});
