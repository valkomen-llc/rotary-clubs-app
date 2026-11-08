<!-- Léelo ANTES de tocar el Video Pitch, la tarjeta de «Mi proyecto» que lo abre o la pestaña «Video Pitch» de Postulación de Proyectos. -->

## Video Pitch Profesional — Feria de Proyectos Rotary Colombia (v4.1293)

Pedido del comité: que los clubes que postularon un proyecto soliciten desde
`/mi-proyecto` la producción de un **video de presentación** para movilizar
apoyo (donantes internacionales, clubes patrocinadores, distritos, fundaciones,
aliados), reutilizando lo que la plataforma ya sabe del proyecto; que el comité
gestione las solicitudes, genere el guion con IA, lo apruebe con el club,
produzca y entregue; y que todo quede auditado. Reemplaza el formulario suelto
de la 11.ª Feria (captura 2 del pedido) por un flujo dentro de la plataforma.

| Archivo | Qué es |
|---|---|
| `server/lib/videoPitchSpec.js` | El CRITERIO, puro: estados y transiciones (comité y club), formulario (precarga, avance, validación), archivos (tipo REAL por bytes, topes, advertencias), estructura del guion (cinco escenas), avisos, número, CSV |
| `server/lib/ensureVideoPitchSchema.js` | Las cinco tablas (con `OWNED_COLUMNS`) |
| `server/lib/videoPitchStorage.js` | S3 privado `private/video-pitch/{solicitud}/`: PUT prefirmado (60 min), inspección por rangos, GET firmado (15 min, inline o attachment) |
| `server/lib/videoPitchAI.js` | **Rotary Video Pitch AI**: el expediente de hechos (`buildDossier`), el prompt, la generación vía `generateCopy` y la auditoría de cifras (`auditScript`) |
| `server/controllers/videoPitchController.js` | Portal del club y administración; `applyStatus` es el ÚNICO sitio que cambia el estado |
| `src/lib/videoPitch.ts` | Tipos, tonos, subida con avance, lectura de dimensiones en el navegador |
| `src/components/project-forms/VideoPitchCard.tsx` | La tarjeta de «Mi proyecto» (dos columnas) |
| `src/components/project-forms/VideoPitchRequestView.tsx` | Formulario (bloques A–D), seguimiento, decisión sobre el guion, video |
| `src/components/admin/feria/VideoPitchAdmin.tsx` | Pestaña «Video Pitch»: bandeja, ficha, galería, editor de guiones, producción, historial |

Rutas (`server/routes/project-fair.js`):

| Ruta | Quién |
|---|---|
| `GET/PUT /portal/video-pitch` · `POST …/submit` · `POST …/files/presign` · `POST …/files` · `PATCH/DELETE …/files/:fileId` · `GET …/files/:fileId/url` · `POST …/script/decision` · `POST …/messages` | El club, con su token del panel (`portalAuth`). La postulación sale del token |
| `GET /admin/video-pitch` · `GET …/:id` · `GET …/:id/files/:fileId/url` · `GET …/:id/scripts/:scriptId` | `fairRead` + capacidad `view` |
| `GET …/export.csv` | `fairRead` + `export` |
| `POST …/:id/comments` | `fairEdit` + `comment` |
| `POST …/bulk` · `PATCH …/:id` · `POST …/:id/status` · archivos · guiones (`generate`, guardar, `current`, `send`, `approve`) | `fairEdit` + `changeStatus` (admin y revisor del módulo) |

Literales (`export.csv`, `bulk`) ANTES de `/:id` (`check:routes`).

### Modelo de datos

- `VideoPitchRequest` — UNA por postulación (`submissionId` único). `number`
  (`VP-AAAA-0001`, se asigna al ENVIAR), `status`, `answers` (JSONB con los
  cuatro bloques), `completionPct`, responsable de producción, `currentScriptId`
  (la versión vigente), `approvedScriptId`, `deliverableFileId`,
  `thumbnailFileId`, `infoRequest` (lo que el comité pidió), `adminNotes`.
- `VideoPitchFile` — `role`: `material` (del club), `deliverable` (video final),
  `thumbnail`. Tipo REAL por bytes; `width/height/durationSec` los DECLARA el
  navegador (sólo él puede leerlos sin bajar el archivo) y `warnings` sale de
  ahí. Borrado lógico (`deletedAt`) + borrado del objeto: la fila queda en el
  historial.
- `VideoPitchScript` — INMUTABLE. `(requestId, versionNumber)` único. `source`
  `ai`|`manual`, `status` `draft`|`sent_to_participant`|`approved`|`superseded`,
  parámetros de la generación, `content` (título, resumen, cinco escenas,
  `missingInfo`, `totalSeconds`, `audit`), `basedOnId`.
