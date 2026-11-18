'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const config = require('./config');

/* ------------------------------------------------------------------ */
/*  aapt: leer paquete, version y nombre directamente del APK          */
/* ------------------------------------------------------------------ */

function compareVersions(a, b) {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

let cachedAapt;

function findAapt() {
  if (cachedAapt !== undefined) return cachedAapt;
  const candidates = [];
  if (config.AAPT_PATH) candidates.push(config.AAPT_PATH);

  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    'C:\\Users\\lopez\\android-toolchain\\sdk',
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
  ].filter(Boolean);

  for (const root of sdkRoots) {
    const buildTools = path.join(root, 'build-tools');
    let versions = [];
    try {
      versions = fs.readdirSync(buildTools);
    } catch {
      continue;
    }
    versions.sort(compareVersions);
    for (const version of versions) {
      for (const exe of ['aapt.exe', 'aapt']) {
        candidates.push(path.join(buildTools, version, exe));
      }
    }
  }

  cachedAapt = candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }) || null;
  return cachedAapt;
}

function inspectWithAapt(apkPath) {
  const aapt = findAapt();
  if (!aapt) return { aaptFound: false };
  try {
    const out = execFileSync(aapt, ['dump', 'badging', apkPath], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });

    const pkg = /package: name='([^']*)'(?: versionCode='([^']*)')?(?: versionName='([^']*)')?/.exec(out);
    const label =
      /application-label-es:'([^']*)'/.exec(out) ||
      /application-label:'([^']*)'/.exec(out) ||
      /application-label-[a-z]{2}(?:-[A-Z]{2})?:'([^']*)'/.exec(out);
    const sdk = /sdkVersion:'([^']*)'/.exec(out);
    const targetSdk = /targetSdkVersion:'([^']*)'/.exec(out);
    const versionCode = /versionCode='([^']*)'/.exec(out);
    const versionName = /versionName='([^']*)'/.exec(out);

    const icons = [];
    const iconRe = /application-icon-(\d+):'([^']*)'/g;
    let match;
    while ((match = iconRe.exec(out))) {
      icons.push({ density: Number(match[1]) || 0, path: match[2] });
    }
    const single = /application-icon:'([^']*)'/.exec(out);
    if (single) icons.push({ density: 0, path: single[1] });

    return {
      aaptFound: true,
      packageName: pkg ? pkg[1] : null,
      versionName: (versionName && versionName[1]) || (pkg && pkg[3]) || null,
      versionCode: (versionCode && versionCode[1]) || (pkg && pkg[2]) || null,
      label: label ? label[1] : null,
      minSdk: sdk ? Number(sdk[1]) : null,
      targetSdk: targetSdk ? Number(targetSdk[1]) : null,
      iconPaths: icons.sort((a, b) => b.density - a.density),
    };
  } catch (err) {
    console.warn('[apk] aapt no pudo leer el APK:', err.message);
    return { aaptFound: true, error: err.message };
  }
}

