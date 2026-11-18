'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const store = require('./store');
const apk = require('./apk');

const CATEGORIES = [
  'Productividad',
  'Estudio',
  'Herramientas',
  'Multimedia',
  'Juegos',
  'Utilidades',
  'Salud',
  'Otras',
];

const newId = () => crypto.randomBytes(5).toString('hex');

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function uniqueSlug(db, base, skipId) {
  const clean = slugify(base) || 'app';
  const used = new Set(db.apps.filter((a) => a.id !== skipId).map((a) => a.slug));
  if (!used.has(clean)) return clean;
  let n = 2;
  while (used.has(`${clean}-${n}`)) n += 1;
  return `${clean}-${n}`;
}

function cleanText(value, max = 4000) {
  if (value == null) return '';
  return String(value).replace(/\r\n/g, '\n').trim().slice(0, max);
}

function bool(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function sanitizeCategory(value) {
  const text = cleanText(value, 40);
  return CATEGORIES.includes(text) ? text : text || 'Otras';
}

async function removeQuiet(target) {
  try {
    await fs.promises.rm(target, { recursive: true, force: true });
  } catch {}
}

/* ---------------------------- imagenes ---------------------------- */

function imageExtension(buffer) {
  if (buffer.length > 8 && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return '.png';
  }
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }
  if (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return '.webp';
  }
  if (buffer.length > 6 && buffer.subarray(0, 4).toString('ascii') === 'GIF8') {
    return '.gif';
  }
  return null;
}

/** Copia una imagen validando su firma real, no solo la extension. */
async function storeImage(source, destDir, urlPrefix, baseName) {
  const buffer = await fs.promises.readFile(source);
  if (buffer.length > config.MAX_IMAGE_MB * 1024 * 1024) {
    throw new Error(`La imagen supera los ${config.MAX_IMAGE_MB} MB.`);
  }
  const ext = imageExtension(buffer);
  if (!ext) throw new Error('El archivo no es una imagen compatible (PNG, JPG, WEBP o GIF).');
  const name = `${baseName}${ext}`;
  await fs.promises.writeFile(path.join(destDir, name), buffer);
  return `${urlPrefix}/${name}`;
}

/* ---------------------------- lectura ---------------------------- */

function latestVersion(app) {
  return app.versions && app.versions.length ? app.versions[0] : null;
}

function totalDownloads(app) {
  return (app.versions || []).reduce((sum, v) => sum + (v.downloads || 0), 0);
}

function appSummary(app) {
  const latest = latestVersion(app);
  if (!latest) return null;
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    tagline: app.tagline,
    category: app.category,
    icon: app.icon,
    featured: Boolean(app.featured),
    publisher: app.publisher,
    packageName: app.packageName,
    downloads: totalDownloads(app),
    version: latest.versionName,
    versionCode: latest.versionCode,
    size: latest.size,
    minSdk: latest.minSdk,
    updatedAt: app.updatedAt,
    uploadedAt: latest.uploadedAt,
    installed: latest.downloads || 0,
    versionCount: app.versions.length,
  };
}

function appDetail(app) {
  const summary = appSummary(app);
  if (!summary) return null;
  return {
    ...summary,
    description: app.description,
    screenshots: app.screenshots || [],
    createdAt: app.createdAt,
    versions: app.versions.map((v) => ({
      id: v.id,
      versionName: v.versionName,
      versionCode: v.versionCode,
      size: v.size,
      sha256: v.sha256,
      minSdk: v.minSdk,
      changelog: v.changelog,
      uploadedAt: v.uploadedAt,
      downloads: v.downloads || 0,
    })),
  };
}

function adminApp(app) {
  return {
    ...appSummary(app),
    description: app.description,
    screenshots: app.screenshots || [],
    published: app.published !== false,
    createdAt: app.createdAt,
    versions: (app.versions || []).map((v) => ({ ...v })),
  };
}

