<!-- Léelo ANTES de tocar el botón público de descarga de la guía de hoteles, la tarjeta «Guía descargable» del panel o las tablas EventDocument*. -->

# Estadísticas de descarga de los documentos de un evento — v4.1279.0

Pedido del comité (XIII Conferencia, Villavicencio 2027): saber **cuántas veces
se descargó el boletín** publicado como «Guía descargable» en la sección de
hoteles, consultarlo **sólo desde el administrador del evento**, sin cambiar
nada para los asistentes, y que sirva para otros documentos y eventos.

## Diagnóstico de partida (por qué no se podía contar)

Hasta v4.1278 el botón «📥 Descargar guía de hoteles» de la ficha pública era
un `<a href>` **directo a S3** (`events/hotels/{evento}/docs/{uuid}/…pdf`, con
`Content-Disposition: attachment` y caché inmutable). Nada de la plataforma
intervenía: ni visita, ni clic, ni descarga llegaban al servidor. El panel ya
tenía dos analíticas con el mismo problema resuelto —los enlaces cortos
(v4.993) y la lectura de artículos (v4.1000)— y una descarga medida y
versionada en la Feria (v4.1264). Este módulo reutiliza ese criterio
(`linkTracking.js`: bots, dispositivo, fuente, visitante sin IP, días en
Bogotá) y su disciplina (una sentencia por registro).

## Dónde vive

| Pieza | Archivo |
|---|---|
| El CRITERIO, puro (qué se puede descargar, dirección del botón, qué cuenta, repetición, tope, períodos, estado de la tarjeta) | `server/lib/eventDocumentStats.js` (+ `.d.ts`; lo importan servidor, sitio y panel) |
| Las cinco tablas, en runtime | `server/lib/ensureEventDocumentSchema.js` |
| La I/O: versión vigente, registro en una sentencia, resumen y estadísticas | `server/lib/eventDocumentStore.js` |
| La descarga pública y las dos lecturas del panel | `server/controllers/eventDocumentController.js` |
| Rutas | `server/routes/calendar.js` (`/api/calendar/events/:id/hotels/document/{download,summary,stats}`) |
| El botón público (sección y vista ampliada) | `src/components/EventHotelsSection.tsx` (`eventId`), `src/components/EventHotelsLightbox.tsx` (`downloadHref`) |
| La cifra y «Ver estadísticas» en la tarjeta de la guía | `src/components/admin/events/EventHotelsEditor.tsx` |
| El panel de estadísticas (modal) | `src/components/admin/events/EventDocumentStatsModal.tsx` |
| Cliente del panel | `src/lib/eventDocumentStats.ts` |
| Pruebas | `npm run test:event-documents` (64, sin red) · `EVENT_DOCS_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:event-documents:e2e` (17, Postgres real) |

## El flujo de una descarga

1. La ficha pide el evento como siempre (`GET /clubs/:clubId/events/:id`); nada
   cambia ahí y **visitar la ficha no suma**.
2. El botón apunta a `/api/calendar/events/{id}/hotels/document/download?from=section`
   (`lightbox` desde la vista ampliada). Lo arma `hotelsGuideDownloadPath`.
3. El servidor carga el evento (id o slug), y `resolvePublicDownload` exige:
   evento **público** (un borrador «no existe»), sección activa con
   diapositivas, `allowDownload` y archivo. Si no: **404**, sin registrar nada.
4. `describeDownloadRequest` clasifica la solicitud (bot o persona,
   dispositivo, fuente, país desde las cabeceras del borde, semilla del
   visitante).
5. `ensureDocumentVersion` resuelve el documento lógico `(eventId,
   'hotels_guide')` y la versión de la URL vigente (los crea si hacen falta).
6. `recordDownload` registra en **una sentencia**.
7. `302` al PDF de S3 con `Cache-Control: no-store` (un 302 cacheado dejaría
   de contar y seguiría llevando a un archivo reemplazado).

## Modelo de datos (las cinco tablas, fuera de Prisma)

- `EventDocument` — el documento LÓGICO: `(eventId, resourceKey)` único,
  `clubId`, `title`, `currentVersionId`, contadores exactos (`totalDownloads`,
  `uniqueVisitors`, `botHits`, `repeatHits`), `lastDownloadAt`.
- `EventDocumentVersion` — cada archivo que ocupó ese lugar: `(documentId,
  url)` único (la URL de S3 lleva un UUID por subida), `versionNumber`,
  nombre, peso, `uploadedAt`, `downloads`, `lastDownloadAt`. **Nunca se borra.**
- `EventDocumentDownload` — una fila por solicitud válida: hora del servidor,
  `visitorKey` (hash con sal, **sin IP**), `source` (`section` | `lightbox`),
  fuente de la visita, dispositivo, navegador, SO, país, ciudad. Sin
  user-agent completo, sin nombre.
- `EventDocumentDaily` — `(documentId, day)`: `downloads`, `uniques`, `bots`,
  `repeats`. El día se corta en `America/Bogota` (`STATS_TZ`).
- `EventDocumentVisitor` — `(documentId, visitorKey)`: primera y última vez,
  `prevSeenAt` (ver abajo), `downloads`.

## Reglas durables

- **⚠️ LO QUE SE MIDE ES UNA SOLICITUD VÁLIDA REDIRIGIDA AL ARCHIVO.** Nunca se
  dice «archivo guardado»: el servidor no puede saberlo. La pantalla lo
  explica. No hay visor en línea del PDF, así que no existe «vista» aparte;
  `source` distingue el botón de la sección del ícono de la vista ampliada.
- **⚠️ EL BOTÓN PÚBLICO NUNCA ENLAZA S3 DIRECTO.** `EventHotelsSection` sólo
  usa la URL directa sin `eventId` o en `preview` (la vista previa del panel:
  una prueba del administrador no cuenta). «Ver archivo» del panel también va
  directo. La prueba lo fija leyendo el código.
