'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const config = require('./config');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.TMP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const name = String(file.originalname || '').toLowerCase();
  if (file.fieldname === 'apk') {
    if (name.endsWith('.apk')) return cb(null, true);
    return cb(new Error('El archivo debe tener extension .apk.'));
  }
  if (file.fieldname === 'icon' || file.fieldname === 'screenshots') {
    if (/\.(png|jpe?g|webp|gif)$/.test(name)) return cb(null, true);
    return cb(new Error('Las imagenes deben ser PNG, JPG, WEBP o GIF.'));
  }
  return cb(new Error(`Campo de archivo no permitido: ${file.fieldname}`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.MAX_APK_MB * 1024 * 1024,
    files: 12,
    fields: 60,
  },
});

module.exports = { upload };
