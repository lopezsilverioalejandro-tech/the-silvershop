'use strict';

import { api, downloadsText, escapeHtml, formatBytes, formatDate, formatNumber, renderIcon, toast } from './common.js';

const $ = (id) => document.getElementById(id);

const loginView = $('login-view');
const panelView = $('panel-view');
const loginForm = $('login-form');
const loginError = $('login-error');
const logoutBtn = $('logout-btn');

const appForm = $('app-form');
const editorTitle = $('editor-title');
const editorSub = $('editor-sub');
const appIdInput = $('app-id');
const apkTokenInput = $('apk-token');
const apkBox = $('apk-box');
const apkDrop = $('apk-drop');
const apkFile = $('apk-file');
const apkInfo = $('apk-info');
const apkIcon = $('apk-icon');
const apkName = $('apk-name');
const apkMeta = $('apk-meta');
const apkHash = $('apk-hash');
const apkClear = $('apk-clear');
const dropTitle = apkDrop.querySelector('.drop-title');
const dropSub = apkDrop.querySelector('.drop-sub');

const fields = {
  name: $('f-name'),
  category: $('f-category'),
  tagline: $('f-tagline'),
  publisher: $('f-publisher'),
  package: $('f-package'),
  description: $('f-description'),
  version: $('f-version'),
  changelog: $('f-changelog'),
  icon: $('f-icon'),
  screenshots: $('f-screenshots'),
  featured: $('f-featured'),
  published: $('f-published'),
};

const versionsBox = $('versions-box');
const adminVersions = $('admin-versions');
const addVersionBtn = $('add-version-btn');
const appsList = $('apps-list');
const adminEmpty = $('admin-empty');
const adminStats = $('admin-stats');
const thumbs = $('thumbs');
const saveBtn = $('save-btn');
const saveHint = $('save-hint');

const state = {
  apps: [],
  categories: [],
  editingId: null,
  token: null,
  removeShots: [],
  newShots: [],
  shotUrls: [],
};

/* ---------------------------- sesion ---------------------------- */

function showLogin(message) {
  loginView.hidden = false;
  panelView.hidden = true;
  logoutBtn.hidden = true;
  loginError.hidden = !message;
  if (message) loginError.textContent = message;
  $('password').focus();
}

function showPanel() {
  loginView.hidden = true;
  panelView.hidden = false;
  logoutBtn.hidden = false;
  $('password').value = '';
  loadApps();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const button = $('login-submit');
  button.disabled = true;
  button.textContent = 'Entrando…';
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: { password: $('password').value },
    });
    showPanel();
  } catch (error) {
    loginError.hidden = false;
    loginError.textContent = error.message || 'No se pudo entrar.';
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar';
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST' });
  } catch {}
  showLogin();
});

/* ---------------------------- listado --------------------------- */

