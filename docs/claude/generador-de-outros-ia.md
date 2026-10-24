<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Generador de Outros IA — v4.647

Cierres audiovisuales de ~5 s a partir de una imagen fija. Pestaña propia en
Content Studio (`src/components/admin/content-studio/OutroGenerator.tsx`),
controlador en `server/controllers/outroController.js`, y tres piezas de apoyo:

| Archivo | Qué es |
|---|---|
| `server/lib/outroSpec.js` | Fuente de verdad: formatos, motores, estilos, voces, presupuesto de locución y construcción del prompt |
| `server/lib/outroQuality.js` | Parser de contenedor MP4 + validación + inspección de la imagen de origen |
| `server/lib/ensureOutroSchema.js` | Crea `OutroProject` en runtime (`CREATE TABLE IF NOT EXISTS`) |
| `src/lib/outroSpec.ts` | Espejo mínimo en el navegador: sólo el presupuesto de palabras |

**Reglas durables:**

- **No se postprocesa el archivo.** Misma regla que el Generador de
  Publicaciones y por el mismo motivo: lo que devuelve el modelo se sube a S3
  tal cual. Nada de recortar para llegar a un formato, recomprimir ni pegar
  nada encima. Las mediciones de calidad son **lectura**; jamás modifican el
  archivo. Si un motor no genera en el formato pedido, se cambia el formato y
  se avisa (`resolveEngine` devuelve `notes`), no se recorta el resultado.
- **El outro nunca vuelve a pasar por la IA.** En el Creador de Video viaja en
  `config.outro`, aparte de `images`. Si se lo mandan al motor, pierde la
  duración, la resolución y la voz que lo hacían servible.
- **El flujo es asíncrono a propósito.** Un job de video en KIE tarda 1-3
  minutos y la función corta a los 120 s (`vercel.json`). `POST /outros`
  responde apenas crea la tarea; `GET /outros/:id/sync` es el que, cuando KIE
  termina, descarga el archivo, lo mide y lo sube a nuestro bucket. El webhook
  (`/api/content-studio/webhook`, compartido con el Creador de Video) es la
  segunda vía. Ese `sync` toma la fila con un UPDATE condicional: dos sondeos
  simultáneos no pueden subir el archivo dos veces.
- **La URL de KIE es efímera**: por eso se copia a S3 (`clubs/{id}/outros/`) en
  cuanto está lista, aunque el usuario todavía no la haya aprobado. Guardar en
  la **Biblioteca** es otra cosa: crea la fila en `Media` y es una acción
  explícita del usuario.
- **Los ids de los modelos de KIE son configurables por entorno**
  (`KIE_OUTRO_MODEL_SILENT`, `KIE_OUTRO_MODEL_AUDIO`). KIE renombra modelos; si
  el default deja de existir, se corrige el entorno sin desplegar. El error de
  KIE se propaga textual a la UI justamente para que se vea cuál falló, y
  desde v4.646 lleva además la lista de campos enviados, porque KIE contesta
  `This field is required` **sin decir cuál**.
- **El `input` de `/jobs/createTask` se arma por modelo, no por acumulación**
  (`buildVideoInput` en `kieService.js`). KIE valida el `input` contra el
  esquema del modelo: los campos que no declara sobran y los obligatorios no
  pueden faltar. Mandar alias «por si acaso» fue justamente lo que rompió el
  módulo en v4.645 —el payload llevaba `aspect_ratio`, `image_size`,
  `resolution`, `enable_audio` y `generate_audio`, y le faltaba `sound`—.
  Para `kling-*/image-to-video` el input es exactamente
  `{ prompt, image_urls, duration, sound }`.
- **La relación de aspecto la hereda de la imagen de origen.** Los modelos
  image-to-video de Kling no reciben `aspect_ratio`: el video sale en la
  proporción de la imagen. Por eso el formato elegido se contrasta contra la
  imagen **antes** de gastar créditos (`inspectSourceImage`) y contra el
  archivo entregado **después** (`validateOutroFile`). Nunca se corrige
  recortando.
