<!-- Léelo ANTES de tocar el avance de los formularios del proyecto, las columnas documentales de «Proyectos postulados», los recordatorios de documentación, la entrega de la presentación o el avance que ve el club en «Mi Proyecto». -->

## Seguimiento documental de los proyectos — v4.1332

Pedido del comité (XII Feria, Valledupar 2027): convertir «Proyectos postulados»
(`/admin/dashboard?panel=proyectos` y el módulo Postulación de Proyectos) en un
centro de control del cumplimiento documental: avance real de la Formulación y
del FDD, estado de la presentación, del video y del Video Pitch, avance global,
faltantes, validación administrativa, recordatorios con fecha límite.

### Diagnóstico (cómo estaba hasta v4.1331)

- **El avance de un formulario era `completionOf`** (`projectFormEngine.js`):
  obligatorios CON VALOR ÷ obligatorios, `Math.round`. No miraba el formato
  (un correo «abc» contaba), no entendía condiciones y podía mostrar 100 % con
  un campo pendiente (199/200 → 100). Se guardaba en `completionPct` al
  guardar y la tarjeta de «Mi Proyecto» LEÍA esa columna: si cambiaba la
  plantilla, la cifra quedaba vieja.
- «Avance general» de «Mi Proyecto» era un promedio calculado en el navegador.
- **No existía la entrega de la presentación**: sólo la descarga de la
  plantilla (v4.1264). El video propio (v4.1298) y el Video Pitch (v4.1293)
  tienen sus módulos y estados.
- Los formularios tienen `reviewStatus` = la APROBACIÓN INSTITUCIONAL del
  Distrito, que además BLOQUEA la edición (`editability`). No sirve como
  «validado por el comité».
- Recordatorios: sólo los de pago (v4.1253), sin registro de fallidos.
- El cierre: la v4.1330 ya separa crear (fecha de postulación) de editar
  (política «Edición de proyectos después del cierre»). Este módulo NO lo toca.

### Qué es ahora

| Pieza | Dónde |
|---|---|
| El AVANCE de un formulario, la única cuenta (`formProgressOf`; `completionOf` delega) + condiciones `appliesIf` / `requiredIf` | `server/lib/projectFormEngine.js` |
| El CRITERIO documental, puro: requisitos, configuración, estados de entrega, validación, global, semáforo, filtros, indicadores, veredicto y agrupación de recordatorios | `server/lib/projectDocumentTracking.js` |
| La LECTURA por lotes (una consulta por fuente para N proyectos) y la caché `completionPct` | `server/lib/projectDocumentTrackingStore.js` |
| Las tres tablas | `server/lib/ensureProjectDocumentSchema.js` |
| Comité (indicadores, detalle, revisión, «No aplica», observación, recordatorios, configuración) y club (estado, presentación) | `server/controllers/projectDocumentTrackingController.js` |
| Listado: columnas `documents`, filtros/orden documentales, `responsable`; CSV con columnas documentales; `docViews` en el catálogo | `server/controllers/projectFairAdminController.js` |
| «Mi Proyecto» con la cifra calculada (`withLivePct`) | `server/controllers/projectFormsController.js` (`cardFor`, `getForm`, `adminGetForm`) |
| Tipos y llamadas del cliente | `src/lib/documentTracking.ts` |
| Franja, celdas, detalle, recordatorios, configuración | `src/components/admin/feria/seguimiento/*` |
| Integración (columnas contraíbles, tarjetas móviles, filtros, Excel) | `src/pages/admin/PostulacionesPagos.tsx` |
| PDF: columna «DOC.» | `src/lib/projectFairReportPdf.ts` |
| «Mi Proyecto»: panel y entrega de la presentación | `src/components/project-forms/DocumentProgressPanel.tsx`, `PresentationDeliveryCard.tsx` |

Rutas (`server/routes/project-fair.js`; literales antes de `/:id`):

