import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import { join, resolve } from 'node:path';
import { initializeData, planLegacyImport, applyLegacyImport } from './data.mjs';
import { startDesktopService } from './service.mjs';

app.setName('Dashboard Mac');
const customDataDir = app.commandLine.getSwitchValue('user-data-dir');
if (customDataDir) app.setPath('userData', resolve(customDataDir));
const dataDir = app.getPath('userData');
const requestedPort = app.commandLine.getSwitchValue('dashboard-port');
const port = requestedPort ? Number(requestedPort) : 4319;
let service, window, pendingImport, quitting;

function externalUrl(raw) {
  try {
    const url = new URL(raw);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Ignore unsupported destinations. */ }
}

function openExternal(raw) {
  const url = externalUrl(raw);
  if (url) shell.openExternal(url).catch(error => dialog.showErrorBox('Apertura non riuscita', error.message));
}

async function importLegacy() {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Importa note e comandi dalla dashboard locale',
    message: 'Scegli la cartella dashboard-mac originale. I dati già presenti nell’app verranno conservati. L’app si riavvierà e fermerà i progetti che ha avviato.',
    properties: ['openDirectory'],
    buttonLabel: 'Importa e riavvia',
  });
  if (canceled) return;
  try {
    pendingImport = await planLegacyImport(filePaths[0]);
    app.quit();
  } catch (error) { dialog.showErrorBox('Importazione non riuscita', error.message); }
}

function setMenu(configFile) {
  const openPath = path => shell.openPath(path).then(error => { if (error) dialog.showErrorBox('Apertura non riuscita', error); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'Archivio', submenu: [
      { label: 'Modifica configurazione cartelle…', click: () => openPath(configFile) },
      { label: 'Apri cartella dati', click: () => openPath(dataDir) },
      { label: 'Importa note e comandi…', click: importLegacy },
      { type: 'separator' }, { role: 'close', label: 'Chiudi finestra' },
    ] },
    { role: 'editMenu' },
    { label: 'Vista', submenu: [
      { role: 'reload', label: 'Ricarica' },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
      ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
    ] },
    { role: 'windowMenu' },
  ]));
}

async function createWindow() {
  window = new BrowserWindow({
    title: 'Dashboard Mac', width: 1440, height: 940, minWidth: 760, minHeight: 560,
    backgroundColor: '#f1efd5', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false },
  });
  const contents = window.webContents;
  const trusted = raw => { try { return new URL(raw).origin === service.url; } catch { return false; } };
  contents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  contents.on('will-navigate', (event, url) => {
    if (!trusted(url)) { event.preventDefault(); openExternal(url); }
  });
  contents.on('will-redirect', (event, url) => { if (!trusted(url)) event.preventDefault(); });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(webContents === contents && trusted(webContents.getURL()) && permission === 'clipboard-sanitized-write');
  });
  contents.session.setPermissionCheckHandler((_webContents, permission, origin) => trusted(origin) && permission === 'clipboard-sanitized-write');
  contents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', title: 'Modifiche non salvate',
      message: 'La scheda del progetto contiene modifiche non salvate.',
      buttons: ['Resta nella dashboard', 'Esci senza salvare'], defaultId: 0, cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
    else pendingImport = undefined;
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = undefined; });
  await window.loadURL(service.url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  // will-quit runs after windows accept closing, so unsaved notes can still cancel quit.
  app.on('will-quit', event => {
    event.preventDefault();
    quitting ||= (async () => {
      await service?.close();
      if (pendingImport) { await applyLegacyImport(dataDir, pendingImport); app.relaunch(); }
    })().then(() => app.exit(0)).catch(error => {
      dialog.showErrorBox('Chiusura non riuscita', error.message); app.exit(1);
    });
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.quit());
  app.whenReady().then(async () => {
    app.dock?.setIcon(join(app.getAppPath(), 'public/icon-512.png'));
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Porta della dashboard non valida.');
    const configFile = await initializeData(dataDir, join(app.getAppPath(), 'config.json'));
    service = await startDesktopService({ configFile, dataDir, port });
    setMenu(configFile);
    await createWindow();
  }).catch(error => {
    const message = error.code === 'EADDRINUSE' ? `La porta locale ${port} è occupata da un altro programma. Libera la porta e riapri Dashboard Mac.` : error.message;
    dialog.showErrorBox('Dashboard Mac non riesce ad avviarsi', message);
    app.quit();
  });
}