- **La voz en off sólo existe con un motor de audio nativo.** No se puede
  generar el video por un lado y la locución por otro: mezclarlos exige ffmpeg
  y la API corre en Vercel sin ffmpeg. Desde v4.646 ese motor es **el mismo
  Kling 2.6**, con `sound: true` — genera voz, ambiente y efectos dentro del
  archivo. Hasta v4.645 la voz apuntaba a `veo3_fast`, que **no** es un modelo
  de `/jobs/createTask` sino del endpoint dedicado `/veo/generate`: esa ruta
  nunca pudo funcionar. Los parámetros de voz —idioma, acento, género,
  velocidad, tono, volumen— van descritos **en el prompt**, que es lo que
  entiende un modelo de audio nativo.
- **Qué valida `outroQuality.js` y qué no.** Sobre el archivo: resolución,
  duración, desfase de audio, presencia de pista de audio, códec, tasa de bits,
  fps y que no venga truncado — todo leyendo el contenedor MP4, sin decodificar.
  Sobre la **imagen de origen** (con sharp, antes de gastar créditos):
  resolución respecto del maestro y nitidez. **No** se mide nitidez fotograma a
  fotograma ni se hace OCR sobre el video: eso exige decodificarlo. Por eso la
  legibilidad se controla en la entrada, que es donde además se puede corregir.
  No afirmar en la UI que se mide algo que no se mide.
- **Prompts cortos y en positivo**, igual que en el Generador de Publicaciones.
  `buildOutroPrompt` describe lo que sí se quiere («la pieza se conserva exacta;
  se añade movimiento y luz»). Nada de listas de prohibiciones. Cuando el
  cliente pida una restricción («que no gire la rueda», «que no haya zoom»),
  se traduce a la cualidad positiva equivalente («la rueda se mantiene quieta»,
  «la cámara está fija») — no se pega el pedido literal en el prompt.
- **La cámara está fija y el logotipo no se anima** (v4.647, criterio de
  dirección de arte del Distrito). La cámara **no** es un eje de estilo: los
  ocho estilos se distinguen por luz, ritmo, música y carácter, y lo único que
  se mueve es el fondo decorativo (`motion` en `OUTRO_STYLES`). El motivo es
  doble: un acercamiento recorta el logotipo, y en un motor generativo cada
  encuadre nuevo es una ocasión de redibujarlo. No reintroducir `camera` con
  desplazamientos.
- **La voz se pide con hablante nativo del idioma elegido** (`tongue` en
  `VOICE_LANGUAGES`). El fallo concreto de un motor de audio multilingüe es una
  voz inglesa leyendo español. `tongue` no se deduce del acento: pedir «lengua
  materna española» en la voz en inglés sería una contradicción. Idioma por
  defecto: **español latino neutro** (`es-419`).
- El medidor de créditos es **propio** (`creditsEstimated` por motor), no el
  saldo real de KIE. Sirve para ver el gasto del mes y frenar con
  `OUTRO_MONTHLY_CREDIT_LIMIT`. No presentarlo como el saldo del proveedor.

**Resuelto en v4.1032:** el outro se engancha al final del montaje del Reel
(ver «El outro de un Reel» en la sección del Creador de Reels). Sigue viajando
en `config.outro`, aparte de `images`, y sigue sin pasar por la IA.

### Outro IA: Motion Graphics deterministas por defecto (v4.1035)

Pedido del Distrito 4281 con su pieza («GENERA UN IMPACTO DURADERO») delante:
animar la imagen institucional SIN reinterpretarla. El motor generativo
(Kling) redibuja fotograma a fotograma y eso es una ocasión por fotograma de
deformar el logotipo o el lema. Pruebas: `npm run test:outro:motion` (190
casos: criterio, un render REAL con el ffmpeg empaquetado y la mezcla de voz,
más el cableado leído de los archivos; render y mezcla se saltan sin sharp o
sin ffmpeg).

| Pieza | Qué es |
|---|---|
| `server/lib/outroMotion.js` | El CRITERIO. **Puro**: presets, expresión de escala, fundidos, lista blanca de filtros, lienzo, plan de la voz, grafo de mezcla, etapas |
| `server/lib/outroMotionRender.js` | La I/O: `inspectArtwork` (sharp), `renderMotionOutro`, `synthesizeOutroVoice`, `mixOutroVoice` — sobre `runFfmpeg` y `synthesize` de Reels |
| `MOTION_PRESETS` · `estimateOutroCosts` · `resolveEngine` (`outroSpec.js`) | Catálogo de presets, costos desglosados y duración validada POR MOTOR |
| `advanceMotion` (`outroController.js`) | Las tres etapas video → voz → mezcla, reclamadas y reanudables |
| `GET/PUT/DELETE /outros/default` · `PUT /outros/:id/default` · `PATCH /outros/:id` | Predeterminado por sitio (`Setting default_outro`) y renombrar |

