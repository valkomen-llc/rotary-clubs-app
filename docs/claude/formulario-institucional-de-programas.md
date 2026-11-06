# Formulario institucional de programas — v4.1286 (diez pasos: v4.1287)

Formulario público para que los líderes de los programas que respalda un
distrito (piloto: Distrito 4281 — Clínicas Ponseti, Fundación Pequeño Corazón
y cualquier programa registrado) entreguen textos, documentos y materiales
para sus páginas. Es parte del módulo **Programas** (`docs/claude/programas.md`):
no duplica información, alimenta la ficha, las colecciones y la Biblioteca
que ya existían.

## Dónde está

| Qué | Dónde |
|---|---|
| Formulario público | `dominio.org/formulario-programas` (`?programa=<slug>` preselecciona; `?continuar=<secreto>` reabre un borrador y se borra de la barra) |
| Administración | `/admin/programas/:id?tab=formulario` → «Formulario institucional»: Envíos · Configuración del formulario · Banco multimedia · Correspondencia (`&ref=FP-…` abre un envío) |
| Criterio puro (esquema, adaptación, forma, validación, ítems, plan de aplicación, archivos, secreto) | `server/lib/programIntakeSpec.js` |
| Almacén (envíos, decisiones por ítem, aplicar) | `server/lib/programIntakeStore.js` |
| S3 (PUT prefirmado, multiparte reanudable, inspección por bytes, versión web) | `server/lib/programIntakeFiles.js` |
| Controlador | `server/controllers/programIntakeController.js` (rutas en `server/routes/programs.js`) |
| Cliente | `src/lib/programIntakeClient.ts`, `src/components/programas/intake/ProgramIntakeForm.tsx`, `IntakeFields.tsx`, `src/pages/FormularioProgramas.tsx` |
| Piezas visuales COMPARTIDAS con Visitas del Gobernador | `src/components/common/InstitutionalFormKit.tsx` (Marco, Campo, TituloPaso, Resumen, BarraDePasos, clases) |
| Pestaña administrativa | `src/components/admin/programas/ProgramaFormularioTab.tsx` |
| Perfil en la página de detalle | `src/components/programas/ProgramaPerfil.tsx` (en `ProgramaDetalle.tsx`) |
| Pruebas | `npm run test:programas:formulario` (81, sin base) · `PROGRAMAS_E2E_DATABASE_URL=… npm run test:programas:formulario:e2e` (33, Postgres + S3 simulado) |

## Diez pasos (v4.1287)

El formulario tenía 16 pasos (programa, remitente, una por sección y el
resumen). Pasó a **exactamente diez** (`INTAKE_STEPS` en el criterio; el
navegador los recibe en `form.steps`). La unidad de guardado, validación,
revisión y aplicación SIGUE siendo la sección, con sus claves de siempre: un
paso sólo agrupa secciones, y cada sección organiza sus campos en **bloques
desplegables** (`blocks`: subtítulo, ayuda, abierto por omisión sólo lo
esencial; se abre solo si trae datos o un aviso). Un bloque nunca es un paso.

| Antes (16) | Ahora (10) |
|---|---|
| 1 Programa y envío · 2 Quién envía | **1 Programa y datos del responsable** |
| 3 Identidad y presentación | **2 Identidad e historia** (sin el sitio web; «Propósito» y «Sobre nosotros» ya no se piden) |
| 4 Identidad visual, aliados | **3 Imagen institucional, aliados y patrocinadores** (+ imagen principal) |
| 5 Responsables y equipo · 15 Redes y contacto | **4 Equipo, contacto y canales oficiales** (+ sitio web) |
| 6 Atención · 7 Directorio | **5 Atención, cobertura y directorio** |
| 8 Participación · 9 Documentos | **6 Participación, donaciones y documentación** (documentos: bloque complementario desplegable) |
| 10 Banco multimedia · 14 Recursos (guías, FAQ, video, podcast, publicaciones) | **7 Banco multimedia y recursos** |
| 11 Historias · 12 Testimonios | **8 Historias de vida y testimonios** |
| 13 Impacto · 14 Recursos (noticias, jornadas, eventos) | **9 Impacto y actualidad** («Indicadores» y «Noticias y actividades») |
| 16 Resumen | **10 Resumen y envío** |

- **Navegación** (`PasosNumerados` en el kit; Visitas sigue con `BarraDePasos`):
  escritorio, los diez en una rejilla sin desplazamiento; móvil, «Paso 3 de
  10» + «Ver pasos». En una actualización se eligen PASOS (cada uno marca sus
  secciones); los no incluidos se saltan con Siguiente/Anterior y se pueden
  incluir desde el propio paso. Un paso sin secciones aplicables (configuración
  del programa) dice «no aplica».