function statCard(label, value) {
  return `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderStats(stats) {
  adminStats.innerHTML = [
    statCard('Apps', formatNumber(stats.apps)),
    statCard('Publicadas', formatNumber(stats.published)),
    statCard('Descargas', formatNumber(stats.downloads)),
  ].join('');
}

function renderApps() {
  if (!state.apps.length) {
    appsList.innerHTML = '';
    adminEmpty.hidden = false;
    return;
  }
  adminEmpty.hidden = true;
  appsList.innerHTML = state.apps
    .map((app) => {
      const live = app.published !== false;
      return `
        <div class="arow" data-id="${escapeHtml(app.id)}">
          ${renderIcon(app)}
          <div class="arow-main">
            <div class="arow-title">
              <strong>${escapeHtml(app.name)}</strong>
              <span class="state ${live ? 'is-live' : 'is-draft'}">${live ? 'Publicada' : 'Oculta'}</span>
              ${app.featured ? '<span class="badge">Destacada</span>' : ''}
            </div>
            <p class="arow-sub">${escapeHtml(app.tagline || 'Sin frase corta.')}</p>
            <div class="arow-meta">
              <span class="tag">v${escapeHtml(app.version || '1.0')}</span>
              <span class="tag">${formatBytes(app.size)}</span>
              <span class="tag">${downloadsText(app.downloads)}</span>
              <span class="tag">${escapeHtml(app.category)}</span>
              <span class="tag">${escapeHtml(app.versions.length)} ${app.versions.length === 1 ? 'versión' : 'versiones'}</span>
            </div>
          </div>
          <div class="arow-actions">
            <a class="btn btn-ghost" href="/app/${encodeURIComponent(app.slug)}" target="_blank" rel="noopener">Ver</a>
            <button class="btn btn-ghost" type="button" data-action="edit">Editar</button>
            <button class="btn btn-ghost" type="button" data-action="toggle">${live ? 'Ocultar' : 'Publicar'}</button>
            <button class="btn btn-danger" type="button" data-action="delete">Borrar</button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadApps() {
  try {
    const data = await api('/api/admin/apps');
    state.apps = data.apps || [];
    state.categories = data.categories || [];
    renderStats(data.stats || { apps: 0, published: 0, downloads: 0 });
    renderApps();
    renderCategoryOptions();
    if (state.editingId) {
      const app = findApp(state.editingId);
      if (app) refreshEditor(app);
      else closeEditor();
    }
  } catch (error) {
    if (error.status === 401) return showLogin('La sesión caducó. Vuelve a entrar.');
    toast(error.message || 'No se pudieron cargar las apps.', 'error');
  }
}

function findApp(id) {
  return state.apps.find((app) => app.id === id) || null;
}

function renderCategoryOptions() {
  const current = fields.category.value;
  fields.category.innerHTML = state.categories
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join('');
  if (current && state.categories.includes(current)) fields.category.value = current;
}

/* ---------------------------- editor ---------------------------- */

function setCreateMode(isCreate) {
  document.querySelectorAll('.create-only').forEach((el) => {
    el.hidden = !isCreate;
  });
  apkBox.hidden = !isCreate;
  versionsBox.hidden = isCreate;
  saveHint.textContent = isCreate ? 'Se publicará al guardar.' : 'Los cambios se aplican al instante.';
}

function clearApkInfo() {
  state.token = null;
  apkTokenInput.value = '';
  apkInfo.hidden = true;
  apkFile.value = '';
  dropTitle.textContent = 'Arrastra aquí el APK';
  dropSub.textContent = 'o toca para elegir el archivo · máximo 250 MB';
  apkDrop.classList.remove('is-busy');
}

function resetEditor() {
  appForm.reset();
  appIdInput.value = '';
  state.editingId = null;
  state.removeShots = [];
  state.newShots = [];
  state.currentScreenshots = [];
  for (const url of state.shotUrls) URL.revokeObjectURL(url);
  state.shotUrls = [];
  thumbs.innerHTML = '';
  clearApkInfo();
  fields.featured.checked = false;
  fields.published.checked = true;
  setCreateMode(true);
}

function openEditor(app, { scroll = true } = {}) {
  resetEditor();
  renderCategoryOptions();

  if (app) {
    state.editingId = app.id;
    appIdInput.value = app.id;
    editorTitle.textContent = `Editar ${app.name}`;
    editorSub.textContent = `${app.versions.length} ${app.versions.length === 1 ? 'versión publicada' : 'versiones publicadas'} · ${formatNumber(app.downloads)} descargas`;
    fields.name.value = app.name || '';
    fields.tagline.value = app.tagline || '';
    fields.description.value = app.description || '';
    fields.publisher.value = app.publisher || '';
    fields.package.value = app.packageName || '';
    if (state.categories.includes(app.category)) fields.category.value = app.category;
    fields.featured.checked = Boolean(app.featured);
    fields.published.checked = app.published !== false;
    setCreateMode(false);
    renderAdminVersions(app);
    renderThumbs(app.screenshots || []);
  } else {
    editorTitle.textContent = 'Nueva app';
    editorSub.textContent = 'Sube un APK y la tienda rellena lo que puede por ti.';
    fields.publisher.value = 'The SilverShop';
  }

  appForm.hidden = false;
  if (scroll) appForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function refreshEditor(app) {
  if (!app) return;
  editorTitle.textContent = `Editar ${app.name}`;
  editorSub.textContent = `${app.versions.length} ${app.versions.length === 1 ? 'versión publicada' : 'versiones publicadas'} · ${formatNumber(app.downloads)} descargas`;
  renderAdminVersions(app);
  renderThumbs(app.screenshots || []);
}

function closeEditor() {
  appForm.hidden = true;
  resetEditor();
}

function renderThumbs(existing = []) {
  const kept = existing.filter((url) => !state.removeShots.includes(url));
  const existingHtml = kept
    .map(
      (url) => `
      <div class="thumb">
        <img src="${escapeHtml(url)}" alt="Captura">
        <button type="button" data-remove-shot="${escapeHtml(url)}" aria-label="Quitar captura">×</button>
      </div>`,
    )
    .join('');

  const newHtml = state.newShots
    .map((file, index) => {
      if (!state.shotUrls[index]) state.shotUrls[index] = URL.createObjectURL(file);
      return `
        <div class="thumb">
          <img src="${state.shotUrls[index]}" alt="Captura nueva">
          <button type="button" data-remove-new="${index}" aria-label="Quitar captura nueva">×</button>
        </div>`;
    })
    .join('');

  thumbs.innerHTML = existingHtml + newHtml;
}

thumbs.addEventListener('click', (event) => {
  const removeExisting = event.target.closest('[data-remove-shot]');
  if (removeExisting) {
    state.removeShots.push(removeExisting.dataset.removeShot);
    renderThumbs(state.currentScreenshots || []);
    return;
  }
  const removeNew = event.target.closest('[data-remove-new]');
  if (removeNew) {
    const index = Number(removeNew.dataset.removeNew);
    URL.revokeObjectURL(state.shotUrls[index]);
    state.shotUrls.splice(index, 1);
    state.newShots.splice(index, 1);
    renderThumbs(state.currentScreenshots || []);
  }
});

/* ------------------------- analizar el APK ----------------------- */

function showApkInfo(info) {
  apkInfo.hidden = false;
  apkIcon.src = info.icon || '/assets/placeholder.svg';
  apkName.textContent = info.name || 'APK cargado';
  apkMeta.textContent = [
    info.versionName ? `v${info.versionName}` : null,
    info.packageName || null,
    formatBytes(info.size),
    info.minSdk ? `Android SDK ${info.minSdk}+` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  apkHash.textContent = info.sha256 ? `SHA-256 ${info.sha256.slice(0, 24)}…` : '';
  dropTitle.textContent = 'APK listo';
  dropSub.textContent = 'Puedes cambiarlo eligiendo otro archivo.';
}

async function inspect(file) {
  if (!file) return;
  if (!/\.apk$/i.test(file.name)) {
    toast('El archivo debe ser un .apk', 'error');
    return;
  }
  apkDrop.classList.add('is-busy');
  dropTitle.textContent = 'Analizando APK…';
  dropSub.textContent = 'Leyendo paquete, versión e icono.';

  const body = new FormData();
  body.append('apk', file);

  try {
    const info = await api('/api/admin/inspect', { method: 'POST', body });
    state.token = info.token;
    apkTokenInput.value = info.token;
    showApkInfo(info);
    if (!fields.name.value) fields.name.value = info.name || '';
    if (!fields.package.value) fields.package.value = info.packageName || '';
    if (!fields.version.value) fields.version.value = info.versionName || '';
    if (!fields.description.value && info.name) {
      fields.description.value = `Qué es ${info.name} y para quién es.\n\n- Punto fuerte\n- Otro punto fuerte`;
    }
    if (!info.aaptFound) {
      toast('No encontré aapt; rellena nombre y versión a mano.', 'error');
    }
  } catch (error) {
    toast(error.message || 'No se pudo leer el APK.', 'error');
    dropTitle.textContent = 'Arrastra aquí el APK';
    dropSub.textContent = 'o toca para elegir el archivo · máximo 250 MB';
  } finally {
    apkDrop.classList.remove('is-busy');
  }
}

apkFile.addEventListener('change', () => {
  const file = apkFile.files && apkFile.files[0];
  if (file) inspect(file);
});

apkDrop.addEventListener('dragover', (event) => {
  event.preventDefault();
  apkDrop.classList.add('is-drag');
});
apkDrop.addEventListener('dragleave', () => apkDrop.classList.remove('is-drag'));
apkDrop.addEventListener('drop', (event) => {
  event.preventDefault();
  apkDrop.classList.remove('is-drag');
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) inspect(file);
});

apkClear.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  clearApkInfo();
});