- **⚠️ EL MOTOR POR DEFECTO ES DETERMINISTA** (`DEFAULT_ENGINE = 'motion'`):
  `scale … eval=frame` con easing que TERMINA en 1,0 exacto, `crop` al centro,
  `fade` de entrada y salida, y el último tramo quieto (`settleFraction < 1`).
  Los píxeles son los de la imagen; medido: el fotograma central difiere de la
  imagen en ~1/255. Kling queda como alternativa EXPRESA con su aviso de
  fidelidad — no se retiró.
- **⚠️ LAS PROHIBICIONES SON CÓDIGO, NO PROMPT.** `ALLOWED_FILTERS` es la lista
  blanca (`scale, crop, pad, setsar, fps, fade, format`); `filterIsAllowed`
  recorre el grafo y una prueba falla si aparece `gblur`, `noise`, `vignette`,
  `zoompan`, `rotate`… `MAX_START_SCALE = 1.08` acota el «zoom agresivo». El
  lienzo que no coincide con el formato se RELLENA con el color de borde medido
  de la propia imagen —nunca blur ni negro— y no se recorta la composición.
- **⚠️ `setsar=1` VA TAMBIÉN DESPUÉS DEL CROP.** El redondeo a par de la escala
  por fotograma deja un SAR de 1,0004 y el contenedor declara 1081 px de ancho
  de presentación; `probeMp4` lo lee del `tkhd`. Lo destapó la prueba de render.
- **LA DURACIÓN SE VALIDA CONTRA EL MOTOR ANTES DE GENERAR.** Motion: 3/5/7 o
  personalizado 2-15 s en pasos de 0,5, acotado y ANOTADO; Kling: la más
  cercana de `[5, 10]`, anotada. Nunca se manda una que el motor no entregue.
- **TRES ETAPAS CON INTERMEDIOS EN S3** (`…-video.mp4`, `…-voice.mp3`, final
  `….mp4`, en `config.stages` / `config.intermediate`). Un fallo de voz deja el
  video en `needs_review` con su motivo; reintentar no vuelve a renderizar lo
  que ya está. El reclamo es el UPDATE condicional de siempre (5 min).
- **LA VOZ NO SE ACELERA PARA QUE QUEPA**: `atempo` ≤ 1,04, y si no entra se
  rechaza con la medida y la salida (acortar). Se mezcla con `-c:v copy`: el
  video renderizado no se recodifica. El CTA es sólo de VOZ: no hay texto en
  pantalla porque Vercel no tiene fuentes (v4.794). **SUPERADO EN v4.1038**
  (ver «La locución manda la duración»): ya no hay `atempo` ni rechazo — si
  la voz medida no entra, la pieza se vuelve a renderizar a la duración final.
- **COSTOS DESGLOSADOS** `{generationCost, ttsCost, compositionCost}`: motion =
  0 de generación, voz = `OUTRO_TTS_CREDITS` (2). Se muestran ANTES de generar
  (preflight) y se guardan con el outro. Reutilizar un outro = 0.
- **EL PREDETERMINADO ES UN AJUSTE DEL SITIO** (`Setting default_outro`, único
  por `(key, clubId)`), no una columna de `OutroProject`; para un
  administrador de sitio el `clubId` sale del TOKEN. Se resuelve acotado al
  sitio y con `videoUrl`; un outro borrado suelta el ajuste. El Creador de Reels
  lo pide al abrirse (`GET /outros/default`) y lo preselecciona SÓLO si nadie
  eligió otro (`prev ?? …`); cambiar o quitar sigue mandando y el outro sigue
  en `config.outro`: añadirlo o cambiarlo sólo vuelve a montar.
- **LA BIBLIOTECA RECIBE CARPETA «Outros» (`ensureChildFolder`, sourceType
  `outro_root`) Y MINIATURA** de la imagen de origen (`thumbKeyFor`); no poder
  ordenar no cuesta el asset.
