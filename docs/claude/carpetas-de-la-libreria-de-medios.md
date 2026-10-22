<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Carpetas de la Librería de Medios — v4.738

Cada sitio organiza sus archivos en carpetas propias, con subcarpetas hasta
cinco niveles. Es un eje DISTINTO del que ya existía.

| Archivo | Qué es |
|---|---|
| `server/lib/mediaFolders.js` | El CRITERIO. **Puro**: nombres, profundidad, ciclos, árbol y conteos |
| `server/lib/ensureMediaFolderSchema.js` | Crea `MediaFolder` y la columna `Media."folderId"` en runtime |
| `server/routes/media.js` | CRUD de carpetas, filtro por carpeta y movimiento de archivos |
| `src/lib/mediaFolders.ts` | Espejo del criterio en el navegador |
| `src/pages/admin/MediaLibrary.tsx` | La pantalla: migaja de pan, rejilla de carpetas y mover |
| `src/components/admin/content-studio/MediaPicker.tsx` | Las carpetas como filtro al elegir una imagen |

Pruebas: `npm run test:media` (65 casos). **Sin base, credenciales ni red.**

**Reglas durables:**

- **«Carpeta» ya significaba otra cosa, y las dos conviven.** `GET /media/folders`
  devuelve los CLUBES que el operador de la plataforma recorre; lo nuevo vive en
  `/media/library-folders`. Son dos ejes: aquél es «de quién es el archivo»
  (`sourceType`/`sourceId`) y éste «cómo lo ordenó ese sitio por dentro»
  (`folderId`). Renombrar el viejo dejaría la pantalla del operador rota en
  cualquier navegador con el bundle anterior en caché.
- **Borrar una carpeta NO borra sus archivos.** Suben al padre, y la
  confirmación lo dice con esas palabras. Un archivo de la Biblioteca puede ser
  el logo del club, estar publicado en el sitio o ser el fondo de una plantilla:
  perderlo por ordenar carpetas sería destructivo y nadie lo espera de «eliminar
  carpeta». Lo comprueba `test:media` leyendo el archivo, porque un `DELETE`
  escrito de más ahí no lo ve ninguna otra comprobación.
- **`MediaFolder` vive fuera de Prisma; `Media."folderId"` está declarada EN
  `schema.prisma`.** No es una inconsistencia: el guardián de `db:push` compara
  TABLAS, no columnas, así que una columna que existiera sólo en el ensure la
  borraría el primer `npm run db:push` sin que nada avisara. Misma regla que las
  columnas nuevas de `WhatsAppContact`. `Media` se AMPLÍA con
  `ADD COLUMN IF NOT EXISTS`; jamás se recrea — tiene datos de producción.
- **Sin clave foránea, a propósito.** El destino no es un modelo de Prisma, así
  que una restricción declarada sólo en el ensure sería otra cosa que `db push`
  podría quitar en silencio. La integridad la sostienen el borrado —que sube los
  archivos antes de borrar la fila— y `buildFolderTree`, que muestra en la RAÍZ
  lo que apunte a una carpeta inexistente. Esconderlo lo volvería irrecuperable
  desde la pantalla.
- **Los índices de nombre único son DOS y son parciales.** En Postgres NULL
  nunca es igual a NULL: con un solo índice sobre `(clubId, parentId, name)` las
  carpetas de la raíz —`parentId` NULL— no chocarían nunca entre sí, que es
  justo donde más se repite un nombre. Por ser parciales, un `ON CONFLICT`
  contra ellos tendría que repetir su predicado o la sentencia falla entera
  (error real, v4.648): por eso el alta comprueba el duplicado y devuelve un 409
  redactado en vez de apoyarse en `ON CONFLICT`.
- **El aislamiento va en el WHERE, no en la pantalla.** Toda consulta de
  carpetas lleva `"clubId" IS NOT DISTINCT FROM $n`, y el 404 de una carpeta
  ajena se decide sobre la lista ya acotada: para quien pregunta no existe, que
  además no revela que exista. Lo comprueba `test:media` sobre el archivo.
- **Mover un archivo valida que la carpeta sea del MISMO sitio.** Sin eso, un id
  ajeno lo mandaría a una carpeta que su dueño no ve: desaparecido de su raíz y
  dentro de la de otro.
- **Subir estando dentro de una carpeta deja el archivo AHÍ.** Y lo respetan los
  DOS caminos de subida (`/save` y `/upload`), o subir desde una pantalla u otra
  daría resultados distintos. Si la carpeta pedida no es del sitio se guarda en
  la raíz **sin fallar**: a esa altura el archivo ya está en S3, y perder la fila
  sería peor que guardarlo en el sitio equivocado del árbol.
- **`folderId` tiene TRES estados en el listado y los tres importan.** Sin el
  parámetro no se filtra —es lo que hacían todos los consumidores y lo que
  tienen que seguir haciendo—; `root` es la raíz; un id es esa carpeta. Un solo
  parámetro con dos sentidos («vacío = raíz») dejaría el selector de imágenes
  mostrando sólo lo suelto.
- **El conteo de una carpeta SUBE a sus ancestros** (`withRollupCounts`). Una
  carpeta con dos subcarpetas llenas y nada propio diría «0», y quien mira una
  carpeta cerrada quiere saber si hay algo adentro. El conteo propio se conserva
  aparte para el rótulo de la carpeta abierta.
