'use strict';

import {
  api,
  bindSearchShortcut,
  downloadUrl,
  downloadsText,
  escapeHtml,
  formatBytes,
  formatNumber,
  renderIcon,
  timeAgo,
} from './common.js';

const grid = document.getElementById('app-grid');
const empty = document.getElementById('empty');
const emptyText = document.getElementById('empty-text');
const chipsBox = document.getElementById('categories');
const searchInput = document.getElementById('q');
const sortSelect = document.getElementById('sort');

const state = { q: '', category: 'Todas', sort: 'recent' };
let categoriesRendered = false;
let requestId = 0;

function readUrl() {
  const params = new URLSearchParams(location.search);
  state.q = params.get('q') || '';
  state.category = params.get('categoria') || 'Todas';
  state.sort = params.get('orden') || 'recent';
  searchInput.value = state.q;
  sortSelect.value = state.sort;
}

function writeUrl() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category !== 'Todas') params.set('categoria', state.category);
  if (state.sort !== 'recent') params.set('orden', state.sort);
  const query = params.toString();
  history.replaceState(null, '', query ? `/?${query}` : '/');
}

function cardTemplate(app) {
  const meta = [
    `<span class="tag">${escapeHtml(app.category)}</span>`,
    `<span class="tag">v${escapeHtml(app.version || '1.0')}</span>`,
    `<span class="tag">${formatBytes(app.size)}</span>`,
  ].join('');

  return `
    <article class="card">
      <a class="card-link" href="/app/${encodeURIComponent(app.slug)}" aria-label="Ver ${escapeHtml(app.name)}"></a>
      <div class="card-top">
        ${renderIcon(app)}
        <a class="card-dl" href="${downloadUrl(app.id)}"
           data-download="${escapeHtml(app.id)}" title="Descargar ${escapeHtml(app.name)}" aria-label="Descargar ${escapeHtml(app.name)}">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </a>
      </div>
      <h3>${escapeHtml(app.name)}${app.featured ? '<span class="badge">Destacada</span>' : ''}</h3>
      <p class="card-tagline">${escapeHtml(app.tagline || 'Sin descripción todavía.')}</p>
      <div class="card-meta">${meta}</div>
      <div class="card-foot">
        <span class="downloads">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ${downloadsText(app.downloads)}
        </span>
        <span class="downloads">${escapeHtml(timeAgo(app.updatedAt))}</span>
      </div>
    </article>
  `;
}

function renderChips(categories) {
  if (categoriesRendered) return;
  categoriesRendered = true;
  const list = ['Todas', ...categories];
  chipsBox.innerHTML = list
    .map(
      (name) =>
        `<button class="chip${name === state.category ? ' is-active' : ''}" data-category="${escapeHtml(name)}" type="button">${escapeHtml(name)}</button>`,
    )
    .join('');
}

function renderGrid(apps) {
  if (!apps.length) {
    grid.innerHTML = '';
    grid.hidden = true;
    empty.hidden = false;
    emptyText.textContent = state.q
      ? `No hay resultados para «${state.q}». Prueba con otra palabra.`
      : 'Todavía no hay apps publicadas en esta categoría.';
    return;
  }
  grid.hidden = false;
  empty.hidden = true;
  grid.innerHTML = apps.map(cardTemplate).join('');
}

function updateStats(stats) {
  if (!stats) return;
  const apps = document.querySelector('[data-stat="apps"]');
  const downloads = document.querySelector('[data-stat="downloads"]');
  if (apps) apps.textContent = formatNumber(stats.totalApps ?? stats.apps ?? 0);
  if (downloads) downloads.textContent = formatNumber(stats.totalDownloads ?? stats.downloads ?? 0);
}

async function load({ silent = false } = {}) {
  const id = ++requestId;
  if (!silent) grid.classList.add('is-loading');

  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category && state.category !== 'Todas') params.set('category', state.category);
  params.set('sort', state.sort);

  try {
    const data = await api(`/api/apps?${params.toString()}`);
    if (id !== requestId) return;
    renderChips(data.categories || []);
    renderGrid(data.apps || []);
    updateStats(data.stats);
  } catch (error) {
    if (id !== requestId) return;
    grid.innerHTML = '';
    grid.hidden = true;
    empty.hidden = false;
    emptyText.textContent = 'No se pudo cargar la tienda. Recarga la página e inténtalo de nuevo.';
    console.error(error);
  } finally {
    if (id === requestId) grid.classList.remove('is-loading');
  }
}

function renderSkeletons() {
  grid.innerHTML = Array.from({ length: 6 })
    .map(
      () => `
      <div class="card skeleton">
        <div class="sk-icon"></div>
        <div class="sk-line w70"></div>
        <div class="sk-line w90"></div>
        <div class="sk-line w40"></div>
      </div>`,
    )
    .join('');
}

let debounce;
searchInput.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    state.q = searchInput.value.trim();
    writeUrl();
    load({ silent: true });
  }, 220);
});

sortSelect.addEventListener('change', () => {
  state.sort = sortSelect.value;
  writeUrl();
  load();
});

chipsBox.addEventListener('click', (event) => {
  const button = event.target.closest('.chip');
  if (!button) return;
  state.category = button.dataset.category || 'Todas';
  for (const chip of chipsBox.querySelectorAll('.chip')) {
    chip.classList.toggle('is-active', chip === button);
  }
  writeUrl();
  load();
});

document.getElementById('clear-filters').addEventListener('click', () => {
  state.q = '';
  state.category = 'Todas';
  state.sort = 'recent';
  searchInput.value = '';
  sortSelect.value = 'recent';
  chipsBox.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.category === 'Todas');
  });
  writeUrl();
  load();
});

/* Descarga rapida desde la tarjeta (sin entrar en la ficha) */
grid.addEventListener('click', (event) => {
  const target = event.target.closest('[data-download]');
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  window.location.href = `/download/${target.dataset.download}`;
});

window.addEventListener('scroll', () => {
  document.querySelector('.topbar').classList.toggle('is-stuck', window.scrollY > 8);
}, { passive: true });

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

bindSearchShortcut();
readUrl();
renderSkeletons();
load();
if (state.category !== 'Todas' || state.q) writeUrl();
