# Catálogo Maestro de Clubes — v4.1269

Pedido del Distrito 4281: «algunos clubes no aparecen en determinados
formularios y no hay una herramienta para gestionar centralizadamente el listado
completo». Se pidió una fuente **única, administrable y global**, no un ajuste a
Visitas del Gobernador.

## Diagnóstico (auditoría previa, 2026-10-31)

Había **tres** fuentes de clubes, más copias congeladas:

| # | Fuente | Qué era | Quién la leía |
|---|---|---|---|
| 1 | `server/lib/rotaryClubs.js` (`CLUBS_4271`, `CLUBS_4281`, `DISTRICT_CATALOG`) | Lista **estática en el código** (59 + 74 nombres cortos, v4.707). Cambiarla exigía un despliegue | Inscripción a eventos, «Completar inscripción», postulación de proyectos, Rotary en Acción, Activar mi club, Plantillas IA y Aniversarios (vía `publicClubs.js`), CRM institucional, tablero de Rotary en Acción, portal de clubes (`/district-clubs/config`) |
| 2 | Tabla `DistrictClubProfile` (Directorio de Clubes, v4.1212) | Sembrada **una sola vez** desde la #1, sólo el 4281. Editable desde el Directorio, pero sólo como ficha pública | Visitas del Gobernador, Directorio público, solicitudes del Directorio, patrocinio de Rotaract/Interact |
| 3 | Tabla `Club` (Prisma) | Los **sitios** alojados (tenants), no un catálogo de clubes | Agendar capacitación, registro de sitios (`/registro`), logos de Plantillas IA, cruce de Activar mi club |
| — | `ProjectFairConfig.config.districts[].clubs` | **Copia congelada** de la #1: en cuanto alguien pulsaba «Guardar» en la convocatoria, la lista quedaba fija | Postulación de proyectos |
| — | `EventEdition.settings.rotaryCatalog.districts[].clubs` | Misma copia congelada, por evento | Inscripción a eventos |

**Inconsistencias encontradas**

