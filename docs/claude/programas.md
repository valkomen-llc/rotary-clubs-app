# Programas — v4.1280 (página pública por contenedores: v4.1281; patrones institucionales: v4.1282)

Módulo para que un distrito publique los programas que respalda (el primero,
**Clínicas Ponseti** para el Distrito 4281), su equipo gestione contenidos y
solicitudes, y los clubes del distrito los activen en su sitio institucional.
Reutilizable para Fundación Pequeño Corazón y cualquier otro programa **sin
tocar código**: todo es datos.

## Piezas

| Pieza | Archivo |
|---|---|
| Criterio puro (catálogos, estados, forma y validación, vistas públicas, embebidos) | `server/lib/programSpec.js` |
| Espejo del navegador | `src/lib/programSpec.ts` |
| Esquema en runtime (13 tablas `Program*`) | `server/lib/ensureProgramSchema.js` |
| Alcance de una sesión sobre un programa (`abilitiesFor`, `resolveScope`) | `server/lib/programAccess.js` |
| Almacén (SQL, transacción de publicación, métricas) | `server/lib/programStore.js` |
| Archivos privados en S3 (`private/programs/{id}/`) | `server/lib/programFiles.js` |
| Notificaciones (punto de extensión sobre `EmailService.sendPlatformEmail`) | `server/lib/programNotify.js` |
| Controlador (público + administración) | `server/controllers/programController.js` |
| Rutas, montadas en `/api/programas` en `api/index.js` y `server/server.js` | `server/routes/programs.js` |
| Permiso del RBAC: módulo `programs` (view/create/edit/publish/export/manage) | `server/lib/rbacSpec.js` + `src/lib/rbacSpec.ts` |
| Público: catálogo y página | `src/pages/Programas.tsx`, `src/pages/ProgramaDetalle.tsx`, `src/components/programas/` |
| Administración | `src/pages/admin/ProgramasAdmin.tsx`, `src/pages/admin/ProgramaAdminDetalle.tsx`, `src/components/admin/programas/` |
| Menú público: `programsNav` en `by-domain` → `Navbar` | `server/routes/clubs.js`, `src/sections/Navbar.tsx` |
| SEO del servidor (`kindOfPath` → `program`, `programMeta`) | `server/lib/seoSpec.js`, `server/lib/seoEntities.js` |
| **Página pública por contenedores** (criterio puro, espejo, renderizador, editor) | `server/lib/programLandingSpec.js`, `src/lib/programLandingSpec.ts`, `src/components/programas/ProgramaLanding.tsx`, `src/components/programas/ProgramIcon.tsx`, `src/pages/ProgramaLandingPage.tsx`, `src/components/admin/programas/ProgramaPaginaTab.tsx` |
| Pruebas | `npm run test:programas` (sin base) · `PROGRAMAS_E2E_DATABASE_URL=… npm run test:programas:e2e` (Postgres local) |
| Semilla del piloto en borrador | `DATABASE_URL=… npm run seed:programa-ponseti` |

## Modelo (decisiones; no deshacer sin razón)

- **Un programa es UNA identidad** (`Program`). Se vincula con N distritos
  (`ProgramDistrictLink`, única por `programId + districtNumber`) sin
  duplicarse. La vinculación dice el **tipo de relación** (respaldo
  institucional, difusión, apoyo financiero, otra descrita), su estado,
  presentación y contacto distrital, si va al menú y al catálogo, y si los
  clubes pueden activarlo. Ningún tipo implica que el distrito opere el
  servicio ni reciba donaciones: eso lo dice el texto (`disclaimer`).
- **La activación de un club** (`ProgramClubActivation`, única por
  `programId + clubId`) no copia nada: el sitio del club lee el contenido
  central publicado, agrega su contacto local y su nota, y puede proponer
  contenido **local** (`scopeType = 'club'`) sólo de los tipos
  `localAllowed` (equipo, historias, noticias/eventos). Un club nunca ve el
  contenido local de otro club ni sus solicitudes.
- **El contenido vivo es `ProgramContent`**: una fila por registro,
  `status` `publicado` o `archivado`. Lo que no está publicado **no existe
  ahí**: vive como `ProgramChangeRequest` hasta que se aprueba y se publica.
  Cada publicación escribe `ProgramContentVersion`.