- **El distrito VE la pestaña** (`DISTRICT_HIDDEN_TABS` sin `outros`): el pedido
  vino de ese sitio. Se renombró a «Outro IA».

### Outro IA híbrido: el MP4 importado es el maestro (v4.1036)

Pedido del cliente con el módulo delante: además de generar el outro desde
una imagen, poder SUBIR un MP4 ya terminado y que la plataforma sólo le
agregue voz, música y mezcla. Pruebas: `npm run test:outro:import` (105
casos: criterio puro, una mezcla REAL con el ffmpeg empaquetado sobre un MP4
sintético con pista propia, y el cableado leído de los archivos) más
`npm run test:outro:motion` (190), que sigue verde: el modo A no cambió.

| Pieza | Qué es |
|---|---|
| `server/lib/outroImport.js` | El CRITERIO. **Puro**: validación del archivo, formatos, los cuatro escenarios de audio, costos, grafo de mezcla con ducking, lista blanca de filtros de AUDIO, etapas |
| `mixImportedOutro` · `extractPosterFrame` · `measureMusic` (`outroMotionRender.js`) | La I/O sobre `runFfmpeg` |
| `preflightImport` · `importOutro` · `advanceImport` · `remixOutro` · `listOutroMusic` (`outroController.js`) | Inspección, alta, las cuatro etapas, remezcla y las pistas de la Biblioteca |
| `OutroProject.origin` · `sourceVideoUrl` · `sourceVideoMediaId` · `music` | Columnas ADITIVAS (`ADD COLUMN IF NOT EXISTS`) |
| `OUTRO_ENGINES.imported` (`outroSpec.js`) | El motor «MP4 importado», `imported: true`, 0 créditos |

- **⚠️ EL MP4 ES EL MAESTRO VISUAL Y NO PASA POR NINGUNA IA.** `advanceImport`
  no llama a KIE ni a `renderMotionOutro`; el video viaja con `-c:v copy`.
  Lo fija una prueba que lee el controlador y otra que mide la mezcla real:
  misma resolución, misma duración, `normalized: false`. La única
  recodificación posible es TÉCNICA (códec no reproducible o fps variable),
  declarada en `report.normalization` y dicha en la pantalla; conserva
  resolución y contenido. Sin nada que mezclar y sin normalizar, el archivo
  se sube BYTE A BYTE (`passthrough`, escenario D).
- **⚠️ `imported` ESTÁ EN EL CATÁLOGO DE MOTORES PERO `resolveEngine` NUNCA LO
  ELIGE** (`generative(id)`, `!e.imported`): existe para que el DTO, los
  rótulos y los costos salgan de la misma fuente, no para ofrecerse como
  motor de generación ni como respaldo de voz. La pantalla lo filtra del
  selector y una prueba lo comprueba en las dos puntas.
- **GENERACIÓN = 0 SIEMPRE.** `estimateImportCosts` devuelve
  `{ generationCost: 0, ttsCost, musicCost, compositionCost: 0 }`; la fila
  nace con `creditsEstimated = 0` y `origin = 'importado'`. Un MP4 importado
  no puede aparecer como generado por Kling: lo dice la insignia de la
  Biblioteca del módulo («Importado» / «Generado») y lo fija una prueba.
- **⚠️ EL AUDIO ORIGINAL NUNCA SE DESCARTA EN SILENCIO.** `planImportAudio`
  lo conserva por defecto; descartarlo es un gesto expreso
  (`keepOriginalAudio: false`) que queda ANOTADO en `audioPlan.note` y en las
  notas del outro. Los cuatro escenarios (A sólo música, B voz + música, C
  original + voz + música, D sólo el original) se nombran y viajan resueltos
  a la pantalla, que pinta y no decide.
- **⚠️ LA VOZ ES LA CADENA DE MOTION GRAPHICS, PARAMETRIZADA.**
  `buildVoiceMixFilter` ganó `inputIndex`, `outLabel` y `gainDb` (aditivos) y
  `buildImportMixFilter` la reutiliza tal cual: un segundo criterio de la voz
  se separaría en silencio. Sigue la regla de v4.1035: `atempo` ≤ 1,04 y, si
  no cabe, se rechaza con la medida («necesita ≈7,2 s y el outro dura 5 s»)
  y la salida (acortar) — `needsSummary`, nunca acelerar. **SUPERADO EN
  v4.1038**: sin `atempo` y sin rechazo; el MP4 se extiende manteniendo el
  último fotograma (ver «La locución manda la duración»).