fields.screenshots.addEventListener('change', () => {
  for (const file of fields.screenshots.files) state.newShots.push(file);
  fields.screenshots.value = '';
  renderThumbs(state.currentScreenshots || []);
});

/* ---------------------------- guardar --------------------------- */

function setBusy(button, busy, text) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

appForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const creating = !state.editingId;
  const apkReady = state.token || (apkFile.files && apkFile.files[0]);
  if (creating && !apkReady) {
    toast('Elige un APK antes de guardar.', 'error');
    return;
  }
  if (!fields.name.value.trim()) {
    toast('La app necesita un nombre.', 'error');
    fields.name.focus();
    return;
  }

  const body = new FormData();
  body.set('name', fields.name.value.trim());
  body.set('tagline', fields.tagline.value.trim());
  body.set('category', fields.category.value);
  body.set('publisher', fields.publisher.value.trim());
  body.set('packageName', fields.package.value.trim());
  body.set('description', fields.description.value);
  body.set('featured', fields.featured.checked ? 'true' : 'false');
  body.set('published', fields.published.checked ? 'true' : 'false');

  if (creating) {
    body.set('versionName', fields.version.value.trim());
    body.set('changelog', fields.changelog.value.trim());
    if (state.token) body.set('token', state.token);
    else body.append('apk', apkFile.files[0]);
  } else {
    body.set('removeScreenshots', JSON.stringify(state.removeShots));
  }

  if (fields.icon.files[0]) body.set('icon', fields.icon.files[0]);
  for (const shot of state.newShots) body.append('screenshots', shot);

  const endpoint = creating ? '/api/admin/apps' : `/api/admin/apps/${state.editingId}`;
  setBusy(saveBtn, true, creating ? 'Publicando…' : 'Guardando…');

  try {
    const data = await api(endpoint, { method: 'POST', body });
    toast(creating ? 'App publicada en la tienda' : 'Cambios guardados');
    state.editingId = data.app.id;
    await loadApps();
    if (creating) closeEditor();
    else openEditor(findApp(data.app.id), { scroll: false });
  } catch (error) {
    toast(error.message || 'No se pudo guardar.', 'error');
  } finally {
    setBusy(saveBtn, false);
  }
});

