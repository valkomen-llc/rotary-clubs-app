<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Aportes de contenido a una campaña — v4.968 (participación y difusión: v4.972)

Un rotario o un club manda desde el teléfono sus fotos, su video y su historia
sobre una campaña de contribución; el equipo lo revisa, lo aprueba y con un
gesto queda en la Biblioteca Multimedia y a la vista del Generador de
Publicaciones. Sección propia **dentro** de la campaña, no un módulo aparte.

| Archivo | Qué es |
|---|---|
| `server/lib/contentSubmissionSpec.js` | El CRITERIO. **Puro**: estados y transiciones, tipos y topes de archivo, validación del envío, consentimiento, mensaje de invitación, contexto para la IA y canales de uso |
| `server/lib/ensureContentSubmissionSchema.js` | `ContributionSubmission`, `ContributionSubmissionFile` y `ContributionSubmissionEvent` en runtime |
| `server/lib/submissionFiles.js` | El almacenamiento: prefirmar la subida al prefijo PRIVADO, firmar la lectura y promover a la Biblioteca con `CopyObject` |
| `server/lib/contentSubmissionStore.js` | La I/O: crear, listar, contar, transicionar, aprobar, marcar uso y el material aprobado de una campaña |
| `server/controllers/contentSubmissionController.js` | El formulario público y la bandeja |
| `src/lib/contentSubmissionSpec.ts` | Espejo MÍNIMO: estados, límites y `checkFileMeta` |
| `src/pages/AportarContenido.tsx` | El formulario público (`/aportar-contenido/:ref`) |
| `src/components/admin/contribution/SubmissionsPanel.tsx` | El enlace para compartir, la bandeja, la ficha y las acciones |
| `ContributionSubmissionClub` · `ContributionSubmissionPost` | Los clubes participantes y la difusión previa, una fila cada uno (v4.972) |

Pruebas: `npm run test:submissions` (62 casos, **sin base, credenciales ni
red**; el bloque del espejo pide `esbuild` y se salta solo) y
`npm run test:submissions:ui` (10 comprobaciones en un navegador que ESCRIBE
tecla por tecla; pide `playwright` y `dist/` y se salta sola). Verificadas a la
inversa sobre las invariantes que sostienen el módulo.

**Reglas durables:**

- **⚠️ NADA DE LO QUE LLEGA POR EL FORMULARIO PÚBLICO SE PUBLICA SOLO, Y ESO ES
  ESTRUCTURAL.** No es una regla de pantalla que alguien pueda saltarse
  conociendo un endpoint: el archivo sube a `private/campaign-submissions/`, un
  prefijo **sin lectura pública**, y la bandeja lo mira con un enlace FIRMADO de
  15 minutos. Sólo aprobar lo copia al prefijo público de la Biblioteca. Un
  aporte nace SIEMPRE en `recibido` —`createSubmission` fija `INITIAL_STATE` en
  el código y `shapeSubmission` ni siquiera acepta un `status` del cuerpo—, así
  que no hay forma de nacer aprobado mandando un campo de más.
- **⚠️ APROBADO NO ES PUBLICADO, y el flujo lo hace imposible.**
  `FLOW.aprobado` **no incluye** `publicado`: el camino es
  `aprobado → listo_difusion → publicado`, y lo comprueba una prueba. Aprobado
  significa «esto sirve y ya está en la Biblioteca»; publicado significa «salió
  a una red». Fundirlos haría que el contador de la campaña dijera que hay
  material difundido cuando lo único que hay es material revisado.
- **`requiere_info` y `descartado` EXIGEN motivo** (`needsReason`), y el motivo
  es lo que se le devuelve a quien mandó el material. Pedirle a alguien que
  complete su aporte sin decirle qué falta es pedirle que adivine; descartar sin
  motivo es un borrado con otro nombre (regla de los desembolsos, v4.885).
- **EL HISTORIAL SÓLO AGREGA.** `ContributionSubmissionEvent` no se edita ni se
  borra: corregir es escribir otro evento. Es lo único que contesta «¿por qué
  esta foto está en la Biblioteca?» dentro de seis meses.
- **⚠️ LA TRAZA ES `campaign_id → submission_id → media_asset_id` Y SE
  CONSERVA.** `ContributionSubmissionFile.mediaId` ata el archivo a su fila de
  `Media`, y `SocialPublicationOrigin.submissionId` (columna aditiva, v4.968)
  ata la publicación al aporte del que salió. Sin esa cadena, el material
  aprobado se vuelve anónimo en cuanto entra a la Biblioteca y no se le puede
  agradecer a nadie.
- **⚠️ EL ARCHIVO NO SE VUELVE A SUBIR: SE MUEVE DENTRO DE S3.** `promoteToLibrary`
  hace `CopyObject` de servidor a servidor —los bytes NO pasan por la función—,
  inserta la fila de `Media` y recién entonces borra el objeto de staging. Un
  video de 200 MB por el cuerpo de una función es imposible (el tope es ~4,5 MB)
  y bajarlo a `/tmp` es el ENOSPC que ya costó una versión en el recorte de
  video (v4.935).
