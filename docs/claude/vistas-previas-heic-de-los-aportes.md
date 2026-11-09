# Vistas previas HEIC/HEIF de los aportes — v4.1305

Las fotos HEIC/HEIF que un club adjunta en **Visitas del Gobernador** y en el
formulario general de **Rotary en Acción** se ven en cualquier navegador: el
servidor genera una vista previa JPEG y una miniatura al lado del original, sin
tocarlo.

## El defecto (causa raíz, verificada)

Reporte: la visita `VG-2026-SG53HR` (Club Rotario Manizales) mostraba recuadros
vacíos con el nombre del archivo (`20261026_102617.heic`, …).

- Las fotos de un aporte suben **directo a S3** con URL prefirmada, al prefijo
  privado `private/campaign-submissions/{campaña}/` (`submissionFiles.js`). El
  panel las mostraba con un enlace firmado **al original**.
- **Ningún navegador salvo Safari dibuja HEIC.** Comprobado en Chromium: el
  `<img>` del `.heic` queda con `naturalWidth = 0` (el ícono roto con el `alt`,
  que es el nombre del archivo: exactamente la captura).
- La conversión HEIC → JPEG existía desde v4.739, pero **sólo en la Librería de
  Medios** (`server/routes/media.js`). Este camino nunca pasa por la Librería
  hasta que se publica, y al publicar `copyToLibrary` copiaba el `.heic` tal
  cual: también se habría visto roto en el sitio público.
- No era MIME, permisos ni URLs: los enlaces firmados funcionan (los JPG de la
  misma visita se ven); el contenido es el que el navegador no sabe decodificar.
- El nombre `20261026_102617.heic` es el patrón de **Samsung** (un iPhone usa
  `IMG_1234.HEIC`): también hay Android que guardan HEIF. Mismo códec (HEVC),
  misma solución.
- **sharp 0.34.5 NO decodifica HEVC** (sus binarios traen libheif sin el
  decodificador): `sharp(heic).jpeg()` falla con «Support for this compression
  format has not been built in». Lee el contenedor (medidas, orientación,
  perfil ICC), y eso sí se usa.

## Piezas

| Pieza | Archivo |
|---|---|
| Servicio (criterio puro, esquema, render, orquestación, inventario, lotes) | `server/lib/submissionImagePreviews.js` |
| Conversión HEVC (libheif vía `heic-decode`), color P3 → sRGB, `sniffImageBytes` | `server/lib/heicImages.js` |
| S3: lectura con motivo, escritura sólo en `_preview/`, descarga con nombre, verificación por bytes | `server/lib/submissionFiles.js` |
| Visitas: galería, `POST /visitas-gobernador/preview` (público), `POST …/admin/:id/previews`, `GET …/admin/previews/summary`, `POST …/admin/previews/batch` | `server/controllers/governorVisitController.js`, `server/routes/rotary-en-accion.js` |
| Solicitudes: `filesForView`, `POST /contribution-campaigns/:id/submissions/:sid/previews` | `server/controllers/contentSubmissionController.js`, `server/routes/contribution-campaigns.js` |
| Publicación: `promoteHeicToLibrary` | `server/lib/contentSubmissionStore.js` |
| Reels, artículo (medición de portada), Centro de Control: `bestStagingUrl` / vista previa | `submissionReelController.js`, `submissionArticleController.js`, `missionControlController.js`, `submissionArticleEngine.js` |
| Galería de revisión (miniaturas, visor, estados, reintentar, descargar original) | `src/components/media/ReviewGallery.tsx` |
| Panel de visitas (generación al abrir, aviso «Fotos HEIC» con reparación por lotes) | `src/components/admin/rotary/RotaryVisitasGobernador.tsx` |
| Ficha de una solicitud | `src/components/admin/contribution/SubmissionDetail.tsx` |
| Formulario público (miniatura tras subir) | `src/components/rotary/GovernorVisitForm.tsx` |
| Recuperación por terminal | `npm run heic:recover` (`scripts/heic-previews-recover.mjs`) |
| Prueba | `npm run test:heic-previews` (`scripts/test-heic-previews.mjs`) |

## Decisiones (no deshacer sin razón)