- **EL DUCKING ES `sidechaincompress` CON LA VOZ COMO CADENA LATERAL**
  (`DUCKING = { threshold 0.03, ratio 8, attack 20, release 400 }`), la cama
  se junta con `amix normalize=0` (con `normalize=1` bajaría 6 dB por el
  solo hecho de existir — la lección de v4.1032) y el cierre es `alimiter
  0.95 + apad + atrim`: `-shortest` recortaría el VIDEO (v4.674). La música
  se lleva a 48 kHz ANTES de `aloop` (el `size` se cuenta en muestras de esa
  tasa) y da la vuelta si es corta o se recorta si es larga, con `afade` de
  entrada (0,4 s) y de salida (≤ un tercio de la pieza).
- **⚠️ LAS PROHIBICIONES DEL AUDIO SON CÓDIGO, NO PROSA** (`ALLOWED_AUDIO_FILTERS`,
  `audioFilterIsAllowed`): sólo filtros de audio; `scale`, `crop`, `zoompan`,
  `overlay`, `drawtext` no están y una prueba lo fija. Es la misma forma de
  garantía que `ALLOWED_FILTERS` en Motion Graphics.
- **CUATRO ETAPAS CON INTERMEDIOS EN S3** (`source` → `voice` → `music` →
  `mix`; `…-poster.jpg`, `…-voice.mp3`, `…-music.<ext>`, `….mp4`). El
  reclamo es el UPDATE condicional de siempre; un fallo de voz o de música
  deja el video en `needs_review` con su motivo y reintentar no vuelve a
  sintetizar lo que ya está. El fotograma central se guarda como
  `sourceImageUrl`: es lo que hace que `outroThumbnail` y la carpeta «Outros»
  de la Biblioteca funcionen sin tocar `saveOutroToLibrary`.
- **CAMBIAR NIVELES NO REGENERA NADA** (`POST /outros/:id/remix`): sólo
  vuelve a la etapa `mix` con los intermedios que ya están (audio original
  sí/no, nivel de la música −30..6 dB, volumen de la voz). El video se copia.
- **LA MÚSICA REUTILIZA EL MOTOR DE REELS** (`startSoundtrack`, `musicChain`,
  `fetchAudioBuffer`, `MUSIC_STYLES`): «Generar» sólo se ofrece si hay
  proveedor síncrono con credencial (`importing.music.generateAvailable`) y
  cuesta `OUTRO_MUSIC_CREDITS` (3). Biblioteca y archivo subido cuestan 0.
  `listOutroMusic` casa `Media` por `type = 'audio'` O por extensión: la
  Biblioteca clasifica un MP3 como `document`.
- **EL REEL NO DISTINGUE EL ORIGEN.** `config.outro` viaja igual (`url`,
  `mediaId`, `hasAudio`) y `reelOutro.js` no sabe qué es «importado»: la
  fila tiene `videoUrl`, `hasAudio` medido y `sourceImageUrl`, así que
  `setReelOutro`, `defaultPayloadOf` y `outroClipFor` sirven sin cambios y
  sin volver a pagar. Una prueba comprueba que `reelOutro.js` no mencione
  `imported` ni `origin`.
- **EL MP4 SE SUBE POR `uploadMediaFiles`** (PUT prefirmado a S3 + `/media/save`),
  el camino de siempre: el cuerpo de una función corta en ~4,5 MB y un outro
  de 5 s a 1080×1920 pesa más. El servidor lo baja del bucket con tope de
  tamaño (`IMPORT_MAX_BYTES`, `OUTRO_IMPORT_MAX_MB`, 150 MB) y lo mide con
  `probeMp4` — sin decodificar.
- **NO SE RECHAZA DE MÁS.** Formato fuera del catálogo, resolución baja, 16:9
  o fps bajos son AVISOS con su consecuencia («el montaje del Reel lo cubre
  y recorta al centro»). Fallan sólo lo que no se puede usar: contenedor
  ilegible o truncado, sin duración, fuera de 0,5-20 s, peso o extensión.