- **⚠️ `MetadataDirective` VA EN `'REPLACE'`, NO EN `'COPY'`.** Con `COPY` —el
  valor por defecto— S3 **ignora en silencio** las cabeceras nuevas y el objeto
  aterriza en la Biblioteca con el `Cache-Control: no-store` del staging: una
  imagen pública que nadie cachea, sin ningún error que lo diga. Al copiar un
  objeto cambiándole las cabeceras, `REPLACE` y el `ContentType` explícito.
- **APROBAR ES IDEMPOTENTE POR ARCHIVO.** Un archivo que ya tiene `mediaId` se
  saltea, así que aprobar dos veces —dos clics, un reintento— no duplica filas
  ni deja objetos huérfanos. La protección está en la fila, no en el botón.
- **La clave de S3 lleva índice único** (`ContributionSubmissionFile.s3Key`):
  dos envíos concurrentes no pueden reclamar el mismo objeto de staging.
- **⚠️ EL ÍNDICE DE USO ES PARCIAL Y `reference` ES `NOT NULL DEFAULT ''`.** En
  Postgres NULL nunca es igual a NULL, así que con la columna nullable dos
  marcas manuales del mismo canal —las que no traen referencia— no chocarían
  jamás y el registro se llenaría de duplicados. Y por ser parcial, el
  `ON CONFLICT` va **a secas**, sin nombrar columnas: repetir el predicado mal
  hace fallar la sentencia entera (la trampa de v4.648).
- **EL USO SE MARCA AL PUBLICAR, NO AL GENERAR.** Generar un copy es una prueba;
  lo que cuenta como uso es que la pieza haya salido. Lo escribe
  `markSubmissionUsageForPublication` desde `socialPublishingController`, con el
  desenlace REAL por red, y **sólo cuenta las que el proveedor confirmó**. El
  canal declara si se MIDE (`usageIsMeasured`): las redes se observan y correo,
  WhatsApp y web se marcan a mano — presentarlos igual sería afirmar una
  medición que no se hizo.
- **⚠️ LO QUE MANDA EL CLUB ENTRA AL UNIVERSO DE LO SUMINISTRADO, PERO NO SE
  PUBLICA SOLO.** `buildSubmissionContext` viaja al brief del Generador de
  Publicaciones bajo un rótulo que dice de dónde salió, y **declara lo que NO se
  sabe** —el mismo criterio de la Campaña de Emergencia (v4.783)—: un hueco en
  silencio es una invitación a que el modelo lo llene. El validador sigue siendo
  `validateEmergencyCopy`: el modelo escribe y el código decide.
- **⚠️ SÓLO EL MATERIAL APROBADO LLEGA AL GENERADOR.** `approvedCampaignMedia`
  filtra `status IN ('aprobado','listo_difusion','publicado')` **y**
  `mediaId IS NOT NULL`, y el filtro va en el `WHERE`, no en la pantalla. Un
  aporte en revisión ofrecido como fotografía sería exactamente el «se publica
  solo» que el módulo existe para impedir. Los aportes se mezclan **primero** en
  la lista de fotos de la campaña: es lo más nuevo y lo que menos se conoce.
- **⚠️ LA BANDEJA SE ABRIÓ AL SITIO EN v4.999** y ya no es `superAdminOnly`:
  su gate es `requireCampaignAccess`, el mismo `scopedCampaign` con el que ese
  sitio abre y edita esa campaña. Ver «Solicitudes de contenido: la BANDEJA».
- **NO HAY UN SEGUNDO GENERADOR NI UN SEGUNDO ENVIADOR.** «Usar en el Generador»
  abre el Estudio de Contenido con la campaña, la foto y el aporte ya puestos
  (`?tab=create&ways=…&submission=…&image=…`); la difusión sale por los módulos
  que ya existen. Un generador propio de la bandeja se separaría del de siempre
  en silencio — la regla que estrenó v4.967.
- **⚠️ EL TEXTO DEL CONSENTIMIENTO SE DECLARA PROVISIONAL HASTA QUE ALGUIEN LO
  CONFIGURE.** La plataforma **no tiene** una política de privacidad ni de uso de
  imagen que se pueda reutilizar; inventar un texto legal sería peor que no
  tenerlo. `DEFAULT_CONSENT_TEXT` dice de sí mismo que es provisional,
  `consentIsConfigured` lo distingue del definitivo y el editor de la campaña lo
  pide. Lo que SÍ es firme es que la casilla es obligatoria y que **el texto
  aceptado se guarda con la solicitud** (`consentText`): un consentimiento que
  cambia después no puede reescribir lo que alguien aceptó.
- **LA SECCIÓN NACE APAGADA** (`normalizeSubmissionsConfig`). Un formulario
  público que se abre solo el día del despliegue en todas las campañas vivas es
  el defecto de v4.737 por la otra puerta. Y el enlace no se ofrece mientras esté
  apagado: un enlace que devuelve «no está habilitado» es peor que ninguno
  (v4.650).
- **EL MENSAJE DE INVITACIÓN LO ARMA EL CÓDIGO CON EL NOMBRE DE LA CAMPAÑA**
  (`defaultInviteMessage`), y es editable. No se pide a un modelo: se manda por
  WhatsApp decenas de veces y tiene que decir lo mismo siempre.
- **⚠️ `:ref` ES EL SLUG O EL ID.** Lo que se comparte es el slug —es lo que se
  lee en un WhatsApp— y lo que no cambia es el id: aceptar los dos es lo que hace
  que renombrar la campaña no rompa los enlaces ya repartidos (patrón de
  `/eventos/:ref`, v4.658). Las tres rutas públicas van declaradas **antes** de
  `/:id`, o «submissions» se leería como un id de campaña (`check:routes`).
