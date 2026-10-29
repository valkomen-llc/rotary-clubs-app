# Rotary Clubs App — guía para Claude

## Cómo está organizada esta guía (v4.1205)

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

Las 51 tablas que la aplicación crea sola y que estas barreras protegen:
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
| Visitas del Gobernador (sección de Rotary en Acción: formulario público en `dominio.org/visitas-del-gobernador` en tres pasos, gestión, publicación sin duplicar) — v4.1260 (dirección canónica: v4.1261; tres pasos: v4.1262) | `docs/claude/visitas-del-gobernador.md` |
| Centro de Gestión del Evento (dashboard de la Feria: proyectos e inscripciones embebidos) — v4.1259 | `docs/claude/centro-de-gestion-del-evento.md` |
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
| WhatsApp CRM — motor de automatización — v4.701 | `docs/claude/whatsapp-crm.md` |
| Inscripciones a eventos / Feria de Proyectos — v4.648 (PayPal de la plataforma por defecto en el pago: v4.1251) | `docs/claude/inscripciones-a-eventos-feria-de-proyectos.md` |
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
