<!-- Léelo ANTES de tocar el expediente de un proyecto de la Feria, su traducción, sus fichas PDF o sus libretas. -->

## Expediente integral del proyecto — v4.1324

Pedido de la gobernadora Ximena (XII Feria, Valledupar 2027): *abrir cada
proyecto, leer toda la postulación, preparar su traducción al inglés y usarla
para las libretas o guiones de presentación*. En «Proyectos postulados» el botón
**«Ver»** abre el expediente (la misma ficha lateral de siempre, ampliable a
pantalla completa) y un menú **«⋯»** da accesos directos.

### Diagnóstico (lo que había)

- La tabla mostraba ~12 columnas; la ficha «Ver» sólo las columnas de
  `ProjectFairSubmission` y la descripción corta. La Formulación y la Solicitud
  del FDD se veían por separado en la pestaña «Formulación» del módulo, una a la
  vez, sin edición administrativa (sólo la aprobación institucional).
- No había traducción de proyectos: el módulo de traducción del sitio
  (`translationProviders.js`) traduce la interfaz pública, no expedientes.
- La «Ficha en PDF» existente es un resumen de una página sin los formularios.

### Inventario de campos (la fuente es la plantilla, no una lista fija)

| Grupo | Dónde vive | Campos |
|---|---|---|
| Registro inicial | columnas de `ProjectFairSubmission` (`SUBMISSION_GROUPS`) | responsable (nombres, apellidos, correo, WhatsApp, rol, documento, país, departamento, ciudad), club, distrito, nombre y descripción del proyecto, área de enfoque, presupuesto, observaciones |
| Formulación del proyecto | `ProjectFairMasterForm.answers` | 6 secciones / 17 campos (identificación, objetivos, necesidades y beneficiarios, sostenibilidad, presupuesto en matriz, contacto) |
| Solicitud de Aportes del FDD | `ProjectFairProjectForm` (`formKey = fdd_2026_2027`) | 14 secciones / ~50 campos, incluido el desglose (repetidor), los calculados y la aprobación institucional |

`buildDossier` recorre las PLANTILLAS VIGENTES (`resolveForms(cfg)` de la
edición del proyecto): un campo que el comité agregue mañana aparece solo, con
`labelEn = null` (la ficha inglesa usa su rótulo en español).

| Archivo | Qué es |
|---|---|
| `server/lib/projectDossier.js` | El CRITERIO, puro: qué campos hay, qué se edita, qué se traduce, validación por tipo, plan de edición, estado derivado de la traducción, verificación de cifras, glosario de fábrica, rótulos en inglés, libreta |
| `server/lib/ensureProjectDossierSchema.js` | Las 7 tablas propias (con `OWNED_COLUMNS`) |
| `server/controllers/projectDossierController.js` | Los endpoints (todos por `withAccess` + `loadScoped`) |
| `src/lib/projectDossier.ts` | Tipos, rótulos de estado y `dossierRequest` (con `leerJson`) |
| `src/lib/projectDossierPdf.ts` | Fichas ES/EN/bilingüe, ZIP en lote y libreta (jsPDF) |
| `src/components/admin/feria/expediente/*` | Pestañas, menú «⋯», lote, glosario |
| `src/pages/admin/PostulacionesPagos.tsx` | `SubmissionDetail` ES el expediente (8 pestañas); la tabla monta el menú y la insignia «EN · estado» |

Endpoints (router de la Feria, literales antes de paramétricas):
`GET/PATCH /admin/postulaciones/:id/expediente`, `GET …/expediente/historial`,
`GET …/expediente/documento?lang=es|en|bilingual`, `GET/PUT …/traduccion/:lang`,
`POST …/traduccion/:lang/generar|aprobar`, `GET/PUT …/libreta`,
`POST …/libreta/preparar|aprobar`, `GET /admin/expedientes/estado?ids=`,
`POST /admin/expedientes/documentos`, `GET/POST/DELETE /admin/expedientes/glosario`.

