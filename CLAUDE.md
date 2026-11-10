# Rotary Clubs App — guía para Claude

## Cómo está organizada esta guía (v4.1302)

Este archivo se carga ENTERO en cada conversación. Llegó a pesar 1,48 MB
(~21.000 líneas) y llenaba la ventana de contexto antes de empezar a trabajar.
Por eso aquí quedan sólo las reglas TRANSVERSALES, y el conocimiento de cada
módulo vive en su propio archivo bajo `docs/claude/`, sin recortar.

- **Antes de tocar un módulo, leer su archivo** de la tabla del final. Sus
  reglas siguen vigentes aunque no estén en este archivo.
- **Lo nuevo de un módulo se escribe en SU archivo**, no aquí. Este archivo sólo
  crece con reglas que valen para todo el proyecto.
- Ninguna sección que viva aquí debería pasar de ~150 líneas. Si una crece más,
  moverla a `docs/claude/` y dejar la entrada en la tabla.

## Despliegue a producción

**Regla durable**: cada vez que se cree un PR a `main`, pasarlo de **draft → ready** y hacer **squash-merge** automáticamente, sin pedir confirmación. Producción se despliega desde `main` vía Vercel, así que un PR sin mergear = el cambio no llega al usuario.

Si el merge falla por conflictos:

1. `git fetch origin main && git rebase origin/main` (commits ya squash-mergeados en main se saltean solos)
2. `git push --force-with-lease origin <branch>`
3. Reintentar el merge

Idioma del PR title/body y commits: español (el equipo del cliente es hispanohablante).

## Versionado

Cada PR que toca features visibles debe bumpear:

- `package.json` → `version` y `cache_bust`
- `package-lock.json` → ambas ocurrencias de la versión (raíz y `packages.""`)
- `src/pages/SystemUpdates.tsx` → cabecera + nueva entry al tope del array `SYSTEM_UPDATES`
- Log de arranque del controller afectado (ej. `contentStudioController.js`)

Usar incrementos de patch (`v4.323` → `v4.324`) para fixes. Major-feel changes pueden saltar pero mantener semver patch sigue siendo aceptable porque el equipo trackea por número de release.

## Barreras de verificación antes de dar algo por terminado

Todas corren en `prebuild` o son la única comprobación real de su clase. El
detalle y la historia de cada una está en el archivo indicado.

- **`npm run typecheck`** (`tsc -p tsconfig.app.json`). Nunca `tsc` a secas:
  sin `-p` no revisa nada. Correr `npm ci` antes: sin `node_modules` sale en
  verde sin haber leído un archivo (`npm run check:typecheck` lo detecta). El
  proyecto arrastra cientos de errores heredados: dejar sin errores PROPIOS lo
  que se toque. Detalle: `docs/claude/creador-de-reels-ia.md` y
  `docs/claude/el-ciclo-de-vida-de-un-aporte.md`.
- **`npm run check:hooks`**: todo hook va arriba del componente, antes de
  cualquier `return`; nunca un hook dentro de un `.map`.
- **`npm run check:syntax`**, **`check:routes`**, **`check:route-handlers`**,
  **`check:server-undef`**: el servidor no pasa por ningún compilador. Literal
  antes que su paramétrica; `export default` al final del archivo. Detalle:
  `docs/claude/plantillas-ia.md`.
- **`npm run test:version`**: el número tiene que coincidir en `package.json`,
  `src/lib/appVersion.ts` y la primera entrada de `SYSTEM_UPDATES`.
- **Nunca una comilla invertida dentro de un `db.query(\`…\`)`**, tampoco en
  un comentario del SQL: cierra el literal y el módulo deja de parsear.
- **Todo `ADD COLUMN` de un ensure va enumerado en su atajo**, o el `ALTER` no
  corre nunca en producción.
- **Un componente nunca se declara dentro de otro**: es un tipo nuevo en cada
  render y el formulario pierde el foco tras cada letra.
- **Ningún `fetch` a un tercero sin tope de tiempo, y ningún `.json()` a
  ciegas** (`src/lib/leerJson.ts`).

## Content Studio / Generador de Publicaciones

Archivo principal: `server/controllers/contentStudioController.js`. Función `generatePost`.

**Regla #1: NO POSTPROCESAR el output del modelo de imagen.** Equipo cliente rechazó múltiples versiones donde aplicamos composite-back / máscara / blur sobre el output — siempre se ve "overlay / pegado / montaje". ChatGPT (referencia explícita del equipo) no postprocesa. Replicar ese flujo: foto + prompt → output as-is. **Aplica a TODOS los engines del registry**, no solo a OpenAI.

### Arquitectura multi-engine (v4.326)

Registry `ENGINES` en `contentStudioController.js`. Cada engine tiene metadata `{ label, engineKey, available }`. `generatePost` rutea según `config.engine` (mandado por el frontend), con fallback a `DEFAULT_ENGINE = 'kie'` si el solicitado no existe o no está available.