- **Los ciclos se cortan, no se confía en que no ocurran.** `depthOf` y
  `breadcrumbOf` devuelven `Infinity` / `[]` en vez de girar sin fin, y
  `canMoveFolder` rechaza mover una carpeta dentro de sí misma o de una
  descendiente. Un ciclo no se ve: la carpeta simplemente desaparece del árbol
  porque deja de colgar de la raíz.
- **En el selector de imágenes las carpetas son un FILTRO, no una navegación**, y
  entra sin filtrar: al abrirlo se ven TODAS las imágenes del sitio, dentro y
  fuera de carpetas. Filtrar por la raíz escondería justamente lo que alguien se
  tomó el trabajo de ordenar. Ordenar es la Librería; ahí se viene a encontrar.
- **Una carpeta que sólo tiene subcarpetas NO está vacía.** El cartel de «no hay
  archivos» a pantalla completa decía lo contrario y tapaba lo que sí había.
- **Probar la PANTALLA, no sólo el criterio.** El flujo completo —crear, entrar,
  crear dentro, mover, eliminar— se manejó en Chromium sobre el `dist/` real con
  la API interceptada. Es donde se vio que el nombre del archivo no es texto
  visible en la rejilla y que el aviso de eliminación llega con su recuento.

### Selección múltiple y acciones en bloque (v4.740)

Convertir HEIC de a uno es razonable con tres y deja de serlo con cuarenta.
Junto al filtro de tipos hay un botón «Seleccionar»; con algo marcado aparece
una barra con «Convertir a JPG (N)» y «Eliminar (N)».

- **Van por su propia ruta** (`/media/bulk-convert`, `/media/bulk-delete`), no
  repitiendo la de a uno desde el navegador: con cien archivos serían cien
  peticiones, cien conexiones a la base y cien oportunidades de que una falle a
  medias sin que nadie sepa cuáles quedaron.
- **El aislamiento vive en `ownedMedia`**, el único punto por el que pasan las
  dos: filtra por `clubId` salvo para el operador de la plataforma. Quien manda
  ids ajenos recibe menos filas de las que pidió —y la diferencia se informa—
  en vez de operar sobre lo ajeno.
- **La conversión en bloque tiene PRESUPUESTO DE TIEMPO** y devuelve lo que
  falta (`pending`), igual que el barrido del Creador de Reels. La función corta
  a los 120 s y cada foto tarda 0,3-1 s: una selección grande no entra en una
  sola petición. El navegador vuelve a pedir hasta terminar y muestra el avance.
  Cortar en silencio dejaría al usuario creyendo que terminó.
- **Ese bucle tiene tope de vueltas y detecta el estancamiento.** Si una ronda
  no convierte nada y la cola no baja, se para y se dice — girar sin fin es peor
  que fallar.
- **Un fallo no detiene el lote.** El archivo que falló se informa con su nombre
  y su motivo; los demás no tienen la culpa.
- **El borrado en bloque quita S3 ANTES que la fila**, como el de a uno: al
  revés quedarían objetos que nadie puede ver ni volver a borrar desde el panel.
  Que S3 falle no impide quitarlo de la Librería: el usuario pidió que
  desaparezca de su panel.
- **`DeleteObjects` en lotes de 1000**, no una petición por archivo.
- **La selección se limpia al cambiar de carpeta o de sitio.** Lo seleccionado
  deja de estar a la vista, y actuar sobre archivos que no se ven es exactamente
  cómo alguien borra lo que no quería borrar.
- **Convertir sólo se ofrece si hay HEIC en la selección**, y el botón cuenta
  ESOS, no todos los marcados: un botón que no va a hacer nada es peor que no
  tenerlo.
- **Las etiquetas accesibles llevan el nombre del archivo** («Seleccionar:
  IMG_0001.HEIC»). Con la rejilla llena, «Seleccionar» a secas se repite en cada
  baldosa y no se distinguen. Lo destapó la prueba de navegador, que no podía
  resolver a cuál de los siete botones apuntaba.
- **Con una selección en curso, pulsar la baldosa marca en vez de abrir la
  ficha.** Quien está eligiendo varios espera seguir eligiendo.

### Miniaturas de las rejillas (v4.786)

Cada imagen tiene una variante WebP de ~400 px (`Media."thumbUrl"`) que es la
que pintan las rejillas; el original sólo se descarga al verlo en detalle o al
usarlo para generar.

- **El defecto que esto corrige no era el lazy loading.** La ventana de 60
  tarjetas, el `IntersectionObserver` y `loading="lazy"` ya existían; el
  problema era el PESO: cada tarjeta cargaba el archivo original (2-8 MB) para
  pintarse a 200 px — la primera pantalla del selector eran ~180 MB y las
  tarjetas se llenaban de a una. Al diagnosticar una rejilla lenta, mirar
  primero QUÉ pesa cada imagen, no cuándo se pide.
- **El criterio vive en `mediaThumbs.js` (puro)**: SVG no (escala solo), GIF no
  (la miniatura congelaría la animación), HEIC no (su camino es la conversión
  de v4.739 y el JPEG resultante sí pasa). La clave vive en la carpeta hermana
  `thumbs/` para poder regenerarla con una regla de ciclo de vida sin tocar
  originales.
- **La miniatura NUNCA tumba la subida**: `tryMakeThumb` atrapa todo y
  devuelve null — la fila queda sin miniatura y la rejilla usa el original,
  que es exactamente lo que había antes.
