import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createProjectStore, createGitReader, repositoryWebUrl, parseGitStatus } from '../lib/projects.mjs';
import { createSpaceAnalyzer } from '../lib/space.mjs';

const exec = promisify(execFile);
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dashboard-projects-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'Project with spaces'); await mkdir(path);
  return { root, project: { id: 'test', name: 'Test project', path } };
}
async function complete(analyzer) {
  for (let i = 0; i < 150; i++) { if (!analyzer.get().running) return analyzer.get(); await delay(20); }
  assert.fail('Analysis did not finish');
}

test('project notes persist across sessions and concurrent saves do not overwrite other projects', async t => {
  const { root } = await fixture(t);
  const store = createProjectStore({ storageDir: join(root, 'settings') });
  const value = { description: 'Project description', client: '<Client>', status: 'paused', notes: 'Riprendere da qui\nSeconda riga è utile' };
  await Promise.all([store.save('one', value), store.save('two', { ...value, client: 'Other' })]);
  const next = createProjectStore({ storageDir: join(root, 'settings') });
  assert.equal((await next.get('one')).notes, value.notes);
  assert.equal((await next.get('two')).client, 'Other');
  assert.deepEqual(Object.keys((await next.list([{ id: 'one' }])).metadata), ['one']);
  assert.equal((await next.get('new')).status, 'active');
  await assert.rejects(store.save('one', { ...value, status: 'invalid' }), /Controlla/);
  await assert.rejects(store.save('one', { ...value, notes: 'a'.repeat(6001) }), /Controlla/);
  assert.equal((await next.get('one')).client, value.client);
});

test('Git URL conversion strips credentials, tokens and unsupported schemes', () => {
  assert.equal(repositoryWebUrl('https://user:token@example.com/team/repo.git?access_token=secret#private'), 'https://example.com/team/repo');
  assert.equal(repositoryWebUrl('git@github.com:team/repo.git'), 'https://github.com/team/repo');
  assert.equal(repositoryWebUrl('ssh://git@example.com:2222/team/repo.git'), 'https://example.com/team/repo');
  assert.equal(repositoryWebUrl('file:///private/repo'), null);
  assert.equal(repositoryWebUrl('javascript:alert(1)'), null);
});

test('invalid metadata files stay unreadable and are never silently overwritten', async t => {
  const { root } = await fixture(t);
  await writeFile(join(root, 'projects.json'), '[]');
  const store = createProjectStore({ storageDir: root });
  await assert.rejects(store.get('one'), /leggere/);
  await assert.rejects(store.get('one'), /leggere/);
  await assert.rejects(store.save('one', { description: '', client: '', notes: '', status: 'active' }), /leggere/);
  assert.equal(await readFile(join(root, 'projects.json'), 'utf8'), '[]');
});

test('Git status parses renames, spaces, untracked entries and conflicts', () => {
  const state = parseGitStatus('R  new name\0old name\0 M changed\0?? directory/\0UU conflict\0');
  assert.equal(state.changedEntries, 4);
  assert.equal(state.untracked, 1);
  assert.equal(state.conflicts, 1);
  assert.deepEqual(state.files.map(file => file.path), ['new name', 'changed', 'directory/', 'conflict']);
});

test('real Git reads branch, commit and changes without modifying index; handles nested and unborn repositories', async t => {
  const { project } = await fixture(t);
  const git = (...args) => exec('/usr/bin/git', ['-C', project.path, ...args], { env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } });
  await git('init', '-b', 'main');
  const reader = createGitReader();
  const unborn = await reader.get(project);
  assert.equal(unborn.state, 'ready'); assert.equal(unborn.lastCommit, null); assert.equal(unborn.branch, 'main');
  await writeFile(join(project.path, 'readme.txt'), 'initial'); await git('add', 'readme.txt');
  await git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', 'commit', '-m', 'First commit');
  await git('config', 'remote.origin.url', 'https://user:secret@example.com/org/repo.git?token=secret');
  await writeFile(join(project.path, 'readme.txt'), 'changed');
  await mkdir(join(project.path, 'untracked-dir')); await writeFile(join(project.path, 'untracked-dir', 'note'), 'new');
  const indexBefore = await readFile(join(project.path, '.git', 'index'));
  const state = await reader.get(project, { fresh: true });
  assert.equal(state.state, 'ready'); assert.equal(state.branch, 'main'); assert.equal(state.lastCommit.subject, 'First commit');
  assert.equal(state.unstaged, 1); assert.equal(state.untracked, 1);
  assert.equal(state.repositoryUrl, 'https://example.com/org/repo');
  assert.deepEqual(await readFile(join(project.path, '.git', 'index')), indexBefore);
  assert.equal((await reader.get({ ...project, path: join(project.path, 'untracked-dir') })).state, 'parent');
});

test('space analysis measures dependencies and nested projects once, skips symlinks and preserves sources', async t => {
  const { root, project } = await fixture(t);
  const paths = ['node_modules/nested/.cache', 'frontend/.next', 'frontend/node_modules', 'src', 'vendor', '.git/cache'];
  for (const path of paths) await mkdir(join(project.path, path), { recursive: true });
  for (const path of ['node_modules/data', 'frontend/.next/data', 'frontend/node_modules/data', 'vendor/data']) await writeFile(join(project.path, path), Buffer.alloc(4096, 1));
  await mkdir(join(root, 'outside')); await symlink(join(root, 'outside'), join(project.path, '.cache'));
  const analyzer = createSpaceAnalyzer();
  const nested = { id: 'front', name: 'Frontend', path: join(project.path, 'frontend') };
  analyzer.start([project, nested]);
  assert.equal(analyzer.start([project]).running, true);
  const result = await complete(analyzer);
  assert.equal(result.candidates.length, 4);
  assert.ok(result.candidates.every(item => item.status === 'complete'));
  assert.equal(result.candidates.find(item => item.path.endsWith('frontend/.next')).projectId, 'front');
  assert.ok(!result.candidates.some(item => item.path.endsWith('.cache')));
  assert.equal(result.totalBytes, result.candidates.reduce((sum, item) => sum + item.bytes, 0));
  assert.equal((await readFile(join(project.path, 'vendor', 'data'))).length, 4096);
});

test('space analysis reports limits and failures without using partial du output', async t => {
  const { project } = await fixture(t);
  await mkdir(join(project.path, 'build'));
  await mkdir(join(project.path, 'deep', 'another'), { recursive: true });
  const analyzer = createSpaceAnalyzer({ maxDirectories: 1, runner: async () => { throw Object.assign(new Error('denied'), { stdout: '10\tpartial\n' }); } });
  analyzer.start([project]); const result = await complete(analyzer);
  assert.ok(result.warnings.length);
  assert.equal(result.candidates[0].status, 'error');
  assert.equal(result.candidates[0].bytes, null);
  assert.equal(result.totalBytes, 0);
});