Engines en Fase 1:

- `kie` (default) — KIE.AI gateway con modelo `google/nano-banana-edit`. Implementado vía `kieService.js` (createTask → poll → fetch). Async, ~30-60s típico.
- `openai` — gpt-image-1 directo en `/v1/images/edits` sin máscara, `input_fidelity:high`, `quality:high`. Sync, ~20-40s típico.

Placeholders en el registry (UI los muestra como "Próximamente"): `flux_kontext`, `nano_banana`, `higgsfield`. Para implementarlos, agregar la función `generateWithX` + flag `available: true` + (si va vía KIE) usar `createKieImageTask` con el modelo correcto.

### Pipeline común para todos los engines

1. Fetch + `enhanceOriginal` (sharp, pixel-space, identidad intacta). Solo se usa para engines que reciben buffer (OpenAI); KIE recibe el `imageUrl` original directo.
2. GPT-4o multimodal para copy social (FB/IG/X/LinkedIn). El `visual_prompt` no se usa por los engines de imagen.
3. Despacho al engine: `generateWithKie` o `generateWithOpenAI`, todos con el mismo `buildSimplePrompt({ targetFormat })`.
4. **Devolver el buffer TAL CUAL** que produzca el modelo. Sin composite, sin máscara, sin feather, sin blur. Upload a S3.

Trade-off aceptado: regeneración semántica = leve drift de rostros / ropa (visible incluso en la salida ChatGPT). A cambio: cero overlays visibles.

### Approaches DESCARTADOS (no volver a probarlos sin razón muy fuerte)

- **Masked outpainting con bandas grandes** (v4.317-v4.320): `gpt-image-1` con máscara grande duplica intermitentemente (efecto mosaico / tiling).
- **Letterbox / blur background** (v4.321): equipo rechazó — "no quiero fondos difuminados".
- **Composite-back del original** (v4.323-v4.324): equipo rechazó — "se ve overlay / montaje".
- **Seeded mirror + masked edit** (v4.324): otra forma de composite, mismo rechazo.

Prompts largos con listas negras son contraproducentes — el modelo se obsesiona con lo prohibido. Mantener prompts cortos y positivos.

`vercel.json` tiene `maxDuration: 120s` para `/api` — necesario por la latencia de `gpt-image-1` con `quality:"high"` y el polling de KIE.

### Variables de entorno

- `KIE_API_KEY` — para todos los modelos via KIE.AI gateway (Nano Banana, Flux Kontext, Seedream, etc.).
- `OPENAI_API_KEY` — gpt-image-1 directo + GPT-4o para copy.
- `HIGGSFIELD_API_KEY` — pendiente, se usará cuando implementemos ese engine.

## Base de datos y despliegue — CAUSA DEL INCIDENTE DEL 2026-07-13

**El `build` NO debe ejecutar `prisma db push`.** Hasta v4.622 el script de build corría:

```
npx prisma db push --schema=./server/prisma/schema.prisma --accept-data-loss
```

`db push` deja la base **idéntica al schema**: toda tabla que exista en la base y
**no** esté en `schema.prisma` se **BORRA**, y `--accept-data-loss` autoriza que
se borre aunque tenga datos. Como el build corre en cada despliegue, **cada
deploy vaciaba todas las tablas creadas fuera de Prisma**.

Reproducido el 2026-07-28: con una fila en `ProjectFairSubmission`, ese comando
imprime *"You are about to drop the `ProjectFairSubmission` table, which is not
empty (1 rows)"* y la elimina. Es exactamente lo que ocurrió el 2026-07-13 con
`BannerTemplate`, y lo que hizo desaparecer una inscripción pagada de la feria.

Tablas afectadas (creadas con `CREATE TABLE IF NOT EXISTS` en tiempo de
ejecución, fuera de Prisma): `BannerTemplate`, las once `ProjectFair*`, y las de
CRM/WhatsApp, FAQs, agentes, brains, registro de eventos y leads.

**Regla durable**: el build sólo hace `prisma generate` + `vite build`. Si un
cambio toca `server/prisma/schema.prisma`, hay que sincronizar la base **a
propósito** con `npm run db:push`, revisando antes el aviso de pérdida de datos.
Nunca volver a poner `db push` en el `build`.

### Dos barreras que lo hacen cumplir (v4.624)

1. **`prebuild` → `scripts/check-build-safety.mjs`.** Corre en cada despliegue,
   sin tocar la base. Si `build`, `vercel-build`, `postinstall` o `start`
   vuelven a contener `prisma db push` o `prisma migrate reset`, **rompe el
   despliegue** con la explicación, en vez de dejar que borre datos.
2. **`npm run db:push` → `scripts/db-push-guard.mjs`.** Compara las tablas de
   la base con los modelos del schema y **aborta** listando las que se
   perderían y cuántas filas tienen. Para sincronizar de todos modos, a
   sabiendas: `npm run db:push:force`.