- **El backfill distingue pendiente de descartado**: un archivo que no se pudo
  miniaturizar se marca con cadena VACÍA para no reintentarlo en cada pasada
  para siempre. Tandas con presupuesto de tiempo (patrón `bulk-convert`),
  disparadas al abrir la Biblioteca con tope de vueltas.
- **La paginación de `GET /media` es ADITIVA**: sin `limit` responde como
  siempre (array completo — nueve pantallas la consumen); con `limit` acota y
  avisa si hay más por la cabecera `X-Media-Has-More`, pidiendo una fila de
  más en vez de pagar un COUNT. El selector pide tandas de 200.
- **⚠️ EL NODO QUE OBSERVA EL SCROLL INFINITO VIVE EN ESTADO, NO EN UN
  `useRef`** (v4.903). El selector queda SIEMPRE montado con `isOpen` en falso
  —así lo usan todas sus pantallas— y al REABRIRLO con los mismos filtros
  todos los deps del efecto del observador quedaban idénticos (misma página,
  mismos 200, mismo `hasMore`): el efecto no volvía a correr y el
  IntersectionObserver seguía mirando el centinela DESMONTADO de la apertura
  anterior — «Mostrar más · quedan 141» con el spinner girando y el scroll
  muerto, sin un solo error (reporte con captura). Con el nodo en estado
  (`ref={setNodoCentinela}`), cada remontaje del centinela —reabrir, el
  parpadeo de carga, un filtro— cambia el dep y el observador se re-engancha
  al nodo VIVO. Un montaje fresco no lo reproduce jamás: el arnés tiene que
  recorrer el ciclo real abrir → cerrar → reabrir, y con el CSS compilado
  (v4.851). Y **el avance es UNO** (`avanzar`), lo dispare el observador o el
  botón: el botón manual sólo movía la ventana local y nunca pedía la tanda
  siguiente al servidor — al agotar las 200 decía «quedan 1» para siempre.
  Reabrir vuelve a la primera tanda: es otra visita, no la continuación.
- Pruebas: `npm run test:media:thumbs` (27 casos; la generación usa sharp y se
  salta si no está) y `npm run test:media:picker` (10 comprobaciones en un
  navegador con el CSS compilado; pide `playwright`, `esbuild` y `dist/` y se
  salta solo — verificada a la inversa: con el código anterior fallan 6).

### Recorte de videos (v4.934; ENOSPC v4.935; grandes DENTRO de S3 v4.936)

La ficha de un video ofrece «Recortar video»: se elige el rango a CONSERVAR y
el sistema elimina lo demás, **sin cambiar el enlace público**.

| Archivo | Qué es |
|---|---|
| `server/lib/videoTrim.js` | El CRITERIO. **Puro**: rango válido, contenedores, argumentos de ffmpeg, puerta de validación, clave de la copia, presupuesto, estado del proceso y auditoría |
| `server/lib/mp4Trim.js` | La CIRUGÍA. **Pura** (I/O inyectada): reescribe el índice `moov` truncado y devuelve el plan bytes+rangos del archivo nuevo |
| `POST /media/:id/trim` / `POST /media/:id/restore-trim` | La orquestación, en `media.js` |
| `VideoTrimModal` en `MediaLibrary.tsx` | El modal: reproductor, línea de tiempo, inicio/final, vista previa |

Pruebas: `npm run test:video-trim` (100 casos, **sin base, credenciales ni
red**) y `npm run test:mp4-trim` (30 casos con MP4s REALES generados por el
ffmpeg empaquetado: plan, ensamblado y el resultado DECODIFICADO entero).

- **⚠️ LA URL NO CAMBIA PORQUE SE SOBRESCRIBE LA MISMA CLAVE DE S3.** La URL
  pública de un `Media` se deriva de `s3Key`: el recorte se procesa a un
  temporal, se VALIDA y recién entonces se sube AL MISMO key. Mismo `media_id`,
  misma carpeta, mismas relaciones — todo enlace ya usado en campañas pasa a
  servir la versión recortada. No hay CDN delante (la URL es la del bucket),
  así que el contenido nuevo se sirve en cuanto la escritura confirma; un
  navegador con el video en caché lo revalida por ETag/Last-Modified, y la
  vista previa del panel se refresca con un parámetro derivado de `appliedAt`
  que S3 ignora — **la URL copiable no se toca**.
- **⚠️ EL ORIGINAL NO SE REEMPLAZA HASTA QUE EL RESULTADO VALIDA.** La puerta
  es `validateTrimmedFile` sobre `probeMp4` (el lector del Generador de
  Outros): cabecera `moov`, no truncado, pista de video y duración dentro de
  tolerancia — POR MODO: el corte limpio termina en el límite de
  paquete/keyframe (hasta un GOP corto), el recodificado corta exacto. Si
  ningún intento valida, no se tocó ni S3 ni la base, y el motivo va textual.
- **⚠️ EL ORIGINAL NO PISA `/tmp` NI LA MEMORIA: FFMPEG LEE DE LA URL**
  (v4.935). El primer recorte real —una grabación de Zoom de 2:20:50— murió
  con ENOSPC: la ruta bajaba el original entero al `/tmp` de 512 MB antes de
  recortar. El binario de `ffmpeg-static` trae `http/https/tls` (comprobado
  con `-protocols` y de punta a punta contra un servidor con rangos), así que
  la entrada es la URL pública de S3 y al temporal sólo va el RESULTADO. La
  duración de referencia viene del REPRODUCTOR (`durationSec` en el cuerpo) —
  no se descarga el archivo para medirla; la puerta que protege sigue siendo
  la validación del resultado—. Queda un respaldo que baja el original en
  STREAMING (`streamS3ToFile`, nunca bufferizado) sólo si ffmpeg no pudo ni
  ejecutar sobre la URL Y el original también entra en presupuesto.
