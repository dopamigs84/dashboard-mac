import { constants } from 'node:fs';
import { mkdir, copyFile, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export async function initializeData(dataDir, defaultConfig) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const configFile = join(dataDir, 'config.json');
  try { await copyFile(defaultConfig, configFile, constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return configFile;
}

const object = data => data && typeof data === 'object' && !Array.isArray(data);

// Read everything before changing files. Imported commands are never executed here.
export async function planLegacyImport(sourceDir) {
  const files = [];
  for (const name of ['projects.json', 'launch.json']) {
    let data;
    try { data = JSON.parse(await readFile(join(sourceDir, '.local', name), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw new Error(`Impossibile importare ${name}: file non valido.`, { cause: error }); }
    if (!object(data) || Object.values(data).some(value => !object(value))) throw new Error(`Impossibile importare ${name}: formato non valido.`);
    files.push({ name, data });
  }
  if (!files.length) throw new Error('La cartella scelta non contiene note o comandi in .local. Seleziona la cartella dashboard-mac originale.');
  return files;
}

export async function applyLegacyImport(dataDir, files) {
  const writes = [];
  for (const { name, data } of files) {
    const file = join(dataDir, name);
    let current = {};
    try { current = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!object(current)) throw new Error(`Il file ${name} dell’app non è valido. Nessun dato importato.`);
    writes.push({ file, data: { ...data, ...current } });
  }
  for (const { file, data } of writes) {
    await writeFile(file + '.tmp', JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    await rename(file + '.tmp', file);
  }
}
