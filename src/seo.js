'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const store = require('./store');
const lib = require('./library');

const PUBLIC_DIR = path.join(config.ROOT, 'public');
const SITE_NAME = 'The SilverShop';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function truncate(text, max) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > max * 0.6 ? space : max - 1).trimEnd()}…`;
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** URL publica del sitio. Usa PUBLIC_URL cuando existe (produccion). */
function baseUrl(req) {
  if (config.PUBLIC_URL) return config.PUBLIC_URL;
  const host = (req && req.get('host')) || `localhost:${config.PORT}`;
  const protocol = (req && req.protocol) || 'http';
  return `${protocol}://${host}`;
}

function absolute(base, url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function readTemplate(file) {
  return fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
}

function jsonLd(data, nonce) {
  return `<script type="application/ld+json"${nonce ? ` nonce="${escapeHtml(nonce)}"` : ''}>${JSON.stringify(data)}</script>`;
}

function verificationTag() {
  if (!config.GOOGLE_SITE_VERIFICATION) return '';
  return `<meta name="google-site-verification" content="${escapeHtml(config.GOOGLE_SITE_VERIFICATION)}">`;
}

function homeSeo(req, nonce) {
  const base = baseUrl(req);
  const title = 'The SilverShop — Tienda de apps APK para Android';
  const description =
    'The SilverShop (The Silver Shop): tienda independiente de apps Android. Descarga APK verificados con SHA-256, sin cuentas ni anuncios.';
  const db = store.read();
  const published = db.apps.filter((app) => app.published !== false && lib.latestVersion(app));

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        alternateName: ['The Silver Shop', 'SilverShop'],
        url: `${base}/`,
        description,
        inLanguage: 'es',
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${base}/?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'OnlineStore',
        name: SITE_NAME,
        url: `${base}/`,
        logo: `${base}/assets/favicon.svg`,
        description,
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Apps Android',
          itemListElement: published.map((app) => {
            const summary = lib.appSummary(app);
            return {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'SoftwareApplication',
                name: summary.name,
                operatingSystem: 'Android',
                applicationCategory: summary.category || 'Utilidades',
                url: `${base}/app/${summary.slug}`,
                softwareVersion: summary.version,
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
              },
            };
          }),
        },
      },
    ],
  };

  return `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${escapeHtml(`${base}/`)}">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="es_ES">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(`${base}/`)}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    ${verificationTag()}
    ${jsonLd(data, nonce)}
  `;
}

function appSeo(req, app, nonce) {
  const base = baseUrl(req);
  const summary = lib.appSummary(app);
  if (!summary) return '';
  const latest = lib.latestVersion(app);
  const url = `${base}/app/${summary.slug}`;
  const icon = absolute(base, summary.icon);
  const title = `${summary.name} — APK v${summary.version} para Android | ${SITE_NAME}`;
  const description = truncate(
    `${summary.tagline || `${summary.name} para Android`} Descarga el APK (${formatBytes(summary.size)}) gratis, verificado con SHA-256.`,
    158,
  );

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: summary.name,
        operatingSystem: 'Android',
        applicationCategory: summary.category || 'Utilidades',
        softwareVersion: summary.version,
        fileSize: formatBytes(summary.size),
        downloadUrl: `${base}/download/${summary.id}/${latest.id}`,
        installUrl: `${base}/download/${summary.id}/${latest.id}`,
        url,
        description: truncate(app.description || description, 320),
        image: icon || `${base}/assets/favicon.svg`,
        inLanguage: 'es',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
        },
        publisher: {
          '@type': 'Organization',
          name: summary.publisher || SITE_NAME,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: SITE_NAME,
            item: `${base}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: summary.name,
            item: url,
          },
        ],
      },
    ],
  };

  return `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${escapeHtml(url)}">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="es_ES">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(url)}">
    ${icon ? `<meta property="og:image" content="${escapeHtml(icon)}">` : ''}
    ${icon ? `<meta property="og:image:alt" content="Icono de ${escapeHtml(summary.name)}">` : ''}
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    ${icon ? `<meta name="twitter:image" content="${escapeHtml(icon)}">` : ''}
    ${verificationTag()}
    ${jsonLd(data, nonce)}
  `;
}

function inject(template, seo) {
  return template.replace('<!--SEO-->', seo);
}

function renderHome(req, nonce) {
  return inject(readTemplate('index.html'), homeSeo(req, nonce));
}

function renderApp(req, slug, nonce) {
  const app = store.read().apps.find(
    (item) => item.slug === slug && item.published !== false && lib.latestVersion(item),
  );
  if (!app) return null;
  return inject(readTemplate('app.html'), appSeo(req, app, nonce));
}

function robots(req) {
  const base = baseUrl(req);
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /download/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

function sitemap(req) {
  const base = baseUrl(req);
  const db = store.read();
  const apps = db.apps
    .filter((app) => app.published !== false && lib.latestVersion(app))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  const lastDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  };

  const urls = [
    `<url><loc>${escapeXml(`${base}/`)}</loc>${lastDate(apps[0] && apps[0].updatedAt) ? `<lastmod>${lastDate(apps[0].updatedAt)}</lastmod>` : ''}<changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...apps.map(
      (app) =>
        `<url><loc>${escapeXml(`${base}/app/${app.slug}`)}</loc>${lastDate(app.updatedAt) ? `<lastmod>${lastDate(app.updatedAt)}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    ),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

module.exports = {
  baseUrl,
  renderHome,
  renderApp,
  robots,
  sitemap,
};