- **⚠️ EL PRESUPUESTO DE `/tmp` ESTÁ DECLARADO Y SE COMPRUEBA ANTES DE
  PROCESAR** (`trimBudget`, 450 MB por defecto, `VIDEO_TRIM_TMP_BUDGET_MB`).
  Lo que no entra se rechaza en un 413 **con los números a la vista** — un
  ENOSPC críptico a mitad de proceso es el defecto que esto reemplaza. Y
  **`+faststart` cuesta una SEGUNDA copia transitoria del resultado** (ffmpeg
  reescribe el archivo para mover la cabecera): sólo se pide cuando el doble
  entra; sin él, el video se sigue reproduciendo en streaming — S3 sirve
  rangos y el navegador busca la cabecera solo. La salida de un intento
  fallido se borra antes del siguiente, para no acumular en `/tmp`.
- **⚠️ UN VIDEO GRANDE SE RECORTA DENTRO DE S3, no «con más disco»** (v4.936).
  El `/tmp` de 512 MB de la función no es configurable, así que ningún camino
  que pase el RESULTADO por la función escala. Cuando el presupuesto reprueba
  y el corte es del FINAL de un MP4/MOV, `mp4Trim.js` reescribe SOLO el índice
  (`moov`, unos MB, leído por rangos) y el cuerpo viaja de objeto a objeto con
  `UploadPartCopy` — por la función pasan cabeceras, nunca los bytes del
  video. El techo pasa a ser `S3_TRIM_MAX_BYTES` (~4,5 GB, el límite de un
  CopyObject de una operación). El CAMINO SE ELIGE SOLO: chico → ffmpeg
  local; grande+final → S3; grande+mover-el-inicio → rechazo honesto con la
  salida (recodificar no escala en serverless). Al tocar el router, conservar
  esa autoselección — el usuario no elige el modo.
- **⚠️ LA CIRUGÍA SE NIEGA ANTES QUE ADIVINAR.** MP4 fragmentado, cifrado,
  varios `mdat`, `stz2`, edit lists de varios segmentos → bail con el motivo:
  un contenedor corrupto servido en el enlace de una campaña es el peor
  resultado posible. Lo opcional (sgpd/sbgp/sdtp…) se trunca o descarta y se
  ANOTA. El ensamblado va a una clave TEMPORAL (`pretrim/tmp-…`) y ffmpeg lo
  DECODIFICA de verdad —inicio y final, leyendo de la URL— y compara su
  duración y su tamaño byte a byte ANTES del respaldo y del reemplazo. Los
  offsets de `stco/co64` se desplazan por el delta del prefijo (dos pasadas:
  los VALORES no cambian ninguna longitud); probado en los dos layouts, moov
  al frente y al final.
- **La estimación es POR MODO** (v4.936 — el «659 MB» reportado venía de
  aplicar el factor de recodificación a un corte limpio): copy ×1,03,
  reencode ×1,15. Sin estimación no hay ruteo; con una inflada, un video que
  entraba iba al camino equivocado.
- **El proceso SE VE y SE RECLAMA** (`trim.processing`, caduca a los 10 min).
  El reclamo va ANTES del trabajo —dos clics simultáneos no procesan dos
  veces (409)— y TODO final de intento lo suelta: éxito (`appliedTrim`),
  fallo (`failedTrim`, con el motivo en `trim.lastError`, visible en la
  ficha) y excepción. La baldosa dice «Recortando…», el modal cuenta segundos
  REALES (nunca un porcentaje inventado, v4.756) y el proceso continúa en el
  servidor aunque se cierre la ventana.
- **Inicio en 0 → corte LIMPIO primero** (`-c copy`: cero pérdida de
  generación, segundos en vez de minutos), recodificación de respaldo.
  **Inicio > 0 → sólo recodificación**: con copy, el corte de entrada salta al
  keyframe anterior y el video arranca donde no se pidió. La recodificación es
  H.264+AAC+yuv420p **sin filtros** —resolución, orientación y fps quedan los
  del original— y `+faststart` cuando entra en presupuesto, que es lo que hace
  que un enlace compartido arranque sin descargarse entero. **Recodificar
  corre ~en tiempo real sobre la vCPU**: un resultado de más de
  `REENCODE_MAX_SEC` (10 min) se rechaza con la salida a mano — quitar sólo el
  final es remuxado y no tiene tope.
- **La copia de seguridad va ANTES del reemplazo**, a la carpeta hermana
  `pretrim/` (patrón `thumbs/`): clave DETERMINISTA — un segundo recorte la
  sobrescribe con la versión inmediatamente anterior, que es la única que se
  promete conservar. «Restaurar versión original» la copia de vuelta a la
  clave principal y la retira. **El borrado del archivo se lleva también la
  copia**, en los DOS caminos de borrado — dejarla sería un objeto que nadie
  puede ver ni volver a borrar desde el panel (la regla de `originalS3Key`).
- **`Media."trim"` es JSONB, declarada en `schema.prisma` Y en el ensure**
  (regla de `folderId`: el guardián de db:push compara tablas, no columnas), y
  **enumerada en el atajo del ensure** — la trampa de v4.908, fijada por una
  prueba. Guarda `current` (lo restaurable) y `log` (auditoría con tope:
  quién, cuándo, rango, duraciones y tamaños antes y después; corregir es
  agregar una entrada, nunca editar una).
