import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createRuntimeManager, createPortMonitor, parseListeners } from '../lib/runtime.mjs';

const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const nodeCommand = code => `${quote(process.execPath)} -e ${quote(code)}`;
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dashboard-runtime-')));
  t.after(() => rm(root, { force: true, recursive: true }));
  const path = join(root, 'Project with spaces');
  await mkdir(path);
  await mkdir(join(root, 'outside'));
  await symlink(join(root, 'outside'), join(path, 'escape'));
  await writeFile(join(path, 'package.json'), JSON.stringify({ scripts: { dev: 'node index.js', start: 'node index.js', 'untrusted;name': 'ignored' } }));
  return { root, project: { id: 'sample', name: 'Sample', path }, storageDir: join(root, 'settings') };
}
async function until(predicate, message) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await predicate()) return; await delay(20); }
  assert.fail(message);
}

test('profiles persist atomically; suggestions never execute; launch folders cannot escape the project', async t => {
  const { project, storageDir } = await fixture(t);
  const manager = createRuntimeManager({ storageDir });
  assert.deepEqual((await manager.list([project])).projects[0].suggestions, ['npm run dev', 'npm run start']);
  await assert.rejects(manager.start(project), /Configura/);
  const profile = { command: 'npm run dev', directory: '.', url: 'http://localhost:3000' };
  for (const directory of ['../outside', '/tmp', 'escape']) await assert.rejects(manager.configure(project, { ...profile, directory }), /cartella/i);
  await assert.rejects(manager.configure(project, { ...profile, url: 'javascript:alert(1)' }), /indirizzo/);
  await manager.configure(project, profile);
  assert.equal(JSON.parse(await readFile(join(storageDir, 'launch.json'), 'utf8')).sample.url, 'http://localhost:3000/');
  const reloaded = createRuntimeManager({ storageDir });
  assert.equal((await reloaded.list([project])).projects[0].profile.command, profile.command);
  await assert.rejects(manager.stop('outside-pid'), /non è stato avviato/);
});

test('a real foreground command starts once, streams logs, and stops its process group', async t => {
  const { project, storageDir } = await fixture(t);
  const manager = createRuntimeManager({ storageDir, stopDelay: 100 });
  t.after(() => manager.shutdown());
  await manager.configure(project, { command: nodeCommand('const child=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"}); console.log("CHILD="+child.pid); console.log("READY"); setInterval(()=>{},1000)'), directory: '.', url: '' });
  const run = await manager.start(project);
  assert.equal(run.status, 'running');
  assert.ok(run.pid > 0);
  await assert.rejects(manager.start(project), /già avviato/);
  await assert.rejects(manager.configure(project, { command: 'echo no', directory: '.', url: '' }), /Ferma/);
  await until(() => manager.logs(project.id).logs.includes('\nREADY\n'), 'The command did not produce output');
  const childPid = Number(manager.logs(project.id).logs.match(/\nCHILD=(\d+)\n/)[1]);
  assert.equal((await manager.list([])).projects.length, 1, 'A removed project must remain stoppable');
  const stopped = await manager.stop(project.id);
  assert.equal(stopped.status, 'exited');
  await until(() => {
    try { process.kill(run.pid, 0); return false; } catch (cause) { return cause.code === 'ESRCH'; }
  }, 'The managed process survived stop');
  await until(() => {
    try { process.kill(childPid, 0); return false; } catch (cause) { return cause.code === 'ESRCH'; }
  }, 'A descendant survived the process-group stop');
  assert.equal((await manager.list([])).projects.length, 0);
});

test('stop escalates for a command ignoring SIGTERM; shutdown rejects subsequent starts', async t => {
  const { project, storageDir } = await fixture(t);
  const manager = createRuntimeManager({ storageDir, stopDelay: 100 });
  t.after(() => manager.shutdown());
  await manager.configure(project, { command: nodeCommand('process.on("SIGTERM",()=>{}); console.log("IGNORE"); setInterval(()=>{},1000)'), directory: '.', url: '' });
  const run = await manager.start(project);
  await until(() => manager.logs(project.id).logs.includes('\nIGNORE\n'), 'Command did not start');
  await manager.shutdown();
  await until(() => {
    try { process.kill(run.pid, 0); return false; } catch (cause) { return cause.code === 'ESRCH'; }
  }, 'Shutdown left a command alive');
  await assert.rejects(manager.start(project), /chiudendo/);
});

test('nonzero command exit and log size limits are exposed', async t => {
  const { project, storageDir } = await fixture(t);
  const manager = createRuntimeManager({ storageDir, stopDelay: 100 });
  t.after(() => manager.shutdown());
  await manager.configure(project, { command: nodeCommand('console.log("x".repeat(80000)); process.exitCode=2'), directory: '.', url: '' });
  await manager.start(project);
  await until(() => manager.logs(project.id).status === 'error', 'Exit was not recorded');
  const item = (await manager.list([project])).projects[0];
  assert.equal(item.exitCode, 2);
  assert.ok(manager.logs(project.id).logs.length <= 64000);
});

test('listener parser handles IPv4, IPv6 and duplicate descriptors', () => {
  const result = parseListeners('p10\ncnode\nn127.0.0.1:3000\nn127.0.0.1:3000\np11\nchttpd\nn*:80\nn[::1]:8080\nnnot-a-port\n');
  assert.deepEqual(result.map(p => p.port), [80, 3000, 8080]);
  assert.equal(result.find(p => p.port === 8080).address, '[::1]');
});

test('port monitoring caches samples, refreshes on request and uses project path boundaries', async () => {
  let calls = 0;
  const monitor = createPortMonitor({ runner: async (file, args) => {
    calls++;
    return { stdout: args.includes('-Fpcn') ? 'p10\ncnode\nn127.0.0.1:3000\np11\ncnode\nn[::1]:3001\n' : 'p10\nfcwd\nn/work/app\np11\nfcwd\nn/work/app-suffix\n' };
  } });
  const projects = [{ id: 'a', name: 'App', path: '/work/app' }];
  const result = await monitor.get(projects);
  assert.equal(result.listeners[0].projectId, 'a');
  assert.equal(result.listeners[1].projectId, null);
  await monitor.get(projects);
  assert.equal(calls, 2);
  await monitor.get(projects, { fresh: true });
  assert.equal(calls, 4);
});

test('denied port reads produce warnings, not a misleading complete empty list', async () => {
  const monitor = createPortMonitor({ runner: async () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); } });
  const result = await monitor.get([]);
  assert.equal(result.listeners.length, 0);
  assert.ok(result.warnings.length > 0);
});
