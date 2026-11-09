# Archivos del Directorio Distrital de Clubes — v4.1306

Logotipo, portada y galería del formulario `/clubes/registro` (y
`/clubes/actualizar`), y del portal del club (`/clubes/portal`), pasan por un
solo camino con dueño, confirmación del servidor y persistencia en el borrador.

## El defecto (causa raíz, verificada)

Reporte: «no deja subir el logo» (campo «Logotipo oficial del club»).

1. `UnifiedClubForm.tsx` y `ClubPortalPage.tsx` subían por
   `POST /api/rotary-en-accion/presign` —el presign de los **aportes de
   contenido de una campaña**— mandando `{ filename, contentType, prefix }`
   **sin `size`**. `checkFileMeta` (`contentSubmissionSpec.js`) trata un tamaño
   ausente como `«El archivo llegó vacío.»` → **400 siempre**. El usuario veía
   «No se pudo cargar la imagen. Intenta con un archivo JPG o PNG de menor
   tamaño» (un consejo falso: el tamaño nunca llegaba).
2. Aunque hubiera pasado, ese presign devuelve `{ key, uploadUrl }` en el
   prefijo PRIVADO `private/campaign-submissions/{campaña universal}/` y **no**
   `publicUrl` ni `url`: el formulario guardaba `logoUrl = undefined` y
   anunciaba «Logotipo cargado exitosamente». Los archivos, además, caían en la
   carpeta de otra funcionalidad.
3. El portal ni comprobaba `presignRes.ok` ni el resultado del `PUT`.
4. El `<input type="file">` nunca se vaciaba: después de un error, elegir el
   MISMO archivo no disparaba `onChange` (parecía que el botón no respondía).

No era el botón ni el `<input>` (el `<label>` lo abría bien), ni MIME, ni S3.

## Piezas

| Pieza | Archivo |
|---|---|
| Criterio puro (formatos, topes por entorno, nombres, ids en el payload, `stripSecrets`) | `server/lib/clubMediaSpec.js` — espejo `src/lib/clubMediaSpec.ts` |
| S3: tres prefijos, nada fuera de ellos | `server/lib/clubMediaStorage.js` |
| Servicio: tabla `DistrictClubMedia`, procesar, confirmar, eliminar, vincular, publicar, limpiar | `server/lib/clubMediaStore.js` |
| Endpoints `/api/district-clubs/media/*` y `GET /admin/submissions/:id/media` | `server/controllers/clubMediaController.js`, `server/routes/district-clubs.js` |
| Borrador (token del servidor, sin contraseñas), envío (vincular), aprobación y perfil (publicar) | `server/controllers/districtClubsController.js` |
| Cliente: presign → PUT con XHR (progreso) → confirm, con topes de tiempo y `leerJson` | `src/lib/clubMediaUpload.ts` |
| **Club Media Uploader** (`ClubMediaUploader` + `ClubGalleryUploader`) | `src/components/directory/ClubMediaUploader.tsx` |
| Panel: «Archivos del registro» en la ficha de la solicitud | `src/components/directory/ClubSubmissionMedia.tsx` (en `DistrictClubsAdmin.tsx` y `RotaryDirectorioClubes.tsx`) |
| Pruebas | `npm run test:club-media` (sin red) · `CLUB_MEDIA_E2E_DATABASE_URL=… npm run test:club-media:e2e` |

## El recorrido de un archivo

```
presign  (valida tipo/peso declarados, exige dueño, crea fila «subiendo»)
  → PUT directo a S3: private/directorio-clubes/originales/{id}.{ext}   (original intacto)
  → confirm: HEAD (peso real) → GET → sha256 → ¿duplicado? → sniffImageBytes
             → HEIC→JPG (convertHeicToJpeg) → sharp .rotate() (EXIF) → sin metadatos
             → private/directorio-clubes/archivos/{id}.png|jpg   (+ HEAD de verificación)
             → fila «guardado»   (portal: además directorio-clubes/{perfil}/{id}.*, «publicado»)
  → el formulario guarda la URL ESTABLE /api/district-clubs/media/{id} y autoguarda el borrador
  → envío: bindToSubmission (sólo lo de ESTE borrador / perfil y guardado)
  → aprobar: publishMediaInPayload → CopyObject al prefijo público; la URL pública reemplaza a la estable
```

`GET /api/district-clubs/media/:id` redirige: a la pública si ya se publicó; si
no, a un enlace firmado de 15 min (Cache-Control `private, max-age=600`, menor
que la firma). Un eliminado sin publicar da 404.

## Decisiones (no deshacer sin razón)

- **«Guardado» = confirmación del servidor.** Ni el componente ni la lib
  anuncian éxito antes de `POST /media/confirm`. Al reabrir un borrador, el
  componente PREGUNTA (`POST /media/status`) antes de pintar «Guardado».