- **Validación de una actualización por paso**: sólo avisa un paso elegido sin
  ningún dato en ninguna de sus secciones; lo obligatorio configurado se exige
  a la sección que trae datos.
- **Resumen**: una tarjeta por paso con estado, archivos, «Pendiente de
  suministrar», avisos (`POST /public/intake/draft/check`, sin enviar nada) y
  ajustes pedidos; «Editar» lleva al paso con «Volver al resumen». Declaraciones
  finales sin reemplazar las autorizaciones de cada contenido. «Guardar
  borrador» en todos los pasos.
- **Sin pedir dos veces**: sitio web sólo en el paso 4; un archivo ya cargado
  se reutiliza por referencia («Usar un archivo ya cargado en este envío»); la
  imagen principal y el logo aplicados aparecen en el banco multimedia.
- **Borradores anteriores** (`migrateIntakeData`, al leer un envío editable,
  idempotente, guardado una vez): `identidad.website` → `contacto.website` (si
  allí no había); noticias/jornadas/eventos de `recursos.resources` →
  `impacto.news` con el mismo `_id`, y su decisión de revisión viaja con la
  clave nueva. Un envío ya en revisión NO se migra. «Propósito» y «Sobre
  nosotros» con valor se siguen mostrando (`legacy`) y aplicando. El paso en
  que se dejó se recuerda por CLAVE (`LocalDraft.step`); un borrador sin paso
  abre en el 2 y uno con ajustes en el resumen.

## Decisiones (no deshacer sin razón)

- **UN formulario para todos.** Secciones y campos son datos
  (`INTAKE_SECTIONS`). El servidor resuelve el formulario POR programa
  (`resolveIntakeForm`): vocabulario de salud o general (por la categoría o
  forzado), campos `health` sólo en salud, etiquetas `lg` (beneficiarios,
  participantes, servicios), y la configuración del administrador
  (`Program.intakeConfig`: secciones aplicables, obligatorios, ocultos,
  ayudas, texto de bienvenida, apagar el formulario). El navegador NO lleva
  espejo del esquema: lo recibe ya resuelto.
- **Lo que llega es una PROPUESTA.** `ProgramIntake` nunca toca el programa.
  La única puerta es «Aplicar lo aprobado» (`applyItems`), que crea
  `ProgramChangeRequest` del flujo editorial de siempre con el envío como
  origen (`intakeId`, `intakeItemKey`, evento en el historial, auditoría). Las
  solicitudes nacen «Enviadas» (o «Borrador» en Gestión de contenidos si les
  falta algo para enviarse, con el motivo); la revisión médica, la aprobación
  y la publicación siguen sus permisos. Nada se publica desde el formulario.
- **Revisión por ítem.** `intakeItems`: un ítem por los campos sueltos de
  cada sección y uno por registro de cada lista, con clave estable
  (`seccion:lista:_id`). Decisiones: aprobado (sedes, indicadores y
  donaciones exigen «Verifiqué la fuente»), ajustes o descartado (con motivo).
  Se aprueba parcialmente. El panel muestra lo VIGENTE al lado de lo
  propuesto (`currentValuesFor`; para un registro con `_ref`, su `data`).
- **Ajustes y reenvío.** «Solicitar ajustes» genera un secreto NUEVO para
  quien envió (correo si hay proveedor; el panel ofrece copiar, WhatsApp o
  correo). Al reenviar, lo marcado con ajustes vuelve a «Sin revisar» y lo
  aprobado que CAMBIÓ después de aprobarse pierde la aprobación (hash del
  ítem en la decisión). Lo aplicado no se toca.
- **Un campo omitido no es una orden de borrado.** Sólo viaja lo que tiene
  valor (`shapeIntakeSection`). Al publicar una «Información institucional»,
  `mergeInfoPayload` fusiona: listas por id (`partnersUpsert` por nombre,
  `milestonesUpsert`, `servicesUpsert`, `stepsUpsert`, `faqsUpsert`), personas
  y perfil campo a campo, redes como parche. **La dirección (slug) nunca
  cambia por esta vía**, aunque cambie el nombre (lo cambia la ficha, a
  propósito).
- **Actualizar sin duplicar.** Las listas con `refKind` (sedes, equipo,
  historias, testimonios, indicadores, donaciones) permiten «Actualizar uno
  existente» o «Solicitar su retiro» eligiendo el registro publicado
  (`existingRecords`, sólo título); la solicitud lleva `operation` y
  `contentId`.
