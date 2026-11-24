<!-- Léelo ANTES de tocar la verificación de traducciones, la insignia «EN ✓», la columna «Traducción EN», el bloque «Seguimiento de traducciones», el perfil Cadre o la vigencia de una traducción verificada. -->

## Traducción verificada por Cadre — v4.1356

Pedido del comité (XII Feria): identificar, certificar, ver y hacer
seguimiento a los proyectos cuya versión inglesa revisó un Cadre, SIN un
módulo nuevo: integrado a «Proyectos postulados» y a la pestaña «Traducción»
del expediente (v4.1324, ver `expediente-integral-del-proyecto.md`).

### Diagnóstico (lo que había)

- Traducción por campo (`ProjectDossierTranslationField`: `sourceHash`,
  `origin` ai/manual, `reviewed`, `reviewedBy`, `warnings`), estado DERIVADO
  (`translationStatus`: not_started, generating, draft, pending_review,
  reviewed, approved, outdated, error), versión aprobada inmutable con huella
  (`approvedFingerprint`) y «Aprobar versión inglesa» (`approveTranslation`,
  perfiles admin y reviewer).
- Faltaba: quién y con qué rol certificó, justificación de avisos, bloqueo de
  autocertificación, conflicto si otro cambió algo entre medio, registro de la
  pérdida de vigencia y aviso, asignación de responsables, columna, filtros,
  indicadores, exportaciones. La insignia «EN · estado» bajo «Ver» se pedía con
  una SEGUNDA llamada por página (`/expedientes/estado`).

### Arquitectura: una sola fuente de verdad

- **⚠️ La verificación ES la aprobación de siempre, reforzada.** No hay un
  segundo proceso. `POST …/traduccion/:lang/verificar` y `…/aprobar` son el
  MISMO manejador (`verifyTranslation = approveTranslation`). Escribe
  `ProjectDossierTranslation.approved*` + una fila inmutable en
  `ProjectDossierTranslationVersion`, ahora con `approvalKind/kind =
  'verification'`, `approvedRole`, `totalCount`, `reviewedCount`,
  `warningsCount`, `justification`, `sourceFingerprint`, `reviewers`, `origins`.
- **El estado de seguimiento se DERIVA** (`trackingOf` en
  `server/lib/translationTracking.js`) del estado del expediente + la cabecera:

  | Estado | Cuándo |
  |---|---|
  | `no_content` Sin textos | el proyecto no tiene narrativa que traducir (fuera de los aplicables) |
  | `untranslated` Sin traducir (gris) | ningún campo traducido |
  | `in_progress` En progreso (azul) | faltan campos o hay desactualizados (sin verificación previa) |
  | `pending_review` Pendiente de revisión (naranja) | todo traducido, ninguno revisado |
  | `in_review` En revisión (azul) | al menos uno revisado; incluye «listo para verificar» y aprobaciones heredadas |
  | `verified` Verificada (verde) | verificación con la huella vigente |
  | `needs_update` Requiere actualización (rojo) | hubo verificación y cambió el ORIGINAL (desactualizados, campos nuevos o invalidación registrada para esa versión) |

  Editar la TRADUCCIÓN tras verificar devuelve a «En revisión», no a
  «Requiere actualización» (no cambió el original). Devolver el original a lo
  que era vuelve a dejarla vigente (la huella coincide).
- **Dos porcentajes independientes** (`pctOf`, 100 sólo si TODO):
  traducción = campos con traducción válida (no faltante ni desactualizada) ÷
  aplicables; revisión = campos revisados vigentes ÷ aplicables. La IA nunca
  cuenta como revisión. Los aplicables son `translatableItems` (vacíos, cifras
  y datos no cuentan).
- **⚠️ No se certifica retroactivamente.** Una aprobación anterior a v4.1356
  (`approvalKind` NULL) queda `legacyApproved`: estado «En revisión», ficha
  inglesa con su texto pero marcada «BORRADOR · PENDIENTE DE VERIFICACIÓN».

### La regla de verificación (`verificationCheck`)

Todo se vuelve a leer DENTRO del candado (`pg_advisory_xact_lock` +
`loadDossier(fresh, client)`): lo que se certifica es lo guardado.

1. Hay textos; ninguna generación en curso.
2. Nada faltante, nada desactualizado, todo revisado por una persona.
3. **Avisos bloqueantes** (`emails`, `urls`: un dato distinto en la ficha
   oficial) → 400. **No bloqueantes** (`numbers`, `length`) → 409
   `needs_justification` hasta una justificación ≥ 15 caracteres, que queda en
   la versión y en la bitácora.
4. `expectedFingerprint` (la huella que la persona tenía en pantalla) distinta
   → 409 `changed`.
5. **Autocertificación**: el correo de quien verifica igual al del responsable
   del proyecto → 403. (Tampoco se le puede ASIGNAR su propio proyecto.)
