# Rotary Clubs App — guía para Claude

## Despliegue a producción

**Regla durable**: cada vez que se cree un PR a `main`, pasarlo de **draft → ready** y hacer **squash-merge** automáticamente, sin pedir confirmación. Producción se despliega desde `main` vía Vercel, así que un PR sin mergear = el cambio no llega al usuario.

Si el merge falla por conflictos:

1. `git fetch origin main && git rebase origin/main` (commits ya squash-mergeados en main se saltean solos)
2. `git push --force-with-lease origin <branch>`
3. Reintentar el merge

Idioma del PR title/body y commits: español (el equipo del cliente es hispanohablante).

## Versionado

Cada PR que toca features visibles debe bumpear:

- `package.json` → `version` y `cache_bust`
- `package-lock.json` → ambas ocurrencias de la versión (raíz y `packages.""`)
- `src/pages/SystemUpdates.tsx` → cabecera + nueva entry al tope del array `SYSTEM_UPDATES`
- Log de arranque del controller afectado (ej. `contentStudioController.js`)

Usar incrementos de patch (`v4.323` → `v4.324`) para fixes. Major-feel changes pueden saltar pero mantener semver patch sigue siendo aceptable porque el equipo trackea por número de release.

## Content Studio / Generador de Publicaciones

Archivo principal: `server/controllers/contentStudioController.js`. Función `generatePost`.

**Regla #1: NO POSTPROCESAR el output del modelo de imagen.** Equipo cliente rechazó múltiples versiones donde aplicamos composite-back / máscara / blur sobre el output — siempre se ve "overlay / pegado / montaje". ChatGPT (referencia explícita del equipo) no postprocesa. Replicar ese flujo: foto + prompt → output as-is. **Aplica a TODOS los engines del registry**, no solo a OpenAI.

### Arquitectura multi-engine (v4.326)

Registry `ENGINES` en `contentStudioController.js`. Cada engine tiene metadata `{ label, engineKey, available }`. `generatePost` rutea según `config.engine` (mandado por el frontend), con fallback a `DEFAULT_ENGINE = 'kie'` si el solicitado no existe o no está available.

Engines en Fase 1:

- `kie` (default) — KIE.AI gateway con modelo `google/nano-banana-edit`. Implementado vía `kieService.js` (createTask → poll → fetch). Async, ~30-60s típico.
- `openai` — gpt-image-1 directo en `/v1/images/edits` sin máscara, `input_fidelity:high`, `quality:high`. Sync, ~20-40s típico.

Placeholders en el registry (UI los muestra como "Próximamente"): `flux_kontext`, `nano_banana`, `higgsfield`. Para implementarlos, agregar la función `generateWithX` + flag `available: true` + (si va vía KIE) usar `createKieImageTask` con el modelo correcto.

### Pipeline común para todos los engines

1. Fetch + `enhanceOriginal` (sharp, pixel-space, identidad intacta). Solo se usa para engines que reciben buffer (OpenAI); KIE recibe el `imageUrl` original directo.
2. GPT-4o multimodal para copy social (FB/IG/X/LinkedIn). El `visual_prompt` no se usa por los engines de imagen.
3. Despacho al engine: `generateWithKie` o `generateWithOpenAI`, todos con el mismo `buildSimplePrompt({ targetFormat })`.
4. **Devolver el buffer TAL CUAL** que produzca el modelo. Sin composite, sin máscara, sin feather, sin blur. Upload a S3.

Trade-off aceptado: regeneración semántica = leve drift de rostros / ropa (visible incluso en la salida ChatGPT). A cambio: cero overlays visibles.

### Approaches DESCARTADOS (no volver a probarlos sin razón muy fuerte)

- **Masked outpainting con bandas grandes** (v4.317-v4.320): `gpt-image-1` con máscara grande duplica intermitentemente (efecto mosaico / tiling).
- **Letterbox / blur background** (v4.321): equipo rechazó — "no quiero fondos difuminados".
- **Composite-back del original** (v4.323-v4.324): equipo rechazó — "se ve overlay / montaje".
- **Seeded mirror + masked edit** (v4.324): otra forma de composite, mismo rechazo.

Prompts largos con listas negras son contraproducentes — el modelo se obsesiona con lo prohibido. Mantener prompts cortos y positivos.

`vercel.json` tiene `maxDuration: 120s` para `/api` — necesario por la latencia de `gpt-image-1` con `quality:"high"` y el polling de KIE.

### Variables de entorno

- `KIE_API_KEY` — para todos los modelos via KIE.AI gateway (Nano Banana, Flux Kontext, Seedream, etc.).
- `OPENAI_API_KEY` — gpt-image-1 directo + GPT-4o para copy.
- `HIGGSFIELD_API_KEY` — pendiente, se usará cuando implementemos ese engine.

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

**Pendiente conocido:** unir el outro y el video en un solo MP4 exige un paso de
render. Desde v4.664 la plataforma **sí** tiene FFmpeg (`ffmpeg-static`, ver el
Creador de Reels), así que el impedimento ya no existe: falta enganchar el clip
del outro al final de `buildEditSpec`. Hoy sigue **adjunto** al proyecto como
clip independiente.

## Creador de Reels IA — v4.676

Tres fotografías de la Biblioteca se convierten en un Reel vertical de ~15 s con
movimiento cinematográfico, transiciones, banda sonora y montaje automático.
Reemplaza al Creador de Video anterior, que **no llegaba a funcionar**: mandaba
las tres imágenes juntas a UNA llamada de `kling-2.6/image-to-video` —que recibe
UNA imagen—, así que nunca hubo tres clips; `syncProjectStatus` pegaba contra
`/jobs/getTaskDetail`, retirado por KIE; y `transition`/`animation` se guardaban
en `config` sin que el servidor los leyera.

| Archivo | Qué es |
|---|---|
| `server/lib/reelSpec.js` | Fuente de verdad: formatos y resoluciones, motores, estilos, transiciones, música, reparto de la duración y prompts |
| `server/lib/reelDirector.js` | Mira las tres fotos y decide orden, ritmo, estilo por escena y música |
| `server/lib/reelRenderProviders.js` | Capa desacoplada del montaje: FFmpeg local + Shotstack, Creatomate, JSON2Video |
| `server/lib/reelFfmpeg.js` | Compositor local: extracción de fotogramas, conformado y montaje |
| `server/lib/canvasExpansion.js` | AI Canvas Expansion: adapta el lienzo de una foto al formato antes de animarla |
| `server/lib/reelCopy.js` | Copies por plataforma, saneado, límites y exportación |
| `server/lib/institutionalVoice.js` | Reglas editoriales compartidas con el Generador de Publicaciones |
| `server/lib/publicationContext.js` | Tipo de Publicación y Enfoque Rotary, compartidos con el Generador de Publicaciones |
| `server/lib/reelNarration.js` | Guion hablado, voces TTS y Narrative Timing Engine |
| `server/lib/reelMusic.js` | Banda sonora: KIE generativo + biblioteca licenciada |
| `server/lib/reelQuality.js` | Inspección de las fotos, validación de los archivos y control de fidelidad |
| `server/lib/reelUsage.js` | Registro de consumo por proveedor, reparto declarado de responsabilidades y tarifas |
| `server/lib/ensureReelSchema.js` | Crea `ReelProject` y `ReelScene` en runtime |
| `server/controllers/reelController.js` | Flujo completo y máquina de estados |
| `src/components/admin/content-studio/VideoCreator.tsx` | Preparación, progreso y previsualización |
| `src/components/admin/content-studio/ReelLibrary.tsx` | La Biblioteca de Reels: listado, ficha, edición y duplicado |
| `src/components/admin/content-studio/ReelUsagePanel.tsx` | Panel de auditoría del consumo |
| `src/lib/reelSpec.ts` | Espejo mínimo: tipos y cálculo de la línea de tiempo |

**Reglas durables:**

- **El lienzo se adapta ANTES de animar, y sólo si hace falta** (v4.665,
  `canvasExpansion.js`). Los motores image-to-video heredan la proporción de la
  imagen: una foto apaisada da un clip apaisado que el montaje tenía que
  recortar, perdiendo los bordes. `planExpansion` compara proporciones y una
  foto que ya está en formato **no se toca** — es lo más importante que hace ese
  paso: no gastar créditos ni arriesgar deriva sin motivo.
- **La expansión NO usa máscara ni composite.** Es la misma técnica de
  `buildSimplePrompt` en el Generador de Publicaciones: regeneración completa
  con `aspectRatio` y los elementos a conservar NOMBRADOS en el prompt. Las dos
  alternativas están descartadas por experiencia propia y siguen descartadas:
  la máscara grande duplicaba en mosaico (v4.317-v4.320) y el composite del
  original lo rechazó el cliente dos veces (v4.323-v4.324, «se ve overlay»).
- **Por eso no se PROMETE preservación: se MIDE.** Sin composite no hay 100 %
  garantizado. `verifyExpansion` recorta del lienzo nuevo la región donde vive
  la foto original y la compara con `structuralCompare`; por debajo de
  `EXPANSION_MIN_PRESERVATION` la adaptación se rehace sola. **La comparación
  tiene que ser sobre esa región y sólo sobre ella**: comparar las imágenes
  enteras daría una nota baja siempre, porque el lienzo añadido es contenido
  nuevo y debe serlo. La UI muestra el porcentaje, no una promesa.
- **La foto original nunca se pisa.** `sourceImageUrl` sigue apuntando a ella y
  la adaptada vive en `expandedImageUrl`; `animationSourceOf` es el ÚNICO sitio
  donde se decide cuál se anima. Cambiar la foto de una escena descarta su
  adaptación, porque la anterior ya no describe nada.
- **Una foto demasiado panorámica se rechaza con motivo** (`maxGrowth`), no se
  intenta. Por encima de ~3× de crecimiento ningún modelo sostiene la
  coherencia, y entregar un lienzo inventado es peor que pedir otra foto.
- **Una tarea de video POR ESCENA.** Es la corrección de fondo del módulo
  anterior. Los modelos image-to-video reciben UNA imagen; mandarles un array
  de tres no produce tres clips. Nunca volver a agrupar.
- **El conformado de los clips vive DENTRO del grafo de filtros, no en una
  pasada previa** (v4.671). `buildFilterGraph` escala, recorta, fija los fps y
  el formato de píxel de cada entrada antes de encadenar los fundidos. Hasta
  v4.670 había además un `normaliseClip` que recodificaba el clip entero para
  dejarlo exactamente como el grafo iba a dejarlo de todos modos: doble encode,
  doble pérdida de generación y el tiempo agotado que dejaba el Reel en
  «Ningún proveedor de montaje pudo completar». **No reintroducirla.** No hay
  riesgo de «concatenar archivos dispares»: nada se concatena en crudo — FFmpeg
  decodifica cada entrada y la conforma en el grafo. Medido con tres clips a
  1280×720@30, 1920×1080@24 y 720×1280@25 (uno con pista de audio): salen
  unidos en 1080×1920@30, 14,00 s, en 11 s de una sola pasada.
- **La fidelidad se mide contra la imagen que SE ANIMÓ** (`animationSourceOf`),
  no contra `sourceImageUrl`. Es el mismo punto de decisión que usa el despacho,
  y usar otro es un error caro: con el lienzo adaptado, el clip es 9:16 y la
  foto original apaisada, así que la huella perceptual daba nota baja POR
  CONSTRUCCIÓN. Una escena marcada `failed` se regenera sola **partiendo de la
  misma imagen adaptada**, así que volvía a fallar igual: dos rondas de créditos
  de video en un problema inexistente. Medir la adaptación contra el original es
  otra cosa y la hace `verifyExpansion`, sobre la región donde vive la foto.
- **`stdout` de FFmpeg se descarta en el descriptor** (`stdio: ['ignore',
  'ignore', 'pipe']`), no se abre como tubería. Con `pipe` y sin nadie leyendo,
  el búfer del sistema se llena y ffmpeg queda bloqueado escribiendo: no falla,
  se cuelga, y sólo se ve un tiempo agotado sin causa.
- **Un fallo de montaje guarda el diagnóstico técnico** —comando, código de
  salida y cola de `stderr`— en `renderRaw`, y el panel administrativo lo
  muestra. Al usuario se le sigue dando el mensaje llano. «No se pudo montar» a
  secas obliga a reproducir el fallo a ciegas.
- **El montaje NO es postprocesar.** La regla heredada del Generador de
  Publicaciones y del de Outros prohíbe retocar el archivo que devuelve un
  modelo —composite, máscara, blur, recorte— porque se ve pegado. Lo que hace la
  capa de render es **edición declarada**: qué clip va cuándo, cómo se encadenan
  y qué suena debajo. El CONTENIDO de cada clip viaja intacto. Ningún adaptador
  aplica filtros, escalas forzadas ni corrección de color.
- **El montaje por defecto es FFmpeg y viaja con la aplicación** (v4.664,
  `ffmpeg-static`). Un proveedor externo sin credencial deja el módulo sin
  montar nada, que es exactamente lo que pasó al estrenarlo. Medido sobre el
  caso real: ~12 s para 14 s en 1080×1920 con dos fundidos y música, holgado
  dentro de los 120 s de `vercel.json`. **No instalar `ffprobe-static`**: pesa
  336 MB porque trae los binarios de las tres plataformas y solo eso revienta el
  límite de 250 MB de la función. Todo lo que hay que leer de un MP4 ya lo saca
  `probeMp4`, parseando el contenedor.
- **Los proveedores alojados siguen valiendo** y ahora hay CADENA: principal
  (`REEL_RENDER_PROVIDER`), respaldo (`REEL_RENDER_FALLBACK`) y cualquier otro
  disponible. Si el principal falla se intenta el siguiente ANTES de darle un
  error al usuario, y lo que se intentó queda en `notes`. Con un proveedor
  pedido explícitamente NO hay respaldo: el usuario eligió y silenciarlo sería
  desobedecerlo.
- **`mode` distingue local de alojado**, no el nombre del proveedor. `local`
  monta y devuelve el archivo en el acto (`output`); `remote` crea un trabajo y
  se sondea (`jobId`). El controlador se ramifica por ese campo.
- **Una tasa de bits baja NO es un fallo si codificamos nosotros**
  (`encoder: 'local'` en `validateReelFile`). Con objetivo de 10 Mbps y preset
  conocido, un archivo liviano significa contenido sencillo —un plano fijo, un
  fondo liso—, no pérdida de calidad: x264 no infla lo que no lo necesita.
  Reprobar ahí mandaba un Reel perfecto a «Requiere revisión». De un proveedor
  externo, cuyos ajustes no controlamos, sí se reprueba.
- **El techo de duración por escena lo fija el MOTOR, no el gusto.** Pedirle
  5,33 s a un motor que entrega 5 o 10 obliga a generar un clip de 10 para usar
  la mitad: el doble de créditos y de espera. `distributeDurations` acota al
  mayor valor que el motor entrega dentro de `[4, 6]`. Con Kling eso da tres
  clips de 5 s y una pieza de **14 s**, no 15 — y el módulo lo anota en `notes`
  para que el número esté a la vista. "Duración aproximada" no es licencia para
  callar la real.
- **El motor de música se elige por LICENCIA, no por calidad de audio** (v4.668).
  Estas piezas las publica una institución en YouTube, donde el Content ID
  reclama solo. `ElevenLabs Music` (principal) y `Stable Audio` (respaldo)
  entrenan con catálogo licenciado y dan derechos comerciales explícitos; Suno
  no divulga sus datos, está en litigio con las discográficas y, consumido vía
  pasarela, su licencia no es trazable. Sigue **declarado y funcional** —se
  enciende con `REEL_MUSIC_PROVIDER`— pero fuera de la cadena automática, y el
  campo `licensing` del registro viaja al panel para que quien lo cambie sepa
  qué acepta. No reintroducirlo como default.
- **La variedad NO viene del proveedor.** Cualquier motor generativo devuelve
  una pista distinta cada vez, incluso con el mismo prompt. Lo que hace que
  suenen variadas pero coherentes son los nueve `MUSIC_STYLES` con su BPM y su
  descriptor, que elige el director según lo que ve. Cambiar de proveedor
  buscando variedad es resolver el problema equivocado.
- **`mode` distingue cómo llega la pista**, igual que en el montaje: `sync`
  devuelve el audio en la misma petición (ElevenLabs, Stable Audio) y `async`
  crea una tarea que hay que sondear (Suno vía KIE). `resolveSoundtrack` en el
  controlador unifica las tres formas —buffer, URL de biblioteca o taskId— para
  que el resto del flujo no tenga que saber por dónde vino.
