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

## Creador de Reels IA — v4.787

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
| `server/lib/reelPresets.js` | Los TIPOS DE PIEZA: cuántas fotos, cuánto dura, qué cuenta cada escena |
| `server/lib/emergencySpec.js` | Campaña de Emergencia: catálogos, contexto y el control de datos |
| `server/lib/reelSceneText.js` | Los rótulos: qué dicen y cuándo aparecen |
| `server/lib/reelTextOverlay.js` | Los rótulos y la tarjeta de cierre: SVG rasterizado con sharp |
| `server/lib/reelDirector.js` | Mira las tres fotos y decide orden, ritmo, estilo por escena y música |
| `server/lib/reelRenderProviders.js` | Capa desacoplada del montaje: FFmpeg local + Shotstack, Creatomate, JSON2Video |
| `server/lib/reelFfmpeg.js` | Compositor local: extracción de fotogramas, conformado y montaje |
| `server/lib/canvasExpansion.js` | AI Canvas Expansion: adapta el lienzo de una foto al formato antes de animarla |
| `server/lib/reelCopy.js` | Copies por plataforma, saneado, límites y exportación |
| `server/lib/institutionalVoice.js` | Reglas editoriales compartidas con el Generador de Publicaciones |
| `server/lib/publicationContext.js` | Tipo de Publicación y Enfoque Rotary, compartidos con el Generador de Publicaciones |
| `server/lib/reelNarration.js` | Guion hablado, voces TTS y Narrative Timing Engine |
| `server/lib/reelMusic.js` | Banda sonora: KIE generativo + biblioteca licenciada |
| `server/lib/reelQuality.js` | Inspección de las fotos, validación de los archivos y control de fidelidad visual y humana |
| `server/lib/reelUsage.js` | Registro de consumo por proveedor, reparto declarado de responsabilidades y tarifas |
| `server/lib/ensureReelSchema.js` | Crea `ReelProject` y `ReelScene` en runtime |
| `server/controllers/reelController.js` | Flujo completo y máquina de estados |
| `src/components/admin/content-studio/VideoCreator.tsx` | Preparación, progreso y previsualización |
| `src/components/admin/content-studio/ReelLibrary.tsx` | La Biblioteca de Reels: listado, ficha, edición y duplicado |
| `src/components/admin/content-studio/ReelUsagePanel.tsx` | Panel de auditoría del consumo |
| `src/components/admin/content-studio/SceneBrandCheck.tsx` | Fidelidad de identidad visual por escena |
| `src/lib/reelSpec.ts` | Espejo mínimo: tipos y cálculo de la línea de tiempo |

Pruebas: `npm run test:reels:people` (58 casos). **No necesitan base, credenciales
ni red**: prueban el CRITERIO —`buildPeopleReport`, `resolveSceneIntensity` y el
presupuesto del prompt—, separado de la orquestación, por el mismo motivo que
`seoRules.js` vive aparte de `seoAudit.js`.

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
  intenta: por encima de cierto crecimiento ningún modelo sostiene la coherencia
  y entregar un lienzo inventado es peor que pedir otra foto. **Dónde está ese
  punto sí cambió** (v4.714): estaba en 3,2 y dejaba fuera el caso más común del
  cliente. Medido con las tres fotos reportadas —2,2:1 a 2,3:1, apaisadas de
  móvil— hacía falta crecer 3,95× / 4,04× / 4,09×; un 16:9 exacto daba 3,16 y
  pasaba por los pelos, así que **en la práctica cualquier foto más ancha que
  16:9 se recortaba**. Ahora el techo es 4,5 (~2,53:1). Al tocar este número,
  medirlo contra fotos reales: el rango útil es estrecho y el fallo es
  silencioso por el otro lado.
- **Un `skip` con `ok:false` NO es «no hacía falta»: es «no se pudo»**, y hasta
  v4.713 esa distinción se perdía en el camino. `planExpansion` devuelve el
  rechazo sin la marca `failed`, y la ficha sólo pinta el motivo cuando la ve:
  el aviso «la imagen es demasiado apaisada» se escribía en la base y **no lo
  leía nadie**. El usuario veía el recorte sin explicación. La marca se pone en
  `startSceneExpansion`, que es el único sitio que conoce el resultado real.
- **El rechazo se dice con su CONSECUENCIA, no sólo con su motivo**
  (`consequence`). «Demasiado apaisada» no le explica a nadie que va a perder a
  las personas de los bordes. Y va también a las anotaciones del proyecto, no
  sólo a la escena: quien mira el Reel terminado no está mirando la ficha de
  cada foto.
- **Cuando la expansión no actúa, el montaje RECORTA AL CENTRO**
  (`buildFilterGraph`: `scale=…:force_original_aspect_ratio=increase,crop=W:H`).
  No es un modo alternativo ni un respaldo elegido: es lo que queda cuando la
  adaptación no se hizo. Por eso un rechazo silencioso es tan caro — el recorte
  se lleva exactamente los bordes, que es donde están las personas de los
  extremos.
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
- **La CANTIDAD de acciones pedidas es el mando de la CADENCIA** (v4.704,
  `MOTION_INTENSITY`). Los clips salían acelerados, como un time-lapse, y el
  montaje no tenía nada que ver: no hay ninguna alteración de velocidad en el
  grafo —`setpts=PTS-STARTPTS` sólo rebasa marcas de tiempo—. El clip llegaba
  así del motor porque el prompt de v4.673 enumeraba SIETE acciones para cinco
  segundos, y un modelo generativo comprime lo que se le pide en el tiempo que
  tiene. La velocidad no se puede pedir a un motor image-to-video; lo que se
  controla es cuánto se le pide que ocurra. Tres niveles: `sutil` (2-3
  acciones), `natural` (por defecto) y `expresivo`. **Al tocar la cláusula de
  personas, contar las acciones**: es el número que gobierna si se ve humano o
  apresurado.
- **La cadencia se AFIRMA aparte de la duración.** Decir «un video de N
  segundos» no basta: el modelo entrega el resumen comprimido de un momento más
  largo. Hace falta la frase que dice que esos segundos SE OCUPAN —«everything
  happens at the speed it happens in life … evenly paced from the first frame to
  the last»—.
- **Kling no acepta `negative_prompt`.** El input de `kling-*/image-to-video` es
  exactamente `{ prompt, image_urls, duration, sound }` (`buildVideoInput`), y
  mandar campos que el modelo no declara es lo que rompió el módulo en v4.645.
  Las restricciones se expresan dentro del prompt positivo, que además es la
  regla del sitio. Acotar CÓMO ocurre el movimiento («nunca todos a la vez»,
  «nunca desde el objetivo») no es una lista negra; enumerar efectos —humo,
  chispas, destellos— sí lo es, y eso no se hace.
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
- **Una persona INVENTADA no la ve ninguna de las otras medidas** (v4.705). Es
  el hallazgo de fondo del defecto reportado: en un clip aparecía un rostro que
  no está en la foto y la escena pasaba con 8/10. No era un fallo de la
  medición, es que el control preguntaba por deformación, deriva de identidad,
  marca y texto — y un sujeto inventado no es ninguna de esas cosas: puede estar
  perfectamente dibujado y ser perfectamente él mismo. El modelo contestaba «sin
  problemas» con honestidad. **Al añadir un defecto al control, comprobar que
  alguna pregunta lo cubra**; una nota alta sólo significa que no se encontró lo
  que se preguntó.
- **El recuento se hace comparando LAS DOS MITADES de la misma composición**, no
  contra el censo del análisis. Los dos números salen de la misma pasada del
  mismo modelo sobre la misma imagen, así que su sesgo de conteo se cancela al
  restar. Contrastar contra un censo tomado en otra llamada compararía dos
  criterios distintos y daría falsos positivos. `analysis.personCount` se usa
  para MOSTRARLO y como referencia del prompt; no decide.
- **Por encima de ocho personas el recuento no decide solo**
  (`RELIABLE_COUNT_MAX`). Contar catorce cabezas no lo hace bien ningún modelo
  de visión, y regenerar por un ±1 en una multitud sería gastar créditos en un
  problema inexistente — el mismo error que ya costó dos rondas en v4.675. En
  multitud sólo vale la señal explícita `newSubjects`, y la ficha lo dice.
- **El desvío se mira en las DOS direcciones y por fotograma.** Con un solo
  `Math.max` se detectaba que sobrara gente pero nunca que faltara: un fotograma
  con una persona de menos quedaba tapado por los otros dos. Lo destapó una
  prueba, no producción.
- **El prompt negativo viaja en `negative_prompt`, NO pegado al positivo.** Dos
  motivos y los dos importan: (1) presupuesto — los veinte términos consumían
  640 de los 2500 caracteres que Kling da al prompt, el 26 %, y expulsaban
  frases afinadas durante treinta versiones; en su campo tienen otros 2500 para
  ellos solos; (2) la regla del sitio de escribir en positivo existe porque el
  modelo se obsesiona con lo prohibido cuando la prohibición está DENTRO de la
  descripción de la escena — en un campo aparte la lee como lo que es. Si la
  pasarela rechaza el campo, `createKieVideoTask` **reintenta sin él** en vez de
  fallar: el censo y la oclusión del positivo son la parte que sostiene la
  preservación.
- **El prompt de escena tiene presupuesto y se recorta con ORDEN** (2500,
  `REEL_PROMPT_MAX_CHARS`). Se sacrifica el ambiente, luego el mapa de sujetos,
  luego el `motionHint` —recortado por palabra entera, nunca eliminado, porque
  es lo único específico de ESA foto—. El censo y la oclusión no se tocan: son
  lo que se añadió para resolver el defecto. Lo que se deja fuera se anota en
  consola; un recorte silencioso convierte «lo pedimos» en una afirmación falsa.
  **Al añadir una frase al prompt, medir**: el peor caso llegó a 4.362.
- **La intensidad se acota POR ESCENA y nunca sube** (`resolveSceneIntensity`).
  Caras tapadas o grupo denso bajan a «sutil»; tres personas o más, a «natural».
  El motivo es que cada acción pedida es una ocasión más de que el motor
  redibuje lo que la foto no muestra. **Y el motivo se le enseña al usuario**:
  una escena que se mueve menos que las otras sin explicación se lee como un
  fallo del motor.
- **La oclusión se pide en POSITIVO**, como todo lo demás: «lo que la fotografía
  tapa sigue tapado», no «no inventes lo que hay detrás». Es además el mecanismo
  concreto del defecto — lo que la foto oculta es exactamente lo que un modelo
  generativo completa.
- **Un sujeto inventado descalifica igual que un logotipo redibujado**, y por el
  mismo motivo: no hay criterio estético que valga. Una pieza institucional no
  puede mostrar a alguien que no estuvo ahí. Entra en `descalificados` junto a
  `brandAltered` y `textIllegible`, con el mismo tope de reintentos.
- **La escala de fidelidad es 0-10 y se pinta `X/10`.** La Biblioteca la
  mostraba como porcentaje (`score * 100`) y decía «800 %». Es la misma clase de
  error que el `score: 1` del 2.5D en v4.676: la escala está escrita en
  `minFidelityScore: 7`, no hay que deducirla.
- **Un logotipo no se puede juzgar en la comparación de escena completa**
  (v4.715). `buildComparisonImage` reduce a 640 px de alto: un fotograma de
  1080×1920 se achica 3×, y el estampado de la espalda de una camiseta —unos
  230×140 px— llega con 77×47 px y las letras a **9 px**. A ese tamaño no las lee
  ningún modelo, y encima se recomprime a JPEG. Por eso `brandAltered` contestaba
  `false` con el logotipo visiblemente destrozado: **no era un error de criterio
  del modelo, es que no se le estaba enseñando el logotipo**, y la regeneración
  por marca alterada —que ya existía— no llegaba a dispararse nunca.
- **La región de la marca se recorta y se compara a RESOLUCIÓN NATIVA**
  (`checkBrandFidelity`). Medido con un logotipo destrozado: la escena completa
  baja de 1,000 a **0,988** —invisible, ningún umbral lo distingue del ruido— y
  el recorte de la región cae a **0,717**. La señal se amplifica ~23× porque
  sobre la escena el logotipo es el 1 % de los píxeles y recortado es el 100 %.
  **Al añadir una comprobación de detalle, recortar primero.**
- **El análisis publica DÓNDE está cada marca** (`brandRegions`, normalizado
  0-1). Sin coordenadas no hay recorte posible, y sin recorte no hay
  comprobación. Salen de la misma llamada de visión que ya mira la foto: no
  cuesta una llamada más.
- **El recorte se toma en coordenadas FIJAS y la persona SE MUEVE.** Es la
  limitación de este control y decide quién manda: la huella perceptual del
  recorte no distingue «el logotipo se movió» de «el logotipo cambió», así que
  **con modelo de visión decide el modelo** y las señales deterministas sólo
  deciden solas cuando no lo hay. Hacerlas decidir siempre mandaría a regenerar
  escenas correctas — el error que ya costó dos rondas de créditos en v4.675.
- **Se comprueba también la consistencia TEMPORAL del logotipo**, comparando el
  recorte entre fotogramas del propio clip. Un logotipo que se redibuja de un
  fotograma a otro es el «derretimiento», y se detecta sin el original.
- **NO se reproyecta el logotipo original sobre los fotogramas.** Es composite, y
  la regla #1 del sitio lo prohíbe —el equipo lo rechazó dos veces con las
  palabras «se ve overlay / montaje»—. Además exigiría decodificar el video,
  seguir la tela con flujo óptico y volver a codificar, dentro de una función de
  120 s y 250 MB que ya empaqueta FFmpeg. Este control **mide y manda a
  regenerar; no retoca el archivo**. No reintroducirlo como idea nueva.
- **Una marca sobre una PERSONA acota la intensidad; sobre un pendón quieto no.**
  La tela se mueve con el cuerpo y cada acción pedida es una ocasión más de que
  el motor redibuje el estampado. Es la jerarquía declarada: la fidelidad de la
  marca manda sobre la intensidad de la animación, nunca al revés.
- **La CONTINUIDAD, no la amplitud, es lo que separa un vídeo de una secuencia
  de poses** (v4.716). Los clips se veían «congelados y por fotogramas», y las
  dos cosas eran el mismo defecto: un movimiento pequeño pero INTERMITENTE deja
  una imagen quieta en la que los pocos cambios aparecen como saltos. Las
  cláusulas de `MOTION_INTENSITY` decían «now and then one of them blinks»;
  ahora afirman que algo está siempre en marcha y que cada gesto enlaza con el
  siguiente. **Al tocar estas cláusulas, comprobar que sigan pidiendo
  continuidad** — subir el número de acciones no arregla la intermitencia, y
  además reintroduce el efecto acelerado de v4.704.