| Ruta | Quién |
|---|---|
| `GET /admin/seguimiento-documental?evento=&<filtros>` (indicadores) · `GET …/config` · `GET …/recordatorios` · `GET …/:id` · `GET …/:id/presentacion/:fileId/url` | `fairRead` + `view` |
| `POST …/:id/revision` · `POST …/:id/aplicabilidad` · `POST …/recordatorios` · `POST …/recordatorios/:reminderId/reintentar` | `fairEdit` + `changeStatus` |
| `POST …/:id/observacion` | `fairEdit` + `comment` |
| `PUT …/config` | `fairManage` + `config` |
| `GET /portal/document-status` · `GET /portal/presentation` · `POST …/presign` · `POST /portal/presentation` · `GET …/:fileId/url` | El club (`portalAuth`); la postulación sale del TOKEN |

### Modelo de datos (tres tablas, fuera de Prisma)

- `ProjectPresentationFile` — cada archivo de presentación entregado (PDF o
  PPTX por sus bytes, reutiliza `judgeUploadedFile` de los recursos).
  Inmutable; la vigente es la de número mayor. S3 privado
  `private/project-fair-resources/club-presentations/{id}/`.
- `ProjectDocumentReview` — PK (`submissionId`, `requirementKey`): `status`
  (`in_review` | `validated` | `changes_requested`), `note`, **`fingerprint`**
  (qué se revisó: `lastEditedAt` del formulario o id de la versión) y
  `applicability` (`not_applicable` | `required`) con motivo.
- `ProjectDocumentReminder` — un envío por destinatario: proyectos
  (`submissionIds`), foto de lo pendiente, `status` (`queued`/`sent`/`failed`/
  `cancelled`), error, intentos, `dedupeKey` ÚNICA (correo + proyectos + día).

La configuración vive en la convocatoria de la edición: `cfg.documentTracking`
(+ `documentTrackingHistory`, últimos 30 cambios).

### Reglas durables

- **⚠️ UNA SOLA CUENTA.** Todo porcentaje —tabla, detalle, indicadores,
  CSV/Excel/PDF, correo, «Mi Proyecto»— sale de `formProgressOf` y
  `trackingOf`. El navegador no calcula. `completionPct` es caché: el
  seguimiento la refresca cuando no coincide (sólo esa columna, nunca
  respuestas ni `lastEditedAt`).
- **Avance de un formulario** = obligatorios APLICABLES con valor y formato
  válido ÷ obligatorios aplicables. Opcionales no frenan el 100 %. 100 % sólo
  si TODO está; si no, máximo 99 %. Un archivo cuenta con su enlace válido
  guardado.
- **DILIGENCIADO ≠ ENTREGADO ≠ VALIDADO.** El avance global mide formularios
  al 100 % y archivos entregados; la validación del comité es otra columna.
  «Cargada» no es «Validada».
- **El global se calcula sólo sobre lo OBLIGATORIO que aplica**, con pesos
  configurables (iguales por defecto). «Opcional» se muestra y no suma; «No
  aplica» (de la Convocatoria o del proyecto, con motivo) sale del cálculo: el
  proyecto puede llegar al 100 %.
- **La validación vale para lo que se revisó** (huella): si el club cambia el
  formulario o sube otra versión, la revisión queda «desactualizada» y el
  requisito vuelve a pendiente de revisión, sin que nadie la reabra. No se
  valida un formulario por debajo del 100 % (409).
- **NO SE USA `reviewStatus`** de los formularios: es la aprobación del
  Distrito y bloquea la edición del club.
- **El video se revisa en su módulo** (`applyStatus` de «Videos de
  proyectos»); el detalle llama a ESA ruta. `/revision` con `video` → 409.
- **El Video Pitch es un servicio**: columna aparte, nunca suma ni resta; su
  «Pago pendiente» no es el de la inscripción.
