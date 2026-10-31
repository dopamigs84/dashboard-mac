const runtimeState = { data: null, ports: null, loading: false, timer: null, logTimer: null, logId: null, logLoading: false, editing: null, actionError: '', busy: new Set() };
const runtimeActive = item => ['running', 'stopping'].includes(item.status);
function runtimeStatus(item) {
  const labels = { idle: 'Da avviare', running: 'Comando in esecuzione', stopping: 'Arresto in corso…', exited: 'Terminato', error: 'Errore' };
  return labels[item.status] || item.status;
}
function renderRuntime() {
  if (!runtimeState.data) return;
  const words = normalize($('runtime-search').value).split(/\s+/).filter(Boolean);
  const items = runtimeState.data.projects.filter(p => words.every(word => normalize(`${p.name} ${p.path}`).includes(word)) && (!$('runtime-only-active').checked || runtimeActive(p)));
  $('runtime-rows').innerHTML = items.length ? items.map(item => {
    const running = runtimeActive(item);
    const disabled = runtimeState.busy.has(item.id) || item.status === 'stopping';
    const url = item.profile.url;
    return `<tr data-runtime-id="${escapeHtml(item.id)}"><td><strong>${escapeHtml(item.name)}</strong><small class="resource-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</small><code class="runtime-command">${escapeHtml(item.profile.command || 'Configura un comando di avvio')}</code>${item.error ? `<small class="runtime-failure">${escapeHtml(item.error)}</small>` : ''}</td><td><span class="runtime-status ${running ? 'running' : item.status === 'error' ? 'failed' : ''}">${escapeHtml(runtimeStatus(item))}</span>${item.pid ? `<small>PID ${item.pid}${item.exitCode !== null ? ` · uscita ${item.exitCode}` : ''}</small>` : ''}</td><td><div class="runtime-actions"><button class="button ${running ? 'secondary' : 'primary'}" data-runtime-action="${running ? 'stop' : 'start'}" ${disabled || (!running && !item.profile.command) ? 'disabled' : ''}>${running ? '■ Stop' : '▶ Avvia'}</button><button class="button secondary" data-runtime-action="config" ${running || disabled ? 'disabled' : ''}>Configura</button><button class="button secondary" data-runtime-action="logs">Log</button>${url ? `<a class="button secondary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Browser ↗</a>` : ''}</div></td></tr>`;
  }).join('') : '<tr><td colspan="3" class="resource-empty">Nessun progetto corrisponde ai filtri.</td></tr>';
  renderPorts();
}
function renderPorts() {
  const data = runtimeState.ports;
  if (!data) return;
  $('ports-warnings').hidden = !data.warnings.length;
  $('ports-warnings').textContent = data.warnings.join(' ');
  const query = normalize($('ports-search').value.trim());
  const listeners = data.listeners.filter(p => normalize(`${p.port} ${p.pid} ${p.name} ${p.projectName || ''} ${p.address}`).includes(query));
  $('ports-rows').innerHTML = listeners.length ? listeners.map(p => `<tr><td><strong>${p.port}</strong><small>${escapeHtml(p.address)}</small></td><td>${escapeHtml(p.name)}<small>PID ${p.pid}</small></td><td>${escapeHtml(p.projectName || 'Non associato')}</td><td>${/mysql|postgres|redis|ssh|mongo/i.test(p.name) ? '—' : `<a class="button secondary" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" title="Prova l’indirizzo HTTP; il servizio deve essere un server web">Apri HTTP ↗</a>`}</td></tr>`).join('') : `<tr><td colspan="4" class="resource-empty">${data.warnings.length ? 'Nessuna porta leggibile con i permessi attuali.' : query ? 'Nessuna porta corrisponde alla ricerca.' : 'Nessuna porta in ascolto rilevata.'}</td></tr>`;
}
function scheduleRuntimePoll() {
  clearTimeout(runtimeState.timer);
  if (state.active === 'runtime' && !document.hidden) runtimeState.timer = setTimeout(refreshRuntime, 3000);
}
async function refreshRuntime() {
  if (runtimeState.loading || state.active !== 'runtime' || document.hidden) return;
  runtimeState.loading = true;
  $('runtime-refresh').disabled = true;
  $('runtime-error').hidden = !runtimeState.actionError;
  $('runtime-error').textContent = runtimeState.actionError;
  try {
    if (!state.token) { const session = await api('/api/session'); state.token = session.token; }
    const [runtime, ports] = await Promise.allSettled([api('/api/runtime'), api('/api/ports')]);
    if (runtime.status === 'rejected') throw runtime.reason;
    runtimeState.data = runtime.value;
    if (ports.status === 'fulfilled') runtimeState.ports = ports.value;
    else { $('ports-warnings').hidden = false; $('ports-warnings').textContent = 'Aggiornamento delle porte non riuscito: ' + ports.reason.message; }
    renderRuntime();
    if (ports.status === 'rejected') { $('ports-warnings').hidden = false; $('ports-warnings').textContent = 'Aggiornamento delle porte non riuscito: ' + ports.reason.message; }
    $('runtime-updated').textContent = `Aggiornato alle ${new Date().toLocaleTimeString('it-IT')} · ogni 3 secondi`;
  } catch (error) {
    $('runtime-error').hidden = false;
    $('runtime-error').textContent = error.message === 'Risorsa non trovata.' ? 'Riavvia la dashboard per caricare avvio, stop e porte.' : error.message;
  } finally { runtimeState.loading = false; $('runtime-refresh').disabled = false; scheduleRuntimePoll(); }
}
function syncRuntimePolling() { clearTimeout(runtimeState.timer); if (state.active === 'runtime' && !document.hidden) refreshRuntime(); }
function configureRuntime(id, provided) {
  const item = provided || runtimeState.data?.projects.find(p => p.id === id);
  if (!item) return;
  runtimeState.editing = id;
  $('launch-project-name').textContent = `${item.name} · ${item.path}`;
  $('launch-command').value = item.profile.command || item.suggestions[0] || '';
  $('launch-directory').value = item.profile.directory;
  $('launch-url').value = item.profile.url;
  $('launch-error').hidden = true;
  $('launch-suggestions').innerHTML = item.suggestions.map(command => `<button type="button" class="type-filter" data-launch-suggestion="${escapeHtml(command)}">${escapeHtml(command)}</button>`).join('');
  $('launch-dialog').showModal();
  $('launch-command').focus();
}
async function refreshRuntimeLogs() {
  clearTimeout(runtimeState.logTimer);
  if (!runtimeState.logId || !$('logs-dialog').open || document.hidden || runtimeState.logLoading) return;
  runtimeState.logLoading = true;
  const id = runtimeState.logId;
  try {
    const result = await api(`/api/runtime/logs?id=${encodeURIComponent(id)}`);
    if (runtimeState.logId === id) {
      const output = $('project-logs');
      const atEnd = output.scrollTop + output.clientHeight >= output.scrollHeight - 30;
      if (output.textContent !== result.logs) output.textContent = result.logs || 'Nessun output disponibile. Avvia il progetto per leggere i log.';
      if (atEnd) output.scrollTop = output.scrollHeight;
    }
  } catch (error) { if (runtimeState.logId === id) $('project-logs').textContent = error.message; }
  finally { runtimeState.logLoading = false; if ($('logs-dialog').open && !document.hidden) runtimeState.logTimer = setTimeout(refreshRuntimeLogs, 3000); }
}
function initRuntime() {
  $('runtime-refresh').addEventListener('click', () => { runtimeState.actionError = ''; refreshRuntime(); });
  $('runtime-search').addEventListener('input', renderRuntime);
  $('runtime-only-active').addEventListener('change', renderRuntime);
  $('ports-search').addEventListener('input', renderPorts);
  $('runtime-search').addEventListener('keydown', event => { if (event.key === 'Escape') { $('runtime-search').value = ''; renderRuntime(); } });
  document.addEventListener('visibilitychange', () => { syncRuntimePolling(); clearTimeout(runtimeState.logTimer); if (!document.hidden) refreshRuntimeLogs(); });
  $('runtime-rows').addEventListener('click', async event => {
    const button = event.target.closest('[data-runtime-action]');
    if (!button) return;
    const id = button.closest('[data-runtime-id]').dataset.runtimeId;
    const action = button.dataset.runtimeAction;
    if (action === 'config') return configureRuntime(id);
    if (action === 'logs') {
      runtimeState.logId = id; $('logs-project-name').textContent = runtimeState.data.projects.find(p => p.id === id)?.name || '';
      $('project-logs').textContent = 'Lettura dei log…'; $('logs-dialog').showModal(); refreshRuntimeLogs(); return;
    }
    if (runtimeState.busy.has(id)) return;
    runtimeState.actionError = '';
    runtimeState.busy.add(id); renderRuntime();
    try { await api(`/api/runtime/${action}`, { method: 'POST', body: { id } }); toast(action === 'start' ? 'Comando avviato. Apri i log per verificarne lo stato.' : 'Progetto fermato.'); }
    catch (error) { runtimeState.actionError = error.message; $('runtime-error').hidden = false; $('runtime-error').textContent = error.message; toast(error.message); }
    finally { runtimeState.busy.delete(id); refreshRuntime(); }
  });
  $('launch-suggestions').addEventListener('click', event => { const button = event.target.closest('[data-launch-suggestion]'); if (button) $('launch-command').value = button.dataset.launchSuggestion; });
  $('launch-form').addEventListener('submit', async event => {
    event.preventDefault(); $('launch-save').disabled = true; $('launch-error').hidden = true;
    try {
      const id = runtimeState.editing;
      const result = await api('/api/runtime/config', { method: 'POST', body: { id, command: $('launch-command').value, directory: $('launch-directory').value, url: $('launch-url').value } });
      // Keep browser links consistent with the explicitly saved launch address.
      if (result.profile.url) { state.urls[id] = result.profile.url; save('urls', state.urls); }
      $('launch-dialog').close(); toast('Comando salvato. Premi Avvia per eseguirlo.');
      if (state.active === 'detail') await loadProjectDetail();
      else await refreshRuntime();
    } catch (error) { $('launch-error').hidden = false; $('launch-error').textContent = error.message; }
    finally { $('launch-save').disabled = false; }
  });
  $('logs-dialog').addEventListener('close', () => { runtimeState.logId = null; clearTimeout(runtimeState.logTimer); });
}