- **EL TIPO DE ARCHIVO SE DECIDE POR MIME **Y** POR EXTENSIÓN** (`kindOf`).
  Varios navegadores de móvil mandan el tipo vacío o `application/octet-stream`
  al elegir del carrete: fiarse sólo del MIME dejaría fuera justamente el caso
  para el que se hizo el formulario. Es la misma lección que el HEIC de iPhone
  (v4.739).
- **⚠️ `split('.').pop()` DEVUELVE EL NOMBRE ENTERO CUANDO NO HAY PUNTO**, así
  que un archivo llamado `raro` daba extensión `raro`. `extensionFor` exige
  `lastIndexOf('.') > 0`. Lo destapó una prueba, no la lectura.
- **NINGÚN `fetch` DEL FORMULARIO PÚBLICO LLAMA `.json()` A CIEGAS**
  (`leerJson`): una página de error HTML rompe el parseo y el error resultante no
  nombra ninguna capa (la lección de v4.946). El fallo del `PUT` a S3 dice su
  estado HTTP aparte — son dos saltos distintos y se corrigen en sitios
  distintos.
- **EL AVISO AL EQUIPO NUNCA TUMBA EL ENVÍO.** Sale por
  `sendPlatformEmail`, que **no lanza: contesta `{ success }`** (v4.901), y va con
  su `.catch(() => {})`: un correo que no sale no puede perder el material que
  alguien acaba de mandar desde el teléfono.
- **LOS FILTROS Y EL CONTEO LOS RESUELVE EL SERVIDOR.** Con el filtro
  implementado también en la pantalla, el número del contador y las filas de la
  lista podrían discrepar — la regla del calendario de la distribución (v4.864).
  El `hasta` incluye el día ENTERO: acotarlo a las 00:00 se come el último día
  (v4.849).
- **El espejo del navegador NO trae `validateSubmission`, `shapeSubmission` ni
  `canTransitionSubmission`.** Quien DECIDE es el servidor; el espejo sólo pinta
  estados, límites y el aviso de un archivo demasiado grande antes de gastar la
  subida. Copiar el veredicto daría dos verdades sobre el mismo envío.
- **Las tres tablas viven fuera de Prisma** y están en la lista del guardián de
  `db:push`. `Media` **no gana ni una columna**: el vínculo va desde
  `ContributionSubmissionFile`, nunca al revés (regla de `logo_intl`, v4.699).

- **⚠️ UN COMPONENTE DECLARADO DENTRO DE OTRO NO SE PUEDE ESCRIBIR** (v4.971).
  v4.969 puso el envoltorio `Marco` DENTRO de `AportarContenido` y el
  formulario dejó de funcionar: React identifica un componente por su TIPO, y
  una función declarada dentro de otra es un tipo NUEVO en cada render — así
  que a cada pulsación React no actualizaba el árbol, lo **DESMONTABA entero y
  lo montaba de nuevo**. La casilla perdía el foco tras UNA letra y la página
  saltaba al principio. Se reportó como «no me deja escribir».
  **No lo ve NADA de lo que ya había**: el código es válido, los tipos están
  bien, `check:hooks` mira el ORDEN de los hooks —que no cambia— y las pruebas
  de criterio no montan React. Y **la sangría no lo delata**: el `Marco`
  defectuoso estaba en la COLUMNA 0 y aun así dentro de la función — hay que
  contar llaves. Lo fijan dos barreras: una estructural en `test:submissions`
  (acotada a las pantallas de este módulo, porque repo-wide da 44 hallazgos
  casi todos benignos —alias de iconos— y un guardián que grita en falso se
  termina desactivando) y `npm run test:submissions:ui`, que **escribe tecla
  por tecla** en un navegador de verdad. `fill()` no habría servido: pone el
  valor de una vez y el defecto no se manifiesta. **Al extraer un envoltorio de
  una pantalla, sacarlo del componente.**

### Participación rotaria, difusión previa y teléfono internacional (v4.972)

El formulario se reorganizó —material → qué ocurrió → datos de la actividad →
participación rotaria → difusión previa → quién lo envía → información
adicional → consentimiento— y aprendió tres cosas. Pruebas: las de
`npm run test:submissions` (97 casos) y `npm run test:submissions:ui`.

- **⚠️ LOS CLUBES PARTICIPANTES SON DE LA ACTIVIDAD, NO DE QUIEN LA ENVÍA, y
  confundirlos pierde el dato.** Una actividad la pueden haber hecho tres
  clubes y la manda una sola persona, que quizá no pertenece a dos de ellos.
  Viven en `ContributionSubmissionClub`, con su distrito, su nombre y su
  `clubKey`; el club del remitente sigue siendo la columna `club`, aparte. La
  pantalla los OFRECE desde los ya elegidos porque es el caso normal —quien
  manda pertenece a uno de ellos—, no porque sean lo mismo.
- **UNA FILA POR CLUB Y POR PUBLICACIÓN, y el motivo NO es la concurrencia**
  —acá se escriben una sola vez— sino la CONSULTA: «qué clubes participan
  activamente» y «participación por distrito y club» hay que poder indexarlas,
  y un filtro sobre un documento no se indexa. Es el mismo argumento por el que
  los datos de la actividad son columnas y no un JSON.