- **Un proveedor pedido a mano NO tiene respaldo**: el usuario eligió, y
  silenciarlo con otro motor sería desobedecerlo. Igual criterio que el montaje.
- **Los clips se generan MUDOS cuando hay banda sonora.** Dos pistas compitiendo
  suena peor que una bien puesta. El audio nativo del motor sólo se pide si no
  va a haber música del montaje.
- **Los fotogramas se extraen del PROPIO clip** (v4.664). Hasta v4.663 la
  comprobación dependía de que el proveedor entregara una portada, y Kling no la
  manda: el resultado era «fidelidad no comprobada» en todas las escenas,
  siempre. Depender de un dato opcional de un tercero para una comprobación
  propia era el error. Se sacan **tres** por escena —inicio, medio y fin— porque
  la deriva de un modelo generativo es progresiva: el primero casi siempre es
  fiel y el último es donde el logotipo se rompe. La nota de la escena es la
  **peor** de las tres, no la media.
- **La fidelidad son DOS señales independientes.** Una estructural y
  determinista (huella perceptual 16×16 + distancia de color, con sharp), y una
  semántica (modelo de visión sobre una composición **lado a lado** con la foto
  original — va lado a lado porque `generateCopy` acepta UNA imagen, y pegar las
  dos es lo que permite comparar en vez de describir por separado). Si el modelo
  no responde, la estructural sigue dando veredicto y la ficha dice que se hizo
  sin él: la estructural detecta un reencuadre pero **no** un logotipo
  redibujado en su mismo sitio, así que la diferencia es del usuario, no un
  detalle interno.
- **La fidelidad tiene TRES estados**: `ok`, `failed` y `unavailable`. Desde
  v4.664 `unavailable` es raro y significa lo que dice — no se pudo mirar nada.
- **El texto lo lee el modelo de visión, no un OCR dedicado.** Transcribe las
  dos mitades y se comparan por palabras (`compareText`); por debajo del 50 % de
  palabras conservadas se marca ilegible aunque el modelo no lo señale. No
  añadir Tesseract: son decenas de MB en una función que ya empaqueta FFmpeg.
  No llamarlo OCR clásico en la UI.
- **Una escena que altera la marca o deja el texto ilegible se regenera sola**,
  por buena que sea su nota. Es exactamente lo que el módulo promete conservar.
  El resto se decide por la nota (`minFidelityScore`).
- **Regenerar UNA escena no toca las otras dos.** Por eso las escenas viven en
  su propia tabla y no dentro de un JSON del proyecto: con todo en una fila, dos
  regeneraciones simultáneas se pisarían. `ReelScene` copia `clubId` y `format`
  del proyecto a propósito, para que la operación se resuelva con su propia fila.
- **Cambiar la duración de una escena NO regenera el clip** — es una decisión de
  montaje y sólo se relanza el render. Cambiar el estilo SÍ regenera: el
  movimiento está dentro del clip. Nunca se puede pedir más metraje del que el
  clip tiene; para eso hay que regenerar, y el servidor lo dice con el máximo.
- **La sobriedad institucional se pide EN POSITIVO, y una palabra basta para
  romperla** (v4.672). El prompt decía «A N-second **cinematic** shot» y, al
  detectar comida o bebida, pedía literalmente *«gentle steam rising … a soft
  glisten travelling across the surface»*. Eso produjo humo, chispas y un
  destello naranja en piezas reales del Distrito. «Cinematic» es una invitación
  a que el modelo aporte SU idea de cine: luz dramática, halos, partículas.
  Ahora dice `documentary shot` y afirma *«the only light in the shot is the
  light already present in the photograph, and the air stays clear»*. **No
  reintroducir la rama de vapor/brillo ni la palabra «cinematic»**, y no
  arreglarlo con una lista de prohibiciones: la regla del sitio es que el modelo
  se obsesiona con lo prohibido.
- **FIDELIDAD y NIVEL DE VIDA son preguntas OPUESTAS** (v4.675). La primera
  penaliza el cambio respecto de la foto; la segunda lo exige. El control de
  calidad sólo medía la primera, así que una escena congelada pasaba con nota
  perfecta — es el defecto que se reportó. `lifeScore` (0-100) tiene dos
  fuentes: `internalMotion` del modelo de visión, que es el único capaz de
  distinguir «se movió la gente» de «se movió el encuadre» (un paneo puntúa 0
  a propósito), y `measureSceneLife`, determinista sobre los fotogramas del
  propio clip, que manda cuando da 0 —fotogramas idénticos es congelado, diga
  lo que diga el modelo—. Por debajo de `FROZEN_LIFE_SCORE` la escena se
  relanza. **No mezclar las dos notas en una sola**: se anulan.
- **La vida se toma del fotograma que MÁS se movió**, al revés que la fidelidad,
  donde un solo fotograma malo condena la escena. Basta con que la escena viva
  en algún momento.
- **El total de créditos del proyecto se RECALCULA** (`refreshProjectCredits`),
  no se calcula una vez. Se computaba dentro de `createReel`, cuando las escenas
  que necesitan adaptación aún no se han despachado —se despachan luego, en
  `advance`—: con las tres fotos apaisadas el total quedaba en 0 para siempre y
  la ficha decía «0 créditos» de un Reel que sí los gastó.
- **La CÁMARA está fija; lo que se mueve es la ESCENA** (v4.674). Hasta v4.673
  cada estilo pedía un desplazamiento —`a slow continuous dolly`, `a confident
  push-in`, `a gentle orbit`, `a brisk lateral slider`— y eso SUSTITUÍA a la
  animación: el resultado era una fotografía con paneo. Ahora los ocho estilos
  declaran `locked off` y lo que los distingue es el CARÁCTER de la vida dentro
  del cuadro (`motion`). `orbital` y `aereo` se retiraron por ser movimientos de
  cámara puros; entraron `conversacion` y `ceremonial`. **No reintroducir ejes
  de cámara en `MOTION_STYLES`.**
- **El `motionHint` es la instrucción POR FOTO y es lo que evita que las tres
  escenas se muevan igual.** El análisis lo escribe mirando esa imagen: qué
  hacen esas personas, hacia dónde miran, qué hacen sus manos. Ojo: hasta v4.673
  ese mismo campo pedía «vapor, agua, hojas, tela, luz, **o el movimiento de
  cámara**» — por ahí volvían a entrar las dos cosas que se habían quitado del
  prompt principal. Se acota en positivo («sólo lo que YA está en la
  fotografía»), sin lista negra.
- **En el grafo de audio, `loudnorm` va ANTES del `afade`** (v4.674). Al revés
  —que es como estaba— el normalizador levanta la cola que el fade acaba de
  bajar y la música se corta en seco. Medido sobre una pieza de 14 s: el último
  medio segundo quedaba en −27 dB; con el orden corregido el tramo 13-13,9 s
  cae a −29,8 dB y sigue bajando. El fade de salida es de ~2 s, acotado a un
  tercio de la pieza; el de entrada, 0,6 s — entrar rápido no se nota, salir
  rápido sí.
- **IDENTIDAD y MOVIMIENTO son dos ejes distintos, y confundirlos congela la
  escena** (v4.673). Es el error que siguió a la corrección del humo: al acotar
  el movimiento con *«the smallest natural one … while everything else about
  them holds still»* el modelo entregaba una fotografía con paneo. Van en frases
  SEPARADAS: una fija lo que no puede cambiar —rostros, edad, gafas, chalecos,
  insignias, logotipos, encuadre—; otra pide movimiento con VERBOS —respiran,
  parpadean, giran la cabeza, se miran, terminan el gesto empezado— y exige que
  **cada persona se mueva a su propio ritmo**, porque un grupo moviéndose al
  unísono se lee como error. La primera línea dice *«this is the moment the
  photograph was taken, filmed as it happened»*: pedir «animated from the
  photograph» se satisface moviendo sólo la cámara.
- **Ojo con las frases que se contradicen entre ramas.** La de logotipos decía
  «Only the camera moves around them» y anulaba la de personas. Lo que se fija
  de una marca es su DIBUJO, no la escena alrededor.
- **El director NO puede elegir un estilo `engineless`.** `fotografico` se filtra
  de `STYLE_IDS` en `reelDirector.js`: estando en la lista, el modelo lo elegía
  por su cuenta y el Reel salía sin animar. Se reserva para la elección expresa
  del usuario y para el respaldo automático.
- **El respaldo 2.5D llega después de UN reintento**, no en el primer fallo. Caer
  de inmediato metía fotos quietas en el Reel sin haberle dado al motor una
  pasada. Es una red, no el camino habitual.
- **El piso estructural depende de si hubo modelo de visión**
  (`minStructuralScoreWithVision`, 0,3 frente a 0,5). La huella perceptual no
  distingue «la escena se movió» de «la escena cambió»: con movimiento real, el
  piso alto reprobaba escenas por estar vivas y las mandaba al respaldo
  estático. Con modelo de visión, la estructural sólo guarda contra el
  reencuadre grosero; sin él, sigue decidiendo sola con el criterio estricto.
- **La fidelidad se puntúa de 0 a 10, no de 0 a 1.** El 2.5D declaraba `score: 1`
  y la ficha mostraba «1/10» —la peor nota— en la escena que es la fotografía
  intacta.
- **El estilo por defecto es `documental`**, no `cinematografico`.
- **Hay una vía SIN motor generativo** (`fotografico`, `isEngineless`,
  `renderStillMotion`): la fotografía se anima desplazando lentamente la ventana
  de encuadre con FFmpeg. Los píxeles son los del original, así que rostros,
  insignias y textos no se reinterpretan. Cuesta **cero créditos** y 2-7 s,
  frente a 20 créditos y 1-3 min del motor. Es la opción indicada para una foto
  de grupo institucional.
- **El clip animado NO se sustituye por el respaldo 2.5D** (v4.676). Hasta
  v4.675 una escena con personas que suspendía la fidelidad dos veces se
  reemplazaba por un paneo sobre la foto quieta. Producía exactamente lo
  reportado —«una escena animada y dos que se mueven de un lado a otro»— y era
  irreversible: el rescate de escenas congeladas excluye `still_motion`.
  Y el criterio se volvía CONTRA el objetivo: una escena con más vida se parece
  MENOS a la foto de origen, así que era la más propensa a suspender. Se estaba
  castigando lo que se busca. Ahora el clip se conserva, se marca
  `needs_review` y la decisión es del usuario, que puede mirar el video. El
  2.5D queda para la elección expresa de `fotografico`.
- **Sólo se regenera sola la escena con `brandAltered` o `textIllegible`.** Son
  los defectos que descalifican una pieza institucional y no admiten criterio
  estético. El resto es una nota, no un descarte.
- **Una escena resuelta sin IA se DICE en la línea de tiempo.** Antes se veía
  igual que las demás y no había forma de saber por qué esa se movía «de un lado
  a otro» y las otras no.
- **El 2.5D no declara una nota de fidelidad inventada.** Guarda `state: 'ok'`
  con `method: 'still-motion'` y explica que no hubo modelo que pudiera alterar
  nada. Poner «100 % de fidelidad» sería una medición que no se hizo.
- **Los prompts son cortos y en positivo**, igual que en el resto del sitio.
  "Que no deforme el logo" se escribe como "el logotipo se mantiene exactamente
  como está". El prompt sólo crece cuando el análisis detecta marca, texto,
  personas o naturaleza, y crece nombrando lo que se conserva.
- **El análisis fallido degrada, no bloquea.** Si el proveedor de visión no
  responde, `fallbackDirection` arma la pieza con criterio propio —abre la toma
  más abierta, cierra la que lleva la marca— y el Reel se genera igual.
- **Un orden inválido del director se descarta ENTERO.** Si el modelo repite o
  se saltea un índice, se usa el criterio propio: un orden a medias deja una
  foto fuera y otra repetida.
- **La preferencia explícita del usuario manda sobre el modelo.** Si eligió
  estilo, transición o música, el director no los cambia. Con las tres fijadas
  no se llama al modelo: no decidiría nada que el criterio propio no resuelva.
- **`ReelProject` y `ReelScene` viven fuera de Prisma**, como manda la sección de
  base de datos de este archivo. `VideoProject` **no se toca**: sigue en Prisma
  con sus filas y sus `ScheduledPost` colgando, y las rutas `/projects` se
  conservan.
- **El contexto estratégico enriquece TODO, no sólo el copy.** `publicationType`
  e `interestArea` viajan al director (qué historia cuenta el montaje), al copy
  y al guion de la voz. Salen de `publicationContext.js`, que es la misma fuente
  del Generador de Publicaciones: el mismo «Evento» tiene que significar lo
  mismo en un post y en un Reel. Antes de v4.667 estaban duplicados en el
  controlador y otra vez en `PostGenerator.tsx`.
- **El guion de la voz NO es el copy.** Uno se lee y el otro se escucha: un
  texto con hashtags, emojis o «link en la bio» narrado en voz alta suena
  absurdo. Son dos generadores distintos a propósito.
- **La sincronía no se pide, se CONSTRUYE.** Ningún proveedor de TTS acepta
  «durá 14 segundos». El Narrative Timing Engine escribe con un presupuesto de
  palabras, sintetiza, **mide el archivo real** con `measureAudioDuration`
  (ffmpeg `-f null -`) y corrige el presupuesto con el ritmo REAL de esa voz
  hasta entrar en tolerancia. Estimar y creerse la estimación es lo que hace que
  la voz se pase tres segundos.
- **No se acelera la voz para que quepa.** Sólo se admite un `atempo` de hasta
  el 4 %, por debajo del umbral audible, y sólo si quedó larga. Si quedó corta
  se completa con silencio: una pausa antes del último fotograma es invisible;
  una palabra cortada, no.
- **La pista de audio se fuerza a la duración de la pieza.**
  `sidechaincompress` termina cuando se acaba la voz, y `-shortest` recortaba el
  VIDEO a esa longitud — un Reel de 14 s salía de 12,85 s. El `apad`+`atrim`
  del final del grafo no es decorativo: es lo que sostiene la duración.
- **La música baja con DUCKING, no con volumen fijo.** `sidechaincompress` la
  comprime en función de la voz, así que cede sólo mientras se habla y vuelve en
  los silencios. Bajarla de forma fija dejaría la pieza sorda en los tramos sin
  locución.
- **Si el motor de voz no controla el acento, se dice.** `accentControl` en el
  registro: OpenAI tiene voces buenas pero no seleccionables por acento —el
  español sale con deje anglosajón—, mientras ElevenLabs tiene voces colombianas
  reales. Prometer «acento colombiano» con un motor que no lo hace es
  exactamente el tipo de afirmación que este módulo no hace.
- **Regenerar la voz NO regenera el video.** Cambiar idioma, acento, estilo o
  velocidad limpia el `renderJobId` y rehace la MEZCLA. Es lo que permite probar
  voces sin gastar créditos de video.
- **Los copies se escriben EN PARALELO con los clips**, al crear el Reel. Cuesta
  una llamada de texto porque el análisis de las tres fotos ya lo hizo el
  director: volver a mirarlas serían tres llamadas de visión para saber lo
  mismo. Los clips tardan 1-3 minutos; el copy, ~10 s.
- **No hay motor de copy nuevo.** Se usa `generateCopy` —el del Generador de
  Publicaciones, con su cadena de proveedores— y las reglas editoriales de
  `institutionalVoice.js`, que desde v4.666 están en UN solo sitio. Si se
  duplican, la voz de la plataforma se bifurca en silencio.
- **`ReelCopy` es una tabla de VERSIONES.** Nunca se actualiza una fila: editar,
  regenerar o restaurar inserta una versión nueva y baja la bandera de la
  anterior. Un índice único parcial (`WHERE "isCurrent"`) hace imposible que dos
  versiones se declaren vigentes a la vez. Restaurar tampoco borra: recupera la
  versión antigua como una nueva.
- **El contador de caracteres mide el texto COMPLETO** —descripción + CTA +
  hashtags—, que es lo que cuenta la red. Medir sólo la descripción dejaría
  pasar textos que la plataforma corta sola.
- **Un texto que se pasa del límite se recorta sin partir palabras.** Un copy
  cortado a mitad de palabra se lee como un error del sistema.
- El medidor de créditos es **propio** (`REEL_MONTHLY_CREDIT_LIMIT`), no el saldo
  real de KIE. No presentarlo como el saldo del proveedor.