- **La OCLUSIÓN acota a «Natural», nunca a «sutil»** (corregido en v4.716).
  Bajar a «sutil` por una cara tapada fue una sobrecorrección de v4.705: en una
  fotografía de grupo institucional SIEMPRE hay alguien parcialmente detrás de
  otro, así que la condición se cumplía en la práctica siempre y las tres
  escenas salían en el nivel más quieto. Era además el lever equivocado — lo que
  el motor no debe completar se pide con la cláusula de oclusión del prompt, que
  es una instrucción concreta y en positivo, no apagando el movimiento entero.
  `sutil` queda para la multitud real (`dense`), donde dos personas sí pueden
  fundirse en una.
- **El montaje adopta los fps REALES de los clips** (`resolveEditFps`). Forzar
  30 sobre clips de 24 no interpola: DUPLICA fotogramas, y en patrón irregular.
  Sobre contenido con poco movimiento eso se percibe como tirón. Si los tres
  coinciden se usa su ritmo; si difieren se toma el mayor —subir duplica, pero
  bajar TIRA fotogramas y eso se ve siempre—; sin medida no se adivina.
- **`ScenePeopleCheck` es un componente compartido**, no una copia en cada
  pantalla: lo usan el Creador y la Biblioteca, y duplicarlo los dejaría
  separarse en silencio.
- **El timeout del montaje NO es el default de `runFfmpeg`** (v4.786). El
  adaptador local llamaba a `composeReel` sin `timeoutMs` y caía a los 100 s
  del default, dentro de una función que permite 300 (`vercel.json`, subido de
  120): al proceso lo matábamos NOSOTROS. Con 4-5 escenas, rótulos y tarjeta
  de cierre sobre la vCPU de Vercel, 100 s no alcanzan — es el «se agotó el
  tiempo (100s)» reportado con capturas. Ahora el montaje dispone de 240 s
  (`REEL_FFMPEG_TIMEOUT_MS`), que deja margen para lo que la invocación gastó
  antes y para subir el resultado después. Al añadir un paso costoso al
  montaje, MEDIRLO contra ese presupuesto.
- **UN montaje a la vez** (v4.786, `renderClaimAt` en `config`). El montaje
  local es síncrono y dura minutos; el sondeo cada 3 s, el cron y el webhook
  veían `assembling` sin `renderJobId` y cada uno relanzaba OTRO montaje del
  mismo Reel. El candado es el mismo UPDATE condicional de `sideTracksAt` —
  con marca propia, NO sobre `updatedAt`, que lo mueve cualquier nota y
  dejaría la ventana sin vencer nunca—. Ventana de 6 min > montaje más largo;
  TODOS los finales de intento la liberan (éxito, fallo, job alojado,
  relanzamiento manual): un final que no libere hace esperar 6 minutos a un
  reintento legítimo.
- **La tarjeta de cierre se compone UNA vez por proyecto**
  (`config.closingClip`). No depende de nada que cambie entre intentos, y
  re-renderizarla en cada montaje era otra corrida de ffmpeg dentro de la
  invocación que después necesita todo su presupuesto.
- **Un fallo de montaje se DESGLOSA en la pantalla**: escenas N/N, música,
  montaje ✗ con su motivo, y el botón «Reintentar montaje — sin regenerar
  escenas» donde está el error. El mensaje genérico hacía creer que se perdió
  todo cuando los clips ya estaban pagados.

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
| `REEL_PEOPLE_NEGATIVE_PROMPT` | `off` apaga el bloque de PERSONAS del prompt negativo. El censo, la oclusión y el bloque anti-paneo siguen |
| `REEL_PROMPT_MAX_CHARS` | Tope de caracteres del prompt de escena (2500, el que declara Kling) |
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

### Presets de pieza y Campaña de Emergencia (v4.783)

El módulo pasa de resolver UNA pieza a resolver CLASES de pieza. Un preset es
DATOS (`REEL_PRESETS`): cuántas fotos admite, cuánto dura, qué función narrativa
cumple cada escena, con qué se anima y qué lleva el cierre. Agregar «campaña
ambiental» o «captación de socios» es una entrada más, sin tocar el compilador
de prompts, la máquina de estados, el montaje ni el modelo de datos.

Pruebas: `npm run test:reels:presets` (91 casos). **Sin base, credenciales ni
red**: prueban el CRITERIO —presets, reparto de la duración, control de datos y
ventanas de los rótulos—, separado de la orquestación.

- **`SCENE_COUNT` es el DEFAULT, no el límite.** Hasta v4.782 era la única
  cantidad posible y se comparaba con `!==` en quince sitios, así que una pieza
  de cuatro fotos exigía un `if` por sitio. Quién decide es el PRESET.
  `distributeDurations` ya aceptaba `count` y `totalSec`: sólo estaba llamada
  con constantes.
- **La cantidad de escenas del montaje sale de `config.sceneCount`, no de una
  constante.** Con cuatro fotos, comparar contra 3 daba por COMPLETO un montaje
  al que le falta una escena, y el Reel salía con un hueco. Lo comprueba la
  prueba leyendo el archivo.
- **Con cinco fotos la historia tiene cinco partes, no tres más relleno.** La
  estructura no es la misma lista recortada: con tres, la movilización rotaria y
  el llamado a la acción comparten escena (`accion_cta`); con cinco, cada una
  tiene la suya. El director recibe los roles y decide QUÉ FOTO va en cada
  posición — el orden deja de ser una preferencia estética y pasa a ser una
  asignación.
- **Con estructura declarada, la llamada al director se hace SIEMPRE**, aunque
  el usuario haya fijado estilo, transición y música. El criterio propio ordena
  por plano abierto y marca, que no dice nada sobre cuál foto muestra el impacto
  humano.
- **El prompt del director se construye con la CANTIDAD.** Decía «TRES
  fotografías» y «Los tres, sin repetir»: con cuatro, el modelo devolvía órdenes
  de tres, `sanitizeDirection` los descartaba por inválidos y el Reel salía
  siempre con el criterio por defecto **sin que nada avisara**. Un prompt que
  miente sobre su entrada no da un error, da una degradación silenciosa.
- **NO SE INVENTA NADA sobre una emergencia real, y eso son TRES capas.** (1) Al
  prompt sólo entra lo que el usuario escribió, y el brief dice explícitamente
  qué NO se sabe —un hueco en silencio es una invitación a completarlo—. (2) La
  cláusula `EMERGENCY_FACT_CLAUSE`, encima de la regla 3 de
  `institutionalVoice.js`. (3) **`validateEmergencyCopy`, que es la que hace
  verdadera la promesa**: el modelo ESCRIBE y el código DECIDE, rechazando
  cifras no suministradas, cuantificadores vagos («miles de», «la mayoría de»),
  atribuciones inventadas («según reportes», «fuentes oficiales»),
  sensacionalismo y mayúsculas sostenidas, y reintentando con la REGLA CONCRETA
  que se rompió. Sin la capa 3, «le pedimos que no invente» es una afirmación
  que no se puede sostener.
- **La atribución falsa se rechaza SIEMPRE, con ubicación o sin ella.** Estaba
  dentro del `if (!hasFacts.location)` por haberla escrito junto a la de
  topónimos, así que con la ubicación completa —el caso normal— «según reportes»
  se colaba. Son dos cosas distintas: nombrar una ciudad que no se dio depende
  de qué se dio; atribuir a «las autoridades» es inventar una fuente siempre.
- **El guion se ENTREGA con sus avisos; los rótulos se DESCARTAN.** Agotados los
  reintentos, un guion que no cumple se devuelve anotado —quitarlo dejaría la
  pieza sin voz— y los rótulos no se publican —un Reel sin rótulos sigue siendo
  correcto—. Los copies se entregan con el aviso porque son editables con
  historial de versiones. La decisión depende de cuánto cuesta corregir cada uno.
- **Una necesidad NO se deduce del tipo de desastre.** Sería cómodo («un
  terremoto necesita alojamiento») y sería inventar. Si el usuario no marcó
  ninguna, el guion no nombra ninguna.
- **El default del preset de emergencia es la ESCENA VIVA (v4.786), y el
  cambio tiene historia que conviene no perder.** v4.783 estrenó con
  `fotografico`: un motor image-to-video REINTERPRETA los píxeles —puede añadir
  una persona que no está en la foto, defecto medido en v4.705— y evitar el
  motor era la única protección disponible. v4.785 cambió la ecuación: la
  veracidad ahora SE MIDE (censo universal, inventario, descarte estricto), y
  con esas defensas desplegadas el cliente decidió —con los resultados a la
  vista— que el resultado estático era técnicamente fiel y comunicativamente
  muerto. Los dos modos son ahora una ELECCIÓN VISIBLE en la pantalla
  («Escena viva — IA» / «Fotográfico — sin IA»), con su costo dicho; el estilo
  dejó de ser un ajuste enterrado en opciones avanzadas, que es como se
  produjo el reporte de «las escenas no tienen vida» sin que nadie supiera por
  qué. `fotografico` sigue siendo la elección indicada cuando la identidad
  manda sobre la vida.
- **Una escena SUSTITUIDA no se lee como éxito** (v4.786, `markForReview` en
  `resolveSceneWithStillMotion`). El rescate de v4.785 marcaba `ready`: quien
  pidió escenas vivas recibía una foto con paneo presentada como escena
  correcta, y el único rastro era la etiqueta del método. Ahora el rescate
  queda `needs_review` con el motivo en `statusDetail` y `substituted: true`
  en la fidelidad; la elección EXPRESA de «Fotográfico» sigue siendo `ready`,
  porque ahí la foto en movimiento es exactamente lo pedido. El Reel se
  completa igual — `needs_review` conserva su clip y el montaje lo usa.
- **La expansión de lienzo es obligatoria acá** (`requireExpansion`). Cuando la
  adaptación no actúa, el montaje RECORTA AL CENTRO y ese recorte se lleva los
  bordes, que es donde están las personas de los extremos. En una campaña de
  emergencia esa pérdida es de la evidencia misma.
- **El texto en pantalla se compone con sharp (SVG → PNG) y se pega con
  `overlay`, NO con `drawtext`.** No es una preferencia: **el binario de
  `ffmpeg-static` que empaqueta la plataforma NO trae `drawtext`** —comprobado
  sobre el propio binario—, y además exigiría una fuente en el sistema, que en
  Vercel no hay. `sharp` ya es dependencia y el reparto de líneas lo hace
  `layoutText`, el MISMO de Plantillas IA.
- **Los rótulos hay que DESPLAZARLOS en el tiempo** (`setpts=PTS+inicio/TB`).
  `enable='between(t,…)'` se evalúa sobre el reloj de la entrada principal, pero
  los fotogramas del rótulo empiezan en 0: sin desplazarlos, el de la segunda
  escena ya terminó cuando su ventana se abre y `eof_action=pass` deja pasar el
  video sin nada. Medido: **salía el primer rótulo y los otros dos no, sin una
  sola advertencia de ffmpeg**. Sólo se ve extrayendo fotogramas y contando
  píxeles de texto. Al tocar el grafo de rótulos, comprobarlo así.
- **La tabla de anchos de `measureText` está MEDIDA, no estimada.** La primera
  versión iba a ojo y daba 0,56 em a las minúsculas cuando son 0,671: un 19 % de
  menos, y el texto se salía del margen lateral por los dos lados. Si se toca,
  medirla otra vez rasterizando muestras — a ojo se subestima siempre.
- **El scrim llega hasta el borde inferior del cuadro, siempre.** Recortarlo
  antes deja una línea horizontal visible donde el degradado se interrumpe, que
  se lee como una banda pegada encima.
- **Los rótulos sólo los pega el compositor local.** Viajan como búferes y un
  proveedor alojado necesita una URL: sin la preferencia por FFmpeg, una campaña
  montada en Shotstack salía SIN TEXTO y sin aviso. Con proveedor pedido a mano
  se respeta la elección y la limitación se DICE (`limitations`).
- **El `renderSpec` se guarda SIN los búferes de los rótulos.** Un PNG de
  1080×1920 en base64 son ~70 KB, y con cinco escenas eso mete 350 KB de imagen
  en una fila que se lee en cada listado de la Biblioteca. Se guardan las
  ventanas y el texto, que es lo que sirve para diagnosticar.
- **Los textos se guardan por `sourceIndex`, no por posición.** Si alguien
  reordena o regenera una escena, el rótulo tiene que seguir a SU foto; por
  posición, un reordenamiento pondría el texto del contexto sobre el llamado a
  la acción.
- **Duplicar conserva el preset y el contexto.** Sin eso, duplicar una campaña
  de emergencia devolvía un Reel estándar —y con cinco fotos, uno que el preset
  estándar ni siquiera admite—.
- **`estandar` reproduce el comportamiento anterior y es el default.** Un cliente
  con el bundle viejo que no mande `preset` cae ahí y no nota nada. Misma regla
  aditiva que `sessions` en v4.711 y `groups` en v4.708.

### Fidelidad de imagen del motor de escenas (v4.785)

Cuatro correcciones nacidas de un reporte con capturas: tres rescatistas
inventados en una foto de escombros VACÍA, la fotografía duplicada en el lienzo
9:16 con «91 % conservado», y el clip contaminado dentro del Reel publicable.
Pruebas: `npm run test:reels:fidelity` (36 casos, sin base ni red — la parte de
imágenes usa sharp).

- **EL CENSO ES UNIVERSAL: cuenta también cuando es CERO.** Toda la protección
  de v4.705 —censo, oclusión, prompt negativo de 20 términos— estaba detrás de
  `strictPeopleFor()`, que exigía `analysis.hasPeople`. Una foto SIN personas no
  recibía NINGUNA instrucción sobre personas, y el motor pobló los escombros
  como puebla cualquier calle. «Que las 0 sigan siendo 0» también es un censo.
  Al armar una protección, preguntarse qué pasa en su caso degenerado: una
  protección sólo protege los casos para los que se armó.
- **El ambiente de una escena vacía no puede nombrar gente.** La frase de
  interior decía «anyone in the background carries on» sin mirar si había
  personas: sobre una foto vacía es una INVITACIÓN a poblar el fondo. Las
  frases del prompt se escriben para la escena que hay, no para la típica.
- **La expansión EXTIENDE, no regenera.** El prompt arrancaba con «Regenerate
  this photograph» y con bandas grandes (~25 % de lienzo) el modelo resolvía
  «regenerar» duplicando la foto entera en el área añadida — el mosaico de
  v4.317-v4.320 por la otra puerta. Ahora arranca «Extend the canvas», declara
  que la foto aparece EXACTAMENTE UNA VEZ y que el área nueva es paisaje menos
  detallado que el original.
- **La expansión manda su propio prompt negativo** (`EXPANSION_NEGATIVE_PROMPT`:
  anti-mosaico + bandas sin protagonistas). `createKieImageTask` lo aceptaba
  desde v4.734 y la expansión nunca lo usó. El reintento sin el campo vive en
  `startExpansion` —no en el servicio— porque el modelo es configurable por
  entorno y uno alternativo puede rechazarlo.
- **El mosaico se detecta comparando las bandas AÑADIDAS contra el original.**
  `verifyExpansion` sólo miraba la región central y respondía «¿se conservó la
  foto?» — con la foto duplicada en la banda inferior daba 91 % y el defecto era
  invisible: la medición era correcta, la pregunta incompleta. Medido con la
  huella perceptual: banda legítima ~0,34, copia ~0,99; el umbral (0,75,
  `EXPANSION_TILING_THRESHOLD`) parte esa brecha. En `judgeExpansion` el mosaico
  se juzga PRIMERO y reprueba solo: preguntarlo después de la preservación
  taparía justo lo que busca.
- **El prompt fija el INVENTARIO de la escena** (`analysis.inventory`, máx. 6
  elementos con posición). Sólo se reforzaba marca, texto, personas y
  naturaleza: en un plano de escombros, quitar un árbol no contradecía ninguna
  instrucción. Lo que no se nombra, el modelo lo trata como negociable. En el
  recorte del presupuesto cae después del mapa de sujetos y antes del
  `motionHint`; el peor caso medido queda en 2431/2500.
- **Agotados los reintentos, el clip con defecto descalificante NO entra al
  Reel.** Caía en `conservados` como `needs_review` y EL CLIP SE USABA — las
  capturas muestran la ficha diciendo «REQUIERE REGENERACIÓN» debajo de un Reel
  que ya llevaba ese clip adentro. El control medía bien; la puerta no cerraba.
  Ahora cae a `resolveSceneWithStillMotion` (la foto se mueve, no se regenera,
  cero créditos), cuyo propio comentario documentaba este uso desde v4.676 sin
  que nadie la llamara por esta vía. NO contradice la regla de v4.676: aquélla
  protege las escenas de NOTA BAJA —criterio estético, decisión del usuario— y
  sigue intacta; esto aplica sólo a los tres defectos sin criterio estético
  posible (persona inventada, marca alterada, texto ilegible).
- **Tras el rescate, la pasada TERMINA.** `finalScenes` se leyó antes del
  rescate: seguir al montaje en la misma pasada pegaría el clip contaminado
  desde la memoria — exactamente lo que el bloque existe para impedir. El
  siguiente sondeo monta con las filas frescas.
- **Kling no expone parámetros de preservación.** Ni `image adherence`, ni
  `creativity`, ni `motion strength`, ni `seed`: el input es `{ prompt,
  image_urls, duration, sound, negative_prompt? }` y nada más. Las únicas
  palancas reales son los dos prompts y la duración; cualquier plan que dependa
  de «bajar la creatividad» por parámetro no es implementable con este
  proveedor.

### Un paneo no es una escena viva (v4.787)

Reporte con tres clips adjuntos: «no genera videos, solo les pone movimiento o
desplazamiento a las imágenes». Los tres eran clips NUESTROS de 2.5D —el
`-still-` de la clave de S3, `Lavc61 libx264`, 5,00 s exactos— y la ficha los
presentaba con «Fidelidad: 10/10». La cadena completa: las escenas SÍ se
despacharon a Kling, cada una se descalificó dos veces por recuento de personas,
y el rescate de v4.785 las sustituyó por la fotografía en movimiento. Tres
defectos encadenados y ninguno se veía solo.

Pruebas: `npm run test:reels:life` (21 casos; la parte de imágenes usa sharp y
se salta si no está).

- **Un ±1 de recuento en UN fotograma es RUIDO, no evidencia.** Era la causa de
  fondo. `buildPeopleReport` tomaba el peor fotograma, y con tres fotogramas y
  un grupo de cuatro personas que alguno desvíe en uno es lo normal —una persona
  medio tapada se cuenta o no según el fotograma; el propio archivo ya lo tenía
  escrito y aun así decidía con el máximo—. En la práctica **casi toda escena
  con gente agotaba sus dos intentos** y terminaba sustituida: la puerta estaba
  tan cerrada que no pasaba nada vivo. Ahora el recuento exige CORROBORACIÓN:
  |delta| ≥ 2 en un fotograma, o el mismo signo en dos. **De CERO a uno
  descalifica en el acto** —nadie confunde una escena vacía con una habitada, y
  es la exigencia expresa del cliente—, y `newSubjects`, la oclusión rota y los
  rostros inconsistentes siguen descalificando solos: no se aflojó ninguna
  señal explícita, sólo la aritmética dudosa.
- **El indicador sigue al VEREDICTO y el desvío se DICE igual** (`countNoise`).
  Pintar en rojo «Personas en el clip» bajo una cabecera verde es el defecto que
  este mismo archivo se había propuesto evitar una vez; esconder que hubo desvío
  sería el opuesto.
- **La cámara se distingue de la escena SIN modelo de visión** (v4.787,
  `compareAfterCameraShift`). `measureSceneLife` decía cuánto cambió el clip y un
  paneo cambia mucho; distinguir paneo de vida se delegaba en `internalMotion`,
  que **sólo existe cuando el proveedor de visión contesta**. Ahora se busca el
  desplazamiento entero que minimiza la diferencia entre el primer y el último
  fotograma: si compensarlo hace desaparecer el cambio, dentro del cuadro no
  pasó nada. Medido sobre los tres clips del reporte: 0,900, 0,919 y 0,965 de
  cambio explicado; una escena con vida real deja residuo y no llega a
  `CAMERA_EXPLAINED_MIN` (0,8). `cameraOnly` fuerza `lifeScore: 0` con
  `lifeSource: 'frames'`, así que la escena entra al rescate de congeladas y se
  regenera.
- **Se compara con un desenfoque suave, y no es cosmético.** Un paneo real no se
  desplaza un número entero de píxeles de la imagen reducida, y sobre detalle
  fino ese resto fraccionario deja residuo aunque el encuadre sea lo único que
  se movió: se estaría midiendo el aliasing del reescalado. Sin el `blur(1)`,
  un paneo sintético de ruido puro daba 0,63 y pasaba por vida.
- **Dos fotogramas casi idénticos NO se declaran «cámara».** Sin desplazamiento
  no hay desplazamiento que explicar, y de la escena congelada ya se ocupa
  `score`. Afirmar que se movió la cámara sería inventar un movimiento.
- **Un paneo CON algo moviéndose dentro cuenta como vida.** Lo que se castiga es
  la ausencia de escena, no la presencia de cámara.
- **El anti-paneo va en `negative_prompt` y va SIEMPRE**
  (`MOTION_NEGATIVE_TERMS`). El positivo lleva desde v4.674 diciendo que la
  cámara está fija, y aun así el motor entrega a veces la salida más barata que
  satisface «hacé un video de esta foto». No se acota a las escenas con
  personas —una foto de escombros vacía también tiene que moverse en vez de
  deslizarse bajo la cámara: es la lección del censo universal de v4.785—, y
  `REEL_PEOPLE_NEGATIVE_PROMPT=off` apaga sólo el bloque de personas.
  `buildSceneNegativePrompt` ya nunca devuelve `null`.
- **La escena resuelta sin motor DECLARA vida cero** (`lifeSource:
  'still-motion'`). Su fidelidad es 10 porque los píxeles son los del original y
  eso es cierto; su vida es 0 por la misma razón. Son preguntas opuestas
  (v4.675) y declarar sólo una es lo que hacía que «Fidelidad: 10/10» se leyera
  como una escena lograda.
- **`SceneLifeCheck` es un componente COMPARTIDO**, como `ScenePeopleCheck`. El
  Creador ya mostraba el nivel de vida y la Biblioteca no mostraba nada: la
  ficha de la Biblioteca es la que el cliente fotografió. Distingue tres casos y
  cada uno dice algo distinto —sustituida (ámbar, con motivo y botón de
  regenerar), fotográfica por elección (descriptivo, no es un defecto) y animada
  (nivel de vida, y si el cambio es cámara se dice)—.
- **Un Reel con escenas sustituidas NO queda «listo»** (`foldSubstitutedScenes`,
  en los DOS caminos de montaje). `validateReelFile` mira el CONTENEDOR
  —resolución, duración, audio, tasa de bits— y por eso daba `ready` a una pieza
  impecable cuyas tres escenas eran la fotografía paseando bajo la cámara. Baja
  a `needs_review` y nombra las escenas. El archivo estaba bien; el contenido
  no, y eso el validador del contenedor no lo puede ver.
- **Al añadir un defecto al control, comprobar que alguna pregunta lo cubra** —y
  al AJUSTAR un umbral, comprobar cuántas escenas legítimas descarta. La regla
  de v4.705 tenía media lección: un control demasiado estricto no falla
  ruidosamente, entrega otra cosa y la presenta como éxito.

**Pendientes conocidos:** el outro adjunto sigue viajando en `config.outro` y no
se concatena al montaje —con FFmpeg ya disponible, engancharlo es agregar su
clip al final de `buildEditSpec`—; los motores `runway_gen4` y `luma_ray2`
están declarados con `available:false` porque necesitan su propio adaptador (hoy
sólo existe el de KIE); y el texto en pantalla **no tiene todavía una pantalla
para editarlo a mano** — se escribe solo y se puede regenerar, pero corregir una
palabra exige regenerar el rótulo entero.

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

### La sede del evento (v4.717)

La ficha pública muestra, bajo la ubicación, dónde se realiza el evento: foto
del lugar, nombre, dirección, sitio web, personas de contacto y mapa.

| Archivo | Qué es |
|---|---|
| `src/lib/eventVenue.ts` | El criterio: forma, normalización y qué mapa se acepta |
| `src/components/EventVenueCard.tsx` | El bloque en la ficha pública |
| `src/components/admin/events/EventVenueEditor.tsx` | La pestaña «Sede» del panel |

- **Vive en `CalendarEvent.metadata.venue`**, la columna `Json` que ya existe.
  No se agrega una columna a Prisma: eso obligaría a sincronizar la base, que
  es justo lo que la sección de base de datos de este archivo manda evitar.
- **Es POR EVENTO, no escrito en el código.** El único mapa que había era el de
  la Conferencia LATIR, con la dirección dentro de `EventoDetalle.tsx` y detrás
  de un `if` por id de evento: servía para ese evento y para ninguno más, y no
  se podía cambiar sin desplegar. Ese bloque se conserva; el nuevo no lo
  sustituye porque sus datos siguen sin estar en la base.
- **Sólo se admiten mapas de GOOGLE** (`normalizeMapUrl`). Es un `<iframe>` que
  se dibuja en una página pública: aceptar cualquier dirección convertiría un
  campo de texto del panel en un hueco por donde meter cualquier cosa en el
  sitio. Se rechazan otro dominio, `http`, `javascript:`, `data:` y una URL de
  Google que no sea un mapa.
- **Se pega lo que Google da.** El administrador copia el `<iframe>` completo y
  del texto se extrae el `src`; también vale la dirección suelta. Pedirle que
  recorte el atributo a mano es pedirle que edite HTML.
- **El borrador NO es el contrato de lectura** (v4.718, `draftVenue` frente a
  `normalizeVenue`). Es el fallo que rompió «Agregar contacto»: la limpieza de
  lectura descarta el contacto vacío y le completa el `https://` al sitio web
  —lo correcto antes de publicar—, pero aplicada al borrador hace imposible
  escribir. Un contacto recién agregado nace vacío por definición: se creaba y
  se descartaba en el mismo render. Y el sitio web se convertía en `https://w/`
  con la primera pulsación. El editor trabaja sobre `draftVenue`, que sólo da
  forma; se limpia al leer.
- **El mapa y el sitio web se normalizan al SALIR de la casilla, no en cada
  pulsación.** Normalizar mientras se escribe borra el texto a mitad de pegarlo.
- **Probar el EDITOR, no sólo la ficha.** v4.717 verificó cómo se ve la sede en
  la página pública y no cómo se carga desde el panel: por eso el defecto llegó
  a producción. `editor-sede` monta el componente a pelo —sin el resto del
  panel— y lo maneja en un navegador.
- **Cada pieza se dibuja sólo si está** (`venueHasContent`). Una sede con foto y
  sin contactos no deja un hueco donde iban los contactos, y un evento sin sede
  configurada se ve exactamente como antes.
- **Correo y teléfonos van con su enlace** (`mailto:`, `tel:`). Esto se mira
  sobre todo desde el móvil, donde copiar un número es trabajo.
- **La casilla de la foto ofrece las DOS vías** —subir o elegir de la Biblioteca
  Multimedia—, que es la regla del sitio desde v4.700.
- Pruebas: `npm run test:event-venue` (35 casos). **No necesitan base,
  credenciales ni red**: prueban el CRITERIO —qué mapa se acepta, cómo se
  normaliza el sitio web, qué contacto se descarta y cuándo se dibuja la sede—,
  separado de cómo se pinta.

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
- **Nunca un `<datalist>`** (v4.656, pedido del cliente). País y Departamento
  tenían uno de sugerencias y el navegador lo desplegaba encima del formulario
  al hacer clic: parecía un selector obligatorio con un catálogo corto, cuando
  en realidad admitían cualquier valor. La conclusión que quedó escrita es que
  **si hay que ofrecer una lista, es un `select`**; un `datalist` sugiere sin
  restringir y confunde las dos cosas. Desde v4.708 esos campos SÍ son `select`
  cuando hay catálogo — ver la sección siguiente—, que es exactamente lo que
  esa conclusión decía que había que hacer.

### Ubicación y datos rotarios del asistente (v4.708)

El paso 1 pide, además de los datos básicos, dos bloques: **Ubicación** (país,
departamento/estado/provincia, ciudad) y **Tu club en Rotary** (distrito, club,
rol en la feria). Van en las tres categorías.

- **Lo que decide la forma de los campos es el PAÍS DECLARADO, no el idioma ni
  la audiencia.** Con Colombia, el departamento, el distrito y el club salen de
  listas; con cualquier otro país, los tres son texto libre. El idioma habría
  sido el criterio equivocado y el propio cliente lo señaló: un rotario
  colombiano puede leer el sitio en inglés y un extranjero en español. La
  audiencia tampoco sirve —un colombiano puede inscribirse por el registro
  internacional—. Lo que sí decide la audiencia es **con qué nace** el
  formulario: el nacional trae Colombia puesta (`defaultAnswersFor`), porque
  hacer buscar «Colombia» en doscientos países a quien seguro es de aquí es
  trabajo para todos los inscritos.