- **`participatingClubs` (texto) se CONSERVA y se sigue llenando.** No es una
  segunda verdad: se DERIVA de la lista en el mismo envío y nunca se edita
  aparte. Existe para que todo lo que ya la consume —el brief de la IA, la
  tarjeta de la bandeja, el aviso por correo— siga funcionando sin cambiar una
  línea (regla aditiva). Lo que se CONSULTA es la tabla.
- **`district` es el distrito de la ACTIVIDAD.** Hasta v4.971 se preguntaba
  dentro de «¿Quién lo envía?» y significaba lo mismo —quien enviaba declaraba
  el suyo—, así que la columna se reutiliza: dos columnas de distrito serían
  dos verdades sobre el mismo hecho. Cambiar de distrito DESCARTA los clubes
  elegidos, porque los del anterior ya no describen nada.
- **El distrito por defecto sale del TARGETING que la campaña ya declara, y
  sólo si apunta a UNO.** Con varios, elegir uno sería inventar cuál de ellos
  hizo la actividad y el formulario abriría con una respuesta que nadie dio. Es
  un default del desplegable, no un valor guardado.
- **La lista AYUDA a elegir; NO cierra los valores** (v4.706). Un catálogo se
  queda viejo solo y acá lo que está en juego es que alguien no pueda mandar
  las fotos de su club: hay salida para escribir un nombre que no está, va de
  última, y `source` distingue el club del catálogo del escrito a mano — es lo
  que después dice si un nombre desconocido es un club nuevo o un error de
  tipeo, y no se puede deducir después. La pareja distrito-club que se
  contradice AVISA, no rechaza.
- **⚠️ «DÓNDE PUBLICÓ EL CLUB» NO ES `USAGE_CHANNELS`, Y FUNDIRLOS BORRARÍA LA
  PREGUNTA.** Aquél responde «¿dónde usamos NOSOTROS el material después de
  aprobarlo?» y lo escribe la plataforma; `POST_PLATFORMS` responde «¿dónde lo
  publicó el CLUB antes de mandárnoslo?» y lo declara quien envía. Un mismo
  material puede tener las dos cosas, y contarlas juntas haría creer que
  difundimos algo que difundió otro. Son dos catálogos cerrados y dos tablas.
- **`hasPosts` es una RESPUESTA, no una deducción de la lista.** «No publicamos
  nada» y «dijo que sí y no llegó a escribir ninguno» son cosas distintas, y
  deducirlo de `posts.length` las fundiría: la segunda hay que poder señalarla.
  Decir que SÍ sin ninguna publicación válida es un **error**, no un aviso —
  quien marcó «Sí» está afirmando que existe una difusión—; decir que **no** no
  exige nada y descarta lo que hubiera quedado escrito.
- **⚠️ EL ENLACE SE VALIDA POR FORMA, NO POR DOMINIO, PERO EL ESQUEMA SÍ SE
  CIERRA.** Una publicación puede venir acortada, con redirección o desde un
  dominio propio: exigir `instagram.com` en una fila marcada «Instagram»
  dejaría fuera los casos reales. Lo que no se negocia es `http`/`https`: el
  valor termina como `href` de un enlace del panel administrativo y lo escribió
  alguien en un formulario PÚBLICO (regla del mapa de la sede, v4.717, y de las
  redirecciones, v4.781). **Y el caso que de verdad prueba esa guardia lleva
  host**: `javascript:alert(1)` lo rechaza el filtro del host —no tiene punto—
  y la prueba pasaría igual sin la comprobación del esquema;
  `javascript://evil.com/%0aalert(1)` parsea, tiene host con punto y sólo lo
  detiene el esquema. Se encontró verificando a la inversa, no leyendo.
- **NO hay índice único sobre la URL de una publicación**, a propósito: dos
  clubes pueden documentar por separado la MISMA actividad y citar el mismo
  post, y una restricción rechazaría el segundo envío entero. Detectar el
  duplicado es una CONSULTA —para eso está el índice por `host`—, no una
  restricción.
- **⚠️ EL TELÉFONO SE GUARDA EN PARTES Y EN E.164.** Este contacto va a WhatsApp
  y al CRM, donde hace falta `+573001234567` sin deducir el país a partir de
  los dígitos — el error que `phone.js` documenta como caro: adivinar mal manda
  el mensaje a un TERCERO real que lo recibe y lo abre. El E.164 lo **compone
  el servidor** a partir del indicativo y del número, y nunca se acepta armado
  del cuerpo: así el número guardado no puede contradecir a sus partes. Un
  número que no se puede componer se CONSERVA como lo escribieron, con las
  partes vacías (regla aditiva: un navegador con el bundle anterior manda sólo
  texto), y el panel **no le compone un `wa.me`** deduciéndole el indicativo.
- **EL CATÁLOGO DE PAÍSES NO SE COPIA AL SERVIDOR.** Vive en `countryPhones.ts`,
  que el navegador YA carga para el selector telefónico de los otros
  formularios: mandarlo desde el servidor sería duplicar en la respuesta lo que
  el bundle lleva de todos modos (el reparto de v4.708). Lo que el servidor no
  delega es la ARITMÉTICA. El **nombre** del país se resuelve al leer desde ese
  mismo catálogo: guardarlo sería una segunda verdad sobre lo que el ISO ya
  dice. Lo que NO se reutiliza es el `PhoneField` de `FairField.tsx` —su piel es
  la de aquel formulario—: se comparten el DATO y el análisis del número, que
  es la parte que no puede tener dos verdades.