- **El reparto de motores está DECLARADO, no sólo cumplido** (v4.669,
  `USAGE_PROVIDERS[].allows` en `reelUsage.js`). Cada proveedor enumera los
  scopes que le corresponden y cada operación declara el suyo; el panel compara
  lo declarado con lo ocurrido y marca en rojo lo que se salga. Hasta v4.668 el
  reparto era correcto pero sólo se podía comprobar leyendo el código, y la
  pregunta «¿KIE está haciendo cosas que no le tocan?» no tenía respuesta en la
  pantalla. **KIE anima y adapta imágenes** (`enableAudio: false` siempre: los
  clips se piden mudos), **ElevenLabs pone voz y música**, **el modelo de
  lenguaje escribe** (`copywritingService.js` — OpenAI/Anthropic/Gemini, nunca
  KIE) y **FFmpeg monta**. `kie_music` sigue declarado pero fuera de la cadena
  automática por licencia, como dice su propia regla.
- **Se registra lo que se MIDE y se dice lo que se estima.** El tiempo y las
  unidades naturales —caracteres sintetizados, segundos de música, tokens
  leídos de la respuesta del proveedor— son medidas. Los créditos son la
  estimación propia. **El costo en dinero sólo aparece con tarifa configurada**
  (`REEL_RATE_*`): sin ella el panel dice «sin tarifa configurada», no «$0».
  Un cero es una afirmación; un hueco es la verdad.
- **Los caracteres de la locución son los de TODOS los intentos**, no los del
  guion final. El Narrative Timing Engine sintetiza varias veces y el motor de
  voz cobra cada síntesis: contar sólo la última haría parecer la voz más barata
  de lo que fue.
- **Música, copies y locución se lanzan en el PRIMER SONDEO, no al crear**
  (v4.669, `advanceSideTracks`). Las tres son lentas —la música de ElevenLabs es
  síncrona— y ninguna hace falta para contestar «el Reel arrancó»: dentro del
  `POST` sumaban ~40-60 s a la espera inicial mientras los clips ya corrían por
  su cuenta. Siguen yendo en paralelo con los clips, que es lo que las hacía
  gratis en tiempo de reloj. **No convertirlas en fire-and-forget**: en Vercel
  la función se congela al cerrar la respuesta y el trabajo quedaría a medias;
  por eso se difieren a un sondeo y no se sueltan en segundo plano. El UPDATE
  condicional sobre `sideTracksAt` es lo que impide que dos sondeos simultáneos
  las lancen dos veces.
- **La locución ya no se genera en el montaje.** El comentario que lo justificaba
  decía que hacía falta la duración REAL de la pieza, pero `produceNarration`
  siempre se sincronizó contra `config.timing.finalDurationSec`, que se calcula
  al crear y no cambia porque una escena se regenere: la duración de cada escena
  está fijada desde el principio. Generarla al final no la hacía más exacta,
  sólo la ponía en el camino crítico. Queda como red de seguridad para el Reel
  cuyo intento anterior falló y para el montaje relanzado a mano.
- **La Biblioteca es el inventario de lo GENERADO, no la lista de lo aprobado**
  (v4.669). Hasta v4.668 `autoSaveToLibrary` sólo guardaba con veredicto `ready`,
  y como la validación marca `needs_review` por cosas menores —una tasa de bits
  baja en un plano fijo, dos décimas de desvío en la duración— había Reels
  perfectamente utilizables que no aparecían nunca. Ahora entra todo lo que
  tiene archivo y **el estado viaja con la ficha**, visible en cada tarjeta.
- **La fila de `Media` es el ARCHIVO; la ficha vive en `ReelProject`.** La
  Biblioteca de Reels lee `ReelProject` y sus tablas hijas, no `Media`. Duplicar
  los metadatos en `Media` obligaría a mantener dos verdades y a tocar el modelo
  de Prisma, que es justo lo que evita la regla de base de datos. `mediaId` es
  el puente, y es lo que consumen los demás módulos.
- **La generación NO depende de la pantalla** (v4.670). El "worker" es un
  **Vercel Cron** cada minuto (`/api/cron/reels-tick` → `sweepActiveReels`), no
  un proceso persistente: en Vercel la función se congela al cerrar la
  respuesta, así que una cola con trabajador clásico exigiría infraestructura
  aparte. Hay **tres vías** que llaman al MISMO `advance`: el cron (siempre), el
  webhook de KIE (reacciona en el acto) y el sondeo del navegador (el más
  rápido cuando el usuario mira). Los UPDATE condicionales de dentro son lo que
  impide que dos hagan el mismo trabajo. No quitar ninguna: sin el cron, un Reel
  se queda parado si el usuario cierra la pestaña y el webhook no llega.
- **El barrido tiene presupuesto de tiempo y ventana** (`timeBudgetMs`, 6 h).
  La función corta a los 120 s: se atienden los Reels que quepan y el resto
  espera al minuto siguiente —no se pierden—. Y un Reel sin tocar en 6 horas
  deja de barrerse: no es un render lento, es uno perdido, y seguir gastando el
  presupuesto en él dejaría sin atender a los vivos.
- **La fila del Reel se INSERTA antes de llamar a ningún proveedor** (estado
  `queued`). Dirigir cuesta ~20 s de visión y narrativa, y hasta v4.669 durante
  esos 20 s el Reel no existía en ninguna parte: quien abría la Biblioteca no
  veía nada y quien cerraba la pestaña perdía el rastro. Con la fila creada
  primero la tarjeta aparece al instante, el barrido puede recogerlo aunque la
  petición muera a mitad, y un fallo al dirigir deja un Reel **con su motivo
  escrito** en vez de no dejar nada.
- **Cancelar NO detiene al proveedor.** Su API no lo permite y los créditos ya
  se gastaron. Lo que se detiene es NUESTRA máquina de estados: no se descargan
  los clips que lleguen, no se lanza lo que faltara y no se pide el montaje. La
  confirmación lo dice con esas palabras. Prometer que se cancela el proveedor
  sería falso.
- **Reintentar conserva lo que ya costó**: fotos, configuración, copies, música
  y locución. Sólo se relanzan las escenas sin clip. Sin escenas rotas el fallo
  estaba en el montaje y se vuelve a montar con los clips que ya existen — no se
  regenera ninguna escena. Repetir el proceso entero por un fallo de montaje
  sería gastar tres veces los créditos de video para nada.
- **El progreso se sondea; no hay WebSocket ni SSE.** La API corre en funciones
  serverless con tope de 120 s: una conexión abierta se cortaría sola y
  consumiría tiempo de función esperando. El intervalo del navegador **sólo
  existe mientras hay trabajo** — con todo terminado, el efecto se desmonta y no
  se consulta más.
- **El tiempo restante es una ESTIMACIÓN por etapas** (`STAGE_ETA_SEC`), y la UI
  dice «aprox.». No sale del histórico del club a propósito: con tres o cuatro
  Reels generados la media diría más del azar que del proceso. La cola del
  proveedor varía por hora y no la controlamos.
- **Duplicar NO clona el archivo**: devuelve la configuración y las fotos para
  abrir el creador ya relleno. Un duplicado existe para volver a generar con
  otra música u otro motor; copiar los clips daría un gemelo inútil, y copiar la
  ficha sin regenerar dejaría dos entradas de Biblioteca apuntando al MISMO mp4
  —peor, porque borrar una rompería la otra—. No gasta créditos hasta que el
  usuario confirma.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `REEL_RENDER_PROVIDER` | `ffmpeg` (default) \| `shotstack` \| `creatomate` \| `json2video` |