6. Idempotente: verificar otra vez lo mismo ya vigente no crea otra versión
   (dos clics simultáneos → una versión; lo fija la prueba).

En el cliente, «Verificar traducción» sólo se habilita con
`verification.canVerify` (calculado en el servidor) y sin cambios sin guardar;
abre la ventana con proyecto, traducidos, revisados, avisos, responsable y
versión.

### Vigencia automática

- `invalidationOf(status, header)`: si hay verificación, no está vigente y hay
  campos desactualizados o nuevos → se REGISTRA una vez por versión con UPDATE
  condicional (`"invalidatedVersionId" IS DISTINCT FROM "approvedVersionId"`),
  con los campos afectados, una fila `invalidated` en la bitácora, un
  `ProjectFairEvent` y aviso por correo al Cadre asignado (si
  `notifyOnInvalidation`).
- Corre en tres lugares: `checkTranslationValidity` tras guardar/enviar un
  formulario del club (`projectFormsController`), tras editar el expediente
  (`updateDossier`) y la postulación (`updateSubmission`); y como BARRIDA en
  cada lectura del listado/indicadores (`loadTranslationTracking`). Un camino
  de escritura olvidado igual queda registrado al mirar.
- Cambios no traducibles (pago, valor, estado, referencias) no tocan la huella:
  no invalidan (probado).

### Roles y permisos (todo en el servidor)

