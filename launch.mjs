import { createDashboard, handleShutdown } from './server.mjs';
import { execFile } from 'node:child_process';

const port = Number(process.env.PORT || 4317);
const url = `http://127.0.0.1:${port}`;
const openBrowser = () => execFile('/usr/bin/open', [url], error => { if (error) console.log(`Apri ${url} nel browser.`); });
const server = createDashboard();
handleShutdown(server);
server.on('error', async error => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`${url}/api/session`, { signal: AbortSignal.timeout(2000) });
      const session = await response.json();
      if (response.ok && session.version === '1.0.0' && typeof session.token === 'string') { openBrowser(); return; }
    } catch { /* A different service may own this port. */ }
  }
  console.error(`Impossibile avviare la dashboard: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`\nDashboard Mac → ${url}\nLascia aperta questa finestra. Ctrl+C per chiudere la dashboard.\n`);
  openBrowser();
});
