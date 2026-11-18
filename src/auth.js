'use strict';

const crypto = require('node:crypto');
const config = require('./config');

const COOKIE = 'ss_admin';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto
    .createHmac('sha256', config.SESSION_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${mac}`;
}

function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expected = crypto
    .createHmac('sha256', config.SESSION_SECRET)
    .update(body)
    .digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function createSession(res) {
  const token = signToken({ role: 'admin', exp: Date.now() + MAX_AGE_MS });
  const secure = config.PUBLIC_URL.startsWith('https://') || config.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(
      MAX_AGE_MS / 1000,
    )}${secure ? '; Secure' : ''}`,
  );
}

function destroySession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function isAdmin(req) {
  const cookies = parseCookies(req);
  return Boolean(verifyToken(cookies[COOKIE]));
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Sesión caducada. Vuelve a entrar.' });
}

/* Limite simple de intentos de acceso por IP. */
const attempts = new Map();

function checkLoginRate(ip) {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || record.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
    return { ok: true };
  }
  record.count += 1;
  if (record.count > 10) {
    return { ok: false, retryIn: Math.ceil((record.reset - now) / 1000) };
  }
  return { ok: true };
}

function resetLoginRate(ip) {
  attempts.delete(ip);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  createSession,
  destroySession,
  requireAdmin,
  isAdmin,
  checkLoginRate,
  resetLoginRate,
  safeEqual,
};
