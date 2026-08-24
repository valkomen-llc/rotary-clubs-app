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

## Creador de Reels IA — v4.797

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
- **Una banda VACÍA tampoco es una expansión** (v4.793, `BAND_MIN_DETAIL`). Es
  la secuela directa del anti-mosaico y la misma lección otra vez: había DOS
  mediciones sobre el área añadida y las dos daban bien. El anti-mosaico
  pregunta «¿esta banda repite la foto?» y una franja negra no se parece en
  nada al original, así que pasaba con nota perfecta; la preservación pregunta
  «¿se conservó la foto?» y el centro estaba intacto, así que también pasaba.
  Entre las dos faltaba la pregunta más simple —«¿esta banda tiene algo?»— y por
  ahí salían los clips con bordes negros arriba y abajo. Se mide la desviación
  típica de cada banda: relleno plano da **0,00**, el degradado más pobre que se
  puede llamar cielo da 4, una fotografía real 10 o más. El umbral va en **2**,
  en medio de esa brecha: pegado a 4 se descartaría un cielo despejado.
- **Se juzga junto al mosaico y ANTES que la preservación**, por el mismo motivo
  que el mosaico: con el centro intacto la conservación da nota alta y tapa el
  defecto. Son los dos modos de fallar de una expansión —repetir la foto o no
  poner nada— y ninguno se ve mirando la región central.
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

### Los tres defectos descalificantes NO son equivalentes (v4.792)

Tercer reporte, esta vez con la ficha delante: de cuatro escenas, **tres** se
descartaron por «marca o texto» y una por personas. El módulo generaba con IA,
medía, descartaba, regeneraba, descartaba otra vez y entregaba un paneo: **dos
generaciones pagadas por escena para no recibir ninguna animación**. El cliente
lo dijo con las dos mitades — «no cobran vida» y «cobra los créditos como si
fuera un video».

- **Sólo la INVENCIÓN HUMANA sustituye la escena.** v4.785 metió los tres
  defectos en la misma bolsa y con fotografías reales de una campaña de
  emergencia —pendones, cajas rotuladas, chalecos— eso alcanza a casi todo. No
  son equivalentes: una persona que no estuvo ahí es una FALSEDAD y no se
  publica; un logotipo que el motor redibuja al animar es un defecto de calidad
  sobre una parte de la imagen, y la escena sigue mostrando a las personas
  reales y lo que ocurrió. Ahí decide quien puede MIRAR el clip. Es la regla de
  v4.676, que v4.785 se llevó puesta sin notarlo.
- **Mientras queden reintentos, marca y texto se siguen regenerando.** Lo que
  cambia es el final del camino, no el criterio: agotados los intentos el clip
  animado se CONSERVA en `needs_review` con su motivo, en vez de tirarse.
- **El gasto se DICE.** Una escena que consumió sus dos generaciones y terminó
  sustituida tiene que declararlo, o el medidor de créditos parece equivocado
  cuando está contando un gasto que de verdad ocurrió.
- **El motivo del rescate lleva la medida concreta** (`people.reason`), no una
  disyuntiva: «alteró la marca o el texto» obliga a adivinar cuál de las dos.
- **Al endurecer una puerta, mirar a cuántas escenas LEGÍTIMAS alcanza.** Van
  tres versiones seguidas corrigiendo el mismo patrón: v4.787 el recuento,
  v4.790 el texto, v4.792 el destino de lo descalificado. En las tres, un
  control demasiado estricto no falló ruidosamente — entregó otra cosa y la
  presentó como resultado.

### El logotipo se juzga donde ESTÁ, y sólo si se VE (v4.802)

De las fichas del reporte: «San Simón HOTEL — 0/10 — no es visible en ninguna
de las imágenes», con el recorte mostrando baldosas. Dos errores de medición
encadenados que descalificaban y REGENERABAN por un defecto que nadie midió.

- **`brandRegions` se declara sobre la FOTO ORIGINAL y la escena se compara
  contra el lienzo ADAPTADO** (v4.664): con lienzo nuevo alrededor, las
  coordenadas crudas recortan otro lugar. Se REMAPEAN con la geometría que
  guardó `verifyExpansion` (`verification.region` + tamaño del lienzo), en el
  único punto que llama a `checkSceneFidelity`. Al añadir una medición por
  coordenadas, preguntarse sobre QUÉ imagen se declararon.
- **«No lo veo» no es «está alterado»** (`visible` en `BRAND_SYSTEM`,
  `notVisible` en el logo). La respuesta honesta del modelo —«el recorte no
  muestra ningún logotipo»— se puntuaba 0/10 → `brandAltered` → regeneración
  pagada. Un logotipo no visto queda `sin comprobar`, no decide, y las métricas
  deterministas tampoco (comparan dos recortes del mismo lugar equivocado). Lo
  no visto se DICE en el resumen — misma regla que `unknown` en el CRM: «no se
  pudo comprobar» no es un tipo de «bien», pero tampoco un tipo de «mal».

### Las reglas globales del cliente (v4.801) — REGLA EXPRESA: sin respaldo Ken Burns

El cliente entregó una especificación formal («Arquitecto Senior…») con reglas
globales y una decisión de producto que SUPERSEDE el final del camino de
v4.785/v4.792: *«Prefiero una escena marcada como fallida antes que un falso
resultado animado»*.

- **SIN respaldo Ken Burns automático.** La escena agotada por invención humana
  queda en `error`, SIN clip (`videoUrl = NULL`) y con su medida concreta en
  `statusDetail`; el proyecto la agrega con su desglose y «Reintentar» /
  la línea de tiempo permiten regenerarla. `resolveSceneWithStillMotion` tiene
  UNA sola vía —la elección expresa del modo «Fotográfico — sin IA»— y las
  pruebas cuentan las llamadas: una segunda es el respaldo reintroducido. Las
  reglas de v4.785 («cae a resolveSceneWithStillMotion») y v4.786/v4.792 sobre
  el rescate marcado quedan superadas en ese punto; el resto de aquellas
  secciones sigue vigente.
- **«Nadie desaparece» es una señal EXPLÍCITA** (`missingPerson`), corroborada
  en dos fotogramas, y descalifica como invención — también en MULTITUDES,
  donde el recuento no decide por diseño. Era el hueco del reporte: el hombre
  de gorra del fondo desaparecía y `newSubjects` sólo mira a quien APARECE; el
  recuento con 15 personas no opina. La pregunta simétrica faltaba.
- **La costura se pregunta con visión** (`seam` en `judgeExpansionPeople`): dos
  imágenes pegadas, un cambio brusco de escala o un trozo de la foto repetido
  como relleno reprueban la adaptación. Es lo que las mediciones deterministas
  no ven — el collage del reporte era un trozo de la foto AMPLIADO, y el
  detector de copia parcial sólo probaba escalas hacia abajo (corregido: la
  rejilla arranca en 0,18).
- **CINCO fotogramas de consistencia temporal**, no tres: una persona que
  desaparece a mitad del clip y vuelve cerca del final caía entre los
  muestreos. La corroboración de dos fotogramas no cambia.

### El despacho de una escena lleva RECLAMO (v4.800)

Del reporte «se queda pegado en 53 % y consume todos los créditos» — dos
defectos con la misma raíz, presentes desde el origen del módulo y
manifestándose al azar según qué vía ganara la carrera:

- **Una escena `pending` SIN `kieJobId` la despacha `advanceScene`**
  (`dispatchPendingScene`), no sólo el bloque de expansión. Hasta v4.799
  `advanceScene` la devolvía intacta («no hay tarea que sondear») y el único
  despacho post-adaptación vivía dentro del `if (expanding.length)`: si fallaba
  una vez —o la invocación moría entre adaptar y despachar—, ningún tick la
  retomaba y el Reel quedaba clavado en «Generando escenas» para siempre.
  Agotados los intentos queda `error` CON el motivo del proveedor: un error
  visible se arregla; un «pendiente» eterno sólo se puede mirar.
- **El reclamo optimista va sobre `attempts`, NO sobre `updatedAt`**: el driver
  de pg trunca los microsegundos del timestamp y la igualdad no casaría nunca.
  `attempts` es un entero exacto: dos vueltas leen el mismo valor y sólo la que
  gana el `UPDATE ... AND attempts = $n` crea la tarea.
- **TODO punto que crea una tarea de video reclama la fila**: el despacho de la
  escena pendiente, la finalización de la expansión (`AND "expansionTaskId" =
  $2` — la descarga del clip ya lo tenía con `ingestScene` y la expansión no) y
  el relanzamiento tras un fallo de tarea. Sin candado, el sondeo cada 3 s, el
  cron y el webhook creaban DOS tareas para la misma escena: dos cobros. Al
  agregar una vía que gaste créditos, preguntarse quién más puede llegar a la
  vez.
- **Un reclamo que murió a mitad se rescata con ventana** (5 min, la misma de
  `ingestScene`): una escena `expanding` sin `expansionTaskId` es una vuelta
  que reclamó y no terminó — pasada la ventana se degrada a `pending` y se
  anima la imagen que haya. Un candado sin salida de emergencia convierte un
  crash en un cuelgue eterno.

### La dirección es TEMPORAL y el lienzo también miente (v4.799)

Del reporte con los dos clips delante: la entrega seguía invirtiéndose con
v4.797 desplegado, el mismo hombre aparecía dos veces con otra ropa, y el Reel
salía con una línea negra en el borde superior — con la insignia en «Reel
listo».

- **La dirección de una acción NO se puede juzgar fotograma a fotograma.** Un
  fotograma es una imagen quieta y una entrega detenida a mitad de camino se ve
  idéntica en los dos sentidos: la pregunta `actionReversed` por fotograma se
  contestaba «false» con honestidad mientras el clip invertía la entrega. Es
  una propiedad TEMPORAL y se pregunta sobre la SECUENCIA
  (`judgeSequenceDirection`): los fotogramas en orden, en una sola composición,
  con la dirección fotografiada como dato. El juicio de secuencia descalifica
  SOLO —no es una señal binaria por fotograma que necesite corroborarse; tiene
  su salida honesta («no se distingue»)—. La vía por fotograma se conserva:
  son dos caminos al mismo `actionReversed`.
- **La imagen ADAPTADA es la referencia de TODOS los controles de escena
  (v4.664), así que lo que la expansión invente es invisible para ellos POR
  CONSTRUCCIÓN.** El duplicado del reporte venía en el lienzo (62 % nuevo): el
  clip y su referencia lo tenían los dos y todo daba verde. El único punto que
  puede verlo es la adaptación contra la FOTO ORIGINAL: `judgeExpansionPeople`
  (visión, lado a lado) pregunta si el lienzo añadido agrega personas o REPITE
  a alguien — un duplicado redibujado con otra ropa no correlaciona como copia,
  así que las mediciones deterministas no lo ven. Falla → se rehace ANTES de
  gastar créditos de video. Al agregar una medición de escena, preguntarse si
  su referencia ya trae el defecto.
- **El borde exterior de la banda se mide APARTE de la banda** (`edgeFlat`).
  Tres mediciones miraban la banda entera y una banda con paisaje real que
  muere en negro en el borde del cuadro las pasaba todas. El criterio es DOBLE
  a propósito —plano (< `BAND_MIN_DETAIL`) Y oscuro (< `EDGE_MAX_BLACK_LUMA`,
  18)—: un cielo despejado puede ser plano en 12 px, pero ningún cielo
  fotografiado es negro puro — hasta el nocturno lleva contaminación lumínica y
  grano, y el relleno da ~0 en las dos medidas. Un borde plano CLARO se deja
  pasar a sabiendas.
- **`sharp.stats()` IGNORA el `extract()` encadenado.** Devolvía la estadística
  de la imagen ENTERA, idéntica para las dos franjas — el recorte se
  MATERIALIZA a buffer antes de medir. Al medir un recorte con sharp, primero
  `toBuffer()`.
- **Un Reel con escenas conservadas en revisión NO dice «listo».**
  `foldSubstitutedScenes` pliega también las `needs_review` no sustituidas y
  las nombra: la insignia verde sobre una tarjeta que grita «REQUIERE
  REGENERACIÓN» es la contradicción que este archivo ya prohibió una vez
  (v4.787, indicador rojo bajo cabecera verde).
- El prompt negativo de personas excluye además `no clothing change` (la niña
  del clip cambió de camiseta a mitad de escena) y el de expansión,
  `duplicated person / same person twice`.

### El modo sin IA no viaja en silencio (v4.798)

Diagnóstico del reporte «las fotos no tienen motor generativo»: el Reel entero
se generó en modo «Fotográfico — sin IA» — el paneo vertical de la escena 1 y
el horizontal de la 2 son la alternancia declarada del 2.5D
(`['up','left','down'][position % 3]`), no un fallo del motor. El modo es
legítimo; lo silencioso no.

- **El modo Fotográfico se AVISA junto al botón de generar**, no sólo en la
  casilla de arriba: quien va a gastar el gesto es quien tiene que leerlo. Y la
  tarjeta del modo sin IA **no se pinta en verde** — pintada en esmeralda con
  «identidad garantizada al 100 %» se leía como la opción segura y se elegía
  sin registrar la consecuencia. El color no puede recomendar lo que el texto
  advierte.
- **`onDuplicate` estaba SIN CABLEAR.** `duplicateReel` devuelve el prefill
  desde v4.669 y `ContentStudio` montaba `<ReelLibrary />` sin el prop: el
  aviso «Ajustes copiados al creador» era falso y el creador se abría vacío.
  Ahora las pestañas del estudio son controladas, duplicar cambia a la pestaña
  del creador y `VideoCreator` acepta `prefill` y lo aplica entero — incluido
  `motionStyle`, que si es `fotografico` queda A LA VISTA por el aviso de
  arriba. Al agregar un callback entre pantallas, comprobar que ALGUIEN lo
  escuche: emitirlo compila igual sin receptor.
- **Regenerar una escena RE-ANALIZA la foto si el análisis no trae
  `interactions`.** `sanitizeAnalysis` siempre escribe el campo (aunque vacío),
  así que su ausencia identifica sin ambigüedad un análisis anterior a v4.797 —
  y con él la protección contra la acción invertida quedaba muda justo al
  regenerar, que es cuando más se la necesita. Si la visión falla se degrada al
  análisis guardado: regenerar no puede fallar por una mejora accesoria.

### El orden del usuario, la coherencia de acción y la copia parcial (v4.797)

Corrección de fondo pedida con un diagnóstico previo aprobado. Cinco piezas.

- **El orden del USUARIO es la fuente de verdad** (`lockedOrder`, default). El
  director reordenaba a propósito desde el origen del módulo —la pantalla lo
  avisaba en letra pequeña— y aun así se reportó como error: quien elige foto
  1, 2 y 3 espera verlas así. `position` siempre se persistió y TODO el
  pipeline ordena por `position ASC`; lo que cambió es quién la asigna. El
  reordenamiento de la IA es ahora `autoOrder: true`, casilla explícita apagada
  por defecto, y al director se le DICE que el orden está fijado — sin eso
  asignaría los roles narrativos a un montaje que no es el que se va a hacer.
- **La animación no puede INVERTIR una acción** (`interactions` en el análisis,
  `actionReversed` en el control). El defecto real: la fila que RECIBÍA
  mercados terminó entregándolos — mismas personas, misma composición, y una
  falsedad sobre lo que ocurrió que ninguna medida veía. El análisis captura la
  dirección (quién entrega, quién recibe, quién sostiene qué; máximo 3 y sólo
  las inequívocas — un mapa equivocado es peor que ninguno); viaja al prompt en
  positivo, va con el núcleo QUE NO SE RECORTA (junto al censo y la oclusión),
  al `negative_prompt`, y al verificador como dato («la dirección fotografiada
  es X→Y; marcá `actionReversed` sólo si se invirtió de forma inequívoca»).
  Corroborada en 2 fotogramas descalifica y sustituye: es invención, no nota.
- **La copia PARCIAL en las bandas 9:16 se detecta con CORRELACIÓN, no con
  huella** (`detectPartialCopy`). El anti-mosaico comparaba la banda contra la
  foto ENTERA: un trozo estirado, o la foto desenfocada de fondo, quedaba por
  debajo del umbral. La huella por recortes tampoco sirve —es demasiado
  sensible a la alineación y a la escala—. Se hace template matching real: la
  banda en gris reducida se desliza sobre el original a varias escalas
  independientes en X e Y, con refinamiento grueso→fino (un 4 % de error de
  escala ya decorrelaciona, medido). Copia estirada 0,90; fondo blur 0,99;
  paisaje nuevo 0,3-0,5; umbral 0,9. El caso caro es la banda LEGÍTIMA (~7 s,
  una vez por adaptación); la copia corta temprano.
- **En grupos de ≥5 personas (`BIG_GROUP_MIN`), TODO desvío de recuento pide
  dos fotogramas.** v4.787 dejó que |±2| descalificara con una lectura; con 7
  figuras entre escombros el modelo contó 9 en un fotograma y la escena entera
  se sustituyó. Con pocas personas nada se aflojó (contar 4 donde hay 2 no es
  ruido) y la foto vacía sigue absoluta.
- **Que Estándar y Emergencia comparten motor se COMPRUEBA por prueba**, no se
  afirma: ningún preset declara `engine`/`pipeline`, hay un solo constructor de
  prompt de escena, y el 2.5D tiene exactamente sus dos vías (elección expresa
  y rescate). Si aparece una tercera llamada, la prueba falla.

### Una escena SIN personas también cobra vida (v4.796)

Pedido literal: «no necesariamente tiene que tener personas; el entorno o el
contexto de la imagen debe cobrar vida», y «analizá primero la imagen y después
animala».

- **El `motionHint` estaba escrito para las PERSONAS.** Pedía qué hacen las
  manos, hacia dónde miran, con quién interactúan; el entorno aparecía como una
  nota al final —«si no hay personas, di qué se mueve»—. Una foto de escombros
  recibía, en la práctica, una instrucción genérica. Ahora el entorno se pide
  SIEMPRE, haya o no gente, y NOMBRADO sobre esa foto concreta: polvo en el haz
  de luz, humo que sube, lona que ondea, ramas, agua, reflejos.
- **La cláusula de ambiente sin personas era corta y genérica** —«fabric
  settles, dust drifts»— y un modelo la cumple con un temblor mínimo. Se nombran
  las cosas que de verdad se mueven y se exige que algo esté SIEMPRE en marcha:
  la continuidad es lo que separa un vídeo de una foto temblando (misma lección
  que v4.716).
- **Sigue sin inventar**: «only the things already visible in the photograph
  move; nothing new enters the frame». Es la contracara del censo universal de
  v4.785 — el entorno se anima, no se puebla.
- **La cámara sigue fija.** El pedido dice explícitamente «ni de un lado a otro,
  ni arriba y abajo, ni zoom»: no reintroducir ejes de cámara ni en el prompt
  del director ni en `MOTION_STYLES`.

### La cuarta puerta con la misma forma (v4.795)

Con v4.794 la escena con la marca alterada llegó ANIMADA —90 % de vida,
fidelidad humana verificada, clip conservado—: la corrección funcionó. Las otras
tres cayeron por las dos únicas señales que aún descalificaban con UNA lectura:
`newSubjects` y `occlusionBroken`.

- **Una señal explícita en UN solo fotograma es ruido de lectura.** Son
  preguntas binarias que el modelo contesta sobre la composición lado a lado
  reducida a 640 px, y en una escena de emergencia —figuras pequeñas, a
  contraluz, entre escombros— un `true` suelto es tan probable que venga de su
  duda como del clip. Se exige verlo en DOS fotogramas.
- **El argumento que lo hace seguro: la deriva de un motor generativo es
  PERSISTENTE.** Un sujeto inventado no aparece en un fotograma y desaparece en
  el siguiente, se queda. Así que la corroboración no deja pasar el defecto real
  y sí descarta la duda de una sola lectura.
- **La foto SIN personas no necesita corroboración.** Cualquier aparición en un
  solo fotograma descalifica: nadie confunde una escena vacía con una habitada,
  y es la exigencia expresa del cliente. `personCount === 0` —o todos los
  fotogramas con `peopleLeft === 0`— baja la corroboración a 1.
- **Lo visto una sola vez se DICE** (`signalNoise`), como `countNoise` y
  `text.noise`.
- **Van CUATRO puertas con la misma forma**: el recuento (v4.787), el texto
  (v4.790), los rostros (v4.794) y estas dos (v4.795). Todas eran una medida
  tomada por un modelo de visión sobre una imagen reducida, y todas entregaban
  otra cosa en silencio en vez de fallar ruidosamente. Al añadir una puerta que
  descalifique sin apelación, la pregunta obligatoria es cuál es su ruido de
  medición y cuántas escenas legítimas alcanza.

### Quién NO estaba vs cómo está DIBUJADO (v4.794)

Cuarto reporte, con la ficha delante otra vez: tres de cuatro escenas
sustituidas por «los rostros no se conservan (2/10 y 3/10)».

- **`people.verdict` junta SEIS comprobaciones y no todas significan lo mismo.**
  v4.792 lo tomó entero como «persona inventada» para decidir la sustitución.
  `newSubjects`, el recuento y la oclusión responden QUIÉN está en el cuadro —una
  persona que no estuvo ahí es una falsedad—; `faceConsistency` responde cómo
  está DIBUJADA una cara, que es calidad, del mismo orden que un logotipo
  redibujado. Y está medido igual de mal: los rostros de un grupo de trece
  personas llegan diminutos a la composición de 640 px, así que un 2/10 dice más
  de lo que el modelo pudo mirar que del clip — la misma limitación de v4.715 y
  v4.790. `invented` separa las dos preguntas y es la que decide.
- **Sin rótulos ni tarjeta de cierre en la campaña de emergencia.** Dos motivos
  independientes: el cliente los pidió fuera y pidió que la campaña se arme con
  la configuración del Reel estándar; y **hoy salen ilegibles** — componer texto
  con sharp rasteriza un SVG, eso necesita una fuente del SISTEMA, y el entorno
  de Vercel **no tiene ninguna instalada**: cada glifo sale como un cuadrito. Se
  ve en las capturas, en la tarjeta y en los rótulos. Para reactivarlos hay que
  resolver ANTES la fuente —empaquetar un `.ttf` y apuntarle `FONTCONFIG_PATH`,
  o convertir el texto a trazos—; encenderlos sin eso devuelve los cuadritos.
  `reelTextOverlay.js` y `reelSceneText.js` se conservan enteros.

### El texto tampoco descalifica por ruido (v4.790)

Segundo reporte con tres clips, ya con v4.787 desplegado: las fotos seguían
desplazándose sin cobrar vida. Eran otra vez clips 2.5D —o sea que las escenas
SÍ se despacharon y el control las descartó dos veces—. La causa es la misma
clase de defecto que el recuento de personas, en la puerta de al lado.

- **La proporción de palabras NO descalifica sola.** `compareText` compara dos
  TRANSCRIPCIONES que el modelo hace sobre la composición lado a lado, y esa
  composición se reduce a 640 px de alto: el texto llega a un tercio de su
  tamaño y recomprimido a JPEG. Es la limitación que v4.715 ya midió para los
  logotipos —«no era un error de criterio del modelo, es que no se le estaba
  enseñando el logotipo»— y que nadie trasladó al texto. Cada palabra que el
  modelo no alcanza a leer bajaba la proporción sin que el vídeo tocara nada, se
  tomaba el PEOR de tres fotogramas, y `textIllegible` descalifica sin
  apelación. En una campaña de emergencia —donde casi toda foto lleva un cartel,
  un chaleco o una placa— alcanzaba a casi todas las escenas.
- **Corroboración, con las mismas tres formas que el recuento**
  (`judgeTextFidelity`, pura y probada): por debajo del umbral en DOS
  fotogramas, o un desplome (`TEXT_KEPT_COLLAPSE`) que no se explica por una
  lectura incompleta. La marca EXPLÍCITA del modelo sigue descalificando sola:
  ahí está diciendo que no se lee, no contando mal.
- **Con muy pocas palabras el texto no decide** (`RELIABLE_TEXT_WORDS`). Sobre
  un vocabulario de tres, perder una es el 33 % y no significa nada. Mismo
  criterio que `RELIABLE_COUNT_MAX` con las multitudes, y por eso `compareText`
  publica ahora `words`: sin ese dato no hay forma de saber si la proporción se
  calculó sobre algo.
- **El desvío que no descalifica se DICE** (`text.noise`), igual que
  `countNoise`. Esconderlo es el defecto opuesto al de descartar por ruido.
- **El motivo NOMBRA la puerta y su número.** «El clip alteró la marca o el
  texto» obliga a adivinar cuál de las dos y con qué medida: es lo que faltó
  para diagnosticar este reporte sin acceso a la base.
- **El resumen va ARRIBA de las escenas, no sólo en cada tarjeta.** v4.787 puso
  el aviso en la tarjeta y la respuesta del cliente fue «no veo ninguna de las
  dos»: hay que bajar hasta ella y saber qué se busca. Al hacer visible un
  diagnóstico, ponerlo donde se mira primero.
- **Al añadir una puerta que descalifique sin apelación, preguntarse cuál es su
  ruido de medición.** Van dos: el recuento (v4.787) y el texto (v4.790), las
  dos con la misma forma —una medida sobre un modelo de visión mirando una
  imagen reducida— y las dos entregando otra cosa en silencio en vez de fallar
  ruidosamente.

**Pendientes conocidos:** el outro adjunto sigue viajando en `config.outro` y no
se concatena al montaje —con FFmpeg ya disponible, engancharlo es agregar su
clip al final de `buildEditSpec`—; los motores `runway_gen4` y `luma_ray2`
están declarados con `available:false` porque necesitan su propio adaptador (hoy
sólo existe el de KIE); y el texto en pantalla **no tiene todavía una pantalla
para editarlo a mano** — se escribe solo y se puede regenerar, pero corregir una
palabra exige regenerar el rótulo entero.

## Distribución multi-destino — v4.864 (vista previa v4.865, panel de grupos v4.876)

Una pieza sale hacia varias Páginas e Instagram del ecosistema, un destino por
vez y con el intervalo que se elija. Pestaña propia en Estudio de Contenido.

| Archivo | Qué es |
|---|---|
| `server/lib/distributionSpec.js` | El CRITERIO de la cola. **Puro**: destinos, estados, intervalos, calendario con zona horaria y ventana, límites, clasificación de errores de Meta e idempotencia |
| `server/lib/groupSpec.js` | El CRITERIO de los grupos. **Puro**: estados, transiciones, proveedores, importación (CSV/JSON/líneas), exportación, filtro y paginación |
| `server/lib/distributionGroups.js` | La I/O de los grupos y la migración desde el `Setting` |
| `src/components/admin/content-studio/GroupPicker.tsx` | El panel de grupos: buscador, casillas, listas, favoritos y paginación |
| `server/lib/ensureDistributionSchema.js` | Crea `DistributionCampaign`, `DistributionJob` y `DistributionEvent` en runtime |
| `server/lib/distributionQueue.js` | La I/O: crear, reclamar, despachar, reintentar y los controles |
| `server/controllers/distributionController.js` | La API del asistente y del historial |
| `src/lib/distributionSpec.ts` | Espejo MÍNIMO: rótulos y colores. **Sin aritmética de fechas** |
| `src/components/admin/content-studio/DistributionPanel.tsx` | El asistente, la línea de tiempo y el historial |

Pruebas: `npm run test:distribution` (167 casos) y
`npm run test:distribution:queue` (84, con la base y `fetch` sustituidos) — **ninguna
necesita base, credenciales ni red**— más `npm run test:distribution:ui` (26, en un
navegador con la API interceptada; se salta sola si falta `playwright`).

**Reglas durables:**

- **⚠️ NO HAY GRUPOS POR API, Y NO ES UN PENDIENTE.** Meta retiró la Facebook
  Groups API el **22 de abril de 2024**, de TODAS las versiones, junto con
  `publish_to_groups`, `groups_access_member_info` y la capacidad de que un
  administrador instale una app en su grupo. No hay endpoint, no hay permiso que
  solicitar y no hay App Review que pase. **La trampa a descartar**:
  `metaService.js` fija `v18.0` y el anuncio dice «en v19» — el propio anuncio
  dice *removed from all versions* y quedó confirmado en el foro de Meta que
  ocurre igual en v18 y anteriores. Bajar la versión no lo devuelve. Lo único
  que queda para un grupo es que una persona publique a mano, y las
  herramientas que «siguen publicando en grupos» lo hacen con extensiones que
  simulan pulsaciones dentro de la sesión del usuario: eso arriesga la cuenta de
  quien publica y la reputación institucional. **No implementarlo por esa vía.**
  Lo comprueba una prueba que lee los archivos y falla si reaparece la llamada
  al feed de un grupo o el permiso — un comentario que depende de que alguien lo
  lea no protege nada (la lección de `check:routes`, v4.859).
- **`viaApi` es un campo DECLARADO del destino, no una deducción del nombre.**
  Es lo único que separa un destino que la cola despacha de uno que deja
  esperando a una persona; deducirlo del tipo haría que un destino nuevo cayera
  en la rama equivocada por omisión.
- **El modo asistido se AVISA junto al botón que lo dispara**, no sólo en la
  lista. Si la pantalla dijera «distribuir a 25 grupos» y en realidad dejara 25
  tareas manuales, se leería como una función rota — la regla del modo
  Fotográfico del Creador de Reels (v4.798). Y registra **quién** publicó: sin
  ese dato el modo no aporta lo único que puede aportar, que es la trazabilidad.
- **UN DESTINO, UNA FILA.** `SocialPublication.targetAccounts` guarda el
  resultado por cuenta en un array JSON y alcanza para tres destinos publicados
  a mano; para veinticinco jobs que avanzan solos no, porque dos vueltas del
  cron que escriben la misma fila se pisan. Es el mismo motivo por el que
  `ReelScene` se separó de `ReelProject`. **Nunca volver a meterlos en un JSON
  de la campaña.**
- **EL RECLAMO VA SOBRE `attempts`, NO SOBRE `updatedAt`**: el driver de pg
  trunca los microsegundos del timestamp y la igualdad no casaría jamás
  (v4.800). Acá el precio de repetir ese error es publicar dos veces en la misma
  Página.
- **⚠️ `job.attempts` YA viene incrementado por el reclamo.** Sumarle uno al
  decidir el reintento contaba un intento de más: recortaba la cadena a DOS en
  vez de tres y hacía esperar 8 minutos donde tocaban 2. Lo destapó
  `test:distribution:queue`, no el typecheck.
- **El instante de publicación lo manda el BARRIDO, no el reloj de pared**
  (`dispatchJob(job, campaign, now)`). Es lo que hace que el freno por hora y la
  hora publicada hablen del mismo momento; en producción son el mismo valor y
  bajo prueba no, y esa divergencia daba un falso verde.
- **El intervalo NO es un `sleep`**: cada job nace con su hora calculada y el
  cron recoge los que vencieron. Así la cadencia sobrevive a que la función
  muera, a que cierren la pestaña y a un despliegue en medio. **El piso son 5
  minutos** porque el cron corre una vez por minuto: prometer «cada 30 segundos»
  sería una promesa que la infraestructura no cumple.
- **La franja horaria se evalúa en la zona del SITIO.** La función corre en UTC
  y «las 8 de la mañana» no significa lo mismo en Bogotá que en Madrid — hay
  clubes en varios países. Lo que no cabe en el día se empuja al comienzo de la
  ventana del día siguiente, no se dispara de madrugada.
- **⚠️ EL CALENDARIO LO RESUELVE EL SERVIDOR Y VIAJA RESUELTO**
  (`POST /distribution/preview`). La pantalla no rehace la aritmética de fechas:
  con dos cálculos, la línea de tiempo del asistente y las horas que de verdad
  se guardan podrían discrepar, y eso se lee como que la programación no
  funciona. Misma regla que el período de la Bóveda (v4.849), y lo comprueba una
  prueba que busca aritmética de fechas en el `.tsx`.
- **La CLASE del error decide, no el número.** Un límite pausa la campaña y la
  retoma; un permiso marca ESE destino y deja correr los demás; un token
  revocado detiene y pide reconectar; **un bloqueo por política detiene y NUNCA
  reintenta** —insistir ahí es la conducta que Meta lee como abuso, y lo que
  está en juego es la app entera, no una campaña—. El error se guarda TEXTUAL
  con su código: convertirlo en «no se pudo publicar» deja a quien corrige sin
  saber cuál de las tres cosas pasó (la regla del CRM con `metaCode`).
- **`retryable` se DECLARA al registrar el fallo, no se deduce, y ante la duda
  es FALSE.** Un error desconocido no se reintenta: un aviso que no sale se ve
  en el historial y se relanza a mano; uno que sale cinco veces ya salió. Regla
  de `NotificationDelivery` (v4.855).
- **Se reintenta SÓLO el destino que falló**, nunca la campaña: eso volvería a
  publicar en los que ya salieron. Y un destino ya publicado no se puede
  reintentar, se dice con esas palabras.
- **La idempotencia es de la BASE**: índice único sobre
  `(campaignId, targetId, contentHash)`, con `ON CONFLICT DO NOTHING`. Las tres
  columnas son `NOT NULL`, así que el índice **no es parcial** y el
  `ON CONFLICT` no repite predicado — la trampa que costó una corrección en
  v4.648. Comprobar con un `SELECT` antes no sirve: entre la lectura y la
  escritura caben dos peticiones.
- **UNA CAMPAÑA CON DESTINOS FALLIDOS NUNCA SE MARCA EXITOSA**: queda `partial`,
  con los destinos nombrados. Es exigencia expresa del pedido y el estado que
  `SocialPublication` ya traía.
- **El tope por hora ESPACIA, no descarta.** Un job que llega al límite se corre
  una hora hacia adelante; descartarlo perdería el destino en silencio. Y lo que
  acaba de salir cuenta dentro de la misma vuelta, o un barrido de 25 jobs se
  saltaría el límite entero.
- **Hay TRES vías que llaman al mismo `advance`**: el cron cada minuto (siempre),
  el sondeo del navegador (el más rápido cuando alguien mira) y el reintento
  manual. No quitar el cron: sin él una campaña se para en cuanto se cierra la
  pestaña. El sondeo del navegador **sólo existe mientras hay trabajo**.
- **Cancelar detiene NUESTRA máquina de estados, no lo ya publicado.** La
  confirmación lo dice con esas palabras: prometer que se retira de Facebook
  sería falso.
- **La cola NUNCA lanza.** Corre dentro de un cron y dentro del sondeo de una
  pantalla: toda función devuelve su resultado con el motivo escrito.
- **⚠️ EN QUÉ GRUPOS ESTÁ UNA PÁGINA NO SE PUEDE CONSULTAR** (v4.865). Se pidió
  que al elegir la fan page apareciera sola la lista de sus grupos, y no hay
  forma: la Groups API se retiró ENTERA —también la parte de lectura— y la
  referencia de `Page` ya no declara ninguna arista `groups`. No existe endpoint
  que preguntar. Lo único implementable es que declararlos cueste UN gesto:
  `parseGroupLines` interpreta lo pegado —«Nombre | enlace», el enlace solo o un
  nombre suelto—, uno por línea. Desde v4.876 viven en `DistributionGroup`, no
  en el `Setting`.
- **Lo que no se pudo interpretar se DICE, con su motivo.** Con veinte líneas
  pegadas, un descarte silencioso deja sin saber cuáles entraron — la regla de
  `skipped` en los centros de acopio. Y el enlace de una PUBLICACIÓN pegado
  donde va un grupo se rechaza nombrando el error, en vez de guardarse como un
  destino que no existe.
- **⚠️ UN GRUPO SÓLO RECIBE TRABAJO SI ESTÁ VERIFICADO** (v4.876), y la puerta
  está en el SERVIDOR —`splitByPublishability` dentro de `createCampaign`—, no
  en la pantalla: el estado se lee de la BASE, no del cuerpo de la petición.
  Confiar en lo que mande el navegador dejaría la puerta abierta a quien conozca
  el endpoint, y el pedido dice expresamente «no permitir publicar en un grupo
  no autorizado». Los destinos que quedan fuera se **NOMBRAN** con su motivo: un
  descarte silencioso deja adivinando cuáles.
- **`verificado` significa «una persona con nombre lo confirmó», no que Meta lo
  haya dicho** — y por eso se guarda `verifiedBy` y `verifiedAt`. Sin el nombre,
  la verificación no sirve para lo único que puede servir, que es rendir cuentas.
- **⚠️ NO HAY ESTADOS DE ROL** —«Administrador», «Moderador», «Sin permiso de
  publicación» como rol— y su ausencia es deliberada: **no existe API que
  devuelva el rol de nadie en un grupo**. Pintarlos sería inventar un dato y
  presentarlo como verificado, y alguien lo usaría para decidir dónde publicar.
  Lo comprueba una prueba que lee el archivo y falla si aparece la palabra.
- **IMPORTAR NO AUTORIZA.** Un archivo puede traer `status: verificado` y
  `normalizeGroup` lo baja a `sin_verificar`: la verificación es un acto sobre
  esta plataforma, no un campo de un CSV. Vale también para NUESTRO propio
  formato de exportación — lo fija una prueba de ida y vuelta.
- **⚠️ EL FILTRO Y LA PAGINACIÓN DE GRUPOS LOS RESUELVE EL SERVIDOR.** Es lo que
  hace que «elegir los de esta página» tome exactamente lo que se está viendo.
  Con el filtro implementado también en la pantalla, marcar todos elegiría
  grupos fuera de la vista — la forma más cara de equivocarse acá. Misma regla
  que el calendario (v4.864) y que el período de la Bóveda (v4.849).
- **Los grupos elegidos se guardan ENTEROS en el panel, no por id.** La columna
  derecha pagina y filtra: un grupo elegido en la página 2 tiene que sobrevivir
  a que la lista visible cambie.
- **Los grupos pasaron de `Setting` a tabla propia** (`DistributionGroup`,
  v4.876) por el mismo motivo que separó `DistributionJob` de la campaña: ahora
  cada grupo tiene ESTADO —verificación, favorito, etiquetas, última
  publicación— y un JSON no se consulta, no se indexa y se pisa cuando dos
  pantallas escriben a la vez. La migración es **perezosa** —ocurre al leer, no
  al desplegar— porque la sección de base de datos de este archivo prohíbe que
  un despliegue escriba; el `Setting` se **vacía**, no se borra, y esa fila
  vacía es la marca de que la migración ya ocurrió.
- **El `ON CONFLICT` del alta de grupos NO pisa el estado ni la verificación.**
  Reimportar un archivo tiene que poder corregir un nombre sin desverificar lo
  que alguien confirmó — y sin verificar lo que nadie confirmó.
- **Las listas de distribución son ETIQUETAS** (`tags TEXT[]` con índice GIN), no
  una tabla con su puente: una lista es «los grupos con esta etiqueta»,
  seleccionarla es un filtro y renombrarla es un `UPDATE`. El precio —una lista
  no tiene descripción ni orden propio, y una lista vacía no existe— alcanza de
  sobra para las seis que el Distrito usa.
- **⚠️ LA CONCURRENCIA ES UN TOPE POR VUELTA, NO PARALELISMO**, y por eso la
  pantalla la llama «publicaciones por vuelta de la cola». Acota cuántos
  destinos de la misma campaña salen en cada pasada; donde de verdad actúa es al
  drenar un atraso, porque el intervalo mínimo de 5 minutos hace que dos
  destinos rara vez venzan juntos. **Cambió el comportamiento de v4.864**: antes
  una vuelta sacaba TODOS los atrasados de golpe, ignorando el intervalo justo
  cuando más importa. Y no se aplica a los grupos: ahí no hay ninguna llamada
  que paralelizar, y la pantalla lo dice.
- **Un enlace que NO es de un grupo se rechaza con el motivo específico**, y el
  orden de las comprobaciones importa: con el genérico primero, pegar el enlace
  de una publicación devolvía «sin identificador ni nombre», que manda a
  corregir lo que no está mal.
- **La vista previa de la publicación a compartir NO es decorativa** (v4.865): el
  enlace de la que se elige queda cargado en el campo que se distribuye, y
  cambiar de publicación cambia las dos cosas a la vez. Decidir sobre dos líneas
  recortadas es exactamente lo que se reportó. Se comprueba en un navegador
  (`test:distribution:ui`), porque es lo que se pidió mirando la pantalla.
- **El arnés del navegador necesita un ORIGEN real.** Sobre `about:blank` —que
  es lo que deja `setContent`— una dirección relativa no tiene base contra la
  que resolverse: la petición no sale y la prueba pasaría sin ejercitar nada. Es
  la lección de v4.720 y volvió a costar una vuelta acá. Y el bloque de grupos
  nace ABIERTO cuando no hay ninguno declarado, así que la prueba lo **asegura**
  en vez de pulsarlo: pulsar a ciegas lo cerraba.
- **Las cuatro tablas viven fuera de Prisma** y están en la lista del guardián de
  `db:push`.
- **`socialPublishService.js` cubría SÓLO foto única.** v4.864 le agrega texto,
  enlace y video (Página) y video (Instagram). El camino de la foto quedó
  intacto: lo usan el Generador de Publicaciones y la Expansión de Lienzo.

**Pendientes conocidos:** el archivo se manda por URL pública
(`file_url` / `video_url`) y no por subida por partes, así que un video tiene
que estar en S3 antes de distribuirlo —lo está, porque todo el sitio sube por
`uploadMediaFiles`—; el asistente pide la URL del archivo a mano en vez de
ofrecer el `MediaPicker`, que es la regla de v4.700 y queda para la vuelta
siguiente; y **no se usa la programación nativa de Meta**
(`scheduled_publish_time`), a propósito: con ella el control de la cadencia, la
pausa y el reintento pasarían a Meta y dejaríamos de poder pararlos.

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

## El asistente de redacción de Noticias — v4.891

Reporte con captura: «cuando intento generar un artículo con IA aparece un
error». El aviso decía **«La IA dice: Intenta de nuevo en unos segundos»** — un
mensaje que no distingue una credencial ausente de un modelo retirado ni de un
presupuesto de tokens agotado. Eran cuatro defectos encadenados.

| Archivo | Qué es |
|---|---|
| `server/lib/articleSpec.js` | El CRITERIO. **Puro**: estructura del artículo, construcción del prompt, lectura de la respuesta, validación y reparación |
| `POST /api/ai/generate-article` | La orquestación: reintento con las reglas rotas y propagación del motivo |
| `server/lib/ai-router.js` | El presupuesto de salida, el razonamiento acotado y la respuesta vacía |

Pruebas: `npm run test:article` (71 casos de criterio) y
`npm run test:article:route` (35, con la base y el proveedor sustituidos por un
hook de resolución de módulos). **Ninguna necesita base, credenciales ni red.**

**Reglas durables:**

- **⚠️ LOS TOKENS DE RAZONAMIENTO SALEN DEL MISMO PRESUPUESTO QUE LA RESPUESTA**,
  y ésa era la causa raíz. Los modelos Gemini 2.5 razonan por defecto y ese gasto
  se descuenta de `maxOutputTokens`: con los 4096 por defecto y un artículo
  completo —titular, cuerpo HTML, y seis campos de SEO— el modelo agotaba el
  presupuesto pensando y devolvía texto vacío o un JSON cortado a mitad, con
  `finishReason=MAX_TOKENS`. Para redactar no hace falta cadena de razonamiento,
  así que se acota con `thinkingConfig: { thinkingBudget: 0 }`. **La señal ya
  estaba escrita en el propio archivo** —un comentario advertía que
  `responseMimeType: 'application/json'` causaba «MAX_TOKENS prematuro»— y nadie
  relacionó las dos cosas. `supportsThinking` lo aplica sólo a los modelos que
  declaran el campo: mandárselo a uno que no lo tiene lo rechaza con un 400 y el
  candidato se saltearía **en silencio**.
- **⚠️ UNA RESPUESTA VACÍA NO ES UN ÉXITO.** `callGemini` hacía
  `if (res.ok) return rawText;` y devolvía la cadena vacía como si fuera la
  respuesta del modelo: la cadena de candidatos **se cortaba en el primero** —el
  respaldo no llegaba a probarse nunca— y quien llamaba fallaba después, al leer
  un JSON que jamás existió. Ahora sólo se devuelve texto con contenido, y el
  motivo se NOMBRA (`describeEmpty`): presupuesto agotado, filtro de contenido y
  petición rechazada se corrigen en sitios distintos.
- **La respuesta puede venir partida en varias `parts`.** Quedarse con
  `parts[0].text` pierde el resto del texto en una respuesta larga, que es
  justamente el caso de un artículo.
- **⚠️ EL MOTIVO DEL PROVEEDOR SE PROPAGA TEXTUAL, CON ESTADO HTTP REAL.** El
  endpoint respondía **`status(200)`** con `{ error: 'Intenta de nuevo en unos
  segundos' }`: el navegador daba la petición por buena, el `details` con la
  causa real no se mostraba en ninguna parte, y las tres averías posibles se
  veían idénticas. Es la regla que el CRM aprendió con `metaCode` y la Bóveda con
  el error de Stripe. Un 200 con un error dentro es además una mentira HTTP.
- **La pantalla distingue sesión vencida de fallo del proveedor**
  (`mensajeDeFalloIA`): 401 se corrige volviendo a entrar, 403 pidiéndole el
  permiso a un administrador y 502 en Integraciones → Modelos IA. «No se pudo
  generar» a secas obliga a diagnosticar a ciegas (regla de `FeeRulesPanel`).
- **⚠️ UN JSON TRUNCADO NO SE TIRA ENTERO.** El rescate era
  `cleaned.match(/\{[\s\S]*\}/)`, que **exige la llave de cierre**: una
  respuesta cortada por el presupuesto no casa con NADA y un artículo casi
  completo se descartaba. `closeTruncated` descarta la clave incompleta del final
  y cierra lo que falte. **No adivina contenido**: sin un solo campo completo
  devuelve `null`, porque cerrar la llave daría un objeto vacío presentado como
  respuesta del modelo.
- **EL MODELO ESCRIBE, EL CÓDIGO DECIDE.** `validateArticle` comprueba y la ruta
  reintenta devolviéndole **la regla concreta** que rompió, con su número («el
  titular tiene 84 caracteres y el máximo es 60»). Pedirle «revisá el formato» no
  corrige nada — la regla de `templateComposer.js` y `seoAI.js`.
- **⚠️ LOS LÍMITES SALEN DE `seoSpec.LIMITS`, NO DE UN SEGUNDO CATÁLOGO.** El
  prompt pedía un titular de «máx 70 caracteres» mientras `LIMITS.title.max` es
  **60**, así que el artículo nacía ya con un hallazgo de SEO encima; y la
  pantalla recortaba por su cuenta a 60 y 160 —la meta descripción real se corta
  en 155—. Con dos catálogos, el generador cumple un límite y la auditoría aplica
  otro. El recorte vive ahora en un solo sitio, el servidor.
- **El mínimo de palabras es el RECOMENDADO de la auditoría, no su umbral de
  denuncia.** `seoRules.js` marca `content_thin` por debajo de 150 y recomienda
  300: un artículo que nace en 160 pasa el informe por un pelo y no compite por
  nada. El piso es 300, el objetivo 900 y el techo 1.400 —más no cabe en una sola
  respuesta junto al resto del JSON—. El prompt anterior pedía «mínimo 3
  párrafos», que da unas 250 palabras.
- **El cuerpo se mide con el MISMO criterio que la auditoría**
  (`stripHtml` + palabras separadas por espacios, igual que
  `seoRules.analyzeBody`). Con dos formas de contar, el generador diría 320
  palabras y el informe marcaría contenido pobre sobre el mismo texto.
- **⚠️ EL CUERPO NO LLEVA `<h1>`.** La página pública ya pinta el título del
  artículo como `<h1>` (`BlogPost.tsx`), así que un H1 dentro del cuerpo produce
  DOS en la misma página — que es exactamente lo que Google señala. Las secciones
  empiezan en `<h2>`, y meter un H1 es **error**, no aviso.
- **Las etiquetas permitidas son las que el editor visual sabe guardar.** Pedirle
  al modelo un formato que Quill descarta al primer guardado es prometer una
  estructura que no sobrevive.
- **UN AVISO NO BLOQUEA.** `errors` impide entregar y dispara el reintento;
  `warnings` se entrega y se dice. Tratarlos igual convierte cualquier
  observación en un bloqueo y se dejan de leer (regla del panel de tarifas).
- **AGOTADOS LOS INTENTOS, EL TRABAJO NO SE TIRA**: se ajusta lo ajustable por
  código —recortar sin partir palabras, derivar el slug o la descripción— y se
  entrega **con sus avisos**. Un titular dos caracteres largo es mejor que ningún
  artículo, y quien redacta lo ve y lo corrige. Mismo criterio que `composeMeta`.
- **Y LO REPARADO SE DICE, no sólo se diagnostica.** Un titular que se recorta en
  silencio se publica con puntos suspensivos y quien lo escribió se entera al
  verlo en línea. `repaired` viaja como aviso a la pantalla, no sólo en el
  diagnóstico — lo destapó la prueba del camino, no el typecheck.
- **REPARAR NO INVENTA CONTENIDO.** Si el cuerpo es corto sigue siendo corto y la
  validación lo sigue diciendo. Alargarlo para pasar el umbral sería exactamente
  lo que la regla de veracidad prohíbe.
- **Se guarda el intento con MENOS reglas rotas**, no el último por ser el
  último: un segundo intento puede salir peor que el primero.
- **El prompt dice que NO SE INVENTAN DATOS** y qué hacer con lo que falta
  —escribir sin ese dato, no completarlo—. Un hueco en silencio es una invitación
  a llenarlo, que es la lección de la Campaña de Emergencia.
- **Las reglas viven en el prompt del SISTEMA y el contexto en el del USUARIO.**
  `callGemini` trunca el prompt de usuario a 2.500 caracteres y **no** el del
  sistema: con las reglas abajo, un reintento las empujaría fuera junto con el
  contexto real.
- **El registro de modelos ya intentados vive FUERA del bucle de candidatos.**
  Estaba declarado dentro, así que nacía vacío en cada vuelta y no deduplicaba
  nada: con el modelo por defecto —que además encabeza la lista de respaldos— se
  hacían dos llamadas idénticas al proveedor, con su latencia y su costo.
- **`routeToModel` acepta un presupuesto por llamada** (`options.maxTokens`,
  aditivo). Una respuesta corta —un titular, un icono— no necesita lo mismo que
  un artículo completo, y hasta v4.890 todo salía con los 4096 por defecto.
- **El slug definitivo lo sigue resolviendo `resolvePostSlug` al guardar**
  (v4.873). Aquí sólo se le da forma para que la pantalla muestre algo coherente:
  un segundo resolutor volvería a partir la dirección en dos criterios.
- **La marca del sitio es un EXTRA, no un requisito.** `/api/ai` no lleva
  middleware de autenticación, así que `req.user` no existe: leer el nombre del
  sitio va dentro de un `try` y sin él se redacta igual.

**Pendiente conocido:** la auditoría marca `h1_missing` en todo artículo cuyo
cuerpo tenga `<h2>` y ningún `<h1>` —`seoRules.js` mira sólo el cuerpo guardado y
no ve el `<h1>` que pinta la plantilla—. Es un **falso positivo preexistente**
sobre los posts, no algo que esta versión introduzca: le ocurre igual a cualquier
artículo escrito a mano con secciones. Corregirlo es acotar esa comprobación por
`page.kind`, y cambiaría la nota de SEO de todos los sitios, así que no se tocó
aquí.

## La dirección de un artículo — v4.873

El Difusor de Publicaciones (`/admin/publicaciones`) no dejaba definir el slug,
así que un artículo se abría por su id: `/blog/1f6c8e2a-4b93-4d1e-…`. Se reportó
como «aparecen unos caracteres muy raros en el URL».

| Archivo | Qué es |
|---|---|
| `server/lib/postSlug.js` | El CRITERIO. **Puro**: palabras reservadas, choque de unicidad y dirección por sitio |
| `src/lib/postSlug.ts` | Espejo MÍNIMO: armar el slug mientras se escribe y enseñar a dónde queda |
| `resolvePostSlug` en `contentController.js` | La resolución, compartida por los cuatro caminos que escriben `Post.slug` |

Pruebas: `npm run test:post-slug` (49 casos, **sin base, credenciales ni red**;
incluye la paridad de los dos espejos y se salta ese bloque si falta `esbuild`).

**Reglas durables:**

- **EL SLUG ES DEL ARTÍCULO; EL DOMINIO LO PONE CADA SITIO.** Una publicación
  centralizada es UNA fila que se muestra en varios sitios (`targetClubIds`), así
  que su dirección es una sola y cambia con el dominio de quien la muestra:
  `rotary4281.org/blog/x` y `feria.org/blog/x` son el MISMO artículo. Por eso el
  slug no se guarda por sitio y la vista previa recorre los destinos elegidos en
  vez de suponer un dominio.
- **⚠️ `Post.slug` es ÚNICO EN TODA LA PLATAFORMA**, no por sitio como el de
  `CalendarEvent`. Dos publicaciones no pueden compartirlo aunque se muestren en
  sitios distintos: se libera con sufijo ANTES de escribir y **se avisa**. Sin
  eso el choque sale como un error del driver que no explica nada; con un cambio
  silencioso, se manda a buscar el artículo a una dirección que no es.
- **LOS CUATRO CAMINOS pasan por el mismo resolutor** —`createPost`,
  `updatePost`, `createPublication`, `updatePublication`—. Una noticia de club
  puede chocar con una publicación centralizada porque comparten la tabla. Lo
  comprueba una prueba contando las llamadas.
- **NO SE ESCRIBE UN SEGUNDO SLUGIFY.** `seoSpec.js` ya lo tenía, junto con los
  anchos con los que Google recorta el título y la descripción. Con dos
  catálogos, el panel avisaría de un límite que la auditoría no aplica. En
  `postSlug.js` vive **sólo** lo que aquél no tiene. Lo comprueba una prueba
  sobre el archivo.
- **El servidor NO confía en el slug del cliente**: lo normaliza siempre.
  Escribirlo tal como llega deja pasar una palabra reservada y choca con el
  índice único.
- **Un slug inservible no se sustituye a la callada**: se intenta con el título
  y, si tampoco, se guarda sin dirección amigable y **se dice**. El artículo se
  sigue abriendo por su id, que es como funcionaba antes — el endpoint público
  acepta `id OR slug` desde v4.420.
- **Un guardado que no toca el slug no le mueve la dirección** a un artículo que
  ya está circulando (`slug !== undefined`).
- **Al enlazar un artículo, `slug || id`.** `NewsSection.tsx` enlazaba SÓLO por
  id y era la vía por la que se veían los identificadores; `Blog.tsx` y
  `BlogPost.tsx` ya lo hacían bien. Al agregar un enlace a un artículo, mirar
  que no vuelva a quedar sólo el id.
- **Ninguna dirección pública se compone con `#`** — la aplicación dejó
  HashRouter hace decenas de versiones y quedaba una vista previa del panel de
  Noticias con `/#/blog/`, que enseñaba al administrador una dirección que no
  existe.
- **Un sitio sin dominio ni subdominio no se nombra**: se dice cuántos son, no
  se inventa un anfitrión.
- **`normalizeProjectSlug` es OTRA cosa** y por eso se renombró: corta en 80 y
  el de artículos en 75 —el ancho que declara `seoSpec.LIMITS`—. No se
  unificaron a propósito: cambiar el corte movería la dirección de proyectos ya
  publicados. Al tocar los slugs de proyecto, converger.

## El estado «En construcción» de un sitio — v4.883

Un sitio se arma entero dentro de Club Platform antes de ser público. El caso
que lo pidió es el **Programa de Intercambios**.

| Archivo | Qué es |
|---|---|
| `src/lib/siteStatus.ts` | El CRITERIO. **Puro**: los tres estados, la normalización y quién ve el sitio |
| `server/lib/siteStatus.js` | Espejo MÍNIMO: sólo lo que el SEO necesita, comparado por salidas |
| `ConstructionGate` en `src/App.tsx` | La puerta, en UN solo sitio |
| `src/pages/SiteUnderConstruction.tsx` | La pantalla pública |
| `src/components/admin/SiteStatusPicker.tsx` | El selector, compartido por seis pantallas |

Pruebas: `npm run test:site-status` (54 casos, **sin base, credenciales ni
red**; el bloque del espejo pide `esbuild`) y `npm run test:site-status:ui`
(18 en un navegador con la aplicación real; pide `playwright` y `dist/`).

**Reglas durables:**

- **⚠️ «EN CONSTRUCCIÓN» NO ES «INACTIVO CON OTRO NOMBRE».** Un sitio inactivo
  está dado de baja; uno en construcción está VIVO y se está armando. Por eso
  la sesión pasa y ve el sitio COMPLETO —no una vista previa—: el equipo carga
  contenido y mira cómo va a quedar en el sitio de verdad.
- **⚠️ TAMPOCO ES EL «BANNER DE DESARROLLO».** Ese banner es un AVISO que se
  pinta encima y **no restringe nada**; sigue existiendo y es independiente.
  Confundirlos es lo que hace creer que un sitio está protegido cuando lo único
  que tiene es un cartel. Fue exigencia expresa del pedido no reutilizarlo.
- **El valor guardado es `draft`, el que YA existía** en la base y en
  `ClubContext` (`isDraft`). Inventar `under_construction` habría dejado dos
  verdades sobre lo mismo y un sitio ya marcado `draft` se habría quedado sin
  estado reconocible. `normalizeSiteStatus` acepta los alias por si aparecen.
- **⚠️ ANTE LA DUDA, ACTIVO.** Un valor desconocido, vacío o nulo se lee como
  activo: lo contrario convertiría un dato que nadie reconoce —o una columna
  sin llenar— en un sitio caído, y en el SEO además en un sitio desindexado.
- **⚠️ LA PUERTA VA EN UN SOLO SITIO**, envolviendo a `<Routes>`. El sitio pasa
  de cien rutas: protegerlas de a una significa que la ciento uno se olvida, y
  el fallo es MUDO —esa página quedaría pública sin que nada avise—. Con la
  puerta central, una ruta nueva nace protegida sola. Lo comprueba una prueba
  contando los `<ConstructionGate>`.
- **El corte anterior vivía SÓLO en la portada** (`if (isDraft) return
  <ComingSoon/>` dentro de `SmartHome`), así que entrar directo a `/proyectos`
  se lo saltaba entero. Ese es el defecto concreto que esto corrige, y hay una
  prueba de navegador que abre una página interna por URL.
- **⚠️ SIN `/login` LA PUERTA SE CIERRA CON LA LLAVE ADENTRO.** El inicio de
  sesión y el panel se sirven pase lo que pase (`ALWAYS_PUBLIC_PREFIXES`); si
  no, un sitio en construcción no se puede desbloquear desde el navegador. Los
  prefijos se comparan por SEGMENTO: `/login` cubre `/login/recuperar` pero no
  `/loginfalso`, que sería otra página.
- **«Con sesión» son las TRES identidades**, no sólo la del panel. El pedido
  dice «usuarios autenticados y administradores», y quién sabe leerlas es
  `siteSession.ts` desde v4.693 — escribir una cuarta forma de preguntarlo las
  dejaría separarse.
- **Mientras el sitio no ha cargado NO se decide.** Dar por «en construcción»
  un sitio cuyo estado todavía no llegó lo taparía un instante en cada visita,
  y eso se ve como un parpadeo en un sitio publicado.
- **⚠️ ESTO RESTRINGE LO QUE SE PINTA, NO LO QUE SE SIRVE.** La API sigue
  respondiendo a quien la llame directamente: es una puerta de PUBLICACIÓN
  —«este sitio todavía no se anuncia»— y no un control de acceso a los datos.
  Decirlo importa: creer que protege más de lo que protege es peor que saber
  exactamente qué hace. Un control real exigiría filtrar cada endpoint público.
- **La pantalla NO monta la navegación del sitio**, y no es una omisión
  estética: el menú es un mapa de lo que hay dentro, y cada enlace sería además
  un camino de vuelta a la misma pantalla —que se lee como un sitio roto—.
- **El contacto se ofrece SÓLO si el sitio tiene a dónde escribir.** Un botón
  que no lleva a ninguna parte es peor que ninguno (v4.650), y mandar a alguien
  a un formulario de un sitio sin correo configurado es mandarlo a un buzón que
  nadie lee.
- **⚠️ UN SITIO EN CONSTRUCCIÓN NO SE INDEXA, y son TRES señales.** `robots.txt`
  pasa a `Disallow: /`, el sitemap se publica VACÍO —no un 404: `robots.txt` lo
  referencia y un 404 ahí es un error de configuración— y el `<head>` sale con
  `noindex`. Las tres hacen falta: robots pide no rastrear, `noindex` es lo que
  impide indexar una dirección enlazada desde fuera.
- **En el SEO el ESTADO manda sobre lo escrito a mano**, al revés que todo lo
  demás de `seoServe`. No son la misma clase de decisión: marcar una página
  como indexable es una preferencia; «este sitio todavía no es público» es un
  hecho sobre el sitio entero.
- **Un fallo de base NO produce `Disallow: /`.** El robots permisivo sigue
  siendo el respaldo: un error transitorio no puede sacar un sitio de los
  buscadores, que guardan ese archivo en caché durante horas.
- **El selector es UN componente compartido por seis pantallas**
  (`SiteStatusPicker`). Escribirlo a mano en cada una es el defecto que ya se
  pagó con la casilla de distritos (v4.748): agregar un estado en una y
  olvidarlo en otra dejaría sitios que no se pueden poner en construcción.
- **`Districts.tsx` queda FUERA a propósito.** Esa pantalla edita el registro
  administrativo del distrito, no el sitio que se sirve —el sitio es un `Club`
  de tipo distrito (v4.744)—, así que ofrecer ahí «En construcción» sería un
  control que no controla nada.
- **Volver a «Activo» publica en el acto**, sin migraciones ni pasos extra: el
  estado es una columna que se lee en cada visita. Es exigencia expresa del
  pedido y lo comprueba la prueba de navegador.

**Consecuencia conocida:** un sitio que YA tuviera `status = 'draft'` en la base
pasa a tener también sus páginas internas restringidas, no sólo la portada. Es
lo que el estado significa —y esa portada ya estaba tapada—, pero es un cambio
de comportamiento sobre filas existentes.

**Pendiente conocido:** `src/pages/ComingSoon.tsx` se quedó sin consumidor
—`SiteUnderConstruction` lo reemplaza— y no se borró: no estaba en el encargo.

## Lo que el panel descarga para abrirse — v4.880

Reporte con captura: «a veces la configuración se queda en blanco, no carga, o
se demora mucho en cargar el administrador o el panel de control». El spinner
de la captura es el `fallback` del `<Suspense>` de `App.tsx`, así que el
problema estaba en CARGAR EL CHUNK, no en los datos de la pantalla.

Pruebas: `npm run test:admin-weight` (20 casos; la parte de navegador pide
`playwright` y `dist/` compilado, y se salta sola si faltan).

**Reglas durables:**

- **⚠️ `AdminLayout` NO IMPORTA `SYSTEM_UPDATES`.** Era la causa principal y la
  más difícil de ver: un `import` de una línea traía `pages/SystemUpdates.tsx`
  —el historial COMPLETO de la plataforma, **1.096 kB**— para escribir «Release
  4.879.0» en la barra lateral, dos veces. Y `AdminLayout` lo monta TODA
  pantalla del panel, así que esa descarga la pagaba cada una. Lo peor no era
  el tamaño: **crecía con cada despliegue**, porque cada versión suma su
  entrada al changelog, y nada avisaba. El número sale ahora de
  `src/lib/appVersion.ts`, que **no importa nada** — si importara algo,
  volvería a arrastrarlo.
- **Las tres versiones son la misma, y lo comprueba una prueba.** Separar el
  número de su changelog es lo que quita el peso; lo que lo hace seguro es que
  `package.json`, `APP_VERSION` y `SYSTEM_UPDATES[0].version` no puedan
  discrepar en silencio — la barra diría una versión y la pantalla de novedades
  otra. Al bumpear hay que tocar los tres.
- **⚠️ LA HOJA DE ESTILOS DEL EDITOR TIENE QUE VIAJAR CON EL EDITOR.** El otro
  hallazgo, y el más sutil. `react-quill-new` son 206 kB y en Configuración se
  usa en UN campo de la pestaña «identidad», mientras que la de entrada es
  «estado»: importarlo estático lo descargaba siempre. Puesto el `lazy()`, el
  chunk SEGUÍA descargándose — porque el `import` del CSS estaba en el módulo
  ESTÁTICO (`RichTextEditor.tsx`), y la regla de `manualChunks` captura todo
  `node_modules/react-quill*`: Vite asignaba esa hoja al chunk `vendor-editor`,
  que pasaba a ser dependencia estática de la pantalla y `__vitePreload` lo
  bajaba igual. **El `lazy()` estaba puesto y no servía de nada, sin que nada
  avisara.** Se resolvió moviendo el CSS a `QuillEditor.tsx`, que es el módulo
  perezoso. Al hacer perezoso un componente de una librería con estilos,
  comprobar QUIÉN pide el chunk en el navegador — no basta con escribir
  `lazy()`.
- **`Suspense` vive DENTRO del envoltorio, no en cada pantalla que lo use.**
  Puesto afuera, la siguiente pantalla se olvidaría y el fallo sería mudo:
  React sube al `Suspense` más cercano, que en el panel es el de las rutas, y
  entonces la PANTALLA ENTERA parpadearía a un spinner mientras baja el editor.
- **El respaldo del editor conserva su ALTURA.** Un hueco vacío hace que la
  pantalla salte medio segundo después de abrirse, y eso se lee como que algo
  se rompió.
- **⚠️ UN AHORRO QUE ROMPE LA PANTALLA NO ES UN AHORRO.** La prueba comprueba
  las DOS mitades: que al abrir no se descargue, y que al ir a «Identidad» el
  editor se monte, tenga su barra de herramientas —o sea, que el CSS llegó— y
  se pueda escribir dentro. Sólo la primera mitad dejaría pasar un editor roto
  presentado como una mejora de rendimiento.
- **El peso se MIDE en un navegador, no se estima leyendo el `dist`.** Es lo
  único que distingue «este chunk es dependencia» de «este chunk se descarga»:
  el `lazy()` del editor parecía correcto en el grafo de imports y aun así se
  bajaba. El iniciador de la petición (CDP `Network.requestWillBeSent`) es lo
  que lo destapó.
- **Las tres causas de PANTALLA EN BLANCO se descartaron una por una**, y
  conviene saberlo antes de volver a buscar ahí: los hooks están en su sitio
  (`npm run check:hooks`), no hay **ningún** identificador inexistente
  (`tsc` no reporta un solo TS2304 — el `Plus` de `MissionControl.tsx` que este
  archivo daba por pendiente ya no existe), y el fallo de carga de módulos se
  resolvió en v4.791. Lo que quedaba era el peso.
- **El techo de la prueba (1.600 kB) deja margen a propósito.** Una prueba que
  salta con cada kilobyte se termina desactivando; ésta salta si alguien vuelve
  a colgarle un megabyte al panel, que es el defecto que se corrigió.

**Pendiente conocido:** `News.tsx`, `Publicaciones.tsx` y `Projects.tsx` siguen
importando el editor de forma estática. Ahí es la pieza CENTRAL de la pantalla
—se entra a escribir— así que hacerlo perezoso no ahorraría una espera, sólo la
movería; y tocarlas por simetría cambiaría tres pantallas que hoy funcionan. Si
alguna vez se hace, el envoltorio `RichTextEditor` ya está y el cambio es
sustituir el import. Y `vendor-icons` (133 kB) lo paga toda visita: es lucide ya
sacudido, y bajarlo exigiría revisar los ~60 iconos que importa `AdminLayout`.

## Slider Global / Llamados a la Acción — v4.879

El último contenedor de la portada —el «Bloque Destacado» de v4.746, donde el
Distrito 4281 tiene END POLIO NOW— dejó de ser sólo una pieza que cada sitio
carga por su cuenta. Ahora también se publica **una vez** desde Club Platform y
alcanza a los sitios que se elijan.

| Archivo | Qué es |
|---|---|
| `server/lib/spotlightSpec.js` | El CRITERIO. **Puro**: tipos, vigencia, destinos, resolución del enlace y qué slides ve un sitio |
| `src/lib/spotlightSpec.ts` | Espejo, comparado por SALIDAS |
| `server/lib/ensureSpotlightSchema.js` | Crea `SpotlightSlide` en runtime |
| `server/controllers/spotlightSlideController.js` | CRUD del operador + la lectura pública con caché |
| `src/sections/SpotlightSection.tsx` | El MISMO contenedor de siempre, ahora con carrusel cuando hay varios |
| `src/pages/admin/SpotlightSlides.tsx` | La pantalla: tabla, arrastre, vista previa |

Pruebas: `npm run test:spotlight` (93 casos, **sin base, credenciales ni red**;
el bloque de paridad de espejos pide `esbuild` y se salta solo si falta) y
`npm run test:spotlight:ui` (35 casos en un navegador de verdad, con el
componente REAL y el CSS compilado; pide `playwright` y `esbuild` y se salta
solo si faltan o si no hay `dist/`).

**Reglas durables:**

- **NO HAY UNA SEGUNDA SECCIÓN, y era el pedido literal.** `SpotlightSection`
  es el mismo componente, con las mismas clases, el mismo velo y la misma piel
  de botón: lo que cambió es DE DÓNDE sale el contenido. Un segundo contenedor
  se habría separado del primero y la portada tendría dos bloques que se ven
  casi igual y se configuran en sitios distintos. Lo comprueba una prueba
  contando los `<SpotlightSection />` de `App.tsx`.
- **⚠️ EL CONTENEDOR VA EN LAS CUATRO PORTADAS, NO SÓLO EN LA DEL SITIO DE
  CLUB** (v4.881). `SmartHome` no arma una portada, arma TRES —sitio de
  fundación (COLROTARIOS), asociación / Programa de Intercambio (LATIR, EMAR,
  RYE) y sitio de club— y `ClubPreview` es la cuarta. v4.879 montó
  `<SpotlightSection />` sólo en la última, así que un llamado global marcado
  «todos los sitios» **no llegaba** a los tres primeros tipos: el servidor lo
  resolvía y lo mandaba, y esas portadas no lo pintaban. El panel afirmaba un
  alcance de N sitios y algunos de esos N no lo mostraban — la clase de fallo
  que este archivo documenta una y otra vez: no falla ruidosamente, entrega
  otra cosa. Al agregar una rama de portada, montar el contenedor en ella.
- **La comprobación de v4.879 CODIFICABA el defecto**, y conviene no repetir el
  error de lectura: exigía que hubiera UN solo `<SpotlightSection />` en
  `App.tsx`. «No quiero crear una segunda sección» es una regla sobre el
  COMPONENTE —no hay un segundo carrusel con su propia maquetación— y no sobre
  en cuántas portadas se monta el mismo. Ahora la prueba recorre cada `<main>`
  de `App.tsx` y de `ClubPreview.tsx` y exige que TODOS lo monten; verificada a
  la inversa, quitándolo de una rama.
- **La vista previa del panel monta el MISMO componente que la portada.** Si le
  falta una sección, el administrador aprueba algo distinto de lo que se
  publica — el defecto que Plantillas IA existe para no tener.
- **CON UN SOLO SLIDE SE PINTA EXACTAMENTE COMO ANTES.** Sin flechas, sin
  puntos y sin nada que se mueva — unos controles que no controlan nada son
  peor que no tenerlos (v4.650). Es además lo que hace que desplegar esto no
  cambie ni un sitio: sin slides globales publicados, la portada de todos se ve
  igual que en v4.878.
- **UN SLIDE GLOBAL ES UNA FILA QUE CADA SITIO RESUELVE AL LEER, no una copia
  por sitio.** Es la decisión de Campañas de Contribución (v4.807) y la
  contraria a la del ecosistema del Distrito (v4.747), por el mismo motivo:
  aquellos contenidos son del club de origen y el clon le da autonomía; una
  campaña global es de la plataforma, y corregirle una cifra —o retirarla—
  tiene que reflejarse en todos los sitios al instante. Con copias, retirar una
  emergencia serían N escrituras y la que fallara seguiría publicada.
- **⚠️ EL ALCANCE POSITIVO REUTILIZA `contributionSpec.targetsSite`; NO SE
  ESCRIBE UN SEGUNDO.** Aquél ya trata `Club.district` como una LISTA («4271,
  4281», v4.748) y ya está probado, y —esto es lo que importa— con dos
  criterios un slide podría alcanzar a un sitio que la campaña que anuncia no
  alcanza: el botón llevaría a una página que ese sitio no muestra. Lo que se
  AÑADE encima es la exclusión, que las campañas no tienen: sin ella, «a todos
  menos a estos dos» obligaría a enumerar los ciento y pico que sí.
- **La exclusión gana SIEMPRE, incluso sobre un sitio elegido a mano.** Es la
  lectura natural de «excluir» y es la segura: quien la escribe está quitando a
  alguien a propósito, y que un alcance positivo la anulara convertiría el
  control en una casilla que a veces no hace nada.
- **El alcance por defecto es `all` —al revés que en campañas— Y EL SLIDE NACE
  APAGADO.** Lo primero es lo que se pidió: una campaña global se despliega
  desde un solo lugar sin configurarla sitio por sitio. Lo segundo es lo que lo
  hace seguro. **No es la lección de v4.737**: aquello era contenido escrito EN
  EL CÓDIGO, que nadie eligió y que apareció en la portada de todos los
  distritos; esto es una fila que alguien creó, tituló y encendió a propósito.
  Duplicar tampoco publica: la copia nace apagada.
- **La vigencia se DERIVA de las fechas al leer, sin cron.** Un cron que
  apagara slides vencidos añadiría una pieza que puede fallar para resolver lo
  que una comparación de fechas resuelve, y dejaría un slide publicado hasta la
  vuelta siguiente. Sin fechas, la publicación es permanente — que es lo que
  espera cualquiera que deje los dos campos en blanco.
- **⚠️ UN SLIDE VINCULADO A UNA CAMPAÑA QUE NO SE PUEDE ABRIR SE RETIRA ENTERO,
  no se pinta sin botón.** Ese slide existe PARA llevar a la campaña —«Tu
  contribución puede ayudar», sin nada que pulsar—, así que sin destino no es
  una pieza incompleta: es una pieza que miente. Un slide de enlace normal sin
  botón sí se pinta, porque ahí el botón es un extra. La distinción está
  probada en los dos sentidos.
- **La URL de una campaña la resuelve el SERVIDOR, por sitio.** Es lo que
  permite publicar «Colombia nos necesita» una vez y que en cada sitio el botón
  lleve a la página de contribución de ESE sitio con la campaña ya cargada.
  Escribirla a mano en el slide daría una dirección fija que sólo sirve en uno.
- **`publishedAt` se sella la PRIMERA vez que se enciende y no se vuelve a
  mover.** Es la mitad del desempate del orden: reescribirlo en cada guardado
  adelantaría un slide viejo por haberle corregido una coma.
- **El orden es explícito y ESTABLE**: prioridad, luego publicación más
  reciente, luego id. Si dependiera del orden en que la base devuelve las
  filas, el mismo sitio vería los slides en otro orden en cada visita — la
  regla de `pickDistrictSite` y de `pickCampaignForSite`.
- **Lo que no entra en el tope por sitio se DICE**, no se recorta en silencio:
  un recorte mudo convierte «se publicó» en una afirmación falsa. Lo mismo lo
  descartado por vigencia, por alcance o por campaña rota — es lo único que
  contesta «¿por qué mi campaña no sale en este sitio?» dos semanas después.
- **⚠️ LAS REGLAS VISUALES SON DEL SISTEMA, NO DEL ADMINISTRADOR.** El velo, los
  márgenes, el ancho de la columna de texto y la piel del botón no se
  configuran: son lo que garantiza que el título se lea sobre CUALQUIER
  fotografía que alguien suba. Quien publica elige la imagen y el texto; el
  contraste no es una decisión editorial. Lo comprueba una prueba sobre el
  archivo — un `overlayOpacity` que llegara de la configuración la hace fallar.
- **La imagen de móvil la elige `<picture>`, no un `useState` de ancho.** El
  navegador decide ANTES de descargar, así que un teléfono nunca se baja la
  panorámica de escritorio para descartarla. La única excepción es la vista
  previa del panel, que la elige a mano: `media` se evalúa contra el ancho de
  la VENTANA y no del contenedor, así que dentro del marco angosto del panel
  seguiría eligiendo la de escritorio.
- **Las diapositivas se APILAN en una celda de rejilla, no en `absolute`.** Así
  el contenedor mide lo que mide la más alta y un slide con un párrafo largo no
  se desborda sobre el pie. Todas montadas y cruzándose por opacidad, como el
  hero: montarlas y desmontarlas haría que cada cambio pidiera la imagen otra
  vez y se viera el hueco mientras carga.
- **Un slide que no manda queda fuera del recorrido con Tab** (`tabIndex={-1}`
  y `aria-hidden`). Sigue en el DOM para que el cruce de opacidad funcione,
  pero un enlace invisible que recibe el foco es de los defectos de
  accesibilidad más desconcertantes.
- **DOS frenos de la rotación, y cada uno con su forma de soltarse.** El cursor
  encima o el foco dentro pausan y se sueltan al salir. Pulsar una flecha, un
  punto o arrastrar detiene el autoplay **para el resto de la visita**, y eso
  es una excepción DELIBERADA a v4.832: aquella regla nació de un VIDEO, donde
  no hay forma de saber cuándo alguien dejó de mirarlo; acá el gesto es puntual
  y su intención es inequívoca —esa persona eligió una diapositiva—, y volver a
  moverla bajo sus ojos sería desobedecerla. Es además lo que recomienda el
  patrón de carrusel de WAI-ARIA. Con `prefers-reduced-motion` no hay autoplay
  desde el principio.
- **`aria-live` sigue al autoplay**: `off` mientras rota —anunciar cada cambio
  interrumpiría a quien está leyendo otra cosa— y `polite` cuando está
  detenido, porque entonces el cambio lo pidió esa persona.
- **El swipe se compara con el desplazamiento VERTICAL.** Sin eso, bajar por la
  página con el dedo torcido pasaría de slide.
- **⚠️ AL PROBAR EL AUTOPLAY EN UN NAVEGADOR, DEJAR ZONA NEUTRA ARRIBA.** El
  puntero arranca en (0,0) y, montado el bloque pegado al borde superior, cae
  DENTRO del carrusel: el freno por cursor se activa solo y el autoplay no
  llega a correr nunca — la prueba falla culpando al componente, que está bien.
  Costó una vuelta de diagnóstico. En la portada real este bloque va al final,
  con toda la página por encima, así que el arnés lo reproduce con un relleno.
- **La lectura pública DEGRADA SIEMPRE.** Corre en la portada de todos los
  sitios: sin respuesta, con la tabla todavía sin crear o con la base caída, la
  lista queda vacía y la portada se ve como antes de este módulo. Una portada
  no puede quedarse a medias porque falle un carrusel. Va cacheada 60 s y TODA
  escritura la invalida — quien acaba de publicar recarga y quiere verlo.
- **El slide LOCAL no se pide al servidor.** `spotlightContent` viaja con el
  club desde `by-domain` y la imagen desde `useSiteImages`: pedirlo otra vez
  sería una consulta más por visita para algo que ya está cargado. Va AL FINAL
  de los globales, porque los globales son campañas con vigencia acotada y el
  local es la pieza permanente del sitio.
- **El CONTROL LOCAL está preparado, no implementado.** `SpotlightSlide.clubId`
  existe desde el primer día: un slide propio de un sitio es una fila más, con
  su prioridad, sin migrar nada y **sin duplicar ni uno solo de los globales**.
  Hoy sólo se escriben filas con `clubId IS NULL`.
- **La vista previa monta `SpotlightSection` DE VERDAD**, reducido con
  `transform: scale`. Un previsualizador propio se separaría del componente
  real y la diferencia se vería como «la vista previa no es lo que se publicó»
  — el defecto que Plantillas IA existe para no tener.
- **El alcance del panel se PREGUNTA (`/:id/reach`), no se calcula.** Con un
  segundo criterio, la pantalla afirmaría un alcance distinto del que sirve la
  página. Y se dice que está calculado con lo GUARDADO: un número que cambiara
  al escribir sin haber guardado sería una promesa que la portada no cumple.
- **Encender un slide EXIGE que sea válido; apagarlo no.** Es la asimetría
  correcta: publicar algo roto en decenas de portadas es caro, y retirarlo
  nunca puede quedar bloqueado por una validación.
- **El tipo de slide es CLASIFICACIÓN, no aspecto**, y hay que decirlo en la
  pantalla: los siete se pintan igual. La única excepción es `contribucion`,
  que es lo que habilita el vínculo con una campaña.
- **`SpotlightSlide` vive fuera de Prisma** y está en la lista del guardián de
  `db:push`. Una tabla declarada en `schema.prisma` y todavía inexistente deja
  en 500 a todo consumidor Prisma desde el primer despliegue (regla de
  `logo_intl`, v4.699).
- **`/order` se declara ANTES que `/:id`.** Express casa por orden y una
  literal debajo de su paramétrica es inalcanzable, con un fallo mudo (v4.859).
  Lo comprueba `npm run check:routes`.

- **⚠️ EL BLOQUE PROPIO DE UN SITIO SE TRAE, NO SE COPIA A MANO** (v4.882,
  `slideFromLocalBlock` + `POST /import`). El contenido de ese bloque vive
  repartido en DOS pantallas por historia —el texto en `Setting`
  (`spotlight_section_content`, Configuración / Identidad) y la imagen dentro
  del documento de imágenes del sitio (`ContentSection` page=home
  section=images, clave `spotlight`)—, así que pasarlo al Slider Global a mano
  es la forma segura de equivocarse en una URL o de perder el icono.
- **El slide importado NACE APUNTANDO SÓLO A ESE SITIO** (`mode: 'clubs'`), no
  a todos. Reproduce EXACTAMENTE lo que ese sitio muestra hoy: importar no
  puede ser una vía de publicar en toda la red sin haberlo pedido. Ampliarlo es
  una decisión posterior que se toma mirando el alcance.
- **`replace` hace las DOS cosas o ninguna**, y ése es todo su sentido. Sin él,
  la secuencia natural —crear, encender, vaciar el bloque propio— deja al sitio
  mostrando el llamado DOS veces entre el segundo paso y el tercero, o sin nada
  entre el primero y el segundo. Y si el bloque no se puede publicar, NO se
  vacía nada: dejar una portada sin su llamado porque falló una validación
  sería cambiar un problema de administración por uno de contenido.
- **La imagen no se borra de la Biblioteca Multimedia**, sólo sale del hueco:
  sigue siendo un archivo del sitio y puede estar en uso en otra parte. Es
  reversible — el sitio puede volver a llenarlo.
- **UNA sola inserción de slides en el controlador** (`insertSlide`). Son TRES
  las vías que crean uno —el alta, el duplicado y la importación— y con un
  INSERT por vía, el día que se agregue una columna alguna se queda sin ella y
  el fallo es mudo. Lo comprueba una prueba contando.
- **La caché se comprueba POR FUNCIÓN, no contando llamadas.** El conteo
  (`>= 5`) se rompió en cuanto tres vías pasaron a compartir la inserción —que
  es lo correcto— y además no demostraba nada. Ojo al partir el archivo en
  funciones: hay que contar también las NO exportadas, o el cuerpo de un
  manejador absorbe al siguiente y se acaba comprobando la función equivocada.

**Observación con la misma forma, sin resolver:** `HomeBannerSection` —la banda
configurable de la portada, que también nace vacía— está montada en **1 de las 3**
portadas de `SmartHome`, así que un sitio de fundación o de asociación no puede
usarla aunque la llene. No se tocó en v4.881 porque nadie lo reportó y cambiaría
portadas que hoy funcionan; el arreglo es idéntico al de esta sección.
(`ActionSection` y `FoundationSection` también están en 1 de 3, pero ahí es
DELIBERADO: la portada de una fundación tiene `ServiciosSection`,
`DistritosSection` y `SubvencionesSection` en su lugar.)

**Pendientes conocidos:** el control LOCAL —que un sitio publique sus propios
slides y decida dónde va el suyo en el orden— tiene la arquitectura lista y la
pantalla no; no hay métricas de vista ni de clic por slide (las de campaña
existen en `ContributionCampaignMetric` y el patrón está a mano); y la vista
previa del panel es fiel pero **no se comprueba en un navegador** — al tocar la
maquetación del carrusel, mirarlo en pantalla: es la lección de v4.717, donde
se verificó la ficha pública y no el editor.

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

## Notificaciones de Contribuciones — v4.855 (Fase 0: la traza)

Cuando alguien aporta, el recibo sale y **hasta v4.854 no quedaba rastro de
nada**: `EmailService.sendPlatformEmail` —el camino que usa el recibo— no llama
a `logCommunication`, que sólo se invoca desde `sendEmail`, el camino del correo
de club. La respuesta a «¿le llegó la confirmación a este aportante?» vivía en
un `console.log`, efímero en Vercel. Es el mismo vacío que tenía el CRM antes de
`CrmWebhookEvent` (v4.702).

| Archivo | Qué es |
|---|---|
| `server/lib/notificationSpec.js` | El CRITERIO. **Puro**: eventos, estados de entrega, papeles del destinatario, llave de idempotencia, reintentos y el resumen de la ficha |
| `server/lib/ensureNotificationSchema.js` | Crea `NotificationDelivery` en runtime |
| `server/lib/notificationLog.js` | La I/O: reclamar, marcar, aplicar el evento del proveedor y leer |

Pruebas: `npm run test:notifications` (74 casos, **sin base, credenciales ni
red**).

**Reglas durables:**

- **La Fase 0 NO cambia lo que recibe el aportante.** Registra lo que ya se
  envía: mismo asunto, mismo remitente, mismo cuerpo. La identidad
  institucional, los perfiles y las plantillas llegan en las fases siguientes.
- **EL ENVÍO SE RECLAMA ANTES DE MANDARSE, no se anota después.** Es la
  decisión de la que cuelga la no-duplicación: `INSERT ... ON CONFLICT (key)
  DO NOTHING RETURNING *` decide quién manda. Comprobar con un `SELECT` previo
  no sirve —entre la lectura y la escritura caben dos entregas concurrentes del
  mismo webhook, porque Stripe reintenta— y el resultado serían dos correos
  diciéndole a la misma persona que recibimos su aporte. Es el mismo
  razonamiento que sostiene `Payment_provider_providerRef_key` unas líneas
  arriba en el mismo webhook.
- **La llave es `contribución + evento + destinatario`**, con el correo en
  minúsculas y sin espacios. `Ana@Club.org` y `ana@club.org` son la misma
  persona: con dos llaves distintas recibiría el aviso dos veces. Se normaliza
  en `deliveryKey` y en ningún otro sitio — construida distinto en dos lugares,
  el índice único dejaría pasar el duplicado que existe para impedir.
- **El índice único NO es parcial**, y eso es a propósito: las tres columnas de
  la llave son `NOT NULL`, así que no hay predicado que repetir en el
  `ON CONFLICT` — la trampa que costó una corrección en v4.648.
- **Si el registro falla, el recibo SE MANDA IGUAL.** Quedarse sin recibo por
  no poder anotarlo sería cambiar un problema de auditoría por uno de servicio.
  Lo mismo si la tabla todavía no existe: se degrada en silencio.
- **Nada de la bitácora puede lanzar.** Corre dentro del webhook de Stripe,
  después de acreditar el cobro: una excepción tumbaría el `200` que Stripe
  espera y provocaría el reintento de un evento ya procesado. Toda función
  devuelve `{ ok, reason }`; las lecturas degradan a `[]` / `{}`. Mismo criterio
  que `postDonation` y `bumpMetric`.
- **Se sale con una BANDERA, no con un `return`.** Un `return` dentro del bloque
  del recibo saldría de `handleSuccessfulDonationCheckout` entera y dejaría
  fuera cualquier paso que se agregue después.
- **`sent` no es `delivered`, y la diferencia es el diagnóstico.** `sent`
  significa que el proveedor lo aceptó; `delivered`, que el servidor del
  destinatario lo recibió. Cuando alguien dice que no le llegó nada, `sent` sin
  `delivered` señala el camino y no nuestro envío. Por eso el resumen cuenta
  como «le llegó» sólo `delivered` y `opened`.
- **LOS EVENTOS DEL PROVEEDOR LLEGAN DESORDENADOS.** Resend entrega por webhook
  sin garantizar orden: es normal recibir `delivered` DESPUÉS de `opened`,
  porque son dos peticiones HTTP compitiendo. Si el último pisara al anterior,
  una entrega abierta volvería a «Entregado» y se contarían mal las aperturas.
  `mergeDeliveryState` hace que el progreso sólo AVANCE.
- **Un fallo gana, salvo contra la entrega demostrada.** Un rebote después de un
  `sent` es la corrección de lo que creíamos y manda; después de un `opened` es
  una CONTRADICCIÓN —nadie abre un correo que rebotó— y ahí se conserva la
  evidencia más fuerte. Dejar ganar al fallo pintaría de rojo una entrega que el
  destinatario demostró haber leído.
- **Un estado desconocido no cambia nada.** Es dato de un tercero y no se
  inventa una traducción.
- **No se reintenta lo definitivo.** Un rebote duro o un bloqueo no mejoran por
  insistir, y en volumen es lo que arruina la reputación del dominio desde el
  que envía TODA la plataforma. `retryable` lo DECLARA quien registra el fallo,
  no se deduce: ante la duda no se reintenta — un aviso que no sale se ve en la
  ficha y se reenvía a mano; uno que sale cinco veces ya salió.
- **El motivo del proveedor se guarda TEXTUAL**, acotado a 500 caracteres pero
  nunca resumido ni traducido. Convertirlo en «no se pudo enviar» deja a quien
  corrige sin saber si el problema es el dominio, la dirección o la credencial —
  la regla que el CRM aprendió con `metaCode` / `metaDetails`.
- **«Sin registro» NO es «no le llegó».** `sinRegistro` es un tercer estado y se
  dice distinto: confundirlo con un fallo manda a buscar el problema donde no
  está. Misma regla que `unknown` en el CRM.
- **Un evento que no se puede observar se DECLARA como no disponible.** De los
  seis del pedido, hoy sólo `payment_confirmed` tiene fuente real:
  `charge.refunded` no está enrutado a donaciones y
  `payment_intent.payment_failed` no está suscrito. Cada entrada del catálogo
  lleva su `source` y su `available`, como los motores del Generador de
  Publicaciones. Ofrecerlos igual sería una casilla que no hace nada (v4.650).
- **`NotificationDelivery` vive fuera de Prisma** y sin clave foránea a
  `Donation`. Acá pesa más que de costumbre: `Donation` y `Payment` se consultan
  con `findMany` **sin `select`** en media plataforma, así que una columna
  declarada y todavía inexistente dejaría esas consultas en 500 desde el primer
  despliegue — y eso cae sobre el cobro. El vínculo va por `contributionId`
  desde esta tabla, nunca al revés.
- **`contributionId` es `Donation.id`**, que es además la referencia que el
  recibo ya le muestra al aportante.

### Fase 1 — perfiles, beneficiarios y plantillas (v4.856)

| Archivo | Qué es |
|---|---|
| `server/lib/notificationTemplate.js` | El correo: bloques, variables, escapado y render. **Puro** |
| `server/controllers/notificationProfileController.js` | CRUD del operador, resolución, vista previa y envío de prueba |
| `server/routes/notification-profiles.js` | Las rutas, todas del operador |
| `src/pages/admin/ContributionNotifications.tsx` | La pantalla del Administrador Central |

- **La Fase 1 NO manda correos de aportes**, y la pantalla lo DICE. Se
  configura, se previsualiza y se manda una PRUEBA; el recibo real sigue
  saliendo como en v4.855. Un panel que parece gobernar algo que todavía no
  gobierna es peor que uno que no existe — quien lo configure creería que ya
  está al aire.
- **EL ALCANCE DE UN PERFIL SE RESUELVE CON `targetsSite` DE
  `contributionSpec.js`**, no con un criterio propio. Ya trata `Club.district`
  como una LISTA (v4.748) y ya está probado; con dos criterios, un perfil
  podría alcanzar a un sitio que la campaña no alcanza y el correo hablaría de
  una campaña que ese sitio no muestra.
- **La resolución va de lo más específico a lo más general y DEVUELVE EL
  MOTIVO**: la campaña que lo eligió expresamente → el perfil que alcanza al
  sitio (mayor prioridad) → el perfil global → nada, y entonces sale el recibo
  de siempre. El último escalón es deliberado (criterio 19): una contribución
  no se queda sin notificación porque falte una personalización. Y el `reason`
  es lo que contesta «¿por qué este aporte salió firmado así?» dos semanas
  después.
- **Que la campaña apunte a un perfil apagado o borrado NO deja el aporte sin
  aviso**: se sigue bajando por la jerarquía.
- **El desempate es ESTABLE** (prioridad, luego `updatedAt`, luego id). Si
  dependiera del orden en que la base devuelve las filas, el mismo sitio
  firmaría distinto en dos aportes seguidos — la lección de `pickDistrictSite`.
- **La DIRECCIÓN de envío no se declara en el perfil.** Se declara el nombre
  visible y el reply-to; la dirección la resuelve el servidor con el sitio de
  origen (Fase 2). Dejarla escribir a mano permitiría firmar desde un dominio
  ajeno, que es lo que el criterio 23 del pedido prohíbe.
- **El beneficiario NO lleva cuentas bancarias**, y no es un olvido: el dinero
  entra a la cuenta Stripe de la plataforma y se liquida por la Bóveda. Datos
  de recaudo acá serían una segunda verdad sobre a dónde va el dinero, y sería
  falsa.
- **NO se manda todo por defecto** (criterio 12). Un perfil nuevo avisa al
  aportante de su pago confirmado y a nadie más. Y un evento que la plataforma
  todavía no puede observar se DESCARTA aunque venga marcado: encenderlo daría
  una casilla que no dispara nunca.
- **EL CORREO SE COMPONE CON BLOQUES, NUNCA CON HTML LIBRE.** Esto lo edita un
  administrador y se renderiza en el cliente de correo de un tercero: HTML
  arbitrario ahí es una inyección con pasos extra —un `<script>` no corre en
  Gmail, pero un `<a>` a un destino ajeno, un `<img>` que llama a un servidor de
  terceros o un `<style>` que tapa el contenido, sí—. Con bloques el HTML lo
  escribimos nosotros y del administrador sólo entra TEXTO, que se escapa.
  Misma decisión que `MASK_SHAPES` en Plantillas IA.
- **El nombre de un aportante lo escribe un desconocido en un formulario
  público**: es la entrada menos confiable del módulo y pasa por `escapeHtml`
  como todo lo demás.
- **Un color sólo puede ser un hexadecimal de seis** (`hexOrNull`): termina
  dentro de un atributo `style`.
- **La dirección de un botón se comprueba DESPUÉS de sustituir la variable**,
  que es cuando se sabe a dónde apunta de verdad. Sólo `http` y `https`; un
  botón cuya variable no se resolvió no se dibuja — uno que no lleva a ninguna
  parte es peor que ninguno (v4.650), y en un correo no se corrige después de
  enviado.
- **UNA VARIABLE SIN VALOR NO SE BORRA: se deja el marcador y se REPORTA.** Es
  lo contrario de `resolveVariables` en Plantillas IA, y a propósito — allá el
  hueco se ve en el editor antes de publicar; acá el correo ya salió.
  «Recibimos tu aporte de  » es peor que «Recibimos tu aporte de {{amount}}»:
  lo segundo se lee como un error del sistema y lo primero como que no aportó
  nada.
- **El resumen no dibuja las filas sin valor.** Un renglón «Campaña: » en
  blanco se lee como un error del sistema.
- **El correo lleva versión en TEXTO PLANO.** No es un adorno: sin ella algunos
  filtros puntúan el correo como sospechoso, y un cliente que no dibuja HTML
  mostraría una página en blanco.
- **Las plantillas se VERSIONAN; nunca se actualiza una fila.** Editar baja la
  bandera de la vigente e inserta una versión nueva — es lo que permite
  explicar un aporte de hace seis meses con la plantilla que lo generó
  (criterio 18). Mismo patrón que `ReelCopy` y `CreativeProfile`.
- **El índice único de la vigente es PARCIAL, así que NO se usa `ON CONFLICT`
  contra él**: tendría que repetir el predicado o la sentencia falla entera
  (v4.648). Se baja la bandera con un `UPDATE` y después se inserta. Y lleva
  `COALESCE` porque en Postgres NULL nunca es igual a NULL: sin él, dos
  plantillas globales —las dos con perfil y campaña en NULL— no chocarían
  jamás, que es justo donde más se repiten.
- **La plantilla se valida ANTES de escribirse.** Guardar una que no se puede
  enviar deja una versión inservible marcada como vigente, y la siguiente
  notificación sale con ella.
- **Borrar un perfil se lleva sus plantillas y NO sus entregas.** Las entregas
  son la traza de correos que de verdad salieron: borrarlas dejaría aportes sin
  poder explicar.
- **Esto es del OPERADOR de la plataforma**, comprobado en las rutas **y otra
  vez** en cada método del controlador. Se protegen por separado a propósito:
  una ruta que se reordene o se copie a otro archivo perdería la guardia sin
  que nada avise.
- **La vista previa va en un `iframe` con `sandbox=""`.** Es HTML compuesto con
  datos de una campaña y no puede tocar el panel.
- **`notificationProfileId` es COLUMNA de `ContributionCampaign`**, aditiva.
  NULL —el valor de todas las campañas existentes— significa «heredar». Es
  columna y no un campo del documento `content` porque la resolución la
  consulta por campaña.

### Fase 2 — la resolución del remitente (v4.857)

Acá el módulo empieza a gobernar el correo real.

| Archivo | Qué es |
|---|---|
| `server/lib/senderDomains.js` | Qué dominios están verificados, con caché y vencimiento |
| `server/lib/notificationSender.js` | El envío: perfil → plantilla → remitente → reclamo → correo |

- **NUNCA se intenta enviar desde un dominio SIN VERIFICAR.** Es la regla que no
  se negocia. Hasta hoy `EmailService.sendEmail` sí lo intentaba —le bastaba que
  existiera una fila en `EmailAccount`— y descubría el problema por el rechazo
  del proveedor: eso es un correo perdido por intento, y en volumen es lo que
  hunde la reputación del dominio desde el que envía TODA la plataforma.
- **La jerarquía es N1 dominio del sitio → N2 dominio central → N3 respaldo**, y
  `resolveSenderPlan` devuelve el NIVEL y el MOTIVO. «No está verificado» y «el
  perfil pide el central» se corrigen en sitios distintos: el motivo es la mitad
  del diagnóstico.
- **El criterio es PURO y recibe la lista de dominios verificados**, no la
  consulta. Consultarla por dentro lo haría imposible de probar y metería una
  llamada de red dentro del webhook de Stripe.
- **La verificación NO está en nuestra base: se CACHEA con vencimiento**
  (`NotificationDomain`, 12 h). Consultarla en cada envío sería una llamada a un
  tercero en el camino crítico de un cobro, y Stripe da de baja los endpoints
  que tardan. La caché se queda vieja y eso se asume: el riesgo está acotado por
  el TTL y por lo que pasa después —el proveedor rechaza, el fallo queda escrito
  con su motivo textual y el correo se puede reenviar—.
- **«No se pudo preguntar» NO es «no hay ninguno».** `consultarProveedor`
  devuelve `null` y no `[]`: con `[]` se borraría la caché guardada y todos los
  sitios caerían al respaldo hasta la siguiente consulta exitosa. Ante un fallo
  se usa lo último que se supo, aunque esté vencido.
- **Se usa la key de LECTURA si existe** (`RESEND_INBOUND_API_KEY`): una key de
  sólo-envío no puede listar dominios y devuelve `restricted`.
- **Con perfil aplicable, el recibo de siempre NO sale.** Dos correos por el
  mismo aporte es justo lo que este módulo existe para no producir. Se marca con
  una BANDERA y no con un `return`, que saldría de
  `handleSuccessfulDonationCheckout` entera.
- **Sin ningún perfil, sale el recibo de v4.855, idéntico.** Es el último
  escalón de la jerarquía y lo que hace que esta fase no rompa nada: todos los
  sitios están así hasta que alguien cree un perfil.
- **Un fallo del camino nuevo degrada al recibo de siempre.** El aportante no se
  queda sin confirmación porque falle la configuración.
- **`sendContributionNotifications` envuelve TODO su cuerpo en un `try`.**
  «Nunca lanza» tiene que ser una propiedad del código y no un argumento sobre
  qué puede fallar por dentro: así lo que se agregue después queda protegido
  solo. Corre dentro del webhook de Stripe y una excepción tumbaría el `200`.
- **Una notificación por destinatario, cada una con su propio reclamo.** Si el
  correo del aportante falla, el de la entidad no tiene por qué caerse con él.
- **Los dominios se consultan UNA vez por aporte**, no por destinatario: es la
  misma pregunta.
- **`resolveRecipients` DICE los papeles que no se pudieron resolver**, con su
  motivo. Un aviso marcado que no sale y no lo dice es el silencio que este
  módulo existe para no tener. «Responsable de campaña» se salta siempre y
  explica por qué: la plataforma no guarda todavía un responsable por campaña, y
  un aviso que llega al buzón equivocado es peor que uno que no llega.
- **No se le escribe dos veces a la misma dirección.** La misma persona puede
  ser dirección interna del perfil y correo del sitio.
- **El correo lleva versión en TEXTO PLANO** (`text` en `EmailService`, aditivo).
  Sin ella algunos filtros lo puntúan como sospechoso y un cliente que no dibuja
  HTML mostraría una página en blanco.
- **La PRUEBA sale por el mismo remitente que usaría un aporte real**, con el
  sitio que se elija. Una prueba que no prueba el camino que se va a usar no
  prueba nada. Y la vista previa muestra la dirección REAL, con su nivel y su
  motivo — hasta v4.856 decía «lo resuelve el servidor», que no se puede
  comprobar.
- **El monto va SIN símbolo** (`formatoDeMonto`): la plantilla dibuja el importe
  y la moneda por separado. Con el símbolo pegado saldría «$50.000 COP», y «$»
  de pesos junto a «$» de dólares es la confusión de v4.843.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `NOTIFICATION_CENTRAL_DOMAIN` | El dominio central verificado (default `clubplatform.org`) |
| `NOTIFICATION_FALLBACK_FROM` | La identidad de respaldo (default `noreply@clubplatform.org`) |
| `NOTIFICATION_DOMAIN_TTL_MIN` | Cuánto vale una comprobación de dominio (720) |
| `RESEND_INBOUND_API_KEY` | Key de LECTURA: la de sólo-envío no puede listar dominios |

### Fase 3 — la Bóveda, la campaña y el aviso interno (v4.858)

- **La ficha de un aporte muestra sus correos**, y distingue `sent` de
  `delivered`: el primero dice que el proveedor lo aceptó y el segundo que
  llegó. Es justo la distinción que hace falta cuando alguien dice que no
  recibió nada. Y una lista vacía NO es «no le llegó»: la tarjeta dice que no se
  registró nada, que es otra cosa.
- **Las notificaciones viajan CON los aportes**, en el mismo viaje: con una
  consulta por aporte serían decenas por pantalla.
- **El reenvío acota el aporte por el `clubId` del token en el `WHERE`**, no lo
  lee y comprueba después: para quien pregunta por un aporte ajeno, simplemente
  no existe. Y exige rol administrativo del sitio — reenviar no es leer, es un
  correo a un tercero — y queda registrado con quién lo pidió.
- **Reenviar al MISMO destinatario no vuelve a salir**, y es a propósito: la
  llave de idempotencia es contribución + evento + destinatario. Para volver a
  mandarlo hay que escribir otra dirección, y la pantalla lo dice.
- **Sin perfil que alcance al sitio, el reenvío responde 409 con su motivo** y
  el camino para resolverlo. Lo que falta es configuración, no una avería.
- **La campaña puede FIJAR su perfil** (`notificationProfileId`, columna
  aditiva). `null` es «heredar», que es el valor de todas las campañas
  existentes. La decisión se toma donde ya se está trabajando la campaña, no en
  una pantalla nueva: las pantallas que se olvidan son siempre las del segundo
  lugar. Al agregar la tarjeta hay que sumarla a `CARD_IDS` o se queda fuera de
  «Expandir todo».
- **EL AVISO INTERNO NO ES LA CONFIRMACIÓN AL APORTANTE**
  (`defaultInternalTemplate`). Con una sola plantilla, el aviso interno le
  agradecería a la tesorería por un aporte que no hizo. La interna informa de un
  movimiento, va sin botón y sin firma institucional, y su asunto sirve para
  reconocerla en una bandeja de trabajo. `defaultTemplateFor` decide cuál toca
  según el papel.
- **El editor carga y guarda la plantilla del destinatario ELEGIDO.** Sin
  `recipientKind` en la petición y en las dependencias, cambiar de destinatario
  cargaría siempre la del aportante y se guardaría encima de la otra.

### Fase 4 — el ciclo completo (v4.859)

Con esto el módulo queda cerrado: las cinco fases del pedido están
implementadas.

- **El webhook de Resend se AMPLÍA, no se duplica.** Resend manda todos sus
  eventos a la misma dirección: con dos endpoints habría que configurar dos, y
  una se quedaría sin configurar. Hace dos cosas independientes —dar de baja al
  contacto del CRM y actualizar la entrega— y el fallo de una no puede tumbar la
  otra; la baja va protegida porque es lo que impide seguir escribiéndole a
  quien dijo que no.
- **Una QUEJA se registra como `blocked`, no como `bounced`.** Un rebote es que
  la dirección rechazó el correo; una queja de spam es que la persona pidió no
  recibirlo. Confundirlos manda a buscar un problema de entrega donde hay una
  decisión de quien lo recibió.
- **`email.delivery_delayed` NO se traduce a ningún estado.** Un retraso no es
  un desenlace, y marcarlo como fallo mandaría a reintentar algo que todavía va
  en camino.
- **El reintento vuelve a COMPONER el correo; no se guarda el HTML.** Guardarlo
  serían decenas de KB por fila en una tabla que se lee en cada listado de la
  Bóveda, y dejaría el correo congelado con una plantilla que quizá ya se
  corrigió: si algo falló y se arregló, el reintento tiene que salir con lo
  arreglado. Las cifras se releen de la base por el mismo motivo.
- **El reintento se RECLAMA** (`allowRetry`), y el reclamo va sobre
  `retryCount`, que es un entero exacto: dos barridos simultáneos no reintentan
  el mismo envío. Sobre `updatedAt` no funcionaría — el driver de pg trunca los
  microsegundos (v4.800).
- **Si el perfil dejó de aplicar, el reintento se CIERRA con su motivo.** No se
  inventa un correo con otra identidad.
- **El barrido va cada CINCO minutos, no cada uno.** Un fallo pasajero no se
  resuelve en sesenta segundos, y la primera espera del reintento ya es de dos
  minutos. Con presupuesto de tiempo y protegido con `CRON_SECRET`.
- **UN APORTE REEMBOLSADO DEJA DE CONTAR COMO INGRESO.** `Donation.status` pasa
  a `refunded`, lo que lo saca de la Bóveda —que filtra `status = 'success'`— y
  de los totales. Es la consecuencia deliberada: hasta v4.858 un aporte devuelto
  seguía sumando para siempre, y un balance que cuenta dinero ya devuelto es
  peor que uno que baja.
- **El libro mayor y la fila de `Payment` NO se tocan.** Son el registro de lo
  que OCURRIÓ, y un reembolso es un hecho nuevo, no la corrección de uno viejo.
  Asentarlo como contrapartida es trabajo de la Bóveda y queda **pendiente**.
- **El UPDATE del reembolso es condicional** (`WHERE status = 'success'`): un
  reenvío del mismo evento de Stripe no vuelve a cambiar nada ni a notificar dos
  veces — y la llave de la bitácora lo remata.
- **Sin `donationId` en la traza del pago NO se adivina cuál aporte era.**
  Marcar el equivocado sería peor que no marcar ninguno; se anota para
  resolverlo a mano. El vínculo existe desde v4.844.
- **EL REEMBOLSO TIENE SU PROPIA PLANTILLA.** Notificarlo con «gracias por tu
  aporte» sería agradecerle a alguien por un dinero que se le devolvió. El
  EVENTO decide qué dice y el PAPEL decide el tono (`defaultTemplateFor`).
- **El texto del reembolso NO supone un motivo.** La plataforma no sabe por qué
  se reembolsó —lo decidió alguien en Stripe— y suponerlo sería inventar.
- **`failed` NO se implementa, y no es que falte trabajo.** Un pago que falla
  nunca crea una `Donation`, así que no hay contribución sobre la que notificar
  —y la llave de idempotencia es contribución + evento + destinatario— ni
  destinatario registrado: el correo del aportante viaja en la metadata de la
  SESIÓN de checkout, que un `payment_intent.payment_failed` no siempre trae.
  Se declara como «no aplica» y no como «pendiente», que haría pensar que es
  cuestión de tiempo. Stripe ya avisa a quien intentó pagar.

**Variables de entorno del módulo:**

| Variable | Para qué |
|---|---|
| `NOTIFICATION_CENTRAL_DOMAIN` | El dominio central verificado (default `clubplatform.org`) |
| `NOTIFICATION_FALLBACK_FROM` | La identidad de respaldo (default `noreply@clubplatform.org`) |
| `NOTIFICATION_DOMAIN_TTL_MIN` | Cuánto vale una comprobación de dominio (720) |
| `RESEND_API_KEY` | El envío |
| `RESEND_INBOUND_API_KEY` | Key de LECTURA: la de sólo-envío no puede listar dominios |
| `RESEND_WEBHOOK_SECRET` | Protege el webhook de estados de entrega |
| `CRON_SECRET` | Protege `/api/cron/notification-retries` |

**Pendientes conocidos del módulo:** el reembolso **no asienta una
contrapartida** en el libro mayor —hoy sólo saca el aporte de los totales—; el
evento `in_transit` está declarado y sin implementar (la fecha de liberación ya
se mide, falta decidir a quién le sirve saberlo); y **no hay freno de volumen
por sitio**: un sitio con muchísimos aportes podría copar la cola de reintentos
del barrido.

## En qué moneda se cobra un aporte — v4.834

Hasta v4.833 la moneda salía de `resolveClubCurrency` y nada más: la del SITIO.
Con un sitio colombiano eso significa que **todo el mundo pagaba en pesos** — un
rotario de Estados Unidos leyendo la página en inglés veía «$» y recibía un
cargo en COP. Estaba declarado como pendiente conocido: *«la pasarela cobra en
UNA sola moneda por club»*.

| Archivo | Qué es |
|---|---|
| `server/lib/donationCurrency.js` | El CRITERIO. **Puro**: qué moneda le toca a cada visitante y por qué |
| `src/lib/donationCurrency.ts` | Espejo en el navegador |
| `GET /api/financial/currency` | La consulta pública que hace el modal antes de pintar montos |

Pruebas: `npm run test:currency` (40 casos, **sin base, credenciales ni red**;
incluye las 112 combinaciones de la matriz comparadas entre los dos espejos). El
smoke de navegador cubre los tres casos sobre la página de Aportes real (13).

**Reglas durables:**

- **La regla es una CONJUNCIÓN**: se cobra en la moneda del sitio sólo si el
  idioma activo es el nacional **y** el visitante está en el país del sitio.
  Cualquier otra combinación cobra en dólares. **Ninguna de las dos señales
  alcanza sola**: el idioma no distingue al rotario mexicano que lee en español
  —a ése se le cobraba en pesos—, y el país no distingue al colombiano que lee
  el sitio en inglés y espera dólares.
- **El idioma se compara con `isNationalLocale` / `isNationalLang`**, los
  catálogos que ya deciden qué registro de evento se ofrece (v4.652) y qué
  logotipo se pinta (v4.699). Una tercera lista se separaría en silencio.
- **Sin geolocalización manda el idioma, y eso es a propósito.** El borde falla
  —VPN, red corporativa, un proveedor que no manda el encabezado—. Con el idioma
  nacional y sin país se conserva la moneda del sitio, que es lo que pasaba
  antes: ante la duda no se cambia lo que ya funcionaba. Al revés —dólares por
  defecto— convertiría un fallo de geolocalización en un cambio de moneda para
  el visitante mayoritario.
- **El PAÍS nunca lo manda el cliente**: sale del encabezado del borde
  (`x-vercel-ip-country` y sus equivalentes). El IDIOMA sí viene del cliente, y
  está bien: es la elección del propio visitante en el selector.
- **La moneda la decide el SERVIDOR también al cobrar.** `createDonationCheckout`
  la resuelve con el mismo criterio y sigue ignorando la del cuerpo — lo que
  cambió es que ya no es siempre la del sitio. Así la cifra que el visitante vio
  es la que se le cobra.
- **El modal PREGUNTA la moneda antes de pintar un monto**
  (`GET /financial/currency`). No puede deducirla: el país sólo lo ve el
  servidor. Ofrecer «50.000» a alguien a quien se le van a cobrar dólares es el
  defecto más caro que este cambio puede introducir.
- **Esa consulta va sin caché** (`no-store`): la respuesta depende de quién
  pregunta, y una caché intermedia le serviría a un visitante la moneda de otro.
  Y **degrada a la moneda del sitio** ante cualquier fallo: no poder aportar
  sería peor que aportar en la moneda de siempre.
- **LOS IMPORTES NO SE CONVIERTEN.** No hay tasa de cambio configurada e
  inventar una está prohibido —la misma regla que rige el `fx` de las
  inscripciones a eventos—. Lo que cambia es la moneda EN LA QUE SE PIDE, con
  los montos sugeridos propios de esa moneda (`donationPresets`), no el mismo
  número releído en otra unidad.
- **Los montos configurados por un bloque sólo valen en SU moneda**
  (`blockAmountsApply`). El club los eligió en la del sitio: ofrecer «50.000» en
  dólares invitaría a un aporte de US$ 50.000. Cuando la moneda cambia se
  reemplazan por los de la moneda, no se convierten.
- **La MEMBRESÍA se queda en la moneda del sitio**, y no es un olvido: su
  importe es un PRECIO que el club fijó —«$50.000 al año»— y cobrarlo en otra
  moneda exige convertirlo. Cobrar «50.000 dólares» sería catastrófico. Cuando
  haga falta, la vía es un importe por moneda en el bloque, no una conversión al
  vuelo. Lo comprueba una prueba sobre el archivo.
- **El motivo de la decisión viaja a la metadata de Stripe** (`currencyReason`).
  Sin ese rastro, «¿por qué este aporte entró en dólares?» no se puede contestar
  dos semanas después — el mismo vacío que el CRM tenía antes de
  `CrmWebhookEvent`.
- **Un sitio que ya cobra en dólares no decide nada**, y se contesta ANTES que
  el interruptor: apagarlo no puede cambiar el comportamiento de un sitio al que
  esta función no alcanza.
- **El interruptor es de la INSTALACIÓN, no del sitio** (`DONATION_INTL_CURRENCY`,
  `off` lo apaga). La pasarela es una sola para toda la plataforma
  (`STRIPE_SECRET_KEY`): si la cuenta no pudiera presentar dólares, el problema
  sería de todos los sitios a la vez. Es la salida sin desplegar código.
- **El visitante internacional VE por qué se le cobra en dólares.** Sin esa
  línea, quien esperaba pesos no tiene forma de saber si es un error.

**Riesgo que hay que verificar en producción:** que la cuenta de Stripe de la
plataforma pueda **presentar** cargos en USD además de en COP. Si los rechazara,
el error de Stripe se propaga textual a la pantalla y la salida inmediata es
`DONATION_INTL_CURRENCY=off`. No se puede comprobar desde el entorno de
desarrollo — hay que probar un aporte real con el sitio en inglés.

## Infografías de Campaña (Generador de Publicaciones) — v4.833 (Fase 1)

El preset **«Maneras de Contribuir»** del Generador de Publicaciones convierte
una campaña de contribución en una pieza para redes: elige la campaña, el
objetivo, el formato y el idioma, y compone la infografía con los datos que ya
están cargados. Fase 1 de tres.

| Archivo | Qué es |
|---|---|
| `server/lib/campaignPostSpec.js` | El CRITERIO. **Puro**: objetivos, audiencias, idiomas, presets de layout, cupos, indicadores publicables, validación previa y el brief |
| `src/lib/campaignPostSpec.ts` | Espejo en el navegador: avisos en vivo con el mismo criterio |
| `server/lib/campaignTemplates.js` | Las composiciones: **datos**, tres × dos formatos |
| `server/controllers/campaignPostController.js` | Alcance, copy validado y compilación del documento |
| `src/components/admin/content-studio/CampaignPostPanel.tsx` | La pantalla del preset |
| `src/lib/publicationContext.ts` | Espejo del catálogo de tipos, que estaba duplicado en el JSX |

Pruebas: `npm run test:campaign-post` (94 casos, **sin base, credenciales ni
red**). El smoke de navegador monta el Generador de Publicaciones con la API
interceptada (26 comprobaciones).

**Reglas durables:**

- **SE COMPONE, NO SE GENERA, y es la decisión de la que cuelga todo.** El
  Generador de Publicaciones regenera la FOTOGRAFÍA con un modelo de imagen;
  eso no sirve para una infografía por dos motivos independientes: la regla #1
  del sitio prohíbe postprocesar la salida de un modelo —el equipo rechazó el
  composite dos veces con las palabras «se ve overlay / montaje»—, así que no se
  puede dibujar el texto encima; y pedirle al modelo que ESCRIBA las cifras
  tampoco, porque `designCompose.js` ya dejó documentado que los modelos
  generativos no escriben texto de forma fiable y que cuando sale mal **no hay
  salida limpia**. La pieza se compone con el grafo de escena de Plantillas IA,
  que es determinista.
- **El preset vive en el Generador de Publicaciones y el MOTOR es el de
  Plantillas IA.** La vista previa es `DesignCanvas` en sólo lectura y la
  exportación es `designRender.ts`: los MISMOS. Un segundo previsualizador o un
  segundo exportador reintroducen la duplicación de maquetación que ese módulo
  existe para evitar, y la diferencia se ve como «la vista previa no es lo que
  descargué». **No agregar un segundo camino de maquetación.**
- **Un indicador sin FUENTE no llega a una pieza** (`publishableStats`). Es la
  misma exigencia que `validateStats` impone al publicar la campaña y que
  `resolveForSite` aplica a la página pública: etiqueta, valor, fuente y fecha.
  Y los descartados se DEVUELVEN con su motivo — un filtro silencioso deja al
  usuario mirando una pieza sin la cifra que esperaba y sin saber qué le falta.
  Uno **desactivado** no se reporta: es una decisión del administrador, no un
  defecto, y avisarlo llenaría la pantalla de avisos que nadie tiene que
  atender.
- **La FUENTE va pegada a su cifra, no en un pie común.** Una campaña puede
  mezclar un balance oficial con otro dato; un pie único los atribuiría a todos
  a la misma fuente, que es falso.
- **El modelo escribe el copy y el CÓDIGO lo valida**, con
  `validateEmergencyCopy` y su bucle de reintento: es la capa 3 de la Campaña de
  Emergencia y la que hace verdadera la promesa de no inventar. Se validan
  TODOS los textos, incluidos los de cada red — un titular limpio con un copy de
  Instagram inventando una cifra es el mismo defecto por la otra puerta.
  **Los valores de los indicadores entran al universo de lo suministrado**: son
  datos de la campaña con fuente registrada, así que mencionarlos no es
  inventar; sin eso, un copy que dijera la cifra que la pieza muestra al lado se
  rechazaría por «número no suministrado».
- **Agotados los reintentos el copy se ENTREGA con sus avisos, no se descarta.**
  Es editable antes de publicar y quitarlo dejaría la pieza sin ninguno — misma
  decisión que el guion de la Campaña de Emergencia (v4.783).
- **La validación va ANTES de llamar al modelo.** Producir la pieza y descubrir
  después que le falta el título es pagar por nada. Y se separa en `errors`
  —no se puede generar— y `warnings` —se puede, y hay que decirlo—: tratarlos
  igual convierte cualquier aviso en un bloqueo y se dejan de leer.
- **UBICACIÓN y FECHA DEL HECHO son campos propios de la campaña** (v4.833,
  `content.location` y `content.eventDate`, aditivos). No existían: el lugar
  vivía dentro del título o de la insignia y la fecha en ninguna parte
  —`startAt` es la vigencia de la CAMPAÑA, no cuándo ocurrió—. **No se deducen
  del texto**: adivinar una ciudad o una fecha en una pieza institucional es
  exactamente lo que la regla de veracidad prohíbe. Sin dato, el brief DICE que
  no se sabe, que es lo que impide que el modelo lo complete — un hueco en
  silencio es una invitación a llenarlo.
- **Dos formatos y ninguno más** (`FORMAT_IDS`). Un formato arbitrario obligaría
  a rehacer los layouts. El 4:5 quedó ACTIVO en `designSpec.FORMATS`: lo que
  faltaba **no era el interruptor** —los nodos son fracciones y el motor nunca
  dependió del alto— sino plantillas autorizadas para esa proporción. Una
  compuesta para 1:1 y estirada a 4:5 deja el texto flotando.
- **SEIS plantillas, no tres.** Lo que cambia entre formatos es CUÁNTO entra y
  dónde respira, y eso se declara, no se calcula.
- **Los bloques de un indicador se apilan SUMANDO sus alturas**
  (`valueH + labelH + sourceH`), no con separaciones sueltas. Con un `gap`
  propio, bastaba que la altura del valor creciera más que su separación para
  que la etiqueta le quedara encima — y pasó en TRES de las seis composiciones.
  Ojo con las unidades: `fontSize` es fracción del ANCHO y `h` lo es del ALTO;
  en 4:5 no son lo mismo.
- **Una prueba comprueba que los textos de una plantilla NO SE PISEN.** Es el
  defecto concreto de una composición mal medida y no lo ve ninguna otra
  comprobación: el código es válido, los tipos están bien y la pieza sale con
  dos frases una encima de la otra. Encontró los tres solapamientos de arriba.
  Se mide sobre los nodos de TEXTO; las formas se superponen a propósito (el
  fondo, el velo, la pastilla del botón).
- **Cada bloque de cifra y de elemento lleva `dropIfEmpty`**: una pieza con dos
  cifras en una composición de tres no deja recuadros vacíos.
- **Un objetivo declara qué EXIGE** (`needs`). Pedir «panorama» sin cifras
  publicables o «ayuda humanitaria» sin elementos es un ERROR, no un aviso: la
  pieza saldría vacía. Y si la composición pedida no puede pintar lo que hay,
  `pickLayout` cae a la que sí puede **y lo anota** en vez de entregar un hueco.
- **El alcance lo decide el SERVIDOR con el `clubId` del token.** El operador ve
  todas las campañas vivas; un administrador de sitio ve ÚNICAMENTE la que
  alcanza al suyo, resuelta con el MISMO `pickCampaignForSite` de la página
  pública. Con un segundo criterio de alcance, el generador ofrecería una
  campaña que la página del sitio no muestra y la pieza mandaría a una landing
  que no existe ahí.
- **El render sigue en el NAVEGADOR.** Componer texto en el servidor exige
  rasterizar un SVG con sharp, y Vercel **no tiene ninguna fuente instalada**:
  cada glifo sale como un cuadrito (medido en v4.794). El controlador resuelve
  DATOS; no pinta nada. **No mover el dibujo al servidor.**
- **El idioma se resuelve al GENERAR EL COPY**, no con el traductor del sitio:
  aquél trabaja sobre el DOM y una pieza exportada a canvas lleva el texto
  HORNEADO — ni el traductor ni `data-no-translate` la alcanzan. Los nombres
  propios, cifras, ciudades e instituciones se protegen en el prompt.
- **Rehacer el DISEÑO no vuelve a pedir el texto** (`copy` en el cuerpo). Es lo
  que permite probar composiciones y formatos sin gastar una llamada al modelo
  por cada una — mismo criterio que regenerar la voz sin regenerar el video en
  el Creador de Reels.
- **El catálogo de tipos ya no está duplicado** (`src/lib/publicationContext.ts`).
  La regla de v4.667 decía que vive en un solo sitio y **seguía escrito a mano**
  en `PostGenerator.tsx`, con otras etiquetas: «Storytelling» contra «Narración
  de historias». Se resuelve con un espejo comparado por SALIDAS en la prueba,
  que es el patrón de los otros seis specs del sitio y no cuesta un viaje de red.
- **El preset NO entra en `TYPE_LABELS`.** Los nueve tipos de ahí sólo cambian
  el TONO del copy; éste cambia el motor, la pantalla y los controles. Mezclarlo
  en la misma lista dejaría a la vista el selector de foto, el motor de imagen y
  el enfoque Rotary sin que signifiquen nada.
- **El QR viaja como un nodo con `dropIfEmpty`**, así que encenderlo en la Fase 2
  no obliga a rehacer las seis composiciones: hoy el hueco simplemente no se
  dibuja y el resto no se mueve.

### Fase 2 — centros, impacto y QR (v4.835)

- **La densidad de los centros la decide el FORMATO, no el gusto.** En 1:1 se
  resume por CIUDAD con su cantidad de puntos; en 4:5 entran las DIRECCIONES,
  que es lo que hace falta para ir a dejar algo. Ocho direcciones legibles no
  caben en un cuadrado, y achicar el texto para que quepan produce una pieza que
  no se puede leer en un teléfono — que es donde se mira.
- **El total de puntos se DICE aunque la pieza muestre menos.** Recortar la
  lista en silencio hace creer que ésos son todos, y quien vive en otra ciudad
  no busca. El número sale de la vista que la pieza va a dibujar: decir «3 más»
  contando ciudades cuando se muestran direcciones sería un número que no cuadra.
- **Un aliado sin logotipo no se nombra en texto.** La franja es de escudos y
  mezclarlos con nombres sueltos se lee como un error de maquetación, no como
  una lista.
- **El objetivo de centros EXIGE centros, pero sólo si se sabe cuántos hay.**
  Los centros no viajan en la campaña —viven en su propia tabla— así que
  `validateBeforeGenerate` sólo los juzga cuando se le suministra el dato:
  decidir por omisión que «no hay» bloquearía una campaña que sí los tiene.
- **El QR lleva la dirección REAL de la campaña; nunca es un adorno.** Se dibuja
  en el NAVEGADOR con `src/lib/qrcode.ts` —que ya existe y no tiene
  dependencias— porque portar el algoritmo al servidor sería una segunda copia,
  y las copias se separan en silencio. Pero llega del cliente y termina como
  `src` de un nodo de imagen, así que el servidor comprueba que sea una imagen
  embebida y nada más (`acceptableQr`): misma cautela que `normalizeMapUrl` con
  el mapa de una sede.
- **La dirección la da el SERVIDOR** (`siteUrl` en las opciones). Componerla en
  el navegador daría una distinta según desde dónde se abrió el panel, y el QR
  llevaría a otra parte. Un dominio escrito en el código sería peor todavía: la
  pantalla la comparten todos los sitios.
- **Sin dominio configurado el interruptor del QR no se enciende**, y dice por
  qué. Encenderlo y no ver nada es peor que verlo apagado con su motivo.

### Fase 3 — carrusel y publicación (v4.836)

- **El copy del carrusel se genera UNA sola vez y se reparte.** Cinco llamadas
  al modelo darían cinco voces distintas para la misma campaña, además de costar
  cinco veces más.
- **El orden de las diapositivas es el ARCO de la landing** (v4.828): contexto →
  magnitud → qué se necesita → dónde llevarlo → cómo aportar. Repetirlo no es
  casualidad: quien ve el carrusel y quien entra a la página tienen que
  encontrarse lo mismo en el mismo orden.
- **Una diapositiva sin datos se SALTEA y se dice por qué.** Una vacía en medio
  de un carrusel es peor que una menos, y sin el motivo nadie sabe qué cargarle
  a la campaña para recuperarla.
- **La pieza suelta y la diapositiva se arman con el MISMO código**
  (`buildPiece`). Dos caminos se separarían y la pieza generada a mano saldría
  distinta de su equivalente dentro de un carrusel. Lo comprueba una prueba
  contando las llamadas.
- **El carrusel se descarga en UN archivo.** Bajar las piezas una por una hace
  que el navegador bloquee todas menos la primera.
- **Publicar sube la pieza a la Biblioteca ANTES**, y no es un rodeo:
  `/social/publish` recibe una dirección, no un archivo, y la fila de `Media` es
  además el registro de lo que salió. Es el camino que el Generador de
  Publicaciones usa desde siempre — no se inventa un segundo.
- **Si no hay cuentas conectadas, el botón no se pinta** (v4.650).
- **`asset_generated` lo escribe el SERVIDOR** al componer, como los eventos que
  valen dinero: es el único que sabe que la pieza se generó de verdad. Entra al
  catálogo CERRADO de `METRIC_TYPES` — sin esa puerta el contador aceptaría
  cualquier cosa.
- **Una dependencia que falta en un `useCallback` no la ve el typecheck.**
  `conQr` no estaba en las de `componer` y el interruptor del QR no llegaba
  nunca a la petición: el código era válido y estaba bien tipado. Lo encontró el
  smoke de navegador. Al agregar un ajuste que viaja en una petición, mirar que
  esté en las dependencias del manejador que la arma.

### Director Creativo — Fase 1: la voz visual (v4.837)

Las piezas salían correctas y GENÉRICAS. El diagnóstico de las tres referencias
del Distrito («COLOMBIA TE NECESITA») ubicó la distancia en cuatro cosas
concretas, y ninguna necesitaba una capa de IA nueva: la tipografía, el borde de
la fotografía, el pie institucional y el salto tipográfico.

| Archivo | Qué es |
|---|---|
| `public/fonts/*.woff2` | Open Sans y Oswald, subconjuntos `latin` y `latin-ext`. SIL OFL 1.1, con sus licencias al lado |
| `src/lib/designFonts.ts` | El cargador: `FontFace`, `document.fonts.ready`, estado y aviso |
| `designSpec.FONTS` / `WEB_FONTS` | El CRITERIO: qué familias hay y cuáles dependen de una descarga |
| `designSpec.MASK_SHAPES` + `sweep`/`sweepLeft`/`dome` | Las formas de las referencias, en el ÚNICO sitio donde vive la geometría |
| `campaignTemplates.brandBar` | El pie curvo con los escudos de la familia Rotary |

**Reglas durables:**

- **La cautela de v4.836 contra las fuentes web era correcta y se RESUELVE, no
  se ignora.** Decía: «si la fuente no llegó, el archivo sale con otra y la
  vista previa deja de ser el archivo». El peligro ocurre si la fuente llega
  para UNA de las dos mitades. No es el caso: la vista previa (DOM) y la
  exportación (canvas) viven en el mismo documento y comparten `document.fonts`,
  así que esperando `document.fonts.ready` **antes de medir** las dos ven lo
  mismo, y si la descarga falla caen JUNTAS al respaldo. La paridad se conserva
  siempre; lo que se degrada es el parecido con la referencia, **y eso se dice
  en la pantalla**.
- **La espera va en `renderDocumentToCanvas`, no en cada pantalla.** Por ahí
  pasan todos los caminos que rasterizan —exportar, subir a la Biblioteca, la
  miniatura, el carrusel—. Puesta en las pantallas, la siguiente se olvida. Y
  `DesignCanvas` REPINTA cuando llegan: `layoutFor` mide con `measureText`, así
  que el primer render calculó los saltos de línea con la letra de respaldo.
- **NADA de `<link>` a Google Fonts.** Un recurso de terceros bloqueando el
  pintado es la causa medida de los 13,2 s de v4.659. Van empaquetadas, se
  registran desde JavaScript y **sólo cuando algo va a componer**: no hay
  `@font-face` global, así que la página pública no las descarga.
- **La cadena de una familia empaquetada TERMINA en tipografías del sistema.**
  Sin respaldo, un fallo dejaría el texto en la letra por omisión del navegador,
  que puede ser una serif — y una pieza institucional en Times es peor que en
  Arial. Y `sans` se queda PRIMERA en `FONTS`: `fontStack` cae a `FONTS[0]`.
- **Al agregar una familia, agregar su licencia a `public/fonts/`.** La OFL lo
  exige y no es una formalidad: sin ella la redistribución no está amparada.
- **LA LÍNEA BASE SE LE PREGUNTA AL DOM** (`cssBaseline` en `designRender.ts`).
  Es la corrección de fondo que destapó este cambio. Se DEDUCÍA con
  `fontBoundingBoxAscent/Descent` más el modelo de medio interlineado de CSS, y
  con Arial coincidía; con las tipografías empaquetadas dejó de coincidir
  —Chromium devuelve esas métricas ya redondeadas a entero y la maquetación de
  línea usa la fraccionaria—, y el archivo salía 1 px por debajo de la vista
  previa en la mitad de las composiciones. Un elemento `inline-block` de alto
  CERO se apoya EN la línea base por definición: su borde superior ES la que CSS
  va a usar, sin suponer qué tabla de la fuente se consultó. Deducir una métrica
  que el navegador ya sabe era el error. **Mejoró también lo que ya estaba**: la
  paridad de `designTemplates` bajó de 1,41 % a 0,61 %.
- **La fotografía se recorta con `mask`; la IMAGEN no se toca.** Los píxeles
  viajan intactos y sólo cambia por dónde se la recorta — ni filtros, ni escalas
  forzadas, ni corrección de color. El catálogo es CERRADO (`MASK_SHAPES`) y el
  orden está declarado: `mask` manda sobre `circle` y sobre `radius`. Son tres
  formas de decir lo mismo y sin un orden fijo el recorte dependería de en qué
  rama caiga cada renderizador.
- **El VELO lleva la MISMA forma que la fotografía.** Con la foto en curva y el
  velo rectangular queda un escalón justo donde se buscaba una curva.
- **LOS ESCUDOS DE LA FAMILIA ROTARY SON ARCHIVOS REALES, SIEMPRE.** Salen de lo
  que el sitio ya tiene cargado y ninguno se dibuja: el emblema es marca
  registrada, con proporciones, colores y zona de resguardo propias, y se
  reproduce desde el Brand Center. Es la misma regla por la que
  `designElements.js` no tiene ninguna rueda.
- **Los cuatro NO viven en el mismo sitio.** `footerLogo` y `endPolioLogo` son
  COLUMNAS de `Club`; Rotaract e Interact viven en `Setting`. Leer un solo lado
  deja media franja vacía sin que nada avise.
- **Llegan PACKED y cada uno lleva `dropIfEmpty`.** Un sitio con dos escudos
  cargados muestra dos, no dos y dos huecos, y no se rellena con texto.
- **La franja va ALINEADA A LA IZQUIERDA, no centrada.** Centrarla exigiría
  saber cuántos escudos hay al declarar la plantilla, y la plantilla es un dato
  que no conoce el sitio: con dos de cuatro, una fila «centrada para cuatro»
  queda visiblemente corrida. Mismo criterio que la franja de aliados.
- **La banda del pie es el AZUL OFICIAL DE ROTARY, no el de la campaña**, y
  lleva un filete dorado. La franja identifica a la INSTITUCIÓN, no a la pieza;
  y pintada con `brand: 'primary'` desaparecía sobre un fondo del mismo color,
  que es lo que pasaba en las composiciones sin fotografía. El filete no es
  adorno: garantiza la separación pase lo que pase con el color de la campaña.
  La banda se DESBORDA por los costados (`x: -0.03, w: 1.06`) o el trazo deja
  una marca vertical contra el borde de la pieza — mismo recurso que `pie_oro`.
- **`requiresVar` lo satisfacían SÓLO las imágenes, y por eso el botón de
  llamado a la acción NUNCA se dibujó** (`answersFor`). Se inventó para la placa
  blanca detrás del logotipo —una dependencia de imagen— y las Infografías de
  Campaña lo usaron para una variable de TEXTO: la pastilla se caía siempre y el
  llamado salió como texto flotando en toda pieza generada, en las diez
  plantillas y en las dos versiones publicadas. No dio ningún error: se veía
  como una pieza sosa. **Al reutilizar un mecanismo para un caso que no era el
  suyo, comprobar que lo cubra.**
- **Un texto MEZCLADO no responde por su variable.** «Cifras al {{corte}}» sin
  valor sigue teniendo contenido («Cifras al») y daría la variable por
  satisfecha, que es el error contrario y peor. Sólo responde el nodo que ES la
  variable entera. Ante la duda, no responde nadie.
- **El radio de una pastilla es fracción del LADO MENOR DEL NODO, no del
  lienzo.** Estaba escrito `pillH / 2` y daba 2 px: un rectángulo recto. No se
  notó nunca porque la pastilla no se dibujaba.
- **La banda institucional se lleva el último 9,5 % del lienzo y el contenido
  tuvo que COMPRIMIRSE.** La fecha de corte bajó a la columna derecha, debajo de
  la dirección: es la línea más pequeña del pie y la única que no se lee de
  lejos. Los números de las dos composiciones más apretadas están MEDIDOS contra
  la prueba de geometría, no puestos a ojo — encontró siete solapamientos.
- **La prueba de paridad cubre ahora las DIEZ composiciones de campaña**
  (`test:design:render`). Hasta v4.836 sólo cubría `designTemplates.js`: un
  preset con su propio catálogo de plantillas y sin comprobar que la vista
  previa sea el archivo es exactamente el hueco que ese módulo existe para no
  tener. Al agregar un catálogo de plantillas, sumarlo a esa prueba.
- **`document.fonts.check` NO demuestra que la fuente esté**: devuelve `true`
  también cuando la familia no existe, porque el respaldo «está disponible». Lo
  que sí demuestra es MEDIR: una condensada ocupa menos que Arial al mismo
  cuerpo (medido: 308 contra 377).
- **El arnés del navegador necesita un ORIGEN real** para las fuentes, igual que
  para `fetch`. Sobre `about:blank` —que es lo que deja `setContent`— una
  dirección relativa no tiene base contra la que resolverse, así que la petición
  no llega a salir y la prueba pasaría sin haber cargado ninguna tipografía. Es
  la lección de v4.720 otra vez, por la otra puerta.
- **Un espejo que no se corrige deja de servir.** `post_4_5` se activó en el
  servidor en v4.833 y NO en `src/lib/designSpec.ts`: el espejo venía diciendo
  que el formato no existe mientras el servidor generaba piezas en él, y
  `test:design` lo marcaba desde entonces.

### Director Creativo — Fase 2-3: el Design DNA (v4.838)

El pedido literal: *«que en el DNA o configuración del análisis podamos subir
las imágenes de referencia para que realice las imágenes siguiendo los patrones
principales»*. Se suben dos o más piezas que el sitio ya publicó, se extrae de
ellas un perfil y las piezas nuevas se componen siguiéndolo.

| Archivo | Qué es |
|---|---|
| `server/lib/creativeDNA.js` | El CRITERIO. **Puro**: catálogos cerrados, consolidación, traducción a ajustes, aplicación a la plantilla y los cuatro indicadores |
| `server/lib/creativeAnalysis.js` | La orquestación: sharp cuenta píxeles, el modelo de visión describe estructura |
| `server/lib/ensureCreativeSchema.js` | `CreativeProfile` y `CreativeReference` en runtime |
| `server/controllers/creativeProfileController.js` | Alcance, versionado y `resolveProfileFor` |
| `src/components/admin/content-studio/CreativeProfileDialog.tsx` | Subir las piezas y ver el DNA extraído |

Pruebas: `npm run test:creative` (88 casos, **sin base, credenciales ni red**;
la parte de medición usa sharp y se salta si no está).

**Reglas durables:**

- **EL CÓDIGO MIDE, EL MODELO DESCRIBE, Y ES LA DECISIÓN DE LA QUE CUELGA TODO.**
  La forma ingenua es mandarle las referencias a un modelo y pedirle el
  hexadecimal, los márgenes y las proporciones. Un modelo CONTESTA eso y se lo
  inventa: no puede leer un color con precisión de un JPEG recomprimido ni medir
  un margen en píxeles. Por eso el DNA tiene tres partes —`measured` (sharp),
  `described` (visión, sólo estructura) y `derived` (traducción por tablas
  CERRADAS)— y sólo la tercera la consume el compositor. Misma regla que
  `emergencyFeed.js`, `templateComposer.js` y `seoAI.js`.
- **CONSOLIDAR ES ARITMÉTICA, no una segunda pregunta al modelo.** Pedirle «las
  características comunes de estas tres piezas» daría un resultado
  irreproducible —dos análisis de las mismas piezas darían perfiles distintos— y
  no auditable. Lo categórico se decide por MODA y lo numérico por MEDIANA, no
  por media: una referencia atípica no puede arrastrar el perfil.
- **Las paletas se juntan por CERCANÍA, no por igualdad.** Dos piezas de la
  misma campaña usan «el mismo azul» y el JPEG lo devuelve con dos o tres
  unidades de diferencia; sin agrupar, la paleta sale con seis azules casi
  iguales y ningún acento. El tono del grupo es el de MAYOR cobertura: el
  promedio de dos azules da un azul que no está en ninguna pieza.
- **UN ACENTO SE DISTINGUE DEL FONDO; ESO NO ES CONTRASTAR.** Medido sobre las
  referencias del Distrito: el rojo `#C8102E` sobre el azul marino `#0C2A5E` da
  un contraste WCAG de **2,37** —por debajo del 3 que el estándar pide hasta
  para texto grande— y el botón rojo se ve perfectamente, porque lo que los
  separa es el TONO. Exigir contraste dejaba fuera el acento real y elegía el
  dorado, que ahí es un filete. Se decide por distancia RGB **y** saturación.
- **Y `accent: null` es una respuesta legítima.** Con una referencia compuesta
  en un solo color, el criterio por contraste elegía un tinte desvaído del
  propio fondo —un malva sobre bordó, saturación 0,20— y las cifras y el botón
  salían casi invisibles. Cuando ninguno califica, manda el de la campaña.
- **EL DERIVADO NO DIBUJA: MODULA.** `applyProfile` devuelve OTRA PLANTILLA
  —datos— que compila el mismo `compileTemplate`. No hay una segunda vía de
  maquetación: eso reintroduciría la duplicación que Plantillas IA existe para
  evitar. La superficie está ACOTADA y todo en ella es seguro por construcción:
  la paleta (un color no mueve nada), las dos familias (`autoFit` vuelve a
  medir), la escala del titular (`autoFit` la acota al recuadro, así que no
  puede desbordar), la máscara de la foto y la forma del pie. **Lo que NO puede
  tocar es dónde está cada recuadro** — mover cajas desde un perfil deducido de
  una fotografía es exactamente cómo se llega a dos textos encimados sin verlo
  venir. Lo comprueba una prueba sobre las diez composiciones.
- **TITULAR y CUERPO no se distinguen por `role`.** El valor de un indicador y
  su etiqueta declaran los DOS `role: 'cifra'` —son la misma pieza de la
  composición— pero uno se lee de lejos y el otro de cerca. Los separa el id: el
  sufijo con guion bajo marca al nodo que ACOMPAÑA a otro. Sin eso, las
  etiquetas recibían la letra de titular; se vio probando, no leyendo.
- **El color de la CAMPAÑA manda sobre el del perfil, siempre.** La campaña es
  la decisión explícita de quien la configuró; el perfil es una deducción a
  partir de unas fotografías. El perfil RELLENA lo que la campaña dejó vacío —
  misma regla que `putAuto` con las traducciones.
- **El pie cambia de FORMA, nunca de presencia.** Los escudos de la familia
  Rotary no son un rasgo de estilo que una referencia pueda desactivar: son la
  firma institucional de la pieza.
- **TEXTO Y FOTOGRAFÍA TIENEN LA MISMA VARIANZA**, y partir los bloques por
  desviación típica fue el error de la primera versión: medido sobre las diez
  composiciones propias —donde se sabe la respuesta— daba **35 % de fotografía
  en una pieza que no tiene fotografía** y 0 % de tinta en una llena de texto.
  Lo que los separa es la FORMA de esa varianza: el texto sobre un fondo liso es
  BIMODAL y una fotografía es continua. Se mide con la separabilidad de Otsu.
  Comprobado en los dos extremos: fondo liso con texto → 0 % foto / 16,4 %
  tinta; textura tipo fotografía → 88 % foto / 0,7 % tinta.
- **⚠️ Una fotografía MUY SUAVE es plana y no cuenta como fotografía.** Para lo
  que la medida sirve —cuánta imagen con detalle carga la pieza— es lo correcto,
  pero no hay que leerla como «qué porcentaje del lienzo ocupa una foto».
- **El contraste NO sale de la paleta.** La paleta son los seis cubos más
  poblados y el texto blanco de una pieza ocupa demasiados pocos píxeles para
  entrar ahí: por percentiles daba 1,9 en piezas con letra blanca sobre azul,
  que es un contraste altísimo. Se mide entre los percentiles 2 y 98 de
  luminancia.
- **Las referencias se analizan UNA POR UNA, no compuestas lado a lado.**
  Componerlas —el recurso del Creador de Reels— haría falta si el modelo tuviera
  que compararlas, y no es el caso: cada una se describe sola y el CÓDIGO
  consolida. Además la composición habría que subirla a algún sitio para tener
  URL.
- **VOLVER A ANALIZAR CREA UNA VERSIÓN; NO REESCRIBE.** Es exigencia expresa del
  pedido y además lo que impide que una campaña ya generada cambie de aspecto
  porque alguien tocó una foto de referencia. Mismo patrón que `ReelCopy`. El
  índice único es PARCIAL (`WHERE "isCurrent"`), así que un `ON CONFLICT` contra
  él tendría que repetir el predicado — error real de v4.648.
- **Hacen falta DOS referencias como mínimo, y el motivo se DICE.** Con una
  sola, la consolidación por moda no consolida nada y el perfil describe ESA
  pieza, no un estilo. Un número sin su motivo manda a adivinar.
- **El DNA se MUESTRA, no se aplica a ciegas.** Un estilo que no dice qué tomó
  de las referencias es una caja negra: cuando la pieza no se parece, no hay
  dónde mirar. Se ven la paleta, el carácter, el recorte y el pie, que son
  exactamente las cinco cosas que puede modular.
- **El perfil lo RESUELVE el servidor.** El id llega del navegador pero se
  comprueba contra el alcance antes de usarlo: sin eso, un sitio podría componer
  con el estilo de otro. Un administrador de sitio USA los de la plataforma y no
  los edita. `''` es «el activo del sitio» y `'none'` es «ninguno»: dos cosas
  distintas que un solo valor vacío no podría distinguir.
- **Sin perfil, todo sale exactamente como en v4.837.** `resolveProfileFor`
  devuelve `null` ante cualquier fallo, incluida una tabla que todavía no
  existe. Un estilo es una mejora, no un requisito.
- **LOS CUATRO INDICADORES SON DETERMINISTAS**, y no es una limitación: un
  número que sale de un juicio estético no se puede explicar ni reproducir, y en
  una pantalla se lee como una autoridad que no tiene. Cada uno devuelve la
  LISTA de lo que comprobó — un 6/10 sin desglose no le dice a nadie qué
  corregir. `score: null` significa «no se pudo medir» y NO es un tipo de
  «bien»: se pinta distinto, igual que `unknown` en el CRM.
- **⚠️ LA CONSISTENCIA DE ESTILO NO ES UNA HUELLA PERCEPTUAL CONTRA LA
  REFERENCIA**, y es la decisión que más importa de las cuatro. Comparar la
  pieza con la referencia daría nota baja POR CONSTRUCCIÓN: tienen otro
  contenido, otra fotografía y otras cifras, y DEBEN tenerlos. Es literalmente
  la lección de v4.664 —medir contra la imagen equivocada— y la de v4.675, que
  costó dos rondas de créditos. Se puntúa una lista de propiedades medibles del
  perfil. Lo comprueba una prueba leyendo el archivo.
- **El contraste sólo se juzga contra el FONDO DECLARADO.** Un texto sobre la
  fotografía no se juzga: no se sabe de qué color es esa fotografía, y afirmar
  un contraste que no se midió es peor que no medirlo.
- **La densidad es una ESTIMACIÓN por área de los recuadros**, no un conteo de
  píxeles —eso exigiría rasterizar—, y por eso la tolerancia es ancha: un número
  apretado sobre una estimación es una precisión fingida.
- **`CreativeProfile` y `CreativeReference` viven fuera de Prisma** y están en
  la lista del guardián de `db:push`.
- **Se guardan las mediciones de CADA referencia**, no sólo el DNA consolidado.
  Sin ellas, «¿por qué el perfil dice que el titular es condensado?» no tiene
  dónde mirarse — el mismo vacío que el CRM tenía antes de `CrmWebhookEvent`.
- **`profileId` va en las dependencias del manejador**, por el mismo motivo que
  `conQr` en v4.836: sin él, elegir un estilo no llegaría nunca a la petición.

### El contexto narrado y el prompt de estilo (v4.839)

Pedido literal: *«que cuando analice las imágenes, genere una descripción como
un contexto y a la vez un prompt para que se pueda aplicar estos patrones en la
generación de imágenes»*.

- **EL FONDO ES EL COLOR DE MARCA, NO EL PAPEL**, y lo destapó la primera
  prueba con las referencias REALES del Distrito. Son volantes BLANCOS con
  cabecera y pie azules, así que el color de mayor cobertura es `#F2F1F1` con
  el **80 %**. Tomado como fondo, las composiciones —que declaran su texto en
  BLANCO— salían con el título blanco sobre un fondo casi blanco: ilegible, y
  sin que nada avisara. El color de mayor cobertura de una pieza clara es su
  PAPEL, no su identidad (`BRAND_MIN_CHROMA`, deliberadamente MÁS BAJO que el
  del acento: un azul marino institucional tiene saturación 0,32).
- **Y la consecuencia se DICE**: un referente de fondo claro no se traslada tal
  cual, porque estas composiciones son de fondo oscuro. Honrar su claridad
  exigiría rediseñarlas —texto oscuro, otra jerarquía—, que es bastante más que
  modular.
- **Con un color de marca CLARO tampoco se aplica la paleta**
  (`GROUND_MIN_CONTRAST`). Antes que entregar una pieza ilegible, se conserva el
  color de la campaña y se explica; el resto del estilo sí se aplica.
- **EL PROMPT LO ESCRIBE EL CÓDIGO, NO EL MODELO.** Un prompt redactado por un
  modelo cambia entre dos análisis de las mismas referencias, y éste tiene que
  ser REPRODUCIBLE: es lo que va a componer todas las piezas de una campaña.
  Además carga las reglas que no se negocian —sin texto dentro de la imagen, sin
  logotipos dibujados, sin personas inventadas— y ésas no pueden depender de que
  un modelo se acuerde de incluirlas. Lo comprueba una prueba leyendo el archivo.
- **Lo que sí aporta el modelo es el CONTEXTO narrado**, que se cita como la
  parte descriptiva del prompt. Es la única parte del análisis que NO pasa por
  un catálogo cerrado, y se puede permitir porque no decide nada: se LEE.
- **El prompt va en INGLÉS y el contexto en ESPAÑOL.** Los motores de imagen
  responden mejor en inglés; el contexto lo lee una persona. La pantalla lo dice,
  o quien copie el prompt lo lee como un descuido.
- **Al recortar el prompt se sacrifica lo descriptivo; la paleta y la cláusula
  de lo que no se dibuja NO se tocan.** La paleta es lo que hace reconocible el
  estilo y la cláusula es lo que hace publicable la pieza.
- **Los dos viven DENTRO del DNA**, no se calculan al pedirlos: así quedan
  guardados con la versión del perfil y una pieza generada hace un mes se explica
  con el mismo texto que la generó.

No hay
espejo de `creativeDNA.js` en el navegador a propósito: el criterio se aplica
ENTERO en el servidor y la pantalla sólo muestra el resultado, así que un espejo
sería una copia sin consumidor — y las copias se separan en silencio.

**Pendiente de la fase siguiente:** la previsualización comparativa
(referencia | pieza) y la regeneración guiada por los indicadores.

### El lienzo de la pieza de campaña lo genera KIE (v4.840)

Pedido literal: *«verifica que el modelo que está generando las imágenes es el de
KIE.AI; si no está configurado, por favor conectarlo para que sea él quien genere
el contenido, así como está configurado en el Generador de Publicaciones "DESDE
UNA FOTO"»*. La verificación dio dos respuestas distintas según el camino, y de
ahí sale la regla principal.

- **«Desde una foto» YA generaba con KIE y sigue igual.** `generatePost` rutea
  por el registro `ENGINES` con `DEFAULT_ENGINE = 'kie'` y despacha a
  `generateWithKie` → `createKieImageTask({ model: 'google/nano-banana-edit' })`,
  con `KIE_API_KEY`. No había nada que conectar ahí.
- **«Maneras de Contribuir» NO generaba ninguna imagen, y eso era el diseño.**
  Componía la pieza con el grafo de escena y la fotografía salía de la
  Biblioteca. Es la decisión fundacional de v4.833 y se sostiene en dos hechos
  medidos: la regla #1 del sitio prohíbe retocar la salida de un modelo —el
  equipo rechazó el composite dos veces con las palabras «se ve overlay /
  montaje»— y `designCompose.js` ya dejó documentado que los modelos generativos
  **no escriben texto de forma fiable** y que cuando sale mal **no hay salida
  limpia**.
- **Por eso KIE genera el LIENZO, no la pieza.** El fondo —la fotografía
  integrada en una lámina institucional— lo hace el motor; el titular, las
  cifras, la fuente de cada dato y los escudos de la familia Rotary los sigue
  dibujando la plataforma. Es el reparto que ya tenía Plantillas IA, y lo fija
  una prueba: si el controlador empezara a pedirle texto al modelo, falla.
- **NO hay un segundo cliente de KIE.** El endpoint del preset llama a
  `startComposition` / `syncComposition` de `designBackdrop.js`, que son los
  mismos que usa Plantillas IA. Escribir acá otra llamada a `createKieImageTask`
  daría dos caminos hacia el proveedor que se separan en silencio — el problema
  que `sendCampaign` arrastra en el CRM. Lo comprueba una prueba **buscando la
  LLAMADA, no la mención**: el comentario que explica de dónde sale el motor
  tiene que poder nombrarlo.
- **La dirección de arte sale del perfil creativo** (`derived.stylePrompt` →
  `masterPrompt`). Era el pendiente declarado en v4.839 —«hoy el prompt se copia
  a mano»— y esto es su cableado. El prompt ya traía la cláusula de que la
  imagen no lleva texto ni logotipos porque se componen encima: se escribió
  para esto.
- **El perfil se resuelve en el SERVIDOR también para el fondo.** El id llega
  del navegador y se comprueba contra el alcance antes de usarlo; sin eso, un
  sitio compondría con el estilo de otro.
- **Sin fotografía se rechaza con su motivo.** `nano-banana-edit` es un modelo
  de EDICIÓN: sin imagen de entrada no hay nada que componer. Se dice con esas
  palabras en vez de dejar que falle en KIE con un error del proveedor que no
  explica qué hacer. Igual la credencial ausente: se nombra `KIE_API_KEY`.
- **Es ASÍNCRONO y la pieza SIN fondo ya está lista.** La composición tarda
  20-60 s: se crea la tarea y el navegador sondea, con tope de espera. Un fallo
  al componer **no rompe la pieza** —queda su composición declarada, con la
  fotografía en su recuadro, descargable— y hay vuelta atrás explícita: una
  generación que no gusta no puede dejar la pieza peor que antes.
- **«Tiene fondo» se DERIVA del documento** (`hasBackdrop`), no de un estado
  propio. Un booleano aparte daría dos verdades sobre la misma pila de nodos y
  se contradirían al regenerar la pieza o al cambiar de diapositiva — el mismo
  error que `publicKeyOf` evitó en Plantillas IA. Poner y quitar el fondo se
  hace con `withBackdrop` / `withoutBackdrop` del espejo, que además apagan el
  nodo de la fotografía: la foto ya está DENTRO de la imagen compuesta y
  dejarla encima la mostraría dos veces.
- **Va APAGADO por defecto y el costo se DICE.** Gasta créditos por pieza y
  manda la fotografía a un proveedor externo: es una decisión de quien genera,
  no un valor por omisión. Y no se dispara al componer la pieza — lo comprueba
  una prueba leyendo el manejador.
- **Dos botones con el mismo nombre en la misma pantalla no se distinguen.**
  «Quitar» ya era el de la fotografía, así que el del fondo dice «Quitar el
  fondo». Lo destapó la prueba de navegador, no el typecheck.
- **Se verifica en un NAVEGADOR que los ajustes lleguen a la petición**
  (`test:design:render`): fotografía, formato, documento y estilo. Es la
  lección de `conQr` (v4.836) y de `profileId` (v4.838) — una dependencia que
  falta en un `useCallback` no la ve el typecheck, el código es válido y el
  ajuste simplemente no llega nunca.

**Pendiente de las fases siguientes:** el Design DNA extraído de las
referencias, los Creative Profiles versionados y los cuatro indicadores de
calidad. La Fase 1 no introduce ninguna capa de IA nueva a propósito: era el
80 % del parecido y no lo necesitaba.

**Pendientes conocidos:** el objetivo «internacional» quedó resuelto como
AUDIENCIA y no como composición propia —cambia el encuadre del texto, no la
maquetación—; una composición «meta de recaudo» exigiría un campo de meta
económica en la campaña, que hoy no existe: mientras tanto la meta se declara
como un indicador más, con su fuente. Y la **programación** de una publicación
(`scheduledFor`) no está cableada: el endpoint la acepta, la pantalla todavía no
la ofrece.

## Campañas de Contribución — v4.807 (COMPLETO, F1-F5)

«Maneras de Contribuir» es una landing de campañas configurable desde el
Administrador Central y desplegable a los sitios por targeting. F1 entregó
el modelo, el criterio puro y el editor central; F2, la página pública con
fallback exacto; F3, los elementos requeridos, los centros de acopio y los
aliados; F4, el panorama con fuentes, los bloques informativos, el cierre y
la vía local de cada club; F5, las métricas, su panel y la tarjeta social.
Las NUEVE secciones del spec están implementadas.

| Archivo | Qué es |
|---|---|
| `server/lib/contributionSpec.js` | El CRITERIO. **Puro**: tipos, estados, targeting, validación de indicadores, whitelist de overrides, mezcla por sitio |
| `src/lib/contributionSpec.ts` | Espejo mínimo en el navegador (catálogos del editor, estado efectivo, avisos en vivo) |
| `server/lib/ensureContributionSchema.js` | Crea las 5 tablas en runtime |
| `server/controllers/contributionCampaignController.js` | CRUD, estados con historial, caché de lectura pública, token de vista previa |
| `server/routes/contribution-campaigns.js` | Gestión (operador) + lectura pública |
| `src/pages/admin/ContributionCampaigns.tsx` | La pantalla del Administrador Central |
| `src/components/campaign/CampaignLanding.tsx` | La landing pública de campaña (F2) |
| `src/components/DonationModal.tsx` | El modal de donación COMPARTIDO, con la moneda real del club |

Pruebas: `npm run test:contribution` (150 casos). **Sin base, credenciales ni
red**; el espejo se compara por SALIDAS con esbuild y se salta solo si falta.

**Reglas durables:**

- **La campaña es una REFERENCIA, no un clon.** Todos los sitios comparten una
  base: la campaña es UNA fila y cada sitio la resuelve al leer
  (`/api/contribution-campaigns/active?clubId=`). Es la decisión contraria al
  ecosistema del Distrito (v4.747) y con motivo: aquellos contenidos son del
  club de origen y el clon da autonomía; una campaña es de la plataforma y
  corregir una cifra debe reflejarse en todos los sitios al instante.
- **Sin campaña activa, la página genérica se pinta EXACTAMENTE igual.** El
  fallback es el rollout: todo se despliega apagado por construcción y la
  lectura pública DEGRADA a `{ campaign: null }` ante cualquier fallo — esto
  corre en cada visita de la página de aportes y no puede responder 500.
- **El estado efectivo se DERIVA, no se empuja** (`effectiveStatus`, con `now`
  como parámetro — pureza). `scheduled` con inicio vencido se sirve como
  activa; `active` con fin vencido, como finalizada. Sin cron. `paused` no se
  reactiva sola: es una decisión del operador, no del calendario.
- **Un indicador sin fuente NO se publica.** `source` y `updatedAt` son
  obligatorios por indicador; lo decide `validateForPublish` en el servidor
  (la capa 3 de emergencySpec: el administrador escribe, el código decide) y
  el editor avisa en vivo con el MISMO criterio y los MISMOS mensajes del
  espejo. `resolveForSite` además filtra: un indicador activo sin fuente no
  viaja al público aunque esté guardado.
- **Los tipos de desastre salen de `emergencySpec.js`** (`DISASTER_TYPES`),
  no de una segunda lista: dos catálogos de desastres se separan en silencio.
  El `otro` de los desastres se excluye a propósito — el catálogo cierra con
  su propio `otro` genérico.
- **El targeting por distrito usa el criterio DOBLE** de v4.744/v4.748:
  `districtId` O el número dentro de `Club.district`, que es una LISTA
  («4271, 4281», partida con `parseDistrictTags`). «42811» no cuenta como
  4281. Si dos campañas alcanzan un sitio, gana la de mayor `priority`
  (desempate: `publishedAt` más reciente, luego id — estable a propósito) y
  nunca se decide en silencio.
- **La frontera de lo local es ESTRUCTURAL** (`OVERRIDE_WHITELIST`:
  `contact`, `localNote`, `qrImage`). `sanitizeOverride` descarta cualquier
  otra clave — lo que no está en la lista no se puede ni expresar en la
  petición (patrón `stripProtected`). El override viaja en su propia clave
  (`local`), nunca mezclado con el contenido central.
- **El estado no se escribe sin historial** (`ContributionCampaignHistory`,
  patrón EventRegistrationHistory). Publicar/programar valida y devuelve los
  motivos CONCRETOS (422 con la lista). Una campaña que estuvo al aire no se
  borra: se archiva — sólo se elimina un borrador que nunca se publicó.
- **El único camino de cobro es `/financial/donate`** (modal → Stripe
  Checkout → webhook). Desde v4.808 lo usan TAMBIÉN las tarjetas de la página
  de Aportes — ver la sección siguiente. Ojo con la moneda: el cobro sale en
  la del club (Colombia → COP), así que hay que verificar `club_currency` del
  sitio receptor ANTES de publicar una campaña.

## Un solo camino de cobro para los aportes — v4.808

Las tarjetas de `PaymentBlockCard` agregaban el aporte al CARRITO, y ese
camino **no cobraba**: `Checkout.tsx` creaba la orden con `POST /orders` y
navegaba a «éxito» **sin pasar jamás por Stripe** —el selector «Stripe /
PayPal» era decorativo—. Quien aportaba desde ahí creía haber aportado.

- **El pago único abre el MODAL de donación**, el mismo de la página de
  Aportes y de las campañas. La tarjeta queda como PRESENTACIÓN (título,
  descripción, beneficios, montos sugeridos) y el formulario vive en el
  modal: dos formularios de aporte se separan en silencio, y éste es además
  el formato que el equipo pidió conservar.
- **La MEMBRESÍA no se tocó**: `/financial/subscribe` (`mode:'subscription'`)
  siempre funcionó y sigue igual.
- **El carrito sigue vivo para la TIENDA.** Su checkout **tampoco cobra**, y
  eso queda pendiente: es el mismo defecto, pero sobre productos físicos con
  envío, y arreglarlo es otra pieza de trabajo.
- **Consecuencia aceptada**: ya no se suman varios aportes para pagarlos
  juntos. En la práctica nadie lo hacía —no cobraba—, y una transacción por
  aporte es lo que permite atribuirlo a su causa y emitirle su recibo.
- **El rótulo del destino NO se toma del navegador** (`resolveBlockPurpose`):
  el cliente manda `blockId` y el servidor resuelve título y campaña desde el
  `Setting payment_blocks` del club — el mismo patrón con que
  `createSubscriptionCheckout` resuelve el monto. Un texto libre del cliente
  terminaría impreso en la pantalla de Stripe y en el recibo, que son
  documentos de una institución.
- **El recibo NOMBRA a qué se aportó** (`purpose` en la metadata → asunto y
  cuerpo), escapado igual que el título del proyecto. El orden del rótulo va
  de lo más específico a lo más general: proyecto → campaña → bloque → club.
- **El freno del contador público es un FRENO, no una garantía**: mapa en
  memoria por instancia, se reinicia con ella. Alcanza para que un bucle no
  ensucie el panel; uno real exige almacén compartido, que la plataforma no
  tiene. Se dice así en el código a propósito.
- **La lectura pública va cacheada** (TTL 60 s) y TODA escritura la invalida.
- **Las seis tablas viven fuera de Prisma** y están en la lista del guardián
  de `db:push` — al agregar una tabla al módulo, sumarla allí y acá.

### La página pública (v4.804, Fase 2)

- **El modal de donación es UNO** (`DonationModal.tsx`), compartido por la
  página genérica y la landing de campaña. El inline de
  `ManerasDeContribuir.tsx` se extrajo; dos modales se separan en silencio.
- **El modal rotula la MONEDA REAL del club y sugiere montos de esa moneda**
  (`donationPresets(currency)`, espejado en los dos specs). Era el hallazgo 2
  del diagnóstico: decía «(USD)» con $10–$100 mientras el servidor cobraba en
  la moneda del club — «$50» en un club COP eran 50 pesos, bajo el mínimo de
  Stripe. Los montos sugeridos son DE la moneda que se cobra, y el mínimo
  también (COP: 5.000). Al agregar una moneda, agregarla a `DONATION_PRESETS`
  en LOS DOS espejos.
- **La rama de campaña degrada SIEMPRE a la genérica**: cualquier fallo
  consultando `/active` pinta la página de siempre. Mientras se resuelve, un
  esqueleto neutro — no se adelanta un modo que puede no ser.
- **Un CTA de acción `centers` NO se pinta hasta que exista la sección**
  (`IMPLEMENTED_SECTIONS` en `CampaignLanding.tsx`): nunca un botón que no
  lleva a ninguna parte (v4.650). Cuando F3 entregue los centros, agregar
  `centers` a esa lista es lo que enciende esos botones.
- **Los títulos de sección van en PESO NORMAL** (v4.815, `font-light`), como
  `NewsSection` y la página genérica de aportes. Salieron en `font-black` y al
  lado del resto del sitio se veían de otra plataforma. Los rótulos DENTRO del
  contenido —el nombre de una ciudad, el título de una caja— conservan su
  peso: son etiquetas, no títulos de sección.
- **El video de una sección lo resuelve `resolveCampaignVideo`** (v4.815), en
  los dos espejos. Se admiten YouTube, Vimeo y un archivo propio, y **nada
  más**: un `<iframe>` se dibuja en una página pública, así que aceptar
  cualquier dirección convertiría un campo del panel en un hueco por donde
  meter cualquier cosa — la misma regla que el mapa de la sede (v4.717) y las
  redirecciones (v4.781). Se exige `https:`, se acepta el `<iframe>` pegado
  entero —pedirle a quien configura que recorte el atributo es pedirle que
  edite HTML— y YouTube se sirve por `-nocookie`.
- **Lo que no se reconoce NO se pinta, y el editor lo DICE.** `null` en vez de
  un recuadro roto (v4.650); y como el aviso del editor usa el MISMO criterio
  que la página, no puede contradecir lo que se va a ver. La URL se guarda
  **tal cual** —validarla al guardar dejaría al editor sin poder mostrar qué
  escribió quien se equivocó—.
- **Un archivo propio va en `<video controls>`, no en un `<iframe>`**, y al
  revés tampoco funciona. Por eso el criterio devuelve `kind` y no sólo la
  dirección.
- **Los videos rotan solos (7 s) PERO con dos frenos** (v4.830, `VIDEO_ROTA_MS`).
  Esto invierte la regla de v4.816 —«no rotan solos, un video que se cambia
  mientras alguien lo mira es una molestia»— y lo que la hacía necesaria son
  justamente los dos frenos: se detiene con el cursor encima
  (`videoQuieto`) y se detiene DEL TODO en cuanto alguien pulsa el
  reproductor (`videoTomado`). **Sin esos dos frenos, volver a quitar el
  intervalo.** La cadencia es más lenta que la de la tira de fotos a
  propósito: un video necesita unos segundos para reconocerse.
- **Los eventos del ratón sobre un `<iframe>` NO llegan al documento padre**, y
  eso rompía el freno por cursor con un video de YouTube o Vimeo. Medido: con
  el puntero sobre el vecino se detenía y sobre el reproductor seguía rotando.
  Lo resuelve la banda del carrusel por encima y por debajo (`py-6`), que el
  puntero cruza antes de llegar al reproductor — **no es respiro decorativo**.
- **Que le dieron play a un embebido se DEDUCE del foco**, no se pregunta: la
  API de cada proveedor es una librería más por visita. Si al perder el foco
  la ventana el elemento activo es un `<iframe>`, alguien pulsó dentro del
  reproductor. Es una heurística y por eso sólo se usa para DETENER: si se
  equivoca, el carrusel se queda quieto, que es el lado seguro. Con un archivo
  propio no hace falta — ahí está el evento `play`.
- **`sectionVideos` es el ÚNICO punto que arma la lista**, en los dos
  espejos, y DESCARTA lo que no se reconoce: la flecha «siguiente» no puede
  llevar a un recuadro vacío. `requiredItemsVideo` (singular) se conserva por
  la regla aditiva y entra como el primero.
- **Se dibuja SÓLO el video que manda, con `key`** — al revés que las
  imágenes del hero, que están todas montadas. Montar los demás descargaría
  varios videos de una vez, y sin el remontaje el anterior seguiría sonando
  al pasar al siguiente.
- **El índice se acota AL LEER** (`Math.min(idx, len - 1)`), no con otro
  efecto: quitar videos desde el panel deja el índice guardado fuera de rango.
- **Los controles del carrusel van FUERA del video** (v4.817-v4.818).
  Encimados tapaban el reproductor —y en un archivo propio, justo la barra de
  controles del navegador—. Las flechas van a los COSTADOS, a media altura,
  con desplazamiento NEGATIVO (`-left-16`/`-right-16`) que las saca del marco;
  los puntos y el contador, debajo. Por debajo de `xl` no hay margen lateral
  donde ponerlas sin volver a invadir el video, así que ahí quedan las
  compactas de la fila de abajo. No reintroducir `absolute left-3` sobre el
  marco.
- **El envoltorio que posiciona las flechas mide lo que mide el VIDEO**, no el
  bloque entero: con `top-1/2` contra el bloque —que incluye el pie y los
  puntos— quedaban 36 px por debajo del centro, medido. Y ese envoltorio no
  lleva `overflow-hidden`: el del marco recorta lo que se ponga afuera.
- **El botón que cierra la sección pasa por `CampaignCta`**, como el resto:
  el criterio de a dónde lleva y cómo se abre es UNO solo. Sin `label` se
  conserva el «Ver centros de acopio» heredado — regla aditiva, una campaña
  guardada antes no puede quedarse sin su botón.
- **El `MediaPicker` acepta `mediaType`** y sigue en `image` por omisión: las
  nueve pantallas que ya lo usaban piden imágenes y estaba fijado en el
  código. Sin esto, el botón «Biblioteca» del campo de video ofrecería fotos,
  que es peor que no tenerlo. El diálogo de archivo necesita su PROPIO input
  con su `accept`: el atributo se lee al abrirlo, así que cambiarlo por estado
  no llega a tiempo dentro del gesto que dispara el clic.
### La tira de videos se DESPLAZA (v4.831)

- **Hasta v4.830 se repintaba el trío entero** y el cambio era un corte seco:
  desaparecía un video y aparecía otro. Ahora las diapositivas viven en una
  tira que se traslada con `translateX` y una transición de 900 ms.
- **Todas las diapositivas miden LO MISMO y el vecino se achica con `scale`**,
  que no ocupa espacio: así el paso entre centros es constante y centrar es
  una resta. Con anchos distintos habría que recalcular por diapositiva.
- **El centrado se MIDE sobre el desplazamiento actual**, no se deduce de la
  maquetación: `offsetLeft` depende de cuál sea el ancestro posicionado y de
  los márgenes negativos, y suponerlo mal deja el video corrido —medido: el
  centro caía en 443 en vez de 640—. La cuenta es `actual + (centro de la
  ventana − centro de la diapositiva)`, que no depende de nada de eso; y el
  CENTRO no lo altera el `scale`, así que da igual en qué punto de la
  transición se mida.
- **La duración va en el ESTILO, no en una clase arbitraria de Tailwind.**
  `duration-[900ms]` junto a un `ease-[cubic-bezier(...)]` con comas **no
  llegó al CSS compilado** —medido: 0,15 s en vez de 0,9— y una clase que no
  se genera falla en silencio: es la lección de v4.719 otra vez.
- **La rotación REBOTA en los extremos** (…1, 2, 3, 2, 1…) en vez de dar la
  vuelta. Con una tira lineal, saltar del último al primero es un
  desplazamiento largo que se lee como un tirón; rebotando, cada paso es
  siempre de UNA diapositiva. **Superado en v4.832** para tres videos o más:
  con la tira cíclica el paso sigue siendo de UNA diapositiva y además no hay
  extremos. Sigue vigente con dos.
- **En los extremos, la flecha que no lleva a nada se DESACTIVA** (v4.650). Es
  la consecuencia de que la tira sea lineal: en el primero no hay anterior.
  Con la tira cíclica no hay extremos y ninguna se desactiva.
- **Sólo la diapositiva activa monta el REPRODUCTOR**; las demás siguen siendo
  previsualizaciones, así que nunca hay más de una incrustación por visita.

### La tira de videos DA LA VUELTA y no se para (v4.832)

Tres cosas del mismo reporte: «aumentar la velocidad porque está muy lento»,
«siempre deben aparecer los tres videos» y «llega un momento donde se para y ya
no se cambia más de manera automática».

- **La lista se pinta REPETIDA y se vive en la copia del medio**
  (`VIDEO_COPIAS = 3`). Es lo que hace que haya vecino a los DOS lados en
  cualquier posición: con la tira lineal de v4.831, en el primero y en el
  último faltaba uno —el hueco reportado—. **Tres copias es el mínimo**: con
  dos, el primero de la copia del medio se queda otra vez sin nada a la
  izquierda.
- **El rebase es lo que la hace infinita sin saltos largos.** Al salir de la
  copia del medio se retrocede una copia entera SIN transición: es el mismo
  punto de la tira visto desde otra copia, así que en pantalla no cambia nada
  —medido: 0 px de desvío en las dos direcciones—. Animarlo sería recorrer una
  copia a la vista, que es justo el tirón que la tira cíclica evita.
- **El centrado va en un efecto de DISPOSICIÓN** (`useLayoutEffect`). El rebase
  cambia a la vez qué diapositiva manda y cuánto se desplaza la tira; con un
  efecto normal —que corre DESPUÉS de pintar— se vería un fotograma con el
  video nuevo en el sitio del viejo. Y las transiciones se apagan durante el
  rebase: si no, la diapositiva equivalente de la otra copia crecería de 0,66 a
  1 en el centro y se vería un latido donde no pasó nada.
- **El rebase se hace al TERMINAR el desplazamiento** (`onTransitionEnd`
  filtrando `propertyName === 'transform'` y el propio elemento), no al
  empezarlo: a mitad de camino cambiaría la diapositiva que manda debajo del
  movimiento.
- **Con DOS videos la tira sigue siendo LINEAL** (`VIDEO_CICLICO_MIN = 3`). Dar
  la vuelta pondría el MISMO video a izquierda y derecha y parecería que hay
  tres — es la regla de v4.829, y no se afloja por unificar el código.
- **Los dos frenos de la rotación son REVERSIBLES**, y ésta es la corrección de
  fondo. Hasta v4.831 darle play detenía la rotación PARA SIEMPRE: la tira
  quedaba clavada en un video y no volvía a moverse nunca. Con un archivo
  propio la señal de que se dejó de mirar es exacta —`pause` / `ended`—; con un
  embebido no hay estado de reproducción observable sin cargar la librería del
  proveedor, así que se usa la simétrica de la que ya detectaba el play: que el
  foco VOLVIÓ a nuestra página. **Al agregar un freno, escribir a la vez cómo
  se suelta**: un freno sin salida no se lee como un freno, se lee como que la
  función dejó de funcionar.
- **Al reanudar, el video embebido se DESMONTA** —sólo la diapositiva activa
  monta el reproductor—, así que no se queda sonando fuera de cuadro. Es lo que
  hace aceptable que el freno del embebido sea una heurística.
- **La cadencia y el desplazamiento son dos números y se ajustan juntos**
  (`VIDEO_ROTA_MS` 4200, `VIDEO_DESLIZA_MS` 520). El desplazamiento tiene que
  ser bastante más corto que el intervalo, o la tira estaría en movimiento casi
  todo el tiempo y no se llegaría a mirar ningún video quieto; lo comprueba una
  prueba.
- **El punto se marca con el NÚMERO del video, no con la posición.** En la tira
  cíclica hay varias diapositivas del mismo video y un solo punto por video;
  pulsarlo lleva a la copia del medio. El número sale del resto
  (`videoPos % videos.length`), que además acota solo si se quitan videos desde
  el panel — sin otro efecto.

### Los videos, en carrusel con vecinos (v4.829)

- **El video que manda va grande y centrado; los vecinos asoman cortados por
  el borde**, atenuados y con la misma máscara de transparencia que la tira de
  «Rotarios en acción». **El recorte es EL EFECTO**, no un descuido: los
  vecinos miden más de lo que cabe y el `overflow-hidden` los parte. Así se ve
  que hay más videos sin tener que leer el contador.
- **`flex-shrink-0` en el vecino es lo que lo hace cortarse en vez de
  encogerse.** Sin él, el flex lo reduce entero y se ve completo y diminuto,
  que es justo lo contrario del efecto. Lo mismo en el reproductor: es lo que
  impide que los vecinos lo achiquen a él.
- **El difuminado va sólo en el BORDE (6 %).** Con la zona de fundido ancha de
  la galería (11 %) se come justo la parte del vecino que se quiere dejar ver:
  medido, el asomo pasaba de 214 px a 134 px sobre un vecino de 420.
- **El carrusel llega al BORDE del contenedor** (`-mx-4 sm:-mx-6 lg:-mx-8`), no
  hasta donde termina el texto: es lo que le da sitio al vecino para asomar de
  verdad en vez de quedar en una astilla contra el relleno lateral.
- **Un vecino es una PREVISUALIZACIÓN, nunca un `<iframe>`.** Cargar dos
  incrustaciones de YouTube más por visita para mostrar algo que está a medias
  no se paga. Se usa el póster o `videoThumb`; un archivo propio se monta mudo
  y sin controles, que es lo justo para ver su primer fotograma.
- **Con DOS videos sólo asoma uno.** Pintar el mismo a los dos lados haría
  creer que hay tres. Con uno no hay vecinos y el reproductor queda centrado
  como antes de v4.829.
- **Las flechas van SOBRE LOS VECINOS.** Es la regla de v4.818 —no tapar el
  reproductor ni su barra de controles— resuelta con el espacio que ahora
  ocupan los vecinos, en vez de con un desplazamiento negativo fuera del
  marco. Por debajo de `lg` no hay vecinos —no hay ancho para que asomen sin
  comerse el video— y quedan las compactas de la fila de abajo.
- **Los vecinos quedan fuera del teclado y del lector de pantalla**
  (`aria-hidden`, `tabIndex={-1}`): el video es el que está sonando, no los dos
  que asoman. Para navegar están las flechas y los puntos, que sí tienen
  nombre.

### Dónde va el panorama, y por qué (v4.828)

- **Las cifras van ANTES de pedir**, justo debajo del hero. Contestan «¿qué
  tan grave es esto?», que es la pregunta ANTERIOR a «¿cómo ayudo?». Hasta
  v4.827 iban sextas —después de cómo ayudar, los elementos, los centros y la
  galería—, o sea que llegaban cuando el lector ya había decidido. El arco de
  una página de emergencia es: qué pasó → qué tan grave → cómo ayudo → dónde →
  quiénes ya lo hacen.
- **Pero como BANDA, no como sección** con su título grande y su respiro de 24.
  Dos motivos: puesta como sección entera ahí arriba compite con el hero y
  empuja los botones por debajo del pliegue; y un muro de cifras nada más
  abrir ADORMECE en vez de movilizar. Como contexto informa sin frenar.
- **Las cifras SÍ llevan el acento de la campaña, por decisión EXPRESA del
  cliente** (v4.828.2), y conviene saber que se tomó con el argumento en
  contra delante. v4.828 las había pasado a tinta por dos motivos: la regla
  v4.820 del sitio reserva el rojo para lo que ACTÚA, y un color de estado
  usado como decoración es un antipatrón —el rojo no codifica nada (no
  distingue una cifra de otra ni marca gravedad relativa) y aplana la
  jerarquía: 289 personas pesaba igual que 81.536 viviendas—. El cliente lo
  pidió DOS veces con la pieza a la vista: en una campaña de emergencia el
  rojo es identidad del hecho, no señal de estado. **No revertirlo por
  criterio propio**; una prueba fija la decisión.
- **Figuras PROPORCIONALES, no tabulares.** `tabular-nums` da a cada dígito el
  ancho de un `0` y a tamaño de titular se ve suelto; se reserva para columnas
  de números que tienen que alinearse.
- **La fuente va bajo CADA cifra.** v4.828 la unificó en la cabecera cuando
  todas compartían la misma —era menos ruido— y el cliente pidió conservar el
  tratamiento original. `commonStatSource` se retiró de los dos espejos al
  quedarse sin consumidor: un criterio que nadie lee es la clase de silencio
  que este archivo documenta.
- **La banda se centra sea cual sea la cantidad de indicadores** (flujo
  centrado, no una rejilla de cuatro columnas): con dos o tres, una rejilla
  fija los deja pegados a la izquierda.
- **Cada cifra conserva su TARJETA, y por eso la banda va en BLANCO**
  (v4.828.1). El relleno de la tarjeta es `gray-50`: sobre una banda gris
  desaparecerían. Compactar una sección no es quitarle el tratamiento — se
  reduce el respiro y el título, no las piezas.

### La galería «Rotarios en acción» (v4.821-v4.823)

- **Va DESPUÉS de los centros y ANTES del panorama**, y el sitio importa:
  «qué se necesita» y «dónde llevarlo» son un PAR funcional y meter una
  galería en medio corta a quien acaba de leer qué donar y busca dónde. Ahí es
  el giro de «lo que pedimos» a «lo que ya se está haciendo», con las caras
  justo antes de las cifras — se refuerzan entre sí.
- **Es una TIRA a lo ancho que avanza sola** (v4.822-v4.823,
  `CampaignGallery.tsx`), no una pieza a la vez. Va FUERA del contenedor
  centrado: dentro quedaría del ancho del texto.
- **El desplazamiento es NATIVO** (`overflow-x-auto`), no una animación de CSS
  (v4.823). Con `@keyframes` la tira no se puede ARRASTRAR —una animación no
  cede el control—, y quien tenga «reducir movimiento» en su sistema se
  quedaba con una tira quieta. Ahora el avance automático es un empujón más
  (`scrollBy` cada 3,5 s) sobre un contenedor que el usuario puede tomar en
  cualquier momento, con el trackpad o con la barra propia de abajo.
- **CUÁNTAS copias hacen falta se MIDE; no son dos.** Es el defecto que costó
  la versión: el recorrido posible de un contenedor es `scrollWidth -
  clientWidth`, así que con dos copias el punto de salto —una vuelta— sólo se
  alcanza si UNA copia es más ancha que la tira. Con tres piezas en 1280 px no
  lo es: medido, la tira avanzaba a 640 y se clavaba en el tope, 652, **para
  siempre**. No se ve como un fallo, se ve como una galería que dejó de
  moverse. `copias = max(2, ceil(clientWidth / vuelta) + 1)`, recalculado al
  cambiar el tamaño de la ventana. Al duplicar contenido para un ciclo
  continuo, comprobar que el punto de salto quepa dentro del recorrido.
- **El paso se toma de la DISTANCIA entre dos tarjetas**
  (`c[1].offsetLeft - c[0].offsetLeft`), no del ancho de una más el hueco
  leído del estilo: sale exacto y no depende de que el hueco esté declarado
  donde se lo busca. Sobre él se calcula la vuelta (`paso * items.length`), y
  **no** sobre `scrollWidth / copias`, que arrastra el relleno del contenedor.
- **La tira SE DETIENE al pasar el cursor**, y eso no es un adorno: es lo que
  hace utilizable el agrandado y el clic. Una tarjeta que crece mientras se
  escapa hacia el costado no se puede mirar ni pulsar.
- **Las tarjetas son CUADRADAS** (v4.823). Las fotos que mandan los clubes
  vienen en proporciones dispares —verticales de móvil, apaisadas de cámara— y
  un marco cuadrado las trata a todas igual. Lo que crece con el cursor es la
  TARJETA entera, no la imagen dentro del marco; por eso la tira lleva relleno
  vertical (`py-6`): sin él, el crecimiento se recorta contra el borde de un
  contenedor con desplazamiento.
- **SIN barra de desplazamiento** (v4.824, pedido del cliente). Ni la propia
  —que v4.823 había estrenado— ni la del navegador (`.no-scrollbar` en la
  tira). Una barra debajo de algo que ya se mueve solo es un control que casi
  nadie llega a usar y parte en dos justo la sección que tiene que sentirse
  continua. La tira se sigue recorriendo con el trackpad o arrastrándola, que
  es lo que da el desplazamiento nativo.
- **La cadencia es UN número** (`MS_POR_PIEZA`, 1,8 s desde v4.824; 3,5 s en
  v4.823). Al ajustarla, ahí y en ningún otro sitio.
- **Un video NO se reproduce dentro de la tira.** En una tira en movimiento no
  se puede ver —y si el cursor sale, se lo lleva sonando fuera de la
  pantalla—. En la tira es una TARJETA con carátula y botón de reproducir; al
  pulsarla se abre en grande y ahí sí se reproduce. Sin esa ventana, mezclar
  videos en una tira móvil sería prometer algo que no funciona. Es la misma
  raíz que la regla de v4.816.
- **La ventana en grande SE ADAPTA a la pieza** (v4.823). Una foto vertical
  dentro de un marco 16:9 queda con dos franjas negras enormes a los lados. La
  foto y el video PROPIO definen la caja —se acotan al alto y al ancho de la
  pantalla y nada más—; la única excepción es el video EMBEBIDO, porque un
  `<iframe>` no declara tamaño propio y ahí 16:9 no es una suposición. Los
  controles cuelgan del DIÁLOGO, no de la pieza: con la caja cambiando de
  tamaño en cada foto, saltarían de sitio.
- **Sólo la primera vuelta existe para el lector de pantalla** (`aria-hidden`
  en las demás): las piezas son las que hay, no las que se repiten.
- **Chromium recalcula `:hover` con los EVENTOS del ratón**, no cuando el
  elemento se desliza bajo un puntero quieto. Al probarlo con un navegador hay
  que mover el ratón —`hover()` de Playwright además espera que el elemento
  esté QUIETO, y la tira sólo se detiene cuando el cursor ya está encima: un
  candado—. Se usa `mouse.move` en varios pasos y se remata con 1 px. Y ANTES
  de medir el avance automático hay que APARTAR el cursor: tras un
  `scrollIntoViewIfNeeded` puede haber quedado sobre una tarjeta, y entonces
  la tira está detenida a propósito y la prueba culpa al componente.
- **El tipo de cada pieza se DERIVA de la dirección** (`galleryItems`), no se
  guarda: guardarlo aparte daría dos verdades sobre lo mismo y se
  contradirían en cuanto alguien cambie la URL de una fila — el error que ya
  se evitó con `publicKeyOf` en Plantillas IA. Reutiliza
  `resolveCampaignVideo`: lo que ése reconoce es video, lo demás es imagen.
- **La miniatura de un video de YouTube se DERIVA de su id**, sin llamar a
  nadie. Vimeo no la publica sin su API, así que esa tarjeta se pinta con su
  carátula genérica en vez de con un hueco (v4.650).
- **El CRÉDITO de quien mandó la pieza es un dato, no lenguaje**: lleva
  `data-no-translate` (v4.662). Y acreditar al club que aportó la foto no es
  un adorno en una institución.
- **La Biblioteca se abre SIN filtro** para esta sección (`mediaType: 'all'`,
  que NO manda el parámetro): acá conviven fotos y videos y hay que poder
  elegir de los dos. El default sigue siendo `image`.
- Sin piezas cargadas la sección no se pinta — regla del Bloque Destacado
  (v4.746): la página la comparten todos los sitios.

- **La sección de centros lleva el fondo de la banda «Somos gente de acción»**
  (v4.819, `SITE_ACTION_BG` en `siteChrome.ts`). Vive ahí y no escrito en cada
  pantalla porque lo consumen DOS secciones públicas —`ActionSection.tsx` y
  ésta—: una copia que se queda atrás no da error, pinta otro azul y nadie se
  entera hasta que alguien mira las dos bandas juntas (lección de
  `rotary-topbar`, v4.745). No va como clase de Tailwind porque son tres
  propiedades juntas —color, imagen y tamaño de repetición—, no un color
  suelto. Sobre ese azul el título y la alianza van en blanco; el gris oscuro
  de antes sería ilegible.
- **El rojo es de lo que ACTÚA; el azul, de lo que INFORMA** (v4.820). Dentro
  de las tarjetas de ciudad —alfileres, sectores, filetes, teléfonos— manda el
  azul del sitio (`text-rotary-blue`), no el acento de la campaña: sobre la
  banda azul, un directorio salpicado de rojo compite con el único botón que
  de verdad hay que pulsar. El acento sigue gobernando los BOTONES, así que
  una campaña con otro color de tema los sigue tiñendo. Ojo con el filete:
  `border-sky-200` y **no** `border-rotary-blue/20` — `rotary-blue` es una
  clase escrita a mano en `index.css` y no genera modificadores de opacidad,
  la regla no existiría en silencio (v4.719).
- **Las tarjetas de ciudad van en MAMPOSTERÍA, no en rejilla** (v4.814). Con
  `grid`, todas las de una fila se estiran hasta la más alta: al lado de Cali
  (8 direcciones), Cota (1) quedaba igual de alta con media tarjeta en blanco
  —medido: 676 px de los que sobraban ~547—. Con `columns` cada tarjeta mide
  su contenido (sobrante máximo: 2 px de redondeo). `break-inside-avoid` es lo
  que impide que una ciudad se parta entre columnas, y el margen inferior lo
  pone la tarjeta porque `gap` en columnas separa COLUMNAS, no filas.
  Consecuencia aceptada: se lee hacia abajo por columna, como un directorio.
- **Los enlaces configurados pasan por `ctaTarget`** (v4.657), los iconos
  salen de `BLOCK_ICONS` de paymentBlocks (no un segundo catálogo), y el tema
  viaja en hexadecimal con `style` en línea (v4.719).
- **La vista previa es un enlace firmado** (`?campaignPreview=<id>&t=<token>`,
  HMAC de una hora): muestra el borrador GUARDADO con su franja de aviso, no
  publica nada, y **no manda `campaignId` al cobro** — un borrador no
  atribuye donaciones.
- **La atribución de campaña viaja en la metadata de Stripe**
  (`campaignId`/`campaignSlug`, vía `resolveCampaignRef` en
  `financialController.js`) y **DEGRADA, nunca bloquea**: si la campaña
  venció mientras el formulario estaba abierto o no alcanza al club, se dona
  igual y sólo se pierde la atribución. El modelo `Donation` no se toca; los
  contadores llegan en F5 leyendo esa metadata.
- **Verificado en navegador real** (Chromium sobre el `dist/`, API
  interceptada): las dos ramas, el modal en COP y los CTA condicionados.

### Centros de acopio (v4.805, Fase 3)

- **Cada centro es una FILA estructurada**, nunca un textarea: ciudad,
  sector, nombre, dirección, complemento, horario, contacto, teléfono, notas,
  activo y orden. Es lo que permite agrupar por ciudad, marcar teléfonos con
  `tel:` y corregir una dirección sin reescribir un bloque.
- **`normalizeCenters` descarta lo invalidable Y LO REPORTA** (`skipped`):
  sin ciudad o sin dirección no hay centro publicable, y el editor avisa en
  vivo con el mismo criterio del espejo. Nunca un descarte silencioso.
- **El batch del operador sólo toca filas CENTRALES** (`clubId IS NULL`).
  Los centros locales de un club (F4) llevan su `clubId` y el DELETE del
  guardado central los excluye — sin ese filtro, un guardado del operador se
  llevaría por delante los centros propios de los clubes.
- **Los centros viajan PLANOS en el payload público** y la agrupación por
  ciudad/sector la hace el navegador con el espejo de `groupCenters` —
  probado por paridad. El orden es estable (por `sortOrder`, ciudad en el
  orden de su primer centro): no depende del orden de la base.
- **Un CTA de acción `centers` exige ADEMÁS centros publicados**
  (`hasCenters`): la sección existe en el código desde F3, pero sin centros
  no existe en la página y el ancla no llevaría a ninguna parte.
- **Las direcciones, teléfonos y nombres de contacto llevan
  `data-no-translate`**: son DATOS, no lenguaje (regla v4.662). Los títulos
  de sección sí se traducen solos con el resto de la página.
- **La nota («se habilitarán más puntos…») y la alianza (ABACO) son campos
  del contenido** (`centersNote`, `centersAlliance`), no texto del código.

### El panorama y la vía local (v4.806, Fase 4)

- **La fuente de cada cifra SE VE, no sólo se valida.** El panorama pinta el
  valor, la etiqueta y la fuente debajo, más «Última actualización» con
  `statsUpdatedAt`. Cifras y fuentes llevan `data-no-translate`: son datos.
- **La vía del club vive en `/site/*`** (`requireSiteAdmin`, declarada ANTES
  de `/:id` para que «site» no se lea como id). El `clubId` sale SIEMPRE de
  `req.user.clubId` — el body no puede ni nombrar otro sitio.
- **La tarjeta del club está en `ManerasContribuirEditor`**, no en una
  pantalla nueva: la decisión se toma donde ya se trabaja esta página (regla
  de los «Botones de la ficha»). Aparece SOLO si hay campaña activa o
  programada que alcance al sitio — se admite la programada a propósito, para
  que el club prepare su contacto y sus centros ANTES del aire.
- **Los dos batches de centros no pueden pisarse**: el central borra/reescribe
  `clubId IS NULL`; el del club, sólo `clubId = <token>`, y su UPSERT lleva
  `WHERE clubId = $suyo` — mandar el id de una fila central no la toca.
- **El override llega a la página en `local`** (contacto con `tel:`/`mailto:`,
  nota, QR con alt) y toda escritura local deja historial (`override_saved`,
  `site_centers_updated`) e invalida la caché.
- **`sectionOrder` sigue sin consumirse**: el orden de las secciones es el
  declarado en el código. Si algún día se implementa, el editor tiene que
  exponerlo a la vez — un campo guardado que nadie lee es la clase de silencio
  que este archivo documenta.

### Métricas y tarjeta social (v4.807, Fase 5)

- **Contadores DIARIOS agregados**, no una fila por visita: UPSERT con
  incremento sobre `(campaignId, clubId, date, type)`. Sin cookies, sin PII —
  se cuenta cuántas veces pasó algo, nunca quién.
- **`METRIC_TYPES` es un catálogo CERRADO.** Sin esa puerta, el endpoint
  público sería un contador arbitrario que cualquiera llena con lo que
  quiera, y el panel mostraría filas que nadie sabe leer.
- **Los dos eventos que valen dinero los escribe el SERVIDOR**:
  `checkout_started` al crear la sesión de Stripe y `donation_completed` en
  el webhook, con el monto REAL cobrado. El endpoint público los rechaza
  explícitamente — desde el navegador no se pueden inflar. Y el monto nunca
  viene del cliente.
- **Contar no puede romper nada**: `trackCampaignEvent` devuelve `ok:false`
  ante cualquier fallo, y las llamadas desde `financialController` y el
  webhook van en `try` propio — un pago acreditado no se toca por una
  métrica.
- **La página reporta con `sendBeacon`**, que sobrevive a la redirección a
  Stripe (un `fetch` normal se cancela al navegar). Una vista por CARGA, no
  por render (`viewSent`), y **en vista previa no se cuenta nada**: el
  operador mirando su borrador no es tráfico de campaña.
- **El panel rotula ATRIBUCIÓN, no causalidad** (regla del CRM): dice cuántos
  de los que vieron la campaña aportaron después, no que la campaña sea la
  causa. Y sin actividad lo dice, en vez de presentar ceros como dato.
- **El OG de campaña se resuelve en el SERVIDOR** (`campaignSeoFor` desde
  `seoServe`), porque los rastreadores de WhatsApp y las redes no ejecutan
  JavaScript (v4.702). **Lo escrito a mano en `SeoPageMeta` sigue mandando**
  sobre la campaña — misma regla que `putAuto` con las traducciones.
  `campaignSeoFor` degrada a `null` ante cualquier fallo: corre en el
  catch-all de toda página pública.

### Quiénes ya aportaron (v4.862)

Debajo del botón «Aportar ahora» de la tarjeta de campaña va UNA sola línea:
cuántos aportes lleva la campaña y, al lado, el nombre de quien aportó,
pasando solo de uno al siguiente.

| Archivo | Qué es |
|---|---|
| `server/lib/contributorRoll.js` | El CRITERIO. **Puro**: quién puede aparecer, qué cuenta y cómo se arma la línea |
| `contributorRollFor` / `getCampaignContributors` | El camino a los datos y la caché |
| `src/components/campaign/ContributorRoll.tsx` | La línea y su rotación |

Pruebas: dentro de `npm run test:contribution` (461 casos, **sin base ni red**)
y `npm run test:contributors:ui` (12, navegador de verdad).

- **UN APORTE ANÓNIMO NO PUBLICA NOMBRE, Y ESO SE DECIDE EN EL SERVIDOR.** Si
  el nombre viajara en el JSON y la pantalla lo escondiera, bastaría abrir la
  consola del navegador para leerlo. Es la misma decisión que tomó la
  exportación de la Bóveda con el correo de un aportante anónimo (v4.850): el
  dato sigue guardado y deja de SALIR. Va más lejos que la casilla — un aporte
  no anónimo con el nombre vacío tampoco publica nada: no hay qué mostrar y un
  renglón en blanco se lee como un error del sitio.
- **EL TOTAL Y LOS NOMBRES SALEN DE LA MISMA CONSULTA.** El total podría salir
  de `ContributionCampaignMetric` —ya cuenta `donation_completed` por campaña y
  está indexado— y sería más barato; no se hace por dos motivos: ese contador
  **no baja** cuando un aporte se reembolsa (v4.859 marca `status='refunded'` y
  el contador diario se queda donde estaba), y los nombres tienen que salir de
  `Donation` igual. Con dos fuentes, la línea podría decir «3 aportes» y saber
  sólo dos nombres de tres aportantes que sí dieron el suyo, y nadie podría
  explicar la diferencia.
- **El anónimo SUMA al total.** La anonimidad esconde el nombre, no el hecho:
  un aporte anónimo que no sumara le restaría a quien lo hizo el reconocimiento
  de que existió, que es justo lo que este contador celebra. `named` y
  `anonymous` se quedan del lado del servidor — decir cuántos se hicieron en
  anónimo es lo que quien eligió el anónimo no pidió que se dijera.
- **⚠️ `Donation` NO TIENE COLUMNA DE CAMPAÑA y no se le agrega.** La atribución
  vive en `Payment.rawPayload` (v4.807) y el vínculo de vuelta, `donationId`,
  desde v4.844. Agregar la columna a Prisma es la trampa de `logo_intl` (v4.699)
  en su versión más cara: `Donation` y `Payment` se consultan con `findMany`
  **sin `select`** en media plataforma, así que una columna declarada y todavía
  inexistente deja esas consultas en 500 desde el primer despliegue — y eso cae
  sobre el cobro.
- **El SQL filtra amplio y la comprobación exacta se hace en JS.** Castear a
  `jsonb` una columna de TEXTO estalla con una sola fila mal formada, y Postgres
  no garantiza que el filtro que protege el casteo se evalúe antes que el
  casteo. Mismo patrón que el reenvío de la Bóveda.
- **La cota por fecha no es un tope; un `LIMIT` sí lo sería.** Ningún pago de
  esta campaña puede ser anterior a la campaña, así que acota lo que se recorre
  sin dejar fuera ni un aporte. Un total truncado presentado como total es peor
  que no mostrar ninguno.
- **La caché la vacía el APORTE, no sólo el reloj.** Quien acaba de aportar
  recarga y quiere verse — y esta línea existe para eso. Se invalida en
  `bumpMetric` **sólo** con `donation_completed` (las vistas llegan de a
  cientos y la dejarían sin servir para nada) y en el reembolso.
- **El nombre se muestra TAL CUAL lo escribieron**, con los espacios
  normalizados y acotado sin partir palabras. No se recorta a «nombre y
  apellido» contando palabras: quien firma «María Fernanda Restrepo» no se
  llama «María Fernanda».
- **Un aportante repetido aparece UNA vez** —«Ana · Ana» se lee como un fallo—
  y sus dos aportes cuentan.
- **Sin aportes no se pinta nada.** «0 aportes» debajo del botón no es un dato
  neutro: es un cartel que desanima justo donde se pide ayuda. Con todos
  anónimos queda el total solo, que es la verdad completa de lo que se puede
  decir.
- **Los nombres son DATOS, no lenguaje**: `data-no-translate` (v4.662). El
  traductor del sitio convertiría el apellido de alguien en otra palabra.
- **Con un solo nombre no hay intervalo**, y el freno del cursor se suelta con
  `mouseleave` — un freno sin salida se lee como que la función dejó de
  funcionar (v4.832).
- **La línea se pide APARTE de `/active`.** Un dato que cambia con cada aporte
  no tiene por qué gobernar el ritmo de la caché de la campaña, y si la
  consulta falla la línea no se pinta y la página se ve igual que antes.
- **No hay espejo del criterio en el navegador**, a propósito: se aplica entero
  en el servidor y la pantalla sólo muestra el resultado — un espejo sería una
  copia sin consumidor, y las copias se separan en silencio.
- **Que los nombres pasen SOLOS se comprueba en un navegador.** Es literalmente
  lo que se pidió y no se ve en una prueba de criterio.

### El editor de campañas se pliega (v4.826)

Cada sección de la configuración es un `Card` plegable
(`ContributionCampaigns.tsx`), y nacen CERRADAS.

- **Cerradas por defecto, y el motivo es el reportado**: con dieciséis
  secciones abiertas a la vez, llegar a la que se quiere tocar eran varias
  pantallas de desplazamiento. Cerradas, el editor entero es un índice de una
  pantalla. Abrir una no cierra las otras: son independientes.
- **El contenido se DESMONTA al cerrar, no se esconde con CSS.** Todo el
  estado del formulario vive en `c`, no en el DOM, así que no se pierde nada
  —y un campo escondido con `hidden` lo siguen encontrando el buscador del
  navegador y el lector de pantalla—. Es la misma regla que los bloques de la
  página de Proyectos (v4.750). Lo comprueba el smoke contando nodos.
- **Plegar no puede ESCONDER un problema** (`warn`): una sección cerrada con
  avisos los dice en su cabecera. Es la regla de v4.790 — el diagnóstico va
  donde se mira primero. Hoy lo usan el panorama (`statWarnings`), la lectura
  automatizada (`feedWarnings`) y los centros (`centerSkipped`).
- **El estado abierto/cerrado vive en el PADRE, no en cada `Card`.** Es lo que
  permite «Expandir todo» y lo que evita un hook dentro de un `.map` —el
  defecto que dejó en blanco una portada en v4.689—. `Card` no tiene hooks.
- **`CARD_IDS` está en UN solo sitio** porque lo consume «Expandir todo»: con
  la lista escrita dos veces, una sección nueva se quedaría fuera del botón
  sin que nada avisara. Al agregar una sección, agregarla ahí.
- **Un botón de guardar propio va en la CABECERA, fuera del pliegue**
  (`action` en `Card`, hoy «Guardar centros»). Dentro, plegar la sección con
  cambios sin guardar escondería junto con ellos su única forma de guardarlos.
- **La ayuda (`hint`) sólo se pinta con la sección abierta**: cerrada, el
  título tiene que caber en una línea para que la lista se recorra de un
  vistazo.
- **Las dos secciones escritas a mano pasaron a `Card`** (Resultados y Centros
  de acopio). Dejarlas fuera las habría dejado fuera de «Expandir todo» y
  comportándose distinto que sus vecinas.
- La preferencia se guarda en `localStorage` (`contrib_cards_open`), envuelta
  en `try`: en modo privado no se puede escribir y eso no puede tumbar el
  editor.

### La lectura automatizada del panorama (v4.825)

El «Panorama de la emergencia» se alimenta solo desde fuentes configuradas
—la UNGRD, un portal oficial, un medio—: el cron las consulta cada 15 minutos,
un modelo EXTRAE las cifras y el código las juzga. Lo que sale son PROPUESTAS.

| Archivo | Qué es |
|---|---|
| `server/lib/emergencyFeed.js` | El CRITERIO. **Puro**: catálogo de métricas, autoridad de la fuente, lectura de una cifra, juicio de una lectura |
| `src/lib/emergencyFeed.ts` | Espejo en el navegador: avisos en vivo del editor |
| `server/lib/emergencyIngest.js` | La orquestación: descarga, extracción y degradación |
| `ContributionCampaignReading` | Toda lectura, se aplique o no |

- **NO se publica «lo último que aparezca en Internet», y el motivo está
  MEDIDO.** Sobre el propio sismo de San José del Palmar, con cortes de pocas
  horas de diferencia: Infobae 284 fallecidos, ABC Economía 287, la UNGRD en X
  288 (14/08 4:30 p. m.), El Contraste 294 (15/08 6:30 a. m.) y la UNGRD 289
  (15/08 6:30 p. m.); las personas afectadas **bajan** de 145.601 a 115.461.
  Publicar lo último pondría una cifra distinta cada pocas horas, a veces
  hacia atrás y a veces contradiciendo a la propia UNGRD, firmada por Rotary.
  Eso no es un fallo técnico: es desinformación institucional. Al conectar una
  fuente nueva, medir primero qué dice frente a las otras.
- **UNA fuente canónica fija la cifra; las demás AVISAN.** `oficial` es la
  única con `canPublish`. La distinción no es de prestigio: un medio que cita
  a la UNGRD introduce un eslabón más, y la tabla de arriba muestra que ese
  eslabón se equivoca.
- **Un retroceso NO se rechaza: se MARCA.** Consolidar un balance quita
  duplicados, así que una cifra puede bajar con toda legitimidad —la UNGRD
  misma pasó de 294 a 289—. Lo que no puede es bajar EN SILENCIO y sola.
  Rechazarlo dejaría la página clavada en la cifra más alta que alguien haya
  publicado nunca, que es el error opuesto y peor. `rises` marca las métricas
  donde bajar es raro; en desaparecidos, personas y familias afectadas el
  descenso es normal y no genera aviso.
- **El modelo EXTRAE, el código DECIDE** (`parseExtraction`). Se descarta —y
  se dice— lo que no está en el catálogo cerrado, lo repetido, lo que no es un
  entero legible y lo que viene con calificador: «más de 102.000» es una cota,
  no un dato, y publicarla afirmaría algo que la fuente no afirmó. Misma regla
  que `templateComposer.js`, `seoAI.js` y `validateEmergencyCopy`.
- **El separador de miles es el PUNTO** («14.705» son catorce mil setecientos
  cinco) y sólo se aceptan grupos de tres dígitos. Cualquier otra forma se
  rechaza en vez de adivinarse: estas cifras son enteros y un decimal es señal
  de que se leyó mal.
- **Sin fecha de corte no hay lectura**, y un corte que no sea MÁS NUEVO que
  el publicado se rechaza. Es lo que impide que una nota vieja recirculando
  haga retroceder la página sola. Un corte futuro es una fecha mal leída; se
  toleran 12 h porque la función corre en UTC y los cortes son de Colombia.
- **La automatización sólo toca lo que se declara suyo** (`metricKey` en el
  indicador, campo ADITIVO). Un indicador sin métrica es de escritura MANUAL y
  no se pisa jamás — regla de `putAuto` con las traducciones, y acá pesa más,
  porque lo que se pisaría es una cifra que alguien corrigió a sabiendas.
- **Las cifras vienen en una IMAGEN.** La UNGRD publica el balance como
  infografía, así que no hay texto que raspar: va por visión, con el mismo
  `generateCopy({ imageUrl })` del control de fidelidad de Reels. El texto de
  una nota sirve para la fecha de corte y como respaldo.
- **Se guardan también las lecturas DESCARTADAS.** La pregunta que este módulo
  tiene que poder contestar es «¿por qué la página dice 289 si el medio dice
  294?», y sin las que no se aplicaron no tiene dónde mirarse — el mismo vacío
  que el CRM tenía antes de `CrmWebhookEvent` (v4.702).
- **La deduplicación vive en el índice único sobre `key`**, no en el código
  que inserta, y es `DO NOTHING`, no `DO UPDATE`: el cron mira la misma página
  cada cuarto de hora y una lectura ya decidida no puede volver a la bandeja
  porque alguien recargó la página de origen.
- **Cero propuestas es el resultado NORMAL** y se dice así. Un aviso de error
  ahí mandaría a buscar una avería inexistente.
- **La dirección se revalida DESPUÉS de los redireccionamientos.** `fetch` los
  sigue solo, y una redirección a `localhost` o a una IP privada convertiría
  este cron en un lector de la red interna de la función. `isFetchableUrl`
  exige `https` y rechaza host local e IP — mismo criterio que el mapa de la
  sede (v4.717) y las redirecciones (v4.781), y acá además con el SSRF de por
  medio.
- **Leer una fuente NUNCA lanza**: devuelve el motivo escrito. Es un barrido
  sobre sitios de terceros y el fallo de uno no puede llevarse a los demás ni
  dejar la campaña sin explicación dos semanas después.
- **La auto-publicación nace APAGADA**, y el interruptor dice la CONSECUENCIA
  —«la cifra sale publicada sin que nadie la revise»—, no sólo su nombre.
  Encenderla sin ninguna fuente oficial activa se avisa: sería un interruptor
  que no hace nada (v4.650).
- **Los indicadores se acumulan en MEMORIA y se escriben UNA vez** por pasada.
  Con un UPDATE por lectura, dos métricas del mismo balance harían dos vueltas
  y la segunda leería los stats de antes de la primera.
- **El cron va cada 15 minutos, no cada minuto**: cada vuelta gasta una
  llamada al modelo por fuente y un balance oficial no cambia doce veces por
  hora. Protegido con `CRON_SECRET`, con presupuesto de tiempo, y sólo sobre
  campañas `active`/`scheduled` — una archivada gastaría modelo por una página
  que nadie ve.
- **El paso del cron (15 min) es el PISO, no la frecuencia** (v4.827,
  `intervalMinutes` + `shouldRunNow`). Cada campaña elige la suya —de 15
  minutos a una vez al día, «cada hora» por defecto— y el barrido saltea las
  que todavía no toca. El intervalo se acota al catálogo: un valor libre
  dejaría poner «cada minuto», que el cron no puede dar, y sería una promesa
  que la pantalla hace y la infraestructura no cumple. «Leer ahora» pasa
  `force` — el usuario pidió mirar y hacerle esperar sería desobedecerlo.
- **`feedRunAt` es COLUMNA, no un campo del JSON.** La usa el barrido para
  decidir a quién le toca: dentro del documento habría que traer y
  deserializar todas las campañas para saberlo. Se sella **antes** de leer: si
  la invocación muere a mitad, la vuelta siguiente no reintenta en el acto y
  gasta modelo dos veces por lo mismo.
- **Las fuentes se ELIGEN de una lista** (`FEED_PRESETS`), no se escriben de
  cero. La plantilla fija el NOMBRE, la AUTORIDAD y el FORMATO, que es la
  parte que no se puede deducir mirando una página; la DIRECCIÓN se pega a
  mano a propósito —una nota o una infografía tienen una distinta cada día, y
  dejarla escrita sería prometer una integración que no existe—. Son
  plantillas, no un conector, y así hay que llamarlas.
- **«No funciona» era «no hay ninguna fuente», y la pantalla no lo decía.**
  Con la lectura encendida y cero fuentes, «Leer ahora» contestaba «nada nuevo
  desde la última lectura» — que hace creer que se consultó algo. Ahora
  `shouldRunNow` distingue `apagada`, `sin_fuentes` y `todavia_no`, y cada uno
  se dice distinto. Al agregar un camino que no hace nada, preguntarse qué se
  le contesta a quien lo usa.
- **La sección se EXPLICA en la propia pantalla** (tres pasos) y cada fila de
  fuente dice qué implica lo que se eligió. Un módulo que exige leer la
  documentación para configurarlo no se configura: se reporta como roto.
- Pruebas: las de `npm run test:contribution` (394 casos, **sin base,
  credenciales ni red**), con los números REALES del sismo, no unos inventados
  para que la prueba pase.

**Pendiente conocido:** las fuentes se configuran a mano porque **no se pudo
inspeccionar la forma de los endpoints** —`gestiondelriesgo.gov.co` y
`datos.gov.co` estaban fuera de alcance desde el entorno de desarrollo—. El
lector es tolerante a propósito: si algún día se confirma un endpoint
estructurado (Socrata en datos.gov.co, o la API de listas del SharePoint de la
UNGRD), un formato `json` con ruta declarada ahorraría la llamada al modelo y
haría la lectura determinista. No afirmar que hay una integración oficial: hay
un lector configurable.

### El hero de la campaña se turna entre varias imágenes (v4.812)

- **`heroSlides` es el ÚNICO punto que decide cuál imagen va**, y está en los
  dos espejos con paridad probada. Con la decisión escrita en el editor y otra
  vez en la página, una campaña se vería distinta según quién la resuelva —
  mismo criterio que `animationSourceOf` en el Creador de Reels.
- **`image`/`imageAlt` NO se retiran**: regla aditiva (como `sessions` en
  v4.711 y `groups` en v4.708). Una campaña guardada antes tiene una sola
  imagen y se sigue viendo igual; `heroSlides` la devuelve como su única
  diapositiva y el editor la muestra como su primera fila, así que en cuanto
  se toque queda escrita en `images`. Publicar una campaña vieja no puede
  dejarla sin hero.
- **Con una sola imagen no hay intervalo ni puntos.** Un `setInterval` que
  siempre vuelve al mismo índice es trabajo invisible, y unos puntos que no
  llevan a ninguna parte son un control que no controla (v4.650).
- **Las imágenes están TODAS montadas y se cruzan por opacidad**, igual que
  `HeroSection.tsx`. Montarlas y desmontarlas haría que cada cambio volviera a
  pedir la imagen y se viera el hueco mientras carga.
- **El `z-0` del contenedor de imágenes no es decorativo**: lo convierte en su
  propio contexto de apilamiento, así el `z-10`/`z-20` de las diapositivas y
  el velo se quedan DENTRO y no tapan el texto del hero, que va después y sin
  z-index. Sin él, el velo se come el título y los botones.
- **Los dos hooks del carrusel van ARRIBA del componente**, antes de cualquier
  `return` — `check:hooks`, y el defecto que dejó en blanco la portada de un
  sitio de Evento (v4.689).
- **El tope y el intervalo salen del spec** (`HERO_MAX_SLIDES`,
  `HERO_SLIDE_MS`), no de números sueltos en la pantalla: el editor y la
  página tienen que acotar y esperar lo mismo.
- **Las DOS vías para agregar, siempre** (v4.700), y ADEMÁS varias de una vez:
  elegir cinco de la Biblioteca de a una es cinco veces el mismo gesto. El
  `MediaPicker` sube su `maxSelection` sólo para el hero.
- **Comprobado en un navegador que de verdad se turnan.** Que roten solas es
  lo que se pidió y no se ve en una prueba de criterio: el smoke espera los
  5,6 s y comprueba que el punto activo se movió sin que nadie lo tocara.
- **El acercamiento lento (`animate-hero-zoom`) vive en el TEMA** (v4.813,
  `tailwind.config.js`), no en un `<style>` de cada pantalla. Lo llevaban
  escrito a mano —idéntico— `HeroSection.tsx` y `YEPHero.tsx`, y la campaña
  iba a ser la tercera copia: el día que alguien ajuste la escala, las otras
  se quedan atrás y el mismo efecto se ve distinto según por dónde se entre.
  Va en el tema y no en `@layer utilities` de `index.css` por la lección de
  v4.719. Dura 5 s, lo mismo que una diapositiva, así que termina justo al
  cambiar; `forwards` evita el salto atrás.
- **La clase se comprueba contra el CSS COMPILADO**, no sólo contra el
  archivo fuente: una clase que no llega al CSS no existe, en silencio
  (v4.719). Ese bloque de la prueba se salta si no hay `dist/`.
- **El acercamiento va sólo en la imagen que MANDA.** Animar las que no se
  ven es trabajo invisible, y es además lo que hace que el acercamiento se
  reinicie cuando a esa imagen le vuelve a tocar.

### El ícono se elige viéndolo, y una varita lo propone (v4.810-v4.811)

| Archivo | Qué es |
|---|---|
| `src/components/admin/IconPicker.tsx` | La rejilla COMPARTIDA + la varita |
| `src/lib/paymentBlocks.ts` | `BLOCK_ICONS` (41), `BLOCK_ICON_LABELS`, `getBlockIconLabel` |
| `server/lib/iconSuggest.js` | El CRITERIO de la varita. **Puro** en su parte determinista |
| `server/routes/ai.js` | `POST /ai/suggest-icon`, junto al resto de `/suggest-*` |

- **El selector es UN componente, no una copia por pantalla.** Lo usan las dos
  secciones de la campaña y el editor de Bloques de Pago, que ya tenía esta
  misma rejilla escrita inline: duplicada, la segunda se queda sin los íconos
  que se agreguen a la primera. La VARITA vive ahí por lo mismo — cableada en
  cada pantalla, la tercera se queda sin ella.
- **El catálogo se amplió de 14 a 41 porque los originales eran todos de sabor
  «donación»** —corazón, trofeo, estrella, regalo— y no había NINGUNO para
  alimentos, higiene ni botiquín: una campaña de emergencia terminaba usando el
  regalo para todo. Al agregar un ícono, agregar también su rótulo en español:
  es lo que leen el `title` y el lector de pantalla, y la clave interna
  (`firstaid`) no le dice nada a quien configura.
- **La varita VA DE LO EXACTO A LO INSEGURO**, igual que la detección de
  intención del CRM: primero `ICON_HINTS` —determinista, instantáneo, gratis y
  reproducible— y sólo si ninguna palabra resuelve, el modelo. Al revés se
  pagaría una llamada por pulsación para resolver lo que una palabra clave
  resuelve, y la sugerencia dejaría de ser explicable.
- **NADA de palabras genéricas de envase en `ICON_HINTS`** («artículo»,
  «elemento», «caja», «paquete»). Aparecen en casi todo título y, por ser
  largas, le ganan a la palabra específica bajo la regla de la coincidencia más
  larga: «Artículos de higiene personal» salía con el ícono de suministros. Al
  agregar términos, probarlos contra los títulos REALES de una campaña.
- **El catálogo es CERRADO y lo valida el código** (`parseIconAnswer`). Un
  ícono inventado por el modelo no existe en la rejilla y dejaría la caja sin
  nada. Misma regla que las intenciones del CRM y que `validateMeta` en el SEO:
  el modelo PROPONE, el código DECIDE.
- **El prompt se arma desde `ICON_HINTS`, no desde una segunda tabla de
  rótulos.** No hay una lista que se pueda quedar atrás al agregar un ícono, y
  las palabras clave describen mejor que un rótulo de una palabra.
- **La varita DEGRADA y lo DICE.** Sin modelo configurado, con el modelo caído
  o sin coincidencia, se avisa el motivo concreto y el ícono se sigue eligiendo
  a mano. Es una comodidad del editor: que no ande no puede impedir guardar la
  caja. Y queda apagada mientras la caja no tenga texto — sin nada que leer no
  hay nada que sugerir.
- La prueba comprueba que **todo ícono sugerible exista en `BLOCK_ICONS`**: uno
  que viva sólo en `ICON_HINTS` se sugeriría y no se podría dibujar.

**Pendiente conocido:** el CTA diferenciado «Donar desde Colombia / desde el
exterior» NO se implementó, a propósito: la pasarela cobra en UNA sola moneda
por club (`resolveClubCurrency`) y sólo acepta tarjeta — sin PSE ni
multi-moneda por donante. Ofrecer dos caminos que terminan en el mismo cobro
sería prometer una capacidad que no existe (criterio 16 del pedido: no
inventar soporte internacional). Si algún día la pasarela lo soporta, el
lugar es `donationPresets` + una segunda entrada de CTA en el hero.

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

## Formularios del proyecto (Gestión de Proyectos) — v4.788

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

### Retirar un campo de una plantilla (v4.788)

El comité quitó del paso 5 (Presupuesto) de la Formulación los tres conceptos
internacionales: «Aporte clubes internacionales», «Distrito Internacional» y
«Fundación Rotaria». Parece un cambio de tres líneas y tiene dos trampas.
Pruebas: `npm run test:project-form` (31 casos, sin base ni red).

- **Borrarlo del código NO alcanza: lo guardado manda.** `templateFor` mezcla la
  plantilla de `projectFairMasterForm.js` con la copia que la convocatoria tenga
  en `ProjectFairConfig`, y el merge **reemplaza los arrays enteros**: si la fila
  guardada trae su propio `masterForm.sections`, el cambio del archivo no llega
  nunca a producción. Es la misma trampa del catálogo de clubes (v4.707) y del
  Generador de Pendones. `dropRetiredBudgetRows` lo limpia **al leer**, dentro de
  `normalizeSavedConfig`, junto a la etiqueta de los CADRES y el orden de los
  distritos: así se autorrepara y **no hay que escribir en la base durante un
  despliegue**, que es lo que prohíbe la sección de base de datos de este
  archivo. Sólo toca las filas nombradas y devuelve la misma referencia cuando
  no hay nada que quitar.
- **Retirar un campo es dejar de PEDIRLO, no dejar de mostrarlo.** La ficha
  administrativa, el PDF y el Word dibujan la tabla recorriendo `rows`, así que
  una fila borrada se lleva con ella el valor que un club ya hubiera escrito:
  seguiría en la base, invisible, en una postulación que se paga. Las filas
  retiradas se DECLARAN en el campo (`retiredRows`) y `matrixRowsToShow` las
  añade **si tienen valor** — vacías no, nadie necesita ver un concepto muerto y
  en blanco. Misma regla que `RETIRED_LABELS` en el registro de eventos.
- **El rótulo «(retirado del formulario)» se pone UNA vez**, dentro de
  `matrixRowsToShow`. Son tres vistas y escribirlo tres veces las deja
  separarse; sin él, un concepto retirado se lee como si todavía se pidiera.
- **Quitar filas no puede bajarle el avance a nadie.** Una tabla cuenta como
  diligenciada con CUALQUIER celda llena (`anyCellFilled`), así que una
  postulación que sólo había llenado un concepto ya retirado sigue contando.
  Comprobarlo al retirar un campo de otro tipo, donde la regla puede no valer.
- Al retirar otra fila: agregarla a `RETIRED_BUDGET_ROWS`, no borrarla y ya.

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

**Orden de las rutas: `npm run check:routes`.** Corre en `prebuild` y rompe el
despliegue. Es la CUARTA causa de módulo roto, y no la ve ninguna de las otras:
el typecheck no mira el servidor, `check:syntax` da el archivo por bueno —parsea
perfectamente— y las pruebas de criterio pasan enteras, porque el criterio nunca
estuvo mal.

- **Express casa las rutas en ORDEN DE DECLARACIÓN.** Una literal declarada
  DEBAJO de su paramétrica es INALCANZABLE: la petición cae en el manejador de
  la paramétrica con el nombre de la ruta como parámetro.
- **El fallo es MUDO Y ENGAÑOSO**: no da 404, da la respuesta del manejador
  equivocado. En v4.859, guardar la tarifa de la plataforma
  (`PUT /admin/fee-rules`) caía en `PUT /admin/:id` —el que actualiza un retiro—
  y contestaba *«Estado inválido. Los admitidos son: pending, processing,
  completed, rejected»*: un mensaje que no menciona ni tarifas ni comisiones y
  manda a diagnosticar a otro sitio. Se reportó como «no me deja guardar».
- **⚠️ EL AVISO YA ESTABA ESCRITO EN PROSA** dentro de `payouts.js` desde v4.847
  —«al agregar un `GET /admin/:id`, éstas tienen que quedar ANTES»— y el defecto
  entró igual, por la otra puerta: el comentario hablaba de un GET y llegó un
  PUT. **Un comentario que depende de que alguien lo lea no protege nada.**
- **Se compara por SEGMENTOS, no por prefijo.** Express exige la misma cantidad
  de segmentos y que cada uno de la paramétrica sea igual o `:parametro`. Por
  prefijo salían **48** casos, casi todos falsos —`/` es prefijo de todo—; por
  segmentos son 3. Un guardián que grita en falso se termina desactivando, que
  es peor que no tenerlo.
- El barrido destapó otras dos rutas muertas desde que se escribieron:
  `GET /conversations` en Agentes (consultaba un agente con id
  `'conversations'`) y `POST /master/query` en Brains (buscaba un brain con id
  `'master'`). Mover una literal por encima de su paramétrica **no puede romper
  nada que hoy funcione**: sólo vuelve alcanzable algo que no lo era.
- Al agregar una ruta con parámetro, declararla **al final** de su grupo.

**Sigue sin cubrirse** el error de importación en tiempo de ejecución —importar
un símbolo que el módulo no exporta— porque comprobarlo exigiría ejecutar los
módulos, y eso arrastra la base de datos.

**Y una sesión vencida se dice como tal.** El token de plataforma dura un día,
así que en una pantalla que se abre y se deja abierta el GET del principio
funciona y el PUT del final ya no. El servidor contesta `Invalid token` y el
traductor del sitio lo pinta como «Token inválido», que no le dice a nadie que
lo único que hace falta es volver a entrar. `mensajeDeFallo` en
`FeeRulesPanel.tsx` distingue 401 —sesión vencida, con el aviso de que lo
escrito sigue ahí—, 403 —no es tu permiso— y «no hubo respuesta» —la petición no
llegó, que no es un rechazo—. **Al escribir un manejador de error de un panel,
distinguir esos tres**: «no se pudo guardar» a secas obliga a diagnosticar a
ciegas.

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

## La Bóveda de Fondos — libro mayor en sombra (v4.847, Fase 1)

Fase 1 del rediseño financiero. Se crean las tablas del libro y se escriben los
asientos EN PARALELO con lo que ya existe; **nadie los lee**. La Bóveda sigue
calculando sus saldos desde `Payment` y `PayoutRequest`, igual que antes. La
reversa es dejar de escribir: las tablas quedan sin consumidor.

| Archivo | Qué es |
|---|---|
| `server/lib/ledgerSpec.js` | El CRITERIO. **Puro**: cuentas, tipos de asiento, unidad mínima, cuadre y los constructores de asiento |
| `server/lib/ensureLedgerSchema.js` | `LedgerAccount`, `LedgerTransaction` y `LedgerLine` en runtime |
| `server/lib/ledger.js` | La escritura, la lectura de saldos y la conciliación |
| `GET /api/payouts/admin/ledger/:clubId` | El informe: el libro contra la Bóveda. Sólo del operador |

Pruebas: `npm run test:ledger` (88 casos, criterio puro) y
`npm run test:ledger:write` (44, el CAMINO de escritura con la base sustituida
en memoria). **Ninguna necesita Postgres, credenciales ni red.**

**Reglas durables:**

- **Se estrena EN SOMBRA porque los saldos de esta pantalla son dinero que un
  club va a pedir.** Cambiar de dónde salen sin haber comprobado antes que el
  libro nuevo dice lo mismo que el viejo sería estrenar un motor contable sobre
  producción. Lo que hace útil la fase es `reconcileClub`: sin una forma de
  contrastar los dos libros, el nuevo sería una promesa.
- **TODO ENTRA COMO ENTERO, EN LA UNIDAD MÍNIMA**, y el motivo está MEDIDO en la
  Fase 0: `roundMoney(8.915, 'USD')` devuelve 8,91 y no 8,92 —el doble más
  cercano a 8.915 es 8.9149999…—, así que el redondeo de un importe con
  decimales depende de cómo cayó el binario. Sobre un aporte suelto es un
  centavo; sobre un libro que se suma miles de veces es un descuadre que nadie
  puede explicar. `minor` es `BIGINT`: un `numeric` invitaría a meter decimales
  y un `int` desbordaría —50.000 COP ya son 5.000.000 de unidades mínimas—.
- **⚠️ La unidad del LIBRO es la del PROVEEDOR (`stripeDecimals`), no la de
  presentación.** Son dos nociones distintas —es la regla de `money.js`— y COP
  es justo donde difieren: se cobra con dos decimales y se escribe sin ninguno.
  Llevar el libro en la unidad de presentación tiraría los centavos de cada
  comisión, y la comisión de Stripe es precisamente la cifra con centavos.
- **UN ASIENTO CUADRA POR MONEDA, NO EN TOTAL.** Un apunte de +10 USD y −40.000
  COP no «cuadra en cero» de ninguna forma útil: es la misma mezcla que produjo
  el «$47.507,75», escondida detrás de una invariante que parece rigurosa. Una
  operación que cruza monedas son DOS asientos, cada uno cuadrado en la suya.
- **La conversión ocurre ANTES del asiento, no dentro.** La comisión de un cobro
  en pesos la cobra Stripe en dólares; su línea va en PESOS —es lo que de verdad
  se le descontó al cobro— y el importe original en dólares viaja en `meta`, con
  su tasa, su fuente y su fecha. Sin eso, «¿por qué la comisión de este aporte
  son 4.750 pesos?» no se puede contestar dentro del libro.
- **EL LIBRO SÓLO AGREGA.** No hay UPDATE ni DELETE sobre una línea ni sobre un
  asiento; corregir es escribir un asiento que REVIERTE al anterior y lo nombra.
  Un libro que se puede editar no responde «¿qué decía esto en marzo?», que es
  la única pregunta para la que existe un libro. Lo comprueba una prueba leyendo
  el archivo: un UPDATE escrito ahí no lo ve ninguna otra comprobación.
- **ANULAR NO ES REVERTIR.** Un retiro rechazado deja un asiento NUEVO que
  devuelve el dinero a disponible; el asiento del retiro se queda, porque el
  club lo pidió de verdad. Un reverso diría que nunca existió.
- **El NETO se DERIVA, no se recibe.** `buildDonationEntry` resta las
  retenciones del bruto. Aceptarlo de fuera permitiría escribir un asiento que
  cuadra porque alguien mandó el número que hacía falta, y entonces el libro
  deja de comprobar nada. Un neto negativo se RECHAZA: no es un asiento raro, es
  un dato mal leído, y se atrapa donde todavía se puede.
- **Una retención en CERO no deja línea.** Un libro lleno de ceros esconde las
  líneas que sí dicen algo.
- **`basis` separa lo MEDIDO de lo ESTIMADO.** La comisión que devolvió el
  proveedor es un hecho; la que calculamos con su tarifa publicada porque la
  consulta falló es una cuenta nuestra. Presentarlas igual es lo que hace que un
  libro deje de servir para cuadrar.
- **NADIE PAGA POR EL LIBRO.** Toda función de escritura devuelve `{ ok, reason }`
  y NUNCA lanza; el asiento va después de acreditar el cobro y en su propio
  `try`. Un aporte que se perdiera porque falló su asiento sería cambiar un
  problema de auditoría por uno de dinero — y el libro está en sombra, así que
  todavía no vale nada.
- **La idempotencia es de la BASE**: índice único sobre `(sourceType,
  sourceRef)`. No hay lectura previa que sirva contra dos entregas concurrentes
  del mismo webhook — es la misma lección que costó
  `Payment_provider_providerRef_key` en v4.841. El aporte y su liberación llevan
  la MISMA referencia y no chocan porque su `sourceType` difiere; una anulación
  lleva el sufijo `:anulado`, así que rechazar dos veces el mismo retiro no
  devuelve el dinero dos veces.
- **La liberación se asienta cuando el CLUB puede pedirlo, no cuando Stripe
  suelta.** Entre las dos fechas hay `PLATFORM_HOLDING_DAYS`, y asentar en la
  primera pondría en «disponible para retiro» un dinero que la Bóveda todavía no
  deja retirar: dos libros diciendo cosas distintas sobre lo mismo es
  exactamente lo que la fase en sombra existe para no estrenar.
- **NO hay tabla de saldos materializados**, y es a propósito: sería una segunda
  verdad sobre las mismas líneas, y las segundas verdades se contradicen en
  silencio en cuanto alguien escriba sin actualizarla —es lo que evitan
  `publicKeyOf` y `hasBackdrop`—. El saldo es `SUM(minor)` con `GROUP BY account,
  currency`. **Ese `GROUP BY currency` no es opcional**: su ausencia es
  literalmente el defecto que abrió este rediseño. El día que la consulta duela
  se materializa a sabiendas, con su recálculo; hoy no duele.
- **Las tres tablas viven FUERA de Prisma** y están en la lista del guardián de
  `db:push`. Un modelo declarado en `schema.prisma` que todavía no exista en la
  base deja en 500 toda consulta que lo toque —la regla de `logo_intl`
  (v4.699)— y acá caería sobre el cobro.
- **El asiento y sus líneas van en UNA transacción de base.** Un asiento a
  medias es un libro descuadrado que no se puede corregir, porque el libro sólo
  agrega. Hace falta una conexión DEDICADA del pool: `db.query` toma una
  distinta por llamada, así que un `BEGIN` por ahí no envolvería a los `INSERT`
  siguientes y la transacción sería decorativa.
- **El criterio vive aparte de la orquestación**, como `seoRules.js` frente a
  `seoAudit.js`: un motor contable que sólo se ejercita contra una base real
  termina sin pruebas, y entonces nadie se entera de que una regla cambió de
  signo.
- **Y aun así se prueba el CAMINO, no sólo el criterio** (`test:ledger:write`,
  con la base sustituida en memoria). Es la lección de v4.744: `pickDistrictSite`
  era correcto y el defecto estaba en el camino. Ahí se ve lo que una prueba
  pura no puede ver — que la cuenta se cree antes que la línea, que un evento
  reentregado no duplique dinero, que los saldos salgan agrupados por moneda—.
  **Lo que ese doble NO demuestra es que el SQL sea válido para Postgres**: eso
  se comprueba al desplegar, y no se afirma de más.
- **⚠️ Al escribir SQL en un template literal, ninguna comilla invertida
  adentro** — ni en un comentario. Cierra el literal a mitad y el módulo entero
  deja de parsear; lo atrapó `npm run check:syntax`, que es la única barrera que
  lo ve. Ya había pasado en `ensureDesignSchema.js` (v4.721.1).
- **El informe de conciliación es del OPERADOR, sólo lectura, y HOY VA A
  DIFERIR.** Decirlo es parte del informe: el libro arranca vacío y sólo asienta
  lo posterior a v4.847, así que la diferencia mide cuánto historial le falta, no
  un error. Presentarlo sin esa frase mandaría a buscar una avería inexistente —
  misma regla que `unknown` en el diagnóstico del CRM.
- **La etiqueta de `gasto_procesador` es la que pidió el cliente**, textual
  («Tarifa de procesamiento de traslado desde interbancos»), y una prueba la
  fija: renombrarla de vuelta por criterio propio tiene que fallar.

### La carga hacia atrás (v4.848, Fase 2 — primer paso)

`POST /api/payouts/admin/ledger/:clubId/backfill`. Criterio en
`server/lib/ledgerBackfill.js` (**puro**), orquestación en `backfillClub`.
Pruebas: `npm run test:ledger:backfill` (59 casos) más la sección de punta a
punta de `test:ledger:write`, que comprueba que **después de cargar el informe
CUADRA** — sin eso, la Fase 2 sería una promesa.

- **SE REPRODUCE, NO SE CORRIGE, y de ahí cuelga todo lo demás.** La comisión no
  se recalcula: se DERIVA restando (`bruto − retención − neto`), de modo que el
  neto del libro sea EXACTAMENTE el `netAmount` guardado. Varios aportes
  anteriores a v4.845 tienen el neto mal calculado —se les restó una comisión en
  dólares como si fueran pesos— y la carga los reproduce MAL a propósito. Si se
  arreglaran al cargarlos, el informe pasaría a mezclar «lo que falta por
  cargar» con «lo que decidimos corregir» y un descuadre dejaría de distinguir
  un fallo de la carga de una corrección deliberada. El informe es el ÚNICO
  instrumento que autoriza el cambio de fuente; no puede quedar ambiguo. Los
  netos malos se corrigen después, con asientos de reverso que lo dicen.
- **Todo asiento cargado se marca `reconstruido`**, y su comisión `basis:
  'estimado'` cuando se dedujo restando (`meta.derivada`). Dentro de un año
  nadie tiene por qué confundir lo observado en vivo con lo deducido del
  historial.
- **La referencia es la MISMA que usa el webhook** (`providerRef`, o `id:<id>`
  si falta). Es lo que impide que la carga duplique un aporte que ya se asentó
  en vivo: el índice único lo rechaza. Correrla dos veces es seguro y el segundo
  pase debe salir todo duplicado — lo comprueba una prueba.
- **De ENSAYO por defecto.** Sin `{"apply": true}` no escribe y devuelve lo que
  haría. Escribir es idempotente, pero lo valioso es mirar primero: **lo que no
  se puede cargar y por qué es la mitad del resultado**, agrupado por motivo con
  ejemplos — un listado de doscientas filas no lo lee nadie.
- **Un pago SIN neto registrado no se carga**, y no es una omisión: la Bóveda lo
  cuenta como cero (`Number(null) || 0`), así que dejarlo fuera hace que los dos
  coincidan. Asentarlo con neto cero diría que el procesador se quedó con todo.
- **Un retiro RECHAZADO tampoco**, por lo mismo: `computeBalances` no lo cuenta.
  Asentarlo completo —retiro y anulación— exigiría inventar cuándo se pidió y
  cuándo se rechazó, y ninguna de las dos fechas está guardada.
- **Un retiro en una moneda sin aportes se REPORTA, no se adivina.** Hasta
  v4.840 `PayoutRequest.currency` no se escribía y toda fila vieja quedó en USD
  por omisión: adivinar cuál era es adivinar cuánto dinero salió.
- **`PAYOUT_COUNTED` tiene que ser la MISMA lista que usa `computeBalances`** o
  el libro y la Bóveda contarían retiros distintos y el informe nunca cuadraría.
- **Presupuesto de tiempo, y lo que no entra se DICE** (`pendientes`). Un corte
  mudo se lee como «ya está todo cargado», que es la conclusión equivocada.

**⚠️ El informe comparaba dos cantidades que no son la misma** (corregido en
v4.848). La v4.847 contrastaba `club_disponible` del libro contra `available` de
la Bóveda: aquélla calcula `collected − requested` **sin** mirar el período de
retención, y el libro sólo llama disponible a lo que el proveedor ya liberó. Con
un aporte en tránsito los dos difieren estando los dos bien, y el informe habría
reportado un descuadre inexistente — el error que la conciliación existe para no
cometer. Ahora se compara `neto − transferido`, que sí es la cantidad
equivalente, y lo que el libro sabe de más —liberado y en tránsito— se devuelve
en `soloEnElLibro`, **sin compararlo contra nada**: no hay contra qué.

- **⚠️ Limitación conocida: un asiento no se corrige solo.** El de liberación
  se queda con el neto que se conocía la primera vez; si un sync posterior
  mejora la comisión —porque apareció la TRM del día—, el segundo asiento choca
  con el índice y se descarta. Corregirlo es revertir y volver a asentar, y eso
  es Fase 2. Mientras tanto es un descuadre que la conciliación VE, que es
  exactamente para lo que sirve la fase en sombra.

**Lo que sigue (Fase 2, segundo paso):** correr la carga en producción, mirar el
informe y —**sólo si cuadra**— cambiar la fuente de los saldos de la Bóveda al
libro. Hasta que cuadre, no se cambia nada. Después quedan los reversos de los
netos mal calculados, que son otra cosa y van con su propio asiento.

### La Bóveda se filtra por período y por destino (v4.849, bloque A)

Debajo del selector de moneda: el PERÍODO (7/15/30/90 días o un rango a mano) y
el DESTINO del aporte. Debajo de la lista, lo recibido en el período.

| Archivo | Qué es |
|---|---|
| `server/lib/walletFilters.js` | El CRITERIO. **Puro**: rangos, qué cae dentro, catálogo de destinos y qué se filtra y qué no |
| `src/lib/walletFilters.ts` | Espejo MÍNIMO: sólo lo que hace falta para pintar el selector |
| `resumenDelPeriodo` en `financialController.js` | Los flujos del período, por moneda |

Pruebas: `npm run test:wallet:filters` (72 casos, **sin base ni red**) y 20
comprobaciones más en `npm run test:wallet:ui`.

**Reglas durables:**

- **UN SALDO NO SE FILTRA POR FECHA.** Es la regla de la que cuelga el bloque.
  Los aportes de un período son un FLUJO —existen dentro de un rango—; el
  disponible para retiro es un SALDO —existe A UNA FECHA—. «Disponible para
  retiro entre el 1 y el 15» no significa nada. Si el filtro tocara la caja
  azul, alguien elegiría «últimos 7 días», vería «US$ 0,00» y concluiría que no
  tiene dinero, justo en el número con el que decide si pide un retiro. Es la
  misma clase de defecto que el «$47.507,75». Por eso `FILTRABLE` es un catálogo
  EXPLÍCITO y el saldo no está en él, y por eso una prueba comprueba sobre el
  archivo que `computeBalances` no reciba ningún rango.
- **Y se DICE.** Que el saldo no cambie al filtrar se lee como que el filtro no
  funciona; el aviso vive en el espejo (`AVISO_SALDO`), no suelto en el JSX,
  porque es una afirmación sobre cómo se comporta el módulo, no una etiqueta.
- **El valor por defecto es `todo`, NO «hoy».** Con «hoy» la Bóveda abriría casi
  siempre en cero —los aportes de un club no son diarios— y se leería como un
  módulo roto. `todo` es además lo que la pantalla muestra desde siempre: el
  filtro es ADITIVO y quien no toque nada ve lo de antes.
- **NO se llama «campaña», y no es un detalle de nombre.** Un aporte puede venir
  de una campaña, de un PROYECTO, de un BLOQUE de la página de aportes o del
  club a secas. Un filtro que sólo listara campañas haría desaparecer del
  listado a todos los demás sin que nadie supiera por qué. Hay
  `DESTINO_SIN_DECLARAR` para los anteriores a v4.844: existen y tienen que
  poder filtrarse como grupo.
- **El catálogo de destinos sale de los aportes REALES**, no de una lista de
  campañas, y se arma ANTES de filtrar — si saliera de los filtrados, elegir un
  destino haría desaparecer del desplegable a todos los demás y no habría forma
  de volver. Lo comprueba una prueba mirando el orden en el archivo.
- **El destino se agrupa con `originOf`**, el mismo criterio con que se rotula
  la ficha del aportante y el recibo. Un segundo criterio de origen daría dos
  verdades sobre el mismo aporte.
- **Se DICE cuántos aportes dejó fuera el filtro** (`excluidos`). Sin ese
  número, quien filtra no distingue «este período no tuvo aportes» de «el filtro
  se comió algo». Y el vacío CON filtro dice algo distinto que el vacío sin
  filtro, con la salida a mano.
- **Una fila sin fecha legible se INCLUYE.** Descartarla haría desaparecer
  dinero de la pantalla por un dato ausente, que es el error que este módulo no
  puede cometer.
- **El último día entra ENTERO** (`finDelDia`). Acotar «del 1 al 15» a las 00:00
  del 15 se come el último día y nadie entiende por qué falta un aporte.
- **Un rango a mano invertido se endereza** —es un error de dedo— y uno sin
  ninguna punta degrada a `todo` en vez de vaciar la lista: ante la duda se
  muestra de más, porque esconder dinero es el lado caro.
- **El período lo resuelve el SERVIDOR y viaja resuelto.** La pantalla no rehace
  la aritmética de fechas: con dos cálculos, el rótulo del selector y las filas
  de la lista podrían discrepar sobre qué días entran. Lo comprueba una prueba
  buscando aritmética de fechas en el `.tsx`.
- **El rango personalizado no pide nada hasta tener sus DOS fechas.** Con una
  sola, el servidor lo degrada a `todo` y el selector diría una cosa y la lista
  otra.
- **Al cambiar un filtro se recarga en SILENCIO.** Con el esqueleto de carga
  completo, cada cambio haría parpadear la pantalla entera — incluida la caja
  del saldo, que ni siquiera se filtra.
- **Los filtros van en su PROPIA línea**, debajo del selector de moneda y no a
  la derecha del título: con cuatro controles en una fila se rompe en un
  portátil.
- **El resumen del período es por MONEDA y nunca se suma entre ellas**, y si esa
  moneda no tuvo nada en el período no se pinta — cuatro ceros no informan.
  Un aporte sin movimiento asociado aporta su bruto y NO sus retenciones: se
  cuenta lo que se sabe y se DICE cuántos quedaron sin medir, en vez de
  inventarles una comisión.
- **Que el filtro LLEGUE a la petición se comprueba en un navegador.** Una
  dependencia que falta en un `useCallback` no la ve el typecheck: es la lección
  de `conQr` (v4.836) y `profileId` (v4.838). El smoke guarda las URLs pedidas.

**Pendiente de los bloques B y C:** exportar a Excel y PDF lo filtrado, y la
varita de análisis. Sobre el PDF, la restricción ya conocida: **Vercel no tiene
ninguna fuente instalada** (medido en v4.794), así que se compone en el
NAVEGADOR, como `designRender.ts` y `qrcode.ts`. Y sobre la varita, la regla del
sitio: los hallazgos los calcula el código con reglas y el modelo sólo los
REDACTA — darle la base a un modelo y pedirle «analizá» produce cifras plausibles
y no auditables, que en un informe financiero descargable es peligroso.

⚠️ **Antes de publicar la exportación conviene cerrar los reversos de los netos
mal calculados** (los aportes anteriores a v4.845, que el libro reproduce mal a
propósito). Un número equivocado en pantalla se corrige y desaparece; uno en un
PDF que alguien archivó, no.

### La Bóveda se exporta: Excel, CSV y PDF (v4.850, bloque B)

Tres botones al final de la línea de filtros. Se exporta LO QUE SE VE.

| Archivo | Qué es |
|---|---|
| `src/lib/walletReport.ts` | El INFORME. **Puro**: filas, totales, contexto y avisos |
| `src/lib/walletExport.ts` | Los tres formatos, todos leyendo ese mismo informe |

Pruebas: `npm run test:wallet:export` (46 casos, **sin base ni red**) y 9
comprobaciones de navegador que **descargan los tres archivos de verdad**.

**Reglas durables:**

- **UN APORTE ANÓNIMO NO LLEVA CORREO AL ARCHIVO.** El correo sigue guardado y
  la pantalla lo tiene, así que se habría colado en un archivo que va a una
  junta o por correo. Un dato que en pantalla es de quien administra el sitio
  deja de serlo en cuanto se descarga.
- **Cada fila declara si su comisión se MIDIÓ o se estimó**, y el archivo avisa
  cuántas son estimadas. Es lo que hace que el informe se pueda usar para
  cuadrar mientras existan aportes anteriores a v4.845 con el neto aproximado.
- **UN INFORME ES DE UNA MONEDA.** Uno «de todas» exigiría un total que las
  sume. En un archivo la regla pesa más que en pantalla: la pantalla se
  corrige, un archivo que alguien archivó, no.
- **Los tres formatos leen el MISMO informe.** Escribir cada uno por su cuenta
  daría tres verdades sobre el mismo período — es la razón por la que
  `buildPiece` es único en las Infografías de Campaña.
- **Se compone en el NAVEGADOR.** Vercel no tiene ninguna fuente instalada y
  componer texto en el servidor saca cuadritos (medido en v4.794). `jspdf` y
  `xlsx` ya eran dependencias y se importan de forma PEREZOSA: quien entra a
  mirar su saldo no las descarga. **No mover esto al servidor.**
- **El CSV lleva BOM y separador PUNTO Y COMA.** Sin BOM Excel abre los acentos
  como «RodrÃ­go»; con coma mete toda la fila en una sola columna, porque en
  configuración regional española el separador de lista es el punto y coma. Un
  CSV que Excel abre mal es un CSV que nadie usa. Y todo texto se cita: un
  nombre con coma partiría la fila y correría el resto.
- **Los importes van como NÚMERO en el Excel**, no como texto con su símbolo:
  una hoja en la que no se puede sumar una columna no sirve para lo que se pide
  una hoja.
- **El contexto va DENTRO del archivo** —sitio, moneda, período con sus fechas,
  destino, emisión y totales—, no sólo en el nombre. Y los avisos también: quien
  lo abra dentro de seis meses no tiene la pantalla delante.
- **El saldo del archivo va rotulado «actual»**, aparte de los totales del
  período. Sin esa etiqueta se leería como si el filtro lo hubiera calculado —
  misma regla que el aviso de la pantalla.
- **El PDF va en HORIZONTAL y deja fuera dos columnas** (`Base` y `Referencia`,
  que sí van en el Excel, que es donde se audita): en vertical las doce columnas
  obligan a una letra que no se lee en un teléfono, que es donde se mira.
- **Los botones sólo salen si hay algo que exportar**, y cada uno dice DE QUÉ
  MONEDA es: tres botones que sólo dijeran «Excel», «CSV» y «PDF» no distinguen
  los dos archivos que esta pantalla puede emitir.
- **La prueba DESCARGA los tres archivos**, no comprueba que el botón exista.
  Las librerías se importan de forma perezosa y sólo se resuelven al pulsarlo:
  el arnés las marcaba como externas y la exportación moría con «Failed to
  resolve module specifier» — una prueba que no puede fallar donde el código
  falla no prueba nada.

**⚠️ `movementOf` NO usa los nombres de la columna de la base**, y van TRES
tropiezos con esto en dos versiones: la retención viaja como `applicationFee` y
el neto como `amount`, mientras la tabla los llama `applicationFee` y
`netAmount`. Leerlos con el nombre de la columna **no da error**: da `undefined`,
que cae a cero, y una columna entera sale en cero pareciendo un dato. Pasó en el
resumen del período, en la base de la comisión y en la fila del informe. Al leer
un movimiento, mirar `movementOf` — no la tabla.

**Y por eso el resumen del período se movió a `walletFilters.js`**: en el
controlador no se podía probar —importa la base— y ahí se coló el primero de los
tres.

### Los filtros y las descargas comparten línea con el saldo (v4.851)

Pedido expreso del equipo: período → campaña → Excel · CSV · PDF, todo en la
MISMA línea de los chips de moneda y alineado a la derecha (`ml-auto` dentro de
un `flex flex-wrap`).

- **La v4.850 los separaba en dos líneas por miedo a que no cupieran**, y el
  miedo era razonable. El ajuste no lo ignora: la fila ENVUELVE, así que en
  pantalla ancha va todo en una línea y al estrecharse el grupo de la derecha
  baja solo — que es exactamente la disposición anterior. Medido con el CSS
  compilado: fila 1132 px, chips 256, grupo derecho 788.
- **El filtro de campaña se muestra con UNA sola**, invirtiendo a propósito la
  regla del sitio «un control que no controla nada». El motivo que aquella regla
  no contemplaba: acá el desplegable no sólo filtra, NOMBRA de qué campaña vino
  el dinero, y eso el administrador lo quiere ver sin abrir ninguna ficha.

**⚠️ EL ARNÉS DE NAVEGADOR NO CARGABA NINGÚN CSS**, y eso invalidaba toda
comprobación de disposición: la página se montaba con `display: block` en todo,
las clases estaban en el DOM y las reglas no existían. Las primeras medidas de
esta versión daban los dos grupos a 1484 px —el ancho del contenedor— porque
eran bloques, no elementos flex. Es la lección de v4.719 —una clase que no llega
al CSS no existe, en silencio— aplicada al propio arnés. Ahora se inyecta
`dist/assets/index-*.css` y las medidas son reales; sin `dist/` se salta ese
bloque y el resto de la prueba sigue valiendo. **Al comprobar disposición en una
prueba de navegador, verificar primero que el CSS esté cargado** — si no, pasa
por los motivos equivocados.

**Pendiente del bloque C:** la varita de análisis. La regla del sitio ya está
decidida: los hallazgos los calcula el CÓDIGO con reglas, cada uno con su
evidencia, y el modelo sólo los REDACTA. `descargarPDF` ya acepta ese texto y lo
pinta DEBAJO de las cifras — lo que manda es el dato.

### La Bóveda Central: todos los sitios, sin mezclar (v4.853, Fase 1)

El Administrador Central abre en una vista consolidada de la plataforma; el
administrador de un sitio sigue viendo exactamente lo de siempre.

| Archivo | Qué es |
|---|---|
| `server/lib/centralWallet.js` | El CRITERIO. **Puro**: fila por sitio y moneda, consolidación, take rate y ticket promedio |
| `getCentralOverview` en `payoutController.js` | Dos consultas agregadas sobre `Payment` y `PayoutRequest` |
| `src/components/admin/CentralVault.tsx` | La vista consolidada, de sólo lectura |
| `GET /api/payouts/admin/overview` | Del OPERADOR de la plataforma |

Pruebas: `npm run test:wallet:central` (32 casos, **sin base ni red**) y
`npm run test:wallet:central:ui` (13, navegador con la API interceptada).

**Reglas durables:**

- **CONSOLIDAR NO ES MEZCLAR, y son DOS ejes que no se cruzan.** El primero es la
  MONEDA: una tarjeta por moneda y ninguna cifra que sume COP con USD — la regla
  del módulo desde v4.841, agravada acá porque el error se multiplicaría por la
  cantidad de sitios alojados. El segundo es el SITIO: un total consolidado es
  legítimo —«¿cuánto movió la plataforma este mes?» es una pregunta real— pero
  **no sustituye al detalle**, y toda fila conserva su `clubId`. Las dos
  preguntas son distintas y ninguna reemplaza a la otra: lo del Distrito 4281 es
  del Distrito 4281, no de un fondo común.
- **LA BÓVEDA LOCAL NO SE TOCA.** Es la exigencia expresa del pedido y por eso
  `computeBalances` sigue acotado a un club y una prueba lo comprueba sobre el
  archivo. Lo central AGREGA una vista; no cambia una línea de cómo cada sitio
  calcula lo suyo ni de cómo se piden los retiros.
- **La comisión del procesador se DERIVA** (`bruto − plataforma − neto`), igual
  que en el libro mayor y por el mismo motivo: aceptarla de fuera permitiría un
  desglose que cuadra porque alguien mandó el número que hacía falta. Y las dos
  retenciones son DOS campos, no uno: fundirlas haría imposible contestar
  «¿cuánto monetiza Club Platform?», que es justamente la pregunta que esta
  pantalla existe para responder.
- **El disponible usa el MISMO criterio que la Bóveda local** (`neto − retirado`,
  acotado en cero dentro de SU moneda). Un segundo criterio daría dos cifras
  distintas para el mismo club en dos pantallas de la misma plataforma.
- **DOS CONSULTAS AGREGADAS, NO UNA POR SITIO.** Los aportes se agrupan en la
  base con `GROUP BY p."clubId", p.currency` y los retiros con `GROUP BY
  "clubId", currency`. Trayendo las filas y sumándolas fuera, la central sería
  inusable con el segundo cliente grande — es el punto de escalabilidad del
  pedido. Una prueba comprueba sobre el archivo que no haya `await db.query`
  dentro de un bucle.
- **⚠️ Los dos modos se deciden por ROL, no por si hay sitio.** La forma
  aparentemente natural —«sin club, vista central»— **no funciona**: el operador
  entra por el dominio de la plataforma y `by-domain` le devuelve el sitio
  «Origen», así que «no hay club» nunca es cierto para él. `esOperador` decide
  el modo y `sitioElegido` lo abandona; todas las consultas de la pantalla usan
  `clubIdActivo`, no `club?.id`.
- **`null` es «no se sabe», NO «cero por ciento».** Sin bruto, el take rate no es
  0 %: es que no hubo nada que cobrar. Misma regla que el costo sin tarifa
  configurada en el panel de auditoría del Creador de Reels — un cero es una
  afirmación, un hueco es la verdad.
- **Por defecto sólo se listan los sitios que recaudaron**, y se dice cuántos son
  de cuántos. Sin ese filtro la tabla lista cientos de sitios en cero y el que
  importa se pierde entre ellos; sin el recuento, quien filtra no sabe qué dejó
  fuera.
- **Un retiro en una moneda sin aportes se REPORTA, no se resta contra otra.**
  Hasta v4.840 `PayoutRequest.currency` no se escribía y toda fila vieja quedó en
  USD por omisión: adivinar cuál era es adivinar cuánto dinero salió. Mismo
  criterio que la carga hacia atrás del libro.
- **El redondeo se hace UNA vez al final, no por fila.** Acumular redondeos corre
  el total en los céntimos, y acá se acumulan tantos como sitios haya.
- **La fuente se DECLARA** (`fuente: 'payments'`) y está escrito por qué todavía
  no lee del libro mayor: el libro está en sombra y su carga hacia atrás no se ha
  corrido en producción. Cuando el informe de conciliación cuadre, se cambia acá
  —en un solo sitio— y la pantalla podrá decirlo sin que nadie lo adivine.

**Lo que sigue:** los reversos de los netos mal calculados (aportes anteriores a
v4.845, que el libro reproduce mal a propósito), el `campaignId` en el libro, y
el cambio de fuente de los saldos —**sólo cuando el informe cuadre**—.

### La tarifa vive en un solo sitio (v4.854, Fase 2)

El 5 % que retiene la plataforma estaba escrito a mano en **cinco** sitios. Ahora
es un criterio puro, configurable desde el panel por moneda y por sitio.

| Archivo | Qué es |
|---|---|
| `server/lib/feeRules.js` | El CRITERIO. **Puro**: cascada, cálculo, validación y cómo se explica |
| `server/lib/feeRulesStore.js` | La I/O: `PlatformConfig`, caché e invalidación |
| `src/components/admin/FeeRulesPanel.tsx` | El panel, dentro de la Bóveda Central |
| `GET`/`PUT /api/payouts/admin/fee-rules` | Del operador de la plataforma |

Pruebas: `npm run test:fee-rules` (58 casos, **sin base ni red**) más 9 de
navegador dentro de `test:wallet:central:ui`.

**Reglas durables:**

- **DESPLEGAR ESTO NO CAMBIÓ NINGUNA CIFRA**, y es la comprobación que lo
  autoriza: `DEFAULT_RULES` reproduce exactamente lo que había, **incluido el
  estimado escrito para dólares y aplicado a toda moneda**. Se corrigió la
  duplicación, no la tarifa.
- **⚠️ SINCRONIZAR NO PUEDE APLICAR LA TARIFA DE HOY A UN COBRO DE AYER.**
  `syncPaymentsWithStripe` recalculaba `totalAmount * PLATFORM_FEE_PERCENTAGE`, y
  con la tarifa escrita a mano daba siempre lo mismo, así que el defecto era
  invisible. En cuanto la tarifa se puede cambiar desde el panel, recalcular es
  **reescribir la historia financiera de un cobro que ya ocurrió** — lo que el
  rediseño prohíbe expresamente. Ahora se usa `payment.applicationFee`, y sólo se
  calcula cuando falta. Al agregar un cálculo sobre un pago existente,
  preguntarse si el dato ya está guardado.
- **No hace falta una columna nueva en `Payment`, y no se agregó.** El importe
  retenido ya se guarda, así que la tasa se reconstruye dividiendo y la historia
  está preservada por construcción. Una columna en un modelo de Prisma que
  todavía no existe en la base deja en 500 toda consulta que lo toque —la regla
  de `logo_intl` (v4.699)— y acá caería sobre el cobro.
- **La cascada va de lo particular a lo general**: acuerdo del SITIO → tarifa de
  la MONEDA → general. Y **`0` es una tarifa válida**: con `||` en vez de una
  comprobación de nulo, un club exento se leería como «no configurado» y volvería
  a pagar el 5 %.
- **`source` dice de dónde salió cada mitad.** Sin él, «¿por qué a este club se
  le retuvo el 2 %?» no se puede contestar dos semanas después — el mismo vacío
  que el CRM tenía antes de `CrmWebhookEvent`.
- **⚠️ El estimado del procesador era `(total * 0.029) + 0.30` PARA TODA
  MONEDA.** El 0,30 es el componente fijo en DÓLARES de la tarifa de Stripe,
  aplicado tal cual a un cobro en pesos. **No se inventó** la tarifa real de
  Stripe en Colombia —es un dato que hay que mirar en su panel, y la regla del
  sitio prohíbe fabricarlo—: se conserva el valor heredado, se AVISA en la
  pantalla y ya se puede configurar por moneda.
- **La comisión se REDONDEA a la unidad de su moneda** y se acota al bruto. Sin
  redondeo, la de un cobro en pesos salía con decimales que el peso no tiene —el
  defecto de `roundMoney(8.915)` por la otra punta—; sin el tope, una tarifa fija
  mayor que el aporte daría un neto negativo.
- **El operador escribe, el CÓDIGO decide.** Escribir «5» queriendo decir 5 % se
  RECHAZA con su motivo en vez de interpretarse: adivinar ahí es quedarse con el
  500 % de un aporte. Y los errores se devuelven TODOS —«configuración inválida»
  a secas obliga a probar campo por campo—.
- **Los avisos NO bloquean.** Tratarlos como errores convierte cualquier
  observación en un bloqueo y se dejan de leer. Y se recalculan **al leer**, no
  sólo al guardar: una configuración que se dejó a medias hace meses tiene que
  seguir diciéndolo.
- **El catálogo de reglas es CERRADO** (`SCOPES`). Sin esa puerta podría aparecer
  una tercera retención que nadie sabe de dónde salió.
- **Un guardado parcial no deja la plataforma sin tarifa** (`mergeRules`). Misma
  regla aditiva que `putAuto` con las traducciones.
- **Leer la tarifa NUNCA lanza y va cacheada.** Esto corre en el camino del
  cobro: una configuración ilegible degrada a la vigente —que es lo que había
  antes— en vez de tumbar un pago, y sin caché cada aporte pagaría un viaje a la
  base para leer un número que cambia una vez al año. Toda escritura invalida.
- **El panel vive DENTRO de la Bóveda Central**, no en una pantalla propia: la
  tarifa es lo que explica el take rate que se está mirando justo encima. Nace
  plegado —se toca una vez al año— pero **su cabecera dice la tarifa vigente y
  cuántos avisos hay**: plegar no puede esconder un problema (v4.826).
- **El panel dice ANTES de que se toque nada que el cambio no reescribe los
  cobros anteriores.** Es la pregunta que se hace quien va a mover una tarifa, y
  sin respuesta a la vista no la mueve.
- **El porcentaje se guarda en tanto por uno y se ESCRIBE en por ciento.** Nadie
  teclea «0.05» pensando en una comisión. La conversión vive en un solo sitio y
  una prueba de navegador comprueba que lo que SALE hacia el servidor sea `0.03`
  y no `3` — una dependencia que falta o una conversión olvidada no las ve el
  typecheck (la lección de `conQr` y `profileId`).

### Corregir la retención de un aporte ya registrado (v4.861)

`server/lib/feeRecalc.js` (**puro**) + `POST /admin/fee-rules/recalculate`.
Pruebas: `npm run test:fee-recalc` (42 casos) y la sección 6b de
`test:fee-rules:route`, que ejercita el camino real.

- **⚠️ ESTO NO CONTRADICE LA REGLA DE v4.854; LA COMPLEMENTA.** Aquélla prohíbe
  que sincronizar RECALCULE —un cálculo que se dispara como efecto secundario de
  otra operación reescribe la contabilidad sin que nadie lo decida— y sigue
  intacta: una prueba comprueba sobre el archivo que `syncPaymentsWithStripe`
  siga usando la retención guardada. Lo que se agrega es la vía DELIBERADA que
  la propia especificación del rediseño pide («si se necesita corregir, crear un
  *adjustment entry*; no sobrescribir historia financiera»). Lo que separa una
  corrección de una reescritura son tres cosas: la pide una persona, queda
  registrada, y tiene un límite demostrable.
- **EL LÍMITE ES «TODAVÍA NO SE PUEDE RETIRAR», y el motivo es que es lo único
  DEMOSTRABLE.** No hay vínculo por fila entre un `Payment` y el retiro que se lo
  llevó —`PayoutRequest` es por club y por importe—, así que «¿este aporte ya se
  giró?» no se puede contestar. Lo contrario sí: con `clubAvailableOn` en el
  futuro, no puede haber salido en ningún retiro. Sin fecha NO se toca: ante la
  duda, no se corrige.
- **El límite va en el WHERE y OTRA VEZ en el UPDATE.** Entre leer y escribir
  puede pasar el tiempo, y el candado sobre `applicationFee` hace que dos vueltas
  simultáneas no se pisen — mismo criterio que `ingestScene`.
- **LA COMISIÓN DEL PROCESADOR NO SE TOCA.** No es nuestra y muchas veces está
  MEDIDA contra el balance transaction de Stripe: recalcularla sería inventar. Se
  deduce de lo guardado (`bruto − neto − plataforma`, lo mismo que hace
  `movementOf` para pintarla) y se vuelve a restar tal cual. **Si se moviera sólo
  la retención sin recalcular el neto, la comisión de Stripe —que es derivada—
  absorbería la diferencia** y la ficha mostraría una comisión de proveedor que
  nunca ocurrió.
- **De ENSAYO por defecto**, como el backfill del libro. Y lo que NO se pudo
  corregir se devuelve agrupado por motivo, con ejemplos: sin eso, «no pasó nada»
  es indistinguible de «no se pudo».
- **La traza es una LISTA** (`feeCorrections` en `rawPayload`): valor anterior,
  nuevo, regla, quién y cuándo. Una segunda corrección no borra la primera. Sin
  ella, «¿por qué éste retiene 2,1 % y aquél 5 %?» no tiene dónde mirarse.
- **Los totales son POR MONEDA**, como en todo el módulo. Acá el error sería
  sobre una corrección de dinero, que es peor.
- **Las pruebas usan los números REALES del reporte** —50.000 COP con comisión
  medida de 3.629, y US$ 10 con 0,59—, no unos inventados para que pasen. Misma
  exigencia que las cifras del sismo en `test:contribution`.

### Lo que la plataforma comisionó, en la barra (v4.863)

El indicador de dinero de la barra superior mide **dos cosas distintas según
dónde se mire**, y por eso cambia de icono y de rótulo.

- **En el sitio de un club es su SALDO** —dinero suyo que va a recibir—. **En el
  panel de Club Platform es la UTILIDAD**: lo retenido por prestar el servicio.
  Hasta v4.862 mostraba «US$ 0,00», el saldo del sitio «Origen», que no recauda
  nada: una cifra que no significaba nada. Dejar los dos con el mismo aspecto y
  el mismo texto sería el defecto que esta reingeniería vino a quitar — dos
  rótulos iguales con dos cifras que significan cosas distintas.
- **⚠️ Se decide por CONTEXTO DE PLATAFORMA (`isUIAdmin`), no por «no hay
  club».** En el dominio de la plataforma `by-domain` devuelve «Origen», así que
  «no hay club» nunca es cierto para el operador — la misma lección que la
  Bóveda Central (v4.853). Un operador que entra por el dominio de un club está
  mirando ESE club y sigue viendo su saldo.
- **Por moneda y nunca sumadas.** Los pesos comisionados no son dólares; acá el
  error sería sobre la utilidad de la empresa.
- **Un administrador de sitio no la ve, y la consulta NI SIQUIERA SE EJECUTA.**
  Esconder en la pantalla un dato que el servidor manda no lo protege: quien
  conoce el endpoint lo ve igual.
- **La cifra es GLOBAL, sin filtro de club.** La pregunta es «¿cuánto ha ganado
  Club Platform?», no «¿cuánto con este sitio?»: con filtro, el número cambiaría
  de significado según por dónde se entre. Lo comprueba una prueba mirando el
  SQL que se ejecutó.
- **Es `applicationFee`, la retención NUESTRA** — no la tarifa de Stripe, que es
  del procesador y no es un ingreso.
- **No se cae al campo suelto `availableFunds`** cuando falta la lista: ese
  respaldo es del SALDO y mostraría el de «Origen» como si fuera lo comisionado.
- Pruebas: `npm run test:platform-revenue` (15 casos, **sin base ni red**),
  sobre el endpoint REAL — el criterio puede estar bien y el defecto vivir en el
  camino (v4.744).

## El ciclo de vida de un aporte — v4.885

Reporte con captura: aportes del 19, 20 y 21 de agosto todavía «En tránsito» el
24, y ninguna forma de registrar que el dinero se trasladó al beneficiario.

| Archivo | Qué es |
|---|---|
| `server/lib/walletLifecycle.js` | El CRITERIO. **Puro**: estados, `bucketOf`, calendario de liberación, transiciones legales, validación del desembolso y la línea de tiempo |
| `server/lib/ensureDisbursementSchema.js` | Crea `PaymentLifecycleEvent` y `Disbursement` en runtime |
| `server/lib/paymentLifecycle.js` | La I/O de la traza: escribir eventos y leerlos |
| `server/lib/disbursements.js` | La I/O del desembolso: registrar, reversar, comprobante y aviso |
| `server/lib/walletSweep.js` | El barrido: reconcilia con Stripe y avanza estados |
| `server/lib/walletReconcile.js` | La pasada histórica, de ensayo por defecto |
| `server/controllers/disbursementController.js` | La API |
| `src/components/admin/wallet/DisbursementSection.tsx` | Calendario, línea de tiempo, desembolsos y el modal |

Pruebas: `npm run test:wallet:lifecycle` (119 casos, **sin base, credenciales ni
red**). Verificadas a la inversa: reintroduciendo el defecto, seis fallan.

**Reglas durables:**

- **⚠️ «PENDING» NO ES UNA FECHA, y ésa era la causa raíz.** `bucketOf` decía
  `if (p.stripeStatus === 'pending' || (p.availableOn && availableOn > now))
  return 'in_transit'`, y **la primera mitad de esa condición no dependía del
  tiempo**. `stripeStatus` lo escribe el webhook con lo que Stripe contesta EN
  EL MOMENTO DEL COBRO, y en ese momento una balance transaction está SIEMPRE
  en `pending`: el dinero acaba de entrar. Así que **todo aporte nacía en
  «pending» y se quedaba «En tránsito» para siempre**, hubieran pasado seis días
  o seis meses. Ahora una **fecha vencida gana sobre una columna sin
  actualizar**: una fecha vencida es un hecho, una columna vieja es una opinión
  desactualizada.
- **⚠️ Y LO ÚNICO QUE ACTUALIZABA ESA COLUMNA ERA UN BOTÓN MANUAL** que, por
  defecto, **excluía de sus candidatos a los pagos que ya tenían
  `availableOn`** (v4.846 lo acotó a los que les faltara `stripeFeeRate`). O
  sea: el aporte que más necesitaba corregirse era justo el que el botón no
  miraba. Hacen falta las DOS mitades —el criterio corregido y el barrido
  automático—: sin la primera, la pantalla mentiría hasta que corriera el cron;
  sin la segunda, la columna mentiría para siempre y el libro mayor nunca se
  enteraría de la liberación.
- **LA REGLA DE LOS 6 DÍAS SE AUDITÓ Y NO SE CAMBIÓ.** Son DOS esperas
  encadenadas con orígenes distintos: `availableOn` es la fecha **oficial** de
  Stripe (`balance_transaction.available_on`) —no la calculamos, la leemos— y
  `clubAvailableOn` es ésa **más 6 días CALENDARIO**, que es el margen operativo
  de la plataforma. Que sean calendario y no hábiles está **medido**, no
  supuesto: el código vigente suma `6 * 24 * 60 * 60 * 1000`, o sea 144 horas
  corridas. Cambiarlo a días hábiles movería la fecha de todos los aportes
  vivos, y eso es una decisión de negocio, no la corrección de un defecto.
- **⚠️ NO SE INVENTA UNA FECHA DE STRIPE QUE STRIPE NO DIO.** Cuando
  `availableOn` falta —la balance transaction no existía cuando el webhook la
  buscó, que es el caso común— se puede ESTIMAR para pintar un contador, pero
  esa estimación viaja **marcada** (`estimado: true`), se dice en la pantalla y
  **nunca decide un bucket ni dispara un asiento**. Presentar un promedio propio
  como si fuera el calendario del proveedor es lo que hace que alguien
  planifique un pago contra una fecha que no existe.
- **⚠️ `Payment` NO GANÓ NI UNA COLUMNA, y es la decisión más cara de la lista.**
  Era el camino corto —un `lifecycleState` y listo— y no se hace: `Payment` y
  `Donation` se consultan con `findMany` **sin `select`** en media plataforma,
  así que Prisma pide TODAS las columnas del esquema y una declarada y todavía
  inexistente deja esas consultas en **500** (regla de `logo_intl`, v4.699). El
  `build` no ejecuta `db push` desde el incidente del 2026-07-13, así que ese
  «hasta que alguien lo corra» no tiene fecha. Y lo que caería en 500 acá es
  **el webhook del cobro**. Las dos tablas nuevas viven fuera de Prisma, sin
  clave foránea a `Payment`, y están en la lista del guardián de `db:push`.
- **EL BARRIDO ES IDEMPOTENTE POR LA FORMA DE LA CONSULTA, no por un candado.**
  Los candidatos se eligen por CRITERIO —«a éste le falta la fecha», «a éste la
  columna se le quedó atrás»—, nunca por «a éste no lo he mirado», así que un
  pago corregido **deja de ser candidato solo** y correr el barrido diez veces
  hace trabajo la primera. Es el patrón que estrenó v4.846. Y no hay dinero que
  duplicar: el barrido **no crea ni un movimiento** —escribe fechas que vienen
  de Stripe, el mismo valor cada vez— y el único asiento que dispara lo protege
  el índice único de `LedgerTransaction`.
- **Cada 15 minutos y no cada uno.** `available_on` es una fecha con resolución
  de DÍA: mirarla sesenta veces por hora no la adelanta un segundo, y cada
  vuelta gasta una llamada a Stripe por aporte desactualizado. En régimen la
  mayoría de las vueltas no hacen nada, que es lo ESPERADO — por eso sólo se
  registra en consola cuando hubo algo.
- **La ventana del barrido son 120 días.** Un aporte sin resolver de hace cuatro
  meses no es un cobro lento, es uno roto, y gastar una llamada por él en cada
  vuelta deja sin atender a los vivos. Lo que queda fuera **no se pierde**: lo
  alcanza la reconciliación histórica, y el barrido lo dice.
- **⚠️ EL BARRIDO NO RECALCULA LA RETENCIÓN CON LA TARIFA DE HOY.** Es la regla
  de v4.854 y acá pesa más que en el botón: esto corre solo cada quince minutos,
  así que un recálculo silencioso movería el neto de todos los aportes vivos sin
  que nadie lo pidiera. Lo que sí se completa es la comisión del PROCESADOR
  cuando nunca se pudo leer — ahí no se corrige una decisión nuestra, se rellena
  un dato que Stripe no había dado.
- **EL CAMINO DEL DINERO NO RETROCEDE**, y no es estética: impide que un aporte
  ya desembolsado vuelva a «disponible» porque una consulta llegó tarde. Es la
  lección de `mergeDeliveryState` —los eventos de un proveedor llegan sin orden
  garantizado— aplicada a dinero, donde el precio de equivocarse es pagar dos
  veces. Las dos excepciones (reembolso y fallo) son HECHOS NUEVOS, no
  correcciones, y terminan el camino desde donde estén.
- **⚠️ DISPONIBLE NO ES DESEMBOLSADO.** «Disponible» contesta «¿se puede usar
  este dinero?»; «desembolsado» contesta «¿se trasladó?». La Bóveda contestaba
  la primera y no tenía dónde registrar la segunda, así que el traslado ocurría
  fuera de la plataforma y la única forma de saber si un aporte ya se había
  girado era preguntárselo a alguien.
- **SE ADMITEN PARCIALES y no se marca completo hasta que la suma llega.**
  Marcarlo con el primer giro afirmaría que el beneficiario recibió todo cuando
  recibió la mitad. Un desembolso **reversado no suma**: no trasladó nada. La
  tolerancia es media unidad mínima de la moneda, contra el punto flotante — sin
  ella, 1.484.437 pesos en tres giros exactos no cerraría nunca.
- **⚠️ UNA OPERACIÓN FINANCIERA CONFIRMADA NO SE BORRA.** No hay `DELETE` en
  `disbursements.js` ni ruta `DELETE` en la API, y su ausencia es deliberada.
  Corregir es REVERSAR: la fila se queda, se marca, se anota quién y **por qué**
  —un reverso sin motivo es un borrado con otro nombre— y deja de contar. Lo
  comprueban dos pruebas sobre los archivos.
- **⚠️ EL COMPROBANTE NO SE SIRVE DESDE UNA DIRECCIÓN PÚBLICA.** Se guarda la
  CLAVE de S3 —bajo `private/disbursements/`, aparte del resto de la Biblioteca
  para poder ponerle su propia política— y el enlace **se firma al pedirlo y
  caduca a los 5 minutos**. La clave **no viaja al navegador**: sólo
  `hasReceipt` y el nombre. Si viajara, bastaría abrir la consola para componer
  la URL del bucket. A diferencia de una foto, acá el contenido es un documento
  financiero con nombres y números de cuenta.
- **NO SE ESCRIBE UN SEGUNDO SISTEMA DE CORREO.** El aviso reutiliza
  `EmailService.sendPlatformEmail`, `renderTemplate` con sus bloques,
  `resolveSenderPlan` —que no envía jamás desde un dominio sin verificar— y
  `NotificationDelivery` para la traza. Un envío propio bifurcaría en silencio
  cómo escribe la plataforma y dejaría este correo fuera del panel de entregas,
  que es justo donde alguien lo va a buscar cuando digan que no llegó. Lo único
  propio es el DESTINATARIO: sale del formulario, no del perfil, porque quién
  recibe el dinero lo sabe el administrador que registró el traslado.
- **⚠️ SI EL CORREO FALLA, EL DESEMBOLSO NO SE REVIERTE.** El dinero se movió de
  verdad: deshacer el registro de un hecho financiero porque no salió un aviso
  sería cambiar un problema de comunicación por uno de contabilidad. Queda
  desembolsado y la notificación queda fallida y **reintentable**, con su motivo
  TEXTUAL a la vista.
- **`disbursed` entra al catálogo de notificaciones con `available: true`**, y
  la diferencia con `in_transit` —que sigue en `false`— es la fuente: aquél
  necesitaría que alguien nos avisara cuando Stripe libera y no hay quien lo
  haga, mientras que un desembolso es un **acto administrativo con nombre y
  comprobante** del que no hay ninguna duda.
- **EL DESEMBOLSO TIENE SU PROPIA PLANTILLA.** Con una sola, avisar de un
  desembolso saldría diciendo «gracias por tu aporte» a alguien que no aportó:
  el destinatario acá **recibe** dinero. Y `defaultTemplateFor` la devuelve para
  cualquier papel, invirtiendo a propósito la regla de arriba —ahí
  «beneficiary» no es un observador interno al que se informa de un movimiento
  ajeno—. **No se promete una fecha de acreditación**: sabemos cuándo se ordenó
  el traslado, no cuándo lo abona el banco.
- **⚠️ LA LÍNEA DE TIEMPO SALE DE LA BASE, NUNCA SE FABRICA EN LA PANTALLA.**
  Componerla en el navegador a partir de fechas sueltas afirmaría que algo
  ocurrió sin que nadie lo haya registrado, y entonces deja de servir para
  auditar — que es lo único para lo que sirve. Cada evento guarda estado
  anterior, estado nuevo, cuándo, **quién** (`system` / `user` / `provider`),
  referencia y observaciones.
- **UN EVENTO SE ANOTA CON LA FECHA EN QUE OCURRIÓ, no con la de hoy.** Un
  aporte que venció hace tres días venció hace tres días aunque lo descubramos
  ahora; anotarlo con la fecha del descubrimiento falsearía el historial. Por
  eso `occurredAt` y `createdAt` son dos columnas.
- **La idempotencia de la traza es un índice único** sobre `(paymentId, kind,
  toState)`. Sin él, un aporte acumularía un evento idéntico por cada vuelta del
  cron y la línea de tiempo sería ilegible en un día. Lo que SÍ puede repetirse
  —una notificación, un desembolso parcial tras otro— se escribe con
  `recordFact`, sin `toState`: en Postgres NULL es distinto de NULL, así que no
  se funden. **Son dos hechos, no dos anotaciones del mismo.**
- **⚠️ LA RECONCILIACIÓN NO INVENTA NADA PARA QUE LA PANTALLA SE VEA BIEN.** Lo
  que hace es PREGUNTARLE A STRIPE y escribir lo que Stripe conteste; si Stripe
  no contesta, o el pago no tiene referencia del proveedor, el aporte queda como
  está y **se reporta por qué**. Una Bóveda que se ve bien y miente es peor que
  una que enseña el problema.
- **De ENSAYO por defecto**, como `ledgerBackfill` (v4.848). Sin `apply: true`
  no escribe y devuelve lo que haría. Y **lo que no se pudo corregir es la mitad
  del informe**, agrupado por MOTIVO con ejemplos: un listado de doscientas
  filas no lo lee nadie, y sin esa parte «no pasó nada» es indistinguible de «no
  se pudo».
- **Registrar o reversar EXIGE confirmación explícita** (`confirm: true`, 428 si
  falta). No es ceremonia: la acción mueve el estado financiero de un aporte y
  puede mandar un correo a un tercero, y ninguna de las dos cosas se deshace
  pulsando «atrás». La confirmación **dice lo que va a pasar** —importe,
  beneficiario, a quién se avisa— en vez de preguntar «¿estás seguro?»: lo que
  hay que poder revisar es el hecho, no la certeza.
- **NO SE DESEMBOLSA LO QUE TODAVÍA NO ESTÁ DISPONIBLE.** Registrar el traslado
  de un dinero que el proveedor aún retiene sería anotar un hecho que no pudo
  ocurrir; se rechaza diciendo el estado y los días que faltan.
- **El aislamiento va en el `WHERE`, no en una comprobación posterior.** Ningún
  endpoint lee un pago por su id y mira después de quién es: el `clubId` del
  token entra en la consulta, así que para quien pregunta por un aporte ajeno
  **ese aporte no existe** — confirmar que existe ya es filtrar que existe. Y el
  permiso se comprueba en el SERVIDOR: esconder un botón no protege un endpoint
  de quien lo conoce (v4.868).
- **Los días restantes se redondean HACIA ARRIBA** y se ven en la fila **sin
  desplegar la ficha**. Es lo que se pidió eliminar: hasta ahora la única forma
  de saber cuándo se liberaba un aporte era abrirlo, mirar «Stripe libera» y
  sumarle seis días de cabeza. Prometer que algo está listo medio día antes es
  peor que decir un día de más.
- **`bucketOf` ya no vive en `financialController.js`**: aquél importa el puro.
  Un segundo criterio escrito a mano volvería a separarse en silencio, y lo
  comprueba una prueba sobre el archivo.
- **Las dos tablas están en la lista del guardián de `db:push`.**

### Lo desembolsado se ve y se marca en bloque (v4.886)

Segundo reporte, con la Bóveda del Sistema Central delante: **no aparecía la
opción de marcar un aporte como desembolsado**, el informe decía «5:
no_provider_reference» sobre cinco pagos, y faltaba un indicador de cuánto se
había trasladado.

- **⚠️ EL `SELECT` NO PEDÍA `providerRef`, Y EL FALLO ERA MUDO Y TOTAL.**
  `findCalendarCandidates` seleccionaba nueve columnas y la reconciliación
  pregunta `if (necesitaStripe && p.providerRef)`: con la columna sin pedir
  —`undefined`— **NINGÚN** aporte llegaba a consultarse contra Stripe y todos
  caían en «sin referencia del proveedor». Es exactamente el error que este
  archivo ya documentó en v4.847 con `clubId` y el asiento de liberación. Al
  agregar una lectura a `reconcileOne` o a `anotarAvance`, **agregar su columna
  al SELECT**; lo comprueba una prueba columna por columna, porque el código es
  válido, los tipos están bien y la condición simplemente nunca se cumple.
- **⚠️ «EN TRÁNSITO» SIGNIFICA DOS COSAS Y SÓLO UNA BLOQUEA** (`canDisburse`).
  Una es «el proveedor lo retiene» —hay una `availableOn` futura, o sea Stripe
  nos dio la fecha— y ahí registrar un traslado sería anotar un hecho que no
  pudo ocurrir. La otra es «no sabemos»: sin fecha, el aporte se pinta en
  tránsito porque es el lado seguro para MOSTRAR, no porque sepamos nada.
  v4.885 exigía `estado === 'available'` y con eso los cinco aportes sin fecha
  **no se podían desembolsar por ninguna vía**. Un control que no se puede
  satisfacer no protege: obliga a llevar la contabilidad fuera de la
  plataforma, que es lo que este módulo existe para evitar. Se permite y **se
  avisa con la consecuencia** («comprobá en tu banco que el dinero salió»).
- **⚠️ DESEMBOLSADO NO ES TRANSFERIDO, y por eso son dos tarjetas.**
  «Transferido» son los payouts al banco del CLUB —dinero que sale de la
  plataforma hacia él—; «Desembolsado» es el traslado al BENEFICIARIO final,
  que el club registra y puede ocurrir por fuera de un payout. Fundirlas
  contaría dos veces el mismo dinero en unos sitios y ninguna en otros.
- **La tarifa de la tarjeta va en VIOLETA, no en verde.** El verde ya es
  «Disponible para retiro», y dos tarjetas verdes seguidas se leen como la
  misma cosa contada dos veces — justo la confusión que este indicador existe
  para deshacer.
- **Se pinta SIEMPRE, aunque esté en cero.** Es la cifra que se lleva a un
  informe, y una tarjeta que aparece y desaparece según si hubo movimiento hace
  pensar que el módulo se rompió.
- **Las monedas de la Bóveda salen de los aportes Y de lo desembolsado.** Si
  sólo salieran de los aportes, un sitio que desembolsó en una moneda cuyos
  cobros ya se archivaron perdería esa tarjeta entera, y con ella la única
  cifra que dice a dónde fue ese dinero.
- **`disbursedTotals` agrega EN LA BASE** (`GROUP BY currency`), no trayendo
  las filas para sumarlas fuera: con un club grande serían cientos de filas por
  visita para calcular dos números. Criterio de `getCentralOverview` (v4.853).
- **⚠️ EL BLOQUE COMPARTE EL FORMULARIO, NO EL REGISTRO.** El servidor escribe
  **una fila por aporte**. Un movimiento agregado que cubriera cinco aportes no
  se podría reversar parcialmente, no se podría atribuir a su campaña y no
  cuadraría contra un extracto aporte por aporte — es la regla que separó
  `DistributionJob` de la campaña (v4.864) y `ReelScene` de `ReelProject`.
- **⚠️ Y EL MONTO NO SE RECIBE: se calcula por aporte como lo que le falta.**
  Dejarlo entrar del cuerpo permitiría repartir un total entre cinco aportes
  con un criterio que nadie puede reconstruir después. Un desembolso en bloque
  es «giré lo que quedaba de estos cinco»; si fue otra cosa, se registran de a
  uno.
- **El bloque NO es atómico y se dice.** Cada aporte se registra por su cuenta:
  si el tercero falla, los dos primeros quedan registrados —el dinero se
  movió— y el informe **nombra cuáles no entraron y por qué**. Envolverlo en
  una transacción sería peor: un fallo tiraría abajo registros de traslados que
  sí ocurrieron.
- **⚠️ EL COMPROBANTE DEL GIRO SÍ SE OFRECE EN EL BLOQUE** (v4.887, corrige
  v4.886). Aquélla no lo ofrecía con el argumento de que un mismo archivo en
  cinco filas afirmaría respaldar a cada una por separado. **El argumento era
  demasiado purista y el caso real lo desmiente**: si los cinco aportes
  salieron en UNA transferencia, hay un solo soporte y ése SÍ los respalda a
  los cinco. Lo que no se puede es presentarlo como el comprobante de un
  aporte suelto — y de eso se encarga el LOTE.
- **El archivo se sube UNA vez, fuera del bucle**, y las N filas comparten la
  clave: subirlo por aporte serían N objetos idénticos en S3 y N veces el mismo
  gasto de red. Su clave lleva el id del LOTE, no el de un aporte: el archivo
  no es de ninguno en particular. Lo comprueba una prueba mirando que la subida
  esté ANTES del bucle.
- **`batchId` agrupa los movimientos de un mismo giro y existe SIEMPRE**,
  también sin comprobante: sirve para un informe aunque no haya archivo. De él
  se DERIVA que el soporte es compartido —`batchSize` sale de la misma consulta
  que trae los desembolsos— en vez de guardar una segunda verdad que pueda
  contradecirse.
- **Y se DICE en la ficha**: «Ver comprobante del giro (5 aportes)» y «Salió
  dentro de un giro conjunto de 5 aportes». Rotularlo «Ver comprobante» a secas
  sería exactamente la afirmación que no se puede hacer.
- **⚠️ `batchId` se agrega con `ADD COLUMN IF NOT EXISTS` Y EL `ALTER` CORRE
  TAMBIÉN CUANDO LA TABLA YA EXISTÍA.** `CREATE TABLE IF NOT EXISTS` no amplía
  nada: una base que estrenó el módulo en v4.885 tiene la tabla sin la columna,
  y el `INSERT` fallaría con «column does not exist» —en silencio, porque este
  módulo degrada—. Es la regla de `EventRegistration` (v4.648): se AMPLÍA,
  jamás se recrea. Lo comprueba una prueba sobre el archivo.
- **Al añadir un segundo SQL en template literal, la prueba de las comillas
  invertidas se comprueba POR BLOQUE.** Buscar «del primer backtick al último»
  abarca el hueco entre los dos literales y da un falso positivo. Verificada a
  la inversa metiendo una comilla en un comentario del SQL.
- **El aviso por correo en bloque DICE cuántos correos son** antes de
  confirmar. Un desembolso por aporte es un aviso por aporte, y cinco correos
  seguidos a la misma dirección es algo que hay que saber antes, no después.
- **Los aportes elegidos se guardan ENTEROS, no por id.** La lista se filtra
  por período y por destino: uno elegido antes de cambiar el filtro tiene que
  sobrevivir a que la vista cambie — regla del panel de grupos (v4.876), y acá
  el precio de perderlo sería registrar de menos.
- **La casilla va FUERA del botón que despliega la ficha.** Anidar un control
  dentro de otro haría que marcar el aporte abriera también su ficha, y elegir
  veinte dejaría veinte fichas abiertas.
- **Un motivo técnico no se pinta en crudo** (`NO_CORREGIDO_LABEL`). En la
  captura se leía «5: no_provider_reference»: una clave interna, en inglés
  porque el traductor del sitio la trató como una frase, delante de alguien que
  sólo quiere saber qué le pasa a su dinero. Lo que no esté rotulado se pinta
  tal cual y **marcado como dato**, para que al menos no se traduzca — el error
  del proveedor se propaga textual y traducirlo lo vuelve irreconocible.

### El aviso del desembolso: varios destinatarios y WhatsApp (v4.888)

| Archivo | Qué es |
|---|---|
| `server/lib/disbursementNotice.js` | El CRITERIO. **Puro**: canales, saneado de correos y teléfonos, plantilla canónica de WhatsApp y las variables |
| `src/components/admin/wallet/NoticeRecipients.tsx` | Los destinatarios, COMPARTIDOS por los dos modales |

Pruebas: `npm run test:disbursement:notice` (71 casos, **sin base, credenciales
ni red**).

- **⚠️ WHATSAPP NO ADMITE TEXTO LIBRE HACIA UN DESCONOCIDO, y eso decide todo
  el diseño.** Fuera de la ventana de 24 horas desde el último mensaje
  entrante, Meta SÓLO entrega plantillas previamente aprobadas — y un
  beneficiario al que le vamos a avisar de un giro casi nunca nos escribió
  antes. Por eso el texto de WhatsApp está ESTANDARIZADO y es una constante del
  código, no algo que se redacte por sitio: lo que cambia son las variables. El
  CORREO no tiene esa restricción y sigue componiéndose con los bloques de
  `notificationTemplate.js`. Son dos canales con dos reglas y unificarlos sería
  inventar una limitación donde no la hay, o saltarse una donde sí.
- **⚠️ LAS VARIABLES DE META SON POSICIONALES, y el orden es el contrato.**
  `{{1}}`, `{{2}}`… no tienen nombre: reordenar `WA_VARIABLES` sin volver a
  someter la plantilla pone el nombre del beneficiario donde va el monto, y Meta
  **no da ningún error** — entrega el mensaje mal armado. Por eso el orden se
  declara UNA vez y de ahí salen tanto el cuerpo como los valores
  (`buildWaParameters`). Al agregar una variable, agregarla AL FINAL y volver a
  enviar la plantilla a revisión. Lo comprueba una prueba que cuenta los
  marcadores del cuerpo contra la lista.
- **La plantilla se SIEMBRA como borrador; NO se envía a Meta.** Someterla es un
  acto con consecuencia —un rechazo baja la calificación de calidad de la cuenta
  y puede limitar el volumen diario (v4.701)— y se hace desde Comunicaciones CRM
  → Plantillas, donde además se ve el estado de la revisión. La siembra es
  **aditiva e idempotente**: si ya existe no se pisa, porque a esa altura es del
  operador y puede haberla ajustado.
- **⚠️ SALE DEL WABA DE LA PLATAFORMA, no del sitio.** Es la regla del CRM desde
  v4.701 —«la plataforma es el único remitente; no hay un WABA por club»— y es
  justamente lo que hace posible una plantilla estandarizada: se aprueba UNA vez
  para todos los sitios y el nombre del sitio viaja como variable. Sin él, un
  beneficiario recibiría un WhatsApp de un número que no reconoce hablándole de
  un dinero, que es exactamente lo que parece una estafa.
- **`omitido` NO es `fallido`.** Fallido es que se intentó y el proveedor lo
  rechazó; omitido es que no se intentó porque falta un paso — y el paso se
  NOMBRA. Confundirlos manda a diagnosticar un problema de entrega donde lo que
  hay es una plantilla sin aprobar.
- **La pantalla DICE por qué WhatsApp no está disponible**, en vez de sólo
  apagar el campo. «No disponible» a secas obliga a adivinar entre la
  configuración, la plantilla y su aprobación, que se corrigen en tres sitios
  distintos.
- **⚠️ LOS TELÉFONOS LOS VALIDA `phone.js`, NO ESTE MÓDULO.** Aquél ya sabe
  distinguir un móvil colombiano de un fijo, cuándo anteponer el código de país
  y cuándo NO adivinar, y es el mismo que usa el CRM para todo lo que sale hacia
  Meta. Un segundo criterio daría dos formas de normalizar el mismo número, y
  entonces el aviso saldría a un destino y el registro diría otro. Se recibe
  como PARÁMETRO para que el criterio siga siendo puro.
- **Los correos se normalizan a minúsculas ANTES de deduplicar.**
  `Ana@Club.org` y `ana@club.org` son la misma persona, y con dos entradas
  recibiría el aviso dos veces. Es la misma normalización que `deliveryKey`
  (v4.855) y tiene que serlo, o la llave de idempotencia no coincidiría.
- **Lo que no se pudo interpretar se DEVUELVE con su motivo y su canal.** Un
  descarte silencioso deja a quien pegó cinco números sin saber cuál no entró, y
  lo que se pierde acá es que alguien no se entere de que le giraron.
- **Un resultado POR CANAL Y POR DESTINATARIO** (`notifyResults`). Con un solo
  estado, un aviso que llegó a dos de tres direcciones se vería como «enviado» y
  nadie sabría cuál falló. `parcial` es un estado real y presentarlo como
  «enviado» o como «fallido» sería mentir en las dos direcciones.
- **Las tres columnas son ADITIVAS y `notifyEmail` se conserva**: las filas
  escritas antes tienen ahí su única dirección, y borrarla las dejaría sin saber
  a quién se avisó. JSONB y no una tabla aparte porque NADIE consulta por
  destinatario: se leen siempre con su desembolso.
- **`NoticeRecipients` es UN componente compartido** por el modal de un aporte y
  el del bloque. Escrito dos veces, el día que se agregue un canal uno se queda
  atrás — el defecto que ya se pagó con la casilla de distritos (v4.748) y el
  selector de pools (v4.877).
- **Con varios aportes, cada destinatario recibe un aviso POR APORTE, y se dice
  ANTES de confirmar.** Cinco mensajes seguidos a la misma persona es algo que
  hay que saber antes, no después.

### ⚠️ Un typecheck que no comprueba nada sale en VERDE (v4.889)

Reporte: «después de marcar como registrado y confirmar, no aparece nada». El
botón del desembolso en bloque no producía ningún efecto.

- **La causa fue un RENOMBRADO A MEDIAS.** v4.888 cambió el estado del modal de
  `correo` a `correos` y agregó `telefonos`; la línea que arma el cuerpo de la
  petición se quedó con `notifyEmail: correo`. Es un `ReferenceError` DENTRO del
  `try`, así que caía en el `catch`, mostraba un toast genérico y devolvía al
  formulario — que se ve exactamente como «no pasa nada».
- **⚠️ Y EL TYPECHECK LO HABRÍA ATRAPADO, PERO NO ESTABA COMPROBANDO NADA.** Sin
  `node_modules`, `tsc -p tsconfig.app.json` falla al resolver `vite/client`
  (`TS2688`), **aborta antes de mirar `src`** y sale con **exit 0** y dos errores
  de configuración. Parece que pasó. En v4.885-v4.888 se dio por «cero errores
  propios» un typecheck que no había leído ni un `.tsx`.
- **LA SEÑAL ERA VISIBLE Y NO SE LEYÓ**: este archivo dice que el proyecto
  arrastra cientos de errores heredados, y el comando devolvía DOS. Un proyecto
  que de pronto está limpio no está limpio: es que no se miró.
- **`npm run check:typecheck` es la barrera** (`scripts/check-typecheck-real.mjs`).
  Falla si no hay `node_modules`, si aparece `TS2688` —sin sus tipos base `tsc`
  no comprueba nada— o si hay menos de 50 errores en `src`. **Correr `npm ci`
  antes de dar por verificado un cambio de frontend.** Verificado a la inversa:
  con el defecto reintroducido, `tsc` dice
  `TS2552: Cannot find name 'correo'. Did you mean 'correos'?`.
- **Y hay una SEGUNDA barrera que no depende de las dependencias**
  (`test:disbursement:notice`): comprueba sobre el archivo que los modales
  manden `notifyEmails`/`notifyPhones`, que el servidor lea esos mismos nombres
  y que no quede ningún `correo` suelto. Un renombrado a medias entre la
  pantalla y el servidor no lo ve ninguna prueba de criterio.
- **Sin beneficiario no se llega a la confirmación.** El servidor ya lo exigía
  —y sigue siendo quien decide— pero dejaba pasar a una pantalla que decía «se
  registrarán 5 desembolsos a —» y gastaba la petición para volver con cinco
  errores iguales. El motivo va A LA VISTA junto al campo: un botón apagado sin
  explicación se lee como que el módulo está roto.

### El estado de un aporte conoce su desembolso (v4.890)

Reporte con la lista delante: se marcan cinco aportes como girados, «no aparece
nada, siguen apareciendo ahí y el estado es todavía disponibles para retiro».
Eran DOS defectos encadenados y el primero tapaba al segundo.

- **⚠️ `createBulkDisbursements` USABA `destinatarios` SIN DECLARARLO.** v4.888
  agregó los destinatarios al desembolso de a uno y copió al bloque las líneas
  que los MANDAN sin traer la que los CALCULA: `ReferenceError` dentro del
  `try` → 500 → **ningún aporte se registraba**. Mismo renombrado a medias que
  v4.889, por la otra puerta.
- **⚠️ Y NADA LO VEÍA: EL SERVIDOR NO PASABA POR NINGÚN COMPROBADOR DE
  IDENTIFICADORES.** `npm run typecheck` mira `src` y esto es `.js` fuera de
  ese alcance; `check:syntax` da el archivo por bueno porque **parsea
  perfectamente** —es un error de EJECUCIÓN—; `check:hooks` corre ESLint sólo
  sobre `**/*.{ts,tsx}`; y las pruebas importan el criterio PURO y simulan la
  API, así que el cuerpo del manejador puede no ejecutarse nunca. Lo cierra
  `npm run check:server-undef` (en `prebuild`), que corre **una sola regla**,
  `no-undef`, por el mismo motivo que `check:hooks` corre una sola: con el juego
  completo el aviso que importa se pierde entre cientos heredados y el guardián
  se termina desactivando. Verificado a la inversa: reintroduciendo el defecto,
  señala las cuatro líneas.
- **⚠️ `bucketOf` NO SABÍA NADA DEL DESEMBOLSO**, y ése era el segundo defecto.
  Mira sólo las fechas del pago, así que un aporte girado entero al beneficiario
  seguía informándose `available` y la tarjeta pintaba «DISPONIBLE PARA RETIRO»
  en verde encima de un giro ya registrado. `bucketWithDisbursement` pliega el
  giro: el desembolso es el hecho **más tardío** del camino del dinero —`order`
  50 y 60, después de `available`— así que manda.
- **HAY UN VEREDICTO, NO DOS.** v4.886 resolvía esto con una segunda insignia
  violeta AL LADO de la verde, y las dos hablaban del mismo aporte diciendo
  cosas distintas: es la contradicción que este archivo ya prohibió dos veces
  (v4.787, indicador rojo bajo cabecera verde; v4.799, insignia verde sobre una
  tarjeta que grita «REQUIERE REGENERACIÓN»). Lo que queda junto a la insignia
  es cuánto falta cuando el giro fue parcial, en texto llano.
- **`refunded` y `failed` NO se tapan con «desembolsado».** No son etapas
  anteriores del camino sino HECHOS NUEVOS sobre el dinero mismo, y esconderlos
  detrás del giro escondería justo lo que hay que ver.
- **⚠️ EL DISPONIBLE PARA RETIRO SE CALCULA SOBRE EL ESTADO FINANCIERO Y RESTA
  LO GIRADO, aporte por aporte.** Sobre el estado plegado, un aporte girado a
  MEDIAS saldría entero del disponible y la cifra quedaría corta; con el total
  por moneda de `disbursedTotals` se restarían giros de aportes que nunca
  estuvieron disponibles y quedaría corta por el otro lado. Por eso el item
  declara `financialBucket` y `disbursedAmount` además del `bucket` plegado —dos
  preguntas distintas sobre el mismo pago, resueltas en el servidor y no
  deducidas otra vez en la pantalla—.
- **`computeBalances` NO se toca.** Es el cálculo autorizado de un payout y
  vive en el módulo de retiros; esta cifra es la de esta pantalla. Al cambiar
  una, mirar la otra.
- **Lo girado por aporte se pide en UNA consulta agregada** (`disbursedByPayment`,
  `GROUP BY "paymentId"`), no trayendo las filas ni con un `await` dentro de un
  `.map` —que además no se esperaría—. Criterio de `disbursedTotals` y de
  `getCentralOverview`.
- **`disbursing` y `disbursed` entraron a la lista de grupos de la Bóveda.**
  Estaban declarados en `LIFECYCLE_STATES` desde v4.885 y ningún agrupador los
  contemplaba: un aporte plegado a esos estados habría desaparecido de todos los
  grupos —y de los totales— en silencio.

**Variables de entorno:** ninguna nueva. `CRON_SECRET` protege
`/api/cron/wallet-tick` como al resto de los crons.

**Pendientes conocidos:** el desembolso **no asienta contrapartida en el libro
mayor** —hoy sólo el aporte y la liberación tienen asiento—; el evento
`in_transit` sigue declarado y sin implementar porque nadie nos avisa cuando
Stripe libera (hay que ir a preguntárselo, que es lo que hace el barrido); y la
plantilla del desembolso **no tiene todavía una pantalla en el panel de
Notificaciones** — se lee de `NotificationTemplate` si alguien la crea, y si no
sale la de fábrica.

## Aportes por PayPal — v4.866

Segunda vía de cobro en el modal de aportes, espejo del camino de Stripe.

| Archivo | Qué es |
|---|---|
| `server/lib/paypalSpec.js` | El CRITERIO. **Puro**: moneda, formato del importe, lectura de la captura, disponibilidad |
| `server/lib/paypalService.js` | La I/O: token OAuth cacheado, crear pedido, capturar, verificar la firma del webhook |
| `server/controllers/paypalController.js` | Disponibilidad, creación, captura y webhook |
| `src/pages/DonacionPaypal.tsx` | El retorno del donante, donde se COBRA |

Pruebas: `npm run test:paypal` (43 casos, **sin base, credenciales ni red**).

**Reglas durables:**

- **EL DINERO ENTRA A LA CUENTA DE LA PLATAFORMA** (`isPlatformCollection: true`),
  igual que con Stripe. Es la decisión del cliente y es lo que hace que todo lo
  demás siga funcionando: la retención se aplica igual, el saldo de la Bóveda
  sigue siendo la verdad y el club retira por donde retira hoy.
  `PaymentProviderConfig` modela una cuenta de PayPal POR CLUB desde hace
  versiones y **no se usa**: con el dinero entrando directo al club, el 2,1 % no
  se podría retener y el saldo de la Bóveda dejaría de ser real. Queda declarado
  y sin implementar, que es distinto de olvidado.
- **⚠️ NO SE INVENTA UNA TASA — pero convertir A LA VISTA sí se puede**
  (v4.870, supera la forma de esta regla, no su fondo). Hasta v4.869 acá no se
  convertía nunca y el botón no se mostraba. El motivo era bueno —«el visitante
  ya vio una cifra concreta»— y la consecuencia, inaceptable: **PayPal no
  procesa pesos colombianos**, así que en el sitio de un distrito colombiano el
  botón no aparecía JAMÁS, que es donde vive la mayoría de los aportes. La regla
  real del sitio nunca fue «no se convierte»: es la del `fx` de las
  inscripciones a eventos —`currency` es lo que se PUBLICA,
  `settlementCurrency` lo que COBRA la pasarela, y si difieren se convierte con
  una tasa **configurada** guardando los TRES datos—. **Sin tasa configurada no
  se convierte y el botón no se muestra**: eso no cambió.
  **`PAYPAL_CURRENCY` vacía significa «la que venga»** y es el valor por
  defecto — así se comporta como Stripe.
- **La comisión viene MEDIDA en la captura** (`seller_receivable_breakdown`), no
  estimada; la Bóveda ya distingue las dos desde v4.850. **Si viniera en otra
  moneda NO se resta**: restar una moneda de otra es el defecto que costó la
  v4.845 con Stripe. Y `null` es «no se sabe», no cero.
- **LA CONFIRMACIÓN LA DA EL WEBHOOK, no el retorno del navegador.** PayPal
  separa aprobar de cobrar, así que hay una pantalla que dispara la captura —
  pero el donante puede cerrar la pestaña. Las dos vías convergen en
  `registrarAporte`, que es idempotente: la protección es el índice único
  `(provider, providerRef)`, que ya distinguía proveedores, más el
  `PayPal-Request-Id` del lado de PayPal. Son dos barreras y las dos hacen falta.
- **LA INTENCIÓN SE GUARDA ANTES de mandar al donante a PayPal.** PayPal no
  acepta metadata arbitraria como Stripe: `custom_id` es UN campo de 127
  caracteres donde no entran la campaña, el bloque, el proyecto, el nombre y el
  mensaje. Sin esa fila `pending`, al volver no se sabría a qué campaña atribuir
  el aporte ni a nombre de quién emitir el recibo.
- **Campaña, bloque y moneda se IMPORTAN de `financialController`**, no se
  copian. Dos criterios sobre el mismo aporte dirían cosas distintas según por
  dónde entró — el problema que `sendCampaign` arrastra en el CRM.
- **La retención sale de `feeRules`**, sin porcentaje escrito acá. Un segundo
  número es cómo se llega a que dos vías retengan distinto por el mismo concepto
  (la lección de v4.854).
- **PayPal NO tiene tránsito del proveedor.** Al capturar, el dinero ya está en
  el saldo: `availableOn` es el momento de la captura y sólo corre el margen
  operativo de la plataforma, **el mismo que con Stripe**. Dos aportes del mismo
  día no pueden tener reglas de disponibilidad distintas según por dónde
  entraron.
- **Las columnas se siguen llamando `stripe*` y se usan igual.** Renombrarlas
  toca Prisma y es el riesgo de despliegue de `logo_intl` (v4.699). Guardan el
  estado y la fecha que `bucketOf` lee.
- **`verifyPaypalWebhook` devuelve `null` cuando no se puede comprobar**, que es
  DISTINTO de `false`. Decir «firma inválida» sin haberla verificado manda a
  buscar un problema de seguridad inexistente — la regla que el CRM dejó escrita.
- **SANDBOX es el valor por defecto** (`PAYPAL_ENV=live` para producción): una
  variable mal escrita deja los cobros en pruebas, no en producción por
  descuido. Y sin credenciales el botón no se pinta (v4.650).
- **El estado del modal guarda QUÉ vía se está usando**, no un booleano: con dos
  botones, `true` no dice cuál girar y los dos quedarían en «Conectando…».

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Credenciales de la cuenta de la plataforma. Sin las dos, el botón no aparece |
| `PAYPAL_ENV` | `live` para producción. Cualquier otra cosa —incluido vacío— es sandbox |
| `PAYPAL_WEBHOOK_ID` | Verifica la firma del webhook. Sin él la firma queda «sin comprobar», que no es «inválida» |
| `PAYPAL_CURRENCY` | La moneda que la cuenta puede recibir. **Vacía = la que venga** |

### Cobrar en una moneda y publicar en otra — v4.870

Pedido literal: *«está bien que mapeen pesos colombianos para los rotarios de
acá, pero cuando vaya a pagar a través de PayPal que lo convierta
automáticamente a dólares; es muy importante que aparezca el botón de PayPal»*.

| Archivo | Qué es |
|---|---|
| `server/lib/fxRates.js` | El CRITERIO. **Puro**: llave del par, conversión, edad de la tasa y validación |
| `src/lib/fxRates.ts` | Espejo MÍNIMO: convertir con una tasa ya conocida, para poder DECIRLO |
| `server/lib/fxRatesStore.js` | La I/O: `PlatformConfig`, caché, y la mezcla con la TRM automática de `trm.js` |
| `resolvePaypalCharge` en `paypalSpec.js` | Qué se le va a cobrar a ESTE visitante |
| `src/components/admin/FxRatesPanel.tsx` | El editor, dentro de Métodos de pago |

Pruebas: `npm run test:fx` (80 casos, **sin base, credenciales ni red**;
incluye la paridad de los dos espejos y se salta ese bloque si falta `esbuild`).

**Reglas durables:**

- **⚠️ LA CONVERSIÓN SE DICE ANTES DE COBRAR.** Es la mitad que la hace
  legítima y lo único que separa esto de lo que la regla anterior prohibía:
  quien eligió «$ 100.000» tiene que leer «se te cobrarán US$ 24,80» **antes**
  de salir hacia PayPal. Convertir en SILENCIO sería cambiarle el trato a mitad
  de camino; convertir A LA VISTA es otra cosa. Lo comprueba una prueba sobre el
  archivo del modal.
- **⚠️ NINGUNA CONSULTA A UN TERCERO SIN TOPE DE TIEMPO** (v4.875). `fetch`
  sin `signal` espera lo que el otro extremo quiera, y desde v4.871 la TRM corre
  en el camino de un VISITANTE —al abrir el modal de aportes y al crear el
  pedido—: una fuente lenta es un botón que gira sin fin y tiempo de función
  gastado en no hacer nada. Cada proveedor lleva 3 s y la CADENA un presupuesto
  total, porque seis proveedores suman seis tiempos de espera. La primera
  consulta del día paga la red; las demás salen de la caché en base. Lo comprueba
  una prueba que cuenta las llamadas sin envolver.
- **⚠️ LA TRM SE RESUELVE SOLA, Y NO SE ESCRIBE UNA SEGUNDA CADENA** (v4.871,
  `getEffectiveRates`). `trm.js` ya la resolvía desde v4.846 —Superintendencia
  Financiera vía `datos.gov.co`, cinco respaldos de mercado, caché por fecha y
  consulta histórica— y es la que la Bóveda usa para expresar en pesos la
  comisión que Stripe cobra en dólares. Otra cadena daría dos fuentes que se
  separan en silencio; lo comprueba una prueba sobre el archivo.
- **⚠️ LA AUTOMÁTICA MANDA SOBRE LA ESCRITA A MANO** (`mergeRates`), que es lo
  contrario de la regla habitual del sitio —«la preferencia explícita del
  usuario manda»—. Acá no aplica: **una tasa de cambio no es una preferencia,
  es un hecho que cambia todos los días**, y el fallo característico de la
  manual es quedarse vieja — justo lo que la automática resuelve. La manual
  queda de RESPALDO (la fuente no contesta) y como única vía para un par que la
  TRM no cubre. El orden vive en el criterio PURO y está probado: dentro de la
  capa que habla con la red no se podría, y es la decisión que gobierna cuánto
  se le cobra a alguien.
- **La automática se muestra de SÓLO LECTURA.** Editable invitaría a cambiar un
  número que se vuelve a resolver solo en la consulta siguiente, y el cambio se
  leería como que no se guardó.
- **La TRM es DIARIA y su día es el de BOGOTÁ**, no el del servidor —que corre
  en UTC—. La fuente que se guarda con el aporte dice de qué día es la tasa: sin
  eso no se sabe cuál se usó.
- **La tasa se guarda COMO LA DICE UNA PERSONA**: «4.032 pesos por dólar»
  (`perUnit`), no «0,00025 dólares por peso». Un número con cuatro ceros a la
  derecha de la coma se teclea mal y el error no se ve — y acá el error es
  cuánto se le cobra a alguien.
- **Se guardan los TRES datos** —importe original con su moneda, importe
  cobrado con la suya, y la tasa con su fuente y su fecha—, igual que el `fx`
  de las inscripciones a eventos. Sin los tres, «¿por qué este aporte entró en
  dólares?» no se puede contestar dos semanas después.
- **El aporte se registra en la moneda que SE COBRÓ.** Es lo que de verdad
  entró a la cuenta y lo que la Bóveda tiene que poder cuadrar; el importe en
  pesos viaja como dato del aporte. Consecuencia aceptada: una campaña
  colombiana puede tener aportes en las dos monedas, y la Bóveda ya las
  presenta separadas — nunca sumadas.
- **Un mismo criterio para pintar el botón y para cobrar** (`resolvePaypalCharge`,
  usado por la disponibilidad y por la creación del pedido). Con dos, el modal
  promete una cifra y el cobro sale por otra. Lo comprueba una prueba contando
  las llamadas.
- **El espejo del navegador existe para no pagar un viaje de red por
  pulsación**, y lo que lo hace seguro es que la prueba compara las SALIDAS de
  los dos módulos sobre una matriz de importes y pares, no que se parezcan. Al
  tocar `fxRates.js`, tocar `fxRates.ts`.
- **El redondeo es al de la moneda que SE COBRA**, con los decimales de
  PRESENTACIÓN —no los de la unidad mínima del proveedor—: son las dos nociones
  que `money.js` documenta y COP es justo donde difieren.
- **Un importe que se redondea a CERO se rechaza con su motivo.** No es un cobro
  raro: es una tasa mal escrita, y la pasarela lo rechazaría con un mensaje que
  no explica nada.
- **Una tasa vieja AVISA y sigue valiendo** (`STALE_DAYS`, 45). Dejar de cobrar
  porque nadie actualizó un número sería peor que cobrar con uno de hace dos
  meses. La fuente tampoco es obligatoria y se pide igual: sin ella, «¿de dónde
  salió este 4.032?» no tiene dónde mirarse.
- **El editor vive DENTRO de Métodos de pago**, no en una pantalla propia: la
  conversión existe POR la restricción de un método, y la decisión se toma donde
  ya se está trabajando — las pantallas que se olvidan son siempre las del
  segundo lugar.
- **Leer las tasas NUNCA lanza**: corre en el camino del cobro. Una
  configuración ilegible degrada a «sin tasas», que es no ofrecer PayPal, no
  tumbar el aporte.
- **La MEMBRESÍA sigue sin convertirse** (v4.834): su importe es un PRECIO que
  el club fijó y cobrarlo en otra moneda exige convertirlo. Esto convierte lo
  que se le pide a un donante, no lo que un club puso como precio.

### El formulario de aporte tiene que ENTRAR (v4.872)

Pruebas: `npm run test:donation:ui` (15 casos; pide `playwright` y `esbuild` y
**se salta solo** si faltan, o si no hay `dist/` compilado).

- **⚠️ UN FLEX CENTRADO RECORTA POR ARRIBA.** Con el panel más alto que la
  ventana, el navegador **no** deja desplazarse hacia el margen negativo: se
  pierden la cabecera y la cruz de cerrar, o sea la forma de salir. Se reportó
  al aparecer el segundo botón de pago. Se acota el panel a la ventana
  (`max-h-[calc(100vh-2rem)]`) con desplazamiento PROPIO: en una pantalla normal
  entra entero y no aparece ninguna barra. **No volver a un panel sin tope de
  alto** — el defecto reaparece en cuanto se agregue una línea.
- **Se aprieta el RESPIRO, no el contenido.** No se quitó ningún campo ni
  ninguno de los cuatro datos del aviso de conversión —moneda de cobro, importe
  convertido, importe original y tasa—: quitar la tasa o el original dejaría la
  conversión sin poder comprobarse, que es lo que la hace legítima.
- **Correo y nombre van a la par.** Dos campos cortos apilados cuestan ~62 px
  medidos, que era la fila que dejaba el pie fuera. Con el nombre oculto
  —donación anónima— el correo ocupa el ancho completo en vez de dejar media
  fila vacía.
- **Se MIDE en un navegador y con el CSS compilado.** Sin él la página se monta
  con todo en bloque y las medidas no son las de la maquetación real: la prueba
  pasaría por los motivos equivocados (v4.851). Al agregar una fila al modal,
  correrla.
- **Por debajo de ~750 px de ventana el modal se desplaza**, y está bien: lo que
  no puede pasar es que se recorte. Lo comprueba el caso de 560 px.

**Pendiente conocido:** el reembolso por PayPal no está — hoy sólo se maneja el
de Stripe (v4.859). Y `Checkout.tsx` conserva su selector Stripe/PayPal
**decorativo**: la tienda sigue sin cobrar por ninguna de las dos vías, que es
el pendiente declarado desde v4.808.

### Declarar lo que el servidor MANDA, no lo que uno espera (v4.867)

`/admin/integraciones` quedaba en «Esta pantalla no se pudo mostrar» con
«Cannot read properties of undefined (reading 'toLocaleString')», y por eso **no
se podía llegar a cargar las credenciales**.

- **La pantalla leía CINCO campos que el endpoint no manda**
  —`estimatedTokensInput`, `estimatedTokensOutput`, `estimatedCostUSD`, `model`
  y `pricingNote`—. Al reescribirse el módulo de traducción en v4.662 —de un
  modelo único a una CADENA de proveedores— esas cifras dejaron de existir, y el
  comentario de `GET /translate/usage` sigue diciendo «compatibilidad con la
  pantalla de Integraciones» sin serlo. **El typecheck no lo ve**: la interfaz
  estaba escrita, y era la equivocada.
- **UN ERROR DE RENDER DESMONTA EL SUBÁRBOL ENTERO.** No se perdía un número: se
  perdía la pantalla, y con ella el acceso a las credenciales. Misma forma que el
  defecto que dejó la Bóveda en blanco en v4.852.
- **Un contador ausente se pinta «—», NO «0».** Un cero es una afirmación —«no
  hubo ninguna»— y un hueco es la verdad. Acá además evita que un dato que falta
  tumbe la pantalla.
- **No se estiman los tokens ni el costo.** DeepL, Google y Azure ni siquiera
  cobran por tokens: afirmar un costo que no se calcula es peor que no
  mostrarlo. Las tres tarjetas rotas se reemplazaron por lo que el servidor SÍ
  manda —caché en memoria, actividad de 30 días, proveedor activo—.
- Pruebas: `npm run test:integrations:ui` (9 casos, navegador con la API
  interceptada usando la RESPUESTA REAL del endpoint). Verificada a la inversa:
  con el código anterior falla con el mismo mensaje del reporte.

### Los métodos de pago se ven y se activan — v4.868

Integraciones abre con «Métodos de pago»: qué vías de cobro existen, si cada una
tiene sus credenciales, y un interruptor para activarla.

| Archivo | Qué es |
|---|---|
| `server/lib/paymentMethods.js` | El CRITERIO. **Puro**: catálogo, estado desde el entorno, validación |
| `server/lib/paymentMethodsStore.js` | La I/O: `PlatformConfig`, caché e invalidación |
| `src/components/admin/PaymentMethodsPanel.tsx` | El panel, dentro de Integraciones |

Pruebas: `npm run test:payment-methods` (36 casos, **sin base ni red**).

**Reglas durables:**

- **CONFIGURADO y ACTIVADO son dos cosas distintas.** Configurado lo dice el
  ENTORNO y no se edita desde el panel; activado lo decide el operador. Un
  método se OFRECE sólo si las dos son ciertas — eso es lo que permite dejar las
  credenciales cargadas y el método todavía apagado mientras se prueba en
  sandbox.
- **⚠️ LAS CREDENCIALES SIGUEN EN LAS VARIABLES DE ENTORNO**, y hay dos motivos
  concretos: un respaldo de la base no se lleva la llave de cobro, y Vercel
  separa las variables por entorno, así que preview puede usar una cuenta de
  pruebas mientras producción usa la real. **Con las credenciales en la base las
  dos ramas leerían la misma fila y una prueba podría cobrar de verdad.** Si
  algún día hace falta guardarlas, `tokenCrypto.js` ya hace AES-256-GCM
  versionado — la pieza difícil está resuelta y sólo falta decidir el riesgo.
- **El panel NUNCA muestra el secreto, ni recortado.** Los últimos cuatro
  caracteres de una llave de cobro no ayudan a diagnosticar nada y sí filtran.
  Sólo dice si está o no está, y **qué variable falta con su nombre exacto**: un
  «no configurado» a secas manda a adivinar.
- **`card` viene ACTIVADO por defecto y todo lo demás apagado.** Es la
  comprobación que autoriza el despliegue: era la única vía de cobro que
  existía, y si naciera apagada, desplegar dejaría a TODA la plataforma sin
  poder recibir aportes.
- **Activar sin credenciales no es un error, pero se DICE.** Se puede dejar
  listo; lo que no puede pasar es que alguien lo encienda y espere un botón que
  no va a aparecer. Y si se apagan todos, se avisa: quedarse sin ninguno no se
  descubre hasta que alguien intenta donar.
- **El interruptor se comprueba EN EL SERVIDOR**, no sólo al pintar el botón —
  en la disponibilidad y otra vez al crear el pedido. Esconder un control en la
  pantalla no protege el endpoint de quien lo conoce.
- **El catálogo es CERRADO.** Un método que no esté declarado no se puede
  activar ni ofrecer, así que no puede aparecer una vía de cobro que nadie
  declaró.
- **Un guardado parcial no apaga nada** (`mergeMethods`), y una configuración
  ilegible degrada a los valores por defecto: esto corre en el camino del cobro.
- **El dinero sigue entrando a la cuenta de la PLATAFORMA en todos los
  métodos.** Esto activa dónde se ofrece cada uno, no a qué cuenta entra.
  `PaymentProviderConfig` modela cuentas por club y sigue sin usarse — con el
  dinero yendo directo al club, la retención no se podría aplicar y el saldo de
  la Bóveda dejaría de ser real.

- **⚠️ «SE ESTÁ OFRECIENDO» NO ES «EN TODOS LOS APORTES»** (v4.869,
  `methodLimits`). Con las credenciales cargadas y el interruptor puesto, la
  insignia se pintaba y el botón **no aparecía en la página**: `PAYPAL_CURRENCY`
  acota PayPal a una sola moneda y el sitio cobra en otra. Se reportó como «ya
  aparece sincronizado pero no aparece el botón». El estado era correcto; la
  afirmación, incompleta — y un estado que afirma de más manda a diagnosticar
  donde no está el problema, que es lo que este panel existe para evitar. Al
  agregar un método cuya disponibilidad dependa de algo más que las
  credenciales, declararlo en `methodLimits`.
- **El límite se pinta SÓLO cuando el método de verdad se ofrece.** Con el
  interruptor apagado, «sólo en USD» explica una restricción de algo que no
  está pasando.
- **Un límite ACOTA dónde se ofrece; NO lo apaga.** `offered` sigue en `true` y
  lo fija una prueba: confundirlos dejaría PayPal desactivado por el solo hecho
  de tener una moneda configurada.
- **El modo de PRUEBAS se avisa.** Sandbox es el valor por defecto a propósito
  —una variable mal escrita deja los cobros en pruebas y no en producción por
  descuido—, pero entonces hay que decirlo: un aporte hecho en sandbox no es
  dinero y eso no se ve mirando el panel.
- **PayPal no procesa pesos colombianos**, y está dicho en el `help` del
  catálogo porque es el hecho del proveedor que más cuesta descubrir. Desde
  v4.870 la consecuencia ya no es que el botón desaparezca: el aporte **se cobra
  convertido** con la tasa configurada, y la conversión **se le dice al
  visitante antes de cobrarle**. Sin tasa para ese par, el botón sigue sin
  aparecer.

### Probar las credenciales de un método (v4.874)

- **⚠️ «CLIENT AUTHENTICATION FAILED» TIENE DOS CAUSAS y el mensaje del
  proveedor no distingue entre ellas**: las credenciales son del OTRO entorno
  —Sandbox contra el servidor Live, o al revés— o al pegar el secreto se coló un
  espacio. Se reportó tal cual («PayPal rechazó las credenciales: fallo en la
  autenticación del cliente») y sin más datos no hay por dónde empezar.
- **EL ENTORNO ES EL DATO QUE PARTE EL DIAGNÓSTICO EN DOS**, y no estaba en el
  mensaje. Ahora el error lo nombra y `credentialHints` da vuelta las pistas
  según cuál esté activo.
- **Las credenciales se leen con `.trim()`** (`paypalCredentials`). No es
  cosmético: un salto de línea arrastrado al copiar el secreto produce
  exactamente este error, y es la única de las dos causas que se corrige desde
  el código.
- **La prueba es de SÓLO LECTURA**: pide un token, no crea ningún pedido ni
  cobra nada. Y **vacía la caché del token antes de probar** — con el guardado
  se comprobaría la credencial anterior, no la que se acaba de cargar.
- **Qué se puede probar se DECLARA** (`METHOD_TESTABLE`), no se deduce: el botón
  sólo aparece donde de verdad hace algo (v4.650). Al agregar la prueba de otro
  proveedor, agregarlo ahí.
- **El panel NUNCA muestra la credencial**, ni recortada: dice si sirve, en qué
  entorno se probó y qué mirar.

**⚠️ Deuda conocida:** `PaymentProviderConfig.secretRef` guarda el secreto en
TEXTO PLANO (`secretRef: stripeSecretKey`) y `paymentController` lo usa directo
(`new Stripe(config.secretRef)`). Hoy no lo llena ninguna pantalla —el endpoint
existe y nadie lo consume— pero el camino está abierto. Antes de habilitar
cuentas por sitio hay que cifrarlo con `tokenCrypto.js`, como los tokens de
redes sociales.

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

Las 50 tablas que la aplicación crea sola y que estas barreras protegen:
`BannerTemplate`, `CreativeProfile`, `CreativeReference`, `DesignProject`,
las cinco de Notificaciones de Contribuciones (`NotificationDelivery`,
`NotificationBeneficiary`, `NotificationProfile`, `NotificationTemplate`,
`NotificationDomain`),
`DesignPublicTemplate`, `EcosystemClone`,
`EventRegistration`, `MediaFolder`, `EventAttendeeAccount`,
`EventAttendeeLogin`, `FAQ`, `OutroProject`, `ReelProject`, `ReelScene`,
`ReelCopy`, `ReelNarration`, `ReelUsage`, `CrmWebhookEvent`, `CrmOutboundLog`,
las seis del módulo de SEO Inteligente (`SeoSiteConfig`, `SeoPageMeta`,
`SeoAudit`, `SeoIssue`, `SeoKeyword`, `SeoMetric`),
las once `ProjectFair*`,
las tres del libro mayor de la Bóveda (`LedgerAccount`, `LedgerTransaction`,
`LedgerLine`)
y las seis de Campañas de Contribución (`ContributionCampaign`,
`ContributionCenter`, `ContributionCampaignOverride`,
`ContributionCampaignHistory`, `ContributionCampaignMetric`,
`ContributionCampaignReading`).
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

## El pool registrador de un dominio — v4.877

Cada dominio que la plataforma matricula pertenece a un POOL: la billetera que
lo financió. La asignación es una fila de `CrowdfundActivation` —cuenta como
dominio activo y genera su comisión recurrente— y se elige a mano desde la
ficha del sitio.

| Archivo | Qué es |
|---|---|
| `src/lib/registrarPools.ts` | El CRITERIO. **Puro**: qué se puede elegir, cómo se rotula el cupo y qué significa cada valor al guardar |
| `src/components/admin/RegistrarPoolPicker.tsx` | El selector, COMPARTIDO por las seis pantallas de sitios |
| El bloque del pool en `updateClub` | Crea, actualiza o borra la activación |

Pruebas: `npm run test:registrar-pools` (91 casos, **sin base, credenciales ni
red**; el bloque del criterio pide `esbuild` y se salta solo si no está).

**Reglas durables:**

- **EL SELECTOR ES UNO SOLO, NO SEIS.** Vivía escrito a mano dentro de
  `Clubs.tsx` y **en ninguna otra pantalla**, así que un RYE, una Feria, una
  Zona, un Evento o una Asociación no tenían por dónde recibir su pool — se
  reportó exactamente así, con el RYE 4281 delante: «debe aparecer la opción
  desde la herramienta de editar». Copiarlo a las otras cinco habría repetido
  lo que ya pasó con la casilla de distritos (v4.748): escrita cinco veces,
  las copias se separaron en silencio. Acá el precio de que se separen es una
  activación de facturación. Lo comprueba una prueba que lee los seis archivos
  y falla si vuelve a aparecer el rótulo escrito a mano en una pantalla.
- **⚠️ `undefined` ES «NO LO TOQUES»; `''` ES «QUITAR LA ASIGNACIÓN».** Es la
  regla de la que cuelga todo lo demás, y equivocarse borra un dato de
  facturación sin que nadie se entere. `registrarPoolId` **no es columna de
  `Club`** —se deriva de la activación— y `GET /admin/clubs` devuelve
  `SELECT c.*`, así que **el listado NUNCA lo trae**: sólo lo sabe el detalle.
  Tomando el valor ausente por «sin asignar» —que es lo que hacía `Clubs.tsx`—
  un detalle que falla convierte el siguiente guardado en un BORRADO silencioso
  de la activación. `JSON.stringify` omite las claves `undefined`, así que
  dejarlo sin definir es lo que hace que la petición ni mencione el campo, y
  `updateClub` ya distinguía las dos cosas (`if (registrarPoolId !==
  undefined)`). Mientras no se sepa, el control se muestra inerte y lo DICE:
  pintarlo en «Sin asignar» invita a guardar un borrado que nadie pidió.
- **EL VALOR ACTUAL SIEMPRE ES UNA OPCIÓN**, aunque el pool esté sin cupo y
  aunque ya no figure en el catálogo. Si no estuviera en la lista, el `select`
  se pintaría vacío y el primer guardado movería la asignación sin que nadie lo
  pidiera — el mismo defecto por la otra puerta. El pool ausente entra marcado
  y con su motivo.
- **SIN CUPO SE AVISA, NO SE BLOQUEA.** Un pool lleno es un dato para decidir,
  no una prohibición: quien administra puede saber que se amplió, y bloquearlo
  lo dejaría sin salida — «avisar sin dar salida deja un callejón». Mismo
  criterio que los avisos que no bloquean del panel de tarifas (v4.854).
- **El cupo se DERIVA de las dos cifras primitivas.** El endpoint también manda
  `availableUnits` y no se usa: con dos fuentes, el número del aviso podría
  contradecir al «3/20» del propio rótulo.
- **⚠️ ASIGNAR UN POOL ES SÓLO DEL OPERADOR, comprobado en el SERVIDOR.**
  `PUT /admin/clubs/:id` la pueden usar `club_admin`, `district_admin` y
  `crowdfunder` para su propio sitio, así que sin esa condición cualquiera de
  ellos podía crear una activación de facturación en la billetera de un pool
  ajeno mandando el campo a mano. La pantalla no lo ofrece, y esconder un
  control no protege el endpoint de quien lo conoce (v4.868). Se DESCARTA en
  silencio —patrón `stripProtected`—, no con un 403, para no romper un guardado
  legítimo que arrastre el campo.
- **El componente consulta el catálogo por su cuenta.** Las pantallas no
  guardan la lista de pools ni la piden: con la consulta en cada una, la sexta
  se olvidaría de hacerla y el selector saldría vacío sin que nada avisara.
- **Un catálogo que no carga CONSERVA lo guardado y lo dice.** Sin esa cautela,
  un fallo del endpoint dejaría el desplegable en «Sin asignar» y el guardado
  siguiente borraría la activación — la misma trampa de arriba por una tercera
  puerta.

### El distrito se ve al abrir la ficha (v4.877)

- **`district` estaba en el estado y en la pantalla, pero no se cargaba.**
  Faltaba en los dos `setFormData` de `handleOpenModal` de las CINCO pantallas
  de asociaciones, así que al editar un sitio los distritos aparecían todos sin
  marcar aunque los tuviera — es lo que se ve en la ficha del RYE 4281. No
  borraba nada (el campo no viajaba, y `addField` saltea lo `undefined`), pero
  hacía imposible saber a qué distrito estaba vinculado un sitio sin
  consultarlo por otra vía. **Y sí tenía error de tipo**: eran diez de los
  errores previos del proyecto, uno por cada objeto literal incompleto.
- **Al agregar un campo al formulario de un sitio, agregarlo a los TRES sitios**
  —el estado inicial, la rama de edición y el reset— o queda a medias sin que
  la pantalla lo diga. En `Clubs.tsx` el reset había perdido así cuatro campos
  (`subscriptionStatus`, `expirationDate` y los dos de facturación): al crear un
  sitio nuevo quedaban en `undefined` y su `<select>` pasaba a no controlado.


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

## La barra de vencimiento de un sitio — v4.878

| Archivo | Qué es |
|---|---|
| `src/lib/siteExpiration.ts` | El CRITERIO. **Puro**: qué estado enciende la barra y por qué |
| `src/components/ExpirationBanner.tsx` | La barra roja de la portada |
| `Navbar.tsx` (`showBannerOffset`) | El desplazamiento del menú, que tiene que coincidir |

Pruebas: `npm run test:expiration` (51 casos; el bloque de navegador monta el
componente REAL y pide `playwright`, y se salta solo si falta).

**Reglas durables:**

- **EL ESTADO MANDA; LA CASILLA SUMA.** Se reportó con dos sitios delante:
  `rotarypasto.org` mostraba la barra y `rotarynuevocali.org` no, estando los
  dos en «Expirado / Vencido». La barra **nunca miró** `subscriptionStatus`:
  dependía sólo de `expirationBannerActive`, una casilla aparte que alguien
  había marcado a mano en uno y no en el otro. O sea que poner un sitio en
  «Expirado» no hacía **nada visible**, y no había forma de notarlo salvo
  comparando dos sitios. Ahora el estado enciende la barra siempre y la casilla
  queda para lo único que el estado no cubre: avisar ANTES del vencimiento, con
  el sitio todavía activo.
- **⚠️ NO SE DERIVA DE `expirationDate`.** Sería lo aparentemente natural —«si
  la fecha pasó, está vencido»— y es justo lo que no se puede hacer sin mirar
  la base de producción primero: hay sitios con una fecha vieja y la
  suscripción al día, y la consecuencia de equivocarse es una barra ROJA de
  impago en la portada de un club que sí pagó. La fecha es un dato de
  facturación; el estado es la decisión. Se lee la decisión, y una prueba lee
  el archivo y falla si `expirationDate` reaparece en el criterio.
- **El catálogo de estados es CERRADO** (`EXPIRED_SUBSCRIPTION_STATUSES`).
  `inactive` es un prospecto que nunca contrató y `pending` es un cobro en
  curso: en ninguno de los dos «Sitio en periodo de renovación» sería cierto.
- **⚠️ LA BARRA Y EL MENÚ DECIDEN CON LA MISMA FUNCIÓN.** La barra es `sticky`
  y `Navbar` se desplaza para dejarle sitio (`showBannerOffset`). Con la
  condición escrita en los dos lados —que es como estaba— alcanza con tocar uno
  para que el menú se monte encima del aviso, y eso no lo ve ninguna otra
  comprobación.
- **Un sitio vencido no puede apagar la barra desde la casilla, y la ficha lo
  DICE** (`bannerLockNotice`). Sin ese aviso, el panel muestra una casilla sin
  marcar mientras la portada muestra la barra: es pintar el indicador en contra
  del veredicto, el defecto que este archivo ya prohibió una vez (v4.787).
- **El estado ya viajaba al navegador y nadie lo leía.** `by-domain` arma la
  respuesta con `{ ...activeClub }` —la fila entera de Prisma—, así que no hizo
  falta tocar el servidor. Si algún día esa respuesta pasa a una lista de
  campos, `subscriptionStatus` tiene que estar en ella; lo comprueba una prueba
  sobre el archivo.
- **⚠️ ALCANZA A LOS SITIOS QUE EL SISTEMA MARCA SOLO.** `/api/cron/…` pasa a
  `status: 'inactive'` y `subscriptionStatus: 'expired'` todo sitio cuya fecha
  de expiración tenga más de cinco días. Esos sitios pasan a mostrar la barra,
  que es lo correcto —están suspendidos— pero es un cambio visible en varias
  portadas a la vez, no sólo en la que se reportó. Si un sitio no debía
  mostrarla, lo que se corrige es su estado de suscripción.
- **Pagar sigue apagándola.** El webhook de cobro ya dejaba `subscriptionStatus:
  'active'` y `expirationBannerActive: false` en la misma escritura, así que al
  renovar la barra desaparece sola. La derivación no cambia eso.

**Pendiente conocido:** `expirationBannerMessage` se guarda desde el panel y la
barra **no lo lee** — el texto está escrito en el componente. Cablearlo cambiaría
lo que hoy se ve en los sitios que ya tienen un mensaje guardado, así que no se
tocó en esta versión.


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

## La pantalla en blanco del panel — v4.791

Reporte: «cada vez que intento ingresar al administrador de contenidos la página
se queda en blanco; tengo que cargarla de manera forzada varias veces». Es la
secuela directa del `React.lazy` de v4.659 combinado con la cadencia de
despliegue de este sitio, y son TRES defectos encadenados.

| Archivo | Qué es |
|---|---|
| `server/lib/staticAssets.js` | El CRITERIO. **Puro**: qué dirección es un archivo del build y qué es una página |
| `api/index.js` | El 404 de verdad y el `Cache-Control` del documento |
| `src/lib/lazyWithRetry.ts` | Reintento, recarga contada y el oyente de `vite:preloadError` |
| `src/components/ChunkErrorBoundary.tsx` | La última red: ninguna pantalla en blanco sin motivo |

Pruebas: `npm run test:spa` (39 casos; la parte de navegador pide `playwright` y
`esbuild` y **se salta sola** si faltan).

**Reglas durables:**

- **Un archivo que no existe responde 404, NUNCA el documento.** `vercel.json`
  reescribe todo lo que no es `/api/` a la función, así que
  `/assets/ContentStudio-VIEJO.js` —el que pide una pestaña con el `index.html`
  del despliegue anterior— llegaba al catch-all y recibía la aplicación entera
  con estado **200** y `Content-Type: text/html`. El navegador intenta
  interpretar HTML como módulo y falla. **Y React CACHEA la promesa rechazada**:
  ese componente no vuelve a cargar en toda la sesión, por más que se navegue.
  Ahí está la pantalla en blanco permanente. Comprobado contra el Express real:
  antes 200 + HTML, ahora 404 `text/plain` con `no-store`.
- **El documento NO se cachea** (`no-store, must-revalidate`). Es la mitad que
  explica el «varias veces»: el documento es quien nombra los archivos por su
  hash, y servido desde una función sin cabecera queda a merced de la caché
  heurística del navegador — una recarga normal devolvía la lista vieja y sólo
  la recarga forzada la saltaba. **No cuesta velocidad**: lo pesado son los
  archivos de `/assets/`, que llevan hash en el nombre y siguen cacheados.
- **Qué es un archivo se decide por EXTENSIÓN y CARPETA, no por «tiene un
  punto».** Equivocarse hacia el otro lado es peor que el defecto: una ruta
  legítima como `/eventos/xii-feria-2027.valledupar` dada por archivo dejaría esa
  página sin servir. Por eso el criterio vive aparte y es puro.
- **Recargar está CONTADO** (`permiteRecarga`, 2 por minuto). Recargar es lo
  único que cura un archivo que ya no existe —no hay nada que reintentar, hay
  que volver a preguntar qué archivos van—, pero si falta de verdad (despliegue
  a medias, fallo del CDN) recargar sin freno deja al usuario en un bucle
  infinito de pantallas blancas. Agotado el freno, la promesa se RECHAZA y el
  límite de error pinta el motivo. La política es pura y se prueba aparte:
  recargar para probarla sería absurdo.
- **Primero se reintenta, y sólo después se recarga.** Un tropiezo de red se
  resuelve solo y no justifica perder el estado de la pantalla. Comprobado en un
  navegador: con un fallo pasajero la pantalla carga al segundo intento, sin
  recargar y sin dejar marca.
- **`escucharFallosDePrecarga` se registra en `main.tsx`, no en un `useEffect`.**
  Es un oyente del documento, no del ciclo de vida de nadie: atarlo a un
  componente montado es justo lo que no se puede garantizar cuando lo que falla
  es la carga de una pantalla.
- **Ningún `React.lazy` a secas.** Al agregar una página, usar `lazyWithRetry`
  —lo comprueba `test:spa` contando: la conversión no puede quedar a medias, y
  una sola página cruda reintroduce el defecto justo en esa pantalla.
- **Un 404 limpio NO rescata a la pestaña que ya tenía el documento viejo**
  (v4.791, `reloadShim`). `no-store` protege de ahí en adelante; quien ya tenía
  guardado el documento anterior sigue pidiendo archivos de una versión que no
  existe, y el código que sabría recuperarse vive DENTRO del archivo que no
  llega. Lo único que ese navegador va a ejecutar es lo que se le devuelva en
  lugar del módulo, así que se le devuelve un módulo mínimo que recarga. Va con
  **200** a propósito —el navegador no ejecuta el cuerpo de un 404— y sólo para
  `Sec-Fetch-Dest: script`: una imagen o una hoja de estilos siguen dando 404,
  ahí no hay nada que rescatar. Comprobado de punta a punta en un navegador: la
  pestaña vieja recarga una vez y entra.
- **El rescate comparte el contador con el cliente** (`app:chunk-reloads`). Con
  dos frenos independientes se sumarían y volvería el bucle que el freno existe
  para impedir; agotado, el módulo LANZA y el error llega al límite.
- **Un fallo que se ve y se explica es aceptable; uno mudo, no.**
  `ChunkErrorBoundary` va dentro del enrutador y por fuera del `<Suspense>`, así
  que conserva la navegación: quien lo vea puede irse a otra sección sin
  recargar.

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