- **`catalog` + `dependsOn` en el campo, `optionsForField` para resolverlo.** Un
  campo declara de qué catálogo salen sus opciones y de qué respuesta depende
  ese catálogo; una sola función devuelve la lista o `null`. `null` y `[]` son
  cosas distintas: `[]` es «hay catálogo y está vacío». Está espejado en
  `src/lib/eventRegistrationSpec.ts` — al tocar uno, tocar el otro.
- **Los catálogos van donde ya tienen su fuente de verdad.** Los distritos con
  sus clubes los manda el SERVIDOR en la respuesta de la configuración, porque
  `rotaryClubs.js` (v4.707) es su única verdad y copiarla al bundle daría dos
  listas que se separan en silencio. Los países y los departamentos de Colombia
  los pone el NAVEGADOR, que ya los lleva para el selector telefónico y para
  Postular Proyecto: mandarlos desde el servidor sería duplicar en la respuesta
  lo que el bundle carga de todos modos.
- **La lista ayuda a escribir; NO cierra los valores aceptados.** El servidor
  valida departamento, distrito y club como texto. Un catálogo se queda viejo
  solo —clubes nuevos, fusiones, cambios de nombre— y esta es una inscripción
  que se PAGA: rechazar a quien no figure sería perderlo. Por eso el club
  termina en «Mi club no está en la lista», va de última y cuesta un clic extra.
  La única lista que sí es cerrada es la del rol en la feria, que es nuestra.
- **Lo que SÍ se rechaza es un club del catálogo de OTRO distrito.** No es un
  club que falte: es una pareja distrito-club que se contradice. Sin falso
  positivo posible —un club que figure en los dos pasa por la primera
  condición—. Misma regla que la postulación (v4.706).
- **El distrito va ANTES que el club**, porque es lo que decide qué clubes se
  ofrecen. Cambiar de distrito descarta el club, y cambiar de país descarta el
  departamento: el anterior ya no describe nada.
- **La lista de distritos es la COLOMBIANA y por eso también depende del país.**
  Ofrecer dos distritos a quien vive en Miami es ofrecerle una lista en la que
  no está. Una edición que traiga su propio catálogo declara a qué país
  corresponde (`catalogs.districtsCountry`).
- **`fairRole` NO es `rotaryRole` renombrado.** El cargo dice qué es esa persona
  en su club todo el año; el rol dice qué va a hacer DURANTE el evento, que es
  lo que necesita la logística. Por eso la clave es nueva: escribir uno donde
  estaba el otro convertiría «Tesorero» en un papel en la feria que nadie
  declaró. `rotaryRole` sigue exportado para rotular lo que respondieron las
  inscripciones anteriores, y su columna **no se vacía al reenviar** el
  formulario — misma regla que `language` en v4.655.
- **Un campo retirado sigue viéndose en la ficha.** `RETIRED_LABELS` en
  `EventRegistrationsManager.tsx` le pone nombre a lo que ya no está en el
  formulario (`rotaryRole`, `residenceCountry`, `language`); sin eso la ficha
  mostraba la clave cruda como si fuera la pregunta. Al retirar un campo,
  agregarlo ahí.
- **`department` y `fairRole` son columnas promovidas**, como ya lo eran ciudad
  y distrito: son los ejes por los que el comité segmenta y un filtro sobre el
  JSON no se indexa. Al agregar una columna, ampliar también
  `OWNED_REGISTRATION_COLUMNS` en el ensure — esa lista **no es un número de
  versión**: si no se amplía, la comprobación rápida da la columna por presente
  y no se crea.
- **Las columnas las decide CADA bloque, no el paso** (`columns` en el grupo).
  Un bloque de tres campos tiene su propia rejilla y ocupa el ancho completo,
  igual que en Postular Proyecto: heredar las dos columnas del paso dejaba el
  tercero colgando bajo el primero. Los datos básicos siguen a dos porque son
  pares naturales. Y por eso el departamento tiene DOS rótulos (`altLabel`):
  «Departamento / Estado / Provincia» se parte en dos líneas dentro de una
  columna de un tercio y baja el control respecto de sus vecinos. Al agregar un
  campo a estos bloques, mirar que su rótulo quepa en una línea.
- **Los `groups` del paso son ADITIVOS.** `FormStep.fields` sigue trayendo todo
  aplanado y en orden, así que un navegador con el bundle anterior dibuja el
  mismo formulario sin los subtítulos, en vez de quedarse sin los campos nuevos.
- Pruebas: `npm run test:event-form` (61 casos). **No necesitan base,
  credenciales ni red**: prueban el CRITERIO —composición del formulario,
  resolución de catálogos, validación y valores por defecto—, separado de la
  orquestación.

## Los bloques de la página pública de Proyectos — v4.750

`/proyectos` abría con dos bloques **escritos en el código**, iguales para todos
los sitios: la franja azul «Transformando Vidas…» con sus botones, y la banda de
cifras de impacto. Ahora cada sitio los enciende o los apaga.

| Archivo | Qué es |
|---|---|
| `src/lib/projectsPageLayout.ts` | El CRITERIO. **Puro**: qué se enciende, cómo se normaliza lo guardado y cómo se rotula cada interruptor |
| `src/pages/Proyectos.tsx` | Los dibuja —o no— |
| `src/pages/admin/Projects.tsx` | La tarjeta «Página pública de Proyectos» |

Pruebas: `npm run test:projects-page` (35 casos; la parte pura no necesita nada
y la de navegador pide `playwright` y `esbuild` y **se salta sola** si faltan).

**Reglas durables:**

- **Nacen APAGADOS**, y el motivo del segundo no es estético: las cifras
  —«150+ proyectos», «$12.5B recaudados», «50.000+ beneficiarios», «3.500+
  donantes»— están escritas a mano en `impactoStats` y **no salen de ninguna
  consulta**: no son ciertas para ningún club. Publicar cifras inventadas en el
  sitio de una institución no es una preferencia. Es la misma postura del Bloque
  Destacado (v4.746): un contenido escrito en el código no puede aparecer en
  todos los sitios por omisión.
- **El interruptor DICE que las cifras son de ejemplo.** Sin eso, alguien las
  enciende creyendo que salen de sus proyectos. Lo comprueba la prueba.
- **El criterio vive aparte porque lo consumen las DOS puntas.** Si la página y
  el panel decidieran cada uno su valor por defecto, el panel enseñaría un
  interruptor encendido sobre un bloque que la página no pinta. Ese desajuste no
  lo ve el typecheck y en la pantalla se lee como «el interruptor no funciona».
- **Sólo `true` enciende** (y la cadena `'true'`, porque el almacenamiento de
  secciones ha guardado booleanos como texto). Cualquier otra cosa deja apagado:
  ante la duda no se publica algo que el sitio no eligió publicar.
- **Apagado es NO DIBUJADO, no oculto por CSS.** Un bloque escondido con
  `hidden` sigue en el documento y lo leen el lector de pantalla y los
  buscadores. Lo comprueba la prueba de navegador contando nodos, no estilos.
- **Con los dos apagados no queda una sección vacía.** La condición envuelve al
  `<section>` entero, no sólo a su contenido: si no, quedaría la franja azul con
  su fondo y sin nada dentro.
- **Son DOS interruptores, no uno.** Un sitio puede querer la portada sin
  publicar cifras que no son suyas; es justo la combinación más probable.
- **La tarjeta va en el módulo de Proyectos, no en una pantalla nueva.** Mismo
  criterio que la «Sección pública de Eventos»: la decisión se toma donde ya se
  está trabajando, y las pantallas que se olvidan son siempre las del segundo
  lugar.
- **Un guardado fallido REVIERTE el interruptor.** Dejarlo donde el usuario lo
  puso, sabiendo que no se guardó, hace creer que el cambio quedó hecho.

## La agenda del Distrito: traer eventos del ecosistema — v4.747

El sitio de un Distrito trae a su propia agenda los eventos próximos de las
organizaciones vinculadas a él —clubes, la Feria de Proyectos, RYE, fundaciones,
programas—. Se resolvió **CLONANDO**, no referenciando.

| Archivo | Qué es |
|---|---|
| `server/lib/districtEcosystem.js` | El CRITERIO. **Puro**: qué se copia, cómo se rotula cada organización, a dónde apunta el original, qué cuenta como divergencia |
| `src/lib/districtEcosystem.ts` | Espejo en el navegador |
| `server/controllers/districtEcosystemController.js` | La orquestación y el aislamiento |
| `server/routes/district-ecosystem.js` | `/sites`, `/events`, `/clone`, `/refresh/:cloneId` |
| `src/components/admin/events/EcosystemPicker.tsx` | El buscador y la selección múltiple |
| `src/components/admin/DistrictPicker.tsx` | El selector de distritos registrados, compartido por las cinco pantallas de sitios |

Pruebas: `npm run test:ecosystem` (192 casos de criterio, **sin base,
credenciales ni red**) y `npm run test:ecosystem:ui` (48 casos: monta los
componentes en un navegador con la API interceptada; pide `npm i --no-save
playwright esbuild` y **se salta solo** si no están).

**Reglas durables:**

- **Es un CLON, no una referencia, y la decisión fue del cliente sabiendo el
  precio.** Se evaluaron las dos: una tabla de referencias con `JOIN` daría una
  única fuente de verdad garantizada por construcción —todos los sitios viven en
  la MISMA base Postgres, así que «consumir el evento del club» es un `JOIN`, no
  una federación—; el clon no la da, pero **no exige ningún cambio de esquema**
  y el evento traído es una fila más de `CalendarEvent` que el módulo de siempre
  lista, edita y publica sin enterarse. Se eligió el clon por eso. Si algún día
  la divergencia duele más que el esquema, la migración está preparada: **todos
  los clones son localizables** por `metadata.source.eventId`.
- **La huella `metadata.source` es lo único que separa esto de un copiar y
  pegar.** De ella salen las tres cosas que hacen el clon sostenible: la
  ATRIBUCIÓN en la ficha pública, la DIVERGENCIA (`divergenceOf`) y el botón de
  ACTUALIZAR. Sin huella, una copia es irrecuperable: nadie puede saber de dónde
  vino ni contra qué compararla. Cuesta una línea al clonar.
- **El clon NO se lleva la inscripción**, y es el punto de todo el módulo.
  `EventEdition."eventId"` es UNIQUE y `EventRegistration`,
  `EventRegistrationCategory` y `EventRegistrationPayment` cuelgan de `eventId`:
  el clon nace con un id nuevo, así que no tiene edición, ni categorías, ni
  precios. Copiar `metadata.registration` —o `metadata.latir`, que es la otra
  llave del panel— le pondría un botón «Inscribirme» que lleva a un formulario
  **vacío**, y quien se inscribiera desde el sitio del Distrito no se estaría
  inscribiendo a nada. Eso **no se ve mirando la pantalla**: se ve el botón y
  parece que funciona. `metadata.venue` SÍ se copia: la sede es un dato del
  lugar, no del cobro.
- **Se acredita al organizador y se enlaza a su ficha original.** Es lo que
  separa difundir de apropiarse, y es además dónde vive la inscripción. Va en la
  página pública del evento (`EventoDetalle.tsx`) y en el panel.
- **El Distrito clona LIBREMENTE de sus sitios; no hay casilla de permiso.** Son
  eventos ya públicos y el clon siempre acredita y enlaza. Una casilla de
  autorización por evento dejaría la función **vacía el día del despliegue** —no
  aparece nada hasta que cada club haga algo— y obligaría a tocar el formulario
  de eventos de todos los sitios. Si alguna vez se pide, el sitio para ponerla es
  el formulario del evento, no una pantalla nueva: las pantallas que se olvidan
  son siempre las del segundo lugar.
- **Sólo se vigilan CUATRO campos** (`TRACKED_FIELDS`): título, fecha de inicio,
  fecha de fin y ubicación. La descripción y el HTML cambian por correcciones de
  redacción que a nadie le urge propagar; esos cuatro son los que mandan a
  alguien al sitio equivocado el día equivocado. Avisar de todo sería avisar de
  nada: el aviso que salta siempre se deja de leer.
- **«El original ya no existe» es distinto de «no cambió nada»** (`missing`), y
  se dice distinto. Refrescar un clon huérfano devuelve 409 con el motivo y **la
  copia se conserva**: borrarla por nuestra cuenta sería decidir por el Distrito.
- **Editar un clon lo separa de su original, y eso es legítimo** —el Distrito
  puede querer su propio texto—. Lo que no puede pasar es que ocurra sin saberlo,
  así que se avisa **donde se edita**.
- **Al refrescar se conserva el SLUG del clon.** Es su dirección publicada y
  puede estar circulando; renombrarla rompería enlaces ya compartidos.
- **El slug se libera con sufijo antes de insertar** (`freeSlug`). El slug del
  original no choca al llegar a otro sitio —es otro `clubId`—, pero clonar dos
  eventos homónimos dentro del mismo distrito sí choca con el índice único
  `(clubId, slug)`, y el error de Postgres saldría como un 409 sin explicación.
- **El aislamiento vive en `resolveScope`**, en un solo punto por el que pasan
  las cuatro rutas — mismo patrón que `buildFilters` en Postulaciones y
  `ownedMedia` en la Librería. Un evento de un sitio ajeno al distrito no se trae
  y se reporta como «no disponible»: confirmar que existe sería filtrar que
  existe.
- **Hacía falta una ruta nueva porque hoy no hay ninguna.** `GET /api/calendar`
  filtra por `req.user.clubId` (sólo el propio sitio) y `/api/admin/districts` es
  `superAdminOnly` (sólo el operador): un administrador de distrito **no podía
  ver los eventos de sus sitios por ninguna vía**. `/api/district-ecosystem` abre
  esa lectura ACOTADA; no reabre la ruta del operador.
- **El vínculo se busca por las DOS formas.** `Club.districtId` (clave foránea) y
  el número en `Club.district` conviven en producción: el alta desde
  `/admin/distritos` escribe una y el registro público escribe la otra. Mirar
  sólo una deja fuera a la mitad de los sitios. El tipo de sitio se resuelve con
  `isDistrictSiteType` de `districtSite.js` —**no se escribe un segundo
  criterio**—, y el espejo del navegador lo compara contra él en las pruebas.
- **`Club.district` ES UNA LISTA, no un valor** (v4.748). El formulario del panel
  lo dice desde siempre en su marcador de posición —«Ej: 4271, 4281, 4290…»— y
  una Feria de Proyectos o una Zona pertenecen de verdad a varios distritos. La
  v4.747 comparaba por IGUALDAD EXACTA, así que un sitio con «4271, 4281» **no lo
  reconocía NINGUNO de los dos** y su evento no aparecía en «Traer del
  ecosistema». Se reportó con la Feria. Ahora se parte por todo lo que no es
  dígito (`parseDistrictTags` en JS, `regexp_split_to_table(district,
  '[^0-9]+')` en SQL): así «4271, 4281», «Distrito 4281» y «D-4281» dan lo mismo,
  y «42811» **no** cuenta como 4281 —es otro número—. **Los dos criterios tienen
  que coincidir**; la prueba los contrasta contra los mismos casos y comprueba
  sobre el archivo del controlador que no haya vuelto la igualdad exacta.
- **Los distritos se ELIGEN de la lista registrada, no se escriben**
  (`src/components/admin/DistrictPicker.tsx`). Con texto libre no había forma de
  saber qué distritos existen ni de acertar el número, que es exactamente lo que
  impedía conectar la Feria. La lista sale de `/api/admin/districts`, que es
  `superAdminOnly` — y estas cinco pantallas son del operador de la plataforma,
  así que no hace falta abrir nada.
- **La lista ayuda a escribir; NO cierra los valores aceptados.** Un distrito
  puede existir en Rotary y no estar todavía dado de alta, y este formulario se
  usa justo mientras se están creando las cosas. Queda la vía de escribir el
  número a mano —con un aviso de que aún no está registrado y de que el vínculo
  se activará solo—, igual que «Mi club no está en la lista» en la postulación
  (v4.706) y en el registro al evento (v4.708). Y si el catálogo no carga, la
  casilla **se degrada a texto libre** en vez de dejar el formulario inservible.
- **El selector es UN componente compartido por las cinco pantallas** —Ferias,
  Zonas, Programas, Eventos y Asociaciones—, que hasta v4.747 llevaban esa
  casilla escrita cinco veces, idéntica. Arreglar una y dejar cuatro es la copia
  que se queda atrás: el panel se comportaría distinto según por dónde se entre.
  Lo comprueba `test:ecosystem` leyendo los cinco archivos.
- **NO se deduce `districtId` de la lista.** Es de un solo valor y la lista puede
  traer dos: elegir uno codificaría una mentira sobre a cuál «pertenece» el
  sitio, y ese campo lo usan además otros módulos (segmentación de noticias,
  v4.551). La lista de números es la verdad multi-distrito; el que la lee es el
  criterio de arriba.
- **Los parámetros del SQL van como TEXTO VACÍO, no como NULL**, cuando el mismo
  parámetro se usa en dos comparaciones. Con NULL, Postgres tiene que inferir el
  tipo y la sentencia puede fallar en ejecución — que es justo lo que no se ve
  sin una base delante.
- **El color de la etiqueta viaja en HEXADECIMAL, no como clase de Tailwind.**
  Una clase armada al vuelo (`bg-${color}-100`) no llega al CSS compilado y la
  regla no existe, en silencio: es el fallo de `bg-rotary-blue/90` de v4.719. Con
  un hexadecimal y un `style` en línea el color llega siempre, y la prueba de
  navegador comprueba el color RESUELTO, no el atributo.
- **El botón se muestra por TIPO DE SITIO, no por rol.** La función es del sitio
  de un distrito. Eso decide **qué se pinta**, nunca a qué se tiene acceso: el
  alcance real lo resuelve el servidor y devuelve 403 con su motivo.
- **Probar la PANTALLA, no sólo el criterio** (`test:ecosystem:ui`). Es la
  lección de v4.744 —`pickDistrictSite` era correcto y el fallo estaba en el
  camino— y la de v4.717 —se verificó la ficha y no el editor—. La prueba de
  navegador comprueba que se manden al servidor **los ids que el usuario marcó**,
  que un evento ya traído no ofrezca casilla, y que un 403 se vea con su motivo
  en vez de dejar el panel en blanco.

### Proyectos (v4.749)

Lo mismo, con dos diferencias que no son de estilo.

| Archivo | Qué es |
|---|---|
| `server/lib/ensureEcosystemCloneSchema.js` | Crea `EcosystemClone` en runtime |
| `server/lib/ecosystemClones.js` | Leer y escribir la procedencia |

- **La procedencia de un proyecto NO va en el proyecto, va en `EcosystemClone`.**
  `CalendarEvent` ya tenía una columna `Json` donde meter `metadata.source`;
  `Project` **no**, y añadirle una es el riesgo de despliegue que documenta la
  regla de `logo_intl` (v4.699), agravado: `Project` se consulta con Prisma en
  media plataforma —el listado del panel, el cerebro, los reportes— y con
  `findMany` **sin `select`**, así que Prisma pide todas las columnas del
  esquema. Y el build **no ejecuta `db push`** a propósito (v4.622). Una columna
  declarada y todavía inexistente dejaría sin listado de proyectos a TODOS los
  sitios hasta que alguien corriera `npm run db:push` a mano. Una tabla creada
  en runtime no tiene ese problema.
- **Toda lectura de la procedencia DEGRADA, nunca revienta.** Si la tabla aún no
  existe, lo que corresponde es que nada figure como traído, no que la ficha
  pública de un proyecto responda 500.
- **La copia NO RECIBE APORTES**, y es lo más importante del módulo. `Donation`
  cuelga de `projectId` y la pasarela cobra al `clubId` de la página: un aporte
  hecho sobre la copia entraría a la cuenta del DISTRITO y quedaría registrado
  contra un proyecto que no es el que se está financiando. **Eso es dinero en la
  cuenta equivocada, no una molestia.** La ficha manda a aportar al sitio de
  origen. Es el mismo hallazgo que la inscripción de un evento y es peor.
- **La copia nace CON `indexable: false`.** El proyecto ya está publicado e
  indexado en el sitio de su club; dos direcciones con el mismo contenido se
  compiten en Google. `seoEntities.js` respeta ese campo, así que la copia se ve
  perfectamente en el sitio del distrito y no entra en el sitemap. Es la
  respuesta al pendiente que quedó abierto con los eventos, donde no existía un
  campo así.
- **Las cifras SÍ se copian** (`meta`, `recaudado`, `donantes`,
  `beneficiarios`): son lo que hace que la ficha se vea completa. Lo que no
  hacen es aceptar dinero.
- **Pero `recaudado` y `donantes` NO se vigilan** (`PROJECT_TRACKED_FIELDS`). Se
  mueven con cada aporte, así que vigilarlos dejaría la copia marcada como
  «cambió» de forma permanente — y el aviso que salta siempre se deja de leer.
  Se refrescan igual al pulsar «Actualizar desde el origen»; lo que no hacen es
  disparar el aviso. `meta` sí se vigila: cambiar el objetivo es una decisión de
  quien dirige el proyecto, no el goteo de los aportes.
- **`Project.slug` es ÚNICO EN TODA LA PLATAFORMA**, no por sitio como el de
  `CalendarEvent`. El slug del original **sí** choca al llegar a otro sitio, así
  que se libera consultando los slugs de todos los proyectos, no sólo los
  propios.
- **Rutas propias, no un parámetro `kind` en el servidor.** Lo que se copia y lo
  que NO se copia es distinto en cada uno —la inscripción en un evento, los
  aportes en un proyecto—, y meterlo en una sola ruta con un `if` dentro haría
  fácil que un cambio para uno se cuele en el otro.
- **En la PANTALLA sí es un solo componente** (`EcosystemPicker` con `kind`): el
  flujo que ve el usuario es idéntico —buscar, marcar varios, traer— y
  escribirlo dos veces daría dos pantallas que se separan en silencio, que es
  justo lo que hubo que deshacer con la casilla de distritos.

