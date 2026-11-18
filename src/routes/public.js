'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const seo = require('../seo');
const store = require('../store');
const lib = require('../library');

const router = express.Router();

/* Archivos para buscadores */
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(seo.robots(req));
});

router.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(seo.sitemap(req));
});

/* Catalogo publico */
router.get('/api/apps', (req, res) => {
  res.json(lib.listPublicApps(req.query));
});

router.get('/api/apps/:slug', (req, res) => {
  const app = store.read().apps.find(
    (a) => a.slug === req.params.slug && a.published !== false,
  );
  const detail = app ? lib.appDetail(app) : null;
  if (!detail) return res.status(404).json({ error: 'Esa app no existe o no esta publicada.' });
  res.json(detail);
});

router.get('/api/stats', (_req, res) => {
  const apps = store.read().apps.filter((a) => a.published !== false && a.versions.length);
  res.json({
    apps: apps.length,
    downloads: apps.reduce((sum, a) => sum + lib.totalDownloads(a), 0),
    lastUpdate: apps
      .map((a) => a.updatedAt)
      .filter(Boolean)
      .sort()
      .pop() || null,
  });
});

/* Descarga de APK: cuenta la descarga y sirve el archivo */
router.get('/download/:appId/:versionId', async (req, res) => {
  const found = lib.findVersion(req.params.appId, req.params.versionId);
  if (!found) return res.status(404).send('APK no encontrado.');

  const { app, version, file } = found;
  if (!fs.existsSync(file)) return res.status(410).send('El archivo ya no esta disponible.');

  lib.registerDownload(app.id, version.id);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const safeName = `${lib.slugify(app.name)}-${String(version.versionName || 'app')
    .replace(/[^\w.]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'app'}.apk`;
  res.download(file, safeName, (err) => {
    if (err && !res.headersSent) res.status(500).end();
  });
});

/* Respuesta corta para el boton "descargar la ultima" */
router.get('/download/:appId', (req, res) => {
  const app = store.read().apps.find(
    (a) => a.id === req.params.appId && a.published !== false,
  );
  const latest = app && lib.latestVersion(app);
  if (!app || !latest) return res.status(404).send('APK no encontrado.');
  res.redirect(302, `/download/${app.id}/${latest.id}`);
});

module.exports = router;