- `VideoPitchEvent` — historial; `visibility` `all` (lo ve el club) o
  `internal`.
- `VideoPitchNotification` — `(requestId, dedupeKey)` único, con
  `dedupeKey = kind:eventoQueLoCausó`. Un cambio = un correo.

### Los estados

`not_requested` (virtual) → `draft` → `submitted` → `in_review` ⇄
`info_required` → `script_in_progress` → `script_pending_approval` →
`script_approved` → `in_production` → `video_in_review` → `finished` →
`delivered`; `cancelled` desde casi todos. Las tablas `ADMIN_TRANSITIONS` y
`PARTICIPANT_TRANSITIONS` son la verdad; el servidor contesta 409 con las
salidas posibles. **Producir exige guion aprobado; entregar exige el video**
(`transitionRequirements`). En bloque sólo los pares de `BULK_STATUS_PAIRS`.

### Reglas durables

- **⚠️ EL ESTADO SÓLO CAMBIA POR `applyStatus`.** Valida la transición según
  quién actúa, exige lo que el destino necesita, asigna el número al enviar,
  escribe el historial, refleja dos hitos en el historial de la postulación
  (`video_pitch_requested`, `video_pitch_delivered`) y avisa UNA vez. La prueba
  cuenta las escrituras de `status` en el controlador: una.
- **El club sólo edita en `draft` e `info_required`.** Enviado, ni respuestas
  ni materiales (409). Reenviar tras «información requerida» conserva el
  número y limpia `infoRequest`.
- **El proyecto, el club y el distrito NO se escriben en la solicitud:**
  salen de la postulación (`lockedIdentity`). Una cuenta del portal es UNA
  postulación (`ProjectFairAccount.submissionId` único), así que «otros
  proyectos autorizados» no existe en el modelo de hoy: el formulario lo dice y
  manda a escribir al comité para vincular.
- **Disponible = postulado (`isApplied`).** NO depende del pago ni de que la
  postulación esté archivada (v4.1294: archivar es administrativo y el club no
  lo ve; bloquearlo dejaba la tarjeta muerta). La bandeja marca «Archivada» y
  el comité cancela si corresponde. Un borrador de postulación ve el motivo.
- **La entrada «Video Pitch» del menú lleva a `?tab=videopitch` sin edición**:
  el listado de ediciones conserva la pestaña al abrir una y, si la elección es
  obvia (una sola vinculada o una sola abierta), la abre solo (`autoOpen`).
  Antes `onOpen` borraba `tab` y el enlace del menú caía siempre en el Centro
  de Inteligencia.
- **La IA NO inventa.** `buildDossier` arma el expediente con FUENTE por línea
  (postulación, Formulación, solicitud); el prompt prohíbe afirmar lo que no
  está y obliga a `missingInfo`; `auditScript` marca toda cifra del guion que
  no aparezca en el expediente (`content.audit.suspicious`) y la pestaña lo
  pinta en ámbar. Un material inexistente NO se cita (`normalizeScript` filtra
  por los ids reales). La IA sólo ve los materiales del club, nunca el video
  final.
- **Sin proveedor de IA la generación falla con 502 y el mensaje del
  proveedor**, nunca 500. El guion manual siempre funciona.
- **El club sólo ve los guiones que el comité le MANDÓ o aprobó**, y sólo ve el
  video cuando el estado es `delivered` (antes, 403). Las notas internas
  (`visibility = 'internal'`) no le llegan.
- **El archivo nunca pasa por la función** (Vercel corta en 4,5 MB): PUT
  prefirmado y GET firmado. El tipo se juzga por los BYTES del objeto ya subido
  y un objeto rechazado se borra. Advertencias de calidad (vertical, baja
  resolución, clip muy corto) NUNCA rechazan.
- **Los materiales no bloquean el envío**: se avisa y el comité los pide con
  `info_required`. El consentimiento sobre los materiales SÍ es obligatorio.
- **El bloque B es UN campo opcional (v4.1295).** El comité pidió no volver a
  pedir lo que ya está en la postulación y la Formulación. La vista muestra el
  CONTEXTO en sólo lectura (`projectContextOf`: los `CONTEXT_TOPICS` con valor,
  y si hay Formulación) y debajo «Información adicional para el video», sin
  mínimo. Las claves de las preguntas guiadas de v4.1293–v4.1294
  (`LEGACY_STORY_KEYS`) se conservan si un borrador las trae y el expediente de
  la IA las sigue leyendo; no se piden ni se crean vacías. Sin contexto y sin
  información adicional se ADVIERTE (`hasProjectContext`), no se bloquea. El
  borrador ya no se siembra con la descripción de la postulación.
