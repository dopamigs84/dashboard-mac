const projectUi = { id: null, data: null, dirty: false, sequence: 0, loading: false };
const spaceUi = { data: null, loading: false, timer: null };
const workStatusLabel = status => ({ active: 'Attivo', paused: 'In pausa', archived: 'Archiviato' })[status] || 'Attivo';
const spaceCategoryLabel = category => ({ dependencies: 'Dipendenze', build: 'Build', cache: 'Cache' })[category] || category;
function canLeaveProject() {
  if (state.active !== 'detail' || !projectUi.dirty) return true;
  if (!window.confirm('Hai modifiche non salvate nella scheda. Vuoi uscire e scartarle?')) return false;
  projectUi.dirty = false;
  return true;
}
function projectFormValue() { return { description: $('project-description').value, client: $('project-client').value, status: $('project-work-status').value, notes: $('project-notes').value }; }
function openProjectDetail(id) {
  if (!canLeaveProject()) return;
  projectUi.id = id; projectUi.data = null; projectUi.dirty = false;
  $('project-form').reset(); $('project-save-status').textContent = '';
  for (const id of ['detail-runtime', 'detail-resources', 'detail-git']) $(id).textContent = 'Caricamento…';
  $('detail-error').hidden = true; $('detail-warnings').hidden = true;
  state.active = 'detail'; render(); syncResourcePolling(); syncRuntimePolling(); syncSpacePolling();
  loadProjectDetail(); $('page-title').scrollIntoView({ block: 'start' });
}
async function loadProjectDetail(fresh = false) {
  const id = projectUi.id;
  const sequence = ++projectUi.sequence;
  $('detail-refresh').disabled = true; projectUi.loading = true; $('detail-error').hidden = true;
  if (!projectUi.data) for (const element of $('project-form').elements) element.disabled = true;
  try {
    const data = await api(`/api/project?id=${encodeURIComponent(id)}${fresh ? '&fresh=1' : ''}`);
    if (sequence !== projectUi.sequence || projectUi.id !== id) return;
    projectUi.data = data;
    if (data.metadata) {
      state.metadata[id] = data.metadata;
      for (const element of $('project-form').elements) element.disabled = false;
      if (!projectUi.dirty) {
        $('project-description').value = data.metadata.description;
        $('project-client').value = data.metadata.client;
        $('project-work-status').value = data.metadata.status;
        $('project-notes').value = data.metadata.notes;
        $('project-save-status').textContent = data.metadata.updatedAt ? `Salvato il ${new Date(data.metadata.updatedAt).toLocaleString('it-IT')}` : 'Nessuna nota ancora salvata';
      }
    }
    if (state.active === 'detail') { navigation(); renderProjectDetail(); }
  } catch (error) { if (sequence === projectUi.sequence) { $('detail-error').textContent = error.message; $('detail-error').hidden = false; } }
  finally { if (sequence === projectUi.sequence) { projectUi.loading = false; $('detail-refresh').disabled = false; } }
}
function renderProjectDetail() {
  const data = projectUi.data;
  if (!data) return;
  $('detail-path').textContent = data.project.displayPath;
  $('detail-warnings').hidden = !data.warnings.length;
  $('detail-warnings').textContent = data.warnings.join(' ');
  const item = data.runtime;
  const url = item?.profile.url || urlFor(data.project);
  $('detail-runtime').innerHTML = `<div class="runtime-actions"><button class="button secondary" data-detail-action="finder">Finder</button><button class="button secondary" data-detail-action="editor" ${state.vscode ? '' : 'disabled'}>VS Code</button>${url ? `<a class="button secondary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Browser ↗</a>` : ''}</div>${item ? `<p class="detail-runtime-state">${escapeHtml(runtimeStatus(item))}${item.pid ? ` · PID ${item.pid}` : ''}</p><code class="runtime-command">${escapeHtml(item.profile.command || 'Configura il comando di avvio')}</code><div class="runtime-actions"><button class="button primary" data-detail-action="${runtimeActive(item) ? 'stop' : 'start'}" ${item.status === 'stopping' || (!runtimeActive(item) && !item.profile.command) ? 'disabled' : ''}>${runtimeActive(item) ? '■ Stop' : '▶ Avvia'}</button><button class="button secondary" data-detail-action="config" ${runtimeActive(item) ? 'disabled' : ''}>Configura</button><button class="button secondary" data-detail-action="logs">Log</button></div>${item.error ? `<p class="runtime-failure">${escapeHtml(item.error)}</p>` : ''}` : '<p>Stato del comando non disponibile.</p>'}`;
  const resource = data.resource;
  $('detail-resources').innerHTML = resource ? `<dl class="detail-metrics"><div><dt>CPU / core</dt><dd>${percentLabel(resource.cpuPercent)}</dd></div><div><dt>RAM (RSS)</dt><dd>${bytesLabel(resource.rssBytes)}</dd></div><div><dt>Processi associati</dt><dd>${resource.processCount ?? '—'}</dd></div><div><dt>Su disco</dt><dd>${resource.disk.status === 'complete' ? bytesLabel(resource.disk.bytes) : 'Da misurare'}</dd></div></dl><p class="field-hint">Campione al momento dell’apertura. CPU 100% = un core; la RAM è una somma RSS.</p><button class="button secondary" data-detail-action="resources">Apri risorse del progetto</button>` : '<p>Risorse non disponibili.</p>';
  const git = data.git;
  if (git.state !== 'ready') { $('detail-git').textContent = git.message; return; }
  $('detail-git').innerHTML = `<div class="git-overview"><span class="work-state">${icon('git')} ${escapeHtml(git.branch)}</span><strong>${git.changedEntries ? `${git.changedEntries} voci con modifiche` : 'Cartella di lavoro pulita'}</strong>${git.repositoryUrl ? `<a class="button secondary" href="${escapeHtml(git.repositoryUrl)}" target="_blank" rel="noopener noreferrer">Repository ↗</a>` : ''}</div><dl class="detail-metrics"><div><dt>In staging</dt><dd>${git.staged}</dd></div><div><dt>Non in staging</dt><dd>${git.unstaged}</dd></div><div><dt>Non tracciate</dt><dd>${git.untracked}</dd></div><div><dt>Conflitti</dt><dd>${git.conflicts}</dd></div></dl><p class="field-hint">${git.ahead === null ? 'Nessun confronto con un ramo remoto configurato.' : `${git.ahead} commit avanti · ${git.behind} indietro rispetto al riferimento remoto locale.`}</p>${git.lastCommit ? `<div class="last-commit"><code>${escapeHtml(git.lastCommit.hash.slice(0, 8))}</code><strong>${escapeHtml(git.lastCommit.subject)}</strong><small>${escapeHtml(new Date(git.lastCommit.date).toLocaleString('it-IT'))}</small></div>` : '<p>Nessun commit ancora presente.</p>'}${git.files.length ? `<details><summary>Modifiche presenti${git.changedEntries > 30 ? ' · prime 30 voci' : ''}</summary><ul class="git-files">${git.files.map(file => `<li><code>${escapeHtml(file.code)}</code> ${escapeHtml(file.path)}</li>`).join('')}</ul></details>` : ''}<p class="field-hint">Le directory non tracciate sono contate come voci, non come singoli file.</p>`;
}
function renderSpace() {
  const data = spaceUi.data;
  if (!data) return;
  $('space-start').disabled = data.running;
  $('space-start').textContent = data.running ? 'Analisi in corso…' : data.phase === 'idle' ? 'Avvia analisi' : 'Ripeti analisi';
  $('space-progress').textContent = data.phase === 'idle' ? 'Pronto per analizzare le cartelle dei progetti.' : data.phase === 'discovering' ? `Ricerca delle cartelle · ${data.visited} directory esaminate` : data.running ? `Dimensioni: ${data.measured} di ${data.total} cartelle misurate` : `Analisi del ${new Date(data.finishedAt).toLocaleString('it-IT')} · ${data.visited} directory esaminate`;
  $('space-warnings').hidden = !data.warnings.length;
  $('space-warnings').innerHTML = data.warnings.length ? `<details><summary>${data.warnings.length} avvisi: l’analisi può essere incompleta</summary><ul>${data.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></details>` : '';
  $('space-summary').innerHTML = ['dependencies', 'build', 'cache'].map(category => {
    const items = data.candidates.filter(item => item.category === category);
    const bytes = items.reduce((sum, item) => sum + (item.bytes || 0), 0);
    const measured = items.filter(item => item.status === 'complete').length;
    return `<article class="resource-metric"><div class="resource-metric-label">${spaceCategoryLabel(category)}</div><strong>${data.phase === 'idle' || (items.length && !measured) ? '—' : bytesLabel(bytes)}</strong><p>${measured} di ${items.length} cartelle misurate</p></article>`;
  }).join('');
  const words = normalize($('space-search').value).split(/\s+/).filter(Boolean);
  const items = data.candidates.filter(item => ($('space-category').value === 'all' || item.category === $('space-category').value) && words.every(word => normalize(`${item.projectName} ${item.path}`).includes(word)));
  items.sort((a, b) => ($('space-sort').value === 'size' ? (b.bytes ?? -1) - (a.bytes ?? -1) : 0) || a.projectName.localeCompare(b.projectName, 'it') || a.path.localeCompare(b.path));
  $('space-rows').innerHTML = items.length ? items.map(item => `<tr><td><button type="button" class="project-title" data-space-project="${escapeHtml(item.projectId)}">${escapeHtml(item.projectName)}</button><small class="space-path">${escapeHtml(item.path)}</small></td><td>${spaceCategoryLabel(item.category)}</td><td title="${escapeHtml(item.error || '')}">${item.status === 'complete' ? bytesLabel(item.bytes) : item.status === 'error' ? 'Non disponibile' : 'In calcolo…'}</td><td><button class="button secondary" type="button" data-space-open="${escapeHtml(item.path)}">Finder</button></td></tr>`).join('') : `<tr><td colspan="4" class="resource-empty">${data.running ? 'Ricerca in corso…' : data.phase === 'idle' ? 'Premi Avvia analisi per iniziare.' : 'Nessuna cartella corrisponde ai filtri.'}</td></tr>`;
}
function scheduleSpacePoll() {
  clearTimeout(spaceUi.timer);
  if (state.active === 'space' && !document.hidden && spaceUi.data?.running) spaceUi.timer = setTimeout(refreshSpace, 2000);
}
async function refreshSpace(start = false) {
  if (spaceUi.loading) return;
  spaceUi.loading = true; $('space-error').hidden = true; $('space-start').disabled = true;
  try { spaceUi.data = await api(start ? '/api/space/scan' : '/api/space', { method: start ? 'POST' : 'GET' }); renderSpace(); }
  catch (error) { $('space-error').textContent = error.message; $('space-error').hidden = false; }
  finally { spaceUi.loading = false; $('space-start').disabled = Boolean(spaceUi.data?.running); scheduleSpacePoll(); }
}
function syncSpacePolling() { clearTimeout(spaceUi.timer); if (state.active === 'space' && !document.hidden) refreshSpace(); }
function initProjects() {
  $('detail-back').addEventListener('click', () => { if (canLeaveProject()) { state.active = 'all'; render(); } });
  $('detail-refresh').addEventListener('click', () => loadProjectDetail(true));
  $('project-form').addEventListener('input', () => { projectUi.dirty = true; $('project-save-status').textContent = 'Modifiche da salvare'; });
  $('project-form').addEventListener('submit', async event => {
    event.preventDefault();
    const id = projectUi.id;
    const value = projectFormValue();
    $('project-save').disabled = true;
    try {
      const metadata = await api('/api/metadata', { method: 'POST', body: { id, ...value } });
      state.metadata[id] = metadata;
      if (id === projectUi.id) {
        projectUi.data.metadata = metadata;
        projectUi.dirty = JSON.stringify(projectFormValue()) !== JSON.stringify(value);
        $('project-save-status').textContent = projectUi.dirty ? 'Salvato · ci sono altre modifiche da salvare' : 'Scheda salvata';
      }
    } catch (error) { $('project-save-status').textContent = 'Salvataggio non riuscito: ' + error.message; }
    finally { $('project-save').disabled = false; }
  });
  window.addEventListener('beforeunload', event => { if (projectUi.dirty) { event.preventDefault(); event.returnValue = ''; } });
  $('detail-panel').addEventListener('click', async event => {
    const button = event.target.closest('[data-detail-action]');
    if (!button || !projectUi.data) return;
    const data = projectUi.data;
    const action = button.dataset.detailAction;
    if (action === 'config') return configureRuntime(projectUi.id, data.runtime);
    if (action === 'logs') { runtimeState.logId = projectUi.id; $('logs-project-name').textContent = data.project.name; $('project-logs').textContent = 'Lettura dei log…'; $('logs-dialog').showModal(); return refreshRuntimeLogs(); }
    if (action === 'resources') {
      if (!canLeaveProject()) return;
      state.active = 'resources'; $('resource-search').value = data.project.path; $('resource-active').checked = false; render(); syncResourcePolling(); return;
    }
    button.disabled = true;
    try {
      if (action === 'finder' || action === 'editor') await api('/api/open', { method: 'POST', body: { id: projectUi.id, app: action === 'editor' ? 'vscode' : 'finder' } });
      else { await api(`/api/runtime/${action}`, { method: 'POST', body: { id: projectUi.id } }); await loadProjectDetail(); }
    } catch (error) { $('detail-error').textContent = error.message; $('detail-error').hidden = false; }
    finally { button.disabled = false; }
  });
  $('space-start').addEventListener('click', () => refreshSpace(true));
  for (const id of ['space-search', 'space-category', 'space-sort']) $(id).addEventListener(id === 'space-search' ? 'input' : 'change', renderSpace);
  $('space-rows').addEventListener('click', async event => {
    const project = event.target.closest('[data-space-project]');
    if (project) return openProjectDetail(project.dataset.spaceProject);
    const button = event.target.closest('[data-space-open]');
    if (!button) return;
    button.disabled = true;
    try { await api('/api/space/open', { method: 'POST', body: { path: button.dataset.spaceOpen } }); }
    catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });
  document.addEventListener('visibilitychange', syncSpacePolling);
}