- **⚠️ MEDIR NUNCA BLOQUEA LA DESCARGA.** Base caída después de resolver el
  destino, tope por dirección, fallo al registrar → se redirige igual y la
  solicitud **no se cuenta** (queda en el log). Lo único que responde 404 es
  lo que no está publicado. Una solicitud que no se registró **jamás se
  presenta como descarga**.
- **⚠️ UNA SOLA SENTENCIA POR REGISTRO**, con la decisión «¿cuenta?» tomada
  por la base: el UPSERT del visitante guarda la visita anterior en
  `prevSeenAt` y lo devuelve, así que **dos solicitudes simultáneas del mismo
  visitante cuentan una** (probado con 10 a la vez en Postgres real). Dentro de
  `REPEAT_WINDOW_SEC` (30 s) es repetición (`repeats`, aparte); un bot o una
  precarga sólo suma a `bots`. `EventDocument` no se modifica dos veces en la
  misma sentencia: fijar `currentVersionId` es una segunda sentencia, sólo
  cuando cambió.
- **⚠️ EL HISTÓRICO SOBREVIVE A TODO LO QUE HACE EL PANEL.** Reemplazar el PDF
  = versión nueva vigente, la anterior y sus descargas se conservan;
  renombrar = sólo cambia `title`/`fileName`; desactivar la descarga = 404
  público y el histórico intacto (la tarjeta lo dice); reactivar = sigue
  sumando; quitar el archivo = estado `archived`, «Histórico conservado: N
  descargas». **Ninguna fila se borra nunca.**
- **NO SE INVENTA HISTORIAL.** Sin fila en la base: «Sin datos registrados
  todavía». Un archivo recién guardado aparece con «0 descargas» porque la
  lectura del panel sincroniza su versión (`summaryFor`/`statsFor` llaman a
  `ensureDocumentVersion` con el documento **guardado**, no con el borrador
  sin guardar: la tarjeta avisa «guarda los cambios para medir el archivo
  nuevo»).
- **PERMISOS.** La descarga es pública. Resumen y estadísticas:
  `assertEventCapability(req, id, 'view')` (un evento ajeno «no existe», 404)
  y, sin grant que decida, sólo `SITE_ADMIN_ROLES` (403). Todo lo que se
  escribe lleva `eventId` y `clubId`; todo lo que se lee se acota por el
  evento ya autorizado. **Las estadísticas de un evento no se mezclan con otro.**
- **PERÍODOS.** `hoy`, `d7`, `d30`, `todo` y `custom` (`from`/`to`). El rango
  propio lo valida **el servidor** (`customRange`): `hasta` nunca después de
  hoy, invertido se corrige, tope `MAX_RANGE_DAYS` (400) recortando el inicio,
  inválido cae a 30 días. La serie se rellena con ceros (`fillDownloadDays`).
- **LA PÁGINA PÚBLICA NO CAMBIA.** Mismo botón, mismo texto, mismo archivo.
  Sin contadores, gráficos ni estadísticas (la prueba busca esas palabras en
  los componentes públicos).
- **REUTILIZABLE POR CLAVE DE RECURSO.** `RESOURCES` en el criterio: hoy sólo
  `hotels_guide`. Un boletín, una programación o una guía del participante se
  agregan con otra clave y su propio `currentDocument(event)`; tablas,
  registro, resumen y panel sirven tal cual. Por pedido, la implementación se
  limitó al flujo existente.
- **LAS CINCO TABLAS VAN EN LA LISTA DEL GUARDIÁN DE `db:push`** (documentada
  en `scripts/db-push-guard.mjs` y en CLAUDE.md).

## Lo que NO se afirma (y se dice en pantalla)

- Visitantes únicos son una **estimación**: hash de (sitio, IP, user-agent
  recortado); una persona con dos dispositivos cuenta dos; dos personas detrás
  de la misma IP con el mismo navegador cuentan una.
- El tope por dirección y la ventana de repetición viven **por instancia** de
  la función (memoria); la ventana de repetición, en cambio, la decide la base
  y vale entre instancias.
- No se comprueba con un `HEAD` que el objeto exista en S3 antes de contar:
  una guía cuyo archivo se borró a mano de S3 contaría solicitudes que
  terminan en 404 del bucket. «Archivos sin uso» nunca borra el archivo
  referenciado, así que no ocurre desde el panel.

## Cómo se probó

- `npm run test:event-documents` — 64 comprobaciones sin base: criterio
  (publicación, bots, precargas, tope, períodos, rango propio, relleno),
  almacén contra un doble que reproduce la semántica (una sentencia, sin IP
  ni user-agent en los parámetros, repetición, bot, 20 simultáneas, fallo que
  no cuenta, reemplazo, archivado, aislamiento entre eventos), controlador
  (302 y 404, bot, doble clic, tope, base caída antes y después del destino,
  permisos del panel) y código fuente (botón medible, vista previa directa,
  nada público, lista del guardián).
- `npm run test:event-documents:e2e` — 17 con **Postgres real**: `ensure`
  desde cero, UPSERT con `prevSeenAt`, ventana, bot, no identificable, **30
  simultáneas (20 distintos + 10 del mismo visitante → 21)**, reemplazo,
  resumen, estadísticas por período y rango propio, corte del día en Bogotá,
  archivado, controladores y permisos.

## Pendientes conocidos

- No hay exportación CSV ni recordatorio; si se pide, el modelo es la
  plantilla de la Feria (v4.1264).
- Las estadísticas de la guía no aparecen en el Centro de Gestión del Evento:
  viven en la pestaña de hoteles (regla «ninguna métrica se pinta dos veces»).