- **Las versiones de guion no se pisan**: editar guarda una versión nueva
  (`basedOnId`), aprobar marca `superseded` la aprobada anterior; «Hacer
  vigente» vuelve a una versión sin borrar nada. Reemplazar el video final deja
  el anterior como fila (`role = 'deliverable'`, no vigente).
- **La convocatoria de los correos es la de la EDICIÓN del proyecto**
  (`readConfigForSubmission(submission.eventId)`), no la abierta en el panel.
- **La tarjeta cierra la cuadrícula de «Mi proyecto»** (`sm:col-span-2`),
  después de la plantilla y de 31A: la prueba de v4.1264 sigue pasando.
- **Producción audiovisual: Fase 1 = manual.** La plataforma gestiona
  solicitud, guion, materiales y entrega; el render (voz, subtítulos, música,
  marca) se hace fuera y se sube como `deliverable`. `reelNarration.js`
  (TTS), `reelFfmpeg.js` y `reelRenderProviders.js` existen para una Fase 4; la
  separación guion/escenas/materiales ya la prepara.

### La capa comercial (v4.1296)

| Archivo | Qué es |
|---|---|
| `server/lib/videoPitchCommerce.js` | Criterio puro: estados comerciales, planes por defecto, `normalizePlanInput`, versión nueva (`planNeedsNewVersion`), importes de Stripe, `readSessionOutcome`/`reusableSession`, `commercialStatusOf`, la compuerta `productionGate`, `cardCopyOf` (casos A–E) |
| `server/controllers/videoPitchCommerceController.js` | Planes (siembra, CRUD con versiones), órdenes, Checkout, `applyStripeOutcome`, `routeVideoPitchStripeEvent`, sincronización al volver, exoneración, limpieza |
| `server/controllers/paymentController.js` | El webhook ÚNICO de la plataforma enruta `metadata.type = 'video_pitch_order'` (pagado, fallido, expirado, reembolsado) |

Rutas: `GET /portal/video-pitch/plans` · `POST …/plan` (elegir o cambiar; con
`answers` guarda y valida antes) · `POST …/checkout` · `POST …/checkout/sync`;
`GET/POST /admin/video-pitch/plans` · `PUT …/plans/:planId` · `GET
…/plans/history` · `POST …/maintenance/cleanup` (todas literales ANTES de
`/:id`) · `POST …/:id/payment/waive` · `POST …/:id/payment/sync`.

Tablas: `VideoPitchPlan`, `VideoPitchPlanVersion`, `VideoPitchOrder`,
`VideoPitchStripeEvent`, `VideoPitchUploadIntent`; columnas nuevas de
`VideoPitchRequest` enumeradas en `OWNED_COLUMNS` (`commercialStatus`,
`planId`, `currentOrderId`, `paidAt`, `paymentWaived*`).

**Reglas durables:**

- **⚠️ «PAGADO» SÓLO SALE DE STRIPE.** `applyStripeOutcome` es la única función
  que escribe `paid`/`failed`/`refunded`; la llaman el webhook (evento
  registrado antes en `VideoPitchStripeEvent`, idempotente) y la
  sincronización al volver (`checkout/sync`, que LEE la sesión del servidor).
  La URL de éxito no decide nada. Una sesión `complete` con
  `payment_status = 'unpaid'` no marca nada.
- **El importe sale de la ORDEN**, que copia el precio de la VERSIÓN del plan al
  elegirlo. Cambiar el catálogo crea una versión nueva y no toca órdenes
  existentes (la prueba lo fija con 135 → 149). Cambiar de plan antes de pagar
  cancela la orden abierta, expira su sesión y crea otra. Un índice único
  parcial garantiza UNA orden abierta por solicitud.
- **La metadata de la sesión NO lleva `submissionId`**: el enrutador de la
  Feria toma como suyo todo lo que trae esa clave. Lleva `type` y
  `videoPitchOrderId`.
- **Dos estados, nunca uno**: `status` (producción) y `commercialStatus`
  (derivado de la orden vigente por `refreshCommercial`). La compuerta
  `productionGate` exige pago o exoneración para `script_in_progress` en
  adelante; revisar y pedir información no lo exigen.