### Permisos

| Capacidad | admin | finance | reviewer | translator (nuevo) | viewer |
|---|---|---|---|---|---|
| Leer el expediente (`view`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Editar el original (`edit`) | ✓ | | | | |
| Traducir / corregir / libreta (`translate`) | ✓ | | ✓ | ✓ | |
| Aprobar traducción y libreta (`approveTranslation`) | ✓ | | ✓ | | |
| Descargar fichas (`export`) | ✓ | ✓ | ✓ | ✓ | |
| Glosario (`config`) | ✓ | | | | |

`translators` es una lista por correo en Convocatoria → «Perfiles del módulo».
**⚠️ Defecto PREEXISTENTE, no corregido aquí:** `isProjectFairSiteAdmin` da
`admin` a todo usuario cuyo grant RBAC tenga `project_fair.view`, sin comparar el
sitio; los roles heredados `club_admin`/`district_admin`/`editor` resuelven a
`site_admin` con ese permiso. En la práctica, las listas finance/reviewers/
translators sólo aplican a usuarios sin sitio. Corregirlo exige confirmar antes
quién administra hoy el módulo (quedó como tarea aparte).

### Reglas durables

- **⚠️ NO HAY FORMULARIO NUEVO NI COPIA DE LA POSTULACIÓN.** Se lee y se escribe
  en las tablas de siempre. Las traducciones cuelgan de `submissionId + lang +
  path` (`master.objetivos.generalObjective`, `fdd_2026_2027.presupuesto.budgetBreakdown[2].concept`):
  otro idioma es otra fila, no otra columna.
- **⚠️ LO EDITABLE ES UNA LISTA BLANCA.** Pagos, valores cobrados, estados,
  referencias, edición, inscripción, club/distrito, correo de acceso,
  documento, archivos, campos calculados y la aprobación institucional NO son
  editables (cada uno con su `lockReason`). `submissionColumnOf` sólo devuelve
  columnas `editable`. La prueba verifica que nada de esto toque `status`,
  `workflowStatus`, `amount*` ni `paidAt`.
- **LA EDICIÓN ES TRANSACCIONAL Y CON «ANTES».** `PATCH` relee con `FOR UPDATE`,
  vuelve a planear con el `before` que vio la persona y responde 409 si cambió.
  Las respuestas de un formulario se MEZCLAN campo a campo. Cifras ⇒ motivo
  obligatorio. Deja: `ProjectDossierRevision` (campo, antes, después, quién,
  cuándo, motivo), `ProjectFairFormRevision` con `action = 'admin_edit'`
  (trazabilidad de que fue la administración) y un `ProjectFairEvent`.
- **LOS TIPOS SE RESPETAN.** La edición usa `FormField` (los controles del
  club) y `coerceValue` valida igual que `validateAnswers` (que también corre).
  Los números de un formulario se guardan como texto del campo numérico, igual
  que los guarda el club; en las columnas, como número.
- **⚠️ A LA IA SÓLO VA NARRATIVA.** `isTranslatableField`: `textarea` siempre;
  `text` sólo títulos/conceptos (`projectName`, `concept`…). Nombres, correos,
  teléfonos, firmas, ciudades, lugares, códigos, periodos y cifras sueltas no
  viajan (la prueba lo comprueba en lo que recibe el proveedor simulado). Los
  valores de catálogo (área de enfoque, «Sí/No», estados) se traducen SIN IA por
  el glosario (nombres oficiales de Rotary).
- **EL ESTADO SE DERIVA, NO SE GUARDA.** Cada campo traducido guarda la huella
  del original (`sourceHash`); si el español cambia, el campo es
  «Desactualizado» sin escribir nada. Aprobada = huella del conjunto
  (`approvedFingerprint`) igual a la vigente. Editar después de aprobar baja el
  estado; la versión aprobada (`ProjectDossierTranslationVersion`, inmutable)
  se conserva y la ficha inglesa la sigue usando, avisando que el original cambió.
- **REGENERAR NO PISA TRABAJO HUMANO.** Un campo pedido a mano se rehace aunque
  esté revisado (y el texto anterior queda en la bitácora); «Regenerar
  pendientes» sólo toca faltantes, desactualizados y borradores de IA, salvo
  «incluir revisados».
- **⚠️ GEMINI RECORTA A 2.500 CARACTERES** si no se declara `maxInputChars`. Los
  lotes (≤ 9.000 caracteres, ≤ 18 textos únicos) se mandan con 30.000. Se usa
  `routeToModel` (respaldo entre proveedores y medición en Consumo de IA,
  `feature: project_fair.translation`). Respuesta sin un id ⇒ se parte el lote
  y se reintenta UNA vez; nunca se guarda desalineado.
- **CANDADO DE GENERACIÓN** por proyecto e idioma (UPDATE condicional): dos a la
  vez ⇒ 409; uno caído se libera solo a los 6 min (`GENERATION_STALE_MS`).
- **LA IA NO CAMBIA CIFRAS SIN QUE SE NOTE** (`auditTranslation`: cifras,
  correos, enlaces y largo). No se «corrige» su texto; el campo queda con aviso y
  aprobar con avisos exige confirmarlo.
- **FICHAS:** el servidor arma los datos (`forDocument`: nunca el documento de
  identidad; correo/WhatsApp sólo si se piden; sin pagos) y registra cada
  descarga en `ProjectDossierExport`. El PDF no corta un bloque que cabe en una
  página; la inglesa sin aprobar lleva «BORRADOR · DRAFT — NOT APPROVED» en cada
  página y un narrativo sin traducir dice «Translation pending».
- **LIBRETA = COPIA DEL EXPEDIENTE.** `prepareBooklet` copia los campos (cada
  bloque dice de cuál salió); el mensaje breve nace vacío. `auditBooklet` marca
  cifras que no estén en el expediente y aprobar exige confirmarlas.
- **ALCANCE:** `loadScoped` responde 404 si el proyecto es de otra edición
  (`?evento=`); el lote descarta y reporta los ids fuera de alcance.
- **LOTE EN EL NAVEGADOR, SECUENCIAL.** Traducir N proyectos es N peticiones de
  a una (cada una lejos de los 120 s de la función), con progreso y «Detener».
  El ZIP se arma en el navegador (jszip) pidiendo datos de a 15.
- La pestaña «Traducción» avisa al padre por una ref (si dependiera de la
  función, un padre que la recrea dispararía la carga en bucle). El menú «⋯»
  acompaña al botón al desplazar: cerrarlo al desplazar hacía que el propio
  clic lo cerrara.

### La ficha técnica que descarga el GESTOR — v4.1345

Pedido: que el gestor de proyecto pueda descargar desde «Mi Proyecto» la
ficha técnica con lo que diligenció en la Formulación y en la Solicitud de
Aportes del FDD, con la Feria en la cabecera y la tipografía de Club Platform
(Open Sans).

- **`GET /portal/ficha`** (`portalAuth`, `getPortalDocument`): el proyecto sale
  del TOKEN del perfil, nunca de la URL. Devuelve el mismo `DocumentPayload`
  que la ficha en español del comité, con `audience: 'club'`, armado con
  **`forClubDocument`**: `forDocument` con correo y WhatsApp (son del propio
  club), SIN documento de identidad, SIN pagos y SIN las secciones
  institucionales del Distrito (`district`: aprobación y notas del comité).
  Cada descarga queda en `ProjectDossierExport` con `mode = 'club'`.
- **El logotipo lo trae el SERVIDOR** (`fairLogoOf`: `CalendarEvent.clubId →
  Club.logo`, sólo https, 5 s, ≤ 1,5 MB, tipo imagen) como data URL: el
  navegador no depende del CORS del almacenamiento. En el navegador se
  rasteriza a PNG (`prepareLogo`) para jsPDF. Sin logotipo, la cabecera dice
  «Feria de Proyectos» en texto.
- **⚠️ OPEN SANS EN TODAS LAS FICHAS.** Los TTF viven en `public/fonts/pdf`
  (Regular, Bold, Italic; OFL 1.1 en `OFL-LICENSE.md`; jsPDF no lee woff2). ⚠️ La licencia NO puede ser `.txt`: `.gitignore` y `.vercelignore` excluyen `*.txt`, el archivo no viajó y `test:fair:dossier` (que comprueba que está) rompió el primer despliegue de v4.1345. `newDoc`
  los carga una vez por sesión y escribe con `fam(doc)`; la ficha del comité,
  el lote y la libreta también salen en Open Sans. Si no cargan —o el servidor
  responde la página (200) en vez del archivo: se valida la FIRMA del TTF—, el
  PDF sale en Helvetica. Nunca se deja de entregar por la letra.
- La ficha del club (`buildClubFichaPdf`): cabecera blanca con logotipo,
  «Ficha técnica del proyecto» y la edición; portada con proyecto, club,
  distrito, referencia y «Contenido de esta ficha» (cada formulario con su
  avance); pie con página y «No incluye documento de identidad ni datos de
  pago». Archivo `FP-XXXX-<proyecto>-ficha-tecnica.pdf`.
- **El botón** (`FichaTecnicaButton`) va DENTRO de «Avance documental del
  proyecto» (`DocumentProgressPanel`).
- Prueba: `npm run test:fair:club-ficha:ui` (31, Postgres + navegador): el
  servidor (sesión, ajeno, sin documento ni Distrito, logotipo, registro), el
  botón a 1280 y 390 px, el PDF leído con pdfjs (proyecto, club, tildes, los
  dos formularios, sin documento), Open Sans e imagen del logotipo, la ficha
  del comité en Open Sans y el respaldo en Helvetica sin la fuente. Y 9
  invariantes nuevas en `test:fair:dossier`.
- ⚠️ `test:fair:dossier:ui` falla en «Ver» (no encuentra el botón de la fila
  FP-EXP001) también en `main` sin este cambio: es previa.

### La ficha muestra todo lo diligenciado — v4.1347

Revisión de Paula Cruz (Pereira del Café) sobre su ficha descargada:

- **⚠️ v4.1345 quitaba de la ficha del gestor la «Aprobación institucional»
  del FDD.** Filtraba `district`, que agrupa `districtSpace` (lo diligencian el
  club Y el Distrito, v4.643) y `adminOnly` (sólo el comité). Ahora el
  expediente marca `adminOnly` aparte y `forClubDocument` quita SÓLO eso.
- **El «Desglose del presupuesto» (repetidor con dinero) es una TABLA**
  (`moneyRepeaterTable`): # · concepto · valor, «Sin valor» en rojo donde no
  hay monto, «Total del desglose» y la conciliación con su total
  (`BREAKDOWN_TOTALS`: `fdd_2026_2027.presupuesto.budgetBreakdown` →
  `…budgetUsd`): «Presupuesto total … · Diferencia sin detallar: US$ 2.655».
  Antes eran líneas de texto sin total: el rubro «Operations (Unforeseen)» sin
  valor no se notaba.
- **La tabla de la Formulación no toma el valor del FDD.** Si «Distrito
  Colombiano» está vacío en dólares y el FDD tiene «Cantidad solicitada», la
  ficha dice debajo «Solicitado al FDD en la Solicitud de Aportes del FDD:
  US$ 958». No se escribe en la tabla como si el club lo hubiera puesto.
  Para cruzar datos, el `Writer` lleva un índice de campos por ruta.
- **Los calculados salen como dinero** (`plainValue` → `computed`): la ficha
  decía «2000» y «250» donde el formulario muestra US$.

### Los clubes de la portada y la fila «total» del desglose — v4.1353

Segunda revisión de Paula Cruz: *«en la hoja 1 aún no salen los 4 clubes»* y
*«agregué el ítem del total, por eso me sale el doble»* (US$ 273.116 y una
«Diferencia sin detallar» de US$ -136.558).

- **`participatingClubsOf` ya no lee sólo la lista** «Clubes participantes en
  el proyecto» (v4.1346). Suma también los clubes escritos en los textos
  «Club Rotario» (`master.identificacion.clubName`,
  `fdd_2026_2027.club.clubName`), separados por coma, punto y coma, «/», « - »
  o « y ». Nunca repite el club que postula ni uno ya listado: compara con
  `clubKey` (sin tildes ni «Club Rotario» / «Rotary Club» / «C.R.»). Muchos
  clubes escriben los aliados en el campo de texto que ya conocen y no ven el
  campo nuevo, que es opcional.
- **Una fila del repetidor con dinero titulada «Total»** (`TOTAL_ROW_RE`:
  total, subtotal, total general, gran total, total presupuesto, total USD…,
  comparando sin tildes ni puntuación; un rubro como «Total equipment
  purchase» NO cuenta) no se numera ni se suma. Se muestra debajo como «Total
  escrito por el club», comparado con la suma de los rubros: gris si
  coincide, rojo si no. Los datos del club NO se tocan: es sólo cómo los lee
  la ficha.
- **Un desglose que supera el presupuesto** dice «El desglose lo supera en
  US$ …» en vez de una diferencia negativa.
- Pruebas: `test:fair:participating-clubs` (en `prebuild`) empaqueta el
  módulo REAL del PDF con esbuild y prueba `participatingClubsOf` y
  `TOTAL_ROW_RE`; `test:fair:club-ficha:ui` reproduce el desglose actual de
  Paula (cuatro rubros + «total» 136.558) y un segundo club escrito en el
  texto del FDD, y lee el PDF con pdfjs. Ojo con las regex sobre el texto
  plano del PDF: «US$ 2.655 Total del desglose» contiene «5 Total».

### Pruebas

- `npm run test:fair:dossier` — criterio y código sin base (va en `prebuild`).
  Con `DOSSIER_TEST_DATABASE_URL=<postgres desechable>` corre además los
  manejadores reales contra Postgres con la IA simulada en `fetch` (los 20
  escenarios del pedido: abrir, ver todo, documentos, editar, historial,
  traducir, corregir, aprobar, tres PDF, desactualización, versiones, permisos,
  cifras, alcance de la exportación y pago intacto). 134 comprobaciones.
- `npm run test:fair:dossier:ui` — navegador real contra servidor y Postgres
  reales (`FAIR_E2E_DATABASE_URL`), 1500 y 390 px, administrador y traductora.
  Necesita `dist/assets` para el CSS. 41 comprobaciones.
- El Postgres local de la nube exige SSL (`db.js` lo fuerza): con un clúster
  desechable hace falta `ssl = on` y un certificado autofirmado.

### Compatibilidad

Las pruebas de UI anteriores que abren «Ver» siguen en verde
(`test:fair:manual-payment:ui` 23, `test:fair:substitution:ui` 17,
`test:fair:bulk:ui` 26, `test:fair:fdd-columns:ui` 21, `test:management-center`
29): la ficha conserva sus pestañas Pago e Historial y todos sus botones. Las
tablas son nuevas y no se toca ninguna existente. La «Ficha en PDF» de una
página sigue en la cabecera.

### Recomendaciones (siguientes pasos)

- Corregir el alcance de `isProjectFairSiteAdmin` (arriba) para que los perfiles
  por correo signifiquen algo.
- Filtro del listado «Traducción pendiente» en `VIEW_FILTERS` (hoy se ve con la
  insignia de la fila y en el lote).
- «Paquete documental» del evento: un único PDF con índice de todos los
  proyectos aprobados (la base ya existe en `buildDossierPdf`).
- Redacción asistida del mensaje breve de la libreta, con la misma verificación
  de cifras del guion del Video Pitch.