| `REEL_RENDER_FALLBACK` | Proveedor de respaldo si el principal falla |
| `FFMPEG_PATH` | Apuntar a un ffmpeg del sistema en vez del empaquetado |
| `SHOTSTACK_API_KEY` / `CREATOMATE_API_KEY` / `JSON2VIDEO_API_KEY` | Credencial del montaje |
| `SHOTSTACK_ENV` | `stage` para el entorno de pruebas gratuito |
| `REEL_DEFAULT_ENGINE` | Motor principal (default: `kling26`) |
| `REEL_MODEL_KLING26` y compañía | Corregir el id de un modelo sin desplegar |
| `REEL_ENGINE_VEO3_ENABLED`, `REEL_ENGINE_MINIMAX_ENABLED` | Habilitar motores tras verificar su id |
| `REEL_MUSIC_PROVIDER` | Fuerza un motor de música concreto (sin respaldo) |
| `ELEVENLABS_MUSIC_MODEL` | Modelo de ElevenLabs Music (default `music_v1`) |
| `STABILITY_API_KEY`, `STABLE_AUDIO_MODEL` | Respaldo de música |
| `REEL_MUSIC_MODEL` | Modelo de Suno vía KIE, si se activa a propósito |
| `REEL_MONTHLY_CREDIT_LIMIT` | Freno de gasto mensual |
| `REEL_CREDITS_EXPANSION` | Créditos estimados por adaptación de lienzo (4 por defecto) |
| `REEL_RATE_KIE_CREDIT_USD` y compañía | Tarifas del panel de auditoría. Sin ellas no hay costo en dinero, a propósito |
| `CRON_SECRET` | Protege `/api/cron/reels-tick`, igual que el resto de los crons |
| `REEL_TTS_PROVIDER` | `elevenlabs` \| `openai` (por defecto: el que tenga credencial) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_FEMALE/MALE`, `ELEVENLABS_MODEL` | Voz con acento latino real |
| `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` | Voz con la credencial que la plataforma ya tiene |
| `EXPANSION_PROVIDER`, `EXPANSION_MODEL_*` | Motor de la Expansión Inteligente y sus ids |
| `EXPANSION_MIN_PRESERVATION` | Conservación mínima del original (0-1, default 0.82) |
| `EXPANSION_CREATIVITY`, `EXPANSION_MAX_GROWTH`, `EXPANSION_TOLERANCE` | Cuánto puede inventar, cuánto crecer y cuándo no tocar la foto |
| `EXPANSION_MAX_RETRIES`, `EXPANSION_AUTO_REGENERATE` | Reintentos cuando la medición no llega al umbral |

**Typecheck:** `npm run typecheck` (`tsc -p tsconfig.app.json`). **No usar
`tsc -p tsconfig.json` NI `npx tsc --noEmit` a secas** — sin `-p` toma el
raíz. Pasó de verdad en v4.687: se corrió el comando desnudo, no revisó nada,
y un identificador borrado por descuido dejó **todo el panel en blanco** en
producción. `vite build` tampoco lo detecta: esbuild quita los tipos sin
comprobarlos, así que un identificador inexistente compila y sólo revienta al
pintar. **La única comprobación real es `npm run typecheck`.**

El proyecto arrastra ~340 errores previos, en su mayoría imports sin usar —
pero también identificadores inexistentes que revientan en runtime al pintar
esa pantalla. `ClipboardList` en `AdminLayout.tsx` era uno y se corrigió en
v4.688; `Plus` en `MissionControl.tsx` sigue pendiente. Al tocar un archivo,
dejarlo sin errores propios, y mirar si arrastra alguno de estos: son
pantallas en blanco esperando a que alguien entre.

**Hooks: `npm run check:hooks`.** Es la OTRA causa de pantalla en blanco, y el
typecheck **no** la ve — el código es válido y está bien tipado. React
identifica cada hook por su ORDEN de llamada: si un render llama a más hooks
que el anterior, aborta el árbol entero y no queda nada pintado. Pasó en
v4.689: un `useMemo` escrito debajo de los dos returns tempranos de
`PostulacionesPagos.tsx` (`Cargando módulo…` y `Tu perfil no tiene acceso`) no
se ejecutaba en el primer render y sí en el segundo, así que el panel se caía
**justo al terminar de cargar**. Reproducido con React real: `Rendered more
hooks than during the previous render`, HTML vacío.

- **Todo hook va arriba del componente, antes de cualquier `return`.** Lo
  condicional se resuelve DENTRO del hook (`useEffect(() => { if (x) return; …
  })`) o moviendo el `return` debajo. Es lo que se hizo en
  `SuperAssistantDrawer.tsx` (cortaba por rol antes del `useEffect`, y `useAuth`
  entrega el rol en el segundo render) y en `HeroSection.tsx` (cortaba hacia el
  hero de Evento antes del `useEffect`, y `club` llega del contexto).
- **Un hook dentro de un `.map` depende del largo de la lista.** Se extrae un
  componente por elemento — `StatCell` en `LandingPage.tsx`. Funcionaba sólo
  porque `STATS` es constante; el día que se volviera dinámica, caída.
- **No nombrar `useAlgo` a un ayudante que no es un hook.** El linter lo trata
  como hook y el aviso real se pierde entre falsos positivos
  (`useExample` → `applyExample` en `ProjectAIModal.tsx`).
- `scripts/check-hooks.mjs` corre en `prebuild` y **rompe el despliegue**. Mira
  sólo `react-hooks/rules-of-hooks`, no `npm run lint`: el proyecto arrastra
  cientos de avisos heredados y el que importa se perdería entre ellos. Degrada
  a aviso si ESLint no se puede ejecutar — un despliegue no debe caerse por una
  dependencia de desarrollo ausente.

**Pendientes conocidos:** el outro adjunto sigue viajando en `config.outro` y no
se concatena al montaje —con FFmpeg ya disponible, engancharlo es agregar su
clip al final de `buildEditSpec`—; y los motores `runway_gen4` y `luma_ray2`
están declarados con `available:false` porque necesitan su propio adaptador (hoy
sólo existe el de KIE).

## WhatsApp CRM — motor de automatización — v4.701

El módulo dejó de ser sólo un enviador de campañas manuales. Ahora observa el
estado de cada sitio, lo ubica en un momento del ciclo de vida y dispara
recorridos a partir de las TRANSICIONES.

**La plataforma es el único remitente.** El motor emite desde el WABA del club
«Origen» (`crmTenant.js`) hacia los dirigentes de cada club cliente. No hay un
WABA por club. El administrador de un sitio sólo CONSULTA lo suyo.

| Archivo | Qué es |
|---|---|
| `server/lib/lifecycleSpec.js` | Los 17 estados y la derivación (función PURA) |
| `server/lib/crmLifecycle.js` | La pasada de observación: señales, persistencia y eventos |
| `server/lib/crmEventBus.js` | Catálogo de eventos y registro idempotente |
| `server/lib/crmSegments.js` | Audiencias dinámicas (catálogo cerrado de campos) |
| `server/lib/crmGuardrails.js` | Consentimiento, exclusión, horario, frecuencia, duplicados |
| `server/lib/journeySpec.js` | Nodos, condiciones, variables y validación del grafo |
| `server/lib/journeyEngine.js` | Inscripción y avance de las inscripciones |
| `server/lib/journeySeeds.js` | Bienvenida y Renovación precargados |
| `server/lib/whatsappSender.js` | Envío de plantilla + registro en el log |
| `server/lib/crmTenant.js` | Resolución del sitio «Origen» |
| `server/lib/ensureAutomationSchema.js` | Crea las 7 tablas en runtime |
| `src/components/admin/whatsapp/JourneyBuilder.tsx` | Constructor visual |
| `src/components/admin/whatsapp/LifecycleBoard.tsx` | Tablero, guardias y exclusión |
| `server/lib/crmIntents.js` | Catálogo CERRADO de intenciones y su detección |
| `server/lib/crmInbox.js` | Estado de la atención, enrutamiento y agentes |
| `server/lib/crmChatbot.js` | Orquesta un entrante: conversación, intención, ruta y respuesta |
| `server/lib/crmTraining.js` | Puente con el módulo de Capacitaciones (sólo lectura) |
| `src/components/admin/whatsapp/ConversationInbox.tsx` | La bandeja |
| `server/lib/crmAnalytics.js` | Métricas y conversiones ATRIBUIDAS |
| `server/lib/crmAlerts.js` | Alertas internas y presupuesto |
| `server/lib/crmRecommendations.js` | Hallazgos por regla + redacción con modelo |
| `src/components/admin/whatsapp/CrmAnalytics.tsx` | Inteligencia: analítica, campañas, calendario |
| `server/lib/templateSpec.js` | Reglas de Meta, carpetas y traducción al payload |
| `server/lib/templateComposer.js` | Redactor con IA + bucle de validación |
| `server/controllers/crm/templates.controller.js` | Biblioteca, carpetas y envío a Meta |
| `src/components/admin/whatsapp/TemplateLibrary.tsx` | La biblioteca |

Pruebas: `npm run test:crm` (178 casos). Necesita una `DATABASE_URL` de una base
**vacía** con el schema aplicado; el guion aborta si la cadena parece de un
entorno real. La llamada a Meta se intercepta reemplazando `globalThis.fetch`.

**Reglas durables:**

- **Los eventos se OBSERVAN, no se empujan.** El pedido enumera 21 eventos
  repartidos por once módulos. Instrumentar 21 puntos de llamada habría atado el
  motor a código ajeno y, peor, habría perdido el evento para siempre cuando esa
  línea fallara o el hecho ocurriera por otra vía (una corrección a mano en la
  base, una importación masiva). `sweepDerivedEvents` MIRA el estado real y es
  autorreparable: si el motor estuvo caído dos días, al volver observa igual.
  `recordEvent` queda exportado para quien quiera menos latencia; comparten
  `dedupeKey`, así que no se duplica.
- **Un sitio visto por primera vez NO emite transición.** La primera vuelta
  encuentra `CrmLifecycleState` vacía; sin esta regla TODOS los sitios
  «entrarían» en su estado a la vez y se inscribirían en todos los recorridos el
  día del despliegue. La primera observación sólo fotografía.
- **Los eventos derivados tienen ventana** (`CRM_EVENT_LOOKBACK_DAYS`, 7). Un
  proyecto publicado hace tres años es un hecho, no una noticia. Sin la ventana
  la primera pasada emitiría el historial completo de la plataforma como si
  acabara de ocurrir.
- **La transición es el disparador, no el estado.** «Está vencido» no es un
  evento; «acaba de vencer» sí. Por eso el estado se PERSISTE en vez de
  recalcularse y descartarse, y por eso la fila guarda también el anterior.
- **`contentTracked:false` significa «no lo medimos», no «no tiene».** Un
  distrito no tiene `Post` ni `Publication` colgando. Sin esa distinción todos
  los distritos caían para siempre en «en implementación» por una ausencia que
  nunca se iba a llenar.
- **`prospecto` y `cancelado` no se deducen**: son `manualOnly`. La plataforma no
  observa nada que los distinga, y fabricarlos desde una señal parecida sería
  inventar. `manualState` gana sobre la derivación.
- **APLAZAR y DESCARTAR no son lo mismo, y confundirlos es el defecto clásico.**
  Fuera de horario o pasado el tope de frecuencia el mensaje se APLAZA
  (`defer` + `retryAt`) y sale cuando corresponde. Una baja, una exclusión o un
  número inválido lo DESCARTAN (`skip`). Tratar «es de noche» como descarte
  pierde el mensaje; tratar «pidió la baja» como aplazamiento lo convierte en
  acoso diferido.
- **La ventana horaria se evalúa en la zona del DESTINATARIO.** La función corre
  en UTC y «las 8 de la mañana» no significa lo mismo en Bogotá que en Madrid.
  Hay clubes en varios países.
- **La lista de exclusión vive aparte del contacto** (`CrmSuppression`, por
  NÚMERO). Es lo que hace que la baja sobreviva a que el contacto se borre y se
  vuelva a crear, que es exactamente como se le termina escribiendo a quien pidió
  que no. Probado en `test:crm`.
- **La condición de salida se evalúa ANTES DE CADA PASO, no sólo al inscribir.**
  El recorrido de renovación dura 75 días y el club renueva en medio. Es lo que
  impide seguir cobrándole la renovación a quien ya renovó, y recordarle el
  onboarding a quien ya lo completó.
- **Una variable sin resolver NO se envía.** Meta rechaza el parámetro vacío y,
  aunque no lo hiciera, «tu sitio vence el » es peor que no mandar nada. Se anota
  una alerta interna y se sigue.
- **`clicked` no existe como condición y no es un olvido.** La Cloud API informa
  `sent`, `delivered`, `read` y `failed`; el clic en un botón de URL **no** se
  reporta. Lo único observable es el botón de respuesta rápida, que llega como
  mensaje entrante y por eso se pregunta con `replied`. Declarar `clicked` daría
  una rama que nunca sería verdadera. No agregarla.
- **Los recorridos sembrados nacen en `draft` y SIN `templateId`.** Una plantilla
  la aprueba Meta y vive en la cuenta del cliente: sembrar un recorrido activo
  que apunte a plantillas inventadas daría uno que falla en el primer envío o
  —peor— que parece funcionar. Cada paso trae `templateHint` con qué debe decir
  la suya, y `validateJourney` impide activar hasta que estén asignadas. La
  siembra es **aditiva e idempotente**: una vez creado, el recorrido es del
  operador y un despliegue no vuelve a tocarlo (misma regla que el Generador de
  Pendones).
- **El grafo se guarda como documento JSON**, no normalizado: se lee y se escribe
  siempre entero, y normalizarlo obligaría a migrar el esquema cada vez que
  aparezca un tipo de nodo nuevo, sin ganar ninguna consulta.
- **`entryNodeId` vive en `settings`, no es «el primer nodo del array».**
  Funcionaría hoy y se rompería el día que alguien reordene los pasos.
- **Un ciclo sin espera se rechaza al guardar.** Un bucle que no pasa por un
  `wait` gira sin fin dentro de una vuelta del motor. Un ciclo CON espera es
  legítimo (un recorrido que sondea) y se permite.
- **Una regla de audiencia con campo u operador desconocido se DESCARTA y se
  reporta** (`skipped`), no se ignora en silencio: un filtro que no se aplica
  ENSANCHA la audiencia, que en un motor de envíos es el error que no se puede
  pasar por alto. Los campos y operadores son un catálogo cerrado; ningún valor
  del cliente entra en el SQL.
- **El JOIN con `CrmLifecycleState` es LEFT.** Con INNER, vincular mal un
  contacto lo volvería invisible sin decirlo.
- **Un recorrido activo que se edita hasta quedar inválido se PAUSA solo.**
  Dejarlo activo lo haría fallar contacto por contacto en el próximo tick.
- **Un recorrido con inscripciones vivas no se borra, se pausa.** Borrarlo
  dejaría inscripciones apuntando a un grafo inexistente, y con ellas la única
  traza de por qué un club recibió lo que recibió.
- **El bloqueo es un UPDATE condicional sobre la fila** (`lockedAt`), igual que
  en el Creador de Reels: es lo que impide que el cron, el webhook y el panel
  hagan el mismo envío dos veces.
- **El orden del tick es observar → inscribir → avanzar**, y no otro: así un club
  recién activado recibe su primer mensaje en el mismo minuto. Al revés harían
  falta tres vueltas.
- **Las columnas nuevas de `WhatsAppContact` y `WhatsAppMessageLog` están
  declaradas EN `schema.prisma` además de en el ensure.** El guardián de
  `db:push` compara TABLAS, no columnas: una columna que existiera sólo en el
  ensure la borraría el primer `npm run db:push` sin que nada avisara.
- **`sendCampaign` conserva su propia copia de la lógica de envío.** Unificarla
  con `whatsappSender.js` es deseable pero cambia el camino por el que hoy salen
  las campañas manuales de producción. Al corregir algo del envío, mirar los dos
  sitios.

### Fase 3 — bandeja, intención y enrutamiento (v4.696)

- **Una conversación NO guarda mensajes.** Ya viven en `WhatsAppMessageLog`;
  duplicarlos daría dos verdades sobre el mismo hilo. `CrmConversation` guarda el
  ESTADO de la atención: en qué punto está, quién la tiene, qué quería la persona
  y qué sitio hay detrás.
- **Un hilo abierto por contacto, por índice único PARCIAL** (`WHERE "closedAt"
  IS NULL`). Al cerrarse deja el lugar libre y el mensaje siguiente abre otro, así
  el historial queda por episodio. Ojo: por ser parcial, el `ON CONFLICT` tiene
  que repetir el predicado o la sentencia falla entera — mismo error que costó una
  corrección en v4.648.
- **`resuelto` NO cierra; `cerrado` sí.** Un hilo resuelto que recibe un mensaje
  vuelve a `nuevo` en vez de quedarse ahí con alguien esperando. Sólo `cerrado`
  libera el índice.
- **La detección de intención va de lo exacto a lo inseguro**: botón pulsado →
  palabras clave → modelo. Empezar por el modelo costaría una llamada por mensaje
  para resolver lo que una palabra clave resuelve, y haría el enrutamiento no
  reproducible («¿por qué esto fue a soporte?»). Gana la coincidencia MÁS LARGA:
  «ayuda técnica» tiene que ganarle a «ayuda».
- **El catálogo de intenciones es CERRADO.** Si el modelo contesta algo que no
  está, se descarta y queda `otro`. Una etiqueta inventada no enruta a ningún
  equipo y no se puede reportar.
- **El chatbot viene APAGADO y el seguimiento no.** La bandeja clasifica y enruta
  siempre —eso no le manda nada a nadie—, pero las respuestas automáticas sólo
  salen con `chatbot.enabled`. El sitio ya tenía dos respondedores en producción
  (`WhatsAppAutoReplyRule` y `WhatsAppAgentConfig`, en `whatsappAgent.js`) y
  cambiar lo que reciben los contactos no es un efecto secundario aceptable de
  agregar una bandeja. Cuando el bot contesta, el respondedor histórico se saltea
  para no mandar dos mensajes por el mismo entrante.
- **La BAJA se atiende siempre**, encendido o no el chatbot, y antes que nada.
  Que la respuesta automática esté apagada no puede significar ignorar a quien
  pide no recibir más mensajes.
- **`clicked` sigue sin existir.** Un botón de respuesta rápida llega como
  mensaje entrante y por eso lo detecta el catálogo de intenciones; el clic en un
  botón de URL Meta no lo reporta.
- **El reparto de conversaciones es por CARGA, no por turnos.** Con turnos, quien
  estuvo ausente vuelve y recibe lo mismo que quien atendió todo el día.
- **Sin agente disponible, la conversación se enruta al EQUIPO igual** y queda sin
  asignar. Dejarla sin equipo la volvería invisible en los filtros, que es peor
  que verla sin dueño.
- **Tomar un hilo es un UPDATE condicional** (`WHERE "assignedTo" IS NULL`): si
  otro agente llegó primero, este pierde y se le dice quién lo tiene. Sin la
  condición, dos personas creerían tenerla.
- **Escalar crea un `TechnicalRequest` REAL**, no una tarea propia del CRM. El
  equipo ya trabaja en ese módulo; una cola paralela sería un segundo lugar donde
  mirar, y las que se olvidan son siempre las del segundo lugar. Sin sitio
  vinculado NO se escala: se dice por qué, en vez de colgar la solicitud del
  Origen y dejarla en la cola equivocada.
- **El error de Meta al responder se propaga TEXTUAL.** Fuera de la ventana de 24
  horas un mensaje libre se rechaza y hay que usar una plantilla; convertirlo por
  lo bajo dejaría a quien atiende sin entender qué pasó.
- **Las capacitaciones NO se duplican.** El catálogo y las citas viven en el
  módulo de Capacitaciones y desde acá sólo se leen. Copiar las categorías daría
  dos listas que se separan en silencio y el CRM ofrecería un tema que no se puede
  reservar.
- **La recomendación de capacitación sigue el `sortOrder` del catálogo**, que ya
  es el itinerario que definió el equipo. Inventar un segundo criterio se
  contradiría con el suyo. Si ya las hizo todas, no recomienda nada: repetir la
  última sería empujar por empujar.
- **El recorrido de Onboarding no repite los recordatorios de 24 h y 1 h** de la
  cita: los manda el módulo de Capacitaciones por correo
  (`/api/cron/training-reminders`). Duplicarlos le llegaría dos veces a la misma
  persona por el mismo hecho.
- **`crm_agent` está en las DOS listas `ADMIN_ROLES`** (servidor y `src/App.tsx`),
  y NO en `SITE_ADMIN_ROLES`: entra al panel para atender su bandeja y nada más.
- **Un administrador de sitio no ve las notas internas ni la traza.** Están
  escritas para el equipo y hablan de su organización.

### Fase 4 — analítica, campañas y optimización (v4.697)

- **Una conversión se DERIVA, no se declara.** Es la coincidencia de un mensaje
  que salió y un evento del sistema POSTERIOR, del mismo sitio, dentro de
  `CRM_ATTRIBUTION_DAYS` (14). Un contador que alguien incremente al enviar
  mediría envíos, no resultados.
- **Es ATRIBUCIÓN, no causalidad, y la UI lo dice.** El club pudo renovar solo.
  El número responde «de los que recibieron esto, cuántos hicieron aquello
  después». Llamarlo «renovaciones generadas» sería atribuirse un mérito que el
  dato no demuestra.
- **Las conversiones se cuentan por SITIO, no por mensaje.** Tres dirigentes del
  mismo club que reciben el aviso y un club que renueva son UNA renovación.
  Contar por mensaje infla el número con el tamaño de la audiencia.
- **«Respondido» no existe como columna** y no se agrega una: se cuenta el
  saliente que tuvo un entrante del mismo contacto DESPUÉS. Es la única
  definición observable.
- **La muestra insuficiente se declara, no se esconde** (`enoughSample`,
  `MIN_SAMPLE` = 20). Con seis envíos, un 100 % de lectura no dice nada, y
  ordenar por esa tasa pondría arriba justo lo que menos se sabe.
- **Sin tarifa configurada el costo es NULL, no 0.** Un cero es una afirmación
  falsa; un hueco es la verdad. Misma regla que el panel de auditoría del Creador
  de Reels. El costo es una ESTIMACIÓN propia sobre ventanas de 24 h: la Cloud
  API no devuelve el importe y Meta cobra por conversación y país.
- **El corte por presupuesto está APAGADO por defecto** (`budgetHardStop`).
  Frenar los envíos por un número estimado puede dejar sin avisar a un club que
  vence mañana; quien lo enciende elige ese riesgo. Se comprueba una vez por
  vuelta del cron, no por envío.
- **La asignación de variantes A/B es ESTABLE, no aleatoria** (hash FNV-1a de
  nodo+contacto). Con `Math.random()` un reintento —por horario o por fallo de
  red— movería al contacto de rama, y el resultado mediría la suerte en vez de
  las variantes. Además es reproducible sin haberlo guardado. Peso 0 saca una
  variante del reparto sin romper las inscripciones que ya estaban en ella.
- **Las variantes de un `split` son salidas como cualquier otra**: entran en la
  detección de referencias colgantes y de ciclos (`outgoingTargets`). Olvidarlas
  dejaría pasar una rama rota que revienta en producción.
- **Del token NO se declara vencimiento.** Meta no nos dice cuándo vence y no
  tenemos las credenciales de la app para consultarlo. Se avisa por lo
  observable: que rechazó una llamada (código 190) o que hace mucho que nadie
  verifica la conexión. Decir «vence en 5 días» sin poder saberlo es peor que no
  avisar.
- **Las alertas se deduplican por PERÍODO** (día o mes según el tipo), no por
  existencia: una condición que persiste tiene que volver a avisar mañana, pero
  no cada cinco minutos. Y el volumen se agrupa: veinte alertas iguales informan
  menos que una que diga «veinte».
- **El barrido de alertas va al FINAL del tick**, después de observar, inscribir
  y avanzar: depende del estado que esas tres etapas acaban de dejar.
- **La IA de las recomendaciones NO mira los datos.** Los hallazgos los calcula
  SQL con reglas, cada uno con su evidencia; el modelo sólo los redacta. Darle la
  base y pedirle «decime qué mejorar» produciría cifras plausibles y no
  auditables, que en un módulo que decide a quién escribirle son peligrosas. Sin
  credencial de modelo las recomendaciones se muestran igual, con su texto de
  regla.
- **Ninguna recomendación se aplica sola.** Son sugerencias con un enlace a la
  pantalla donde se resuelven.
- **El calendario muestra inscripciones REALES con espera pendiente**, no una
  proyección del grafo. Un recorrido de diez pasos sin inscripciones vivas no va
  a mandar nada, y el calendario tiene que reflejarlo.
- **El centro de campañas unifica en la LECTURA, no en el modelo.** Una campaña
  es un envío puntual y un recorrido es una máquina que corre sola; se muestran
  juntos porque para quien mira el mes son lo mismo.

### Biblioteca de plantillas con IA (v4.701)

- **`createTemplate` NUNCA mandaba la plantilla a Meta.** Insertaba una fila local
  con estado `pending` y nada más, así que la plantilla no existía para la Cloud
  API y un recorrido que la usara fallaba con «template name does not exist». Lo
  corrige `submitToMeta` (`POST /{waba}/message_templates`). La ruta vieja
  `/templates` se conserva porque la usan la pestaña original y `sendCampaign`.
- **El modelo escribe; el CÓDIGO decide si es válido.** Las reglas de Meta son
  aritméticas —1024 caracteres de cuerpo, variables numeradas sin saltos, ni al
  principio ni al final, topes por tipo de botón— y un modelo de lenguaje las
  incumple con naturalidad aunque se le pidan. `composeTemplate` valida con
  `validateTemplate` y REINTENTA devolviéndole los errores concretos. Pedirle
  «revisá el formato» no corrige nada: hay que decirle qué regla rompió.
- **Un rechazo de Meta no es gratis**: baja la calificación de calidad de la
  cuenta y puede limitar el volumen diario. Por eso se valida antes y por eso
  enviar es un paso explícito con confirmación, no algo que pase al redactar.
- **`folder` y `category` son DOS cosas y por eso son dos columnas.** `folder` es
  la organización interna (bienvenida, renovación…); `category` es lo que se le
  declara a Meta —UTILITY o MARKETING— y define el precio por conversación y si
  hace falta consentimiento. Mezclarlas obligaría a elegir entre ordenar el
  trabajo y declarar la verdad.
- **AUTHENTICATION no se ofrece.** Es para códigos de un solo uso, con un formato
  que Meta impone, y nada de lo que este módulo manda encaja: ofrecerla sólo
  daría rechazos.
- **`example` es obligatorio cuando hay variables.** Meta rechaza sin explicar
  bien si falta. Por eso el redactor genera `variableSamples` junto con el texto:
  no son decorativos. Y cuando NO hay variables, no se manda `example` vacío —eso
  también se rechaza—.
- **Una plantilla ya enviada a Meta no se edita.** Allá el texto es inmutable una
  vez aprobado; permitir editarla acá daría dos verdades —lo que muestra el panel
  y lo que WhatsApp envía—. Se bloquea y se ofrece duplicar. Lo único editable es
  la carpeta.
- **El índice único es (clubId, name)** porque en Meta el nombre es único por
  cuenta. Sin él, dos plantillas homónimas se guardan bien acá y la segunda es
  rechazada allá.
- **`variableTokens` ata cada `{{n}}` a un dato que el motor sabe resolver.** Sin
  esa columna una plantilla se aprueba pero ningún recorrido puede alimentarla.
- **No se borra una plantilla que un recorrido usa**: el recorrido quedaría
  apuntando a algo inexistente y fallaría en el próximo envío.
- **El error de Meta se propaga TEXTUAL.** Sus rechazos son específicos y
  convertirlos en «no se pudo enviar» deja a quien corrige sin saber qué.
- **La voz sale de `institutionalVoice.js`**, la misma del Generador de
  Publicaciones y del Creador de Reels. Escribir una voz propia acá bifurcaría en
  silencio cómo habla la plataforma.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `CRM_PLATFORM_CLUB_ID` | Sitio «Origen» desde el que emite la plataforma |
| `CRM_EVENT_LOOKBACK_DAYS` | Ventana de los eventos derivados (7 por defecto) |
| `LIFECYCLE_RENEWAL_WINDOW_DAYS` | Preaviso de renovación (45) |
| `LIFECYCLE_GRACE_START_DAYS` / `LIFECYCLE_GRACE_END_DAYS` | Tramos de gracia (3 / 5) |
| `LIFECYCLE_REACTIVATED_WINDOW_DAYS` | Cuánto dura el estado «reactivado» (14) |
| `LIFECYCLE_LOW_USAGE_DAYS` | Días sin contenido para considerar bajo uso (30) |
| `CRM_ATTRIBUTION_DAYS` | Ventana de atribución de conversiones (14 por defecto) |
| `CRON_SECRET` | Protege `/api/cron/crm-automation-tick`, como el resto de los crons |

Las guardias de envío (horario, frecuencia, consentimiento, enlaces
institucionales) **no** son de entorno: viven en `PlatformConfig` bajo
`crm_automation_settings` y se editan desde el panel, sin desplegar.

### Auditoría y diagnóstico (v4.702)

El módulo no dejaba **ningún rastro persistente**. Todo iba a `console.warn` /
`console.error`, efímeros en Vercel, así que «¿Meta mandó los estados del 3/8?»
no tenía respuesta posible: no había dónde mirar. Eso era el defecto de fondo
detrás de «las conversaciones y las campañas no reflejan lo esperado» — no se
podía diagnosticar nada retroactivamente.

| Archivo | Qué es |
|---|---|
| `server/lib/crmWebhookAudit.js` | `CrmWebhookEvent` + `CrmOutboundLog`: persistencia, firma y consultas |
| `server/lib/crmDiagnostics.js` | Comprobaciones en vivo contra Meta y contra nuestra base |
| `server/controllers/crm/diagnostics.controller.js` | API del panel (sólo operador de plataforma) |
| `src/components/admin/whatsapp/CrmDiagnostics.tsx` | La pestaña «Diagnóstico» |

Pruebas: `npm run test:crm:diag` (69 casos, incluidas seis de punta a punta que
llaman al `handleWebhook` real). Misma exigencia que `test:crm`: base vacía.

**Reglas durables:**

- **La fila del webhook se abre ANTES de procesar y se cierra después de
  responder el 200.** Antes, porque un fallo a mitad de proceso tiene que dejar
  rastro —es justo el caso que hay que diagnosticar—; después del 200, porque la
  bitácora es registro nuestro y no puede sumar latencia al acuse que Meta
  espera. Meta da de baja la suscripción cuando el endpoint tarda.
- **El payload se guarda COMPLETO.** El campo que falta es siempre el que no se
  guardó. Es `jsonb`, así que Postgres normaliza el orden de las claves: se
  conserva el contenido, no los bytes.
- **Un `phoneNumberId` que no coincide se rescata por el WABA.** Era el descarte
  total y silencioso: el identificador guardado se queda viejo cuando alguien
  migra el número o rehace la conexión, y entonces mensajes Y estados se
  perdían. `entry[0].id` es el mismo dato en los dos lados y sobrevive a eso.
  Si aun así no se encamina, queda la fila con su payload y salta
  `webhook_unrouted` — nunca un `return` mudo.
- **Un estado sin envío conocido se CUENTA, no se saltea.** Era un `continue`
  mudo, y es exactamente el caso en que una campaña queda en «0 entregados»
  pareciendo un fallo de entrega. El lote se marca `partial` y dice cuántos.
- **Toda salida hacia Meta pasa por `metaApiCall` y queda registrada** con
  petición, respuesta y `code`. El error de Meta se propaga con `metaCode` /
  `metaDetails`: convertirlo en «no se pudo enviar» deja a quien corrige sin
  saber qué. Hay DOS `metaApiCall` (controlador y `whatsappSender.js`) porque
  hay dos caminos de envío — al tocar uno, mirar el otro.
- **`verifySignature` devuelve `null` cuando no se puede comprobar**, que es
  DISTINTO de `false`. Decir «firma inválida» sin haberla verificado manda a
  buscar un problema de seguridad inexistente. El cuerpo crudo se captura desde
  el `verify` de `express.json` y **sólo para la ruta del webhook**: guardarlo
  para todas duplicaría en memoria cada subida de 25 MB.
- **Una comprobación tiene CUATRO estados**, y `unknown` no es un tipo de «bien».
  Presentar «no se pudo comprobar» como verde manda a buscar el problema donde
  no está. Se pinta distinto a propósito.
- **`GET /{waba}/subscribed_apps` es la comprobación que faltaba.** Meta da de
  baja la suscripción por su cuenta cuando el endpoint falla o tarda; cuando
  pasa, todo parece normal —los envíos salen y se entregan— pero no vuelve
  ningún estado. Sin esta consulta la avería es indistinguible de un problema de
  entrega.
- **«Salieron N y no volvió NINGUNA confirmación» es un diagnóstico distinto de
  «se entregaron pocas».** El primero no es un problema de entrega: los mensajes
  llegaron y lo que no vuelve es la respuesta de Meta.
- **El panel es del OPERADOR de la plataforma.** Lleva identificadores de Meta y
  payloads crudos: infraestructura compartida, no datos de una organización. Lo
  comprueba el controlador, no sólo la pantalla.
- **El diagnóstico es de sólo lectura** salvo la prueba controlada, que manda un
  mensaje real y lo avisa. Un panel que cambia cosas al mirarlas no sirve para
  diagnosticar. Y un 200 en esa prueba confirma que Meta aceptó la llamada, **no**
  que entregó: fuera de la ventana de 24 h acepta y no entrega.
- **`auditSummary` incluye los webhooks con `clubId IS NULL`.** Son justamente
  los que no se pudieron encaminar: filtrarlos escondería la avería que el
  resumen existe para mostrar.

**Estado:** las cuatro fases del pedido están implementadas.

**Pendientes conocidos:** `WhatsAppChat.tsx` se conserva y convive con la bandeja
—es el chat libre de siempre, sin estado ni asignación—; unificarlos cambia una
pantalla que el equipo usa a diario. `sendCampaign` mantiene su copia de la
lógica de envío (ver arriba). Y el chatbot sigue **apagado** hasta que alguien lo
encienda a propósito.

## Inscripciones a eventos / Feria de Proyectos — v4.648

El módulo de **Eventos** maneja la inscripción completa de cada edición de la
feria. La XII (Valledupar 2027) es la primera; el módulo está hecho para que la
XIII se levante **sin tocar código**.

| Archivo | Qué es |
|---|---|
| `server/lib/eventRegistrationSpec.js` | Fuente de verdad: categorías, campos, estados, etiquetas, monedas y cálculo del cobro |
| `server/lib/ensureEventRegistrationSchema.js` | Crea las tablas en runtime (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`) |
| `server/lib/eventRegistrationStore.js` | Acceso a datos común al flujo público y al panel |
| `server/controllers/eventRegistrationController.js` | Flujo público: configuración, borrador, envío, checkout y webhooks |
| `server/controllers/eventRegistrationAdminController.js` | Panel: edición, categorías, tablero, fichas, acreditación y exportación |
| `src/pages/RegistroEvento.tsx` | Asistente público por pasos |
| `src/components/admin/events/EventRegistrationTab.tsx` | Contenedor de las cuatro pantallas del panel |
| `src/lib/qrcode.ts` | Generador de QR propio, sin dependencias (modelo 2, byte, nivel M, v1-10) |

