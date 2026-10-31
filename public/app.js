/* No external services or dependencies: project metadata stays on this Mac. */
const icons = {
  play: '<path d="M3 1h2v1h2v2h2v1h2v2h2v2h-2v2H9v1H7v2H5v1H3z"/>',
  folder: '<path d="M1 3h6v2h8v9H1V3zm2 2v7h10V7H6V5H3z" fill-rule="evenodd"/>',
  layers: '<path d="M1 1h6v6H1zm8 0h6v6H9zM1 9h6v6H1zm8 0h6v6H9z"/>',
  grid: '<path d="M1 1h6v6H1V1zm2 2v2h2V3H3zm6-2h6v6H9V1zm2 2v2h2V3h-2zM1 9h6v6H1V9zm2 2v2h2v-2H3zm6-2h6v6H9V9zm2 2v2h2v-2h-2z" fill-rule="evenodd"/>',
  home: '<path d="M7 1h2v2h2v2h2v2h2v2h-2v6H9v-4H7v4H3V9H1V7h2V5h2V3h2z"/>',
  star: '<path d="M7 1h2v4h2v1h4v2h-2v2h-2v2h2v3h-2v-1H9v-2H7v2H5v1H3v-3h2v-2H3V8H1V6h4V5h2z"/>',
  clock: '<path d="M4 1h8v2h2v2h1v6h-1v2h-2v2H4v-2H2v-2H1V5h1V3h2V1zm0 3v2H3v4h1v2h2v1h4v-1h2v-2h1V6h-1V4H4zm3 0h2v4h3v2H7V4z" fill-rule="evenodd"/>',
  server: '<path d="M1 1h14v6H1V1zm2 2v2h2V3H3zm5 0v2h5V3H8zM1 9h14v6H1V9zm2 2v2h2v-2H3zm5 0v2h5v-2H8z" fill-rule="evenodd"/>',
  search: '<path d="M3 1h6v2h2v6H9v2H3V9H1V3h2V1zm0 2v6h6V3H3zm7 7h2v2h2v2h1v1h-3v-2h-2v-3z" fill-rule="evenodd"/>',
  arrow: '<path d="M8 2h2v2h2v2h2v4h-2v2h-2v2H8v-2h2v-2H1V6h9V4H8z"/>',
  refresh: '<path d="M4 1h7v2h2V1h2v6H9V5h2V3H4v2H2v2H0V4h2V2h2zM16 9v3h-2v2h-2v1H5v-2H3v2H1V9h6v2H5v2h7v-2h2V9z"/>',
  settings: '<path d="M0 3h4V1h4v2h8v2H8v2H4V5H0zm0 8h9V9h4v2h3v2h-3v2H9v-2H0z"/>',
  monitor: '<path d="M1 1h14v11H9v2h3v2H4v-2h3v-2H1V1zm2 2v7h10V3H3z" fill-rule="evenodd"/>',
  code: '<path d="M4 3h2v2H4v2H2v2h2v2h2v2H4v-2H2V9H0V7h2V5h2zm6 0h2v2h2v2h2v2h-2v2h-2v2h-2v-2h2V9h2V7h-2V5h-2zM8 2h1v12H7V8h1z"/>',
  external: '<path d="M8 1h7v7h-2V5h-2v2H9v2H7V7h2V5h2V3H8zM1 3h5v2H3v8h8v-3h2v5H1z"/>',
  copy: '<path d="M1 1h10v3h4v11H5v-3H1V1zm2 2v7h2V4h4V3H3zm4 3v7h6V6H7z" fill-rule="evenodd"/>',
  git: '<path d="M2 1h4v4H5v5h2V9h3V7h1V5h-1V1h4v4h-1v4h-2v2H7v1H6v3H2v-4h1V5H2z"/>',
  list: '<path d="M1 2h3v3H1zm5 0h9v3H6zM1 7h3v3H1zm5 0h9v3H6zM1 12h3v3H1zm5 0h9v3H6z"/>',
  command: '<path d="M1 1h5v4h4V1h5v5h-4v4h4v5h-5v-4H6v4H1v-5h4V6H1V1zm2 2v1h1V3H3zm9 0v1h1V3h-1zM7 7v2h2V7H7zm-4 5v1h1v-1H3zm9 0v1h1v-1h-1z" fill-rule="evenodd"/>',
  close: '<path d="M2 2h2v2h2v2h4V4h2V2h2v2h-2v2h-2v4h2v2h2v2h-2v-2h-2v-2H6v2H4v2H2v-2h2v-2h2V6H4V4H2z"/>',
  link: '<path d="M9 1h4v2h2v4h-2v2h-2V7h2V3H9v2H7V3h2zM3 7h2v2H3v4h4v-2h2v2H7v2H3v-2H1V9h2zM9 5h2v2H9v2H7v2H5V9h2V7h2z"/>',
};
const icon = name => `<svg viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${icons[name] || icons.folder}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Original 5 × 7 pixel lettering for display titles; readable text stays in the heading.
const pixelLetters = {
  A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111', D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111', F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111', H: '10001/10001/10001/11111/10001/10001/10001',
  I: '111/010/010/010/010/010/111', J: '00111/00010/00010/00010/00010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001', L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/11001/11001/10101/10011/10011/10001',
  O: '01110/10001/10001/10001/10001/10001/01110', P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101', R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110', V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/11011/10001', X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100', Z: '11111/00001/00010/00100/01000/10000/11111',
};
function pixelTitle(title) {
  const letters = normalize(title).toUpperCase();
  if ([...letters].some(letter => letter !== ' ' && !pixelLetters[letter])) return `${escapeHtml(title)}<span class="title-dot">.</span>`;
  let x = 0;
  let pixels = '';
  for (const letter of letters) {
    if (letter === ' ') { x += 4; continue; }
    const rows = pixelLetters[letter].split('/');
    rows.forEach((row, y) => [...row].forEach((bit, column) => { if (bit === '1') pixels += `M${x + column} ${y}h1v1h-1z`; }));
    x += rows[0].length + 1;
  }
  return `<span class="sr-only">${escapeHtml(title)}</span><svg class="pixel-heading" viewBox="0 0 ${x + 3} 7" width="${(x + 3) * 4}" height="28" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${pixels}"/><path class="pixel-heading-dot" d="M${x + 1} 5h2v2h-2z"/></svg>`;
}
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`dashboard-mac:${key}`)) ?? fallback; } catch { return fallback; } };
const savedFavorites = load('favorites', []);
const objectSetting = key => { const value = load(key, {}); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; };
const state = { projects: [], roots: [], metadata: {}, active: 'all', type: 'all', query: '', token: '', favorites: new Set(Array.isArray(savedFavorites) ? savedFavorites.filter(id => typeof id === 'string') : []), recent: objectSetting('recent'), urls: objectSetting('urls'), view: load('view', 'grid') === 'list' ? 'list' : 'grid', sort: 'modified', vscode: false, loaded: false };
let toastTimer;
let editingUrl;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
function save(key, value) { try { localStorage.setItem(`dashboard-mac:${key}`, JSON.stringify(value)); } catch { toast('Il browser non consente di salvare le preferenze.'); } }
const urlFor = project => { try { const url = new URL(state.urls[project.id] || project.url); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } };
async function api(path, { method = 'GET', body } = {}, retry = true) {
  const response = await fetch(path, { method, headers: { 'X-Dashboard-Token': state.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (response.status === 403 && path !== '/api/session' && retry) {
    const session = await api('/api/session', {}, false);
    state.token = session.token;
    return api(path, { method, body }, false);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Operazione non riuscita.');
  return result;
}
function relativeDate(date) {
  const delta = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
  if (delta === 0) return 'Oggi';
  if (delta === 1) return 'Ieri';
  if (delta < 30) return `${delta} giorni fa`;
  return new Date(date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}
function navigation() {
  const entries = [{ id: 'all', label: 'Tutti i progetti', icon: 'layers', count: state.projects.length }, { id: 'favorites', label: 'Preferiti', icon: 'star', count: state.projects.filter(p => state.favorites.has(p.id)).length }, { id: 'recent', label: 'Aperti di recente', icon: 'clock' }, { id: 'resources', label: 'Risorse del Mac', icon: 'monitor' }, { id: 'runtime', label: 'Avvio e porte', icon: 'play' }, { id: 'space', label: 'Spazio da recuperare', icon: 'folder' }];
  const sources = state.roots.map(root => ({ id: root.id, label: root.label, icon: root.id === 'mamp' ? 'server' : 'home', count: state.projects.filter(p => p.rootId === root.id).length }));
  const buttons = items => items.map(item => `<button class="nav-item ${state.active === item.id ? 'active' : ''}" data-nav="${escapeHtml(item.id)}" ${state.active === item.id ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${escapeHtml(item.label)}</span>${item.count !== undefined ? `<span class="nav-count">${state.loaded ? item.count : '—'}</span>` : ''}</button>`).join('');
  $('navigation').innerHTML = buttons(entries) + '<div class="nav-label sources-label">SORGENTI</div>' + buttons(sources);
  const title = state.active === 'detail' ? (projectUi.data?.project.name || state.projects.find(p => p.id === projectUi.id)?.name || 'Scheda progetto') : [...entries, ...sources].find(item => item.id === state.active)?.label || 'Tutti i progetti';
  $('page-title').innerHTML = pixelTitle(title);
  $('breadcrumb-current').textContent = title;
  $('page-description').textContent = state.active === 'detail' ? 'Il contesto, gli strumenti e il prossimo passo del tuo progetto.' : state.active === 'space' ? 'Scopri quanto occupano dipendenze, build e cache dei progetti.' : state.active === 'runtime' ? 'Avvia i progetti, controlla i log e ritrova le porte occupate.' : state.active === 'resources' ? 'Una vista su CPU, memoria e spazio occupato. Sul Mac e nei tuoi progetti.' : state.active === 'favorites' ? 'I progetti che vuoi tenere sempre a portata di mano.' : state.active === 'recent' ? 'Riprendi da dove avevi lasciato, senza cercare.' : 'Meno cartelle da cercare. Più spazio per le tue idee.';
}
function sourceProjects() {
  return state.projects.filter(p => state.active === 'all' || (state.active === 'favorites' ? state.favorites.has(p.id) : state.active === 'recent' ? Boolean(state.recent[p.id]) : p.rootId === state.active));
}
function typeFilters() {
  const counts = new Map();
  for (const project of sourceProjects()) counts.set(project.type, (counts.get(project.type) || 0) + 1);
  if (state.type !== 'all' && !counts.has(state.type)) state.type = 'all';
  $('type-filters').innerHTML = `<button class="type-filter ${state.type === 'all' ? 'selected' : ''}" data-type="all" aria-pressed="${state.type === 'all'}">Tutti</button>` + [...counts].sort((a, b) => b[1] - a[1]).map(([type, count]) => `<button class="type-filter ${state.type === type ? 'selected' : ''}" data-type="${escapeHtml(type)}" aria-pressed="${state.type === type}">${escapeHtml(type)}<span>${count}</span></button>`).join('');
}
const palette = type => ['Next.js', 'Node.js', 'React', 'Vue'].includes(type) ? 'green' : ['PHP', 'Laravel', 'WordPress'].includes(type) ? 'lilac' : ['Python', 'HTML'].includes(type) ? 'sand' : 'blue';
function projectCard(project) {
  const name = escapeHtml(project.name);
  const favorite = state.favorites.has(project.id);
  const url = urlFor(project);
  const metadata = state.metadata[project.id];
  const initial = project.name.split(/[-_\s]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return `<article class="project-card" data-project="${project.id}">
    <div class="card-top"><span class="project-monogram ${palette(project.type)}">${escapeHtml(initial)}</span><span class="source-badge">${icon(project.rootId === 'mamp' ? 'server' : 'home')}${escapeHtml(project.rootLabel)}</span><button class="icon-button favorite ${favorite ? 'is-favorite' : ''}" data-action="favorite" aria-pressed="${favorite}" aria-label="${favorite ? 'Rimuovi' : 'Aggiungi'} ${name} ${favorite ? 'dai' : 'ai'} preferiti" title="${favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}">${icon('star')}</button></div>
    <div class="card-info"><h2><button class="project-title" data-action="detail" title="Apri la scheda di ${name}">${name}</button></h2><div class="project-path" title="${escapeHtml(project.path)}">${escapeHtml(project.displayPath)}</div>
    ${metadata ? `<div class="project-context"><span class="work-state">${workStatusLabel(metadata.status)}</span>${metadata.client ? `<span>${escapeHtml(metadata.client)}</span>` : ''}</div>` : ''}</div>
    <div class="project-meta"><span class="technology"><span class="tech-dot ${palette(project.type)}"></span>${escapeHtml(project.type)}</span>${project.git ? `<span class="git-tag" title="Repository Git">${icon('git')}Git</span>` : ''}<time datetime="${project.modifiedAt}" title="Ultima modifica nella cartella principale: ${escapeHtml(new Date(project.modifiedAt).toLocaleString('it-IT'))}">${icon('clock')}${relativeDate(project.modifiedAt)}</time></div>
    <div class="card-actions"><button class="icon-button" data-action="runtime" title="Gestisci avvio e stop" aria-label="Gestisci avvio di ${name}">${icon('play')}</button><button class="open-finder" data-action="finder" aria-label="Apri ${name} nel Finder">${icon('folder')}Finder</button><button class="icon-button" data-action="resources" title="Risorse del progetto" aria-label="Vedi risorse di ${name}">${icon('monitor')}</button><button class="icon-button" data-action="vscode" title="${state.vscode ? 'Apri in VS Code' : 'VS Code non trovato in Applicazioni'}" aria-label="Apri ${name} in VS Code" ${state.vscode ? '' : 'disabled'}>${icon('code')}</button>${url ? `<a class="icon-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" data-action="browser" title="Apri ${escapeHtml(url)}" aria-label="Apri ${name} nel browser">${icon('external')}</a>` : `<button class="icon-button" data-action="url" title="Collega un indirizzo browser" aria-label="Imposta indirizzo browser per ${name}">${icon('link')}</button>`}<button class="icon-button copy-button" data-action="copy" title="Copia percorso" aria-label="Copia percorso di ${name}">${icon('copy')}</button>${url ? `<button class="icon-button edit-url" data-action="url" title="Modifica indirizzo browser" aria-label="Modifica indirizzo browser di ${name}">${icon('settings')}</button>` : ''}</div>
  </article>`;
}
function render() {
  navigation();
  const resources = state.active === 'resources';
  const runtime = state.active === 'runtime';
  const detail = state.active === 'detail';
  const space = state.active === 'space';
  $('detail-panel').hidden = !detail;
  $('space-panel').hidden = !space;
  $('runtime-panel').hidden = !runtime;
  $('resource-panel').hidden = !resources;
  $('project-overview').hidden = resources || runtime || detail || space;
  $('project-library').hidden = resources || runtime || detail || space;
  $('scan-button').hidden = resources || runtime || detail || space;
  if (detail) { renderProjectDetail(); return; }
  if (space) { renderSpace(); return; }
  if (runtime) { renderRuntime(); return; }
  if (resources) { renderResources(); return; }
  if (!state.loaded) return;
  typeFilters();
  const words = normalize(state.query.trim()).split(/\s+/).filter(Boolean);
  const projects = sourceProjects().filter(p => (state.type === 'all' || p.type === state.type) && ($('work-status-filter').value === 'all' || (state.metadata[p.id]?.status || 'active') === $('work-status-filter').value) && words.every(word => normalize(`${p.name} ${p.path} ${p.type} ${p.description} ${state.metadata[p.id]?.client || ''} ${state.metadata[p.id]?.description || ''} ${state.metadata[p.id]?.notes || ''}`).includes(word)));
  projects.sort((a, b) => state.sort === 'name' ? a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }) : state.sort === 'opened' || state.active === 'recent' ? (Number(state.recent[b.id]) || 0) - (Number(state.recent[a.id]) || 0) : b.modifiedAt.localeCompare(a.modifiedAt));
  $('result-count').textContent = `${projects.length} ${projects.length === 1 ? 'progetto' : 'progetti'}`;
  $('projects').classList.toggle('list-view', state.view === 'list');
  $('grid-button').setAttribute('aria-pressed', state.view === 'grid');
  $('list-button').setAttribute('aria-pressed', state.view === 'list');
  if (projects.length) $('projects').innerHTML = projects.map(projectCard).join('');
  else {
    const filtering = Boolean(state.query || state.type !== 'all' || $('work-status-filter').value !== 'all');
    const title = filtering ? 'Nessun progetto trovato' : state.active === 'favorites' ? 'I tuoi preferiti iniziano qui' : state.active === 'recent' ? 'Pronto a ripartire?' : 'Non ci sono ancora progetti';
    const description = filtering ? 'Prova un altro nome, percorso o tecnologia.' : state.active === 'favorites' ? 'Premi la stella su un progetto per ritrovarlo qui.' : state.active === 'recent' ? 'Apri un progetto dalla dashboard: lo ritroverai in questa sezione.' : 'Aggiorna la scansione o controlla le cartelle di ricerca.';
    $('projects').innerHTML = `<div class="empty-state"><span class="empty-icon">${icon(filtering ? 'search' : state.active === 'favorites' ? 'star' : 'folder')}</span><h2>${title}</h2><p>${description}</p>${filtering ? '<button class="button secondary" id="reset-search">Azzera filtri</button>' : ''}</div>`;
  }
  $('count-all').textContent = state.projects.length;
  $('count-mamp').textContent = state.projects.filter(p => p.rootId === 'mamp').length;
  $('count-home').textContent = state.projects.filter(p => p.rootId === 'home').length;
}
function markRecent(project) { state.recent[project.id] = Date.now(); save('recent', state.recent); }
async function refresh(initial = false) {
  const button = $('scan-button');
  button.disabled = true;
  button.classList.add('scanning');
  button.lastElementChild.textContent = 'Ricerca in corso…';
  $('projects').setAttribute('aria-busy', 'true');
  $('error-banner').hidden = true;
  try {
    if (!state.token) { const session = await api('/api/session'); state.token = session.token; state.vscode = session.vscode; }
    const result = await api(initial ? '/api/projects' : '/api/scan', { method: initial ? 'GET' : 'POST' });
    state.projects = result.projects;
    state.roots = result.roots;
    state.loaded = true;
    try { state.metadata = (await api('/api/metadata')).metadata; } catch { toast('Note e categorie non disponibili. Apri una scheda per riprovare.'); }
    $('scan-info').textContent = `Ultima scansione ${new Date(result.scannedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · ${result.visited.toLocaleString('it-IT')} cartelle esplorate`;
    $('warnings').hidden = result.warnings.length === 0;
    $('warnings').innerHTML = result.warnings.length ? `<details><summary>${result.warnings.length} ${result.warnings.length === 1 ? 'avviso sulla scansione' : 'avvisi sulla scansione'}</summary><ul>${result.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></details>` : '';
    render();
    if (!initial) toast('Elenco progetti aggiornato.');
  } catch (error) {
    $('error-banner').textContent = error instanceof TypeError ? 'La dashboard non riesce a raggiungere il servizio locale. Avvialo e premi Aggiorna progetti.' : error.message;
    $('error-banner').hidden = false;
    if (!state.loaded) { $('projects').innerHTML = '<div class="empty-state"><span class="empty-icon">' + icon('folder') + '</span><h2>Riprendiamo tra un attimo</h2><p>Non è stato possibile caricare i progetti.<br>Usa “Aggiorna progetti” per riprovare.</p></div>'; $('scan-info').textContent = 'Scansione non disponibile'; }
  } finally { button.disabled = false; button.classList.remove('scanning'); button.lastElementChild.textContent = 'Aggiorna progetti'; $('projects').setAttribute('aria-busy', 'false'); }
}
$('navigation').addEventListener('click', event => { const button = event.target.closest('[data-nav]'); if (button) { if (!canLeaveProject()) return; state.active = button.dataset.nav; state.type = 'all'; render(); syncResourcePolling(); syncRuntimePolling(); syncSpacePolling(); } });
$('type-filters').addEventListener('click', event => { const button = event.target.closest('[data-type]'); if (button) { state.type = button.dataset.type; render(); } });
$('search').addEventListener('input', event => { state.query = event.target.value; render(); });
$('work-status-filter').addEventListener('change', render);
$('sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
$('scan-button').addEventListener('click', () => refresh());
for (const view of ['grid', 'list']) $(`${view}-button`).addEventListener('click', () => { state.view = view; save('view', view); render(); });
$('projects').addEventListener('click', async event => {
  if (event.target.closest('#reset-search')) { state.query = ''; state.type = 'all'; $('search').value = ''; $('work-status-filter').value = 'all'; render(); $('search').focus(); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const project = state.projects.find(p => p.id === button.closest('[data-project]').dataset.project);
  if (!project) return;
  const action = button.dataset.action;
  if (action === 'detail') { openProjectDetail(project.id);
  } else if (action === 'runtime') {
    state.active = 'runtime'; $('runtime-search').value = project.path; $('runtime-only-active').checked = false; render(); syncResourcePolling(); syncRuntimePolling();
  } else if (action === 'resources') {
    state.active = 'resources'; $('resource-search').value = project.path; $('resource-active').checked = false; render(); syncResourcePolling(); syncRuntimePolling(); $('resource-search').focus();
  } else if (action === 'favorite') {
    state.favorites.has(project.id) ? state.favorites.delete(project.id) : state.favorites.add(project.id);
    save('favorites', [...state.favorites]); render();
    document.querySelector(`[data-project="${project.id}"] [data-action="favorite"]`)?.focus();
  } else if (action === 'copy') {
    try { await navigator.clipboard.writeText(project.path); toast('Percorso copiato.'); } catch { toast('Impossibile copiare. Puoi selezionare il percorso sulla scheda.'); }
  } else if (action === 'url') {
    editingUrl = project;
    $('url-project-name').textContent = project.name;
    $('project-url').value = urlFor(project) || '';
    $('project-url').setCustomValidity('');
    $('url-dialog').showModal();
    $('project-url').focus();
  } else if (action === 'browser') {
    markRecent(project);
  } else {
    button.disabled = true;
    try { await api('/api/open', { method: 'POST', body: { id: project.id, app: action } }); markRecent(project); toast(action === 'finder' ? 'Cartella aperta nel Finder.' : 'Progetto aperto in VS Code.'); }
    catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  }
});
$('url-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const url = new URL($('project-url').value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    state.urls[editingUrl.id] = url.href; save('urls', state.urls); $('url-dialog').close(); render(); toast('Collegamento salvato.');
  } catch { $('project-url').setCustomValidity('Inserisci un indirizzo http:// o https:// senza credenziali.'); $('project-url').reportValidity(); }
});
$('project-url').addEventListener('input', () => $('project-url').setCustomValidity(''));
$('sources-button').addEventListener('click', () => {
  $('sources-list').innerHTML = state.roots.length ? state.roots.map(root => `<div class="source-row"><span class="stat-icon ${root.id === 'mamp' ? 'sand' : 'lilac'}">${icon(root.id === 'mamp' ? 'server' : 'home')}</span><div><strong>${escapeHtml(root.label)}</strong><code>${escapeHtml(root.path)}</code><small>Ricerca fino a ${root.depth} livelli</small></div></div>`).join('') : '<p>Le cartelle saranno visibili al termine della prima scansione.</p>';
  $('sources-dialog').showModal();
});
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (document.querySelector('dialog[open]')) return;
  if (((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing)) {
    event.preventDefault();
    if (state.active === 'detail') { if (!canLeaveProject()) return; state.active = 'all'; render(); }
    const search = state.active === 'space' ? $('space-search') : state.active === 'runtime' ? $('runtime-search') : state.active === 'resources' ? $('resource-search') : $('search'); search.focus(); search.select();
  }
  if (event.key === 'Escape' && document.activeElement === $('search')) { $('search').value = ''; state.query = ''; render(); }
});
initProjects();
initRuntime();
initResources();
navigation();
refresh(true);