- **Datos del remitente: PRIVADOS.** `ProgramIntake.sender` nunca va a
  páginas, métricas ni auditoría (la auditoría guarda la referencia). Lo que
  autoriza mostrar (crédito público) está separado. Elegir un programa o un
  club NO crea `ProgramMember`: los nombres de responsables son informativos
  y los permisos se dan en «Responsables y distritos».
- **Acceso sin cuenta, seguro.** Como Visitas del Gobernador, sin cuenta. El
  borrador se abre con un secreto de 32 bytes (`X-Intake-Token`, nunca en
  una URL de la API); se guarda sólo su hash (hasta 5 vigentes). Recuperar en
  otro dispositivo: el correo recibe un enlace nuevo; la respuesta es la
  misma exista o no. La referencia pública `FP-AAAA-XXXXXX` NO abre nada.
  Con sesión, el envío se liga a la cuenta («Mis envíos») y se precargan los
  datos pidiendo confirmar su vigencia.
- **Consentimientos separados:** tratamiento de datos (obligatorio), derechos
  de uso (obligatorio sólo si se adjuntan materiales) y novedades (opcional;
  crea `ProgramSubscriber` sólo si se marca). Adjuntar no equivale a
  autorizar la publicación: cada pieza declara su permiso.

## Archivos

- Prefijo privado `private/programs/{programId}/intake/{intakeId}/` (separa
  programas y envíos; `intakeKeyBelongs`). Una sección sólo puede citar
  archivos de SU envío.
- ≤ 64 MB: PUT prefirmado. Más: **multiparte** por partes de 16 MB, 3 en
  paralelo, 4 intentos con espera creciente; si se corta o se recarga,
  volver a elegir el MISMO archivo (nombre + peso) reanuda con las partes
  que S3 ya tiene (`ListParts`). Las ETag de cierre se leen de S3.
- Validación en servidor por el objeto REAL: peso (HeadObject) y tipo por los
  primeros 512 bytes (`sniffIntakeFile`: JPEG, PNG, WebP, HEIC, TIFF, MP4/MOV,
  WebM, MP3/M4A/WAV/OGG, PDF, Office, SVG, AI/EPS, PSD, ZIP). Lo que no
  coincide se borra.
- **Topes configurables** (`PROGRAM_INTAKE_IMAGE_MB` 80, `_VIDEO_MB` 4096,
  `_AUDIO_MB` 500, `_DOCUMENT_MB` 100, `_DESIGN_MB` 1024, `_MAX_FILES` 400),
  explicados antes de cargar, con el enlace externo como alternativa. No hay
  almacenamiento ilimitado: la regla de ciclo de vida del bucket debe limpiar
  los huérfanos y las cargas multiparte abandonadas del prefijo (configurar en
  AWS: `AbortIncompleteMultipartUpload`).
- Al aplicar: el ORIGINAL queda como `ProgramFile` privado (misma clave, sin
  copia; `meta` con título, tipo, emisor, fechas y acceso). Sólo lo AUTORIZADO
  (logo y variantes del programa, foto de integrante autorizado, imagen/video
  de historia con su autorización, logo de aliado autorizado, pieza del banco
  «Autorizado para publicación», archivo de un recurso) se publica en la
  Biblioteca del sitio dueño, carpeta «Programa · Nombre»: una foto como WebP
  ≤ 2400 px con la orientación aplicada y SIN EXIF/GPS; video, audio o
  documento por copia de objeto (sus metadatos no se limpian: no hay
  transcodificador). Reutilizar el mismo archivo en otro ítem devuelve la
  MISMA URL. Un documento propuesto como público queda privado hasta que una
  persona autorizada decida.
- Descargas: enlace firmado de 2 minutos, auditado, sólo para quien revisa;
  quien envía ve sus propios archivos con su secreto.

## Correspondencia (sección → destino → contenedor)

| Sección | Destino | Página |
|---|---|---|
| Quién envía | `ProgramIntake.sender` (interno) | — |
| Identidad y presentación | `Program` (nombre, resumen, descripción, categoría, sitio web) + `Program.profile` | Portada · Presentación · detalle «El programa» |
| Identidad visual, aliados | `logoUrl`, `profile.brand` (originales privados), `partners` con `relationType`, vigencia y autorización | Portada · Aliados |
| Responsables y equipo | `governance.*` (interno) · colección `team` | Equipo |
| Atención, cobertura y acceso | `care.*` (+ servicios, pasos, preguntas, horarios) — clínico con revisión médica | Información para familias · Contacto |
| Sedes | colección `clinic` (contacto interno aparte) | Directorio |
| Participación y sostenibilidad | `participation.*` · colección `donation` (enlace externo; sin pasarela) | Clubes · Donaciones |
| Documentos | `ProgramFile` privado + `profile.operatingEntity` | — |
| Banco multimedia | Biblioteca (versión web) + original privado; uso sugerido | Cualquier contenedor, por referencia |
| Historias | colección `story` (`format: historia`) | Historias |
| Testimonios | colección `story` (`format: testimonio`, `linkedStoryId`) | Historias |
| Impacto | colección `indicator` | Impacto |
| Recursos y actualidad | `resource` (guías, FAQ, video, podcast, publicación, enlace) · `news` (noticia, jornada, evento) | Recursos |
| Redes y contacto público | `social` (+ Spotify), `governance.institutional*` con su bandera pública, `profile.publicContact` | Contacto · pie |

