import os from 'node:os';
import { statfs, realpath } from 'node:fs/promises';
import { basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { inside } from './catalog.mjs';

const exec = promisify(execFile);
const round = number => Math.round(number * 10) / 10;
const emptyDisk = () => ({ status: 'idle', bytes: null, measuredAt: null, error: null });

export function parseProcesses(output) {
  return output.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+?)\s*$/);
    if (!match) return [];
    return [{ pid: Number(match[1]), ppid: Number(match[2]), cpuPercent: Number(match[3]), rssBytes: Number(match[4]) * 1024, name: basename(match[5]) }];
  });
}

export function parseWorkingDirectories(output) {
  const directories = new Map();
  let pid;
  for (const line of output.split('\n')) {
    if (/^p\d+$/.test(line)) pid = Number(line.slice(1));
    else if (pid && line.startsWith('n/')) directories.set(pid, line.slice(1));
  }
  return directories;
}

export function parseMemory(output, totalBytes) {
  const pageSize = Number(output.match(/page size of (\d+) bytes/)?.[1]);
  const pages = new Map([...output.matchAll(/^([^:\n]+):\s+(\d+)\./gm)].map(match => [match[1].trim(), Number(match[2])]));
  if (!pageSize || !['Pages active', 'Pages inactive', 'Pages wired down', 'Pages occupied by compressor', 'File-backed pages'].every(key => pages.has(key))) throw new Error('Statistiche memoria incomplete.');
  const compressedBytes = pages.get('Pages occupied by compressor') * pageSize;
  // Estimate memory committed to apps/kernel, excluding file-backed cache.
  const usedPages = pages.get('Pages active') + pages.get('Pages inactive') + (pages.get('Pages speculative') || 0) + pages.get('Pages wired down') + pages.get('Pages occupied by compressor') - pages.get('File-backed pages');
  const usedBytes = Math.min(totalBytes, Math.max(0, usedPages * pageSize));
  return { totalBytes, usedBytes, availableBytes: totalBytes - usedBytes, compressedBytes, swapUsedBytes: null, method: 'vm_stat-estimate' };
}

const shared = process => /^(?:httpd|apache2?|mysqld|mariadbd|postgres|postmaster|php-fpm[-\d.]*)(?::.*)?$/i.test(process.name);
const publicProcess = ({ pid, name, cpuPercent, rssBytes }) => ({ pid, name, cpuPercent, rssBytes });

export function associateProcesses(projects, processes, directories, available = true) {
  const ordered = [...projects].sort((a, b) => b.path.length - a.path.length);
  const processMap = new Map(processes.map(process => [process.pid, process]));
  const owners = new Map();
  for (const process of processes) {
    if (shared(process)) continue;
    const cwd = directories.get(process.pid);
    const project = cwd && ordered.find(project => inside(cwd, project.path));
    if (project) owners.set(process.pid, project.id);
  }
  for (const process of processes) {
    if (owners.has(process.pid) || shared(process)) continue;
    let parent = processMap.get(process.ppid);
    const seen = new Set([process.pid]);
    while (parent && !seen.has(parent.pid) && !shared(parent)) {
      seen.add(parent.pid);
      if (owners.has(parent.pid)) { owners.set(process.pid, owners.get(parent.pid)); break; }
      parent = processMap.get(parent.ppid);
    }
  }
  return projects.map(project => {
    const associated = processes.filter(process => owners.get(process.pid) === project.id);
    return { id: project.id, cpuPercent: available ? round(associated.reduce((sum, p) => sum + p.cpuPercent, 0)) : null, rssBytes: available ? associated.reduce((sum, p) => sum + p.rssBytes, 0) : null, processCount: available ? associated.length : null, processes: available ? associated.map(publicProcess) : [], attribution: available ? 'cwd-and-descendants' : 'unavailable' };
  });
}

