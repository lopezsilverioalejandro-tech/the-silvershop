#!/usr/bin/env node
'use strict';

/**
 * Rellena la tienda con las apps que ya estan compiladas en este equipo.
 * Uso: npm run seed   (o node tools/seed.js --force)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../src/config');
const store = require('../src/store');
const lib = require('../src/library');

const ROOT = path.join(__dirname, '..', '..');

const APPS = [
  {
    apk: path.join(ROOT, 'Aula', 'dist', 'Aula-2.1.1.apk'),
    name: 'Aula',
    tagline: 'Materias, tareas y sesiones de enfoque. Sin cuentas, sin nube.',
    category: 'Estudio',
    publisher: 'Silver',
    versionName: '2.1.1',
    changelog:
      'Llega Octivo, la mascota de Aula, con intro animada. Icono nuevo a juego con la paleta papel y tipografía Public Sans incluida en la app.',
    featured: true,
    description: `Aula es un organizador de materias, tareas y sesiones de estudio pensado para el día a día. Todo se guarda en el propio teléfono: no hay cuentas, no hay registro y no hay nube.

- Cinco secciones: Inicio, Calendario, Tareas, Progreso y Perfil
- Tareas con prioridad, subtareas, notas, hora de entrega y repetición (diaria, semanal o mensual)
- Añadir rápido escribiendo «mañana 18:00 examen de mate»
- Avisos el día antes y el día de entrega, con acciones para completar o posponer
- Widgets de escritorio y notificación fija con lo que tienes pendiente
- Calificaciones con promedio ponderado, modo enfoque tipo Pomodoro y rachas de estudio
- Tabla periódica interactiva, calculadora científica y descanso activo
- Personalización amplia: 30 acentos, temas, fondos, tipografías, animaciones y modo AMOLED
- Copia de seguridad local en JSON y actualizaciones dentro de la propia app

Octivo, el pulpo con gafas, te recibe al abrir la app y aparece en las pantallas vacías con consejos de estudio.`,
  },
  {
    apk: path.join(ROOT, 'Nocturno', 'dist', 'Nocturno-1.0.0.apk'),
    name: 'Nocturno',
    tagline: 'Sonidos para dormir, estudiar o concentrarte, generados en tu teléfono.',
    category: 'Salud',
    publisher: 'Silver',
    versionName: '1.0.0',
    changelog:
      'Primera versión pública: ocho sonidos sintetizados, temporizador y reproducción en segundo plano.',
    featured: true,
    description: `Nocturno genera todos sus sonidos en tiempo real dentro del teléfono. No descarga audio, no usa cuentas y no declara permiso de internet: no puede enviar nada a ningún sitio.

- Ocho sonidos: ruido blanco, rosa y marrón, lluvia, olas, viento, ventilador y chimenea
- Cambio de sonido con fundido, sin cortes ni chasquidos
- Temporizador de sueño de 15, 30, 45, 60 o 90 minutos
- Reproducción en segundo plano con la pantalla apagada
- Modo noche de serie, sin destellos

Ideal para la mesa de noche, para estudiar o para tapar el ruido de la calle.`,
  },
  {
    apk: path.join(ROOT, 'VideoScroll', 'VideoScroll.apk'),
    name: 'VideoScroll',
    tagline: 'Tus videos locales en un feed vertical, estilo TikTok.',
    category: 'Multimedia',
    publisher: 'Silver',
    versionName: '1.3',
    changelog:
      'Restaura el último video, guarda me gusta y carpetas, y estrena buscador y ajustes.',
    featured: false,
    description: `VideoScroll lee los videos que ya tienes en el teléfono con MediaStore (no copia nada) y los muestra en un pager vertical: el video visible se reproduce solo, hace loop y se pausa al salir de pantalla.

- Feed vertical con todos tus videos, más recientes primero
- El video conserva su formato real, sin recortes
- Un toque pausa, doble toque da me gusta, mantener pulsado abre las opciones
- Me gusta, carpetas propias y biblioteca estilo perfil
- Buscador por nombre de archivo o carpeta
- Retoma el último video, incluso en el segundo exacto
- Velocidad 1x, 1.5x y 2x, silencio recordado y pantalla siempre encendida

Todo se queda en el teléfono: nada se sube a internet.`,
  },
];

async function main() {
  const force = process.argv.includes('--force');
  if (store.read().apps.length && !force) {
    console.log('La tienda ya tiene apps. Usa --force si quieres anadirlas igualmente.');
    return;
  }

  let added = 0;
  for (const entry of APPS) {
    if (!fs.existsSync(entry.apk)) {
      console.warn(`  Omitida ${entry.name}: no existe ${entry.apk}`);
      continue;
    }
    const temp = path.join(config.TMP_DIR, `seed-${crypto.randomBytes(6).toString('hex')}.apk`);
    await fs.promises.copyFile(entry.apk, temp);
    try {
      const app = await lib.createApp({
        fields: entry,
        apkPath: temp,
      });
      added += 1;
      console.log(`  + ${app.name} v${app.versions[0].versionName} (${(app.versions[0].size / 1024 / 1024).toFixed(1)} MB)`);
    } finally {
      await fs.promises.unlink(temp).catch(() => {});
    }
  }
  console.log(`\n  ${added} apps anadidas. Abre el panel en /admin para editarlas.`);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
