# Visitas del Gobernador — v4.1260

Sección de **Rotary en Acción** (no un módulo aparte) para que las secretarías
de los clubes del Distrito 4281 reporten la visita oficial del Gobernador, y el
equipo distrital la revise, la apruebe y la publique.

## Piezas

| Pieza | Archivo |
|---|---|
| Criterio (estados, validación por paso, mapeo a Rotary en Acción) | `server/lib/governorVisitSpec.js` |
| Espejo navegador del criterio | `src/lib/governorVisitSpec.ts` |
| Esquema en runtime (tabla `GovernorVisit`) | `server/lib/ensureGovernorVisitSchema.js` |
| Controlador | `server/controllers/governorVisitController.js` |
| Rutas (dentro del router de Rotary en Acción) | `server/routes/rotary-en-accion.js` → `/api/rotary-en-accion/visitas-gobernador/…` |
| Formulario público (3 pasos desde v4.1262: **Club y visita** · **Memoria y galería** · **Responsable y envío**) | `src/components/rotary/GovernorVisitForm.tsx`, página `src/pages/VisitasGobernador.tsx`, ruta canónica **`dominio.org/visitas-del-gobernador`** (v4.1261); `/rotary-en-accion/visitas-del-gobernador` redirige conservando `?corregir=` (`src/pages/VisitasGobernadorRedirect.tsx`) |
| Administración | `src/components/admin/rotary/RotaryVisitasGobernador.tsx`, pestaña `?tab=visitas` de `/admin/rotary-en-accion` |
| Ficha del club en el Directorio | `src/components/admin/rotary/ClubGovernorVisitsPanel.tsx`, pestaña «Visitas del Gobernador» de `/admin/directorio-clubes` |
| Prueba | `npm run test:visitas-gobernador` (`scripts/test-governor-visits.mjs`) |

## Decisiones (no deshacer sin razón)

- **Una visita es un registro institucional, no una solicitud de contenido.**
  Existe aunque nunca se publique y alimenta el informe de gestión del
  Gobernador. Por eso tiene su fila propia y su flujo:
  `recibida → en_revision → (correcciones | aprobada | rechazada) → publicada`.
- **Una sola tabla.** La galería (`media`) y el historial (`history`) son JSONB.
  El historial sólo crece con `history || $x::jsonb` (atómico en SQL), igual que
  `DistrictClubSubmission.history`. Está en el guardián de `db:push` y en
  CLAUDE.md. Todo `ADD COLUMN` futuro va en `OWNED_COLUMNS` del ensure.
- **El club sale del Directorio.** `clubProfileId` → `DistrictClubProfile.id`
  (sólo `organizationType = 'rotary'`, distrito 4281, no archivados). Se copian
  nombre, ciudad, departamento (`state`) y slug para que el registro siga
  legible si la ficha cambia.
- **v4.1269: el club sale del Catálogo Maestro** (`docs/claude/catalogo-maestro-de-clubes.md`):
  sólo clubes `catalogStatus = 'activo'` y sin `mergedIntoId` para una visita
  nueva; una corrección conserva su club aunque se haya inactivado
  (`clubById(…, { allowInactive, keepId })`). El selector es `ClubSelector`.
- **La subida es la de Rotary en Acción.** `presignSubmissionUpload` con la
  campaña universal: prefijo `private/campaign-submissions/{universal}/`, sin
  lectura pública, mismos topes (50 MB foto, 2 GB video). Al enviar se comprueba
  cada objeto REAL con `headSubmissionFile` y que ninguna otra visita ni
  solicitud lo reclame.
- **«Publicada» no es una transición.** Sólo `POST …/admin/:id/publish` la
  alcanza, y sólo desde «Aprobada». Publicar llama a `createSubmission` (la misma
  del formulario general) con el texto de la visita (`visitToSubmissionData`) y
  **los mismos objetos de S3** (`visitFilesForSubmission`): nada se copia ni se
  re-sube. La solicitud nace en la campaña universal, se pasa a «Aprobado» con
  `transitionSubmission` y, si los artículos automáticos están encendidos, se
  encola su artículo. Desde ahí sigue el flujo editorial de siempre
  (Biblioteca, artículo, difusión).