- **«Información adicional» va al FINAL y FUERA del bloque condicional.** Son
  datos distintos, y colgarla de «¿ya publicaste?» le quitaría la oportunidad
  de contar algo relevante a quien contesta que no. No es obligatoria a
  propósito: exigirla produce «N/A» y repeticiones — se rotula «opcional, pero
  recomendado».
- **SE MUESTRA POCO Y SE REVELA.** Los clubes no aparecen hasta que hay un
  distrito —sin él la lista sería de mil nombres— y las publicaciones no
  aparecen hasta que alguien contesta que sí las hubo. El formulario no es más
  largo: es más corto hasta que hace falta.
- **⚠️ EL GUARDIÁN DEL MARCO SE ACOTÓ AL CUERPO DE LA PÁGINA.** Miraba el
  archivo entero buscando `return (<div`, y el archivo tiene ahora componentes
  auxiliares —el selector de clubes, la fila de una publicación, el teléfono—
  que devuelven un `<div>` porque van DENTRO del marco, no en su lugar:
  marcaba en falso cada uno. Un guardián que grita en falso se termina
  desactivando, y eso costaría la comprobación que de verdad importa. Los
  auxiliares van todos en el ÁMBITO DEL MÓDULO (la regla de v4.971).
- **⚠️ TODO `ADD COLUMN` HAY QUE ENUMERARLO EN EL ATAJO DEL ENSURE.**
  `CREATE TABLE IF NOT EXISTS` no amplía nada: una base que estrenó el módulo
  en v4.968 tiene las tres tablas y NO las columnas del teléfono, así que con
  el atajo mirando sólo tablas los `ALTER` no correrían nunca y el INSERT
  fallaría con «column does not exist» — en silencio, porque este módulo
  degrada. Lo fija una prueba que recorre todos los `ADD COLUMN` del archivo
  (trampa de v4.908, generalizada).
- **Las CINCO tablas viven fuera de Prisma** y están en la lista del guardián de
  `db:push`.

### Las cuatro preguntas de la actividad van en UNA tarjeta (v4.973)

- **⚠️ LO QUE SE FUSIONA ES EL CONTENEDOR, NO EL CONTENIDO.** Qué ocurrió, los
  datos de la actividad, la participación rotaria y la difusión previa son
  cuatro preguntas sobre LO MISMO y venían en cuatro tarjetas blancas
  seguidas: al lado unas de otras se leen como cuatro formularios distintos, y
  desde el teléfono —que es desde donde se llena— obligan a recorrer cuatro
  bloques para contestar una sola cosa. No se quitó ni un campo ni una ayuda:
  cada sección conserva su título, su icono y su texto, y el orden no cambia.
- **`Bloque` se COMPONE sobre `Seccion`.** `Seccion` pinta el encabezado sin
  marco propio y `Bloque` es una `Seccion` sola dentro de su tarjeta. Con el
  encabezado escrito dos veces —uno para la tarjeta suelta y otro para la
  compartida— el mismo título se ve distinto según en cuál caiga, y eso no lo
  ve ninguna comprobación. Lo fija una prueba que cuenta la definición: tiene
  que haber UNA.
- **La separación entre secciones es un FILETE, no un espacio con sombra.** Es
  lo que hace que se lean como partes de un mismo formulario en vez de como
  tarjetas pegadas. La primera no lleva línea (`primera`), o quedaría un
  filete contra el borde de la tarjeta.
- **`Seccion` va en el ÁMBITO DEL MÓDULO**, como todo componente de este
  archivo: declarada dentro de la página sería un tipo nuevo en cada render y
  la casilla perdería el foco tras una letra (v4.971). Lo cubre el detector de
  componentes anidados, que cuenta llaves.
- **Se comprueba en el CÓDIGO y en la PANTALLA, y las dos hacen falta.** La de
  criterio exige que entre «¿Qué ocurrió?» y «Difusión realizada» no se abra
  otro marco —volver a partirlas es un cambio de una línea que nadie ve—; la
  de navegador exige que, ya pintado, el marco sea el MISMO nodo, que es como
  se reportó. Las dos verificadas a la inversa reintroduciendo la separación.
- **Lo condicional no se tocó**: los clubes siguen sin aparecer hasta que hay
  distrito y las publicaciones hasta que alguien contesta que sí las hubo.
  Fusionar tarjetas no puede convertirse en mostrar todo de una vez — es lo
  contrario de lo que hace corto este formulario.

### Una clase que SÍ llega al CSS puede perder igual (v4.974)

Reporte con captura: «cuando elijo una plataforma, la casilla para agregar el
enlace no aparece, se pierde». El campo estaba en el DOM y medía **32 px**,
aplastado contra el borde de la tarjeta.