**Pendiente conocido:** el clon de un EVENTO es **contenido duplicado para SEO**.
`/eventos/:slug` es indexable y va al sitemap (`seoSpec.js`), así que el evento
queda publicado en dos direcciones y los dos sitios se compiten en Google. Se
mitiga parcialmente con la atribución y el enlace al original, pero lo que lo
resolvería es declarar la canónica del clon apuntando al original — hay que
tocar `seoRender.js` / `seoEntities.js`, que hoy componen la canónica a partir
del propio sitio. Mientras tanto, no afirmar que el clon es neutro para SEO.

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

### Distrito y club en el formulario público (v4.706)

- **El distrito se pregunta ANTES que el club**, porque es lo que decide qué
  clubes se ofrecen. Preguntar el club primero obligaría a volver atrás.
- **Los clubes viven DENTRO de cada distrito** (`districts[].clubs`), no en un
  mapa aparte con el nombre del distrito como llave: renombrar un distrito no
  puede dejar su lista huérfana. El campo es **opcional y aditivo** — una
  convocatoria guardada antes no lo trae, y `normalizeSavedConfig` lo completa a
  lista vacía. Un distrito sin lista pide el club a mano, que es como funcionó
  siempre; así se pueden ir cargando los catálogos sin romper nada.
- **La lista NO es obligatoria de cumplir.** Un catálogo se queda viejo solo
  —clubes nuevos, fusiones, cambios de nombre— y esta es una inscripción que se
  paga: dejar fuera a quien no figure sería perder la postulación. Por eso el
  desplegable termina en «Mi club no está en la lista» y el servidor acepta
  cualquier nombre. La opción va de ÚLTIMA y cuesta un clic extra, así que quien
  sí está en la lista la usa.
- **Lo que SÍ se rechaza es un club del catálogo de OTRO distrito.** Eso no es
  un club que falte, es una pareja distrito-club que se contradice. Sin falso
  positivo posible: un club que figure en los dos catálogos pasa por la primera
  condición. En la pantalla no llega a ocurrir porque **cambiar de distrito
  borra el club elegido** —y también la marca de «no está en la lista»—.
- **Volver del texto libre a la lista es un botón explícito.** Re-elegir el
  mismo distrito no dispara nada, así que sin él quien se equivocara al marcar
  «no está en la lista» se quedaría escribiendo a mano.
- `clubNotListed` es estado **de la pantalla**: dice de dónde salió el nombre,
  no cuál es. No se envía ni se guarda.
- **El catálogo de los distritos 4271 y 4281 es una SEMILLA** (v4.707,
  `server/lib/rotaryClubs.js`), no un valor por defecto. `deepMerge` reemplaza
  los arrays enteros, así que un catálogo escrito en `DEFAULT_CONFIG` nunca
  llegaría a producción: lo taparía el array `districts` de la fila guardada.
  Por eso `seedDistrictClubs` corre dentro de `normalizeSavedConfig`, **antes**
  de normalizar — normalizar primero convertiría todo en `[]` y borraría la
  distinción de la que depende todo esto.
- **`undefined` y `[]` significan cosas distintas.** Un distrito sin el campo
  `clubs` nunca se tocó y recibe la semilla; uno con la lista VACÍA es una
  decisión del administrador («que el club se escriba a mano») y se respeta.
  Es lo que hace innecesario un flag en la base y una escritura al arrancar, y
  es la misma regla del Generador de Pendones: una vez que el operador tocó
  algo, un despliegue no vuelve a tocarlo.
- **El distrito se reconoce por su NÚMERO de cuatro dígitos**, no por el texto:
  el nombre guardado puede ser «Rotary Distrito 4271», «Distrito 4271» o
  «D-4271». Un distrito renombrado a algo sin número no recibe semilla — mejor
  sin lista que con la lista de otro.
- Pruebas: `npm run test:clubes` (24 casos). Comprueban que el catálogo llegó
  completo, la ortografía —mayúscula inicial, tildes, preposiciones internas en
  minúscula, números romanos intactos— y que la semilla no pisa lo editado.

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

## Plantillas IA (Generador de Diseños) — v4.729

Pestaña propia en Content Studio. Crea piezas gráficas institucionales a partir
de plantillas con variables y un editor visual tipo Canva. Fase 1: felicitación
por **aniversario de club** en **1:1 (1080×1080)**.

| Archivo | Qué es |
|---|---|
| `server/lib/designSpec.js` | El CRITERIO. **Puro**: sin base, sin red, sin IA, sin DOM |
| `server/lib/designFields.js` | Los CAMPOS VINCULADOS: qué declara un nodo y cómo se adapta cada clase |
| `server/lib/designTemplates.js` | El catálogo de plantillas (datos, no código) |
| `server/lib/designElements.js` | Biblioteca de elementos decorativos (trazos SVG) |
| `server/lib/designAI.js` | Redacción del mensaje y «✨ Mejorar con IA» |
| `server/lib/designBranding.js` | Club → identidad visual y contexto real |
| `server/lib/ensureDesignSchema.js` | Crea `DesignProject` en runtime |
| `server/controllers/designStudioController.js` | API |
| `src/lib/designSpec.ts` | Espejo del criterio en el navegador |
| `src/lib/designFields.ts` | Espejo de los campos vinculados |
| `src/lib/designRender.ts` | Composición a canvas y exportación PNG/JPG/PDF |
| `src/components/admin/design-studio/DesignCanvas.tsx` | La mesa de trabajo |
| `src/components/admin/design-studio/DesignStudio.tsx` | Los tres paneles y el estado |
| `src/components/admin/design-studio/LogoHeaderPanel.tsx` | La Cabecera: el recuadro del logotipo del club |

Pruebas: `npm run test:design` (205 casos, **sin base, credenciales ni red**) y
`npm run test:design:render` (47 casos: monta el editor, el panel completo Y el
portal público en un navegador, compara la vista previa con la exportación píxel
a píxel y ejercita el arrastre, la subida y el formulario público; pide `npm i
--no-save playwright esbuild` y **se salta solo** si no están).

**Reglas durables:**

- **UN SOLO GRAFO DE ESCENA.** La plantilla compila a una lista plana de nodos
  en coordenadas NORMALIZADAS (0-1 del lienzo) y el editor y el exportador leen
  la MISMA lista. El Generador de Pendones escribe su maquetación dos veces
  —`BannerPreview.tsx` en DOM con cqw/cqh y `bannerRender.ts` en canvas— y
  funciona porque tiene tres elementos fijos; con capas arbitrarias esa
  duplicación es insostenible: cada tipo de nodo habría que escribirlo dos veces
  y toda discrepancia se ve como «la vista previa no es lo que descargué». **No
  agregar un segundo camino de maquetación.**
- **El texto NO lo reparte el navegador.** Cada nodo se pinta línea por línea
  con el reparto que devuelve `layoutFor`. Dejar que CSS ajuste el texto sería
  más corto de escribir y rompería el WYSIWYG: el algoritmo de saltos de línea
  de CSS no es el del canvas, así que un título de dos líneas en pantalla puede
  salir de tres en el archivo.
- **`layoutText` recibe el medidor INYECTADO.** En el navegador es un contexto
  2D; en las pruebas, un medidor de ancho fijo por carácter. Sin esa inyección
  el reparto de líneas sólo se podría probar con un navegador, y en la práctica
  no se probaría.
- **El canvas usa el modelo de CAJA DE LÍNEA de CSS, no `textBaseline:'top'`.**
  CSS centra los glifos en la caja con «medio interlineado»; `'top'` los apoya
  contra el borde. Medido comparando la vista previa con la exportación del
  MISMO documento: la diferencia era el **4,44 %** de los píxeles, concentrada
  exactamente en las bandas de texto. Replicando el medio interlineado con
  `fontBoundingBoxAscent/Descent` bajó a **1,02 %** —el antialias de las letras—
  y el corrimiento vertical óptimo pasó a 0 px. **El alto de contenido no es
  `fontSize`**: son las métricas de la fuente.
- **`verticalOffset` se REDONDEA a entero.** Con `valign: 'middle'` el
  desplazamiento es fraccionario y el DOM y el canvas no redondean igual: dejaba
  la exportación 1 px por encima de la vista previa.
- **El mismo string `d` para el DOM y para el canvas** (`shapePath`). El
  navegador lo pinta en un `<path>` y el exportador en un `Path2D`. No hay dos
  dibujos, hay uno.
- **La escena se pinta a tamaño NOMINAL y el zoom es un `transform: scale()`.**
  Todo el cálculo interno ocurre en píxeles del formato, que son los mismos que
  usa el exportador con `scale: 1`. El zoom sólo participa al convertir el
  puntero.
- **Una variable sin resolver NO se imprime.** `resolveVariables` la deja vacía
  y la reporta en `missing`; la pantalla la pide. Un `{{club}}` impreso en una
  pieza firmada por el Gobernador es peor que un hueco. Misma regla que
  `journeyEngine.js` con los parámetros de una plantilla de WhatsApp.
- **`dropIfEmpty` y `requiresVar` no son lo mismo.** El primero descarta un nodo
  cuya PROPIA variable falta; el segundo descarta un nodo DECORATIVO que depende
  de otra. La placa blanca que da contraste al logotipo sobre la fotografía no
  tiene variable propia: sin `requiresVar` se dibujaba igual y salía un
  rectángulo blanco vacío flotando sobre la foto. Lo destapó la primera prueba
  de render, no el código.
- **Las variables se aplican EN VIVO; no se recompila** (`applyVariables`).
  Recompilar en cada cambio se llevaría por delante todo lo que el usuario haya
  movido. Por eso el compilador guarda `srcText` (el texto antes de sustituir) y
  `srcVar` en cada nodo. Se vuelve al servidor sólo al cambiar de plantilla o al
  pedir otro mensaje: las dos veces el usuario pide una pieza nueva a propósito.
- **Editar un texto a mano lo DESLIGA de su variable** (`srcText: null`). Sin
  esa regla, el usuario corrige el título y el siguiente cambio de variable se
  lo borra sin avisar. Mismo criterio que `putAuto` respetando las traducciones
  manuales.
- **`autoFit` no es un lujo.** El nombre de un club va de «Cali» a «Cali San
  Fernando del Valle»: con tamaño fijo, uno se ve enano y el otro se desborda
  fuera de la pieza. Si ni con el mínimo entra, se AVISA (`overflow`) en vez de
  recortar: perder contenido en silencio es peor.
- **La fecha de fundación NO está en `Club` y no se deduce de `createdAt`**, que
  es cuándo se creó el SITIO. Un club de 1974 daría «¡Felices 1 años!», firmado
  por el Gobernador. Vive en `Setting` con la llave `club_foundation_date`,
  donde ya viven los logos de Rotaract/Interact — **no** como columna de Prisma,
  por el orden de despliegue que documenta la regla de `logo_intl` (v4.699).
  Si no está, se pide en la pantalla y se guarda para el año siguiente.
- **`yearsSince` y `rotaryPeriod` reciben `today` como PARÁMETRO** y viven en
  `designSpec.js`, no en `designBranding.js`: ese archivo importa la base, así
  que probar «cuántos años cumple un club de 1977» exigiría Prisma generado y
  una conexión. Una función que consulta el reloj por dentro no se puede probar.
- **El modelo ESCRIBE; el código DECIDE si sirve.** `validateMessage` comprueba
  largo, hashtags, enlaces y marcadores sin resolver, y REINTENTA devolviéndole
  al modelo la regla concreta que rompió. Pedirle «hacelo más corto» sin decirle
  cuánto no corrige nada. Misma regla que `templateComposer.js` y `seoAI.js`.
- **El mensaje IMPRESO no es el copy de la publicación.** Uno va dentro de la
  pieza y el otro debajo: un texto con hashtags o «link en la bio» dibujado
  sobre una imagen se lee como un error. Salen de la misma llamada porque el
  modelo ya tiene el contexto, pero son campos distintos — igual que el guion de
  la voz y el copy en el Creador de Reels.
- **La IA no inventa noticias.** Ciudad, distrito y proyectos salen de la base y
  entran al prompt. **Noticias externas no**: no hay proveedor conectado y un
  modelo al que se le pide «contame las novedades del club» las inventa. Es la
  regla 3 de `institutionalVoice.js`, y un aniversario firmado por el Gobernador
  es la peor pieza para estrenar un dato falso.
- **No hay ninguna rueda de Rotary en la biblioteca de elementos.** El emblema
  es marca registrada, con proporciones, colores y zona de resguardo propias, y
  se reproduce desde el Brand Center. Un engranaje «parecido» es justo lo que el
  Distrito no puede publicar. Entra como IMAGEN —el logotipo del club—, igual
  que en el Generador de Pendones. Lo comprueba `test:design`.
- **La regla #1 del sitio no aplica acá, y conviene saber por qué.** «No
  postprocesar el output del modelo» prohíbe retocar lo que devuelve un motor
  generativo. Acá no hay output que retocar: la pieza ES la composición,
  declarada nodo por nodo por el usuario. Es edición declarada, como el montaje
  del Creador de Reels. La FOTOGRAFÍA sí viaja intacta: se encuadra y se recorta
  al recuadro, sin filtros ni corrección de color.
- **El archivo se compone en el NAVEGADOR, no en el servidor.** Un canvas de
  servidor son ~40 MB de binarios nativos en una función que ya empaqueta FFmpeg
  dentro del tope de 250 MB, y —sobre todo— obligaría a escribir el mismo dibujo
  por segunda vez, que es la duplicación que este módulo existe para evitar.
- **`Media` es el ARCHIVO; `DesignProject` es la FICHA.** Se sube por
  `/api/media/upload`, que es el camino que ya registra en la Biblioteca
  Multimedia. Duplicar la lógica de S3 daría dos caminos que se separan en
  silencio — el problema que arrastra `sendCampaign` en el CRM.
- **GUARDAR guarda la CONFIGURACIÓN; no produce un archivo** (v4.731). Hasta
  v4.730 cada guardado exportaba la pieza a 2160 px y la subía a la Biblioteca.
  Guardar se repite cada dos minutos mientras se ajusta un diseño, así que un
  solo trabajo dejaba decenas de PNG casi idénticos mezclados con las fotos
  reales de los clubes —se reportó con la Biblioteca en 3.116 imágenes—. El
  motivo de fondo no es el desorden: acá se edita la configuración de una
  PLANTILLA, y las piezas las genera cada club desde el portal público con SUS
  datos. La del administrador es una vista previa con valores de ejemplo;
  convertirla en archivo la presenta como algo que no es. Lo único que produce
  guardar es la miniatura del listado, en `DesignProject.thumbUrl` —360 px, dato
  de la ficha—, nunca una fila de `Media`. La vía a la Biblioteca sigue
  existiendo en el menú de Descargar, como decisión EXPLÍCITA.
- **Que guardar no suba nada se comprueba en el NAVEGADOR**
  (`test:design:render`), no con una prueba de criterio: es una llamada del
  navegador y desde el servidor no se ve. Verificado a la inversa —con la
  subida reintroducida, la comprobación falla—.
- **Toda casilla de imagen ofrece las DOS vías, y el módulo se estrenó con una**
  (v4.720.1). La regla de v4.700 ya lo decía y el código hasta la citaba en un
  comentario: el botón abría el `MediaPicker` y nada más. Con sólo «Biblioteca»,
  usar una imagen que no estuviera cargada obligaba a salir del módulo, subirla
  allá y volver — el retroceso exacto que la regla existe para evitar. **Al
  agregar una casilla, comprobar que las dos vías estén de verdad**, no que el
  comentario lo diga. Con vista previa va `ImageSourceOverlay` (velo al pasar el
  ratón); **sin vista previa no sirve** —no hay nada sobre lo que pasar el
  ratón— y van dos botones.
- **Una imagen puede entrar como CAPA, no sólo en el hueco de la plantilla.**
  Son dos cosas distintas: la fotografía de la plantilla llena un recuadro que
  la plantilla definió y sigue a la variable `imagen`; una capa la coloca el
  usuario donde quiere y se BLOQUEA con el candado. Nace con `srcVar: null`,
  así que ninguna variable la pisa después.
- **UN solo `MediaPicker` por pantalla**, con `pickerTarget` diciendo a dónde va
  lo elegido (`'foto'`, `'capa'` o el id de un nodo). Es el `pickerField` que
  pide la regla de v4.700; uno por casilla los deja separarse.
- **`?.` en CADA eslabón de la respuesta del catálogo.** `catalog?.templates
  .find(…)` corta en `catalog` pero revienta si la respuesta llega sin
  `templates` —una versión anterior de la API, un error devuelto como objeto—,
  y eso es el panel EN BLANCO, no un aviso. Misma clase de fallo que
  `ClipboardList` en `AdminLayout.tsx`. Lo destapó la prueba del panel, no el
  typecheck.
- **Un `useCallback` que dependa de otro tiene que ir DESPUÉS.** El array de
  dependencias se evalúa al renderizar, así que referenciar un `const` declarado
  más abajo da un ReferenceError de zona muerta: pantalla en blanco. Pasó con
  `uploadImage` y `runCompose`. El typecheck no lo ve.
- **El arnés del navegador necesita un ORIGEN real.** Sobre `about:blank` un
  `fetch('/api/…')` no tiene base contra la que resolver y falla antes de salir,
  así que la prueba pasa sin haber ejercitado nada — y así se escapó el fallo
  del catálogo en la primera vuelta. Se sirve desde `http://localhost/` con la
  ruta interceptada. Ojo también con el orden: **Playwright resuelve la última
  ruta registrada primero**, así que el comodín `**/api/**` va PRIMERO.
- **El espejo `src/lib/designSpec.ts` está duplicado A PROPÓSITO**, igual que
  `ADMIN_ROLES` y `NATIONAL_LANGS`. Si cambia uno, cambiar el otro: lo comprueba
  `test:design`, que carga los dos y compara **las salidas de las funciones**,
  no sólo las constantes. Que `shapePath` y `layoutText` den lo mismo es lo que
  sostiene el WYSIWYG.
- **Las 16 categorías se declaran aunque estén vacías.** Una categoría sin
  plantillas se muestra como «Próximamente»; esconderla haría creer que el
  sistema es sólo el aniversario. Mismo criterio que los motores con
  `available:false` del Generador de Publicaciones.
- **Agregar una plantilla es agregar DATOS.** Una entrada en `TEMPLATES` con su
  lista de nodos. No se toca el compilador, ni el editor, ni el exportador, ni
  el modelo de datos.
- **`DesignProject` vive fuera de Prisma**, como manda la sección de base de
  datos de este archivo, y queda protegida por `scripts/db-push-guard.mjs`.

### Escribir el texto (v4.728)

- **El doble clic sobre un texto abre un editor EN EL LIENZO.** Faltaba lo más
  básico de un editor: el texto sólo se cambiaba desde la casilla del panel
  derecho, y quien hace el gesto natural —doble clic sobre la pieza— no
  encontraba nada.
- **Mientras se escribe, el reparto de líneas lo hace el NAVEGADOR.** Es la
  única excepción a la regla de `layoutFor`, y es acotada a propósito: eso es un
  campo de entrada, no el dibujo. Al confirmar desaparece y el nodo vuelve a
  pintarse con el reparto propio, que es el que sostiene el WYSIWYG. **No
  convertirlo en el camino de render.**
- **El borrador vive en el componente, no en el documento.** Teclear no puede
  llenar el historial de un paso por letra — misma razón por la que el arrastre
  sólo confirma al soltar.
- **Escribir en el lienzo pasa por `patchNode`**, igual que escribir en el
  panel: es el mismo gesto y tiene que DESLIGAR de la variable igual. Por eso
  hay un `onEditText` propio y no se usa `onNodesChange`, que no aplica esa
  regla.
- **Agregar un texto o un elemento lleva a Propiedades.** Quedarse en la lista de
  capas dejaba un «Escribí acá» seleccionado y ninguna herramienta a la vista —
  que es exactamente como se reportó el defecto.
- **Sólo tipografías del SISTEMA** (once). Una fuente web habría que cargarla
  antes de exportar, y el exportador dibuja en un canvas del navegador: si no
  llegó, el archivo sale con otra letra y la vista previa deja de ser el
  archivo. Antes que una tipografía más, que lo que se ve sea lo que se baja.
- **Los colores institucionales van como muestras, no sólo en el selector.**
  Acertar el azul de Rotary con el selector del sistema es cuestión de suerte y
  una pieza del Distrito con un azul aproximado se nota.
- **No se agregaron subrayado ni sombra de texto**, que serían lo siguiente:
  obligan a escribir el mismo efecto en los DOS renderizadores —DOM y canvas— y
  cualquier diferencia se ve como «la vista previa no es lo que descargué», que
  es la avería que este módulo está construido para no tener. Si se agregan, la
  prueba de paridad de píxeles de `test:design:render` es la que tiene que
  decidir.

### El portal público (v4.721)

El módulo son DOS experiencias: el panel donde se diseña y publica, y una
página pública —`/plantillas/:slug`, sin sesión— donde cualquiera con el enlace
completa un formulario y descarga su pieza.

| Archivo | Qué es |
|---|---|
| `server/lib/designPublish.js` | El CRITERIO de publicación. **Puro**: qué formulario sale, qué se congela, qué se acepta |
| `server/lib/designPhoto.js` | Adaptación de la fotografía que sube el público |
| `server/controllers/designPublicController.js` | La API sin autenticación |
| `src/pages/PlantillaPublica.tsx` | La página pública |
| `src/components/admin/design-studio/PublishDialog.tsx` | Publicar, con vista previa del formulario |

- **El formulario NO se escribe: se DERIVA** (`buildPublicFields`). Sale de las
  variables que el documento realmente usa (`srcText`, `srcVar`, `requiresVar`),
  no de una lista en paralelo. Una lista aparte se separa del diseño en cuanto
  alguien agrega un `{{presidente}}`: el campo no aparecería y el marcador
  quedaría sin resolver. Es lo que hace que una plantilla nueva **no necesite un
  formulario nuevo**, que es el requisito de escalabilidad del pedido.