**La diagramación no cambia sola.** Los contenedores con fuente (directorio,
historias, impacto, recursos, donaciones) se llenan con lo PUBLICADO; textos e
imágenes de los demás se eligen en «Página pública» (el banco multimedia da la
URL y el enfoque sugerido).

## Historias y testimonios

- Identidad pública: nombre completo, solo nombre, seudónimo o anónima. El
  nombre real, la referencia interna y el representante van en
  `data.internal` y NUNCA salen (`publicContentView`). Validación: con
  anónima/seudónimo/solo nombre, el título, el relato y los pies de foto no
  pueden mencionar el nombre real (o los apellidos).
- Autorizaciones separadas: relato (`usagePermission`), nombre, imagen (las
  fotos se publican con `permissionGranted` = autorización de imagen), video;
  menor de edad → `guardianAuthorized` obligatorio para publicar (también en
  Gestión de contenidos). Soportes privados con verificador y fecha.
- **Canales** (`channels`): `visibleOnSite` — «programa» = sitio dueño;
  «distrito» = además los sitios distritales vinculados; «clubes» = además los
  clubes que activaron el programa. Sin `channels`, `usagePermissionScope`.
- Proceso asistencial (`careProcess`) → revisión médica obligatoria
  (`EDITORIAL_REQUIREMENTS.story = si_clinico`). No se piden expedientes.
- Retiro: «Solicitar su retiro» crea una solicitud `retirar`; publicada,
  archiva el registro (sale de todas las superficies de la plataforma).
- Testimonio: nombre visible según `display` (nombre y apellido, solo nombre,
  iniciales, anónimo = su relación); nunca el apellido si no se eligió.

## Otras reglas que se agregaron a Programas

- `care.costsText` NUEVO no hereda la aprobación del anterior: al publicarlo
  por el flujo queda aprobado por quien publica la solicitud aprobada.
- Donación con `taxClaimPending` no se publica sin texto aclaratorio aprobado.
- Una pregunta frecuente clínica sólo se muestra con la aprobación médica de
  la ficha.
- `PUT /admin/:id` sin `profile` conserva el perfil vigente.

## Cómo se probó (v4.1286)

- `npm run test:programas:formulario`: 81 comprobaciones puras (99 con los diez pasos, v4.1287).
- `test:programas:formulario:e2e`: 33 (36 desde v4.1287: migración de un borrador
  anterior con archivo, envío ya en revisión sin migrar, actualización por pasos) con Postgres 16 local (con SSL) y S3
  simulado con multiparte y copia: guardado/recuperación, parcial, carga
  directa, multiparte cortada y reanudada, PDF disfrazado, tope configurable,
  separación entre envíos y programas, consentimientos, revisión por ítem,
  aplicar sin publicar, publicar sin cambiar el slug, auditoría sin datos del
  remitente, ajustes y reenvío, versión web sin EXIF con el original privado,
  actualización de una sede sin duplicar, historia fuera de los sitios de
  clubes, permisos del club y de otro distrito, descarga firmada.
- `test:programas` (157) y `test:programas:e2e` (51) siguen en verde.
- Chromium contra el build: flujo completo en 1280 px (crear borrador,
  guardar, cargar foto y enfoque, recargar y continuar, consentimientos,
  enviar) y en 390 px (iPhone 13, sin desplazamiento horizontal, vocabulario
  general); pestaña administrativa (bandeja, comparación, configuración).

## Pendiente / configuración

- Correo: sin `RESEND_API_KEY`/SMTP el enlace no llega por correo (el
  formulario lo muestra para copiar y el panel lo ofrece al pedir ajustes).
- S3: regla de ciclo de vida para `private/programs/*/intake/` (huérfanos y
  multiparte incompleta) y CORS del bucket para `PUT` desde los dominios de
  los sitios (exponer `ETag`).
- Video/audio publicados conservan sus metadatos (no hay transcodificador).
- Llevar un texto aprobado del perfil a un contenedor de la landing es una
  edición manual en «Página pública» (a propósito).