**Reglas durables:**

- **Todo cuelga de `eventId`.** Categoría, inscripción, acompañante, pago,
  comunicación e historial llevan el id del evento. Ninguna consulta del módulo
  devuelve datos de una edición distinta a la que se le pide. Es lo que permite
  que la XII y la XIII convivan sin mezclarse.
- **El precio se congela al enviar el formulario** (`pricing` en la
  inscripción). El checkout lee esa foto guardada, **no** la configuración viva.
  Cambiar el precio o la moneda de una categoría no puede mover lo que ya se le
  prometió a alguien. Y el importe nunca viene del navegador.
- **La confirmación del pago la da el webhook**, no el retorno del navegador.
  `/api/payments/webhook` → `confirmPaidSession`. El regreso desde Stripe sólo
  consulta estado.
- **La idempotencia del webhook es doble**: `EventRegistrationPayment.stripeEventId`
  tiene índice único (parcial) y el UPDATE es condicional
  (`WHERE status <> ALL(SETTLED)`). Un reenvío de Stripe no vuelve a notificar
  ni a ocupar cupo. Ojo: el índice único es **parcial**, así que el
  `ON CONFLICT` tiene que repetir su predicado (`WHERE "stripeEventId" IS NOT
  NULL`) o la sentencia falla entera — fue un error real, corregido en v4.648.
- **Multimoneda**: `currency` es lo que se publica, `settlementCurrency` lo que
  cobra la pasarela. Si difieren, se convierte con `fx` de la edición y se
  guardan **los tres datos**: valor original, valor convertido y tasa. Sin tasa
  configurada NO se inventa una: se cobra en la moneda publicada y el panel
  avisa. La tasa se guarda en `NUMERIC(24,12)` — con menos decimales una tasa
  COP→USD (~0,000244) pierde precisión.
- **El formulario de cada categoría lo arma el servidor** (`buildFormSchema`) y
  viaja al navegador dentro de `category.form`. Agregar una categoría o un campo
  desde el panel no exige desplegar el frontend. El servidor valida siempre.
- **Las etiquetas de sistema** (`internacional`, `nacional`, `cadres`,
  `pago_confirmado`, `pendiente`, `con_acompanantes`) las deduce el módulo de la
  propia inscripción y no se editan a mano; el panel sólo cambia las manuales.
- **El estado no se escribe sin historial.** Todo cambio de estado, etiqueta,
  nota o acreditación deja fila en `EventRegistrationHistory` con usuario, fecha
  y comentario.
- **Una categoría con inscripciones no se borra**, se desactiva. Lo impide el
  servidor, no sólo la pantalla. Y `key` no se edita después de crearla: es lo
  que ata las inscripciones a su categoría.
- **Marcar "reembolsado" en el panel no mueve dinero.** El reembolso se hace en
  Stripe y llega por webhook; el cambio manual sólo refleja el estado
  administrativo.
- **Las siete tablas viven fuera de Prisma** (`EventRegistration`,
  `EventEdition`, `EventRegistrationCategory`, `EventRegistrationCompanion`,
  `EventRegistrationPayment`, `EventRegistrationHistory`,
  `EventRegistrationMessage`), como manda la sección de base de datos de este
  archivo. `EventRegistration` ya existía desde v4.606 con datos de producción:
  se **amplía** con `ADD COLUMN IF NOT EXISTS`, jamás se recrea. Las columnas
  viejas (`ticketKey`, `ticketLabel`, `quantity`) se siguen alimentando.
- **El QR es propio.** No agregar una librería de QR: `src/lib/qrcode.ts` cubre
  hasta 213 bytes, que es de sobra para un código de inscripción. Lleva el
  **código**, no una URL: en la sede puede no haber internet.

### Botones de la ficha pública (v4.650)

La ficha del evento muestra **dos** botones: el principal —nacional o
internacional según quien mire— y **Registro CADRES** debajo, siempre visible.
Cada uno abre `/eventos/:ref/registro?categoria=<clave>`.

| Archivo | Qué es |
|---|---|
| `resolveAudienceHint` / `resolveCtaButtons` en `eventRegistrationSpec.js` | Detección y resolución de los botones |
| `src/components/EventRegistrationCta.tsx` | Los botones en la ficha |
| `src/components/admin/events/EventCtaManager.tsx` | Pestaña "Botones" del panel |

- **Los botones se arman por `audience`, nunca por nombre ni por clave.** El
  administrador renombra las categorías (ya lo hizo: «Rotario Internacional» →
  «Registro Internacional») y los botones deben seguir apuntando a donde deben.
- **La segmentación es del servidor, no de la pantalla.** Con `?categoria=`, el
  endpoint público devuelve **sólo** esa categoría: los precios y los campos de
  las otras no llegan siquiera al navegador. No "mostrar una y ocultar dos".
- **Manda el IDIOMA ACTIVO del sitio, no el país** (v4.652). `es`/`es-CO` abre el
  registro nacional; cualquier otro idioma, el internacional. Nunca los dos. El
  navegador lo manda en `?locale=` tomándolo de `useLang()`, y ese parámetro está
  en las dependencias del efecto, así que cambiar de idioma repinta los botones
  sin recargar. `lang` está en las dependencias **a propósito**: quitarlo deja la
  ficha mostrando el registro del idioma anterior.
  El país (`x-vercel-ip-country`) quedó relegado a respaldo, y sólo actúa cuando
  no llega idioma alguno. Hasta v4.651 mandaba el país, y por eso un visitante
  con el sitio en inglés desde Colombia veía el botón nacional.
- **Los idiomas nacionales se comparan EXACTO** (`DEFAULT_NATIONAL_LOCALES`, y
  `cta.nationalLocales` por evento). `es-MX` o `es-ES` no son `es-CO`: son
  visitantes de fuera. En este sitio el selector ofrece un solo español y es el
  colombiano, por eso `es` cuenta como nacional.
- **El precio y el formulario los define la categoría, no el botón.** Si se
  duplicaran en el botón, podría anunciar un valor y el formulario cobrar otro.
- **Categoría cerrada**: con mensaje configurado el botón se ve apagado y
  explicado; sin mensaje se oculta. Nunca un botón que no lleva a ninguna parte.
- `decorateCategory` **debe** incluir `active`: su salida vuelve a pasar por
  `categoryWindow` dentro de `resolveCtaButtons`, y sin ese campo se dan todas
  las categorías por inactivas y desaparecen todos los botones (error real,
  corregido antes de publicar v4.650).