- **FFmpeg es el MISMO runner del Creador de Reels**: `runFfmpeg` y
  `withTempDir` se EXPORTARON de `reelFfmpeg.js` en vez de escribir un segundo
  spawn — dos caminos hacia el binario se separan en silencio (la regla de
  `sendCampaign`). Una prueba comprueba que `media.js` no tenga ningún
  `spawn(`.
- **WebM sólo se recorta desde el principio** (quitar el final): el binario
  empaquetado recodifica VP9 demasiado lento para el presupuesto de la
  función, y `probeMp4` no lee ese contenedor — su validación por tamaño se
  DECLARA débil (`weak`), no se finge. Formatos completos: MP4, M4V, MOV.
  Cualquier otro se rechaza con su motivo.
- **No contradice la regla #1 del sitio**: aquélla prohíbe retocar el output
  de un motor GENERATIVO. Acá no hay modelo — es edición DECLARADA que pide
  una persona sobre su propio archivo, como el montaje del Creador de Reels.
- **Mismo gate que convertir y eliminar**: sesión + propiedad del sitio,
  comprobado en el servidor. La pantalla del panel es quien ofrece el botón;
  esconderlo no protege nada (v4.868), por eso la ruta repite el gate.
- **Videos sin miniatura**: `shouldThumbnail` los excluye desde siempre, así
  que no hay thumb que regenerar tras el recorte.

### Canal público de Capacitaciones (v4.954)

Una carpeta de la Biblioteca se convierte en un canal público de videos —
`/capacitaciones` y `/capacitaciones/:slug`— estilo Learning Hub. Criterio puro
en `trainingChannelSpec.js`, tablas runtime en `ensureTrainingChannelSchema.js`
(`MediaChannel`, `MediaChannelVideo`, `MediaChannelComment`,
`MediaChannelProgress`, `MediaChannelMetric` — en la lista del guardián),
orquestación en `trainingChannelController.js`, rutas en `routes/trainings.js`
(`/api/trainings`), páginas `Capacitaciones.tsx` / `CapacitacionDetalle.tsx`,
espejo mínimo `src/lib/trainingChannel.ts`, administración en
`ChannelAdminPanel.tsx` DENTRO de la Biblioteca. Pruebas:
`npm run test:training` (68 casos, sin base ni red, claves verificadas a la
inversa).

- **⚠️ EL ARCHIVO NO SE TOCA Y LOS ENLACES VIEJOS NO SE ROMPEN.** La
  capacitación LÓGICA es una fila de `MediaChannelVideo` que REFERENCIA a
  `Media` (`mediaId`): nada se mueve, nada se duplica, `Media` no gana ni una
  columna, y la URL directa de S3 sigue sirviendo el mismo objeto. Comentarios
  y progreso cuelgan de la ficha lógica — un recorte del archivo (v4.934) no
  se lleva la conversación.
- **⚠️ ESTO NO ES DRM, Y SE DICE.** Cero enlaces rotos exige que los objetos
  de S3 sigan siendo públicos, así que el control de acceso es DE LA
  PLATAFORMA: la página, el reproductor, el veredicto del servidor
  (`/public/watch` — la URL sólo viaja con veredicto favorable) y las
  métricas. Quien tenga la URL cruda descarga el archivo. No afirmar
  protección de objeto que no existe; el candado gobierna la EXPERIENCIA.
- **EL VEREDICTO ES UNO Y ES DEL SERVIDOR** (`accessVerdict`): publico /
  preview / autenticados / roles / privado, catálogo CERRADO. La vista previa
  es un TOPE DE POSICIÓN (los primeros N segundos), no un presupuesto:
  refrescar repite el mismo fragmento, nunca regala segundos — y el servidor
  acota también la posición que el anónimo puede reportar. `roles` con lista
  vacía equivale a `autenticados`: exigir un rol de una lista vacía dejaría el
  video inalcanzable sin que nadie lo decidiera.
- **NO HAY SEGUNDO SISTEMA DE USUARIOS NI DE ROLES.** «Crear cuenta» del
  candado reutiliza `ensureAttendeeAccount` + `issueAttendeeSession` (v4.655);
  los roles del espectador se DERIVAN de las tres identidades reales
  (`REALM_ROLES`) y se ACUMULAN (v4.711). Las reglas futuras (inscrito, pagó,
  distrito) entran como etiquetas del catálogo `VIEWER_ROLES`, no como otro
  motor. El espectador viaja en cabeceras (`x-viewer-tokens`, verificados con
  firma y audiencia; `x-anon-id`, un UUID de localStorage sin fingerprinting).
- **Tras el ingreso se reanuda SIN recargar**: `onLoginSuccess` → re-veredicto
  → seek al segundo del candado → play. El alta guarda el token en
  `TOKEN_KEY.attendee` y `emitSessionChange()` avisa al encabezado.
- **`Number(null)` es 0 — dos veces la misma trampa en un solo módulo.** Un
  `previewSec` null significa «hereda del canal» y un `sortOrder` null «sin
  orden manual»: leídos con `Number()` se vuelven 0 («sin vista previa» y
  «primero en la lista»). `toInt` devuelve null para ausente; y en el orden de
  comentarios, `Number(pinned)` con `pinned` ausente da NaN y el NaN se traga
  la prioridad del fijado — `Boolean()` antes de `Number()`.