- **LAS RUTAS LITERALES VAN ANTES DE `/outros/:id`** (`/outros/import/preflight`,
  `/outros/import`, `/outros/music/library`) — `check:routes`.

### La locución manda la duración: sin presupuesto de palabras (v4.1038)

Pedido con la pantalla delante: «13/10 palabras · ≈5,2 s de 4,3 s» en rojo,
«Procesar outro» bloqueado y la única salida «Resumir con IA». El límite se
eliminó para los DOS motores deterministas (MP4 importado y Motion Graphics).
Pruebas: `npm run test:outro:import` (166 casos; la sección 4b mezcla de
verdad los seis casos pedidos —voz más corta, igual, más larga, texto muy
largo, con música, con y sin audio original— sobre MP4 sintéticos) y
`npm run test:outro:motion` (204; la 5b re-renderiza a la duración final).

| Pieza | Qué es |
|---|---|
| `planOutroDuration` (`outroMotion.js`) | El CRITERIO. **Puro**: `final = máx(video, voz medida + 0,35 + 0,45)`; `extendSec`, `extended` y la nota |
| `planVoiceTiming` | Ya no rechaza: `ok:false` sólo si no se pudo MEDIR; `fits` pasó a ser «entra sin extender» |
| `buildHoldLastFrameFilter` · `HOLD_FILTERS` | `tpad=stop_mode=clone` sobre el video importado: el último fotograma se mantiene quieto lo que falte |
| `mixImportedOutro({ extendSec })` | Con extensión recodifica (técnico: mismo tamaño, mismo ritmo, sin filtros de imagen) y lo declara en `extended`; sin ella, `-c:v copy` como siempre |
| `config.finalDurationSec` · `config.extension` · DTO `extension` | Lo que se decidió, con `credits: 0` |

- **⚠️ LA DURACIÓN NO SE ESTIMA POR PALABRAS: SE MIDE DEL MP3.** Primero el
  TTS, después `measureAudioDuration`, y con esa medida `planOutroDuration`.
  El contador de la pantalla («13 palabras · ≈5,2 s estimados · la duración
  real se mide al generar») es INFORMATIVO y `preflightImport` lo manda con
  `blocking: false` y `mayExtend`; nada de eso decide.
- **⚠️ LA VOZ NUNCA SE ACELERA NI SE CORTA.** `atempo` salió de
  `buildVoiceMixFilter` y de `ALLOWED_AUDIO_FILTERS`: una prueba fija que el
  grafo no lo lleve se pida lo que se pida. Voz más corta que el video: se
  conserva la duración original. Voz más larga: la PIEZA se alarga.
- **⚠️ EL MP4 IMPORTADO SE EXTIENDE CONGELANDO SU ÚLTIMO FOTOGRAMA, NO EN
  BUCLE Y NUNCA CON IA.** El video se reproduce entero y `tpad` clona el
  fotograma final; una prueba extrae el fotograma del tramo extendido y
  comprueba que es el del MP4. Es la única recodificación de video del modo
  importado además de la normalización técnica, y se declara (`extended`).
- **⚠️ MOTION GRAPHICS SE VUELVE A RENDERIZAR A LA DURACIÓN FINAL, no se
  congela.** Termina en FUNDIDO: congelar su último fotograma daría segundos
  de negro. Re-renderizar cuesta segundos de ffmpeg y cero créditos, y el
  fundido cae al cierre nuevo. `stages.video.rerenderedFor = 'voice'` lo dice
  y un reintento con el video ya a esa duración no lo vuelve a renderizar.
- **LA MÚSICA SE PIDE Y SE RECORTA PARA LA DURACIÓN FINAL** (`startSoundtrack`
  con `finalDurationSec`; `aloop`/`atrim` y `afade` de salida contra `D`
  final), y el ducking sigue siendo `sidechaincompress` con la voz.
- **CON EXTENSIÓN NO HAY PASSTHROUGH.** El archivo sólo sale byte a byte
  cuando no hay nada que mezclar NI que alargar (`!timeline.extended` en la
  condición): hoy una extensión siempre viene con voz, y la guardia está para
  que ningún camino futuro entregue el MP4 crudo con un plan que dice
  «extendido».