### Inscribirse con una cuenta que ya existe (v4.692)

Un rotario que ya postuló un proyecto tiene cuenta, contraseña y perfil. El
Registro Nacional lo reconoce y no le pide una segunda credencial.

| Pieza | Qué hace |
|---|---|
| `accountLinkingFor` (`eventRegistrationSpec.js`) | Política por edición y **por audiencia** |
| `identityFromRequest` (`eventAttendeeController.js`) | Quién viene, mirando el token |
| `prefillForIdentity` | Datos de precarga desde su postulación |
| `linkAttendeeAccountTo` | Vincula sin crear una segunda cuenta |

- **La inscripción sigue perteneciendo SIEMPRE a un `EventAttendeeAccount`.** Es
  lo que sostiene el panel, los permisos y el aislamiento por `accountId`. Lo
  nuevo es que esa cuenta puede estar VINCULADA (`linkedRealm` + `linkedId`) a
  una identidad anterior, y entonces no tiene contraseña propia
  (`passwordHash = '!'`): se entra con la de siempre. No hay usuario duplicado
  ni segunda credencial.
- **Se limita por AUDIENCIA, no por clave de categoría** (`audiences:
  ['national']` por defecto). El administrador renombra las categorías; la
  audiencia no cambia. Sólo el nacional porque la cuenta que se reutiliza es la
  del Gestor de Proyectos, y esa convocatoria es para clubes colombianos.
- **La audiencia de una categoría se RESUELVE, no se lee a secas** (v4.694,
  `audienceOfCategory`). `normalizeCategory` siempre deja un valor —`'general'`
  cuando no reconoce ninguno—, así que `category.audience || RESPALDO` **nunca**
  cae al respaldo: el `||` era código muerto. Y el formulario de categorías del
  panel nace en `'general'`, de modo que una categoría creada ahí no pertenece
  a ninguna audiencia. Eso dejó la reutilización de cuenta apagada en silencio
  en el Registro Nacional de producción, con el paso 1 pidiendo contraseña a
  quien ya tenía sesión. El orden es: lo que declara la CATEGORÍA, lo que
  declara el BOTÓN que lleva a ella (`settings.cta.buttons[].audience`, donde
  el administrador ya dejó escrito cuál es el nacional) y, por último,
  `AUDIENCE_BY_CATEGORY`. **Sigue siendo por audiencia**: la clave es el último
  recurso y sólo para las que el módulo ya conoce. Al agregar una categoría con
  clave nueva, declararle la audiencia — no confiar en la deducción.
- **La audiencia resuelta viaja en la respuesta** (`accountLinking.audience`).
  Es el dato del que depende todo esto y no se veía en ninguna parte: sin él,
  un formulario que no reconoce una cuenta no distingue entre la política, la
  sesión y la categoría.
- **La política vive en la edición** (`settings.accountLinking`): `both` /
  `account_only` / `new_only`, más la lista de audiencias. Un evento nuevo
  decide sin desplegar.
- **El token se verifica en el SERVIDOR** (firma + audiencia) y **el correo del
  formulario tiene que ser el de la cuenta**. Sin esa segunda comprobación,
  quien tuviera sesión podría inscribir a otra persona a nombre de su cuenta.
- **Una cuenta vinculada NUNCA responde `needsPassword`** al iniciar sesión: su
  clave vive en la identidad de origen, así que ese mensaje la mandaría a crear
  justo la segunda credencial que esto evita. Devuelve un fallo normal y
  `resolveSession` sigue probando.
- **La precarga sólo rellena campos VACÍOS.** Un borrador a medias no se pisa.
- `attendeeAuth` acepta el token de la identidad vinculada, así que quien se
  inscribió reutilizando su cuenta entra a `/mi-inscripcion` con esa misma
  clave, sin una segunda sesión.
- El aviso de ingreso completado va por `emitLoginSuccess` / `onLoginSuccess`
  (`src/lib/loginModal.ts`), por el mismo motivo que la apertura del modal: el
  `Navbar` se monta dentro de cada página, no por encima. **Emitirlo en las tres
  ramas de `handleLogin`** — se escapó la del panel del club y el formulario no
  se enteraba hasta recargar.

### Dirección pública de un evento (v4.658)

Un evento se abre igual con su **id interno** que con su **slug**: el endpoint
acepta los dos (`id = $1 OR slug = $1`). Eso es cómodo, pero deja que el
visitante acabe mirando un identificador en la barra de direcciones.

- **El slug manda cuando existe.** `EventoDetalle` y `RegistroEvento`
  reemplazan la dirección por la del slug (`navigate(..., { replace: true })`)
  en cuanto saben cuál es. Conservan query y ancla —`?categoria=` es lo que
  distingue un registro de otro— y usan `replace` para que el "atrás" no rebote.
  La condición es `slug && ref !== slug`, así que no puede entrar en bucle.
- **Lo que se GUARDA es el id; lo que se PUBLICA es el slug.** El destino de la
  redirección de `/eventos` se guarda por id (lo único que no cambia) y la
  página pública lo resuelve al slug del momento. Así, renombrar el slug no
  rompe la redirección. El desplegable del panel acepta las dos formas, porque
  hasta v4.657 se guardaba el slug.
- `useSEO` recibe la dirección canónica, no la que se usó para entrar: el
  evento se indexa por su slug.

**Nueva edición**: crear el `CalendarEvent`, abrir la pestaña Registro y usar
"clonar" desde la edición anterior. El número de edición y la ciudad se deducen
del título (`XIII …`) y de `location`. La edición clonada nace con el registro
**cerrado**, a propósito.

### Rol "Asistente al Evento" y su panel (v4.655)

Al enviar el formulario, la inscripción **crea la cuenta** con la que esa
persona consultará su registro. Es el mismo patrón del Gestor de Proyectos, y
está escrito aparte a propósito.

| Archivo | Qué es |
|---|---|
| `server/controllers/eventAttendeeController.js` | Identidad, permisos, panel y auditoría del asistente |
| `src/pages/MiInscripcion.tsx` | El panel (`/mi-inscripcion`) |
| `src/components/forms/FairField.tsx` | Campos compartidos con Postular Proyecto |

- **Una cuenta por CORREO, no por inscripción.** Es la diferencia con
  `ProjectFairAccount`, que es 1:1 con la postulación. Quien vuelva en la XIII
  entra con la misma clave y ve su historial separado por evento. Por eso la
  unicidad es sobre `lower(email)` y el vínculo con cada inscripción vive en
  `EventRegistration.accountId`. Con esa columna más `eventId` y `categoryKey`,
  una sola fila lleva la relación completa usuario ↔ evento ↔ categoría ↔
  inscripción.
- **Si el correo ya tiene cuenta, NO se crea otra.** Se vincula la inscripción
  nueva, y para hacerlo se exige la contraseña vigente. Sin eso, cualquiera que
  conociera un correo podría sobrescribir su clave inscribiéndose de nuevo. El
  409 explica cómo salir (entrar o recuperar la contraseña); no es un callejón.
- **La cuenta se resuelve ANTES de escribir la inscripción.** Un choque de
  contraseña no puede dejar una inscripción a medio crear.
- **La contraseña nunca entra en `answers`.** Viaja aparte en el envío final —no
  en el autoguardado ni en el borrador de `localStorage`— y sólo se persiste su
  hash (bcrypt).
- **Permisos propios** (`ATTENDEE_PERMISSIONS`), no los del Gestor de Proyectos:
  leer su inscripción y su perfil. Reutilizar los de proyectos le habría dado
  acceso a formularios y documentos que no le corresponden.
- **El aislamiento va en el `WHERE`.** Toda consulta del panel filtra por
  `"accountId" = <cuenta del token>`. Ningún endpoint recibe un id y lo devuelve
  comprobando la pertenencia después. La ficha tampoco expone notas internas,
  identificadores de Stripe ni etiquetas de segmentación.
- **Una inscripción pagada no puede quedar sin cuenta.** Si el formulario se
  envió antes de v4.655, `confirmPaidSession` la crea con hash inutilizable
  (`'!'`) y la persona la estrena por "olvidé mi contraseña": el pago ya
  demostró que ese correo es suyo. Mismo mecanismo que `ProjectFairAccount`.
- **El estado del panel lo mueve el módulo, no la pantalla**: el webhook de
  Stripe y el panel administrativo. El asistente sólo lee.
- La verificación de correo existe pero está **apagada** por defecto
  (`EVENT_ATTENDEE_EMAIL_VERIFICATION=true` la enciende): encenderla obliga a
  confirmar el correo y sólo tiene sentido con el envío de correo sano.
- **El campo `language` ("Idioma") se retiró del formulario** en v4.655: el
  idioma de navegación lo decide el selector del encabezado y ya gobierna qué
  registro se ofrece (`resolveAudienceHint`); preguntarlo otra vez duplicaba un
  dato que el sitio ya conoce y podía contradecirlo. `preferredLanguage`
  ("Idioma preferido durante el evento") **se conserva**: es otra cosa —sirve
  para traducción y salas—. La columna `language` no se toca: las inscripciones
  viejas conservan su valor.
- **Los dos formularios públicos comparten componentes de verdad**
  (`src/components/forms/FairField.tsx`). Postular Proyecto y el registro a un
  evento importan `Field`, `PhoneField` y `StepProgress` del mismo módulo. No
  duplicar estos controles: el formulario del evento es dinámico (los campos los
  define el servidor) y `DynamicField` sólo TRADUCE cada campo a esas piezas.
- **País y Departamento son campos de TEXTO LLANO** (v4.656, pedido del
  cliente). Tenían un `<datalist>` de sugerencias y el navegador lo desplegaba
  encima del formulario al hacer clic: parecía un selector obligatorio con un
  catálogo corto, cuando en realidad admitían cualquier valor. No reintroducir
  la lista. Si algún día hay que restringir de verdad los valores, es un
  `select` con validación en el servidor —no un `datalist`, que sugiere sin
  restringir y confunde las dos cosas.

## Postulación de Proyectos — ediciones (v4.683)

El módulo administra **una edición a la vez**. Su primera pantalla es el listado
de versiones (`EdicionesList.tsx`), igual que el módulo de Eventos.

**Una edición ES un `CalendarEvent`.** No se inventó una entidad nueva: es el
mismo evento que ya usa el registro de asistentes, así que «XIII Feria 2029» es
UNA cosa en toda la plataforma y no dos que haya que mantener sincronizadas.

**Reglas durables:**

- **El aislamiento vive en `buildFilters`** (`projectFairAdminController.js`) y
  en `withAccess`, que son los dos puntos por donde pasan TODAS las consultas y
  la configuración del panel. Al agregar un endpoint administrativo, usarlos:
  si se consulta la tabla por fuera, se pierde el aislamiento en silencio.
- **La edición abierta viaja en la URL** (`?evento=`), no en el estado. Por eso
  `currentEventId()` y `withEvento()` son de módulo en `PostulacionesPagos.tsx`:
  hay peticiones dentro de subcomponentes y pasarla por props obligaría a
  hilarla por media pantalla. El enlace se puede compartir y «atrás» devuelve al
  listado.
- **Sin `?evento=` NO se filtra**, a propósito: es lo que necesitan las filas
  aún sin migrar y las consultas internas que no vienen del panel. Desde la
  pantalla no hay forma de pedir «todas».
- **Clonar copia la ESTRUCTURA, nunca los datos.** `createEdition` hereda
  precios, textos, distritos, áreas, tipos de documento, cargos y la plantilla
  del formulario; las postulaciones, pagos, formularios diligenciados y
  etiquetas se quedan en su edición. Clonar datos sería inventar inscripciones.
- **Una edición nueva nace CERRADA** (`enabled: false`) y **sin fecha límite**:
  abrir una convocatoria al público es una decisión explícita, y la fecha de la
  edición anterior ya venció.
- **`CalendarEvent` es de TODA la plataforma, no de un sitio.** Cualquier
  consulta sobre eventos —la migración, los eventos disponibles— tiene que
  acotarse por `clubId`, o traerá los de los demás sitios alojados. Fue
  exactamente lo que impidió que la migración de v4.683 vinculara nada.
- **`bindLegacyEdition` no adivina.** Migra la convocatoria global de v4.682 y
  sus postulaciones a su edición sólo si el evento se identifica sin ambigüedad
  (uno solo, o coincidencia exacta de nombre). Si no, deja la convocatoria sin
  vincular y el listado lo muestra — atar postulaciones pagadas a la edición
  equivocada es peor que no atarlas. Es idempotente y se reintenta en cada
  arranque en frío, así que se autorrepara si el evento se crea después.
  Cuando de verdad no puede, el listado ofrece **«Vincular evento»**
  (`linkEdition`): avisar sin dar salida dejaba la edición en un callejón.
- **El conteo del listado une con `IS NOT DISTINCT FROM`**, no con `=`: una
  edición sin vincular tiene `eventId` NULL y sus postulaciones también, y con
  igualdad NULL nunca casa con NULL — mostraba «0 postulaciones» teniendo
  cuatro.
- **El índice único de `ProjectFairConfig` es PARCIAL** (`WHERE "eventId" IS NOT
  NULL`), así que su `ON CONFLICT` **debe repetir el predicado** o la sentencia
  falla entera. Mismo error real que costó una corrección en v4.648.
- **El formulario público usa `readOpenEdition()`**, no una edición fija: la
  postulación se sella con la edición en la que se hizo. Hasta v4.682 sólo
  guardaba `editionKey`, un texto que no filtraba nada.

### Centro de Inteligencia (v4.689)

`Dashboard` y `Reportes` eran dos pestañas que mostraban lo mismo con otros
nombres y lo calculaban **dos veces**. Ahora hay una sola pantalla y un solo
endpoint (`getIntelligence`); `/admin/overview` y `/admin/reports` son alias
suyos, conservados para un navegador con el panel viejo en caché.

- **Ninguna métrica se pinta dos veces.** Al agregar una, buscar antes si ya
  está en otro bloque: la duplicación fue justo lo que hubo que deshacer.
- **El embudo sólo tiene etapas que el módulo REGISTRA.** No se inventa
  «proyecto publicado» ni nada que nadie marque: una etapa siempre en cero no
  dice dónde se pierde nada, sólo estorba.
- **Un bloque sin datos no se pinta**, y un eje geográfico sólo aparece si
  dice algo (`hasGeo`): con todo en un país, «por país» es una barra que ocupa
  sitio y no informa.
- **El acumulado se deriva de la serie diaria** en el navegador, no con otra
  consulta: el dato ya venía.

### El panel del club conoce SU edición (v4.691)

- **`/mi-proyecto` resuelve la convocatoria por `submission.eventId`**
  (`readConfigForSubmission`), no la abierta. Hasta v4.690 usaba
  `readConfigForAdmin()` sin edición: acertaba sólo porque hay una feria. Con la
  XIII abierta, un club de la XII habría visto el plazo, los precios y **la
  plantilla del formulario** de la XIII.
- **Si la edición no tiene fila propia se cae a la abierta**, a propósito.
  `readConfig` mezcla contra `DEFAULT_CONFIG` y nunca devuelve vacío, así que
  sin esa comprobación un `eventId` huérfano dejaría al club con la plantilla
  POR DEFECTO —perdiendo el formulario que está diligenciando— sin avisar.
- **La sede y las fechas salen del `CalendarEvent`** (`readEditionEvent`), no de
  `cfg.edition`. Una edición ES un evento de la plataforma: si el panel leyera
  del bloque escrito a mano, podría decir una ciudad mientras la ficha del
  evento dice otra. `cfg.edition` queda de respaldo para una edición sin
  vincular. Sin evento se devuelve `null`; no se inventa uno.
- **El encabezado contesta dos preguntas y ninguna más**: cuál es mi proyecto y
  a qué feria va, separadas por una línea. El monto y el estado del pago **no**
  van ahí: ya tienen su tarjeta y en el encabezado convertirían el dinero en el
  titular de una pantalla que trata del proyecto.

## Formularios del proyecto (Gestión de Proyectos) — v4.642

Un proyecto inscrito tiene **varios** formularios, no uno. La lista vive en
`server/lib/projectFormsRegistry.js`:

| `formKey` | Plantilla | Tabla | Config editable |
|---|---|---|---|
| `master` | `projectFairMasterForm.js` — Formulación del Proyecto | `ProjectFairMasterForm` | `cfg.masterForm` |
| `fdd_2026_2027` | `projectFairFddForm.js` — Solicitud de Aportes del FDD | `ProjectFairProjectForm` | `cfg.fddForm` |

