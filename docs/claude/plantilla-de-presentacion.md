<!-- Léelo ANTES de tocar la plantilla de presentación, «Recursos y plantillas» o las tarjetas de «Mi proyecto». -->

## Plantilla oficial de presentación del proyecto — v4.1264

Pedido del comité (XII Feria, Valledupar 2027): que los clubes descarguen desde
`/mi-proyecto` la plantilla institucional para presentar su proyecto, que el
comité la administre (subir, reemplazar, publicar) y que sepa **quién la
descargó y quién no**. Un recurso oficial, administrable, versionado y medible;
no un archivo enlazado en el código.

| Archivo | Qué es |
|---|---|
| `server/lib/projectFairResourceSpec.js` | El CRITERIO, puro: formatos (PPTX y PDF), tipo REAL por los bytes (`sniffFormat`), tope configurable, nombre y `Content-Disposition` de la descarga, estado de la tarjeta del club (`cardStateOf`), indicadores y filtros del seguimiento |
| `server/lib/projectFairResourceStorage.js` | S3: prefijo PRIVADO `private/project-fair-resources/{edición}/{recurso}/`, subida prefirmada, lectura por rangos para validar, lectura firmada de 2 minutos |
| `server/lib/ensureProjectFairResourceSchema.js` | Las cuatro tablas (con `OWNED_COLUMNS`) |
| `server/controllers/projectFairResourceController.js` | Administración, analítica y la descarga del club |
| `src/components/project-forms/ProjectResourceCards.tsx` | Tarjetas `PresentationTemplateCard` y `NextStepCard` (31A) |
| `src/components/admin/feria/RecursosPlantillas.tsx` | Pestaña «Recursos y plantillas» de Postulación de Proyectos |

Rutas (`server/routes/project-fair.js`):

| Ruta | Quién |
|---|---|
| `GET /portal/resources` · `POST /portal/resources/:key/download` | El club, con su token del panel (`portalAuth`) |
| `GET /admin/recursos?evento=` · `GET …/:key/analytics` · `GET …/:key/versions/:id/download` | `fairRead` + capacidad `view` |
| `GET …/:key/analytics.csv` | `fairRead` + capacidad `export` |
| `PUT /admin/recursos/:key` · `POST …/:key/presign` · `POST …/:key/versions` | `fairManage` + capacidad `config` (sólo el rol admin del módulo) |

### Modelo de datos

- `ProjectFairResource` — `(scope, key)` único. `scope` es la EDICIÓN
  (`CalendarEvent.id`) o `'global'`. Título, descripción, `active`,
  `maxSizeMb`, `currentVersionId`.
- `ProjectFairResourceVersion` — inmutable. `(resourceId, versionNumber)`
  único. Clave de S3, nombre, formato, tamaño REAL, nota, quién y cuándo.
- `ProjectFairResourceDownload` — una fila por SOLICITUD: `requested` →
  `delivered` | `failed` (+ `errorCode`: `not_available`, `storage_missing`,
  `sign_error`, `record_error`, `server_error`). Guarda `submissionId`,
  `accountId`, versión y `auditEventId`. **No copia** nombre, correo, club,
  distrito ni proyecto: salen de la postulación.
- `ProjectFairResourceEvent` — historial administrativo (subir, reemplazar,
  publicar, desactivar, cambiar texto o tope, descarga del administrador).

### Reglas durables

- **⚠️ «ENTREGADA» ES LO QUE EL SERVIDOR PUEDE AFIRMAR**: autorizó y devolvió
  un enlace válido al archivo vigente. No que se guardó ni se abrió. El orden
  en `portalDownload` es: registrar la solicitud → comprobar que el objeto
  exista → firmar → registrar la entrega y el evento `template_downloaded` en
  el historial de la postulación → **recién entonces** devolver el enlace. Si
  el registro falla, el enlace no sale. Lo fija `test:fair:resources`.
- **Un intento fallido nunca cuenta como descarga**, y «No han descargado» se
  calcula comparando los ELEGIBLES con las entregas, no mirando la tabla de
  auditoría (un club que nunca lo intentó no tiene filas).