- **La completitud la escribe el SERVIDOR** (`applyProgress`): el delta de un
  latido se acota (≤60 s — un reporte inflado no regala completitudes), lo
  completado no se des-completa, y el anónimo no completa jamás (umbral
  imposible). Las conversiones (`signup_from_lock`, `completion`, `comment`,
  `watch_seconds`) las escribe el servidor; el navegador sólo reporta las de
  vista y el candado (`CLIENT_METRIC_TYPES`), con freno en memoria (v4.808).
- **Métricas como contadores DIARIOS agregados** (patrón
  `ContributionCampaignMetric`): `videoId` es `''` para eventos del canal —
  NOT NULL a propósito para que el índice único no sea parcial (v4.648). Los
  únicos salen de `MediaChannelProgress` (`viewerKey` = `realm:id` o
  `anon:<uuid>`), que además sirve para reanudar y para que la vista previa
  del anónimo quede anotada (`lockedAtSec`).
- **El `<head>` del canal y de cada video se resuelve en el SERVIDOR** — hook
  en `seoServe.js` (patrón `campaignSeoFor`), y `notFound` convierte un slug
  muerto en **404 real**, no un soft 404. `/capacitaciones` NO está en
  `STATIC_ROUTES` a propósito: cientos de sitios sin canal listarían una
  página vacía en su sitemap.
- **La administración vive DENTRO de la Biblioteca** («Administrar canal» en
  la carpeta): sin CMS aparte. «Copiar enlace de capacitación» (la PÁGINA)
  convive con el de la URL directa, que no cambia. Sólo `publicado` sale al
  público; borrador/oculto/archivado existen para preparar y retirar sin
  borrar. Un slug ocupado se libera con sufijo y SE AVISA (v4.873).
- **Toda lectura pública DEGRADA** — corre en páginas públicas; el canal caído
  devuelve `{channel: null}` y la página lo dice, nunca un 500 al visitante.
- **La cabecera y el fondo salen de las fuentes COMPARTIDAS** (v4.957):
  `PAGE_HEADER_BACKGROUND` de `pageHeader.ts` (v4.613) y `bg-rotary-concrete`
  — las mismas de eventos, postulación y Contacto. Un azul o un gris propios
  se separan del sitio en silencio; lo fija una prueba.
- **Streaming**: el `<video>` del navegador contra la URL pública de S3, que
  sirve rangos — sin HLS. Recomendación técnica dejada escrita: si algún día
  hacen falta calidades adaptativas o protección real del contenido, el paso
  es HLS con URLs firmadas por segmento (otro almacenamiento de objetos
  privados), no parchear este camino.
- **La miniatura por FOTOGRAMA la extrae el SERVIDOR** (v4.956,
  `extractVideoFrame`): dibujar un video de S3 en un canvas del navegador lo
  deja «tainted» y `toBlob` lanza (la lección del proxy de Plantillas IA).
  ffmpeg lee de la URL con `-ss` ANTES de `-i` (rangos HTTP — viable con dos
  horas de video, v4.935), sharp acota a 1280 px, y el JPEG sube con
  `getUploadDeps`/`publicUrlFor` EXPORTADOS de `routes/media.js` — ningún
  segundo cliente de S3. El archivo se resuelve por la FICHA del sitio
  (`WHERE c."clubId"`), nunca por una URL del navegador.
- **«Me gusta» es un CONMUTADOR por espectador** (v4.956, `likedAt` en
  `MediaChannelProgress` — enumerada en `OWNED_COLUMNS` del atajo del ensure,
  la trampa v4.908 tiene ahora guardia de prueba generalizada): volver a
  pulsar la quita, el contador es `COUNT(likedAt IS NOT NULL)`, y lleva el
  freno en memoria. `share` entró a los DOS catálogos de métricas (el
  navegador puede reportarlo). La fila del canal en la página del video dice
  «N capacitaciones» — no hay suscriptores y no se inventa el número.

**Pendientes conocidos:** los videos no entran al sitemap (el canal tampoco —
ver arriba); los reportes con filtros finos (fecha/país/distrito/club) quedan
para una vuelta siguiente — hoy el panel agrega por video—; las reglas de
acceso por evento/pago están preparadas como arquitectura (roles) y no
activadas; y el formulario público de signup no tiene freno por IP, como el
resto de los formularios públicos del sitio.

### Fotos de iPhone: HEIC → JPEG (v4.739)

Una foto subida en `.heic` aparecía como un recuadro roto. No era un fallo de la
Librería: **ningún navegador salvo Safari dibuja HEIC**, así que tampoco se
habría visto en el sitio publicado ni en un post.

| Archivo | Qué es |
|---|---|
| `server/lib/heicImages.js` | Detección, orientación y conversión |
| `src/lib/heicImages.ts` | Espejo: sólo la DETECCIÓN |
| `server/routes/media.js` | Convierte en las subidas y en `POST /media/:id/convert` |

Pruebas: `npm run test:heic` (50 casos). **Sin base, credenciales ni red.**

- **Sharp NO decodifica HEIC.** Declara el formato `heif` y LEE el contenedor
  —da ancho, alto y orientación—, pero sus binarios precompilados **no traen el
  decodificador HEVC**, que es con el que comprime un iPhone. Medido con seis
  HEIC reales: `metadata()` responde y `.jpeg()` falla en todos. Esa lectura del
  contenedor sigue siendo útil: es de donde salen las medidas contra las que se
  contrasta lo decodificado.
