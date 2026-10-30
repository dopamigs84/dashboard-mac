import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createResourceMonitor, parseMemory, parseProcesses, parseWorkingDirectories, associateProcesses } from '../lib/resources.mjs';

const vm = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages active: 10.
Pages inactive: 20.
Pages speculative: 2.
Pages wired down: 5.
File-backed pages: 12.
Pages occupied by compressor: 3.
`;
const projects = [{ id: 'a', path: '/work/app' }, { id: 'nested', path: '/work/app/service' }, { id: 'b', path: '/work/app-other' }];
const processOutput = `10 1 125.5 2048 /usr/local/bin/node
11 10 20.0 1024 /usr/local/bin/node
12 1 5.0 512 /Applications/MAMP/bin/httpd
13 10 0.0 1024 /usr/local/bin/node
14 1 1.0 512 /usr/local/bin/node
15 1 2.0 512 /Applications/MAMP/bin/php-fpm
16 1 3.0 512 /Applications/My Tool.app/Contents/MacOS/My Tool
17 18 0.0 10 /bin/sh
18 17 0.0 10 /bin/sh`;
const cwdOutput = 'p10\nfcwd\nn/work/app\np11\nfcwd\nn/\np12\nfcwd\nn/work/app\np13\nfcwd\nn/work/app/service\np14\nfcwd\nn/work/app-other\np15\nfcwd\nn/work/app\np16\nfcwd\nn/work/app-suffix';

test('process attribution uses path boundaries, longest match and descendants; excludes shared servers', () => {
  const processes = parseProcesses(processOutput);
  const result = associateProcesses(projects, processes, parseWorkingDirectories(cwdOutput));
  assert.equal(processes.find(p => p.pid === 16).name, 'My Tool');
  assert.deepEqual(result[0].processes.map(p => p.pid), [10, 11]);
  assert.equal(result[0].cpuPercent, 145.5);
  assert.equal(result[0].rssBytes, 3072 * 1024);
  assert.deepEqual(result[1].processes.map(p => p.pid), [13]);
  assert.deepEqual(result[2].processes.map(p => p.pid), [14]);
  const unavailable = associateProcesses(projects, [], new Map(), false);
  assert.equal(unavailable[0].cpuPercent, null);
  assert.equal(unavailable[0].processCount, null);
});

test('memory parser respects Apple Silicon page sizes and does not count file cache as used RAM', () => {
  const memory = parseMemory(vm, 1024 * 1024);
  assert.equal(memory.usedBytes, 28 * 16384);
  assert.equal(memory.compressedBytes, 3 * 16384);
  assert.equal(memory.availableBytes + memory.usedBytes, memory.totalBytes);
  assert.throws(() => parseMemory('invalid', 1024));
});

function dependencies() {
  let tick = 0;
  let clock = 10000;
  const calls = [];
  return {
    calls,
    advance: () => { clock += 6000; },
    options: {
      now: () => clock,
      wait: async () => {},
      resolvePath: async path => path,
      diskStat: async () => ({ blocks: 1000, bfree: 400, bavail: 300, bsize: 4096 }),
      system: { cpus: () => [{ times: { user: ++tick * 30, nice: 0, sys: tick * 20, idle: tick * 50, irq: 0 } }], totalmem: () => 1024 * 1024, freemem: () => 1000, homedir: () => '/home' },
      runner: async (file, args, options) => {
        calls.push({ file, args, options });
        if (file.endsWith('vm_stat')) return { stdout: vm };
        if (file.endsWith('sysctl')) return { stdout: 'total = 1024.00M used = 256.00M free = 768.00M' };
        if (file.endsWith('/ps')) return { stdout: processOutput };
        if (file.endsWith('/lsof')) return { stdout: cwdOutput };
        if (file.endsWith('/du')) return { stdout: `42\t${args.at(-1)}\n` };
        throw new Error('unexpected command');
      },
    },
  };
}

test('monitor coalesces concurrent reads, caches samples and separates shared service consumption', async () => {
  const deps = dependencies();
  const monitor = createResourceMonitor(deps.options);
  const [a, b] = await Promise.all([monitor.get(projects), monitor.get(projects)]);
  assert.deepEqual(a, b);
  assert.equal(a.system.cpuPercent, 50);
  assert.equal(a.system.memory.swapUsedBytes, 256 * 1024 ** 2);
  assert.equal(a.system.disk.availableBytes, 300 * 4096);
  assert.deepEqual(a.sharedServices.map(p => p.pid), [12, 15]);
  assert.equal(a.projects[0].disk.status, 'idle');
  await monitor.get(projects);
  assert.equal(deps.calls.filter(c => c.file.endsWith('/ps')).length, 1);
  deps.advance();
  await monitor.get(projects);
  assert.equal(deps.calls.filter(c => c.file.endsWith('/ps')).length, 2);
});

test('denied process access yields unavailable values, while CPU, memory fallback and disk remain usable', async () => {
  const deps = dependencies();
  const monitor = createResourceMonitor({ ...deps.options, runner: async () => { throw new Error('EPERM'); } });
  const result = await monitor.get(projects);
  assert.equal(result.projects[0].cpuPercent, null);
  assert.equal(result.projects[0].rssBytes, null);
  assert.equal(result.projects[0].processCount, null);
  assert.equal(result.system.memory.method, 'total-minus-free');
  assert.equal(result.system.memory.swapUsedBytes, null);
  assert.ok(result.system.disk.totalBytes > 0);
  assert.ok(result.warnings.length >= 2);
});

test('disk jobs are bounded, deduplicated and report failures without publishing partial sizes', async () => {
  const deps = dependencies();
  const originalRunner = deps.options.runner;
  let active = 0;
  let peak = 0;
  let duCalls = 0;
  const monitor = createResourceMonitor({ ...deps.options, runner: async (file, args, options) => {
    if (!file.endsWith('/du')) return originalRunner(file, args, options);
    active++; peak = Math.max(peak, active); duCalls++;
    assert.deepEqual(args.slice(0, 2), ['-sk', '-P']);
    assert.equal(options.timeout, 30000);
    await delay(10);
    active--;
    if (args.at(-1) === projects[2].path) throw Object.assign(new Error('permission'), { stdout: '4\tpartial\n' });
    return { stdout: '42\tproject\n' };
  } });
  const started = monitor.startDisk(projects);
  assert.equal(started.running, true);
  assert.equal(monitor.startDisk(projects).total, 3);
  let result;
  for (let i = 0; i < 100; i++) { result = await monitor.get(projects); if (!result.diskScan.running) break; await delay(5); }
  assert.equal(result.diskScan.running, false);
  assert.equal(result.diskScan.completed, 3);
  assert.equal(duCalls, 3);
  assert.equal(peak, 2);
  assert.equal(result.projects[0].disk.bytes, 42 * 1024);
  assert.equal(result.projects[2].disk.status, 'error');
  assert.equal(result.projects[2].disk.bytes, null);
});

test('real du includes dependencies and hidden files without following external symlinks', async t => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'dashboard-resources-')));
  t.after(() => rm(temp, { force: true, recursive: true }));
  const root = join(temp, 'Project with spaces');
  await mkdir(join(root, 'node_modules'), { recursive: true });
  await writeFile(join(root, 'node_modules', 'data'), Buffer.alloc(128 * 1024, 1));
  await writeFile(join(root, '.hidden'), Buffer.alloc(64 * 1024, 2));
  await mkdir(join(temp, 'outside'));
  await writeFile(join(temp, 'outside', 'large'), Buffer.alloc(1024 * 1024, 3));
  await symlink(join(temp, 'outside'), join(root, 'external-link'));
  const monitor = createResourceMonitor();
  const input = [{ id: 'real', path: root }];
  monitor.startDisk(input);
  let result;
  for (let i = 0; i < 100; i++) { result = await monitor.get(input); if (!result.diskScan.running) break; await delay(10); }
  assert.equal(result.projects[0].disk.status, 'complete');
  assert.ok(result.projects[0].disk.bytes >= 192 * 1024);
  assert.ok(result.projects[0].disk.bytes < 1024 * 1024);
});