Las 54 tablas que la aplicación crea sola y que estas barreras protegen:
`BannerTemplate`, `MediaOutroComposition` (la versión con outro de un video de la Biblioteca, v4.1039), `CreativeProfile`, `CreativeReference`, `DesignProject`,
`DisbursementBatch` (el desembolso agrupado, v4.996), las cinco de Notificaciones de Contribuciones (`NotificationDelivery`,
`NotificationBeneficiary`, `NotificationProfile`, `NotificationTemplate`,
`NotificationDomain`),
`DesignPublicTemplate`, `EcosystemClone`,
`EventRegistration`, `MediaFolder`, `EventAttendeeAccount`,
`EventAttendeeLogin`, `FAQ`, `OutroProject`, `ReelProject`, `ReelScene`,
`ReelCopy`, `ReelNarration`, `ReelUsage`, `CrmWebhookEvent`, `CrmOutboundLog`,
las seis del módulo de SEO Inteligente (`SeoSiteConfig`, `SeoPageMeta`,
`SeoAudit`, `SeoIssue`, `SeoKeyword`, `SeoMetric`),
las once `ProjectFair*` (más `ProjectFairPaymentAttempt`, los intentos de pago
de una inscripción, v4.978),
las tres del libro mayor de la Bóveda (`LedgerAccount`, `LedgerTransaction`,
`LedgerLine`), `SocialPublicationOrigin` (de qué campaña salió una publicación,
v4.967)
y las seis de Campañas de Contribución (`ContributionCampaign`,
`ContributionCenter`, `ContributionCampaignOverride`,
`ContributionCampaignHistory`, `ContributionCampaignMetric`,
`ContributionCampaignReading`), y las tres de los Aportes de contenido a una
campaña (`ContributionSubmission`, `ContributionSubmissionFile`,
`ContributionSubmissionEvent`, v4.968), y las seis de Solicitud → artículo de
noticia (`SubmissionArticle`, `SubmissionArticleMedia`,
`SubmissionArticleVersion`, `ArticleViewEvent`, `ArticleViewDaily`,
`ArticleViewVisitor`, v4.1000), y la del Reel que nace de una solicitud
(`SubmissionReel`, v4.1010), y las cuatro de la Analítica de Redes Sociales
(`SocialDailyMetric`, `SocialContentItem`, `SocialContentMetric`,
`SocialSyncRun`, v4.1053).
Y las siete de la Conciliación de inscripciones y traslados de un evento
(v4.1250, dominio propio de Eventos, sin la Bóveda): `EventFundsConfig`,
`EventFundsTransfer`, `EventFundsAllocation`, `EventFundsDocument`,
`EventFundsNotice`, `EventFundsHistory` y `EventStripeCheck`.
Y la de las Visitas del Gobernador de Rotary en Acción (v4.1260):
`GovernorVisit` (galería e historial en JSONB, sin tablas satélite).
Y la bitácora del Catálogo Maestro de Clubes (v4.1269): `ClubCatalogChange`
(el catálogo mismo es `DistrictClubProfile`, ampliada; ver su archivo).
Y las cuatro de la plantilla oficial de presentación de la Feria (v4.1264):
`ProjectFairResource`, `ProjectFairResourceVersion`,
`ProjectFairResourceDownload` y `ProjectFairResourceEvent`.
Y las tres de los códigos QR dinámicos de los enlaces inteligentes (v4.1278):
`LinkRedirectQr` (el código IMPRESO en cada pieza, su vigencia y su diseño),
`LinkRedirectQrDaily` y `LinkRedirectQrVisitor` (su medición aparte).
Y las cinco de las Estadísticas de descarga de los documentos de un evento
(v4.1279): `EventDocument` (el documento lógico y su histórico),
`EventDocumentVersion` (cada archivo que ocupó ese lugar), `EventDocumentDownload`,
`EventDocumentDaily` y `EventDocumentVisitor` (sin IP).
Y las quince de **Programas** (v4.1280): `Program` (la identidad única),
`ProgramDistrictLink` (vinculación por distrito), `ProgramClubActivation`
(activación de un club en su sitio), `ProgramMember` (perfiles por programa),
`ProgramContent` y `ProgramContentVersion` (el contenido vivo y sus versiones),
`ProgramChangeRequest` (el formato de gestión y su flujo editorial),
`ProgramRequest` (solicitudes públicas: datos personales PRIVADOS),
`ProgramSubscriber` (novedades, consentimiento aparte), `ProgramFile` (archivos
privados: autorizaciones y respaldos), `ProgramAuditLog`, `ProgramMetricDaily` y
`ProgramVisitor` (métricas sin IP), y la página pública por contenedores
(v4.1281): `ProgramLanding` (borrador y versión publicada) y
`ProgramLandingVersion`.
Y las dos del formulario institucional de programas (v4.1286):
`ProgramIntake` (cada envío: una PROPUESTA con borrador seguro y revisión por
ítem; los datos del remitente son PRIVADOS) y `ProgramIntakeFile` (sus
archivos, privados hasta que se aprueban y aplican).
Y la traza de cada mensaje entrante de WhatsApp (v4.1285):
`WhatsAppInboundTrace` (el recorrido de cada «Hola» y la única evidencia de
qué conversaciones quedaron sin respuesta).
Y las cinco del Video Pitch Profesional de la Feria de Proyectos (v4.1293):
`VideoPitchRequest` (la solicitud de cada postulación: número, estado,
respuestas, guion aprobado y video entregado), `VideoPitchFile` (materiales
del club, video final y miniatura), `VideoPitchScript` (cada versión de
guion, inmutable), `VideoPitchEvent` (quién hizo qué y cuándo) y
`VideoPitchNotification` (qué aviso salió por qué cambio: evita duplicados).
Y las cinco de su capa COMERCIAL (v4.1296): `VideoPitchPlan` (el catálogo que
vende el comité, editable desde el panel), `VideoPitchPlanVersion` (cada cambio
de precio o características, inmutable), `VideoPitchOrder` (la fotografía de
cada compra y su recorrido en Stripe: lo que se cobró NO se reconstruye),
`VideoPitchStripeEvent` (cada evento de Stripe ya aplicado: idempotencia) y
`VideoPitchUploadIntent` (cada URL de subida emitida, para limpiar huérfanos).
Y las cinco de los Videos de proyectos, el video PROPIO del club (v4.1298):
`ProjectVideo` (ficha, estado de revisión, autorización aceptada con su texto),
`ProjectVideoVersion` (cada archivo, inmutable), `ProjectVideoEvent` (historial
y bitácora de la configuración), `ProjectVideoNotification` (avisos sin
duplicar) y `ProjectVideoConfig` (la configuración por edición).
Y la de la INSCRIPCIÓN de un club a la Feria (v4.1299): `ProjectFairRegistration`
(uno o dos proyectos por club, un solo pago; es PADRE de `ProjectFairSubmission`,
que suma `registrationId` y `projectIndex`).
Y las nueve de **Cursos y capacitaciones**, el LMS de Rotary en Acción (v4.1302):
`LearningCollection` (la colección de cursos de un club, asociada a un
proyecto), `LearningCourse` (cada curso: ficha, acceso, estado de revisión),
`LearningModule`, `LearningLesson`, `LearningResource` (módulos → lecciones →
recursos), `LearningFile` (cada objeto subido y el estado de su carga),
`LearningEvent` (trazabilidad), `LearningNotification` (avisos sin duplicar) y
`LearningConfig` (la configuración del Distrito).
Y el registro de las vistas previas JPEG de las fotos HEIC/HEIF de los aportes
(v4.1305): `SubmissionImagePreview` (una fila por original: estado, claves
derivadas, intentos y motivo del fallo).
Y la de los archivos del Directorio Distrital de Clubes (v4.1306):
`DistrictClubMedia` (logotipo, portada y galería de cada borrador o perfil: su
dueño, estado, original, versión limpia, publicación e historial).
(Más las del registro de eventos que enumera su propia sección:
`EventEdition`, `EventRegistrationCategory`, `EventRegistrationCompanion`,
`EventRegistrationPayment`, `EventRegistrationHistory`,
`EventRegistrationMessage` y `EventCompletedRegistration`.)