- **Idempotencia de la publicación.** `publishLock` impide que dos clics creen
  dos solicitudes; el vínculo `contributionSubmissionId` (índice único parcial)
  se escribe antes que cualquier otro paso, así que reintentar devuelve la misma.
- **Clasificación en Rotary en Acción:** `contentType = 'evento'`,
  `submissionType = 'governor_visit'`, etiqueta `visita-del-gobernador`. No se
  agrega un tipo nuevo a la taxonomía porque `ensureRotaryEnAccionSchema`
  reactiva todos los tipos y aparecería en el formulario general.
- **Galería tras publicar.** Al promover a la Biblioteca se borra el objeto de
  staging; la ficha de la visita usa entonces `ContributionSubmissionFile.mediaUrl`
  (`mediaWithUrls`). Antes, un enlace firmado de 15 minutos.
- **Publicada no se edita aquí:** el contenido vive en Rotary en Acción. Sólo
  las notas internas.
- **Correcciones.** «Solicitar correcciones» exige motivo y genera un enlace de
  un solo uso, 30 días (`correctionToken`, nunca sale en el detalle). El panel
  ofrece copiarlo, WhatsApp y correo (`mailto:`): **no hay envío automático**.
  El club corrige en el mismo formulario (`/visitas-del-gobernador?corregir=`) y la visita vuelve a
  «En revisión».
- **Fechas.** `pg` devuelve `DATE` como `Date`; `String(fecha).slice(0,10)` da
  «Thu Oct 29». Todo pasa por `visitDateIso`; el navegador formatea con
  `visitDateLabel` sin `new Date()` (en Colombia la fecha retrocedería un día).
- **Permisos.** Admin: `requireSubmissionInboxAccess` + `rotary_en_accion.view`
  (listar, ver, estadísticas), `.edit` (editar), `.manage` (estados), `.publish`
  (publicar). Lo público lleva `lightPublicLimit`.
- **Datos personales.** Las respuestas públicas no devuelven correo ni teléfono
  (salvo al titular del enlace de corrección, que es quien los escribió). La
  solicitud de Rotary en Acción los lleva como remitente (interno), nunca en el
  texto publicable.

## Tres pasos (v4.1262)

El reporte se pidió en cinco pasos (v4.1260) y se agrupó en tres a pedido del
cliente, sin quitar ningún campo: cada paso tiene dos bloques separados por una
línea (club + visita; memoria + galería) y el tercero es el responsable.

- El número de paso de cada error lo decide `validateVisit` en el servidor
  (`push(paso, campo, …)`) y lo repite `validateVisitStep` en el navegador; la
  prueba compara campo por campo que ambos digan el mismo paso.
- Ante un error, la vista va al primer aviso (`[data-gv-step] [role="alert"]`),
  que puede estar en el segundo bloque del paso, no al inicio de la página.

## Estadísticas (`GET …/admin/stats`)

Desde el inicio del año rotario (1 de julio) o `?from=`: visitas por mes, por
gobernador (visitas y clubes) y cobertura (clubes rotarios del catálogo con al
menos una visita no rechazada, y la lista de los que no tienen). Es la base de
los informes de gestión.

## Cómo se probó (v4.1260)

- `npm run test:visitas-gobernador`: 58 comprobaciones puras.
- Integración contra Postgres 16 local y un S3 simulado (`AWS_ENDPOINT_URL_S3`):
  58 comprobaciones con el router real (envío, rechazos, corrección, edición,
  publicación concurrente, trazabilidad, ficha del club, estadísticas), también
  con `TZ=America/Bogota`.
- Chromium (Playwright) contra el build: formulario en 1280 px y 390 px,
  borrador local, aviso al salir, panel (listado, ficha, correcciones, corrección
  del club, aprobación, publicación) y la pestaña en el Directorio.

## Pendiente

- Notificar por correo/WhatsApp automáticamente al pedir correcciones o al
  aprobar (hoy el panel prepara el mensaje y el enlace).
- Exportar el informe de gestión (PDF/Excel) a partir de `/admin/stats`.