/* ------------------------------------------------------------------ */
/*  ZIP: extraer el icono del APK sin dependencias                     */
/* ------------------------------------------------------------------ */

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function readZipEntries(buffer) {
  let eocd = -1;
  const from = Math.max(0, buffer.length - 66560);
  for (let i = buffer.length - 22; i >= from; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const total = Math.min(buffer.readUInt16LE(eocd + 10), 200000);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < total; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIG) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compSize = buffer.readUInt32LE(offset + 20);
    const uncompSize = buffer.readUInt32LE(offset + 24);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLen)
      .toString('utf8');
    entries.push({ name, method, compSize, uncompSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipEntry(buffer, entry) {
  const local = entry.localOffset;
  if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL_SIG) {
    throw new Error(`entrada ZIP invalida: ${entry.name}`);
  }
  const nameLen = buffer.readUInt16LE(local + 26);
  const extraLen = buffer.readUInt16LE(local + 28);
  const start = local + 30 + nameLen + extraLen;
  const data = buffer.subarray(start, start + entry.compSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return zlib.inflateRawSync(data);
  throw new Error(`compresion no soportada: ${entry.method}`);
}

function densityScore(name, uncompSize) {
  const densities = [
    ['xxxhdpi', 640],
    ['xxhdpi', 480],
    ['xhdpi', 320],
    ['hdpi', 240],
    ['mdpi', 160],
    ['ldpi', 120],
    ['nodpi', 20],
    ['anydpi', 10],
  ];
  let weight = 0;
  for (const [key, value] of densities) {
    if (name.includes(key)) {
      weight = value;
      break;
    }
  }
  // Preferir el icono cuadrado normal frente a la variante redonda.
  const round = /_round|round_/.test(path.basename(name)) ? -40 : 0;
  return weight * 1e6 + Math.min(uncompSize, 5e6) / 10 + round;
}

/**
 * Extrae el mejor icono raster del APK.
 * @returns {Promise<{file: string, ext: string} | null>} ruta absoluta escrita
 */
async function extractIcon(apkPath, destDir, baseName, aaptIcons = []) {
  let buffer;
  try {
    buffer = await fs.promises.readFile(apkPath);
  } catch {
    return null;
  }

  let entries;
  try {
    entries = readZipEntries(buffer);
  } catch {
    return null;
  }
  if (!entries.length) return null;

  const byName = new Map(entries.map((e) => [e.name, e]));
  const isImage = (name) => /\.(png|webp)$/i.test(name) && !/\.9\.png$/i.test(name);

  const chosen = [];
  // 1) Rutas exactas que reporta aapt, de mayor a menor densidad.
  for (const icon of aaptIcons) {
    const entry = byName.get(icon.path);
    if (entry && isImage(entry.name)) {
      chosen.push({ entry, score: 1e9 + icon.density * 1e6 });
    }
  }
  // 2) Cualquier imagen que parezca un lanzador.
  if (!chosen.length) {
    for (const entry of entries) {
      if (!isImage(entry.name)) continue;
      if (!/^res\//.test(entry.name)) continue;
      const base = path.basename(entry.name).toLowerCase();
      if (/ic_launcher|launcher|^icon|app_icon|logo/.test(base)) {
        chosen.push({ entry, score: densityScore(entry.name, entry.uncompSize) });
      }
    }
  }
  // 3) Ultimo recurso: la imagen mas grande de res/.
  if (!chosen.length) {
    for (const entry of entries) {
      if (isImage(entry.name) && /^res\//.test(entry.name)) {
        chosen.push({ entry, score: entry.uncompSize });
      }
    }
  }
  if (!chosen.length) return null;

  chosen.sort((a, b) => b.score - a.score);
  const entry = chosen[0].entry;

  let data;
  try {
    data = readZipEntry(buffer, entry);
  } catch (err) {
    console.warn('[apk] no se pudo extraer el icono:', err.message);
    return null;
  }

  const ext = path.extname(entry.name).toLowerCase() === '.webp' ? '.webp' : '.png';
  const file = path.join(destDir, `${baseName}${ext}`);
  await fs.promises.writeFile(file, data);
  return { file, ext };
}

/* ------------------------------------------------------------------ */

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function inspectApk(apkPath) {
  const stats = await fs.promises.stat(apkPath);
  const [info, sha256] = await Promise.all([
    Promise.resolve(inspectWithAapt(apkPath)),
    sha256File(apkPath),
  ]);
  return { ...info, size: stats.size, sha256 };
}

/** Comprueba que el archivo sea realmente un ZIP (todo APK lo es). */
async function looksLikeApk(file) {
  try {
    const fd = await fs.promises.open(file, 'r');
    const buf = Buffer.alloc(4);
    await fd.read(buf, 0, 4, 0);
    await fd.close();
    return buf[0] === 0x50 && buf[1] === 0x4b;
  } catch {
    return false;
  }
}

module.exports = { inspectApk, extractIcon, sha256File, looksLikeApk, findAapt };