/* ---------------------------- versiones ------------------------- */

function renderAdminVersions(app) {
  state.currentScreenshots = app.screenshots || [];
  const html = app.versions
    .map(
      (version) => `
      <div class="version" data-version="${escapeHtml(version.id)}">
        <div>
          <div class="version-title">
            <strong>v${escapeHtml(version.versionName || '1.0')}</strong>
            <span class="when">${escapeHtml(formatDate(version.uploadedAt))}</span>
            <span class="when">· ${formatNumber(version.downloads || 0)} descargas</span>
          </div>
          ${version.changelog ? `<p class="version-note">${escapeHtml(version.changelog)}</p>` : ''}
        </div>
        <span class="version-size">${formatBytes(version.size)}</span>
        <button class="icon-btn" type="button" data-del-version="${escapeHtml(version.id)}"
                aria-label="Borrar versión ${escapeHtml(version.versionName)}"
                ${app.versions.length <= 1 ? 'disabled style="opacity:.35;pointer-events:none"' : ''}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 7h14M9.5 7V5.5h5V7M7 7l.8 12h8.4L17 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>`,
    )
    .join('');
  adminVersions.innerHTML = html;
}

adminVersions.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-del-version]');
  if (!button || !state.editingId) return;
  const versionId = button.dataset.delVersion;
  const app = findApp(state.editingId);
  if (!app) return;
  const version = app.versions.find((v) => v.id === versionId);
  if (!version) return;
  if (!confirm(`¿Borrar la versión ${version.versionName}? El archivo APK se elimina del servidor.`)) return;

  button.disabled = true;
  try {
    await api(`/api/admin/apps/${state.editingId}/versions/${versionId}`, { method: 'DELETE' });
    toast('Versión eliminada');
    await loadApps();
  } catch (error) {
    toast(error.message || 'No se pudo borrar la versión.', 'error');
    button.disabled = false;
  }
});