- **Contenido real, no extensión.** `sniffImageBytes`: JPEG/PNG/WEBP/HEIF. Un
  JPEG con nombre `.heic` se procesa como JPEG; texto con nombre `.png` es
  `not_image`. **SVG no** (no hay sanitizador en la plataforma). AVIF no.
- **Se re-codifica siempre** (sharp): orientación aplicada, metadatos fuera
  (GPS), lado mayor 2000 px (logo) / 2560 px (fotos). Logo con alfa → PNG; el
  resto → JPEG. El ORIGINAL se conserva intacto en `originales/`.
  (La regla «no postprocesar» de CLAUDE.md es del Generador de Publicaciones,
  no de esto.)
- **Dueño explícito.** Formulario: `draftToken` de un borrador que existe y no
  está aprobado/rechazado. Portal: JWT del portal (`aud rotary-club-portal`),
  `profileId`. Confirmar, consultar, eliminar exigen ser el dueño; lo ajeno en
  `status` devuelve `ajeno` sin URL; lo ajeno en un envío se quita del payload.
- **El token de un borrador NUEVO lo genera el servidor** (`draft_{uuid}`).
  Antes el navegador mandaba `draft_${Date.now()}` (adivinable) y el servidor
  lo aceptaba. Un token que ya existe en la base se sigue respetando.
- **La contraseña del portal no se guarda** en borradores ni en el payload del
  envío (`stripSecrets`, en navegador y servidor). Antes quedaba en texto plano
  en `DistrictClubSubmission.payload`.
- **Privado hasta aprobar.** El formulario público sólo produce objetos en
  `private/…`; al aprobar se copian a `directorio-clubes/{perfil}/`. Desde el
  portal (perfil ya publicado, sin revisión en ese flujo) se publica al
  confirmar; el perfil lo usa al pulsar «Guardar y publicar».
- **Eliminar no borra bytes.** Marca `eliminado`; `cleanupClubMedia` purga a
  los 30 días y SÓLO si ningún payload ni perfil lo menciona. Las subidas que
  nunca se confirmaron (o fallaron) se limpian a los 2 días. Un `guardado` de
  un borrador **nunca** se toca. Corre de forma oportunista desde `presign`
  (como mucho cada 6 h por instancia).
- **Duplicados por sha256** del original, por dueño y campo: se devuelve el que
  ya estaba (`duplicate: true`) y se borra el original repetido.
- **Candado de confirmación** (`UPDATE … WHERE status IN ('subiendo','error')`):
  doble clic o reintento del navegador no procesan dos veces; un `procesando`
  de más de 3 min se da por muerto.
- **Reemplazo sin hueco:** el nuevo se confirma y se asocia ANTES de retirar el
  anterior.
- **Freno propio** (`mediaLimit`, 180/min por IP) en vez de `lightPublicLimit`
  (40/min): una galería de 20 fotos son 40 peticiones.
- **Topes por entorno:** `CLUB_MEDIA_MAX_MB_LOGO` (15), `CLUB_MEDIA_MAX_MB_COVER`
  (30), `CLUB_MEDIA_MAX_MB_GALLERY` (30), `CLUB_MEDIA_GALLERY_MAX` (30). El
  navegador los lee de `GET /media/limits`.
- **Guardado automático:** el borrador se crea al pasar el paso 1 (o al subir
  el primer archivo); después, 400 ms tras un cambio de archivos y 3 s tras
  texto. `ensureDraft` usa una promesa compartida para no crear dos borradores.

## Tabla `DistrictClubMedia`

Fuera de Prisma (en el guardián de `db:push` y en CLAUDE.md). Una fila por
archivo: `role`, `status` (`subiendo`, `procesando`, `guardado`, `publicado`,
`error`, `duplicado`, `eliminado`), `ownerKind`, `draftToken`, `profileId`,
`submissionId`, nombre y tipo declarados, `originalKey`, `sha256`,
`detectedFormat`, `storageKey`, `outputType`, medidas, `converted`,
`publicKey`/`publicUrl`, `errorCode`/`errorMessage`, `attempts` y `history`
(JSONB con cada acción: preparada, guardado, error, eliminado, publicado y por
quién). Todo `ADD COLUMN` futuro va en `OWNED_COLUMNS`.

## Límites conocidos

- La conversión HEIC usa la misma librería que v4.1305 (`heic-decode`); en este
  módulo se prueba con contenedores HEIF falsos y JPEG con nombre `.heic`, no
  con un HEIC real (la prueba de v4.1305 sí los usa con `HEIC_FIXTURES`).
- La subida es un PUT único (no por partes): los topes de 15–30 MB por imagen
  lo hacen innecesario. Si algún día entran videos, usar el multiparte del
  formulario institucional de programas.
- Los perfiles anteriores conservan sus URLs (p. ej. logos ya publicados): se
  muestran como «En el directorio» y se pueden reemplazar.
