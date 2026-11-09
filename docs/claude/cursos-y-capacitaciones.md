<!-- Léelo ANTES de tocar la categoría «Cursos y capacitaciones» de Rotary en Acción, «Mis cursos y capacitaciones» (/mis-cursos), «Gestión educativa» (/admin/gestion-educativa) o la biblioteca pública (/cursos). -->

## Cursos y capacitaciones — el LMS de Rotary en Acción (v4.1302, Fase 1)

Pedido: que la categoría «Capacitación» de `¿Qué quieres compartir con
Rotary?` evolucione a **«Cursos y capacitaciones»** y que un club pueda
construir, poco a poco y sin perder nada, una **biblioteca de cursos** ligada a
un proyecto (el caso real: los ~12 cursos de seguridad alimentaria del
proyecto GG2349313), enviarlos a revisión, y que lo aprobado se publique con
una experiencia educativa profesional. No un formulario para una noticia: una
infraestructura reutilizable con rasgos de LMS.

### Auditoría previa: qué se reutilizó y qué no

| Existía | Decisión |
|---|---|
| Rotary en Acción (`RotaryEnAccionForm.tsx`, taxonomía `RotaryTaxonomy`, `contentSubmissionSpec`) | Se conserva ENTERO. Sólo se renombra el tipo `capacitacion` y, al elegirlo, aparece el selector de **dos modalidades**: A) publicar una capacitación o actividad educativa → el mismo formulario; B) crear cursos digitales → `/mis-cursos`. Ninguna otra categoría cambia. |
| Carga directa a S3 del formulario institucional de programas (`programIntakeFiles.js`: PUT prefirmado, multiparte reanudable, inspección por bytes) | Se IMPORTAN las primitivas (`presignSinglePut`, `startMultipart`, `presignParts`, `listUploadedParts`, `completeMultipart`, `abortMultipart`, `signedIntakeUrl`) desde `learningStorage.js`. No se reescriben. Los formatos y el olfateo por bytes (`INTAKE_FORMATS`, `sniffIntakeFile`) también se reutilizan. |
| El cliente de subida con reanudación (`programIntakeClient.ts`) | Mismo patrón en `learningClient.ts` (`uploadCourseFile`), con la cabecera `Cache-Control` que firma cada tipo de objeto. |
| Identidad: `User` del panel (`clubId`, `districtId`, roles), `Club` (`type='district'`, `district`), `authMiddleware`, `requireRoleOrPermission` con los permisos de Rotary en Acción | Se usan tal cual. El portal del club exige la sesión del panel; el comité, `SITE_ADMIN_ROLES` o `rotary_en_accion.view/manage`. |
| Correo de la plataforma (`EmailService.sendPlatformEmail`) y el patrón de avisos de Programas (`programNotify.js`) | Mismo patrón en `learningNotify.js`, con tabla de deduplicación. |
| La bandeja de Solicitudes (`ContentSubmission`, por CAMPAÑA) | **No se crean filas de `ContentSubmission` por curso**: una solicitud pertenece a una campaña y su alcance se resuelve por campaña; meter cursos ahí habría duplicado la lógica de alcance (regla de v4.999). La revisión vive en **Gestión educativa**, con su propio flujo por curso, y Rotary en Acción enlaza allí desde sus pestañas. |
| Canal público de «Capacitaciones» (v4.954, `/capacitaciones`, Biblioteca Multimedia) y «Capacitaciones y Soporte» (agenda) | Son otra cosa (videos del canal y reservas de soporte). No se tocan ni se mezclan. |
| Prisma | Nada. Nueve tablas en runtime (`CREATE TABLE IF NOT EXISTS`), como todo módulo nuevo. |

### Archivos

