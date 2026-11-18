'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');
const store = require('../store');
const lib = require('../library');
const apk = require('../apk');
const auth = require('../auth');
const { upload } = require('../upload');

const router = express.Router();

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Barrera CSRF: las peticiones del panel deben llevar esta cabecera. */
router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (req.get('x-requested-with') !== 'silvershop') {
      return res.status(403).json({ error: 'Peticion no valida.' });
    }
  }
  next();
});

async function cleanup(files) {
  const list = [];
  if (Array.isArray(files)) list.push(...files);
  else if (files) {
    for (const value of Object.values(files)) {
      if (Array.isArray(value)) list.push(...value);
      else list.push(value);
    }
  }
  for (const file of list) {
    if (file && file.path) {
      try {
        await fs.promises.unlink(file.path);
      } catch {}
    }
  }
}

function resolveApk(req) {
  const uploaded = req.files && req.files.apk && req.files.apk[0];
  if (uploaded) return uploaded.path;
  const token = String((req.body && req.body.token) || '');
  if (!/^[\w.-]+\.apk$/i.test(token)) return null;
  const candidate = path.join(config.TMP_DIR, path.basename(token));
  if (!fs.existsSync(candidate)) return null;
  return candidate;
}

/* ------------------------------ sesion ------------------------------ */

router.post('/api/admin/login', (req, res) => {
  const ip = req.ip || 'local';
  const rate = auth.checkLoginRate(ip);
  if (!rate.ok) {
    return res
      .status(429)
      .json({ error: `Demasiados intentos. Prueba en ${Math.ceil(rate.retryIn / 60)} minutos.` });
  }
  const password = String((req.body && req.body.password) || '');
  if (!password || !auth.safeEqual(password, config.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Contrasena incorrecta.' });
  }
  auth.resetLoginRate(ip);
  auth.createSession(res);
  res.json({ ok: true });
});

router.post('/api/admin/logout', (req, res) => {
  auth.destroySession(res);
  res.json({ ok: true });
});

router.get('/api/admin/session', (req, res) => {
  res.json({ admin: auth.isAdmin(req) });
});

/* --------------------------- subir / editar -------------------------- */

router.use('/api/admin', auth.requireAdmin);

router.get('/api/admin/apps', (_req, res) => {
  const apps = [...store.read().apps].sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
  );
  res.json({
    apps: apps.map(lib.adminApp).filter(Boolean),
    categories: lib.CATEGORIES,
    stats: {
      apps: apps.length,
      published: apps.filter((a) => a.published !== false).length,
      downloads: apps.reduce((sum, a) => sum + lib.totalDownloads(a), 0),
    },
  });
});

/** Analiza un APK antes de guardarlo (nombre, version, icono...). */
router.post(
  '/api/admin/inspect',
  upload.single('apk'),
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Selecciona un APK.' });
    try {
      if (!(await apk.looksLikeApk(req.file.path))) {
        throw new Error('El archivo no parece un APK valido.');
      }
      const info = await apk.inspectApk(req.file.path);
      let icon = null;
      if (info.iconPaths && info.iconPaths.length) {
        const previewName = `preview-${crypto.randomBytes(4).toString('hex')}`;
        const extracted = await apk.extractIcon(
          req.file.path,
          config.TMP_DIR,
          previewName,
          info.iconPaths,
        );
        if (extracted) {
          const data = await fs.promises.readFile(extracted.file);
          const mime = extracted.ext === '.webp' ? 'image/webp' : 'image/png';
          icon = `data:${mime};base64,${data.toString('base64')}`;
          await fs.promises.unlink(extracted.file).catch(() => {});
        }
      }
      res.json({
        token: path.basename(req.file.path),
        name: info.label,
        packageName: info.packageName,
        versionName: info.versionName,
        versionCode: info.versionCode,
        minSdk: info.minSdk,
        targetSdk: info.targetSdk,
        size: info.size,
        sha256: info.sha256,
        icon,
        aaptFound: info.aaptFound,
      });
    } catch (err) {
      await cleanup(req.file);
      res.status(400).json({ error: err.message });
    }
  }),
);

router.post(
  '/api/admin/apps',
  upload.fields([
    { name: 'apk', maxCount: 1 },
    { name: 'icon', maxCount: 1 },
    { name: 'screenshots', maxCount: 8 },
  ]),
  asyncRoute(async (req, res) => {
    const apkPath = resolveApk(req);
    try {
      if (!apkPath) throw new Error('Falta el archivo APK.');
      const app = await lib.createApp({
        fields: req.body || {},
        apkPath,
        iconPath: req.files?.icon?.[0] ? req.files.icon[0].path : null,
        screenshotPaths: (req.files?.screenshots || []).map((f) => f.path),
      });
      res.status(201).json({ app: lib.adminApp(app) });
    } catch (err) {
      await cleanup(req.files);
      res.status(400).json({ error: err.message });
    }
  }),
);

router.post(
  '/api/admin/apps/:id',
  upload.fields([
    { name: 'icon', maxCount: 1 },
    { name: 'screenshots', maxCount: 8 },
  ]),
  asyncRoute(async (req, res) => {
    try {
      let removeScreenshots = [];
      try {
        removeScreenshots = JSON.parse((req.body && req.body.removeScreenshots) || '[]');
      } catch {}
      const app = await lib.updateApp(req.params.id, {
        fields: req.body || {},
        iconPath: req.files?.icon?.[0] ? req.files.icon[0].path : null,
        screenshotPaths: (req.files?.screenshots || []).map((f) => f.path),
        removeScreenshots: Array.isArray(removeScreenshots) ? removeScreenshots : [],
      });
      res.json({ app: lib.adminApp(app) });
    } catch (err) {
      await cleanup(req.files);
      res.status(400).json({ error: err.message });
    }
  }),
);

router.post(
  '/api/admin/apps/:id/versions',
  upload.fields([{ name: 'apk', maxCount: 1 }]),
  asyncRoute(async (req, res) => {
    const apkPath = resolveApk(req);
    try {
      if (!apkPath) throw new Error('Falta el archivo APK.');
      const app = await lib.addVersion(req.params.id, {
        apkPath,
        fields: req.body || {},
      });
      res.status(201).json({ app: lib.adminApp(app) });
    } catch (err) {
      await cleanup(req.files);
      res.status(400).json({ error: err.message });
    }
  }),
);

router.delete('/api/admin/apps/:id', asyncRoute(async (req, res) => {
  await lib.deleteApp(req.params.id);
  res.json({ ok: true });
}));

router.delete('/api/admin/apps/:id/versions/:versionId', asyncRoute(async (req, res) => {
  await lib.deleteVersion(req.params.id, req.params.versionId);
  res.json({ ok: true });
}));

module.exports = router;