| Capacidad | admin | reviewer | **cadre** (nuevo) | translator | finance |
|---|---|---|---|---|---|
| Ver estado, insignias, indicadores (`view`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Editar traducción, revisar campos (`translate`) | ✓ | ✓ | ✓ | ✓ | |
| **Verificar** (`approveTranslation`) | ✓ | ✓ | ✓ | | |
| Asignar/reasignar, revocar, recordatorios (`manageTranslation`) | ✓ | | | | |
| Fecha límite y avisos (`config`) | ✓ | | | | |
| Exportar (`export`) | ✓ | ✓ | ✓ | ✓ | ✓ |

- `cadres` es una lista por correo en Convocatoria → «Perfiles del módulo»
  (va antes que «Traductores» en `resolveAccess`). El responsable del proyecto
  (cuenta del club) no tiene perfil del módulo y además está bloqueado por
  correo.
- La insignia muestra el ROL de quien verificó: si verificó un administrador o
  revisor, dice «Administrador»/«Revisor», no «Cadre».
- Revocar exige motivo (≥ 10): limpia `approved*` (deja `revoked*`), conserva
  versiones y revisiones campo a campo.

### Asignación de Cadres

En la cabecera de traducción (`assigneeEmail/Name`, `assignedAt/By`). Sólo a
correos de cadres, reviewers o translators de la convocatoria (`assignableOf`,
nombre desde `User`). Asignar NO da permisos. Bitácora `assigned`/
`reassigned`/`unassigned` con el anterior; un correo por persona con todos sus
proyectos (`notifyOnAssignment`). «Carga de trabajo por Cadre» en el bloque
(`workloadByCadre`); filtro `trCadre` = correo, `me` (resuelto en el servidor
con la sesión) o `none`.

### Listado, filtros, indicadores y exportaciones

- Cada fila del listado trae `translation` (compacto de `trackingOf`),
  calculado por lotes (`loadTranslationCompact`: una consulta por fuente). Ya
  no hay llamada aparte por página.
- Filtros del servidor: `tr` (vistas de `TRANSLATION_VIEWS`), `trCadre`,
  `trDesde/trHasta` (día de Colombia de la verificación vigente); orden
  `trState|trTranslated|trReviewed|trVerifiedAt`. Con cualquiera de ellos el
  listado entra al camino «calcular para todo y filtrar en el servidor» (como
  el documental y Exchange) y se combina con todo.
  ⚠️ Ese camino no recalculaba el seguimiento documental de la página cuando
  sólo había filtro de Exchange: las columnas documentales quedaban en «—».
  Corregido (también para Exchange).
- `GET /admin/traducciones` — indicadores sobre los filtros activos SIN la
  vista de traducción (cada tarjeta es un filtro), también los documentales.
- CSV (`TRANSLATION_CSV_HEADERS`), Excel (`translationExcelColumns`) e
  informe PDF (columna «EN») con las mismas cifras.
- Fichas PDF: la inglesa sólo sale sin marca desde una versión VERIFICADA
  (`translation.verified`); la heredada sale marcada; si el original cambió,
  usa la última verificada y lo advierte.

### Rutas

`GET /admin/traducciones` · `GET/PUT /admin/traducciones/config` ·
`POST /admin/traducciones/asignar` · `GET/POST /admin/traducciones/recordatorios` ·
`POST /admin/postulaciones/:id/traduccion/:lang/verificar|aprobar|revocar`.
Literales antes de `/:id`. Recordatorios: sin `confirm` sólo vista previa;
uno por Cadre; dedupe por correo + proyectos + día (índice único parcial de
`dedupeKey`).

### Datos (no destructivo)

- Columnas nuevas (ALTER … ADD COLUMN IF NOT EXISTS, en `OWNED_COLUMNS`) en
  `ProjectDossierTranslation` y `ProjectDossierTranslationVersion`.
- Tabla nueva `ProjectDossierTranslationEvent` (bitácora: verificado,
  invalidado, revocado, asignaciones, avisos y recordatorios; estado anterior y
  nuevo, versión, huellas del original y de la traducción, campos, nota,
  motivo, quién y su rol). En la lista protegida de CLAUDE.md.
- `ensureProjectDossierSchema` ahora tiene promesa compartida + reintento (el
  listado, la franja y el expediente piden a la vez).

### Archivos

| Archivo | Qué |
|---|---|
| `server/lib/translationTracking.js` | El CRITERIO, puro |
| `server/lib/translationTrackingStore.js` | Lectura por lotes, barrida de vigencia, aviso, bitácora |
| `server/controllers/projectDossierController.js` | Verificar, revocar, indicadores, asignar, configuración, recordatorios |
| `server/controllers/projectFairAdminController.js` | Perfil `cadre`, `manageTranslation`, columna/filtros/orden/CSV |
| `src/lib/translationTracking.ts` | Tipos, colores, Excel |
| `src/components/admin/feria/traduccion/*` | Insignia, celda, bloque, diálogos |
| `src/components/admin/feria/expediente/ExpedienteTraduccion.tsx` | «Verificar traducción», ventana, revocar, historial |

### Pruebas

- `npm run test:fair:translation-verification` (en `prebuild`): criterio e
  invariantes; con `TRANSLATION_TEST_DATABASE_URL=<postgres local>` corre los
  manejadores reales (permisos, autocertificación, huella, concurrencia,
  justificación, vigencia una sola vez con aviso, cambios no traducibles,
  edición del comité, revocación, heredadas, filtros combinados, indicadores,
  asignación, recordatorios sin duplicados, CSV, fichas, pagos intactos). 134.
- `FAIR_E2E_DATABASE_URL=… npm run test:fair:translation-verification:ui`
  (navegador, necesita `dist/assets`): columna, bloque, abrir desde la celda,
  traducir, revisar, cambio sin guardar, ventana, insignia con cursor y
  teclado, filtro por tarjeta, cambio del club, Cadre vs. traductora, 390 px. 42.

### Verificar en un paso y desde el listado — v4.1357

Reporte del comité: *«no aparece el botón para marcar como traducidos los
proyectos que ya tradujeron los Cadres»*. El botón existía en la pestaña, pero
APAGADO hasta marcar uno por uno los 20 campos como revisados, y el listado no
ofrecía ninguna acción.

- **`markAllReviewed: true`** en `POST …/verificar`: quien verifica declara que
  la traducción fue revisada; el servidor decide con `asIfReviewed(status)`
  (los `draft` cuentan como revisados; faltantes y desactualizados NO) y, si
  pasa, marca esos campos a su nombre (`reviewedBy`, una fila
  `translation_review` por campo con «Marcado como revisado al verificar»)
  DENTRO de la misma transacción de la verificación. Si algo falla (p. ej.
  autocertificación), ROLLBACK: no queda ninguno marcado.
- `GET …/traduccion/en` devuelve `canVerifyMarkingReviewed` y `pendingReview`;
  el botón de la pestaña se habilita con eso y la ventana exige marcar «Confirmo
  que la traducción fue revisada… los N campos quedan marcados a mi nombre».
- **Listado**: «Verificar traducción» en la celda de la columna (y en la tarjeta
  móvil) cuando `canOfferVerify(t)` —todo traducido, nada desactualizado, no
  verificada—; «Verificar seleccionados» en el bloque, con la selección.
  `VerifyTranslationsDialog` lee el estado real de cada proyecto, muestra qué se
  certifica y cuáles no se pueden verificar y por qué, y llama al endpoint de a
  uno (cada llamada lejos de los 120 s), con el resultado por proyecto.
- Pruebas: 6 comprobaciones nuevas con Postgres (paso único, transacción,
  bitácora, permisos) y 7 en navegador (botón en la columna, confirmación
  obligatoria, insignia al terminar).

### Pendientes / recomendaciones

- Fecha límite: se muestra y se manda en los recordatorios; no hay
  recordatorios automáticos programados (igual que el documental: exige
  autorización explícita).
- La insignia NO va al sitio público (no se pidió configuración para eso).
- El perfil `cadre` ve datos personales del expediente como `translator`
  (`viewPersonalData: true`). Si los Cadres son externos, evaluar recortarlo.
