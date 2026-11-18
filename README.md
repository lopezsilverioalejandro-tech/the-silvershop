# The SilverShop

Tienda web publica para publicar y descargar tus APK. Tiene dos caras:

- **Escaparate** (`/`): catalogo con buscador, categorias, fichas de app, capturas,
  historial de versiones y descarga directa del APK.
- **Panel** (`/admin`): protegido con contrasena. Arrastras un APK, la tienda lee
  el paquete, la version, el nombre y el icono, y lo publicas en segundos.

Sin cuentas para quien descarga. Sin base de datos externa: todo vive en la
carpeta `data/` del servidor.

---

## Arrancar en tu PC

**Opcion facil:** doble clic en `Iniciar The SilverShop.bat`.

**Con la terminal:**

```powershell
cd "C:\Users\lopez\OneDrive\Documentos\Proyecto predeterminado\TheSilverShop"
npm install
npm start
```

Se abre en <http://localhost:3000> y el panel en <http://localhost:3000/admin>.

La consola tambien imprime una direccion `http://192.168.x.x:3000` para abrir la
tienda desde el movil en la misma WiFi.

**Contrasena inicial del panel:** `silvershop2026`
Cambiala en el archivo `.env` (`ADMIN_PASSWORD=...`) antes de publicar el sitio.

### Primera carga de apps

La tienda arranca vacia. Para precargar Aula, Nocturno y VideoScroll con sus
APK de `dist/`:

```powershell
npm run seed
```

O sube cualquier APK desde el panel con el boton **Nueva app**.

---

## Como funciona la publicacion

1. Entra en `/admin` y escribe la contrasena.
2. Pulsa **Nueva app** y arrastra el `.apk`.
3. El servidor usa `aapt` (del Android SDK) para leer nombre, paquete, version y
   `minSdk`, y extrae el icono del propio APK. Si no encuentra `aapt`, rellena
   esos campos a mano.
4. Completa frase corta, categoria y descripcion. Pulsa **Guardar app**.
5. Ya esta en la portada. Desde **Editar** puedes cambiar el icono, anadir
   capturas, ocultarla o publicar una version nueva.
6. Al publicar una version nueva, la anterior sigue descargable en el historial.

Cada APK se guarda con su tamano y su SHA-256, que se muestra en la ficha para
que quien lo descargue pueda comprobarlo.

### Importar desde la terminal

```powershell
npm run import -- --apk "..\Aula\dist\Aula-2.1.1.apk" `
  --name "Aula" `
  --tagline "Materias, tareas y enfoque" `
  --category Estudio `
  --version 2.1.1 `
  --description-file "descripcion.txt" `
  --featured
```

Opciones: `--apk`, `--name`, `--tagline`, `--category`, `--publisher`,
`--version`, `--changelog`, `--description`, `--description-file`, `--icon`,
`--screenshot` (repetible), `--featured`, `--hidden`.

---

## Donde se guardan los datos

```
data/
├─ apps.json            metadatos, versiones, descargas y hashes
├─ apks/<app>/<v>.apk   los APK publicados
├─ icons/               iconos de la tienda
├─ screenshots/         capturas subidas
├─ tmp/                 subidas en curso (se limpian solas)
└─ session.key          clave que firma la sesion del panel
```

**Copia de seguridad:** copia la carpeta `data/` completa. Para restaurar, dejala
en el mismo sitio y arranca el servidor.

No subas `data/`, `.env` ni `node_modules/` a un repositorio publico (ya estan en
`.gitignore`).

---

## Publicarla en internet

La app es un servidor Node normal. Necesita un hosting que mantenga un **disco
persistente**, porque los APK se guardan en disco.

### Render (recomendado, con disco)

1. Sube el proyecto a GitHub (sin `data/` ni `.env`).
2. En Render: **New → Web Service**, elige el repositorio.
3. Build: `npm install` · Start: `node server.js`.
4. Variables de entorno:
   - `ADMIN_PASSWORD` = tu contrasena nueva
   - `PUBLIC_URL` = `https://tu-dominio.com`
   - `NODE_ENV` = `production`
   - `DATA_DIR` = `/var/data`
