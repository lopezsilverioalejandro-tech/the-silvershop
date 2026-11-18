'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const multer = require('multer');

const config = require('./src/config');
const seo = require('./src/seo');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PUBLIC_DIR = path.join(config.ROOT, 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (req.path === '/admin' || req.path.startsWith('/api/admin')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'self'`,
  );
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* Vistas con metadatos SEO renderizados en el servidor */
app.get('/', (req, res) => {
  res.type('html').send(seo.renderHome(req, res.locals.cspNonce));
});

app.get('/app/:slug', (req, res) => {
  const html = seo.renderApp(req, req.params.slug, res.locals.cspNonce);
  if (!html) return res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
  res.type('html').send(html);
});

app.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

/* Medios publicos: solo iconos y capturas, nunca la carpeta data completa */
app.use(
  '/media/icons',
  express.static(config.ICON_DIR, { index: false, maxAge: '7d', immutable: true }),
);
app.use(
  '/media/screenshots',
  express.static(config.SHOT_DIR, { index: false, maxAge: '7d', immutable: true }),
);

/* CSS y JS con cache corta para no servir versiones viejas */
app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    etag: true,
    setHeaders(res, filePath) {
      const dev = config.NODE_ENV !== 'production';
      if (dev) return res.setHeader('Cache-Control', 'no-store');
      if (/\.(css|js)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=300');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

app.use(publicRoutes);
app.use(adminRoutes);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Ruta no encontrada.' });
  }
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.use((err, req, res, _next) => {
  console.error('[error]', req.method, req.originalUrl, '-', err.message);
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `El archivo supera el limite de ${config.MAX_APK_MB} MB.`
        : 'No se pudo procesar el archivo.';
    return res.status(400).json({ error: message });
  }
  if (req.path.startsWith('/api/')) {
    return res.status(400).json({ error: err.message || 'Error inesperado.' });
  }
  res.status(500).send('Error interno del servidor.');
});

/* Limpieza de subidas temporales antiguas */
async function cleanTemp() {
  try {
    const files = await fs.promises.readdir(config.TMP_DIR);
    const limit = Date.now() - 6 * 60 * 60 * 1000;
    for (const name of files) {
      const file = path.join(config.TMP_DIR, name);
      try {
        const stats = await fs.promises.stat(file);
        if (stats.mtimeMs < limit) await fs.promises.unlink(file);
      } catch {}
    }
  } catch {}
}
cleanTemp();
setInterval(cleanTemp, 60 * 60 * 1000).unref();

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

app.listen(config.PORT, config.HOST, () => {
  const shown = config.HOST === '0.0.0.0' ? 'localhost' : config.HOST;
  console.log('');
  console.log('  THE SILVERSHOP');
  console.log(`  Tienda:  http://${shown}:${config.PORT}`);
  console.log(`  Panel:   http://${shown}:${config.PORT}/admin`);
  for (const ip of lanAddresses()) {
    console.log(`  Movil:   http://${ip}:${config.PORT}  (misma WiFi)`);
  }
  if (config.ADMIN_PASSWORD === 'silvershop') {
    console.log('');
    console.log('  Aviso: estas usando la contrasena por defecto (silvershop).');
    console.log('  Cambiala en el archivo .env antes de publicar el sitio.');
  }
  console.log('');
});