- **FFmpeg TAMPOCO sirve, y por qué importa** (v4.741). Decodifica HEVC, pero un
  HEIC de iPhone guarda la foto como una **rejilla de mosaicos** (`Tile Grid`)
  más imágenes auxiliares: la miniatura y el **mapa de ganancia HDR**. FFmpeg
  7.0 —el binario que empaquetamos— expone la rejilla como «stream group» y **no
  la ensambla**, así que la selección automática terminaba eligiendo un mosaico
  suelto o el mapa de ganancia. El mapa de ganancia es una imagen en escala de
  grises, casi negra con manchas blancas: exactamente lo que apareció en la
  Librería del cliente después de convertir en bloque. El soporte de rejillas
  llegó en ffmpeg 7.1. **No volver a intentarlo con ffmpeg sin comprobar la
  versión y la rejilla.**
- **Se usa libheif** (`heic-decode`), la implementación de referencia del
  formato: reconstruye la rejilla y distingue la imagen primaria de las
  auxiliares. Pesa 6,2 MB —holgado en el tope de 250 MB— y el `wasm-bundle` es
  un único JS con el WASM incrustado, así que no hay un `.wasm` suelto que el
  empaquetador pueda perder. Trae el decodificador HEVC y **no** el de AV1.
- **La imagen se elige por TAMAÑO, no por posición** (`pickPrimaryImage`).
  `heic-decode` devuelve la lista y toma `data[0]`, que suele ser la primaria
  pero no lo garantiza: es la misma suposición que hizo fallar a ffmpeg. Se
  elige la que coincide con lo que declara el contenedor, admitiendo el
  intercambio ancho/alto por si la rotación ya se aplicó.
- **Y se COMPRUEBA lo decodificado antes de aceptarlo** (`checkDecodedSize`).
  Decodificar sin mirar lo que salió fue el error de fondo: el mapa de ganancia
  tiene otro tamaño que la foto, así que la comprobación lo habría atrapado
  antes de que reemplazara al original. Las dos funciones son PURAS y están
  probadas con el caso real del iPhone (foto 4032×3024, miniatura 320×240, mapa
  1008×756).
- **La orientación se APLICA, no se declara** (`orientationOps`). FFmpeg entrega
  los píxeles sin los metadatos, así que la rotación se perdería. Se podría
  volver a etiquetar el JPEG, pero la plataforma dibuja imágenes en canvas en
  varios sitios (Pendones, Plantillas IA) donde el EXIF no se respeta igual: se
  hornea una vez. `-noautorotate` en ffmpeg para que la rotación ocurra en UN
  solo lugar.
- **Las orientaciones 5 y 7 no se deducen: se miden.** Espejando primero, les
  toca la rotación CONTRARIA a la de su pareja no espejada —5 lleva 270 y 7
  lleva 90—. Estaban al revés en la primera versión y ninguna otra comprobación
  lo habría visto. `test:heic` compara las ocho contra la rotación automática de
  sharp, que es la implementación de referencia del EXIF.
- **Esa comparación usa PNG como portador, no JPEG.** Con JPEG hay que comparar
  con tolerancia —los bordes duros del patrón dan diferencias de ±64 hasta en la
  orientación 1, que no gira nada— y una tolerancia así deja pasar errores de
  geometría reales. PNG lleva la etiqueta EXIF, sharp la respeta, y los píxeles
  se comparan EXACTOS.
- **La detección mira el MIME Y la extensión.** Al elegir un `.heic`, varios
  navegadores mandan el tipo vacío o `application/octet-stream`: fiarse sólo del
  MIME dejaría fuera justamente el caso del iPhone. Por lo mismo `getMediaType`
  lo clasifica como `image`; si cayera en `document` no aparecería ni en el
  filtro de imágenes.
- **Los DOS caminos de subida convierten.** En `/upload` el servidor tiene los
  bytes y convierte antes de subir nada. En `/save` el archivo YA está en S3
  —lo subió el navegador con una URL prefirmada—, así que se BAJA, se convierte
  y se sube el JPEG. Da una vuelta de más y es lo que evita el tope de 4,5 MB
  del cuerpo de una función en Vercel: una foto de iPhone pesa 2-5 MB y mandarla
  por el cuerpo fallaría con las más grandes.
- **Una conversión fallida NO pierde el archivo.** Se guarda el original y se
  informa: no poder mostrarlo es malo, perderlo es peor.
- **EL ORIGINAL NO SE BORRA** (v4.741, `Media."originalS3Key"`). Es la
  corrección más importante de este módulo y se pagó cara: hasta v4.740 el HEIC
  se retiraba en cuanto el JPEG estaba arriba, y como la conversión entregaba el
  mapa de ganancia, **el cliente perdió fotos que no se pueden recuperar**. Una
  conversión no puede ser destructiva mientras exista la posibilidad de que
  salga mal, y siempre existe. Guardar su clave evita además el objeto huérfano:
  al eliminar el archivo de la Librería se borran los dos, en los dos caminos de
  borrado.
- **La columna va declarada en `schema.prisma` además del ensure**, como
  `folderId`: el guardián de `db:push` compara tablas, no columnas.
- **El navegador NO convierte.** Un decodificador WASM son megabytes en el
  bundle para adivinar lo que el servidor ya sabe. Lo único que hace el
  navegador es RECONOCER un HEIC: para saltear `compressImage` —que dibuja en un
  canvas y no puede decodificarlo— y para pintar el aviso en vez de un `<img>`
  roto.