- **El comité NO edita respuestas desde aquí** (sin UPDATE a los formularios,
  al estado ni al pago; la prueba lo fija). Para editar está el expediente.
- **La presentación sigue la regla de edición de la Formulación**
  (`editability(…, 'master')`): antes del cierre, en el período posterior
  autorizado o con «Reabrir edición». En revisión o validada no se reemplaza;
  una corrección pedida sí.
- **Recordatorios**: sin `confirm: true` sólo plan + vista previa del correo
  real. Sólo a postulados, no archivados, ni retirados/rechazados/cerrados,
  incompletos y que PUEDAN editar. Un correo por responsable con todos sus
  proyectos. Intervalo y tope por proyecto configurables. Cada envío se
  registra ANTES de salir (`ON CONFLICT ("dedupeKey") DO NOTHING`); el
  fallido queda con su error y se reintenta con los datos de hoy (si ya está
  completo, se cancela).
- **Fecha límite documental por edición** (y por requisito). Ninguna fecha en
  el código. No reabre postulaciones; el servidor avisa si la fecha cae
  después del cierre de la edición de formularios (v4.1330) o si la edición
  posterior está apagada.
- **Semáforo en días de calendario de Colombia**: vencido / urgente (≤
  `urgentDays`) / atención (≤ `attentionDays`) / a tiempo / sin fecha / al día.
- **Listado**: sin filtro ni orden documental, SQL paginado de siempre + el
  seguimiento de la PÁGINA. Con `doc`, `docMin/docMax`, `actividadDesde/Hasta`
  u orden `docOverall|docMaster|docFdd|docPriority|docActivity`, se calcula
  para todo lo que pasa los demás filtros (tope 5000) y se filtra/ordena en el
  servidor: así se combinan con todo.
- **Esquemas: una sola creación en curso** (promesa compartida + reintento):
  la franja y la tabla piden a la vez y dos `CREATE TABLE IF NOT EXISTS`
  simultáneos chocan en Postgres (`pg_type_typname_nsp_index`). Lo encontró la
  prueba en navegador.
- **Indicadores** sobre los filtros activos SIN la vista documental: cada
  tarjeta dice cuántos hay en su grupo y sirve de filtro.

### Pruebas

- `npm run test:fair:document-tracking` (puro, en `prebuild`): motor,
  criterio, recordatorios e invariantes leídas de los archivos.
- `FAIR_E2E_DATABASE_URL=… npm run test:fair:document-tracking:e2e` (79,
  Postgres real, S3 simulado, correo interceptado): misma cifra club/comité,
  inválidos, caché, presentación (DOCX disfrazado, versiones, corrección,
  validada bloqueada, otro club), video y Video Pitch, revisión con huella,
  «No aplica», filtros combinados, orden, rango, indicadores, recordatorios
  (agrupación, borrador, archivado, fallido + reintento, intervalo),
  configuración, CSV, permisos y que nada movió estados ni pagos.
- `FAIR_E2E_DATABASE_URL=… npm run test:fair:document-tracking:ui` (38,
  navegador, 1500 y 390 px; necesita `dist/assets` para el CSS): tabla,
  detalle, «No aplica», recordatorios con vista previa y registro, columnas
  contraíbles, tarjetas móviles, «Mi Proyecto».

### Pendientes conocidos

- **Validación ítem a ítem del formulario** (campo por campo): hoy se valida
  el formulario entero. La bitácora campo a campo del expediente
  (`ProjectDossierRevision`) es la base si se pide.
- **Presentación: CORS del bucket y objetos huérfanos**, igual que los demás
  PUT prefirmados (ver `plantilla-de-presentacion.md`).
- **Recordatorios automáticos programados**: deliberadamente NO hay; el pedido
  exige autorización explícita. Si se piden, montarlos sobre `planReminders`
  con una programación por edición y el mismo registro.
- **Fecha límite por tipo de proyecto**: hoy por edición y por requisito.
