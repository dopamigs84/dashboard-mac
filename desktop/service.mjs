import { once } from 'node:events';
import { createDashboard } from '../server.mjs';
import { createRuntimeManager } from '../lib/runtime.mjs';
import { createProjectStore } from '../lib/projects.mjs';

export async function startDesktopService({ configFile, dataDir, port = 4319 }) {
  const server = createDashboard({
    configFile,
    runtimeManager: createRuntimeManager({ storageDir: dataDir }),
    projectStore: createProjectStore({ storageDir: dataDir }),
  });
  server.listen(port, '127.0.0.1');
  try { await once(server, 'listening'); }
  catch (error) { await server.stopProjects(); throw error; }
  let closing;
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close() {
      closing ||= (async () => {
        await server.stopProjects();
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      })();
      return closing;
    },
  };
}