- **El original NUNCA se modifica.** Las derivadas van a
  `…/{campaña}/_preview/{uuid}.jpg` y `{uuid}.thumb.jpg`. `putStagingDerivative`
  se niega a escribir fuera de `_preview/`; `stagingKeyBelongs` impide que un
  envío reclame una derivada (o un objeto `_analysis/`) como propia. Es la
  lección de v4.740-741 en la Librería: una conversión no puede ser destructiva.
- **Sólo HEIC/HEIF** (por MIME **o** extensión, como `isHeicFile`). JPG, PNG y
  WEBP siguen exactamente igual: `url = thumbUrl =` enlace firmado al original.
- **Una tabla, `SubmissionImagePreview`**, una fila por objeto ORIGINAL
  (`sourceKey`). Estados `pending → processing → ready | error`. Es lo que hace
  el proceso:
  - **idempotente** (una fila `ready` no se reconvierte; claves derivadas
    deterministas),
  - **sin duplicados concurrentes** (se reclama la fila con un UPDATE
    condicional y un candado de 120 s que vence solo si el proceso muere),
  - **reanudable** (el lote pide «lo que no está listo»),
  - **con reintentos acotados** (`PREVIEW_MAX_AUTO_ATTEMPTS = 3`; después sólo
    con `force`, el botón «Reintentar»),
  - **con errores identificables** (`errorCode`: `missing`, `too_large`,
    `timeout`, `not_image`, `corrupt`, `decode_mismatch`, `storage`, y el texto
    para la persona). Un `missing` no ofrece reintento: el club tiene que
    volver a enviar la foto.
  Como la fila es por clave de S3, la misma foto sirve a la visita y a la
  solicitud de Rotary en Acción que nace al publicarla: se convierte una vez.
  Está en el guardián de `db:push` (dinámico) y en CLAUDE.md.
- **Un HEIC sin vista previa lista NO devuelve `url`.** Pintar el original es
  el recuadro roto; la galería muestra «Generando vista previa…» o el error.
- **Contenido real, no extensión:** `sniffImageBytes` (firma JPEG/PNG/WEBP,
  marcas `ftyp` de HEIF y AVIF). Un JPEG llamado `.heic` se procesa con sharp;
  un texto llamado `.heic` falla con `not_image`. En la verificación del envío
  (`headSubmissionFile`) se leen los primeros 256 bytes de cada FOTO: lo que no
  es imagen se rechaza con su nombre, y un HEIF con extensión `.jpg` queda como
  `image/heic` para recibir su vista previa.
- **Calidad:** vista previa JPEG q86 progresivo, lado mayor ≤ 2560; miniatura
  q78 ≤ 480. Orientación horneada (`orientationOps` / `.rotate()`), sin EXIF
  ni GPS (sharp no copia metadatos si no se le pide). Transparencia asentada
  sobre blanco (JPEG no tiene alfa). Profundidad: libheif entrega 8 bits.
- **Color:** libheif entrega los píxeles en los primarios de la foto sin
  aplicar su perfil. Si el ICC del contenedor es **Display P3** (iPhone, muchos
  Samsung) se convierte a sRGB en el buffer (`p3ToSrgbInPlace`, matriz estándar
  P3-D65 → sRGB con linealización); sin perfil o con otro, los valores se toman
  como sRGB. Antes salía apagada. Aplica también a la conversión de la Librería.
- **Límites (configurables por entorno):** `IMAGE_PREVIEW_MAX_BYTES` (50 MB),
  `IMAGE_PREVIEW_MAX_MEGAPIXELS` (64: entra un iPhone de 48 MP),
  `IMAGE_PREVIEW_TIMEOUT_MS` (45 s). Las medidas se leen del contenedor ANTES
  de decodificar: un archivo que declara dimensiones absurdas no llega a pedir
  memoria. libheif corre en WASM (sin código nativo con el archivo).
- **Sin cola de trabajos (Vercel), por tandas con presupuesto de tiempo.** Cada
  petición convierte lo que entra en ~50 s y dice `remaining`; la pantalla
  repite. Disparadores:
  1. el formulario, en cuanto termina de subir una foto HEIC
     (`POST /visitas-gobernador/preview`, sólo objetos del prefijo del
     formulario y SIN reclamar: no es una puerta para mirar material enviado);
  2. el panel, al abrir una visita o una solicitud con fotos pendientes;
  3. el aviso «Fotos HEIC» de Visitas del Gobernador (lote global de visitas
     y solicitudes) y `npm run heic:recover`;
  4. la publicación y la promoción, que generan lo que falte.