- **Marcar un elemento es lo que lo vuelve un campo** (v4.722.1,
  `ASSIGNABLE_FIELDS` + el selector de Propiedades). Derivar el formulario de
  las variables es correcto, pero al estrenarlo **no había forma de crear una
  variable desde el editor**: los campos sólo existían si el diseño venía del
  catálogo, así que un diseño hecho a mano no se podía publicar con formulario
  —y corregir a mano el texto de una plantilla lo desvinculaba (`srcText: null`)
  y lo sacaba del formulario en silencio—. Marcar un texto lo convierte en
  `{{clave}}`, que es como lo declaran las plantillas: reutiliza
  `applyVariables`, `bakeFrozen` y `buildPublicFields` sin inventar un segundo
  concepto. **Al agregar una forma de declarar algo, comprobar que exista la
  forma de declararlo desde la pantalla**, no sólo desde los datos de fábrica.
- **Lo institucional NO es asignable a mano.** `ASSIGNABLE_FIELDS` filtra por
  `institutional`, así que el selector no ofrece distrito, gobernador ni
  periodo. Es el mismo cierre que `buildPublicFields`, en el otro extremo.
- **«Institucional» es la firma del DISTRITO, y el logotipo del club no lo es**
  (v4.722.3). Estaba marcado así y era un error de clasificación con
  consecuencia directa: en la pieza de aniversario el logotipo es el del CLUB
  QUE CUMPLE AÑOS —el mismo dato que el Generador de Pendones le pide a
  cualquiera—, mientras que la firma del Distrito es la curva azul del pie con
  el nombre del Gobernador. Marcarlo institucional dejaba a cada club con el
  escudo de otro y sin forma de cambiarlo. Quien necesite una pieza del propio
  Distrito lo **bloquea al publicar**: eso es una decisión por publicación, no
  una regla del catálogo. Al clasificar un campo, preguntar de quién es el dato,
  no dónde está dibujado.
- **Un hueco BORRADO no genera campo, así que el editor compila con
  `keepSlots`** (v4.722.3). Es la otra mitad del mismo defecto y la más cara: el
  formulario público se deriva de las variables que los nodos usan, y
  `compileTemplate` borraba el nodo cuyo `dropIfEmpty` no se resolvía. Si el
  club con el que se diseñaba no tenía escudo cargado, el hueco del logotipo
  desaparecía del documento, se publicaba sin esa variable y **nadie podía
  llenarlo nunca**. Borrar está bien para la pieza FINAL; para un documento que
  se va a publicar, no. El estudio compila con `keepSlots: true` y el hueco
  sobrevive vacío.
- **Qué se dibuja lo decide `visibleNodes`, en UN solo sitio.** Con los huecos
  vivos dentro del documento, la vista previa, la exportación y el portal tienen
  que aplicar la MISMA regla o lo que se ve deja de ser el archivo — que es toda
  la promesa del módulo. `slots: true` es el modo editor: un hueco vacío se ve
  para poder seleccionarlo y llenarlo. El nodo decorativo con `requiresVar` se
  cae igual en los dos modos: la placa blanca sola no se puede llenar con nada.
  Está espejado en `src/lib/designSpec.ts` y lo comprueba `test:design`
  comparando las salidas.
- **Lo que el público llena NO se publica con el valor del panel**
  (`stripPublicDefaults`). El escudo con el que el administrador diseñó está en
  el `src` del nodo, y guardarlo tal cual lo mete dentro de la plantilla
  publicada: cada club que abra el enlace vería el de otro. Sólo se vacían las
  claves que el formulario ofrece; una bloqueada la vuelve a llenar
  `bakeFrozen`.
- **Publicar sin campos se AVISA, no se bloquea.** Una pieza fija que todos
  descargan igual —una campaña, un aviso— es legítima, y decidirlo es del
  administrador. Lo que sí hace falta es decir dónde se marcan los campos:
  bloquear sin explicar dejaba un callejón sin salida, que fue justo lo que se
  reportó.
- **La seguridad es ESTRUCTURAL, no una pantalla que esconde controles.** El
  endpoint público sólo acepta un diccionario de valores de campos declarados;
  `applyPublicValues` toma los nodos GUARDADOS y les sustituye texto e
  imágenes. Un color, una posición o una capa nueva **no se pueden ni expresar**
  en esa petición. Esconder botones no sirve: quien conoce el endpoint se los
  saltea.
- **Lo institucional está bloqueado POR OMISIÓN y se desbloquea a propósito**
  (`unlock`), nunca al revés. Un valor por defecto permisivo en un portal sin
  autenticación es la clase de error que no se descubre hasta que alguien lo usa
  mal. Logotipo, distrito, gobernador y periodo son la firma de la pieza.
- **`bakeFrozen` no es `resolveVariables`, y ésa es toda su razón de ser.**
  Sustituye SÓLO las claves congeladas y **deja intactos** los marcadores que el
  formulario va a llenar; `resolveVariables` los borraría por no tener valor.
  Gracias a eso la firma viaja ya impresa dentro del nodo —no como un dato que
  el navegador pueda cambiar— y la vista previa del portal es **local e
  instantánea**: el navegador sólo resuelve los pocos marcadores del formulario,
  con el mismo `applyVariables` del editor. Sin esto haría falta una petición
  por pulsación.
- **Publicar guarda una COPIA, no una referencia al catálogo del código.** Si
  apuntara a `designTemplates.js`, tocar ese archivo en un despliegue cambiaría
  piezas cuyo enlace ya está circulando por WhatsApp. Eso no cambió y no debe
  cambiar.
- **Pero la copia SIGUE al diseño** (v4.729, `refreshPublication`). Guardar un
  diseño que ya está publicado actualiza su enlace. Es un cambio de postura
  respecto de v4.721 y la distinción es la que importa: lo que se protegía era
  que un DESPLIEGUE moviera una pieza ajena, no que el administrador cambiara la
  suya. Tener que acordarse de volver a publicar dejaba el enlace mostrando una
  versión vieja **sin decirlo**, que es exactamente como se reportó.
- **Se rehace con los MISMOS ajustes** (`settings` en la fila). Sin guardarlos
  habría que volver a preguntar en cada guardado —o peor, adivinarlos—: la
  dirección no cambia, un campo bloqueado sigue bloqueado y lo congelado sigue
  congelado. Sólo se recalcula el formulario, que es lo que el cambio pudo
  mover.
- **El vínculo es `projectId`, y la v4.729 se estrenó sin poder usarlo**
  (v4.730). Esa columna se empieza a llenar en `publish`, así que TODA
  publicación anterior —que eran todas— quedaba huérfana: `refreshPublication`
  no encontraba fila y guardar no tocaba nada, **en silencio**. Se reportó como
  «agrego un texto, guardo y el sitio público sigue igual», que es el mismo
  síntoma que la versión anterior venía a corregir. Al añadir una función que
  depende de un vínculo nuevo, mirar qué pasa con las filas que se crearon antes
  de que ese vínculo existiera: son todas.
- **Una huérfana se ADOPTA al guardar, pero no se adivina** (`publicationFor`).
  Mismo criterio que `bindLegacyEdition` en Postulaciones. Y «hay una sola
  huérfana» **no alcanza**: un sitio con tres diseños y una publicación sin
  vincular la adoptaría al guardar cualquiera de los tres, y el primero le
  pisaría a otro una pieza que ya circula. Hacen falta las dos puntas — el
  nombre coincide exacto, o el sitio tiene un solo diseño. Con duda no se toca
  nada y se DICE, con la salida: publicar una vez ata el vínculo.
- **Y cuando no se puede adoptar, se OFRECE elegir** (v4.736,
  `linkPublication`). No adoptar por si acaso es correcto, pero avisar sin dar
  salida deja un callejón: un sitio con VARIOS diseños y una publicación
  heredada no encaja en ninguna de las dos condiciones —ni nombre igual ni
  diseño único—, así que no se podía vincular por ninguna vía y guardar no
  cambiaba nunca el enlace. Es el par de «Vincular evento» en Postulaciones. Al
  vincular se refresca en el acto: vincular sin actualizar dejaría el enlace
  igual y parecería que no funcionó. Y se libera el vínculo anterior de ESE
  diseño primero — un diseño apunta a una publicación, no a dos.
- **Rehacer una publicación heredada sin deducir sus ajustes le borra la
  firma** (`settingsForRefresh`). `settings` nació vacía, así que rehacerla a
  secas la publica con los ajustes POR DEFECTO: `frozen` queda en `{}` —el
  nombre del Gobernador desaparece de la pieza— y un campo que alguien bloqueó
  al publicar **vuelve a salir en el formulario público**. Aflojar un cierre por
  lo bajo es peor que no tener la función. No hay que adivinarlos: la fila
  guarda el RESULTADO —`frozen` son los valores congelados y `fields` el
  formulario que salió—, y de ahí se deducen. Se deduce contra el documento
  **publicado**, no contra el nuevo: contra el nuevo, una variable recién
  marcada se leería como «no salía, luego estaba bloqueada» y no se ofrecería
  nunca. La deducción se guarda, así que ocurre una sola vez.
- **Va en el SERVIDOR, no en la pantalla**, así vale para cualquier camino que
  guarde un diseño. Y si el diseño quedó impublicable, el refresco se salta con
  un aviso en consola: lo que se pidió fue guardar, y eso no puede fallar por
  algo secundario.
- **El enlace se DICE, en el aviso al guardar y en la barra.** Un enlace que se
  refresca en silencio confunde tanto como uno que se queda viejo.
- **Despublicar NO borra.** El enlace deja de responder pero la fila se
  conserva, porque volver a publicar tiene que devolver la MISMA dirección: un
  enlace ya compartido no se puede reasignar. El `ON CONFLICT (slug)` lleva
  `WHERE clubId IS NOT DISTINCT FROM` para que otro sitio no pise una dirección
  pública ajena.
- **La subida pública devuelve un DATA URL, no una URL de S3.** Mismo criterio
  que el logo público del Generador de Pendones: guardar en nuestro
  almacenamiento lo que sube cualquiera sin identificar convierte el bucket en
  un depósito abierto y nos deja alojando contenido de terceros.
- **El recorte usa la estrategia de ATENCIÓN de sharp, y eso NO es detección de
  rostros.** Elige la región de mayor entropía y contraste en vez del centro
  geométrico; en la práctica suele conservar a las personas porque una cara
  tiene más detalle que una pared, pero es una consecuencia, no una garantía, y
  **no se enuncia como si lo fuera**. No hay detector de rostros en la
  plataforma y agregarlo son decenas de MB en una función que ya empaqueta
  FFmpeg dentro del tope de 250 MB.
- **No hay outpainting en el portal público.** `canvasExpansion.js` existe y
  funciona, pero engancharlo a un portal sin autenticación significa gastar
  créditos por visita anónima y mandar la fotografía de un tercero a un
  proveedor externo. Las dos cosas necesitan una decisión del operador, no un
  valor por defecto. Cuando el recorte va a llevarse los bordes se AVISA con
  motivo y consecuencia, igual que en el Creador de Reels.
- **`rotate()` sin argumentos aplica la orientación EXIF.** Sin eso una foto de
  móvil entra acostada y el usuario cree que el módulo la rotó.
- **`DesignCanvas` se reutiliza en modo NO interactivo** para la vista previa
  pública. Escribir un segundo componente de vista previa reintroduciría la
  duplicación de maquetación que este módulo existe para evitar.
- **`/plantillas` está en `PRIVATE_PREFIXES`.** Abierto y no indexado son cosas
  distintas: es una herramienta que se abre desde un enlace compartido, no
  contenido del sitio, e indexar un `/plantillas/x` por publicación haría
  competir utilidades con las páginas reales del club por sus términos de marca.
- **`DesignPublicTemplate` vive fuera de Prisma**, como `DesignProject`, y queda
  protegida por `scripts/db-push-guard.mjs`.
- **NUNCA una comilla invertida dentro de un `db.query(\`…\`)`** (v4.721.1). El
  SQL vive en un template literal, así que una palabra citada con comillas
  invertidas dentro de un comentario del SQL **lo cierra a mitad** y el archivo
  deja de parsear. Pasó en `ensureDesignSchema.js` y el módulo **nunca funcionó
  en producción desde v4.720.0**: el controlador lo importa, así que toda la API
  respondía 500 con el mensaje del parser —traducido al español por el propio
  traductor del sitio, lo que lo volvía irreconocible—. Para citar un
  identificador dentro de SQL, escribirlo sin adornos.

### Campos vinculados (v4.723)

Una plantilla es **parametrizable**: el administrador coloca un elemento y
declara ahí mismo qué dato es. El formulario del portal público se arma con esas
declaraciones, así que una plantilla nueva no necesita un formulario nuevo. El
primer campo implementado es el **logotipo del club**, con el comportamiento del
Generador de Pendones.

| Archivo | Qué es |
|---|---|
| `server/lib/designFields.js` | El CRITERIO. **Puro y sin importaciones**: clases de campo, normalización de la clave y reglas de adaptación por clase |
| `src/lib/designFields.ts` | Espejo en el navegador: lo que el editor necesita para ofrecer la sección |

- **La CLAVE no se guarda dos veces.** Un campo vinculado no tiene `key` propia:
  la clave sigue siendo `srcVar` (imagen) o el marcador de `srcText` (texto), y
  se deriva con `fieldKeyOf`. `node.field` lleva sólo la CONFIGURACIÓN
  —etiqueta, ayuda, obligatorio, visible, valor por defecto, reglas de la
  imagen—. Guardar la clave también ahí es lo cómodo y es la trampa que el
  módulo ya evitó una vez (`publicKeyOf`): dos verdades sobre lo mismo se
  contradicen en cuanto alguien edita el texto del nodo, y entonces el
  formulario ofrece un campo que ningún nodo consume.
- **`field` va enumerado en `normalizeNode`.** Ese normalizador RECONSTRUYE el
  nodo, así que lo que no se enumere se pierde al guardar y al publicar, en
  silencio. Al agregar una propiedad al nodo, agregarla ahí.
- **El catálogo cerrado de `VARIABLES` sigue cerrado, y ahora se entiende por
  qué.** Son las variables que la PLATAFORMA resuelve sola (club, distrito,
  gobernador, periodo): una clave inventada ahí no la resuelve nadie y termina
  impresa. Un campo **declarado** es otra cosa: lo resuelve la persona que llena
  el formulario, y la declaración es lo que lo hace resoluble. Por eso
  `buildPublicFields` admite `FIELD_SPECS[key] || declared.has(key)`, y una
  clave sin catálogo **y** sin declaración se sigue descartando. Es lo que hace
  cierta la escalabilidad: agregar un campo es marcarlo en la pantalla.
- **Lo que declara el nodo MANDA sobre el catálogo.** `FIELD_SPECS` pasó a ser
  el valor por defecto. Alcanzaba con dos plantillas de aniversario y deja de
  alcanzar en cuanto la misma variable significa cosas distintas en dos piezas.
- **`visible: false` NO es `locked`.** El primero es del DISEÑO («este dato lo
  fijo yo») y se congela con su `defaultValue` al publicar; el segundo es la
  misma decisión tomada en el momento de publicar. Sin congelar el apagado, el
  nodo se publicaría con el marcador sin resolver.
- **UN LOGOTIPO NO ES UNA FOTOGRAFÍA, y tratarlos igual fue el defecto
  concreto.** Hasta v4.722 el portal mandaba TODA imagen por el camino de la
  fotografía: hueco de la foto, encuadre `cover` con recorte por atención y
  salida **JPEG**. Un escudo llegaba recortado por los bordes y con la
  transparencia rellena. Medido con un escudo de 600×600 con márgenes
  transparentes y el hueco real del logotipo (302×104 px): por el camino viejo
  salía **JPEG 1080×508 sin canal alfa**; por el nuevo, **PNG 104×104, alfa
  vivo, proporción 1,000 y `keptFraction: 1`**. El `kind` es lo que separa las
  dos recetas, y por eso está DECLARADO y no deducido del nombre del campo.
- **El hueco sale del nodo que consume ESA clave** (`slotFor`), no siempre del
  de la fotografía. Era la otra mitad del mismo defecto: `photoSlotOf` buscaba
  el nodo de la foto pasara lo que pasara, así que un escudo se adaptaba a
  1080×508. `photoSlotOf` se conserva, hoy implementado sobre `slotFor`.
- **`trim` es lo que hace el pendón desde su primera versión.** Un PNG del Brand
  Center trae márgenes vacíos; sin quitarlos el escudo ocupa la mitad de su
  recuadro. Puede fallar con una imagen sin borde uniforme (sharp lanza), así
  que se reintenta sin él: un logotipo sin recortar sirve, ninguno no.
- **A un código QR NO se le recorta el margen.** Es su zona de silencio y sin
  ella no escanea. Es el ejemplo de por qué las reglas son por clase y no una
  sola receta «para imágenes».
- **El margen interno se calcula sobre la PROPIA imagen escalada, no sobre el
  recuadro.** Medido: con el recuadro, un escudo cuadrado salía de 112×104
  —proporción 1,08— porque el margen horizontal y el vertical eran distintos.
  Los píxeles no se estiraban, pero el nodo dibuja con `contain` sobre la
  proporción de la imagen, así que el margen visible quedaba desparejo.
- **NO se borra lo que nadie puede llenar** (`fillable` en `applyPublicValues`,
  en los dos espejos). Un marcador que el formulario no ofrece y que tampoco
  quedó congelado se resolvía contra un diccionario vacío: el texto desaparecía
  y nadie podía escribirlo. Es lo que dejaba una pieza publicada con el pie
  institucional y hueco todo lo demás. Lo que SÍ se ofrece se sigue vaciando
  hasta que la persona escriba — mostrar el nombre del club con el que se
  diseñó es el defecto opuesto.
- **Poner una imagen de ejemplo NO es desvincular.** `patchNode` ponía
  `srcVar: null` al reemplazar la imagen de un nodo desde Propiedades, así que
  quien marcaba el logotipo y después cambiaba la imagen para ver cómo quedaba
  publicaba la plantilla **sin ese campo**. Desvincular tiene su propio control.
- **Editar el texto a mano sí desvincula, y ahora también borra la
  declaración**: sin marcador ningún campo consume ese nodo, y dejar la
  configuración colgando daría un campo declarado que no pinta nada. Para
  cambiar lo que se ve sin perder el campo está el «valor por defecto».
- **Lo institucional sigue bloqueado POR OMISIÓN.** Declararlo en el nodo no lo
  abre: en un portal sin autenticación, la firma del Distrito sólo se suelta a
  propósito, al publicar.
- Pruebas: las de `npm run test:design` (criterio, incluido que los dos espejos
  den lo mismo) y cuatro de `npm run test:design:render` sobre la sección de
  Propiedades. **Al tocar `designFields.js`, tocar `designFields.ts`.**

### Dónde va a caer cada dato (v4.725)

El portal público marca con un recuadro punteado los huecos de imagen que
todavía están vacíos.

- **Un hueco de imagen vacío no deja NADA en la pieza.** El nodo declara
  `dropIfEmpty`, así que desaparece. En el editor está bien —el administrador lo
  selecciona y lo llena—, pero en el portal deja un lienzo en blanco y quien
  abre el enlace no sabe dónde va a quedar su logotipo ni de qué tamaño. Subía
  a ciegas.
- **La marca NO es un nodo, y ésa es toda la diferencia.** El exportador dibuja
  `doc.nodes`; esto se dibuja aparte, como los márgenes y el área segura. Por
  eso no entra en el archivo. Lo comprueba una prueba de navegador que verifica
  que el elemento no lleva `data-node`.
- **Sale del documento PUBLICADO**, no del resuelto: `applyPublicValues` ya
  quitó el nodo vacío, así que a esa altura no queda nada de dónde sacar la
  posición.
- **Si se muestran recuadros, la leyenda lo dice.** La promesa del módulo es que
  la vista previa ES el archivo; con guías a la vista deja de ser literal, y eso
  no se puede decir a medias. Con todo lleno vuelve el texto de siempre.
- **El EJEMPLO es del CAMPO, no del NODO** (v4.726, `withSamples`). El
  administrador diseña con una imagen puesta y quien abre el enlace quiere ver
  cómo va a quedar: las dos cosas son ciertas y la separación es lo que las hace
  compatibles. Dejar esa imagen en el `src` del NODO es el defecto de v4.722.3
  —la pieza se dibuja con ella, se EXPORTA con ella, y un club que descargue sin
  subir nada se lleva el escudo de otro—; `stripPublicDefaults` la sigue
  vaciando. Guardarla como `sample` del CAMPO es otra cosa: se dibuja DENTRO del
  recuadro de la guía, atenuada y rotulada «ejemplo», y no llega al archivo por
  ninguna vía. **Si algún día hace falta en el documento, la respuesta sigue
  siendo no.**
- **Un `src` de origen no aceptado no se publica ni como ejemplo**
  (`isAcceptableImage`): termina en un `<img>` de una página pública.
- **Con un ejemplo a la vista hay que decir DOS cosas**, no una: que no es la
  suya y que no se descarga.
- **Pero NO encima de la imagen** (v4.727). El rótulo superpuesto tapaba
  justamente lo que se quiere ver —cómo queda el logotipo en su sitio— y era lo
  que se había pedido mirar. El aviso vive donde la confusión cuesta algo: junto
  al botón de **descargar**, diciendo que la pieza saldría sin esa imagen. Ahí es
  donde alguien podría llevarse una pieza incompleta creyendo que está lista;
  sobre el lienzo sólo estorbaba.
- **Un hueco SIN ejemplo sí conserva su etiqueta**: ahí el texto es lo único que
  dice qué va en ese espacio. El que tiene ejemplo se ve limpio.
- **Se marcan TODOS los huecos de imagen vacíos**, no sólo el logotipo: la
  fotografía tiene el mismo problema y la misma solución. Los de TEXTO no —un
  texto vacío deja su hueco visible en la composición y marcarlo llenaría la
  pieza de recuadros.

### La Cabecera del logotipo (v4.724)