- Un club agregado o corregido en el Directorio **no** llegaba a eventos ni a
  postulaciones (leían la #1), y uno agregado a la #1 no llegaba al Directorio ni
  a Visitas del Gobernador (la siembra de la #2 sólo corría con la tabla vacía).
- El Distrito 4271 existía en la #1 y **no** en la #2.
- Las copias congeladas de la convocatoria y de los eventos impedían que un club
  nuevo apareciera aunque se agregara a la lista del código.
- Casi todos los formularios guardan el **nombre** como texto; sólo Visitas del
  Gobernador (y el Directorio cuando hay ficha) guardaban un id.
- Permisos: el Directorio aceptaba `clubs.manage` de **cualquier** administrador
  de sitio, también el de un club cualquiera. No había alcance por distrito.
- No había historial de cambios del catálogo ni estados (activo/inactivo).
- En el navegador no hay listas de clubes escritas a mano (verificado).

### Inventario de formularios con campo de club

| Formulario | Archivo | Fuente antes | Fuente ahora | Guarda |
|---|---|---|---|---|
| Visitas del Gobernador | `src/components/rotary/GovernorVisitForm.tsx` | #2 | Catálogo (activos) + `ClubSelector` | id |
| Inscripción a eventos | `src/pages/RegistroEvento.tsx` | #1 / copia del evento | Catálogo vivo; la copia del evento ya no congela | nombre |
| Completar inscripción | `src/pages/CompletarInscripcion.tsx` | #1 / copia del evento | Catálogo vivo | nombre |
| Postulación de proyectos | `src/pages/FeriaProyectos.tsx` | #1 / copia de la convocatoria | Catálogo vivo; la copia ya no congela | nombre |
| Rotary en Acción (club, participantes) | `src/components/rotary/RotaryEnAccionForm.tsx` | #1 | Catálogo vivo | nombre |
| Activar mi club | `src/pages/ActivarMiClub.tsx` | #1 | Catálogo vivo | nombre + `matchedClubId` (sitio) |
| Portal de clubes (cuenta del responsable) | `src/pages/ClubPortalPage.tsx` | #1 | Catálogo vivo, ahora con `id` en `officialCatalog` | nombre |
| Directorio: alta/actualización y club patrocinador | `src/components/directory/UnifiedClubForm.tsx` | #1 + #2 | Catálogo vivo + #2 | nombre + id de ficha |
| Plantillas IA | `src/pages/PlantillaPublica.tsx` | #1 vía `publicClubs` | Catálogo vivo vía `publicClubs` | nombre |
| Aniversarios IA | `src/pages/AniversarioIA.tsx` | #1 vía `publicClubs` | Catálogo vivo | nombre |
| CRM institucional | `server/lib/institutionalCrm.js`, `institutionalMatching.js` | #1 | Catálogo vivo (carga sin bloquear) | — |
| Registro de un SITIO (`/registro`) | `src/pages/RegistroPage.tsx` | texto libre | sin cambio: crea un tenant, no elige un club | — |
| Agendar capacitación | `src/pages/AgendarCapacitacion.tsx` | #3 (sitios) | sin cambio: elige un sitio, no un club | — |

No existe un registro de **persona** que pida «club de pertenencia»: las cuentas
de la plataforma no lo piden (`server/routes/auth.js` no tiene alta pública).

## La decisión: el Directorio ES el catálogo

No se creó un segundo catálogo. `DistrictClubProfile` se amplió con las columnas
del catálogo y pasó a ser la fuente única. La lista estática quedó como
**semilla** (`SEED_CLUBS_BY_DISTRICT`) y como respaldo si la base no contesta.

| Pieza | Archivo |
|---|---|
| Criterio puro (estados, validación, nombres, duplicados, importación, alcance, buscador) | `server/lib/clubCatalogSpec.js` |
| Base: esquema, reconciliación, catálogo vivo, CRUD, fusión, importación | `server/lib/clubCatalog.js` |
| Catálogo vivo (en sitio) y regla de copias congeladas | `server/lib/rotaryClubs.js` |
| Controlador y rutas | `server/controllers/clubCatalogController.js`, `server/routes/club-catalog.js` → `/api/club-catalog/…` |
| Navegador: tipos, etiquetas, caché | `src/lib/clubCatalog.ts` |
| Selector reutilizable | `src/components/clubs/ClubSelector.tsx` |
| Administración | `src/components/admin/clubs/ClubCatalogMaster.tsx`, pestaña «Catálogo Maestro» de `/admin/directorio-clubes` (`?tab=catalogo`) |
| Prueba | `npm run test:club-catalog` (`scripts/test-club-catalog.mjs`) |

### Columnas nuevas de `DistrictClubProfile` (en `OWNED_COLUMNS`)

`rotaryInternationalId`, `catalogStatus` (activo · inactivo ·
pendiente_verificacion), `clubType`, `adminNotes`, `aliases` (JSONB),
`catalogUpdatedBy`, `catalogUpdatedAt`, `catalogVerifiedAt`, `mergedIntoId`,
`notDuplicateOf` (JSONB), `catalogSource`. Tabla nueva **`ClubCatalogChange`**
(bitácora; sólo crece). Las dos están en el guardián de `db:push` y en CLAUDE.md.

## Reglas (no deshacer sin razón)

- **Dos estados distintos.** `status` (published/draft/archived) es la
  publicación de la ficha en el Directorio público; `catalogStatus` es si el
  club existe y se ofrece en formularios. Un club activo puede tener la ficha en
  borrador.
- **Nunca se borra un club.** Inactivar lo quita de los formularios nuevos; las
  visitas, inscripciones, proyectos y cuentas no se tocan. Visitas del
  Gobernador permite corregir una visita de un club inactivo (`allowInactive`).
- **Renombrar conserva el nombre anterior como alias** (`aliasesAfterRename`).
  Por eso un registro histórico que guardó el nombre como texto sigue
  resolviendo al mismo club (`resolveCatalogClub`).
- **Duplicados: se señalan, nunca se fusionan solos.** `findDuplicateCandidates`
  da motivo y confianza (mismo ID RI · mismo nombre en el distrito → alta;
  parecido ≥ 88 % → media; mismo nombre en distritos distintos → baja). Dos IDs
  RI distintos nunca son duplicado. «Marcar como duplicado» pone
  `mergedIntoId` + inactivo y pasa los nombres a alias del conservado; **no
  reescribe ninguna referencia** en otras tablas (se resuelven con
  `resolveClubId`). Es reversible (`unmergeClub`, reconstruye estado y alias
  desde la bitácora). «No son el mismo club» guarda `notDuplicateOf`.
- **Importar no incorpora nada sin revisión.** Vista previa con estado por
  fila (nuevo · completa datos · ya existe · posible duplicado · fuera de tu
  distrito · inválido). Lo nuevo entra **pendiente de verificación** (no se
  ofrece hasta que alguien lo active); lo existente sólo **completa campos
  vacíos**. El servidor re-clasifica al confirmar: lo que diga el navegador no
  obliga. «Fuente oficial» lista además los activos que NO vienen en el archivo,
  para revisar a mano: no se desactiva nada solo.
- **Reconciliación única** (`reconcileSeedOnce`, marca `seed_reconcile` en la
  bitácora): lo que la lista estática tenía y el Directorio no (incluido todo el
  4271, con la ficha en borrador para no llenar el Directorio público del 4281).
  Un despliegue posterior no deshace lo que el administrador haya cambiado.
- **Catálogo vivo.** `applyClubCatalogSnapshot` reemplaza EN SITIO los arrays de
  `rotaryClubs.js` (`CLUBS_4281` sigue siendo el mismo objeto), así los módulos
  síncronos no cambiaron. Middleware `clubCatalogFresh` en los routers de
  eventos, postulación, Rotary en Acción, contribuciones, aniversarios,
  Directorio, catálogo y `/public/design/clubs`; `clubCatalogWarm` (no espera)
  en el CRM. Caché de 60 s por instancia; la primera petición de una instancia
  espera la carga con **tope de 2,5 s** (si vence, sigue la semilla); guardar
  invalida y recarga la instancia que guardó. Otras instancias: ≤ 60 s.
- **Copias congeladas.** `seedDistrictClubs` (convocatoria) y `rotaryCatalogFor`
  (eventos): sin lista → catálogo; `[]` → se respeta («a mano»); lista CURADA
  (subconjunto) o `clubsSource: 'custom'` → se respeta; lista que es la **copia
  de la semilla** (con o sin agregados) → catálogo vivo + lo agregado a mano que
  el catálogo no conoce. `clubsSource: 'catalog'` lo fuerza.
- **Permisos (servidor).** Ver: `clubs.view`. Escribir: `clubs.manage` **y**
  alcance de `catalogScopeFor`: `administrator`/`superadmin` → todos;
  `district_admin` → su distrito; administrador/editor/institucional del
  **sitio distrital** (`Club.type` distrito) → ese distrito; el administrador
  del sitio de un club → sólo consulta (403). Cada escritura compara el
  distrito de antes y el de después.
- **Lo público** (`/public/clubs`, `/public/districts`, `/public/club/:id`) sólo
  devuelve activos y `publicClubShape`: nunca notas, correos ni quién editó.

## v4.1270 — el equipo del sitio distrital quedaba en «Sólo consulta»

Reporte con captura: en rotary4281.org el Catálogo Maestro decía «Sólo
consulta» y no ofrecía «Agregar club». `catalogScopeFor` exigía que el sitio
de la sesión tuviera `Club.type` distrito **y** `districtId` enlazado; el sitio
del 4281 está vinculado por el número en `Club.district` / su subdominio, no por
`districtId` (exactamente lo que `districtSite.js` documenta desde v4.744).

- La decisión es ahora PURA: `catalogScopeFromRecords` (en `clubCatalogSpec.js`)
  con `districtLinkScore` de `districtSite.js`: el sitio tiene que **pertenecer**
  al distrito (id, número —también «Distrito 4281» o «rotary4281»— o
  subdominio) **y declararse su sitio** (tipo distrito, subdominio del distrito
  o un `district_admin` de ese distrito asignado al sitio). Pertenecer no
  alcanza: el sitio de un club del distrito sigue en sólo consulta.
- El número del distrito sale de `District.number` o de los dígitos de su
  nombre, subdominio o dominio (`districtNumberOfRecord`).
- La API devuelve `permissions.reason`; el panel lo muestra cuando no se puede
  escribir y, cuando sí, «Administras el Distrito N».
- Pruebas: 10 casos puros con las formas reales del sitio + 3 de integración con
  el sitio del 4281 SIN `districtId`, como en producción.

## v4.1271 — el módulo de permisos «Directorio de Clubes»

`clubs` (ver / administrar, scope sitio, ruta `/admin/directorio-clubes`) en
`MODULES` de `rbacSpec.js` y su espejo `src/lib/rbacSpec.ts` (con los presets
expandidos `site_admin`, `platform_superadmin` y `viewer` actualizados a mano:
`test:rbac` los compara). La ruta salió de `platform_sites`. La Secretaría
Digital (`digital_secretary`) lo trae completo. Antes, `clubs.view` y
`clubs.manage` —que pedían las rutas— no existían en el registro, así que sólo
los roles de `SITE_ADMIN_ROLES` entraban al Directorio.

## Cómo se probó (v4.1269)

- `npm run test:club-catalog`: 41 comprobaciones puras (en `prebuild`) + 47 de
  integración con `TEST_DATABASE_URL` contra Postgres 16 local: las doce
  pruebas obligatorias del pedido (crear, aparece en Visitas / eventos /
  portal / proyectos, renombrar, inactivar, filtro por distrito, permisos,
  búsqueda, duplicados con fusión reversible, importación, formularios previos).
- Siguen en verde `test:visitas-gobernador`, `test-design`, `test-event-form`,
  `test-content-submissions`, `test-rotary-marketing` y `test-rotary-clubs`
  (24, contra Postgres).
- Chromium (Playwright) contra el build: selector en 1280 px y 390 px (teclado,
  búsqueda, sin resultados) y el panel del Catálogo Maestro.

## Pendiente (fase siguiente)

- **Guardar el id del club en los demás formularios.** Hoy eventos,
  postulación, Rotary en Acción, Plantillas y Aniversarios siguen guardando el
  NOMBRE (con «mi club no está en la lista»). El catálogo ya los alimenta y los
  alias mantienen la correspondencia con el id; migrar cada tabla a un
  `clubCatalogId` (y usar `ClubSelector`) es por módulo, con su propia prueba.
- **Portal de clubes**: `officialCatalog` ya trae el `id`, pero el alta de la
  cuenta del responsable NO lo envía a propósito: vincular una cuenta pública a
  una ficha otorga permisos sobre ella, y eso debe pasar por aprobación.
- Clubes Rotaract/Interact: el catálogo los admite (`organizationType`), pero
  los formularios sólo ofrecen Rotary.