- **Publicar usa el JPEG** (`promoteHeicToLibrary`): copia de objeto a objeto
  la vista previa, la miniatura y el original; la fila de `Media` queda con
  `url` = JPEG, `thumbUrl` = miniatura y `originalS3Key` = HEIC (la misma
  convención de la Librería: se borra con la fila). Recién después se libera
  staging. Si la vista previa no se pudo generar se promueve el original como
  antes —perderlo sería peor— y `adminPublishVisit` avisa con los nombres.
- **Lo ya promovido como `.heic`** (antes de v4.1305) se arregla en la
  Biblioteca con «Convertir a JPG» (`POST /api/media/:id/convert`, en lote
  `bulk-convert`): no se duplica aquí.
- **Acceso:** derivadas en el prefijo privado, enlaces firmados de 15 min (1 h
  la miniatura del formulario). El original se descarga con
  `response-content-disposition` firmado (su nombre). Panel: ver la ficha y
  generar sus vistas = `rotary_en_accion.view` (sólo derivados); lote global =
  `.edit`. Solicitudes: el mismo gate de la ficha (`siteRead` +
  `requireCampaignAccess`).

## Recuperación de lo ya enviado (Manizales primero)

1. Tras el despliegue, abrir la visita `VG-2026-SG53HR` en
   `/admin/rotary-en-accion?tab=visitas`: la ficha genera sola las vistas
   previas que faltan («Generando las vistas previas…») y la galería se
   completa. Las que fallen dicen por qué, con «Reintentar».
2. Después, el aviso «Fotos HEIC: N de M con versión compatible» →
   «Generar N vista(s) previa(s)» recorre todas las visitas y solicitudes.
   «Ver cuáles fallaron» lista visita/solicitud, archivo y motivo.
3. Desde una terminal con las variables del despliegue:
   `npm run heic:recover -- --visit=VG-2026-SG53HR`, luego `npm run heic:recover`
   (`--dry-run` sólo inventario, `--retry-errors` incluye las fallidas). Sale
   con código 1 si quedan errores, listándolos.

## Cómo se probó (v4.1305)

- `npm run test:heic-previews` — **63 comprobaciones** con
  `HEIC_FIXTURES` (16 HEIC/HEVC reales de los ejemplos de libheif y de las
  muestras de conformidad de Nokia, no versionados) y
  `HEIC_E2E_DATABASE_URL` (Postgres 16 local + S3 simulado + controladores
  reales). Sin esas variables corren las 29 puras. Cubre: detección, claves,
  bytes reales, errores, P3 → sRGB, JPEG/PNG/WEBP horizontales, verticales, de
  6000×4000, con EXIF 6 (verificado por píxel), transparencia, topes,
  corruptos; y de punta a punta la visita de Manizales: estados antes, original
  descargable con su nombre, generación al abrir, originales byte a byte
  intactos, idempotencia (cero escrituras al repetir), dos peticiones
  simultáneas = una conversión, tres reintentos automáticos, «Reintentar»,
  archivo perdido, lote reanudable, endpoint público (y 409 para lo ya
  reclamado), verificación por bytes, y la promoción a la Biblioteca (JPEG +
  miniatura + HEIC original, staging liberado).
- Chromium (Playwright): el `.heic` en `<img>` da `naturalWidth = 0`; la
  galería nueva dibuja las miniaturas (480 px) y el visor (1280 px), navega con
  ← → y Escape, y a 390 px no hay desborde horizontal.
- `test:visitas-gobernador` (128), `test:submissions` (108),
  `test:submissions:inbox`, `test:submissions:gate`, `check:*`.

## Pendiente / límites conocidos

- Safari, Firefox y Edge no se probaron en este entorno (sólo Chromium, que es
  el motor de Edge). El JPEG resultante es baseline/progresivo estándar.
- El formulario general de Rotary en Acción (`RotaryEnAccionForm.tsx`) todavía
  no pide la miniatura tras subir: su HEIC se convierte al abrirse en
  Solicitudes, en el lote o al promover.
- Un HEIC con AV1 (raro en cámaras) no lo decodifica el libheif empaquetado;
  queda en `error` con su motivo.
- `test:heic` arrastra 2 fallas previas (borrado de la Librería), ajenas a este
  cambio; `test:submissions:article` y `:reel` también tenían fallas previas.
