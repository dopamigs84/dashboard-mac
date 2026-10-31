import { readdir, readFile, stat, realpath } from 'node:fs/promises';
import { resolve, join, relative, sep, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const markers = ['package.json', 'composer.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pubspec.yaml', 'Gemfile', 'Package.swift', 'pom.xml', 'build.gradle', 'index.php', 'index.html', 'wp-config.php', '.git'];
export const inside = (path, root) => path === root || path.startsWith(root + sep);
const expand = path => path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(), path.slice(2)) : resolve(path);
const webUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } };

export async function readConfig(file) {
  const config = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(config.roots) || !config.roots.length || config.roots.length > 20) throw new Error('Configura da 1 a 20 cartelle in config.json.');
  const ids = new Set();
  config.roots = config.roots.map(root => {
    if (!root || typeof root.path !== 'string' || !root.path || typeof root.label !== 'string' || typeof root.id !== 'string' || !/^[a-z0-9_-]+$/i.test(root.id) || ['all', 'favorites', 'recent', 'resources', 'runtime', 'detail', 'space'].includes(root.id) || ids.has(root.id)) throw new Error('Le sorgenti devono avere percorso, nome e ID univoco, diverso dalle voci della navigazione.');
    ids.add(root.id);
    return { ...root, path: expand(root.path), depth: Math.min(8, Math.max(1, Number(root.depth) || 4)), includeChildren: root.includeChildren === true };
  });
  if (!Array.isArray(config.exclude) || config.exclude.some(name => typeof name !== 'string')) throw new Error('exclude deve essere un elenco di nomi di cartelle.');
  config.maxDirectories = Math.min(50000, Math.max(100, Number(config.maxDirectories) || 12000));
  config.projectUrls ??= {};
  return config;
}

async function smallJson(file) {
  try { if ((await stat(file)).size > 256000) return {}; return JSON.parse(await readFile(file, 'utf8')) || {}; } catch { return {}; }
}

async function describe(path, entries, root, config) {
  const names = new Set(entries.map(entry => entry.name));
  const pkg = names.has('package.json') ? await smallJson(join(path, 'package.json')) : {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  let type = 'Cartella';
  if (names.has('package.json')) type = deps.next ? 'Next.js' : deps.react ? 'React' : deps.vue || deps.nuxt ? 'Vue' : 'Node.js';
  else if (names.has('wp-config.php') || names.has('wp-content')) type = 'WordPress';
  else if (names.has('artisan')) type = 'Laravel';
  else if (names.has('composer.json') || names.has('index.php')) type = 'PHP';
  else if (names.has('pubspec.yaml')) type = 'Flutter';
  else if (names.has('pyproject.toml') || names.has('requirements.txt')) type = 'Python';
  else if (names.has('Cargo.toml')) type = 'Rust';
  else if (names.has('go.mod')) type = 'Go';
  else if (names.has('Package.swift') || entries.some(entry => entry.name.endsWith('.xcodeproj'))) type = 'Swift';
  else if (names.has('pom.xml') || names.has('build.gradle')) type = 'Java';
  else if (names.has('Gemfile')) type = 'Ruby';
  else if (names.has('index.html')) type = 'HTML';
  else if (names.has('.git')) type = 'Git';
  const dates = await Promise.all([path, ...entries.filter(entry => entry.isFile() && !entry.name.startsWith('.')).slice(0, 100).map(entry => join(path, entry.name))].map(file => stat(file).then(info => info.mtimeMs).catch(() => 0)));
  let url = webUrl(config.projectUrls[path]);
  if (!url && root.id === 'mamp' && config.mampBaseUrl) {
    const base = webUrl(config.mampBaseUrl);
    if (base) url = new URL(relative(root.path, path).split(sep).map(encodeURIComponent).join('/') + '/', base.endsWith('/') ? base : base + '/').href;
  }
  return {
    id: createHash('sha256').update(path).digest('hex').slice(0, 24),
    name: basename(path), path, displayPath: inside(path, homedir()) ? '~' + path.slice(homedir().length) : path,
    rootId: root.id, rootLabel: root.label, type,
    description: typeof pkg.description === 'string' ? pkg.description.slice(0, 240) : '',
    modifiedAt: new Date(Math.max(...dates)).toISOString(), git: names.has('.git'), url,
  };
}

export async function scan(config) {
  const started = Date.now();
  const projects = new Map();
  const warnings = [];
  const excluded = new Set(config.exclude);
  const seen = new Set();
  let visited = 0;
  let limited = false;
  const roots = [];
  for (const root of config.roots) {
    try { roots.push({ ...root, path: await realpath(root.path) }); }
    catch { warnings.push(`Cartella non disponibile: ${root.path}`); }
  }
  // Breadth-first traversal finds nearby projects before deeper trees consume the budget.
  const queue = roots.map(root => ({ path: root.path, depth: 0, root }));
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { path, depth, root } = queue[cursor];
    if (seen.has(path)) continue;
    seen.add(path);
    if (visited >= config.maxDirectories) { limited = true; break; }
    visited++;
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); }
    catch (error) { if (warnings.length < 30) warnings.push(`Impossibile leggere ${path} (${error.code}).`); continue; }
    const names = new Set(entries.map(entry => entry.name));
    const detected = markers.some(marker => names.has(marker)) || entries.some(entry => entry.name.endsWith('.xcodeproj'));
    if (depth > 0 && (detected || (root.includeChildren && depth === 1))) {
      projects.set(path, await describe(path, entries, root, config));
      // A project is a single result; do not index its internal components as new projects.
      continue;
    }
    if (depth >= root.depth) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.') || excluded.has(entry.name) || /\.(app|photoslibrary|bundle|framework|xcodeproj|xcworkspace)$/i.test(entry.name)) continue;
      const next = join(path, entry.name);
      if (roots.some(other => other !== root && inside(next, other.path))) continue;
      queue.push({ path: next, depth: depth + 1, root });
    }
  }
  if (limited) warnings.push(`Scansione limitata a ${config.maxDirectories} cartelle. Puoi restringere le sorgenti o aumentare maxDirectories in config.json.`);
  return { projects: [...projects.values()].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)), roots: config.roots.map(({ id, label, path, depth }) => ({ id, label, path: roots.find(root => root.id === id)?.path || path, depth })), warnings, scannedAt: new Date().toISOString(), visited, durationMs: Date.now() - started };
}