- **EL LÍMITE SE CONSERVA SÓLO PARA EL MOTOR GENERATIVO (Kling)**: ahí la voz
  la produce el propio modelo dentro de un clip de 5/10 s que no se puede
  extender sin regenerarlo. `createOutro` y `remixOutro` rechazan con
  `needsSummary` únicamente cuando `!plan.deterministic`, y la pantalla pinta
  el rojo sólo con `speechLimited` (`!isImport && !isMotion`).
- **CRÉDITOS: la extensión es 0.** No hay llamada a KIE en ninguno de los dos
  caminos (lo fija `test:outro:import` leyendo `advanceImport`); sólo se
  cuentan la voz (`OUTRO_TTS_CREDITS`) y la música, como antes.
- **`validateImportedOutput` y `validateOutroFile` reciben la duración FINAL**
  como esperada, no la del origen: contra la del origen, toda extensión
  reprobaría por «la duración cambió».

### El preflight manda lo que el espejo promete (v4.1037)

Reporte con captura el día del estreno: al subir el MP4 aparecía «Video
cargado. Inspeccionando...» y en seguida la pestaña entera caía en «Esta
pantalla no se pudo mostrar». Prueba: la sección 5 de
`npm run test:outro:import` (108 casos), verificada a la inversa.

- **⚠️ EL ESPEJO TIPADO PROMETÍA `report` Y EL SERVIDOR NO LO MANDABA.**
  `OutroImportPreflight.report` estaba declarado y `preflightImport` aplanaba
  ese informe sólo dentro de `source`: la pantalla hacía
  `importPreflight.report.failures.map(...)` en el primer render tras subir el
  video y reventaba con un TypeError que atrapa el límite de error. **El
  typecheck no lo ve** —la interfaz decía que el campo estaba— y las 105
  pruebas de v4.1036 tampoco: comprobaban el criterio y que la pantalla LEYERA
  el preflight, no que el servidor mandara lo que la pantalla lee. Es la clase
  de fallo de `check-imports` (v4.884) y de `estimatedTokensInput` (v4.867):
  una interfaz escrita a mano es una afirmación, no una comprobación.
- **`source` y `report` conviven a propósito.** `source` es lo que se PINTA
  en la ficha (nombre, resolución, audio original, códec); `report` es el
  VEREDICTO con el que se decide si se puede procesar (`ok`, `failures`,
  `warnings`, `normalization`). Quitar uno rompería a su consumidor.
- **⚠️ LA PRUEBA LEE LAS DOS PUNTAS.** Extrae de `OutroGenerator.tsx` cada
  clave que se lee de `importPreflight` y del cuerpo de `preflightImport` cada
  clave del `res.json({...})`, y exige que la primera lista esté contenida en
  la segunda; y lo mismo entre el espejo tipado y la respuesta. Al agregar una
  clave a la respuesta del preflight, hay que agregarla en los tres sitios o la
  prueba dice cuál falta. **La última clave de un objeto no lleva coma**: la
  expresión que las extrae admite fin de línea, o `costs` sale como faltante.


## Usar un outro no es generarlo — v4.1241

Reporte: en la ficha de un Reel de rotary4281.org, «Elegir outro» mostraba
«La herramienta 'outro' no está disponible para este sitio» y no dejaba poner
el outro guardado desde el Generador. `GET /outros` y `GET /outros/default`
exigían `requireStudioTool('outro')` —el GENERADOR, apagado en ese sitio desde
el Control Central de Capacidades— aunque los Reels y la Biblioteca estaban
habilitados.

- **`requireStudioTool` acepta una lista** y deja pasar si UNA está habilitada
  (`anyStudioToolEnabled`).
- **Las dos lecturas del selector** (`GET /outros`, `GET /outros/default`)
  usan `OUTRO_READ_TOOLS` = `outro`, `video`, `ai_reels`, `library`,
  `video_library`. Las usa `SavedOutroPicker` (ficha del Reel, Biblioteca) y
  el Creador de Reels.
- **Todo lo que crea, importa, edita, predetermina o borra sigue exigiendo
  `'outro'`.** Poner el outro en un Reel (`PUT /reels/:id/outro`) nunca
  dependió del generador.
- Prueba: `npm run test:outro:picker`.
