'use strict';

/** Utilidades compartidas por la tienda y el panel. */
export const CATEGORY_FALLBACK = 'Otras';

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('es-ES').format(Number(value) || 0);
}

export function downloadsText(value) {
  const count = Number(value) || 0;
  return `${formatNumber(count)} ${count === 1 ? 'descarga' : 'descargas'}`;
}

export function formatDate(iso, style = 'short') {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: style === 'short' ? 'short' : 'long',
    year: 'numeric',
  }).format(date);
}

export function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!then) return '';
  const diff = Date.now() - then;
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
}

export function androidName(sdk) {
  const map = {
    21: 'Android 5.0',
    22: 'Android 5.1',
    23: 'Android 6.0',
    24: 'Android 7.0',
    25: 'Android 7.1',
    26: 'Android 8.0',
    27: 'Android 8.1',
    28: 'Android 9',
    29: 'Android 10',
    30: 'Android 11',
    31: 'Android 12',
    32: 'Android 12L',
    33: 'Android 13',
    34: 'Android 14',
    35: 'Android 15',
    36: 'Android 16',
  };
  if (!sdk) return null;
  return map[Number(sdk)] || `Android SDK ${sdk}`;
}

export function iconFallback(name) {
  const initial = String(name || '?').trim().charAt(0).toUpperCase();
  let hash = 0;
  for (const char of String(name || '')) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  const hue = hash;
  return { initial, hue };
}

export function renderIcon(app, className = 'app-icon') {
  if (app.icon) {
    return `<span class="${className}"><img src="${escapeHtml(app.icon)}" alt="" loading="lazy" width="72" height="72"></span>`;
  }
  const { initial, hue } = iconFallback(app.name);
  return `<span class="${className} app-icon-fallback" style="--hue:${hue}">${escapeHtml(initial)}</span>`;
}

export async function api(url, options = {}) {
  const headers = { 'X-Requested-With': 'silvershop', ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  let data = null;
  try {
    data = await response.json();
  } catch {}
  if (!response.ok) {
    const error = new Error((data && data.error) || `Error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export function toast(message, kind = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast is-visible ${kind === 'error' ? 'is-error' : ''}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    el.className = 'toast';
  }, 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function downloadUrl(appId, versionId) {
  return versionId ? `/download/${appId}/${versionId}` : `/download/${appId}`;
}

export function descriptionHtml(text) {
  const raw = String(text || '').trim();
  if (!raw) return '<p class="muted">Esta app todavía no tiene descripción.</p>';

  const blocks = [];
  const lines = raw.split('\n');
  let list = null;

  const flush = () => {
    if (list) {
      blocks.push(`<ul>${list.join('')}</ul>`);
      list = null;
    }
  };

  for (const line of lines) {
    const clean = line.trim();
    if (!clean) {
      flush();
      continue;
    }
    const bullet = /^[-•*]\s+(.*)$/.exec(clean);
    if (bullet) {
      if (!list) list = [];
      list.push(`<li>${escapeHtml(bullet[1])}</li>`);
      continue;
    }
    flush();
    if (/^#{2,3}\s+/.test(clean)) {
      blocks.push(`<h3>${escapeHtml(clean.replace(/^#{2,3}\s+/, ''))}</h3>`);
    } else {
      blocks.push(`<p>${escapeHtml(clean)}</p>`);
    }
  }
  flush();
  return blocks.join('');
}

/** Mantiene el foco del buscador con la tecla "/". */
export function bindSearchShortcut() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = (event.target && event.target.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    const input = document.getElementById('q');
    if (input) {
      event.preventDefault();
      input.focus();
    }
  });
}