- **Todo cambio entra por una solicitud** (`ProgramChangeRequest`), también
  los del coordinador: `borrador → enviado → en_revision → ajustes | aprobado
  → publicado | archivado`. «Publicado» NO es una transición: sólo
  `POST …/changes/:id/publish` (transacción en `publishChangeRequest`) aplica
  el cambio al contenido vivo. Quien tiene `approve` + `publish` puede
  «Aprobar y publicar» desde «Enviado» en un paso (dos entradas en el
  historial). Editar el payload de una solicitud **aprobada** la devuelve a
  «En revisión» y retira la aprobación (también la médica): nunca en silencio.
- **Revisión médica** sólo para lo clasificado como clínico
  (`requestNeedsMedicalReview`): recurso con `clinical`, clínica con
  `careConditions`, información institucional que toque ruta de orientación,
  condiciones de acceso o costos, corrección marcada como clínica. La aprueba
  el perfil `revisor_medico`; sin ella no se aprueba ni se publica.
- **Con el programa activo**, la ficha se edita directo (`PUT /admin/:id`)
  salvo los tres campos clínicos de `care`, que responden `409
  CLINICAL_LOCKED` y van por solicitud de «Información institucional».
- **Publicar el programa** (`status = activo`) exige `validateProgramForPublish`
  (resumen, descripción, imagen con alt, coordinador, correo, fecha de
  verificación, costos aprobados si hay texto, logos de aliados autorizados,
  **lista de pendientes de validación vacía**) y una vinculación activa.
- **Solicitudes públicas** (`ProgramRequest`): `nueva → asignada →
  en_contacto → derivada → cerrada`. `data` es PRIVADO: no sale a páginas,
  métricas ni auditoría (la auditoría guarda referencia y tipo; «viewed» queda
  registrado). El club de origen ve referencia, tipo, estado y fecha
  (`originClubRequestView`). Asignación automática por tipo
  (`requestRouting`), alterno, primer contacto al pasar a «En contacto»,
  motivo de cierre. Cada formulario sólo admite SUS campos
  (`shapePublicRequest`): nada de historia clínica, documentos ni fotos por
  «orientación». Trampa para bots (`website_url`) + `lightPublicLimit`.
- **Novedades** es `ProgramSubscriber`, con consentimiento propio. Ningún
  formulario de solicitud suscribe a nadie.
- **Donaciones**: sólo enlaces externos (`donation`), con entidad receptora,
  finalidad, aclaración y verificación obligatoria para publicar; el aviso
  previo dice quién recibe y administra; el clic es `donation_click`, una
  interacción. Sin texto aprobado no se afirman beneficios tributarios.
- **Multimedia**: lo público va a la Biblioteca del sitio (`ImageField`:
  subir o elegir); los comprobantes de autorización y respaldos son
  `ProgramFile` en `private/programs/{programId}/` (prefirmado, tipo por
  bytes, ≤ 25 MB, descarga firmada 2 min y auditada; sólo quien revisa o
  quien lo subió). YouTube/Spotify/Vimeo sólo por `resolveEmbed` (lista
  cerrada de `src`, nunca HTML).
- **Métricas** sin datos personales: `ProgramMetricDaily` por día/sitio/
  métrica y `ProgramVisitor` (hash con sal, sin IP). Vista previa y bots no
  cuentan. Se distingue actividad digital de gestión de solicitudes; nunca se
  infieren resultados asistenciales.
- **Permisos**: `programs.*` del RBAC abre la RUTA; `programAccess.abilitiesFor`
  decide la FILA por sesión: operador (todo), administrador del sitio del
  distrito vinculado (todo salvo lo médico), responsable del club con
  activación (activar, contacto local, contenido local, resumen de
  solicitudes), y perfiles por programa (`ProgramMember`: coordinador,
  comunicaciones, revisor médico, gestor de solicitudes, colaborador; una
  persona puede tener varios). Un administrador de otro distrito o un club sin
  vinculación recibe 403.
- **Notificaciones**: `programNotify` usa el correo de la plataforma; sin
  proveedor registra `notification:skipped` en la auditoría, no simula.
  `PROGRAMAS_NOTIFY=off` lo apaga (pruebas). WhatsApp y campañas: futuro.
- **Menú público**: `by-domain` sirve `programsNav {count, single}` (nunca
  lanza); `Navbar` pinta «Programas» sólo si `count > 0` (a `/programas` o
  directo al único). `SYSTEM_NAV_SECTIONS` incluye `/programas` para menús
  personalizados.

## La página pública por contenedores (v4.1281)

La landing `/programas/:slug` reproduce la propuesta visual de Clínicas
Ponseti con ONCE contenedores en una lista cerrada (`BLOCK_TYPES`): `hero`
(portada), `intro` (presentación), `cards` (información para familias),
`feature` (equipo), `impact`, `directory`, `donation`, `stories`, `resources`,
`clubs` y `contact`. Portada, directorio, donaciones y contacto son de
instancia única; los demás se pueden agregar varias veces con id propio.