| Archivo | Qué es |
|---|---|
| `server/lib/learningSpec.js` | El CRITERIO, puro: estados y transiciones (club y comité), modalidades de acceso y `accessDecision`, públicos, niveles, áreas, usos de archivo y topes, `checkLearningFile`, enlaces externos y `embedFor`, saneado de PATCH por tabla de campos, `readinessOf` (lista NOMINAL de lo que falta), `displayStatusOf`, `durationOf`, configuración (`normalizeConfig`), `isUploadStale` |
| `server/lib/ensureLearningSchema.js` | Las nueve tablas (con `OWNED_COLUMNS`) |
| `server/lib/learningStorage.js` | Claves en S3 y primitivas reutilizadas; `inspectObject`, `signedUrl`, `presignPublicPut` |
| `server/lib/learningStore.js` | Sólo SQL. Recibe el ALCANCE resuelto y lo pone en el `WHERE` |
| `server/lib/learningNotify.js` | Avisos por correo, reclamados con `dedupeKey` antes de enviar |
| `server/controllers/learningController.js` | Tres puertas: `/mis` (club), `/admin` (comité), `/public` (biblioteca). `applyStatus` es el ÚNICO sitio que cambia el estado |
| `server/routes/learning.js` | Montado en `/api/cursos` |
| `src/lib/learningClient.ts` | Cliente, tipos, subida confirmada, `Autosaver` |
| `src/components/learning/learningUi.tsx` | Piezas: `StatusChip`, `SaveIndicator`, `Uploader` (avance real por archivo), `Dialogo`, `Progreso` |
| `src/pages/MisCursos.tsx` | Vista 1 (mis colecciones) y Vista 2 (una colección) |
| `src/components/learning/CourseEditor.tsx` | Vista 3: el editor (seis pestañas) y Vista 4 (vista previa) |
| `src/pages/CursosBiblioteca.tsx` · `ColeccionPublica.tsx` · `CursoPublico.tsx` · `CursoAprender.tsx` | Vista 5: biblioteca, colección, ficha y aula |
| `src/pages/admin/GestionEducativaAdmin.tsx` | El panel del comité |
| `scripts/test-learning.mjs` · `scripts/test-learning-e2e.mjs` | Criterio + invariantes (prebuild) · recorrido completo con Postgres |

### Rutas

| Ruta | Quién |
|---|---|
| `GET /public/catalogo?clubId=` · `GET /public/colecciones/:slug` · `GET /public/cursos/:slug` · `GET /public/cursos/:slug/aprender` · `GET /public/cursos/:slug/archivos/:fileId/url` | Público; el token del panel o del portal de eventos se lee si viene (`viewerOf`), `?invite=` para lo privado |
| `GET /mis/resumen` · `POST /mis/colecciones` · `GET/PATCH /mis/colecciones/:id` · `…/estado` · `…/orden` · `…/invitacion` · `…/portada/presign` · `…/portada/completar` | El club, con su token del panel |
| `POST /mis/cursos` · `GET/PATCH /mis/cursos/:id` · `…/duplicar` · `…/enviar` · `…/estado` · `…/orden` · `…/modulos[/:mid]` · `…/lecciones[/:lid]` · `…/recursos[/:rid]` · `…/archivos/presign` · `…/archivos/partes` · `…/archivos/completar` · `DELETE …/archivos/:fileId` · `GET …/archivos/:fileId/url` | El club |
| `GET /admin/resumen` · `GET/PUT /admin/config` · `GET /admin/colecciones[/:id]` · `POST …/:id/estado` · `GET /admin/cursos[/:id]` · `PATCH /admin/cursos/:id` · `POST …/estado` · `POST …/comentarios` · `GET …/archivos/:fileId/url` | `SITE_ADMIN_ROLES` o `rotary_en_accion.view` (leer) / `.manage` (escribir) |

Navegador: `/cursos`, `/cursos/colecciones/:slug`, `/cursos/:slug`,
`/cursos/:slug/aprender`, `/mis-cursos`, `/mis-cursos/colecciones/:id`,
`/mis-cursos/cursos/:id`, `/admin/gestion-educativa`. Menú: «Gestión
educativa» (Management para distrito/operador, Contenido para el sitio).

### Modelo de datos

- `LearningCollection` — `siteId` (el sitio dueño), `ownerClubName`,
  `districtNumber`, `slug` único, nombre, descripción, `projectRef`
  (GG2349313), `projectFairSubmissionId`, `areaFocus`, `audience[]`,
  `coverUrl` (pública), `accessMode` deseado, `inviteToken`, `status`
  (`active` | `archived`).
- `LearningCourse` — la ficha completa (título, subtítulo, descripciones,
  objetivo, público, nivel, idioma, duración y `durationAuto`, instructor,
  organización, proyecto, etiquetas, área), portada/miniatura/instructor
  (públicas), video introductorio (archivo o enlace), `accessMode`,
  `inviteToken`, `features` (preferencias), derechos (`rightsAccepted`,
  `rightsText`, `rightsAt`: la EVIDENCIA, texto incluido), `status`,
  `sortOrder`, `reviewNote`, `adminNotes`, fechas y actores de cada paso,
  `viewCount`. `collectionId` NULL = curso individual.