addVersionBtn.addEventListener('click', async () => {
  if (!state.editingId) return;
  const file = $('v-apk').files && $('v-apk').files[0];
  if (!file) {
    toast('Elige el APK de la nueva versión.', 'error');
    return;
  }
  const body = new FormData();
  body.append('apk', file);
  body.set('versionName', $('v-name').value.trim());
  body.set('changelog', $('v-changelog').value.trim());

  setBusy(addVersionBtn, true, 'Subiendo…');
  try {
    await api(`/api/admin/apps/${state.editingId}/versions`, { method: 'POST', body });
    toast('Versión publicada');
    $('v-apk').value = '';
    $('v-name').value = '';
    $('v-changelog').value = '';
    await loadApps();
  } catch (error) {
    toast(error.message || 'No se pudo subir la versión.', 'error');
  } finally {
    setBusy(addVersionBtn, false);
  }
});

/* ---------------------------- acciones -------------------------- */

appsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const row = button.closest('.arow');
  const app = row && findApp(row.dataset.id);
  if (!app) return;

  if (button.dataset.action === 'edit') {
    openEditor(app);
    return;
  }

  if (button.dataset.action === 'toggle') {
    button.disabled = true;
    try {
      await api(`/api/admin/apps/${app.id}`, {
        method: 'POST',
        body: { published: app.published === false },
      });
      toast(app.published === false ? 'App publicada' : 'App oculta de la tienda');
      await loadApps();
    } catch (error) {
      toast(error.message || 'No se pudo cambiar la visibilidad.', 'error');
      button.disabled = false;
    }
    return;
  }

  if (button.dataset.action === 'delete') {
    if (!confirm(`¿Borrar «${app.name}» con todas sus versiones? Esta acción no se puede deshacer.`)) return;
    button.disabled = true;
    try {
      await api(`/api/admin/apps/${app.id}`, { method: 'DELETE' });
      toast('App borrada');
      if (state.editingId === app.id) closeEditor();
      await loadApps();
    } catch (error) {
      toast(error.message || 'No se pudo borrar la app.', 'error');
      button.disabled = false;
    }
  }
});

$('new-app-btn').addEventListener('click', () => openEditor(null));
$('admin-empty-btn').addEventListener('click', () => openEditor(null));
$('close-editor').addEventListener('click', () => closeEditor());

/* Filas rapidas para el selector de categorias al iniciar */
api('/api/admin/session')
  .then((data) => {
    if (data.admin) showPanel();
    else showLogin();
  })
  .catch(() => showLogin('No se pudo conectar con el servidor.'));