## Credenciales

**Nunca escribir cadenas de conexión ni claves en el código.** Siempre
`process.env.DATABASE_URL` (o la variable que corresponda), definida en el
entorno del despliegue.

El 2026-07-28 se encontraron siete archivos con la contraseña de producción de
Neon escrita en texto plano (`test-db.js`, `test-db-fetch.js`, `test_db.js`,
`check.js`, `cleanPasto.js`, `viewPasto.js`, `server/add_new_clubs.js`), todos
versionados. Eran scripts sueltos que nadie importaba; se eliminaron.

Borrarlos **no** los saca del historial de git: quien tenga un clon anterior
sigue viendo la contraseña. Por eso, ante una exposición así, lo que resuelve
es **rotar la credencial en Neon**, no sólo borrar el archivo.

## GitHub

- Repo único: `valkomen-llc/rotary-clubs-app`.
- Rama de trabajo actual: ver instrucciones de la sesión.
- No usar `gh` CLI — usar las MCP tools de GitHub.

## Índice de módulos (`docs/claude/`)

| Módulo | Archivo |
|---|---|
| **Sustituir una postulación de la Feria por otra del mismo club, con su pago** (verificar contra la base, Stripe y la Bóveda con bloqueo ante cualquier diferencia; aplicar en una transacción con huella; el pago se queda en su ancla y el conservado queda `coveredBy`, sin copiar referencias de Stripe; el pago anterior se guarda y etiqueta; auditoría antes/después; idempotente; caso Cúcuta FP-GLMGQL → FP-GVGEQX) — v4.1311 | `docs/claude/sustituir-una-postulacion-con-su-pago.md` |
| **Confirmar a mano el pago de un inscrito al evento** (nacional, internacional, CADRE: ventana con comprobante a S3 privado propio de cada inscripción, fila de pago `provider = manual`, mismo final que Stripe/PayPal con correo opcional, UPDATE condicional; «Cambiar a → Pago confirmado» abre la ventana) — v4.1310 | `docs/claude/inscripciones-a-eventos-feria-de-proyectos.md` (sección v4.1310) |
| **Confirmación manual de pagos de la Feria** (comprobante adjunto a S3 privado validado por sus bytes, el mismo pago cubre la inscripción completa de dos proyectos con el dinero una sola vez en el ancla, la línea se escribe si faltaba para sumar al recaudo, fecha con zona, UPDATE condicional; no va a la Bóveda a propósito) — v4.1308 | `docs/claude/confirmacion-manual-de-pagos-de-la-feria.md` |
| **Los módulos del panel ocupan el ancho completo** (ningún módulo se encierra en `max-w-* mx-auto`: el ancho y el relleno los pone `AdminLayout`; barrera `check:admin-width` en `prebuild`, escape `ancho-acotado-ok`) — v4.1307 | `docs/claude/ancho-completo-del-panel.md` |
| **Archivos del Directorio Distrital de Clubes** (el logotipo no subía: presign ajeno sin `size` → 400 siempre y sin URL; ahora «Club Media Uploader» con confirmación del servidor, progreso, reintento, reemplazo y eliminación; borrador con token del servidor y guardado automático; validación por bytes, HEIC → JPG, sin EXIF/GPS; privado hasta aprobar; panel «Archivos del registro»; portal del club con el mismo componente) — v4.1306 | `docs/claude/archivos-del-directorio-de-clubes.md` |
| **Vistas previas HEIC/HEIF de los aportes** (fotos de iPhone/Samsung en Visitas del Gobernador y Solicitudes de Rotary en Acción: vista previa JPEG + miniatura al lado del original intacto, registro idempotente con candado y reintentos, galería de revisión con visor, recuperación por lotes de lo ya enviado, publicación a la Biblioteca por el JPEG) — v4.1305 | `docs/claude/vistas-previas-heic-de-los-aportes.md` |
| **Cursos y capacitaciones** (LMS de Rotary en Acción, Fase 1: la categoría renombrada con dos modalidades, «Mis cursos y capacitaciones» con colecciones, cursos, módulos, lecciones, recursos, guardado automático y carga confirmada por bytes; «Gestión educativa» para el comité; biblioteca pública `/cursos` con acceso por modalidad; nueve tablas propias; Fases 2 y 3 diseñadas, no activadas) — v4.1302 | `docs/claude/cursos-y-capacitaciones.md` |
| **Hasta dos proyectos por club: la INSCRIPCIÓN** (modalidad en el paso 1 del wizard, una ficha por proyecto, primer proyecto $250.000 y segundo con tarifa especial $100.000 en UN solo pago; con el primero ya pagado, cobro complementario; «Mis proyectos postulados» con un token por proyecto; agregar/quitar/restaurar el segundo; indicadores de clubes frente a proyectos y recaudo por posición; tarifas administrables; lo heredado migra a inscripciones de un proyecto) — v4.1299 | `docs/claude/dos-proyectos-por-club.md` |
| **Videos de proyectos** (el video PROPIO del club, sin costo: dos tarjetas lado a lado en `/mi-proyecto`, subida privada validada por bytes con «recibido» sólo confirmado por el servidor, versiones, autorización con evidencia, revisión del comité con motivo, configuración por edición; módulo unificado «Videos de proyectos» que también monta el Video Pitch Profesional) — v4.1298 | `docs/claude/videos-de-proyectos.md` |
| **Video Pitch Profesional de la Feria de Proyectos** (tarjeta en `/mi-proyecto`, formulario precargado con materiales al almacenamiento privado, bandeja «Video Pitch» en Postulación de Proyectos, guiones con IA sobre el expediente real, aprobación del club, producción y entrega auditadas) — v4.1293 (paso B = un campo: v4.1295; **capa comercial: planes administrables, órdenes con precio histórico, Stripe por el webhook único, pagar después, compuerta de producción y exoneración auditada: v4.1296**) | `docs/claude/video-pitch.md` |
| **Formulario institucional de programas** (`/formulario-programas`: un solo formulario guiado por esquema y configurable por programa, carga inicial / actualización / aporte, borrador en servidor con enlace secreto y recuperación por correo, archivos privados con carga directa o multiparte reanudable, revisión por ítem en la pestaña «Formulario institucional» que convierte lo aprobado en solicitudes del flujo editorial; nada se publica ni se sobrescribe solo) — v4.1286 (**diez pasos con bloques desplegables, resumen con edición y borradores anteriores migrados: v4.1287**) | `docs/claude/formulario-institucional-de-programas.md` |
| **Programas** (identidad única por programa, vinculación distrital, activación por clubes con contenido central compartido, formato «Gestión de contenidos» en tres pasos, flujo editorial con revisión médica sólo para lo clínico, página pública `/programas/:slug` por secciones, cuatro formularios públicos, solicitudes con seguimiento, donación por enlace externo, auditoría y métricas; piloto D4281 «Clínicas Ponseti» en borrador) — v4.1280 (**la landing por contenedores con borrador, vista previa y publicación, fiel a la referencia: v4.1281; con los patrones institucionales del sitio: v4.1282**) | `docs/claude/programas.md` |
| **Estadísticas de descarga de los documentos de un evento** (la «Guía descargable» de hoteles: el botón público pasa por la plataforma, registro en una sentencia sin IP, histórico por versión que sobrevive a reemplazar/quitar/desactivar, cifra y panel «Ver estadísticas» sólo en el administrador, filtros por fecha) — v4.1279 | `docs/claude/estadisticas-de-descarga-de-documentos-de-un-evento.md` |
| **Enlaces inteligentes y códigos QR dinámicos** (Configuración → Identidad; varios QR por enlace, vigencia 30/90/nunca/fecha calculada en el servidor, estados derivados del reloj, página institucional, analítica por QR frente a enlace directo, resumen del sitio; descargas PNG/SVG/PDF verificadas con dos codificadores) — v4.1278 | `docs/claude/enlaces-inteligentes-y-codigos-qr.md` |
| Movimiento de la portada del evento (Ken Burns en la ficha pública, configurable por evento en Multimedia, encendido por defecto) — v4.1276.0 (**continuo y vivo con «Reducir movimiento»: v4.1277.0**) | `docs/claude/movimiento-de-la-portada-del-evento.md` |
| **Hoteles de la conferencia** (sección pública de diapositivas entre el carrusel de fotos y el HTML de la ficha; pestaña «🏨 Hoteles y alojamiento»; subida prefirmada validada por bytes y optimizada en WebP; historial sellado por el servidor; liberación acotada de archivos sin uso; PDF → diapositivas es Fase 2) — v4.1275.0 | `docs/claude/hoteles-de-la-conferencia.md` |
| Carrusel de la «Imagen lateral del evento» (varias imágenes con alt/enlace/estado propios, miniaturas reordenables, «Configuración del carrusel» por evento, vista previa con el mismo componente, migración al leer de la imagen única) — v4.1273.0 (avance automático corregido: v4.1274.0) | `docs/claude/carrusel-de-la-imagen-lateral-del-evento.md` |
| **Catálogo Maestro de Clubes** — la fuente ÚNICA de clubes (Directorio = catálogo; lista estática sólo semilla; catálogo vivo para todos los formularios; estados, alias, duplicados reversibles, importación con revisión, permisos por distrito) — v4.1269 | `docs/claude/catalogo-maestro-de-clubes.md` |
| Guía de pago por COLROTARIOS / AvalPay en el paso 4 de «Completar inscripción» (tarjeta contextual, configurable por evento, concepto verificado, volver de pagar sin perder el paso) — v4.1268 | `docs/claude/guia-de-pago-colrotarios.md` |
| La cuenta del participante en «Completar inscripción» (crear acceso o entrar con la cuenta de siempre, «Mis eventos», vincular lo anterior sólo con el correo demostrado, envío idempotente) — v4.1267 (**subir o reemplazar el comprobante desde la ficha del panel y desde «Mis eventos», el anterior conservado en el historial: v4.1291**) | `docs/claude/cuenta-del-participante-en-completar-inscripcion.md` |
| Secretaría Digital — Control de Aportes (rol de sólo lectura y descarga sobre la Bóveda, vigencia del acceso por período rotario, auditoría de consultas y descargas, pestaña «Control y Justificación de Aportes») — v4.1265 (**vuelve a ver Eventos, como antes del rol: v4.1288; y Analíticas: v4.1289; suma el Estudio de Contenido: v4.1290; suma Rotary en Acción completo: v4.1303**) | `docs/claude/secretaria-digital-control-de-aportes.md` |
| Plantilla oficial de presentación del proyecto (Recursos y plantillas de la Feria: subir, versionar, descarga autenticada y auditada desde `/mi-proyecto`, analítica de quién descargó) — v4.1264 | `docs/claude/plantilla-de-presentacion.md` |
| Visitas del Gobernador (sección de Rotary en Acción: formulario público en `dominio.org/visitas-del-gobernador` en tres pasos, gestión, publicación sin duplicar) — v4.1260 (dirección canónica: v4.1261; tres pasos: v4.1262; **paso 1 sin título ni motivo, descripción 80–700 y Gobernador del período desde la configuración del distrito: v4.1283; Memoria institucional por seis categorías nuevas, las anteriores conservadas: v4.1284; fotos HEIC visibles: v4.1305**) | `docs/claude/visitas-del-gobernador.md` |
| Centro de Gestión del Evento (dashboard de la Feria: proyectos e inscripciones embebidos) — v4.1259 (**columnas FDD y FAP en Proyectos postulados, leídas de la Solicitud de Aportes del FDD de cada proyecto, con orden numérico, rangos y exportaciones; el orden de la tabla pedía el del clic anterior: v4.1304**) | `docs/claude/centro-de-gestion-del-evento.md` |
| Conciliación de inscripciones y traslados de un evento — **dominio PROPIO de Eventos, sin la Bóveda** (v4.1250; corrige v4.1248–v4.1249, que usaban la Bóveda) | `docs/claude/conciliacion-de-inscripciones-y-traslados-de-un-evento.md` |
| El ciclo de vida de un evento (próximos, en curso, finalizados, por confirmar; historial en `/eventos/anteriores`) — v4.1247 | `docs/claude/el-ciclo-de-vida-de-un-evento.md` |
| Persistencia del Editor Visual de Plantillas (Email Marketing) — v4.1235 | `docs/claude/persistencia-del-editor-visual-de-plantillas.md` |
| Generador de Outros IA — v4.647 (el selector de outros con el generador apagado: v4.1241) | `docs/claude/generador-de-outros-ia.md` |
| Outro sobre un video de la Biblioteca — v4.1039 | `docs/claude/outro-sobre-un-video-de-la-biblioteca.md` |
| Creador de Reels IA — v4.797 (voz en off con diagnóstico y borrador → aplicar: v4.1236–v4.1238; motor KIE: v4.1239; Google Gemini: v4.1240; el outro se pega sobre el Reel montado: v4.1245; volver a montar sin el Creador y en dos pasos: v4.1246) | `docs/claude/creador-de-reels-ia.md` |
| «Maneras de Contribuir» en el Generador de Publicaciones — v4.967 | `docs/claude/maneras-de-contribuir-en-el-generador-de-publicaciones.md` |
| El directorio de socios se deja encontrar — v4.985 | `docs/claude/el-directorio-de-socios-se-deja-encontrar.md` |
| Aportes de contenido a una campaña — v4.968 (participación y difusión: v4.972; topes 50 MB / 2 GB: v4.1242) | `docs/claude/aportes-de-contenido-a-una-campana.md` |
| Solicitud → artículo de noticia — v4.1003 | `docs/claude/solicitud-articulo-de-noticia.md` |
| Analítica de Redes Sociales — v4.1053 | `docs/claude/analitica-de-redes-sociales.md` |
| Publicar una noticia en Facebook — v4.1013 (cambiar la imagen de la publicación: v4.1244) | `docs/claude/publicar-una-noticia-en-facebook.md` |
| Solicitud → Reel para redes — v4.1010 | `docs/claude/solicitud-reel-para-redes.md` |
| Solicitudes de contenido: la BANDEJA — v4.999 | `docs/claude/solicitudes-de-contenido-la-bandeja.md` |
| El tablero de campañas — v4.990 | `docs/claude/el-tablero-de-campanas.md` |
| El sitio edita la campaña compartida — v4.988 (matiza v4.987) | `docs/claude/el-sitio-edita-la-campana-compartida.md` |
| Sin el accesorio «Página de aportes sin campaña» — v4.989 | `docs/claude/sin-el-accesorio-pagina-de-aportes-sin-campana.md` |
| Una sola herramienta: Campañas de Contribución — v4.987 (supersede v4.986; el alcance de escritura lo matiza v4.988) | `docs/claude/una-sola-herramienta-campanas-de-contribucion.md` |
| Distribución multi-destino — v4.864 (vista previa v4.865, panel de grupos v4.876) | `docs/claude/distribucion-multi-destino.md` |
| WhatsApp CRM — motor de automatización — v4.701 (**el agente responde los mensajes reales y el panel lo demuestra: traza por mensaje, cinco silencios corregidos, verde falso de la suscripción, prueba real y reporte de sin respuesta: v4.1285**) | `docs/claude/whatsapp-crm.md` |
| Inscripciones a eventos / Feria de Proyectos — v4.648 (PayPal de la plataforma por defecto en el pago: v4.1251; seleccionar, editar y eliminar desde el listado: v4.1263; mostrar u ocultar el botón público de cada categoría: v4.1266) | `docs/claude/inscripciones-a-eventos-feria-de-proyectos.md` |
| Aniversarios IA — v4.895 (motor multimodelo: v4.897; **FLUJO SIMPLE: v4.907**) | `docs/claude/aniversarios-ia.md` |
| Cuentas institucionales como identidades de acceso — v4.932 | `docs/claude/cuentas-institucionales-como-identidades-de-acceso.md` |
| El asistente de redacción de Noticias — v4.891 | `docs/claude/el-asistente-de-redaccion-de-noticias.md` |
| Publicaciones fantasma: maestro y réplicas — v4.938 (dónde se publica una noticia que ya existe: distrito y COLROTARIOS por defecto, v4.1243) | `docs/claude/publicaciones-fantasma-maestro-y-replicas.md` |
| La dirección de un artículo — v4.873 | `docs/claude/la-direccion-de-un-articulo.md` |
| El estado «En construcción» de un sitio — v4.883 | `docs/claude/el-estado-en-construccion-de-un-sitio.md` |
| Lo que el panel descarga para abrirse — v4.880 | `docs/claude/lo-que-el-panel-descarga-para-abrirse.md` |
| Slider Global / Llamados a la Acción — v4.879 | `docs/claude/slider-global-llamados-a-la-accion.md` |
| Los bloques de la página pública de Proyectos — v4.750 | `docs/claude/los-bloques-de-la-pagina-publica-de-proyectos.md` |
| Notificaciones de Contribuciones — v4.855 (Fase 0: la traza) | `docs/claude/notificaciones-de-contribuciones.md` |
| En qué moneda se cobra un aporte — v4.834 | `docs/claude/en-que-moneda-se-cobra-un-aporte.md` |
| Infografías de Campaña (Generador de Publicaciones) — v4.833 (Fase 1) | `docs/claude/infografias-de-campana.md` |
| Campañas de Contribución — v4.807 (COMPLETO, F1-F5) | `docs/claude/campanas-de-contribucion.md` |
| Un solo camino de cobro para los aportes — v4.808 | `docs/claude/un-solo-camino-de-cobro-para-los-aportes.md` |
| La agenda del Distrito: traer eventos del ecosistema — v4.747 | `docs/claude/la-agenda-del-distrito-traer-eventos-del-ecosistema.md` |
| Postulación de Proyectos — ediciones (v4.683; fechas importantes editables: v4.1252; **postular NO exige pagar, postulación y pago desacoplados: v4.1253**, supersede el bloqueo fijo de v4.979) | `docs/claude/postulacion-de-proyectos.md` |
| Formularios del proyecto (Gestión de Proyectos) — v4.788 | `docs/claude/formularios-del-proyecto.md` |
| Plantillas IA (Generador de Diseños) — v4.729 | `docs/claude/plantillas-ia.md` |
| Generador de Pendones | `docs/claude/generador-de-pendones.md` |
| La Bóveda de Fondos — libro mayor en sombra (v4.847, Fase 1) | `docs/claude/la-boveda-de-fondos.md` |
| Reenviar la conciliación de un traslado — v4.1014 | `docs/claude/reenviar-la-conciliacion-de-un-traslado.md` |
| El ciclo de vida de un aporte — v4.885 | `docs/claude/el-ciclo-de-vida-de-un-aporte.md` |
| El dinero de otra fuente llega a la Bóveda — v4.1025 | `docs/claude/el-dinero-de-otra-fuente-llega-a-la-boveda.md` |
| Aportes por PayPal — v4.866 | `docs/claude/aportes-por-paypal.md` |
| SEO Inteligente (AI SEO Engine) — v4.703 | `docs/claude/seo-inteligente.md` |
| Tipo de sitio y portada — v4.737 | `docs/claude/tipo-de-sitio-y-portada.md` |
| El dominio propio de un sitio — v4.743 | `docs/claude/el-dominio-propio-de-un-sitio.md` |
| El pool registrador de un dominio — v4.877 | `docs/claude/el-pool-registrador-de-un-dominio.md` |
| Un PDF público de la Biblioteca se abre en el móvil — v4.1016 | `docs/claude/un-pdf-publico-de-la-biblioteca-se-abre-en-el-movil.md` |
| Qué entra en el menú y qué botones se muestran — v4.1022 | `docs/claude/que-entra-en-el-menu-y-que-botones-se-muestran.md` |
| El período rotario en un título — v4.1023 | `docs/claude/el-periodo-rotario-en-un-titulo.md` |
| El botón flotante del sitio — v4.1021 | `docs/claude/el-boton-flotante-del-sitio.md` |
| Redirecciones de enlaces por sitio — v4.781 | `docs/claude/redirecciones-de-enlaces-por-sitio.md` |
| La barra de vencimiento de un sitio — v4.878 | `docs/claude/la-barra-de-vencimiento-de-un-sitio.md` |
| Recursos que cambian con el idioma — v4.699 | `docs/claude/recursos-que-cambian-con-el-idioma.md` |
| Carpetas de la Librería de Medios — v4.738 | `docs/claude/carpetas-de-la-libreria-de-medios.md` |
| Traducción del sitio público — v4.662 | `docs/claude/traduccion-del-sitio-publico.md` |
| La pantalla en blanco del panel — v4.791 | `docs/claude/la-pantalla-en-blanco-del-panel.md` |
| Disponibilidad: ninguna dependencia lenta deja un sitio en blanco — v4.1180 | `docs/claude/disponibilidad-ninguna-dependencia-lenta-deja-un-sitio-en-bl.md` |
| Rendimiento de carga — v4.659 | `docs/claude/rendimiento-de-carga.md` |
| Botones configurables (CTA) — v4.657 | `docs/claude/botones-configurables.md` |
| Acceso e identidades (v4.655) | `docs/claude/acceso-e-identidades.md` |
