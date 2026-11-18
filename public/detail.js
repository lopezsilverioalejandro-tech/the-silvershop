'use strict';

import {
  api,
  androidName,
  bindSearchShortcut,
  copyText,
  descriptionHtml,
  downloadUrl,
  downloadsText,
  escapeHtml,
  formatBytes,
  formatDate,
  formatNumber,
  renderIcon,
  timeAgo,
  toast,
} from './common.js';

const root = document.getElementById('app-root');
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

const pathSlug = decodeURIComponent(
  (location.pathname.match(/^\/app\/([^/?#]+)/) || [])[1] || '',
);
const slug = pathSlug || new URLSearchParams(location.search).get('app') || '';

function errorPage(message) {
  root.innerHTML = `
    <div class="error-page">
      <p class="eyebrow">Fuera de catálogo</p>
      <h1>Esa app no está aquí</h1>
      <p>${escapeHtml(message || 'Puede que se haya retirado o que el enlace esté mal escrito.')}</p>
      <a class="btn btn-primary" href="/">Volver a la tienda</a>
    </div>
  `;
}

function specRow(label, value) {
  if (!value) return '';
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function versionRow(appId, version, isLatest) {
  return `
    <div class="version">
      <div>
        <div class="version-title">
          <strong>v${escapeHtml(version.versionName || '1.0')}</strong>
          ${isLatest ? '<span class="badge">Última</span>' : ''}
          <span class="when">${escapeHtml(formatDate(version.uploadedAt))}</span>
        </div>
        ${version.changelog ? `<p class="version-note">${escapeHtml(version.changelog)}</p>` : ''}
      </div>
      <span class="version-size">${formatBytes(version.size)}</span>
      <a class="icon-btn" href="${downloadUrl(appId, version.id)}"
         title="Descargar v${escapeHtml(version.versionName || '1.0')}"
         aria-label="Descargar versión ${escapeHtml(version.versionName || '1.0')}">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  `;
}

function render(app) {
  document.title = `${app.name} — The SilverShop`;
  const latest = app.versions[0];
  const minAndroid = androidName(app.minSdk);
  const downloadHref = downloadUrl(app.id, latest.id);

  const screenshots = app.screenshots && app.screenshots.length
    ? `
      <section class="content-block">
        <h2>Capturas</h2>
        <div class="shots">
          ${app.screenshots
            .map(
              (shot, index) => `
              <button class="shot" type="button" data-shot="${escapeHtml(shot)}" aria-label="Ampliar captura ${index + 1}">
                <img src="${escapeHtml(shot)}" alt="Captura ${index + 1} de ${escapeHtml(app.name)}" loading="lazy">
              </button>`,
            )
            .join('')}
        </div>
      </section>`
    : '';

  const versions = app.versions.length
    ? `
      <section class="content-block">
        <h2>Versiones</h2>
        <div class="versions">
          ${app.versions.map((v, i) => versionRow(app.id, v, i === 0)).join('')}
        </div>
      </section>`
    : '';

  root.innerHTML = `
    <a class="crumbs" href="/">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Volver a la tienda
    </a>

    <div class="detail">
      <header class="app-head">
        ${renderIcon(app)}
        <div>
          <h1>${escapeHtml(app.name)}</h1>
          <p class="app-tagline">${escapeHtml(app.tagline || 'Sin descripción todavía.')}</p>
          <p class="app-by">por <strong>${escapeHtml(app.publisher || 'The SilverShop')}</strong>${app.featured ? ' · <span class="badge">Destacada</span>' : ''}</p>
          <div class="app-meta-row">
            <span class="tag">${escapeHtml(app.category)}</span>
            <span class="tag">v${escapeHtml(app.version || '1.0')}</span>
            <span class="tag">${formatBytes(app.size)}</span>
            <span class="tag">${downloadsText(app.downloads)}</span>
          </div>
        </div>
      </header>

      <aside>
        <div class="panel install-panel">
          <div>
            <p class="eyebrow">Descarga</p>
            <h2 style="margin-top:8px;font-size:20px;letter-spacing:-.02em;text-transform:none;color:var(--text)">v${escapeHtml(app.version || '1.0')}</h2>
            <p class="muted small" style="margin-top:4px">APK · ${formatBytes(app.size)} · ${escapeHtml(formatDate(app.uploadedAt))}</p>
          </div>
          <a class="btn btn-primary btn-block" href="${downloadHref}" download>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Descargar APK
          </a>
          <p class="hint">Comprobado con SHA-256 antes de publicarse.</p>

          <dl class="spec">
            ${specRow('Versión', `v${app.version || '1.0'} (${app.versionCode || '—'})`)}
            ${specRow('Tamaño', formatBytes(app.size))}
            ${specRow('Android mínimo', minAndroid || (app.minSdk ? `SDK ${app.minSdk}` : '—'))}
            ${specRow('Paquete', app.packageName || '—')}
            ${specRow('Actualizada', timeAgo(app.updatedAt))}
            ${specRow('Descargas', formatNumber(app.downloads))}
          </dl>

          ${latest.sha256 ? `
          <div>
            <p class="muted small" style="margin-bottom:6px">Huella SHA-256</p>
            <div class="hash">
              <code title="${escapeHtml(latest.sha256)}">${escapeHtml(latest.sha256)}</code>
              <button type="button" id="copy-hash" aria-label="Copiar SHA-256">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" stroke-width="1.7"/>
                  <path d="M15 6.5V5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H7" stroke="currentColor" stroke-width="1.7"/>
                </svg>
              </button>
            </div>
          </div>` : ''}
        </div>
      </aside>

      <div class="detail-main">
        <section class="content-block panel">
          <h2>Sobre esta app</h2>
          <div class="description">${descriptionHtml(app.description)}</div>
        </section>

        ${screenshots}
        ${versions}

        <section class="install-help">
          <strong>¿Primera vez instalando un APK?</strong>
          <ol>
            <li>Descarga el archivo y ábrelo desde las notificaciones o desde Descargas.</li>
            <li>Cuando Android lo pida, permite instalar apps desde esa aplicación.</li>
            <li>Toca <strong>Instalar</strong>. Tus datos se conservan al actualizar.</li>
          </ol>
        </section>
      </div>
    </div>
  `;

  const copyButton = document.getElementById('copy-hash');
  if (copyButton && latest.sha256) {
    copyButton.addEventListener('click', async () => {
      const ok = await copyText(latest.sha256);
      toast(ok ? 'SHA-256 copiado' : 'No se pudo copiar', ok ? 'ok' : 'error');
    });
  }

  const dialog = document.getElementById('shot-dialog');
  const image = document.getElementById('shot-image');
  for (const shot of root.querySelectorAll('[data-shot]')) {
    shot.addEventListener('click', () => {
      image.src = shot.dataset.shot;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else window.open(shot.dataset.shot, '_blank', 'noopener');
    });
  }
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

async function load() {
  if (!slug) {
    errorPage('No se indicó ninguna app.');
    return;
  }
  try {
    const app = await api(`/api/apps/${encodeURIComponent(slug)}`);
    render(app);
  } catch (error) {
    errorPage(error.status === 404 ? 'Puede que se haya retirado o que el enlace esté mal escrito.' : 'No se pudo cargar la ficha. Inténtalo de nuevo.');
    console.error(error);
  }
}

const searchInput = document.getElementById('q');
if (searchInput) {
  searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const value = searchInput.value.trim();
    location.href = value ? `/?q=${encodeURIComponent(value)}` : '/';
  });
}

bindSearchShortcut();
load();