- **Persistencia**: `ProgramLanding` (una fila por programa: `draft`,
  `published`, `draftVersion`, `publishedVersion`, quién y cuándo) y
  `ProgramLandingVersion` (cada publicación). Sin fila, `landingState`
  devuelve `defaultLanding(program)` sin escribir nada: el público ve el
  diseño inicial con los contenedores que tengan datos; en cuanto se guarda
  un borrador, el público ve sólo lo PUBLICADO (nada hasta publicar).
- **Borrador ≠ publicado**: `PUT /admin/:id/landing` guarda el borrador con
  bloqueo optimista (`baseVersion` = la `draftVersion` leída; otra edición
  concurrente responde `409 LANDING_CONFLICT`). `POST …/landing/publish`
  copia el borrador a `published`, escribe la versión y audita. La vista
  previa (`?t=` firmado, 1 h) muestra el borrador; `…/landing/versions` y
  `…/landing/restore` recuperan una versión al borrador; `…/landing/reset`
  vuelve al diseño inicial. Permisos: `editProgram` para guardar, `publish`
  para publicar; el club sólo mira.
- **Saneado en servidor** (`shapeLanding`): textos recortados, íconos y
  fondos de catálogo cerrado (`ICONS`, `BACKGROUNDS`), imágenes con URL
  normalizada + alt + enfoque, botones con acción controlada
  (`section` ancla de la página, `detail` ancla de `/programas/:slug/detalle`,
  `form` orientación/apoyo/club/novedades, `donation` canal verificado,
  `internal` ruta que empieza por «/», `external` http(s) sin credenciales).
  Nunca HTML, CSS ni JS.
- **Fuentes reales sin copias** (`resolveLanding` + `landingSources`): el
  directorio toma las clínicas publicadas; `impact` referencia indicadores
  por `indicatorId` (sin vínculo: «Indicadores por validar» en vista previa,
  tarjeta omitida en público); `stories` últimas N o selección manual de
  historias aprobadas; `resources` cuenta recursos publicados por tipo;
  `donation` usa el primer enlace de donación publicado y VERIFICADO (sin
  él: «Entidad receptora y enlace por confirmar», contenedor oculto en
  público). Las imágenes vacías muestran «Fotografía real autorizada» sólo
  en vista previa.
- **Página de detalle**: la vista completa anterior vive en
  `/programas/:slug/detalle` (directorio completo, recursos con embebidos,
  equipo, impacto, cómo ayudar, noticias, aliados, formularios), con anclas
  `#clinicas`, `#familias`, `#equipo`, etc. «Volver al menú» (configurable en
  `settings.backLink`) va al pie de la landing.
- **Patrones institucionales (v4.1282)**: la landing NO tiene medidas
  propias; `ProgramaLanding.tsx` reutiliza lo del inicio y las páginas
  institucionales: contenedor `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` y
  `py-16 md:py-20`; portada con `h-[440px] md:h-[540px]` del `HeroSection`
  (`style.imageMode = 'background'`: imagen `object-cover` + `objectPosition`
  + `scale(zoom)`, superposición `from-black/40`, `motion-safe:animate-hero-zoom`;
  `'side'`: la columna de la referencia); fondo `geo` = `SITE_ACTION_BG`
  (`siteChrome.ts`) con el `colors.actionBg` de un sitio Evento y la textura
  encima, como `ActionSection`; `gray` = `bg-rotary-concrete` (Stats);
  botones `px-8 py-3.5 rounded-full shadow-lg` con `useCtaButton()` (celeste
  o `.cta-btn`), `ctaSkin(CTA_SOLID)` para el principal sobre claro y
  `CtaStarIcon` por omisión; títulos `text-3xl md:text-4xl font-light`;
  tarjetas de Stats (impacto), de ícono de Proyectos (tarjetas), de Causas
  (historias), de proyecto (directorio); dos columnas de Join
  (`lg:grid-cols-2 gap-16`, imagen `rounded-[40px]` sin recorte); caja
  flotante de Fundación (donaciones); banda de cierre de Quiénes Somos
  (orientación). ⚠️ `hover:bg-rotary-blue/90` no existe (v4.719): el hover
  oscurece con `bg-rotary-navy`. No se tocan estilos globales.

### Cómo personalizar cada contenedor (pestaña «Página pública»)

1. Elegir el contenedor en la lista de la izquierda (activar/desactivar,
   subir/bajar, quitar; «Agregar contenedor» para otra instancia).
