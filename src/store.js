'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./config');

const FILE = path.join(DATA_DIR, 'apps.json');
const EMPTY = () => ({ apps: [], meta: { createdAt: new Date().toISOString() } });

let cache = null;
let writeChain = Promise.resolve();

function read() {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cache = parsed && Array.isArray(parsed.apps) ? parsed : EMPTY();
  } catch {
    cache = EMPTY();
  }
  return cache;
}

function snapshot() {
  return JSON.parse(JSON.stringify(read()));
}

/** Guarda de forma atómica y en cola, para no corromper el JSON. */
function write() {
  const body = JSON.stringify(read(), null, 2);
  writeChain = writeChain
    .then(async () => {
      const tmp = `${FILE}.tmp`;
      await fs.promises.writeFile(tmp, body, 'utf8');
      await fs.promises.rename(tmp, FILE);
    })
    .catch((err) => console.error('[store] no se pudo guardar apps.json:', err));
  return writeChain;
}

function update(fn) {
  const db = read();
  const result = fn(db);
  return write().then(() => result);
}

module.exports = { read, write, update, snapshot, FILE };