**Agregar un formulario nuevo** = escribir su plantilla + una entrada en el
registro. No se tocan rutas, ni pantallas, ni el modelo de datos: el panel del
club (`src/pages/MiProyecto.tsx`) dibuja una tarjeta por lo que devuelve
`/portal/me → forms`, y `ProjectFormView` renderiza cualquier plantilla.

**Reglas durables:**

- **Las dos tablas conviven a propósito.** La Formulación se queda en
  `ProjectFairMasterForm` porque migrar respuestas ya guardadas de los clubes
  sería una operación destructiva sobre datos de producción. Tienen la misma
  forma; `storageOf(formKey)` decide cuál se usa. No unificarlas.
- **Dos formas de marcar el espacio institucional**, y la diferencia es quién
  escribe, no cómo se ve:
  - `districtSpace: true` — lo diligencian el club **y** el Distrito. Se guarda
    con el resto de `answers`. Es lo que usa la Aprobación institucional del
    FDD (decisión del cliente, v4.643): el Gestor la llena con lo que le
    corresponde al proyecto y al club, y el Distrito la confirma. Sus campos
    van **sin `required`** a propósito, para que no bloqueen el envío.
  - `adminOnly: true` — no la escribe nunca el club. Se guarda en la columna
    `approval`, aparte de `answers`, y toda escritura que llega del panel del
    club pasa por `stripProtected`. Queda disponible para un formulario futuro
    que sí necesite una sección cerrada.

  En ambos casos el único camino administrativo es
  `PUT /admin/postulaciones/:id/forms/:formKey/approval`, con rol
  administrativo del sitio y permiso `changeStatus`; sólo escribe la sección
  institucional y sólo los campos que la plantilla declara.
- **El estado que ve el usuario se deriva, no se guarda** (`deriveState`): así
  no puede haber una fila "enviada" con 40% de avance.
- **`prefill` y `prefillFrom`** son la precarga: el primero copia datos de la
  inscripción; el segundo, respuestas de otro formulario del mismo proyecto
  (`'master.objetivos.generalObjective'`). Sólo actúan al crear el borrador.
- El motor común (avance, validación, campos derivados) está en
  `server/lib/projectFormEngine.js`, con su espejo en `src/lib/projectForms.ts`.
  El servidor valida siempre, aunque el navegador ya lo haya hecho.

## Generador de Pendones

Módulo: configurador en el admin (`src/components/admin/content-studio/BannerTemplateManager.tsx`, pestaña "Pendones" de Content Studio) + generador público (`src/pages/GeneradorPendones.tsx`, ruta `/generador-pendones`) + motor de render/PDF (`src/lib/bannerRender.ts`, preview `src/components/BannerPreview.tsx`) + backend (`server/controllers/bannerTemplateController.js`).

**REGLA DURABLE — NO alterar la plantilla por defecto establecida por el cliente.** El admin ya dejó guardada y aprobada la plantilla por defecto del pendón (Distrito 4281: fondo azul/dorado, 80×180 cm, 3 personas con "Periodo Rotario 2026-2027", logo al 200% con su posición, márgenes, etc.). En futuras actualizaciones del módulo:

- **No** modificar/resetear esa plantilla. Vive en la tabla **`BannerTemplate`** (BD), creada con SQL crudo (fuera de Prisma) → el `prisma db push` del build no la toca y persiste entre deploys.
- `DEFAULT_CONFIG` (cliente y servidor) es **solo respaldo** para campos faltantes. La carga/guardado usan **merge profundo** (los valores guardados mandan). No cambiar la FORMA del `config` de manera que invalide lo ya guardado; si se agregan campos, hacerlo de forma aditiva y opcional.
- Nunca escribir/limpiar la fila guardada desde un deploy/migración. La plantilla solo cambia cuando el admin hace "Guardar" en la UI.
- El logo del club (cabecera) usa un recuadro fijo (posición `config.offsets.logo` + tamaño `config.logo.scale`); el logo que sube el público hereda esa misma posición/tamaño. El pie muestra solo el logo subido (sin lema). En el público solo se editan las personas con `editable: true`.

**⚠️ Aplica a TODAS las áreas, no solo a pendones.** El 2026-07-13 se perdió la plantilla guardada por un **reseteo/migración a nivel de base de datos** originado en despliegues de OTRAS áreas (no del módulo de pendones). Por lo tanto, NINGÚN módulo/deploy/migración debe ejecutar operaciones destructivas de BD (drop de base, recreación, restore de un backup viejo, `TRUNCATE`, borrado de tablas no gestionadas por Prisma) que puedan eliminar `BannerTemplate` u otros datos del cliente. Si una tarea requiere tocar la base, preservar explícitamente esa fila. Ante la duda, preguntar antes de correr algo que pueda vaciar datos de producción.

## Base de datos y despliegue — CAUSA DEL INCIDENTE DEL 2026-07-13

**El `build` NO debe ejecutar `prisma db push`.** Hasta v4.622 el script de build corría:

```
npx prisma db push --schema=./server/prisma/schema.prisma --accept-data-loss
```

`db push` deja la base **idéntica al schema**: toda tabla que exista en la base y
**no** esté en `schema.prisma` se **BORRA**, y `--accept-data-loss` autoriza que
se borre aunque tenga datos. Como el build corre en cada despliegue, **cada
deploy vaciaba todas las tablas creadas fuera de Prisma**.

Reproducido el 2026-07-28: con una fila en `ProjectFairSubmission`, ese comando
imprime *"You are about to drop the `ProjectFairSubmission` table, which is not
empty (1 rows)"* y la elimina. Es exactamente lo que ocurrió el 2026-07-13 con
`BannerTemplate`, y lo que hizo desaparecer una inscripción pagada de la feria.

Tablas afectadas (creadas con `CREATE TABLE IF NOT EXISTS` en tiempo de
ejecución, fuera de Prisma): `BannerTemplate`, las once `ProjectFair*`, y las de
CRM/WhatsApp, FAQs, agentes, brains, registro de eventos y leads.

**Regla durable**: el build sólo hace `prisma generate` + `vite build`. Si un
cambio toca `server/prisma/schema.prisma`, hay que sincronizar la base **a
propósito** con `npm run db:push`, revisando antes el aviso de pérdida de datos.
Nunca volver a poner `db push` en el `build`.

### Dos barreras que lo hacen cumplir (v4.624)

1. **`prebuild` → `scripts/check-build-safety.mjs`.** Corre en cada despliegue,
   sin tocar la base. Si `build`, `vercel-build`, `postinstall` o `start`
   vuelven a contener `prisma db push` o `prisma migrate reset`, **rompe el
   despliegue** con la explicación, en vez de dejar que borre datos.
2. **`npm run db:push` → `scripts/db-push-guard.mjs`.** Compara las tablas de
   la base con los modelos del schema y **aborta** listando las que se
   perderían y cuántas filas tienen. Para sincronizar de todos modos, a
   sabiendas: `npm run db:push:force`.

Las 24 tablas que la aplicación crea sola y que estas barreras protegen:
`BannerTemplate`, `EventRegistration`, `EventAttendeeAccount`,
`EventAttendeeLogin`, `FAQ`, `OutroProject`, `ReelProject`, `ReelScene`,
`ReelCopy`, `ReelNarration`, `ReelUsage`, `CrmWebhookEvent`, `CrmOutboundLog`
y las once `ProjectFair*`.
(Más las seis del registro de eventos que enumera su propia sección:
`EventEdition`, `EventRegistrationCategory`, `EventRegistrationCompanion`,
`EventRegistrationPayment`, `EventRegistrationHistory` y
`EventRegistrationMessage`.)

## Recursos que cambian con el idioma — v4.699

Algunas piezas gráficas están **rotuladas** y por tanto tienen idioma: el logo
de la feria dice «Feria de Proyectos» o «Projects Fair» según la versión. Esas
piezas siguen al idioma activo del sitio.

| Archivo | Qué es |
|---|---|
| `src/lib/audienceAssets.ts` | El criterio: `isNationalLang` + `pickLocalizedAsset` |
| `src/sections/Navbar.tsx` | Resuelve el logo del encabezado |
| `server/routes/clubs.js` | `by-domain` devuelve `logoIntl` |
| `server/controllers/clubController.js` | Lo guarda como `Setting logo_intl` |
| `src/pages/admin/ClubSettings.tsx` | Campo «Logo Header (Internacional)» |

Prueba: `npm run test:assets` (21 casos). Pide `esbuild`, que se instala aparte.

**Reglas durables:**

- **La división es BINARIA, no una versión por idioma.** Nacional = `es`/`es-CO`;
  internacional = los otros siete (inglés, francés, portugués, alemán, italiano,
  japonés y coreano). Al japonés no le toca el logo en inglés por descuido: el
  cliente mantiene DOS versiones de cada pieza, la colombiana y la
  internacional, y ésta última está rotulada en inglés.
- **Manda el IDIOMA ACTIVO, no el país.** Mismo criterio que los botones de
  registro desde v4.652, y por el mismo motivo: un visitante que lee el sitio en
  inglés desde Colombia tiene que ver una página coherente.
- **`NATIONAL_LANGS` es espejo de `DEFAULT_NATIONAL_LOCALES`** del servidor
  (`eventRegistrationSpec.js`). Está duplicado a propósito, igual que
  `ADMIN_ROLES`: allá decide qué categorías de registro se ofrecen, aquí qué
  archivo se pinta. Si cambia una lista, cambiar la otra — lo comprueba
  `npm run test:assets`.
- **La pieza nacional es la de referencia.** Si no hay versión internacional
  cargada se usa ella en TODOS los idiomas. Eso es lo que hace que esta función
  no cambie nada en los sitios que no la usan, que son casi todos.
- **Nunca se deja un hueco**: entre una pieza en el idioma equivocado y ninguna
  pieza, se prefiere la primera.
- **El logo internacional vive en `Setting` (`logo_intl`), NO como columna de
  `Club`.** Y el motivo es importante: `/clubs/by-domain` consulta con **Prisma**,
  así que una columna declarada en `schema.prisma` que todavía no exista en la
  base haría responder **500 a todo el sitio público** desde el primer despliegue
  hasta que alguien la creara. `Setting` ya es donde viven los logos de
  Rotaract/Interact y el tamaño del encabezado; se hereda del club maestro igual
  que ellos. **No convertirlo en columna** sin resolver antes ese orden de
  despliegue.
- **Para aplicar esto a otra imagen**: usar `pickLocalizedAsset` y añadir el
  campo donde ya se sube la original. No reescribir la comprobación a mano —
  fue justamente lo que hizo que el fallo de los enlaces externos apareciera en
  siete lugares a la vez (v4.657).

**Pendiente:** el cliente todavía no ha definido qué imágenes de la portada
llevan versión internacional. El mecanismo está listo; falta la lista.

### Casillas de imagen del panel (v4.700)

**Toda casilla de imagen ofrece SIEMPRE dos vías**: subir un archivo nuevo o
elegir uno ya cargado en la Biblioteca Multimedia. Al agregar una casilla nueva,
usar `src/components/admin/ImageSourceOverlay.tsx` y un `MediaPicker` con
`maxSelection={1}` — no volver a poner sólo el `<input type="file">`.

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


## Traducción del sitio público — v4.662

El selector de la barra superior es la **única** fuente del idioma activo, y
gobierna todo lo que el visitante ve. El sitio NO tiene un catálogo cerrado de
cadenas: casi todo lo visible es contenido que el administrador carga en
español, así que la traducción se hace **sobre el DOM ya pintado**, se guarda y
se reaplica al instante en las visitas siguientes.

| Archivo | Qué es |
|---|---|
| `server/lib/translationSpec.js` | Fuente de verdad: idiomas, locales, proveedores, qué es lenguaje y qué es dato |
| `server/lib/translationProviders.js` | Capa desacoplada: Gemini, OpenAI, DeepL, Google, Azure |
| `server/lib/translationStore.js` | Caché, invalidación, protección de lo manual, auditoría y métricas |
| `server/lib/ensureTranslationSchema.js` | Crea `Translation` y `TranslationEvent` en runtime |
| `server/routes/translate.js` | `/bulk` público + `/admin/*` con rol administrativo |
| `src/lib/domTranslator.ts` | El motor sobre el DOM (aparte para poder probarlo) |
| `src/lib/locale.ts` | Fechas, horas, monedas y números por locale |
| `src/contexts/LanguageContext.tsx` | Idioma activo, caché de navegador, observador, persistencia |
| `src/pages/admin/Translations.tsx` | Panel de gestión |

Pruebas: `npm run test:i18n` (motor DOM, 32 casos) y
`npm run test:i18n:providers` (contrato de los proveedores, 21 casos). Piden
`jsdom` y `esbuild`, que se instalan aparte (`npm i --no-save jsdom esbuild`).

**Reglas durables:**

- **El idioma base NO es una excepción: también se traduce hacia él.** Es el
  fallo que se corrigió en v4.662 y el error conceptual más caro del módulo.
  `BASE_LANG = 'es'` significa «el idioma que se ofrece por defecto», **no**
  «todo el contenido está escrito en español». En
  `rotaryprojectfaircolombia.org` el administrador carga los contenidos en
  INGLÉS —la feria se dirige a rotarios de todo el mundo—, así que al elegir
  «Español» el módulo daba el texto por bueno y no traducía nada: la ficha
  quedaba con el menú en español (viene del código) y los contenidos en inglés.
  No reintroducir ningún atajo del tipo `if (lang === BASE_LANG) return`.
- **El idioma de ORIGEN se detecta, no se asume.** A DeepL, Google y Azure no se
  les manda `source_lang`; a los modelos se les dice que la lista puede mezclar
  idiomas. Es lo que permite resolver una página mezclada, que es el caso real.
  Por eso la clave de caché es el hash del texto **a secas**: el origen no forma
  parte de la identidad de un texto.
- **Un texto que ya está en el idioma pedido vuelve INTACTO.** La instrucción se
  lo exige al modelo carácter por carácter («no lo reescribas, no lo mejores»).
  Sin esa frase, un modelo al que se le pide traducir al español un texto que ya
  está en español lo pule y lo acorta, y el sitio va cambiando de redacción solo,
  a espaldas de quien lo escribió. Coste: la primera visita en el idioma base
  paga una pasada por el proveedor; queda en caché y no se repite.
- **El navegador distingue «vino igual» de «falló».** El endpoint devuelve
  `failedAt` con las posiciones que no se pudieron traducir. Todo lo demás se
  guarda en caché, incluido lo que vuelve idéntico. Sin esa distinción, un texto
  que ya estaba en el idioma pedido se tomaría por un fallo y se volvería a
  pedir en cada visita, para siempre.
- **Traducir es para el LENGUAJE; los DATOS se formatean o no se tocan.** Son
  tres cosas distintas y confundirlas es el error caro:
  - *Lenguaje* (títulos, botones, descripciones, ayudas): pasa por el traductor.
  - *Formato* (fechas, horas, cifras, importes): NO se traduce, se escribe con
    el locale activo (`useLocale()`). Una fecha traducida es un disparate; una
    fecha en `es-CO` dentro de una página en japonés, también.
  - *Identidad* (correos, teléfonos, códigos de inscripción, URLs, UUID,
    códigos de moneda, marcas): no se toca nunca. Lo frena `isTranslatable` en
    el servidor y `looksLikeData` en el navegador, a propósito en los dos
    lados: el filtro del navegador ahorra la llamada, el del servidor es el que
    no se puede saltar.
- **No usar `'es-CO'` fijo en una pantalla pública.** Dentro de un componente,
  `useLocale()`. En un formateador declarado a nivel de módulo, `activeLocale()`
  — y entonces el componente que lo llame **tiene que** suscribirse con
  `useLang()`, o la fecha se queda en el formato anterior hasta el siguiente
  repintado. Hasta v4.660 había 69 locales fijos y por eso el idioma cambiaba a
  medias.
- **La clave de la caché es el SHA-256 del texto completo.** Hasta v4.660 era el
  texto recortado a 120 caracteres, así que dos párrafos que empezaban igual
  compartían fila y el segundo mostraba la traducción del primero, de forma
  permanente. Que la clave sea el contenido es además lo que da la invalidación
  gratis: si el administrador edita el original, cambia el hash, no hay fila y
  se retraduce. No hace falta ningún proceso que invalide nada.