- **Pagar después mantiene el borrador editable**; al confirmarse el pago la
  solicitud se envía sola (`applyStatus` → `submitted`, número y avisos de
  siempre). La exoneración (`payment/waive`, motivo obligatorio, auditada)
  hace lo mismo sin pago. Un borrador con plan SÍ aparece en la bandeja.
- **Ediciones simultáneas**: el navegador manda `clientRevision`
  (`lastEditedAt` que cargó); si otro guardó después y las respuestas
  difieren, 409 `conflict` con lo guardado, y la vista lo muestra en vez de
  pisarlo. El autoguardado reintenta UNA vez a los 5 s y luego avisa.
- **Limpieza de huérfanos**: cada presign anota un `VideoPitchUploadIntent`;
  `maintenance/cleanup` borra sólo objetos de intenciones no registradas con
  más de `VIDEO_PITCH_UPLOAD_RETENTION_HOURS` (48) que ningún `VideoPitchFile`
  use. Primero cuenta (`confirm: false`), después borra.
- **Para probar sin Stripe real**: `STRIPE_API_BASE` apunta el SDK a un
  servidor local (sólo la fábrica `getStripe` del módulo lo lee). En
  producción no existe.
- Los correos comerciales (`notifyParticipantKind`) no llevan datos de pago:
  plan, importe y el enlace al perfil.
- **El precio se explica como producción con IA (v4.1297).** Cada plan lleva
  `creditsIncluded` y `creditsBreakdown` (reparto por etapa sobre
  `CREDIT_STAGES`: guion, voz, escenas, vertical, render; normalizado a 100
  por `normalizeCreditsBreakdown`). El modal muestra «¿Qué cubre el precio?» y
  una barra por plan; son campos VERSIONADOS (cambiarlos crea versión) y
  editables desde Configuración. Es explicativo: el cobro sigue saliendo de
  `priceAmount`. Los planes sembrados antes de v4.1297 reciben los créditos
  iniciales UNA vez en `ensurePlansSeeded` (sólo si están en cero), sin tocar
  el precio.

### Cómo se probó

- `npm run test:video-pitch` — criterio e invariantes, sin base ni red.
- `FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:video-pitch:e2e`
  (v4.1296: con un Stripe simulado en memoria: catálogo, elegir y cambiar plan,
  Checkout con el importe de la orden, reutilización de sesión, volver sin
  pagar, sesión completa sin pagar, webhook duplicado, pago fallido y reintento,
  precio histórico, plan inactivo, exoneración, limpieza de huérfanos)
  — Postgres REAL (con SSL: `db.js` lo exige), S3 simulado y el router real por
  HTTP: disponibilidad, borrador precargado, materiales válidos/disfrazados/
  verticales, envío con número y doble envío, permisos (sin sesión, token de la
  plataforma, otro club, perfil de lectura), revisión, información requerida y
  reenvío, guion manual, enviado al club, ajustes, aprobación, producción,
  video final, entrega, enlace firmado, avisos por hito, bloque, asignación,
  filtros y CSV. Exige una base local: nunca corre contra otra.
- Sin credenciales de IA ni de correo en el entorno de prueba: la generación
  devuelve 502 y los avisos quedan `failed` (se comprueba que NO queden
  `pending`).

### Pendientes conocidos

- **Renderizado automático** (TTS, subtítulos, composición, música, marca,
  miniaturas): Fase 4. Hoy el video se produce fuera y se sube.
- **Stripe Price objects**: la plataforma cobra con `price_data` en cada
  sesión (como la Feria), así que no se crean objetos Price en Stripe; la
  versión del plan cumple ese papel en la base.
- **Campos del formulario configurables desde el panel**: no en esta fase.
- **Reembolsos**: se reflejan cuando llegan de Stripe (`charge.refunded`); no se
  emiten desde el panel.
- **CORS del bucket**: la subida es un PUT del navegador a S3, como la plantilla
  y los documentos; si falla con «Se cortó la conexión con el almacenamiento»,
  revisar la política del bucket para el dominio del sitio.
- Un PUT prefirmado que nunca se registra deja un objeto huérfano bajo
  `private/video-pitch/`; conviene una regla de ciclo de vida.
- Los topes por tipo (25/500/20 MB) se cambian por entorno
  (`VIDEO_PITCH_MAX_IMAGE_MB`, `…_VIDEO_MB`, `…_DOCUMENT_MB`), todavía no desde
  la Convocatoria.
- Vincular un proyecto ajeno a una cuenta del portal sigue siendo manual (el
  modelo de cuentas es uno a uno).
- Recordatorios automáticos (guion sin decisión del club, información requerida
  sin respuesta): no hay; la bandeja y los filtros son la herramienta.
