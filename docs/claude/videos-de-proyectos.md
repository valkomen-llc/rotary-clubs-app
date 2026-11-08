<!-- Léelo ANTES de tocar el video propio del club, la pestaña «Videos de proyectos» o la cuadrícula de «Mi proyecto». El Video Pitch Profesional tiene su propio archivo: video-pitch.md. -->

## Videos de proyectos — el video PROPIO del club (v4.1298)

Pedido del comité: que un club que YA tiene un video de su proyecto lo suba
desde `/mi-proyecto` sin contratar producción, compruebe que quedó guardado,
lo reproduzca y siga su estado; y que el comité lo revise, apruebe, pida
correcciones o rechace. Convive con el Video Pitch Profesional (modalidad B,
`docs/claude/video-pitch.md`) sobre la misma postulación: dos caminos, dos
tarjetas lado a lado, procesos y tablas INDEPENDIENTES.

| Archivo | Qué es |
|---|---|
| `server/lib/projectVideoSpec.js` | El CRITERIO, puro: estados y transiciones (comité y club), formatos por bytes (MP4, MOV, WebM), configuración administrable (`normalizeConfig`), validación para enviar, advertencias que nunca rechazan, política de reemplazo, tarjeta, avisos |
| `server/lib/ensureProjectVideoSchema.js` | Las cinco tablas (con `OWNED_COLUMNS`) |
| `server/lib/projectVideoStorage.js` | S3 privado `private/project-videos/{video}/`: PUT prefirmado (2 h), inspección por rangos, GET firmado (20 min) |
| `server/controllers/projectVideoController.js` | Portal del club y administración; `applyStatus` es el ÚNICO sitio que cambia el estado |
| `src/lib/projectVideo.ts` | Tipos compartidos |
| `src/components/project-forms/ProjectVideoCard.tsx` | La tarjeta «Video del proyecto · Video propio · Sin costo» |
| `src/components/project-forms/ProjectVideoView.tsx` | Ficha, subida con avance real, reproductor, autorización, envío, retiro, observaciones, historial |
| `src/components/admin/feria/ProjectVideosAdmin.tsx` | El módulo UNIFICADO «Videos de proyectos»: resumen de las dos modalidades, pestañas «Videos propios» (bandeja, ficha, configuración) y «Video Pitch Profesional» (monta `VideoPitchAdmin` sin cambios) |

Rutas (`server/routes/project-fair.js`):

| Ruta | Quién |
|---|---|
| `GET/POST /portal/project-video` · `POST …/:id/presign` · `POST …/:id/versions` · `POST …/:id/submit` · `POST …/:id/withdraw` · `GET …/:id/url` | El club, con su token del panel; la postulación sale del token y cada video se comprueba contra ella |
| `GET /admin/project-videos` · `GET …/:id` · `GET …/:id/versions/:versionId/url` · `GET …/config` | `fairRead` + `view` |
| `POST …/:id/status` · `PATCH …/:id` | `fairEdit` + `changeStatus` |
| `POST …/:id/comments` | `fairEdit` + `comment` |
| `PUT …/config` | `fairManage` + `config` |

`config` es LITERAL: declarada antes de `/:id` (`check:routes`).

### Modelo de datos

- `ProjectVideo` — un video por postulación (hasta `maxActiveVideos` activos):
  ficha (título, descripción, idioma, año, notas), `status`, `currentVersionId`,
  consentimiento (`consentAccepted`, `consentVersion`, `consentText`,
  `consentAt`: la EVIDENCIA, texto incluido), `reviewNote` (la última decisión
  del comité), `adminNotes`.
- `ProjectVideoVersion` — INMUTABLE: cada archivo que ocupó el lugar, con
  tipo real, peso de S3, dimensiones y duración declaradas por el navegador,
  advertencias. Reemplazar agrega una fila; nada se borra.
- `ProjectVideoEvent` — historial (`visibility` `all` | `internal`). Las
  filas con `videoId = 'config'` son la bitácora de la configuración.
- `ProjectVideoNotification` — `(videoId, dedupeKey)` único.
- `ProjectVideoConfig` — JSONB por `scope` (la edición o `'global'`).

### Estados

`none` (virtual) → `draft` → `received` → `in_review` → `approved` |
`changes_requested` | `rejected`; `withdrawn` por el club desde `received` o
`in_review`. Tras correcciones o retiro el club vuelve a `received`. Las tablas
`ADMIN_TRANSITIONS` / `PARTICIPANT_TRANSITIONS` son la verdad; 409 con las
salidas posibles.

### Reglas durables