5. **Disks → Add Disk**: nombre `silvershop-data`, mount path `/var/data`, 1 GB.
6. Deploy. El archivo `render.yaml` incluye esta configuracion comentada.

> El plan gratuito de Render no incluye disco: las apps subidas se perderian al
> reiniciar. Para una tienda real usa un plan con disco (Starter) o Railway con
> volumen.

### Prueba gratuita en Render (sin disco)

Si solo quieres ver la tienda online y comprobar como se ve desde el movil:

1. Crea una cuenta gratis en <https://render.com> con tu GitHub.
2. Sube el proyecto a un repositorio de GitHub.
3. En Render: **New → Blueprint** y elige el repositorio. El `render.yaml`
   incluido ya usa `plan: free`.
4. Cuando Render pregunte, define `ADMIN_PASSWORD` y deja `PUBLIC_URL` para
   despues: copia la URL `https://the-silvershop.onrender.com` que te asigne y
   vuelve a ponerla en `PUBLIC_URL`.
5. Abre `https://the-silvershop.onrender.com/admin` y sube tus APK.

**Limitaciones de esta prueba:** el plan free duerme el servicio tras unos
minutos sin visitas y no conserva los archivos subidos al reiniciar. Sirve para
verla y para empezar a indexarla, pero no para una tienda real. Cuando quieras
conservar las apps, pasa al plan Starter con disco o usa la opcion del PC con
Cloudflare Tunnel.

### Railway

1. Nuevo proyecto desde el repositorio.
2. **Variables**: `ADMIN_PASSWORD`, `PUBLIC_URL`, `NODE_ENV=production`,
   `DATA_DIR=/data`.
3. **Volume**: monta un volumen en `/data`.

### Docker / VPS propio

```bash
docker build -t the-silvershop .
docker run -d -p 3000:3000 \
  -e ADMIN_PASSWORD="tu-contrasena" \
  -e PUBLIC_URL="https://tienda.ejemplo.com" \
  -v silvershop-data:/data \
  --name silvershop the-silvershop
```

Ponlo detras de Nginx o Caddy con HTTPS (Caddy lo hace solo). El servidor ya
marca la cookie como `Secure` cuando `NODE_ENV=production` o `PUBLIC_URL` es
`https://`.

### Prueba rapida desde fuera de casa

```powershell
# Tunel temporal de Cloudflare, sin cuenta
cloudflared tunnel --url http://localhost:3000
```

Te da una URL `https://...trycloudflare.com` mientras la ventana siga abierta.
Sirve para ensenar la tienda, no para production.

---

## Que aparezca en Google

**Google no puede encontrar `http://localhost`.** Para buscar la tienda desde un
movil Android o desde Windows hace falta una URL publica y, idealmente, un
dominio propio. El sitio ya trae lo necesario para que Google lo entienda:

- `sitemap.xml` generado solo con las apps publicadas.
- `robots.txt` que deja fuera el panel y las descargas.
- Titulo, descripcion, canonical y Open Graph en cada ficha.
- Datos estructurados `SoftwareApplication` y `WebSite` (JSON-LD).
- El panel y su API llevan `noindex`.

### Pasos

1. **Compra un dominio corto y facil de recordar.** Por ejemplo
   `thesilvershop.app`, `thesilvershop.es` o `silvershopapk.com`. Un dominio
   propio transmite mas confianza y es lo que la gente puede buscar.
2. **Publica la tienda** en Render, Railway o un VPS (mira la seccion anterior)
   y conecta el dominio desde el panel del hosting. En el DNS usa el `CNAME` o
   la IP que te indiquen.
3. **Configura las variables** en el hosting:
   - `PUBLIC_URL=https://tudominio.com`
   - `NODE_ENV=production`
   - `ADMIN_PASSWORD=...`
