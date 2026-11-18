#!/usr/bin/env node
'use strict';

/**
 * Importa un APK a la tienda desde la linea de comandos.
 *
 * Ejemplo:
 *   npm run import -- --apk "..\Aula\dist\Aula-2.1.1.apk" --name "Aula" ^
 *     --tagline "Organiza tus materias y tareas" --category Estudio --featured
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../src/config');
const lib = require('../src/library');

function parseArgs(argv) {
  const out = { screenshots: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    const key = eq > -1 ? token.slice(2, eq) : token.slice(2);
    let value = eq > -1 ? token.slice(eq + 1) : undefined;
    if (value === undefined) {
      const next = argv[i + 1];
      value = next && !next.startsWith('--') ? next : 'true';
      if (value !== 'true') i++;
    }
    if (key === 'screenshot') out.screenshots.push(value);
    else out[key] = value;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.apk) {
    console.error('Falta --apk. Ejemplo: npm run import -- --apk "dist\\App.apk" --name "Mi app"');
    process.exit(1);
  }

  const apkPath = path.resolve(args.apk);
  if (!fs.existsSync(apkPath)) {
    console.error(`No existe el archivo: ${apkPath}`);
    process.exit(1);
  }

  let description = args.description || '';
  if (args['description-file']) {
    description = await fs.promises.readFile(path.resolve(args['description-file']), 'utf8');
  }

  // Copiamos a la carpeta temporal: la importacion nunca mueve el original.
  const temp = path.join(config.TMP_DIR, `import-${crypto.randomBytes(6).toString('hex')}.apk`);
  await fs.promises.copyFile(apkPath, temp);

  try {
    const app = await lib.createApp({
      fields: {
        name: args.name,
        tagline: args.tagline,
        description,
        category: args.category,
        publisher: args.publisher,
        versionName: args.version,
        changelog: args.changelog,
        featured: Boolean(args.featured),
        published: !args.hidden,
      },
      apkPath: temp,
      iconPath: args.icon ? path.resolve(args.icon) : null,
      screenshotPaths: args.screenshots.map((p) => path.resolve(p)),
    });

    const latest = app.versions[0];
    console.log('');
    console.log(`  ${app.name} v${latest.versionName} importada`);
    console.log(`  Ficha:  ${config.PUBLIC_URL || 'http://localhost:' + config.PORT}/app/${app.slug}`);
    console.log(`  Tamano: ${(latest.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  SHA256: ${latest.sha256}`);
    console.log('');
  } finally {
    await fs.promises.unlink(temp).catch(() => {});
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