- **Una traducción `manual` o `approved` NO la pisa el proveedor, nunca.** Lo
  impone el `WHERE` del `ON CONFLICT` en `putAuto`, no la pantalla. Es lo que
  hace que valga la pena corregir una traducción a mano; sin eso, el siguiente
  repaso automático borraría el trabajo. `invalidate()` respeta la misma regla.
- **Un lote mal alineado se descarta ENTERO.** Si el proveedor devuelve un
  número de traducciones distinto al de textos enviados, se lanza. Hasta v4.660
  se le pedía al modelo una lista numerada y se deshacía con una expresión
  regular por índice: bastaba un "[2]" dentro de una traducción para que todo
  lo siguiente quedara corrido, y eso se guardaba en la caché para siempre. A
  los modelos se les pide JSON; a DeepL, Google y Azure se les manda un array y
  devuelven un array, sin nada que interpretar.
- **El endpoint público nunca devuelve un error al visitante.** Si falla el
  proveedor, entra el respaldo; si se acaba la cadena, se muestra el texto
  original en español y el fallo queda anotado para el panel. **Nunca** se
  muestra una llave interna ni un hueco en blanco.
- **El proveedor se elige desde el panel** (`Setting translation::provider` y
  `::fallback`), sin desplegar. Sólo se ofrecen los que tienen su credencial en
  el entorno. Agregar uno = una entrada en `PROVIDERS` + su función en
  `translationProviders.js`.
- **El original se guarda POR NODO de texto, no por elemento.** Un elemento con
  varios nodos (el copyright del pie: año + nombre + «Todos los derechos
  reservados.») acababa con todos sus nodos pisados por la misma traducción.
- **De cada nodo se guardan dos cosas: el original y lo último que escribimos.**
  Con las dos se distingue un cambio NUESTRO de un repintado de React, que es
  lo que permite observar `characterData` sin entrar en bucle y sin tomar por
  original un texto que ya estaba traducido. Si se quita esa distinción, se
  acaba traduciendo la traducción.
- **Los atributos también son texto visible**: `placeholder`, `title`, `alt`,
  `aria-label` y el `value` de los botones. Eran 524 `placeholder` que se
  quedaban en español porque el recorrido sólo miraba nodos de texto. El `value`
  de un campo de texto **no** se toca: es el dato que escribió la persona.
- **`select` sí se recorre** (sus `option` son texto que se lee); `input` y
  `textarea` no, porque no tienen texto dentro.
- **Marcar con `data-no-translate`** lo que deba quedarse literal. Sirve tanto
  para el elemento como para todo lo que cuelgue de él.
- **Lo ya traducido se aplica en un `useLayoutEffect`**, antes de que el
  navegador pinte: por eso no parpadea. Un texto que NADIE ha traducido todavía
  se ve un momento en español mientras llega su traducción, y eso es a
  propósito — tapar la página esperando a un servicio de terceros es peor que
  leerla en español un segundo. Se avisa con una barra fina arriba.
- **`<html lang>` se actualiza con el idioma activo.** Lo usan el lector de
  pantalla, el corrector del navegador y los buscadores. `index.html` nace en
  `es-CO` porque el contenido se escribe en español.
- **Prompts cortos y en positivo**, igual que en el resto del sitio.

**Pendiente conocido:** los mensajes que el servidor devuelve ya redactados
(validaciones de formularios, correos transaccionales) se traducen al llegar al
navegador porque pasan por el DOM, pero los **correos** no: salen del servidor
sin pasar por esta capa y van siempre en español. Para traducirlos hay que
llamar a `translateBatch` desde el propio envío, con el idioma que el visitante
dejó en la cookie `site_language`.

## Rendimiento de carga — v4.659

Se midió el recorrido de una visita y se corrigieron cinco causas. Las reglas
que quedan, para no reintroducirlas:

- **Ningún recurso de terceros bloquea el pintado.** La hoja de Google Fonts
  estaba con `rel="stylesheet"`, así que el navegador no dibujaba NADA hasta
  que respondía `fonts.googleapis.com`. Con el servidor inaccesible, el primer
  contenido tardaba **13,2 s**; con `preload as="style"` + `onload`, **0,28 s**.
  Si se agrega otra fuente o CSS externo, va igual (o autoalojado).
- **`manualChunks` debe fijar el núcleo compartido.** Sólo se asignaba
  `react-dom`, así que React —y el runtime de JSX— caía en el primer chunk que
  lo pidiera: el del editor del panel. Igual `clsx`, que acabó dentro del de
  gráficas. El entry importaba los dos y toda visita pública se tragaba 683 kB
  de librerías del panel. Al agregar una librería pesada al split, comprobar
  que el entry NO la importe: `grep -o 'from"\./vendor-[^"]*"' dist/assets/index-*.js`.
- **Las páginas públicas van con `React.lazy`**, dentro del `<Suspense>` que ya
  envuelve `<Routes>`. Las 36 se importaban de golpe (entry de 823 kB → 256 kB).
  Las **secciones** de la portada (`src/sections/*`) siguen eager a propósito:
  son el primer pintado y cargarlas aparte añadiría un viaje de red.
  Ojo: separar en chunks destapa identificadores no importados que el bundle
  único resolvía por accidente (pasó con `useClub` en `Checkout.tsx`). Tras
  tocar el split, recorrer las rutas públicas antes de publicar.
- **Una petición compartida, no una por componente.** `useSiteImages` lo llaman
  17 componentes —siete en la portada— y cada uno disparaba su par de fetches
  con `_t=Date.now()`, que además impedía el caché del navegador: diez
  peticiones para dos respuestas. Igual el pie de página, que se pedía dos veces
  porque el `type` del club llega vacío en el primer render. Ambos comparten
  ahora la promesa en vuelo y guardan el resultado un rato
  (`invalidateSiteImages()` la descarta tras guardar desde el panel). La portada
  pasó de 14 llamadas a 6.
- **`ensure*Schema` comprueba antes de ejecutar.** Sus sentencias son
  idempotentes pero no gratis: 62 viajes a la base en cada arranque en frío de
  la función (~400 ms en local; 1-2,5 s contra una base gestionada), pagados por
  la primera visita tras un rato sin tráfico. Ahora dos consultas al catálogo
  deciden si hay algo que hacer. La lista de tablas y columnas de
  `ensureEventRegistrationSchema` **no es un número de versión**: enumera los
  objetos reales del archivo, y hay que ampliarla al agregar uno nuevo o la
  comprobación lo dará por presente.

**Pendiente conocido, ajeno a esto:** `getPublicProducts` y `getPublicProduct`
(`productController.js`) filtran por `published`, columna que el modelo
`Product` no tiene —se llama `status`—, así que `/shop` responde 500. Es
anterior a esta versión y no se tocó porque cambia qué productos se publican.

## Botones configurables (CTA) — v4.657

Los botones que el administrador llena desde el panel —los dos del encabezado,
los de las secciones de la portada y el del panel de inscripción de un evento—
comparten un solo criterio para decidir cómo se abren: `ctaTarget` en
`src/lib/ctaLinks.ts`.

- **Externo = OTRO DOMINIO, no "empieza por http".** Hasta v4.656 cada pantalla
  repetía `/^https?:\/\//` y le ponía `target="_blank"` a todo enlace absoluto.
  Como lo natural al configurar un botón es pegar la dirección completa
  copiada del navegador, un botón que llevaba a otra página del MISMO sitio
  abría pestaña nueva. `ctaTarget` compara el dominio contra
  `window.location.host` (ignorando `www.`) y devuelve `{ external, to }`:
  interno → `<Link to={to}>` (misma pestaña, sin recargar); externo → `<a
  target="_blank">`.
- **No volver a escribir la comprobación a mano.** Al agregar un botón
  configurable nuevo, usar `ctaTarget`. Estaba duplicada en siete lugares y por
  eso el fallo apareció en todos a la vez.
- `ctaTarget` conserva query y ancla: `?categoria=…` es justamente lo que
  distingue el registro nacional del internacional.
- **Los enlaces del menú con bandera `external` NO pasan por aquí**: ahí el
  administrador eligió a propósito, y su decisión manda.
- **El botón del encabezado que apunta al registro de un evento sigue al
  IDIOMA ACTIVO** (v4.660), igual que los de la ficha. Antes llevaba el texto y
  la categoría que se escribieron una vez, así que en Español mostraba
  "International Registration" y aterrizaba en el formulario internacional —
  contradiciendo la regla de v4.652. `withLanguageAwareRegistration` en
  `Navbar.tsx` lo resuelve con `useEventCta`, el mismo hook de la ficha.
- **El texto y el enlace configurados se respetan POR SEPARADO**
  (`labelSetForLang` / `urlSetForLang`). Quien escriba sólo "Texto en Español"
  debe seguir yendo al formulario que le toca por idioma; si un solo indicador
  cubriera ambos, rellenar un campo congelaría el otro en el idioma contrario.
  Ese era el fallo. Los campos están en Configuración → Identidad → "Botones
  del menú principal".

## Acceso e identidades (v4.655)

El sitio tiene **un solo formulario de ingreso**: el del ícono del encabezado
(`src/sections/Navbar.tsx`). Ninguna pantalla dibuja el suyo. Cuando otra
pantalla necesita sesión, llama a `openLoginModal()` (`src/lib/loginModal.ts`).

Detrás hay **tres identidades**, y quien ingresa no tiene por qué saber cuál le
toca:

| Identidad | Tabla | Audiencia del token | Llave en el navegador | Destino |
|---|---|---|---|---|
| Administrador del sitio | `User` | `rotary-platform` | `rotary_token` | `/admin/dashboard` |
| Gestor de Proyectos | `ProjectFairAccount` | `project-fair-portal` | `feria_portal_token` | `/mi-proyecto` |
| Asistente al Evento | `EventAttendeeAccount` | `event-attendee-portal` | `evento_asistente_token` | `/mi-inscripcion` |

`POST /api/auth/session` (`server/controllers/sessionController.js`) recibe el
correo y la contraseña una sola vez, prueba la plataforma, después el panel del
club y por último el panel del asistente, y **devuelve la ruta de destino ya
calculada**. El navegador la obedece; no recalcula a dónde va cada rol. Al
agregar un rol o un destino, cambiarlo ahí, no en el `Navbar`.

**Reglas durables:**

- **La redirección es comodidad, no seguridad.** Toda ruta restringida se
  protege también en el servidor. `authMiddleware` exige la audiencia
  `rotary-platform`; `requireSiteAdmin` exige rol administrativo. Ambos en
  `server/middleware/auth.js`.
- **Las tres identidades comparten `JWT_SECRET`.** Por eso la audiencia es
  obligatoria: hasta v4.626 `authMiddleware` sólo verificaba la firma, así que
  el token del panel de un club pasaba y alcanzaba `/api/project-fair/admin/*`
  —que devuelve las postulaciones y los pagos de **todos** los clubes—.
  Nunca quitar la comprobación de `aud`.
- Los tokens sin `aud` (emitidos antes de v4.627) se siguen aceptando a
  propósito, para no cerrar sesiones en marcha. Duran un día y rotan solos;
  esa tolerancia se puede quitar pasada una semana del despliegue.
- **La casilla «Mantener la sesión iniciada» sólo puede ACORTAR la sesión**
  (v4.681). Marcada —por omisión, y también cuando el cliente no manda el
  campo— cada identidad conserva su vigencia de siempre: un día la de
  plataforma, treinta días las de los dos paneles. Desmarcada, las tres pasan a
  `SHORT_SESSION_TTL` (12 h). La decisión es del SERVIDOR, no del navegador:
  cambiar dónde se guarda el token exigiría tocar 186 lecturas de
  `localStorage` en 71 archivos, y además «no me recuerdes» no puede
  significar sólo que olvidamos dónde lo pusimos mientras sigue siendo válido.
  Al agregar una identidad, su `signToken` debe aceptar `{ remember }`.
- **El texto del formulario NO enumera quién entra.** Decía «administradores
  del sitio y clubes que postularon su proyecto» y se quedó corto al aparecer
  la tercera identidad. Cada tipo de cuenta nuevo obligaría a reescribirlo y,
  hasta que alguien lo hiciera, dejaría gente fuera de un texto que sí la
  incluye.
- Los campos del modal declaran `name`, `id` y `autoComplete`
  (`username` / `current-password`): es lo que hace que el navegador reconozca
  el ingreso y ofrezca guardar y autocompletar. No quitarlos.
- El ingreso con Google **no está implementado**: el botón nunca tuvo
  manejador. Está oculto tras `GOOGLE_LOGIN_ENABLED` en `Navbar.tsx`. Cuando
  se implemente, debe verificar el `id_token` en el servidor y converger en
  `resolveSession`, no ser una vía de acceso con reglas propias.
- `ADMIN_ROLES` está declarado dos veces a propósito (`src/App.tsx` y
  `server/middleware/auth.js`): el cliente decide qué pinta, el servidor qué
  responde. Si cambia una lista, cambiar la otra.

### La sesión se VE en el encabezado (v4.693)

`src/lib/siteSession.ts` es lo que el `Navbar` consulta para saber quién está
dentro. Lee los tokens que ya existen; no abre ni renueva sesiones.

- **El encabezado conoce las TRES identidades, no sólo la de la plataforma.**
  Hasta v4.692 el avatar dependía de `isAuthenticated` (`useAuth`), que sólo
  mira `rotary_token`: un Gestor de Proyectos que salía de `/mi-proyecto` veía
  el ícono de «Ingresar» y daba su sesión por cerrada. **No lo estaba** —el
  token nunca se borró—, pero una sesión que no se ve no existe para quien la
  usa. Al agregar una identidad, agregarla a `REALMS`/`REALM_META`.
- **Se resuelve en el navegador, leyendo el propio token.** El encabezado se
  pinta en todas las páginas: una consulta al servidor por visita reabriría el
  problema de rendimiento de v4.659. Leer el token aquí decide **qué se
  pinta**, nunca a qué se tiene acceso — eso lo verifica el servidor en cada
  petición, con firma y audiencia.
- **Se comprueban vencimiento y audiencia.** Un token vencido se retira del
  navegador ahí mismo (dejarlo sólo sirve para que el siguiente intento falle
  con un 401); uno con audiencia ajena se ignora. Un token **ilegible no se
  toca**: puede no ser nuestro, y borrarlo sería cerrarle la sesión a alguien
  por no saber leerlo. Los tokens sin `aud` se siguen aceptando, igual que en
  el servidor.
- **El nombre lo guarda el panel, no el token.** El token lleva el correo; el
  menú del avatar quiere el nombre. Cada panel llama a `rememberProfile` al
  cargar sus datos (`site_session_<realm>`). Pedirlo al servidor sólo para
  dibujar el encabezado sería, otra vez, una consulta por visita.
- **«Cerrar sesión» cierra las TRES.** Quien lo pulsa quiere salir del sitio,
  no de una de tres identidades que ni sabe que tiene separadas.
- **`/portal/link` sólo retira la sesión del panel si es del MISMO correo**
  (v4.693). Antes la borraba siempre que el usuario de la plataforma no
  tuviera proyecto: eso cerraba la sesión de OTRA persona que la había abierto
  con sus credenciales en ese navegador. Que este usuario no tenga proyecto no
  dice nada sobre ella. Por eso el endpoint devuelve `email` también en la
  respuesta negativa.
- **Toda escritura de un token avisa** (`emitSessionChange`), y el hook escucha
  además `storage` (otra pestaña) y `visibilitychange` (venció en segundo
  plano). Sin el aviso, el avatar aparece recién en la siguiente recarga.

## Credenciales

**Nunca escribir cadenas de conexión ni claves en el código.** Siempre
`process.env.DATABASE_URL` (o la variable que corresponda), definida en el
entorno del despliegue.

El 2026-07-28 se encontraron siete archivos con la contraseña de producción de
Neon escrita en texto plano (`test-db.js`, `test-db-fetch.js`, `test_db.js`,
`check.js`, `cleanPasto.js`, `viewPasto.js`, `server/add_new_clubs.js`), todos
versionados. Eran scripts sueltos que nadie importaba; se eliminaron.

Borrarlos **no** los saca del historial de git: quien tenga un clon anterior
sigue viendo la contraseña. Por eso, ante una exposición así, lo que resuelve
es **rotar la credencial en Neon**, no sólo borrar el archivo.

## GitHub

- Repo único: `valkomen-llc/rotary-clubs-app`.
- Rama de trabajo actual: ver instrucciones de la sesión.
- No usar `gh` CLI — usar las MCP tools de GitHub.