2. Editar nombre administrativo, fondo, alineación y lado de la imagen.
3. Editar los campos del tipo: textos; imagen (Subir o Biblioteca, texto
   alternativo, enfoque); tarjetas/accesos/indicadores (ícono, textos,
   vínculo); botones (texto, ícono, estilo, acción y destino).
4. Los contenedores con fuente muestran su acceso («Gestión de contenidos» o
   «Biblioteca de contenidos») y los avisos de lo que falta.
5. Guardar borrador → Vista previa → Publicar.

## Rutas

Públicas: `/programas` (catálogo del sitio), `/programas/:slug` (la landing
por contenedores; `?f=orientacion|apoyo|club|novedades` abre ese formulario;
`?t=` vista previa firmada 1 h) y `/programas/:slug/detalle` (toda la
información). API: `GET /api/programas/public/catalogo`,
`GET /public/:slug`, `POST /public/:slug/solicitud`, `POST /public/:slug/novedades`,
`POST /public/:slug/metric`, `GET /public/:slug/solicitud/:ref`, `GET /public/clubes`.

Administración: `/admin/programas` y `/admin/programas/:id?tab=ficha|pagina|vinculos|
contenidos|gestion|revision|solicitudes|clubes|historial` (`&ref=` abre una
solicitud). API bajo `/api/programas/admin/…` (ver `server/routes/programs.js`).

## Cómo cargar y publicar el primer programa (Distrito 4281)

1. En el sitio del distrito: `/admin/programas` → «Nuevo programa» (o
   `npm run seed:programa-ponseti` para el borrador con pendientes).
2. Pestaña **Información**: identidad, gobernanza, atención, participación,
   secciones, llamados de acción, formularios y quién los atiende, SEO.
   Resolver la lista «Datos pendientes de validación».
3. **Responsables y distritos**: perfiles (correo + roles) y la vinculación.
4. **Gestión de contenidos**: clínicas, equipo, historias, recursos, noticias,
   indicadores, enlaces de donación → enviar a revisión.
5. **Revisión editorial**: revisar, (aprobación médica si aplica), aprobar y
   publicar. **Vista previa** muestra el borrador en el sitio.
6. **Información → Publicar programa** cuando el chequeo está en verde.

## Cómo activa un club

En el sitio del club: `/admin/programas` lista los disponibles para su
distrito → abrir → **Clubes participantes → Activar en nuestro sitio** (contacto
local, nota, menú). Desde ese momento `/programas/:slug` existe en su sitio
con el contenido central aprobado; «Gestión de contenidos» le deja proponer
contenido local; «Solicitudes públicas» le muestra referencias y estados de lo
que llegó desde su sitio; «Desactivar participación» lo retira.

## Cómo se probó (v4.1280; landing v4.1281: +22 puras, +6 e2e, capturas 1280/390 px contra el build)

- `npm run test:programas`: 132 comprobaciones puras (estados, revisión
  médica por tipo, publicación, vistas públicas sin internos, embebidos,
  formularios públicos que descartan campos prohibidos, matriz de acceso,
  atajo del ensure, guardas de rutas, RBAC en los dos archivos, tablas en el
  guardián y en CLAUDE.md, paridad con el espejo).
- `test:programas:e2e` contra Postgres 16 local con el controlador real: 45
  comprobaciones (separación entre distritos y clubes, activación, flujo
  editorial con revisión médica, versión publicada conservada hasta publicar
  el reemplazo, invalidación de aprobación al editar, retiro, contenido local
  sólo en su club, visibilidad sólo de lo autorizado, solicitudes privadas y
  atribuidas, consentimiento aparte de novedades, métricas sin IP, donación
  verificada, auditoría, notificaciones no simuladas).
- `npm run typecheck` sin errores propios (706 heredados antes y después),
  `check:hooks`, `check:syntax`, `check:routes`, `check:route-handlers`,
  `check:server-undef`, `check:admin-menu-icons`, `test:version`, `test:seo`,
  `test:rbac` (sus 2 fallos previos no cambian).

## Pendiente / limitaciones reales

- Correo real: depende de `RESEND_API_KEY` o SMTP de plataforma; sin eso los
  avisos quedan como omitidos en la auditoría. WhatsApp y campañas: futuro.
- Los contenedores son una lista cerrada ordenable con opciones acotadas, no un constructor visual libre (a propósito).
- Exportación (CSV) de solicitudes y métricas: no incluida en esta versión.
- Un recurso con archivo privado (`fileId`) se muestra como «hasFile» sin
  descarga pública: la entrega de documentos a familias con registro queda
  para una fase posterior.