function cpuTotals(cpus) {
  return cpus.reduce((sum, cpu) => ({ idle: sum.idle + cpu.times.idle, total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 });
}

export function createResourceMonitor({ runner = exec, system = os, diskStat = statfs, resolvePath = realpath, wait = delay, now = Date.now } = {}) {
  let sample;
  let sampleTime = 0;
  let sampling;
  let previousCpu;
  const sizes = new Map();
  let diskJob = { running: false, completed: 0, total: 0 };
  const command = (file, args, timeout = 7000) => runner(file, args, { timeout, maxBuffer: 8 * 1024 * 1024, cwd: '/', env: { ...process.env, LC_ALL: 'C' } });

  async function collect() {
    const warnings = [];
    const cpus = system.cpus();
    const logicalCores = Math.max(1, cpus.length);
    if (now() - sampleTime > 15000) previousCpu = undefined;
    const cpuSample = async () => {
      const before = previousCpu || cpuTotals(cpus);
      if (!previousCpu) await wait(250);
      const after = cpuTotals(system.cpus());
      previousCpu = after;
      const delta = after.total - before.total;
      return delta > 0 ? round(Math.max(0, Math.min(100, (1 - (after.idle - before.idle) / delta) * 100))) : null;
    };
    const totalBytes = system.totalmem();
    const memorySample = async () => {
      let memory;
      try { memory = parseMemory((await command('/usr/bin/vm_stat', [])).stdout, totalBytes); }
      catch { memory = { totalBytes, usedBytes: totalBytes - system.freemem(), availableBytes: system.freemem(), compressedBytes: null, swapUsedBytes: null, method: 'total-minus-free' }; warnings.push('Dettaglio RAM non disponibile: la stima include anche la cache.'); }
      try {
        const swap = (await command('/usr/sbin/sysctl', ['-n', 'vm.swapusage'])).stdout.match(/used\s*=\s*([\d.]+)([KMG])/i);
        if (swap) memory.swapUsedBytes = Math.round(Number(swap[1]) * 1024 ** ({ K: 1, M: 2, G: 3 }[swap[2].toUpperCase()]));
      } catch { /* A missing swap metric must not hide available RAM data. */ }
      return memory;
    };
    const diskSample = async () => {
      try {
        const path = system.homedir();
        const info = await diskStat(path);
        return { path, totalBytes: info.blocks * info.bsize, usedBytes: (info.blocks - info.bfree) * info.bsize, availableBytes: info.bavail * info.bsize };
      } catch { warnings.push('Spazio del volume Home non disponibile.'); return null; }
    };
    const processesSample = async () => {
      try {
        const processes = parseProcesses((await command('/bin/ps', ['-axo', 'pid=,ppid=,%cpu=,rss=,comm='])).stdout);
        if (!processes.length) throw new Error('Nessun dato disponibile.');
        return processes;
      }
      catch { warnings.push('macOS non consente di leggere CPU e RAM dei processi in questa sessione.'); return null; }
    };
    const cwdSample = async () => {
      try {
        const directories = parseWorkingDirectories((await command('/usr/sbin/lsof', ['-nP', '-a', '-d', 'cwd', '-Fpn'])).stdout);
        if (!directories.size) throw new Error('Nessun dato disponibile.');
        return directories;
      }
      catch (error) {
        warnings.push('Alcune cartelle dei processi non sono leggibili; l’associazione ai progetti può essere incompleta.');
        return error.stdout ? parseWorkingDirectories(error.stdout) : null;
      }
    };
    const [cpuPercent, memory, disk, processes, directories] = await Promise.all([cpuSample(), memorySample(), diskSample(), processesSample(), cwdSample()]);
    return { sampledAt: new Date(now()).toISOString(), system: { cpuPercent, logicalCores, memory, disk }, processes, directories, warnings };
  }

  return {
    async get(projects) {
      if (!sample || now() - sampleTime >= 5000) {
        if (!sampling) sampling = collect().then(result => { sample = result; sampleTime = now(); }).finally(() => { sampling = null; });
        await sampling;
      }
      const processes = sample.processes || [];
      const available = Boolean(sample.processes && sample.directories);
      return {
        sampledAt: sample.sampledAt, system: sample.system, warnings: sample.warnings,
        projects: associateProcesses(projects, processes, sample.directories || new Map(), available).map(project => ({ ...project, disk: sizes.get(project.id)?.path === projects.find(p => p.id === project.id)?.path ? sizes.get(project.id).value : emptyDisk() })),
        sharedServices: processes.filter(shared).map(publicProcess).sort((a, b) => b.rssBytes - a.rssBytes),
        topProcesses: [...processes].sort((a, b) => b.cpuPercent - a.cpuPercent || b.rssBytes - a.rssBytes).slice(0, 12).map(publicProcess),
        diskScan: { ...diskJob },
      };
    },
    startDisk(projects) {
      if (diskJob.running) return { ...diskJob };
      diskJob = { running: projects.length > 0, completed: 0, total: projects.length };
      sizes.clear();
      for (const project of projects) sizes.set(project.id, { path: project.path, value: { ...emptyDisk(), status: 'pending' } });
      const queue = [...projects];
      async function worker() {
        while (queue.length) {
          const project = queue.shift();
          let result;
          try {
            if (await resolvePath(project.path) !== project.path) throw new Error('Percorso cambiato. Aggiorna i progetti.');
            const { stdout } = await command('/usr/bin/du', ['-sk', '-P', project.path], 30000);
            const match = stdout.match(/^\s*(\d+)\s/);
            if (!match) throw new Error('Dimensione non disponibile.');
            result = { status: 'complete', bytes: Number(match[1]) * 1024, measuredAt: new Date(now()).toISOString(), error: null };
          } catch (error) {
            result = { status: 'error', bytes: null, measuredAt: new Date(now()).toISOString(), error: error.killed ? 'Tempo limite raggiunto. Riprova il calcolo.' : 'Cartella non leggibile o cambiata. Aggiorna i progetti e riprova.' };
          }
          sizes.set(project.id, { path: project.path, value: result });
          diskJob.completed++;
        }
      }
      Promise.all([worker(), worker()]).finally(() => { diskJob.running = false; });
      return { ...diskJob };
    },
  };
}