El bloque «Cabecera (logo del club + distrito)» del Generador de Pendones,
traído al panel de Plantillas IA como paso 3
(`LogoHeaderPanel.tsx`).

- **Hacía falta por USO, no por motor.** Desde v4.723 el logotipo ya era un
  campo vinculado y su recuadro ya se heredaba; lo que no había era dónde
  verlo. Para colocarlo había que saber que se selecciona en la mesa de trabajo
  y se abre Propiedades — y quien viene del pendón no tiene por qué saberlo. Al
  traer una función de otro módulo, traer también **dónde estaba**.
- **La promesa «se aplica igual al logo que suba el público» ya es cierta por
  construcción**, y conviene saber por qué: lo que el portal manda es una
  IMAGEN, no un nodo. El recuadro vive en el documento publicado y no se puede
  expresar en esa petición. Este panel edita ESE recuadro.
- **El tamaño tiene UNA sola verdad y por eso se DERIVA** (`frameScaleOf`). El
  pendón guarda un `logo.scale` aparte porque su recuadro está escrito en el
  código; acá el recuadro ES el nodo, así que guardar además una escala se
  contradiría en cuanto alguien arrastra el logotipo en la mesa de trabajo — y
  arrastrarlo es justamente lo que este módulo permite. Lo que sí se guarda es
  `field.image.frame`, el recuadro que declaró la plantilla: no es el tamaño
  actual, es la **constante** que responde «¿el 100 % de qué?» y a la que
  vuelve «Restablecer». Sin ella, el control tendría que inventarse una
  referencia en cada montaje y el mismo logotipo se vería al 100 % antes y
  después de agrandarlo.
- **El recuadro sale de la propia declaración del nodo**, así que una plantilla
  del catálogo lo trae puesto sin escribir nada. Lo escribe `normalizeNode`
  pasándole el `box`; como ese normalizador RECONSTRUYE el nodo, sin esa línea
  se perdería al guardar.
- **Agrandar crece desde el CENTRO** (`scaledBox`), no desde la esquina. Con la
  esquina, cada ajuste de tamaño mueve el logotipo y obliga a recolocarlo.
- **Mover y redimensionar son ejes distintos**: los deslizantes de posición
  escriben `x`/`y` y no tocan la escala. Confundirlos produce el «se me movió al
  agrandarlo».
- **El nodo se busca por su CLAVE** (`srcVar === 'logo'`) y sólo después por
  `role` —el respaldo para los diseños guardados antes de que la clave viajara
  ahí—. Al revés se elegiría un nodo decorativo con el rol puesto y el panel
  editaría un recuadro que nadie llena.
- **Un diseño sin hueco de logotipo lo OFRECE crear**, no esconde la sección. Y
  el hueco nace ya marcado como campo del portal: un hueco de logotipo que no es
  campo no lo puede llenar nadie — es exactamente el defecto que dejó al portal
  de aniversarios sin la mitad de su formulario (v4.722.3).
- **Poner el logotipo de ejemplo no desvincula**: la subida escribe `src` y no
  toca `srcVar`. Misma regla que v4.723 y por el mismo motivo.
- **El número de paso lo decide el panel que ORDENA, no cada sección.**
  `CompositionPanel` lo llevaba escrito a mano y al agregar la Cabecera en
  v4.724 quedaron DOS secciones con el «5». No lo ve el typecheck ni una prueba
  de criterio: hay que mirar la pantalla, y por eso la comprobación es de
  navegador (`los pasos del panel no repiten número`).
- **Configurar el logotipo NO cambia los enlaces ya compartidos, y el panel lo
  DICE.** Publicar congela el diseño a propósito; sin ese aviso, el
  administrador ajusta el logo, abre el enlace, no ve ningún cambio y no tiene
  cómo saber por qué. Y si el logotipo del diseño está fijo en vez de ser campo
  del portal (`srcVar !== 'logo'`), también se dice: desde el panel las dos
  situaciones se ven idénticas.
- Pruebas: 15 casos de criterio en `npm run test:design` y 13 de navegador en
  `npm run test:design:render` sobre el panel — incluida la paridad de
  `frameScaleOf`, `scaledBox` y `resetBox` entre los dos espejos.

### Motor de Composición con IA (v4.722)

La plantilla puede mandar su pieza a KIE para que el modelo ARME la imagen —el
fondo institucional con la fotografía del club integrada— en vez de encajar la
foto en un recuadro.

| Archivo | Qué es |
|---|---|
| `server/lib/designCompose.js` | El CRITERIO. **Puro**: prompt, planes de variante, validación |
| `server/lib/designBackdrop.js` | La orquestación: KIE, sondeo, S3 |
| `src/components/admin/design-studio/CompositionPanel.tsx` | La configuración y las variantes |

- **La IA hace la IMAGEN; la plataforma hace el TEXTO.** Es el reparto que
  define el módulo y no es una preferencia estética: los modelos generativos no
  escriben texto de forma fiable, y un párrafo en español, el nombre propio de
  un club y el del Gobernador salen deformados con frecuencia alta. Peor: una
  vez que salen mal **no hay salida limpia**, porque corregirlos encima es el
  composite que el equipo rechazó dos veces (v4.323-v4.324) y el enmascarado
  grande que producía mosaico (v4.317-v4.320). El pedido original planteaba que
  el modelo compusiera la pieza entera; se acotó a propósito.
- **No es un composite de los prohibidos.** El modelo no devuelve una fotografía
  que retoquemos: devuelve el LIENZO sobre el que se compone. Dibujar tipografía
  sobre un fondo es diseño gráfico normal, y es lo que el módulo ya hacía — sólo
  que ahora el fondo también puede venir del modelo.
- **El modelo compone A CIEGAS si no se le dice dónde cae el texto** (v4.734,
  `textBandOf` + `clearClauseFor`). No sabe que encima de esa imagen vamos a
  imprimir el nombre del club, el mensaje y la firma: una composición salía
  preciosa y quedaba inservible, con las caras justo debajo del título.
  `textBandOf` mira el documento REAL y devuelve la franja que ocupa lo que se
  imprime; el logotipo cuenta, porque también va encima. Se dice en PALABRAS
  —«la mitad de abajo»— y no en coordenadas: lo primero se cumple, lo segundo
  no. Y se dice el porqué, que es lo que hace que el modelo lo respete.
- **`plansFor` recibe el documento y ORDENA los planes por lo bien que le
  sientan.** Con una sola variante tiene que salir la que le sirve a esa pieza,
  no la primera de la lista. Sigue siendo determinista —a igual puntaje manda el
  orden declarado—: quien regenera espera una alternativa, no un sorteo.
- **Hay MÁS planes que `MAX_VARIANTS`, y es a propósito.** El tope es lo que se
  paga de una vez; la lista es el repertorio del que se elige. No atar los dos
  números.
- **TRES TEXTOS, TRES COSAS DISTINTAS** (v4.755). `referenceText` dice QUÉ hay
  que comunicar y lo lee el REDACTOR; `masterPrompt` dice CÓMO tiene que verse y
  lo lee el MODELO DE IMAGEN; el copy final es de cada generación y vive en el
  documento. Estaban mezclados en un solo campo y así una de las dos partes
  siempre queda mal servida. La intención **no** viaja al prompt visual: sería
  pedirle al motor generativo que redacte, que es justo lo que este módulo no le
  pide, y encima gastaría el presupuesto del prompt de imagen. Y **no se imprime
  literal** — si se imprimiera sobraría el redactor y todas las piezas dirían lo
  mismo, con el marcador del club sin resolver.
- **La dirección de arte del administrador pesa MÁS que el estilo genérico.**
  Hasta v4.754 `masterPrompt` iba último y era lo primero que se recortaba: quien
  escribía su dirección creativa podía quedarse sin ella mientras sobrevivía una
  cláusula escrita por nosotros. Ahora se sacrifica primero la paleta y el
  estilo. Lo que **no** se puede desplazar ni aflojar desde el prompt maestro es
  la preservación de las personas y la franja del texto: van antes y no se
  recortan nunca. Al tocar el orden, medir — la base ocupa 1.038 de 1.400.
- **Se describe CÓMO se integra, no sólo que se integre.** «Colocala en el
  lienzo» da una foto pegada. Lo que produce una pieza de papelería es nombrar
  el mecanismo: la fotografía dentro de una forma grande de bordes redondeados
  cuya curva sigue las del lienzo, con margen limpio alrededor, el borde fundido
  en la superficie y la luz de las dos igualada.
- **La franja del texto NO se sacrifica al recortar el prompt.** El presupuesto
  se recorta por el final —prompt maestro primero—; lo que sostiene la
  composición no se toca. Lo comprueba `test:design` con el peor caso.
- **Cada variante es una DISTRIBUCIÓN, no una semilla.** Pedirle cuatro veces lo
  mismo al modelo da cuatro versiones parecidas y no ayuda a elegir. Lo que
  cambia entre variantes es dónde manda la fotografía y qué zona queda limpia
  para el texto (`VARIANT_PLANS`). Se toman EN ORDEN, no al azar: con una sola
  variante tiene que salir siempre la misma, no una ruleta.
- **Lo prohibido va en `negative_prompt`, no pegado al positivo.** Misma regla y
  mismo motivo que el Creador de Reels (v4.705): dentro de la descripción de la
  escena, el modelo se obsesiona con lo prohibido; en su campo lo lee como lo
  que es. `createKieImageTask` acepta ahora `imageUrls` (plural) y
  `negativePrompt`; **el camino de UNA imagen quedó intacto** porque lo usan el
  Generador de Publicaciones y la Expansión de Lienzo.
- **El fondo entra AL PIE de la pila y OCULTA el nodo de la fotografía.** La foto
  ya está dentro de la imagen generada; dejarla encima la mostraría dos veces.
  Se marca con `role: 'backdrop'` y no por posición, porque el usuario puede
  reordenar capas y una regeneración tiene que encontrar el fondo anterior para
  reemplazarlo, no para acumular.
- **El LIENZO institucional es un nodo, no un ajuste** (v4.732, `role: 'lienzo'`,
  `withBase`). La imagen base se elegía en el panel y **no se veía en ninguna
  parte**: era sólo un dato que viajaba al modelo, así que el administrador
  colocaba el texto a ciegas respecto del fondo sobre el que iba a quedar, y la
  pieza —descargada, o publicada con la composición apagada— salía sin ese
  fondo. Como nodo se dibuja, se exporta y se publica sin maquinaria nueva: es
  el mismo grafo de escena.
- **`lienzo` y `backdrop` son roles DISTINTOS, y confundirlos apaga la
  fotografía.** El lienzo es la papelería del Distrito y no tapa nada; el
  backdrop es lo que devuelve el modelo, con la foto ya adentro, y por eso sí
  apaga su nodo. Con un solo rol, elegir una imagen base dejaría al portal
  público sin mostrar la foto que acaba de subir el visitante. El backdrop va
  **encima** del lienzo: al pie del todo quedaría tapado por él.
- **El nodo del lienzo se sincroniza en un EFECTO, no en cada manejador.** La
  imagen base se cambia desde cuatro sitios —subir, Biblioteca, quitarla y
  cambiar de plantilla—; hacerlo en cada uno deja al quinto sin hacerlo, y el
  fallo es mudo: el panel muestra la imagen y la pieza sigue en blanco.
- **Un diseño sin espacio para la FOTOGRAFÍA lo ofrece crear** (v4.733), igual
  que la Cabecera con el logotipo y por el mismo motivo: sin ese hueco el
  formulario público no la pide y no hay nada que integrar en el lienzo, y desde
  el panel no se ve —el administrador mira su pieza completa—. Es la secuela de
  v4.722.3: el compilador borraba el hueco cuyo valor no se podía resolver, y el
  club con el que se diseña casi nunca tiene fotografía cargada, así que el
  logotipo sobrevivía y la fotografía no. Recompilar la plantilla se llevaría
  por delante todo lo que el usuario movió; por eso se agrega el hueco que
  falta. Nace **marcado como campo del portal** —uno que no es campo no lo puede
  llenar nadie— y por debajo del texto y del logotipo, para no taparlos.
- **El portal público GENERA con un gesto explícito** (v4.756). Era un
  formulario con vista previa en vivo y un botón de descargar: la pieza se
  armaba sola mientras se escribía y nadie sabía cuándo «se generaba» algo.
  Ahora hay tres fases —formulario, generando, listo— y el trabajo real ocurre
  al pulsar Generar.
- **Los pasos que se muestran son los que OCURREN.** Si no hay mensaje que
  escribir ni composición que hacer, generar es instantáneo y se dice así. Un
  progreso inventado es peor que ninguno: hace esperar por nada. Y un fallo
  vuelve al formulario con el motivo — nunca se queda girando.
- **Componer se dispara SÓLO en Generar, no al subir la fotografía.** Con el
  gesto explícito, hacerlo también al soltar el archivo gastaría los créditos
  DOS veces por visita, y en un portal anónimo eso lo paga el operador. Cambiar
  la fotografía sí invalida lo compuesto, que es lo que corresponde ahí.
- **Los clubes del buscador salen del catálogo de la FERIA, no del directorio
  de sitios** (`publicClubs.js`, sobre `rotaryClubs.js`). Tres motivos: el
  directorio incluye organizaciones que no son clubes y sitios a medio
  configurar, y abrirlo entero a un portal sin autenticación expone más de lo
  que la función necesita; es la MISMA lista que el rotario ya vio al postular
  su proyecto o al inscribirse al evento, y dos listas para lo mismo se separan
  en silencio; y no cuesta una consulta por pulsación en una pantalla anónima.
  Lo único que se enriquece desde la base es el logotipo, y sólo para un club
  que YA está en el catálogo.
- **El nombre para imprimir se CONSTRUYE** (`clubDisplayName`). El catálogo
  guarda «Bogotá» porque es lo que hace usable un desplegable de 74 entradas,
  pero la pieza dice «Al {{club}}» y «Al Bogotá» no es el nombre de nadie. Los
  clubes electrónicos son la excepción —«Rotary E-Club Origen», no «Club Rotario
  E-Club Origen»—. Al agregar un tipo de club con nombre propio, agregarlo ahí.
- **La lista ayuda a escribir; NO cierra el valor.** Misma regla que la
  postulación (v4.706) y el registro al evento (v4.708), y por el mismo motivo:
  un catálogo se queda viejo solo y hay Rotaract, Interact y clubes de otros
  distritos. Y **nunca un `<datalist>`** (v4.656).
- **El portal público COMPONE al subir la fotografía** (v4.732; desde v4.756, al
  pulsar Generar). El motor y sus
  endpoints existían desde v4.722 y `PlantillaPublica.tsx` **no los llamaba**:
  la función estaba declarada y muerta. Se dispara sólo con el campo de clase
  `foto` —un logotipo se dibuja nítido en su sitio, no se funde con el fondo— y
  se resuelve por `kind`, no por la clave: una plantilla puede llamar `portada`
  a su fotografía.
- **La preservación de la fotografía se MIDE, no se promete** (v4.757,
  `designGuard.js`). El prompt pide que no se invente ni se pierda a nadie;
  pedirlo es necesario y no alcanza — un modelo generativo puede desobedecer y
  la pieza sale igual, con alguien de más, en una publicación institucional. Se
  compara la composición con la fotografía original: recuento, personas nuevas o
  ausentes, y consistencia de los rostros.
- **Cuando no da, se DESCARTA la composición; no se retoca la imagen.** Pegar la
  fotografía original encima para corregirla es el composite que el equipo
  rechazó dos veces («se ve overlay / montaje», v4.323-v4.324). Este control mide
  y decide. La pieza sale con la foto en su recuadro, y el motivo se dice con su
  CONSECUENCIA.
- **Las mediciones se REUTILIZAN de `reelQuality.js`**, no se reimplementan
  —copiar una medición es la forma segura de que las dos mitades se separen en
  silencio—. Lo que vive en `designGuard.js` es el CRITERIO de este módulo: qué
  se pregunta y qué se decide con la respuesta.
- **El piso estructural es DELIBERADAMENTE bajo (0,18).** Acá el modelo
  construye un lienzo NUEVO alrededor de la fotografía, así que gran parte de
  los píxeles deben ser distintos: un piso alto reprobaría toda composición
  buena — el error que ya costó dos rondas de créditos en el Creador de Reels
  (v4.675). Sólo atrapa el caso extremo, y sólo cuando no hubo modelo de visión.
- **Por encima de ocho personas el recuento no decide solo**
  (`reliableCountMax`), igual que en Reels: contar catorce cabezas no lo hace
  bien ningún modelo y descartar por un ±1 sería tirar una composición buena. En
  multitud sólo vale la señal explícita.
- **`unavailable` no es un tipo de «bien».** Significa que no se pudo mirar, se
  dice así, y la pieza se entrega igual: un control de calidad que tumba la
  generación es peor que no tenerlo.
- **La verificación va en su PROPIO paso, no dentro del sondeo.** Necesita la
  fotografía original, que vive en el navegador de quien la subió: mandarla en
  cada sondeo sería mandarla cinco veces para usarla una.
- **Un fallo al componer NO rompe la pieza.** Se avisa y queda la composición
  declarada, con la fotografía en su recuadro, que es una pieza correcta y
  descargable. Misma degradación que `fallbackDirection` en el Creador de Reels.
  Y hay vuelta atrás explícita: una composición que no gusta no puede dejar la
  pieza peor que antes.
- **El sondeo tiene tope** (150 s). Sin él, un trabajo que nunca termina deja la
  pantalla girando para siempre y quien la abrió no sabe si esperar.
- **El criterio del lienzo y el fondo está espejado** en `src/lib/designCompose.ts`
  y lo comprueba `test:design` comparando salidas. Hasta v4.731 `DesignStudio.tsx`
  llevaba su propia copia de `withBackdrop` escrita a mano; al llegar el portal
  público habrían sido tres. **Al tocar `designCompose.js`, tocar el espejo.**
- **Quitar el fondo devuelve la pieza a su composición declarada**, con su
  fotografía visible. Una generación que no gusta no puede dejar la pieza peor
  que antes.
- **No se comprueba que la imagen generada no tenga texto.** Detectarlo exigiría
  OCR —decenas de MB en una función que ya empaqueta FFmpeg— y sería poco
  fiable. Se pide por `negative_prompt` y la decisión queda a la vista: el
  usuario ve la variante antes de usarla. No afirmar en la interfaz que se
  verifica algo que no se verifica.
- **Viene APAGADA.** Encenderla gasta créditos por pieza y manda la fotografía a
  un proveedor externo: es una decisión del operador, no un valor por defecto.
- **La configuración se GUARDA con el diseño y viaja al enlace** (v4.735,
  columna `composition` en `DesignProject`). Hasta v4.734 el navegador la
  mandaba al guardar y el servidor la **descartaba** —no había dónde ponerla—,
  con dos consecuencias mudas: al reabrir el diseño la composición volvía
  apagada, y el portal público nunca se enteraba de que esa plantilla componía,
  así que entregaba la fotografía encajada en su recuadro. Se reportó como «lo
  enciendo, guardo y veo todo igual». Al agregar un ajuste al panel, comprobar
  que exista la columna que lo guarda: el `req.body` acepta cualquier campo y
  descartarlo no da error.
- **`refreshPublication` actualiza también `composition`.** Es la columna que
  lee el portal para decidir si compone; sin ella el enlace se refresca con el
  documento nuevo y la composición vieja.
- **Que la pantalla MANDE el ajuste se comprueba en el navegador.** Desde el
  servidor no se ve qué manda el panel, y una columna nueva sin nadie que la
  llene se ve igual que la función entera sin hacer.
- **En el portal público, componer obliga a GUARDAR la foto anónima.** KIE
  necesita una URL que pueda descargar, así que la fotografía deja de ser
  efímera y se sube a `public-tmp/` —lo contrario de lo que hace `/photo`—. No
  es un descuido: es el precio de la composición generativa, y el panel lo
  advierte al encenderla. El prefijo está aparte para poder vaciarlo con una
  regla de ciclo de vida sin tocar la Biblioteca Multimedia.
- **`variants` y `publicVariants` son dos números distintos.** El panel puede
  explorar cuatro; una visita anónima gasta lo que el operador dijo (1 por
  defecto).
- **El prompt tiene presupuesto y se recorta con orden**: primero el prompt
  maestro, después la cola. Lo que sostiene la composición —las dos imágenes y
  el plan— no se toca, y lo que se deja fuera se anota en consola.

**Sintaxis del servidor: `npm run check:syntax`.** Corre en `prebuild` y rompe
el despliegue. Es la TERCERA causa de módulo caído, y no la ven ni el typecheck
ni `check:hooks`:

- El frontend lo compila Vite, así que un archivo que no parsea rompe el build y
  se ve. **El servidor no pasa por ningún compilador**: las rutas se importan de
  forma perezosa en tiempo de ejecución, así que un error de sintaxis viaja
  intacto a producción y sólo aparece cuando alguien usa esa pantalla.
- El typecheck sólo mira `src` (`include: ["src"]`), y los archivos del servidor
  son `.js` fuera de ese alcance.
- Las pruebas del módulo tampoco lo vieron: las puras importan el criterio y las
  de navegador simulan la API, así que **ninguna importaba `ensureDesignSchema`**.
- Ojo al comprobar a mano: `node --check` sobre una copia en `/tmp` la trata
  como CommonJS —no hay `package.json` con `"type": "module"`— y **puede dar por
  bueno un archivo que como ESM falla**. Comprobar siempre en su ruta real.
- Va en paralelo: en serie son ~7 s sobre 225 archivos, y un paso de prebuild
  que cuesta siete segundos termina desactivándose. Con concurrencia, ~3 s.

**Sigue sin cubrirse** el error de importación en tiempo de ejecución —importar
un símbolo que el módulo no exporta— porque comprobarlo exigiría ejecutar los
módulos, y eso arrastra la base de datos.

**Variables de entorno del Motor de Composición:**