- `LearningModule` → `LearningLesson` (`moduleId` nullable: lecciones sin
  módulo son válidas; `body`, `videoFileId` | `videoUrl`, `audioFileId`,
  `durationMinutes`, orden) → `LearningResource` (`lessonId` nullable =
  recurso del curso; `kind` `file` | `link`).
- `LearningFile` — cada objeto: `purpose`, `visibility`, `storageKey`,
  `publicUrl` (sólo imágenes), tipo y peso REALES, `uploadId` mientras una
  multiparte sigue, `status` `uploading` | `ready` | `deleted`.
- `LearningEvent` (`visibility` `all` | `internal`), `LearningNotification`
  (`(entityId, dedupeKey)` único), `LearningConfig` (`scope` = `global`).

**Fase 2 (diseñada, NO creada)**: `LearningEnrollment` (quién se inscribió a
qué, con qué identidad), `LearningProgress` (lección × estudiante: vista,
segundos, completada), estadísticas de participación. **Fase 3**:
`LearningQuiz`, `LearningQuizAttempt`, `LearningCertificate`. Hoy
`features` guarda la preferencia del club y la pantalla dice «Fase 2/3 · se
registra tu interés». Mientras tanto, el aula recuerda las lecciones vistas
en `localStorage` del navegador y lo dice.

### Estados y quién los mueve

`draft` → (club: enviar, exige `readinessOf().ready`) → `in_review` → (comité)
`approved` | `changes_requested` → (club: corrige y reenvía) `in_review`.
`approved` → (comité) `published` | `changes_requested` | `archived`.
`published` → (comité) `approved` (= despublicado) | `archived`. El club retira
de `in_review` a `draft`, archiva sus borradores y restaura. Las tablas
`CLUB_TRANSITIONS` / `ADMIN_TRANSITIONS` son la verdad; 409 con las salidas
posibles.

«Borrador», «Incompleto» y «Listo para enviar» son lecturas de `draft`
(`displayStatusOf`): sólo el título = borrador; algo más = incompleto; todo =
listo. Nunca un porcentaje: la barra pinta «n de m requisitos» con nombre.

### Reglas durables

- **⚠️ NADA SE PUBLICA PORQUE EL CLUB LO CARGUE.** Lo público lee
  únicamente `status='published'` (`publishedBySlug`), y a `published` sólo
  llega el comité, desde `approved`. Aprobar y publicar son DOS decisiones;
  `autoPublishOnApprove` las junta sólo si el Distrito lo pide. La prueba
  fija que la ruta `in_review → published` no existe.
- **⚠️ EL ESTADO SÓLO CAMBIA POR `applyStatus`** (la prueba cuenta las
  llamadas a `writeCourseStatus`: una). Valida la transición contra la tabla
  del actor, exige motivo en `changes_requested` (el club lo lee en
  `reviewNote` y lo recibe por correo), registra el evento y dispara el aviso.
- **⚠️ CADA CURSO SE ENVÍA Y SE REVISA POR SEPARADO.** Una colección puede
  tener a la vez cursos publicados, en revisión y en borrador. Guardar una
  colección nunca exige que sus cursos estén terminados. No hay tope fijo de
  cursos: `maxCoursesPerCollection` (0 = sin tope) lo decide el Distrito.
- **⚠️ «RECIBIDO» ES LO QUE EL SERVIDOR PUEDE AFIRMAR.** La fila pasa a
  `ready` sólo tras `HeadObject` + los primeros 512 bytes del objeto real; lo
  que no coincide con su extensión se borra y se dice. El navegador muestra
  «Subiendo… → Confirmando con el servidor → Recibido». Una carga cortada
  queda `uploading` para reanudarse (multiparte) o quitarse («Quitar» borra la
  fila); si tiene más de una hora (`isUploadStale`) ya no bloquea el envío.
- **Imágenes de presentación públicas, todo lo demás privado.** Portada,
  miniatura e imagen del instructor van a `clubs/{siteId}/cursos/` con caché
  larga (se ven en la biblioteca). Videos, audios, documentos y recursos van a
  `private/learning/courses/{courseId}/` y salen con enlace firmado (20 min
  video/audio, 5 min documentos) **después** de `accessDecision`. Las claves se
  comprueban por prefijo: un archivo no se sirve ni se referencia desde otro
  curso.