function listPublicApps(query = {}) {
  const db = store.read();
  const term = cleanText(query.q, 80).toLowerCase();
  const category = cleanText(query.category, 40);

  let apps = db.apps
    .filter((a) => a.published !== false)
    .filter((a) => latestVersion(a))
    .filter((a) => (category && category !== 'Todas' ? a.category === category : true));

  if (term) {
    apps = apps.filter((a) =>
      [a.name, a.tagline, a.description, a.category, a.publisher, a.packageName]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }

  const sort = cleanText(query.sort, 20) || 'recent';
  apps.sort((a, b) => {
    if (sort === 'popular') return totalDownloads(b) - totalDownloads(a);
    if (sort === 'name') return a.name.localeCompare(b.name, 'es');
    if (sort === 'oldest') return String(a.createdAt).localeCompare(String(b.createdAt));
    return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
  });

  return {
    apps: apps.map(appSummary).filter(Boolean),
    categories: CATEGORIES,
    stats: {
      apps: apps.length,
      downloads: apps.reduce((sum, a) => sum + totalDownloads(a), 0),
      totalApps: db.apps.filter((a) => a.published !== false && latestVersion(a)).length,
      totalDownloads: db.apps.reduce((sum, a) => sum + totalDownloads(a), 0),
    },
  };
}

/* ---------------------------- escritura ---------------------------- */

async function createApp({ fields = {}, apkPath, iconPath, screenshotPaths = [] }) {
  if (!apkPath) throw new Error('Falta el archivo APK.');
  if (!(await apk.looksLikeApk(apkPath))) throw new Error('El archivo no parece un APK valido.');

  const info = await apk.inspectApk(apkPath);
  const appId = newId();
  const versionId = newId();
  const name = cleanText(fields.name, 80) || info.label || 'App sin nombre';

  const db = store.read();
  const app = {
    id: appId,
    slug: uniqueSlug(db, fields.slug || name),
    name,
    tagline: cleanText(fields.tagline, 160),
    description: cleanText(fields.description, 8000),
    category: sanitizeCategory(fields.category),
    publisher: cleanText(fields.publisher, 60) || 'The SilverShop',
    packageName: cleanText(fields.packageName, 120) || info.packageName || '',
    icon: '',
    screenshots: [],
    featured: bool(fields.featured),
    published: fields.published === undefined ? true : bool(fields.published),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    versions: [],
  };

  const appDir = path.join(config.APK_DIR, appId);
  await fs.promises.mkdir(appDir, { recursive: true });
  const apkFile = path.join(appDir, `${versionId}.apk`);
  await fs.promises.rename(apkPath, apkFile);

  app.versions.push({
    id: versionId,
    versionName: cleanText(fields.versionName, 40) || info.versionName || '1.0',
    versionCode: Number(cleanText(fields.versionCode, 20) || info.versionCode || 0) || null,
    file: `${appId}/${versionId}.apk`,
    size: info.size,
    sha256: info.sha256,
    minSdk: info.minSdk,
    targetSdk: info.targetSdk,
    changelog: cleanText(fields.changelog, 4000),
    uploadedAt: new Date().toISOString(),
    downloads: 0,
    published: true,
  });

  if (!app.packageName && info.packageName) app.packageName = info.packageName;

  // Icono: el que sube el usuario o uno extraido del propio APK.
  if (iconPath) {
    app.icon = await storeImage(iconPath, config.ICON_DIR, '/media/icons', appId);
  } else {
    const extracted = await apk.extractIcon(
      apkFile,
      config.ICON_DIR,
      appId,
      info.iconPaths || [],
    );
    if (extracted) app.icon = `/media/icons/${path.basename(extracted.file)}`;
  }

  for (let i = 0; i < screenshotPaths.length; i++) {
    const url = await storeImage(
      screenshotPaths[i],
      config.SHOT_DIR,
      '/media/screenshots',
      `${appId}-${Date.now()}-${i}`,
    );
    app.screenshots.push(url);
  }

  await store.update((db2) => {
    db2.apps.push(app);
  });
  return app;
}

async function updateApp(id, { fields = {}, iconPath, screenshotPaths = [], removeScreenshots = [] }) {
  const app = store.read().apps.find((a) => a.id === id);
  if (!app) throw new Error('La app no existe.');

  if (fields.name !== undefined) app.name = cleanText(fields.name, 80) || app.name;
  if (fields.slug !== undefined) {
    const candidate = cleanText(fields.slug, 60);
    if (candidate) app.slug = uniqueSlug(store.read(), candidate, app.id);
  }
  if (fields.tagline !== undefined) app.tagline = cleanText(fields.tagline, 160);
  if (fields.description !== undefined) app.description = cleanText(fields.description, 8000);
  if (fields.category !== undefined) app.category = sanitizeCategory(fields.category);
  if (fields.publisher !== undefined) app.publisher = cleanText(fields.publisher, 60);
  if (fields.packageName !== undefined) app.packageName = cleanText(fields.packageName, 120);
  if (fields.featured !== undefined) app.featured = bool(fields.featured);
  if (fields.published !== undefined) app.published = bool(fields.published);

  if (iconPath) {
    if (app.icon) await removeQuiet(path.join(config.DATA_DIR, app.icon.replace(/^\//, '')));
    app.icon = await storeImage(iconPath, config.ICON_DIR, '/media/icons', app.id);
  }

  for (const url of removeScreenshots) {
    const target = String(url);
    if (!target.startsWith('/media/screenshots/')) continue;
    await removeQuiet(path.join(config.DATA_DIR, target.replace(/^\//, '')));
    app.screenshots = app.screenshots.filter((shot) => shot !== target);
  }

  for (let i = 0; i < screenshotPaths.length; i++) {
    const url = await storeImage(
      screenshotPaths[i],
      config.SHOT_DIR,
      '/media/screenshots',
      `${app.id}-${Date.now()}-${i}`,
    );
    app.screenshots.push(url);
  }

  app.updatedAt = new Date().toISOString();
  await store.write();
  return app;
}

async function addVersion(id, { apkPath, fields = {} }) {
  const app = store.read().apps.find((a) => a.id === id);
  if (!app) throw new Error('La app no existe.');
  if (!apkPath) throw new Error('Falta el archivo APK.');
  if (!(await apk.looksLikeApk(apkPath))) throw new Error('El archivo no parece un APK valido.');

  const info = await apk.inspectApk(apkPath);
  const versionId = newId();
  const appDir = path.join(config.APK_DIR, app.id);
  await fs.promises.mkdir(appDir, { recursive: true });
  const target = path.join(appDir, `${versionId}.apk`);
  await fs.promises.rename(apkPath, target);

  if (!app.icon) {
    const extracted = await apk.extractIcon(target, config.ICON_DIR, app.id, info.iconPaths || []);
    if (extracted) app.icon = `/media/icons/${path.basename(extracted.file)}`;
  }

  app.versions.unshift({
    id: versionId,
    versionName: cleanText(fields.versionName, 40) || info.versionName || '1.0',
    versionCode: Number(cleanText(fields.versionCode, 20) || info.versionCode || 0) || null,
    file: `${app.id}/${versionId}.apk`,
    size: info.size,
    sha256: info.sha256,
    minSdk: info.minSdk,
    targetSdk: info.targetSdk,
    changelog: cleanText(fields.changelog, 4000),
    uploadedAt: new Date().toISOString(),
    downloads: 0,
    published: true,
  });

  app.packageName = app.packageName || info.packageName || '';
  app.updatedAt = new Date().toISOString();
  await store.write();
  return app;
}

async function deleteApp(id) {
  const db = store.read();
  const app = db.apps.find((a) => a.id === id);
  if (!app) throw new Error('La app no existe.');

  await removeQuiet(path.join(config.APK_DIR, app.id));
  if (app.icon) await removeQuiet(path.join(config.DATA_DIR, app.icon.replace(/^\//, '')));
  for (const shot of app.screenshots || []) {
    await removeQuiet(path.join(config.DATA_DIR, shot.replace(/^\//, '')));
  }

  await store.update((db2) => {
    db2.apps = db2.apps.filter((a) => a.id !== id);
  });
}

async function deleteVersion(id, versionId) {
  const app = store.read().apps.find((a) => a.id === id);
  if (!app) throw new Error('La app no existe.');
  if (app.versions.length <= 1) throw new Error('No puedes borrar la unica version publicada.');

  const version = app.versions.find((v) => v.id === versionId);
  if (!version) throw new Error('La version no existe.');

  await removeQuiet(path.join(config.APK_DIR, version.file));
  app.versions = app.versions.filter((v) => v.id !== versionId);
  app.updatedAt = new Date().toISOString();
  await store.write();
}

function findVersion(appId, versionId) {
  const app = store.read().apps.find((a) => a.id === appId);
  if (!app || app.published === false) return null;
  const version = app.versions.find((v) => v.id === versionId);
  if (!version) return null;
  const file = path.join(config.APK_DIR, version.file);
  return { app, version, file };
}

function registerDownload(appId, versionId) {
  const db = store.read();
  const app = db.apps.find((a) => a.id === appId);
  if (!app) return;
  const version = app.versions.find((v) => v.id === versionId);
  if (!version) return;
  version.downloads = (version.downloads || 0) + 1;
  store.write();
}

module.exports = {
  CATEGORIES,
  listPublicApps,
  appSummary,
  appDetail,
  adminApp,
  createApp,
  updateApp,
  addVersion,
  deleteApp,
  deleteVersion,
  findVersion,
  registerDownload,
  latestVersion,
  totalDownloads,
  cleanText,
  slugify,
};