| Variable | Para qué |
|---|---|
| `DESIGN_COMPOSE_MODEL` | Modelo de KIE para componer (default `google/nano-banana-edit`). KIE renombra ids; se corrige sin desplegar |
| `KIE_API_KEY` | La misma credencial que ya usa el resto del sitio |

**Pendientes conocidos:** los formatos 4:5, 9:16 y 16:9 están **declarados con
`available:false`** — la arquitectura ya los soporta (los nodos son fracciones),
falta ajustar las plantillas a cada proporción y probarlas. La exportación a
**SVG no está**: la pieza lleva fotografías, así que un SVG sería un ráster
envuelto en XML, que no es lo que alguien espera al pedir SVG. Agrupar capas y
la selección por marco tampoco: hoy la multiselección es con Shift+clic. Y el
**portal público no tiene freno de abuso**: la subida está acotada en tamaño y
la IA por plantilla, pero no hay límite por dirección IP; con un enlace muy
difundido conviene ponerlo antes que después.

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

Las 34 tablas que la aplicación crea sola y que estas barreras protegen:
`BannerTemplate`, `DesignProject`, `DesignPublicTemplate`, `EcosystemClone`,
`EventRegistration`, `MediaFolder`, `EventAttendeeAccount`,
`EventAttendeeLogin`, `FAQ`, `OutroProject`, `ReelProject`, `ReelScene`,
`ReelCopy`, `ReelNarration`, `ReelUsage`, `CrmWebhookEvent`, `CrmOutboundLog`,
las seis del módulo de SEO Inteligente (`SeoSiteConfig`, `SeoPageMeta`,
`SeoAudit`, `SeoIssue`, `SeoKeyword`, `SeoMetric`)
y las once `ProjectFair*`.
(Más las seis del registro de eventos que enumera su propia sección:
`EventEdition`, `EventRegistrationCategory`, `EventRegistrationCompanion`,
`EventRegistrationPayment`, `EventRegistrationHistory` y
`EventRegistrationMessage`.)

## SEO Inteligente (AI SEO Engine) — v4.703

Servicio transversal: optimiza el posicionamiento de **cualquier** sitio de la
plataforma, sin depender de ningún módulo concreto.

| Archivo | Qué es |
|---|---|
| `server/lib/seoSpec.js` | Fuente de verdad: rutas públicas, rutas privadas, límites, pesos de la nota y catálogo de hallazgos |
| `server/lib/seoEntities.js` | Qué COSA hay detrás de cada dirección; inventario del sitio |
| `server/lib/seoRender.js` | Composición del `<head>`: reemplaza, escapa y escribe una sola vez |
| `server/lib/seoSchema.js` | JSON-LD por tipo de página |
| `server/lib/seoServe.js` | Orquesta el documento público; lo llama el catch-all de `api/index.js` |
| `server/lib/seoRules.js` | El criterio de la auditoría. **Puro**: sin base, sin red, sin IA |
| `server/lib/seoAudit.js` | Recorre el sitio y le pasa cada página a las reglas |
| `server/lib/seoAI.js` | Redacta metadatos, palabras clave, ALT y recomendaciones |
| `server/lib/seoIntegrations.js` | Search Console, GA4, PageSpeed, IndexNow… con su estado REAL |
| `server/lib/seoStore.js` | Persistencia e histórico |
| `server/lib/seoSweep.js` | AI Tracker: barrido por cron |
| `server/lib/ensureSeoSchema.js` | Crea las 6 tablas en runtime |
| `server/controllers/seoController.js` | `robots.txt` y `sitemap.xml` |
| `server/controllers/seoEngineController.js` | API del panel |
| `src/pages/admin/SeoIntelligence.tsx` | El panel (`/admin/seo`) |
| `src/lib/seoSpec.ts` | Espejo mínimo: sólo lo que hace falta para pintar |

Pruebas: `npm run test:seo` (118 casos). **No necesitan base ni credenciales** —
por eso el criterio vive en `seoRules.js`, separado de la orquestación.

**Reglas durables:**

- **El `<head>` se resuelve en el SERVIDOR, no en `useSEO`.** Los rastreadores de
  WhatsApp, Facebook, LinkedIn, Slack y Telegram **no ejecutan JavaScript**: leen
  el HTML tal como llega. `useSEO` corre demasiado tarde para ellos y queda sólo
  para la navegación interna de la SPA. Es posible porque `vercel.json` reescribe
  `/((?!api/).*)` a la función: toda página pasa por Express antes de existir.
- **Se REEMPLAZA, nunca se añade** (`stripManagedTags`). Era el defecto de fondo:
  `index.html` trae `og:title`/`og:description`/`og:url` escritos a mano y el
  servidor añadía los suyos antes de `</head>`. El documento salía con DOS
  `og:title` y toda red social lee la **primera** — la genérica de la plataforma.
  Por eso los cientos de sitios alojados compartían la misma tarjeta. Al agregar
  una etiqueta al `<head>`, agregarla a `MANAGED_NAMES`/`MANAGED_PROPS` o volverá
  a duplicarse.
- **Ninguna dirección pública se compone con `#`.** La aplicación migró a
  BrowserRouter hace decenas de versiones, pero `useSEO` seguía escribiendo la
  canonical como `dominio/#/ruta` y el sitemap publicaba lo mismo. El buscador
  descarta el fragmento, así que cada sitio venía declarando que **todas sus
  páginas son la portada** y se indexaba una sola dirección por sitio.
- **`robots.txt` y `sitemap.xml` van en la RAÍZ.** Existían sólo bajo
  `/api/public/seo/…`, donde ningún rastreador mira; las direcciones de la raíz
  caían en el catch-all y devolvían HTML. Para Google, sitios sin robots y sin
  sitemap.
- **Las reglas de `robots.txt` van sin barra final.** La comparación es por
  PREFIJO: `Disallow: /login` cubre `/login` y `/login/`; `Disallow: /login/`
  deja fuera justamente `/login`, que es la dirección que existe. Y una regla con
  `#` no bloquea nada —el fragmento nunca llega al servidor—, que es peor que no
  tenerla: da por protegido algo abierto.
- **`PRIVATE_PREFIXES` es la ÚNICA lista de lo que no se indexa.** La consumen
  robots.txt, el sitemap y la auditoría. Con dos listas se separan en silencio y
  el sitemap acaba publicando lo que robots bloquea.
- **Todo lo interpolado en el HTML se escapa** (`escapeAttr`). El nombre y la
  descripción del club se metían crudos en `content="…"`: una comilla partía la
  etiqueta y derramaba texto en el `<head>`.
- **Una entidad que ya no existe responde 404, no 200.** Un *soft 404* se indexa
  como página buena, se acumula y diluye el sitio. El módulo que reporta ese
  defecto no puede cometerlo.
- **La IA no DESCUBRE problemas: los REDACTA.** Los hallazgos salen de
  `seoRules.js`, que es aritmética y comparación de cadenas. Mismo criterio que
  `crmRecommendations.js`: darle la base a un modelo y pedirle «decime qué
  mejorar» produce cifras plausibles y no auditables. **Sin credencial de modelo
  la auditoría funciona igual**; pierde la redacción, no los hallazgos.
- **El modelo escribe, el CÓDIGO valida.** `validateMeta` comprueba longitudes y
  reintenta devolviéndole al modelo **la regla concreta que rompió**, igual que
  `templateComposer.js`. Pedirle «revisá el formato» no corrige nada. Tras los
  reintentos se repara por código (recortar sin partir palabras) en vez de tirar
  el trabajo.
- **El título que escribió una persona NO se recorta.** Lo único que se decide es
  si el nombre del sitio cabe detrás. Que sea largo es un hallazgo con su
  recomendación, no algo que el pintado resuelva por lo bajo. El `<title>` y el
  `og:title` se componen por separado: la tarjeta social tiene más espacio.
- **Lo MANUAL no lo pisa la IA, nunca.** Está en el `WHERE` del `ON CONFLICT` de
  `savePageMeta`, no en la pantalla — misma regla que `putAuto` en traducciones.
  Si el repaso nocturno puede sobrescribir un título corregido a mano, corregir a
  mano deja de tener sentido.
- **No se declara en JSON-LD lo que no se sabe.** `prune` quita los campos
  vacíos y un `Event` sin fecha **no se emite**: Schema.org la exige y un dato
  inventado no es un dato incompleto, es una declaración falsa que Google
  penaliza. Sin ciudad ni país no se declara dirección.
- **Un cero es una afirmación; un hueco es la verdad.** Impresiones, clics, CTR y
  posición **sólo** existen con Search Console conectado, y sin él se muestran
  vacíos con el motivo escrito. **Backlinks y posición real NO se reportan**:
  exigen un índice de enlaces o un proveedor de SERP que no tenemos. El volumen y
  la dificultad de una palabra clave salen de un modelo y viajan marcados
  `provenance: 'estimated'` — no son datos de SEMrush y la UI lo dice.
- **`unknown` no es un tipo de «bien».** Una integración tiene cuatro estados y
  «no se pudo comprobar» se pinta distinto de «conectado». Misma regla que el
  panel de diagnóstico del CRM.
- **La nota y la SALUD responden preguntas distintas** y por eso son dos números.
  La nota dice qué tan optimizado está; la salud, qué tan roto. Un sitio con
  descripciones cortas tiene nota media y salud perfecta; uno con canonicals
  rotas, salud por el piso. Mezclarlas escondería lo que urge.
- **El descuento de la nota es proporcional al tamaño del sitio**, pero **un
  hallazgo crítico topa su eje en 50** por grande que sea: «crítico» significa que
  algo no funciona, y promediarlo hasta hacerlo desaparecer vacía la palabra.
- **El criterio es PURO y por eso se puede probar** (`seoRules.js`). Un motor de
  auditoría que sólo se ejercita contra una base real termina sin pruebas, y
  entonces nadie se entera de que una regla cambió de signo.
- **Las seis tablas viven FUERA de Prisma**, como manda la sección de base de
  datos de este archivo, y quedan protegidas por `scripts/db-push-guard.mjs`.
- **El barrido tiene presupuesto de tiempo y candado.** El candado es un `UPDATE`
  condicional sobre `lastAuditAt` con `FOR UPDATE SKIP LOCKED`: dos vueltas
  simultáneas del cron no auditan el mismo sitio ni gastan el doble de modelo.
- **`STATIC_ROUTES` es espejo de `src/App.tsx`, escrito a mano.** El servidor no
  puede importar el árbol de rutas de React. Una ruta pública nueva que no se
  declare cae en `generic`: se degrada, no se rompe — pero pierde su Schema y su
  prioridad.
- **La auditoría NO rastrea por red.** Lee la base, que es la fuente exacta de lo
  que publicamos. Un rastreador tendría que pedir cada página y esperar a que
  React la pinte: imposible en 120 s y pagando por mirar lo que ya tenemos. Por
  lo mismo sólo ve el contenido guardado, no lo que pinta la plantilla — de ahí
  que las comprobaciones de encabezados y de páginas huérfanas se limiten al
  contenido con cuerpo propio, para no acusar en falso.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `SEO_AUDIT_INTERVAL_HOURS` | Cada cuánto se reaudita un sitio (24 por defecto) |
| `PAGESPEED_API_KEY` | Core Web Vitals reales (laboratorio y campo) |
| `GOOGLE_SEO_CLIENT_ID` / `GOOGLE_SEO_CLIENT_SECRET` | Search Console, GA4 y Business Profile |
| `INDEXNOW_KEY` | Aviso a Bing/Yandex/Seznam. **Google no participa en IndexNow** |
| `BING_WEBMASTER_KEY` | Cobertura y consultas en Bing |
| `CRON_SECRET` | Protege `/api/cron/seo-tick`, igual que el resto de los crons |

**Pendientes conocidos:** la autorización OAuth de Search Console y GA4 está
**declarada pero no implementada** — el módulo reconoce la credencial de
aplicación y distingue «sin autorizar» de «sin configurar», pero falta el flujo
de consentimiento por sitio y la lectura de datos; hasta entonces impresiones,
clics, CTR y posición se muestran vacíos a propósito. PageSpeed está
implementado de punta a punta pero todavía no se llama desde el barrido, así que
Core Web Vitals no entra aún en la nota. Y el sitemap es un archivo único: por
encima de 50.000 direcciones habrá que partirlo en índice.

## Tipo de sitio y portada — v4.737

`SmartHome` (`src/App.tsx`) decide qué se pinta en `/` según el tipo de sitio, y
`ENTITY_TYPES` (`src/lib/entityTypes.ts`, espejado en `server/lib/entityTypes.js`)
es el catálogo de tipos con sus capacidades: `editableHome`, `customTheme` y
—desde v4.737— `fixedNav`.

**Reglas durables:**

- **Un DISTRITO es un sitio normal.** Se arma con su configuración, como un club:
  su portada son las secciones estándar y su menú sale del panel. No tiene rama
  propia en `SmartHome` y no está en `fixedNav`.
- **Una campaña NO se pone como portada de un tipo de sitio.** Hasta v4.736
  `SmartHome` devolvía `<DistrictMultimediaGallery />` —el formulario de la
  Conferencia Bidistrital Medellín 2026— para todo sitio de tipo distrito. El
  comentario decía «e.g. 4271.org» y la intención era ese distrito, pero la
  condición miraba `club.type === 'district'`: atrapó al 4281 y habría atrapado a
  cualquier distrito futuro, dejándolos **sin portada y sin ningún ajuste del
  panel que lo apagara**. Una campaña con fecha —una conferencia, una
  convocatoria— es una PÁGINA con su ruta, que el sitio enlaza desde su menú; hoy
  `/galeria-multimedia`. Al condicionar por tipo, preguntarse a cuántos sitios
  alcanza además del que se tenía en mente.
- **El orden de la portada estándar vive en `SmartHome` y NO es configurable
  por sitio.** Desde v4.745.5 es: hero → «Somos gente de acción» → «Noticias y
  artículos» → banda → «Únete» → cifras → Fundación → causas → Bloque
  Destacado. Noticias subió al
  tercer puesto (pedido del Distrito): cerrando la portada, lo más nuevo del
  sitio quedaba donde casi nadie llega. Y las cifras pasaron DEBAJO de «Únete»
  (v4.745.8): la invitación a sumarse va primero y los números la respaldan. Al mover una sección, **la condición
  que la enciende se mueve con ella** —la de Evento/Convención que apaga
  noticias vive junto al `<NewsSection />`— y hay que recordar que el cambio
  alcanza a TODOS los sitios estándar, no sólo al que lo pidió. Lo comprueba
  `test:nav` sobre el archivo; el puesto real se verifica en el navegador.
- **El Bloque Destacado cierra la portada y es CONFIGURABLE** (v4.746,
  `SpotlightSection.tsx`): imagen de fondo a todo el ancho, título, texto y
  botón, entre las áreas de interés y el pie. Tres reglas lo sostienen:
  - **Nace vacío y entonces no pinta nada** —ni el espacio—. Es la lección de
    v4.737: la portada la comparten todos los sitios, así que un contenido
    escrito en el código aparecería en cada club.
  - **NO se acota con `hasEditableHome`.** Los otros bloques de contenido
    (`actionContent`, `joinContent`, `foundationContent`, `causesContent`)
    nacieron para Evento/Convención y llevan esa condición; éste se pidió para
    un DISTRITO, y acotarlo igual lo habría dejado sin poder llenarse. Al
    agregar un bloque de contenido, preguntarse para qué tipo de sitio es.
  - **El botón toma la piel de `useCtaButton` y el icono de `ctaIcons.tsx`**,
    igual que «Toma Acción con Nosotros» y «Involúcrate en Rotary». Ese
    catálogo de emojis estaba escrito TRES veces —idéntico— y éste iba a ser la
    cuarta: una copia que se queda atrás hace que el panel ofrezca un icono que
    la portada no sabe dibujar. Mismo criterio que `ctaStyles.ts`.
  - **La imagen y el texto viven en sitios distintos y eso hay que DECIRLO en
    la pantalla.** La imagen es un hueco de `useSiteImages` (Distribución de
    Imágenes, con las dos vías de v4.700); el texto y el botón son un ajuste
    (`spotlight_section_content`, Configuración → Identidad). El texto de ayuda
    del panel nombra la otra pantalla, o el administrador llena la mitad y no
    encuentra el resto.
- **Una imagen de la portada es un HUECO CONFIGURABLE, no una URL en el código**
  (v4.742, `homeBanner` en `useSiteImages` + `HomeBannerSection`). La portada la
  comparten todos los sitios: una imagen escrita en el código aparecería en cada
  club. Nace VACÍA y la sección devuelve `null`, así que quien no la usa ve su
  portada igual que antes —ni siquiera queda una sección vacía—. Es la misma
  lección de la campaña que secuestró la portada de los distritos.
- **El azul de la barra superior es un color del TEMA, no un literal** (v4.745,
  `rotary-topbar` en `tailwind.config.js`). Lo llevan la barra superior
  (`Navbar.tsx`), su versión pública (`PublicTopBar.tsx`) y la banda de la
  portada: estaba escrito a mano como `bg-[#28354b]` en los dos primeros y, al
  necesitarlo un tercero, tres copias se separan en cuanto alguien cambie una.
  Va en el TEMA y no en `index.css` a propósito: una clase escrita a mano en
  `@layer utilities` —como `bg-rotary-blue`— **no genera los modificadores de
  opacidad** y la regla no existe, en silencio (v4.719). Lo comprueba
  `test:nav`, incluido que la clase llegue al CSS compilado.
- **La banda va sobre ese azul, no sobre blanco.** Estas piezas suelen ser
  azules de borde a borde: sobre blanco quedaban como una tarjeta recortada.
- **La banda ocupa el ancho de la pantalla menos 20 px por lado** (v4.745.3,
  `px-5`), NO el contenedor centrado del resto de la portada: la imagen ES la
  sección, no un bloque de contenido dentro de ella. Y **no lleva sombra, halo
  ni filtro** — sobre un fondo del mismo tono, cualquier resplandor se lee como
  un marco pegado alrededor de la pieza. No reintroducir `shadow-*`, `ring-*`
  ni `drop-shadow-*`; lo comprueba `test:nav`.
- **La barra de copyright lleva el mismo azul** (v4.745.1). Era `bg-black/10`,
  un velo sobre el fondo del pie: su color dependía del fondo de cada sitio y no
  coincidía con nada. Un sitio Evento/Convención conserva su `copyrightBg`
  configurado — ahí el operador ya eligió y pisarlo sería desobedecerlo.
- **El fondo del pie sale de `src/lib/siteChrome.ts`** (`SITE_FOOTER_BG`,
  `#212C3F` desde v4.745.2). Lo consumen el pie de verdad (`Footer.tsx`) y la
  vista previa del panel (`FooterSystem.tsx`): escrito a mano en los dos, el
  panel acaba enseñando un pie que no es el que ve el visitante. Un sitio
  Evento/Convención conserva su `colors.footerBg` configurado.
- **«Club Platform for Rotary» es una MARCA y va con `data-no-translate`.** El
  traductor de DOM la pasaba a «Plataforma de Club para Rotary», un nombre que
  no existe. Es la distinción de v4.662 entre LENGUAJE —se traduce— e IDENTIDAD
  —no se toca—; «Powered by» sí es lenguaje y se sigue traduciendo. Al escribir
  el nombre de la plataforma en una pantalla pública, marcarlo.
- **Ninguna imagen de la portada lleva resplandor ni se recorta a una
  proporción fija** (v4.745.4, `JoinSection.tsx`). Esa imagen tenía detrás un
  degradado dorado desenfocado más un `shadow-2xl` —sobre el fondo azul de la
  sección se leía como un halo pegado— y un `aspect-[4/3]` con `object-cover`
  que recortaba toda pieza que no fuera 4:3. Estas piezas traen el texto DENTRO
  —nombres, cargos, el logotipo del distrito— y el recorte se llevaba
  justamente eso. El contenedor sigue a la imagen, no al revés. Lo comprueba
  `test:nav`.
- **Al diagnosticar «la imagen de la portada tiene sombra», mirar QUÉ hueco
  está usando el sitio.** Hay varios —`homeBanner`, `join`, `foundation`— y
  cada uno lo pinta un componente distinto; corregir el equivocado se ve
  exactamente igual que no haber hecho nada.
- **Al agregar un hueco de imagen hay que tocar DOS listas de `useSiteImages`**:
  `DEFAULTS` (de donde sale la mezcla inicial) y el array `allKeys` del efecto
  (que decide qué se lee de la respuesta del servidor). Una clave que esté en
  una y no en la otra se queda con su valor por omisión para siempre, sin que
  nada avise.
- **La banda se muestra ENTERA, sin recortar** (`object-contain`, proporción
  natural) y por eso no está en la lista de `needsCrop` del editor. Estas piezas
  suelen traer el texto dentro de la imagen —nombres, cargos, el logotipo— y un
  recorte panorámico se lleva justamente eso.
- **El criterio de qué sitios llevan menú propio vive en `entityTypes.ts`**
  (`hasFixedNav`), no en cada pantalla. Estaba escrito a mano en `Navbar.tsx` y
  otra vez en `ClubSettings.tsx`, y las dos copias **ya se habían separado** —el
  `Navbar` contemplaba además los sitios RYE y el panel no—. Acepta la clave
  máquina (`district`) y la etiqueta legible (`Distrito Rotario`) porque el panel
  guarda una u otra según por dónde se creó el sitio.
- **El menú y su editor son la MISMA decisión.** El `Navbar` saltea el bloque
  estándar y el panel esconde el editor: si las dos condiciones no salen de la
  misma función, un sitio termina con un menú que nadie puede cambiar. Es lo que
  le pasaba al distrito, con «Inicio | Contacto» y ninguna vía para tocarlo.
- **Un sitio RYE se reconoce por el dominio Y por el subdominio.** En una vista
  previa (`app.clubplatform.org/?distrito=rye…`) el dominio es el de la
  plataforma. `ClubContext` ya fuerza `type = 'Programa de Intercambio'` para
  esos sitios; el `Navbar` lo comprueba igual porque no depende de ese orden.