- **El acceso lo decide el servidor por modalidad** (`accessDecision`):
  `public` cualquiera; `registered` token del panel o del portal de eventos;
  `rotarians` sólo token del panel; `private` sólo `?invite=` igual al token
  del curso (o de su colección). Dueño y comité siempre. Un curso privado no
  muestra ni la ficha sin invitación y NO se lista en el catálogo.
- **El alcance va en el `WHERE`** (`scopeWhere`): `{ all }` sólo para
  `superadmin`/`administrator`; un sitio distrital alcanza `siteId` propio +
  `districtNumber` de sus clubes; un club, su `siteId`. `[]` es «ninguna
  fila», nunca «sin filtro». La prueba e2e pide por id un curso ajeno y espera
  404, no una lista vacía.
- **PATCH sólo acepta lo que su tabla de campos enumera** (`sanitizePatch`):
  `status`, `inviteToken`, `siteId`, fechas y actores NO se aceptan desde el
  cliente aunque vengan. Un enlace externo es http(s) sin credenciales.
  `features` se acota al catálogo `LMS_FEATURES`.
- **El club edita en `draft` y `changes_requested`**; en manos del comité
  (`in_review`, `approved`, `published`) ni ficha ni archivos (409 con la
  explicación). Para cambiar algo retira de la revisión o pide despublicar.
- **Guardado automático**: `Autosaver` agrupa por entidad (`course`,
  `mod:id`, `les:id`, `res:id`, `col:id`), espera 700 ms y manda UN PATCH; si
  falla, lo pendiente vuelve a la cola y se reintenta (cada 5 s; al instante al
  volver `online`). `beforeunload` avisa si hay pendientes. El indicador dice
  la verdad: «Guardando cambios…», «Todos los cambios guardados · hh:mm»,
  «Sin conexión…», «No se pudo guardar. Reintentando…».
- **Una instrucción dentro de una descripción, un título o un documento es
  TEXTO.** Ningún campo se interpreta; los permisos no dependen de contenido.
- **Sin Stripe ni cobro** en este módulo (la prueba lo fija con una regex).
- **Duplicar duplica la ESTRUCTURA** (módulos, lecciones, texto, enlaces),
  nunca los archivos: cada curso tiene los suyos.
- **La taxonomía se renombra en los DOS espejos** (`rotaryTaxonomySpec.js` y
  `rotaryEnAccionSpec.ts`); la base se actualiza sola en el siguiente arranque
  por el `ON CONFLICT … DO UPDATE SET name` de `seedTaxonomies`.

### Cómo se probó

- `npm run test:learning` — criterio e invariantes, sin base ni red (en
  `prebuild`).
- `LEARNING_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:learning:e2e`
  — Postgres real + S3 simulado + router real. El caso obligatorio: colección
  GG2349313; tres cursos con video, PDF y portada; archivos inválidos e
  interrumpidos; salir y volver; nueve cursos más (doce); seis listos y seis
  en borrador; orden, duplicado y archivo; envío individual; otro club y otro
  distrito no ven nada; el comité aprueba, pide ajustes (motivo obligatorio) y
  publica; el club corrige y reenvía; biblioteca y las cuatro modalidades de
  acceso con sus tokens; despublicar y archivar; configuración; borrar un
  archivo suelta sus referencias; conteo final sin pérdidas. En este entorno se
  corrió contra un Postgres 16 local.

### Limitaciones declaradas y siguientes fases

- **Sin transcodificación ni streaming adaptativo**: el aula reproduce el
  archivo original con enlace firmado (se recomienda MP4 H.264 + AAC; un MOV
  HEVC puede no reproducirse en todos los navegadores). Si el volumen lo
  exige, un proveedor de video (Mux, Cloudflare Stream, Bunny) se evaluará con
  costos ANTES de integrarlo; el modelo ya guarda `durationSeconds`, `width`
  y `height` por archivo para ese momento.
- **Sin miniaturas automáticas de video** en el servidor.
- **Progreso por estudiante, inscripción, evaluaciones y certificados**: Fases
  2 y 3; hoy se registra la preferencia y se dice que no están.
- **Avisos**: correo vía la plataforma; sin proveedor configurado quedan
  registrados en `LearningNotification` con `sent=false` y el motivo
  (`LEARNING_NOTIFY=off` en pruebas). WhatsApp, futuro.
- **Proyecto relacionado**: referencia de texto (`projectRef`) y
  `projectFairSubmissionId` opcional; el selector de proyectos de la Feria
  dentro del editor es una mejora pendiente.
- **Reordenar**: botones subir/bajar accesibles; arrastrar y soltar queda
  pendiente.