- **Elegible = postulado (`isApplied`) y no archivado.** Un borrador PUEDE
  descargar (tiene acceso al panel y la descarga no depende de postular ni de
  pagar): su descarga aparece en la tabla marcada «no elegible» y suma en
  usuarios únicos y en descargas, pero no en el denominador de la adopción.
- **Descargar no toca nada más**: ni el pago, ni `workflowStatus`, ni los
  formularios, ni la redirección a 31A. La prueba busca `UPDATE` a esas tablas
  en el controlador.
- **El tipo se juzga por los BYTES, ya subidos**: `%PDF-` en el primer KB, o
  un ZIP cuyo directorio central (al FINAL) nombra `ppt/presentation.xml`. Un
  DOCX renombrado es ZIP y se rechaza. El peso que vale es el de S3, no el
  declarado. Un objeto rechazado se borra.
- **El archivo nunca pasa por la función**: Vercel corta en 4,5 MB el cuerpo
  de la petición Y de la respuesta. Se sube con PUT prefirmado y se descarga
  con GET firmado (2 min, `attachment`). Por lo mismo no se hace streaming.
- **Reemplazar agrega una versión y la deja vigente**; la anterior, su objeto
  en S3 y sus descargas se conservan. Si el recurso estaba publicado, la nueva
  queda publicada al instante.
- **Publicar exige archivo** (409 si no hay versión).
- **El ámbito es la edición**, como la convocatoria (v4.691): el club recibe
  el recurso de su `submission.eventId` y, si esa edición no tiene uno, el
  `'global'`. Nunca el de otra feria.
- **La descarga del administrador no es una descarga de club**: queda en el
  historial del recurso, no en `ProjectFairResourceDownload`.
- **La cuadrícula de «Mi proyecto» es UNA**: formularios (los que mande el
  servidor), luego la plantilla y luego 31A. Con los dos formularios de hoy,
  la plantilla cae bajo la Formulación y 31A bajo el FDD. Si se registra un
  tercer formulario, el orden se corre: revisar la disposición.
- **Las métricas viven en la pestaña, no en el Centro de Inteligencia**: la
  regla «ninguna métrica se pinta dos veces» y el pedido (no comprometer la
  claridad del tablero) lo deciden así.

### Cómo se probó

- `npm run test:fair:resources` — 70 comprobaciones sin base ni red.
- `FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:resources:e2e`
  — 55 comprobaciones con Postgres REAL, un S3 simulado y el router real:
  permisos (sin sesión, token de la plataforma en el panel, cuenta de otra
  postulación, perfil de lectura), DOCX disfrazado, publicar, descargar,
  descarga repetida, objeto desaparecido (503 con referencia), reemplazo de
  versión, analítica, filtros, CSV e independencia del pago y del proyecto.
  Exige una base local: nunca corre contra otra.
- `npm run test:fair:resources:ui` — 24 comprobaciones en navegador con la API
  simulada: posiciones a 1280 y 390 px, POST con la sesión, enlace firmado
  seguido, estados de error, «próximamente» y «ya descargada», pestaña del
  administrador. Con `TW_CSS=` (CSS de Tailwind) y `SHOTS=` guarda capturas.

### Pendientes conocidos

- **CORS del bucket**: la subida desde el panel es un PUT del navegador a S3,
  igual que los aportes de contenido y los documentos. Si el bucket no lo
  permite desde el dominio del panel, la subida falla con «Se cortó la
  conexión con el almacenamiento».
- Un PUT prefirmado que nunca se registra deja un objeto huérfano en el
  prefijo privado; conviene una regla de ciclo de vida sobre
  `private/project-fair-resources/` que borre lo no registrado (hoy no hay
  forma de distinguirlo desde S3; el registro vive en la base).
- Un club que comparta el enlace firmado lo comparte por 2 minutos; la
  descarga que haga otro con ese enlace no se registra a su nombre.
- No hay recordatorio automático a quienes no han descargado: la tabla y la
  exportación son la herramienta. Los recordatorios de pago (v4.1253) son un
  buen modelo si se pide.