- **⚠️ EN EL MISMO ELEMENTO NO GANA LA ÚLTIMA CLASE DEL ATRIBUTO: GANA LA
  ÚLTIMA DEL CSS COMPILADO.** `CAMPO` declara `w-full` y la fila escribía
  `` `${CAMPO} w-40 flex-shrink-0` `` sobre el selector de plataforma; en
  `dist/assets/index-*.css`, `.w-full` va **después** de `.w-40` (medido:
  desplazamientos 21386 y 20467), así que el selector se quedaba al 100 % del
  renglón —y con `flex-shrink-0`, sin poder encogerse— y empujaba el campo del
  enlace fuera. Es la HERMANA de la lección de v4.719: allá la clase no
  llegaba al CSS y no existía; acá existe y la pisan. Las dos fallan igual de
  callado.
- **EL ANCHO VA EN UN ENVOLTORIO**, nunca encima de `CAMPO`. Un `div` sin
  `w-full` no tiene con qué chocar, y el criterio deja de depender de en qué
  orden Tailwind ordene su escala. Lo fija una prueba que recorre todos los
  `` `${CAMPO} …` `` del archivo y falla si alguno agrega un `w-*`.
- **`min-w-0` no es cosmético en una fila flex con un `input`.** Un campo de
  texto trae un ancho mínimo propio (`min-width: auto` sobre su tamaño
  intrínseco), así que sin él vuelve a desbordar en cuanto la fila se estrecha
  — el mismo defecto por la otra puerta, y sólo en pantallas angostas, que es
  donde menos se mira.
- **⚠️ ESCRIBIR EN UN CAMPO NO DEMUESTRA QUE SE VEA.** `test:submissions:ui`
  ya elegía la plataforma y tecleaba el enlace entero, y **pasaba con el
  defecto delante**: `fill()` y `keyboard.type()` funcionan sobre un elemento
  aplastado igual que sobre uno usable. La comprobación que faltaba es de
  GEOMETRÍA: dónde cae el campo y cuánto mide. Al probar un formulario en un
  navegador, medir además del contenido — es la lección de v4.851 (una prueba
  de disposición sin el CSS cargado pasa por los motivos equivocados) aplicada
  a un campo que sí se podía escribir.
- **En un móvil el enlace baja a su propio renglón** (`flex-col sm:flex-row`).
  Repartir el ancho de un teléfono entre un selector, una dirección web y un
  botón de quitar no deja ninguno de los tres usable.

### El distrito y sus clubes son UNA pregunta (v4.975)

- **⚠️ VAN EN LA MISMA LÍNEA PORQUE EL PRIMERO DECIDE AL SEGUNDO.** El distrito
  es lo que determina qué clubes se ofrecen, y apilados el distrito quedaba como
  un campo suelto ocupando un renglón entero mientras la lista que depende de él
  empezaba debajo: la dependencia había que deducirla. En dos columnas se lee de
  un vistazo —elijo a la izquierda, aparecen a la derecha—.
- **El ORDEN no cambia y el comportamiento tampoco.** El distrito sigue primero
  —izquierda en el escritorio, arriba en un teléfono— y cambiar de distrito
  sigue descartando los clubes elegidos: los del anterior ya no describen nada.
  Poner dos campos juntos es una decisión de disposición, no de flujo.
- **⚠️ EL ANCHO LO PONE LA REJILLA, NUNCA UNA CLASE ENCIMA DE `CAMPO`.** Es la
  regla de v4.974 aplicada al caso en que de verdad hacen falta dos columnas:
  cada campo llena su pista (`grid-cols-1 sm:grid-cols-2`) y `CAMPO` conserva su
  `w-full` sin nadie con quien chocar. El guardián de v4.974 lo exige.
- **`min-w-0` en el campo manual del selector de clubes.** Media columna es
  media columna: la fila «Escribí el nombre del club · Agregar · Volver» lleva
  un `input`, que trae ancho mínimo propio, y sin eso empuja los dos botones
  fuera de la tarjeta — el mismo defecto de v4.974 por la otra puerta, y sólo
  visible al estrechar la columna.
- **En un teléfono vuelven a apilarse** (`grid-cols-1`). Media pantalla de móvil
  no da para una lista de clubes con buscador: dos columnas ahí serían dos
  campos inservibles en vez de uno legible.
- **⚠️ QUE COMPARTAN LÍNEA SE MIDE EN UN NAVEGADOR, no se deduce del marcado.**
  Es literalmente lo que se pidió mirando la pantalla, y una clase de rejilla
  puede no llegar al CSS (v4.719) o llegar y perder la cascada (v4.974): las dos
  fallan calladas. Se comparan las cajas reales de los dos campos —a lo ancho y
  al estrecharse la ventana—, con el CSS compilado cargado (v4.851). La prueba
  de criterio, aparte, impide que la rejilla se quite en una línea sin que nadie
  lo note; las dos verificadas a la inversa.
- **⚠️ EL HUECO DE CLUBES USA LA CAJA DE `CAMPO`, NO UNA PROPIA** (v4.976).
  Mientras no hay distrito, ahí va un aviso —no un campo—, y con su propio
  relleno y su propio borde medía distinto: dos recuadros que comparten línea y
  no coinciden en altura se leen como un descuido, y era lo primero que se veía
  al abrir la sección. Reusando `CAMPO` la altura coincide **por construcción**
  mientras el texto quepa en UNA línea; por eso el aviso se resumió a «Elegí
  primero el distrito.» —el rótulo de arriba y el sitio ya dicen el resto—.
  **Al poner un aviso donde iría un campo, darle la caja del campo.**