- **⚠️ «RECIBIDO» ES LO QUE EL SERVIDOR PUEDE AFIRMAR.** La versión se
  registra sólo después de inspeccionar el objeto REAL (peso de S3, bytes
  `ftyp`/`moov`/EBML). El navegador muestra «Subiendo… → Confirmando con el
  servidor → Recibido»; nunca dice «subido correctamente» antes del 201. Un
  objeto rechazado se borra; una subida que nunca llegó devuelve 422 y el club
  reintenta sin duplicar.
- **El estado sólo cambia por `applyStatus`** (la prueba cuenta las escrituras
  de `status`). Pedir correcciones o rechazar EXIGE motivo: el club lo ve en su
  perfil (`reviewNote`) y recibe correo.
- **Sin costo, sin Stripe.** El controlador no importa nada comercial; la prueba
  lo fija con una expresión regular. Subir un video propio no toca el Video
  Pitch (borrador, plan, orden) ni la postulación: sólo dos entradas en el
  historial de la postulación (`project_video_received`, `project_video_approved`).
- **El club edita la ficha y el archivo en `draft`, `changes_requested` y
  `withdrawn`**; la ficha también en `received`. En manos del comité no se
  reemplaza el archivo: primero se retira. Un video aprobado no se reemplaza
  salvo política `always`, y entonces vuelve a `in_review` (lo aprobado era
  OTRO archivo).
- **Autorización de uso aparte de la aprobación.** Enviar exige aceptar el
  texto configurable (`requireConsent`); se guarda el texto y su versión. La
  aprobación del comité NO publica nada: `publicVisibility` es una llave para
  una galería futura y hoy ningún endpoint público lee estas tablas.
- **Advertencias, no rechazos**: vertical, resolución baja, clip corto, más
  largo de lo sugerido o por encima del tope reglamentario (`maxDurationSec`,
  0 = sin tope). Los límites duros son formato y peso (`maxSizeMb`, 10–5000).
- **Configuración por edición** (`PUT /admin/project-videos/config?evento=`),
  con la global de respaldo y los valores por defecto debajo: formatos, tope,
  duraciones sugerida y máxima, resolución, máximo de videos activos, fecha
  límite, recomendaciones, política de reemplazo, autorización y su texto,
  flujo (`committee` | `auto_receive`: queda aprobado al recibirse), llave de
  visibilidad, encendido. La comercial de los planes del Video Pitch va aparte.
- **La cuadrícula de «Mi proyecto»**: formularios → plantilla → 31A → **video
  propio (izquierda) | Video Pitch (derecha)**. Cada tarjeta lleva su chip:
  «Video propio · Sin costo» / «Producción profesional · Servicio de pago».
  La tarjeta del Video Pitch dejó de ocupar dos columnas (la prueba de
  v4.1293 se actualizó).
- **El módulo administrativo es uno**: pestaña «Videos de proyectos» de
  Postulación de Proyectos (`?tab=videopitch&videos=own|pitch`) y entrada del
  menú con ese nombre. El resumen de arriba lee los indicadores de CADA
  endpoint (`/admin/project-videos`, `/admin/video-pitch`): no hay segunda
  fuente de datos.

### Cómo se probó

- `npm run test:project-videos` — criterio e invariantes, sin base ni red.
- `FAIR_E2E_DATABASE_URL=… npm run test:project-videos:e2e` — Postgres real,
  S3 simulado, router real: las doce pruebas del pedido (subir y reproducir,
  permisos de otro club, carga interrumpida, sin Stripe, Video Pitch pendiente
  de pago intacto, el comité recibe el video correcto, observaciones en el
  perfil, reemplazo con historial, nada público, archivos inválidos, volver a
  entrar, Video Pitch sin regresiones), más configuración y retiro.

### Pendientes conocidos

- **Miniatura y procesamiento**: no hay transcodificación ni captura de
  fotograma en el servidor (`processingStatus` queda `ready` al registrar). El
  reproductor usa el archivo original con enlace firmado; un MOV con códec
  HEVC puede no reproducirse en todos los navegadores (se recomienda MP4
  H.264 + AAC en las recomendaciones).
- **Carga multiparte/reanudable**: PUT único prefirmado (S3 admite hasta
  5 GB); una conexión cortada obliga a reintentar desde cero. Reutilizar el
  patrón multiparte del formulario institucional de programas si hiciera falta.
- **Galería pública**: fuera de alcance; la llave `publicVisibility` existe
  para no reescribir el modelo cuando se pida.
- **CORS del bucket**: igual que los demás módulos con PUT desde el navegador.
