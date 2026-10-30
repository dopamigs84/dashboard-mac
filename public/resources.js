const resourceState = { data: null, loading: false, diskStarting: false, diskAttempted: false, timer: null };
const bytesLabel = value => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (!value) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const unit = Math.min(4, Math.max(0, Math.floor(Math.log(value) / Math.log(1024))));
  return `${(value / 1024 ** unit).toLocaleString('it-IT', { maximumFractionDigits: unit > 1 ? 1 : 0 })} ${units[unit]}`;
};
const percentLabel = value => value === null || value === undefined ? '—' : `${value.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;
const percentage = (used, total) => total > 0 ? Math.max(0, Math.min(100, used / total * 100)) : 0;
function resourceMetric(title, value, detail, usedPercent, color) {
  return `<article class="resource-metric"><div class="resource-metric-label">${title}</div><strong>${value}</strong><progress class="${color}" max="100" value="${usedPercent ?? 0}" aria-label="${title}" ${usedPercent === null ? 'hidden' : ''}></progress><p>${detail}</p></article>`;
}
function processTable(processes, emptyMessage) {
  if (!processes.length) return `<p class="resource-empty">${emptyMessage}</p>`;
  return `<div class="resource-table-wrap"><table class="resource-table compact"><thead><tr><th scope="col">Processo</th><th scope="col">CPU / core</th><th scope="col">RAM</th></tr></thead><tbody>${processes.map(p => `<tr><td><span class="process-name">${escapeHtml(p.name)}</span><small>PID ${p.pid}</small></td><td>${percentLabel(p.cpuPercent)}</td><td>${bytesLabel(p.rssBytes)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderResources() {
  const data = resourceState.data;
  if (!data) return;
  const { system, diskScan } = data;
  const memory = system.memory;
  const disk = system.disk;
  $('resource-updated').textContent = `Campione delle ${new Date(data.sampledAt).toLocaleTimeString('it-IT')}`;
  $('system-resources').innerHTML = resourceMetric('CPU del Mac', percentLabel(system.cpuPercent), `${system.logicalCores} core logici · 100% = tutta la CPU`, system.cpuPercent, 'green')
    + resourceMetric('RAM impegnata · stima', bytesLabel(memory.usedBytes), `${bytesLabel(memory.totalBytes)} totali · ${bytesLabel(memory.compressedBytes)} compressi<br>Swap utilizzato: ${bytesLabel(memory.swapUsedBytes)}`, percentage(memory.usedBytes, memory.totalBytes), 'lilac')
    + resourceMetric('Spazio del volume Home', disk ? bytesLabel(disk.usedBytes) : '—', disk ? `${bytesLabel(disk.totalBytes)} totali · ${bytesLabel(disk.availableBytes)} disponibili<br>Lo spazio APFS può essere condiviso con altri volumi.` : 'Volume non leggibile.', disk ? percentage(disk.usedBytes, disk.totalBytes) : null, 'sand');
  $('resource-warnings').hidden = !data.warnings.length;
  $('resource-warnings').innerHTML = data.warnings.map(warning => `<div>${escapeHtml(warning)}</div>`).join('');
  $('disk-refresh').disabled = diskScan.running || resourceState.diskStarting;
  $('disk-refresh').textContent = diskScan.running ? 'Calcolo in corso…' : 'Ricalcola spazio progetti';
  const diskErrors = data.projects.filter(p => p.disk.status === 'error').length;
  $('disk-progress').textContent = diskScan.running ? `Spazio su disco: ${diskScan.completed} di ${diskScan.total} progetti misurati. Puoi continuare a usare la dashboard.` : diskScan.total ? `Calcolo completato per ${diskScan.completed} progetti${diskErrors ? ` · ${diskErrors} non misurabili` : ''}. Include dipendenze, cache e file nascosti.` : 'Lo spazio include dipendenze, cache e file nascosti.';
  const measurements = new Map(data.projects.map(p => [p.id, p]));
  const words = normalize($('resource-search').value).split(/\s+/).filter(Boolean);
  const projects = state.projects.filter(p => words.every(word => normalize(`${p.name} ${p.path}`).includes(word))).map(p => ({ ...p, resource: measurements.get(p.id) })).filter(p => !$('resource-active').checked || p.resource?.processCount > 0);
  const order = $('resource-sort').value;
  const sortValue = p => order === 'disk' ? p.resource?.disk.bytes : order === 'memory' ? p.resource?.rssBytes : p.resource?.cpuPercent;
  projects.sort((a, b) => (order === 'name' ? 0 : (sortValue(b) ?? -1) - (sortValue(a) ?? -1)) || a.name.localeCompare(b.name, 'it', { numeric: true }));
  const openDetails = new Set([...$('project-resource-rows').querySelectorAll('details[open]')].map(detail => detail.dataset.projectId));
  const focusedDetails = document.activeElement?.closest('[data-project-id]')?.dataset.projectId;
  $('project-resource-rows').innerHTML = projects.length ? projects.map(project => {
    const resource = project.resource;
    const size = resource?.disk;
    const diskText = size?.status === 'complete' ? bytesLabel(size.bytes) : size?.status === 'pending' ? 'In calcolo…' : size?.status === 'error' ? 'Non disponibile' : 'Da calcolare';
    const processes = resource?.processes || [];
    const processCount = resource?.processCount;
    const status = processCount === null || processCount === undefined ? 'Non rilevabili' : processCount ? `${processCount} associati` : 'Nessuno associato';
    const details = processes.length ? `<details class="process-details" data-project-id="${project.id}" ${openDetails.has(project.id) ? 'open' : ''}><summary>${status}</summary><ul>${processes.map(p => `<li>${escapeHtml(p.name)} · PID ${p.pid}<small>${percentLabel(p.cpuPercent)} CPU · ${bytesLabel(p.rssBytes)}</small></li>`).join('')}</ul></details>` : `<span class="resource-status">${status}</span>`;
    return `<tr><td><strong>${escapeHtml(project.name)}</strong><small class="resource-path" title="${escapeHtml(project.path)}">${escapeHtml(project.displayPath)}</small></td><td>${details}</td><td>${percentLabel(resource?.cpuPercent)}</td><td>${bytesLabel(resource?.rssBytes)}</td><td title="${escapeHtml(size?.error || (size?.measuredAt ? `Misurato alle ${new Date(size.measuredAt).toLocaleTimeString('it-IT')}` : ''))}">${diskText}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="resource-empty">Nessun progetto corrisponde ai filtri.</td></tr>';
  if (focusedDetails) $('project-resource-rows').querySelector(`[data-project-id="${focusedDetails}"] summary`)?.focus({ preventScroll: true });
  const unavailable = data.projects.some(p => p.attribution === 'unavailable');
  $('shared-processes').innerHTML = processTable(data.sharedServices, unavailable ? 'I dati dei processi non sono disponibili.' : 'Nessun servizio condiviso rilevato.');
  $('top-processes').innerHTML = processTable(data.topProcesses, 'I dati dei processi non sono disponibili.');
}
function scheduleResourcePoll() {
  clearTimeout(resourceState.timer);
  if (state.active === 'resources' && !document.hidden && ($('resource-auto').checked || resourceState.data?.diskScan.running)) resourceState.timer = setTimeout(refreshResources, 5000);
}
async function refreshResources() {
  if (resourceState.loading || state.active !== 'resources' || document.hidden) return;
  clearTimeout(resourceState.timer);
  resourceState.loading = true;
  $('resource-refresh').disabled = true;
  $('resource-panel').setAttribute('aria-busy', 'true');
  $('resource-error').hidden = true;
  try {
    if (!state.token) { const session = await api('/api/session'); state.token = session.token; state.vscode = session.vscode; }
    resourceState.data = await api('/api/resources');
    renderResources();
    if (!resourceState.diskAttempted && resourceState.data.projects.some(p => p.disk.status === 'idle')) await startResourceDisk();
  } catch (error) {
    $('resource-error').textContent = error.message === 'Risorsa non trovata.' ? 'Riavvia il servizio della dashboard per caricare la nuova sezione Risorse.' : 'Non riesco ad aggiornare le risorse. ' + error.message;
    $('resource-error').hidden = false;
    if (!resourceState.data) $('system-resources').innerHTML = '<p class="resource-empty">Risorse non disponibili. Premi “Aggiorna ora” per riprovare.</p>';
    else $('resource-updated').textContent += ' · aggiornamento non riuscito';
  } finally {
    resourceState.loading = false; $('resource-refresh').disabled = false; $('resource-panel').setAttribute('aria-busy', 'false'); scheduleResourcePoll();
  }
}
async function startResourceDisk() {
  if (resourceState.diskStarting || resourceState.data?.diskScan.running) return;
  resourceState.diskStarting = true;
  resourceState.diskAttempted = true;
  $('disk-refresh').disabled = true;
  try {
    const status = await api('/api/resources/disk', { method: 'POST' });
    if (resourceState.data) resourceState.data.diskScan = status;
    renderResources();
  } catch (error) { toast('Calcolo dello spazio non avviato: ' + error.message); }
  finally { resourceState.diskStarting = false; $('disk-refresh').disabled = Boolean(resourceState.data?.diskScan.running); scheduleResourcePoll(); }
}
function syncResourcePolling() {
  clearTimeout(resourceState.timer);
  if (state.active === 'resources' && !document.hidden) refreshResources();
}
function initResources() {
  $('resource-refresh').addEventListener('click', refreshResources);
  $('resource-auto').addEventListener('change', scheduleResourcePoll);
  $('disk-refresh').addEventListener('click', startResourceDisk);
  $('resource-search').addEventListener('input', renderResources);
  $('resource-search').addEventListener('keydown', event => { if (event.key === 'Escape') { $('resource-search').value = ''; renderResources(); } });
  $('resource-sort').addEventListener('change', renderResources);
  $('resource-active').addEventListener('change', renderResources);
  document.addEventListener('visibilitychange', syncResourcePolling);
}