- **Y por eso la altura también se MIDE.** Que el texto entre en una línea
  depende del ancho real de la columna y de los estilos ya compilados: no se
  deduce leyendo el archivo. La prueba de navegador compara las dos alturas
  reales, así que alargar el aviso hasta que se parta en dos renglones falla
  antes de publicarse. Verificada a la inversa.

### Quién lo envía: tres parejas y UN solo distrito (v4.977)

- **CADA DATO VA AL LADO DEL QUE SE CONTESTA CON ÉL.** Nombre y apellido con
  el correo —quién es y cómo se le escribe—, el teléfono con el rol —cómo se
  le llama y qué hizo— y el distrito con el club —de dónde viene—. El teléfono
  ocupaba un renglón entero él solo (`sm:col-span-2`) mientras el rol quedaba
  suelto en el siguiente: media tarjeta en blanco y dos preguntas
  desemparejadas. No se quitó ni un campo; lo que cambió es con quién comparte
  línea cada uno.
- **⚠️ EL DISTRITO SE PREGUNTA EN DOS SITIOS Y ES UN SOLO DATO.** `district` es
  el distrito de la ACTIVIDAD y la columna se reutiliza (v4.972): dos columnas
  serían dos verdades sobre el mismo hecho. Aparece junto a los clubes
  participantes y junto al club de quien envía porque en los dos hace falta
  para saber qué clubes ofrecer, pero es el MISMO estado — y por eso cambiarlo
  abajo descarta los clubes de arriba, que es lo correcto: los del distrito
  anterior ya no describen nada.
- **⚠️ Y POR ESO ES UN SOLO CONTROL** (`DistritoField`) **CON UN SOLO
  MANEJADOR** (`cambiarDistrito`). Escritos a mano dos veces, el día que uno
  deje de descartar los clubes el formulario se comportaría distinto según por
  dónde se toque, y eso no lo ve ninguna comprobación — es la lección de la
  casilla de distritos (v4.748) y del selector de pools (v4.877). Una prueba
  cuenta la definición (una), los montajes (dos) y que los dos pasen por el
  mismo manejador.
- **El `id` viaja como prop.** Dos elementos con el mismo id dejan una de las
  dos etiquetas apuntando al control equivocado, y eso no se ve mirando la
  pantalla: se ve con el lector de pantalla o pulsando el rótulo.
- **El descarte se DICE, y sólo cuando hay algo que perder.** Bajo el distrito
  del remitente aparece «cambiarlo descarta los clubes elegidos arriba»
  **únicamente** si hay clubes elegidos: un aviso permanente sería ruido, y uno
  ausente convierte un descarte legítimo en una pérdida silenciosa (la regla de
  `skipped`). El aviso cuelga DEBAJO del campo, no en su lugar, así que no
  desplaza nada — es otra cosa que el hueco de v4.976.
- **El ancho lo pone la rejilla y `min-w-0` va en cada columna con `input`.** Es
  la regla de v4.974 y de v4.975 aplicada a las tres parejas: `CAMPO` ya
  declara `w-full` y una clase de ancho encima pierde la cascada, en silencio.
  Lo fija el mismo guardián que recorre los `` `${CAMPO} …` `` del archivo.
- **⚠️ QUE COMPARTAN RENGLÓN SE MIDE EN UN NAVEGADOR.** Es lo que se pidió
  mirando la pantalla, y una clase de rejilla puede no llegar al CSS (v4.719) o
  llegar y perder la cascada (v4.974): se comparan las cajas reales de las tres
  parejas —a lo ancho y al estrecharse la ventana—, con el CSS compilado
  cargado (v4.851). La prueba de criterio, aparte, fija el orden de los seis
  rótulos y que ninguno vuelva a ocupar el renglón entero; las dos verificadas
  a la inversa.

### La fecha de la actividad es una FECHA — v4.991

Pedido con la pantalla delante: *«la Fecha de la actividad debe ser un campo de
fecha»* y *«cambiar el texto del botón por Registrar Actividad»*.

- **⚠️ CAMBIAR EL CONTROL CAMBIA LO QUE SE GUARDA, Y AHÍ ESTÁ TODO EL TRABAJO.**
  El campo era texto libre y pasa a ser `<input type="date">`, así que lo
  guardado deja de ser «14 de agosto de 2026» y pasa a ser el ISO
  `2026-08-14`. Ese valor **no se queda en la base**: lo pinta la ficha de la
  bandeja y —peor— viaja al brief que consume la IA, que lo copiaría literal
  dentro de un copy institucional. Por eso el cambio de una línea arrastra
  `activityDateLabel`. Al cambiar el TIPO de un control, buscar quién CONSUME
  lo que ese control guarda.
- **⚠️ LO GUARDADO ANTES ES TEXTO LIBRE Y VUELVE TAL CUAL.** Regla aditiva: una
  solicitud de v4.968 dice «la semana pasada» o «14 de agosto», y
  reinterpretarlo sería inventar. `activityDateLabel` sólo actúa sobre lo que
  ES un ISO —cuatro dígitos, dos, dos— y todo lo demás pasa intacto, incluido
  `2026-13-01`: lo imposible se enseña como llegó, no se corrige a la
  callada. El servidor tampoco valida el formato (`str(r.activityDate, 40)`),
  así que un navegador con el bundle anterior sigue enviando y guardando.