- Pruebas: `npm run test:nav` (34 casos). **Sin base, credenciales ni red.**
  Comprueban el criterio, que los dos catálogos coincidan y —leyendo los
  archivos— que la portada no vuelva a quedar secuestrada ni reaparezca un número
  de distrito escrito a mano. Esto último no lo ve el typecheck: el código era
  válido y estaba bien tipado.
- **Verificar la PORTADA en un navegador, no sólo el criterio.** El defecto vivió
  versiones porque nadie abrió el sitio de un distrito. Comprobado con Chromium
  sobre el `dist/` real y la API interceptada: la portada pinta sus secciones y
  el menú da «Inicio · Sobre Nosotros · Proyectos · Noticias · Eventos ·
  Contacto», y `/galeria-multimedia` sigue mostrando la galería.

## El dominio propio de un sitio — v4.743

`GET /clubs/by-domain` es lo que decide QUÉ sitio se pinta en cada visita. El
criterio de normalización vive en `server/lib/domains.js` (**puro**), y lo usan
las dos puntas: el alta y la edición al GUARDAR, y la resolución al BUSCAR.

Pruebas: `npm run test:domains` (34 casos). **Sin base, credenciales ni red.**

**Reglas durables:**

- **Un dominio sin asignar NO da error: da el sitio «Origen».** Es la decisión de
  diseño que hace que este fallo sea tan difícil de ver — el visitante recibe un
  sitio Rotary plausible, con «Nombre del club» y fotos de archivo, y concluye
  que está a medio configurar. No se cambió el comportamiento (servir algo es
  mejor que un 500), pero **la respuesta ahora dice cómo se resolvió**
  (`resolvedBy`) y el panel lo traduce a una frase.
- **Las dos puntas normalizan con la MISMA función.** Si el alta guarda una forma
  y la búsqueda espera otra, el sitio no resuelve y nadie se entera. Hasta v4.743
  `updateClub` normalizaba y `createClub` insertaba `domain || null` en crudo: un
  sitio creado pegando `https://ejemplo.org` nacía con un dominio imposible de
  casar.
- **Y aun así se comparan variantes contra lo GUARDADO** (`findByLooseDomain`).
  Normalizar al escribir no arregla las filas escritas antes, ni las que entran
  por otros caminos (registro público, importaciones). El segundo intento
  normaliza la columna dentro del SQL; sin él, arreglar el criterio no arregla
  los sitios que ya estaban mal.
- **`www.` se quita en la forma canónica**, no sólo al comparar: guardado y
  consultado tienen que reducirse a lo mismo.
- **El botón «Verificar» del panel comprueba de verdad.** Antes sólo mostraba
  «Validando configuración DNS…» y no consultaba nada, así que confirmaba una
  conexión que podía no existir — y eso es lo que dejó al Distrito 4281
  convencido de que su dominio estaba conectado. **No comprueba el DNS**: que la
  página cargue ya lo demuestra. Comprueba lo otro, que es lo que falla.
- **Distingue TRES resultados**, y los tres hacen falta: lleva a este sitio,
  lleva a otro (diciendo a cuál, para no tener que buscarlo) o no está asignado
  a ninguno (diciendo qué verá el visitante). Un booleano dejaría fuera el caso
  más confuso, que es el dominio que funciona pero apunta a otro sitio.
- **El campo del dominio es del OPERADOR de la plataforma** (`isSuperAdmin`), no
  del administrador del sitio. Al diagnosticar «no me carga el dominio», mirar
  primero con qué rol se está entrando: un administrador de sitio no ve ese
  campo y no puede corregirlo.

### El dominio propio de un DISTRITO — v4.744

Un distrito existe **dos veces** y cada fila hace una cosa distinta. La de
`District` es el registro administrativo —número, gobernador, países,
facturación y el **dominio propio**, que es lo que escribe `/admin/distritos` y
lo que se provisiona en Vercel—; la de `Club` de tipo distrito es el **sitio**:
ajustes, identidad, secciones, miembros, y es lo que edita el administrador del
distrito. El visitante llega por el dominio, que está en la primera; el
contenido está en la segunda.

El criterio vive en `server/lib/districtSite.js` (**puro**). Pruebas:
`npm run test:domains` (criterio) y `npm run test:district-site` (la ruta real,
con la base sustituida en memoria). **Sin Postgres, credenciales ni red.**

- **`by-domain` ATRAVIESA hasta el sitio.** Hasta v4.743, al encontrar la fila
  de `District` sintetizaba la entidad con `settings: []` —literalmente ningún
  ajuste—, así que el dominio propio servía un sitio en blanco mientras el mismo
  distrito, alcanzado por su subdominio de plataforma, se veía completo. Se
  reportó como «la configuración no se sincroniza»: no era una sincronización
  que faltara, era que se estaba sirviendo la fila equivocada.
- **El dominio NO se duplica en las dos filas: se resuelve al leer.** Copiarlo a
  la fila de `Club` es lo cómodo y es la trampa: las dos columnas son ÚNICAS, y
  con el valor en los dos lados cambiarlo en uno deja el otro resolviendo al
  viejo. Por eso el alta de un distrito ya **no** le pasa el dominio a su club
  espejo; sí le pone `districtId`, que es el vínculo explícito.
- **PERTENECER al distrito no es SER su sitio, y confundirlo sirve el sitio de
  otro club** (v4.744.1). `Club.districtId` es `affiliatedDistrict`: la
  afiliación, exactamente igual que `Club.district`. v4.744 lo tomó por un
  vínculo explícito —«este club es el sitio»— y `rotary4281.org` acabó sirviendo
  el **Rotary Club Pasto**, que está afiliado al 4281 y tenía su sitio completo,
  así que además ganaba el desempate por cantidad de ajustes. Es el mismo error
  que ya estaba escrito para `Club.district`, colado por la otra puerta: la
  clave foránea. Hacen falta **las dos** condiciones: que pertenezca (`districtId`
  o el número) **y** que se declare su sitio (tipo distrito, el subdominio que
  declaró el distrito, o ser el club al que están asignados sus
  administradores). Si falta cualquiera, se sirve la ficha del distrito y se
  dice que no hay sitio — antes eso que el sitio de otra organización.
- **La consulta de candidatos es de más A PROPÓSITO y el filtro lo hace el
  criterio.** `DISTRICT_SITE_SQL` trae también los clubes que sólo pertenecen;
  quién es el sitio lo decide `pickDistrictSite`, que es puro y está probado.
  Poner el filtro en el SQL lo dejaría fuera de las pruebas.
- **El panel usa la MISMA consulta y el MISMO criterio que la visita.** Con una
  copia propia, `/admin/distritos` afirmaría de un sitio distinto del que se
  sirve, que es lo peor que puede hacer una pantalla de diagnóstico.
- **Puede haber DOS clubes vinculados, y elegir mal da la página en blanco.** Al
  crear el distrito se inserta un club espejo vacío y el operador suele crear
  después el sitio de verdad desde el panel de sitios. El desempate es por
  **cantidad de ajustes**: el sitio configurado es el que tiene configuración.
  A igualdad, el más recientemente actualizado; y a igualdad de todo, el id
  menor — si dependiera del orden en que la base devuelve las filas, el mismo
  dominio serviría un sitio distinto en cada visita.
- **El número por sí solo NO vincula.** `Club.district` la lleva TODO club: es
  el distrito al que pertenece. Un club rotario del 4281 tiene «4281» ahí y no
  es el sitio del distrito. Sólo cuenta junto con el tipo de sitio distrito
  (`district` o `Distrito Rotario` — dos valores porque el alta escribe la clave
  máquina y el formulario de sitios la etiqueta legible).
- **En la marca manda el sitio; la ficha del distrito es RESPALDO.** Las dos
  tienen logo, favicon y colores, y un distrito puede tener puesto uno y no el
  otro. Tomar sólo el del sitio haría desaparecer un logotipo cargado en la
  ficha; tomar sólo el de la ficha ignoraría lo que el administrador configuró.
- **Sin sitio vinculado se sirve la ficha del distrito, no el «Origen».** Es
  peor un sitio genérico de otra organización que uno propio sin contenido, y
  `resolvedBy` (`district` frente a `district_site`) deja dicha la diferencia.
- **El DNS y el CONTENIDO son dos preguntas y se responden por separado.** La
  pestaña «Dominio» del distrito decía «✅ Dominio verificado y activo» mirando
  sólo Vercel, y eso convive perfectamente con un sitio en blanco: es lo que
  convenció al Distrito 4281 de que todo estaba bien. Ahora `domain-status`
  devuelve además `site` y `siteMessage`.
- **La prueba ejecuta la RUTA, no sólo el criterio.** `pickDistrictSite` es puro
  y estaba bien; el defecto estaba en el camino. `test:district-site` sustituye
  `server/lib/db.js` por una base en memoria con un hook de resolución de
  módulos y consulta el endpoint de verdad. Al tocar la resolución por dominio,
  correrla: es lo único que ve este tipo de fallo.

## Redirecciones de enlaces por sitio — v4.781

Direcciones cortas del propio dominio que llevan a otra parte
(`rotary4281.org/conferencia` → el formulario de inscripción). Se configuran en
Configuración → Identidad y se guardan en el ajuste `link_redirects`.

| Archivo | Qué es |
|---|---|
| `server/lib/linkRedirects.js` | El CRITERIO. **Puro**: qué regla se acepta, a dónde manda |
| `src/lib/linkRedirects.ts` | Espejo en el navegador, para avisar mientras se escribe |
| `server/lib/linkRedirectStore.js` | La I/O: resolución por dominio, caché e invalidación |
| `api/index.js` (catch-all) | El salto, antes de servir el documento |

Pruebas: `npm run test:redirects` (51 casos). **Sin Postgres, credenciales ni
red**: la base se sustituye en memoria con un hook de resolución de módulos.

**Reglas durables:**

- **El salto lo hace el SERVIDOR, no un `<Navigate>` de React.** La vista previa
  de WhatsApp, los rastreadores y `curl` no ejecutan JavaScript: con una
  redirección del navegador verían la aplicación vacía. Es el mismo motivo por
  el que el `<head>` se resuelve en el servidor (v4.702).
- **Se resuelve ANTES de `renderPublicDocument`.** Una dirección corta no es una
  página de la aplicación: si llegara al documento, el visitante vería la
  pantalla de «no encontrado».
- **`/admin` no se puede redirigir, y es la barrera que importa.** Una regla ahí
  deja al administrador sin panel y sin forma de entrar a quitarla — la puerta
  cerrada con la llave adentro. Lo mismo la portada, que dejaría el sitio
  inaccesible desde su propio dominio. Se comprueba DOS veces: al validar y al
  resolver, porque en la base puede haber reglas escritas antes de que la
  validación existiera.
- **Temporal por DEFECTO.** Un 301 lo cachea el navegador durante meses, así que
  una redirección equivocada sigue actuando para quien ya la visitó AUNQUE se
  corrija. Lo permanente se elige a propósito y la pantalla dice qué implica.
  La temporal se sirve con `Cache-Control: no-store`, que es lo que hace que
  corregirla se note en la visita siguiente.
- **El destino sólo puede ser `http(s)` o una ruta interna.** El valor termina
  en una cabecera `Location`: aceptar cualquier esquema convertiría un campo del
  panel en un hueco por donde inyectar. `//otrositio.com` también se rechaza —
  parece interno y el navegador lo trata como externo. Mismo criterio que el
  mapa de la sede (v4.717).
- **La resolución por dominio repite el camino de `by-domain`, NO el de
  `resolveClubByHost`.** Ese atajo del módulo de SEO sólo mira `Club.domain`, y
  el dominio propio de un distrito vive en la fila de `District` (v4.744): con
  él, `rotary4281.org` no encontraría sitio y sus redirecciones no existirían,
  en silencio.
- **La coincidencia es EXACTA, sin comodines.** Un comodín es cómodo de escribir
  y difícil de razonar cuando hay varios —¿gana el más largo, el primero?—, y
  acá equivocarse significa que una página real del sitio deja de ser
  alcanzable.
- **La query de la visita viaja al destino**, igual que en `ctaTarget` (v4.657):
  `?utm_source=…` es lo que distingue de dónde vino el clic. El ancla no: el
  navegador nunca la manda al servidor, así que aceptarla en el formulario daría
  una regla que no puede funcionar.
- **Se SANEA en el servidor al guardar, no sólo en la pantalla.** El panel avisa
  mientras se escribe con el MISMO criterio (`src/lib/linkRedirects.ts`), pero
  quien decide qué se guarda es el servidor.
- **Guardar limpia la caché** (`invalidateRedirectCache`). Quien acaba de crear
  una redirección la prueba en seguida, no cuando venza el TTL.
- **Una consulta fallida devuelve `[]`, no una excepción.** Esto corre en el
  catch-all: si lanzara, se caería la página pública entera.

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
- Pruebas: `npm run test:media:thumbs` (27 casos; la generación usa sharp y se
  salta si no está).

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

### El ASPECTO de esos botones (v4.719)

`src/lib/ctaStyles.ts` es la otra mitad: `ctaTarget` decide cómo se ABREN,
`CTA_SOLID` / `CTA_SOFT` cómo se VEN. Lo usan el encabezado (`Navbar.tsx`), la
ficha pública de un evento (`EventRegistrationCta.tsx`) y la vista previa del
panel (`EventCtaManager.tsx`).

- **Se comparte la PIEL, no la geometría.** Fondo, color de letra y hover salen
  del módulo; el alto y los márgenes los pone cada sitio, porque el botón del
  encabezado se ajusta a su texto y el de la ficha ocupa el ancho de la columna.
  Meter la geometría ahí obligaría a uno de los dos a pelearse con lo que hereda.
- **Dentro de la ficha, los dos botones MIDEN lo mismo** (v4.719.1: `text-[15px]
  py-3` para los dos, 46,5 px de alto medidos en el navegador). El secundario
  venía más bajo y con letra más chica, y esa diferencia no dice nada: los dos
  llevan a un formulario de inscripción y el CADRE es el registro de un rol del
  propio evento, no un trámite menor. Lo que distingue al principal es el COLOR,
  que ya basta. Esto es geometría DE LA FICHA y por eso vive ahí, no en
  `ctaStyles.ts`.
- **El motivo es que se separaban.** Hasta v4.718 «Registro CADRE» era un
  contorno azul marino escrito a mano en la ficha, y «Postular Proyecto» una
  píldora azul claro escrita a mano en el encabezado: la misma acción —entrar a
  un formulario de inscripción— se veía de dos maneras y nada obligaba a que se
  parecieran. Al agregar un botón de esta familia, tomar la piel de aquí.
- **La vista previa del panel lee la MISMA fuente.** Pintada aparte enseñaría un
  botón que no es el que ve el visitante, que es peor que no tener vista previa.
- **Un botón apagado se pinta SIN hover** (`ctaSkin(skin, false)`). Reaccionar al
  cursor es la promesa de que algo va a pasar al pulsarlo.
- **`bg-rotary-blue` NO admite el modificador de opacidad.** Es una clase escrita
  a mano en `index.css` (`@layer utilities`), no un color del tema, así que
  Tailwind no genera `hover:bg-rotary-blue/90` —ni `/10`— y la regla **no existe**:
  el botón se queda sin ese estilo en silencio, sin error ni aviso. Se comprobó
  sobre el CSS compilado. `CTA_SOLID` usa `hover:bg-rotary-navy`, que sí genera.
  **Quedan ~21 usos de las variantes muertas por el resto del panel** (14 de
  `/90` y 7 de `/10`); no se tocaron porque cambian el aspecto de muchas
  pantallas. Al escribir una clase de estas, buscarla en
  `dist/assets/index-*.css`: es la única forma de saber si llegó.
- **El panel de inscripción de un evento es de esta MISMA familia** (v4.751,
  `RegistrationPanel.tsx`). Las cajas de la cuenta regresiva y el botón
  «Inscripciones» iban en un naranja (`#D57D2C`) escrito a mano que no salía de
  ninguna paleta del sitio y no se repetía en ningún otro lado. Ahora toman las
  pieles del módulo. Las cajas van con `ctaSkin(CTA_SOFT, false)` —**sin
  hover**— porque no se pulsan. `FAIR_THEME` en `RegistroFeria.tsx` **se
  conserva**: lo que se unifica es el tema POR DEFECTO, no toda personalización.
- **El principal y el secundario de la ficha son la PAREJA declarada** (v4.752):
  `CTA_SOLID` arriba y `CTA_SOFT` debajo. El principal también llevaba el
  naranja escrito a mano, en `EventRegistrationCta.tsx` y otra vez en su vista
  previa del panel. Se eligió la pareja y no dejar los dos en azul claro porque
  **el color es lo único que distingue cuál es el registro principal**: desde
  v4.719.1 los dos tienen el mismo alto y la misma letra a propósito.
- **El MISMO «Inscripciones» se pinta por dos caminos**, y tienen que verse
  igual: `RegistrationPanel` cuando el evento no tiene categorías configuradas y
  `EventRegistrationCta` cuando sí. Con pieles distintas, el botón cambiaría de
  color según una configuración que el visitante no conoce — que es exactamente
  el defecto que este módulo existe para no tener.
- La comprobación de «nadie las escribe a mano» busca la **CLASE**, no la
  mención: el comentario que explica de dónde se viene tiene que poder nombrar
  el valor viejo sin hacer fallar la prueba.
- Pruebas: `npm run test:cta` (32 casos). **Sin base, credenciales ni red.**
  Comprueban dos cosas que no se ven mirando una pantalla: que nadie repita las
  clases a mano y que cada clase **exista en el CSS compilado** (por eso el
  bloque final se salta si no hay `dist/`).
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

- **Un ingreso abre TODAS las identidades que coincidan** (v4.711). Hasta
  v4.710 `resolveSession` devolvía la PRIMERA y se detenía: un rotario que paga
  la postulación de su proyecto y además su asistencia al evento sólo veía uno
  de los dos paneles, porque el otro no tenía sesión emitida. Ahora se prueban
  las tres y se abren las que correspondan; la primera manda para la
  redirección y las demás viajan en `sessions` para que el navegador guarde su
  token. **`sessions` es aditivo**: el nivel superior conserva la forma de
  siempre, así que un navegador con el bundle anterior entra igual.
- **Y se DESCUBREN entre sí sin volver a entrar** (v4.712,
  `useAttendeeLink` + `POST /event-registrations/portal/link`). Abrir las dos
  identidades al ingresar no alcanza: quien ya tenía una sesión de antes
  seguiría sin ver el otro panel, y cerrar sesión para descubrirlo no es algo
  que nadie adivine. El puente pregunta por el CORREO de la sesión que ya hay
  —token verificado en el servidor— y sólo emite la del mismo correo. Es el
  simétrico de `/project-fair/portal/link` y respeta su misma regla: la sesión
  que hubiera guardada sólo se retira si es de ESE correo. Se consulta una vez
  por carga y sólo si falta.
- **El puente busca por CORREO, no por `accountId`** (v4.713). Una inscripción
  anterior a que existieran las cuentas —o una cuyo vínculo no llegara a
  escribirse— tiene `accountId` en NULL y quedaba invisible para su propio
  dueño para siempre. Al encontrarla se le ata la cuenta ahí mismo
  (`attachOrphanRegistrations`), así que se arregla sola.
- **Un borrador no cuenta como inscripción** para el puente: sólo una enviada.
- **Un panel que falla al cargar DICE por qué** (v4.712). `PortalSignIn`
  descartaba el motivo y pintaba «Ingresa a tu panel» con el texto de siempre,
  así que un 404 o un 500 se veía idéntico a «no hay sesión» y mandaba a
  escribir otra vez unas credenciales correctas. Con sesión abierta y carga
  fallida se muestra el error y NO se abre el formulario de ingreso.
- **Los paneles siguen SEPARADOS y así se quedan.** Lo que se unifica es el
  ingreso, no los datos: cada identidad conserva su audiencia, su token y sus
  permisos, y el token de uno no abre el otro. Al agregar una identidad,
  agregarla a la sonda de `resolveSession`, no fundirla con otra.
- **El rótulo del menú es «Mi Inscripción al Evento», no «Mi Inscripción».**
  En el panel del proyecto también hay una inscripción —la de la postulación—,
  y en un menú que puede ofrecer las dos a la vez el nombre tiene que decir de
  cuál se trata.
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

### La inscripción ABRE la sesión (v4.710)

- **Terminar la inscripción deja la sesión abierta.** Hasta v4.709 el envío
  creaba la cuenta, comprobaba la contraseña y devolvía el correo y la ruta del
  panel —pero NINGÚN token—, así que «Ir a mi inscripción» llevaba al formulario
  de ingreso a quien acababa de crear su contraseña dos pasos antes. El
  encabezado, mientras tanto, mostraba el avatar porque leía OTRA identidad: dos
  verdades sobre la misma persona. La emite `issueAttendeeSession`, en el
  servidor, que es quien acaba de comprobar la credencial.
- **`POST /portal/claim` es para cuando el token no está en ESTE navegador**:
  se pagó desde otro dispositivo, se cerró la pestaña, se vuelve de Stripe sobre
  una sesión que nunca se abrió. La prueba de propiedad es el `accessToken` de
  la inscripción —el mismo secreto que ya permite leerla sin sesión
  (`GET /:id?t=`), así que no amplía lo que un enlace filtrado deja ver— o el
  `stripeSessionId`. Es el mismo mecanismo que el panel del club estrenó en su
  día. **Un borrador no abre sesión**: sólo una inscripción enviada.
- **Un canje rechazado no crea nada.** La cuenta se crea al abrir la sesión, no
  al mirar la inscripción.
- **El token NO viaja en la URL.** En el camino normal va en el cuerpo de la
  respuesta del envío; el canje existe para el camino en que sólo hay URL.
- **Los dos paneles se enlazan entre sí**, y el enlace aparece SÓLO si esa otra
  sesión existe: ofrecer un panel al que no se puede entrar es peor que no
  ofrecerlo. Sale de `useSiteSessions`, la misma fuente del encabezado.

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
