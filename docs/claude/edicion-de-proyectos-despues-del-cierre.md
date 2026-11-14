<!-- Léelo ANTES de tocar la edición de formularios del proyecto, la fecha límite de la Feria o «Mi Proyecto». -->

## Edición de proyectos después del cierre — v4.1330

Pedido del cliente (XII Feria, Valledupar 2027), con la captura de «Mi
Proyecto» que decía *«El plazo de postulación cerró el 2026-11-09. Escríbenos si
necesitas hacer un ajuste»* sobre una Formulación al 53 % y un FDD al 21 %:
*«la fecha de cierre debe impedir nuevas postulaciones, pero no bloquear
automáticamente el mantenimiento de proyectos existentes»*.

### Diagnóstico (cómo estaba hasta v4.1329)

- **El bloqueo era UNA regla en `editability`** (`projectFormsController.js`):
  pasado `cfg.deadline` (23:59:59 de Colombia) → `canEdit:false` salvo
  `reopenedAt`. La usaban abrir (`getForm`, sólo lectura), guardar (`saveForm`,
  403), enviar (`submitForm`, 403), la ruta heredada `/portal/form`, el aviso de
  `/portal/me` y cada tarjeta (`cardFor`).
- **La fecha hacía lo CONTRARIO de la regla del negocio**: no cerraba la
  creación. `createSubmission` (wizard) y `submitApplication` (enviar un
  borrador) sólo miraban `cfg.enabled`; el propio código lo decía desde v4.610
  (`config.deadline` «se usa para la ventana de edición»). Sólo
  `secondProjectVerdict` respetaba la fecha.
- `editability` no miraba el estado del proyecto; «Reabrir edición» devolvía el
  formulario a `status = 'draft'` (borraba la constancia del envío); la
  bitácora (`ProjectFairFormRevision`) eran fotos completas cada 10 minutos, sin
  campo ni marca de «después del cierre».

### Qué es ahora

| Pieza | Dónde |
|---|---|
| El CRITERIO genérico (no sabe nada de la Feria): fases, vigencia, formularios, estados, autorización, archivo, campos bloqueados, aplicación del bloqueo, diferencias y enmascarado | `server/lib/postCloseEditPolicy.js` |
| La política de la Feria: `FAIR_POST_CLOSE_DEFAULTS`, `fairPostClosePolicyOf`, `fairFormEditVerdict`, `editRequestOf` y el corte de CREACIÓN `applicationsClosedOf` | `server/lib/projectFairLifecycle.js` |
| La configuración por edición | `cfg.postCloseEditing` (en `DEFAULT_CONFIG` y en cada `ProjectFairConfig` por `eventId`) |
| `editability(submission, record, cfg, account, formKey)` + `editWindow`; bloqueo en `saveForm`/`submitForm`; foto de pendientes; bitácora; `requestEdit`; `markPostCloseReviewed` | `server/controllers/projectFormsController.js` |
| Filtro `?actualizaciones=` (`POST_CLOSE_FILTERS`), marcas en `mapRow`, `postCloseViews` en el catálogo | `server/controllers/projectFairAdminController.js` |
| Sección de la Convocatoria | `src/components/admin/feria/PostCloseEditingCard.tsx` |
| «Mi Proyecto», formulario, wizard público, listado/ficha, historial | `MiProyecto.tsx`, `ProjectFormView.tsx`, `FeriaProyectos.tsx`, `PostulacionesPagos.tsx`, `ExpedienteHistorial.tsx` |

Rutas nuevas: `POST /portal/forms/:formKey/edit-request` (el club pide
autorización; la postulación sale del TOKEN) y
`POST /admin/postulaciones/:id/post-close/reviewed` (permiso `changeStatus`).

**Sin tablas nuevas.** Las marcas viven en `ProjectFairSubmission.metadata`:
`postCloseEdit` (`firstAt`, `lastAt`, `pendingReview`, `sensitive`, `forms`,
`changes`, `reviewedAt`, `reviewedBy`), `lastClubEditAt`, `editRequests[formKey]`
y `postCloseBaseline[formKey]`. La bitácora campo a campo es la del Expediente,
`ProjectDossierRevision`, con `kind = 'club_edit'` o `'club_edit_post_close'`.