- **⚠️ LA FECHA NO SE PARSEA CON `new Date('2026-08-14')`.** Eso es medianoche
  **UTC**, y leído con la zona de Bogotá (UTC-5) devuelve el DÍA ANTERIOR: la
  actividad del 14 se mostraría como el 13. Se arma con las partes de la
  cadena, que es lo único que no depende de la zona del proceso —la función
  corre en UTC—. Lo fija una prueba que la evalúa en cuatro zonas y otra que
  lee el archivo: la primera sola no bastaría, porque cambiar `process.env.TZ`
  con el proceso ya arrancado no siempre mueve el formateador.
- **El criterio está espejado y se compara por SALIDAS.** Lo consumen el
  servidor (el brief y la línea de la tarjeta) y el navegador (la ficha de la
  bandeja): con dos formas de leer la misma fecha, el panel diría una y el copy
  otra.
- **Un campo de fecha IGNORA el `placeholder`**, así que se retiró: dejarlo
  sería prometer un formato de ejemplo que el navegador nunca va a mostrar —lo
  que se ve es el suyo, según el idioma del sistema—.
- **NO se le puso `max` ni validación de fecha futura.** `max` dispara la
  validación nativa del navegador, con su globo y su mensaje, y este formulario
  muestra sus errores en su propio bloque: dos formas de rechazar el mismo
  envío se contradicen. Si alguna vez hace falta, va como AVISO del servidor
  —que no bloquea—, no como una restricción del control.
- **El botón dice «REGISTRAR ACTIVIDAD» y su espera, «REGISTRANDO…».** Los dos
  estados hablan del mismo acto: «ENVIANDO…» debajo de un botón que dice
  registrar se lee como si fueran dos botones distintos. Va en versalitas
  porque es el registro del resto del formulario, no una decisión nueva.
- **⚠️ EL COMENTARIO QUE EXPLICA UNA COMPROBACIÓN PUEDE DEFENDERLA.** La prueba
  del `placeholder` miraba la región alrededor del campo y el comentario que
  explica por qué se retiró nombra la palabra: pasaba en verde con el
  `placeholder` puesto. Se mira la ETIQUETA del `<input>`, y **no se recorta
  con `[^>]*`** —el `=>` del manejador trae un «>» dentro del propio atributo
  y el recorte cierra antes de tiempo—. Verificado a la inversa por las dos
  puntas.
- **El rótulo del botón es el ancla del recorrido en la prueba del orden de los
  bloques**: al cambiarlo hay que cambiarlo ahí, o la prueba falla nombrando un
  bloque que ya no existe. Y la prueba de navegador lo pulsa por su nombre.
- **La fecha NO se escribe tecla por tecla en la prueba de navegador.** Un
  `input[type=date]` interpreta las pulsaciones según el formato del
  navegador; se comprueba que el control SEA de fecha y que lo que viaje al
  servidor sea el ISO.

**Pendientes conocidos:** el formulario público **no tiene freno por IP**, como el
resto de los formularios públicos del sitio; los objetos de staging que ningún
envío llega a reclamar se limpian con una regla de ciclo de vida sobre el
prefijo, no con un barrido propio; **no se le avisa por correo a quien mandó el
material** cuando su aporte se aprueba o se le pide información — el motivo se
guarda y hoy se comunica a mano; y las CONSULTAS que la estructura de v4.972
habilita —participación por distrito y club, actividades ya difundidas, cruce de
publicaciones por `host` para no repetir difusión— **todavía no tienen pantalla**:
los datos están indexados y falta el informe.


## Topes de peso de las evidencias — v4.1242

El cliente pidió quitar el tope de 5 MB por foto: el formulario rechazaba las
fotos de cualquier teléfono actual en máxima calidad («Hay 5 archivo(s) que
superan el peso máximo»).

- **Topes nuevos: 50 MB por foto, 2 GB el video** (`IMAGE_MAX_BYTES` /
  `VIDEO_MAX_BYTES`, en `server/lib/contentSubmissionSpec.js` y su espejo
  `src/lib/contentSubmissionSpec.ts`). Los archivos van DIRECTO del navegador a
  S3 con URL prefirmada: el tope es una regla nuestra, no del borde de Vercel.
  Un PUT único de S3 admite hasta 5 GB.
- **Los mensajes salen de las constantes** (`formatLimit`, `LIMITS_LABEL`):
  hasta v4.1241 el texto decía «5 MB / 300 MB» escrito a mano en tres sitios.
- **El tiempo de espera del PUT crece con el archivo** (~128 KB/s, mínimo
  2 min). Con 90 s / 5 min fijos, un archivo grande por móvil se cortaba.
- **La URL prefirmada dura una hora** (S3 valida la firma al empezar).
- **`readStagingObject`** lee hasta el tope de la foto (antes 30 MB fijos: una
  foto de 40 MB se subía y el artículo no la podía analizar). La descarga
  desde la Biblioteca para el análisis espera hasta 60 s.
- **Los motores de video no reciben la foto pesada**: `normalizePhoto`
  (`server/lib/photoNormalize.js`) reduce la COPIA que se anima a 4096 px de
  lado mayor y JPEG si pasa de 9 MB o de 4096 px (Kling vía KIE rechaza
  imágenes de más de ~10 MB). El original queda intacto en la Biblioteca.
