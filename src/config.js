'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');

/** Lee un .env sencillo sin dependencias externas. */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(path.join(ROOT, '.env'));

/** Codigo de verificacion de Google: variable de entorno o archivo del repo. */
function googleVerification() {
  if (process.env.GOOGLE_SITE_VERIFICATION) {
    return process.env.GOOGLE_SITE_VERIFICATION.trim();
  }
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'seo-verification.json'), 'utf8'),
    );
    return String(parsed.google || '').trim();
  } catch {
    return '';
  }
}

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const APK_DIR = path.join(DATA_DIR, 'apks');
const ICON_DIR = path.join(DATA_DIR, 'icons');
const SHOT_DIR = path.join(DATA_DIR, 'screenshots');
const TMP_DIR = path.join(DATA_DIR, 'tmp');

for (const dir of [DATA_DIR, APK_DIR, ICON_DIR, SHOT_DIR, TMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Clave estable para firmar la sesión del panel. */
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, 'session.key');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {}
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = {
  ROOT,
  DATA_DIR,
  APK_DIR,
  ICON_DIR,
  SHOT_DIR,
  TMP_DIR,
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'silvershop',
  SESSION_SECRET: sessionSecret(),
  MAX_APK_MB: Number(process.env.MAX_APK_MB) || 250,
  MAX_IMAGE_MB: 8,
  PUBLIC_URL: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  GOOGLE_SITE_VERIFICATION: googleVerification(),
  AAPT_PATH: process.env.AAPT_PATH || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