### Reglas durables

- **⚠️ CREAR Y EDITAR SON DOS REGLAS.** `applicationsClosedOf` (apagada O fecha
  vencida) cierra el wizard, el envío de borradores y lo dice la configuración
  pública (`applications.open`) para que el wizard no deje llenar todo y
  rechazar al final. La edición de lo inscrito la decide SÓLO la política. Las
  vías administrativas (importación, sustitución) no pasan por el corte.
- **De fábrica: activada**, sin fecha adicional, todos los formularios, alcance
  «todos los campos», estados: Postulado/Requiere ajustes editables, En
  revisión con restricciones, Aprobado/Rechazado/Retirado/Enviado a Rotary
  Grants con autorización, Cerrado no editable. Un estado que la política no
  conozca pide autorización. Archivado: no se edita salvo «Reabrir edición».
- **«Reabrir edición» (`reopenedAt`) ES la autorización individual** y manda
  sobre todo, también sobre el archivo. Ya no toca `status` (un formulario
  enviado sigue enviado) y borra la solicitud del club.
- **EL BLOQUEO DE CAMPOS VA EN EL SERVIDOR.** `applyFieldLocks` deja en cada
  campo bloqueado EXACTAMENTE lo guardado, mande el navegador lo que mande (la
  misma idea que `stripProtected`). La pantalla sólo lo muestra.
- **Los sensibles se declaran por RUTA en la política**, no con `sensitive:
  true` en la plantilla: la copia guardada de la plantilla reemplaza los arrays
  (la trampa de v4.788). El criterio también respeta `field.sensitive` si algún
  día una plantilla lo trae.
- **«Solo campos pendientes» usa una FOTO** (`postCloseBaseline`), tomada con un
  UPDATE condicional la primera vez que el formulario se abre o guarda después
  del cierre. Calcularlo con lo guardado bloquearía el campo en cuanto el club
  escribiera su primera letra.
- **Editar después del cierre NO mueve el estado del proyecto**: `submitForm`
  sólo pasa a «En revisión» antes del cierre. Tampoco toca `appliedAt`,
  `createdAt`, el pago ni Stripe. Lo que se enciende es «Cambios pendientes de
  revisión», y lo apaga el comité («Marcar cambios como revisados»), que
  tampoco toca el estado.
- **La bitácora agrupa** los autoguardados de un campo en 30 minutos (el antes
  es el primero, el después el último) y borra la fila si el club deshizo el
  cambio. Correos y teléfonos se guardan enmascarados. Si la bitácora falla, el
  guardado del club NO falla.
- **La acción de la tarjeta la decide el servidor** (`card.action`) con el mismo
  veredicto que acepta o rechaza el guardado: la pantalla no ofrece «editar» si
  el servidor va a responder 403.
- **Reutilizable**: otro módulo con fecha límite importa `postCloseVerdict`,
  `lockedFieldsFor`, `applyFieldLocks` y `diffAnswers` con SU política y SUS
  estados. La de una feria vive en la convocatoria de su `eventId` y no toca a
  otra edición ni a otro sitio.

### Pruebas

- `npm run test:fair:post-close` (82, puro, en `prebuild`): criterio, casos
  A–F, corte de creación e invariantes leídas de los archivos.
- `npm run test:fair:post-close:e2e` (60, Postgres local): rutas reales —
  creación cerrada, completar Formulación y FDD, sensibles bloqueados, pedir y
  conceder autorización, proyecto ajeno, envío sin mover el estado, filtros,
  revisión, historial, política apagada, vigencia y alcance, y antes del cierre
  todo como siempre.
- `npm run test:fair:post-close:ui` (46, navegador): «Mi Proyecto» y el
  formulario en 1280 y 390 px sin desbordes, sensibles deshabilitados, pedir
  autorización, listado/ficha del comité y la sección de la Convocatoria.

### Pendiente (fases siguientes, diseñadas, no activadas)

- **Edición mediante solicitud de corrección** (el club propone, el comité
  aprueba campo a campo, como el formulario institucional de programas).
- **Colaboradores autorizados**: hoy un proyecto tiene UNA cuenta
  (`ProjectFairAccount`); no hay relación ni permisos por colaborador.