4. **Alta en Google Search Console:** <https://search.google.com/search-console>
   - Anade la propiedad con el dominio o con la URL completa.
   - Si eliges verificar con una etiqueta meta, copia solo el valor de `content`
     en `GOOGLE_SITE_VERIFICATION`.
   - Entra en **Sitemaps** y envia `https://tudominio.com/sitemap.xml`.
   - Usa **Inspeccionar URL** y pide indexar `/` y cada `/app/...`.
5. **Espera.** Una web nueva tarda entre unos dias y varias semanas en salir.
   Ayuda mucho compartir el enlace en tus redes, foros o perfiles y que otras
   webs enlacen a la tienda.

> **Aviso sobre el nombre:** "the silver shop" es una expresion muy generica y
> la usan joyerias y tiendas de plata de todo el mundo. Es dificil salir primero
> solo con ese texto. Para una busqueda fiable conviene una marca mas unica
> (por ejemplo **The SilverShop APK**) y buscar tambien `The SilverShop Aula`,
> `The SilverShop Nocturno`, etc. Si quieres, se puede cambiar el nombre y el
> dominio por uno mas distintivo.

---

## Configuracion (`.env`)

| Variable | Por defecto | Para que |
| --- | --- | --- |
| `ADMIN_PASSWORD` | `silvershop` | Contrasena del panel |
| `PORT` | `3000` | Puerto |
| `HOST` | `0.0.0.0` | Interfaz de escucha |
| `DATA_DIR` | `./data` | Carpeta de datos (usa `/data` en hosting) |
| `PUBLIC_URL` | vacio | URL publica, canonical y cookies secure |
| `GOOGLE_SITE_VERIFICATION` | vacio | Codigo meta de Google Search Console |
| `MAX_APK_MB` | `250` | Tamano maximo por APK |
| `SESSION_SECRET` | auto | Clave de firma; se genera en `data/session.key` |
| `AAPT_PATH` | auto | Ruta a `aapt.exe` si no se detecta solo |
| `NODE_ENV` | `development` | `production` en el servidor |

`aapt` se busca en `ANDROID_HOME`, `ANDROID_SDK_ROOT`,
`C:\Users\lopez\android-toolchain\sdk` y `%LOCALAPPDATA%\Android\Sdk`.

---

## Seguridad

- El panel firma la sesion con HMAC-SHA256 en una cookie `HttpOnly` y
  `SameSite=Strict`, valida 7 dias.
- Los cambios exigen la cabecera `X-Requested-With`, lo que bloquea formularios
  de otros dominios (CSRF).
- Limite de 10 intentos de contrasena por IP cada 15 minutos.
- Solo se sirven las carpetas `icons/` y `screenshots/`; `apks/`, `apps.json` y
  `session.key` no son accesibles por URL.
- Los APK se validan por firma ZIP y los iconos/capturas por sus bytes reales.
- Cabeceras `CSP` con nonce, `nosniff` y `X-Frame-Options: SAMEORIGIN`.

Aun asi: usa una contrasena larga, HTTPS y mantén el servidor actualizado.

---

## Estructura del proyecto

```
TheSilverShop/
├─ server.js              arranque, cabeceras, estaticos y limpieza
├─ src/
│  ├─ config.js           .env, rutas y limites
│  ├─ store.js            apps.json con escritura atomica
│  ├─ library.js          crear/editar apps y versiones
│  ├─ apk.js              aapt + extraccion del icono del ZIP
│  ├─ auth.js             sesion firmada y limite de intentos
│  ├─ seo.js              metadatos, sitemap y datos estructurados
│  ├─ upload.js           multer y validacion de archivos
│  └─ routes/             API publica y API del panel
├─ public/                tienda, ficha, panel y estilos
├─ tools/                 import.js y seed.js
├─ data/                  (se crea sola) apps y archivos
├─ Dockerfile
└─ render.yaml
```

---

## Notas

- Los APK se sirven con `Content-Type: application/vnd.android.package-archive`
  y `Content-Disposition: attachment`, asi que Android los reconoce al bajar.
- Las descargas se cuentan por version y se suman por app.
- El servidor no reescribe el APK: lo que se sube es exactamente lo que se baja.
- Los nombres de archivo al descargar son `app-version.apk` (sin espacios raros).