- **Un HEIC ya cargado se explica y se ofrece arreglar**, no se esconde. La
  conversión al subir sólo alcanza a lo que venga después, y el defecto
  reportado es sobre archivos que ya están.
- **Probar el flujo en un navegador.** Verificado en Chromium sobre el `dist/`
  real con la conversión de verdad detrás del endpoint: la foto pasa de aviso
  HEIC a imagen dibujada, y se comprueba el `naturalWidth` para saber que el
  navegador la decodificó y no que sólo cambió el `src`.
- **La prueba de punta a punta es OPCIONAL y ése es el hueco conocido.** Hace
  falta un HEIC HEVC de verdad y no se puede fabricar en el repositorio: sharp
  sólo escribe HEIF con AV1 y el libheif empaquetado no decodifica AV1; los
  archivos de conformidad no tienen licencia clara para vendorizarlos. Se corre
  apuntando a una carpeta con fotos reales:
  `HEIC_FIXTURES=~/fotos npm run test:heic`. Verificado así en v4.741 con 19
  archivos: 18 convertidos con contenido y 1 rechazado por estar malformado
  —fallar es lo correcto—. **Lo que sí está cubierto sin archivos** es la lógica
  que falló: `pickPrimaryImage` y `checkDecodedSize` son puras y se prueban con
  las medidas reales de un HEIC de iPhone.
- **La prueba con archivos reales mira que no sea gris y casi negro.** Es la
  firma del mapa de ganancia, y es lo que hay que reconocer si esto reaparece.

### Casillas de imagen del panel (v4.700)

**Toda casilla de imagen ofrece SIEMPRE dos vías**: subir un archivo nuevo o
elegir uno ya cargado en la Biblioteca Multimedia. Al agregar una casilla nueva,
usar `src/components/admin/ImageSourceOverlay.tsx` y un `MediaPicker` con
`maxSelection={1}` — no volver a poner sólo el `<input type="file">`.

- **La SUBIDA vive en un solo sitio** (v4.784, `src/lib/mediaUpload.ts`). Hasta
  v4.783 existía únicamente dentro de `MediaLibrary.tsx`, con sus tres pasos
  —`presigned-url` → `PUT` a S3 → `save`— y su manejo de HEIC escritos ahí. Por
  eso el Creador de Reels no podía cumplir la regla de arriba sin copiarlos, y
  dos caminos hacia S3 se separan en silencio: es el problema que `sendCampaign`
  arrastra en el CRM. Al agregar una subida, usar `uploadMediaFiles`.
- **Los tres pasos no son ceremonia.** El `PUT` directo a S3 es lo que evita el
  tope de ~4,5 MB del cuerpo de una función en Vercel —una foto de móvil pesa
  2-5 MB—, y el `save` es lo que crea la fila en `Media`: sin él el objeto queda
  en S3 sin fila, invisible en el panel e imposible de volver a elegir.
- **Se usa lo que devuelve `/media/save`, NO lo que se mandó.** Con un HEIC el
  servidor lo baja, lo convierte y guarda la fila con OTRO nombre y OTRA URL
  (v4.739-741). Quedarse con los enviados deja una tarjeta apuntando al `.heic`
  original, que ningún navegador salvo Safari dibuja: el usuario sube su foto y
  ve un recuadro roto.
- **Una conversión de HEIC fallida se REPORTA, no se entrega.** El servidor lo
  dice en `conversion.error`; callarlo daría una foto que no se ve y sin motivo.
- **El sitio no se manda desde el navegador**: los dos endpoints lo resuelven
  desde el token y, para un administrador de sitio, ignoran lo que llegue.
  Mandarlo daría dos fuentes para el mismo dato y sólo una manda.
- **Un fallo no cancela la tanda**, y se informa con el NOMBRE del archivo:
  «falló una de tres» sin decir cuál obliga a adivinar qué reintentar.
- **El `<input type="file">` se limpia tras cada elección** (`e.target.value =
  ''`). Sin eso, volver a elegir el MISMO archivo no dispara `change` —el valor
  no cambió— y el botón parece roto justo cuando alguien reintenta tras un fallo.
- **`MediaPicker` todavía NO tiene subida propia**, y lo usan nueve pantallas.
  Agregársela es lo que daría la segunda vía a todas de una vez; hoy cada una
  que la necesite pone su botón junto al de elegir, como el Creador de Reels.
- Pruebas: `npm run test:media:upload` (21 casos, navegador con la API
  interceptada). Comprueba el ORDEN de los tres pasos y que la pantalla no
  repita el `fetch` a `presigned-url` — buscando la LLAMADA, no la mención, para
  que un comentario pueda nombrar el endpoint sin hacer fallar la prueba.

- **Por qué importa**: sin la segunda vía, reutilizar un logo que ya estaba en la
  Biblioteca obligaba a descargarlo del sitio y resubirlo, y quedaba duplicado
  con otro nombre y otra dirección. Es justo lo que pasa con los logos, que se
  cargan una vez y se reutilizan en varios sitios.
- **Un solo `MediaPicker` por pantalla**, no uno por casilla: `pickerField`
  guarda a qué campo se escribe lo elegido.
- `MediaPicker` vive en `content-studio/` por historia, pero es genérico y lo
  usan también Configuración → Identidad y el Generador de Outros.
- **Con `maxSelection === 1` la selección se SUSTITUYE**, no se rechaza. Avisar
  «máximo 1 imagen» obligaba a deseleccionar antes de poder cambiar de opinión.
