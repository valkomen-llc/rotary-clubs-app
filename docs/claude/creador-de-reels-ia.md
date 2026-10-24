<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

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
| `REEL_TTS_AUTO_FALLBACK` | `off` apaga el respaldo automático entre motores de voz del montaje automático (encendido por defecto). El panel decide con su casilla |
| `REEL_TTS_TIMEOUT_MS` | Tope de cada síntesis (45 000 por defecto) |
| `EXPANSION_PROVIDER`, `EXPANSION_MODEL_*` | Motor de la Expansión Inteligente y sus ids |
| `EXPANSION_MIN_PRESERVATION` | Conservación mínima del original (0-1, default 0.82) |
| `EXPANSION_CREATIVITY`, `EXPANSION_MAX_GROWTH`, `EXPANSION_TOLERANCE` | Cuánto puede inventar, cuánto crecer y cuándo no tocar la foto |
| `EXPANSION_MAX_RETRIES`, `EXPANSION_AUTO_REGENERATE` | Reintentos cuando la medición no llega al umbral |

**Versionado: `npm run test:version`.** Corre en `prebuild` y ROMPE el
despliegue. Comprueba que el número sea el MISMO en los tres sitios que lo
declaran: `package.json` (`version` + `cache_bust`), `src/lib/appVersion.ts`
—**el que se PINTA** en la barra del panel y en el banner del sitio— y la
primera entrada de `SYSTEM_UPDATES`.

- **⚠️ EL COMENTARIO DE `appVersion.ts` PROMETÍA ESTA PRUEBA DESDE v4.879 Y NO
  EXISTÍA.** De v4.954 a v4.957 se bumpeó `package.json` y el changelog y no
  ese archivo: el sitio mostró «Lanzamiento 4.953.0» durante cuatro versiones.
  No falla ruidosamente — enseña un número viejo con aplomo, y se reporta como
  «¿en qué versión estamos?». Una guardia que depende de que alguien lea un
  comentario no protege nada (la lección de `check:routes`, v4.859).

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

### Recuperación por escena, sin volver a pagar lo generado (v4.1028)

Reporte con la ficha de una Solicitud de Contenido delante: «3/5 escenas
listas», dos escenas en error tras «consumir sus 2 generaciones de video»
(una persona desaparecía; una entrega aparecía invertida), el Reel entero en
`error`, «Reintentar esa etapa» sin efecto y ninguna vía que no fuera regenerar
el Reel completo — pagando otra vez las tres escenas que sí salieron. El pedido
literal del cliente: *«Una escena que ya fue generada correctamente NUNCA debe
volver a generarse ni volver a consumir créditos… Un fallo parcial NO debe
destruir el Reel completo… no quiero simplemente ocultar los errores de la
interfaz. Quiero corregir la arquitectura que los produce.»*

| Pieza | Qué es |
|---|---|
| `SCENE_STRATEGIES` · `STRATEGY_LADDER` · `nextStrategy` (`reelSpec.js`) | La escalera: narrativo → conservador → fotografico (sin IA, cero créditos) |
| `assessSceneMotionRisk` | El PREFLIGHT: con qué estrategia se arranca, mirando la foto ANTES de gastar |
| `classifyProviderFailure` · `transientBackoffSec` | Un fallo del proveedor: técnico y pasajero, o definitivo |
| `planSceneRecovery` | El ÚNICO punto de decisión: `skip` / `wait` / `retry_paid` / `fallback` |
| `sceneIdempotencyKey` | sha256 de proyecto · escena · versión del prompt · foto · estrategia |
| `SCENE_FAILURE_CODES` · `failureCodeOf` | Catálogo CERRADO del fallo, con su clase (técnico / semántico / calidad) |
| `ReelScene.strategy` · `promptVersion` · `idempotencyKey` · `errorCode` · `nextAttemptAt` · `mediaId` · `lifecycle` | Las siete columnas nuevas, ENUMERADAS en el atajo del ensure |
| `SCENE_STATUSES.fallback_ready` · `REEL_STATUSES.incomplete` | Los dos estados nuevos: terminal y utilizable; terminal y continuable |
| `composeScenePrompt` · `handleProviderFailure` · `relaunchScene` · `recoverScene` · `fallbackSceneSafely` · `saveSceneToLibrary` (`reelController.js`) | La orquestación |
| `resumeReelProject` · `regenerateReelScene` · `fallbackReelScene` | Las tres vías, compartidas por el Estudio y por la ficha de la solicitud |
| `ensureReelScenesFolder` (`submissionFolders.js`) | Solicitudes de contenido › [solicitud] › Reels › [Reel vN] › Escenas |

Pruebas: `npm run test:reels:recovery` (96 casos, **sin base, credenciales ni
red**: criterio + cableado leído de los archivos), más `test:reels:fidelity`,
`test:reels:life`, `test:reels:people` y `test:submissions:reel(:path)`
actualizadas a la regla nueva. Verificadas a la inversa.

**Reglas durables:**

- **⚠️ ERAN CINCO DEFECTOS ENCADENADOS Y NINGUNO ERA «EL BOTÓN».** (1) El
  proyecto quedaba en `error`, estado terminal que el barrido excluye y que el
  workflow de la solicitud traduce a `error`: las tres escenas buenas quedaban
  ATRAPADAS dentro. (2) «Reintentar esa etapa» miraba las etapas del workflow
  —todas en `ok`— y devolvía 409: un callejón. (3) `retryReel` no reseteaba
  `attempts` y `dispatchPendingScene` cortaba por el tope. (4) El
  relanzamiento mandaba DOS VECES EL MISMO PROMPT al mismo motor —dos veces el
  mismo defecto—, y un tropiezo del proveedor gastaba un intento como si fuera
  un fallo del contenido. (5) Las escenas no entraban a `Media` hasta que el
  Reel entero terminara, así que un Reel que moría se llevaba sus assets. **Al
  reportar «se pierden los créditos», mirar la máquina de estados, no la
  pantalla.**
- **⚠️ EL REEL SE DERIVA DE SUS ESCENAS.** Con escenas utilizables y otras sin
  clip, el proyecto queda `incomplete` —terminal, `resumable`—, no `error`:
  «N de M escenas listas; las N están guardadas y no vuelven a consumir
  créditos». `error` queda para cuando NO hay nada que conservar. El workflow
  de la solicitud lo traduce a `incompleto`, que **no es un estado de
  trabajo** (no se sondea hasta pulsar «Continuar») y de donde sólo se sale
  continuando o descartando.
- **⚠️ UNA ESCENA CON CLIP SE SALTA, SIEMPRE.** `planSceneRecovery` devuelve
  `skip` para toda escena `ready` / `needs_review` / `fallback_ready` con
  `videoUrl`; `resumeReelProject` filtra por `hasUsableClip` ANTES de tocar
  nada y no llama al proveedor por ellas. Es la regla #1 del pedido y la
  comprueban tres pruebas, a la inversa. `ignoreClip` existe SÓLO para el
  control de fidelidad, que decide antes de aceptar el clip recién llegado.
- **⚠️ EL PROMPT SE ADAPTA A LA FOTOGRAFÍA; LA FOTOGRAFÍA NO SE FUERZA AL
  STORYBOARD.** `assessSceneMotionRisk` mira el análisis que el director ya
  pagó: una TRANSFERENCIA de objeto entre personas —el caso exacto del
  reporte, «quien entregaba aparece recibiendo»—, un grupo denso o personas
  tapadas son riesgo ALTO y arrancan en `conservador`. El prompt conservador
  (`CONSERVATIVE_PEOPLE_CLAUSE`) sostiene la pose —«whatever is being held
  stays held by that same person, nobody hands anything over, nobody steps or
  changes place»— y pone la vida en la respiración, el parpadeo y el ambiente.
  Es en POSITIVO, como todo prompt del sitio; la cámara sigue fija.
- **⚠️ NUNCA SE REPITE UN PROMPT.** Cada relanzamiento sube un peldaño de la
  escalera, rearma el prompt por `composeScenePrompt` —el ÚNICO
  `buildScenePrompt(` del controlador, y una prueba lo cuenta— y sube
  `promptVersion`, así que la llave de idempotencia es otra y el `lifecycle`
  dice qué se pidió cada vez. Un conservador ya probado no se vuelve a probar:
  se cae al respaldo.
- **⚠️ DOS GENERACIONES PAGAS POR ESCENA, TRES COMO TOPE ABSOLUTO**
  (`MAX_PAID_GENERATIONS`, `ABSOLUTE_PAID_CAP`), y el tope se aplica en el
  DESPACHO, no sólo en la pantalla. No se resolvió «subiendo los retries»: se
  resolvió cambiando QUÉ se reintenta.
- **⚠️ UN FALLO TÉCNICO NO ES UN FALLO DEL CONTENIDO.** 429, timeout, 5xx,
  ECONNRESET (`classifyProviderFailure`, ante la duda DEFINITIVO) DEVUELVEN el
  intento reclamado (`attempts = GREATEST(attempts − 1, 0)`), escriben
  `provider_transient` y `nextAttemptAt` con retroceso 30/120/300 s, y el
  despacho pendiente ESPERA; agotados los tres, `dispatch_failed` en `error`
  con su motivo — nunca pendiente eterno. Un rechazo definitivo del proveedor
  (`provider_rejected`) sí cuenta y sube de peldaño.
- **⚠️ AGOTADA LA ESCALERA, EL RESPALDO SIN IA — EN SU PROPIO ESTADO.**
  **SUPERADO EN v4.1029** (ver «Una fotografía → una escena»): la escalera
  automática vuelve a terminar SIN paneo, como manda v4.801; el respaldo sólo
  sale por elección expresa. Se conserva escrito porque explica el estado
  `fallback_ready`, que sigue existiendo para esa elección. Lo que decía: esto
  MATIZA v4.801 y hay que leer las dos juntas. Aquélla vetó el paneo
  PRESENTADO como escena animada, con «Fidelidad 10/10» y sin decir que se
  había sustituido; ese veto sigue: el respaldo queda en `fallback_ready`
  («Foto en movimiento (respaldo sin IA)»), con `strategy = 'fotografico'`,
  `fidelity.fallback = true`, el gasto dicho («Consumió sus N generaciones»)
  y botón para volver a intentar la escena viva. Lo que cambia es que el Reel
  se COMPLETA en vez de morir con la escena — decisión expresa del cliente,
  con el argumento en contra delante («el objetivo es 5/5: por ejemplo 3 con
  IA + 2 cinematográficas»). `resolveSceneWithStillMotion` tiene ahora
  exactamente DOS vías declaradas —la elección expresa del modo Fotográfico y
  `fallbackSceneSafely`— y una prueba las cuenta; una tercera es un respaldo
  colado. El clip contaminado NO viaja al montaje por ninguna vía: el respaldo
  lo reemplaza y, si el respaldo falla, `error` + `fallback_failed` +
  `videoUrl NULL`. `submitAssembly` monta SÓLO `hasUsableClip`.
- **Sólo la INVENCIÓN HUMANA cae al respaldo** (v4.792 sigue vigente): marca y
  texto agotados conservan su clip en `needs_review`. Quién decide es
  `planSceneRecovery` con `ignoreClip`, no aritmética suelta sobre `attempts`.
- **⚠️ LA IDEMPOTENCIA ES POR DESPACHO, NO POR FILA.** `sceneIdempotencyKey`
  se calcula ANTES de llamar al proveedor; si la fila ya tiene `kieJobId` con
  la misma llave, no se crea otra tarea — cubre doble clic, refresco,
  reintento, timeout, webhook reprocesado y dos vueltas del cron a la vez. El
  reclamo sobre `attempts` (v4.800) sigue siendo la primera barrera; la llave
  es la segunda. Regenerar a mano reclama por ESTADO (`WHERE id AND status =
  $n`): dos pulsaciones sobre la misma escena terminal son una sola.
- **⚠️ CADA ASSET VÁLIDO ENTRA A LA BIBLIOTECA EN CUANTO EXISTE**
  (`saveSceneToLibrary`, desde la ingesta, el respaldo y las conservadas en
  revisión), idempotente por `Media.s3Key`, en la carpeta «Solicitudes de
  contenido › [solicitud] › Reels › [Reel vN — título] › Escenas» (o «Reels ›
  [Reel] › Escenas» para un Reel hecho a mano). No poder ordenar NO cuesta el
  asset (la regla de v4.1004): sin carpeta va a la raíz. Un Reel que falla no
  borra las escenas que sí salieron: `cancelReel` excluye `fallback_ready` y
  ningún camino hace DELETE sobre `Media` por el fallo del padre.
- **⚠️ HAY UN SOLO MOTOR Y TRES VÍAS.** `resumeReelProject`,
  `regenerateReelScene` y `fallbackReelScene` viven en el controlador del
  Estudio; la ficha de la solicitud las llama por el engine
  (`resumeSubmissionReelProject`, …) y vuelve a seguir al proyecto
  (`refollowReel`). Un segundo motor de recuperación se separaría en silencio
  — una prueba cuenta que el engine no tenga ningún `INSERT INTO
  "ReelProject"`. `retryReel` es ahora un alias de `resumeReel`: continuar es
  el reintento.
- **⚠️ EL RESPALDO AUTOMÁTICO ESTÁ ACOTADO** (`MAX_AUTO_RECOVERIES`,
  `MAX_FALLBACK_ATTEMPTS`): un `advance` que relanza sin tope es un bucle que
  paga. Cada vuelta que gasta algo queda en `lifecycle.events` con
  `paid: true`, y `ReelUsage` registra también los fallos del proveedor con
  `credits: 0` — se cuenta lo que se MIDE (generaciones lanzadas por escena,
  proveedor, modelo e intento), y **no se inventa un precio que el proveedor
  no devuelve** (`costSummary.note` lo dice).
- **⚠️ LA PANTALLA PINTA; NO DECIDE.** `usable`, `fallback`, `paidGenerations`,
  `errorLabel`, `nextAttemptAt` y `recovery` viajan RESUELTOS desde el
  servidor; el espejo tipado sólo declara los estados. Las acciones por escena
  —«Reintentar automáticamente», «Simplificar movimiento», «Usar imagen con
  movimiento cinematográfico», «Editar en el Estudio»— sólo aparecen sobre una
  escena SIN clip (`puedeActuar = !esUsable …`), y el bloque dice «Las N
  escenas ya generadas están guardadas y no volverán a consumir créditos» donde
  se mira. El botón es «Continuar N escenas pendientes», nunca «Regenerar
  Reel»; un Reel incompleto ya no repite su motivo en el bloque de «Reintentar
  esa etapa», que no lo resuelve.
- **Todo lo nuevo es ADITIVO.** Un servidor anterior no manda los campos y la
  pantalla se comporta como antes; una fila anterior tiene `strategy` NULL y
  `lifecycle = '{}'` y `planSceneRecovery` la lee como narrativa sin
  historial. No se migró ni una fila: el caso reportado se recupera pulsando
  «Continuar 2 escenas pendientes».

### El Reel de la solicitud existe para el Estudio del sitio; una escena lista se regenera a propósito (v4.1031)

Reporte con dos capturas: la ficha de la solicitud con 5 de 5 escenas listas
—«Lista · revisar»— y ninguna forma de regenerar, y «Editar en el Estudio»
aterrizando en la Biblioteca del Estudio **sin el proyecto**. v4.1030 había
cableado el enlace; lo que faltaba era que el Reel EXISTIERA para ese sitio.

| Pieza | Qué es |
|---|---|
| `adoptReelSite` (`submissionReelEngine.js`) | Ata el sitio de la sesión al Reel sin sitio: fila, proyecto, escenas, consumo y assets, todo con `WHERE "clubId" IS NULL` |
| `sessionClubIdOf` · `reelView(…, { sessionClubId })` (`submissionReelController.js`) | El ÚNICO punto de adopción: toda respuesta del controlador pasa por la vista |
| `puedeRegenerar` en `SubmissionReelPanel.tsx` · «Regenerar escena» en `ReelLibrary.tsx` | El gesto expreso sobre una escena CON clip, por el `regenerateReelScene` de siempre |

Pruebas: `npm run test:submissions:reel:path` (el camino de la adopción, con
la base sustituida) y `npm run test:reels:recovery` (el cableado leído de los
archivos). Verificadas a la inversa.

- **⚠️ LA BIBLIOTECA DEL ESTUDIO ACOTA POR SITIO, Y UN REEL SIN SITIO NO
  EXISTE PARA NADIE MÁS QUE EL OPERADOR.** `scopeClause` es
  `"clubId" = <sitio de la sesión>`; con `clubId` NULL el `getReel` de
  v4.1030 respondía 404 y la ficha decía «No se encontró ese Reel». Cómo se
  llega a NULL: `loadContext` resuelve `row.clubId → originClubId →
  ownerClubId → recipientClubId`, y con una campaña de la PLATAFORMA
  (`ownerClubId` NULL por definición) y una solicitud cuyo origen no se
  resolvió, las cuatro se apagan a la vez. **Es exactamente la cascada
  incompleta de v4.1006 en el artículo, por la otra puerta** — al declarar
  una cascada, preguntarse si hay una combinación en la que todo se apague.
- **⚠️ LA SALIDA ES LA MISMA QUE ALLÁ: EL SITIO DE LA SESIÓN SE ADOPTA, NO SE
  ADIVINA.** Quien abre la ficha desde el panel de un sitio ya demostró
  alcanzar la campaña (`requireCampaignAccess`); `req.campaignScope.clubId`
  es esa señal —nunca `req.user.clubId` (es el sitio por el que ENTRÓ el
  operador, v4.853) ni un campo del cuerpo—. Para el operador vale `null` y
  no se adopta nada: él ve todo.
- **⚠️ EN UN SOLO PUNTO: `reelView`.** Abrir, preparar, confirmar, continuar,
  regenerar y versionar responden todos por esa vista; una adopción por
  acción dejaría a la siguiente sin ella, en silencio. Además encolar y
  versionar caen al sitio de la sesión cuando la solicitud no trae origen,
  para que el proyecto NAZCA con sitio y `saveSceneToLibrary` escriba los
  clips en la Biblioteca Multimedia correcta desde el primero.
- **⚠️ `WHERE "clubId" IS NULL` EN CADA TABLA, y si el proyecto ya tiene
  sitio manda el del proyecto.** Un sitio resuelto no se pisa: otro
  administrador abriendo la misma solicitud desde otro panel no puede mover
  un Reel que ya nació. Y con la fila sin sitio y el proyecto con uno, la
  fila adopta el DEL PROYECTO — dos sitios sobre el mismo Reel serían dos
  verdades. Alcanza a `ReelScene`, `ReelUsage` y las filas de `Media` de los
  clips (`saveSceneToLibrary` copia el `clubId` del proyecto y escribe
  `sourceType: 'platform'` cuando no hay), o el sitio vería la ficha del Reel
  y no sus assets ni su consumo.
- **LO HEREDADO VUELVE SOLO, SIN MIGRAR UNA FILA** (regla de v4.1009): el
  Reel reportado se ata al abrir su ficha, y el UPDATE sólo corre cuando la
  fila no tiene sitio — un Reel ya resuelto no paga ninguna escritura por
  abrirlo.
- **⚠️ REGENERAR UNA ESCENA LISTA NO CONTRADICE «UNA ESCENA CON CLIP SE
  SALTA, SIEMPRE» (v4.1028).** Aquélla es la regla de la recuperación
  AUTOMÁTICA (`planSceneRecovery`, «Continuar»), que no puede volver a pagar
  lo generado; regenerar a mano es el gesto EXPRESO que el propio pedido de
  v4.1028 exceptuaba («salvo que el usuario explícitamente solicite
  regenerarla») y `regenerateReelScene` ya lo soportaba —reabre el
  presupuesto, conserva el asset anterior en `lifecycle.assets` y en la
  Biblioteca—. Lo que faltaba era el BOTÓN: `puedeActuar` (recuperación)
  sigue siendo `!esUsable`, y `puedeRegenerar` es la puerta aparte, sobre
  una escena usable con el Reel quieto. Dice el costo antes (una generación
  de video, con los créditos estimados del medidor propio) y no toca las
  demás escenas.
- **Y EN LA BIBLIOTECA DEL ESTUDIO TAMBIÉN**, por el MISMO endpoint
  (`/reels/:id/scenes/:sceneId/regenerate`): «Editar en el Estudio» aterriza
  en su pestaña de escenas, que hasta v4.1030 sólo mostraba los clips sin
  ninguna acción. Un tercer camino de regeneración no existe; el servidor
  vuelve a comprobar el candado (409 sobre una escena en curso).
- **Un 404 al abrir por id se DICE con su causa** («de este sitio: puede
  pertenecer a otro sitio o haberse eliminado»), no como un Reel inexistente.

### La duración se pide como la entrega el motor; el Estudio abre el Reel existente (v4.1030)

Reporte con la ficha delante: 4 de 5 escenas listas y la quinta con «El
proveedor rechazó la tarea: KIE createTask (kling-2.6/image-to-video): la
duración no está dentro del rango de opciones permitidas». No era el modelo:
era NUESTRO payload, y llegó al proveedor porque nadie lo comprobaba antes.

| Pieza | Qué es |
|---|---|
| `server/lib/videoModelCapabilities.js` | El catálogo de CAPACIDADES por modelo (durations, aspect ratio, resolución, sound, image count, opcionales). **Puro.** `getModelCapabilities` · `validateGenerationRequest` · `normalizeGenerationRequest` · `snapDuration` |
| `engineRequestDuration` · `resolveFallbackEngine` · `summarizeGenerationLedger` (`reelSpec.js`) | La duración PEDIDA al motor, el respaldo de proveedor y el desglose de créditos |
| `SCENE_FAILURE_CODES.invalid_request` · `classifyProviderFailure → 'validation'` | Un rechazo de PARÁMETROS es nuestro, no del contenido ni del proveedor |
| `ReelUsage.meta` (JSONB, enumerada en el atajo del ensure) | El ledger por generación: `taskId`, `kind`, `generation`, `estimatedCredits`, `actualCredits` |

Pruebas: `npm run test:reels:capabilities` (71 casos, **sin base, credenciales
ni red**; criterio + cableado leído de los archivos). Verificadas a la
inversa: reintroduciendo `duration: scene.generatedDurationSec` falla.

- **⚠️ `generatedDurationSec` TIENE DOS SIGNIFICADOS Y ESO ERA LA CAUSA.** Al
  insertar la escena es la duración que se PIDE al motor (5); al ingerir el
  clip, `ingestScene` la SOBRESCRIBE con la duración MEDIDA del archivo
  (`probe.durationSec`, 5,04). `dispatchScene` y `relaunchScene` la usaban
  como duración a pedir, así que la primera generación pasaba y el
  RELANZAMIENTO tras un fallo de fidelidad mandaba «5.04» a un modelo que sólo
  entrega 5 o 10. Por eso la ficha decía «1 gen.»: el rechazo fue en la
  segunda, sin gastar. **La duración que se pide sale SIEMPRE de
  `engineRequestDuration(engine, scene.durationSec)`** —la de montaje ajustada
  a lo que el motor entrega—, nunca de la medida del clip anterior.
- **⚠️ LAS CAPACIDADES VIVEN EN UN SOLO SITIO Y SE COMPRUEBAN ANTES DE LLAMAR.**
  `VIDEO_ENGINES[*].durations` se toma de `getModelCapabilities(model)` —una
  prueba compara los cinco motores de KIE—, y `createKieVideoTask` NORMALIZA
  la petición contra ese catálogo antes de `buildVideoInput`: 5,04 → 5,
  4,5 → 5, 6 → 10 (tolerancia de medio segundo; si no, la siguiente por
  arriba, para que nunca falte metraje). Lo que no se puede corregir —sin
  imagen, dos imágenes a un modelo de una— lanza `GenerationValidationError`
  (`kind: 'validation'`) **sin tocar al proveedor**. Nunca se manda un payload
  que ya sabemos inválido. Los ajustes se ANOTAN en consola: un ajuste mudo
  convierte «lo pedimos» en una afirmación falsa.
- **⚠️ UN RECHAZO DE PARÁMETROS NO ES UN FALLO DEL CONTENIDO.**
  `classifyProviderFailure` devuelve `validation` para «not in the range of
  allowed options», «rango de opciones», «must be one of», «this field is
  required»…; `handleProviderFailure` lo deja en `error` con
  `invalid_request` (técnico), DEVUELVE la generación reclamada y **no marca
  la estrategia como probada**: «Continuar» reanuda con la misma estrategia y
  el payload ya corregido. Subir de peldaño por un error nuestro gastaría la
  escalera en un defecto inexistente (la lección de v4.675, por otra puerta).
- **NO SE SUSTITUYÓ KLING.** El problema no era suyo. Lo que se agrega es un
  RESPALDO DE PROVEEDOR declarado (`fallbackEngine: 'kling21'` en kling26,
  `REEL_FALLBACK_ENGINE` para cambiarlo o `off` para apagarlo): mismo
  contrato de input `{ prompt, image_urls, duration, sound }`, ya verificado
  en producción, y por eso el elegido —Seedance y MiniMax pasan por la rama
  genérica de `buildVideoInput`, sin verificar; Veo y MiniMax están apagados
  por entorno; Runway y Luma no tienen adaptador; **Grok no existe en la
  integración de KIE para image-to-video y no se inventa**. Sólo entra tras
  `provider_rejected` (definitivo), NUNCA por una nota de fidelidad, y dentro
  del MISMO tope de generaciones: cambiar de motor no abre presupuesto.
- **⚠️ ESTIMADO, LANZADO Y REAL SON TRES NÚMEROS.** «100 créditos estimados»
  sobre un Reel que lanzó más de 300 no explicaba nada. `costSummary.ledger`
  desglosa por CLASE —iniciales, reintentos automáticos, reanudaciones,
  regeneraciones a mano, motor de respaldo— leyendo los eventos `dispatch`
  del ciclo de vida y el evento que los precedió; lo NO cobrado (transitorios,
  rechazos, peticiones inválidas) va aparte; y `actualCredits` es **null**
  porque KIE no devuelve el costo de una tarea — «no lo devuelve el proveedor»
  se dice con esas palabras. La tarifa por motor se corrige por entorno
  (`REEL_CREDITS_KLING26`, `REEL_CREDITS_KLING21`) para calibrarla contra el
  panel de KIE sin desplegar. Cada despacho queda en `ReelUsage.meta` con su
  tarea, su clase y su estimado.
- **⚠️ «EDITAR EN EL ESTUDIO» ABRE EL REEL QUE YA EXISTE.** El enlace era
  `?tab=library&reel=<id>` desde v4.1010, y aterrizaba en el creador VACÍO por
  dos mitades: `ContentStudio` sólo leía `tab` dentro del efecto de `?ways=`
  (`if (!campaignId) return;` iba antes), y `ReelLibrary` nunca leía `reel`.
  Las escenas SÍ estaban persistidas y en `Media` desde la ingesta
  (`saveSceneToLibrary`, v4.1028) — lo que faltaba era la vía para llegar a
  ellas. Ahora `tab` se lee siempre y la Biblioteca abre la ficha del MISMO
  proyecto por id (con sus escenas listas, la fallida y sus acciones). No se
  crea un segundo proyecto: un id que no existe se dice.
- **Al leer un parámetro de la URL en una pantalla con varias entradas,
  leerlo fuera del `if` de la primera.** Es la forma exacta del defecto de
  `create`/`post` (v4.1011): el enlace compila, la pestaña no carga.

### Una fotografía → una escena, derecha, entera y viva (v4.1029)

Reporte con tres capturas de un Reel de una Solicitud de Contenido
(`donacion-de-tejas-y-distribucion-de-agua`): una escena con la fotografía
girada 90°, otra con DOS fotografías pegadas en un mismo cuadro, y otra que era
un paneo sobre la foto quieta presentado como escena. Pedido literal del
cliente: *«ANIMAR LO QUE YA EXISTE, NO REINTERPRETAR LA FOTOGRAFÍA»*, con tres
invariantes permanentes —sin collage, sin rotación, sin Ken Burns— y un
Quality Gate por escena. Eran TRES causas distintas y ninguna daba error.

| Pieza | Qué es |
|---|---|
| `server/lib/photoNormalize.js` | La NORMALIZACIÓN. Criterio puro (`needsOrientationFix`, `orientedDimensions`, `isUpright`) + `normalizePhoto(buffer,{sharp})`, que aplica el EXIF físicamente, re-codifica lo ilegible y NUNCA lanza |
| `ReelScene.normalizedImageUrl` · `normalizedS3Key` | La copia derecha, en la fila y enumerada en el atajo del ensure |
| `preparedSourceOf` · `animationSourceOf` · `ensureNormalizedSource` (`reelController.js`) | El ÚNICO punto que decide qué imagen se adapta, se anima y se mide: adaptada → normalizada → original |
| `SCENE_BASE_PROMPT` · `COMPOSITION_NEGATIVE_TERMS` (`reelSpec.js`) | El bloque base obligatorio y los términos de composición del negativo |
| `checkClipOrientation` (`reelSpec.js`) · `detectLetterbox` · `judgeComposition` (`reelQuality.js`) | La puerta de COMPOSICIÓN del clip: rotación por proporción, franjas negras, collage por visión corroborado |
| `detectSeam` · `EXPANSION_SEAM_RATIO` · `EXPANSION_SEAM_COVERAGE` (`canvasExpansion.js`) | La costura del collage en la adaptación, MEDIDA en el borde exacto de la foto original |
| `markSceneExhausted` · estado `exhausted` en `planSceneRecovery` | El final de la escalera SIN paneo |

Pruebas: `npm run test:reels:photo` (72 casos, **sin base, credenciales ni
red**; sharp y el ffmpeg empaquetado): los tres casos que exigió el pedido —una
foto vertical normal, una foto cuyo EXIF exige corrección (fixture sintético con
`Orientation: 6`), y la costura de un collage frente a una extensión legítima—
más un clip REAL montado con FFmpeg desde la foto con EXIF, medido: proporción
derecha, la marca de la foto arriba a la izquierda, sin franjas. Verificadas a
la inversa sobre las llaves, más `test:reels:recovery` (98), `test:reels:fidelity`
(65), `test:reels:presets`, `test:reels:people`, `test:reels:life`,
`test:reels:wiring` y `test:submissions:reel(:path)` actualizadas.

**Reglas durables:**

- **⚠️ CAUSA 1 — NADIE APLICABA EL EXIF, y apareció como regresión por el
  FLUJO.** Un teléfono guarda la foto vertical como un archivo APAISADO más una
  etiqueta `Orientation: 6`; el navegador la gira al mostrarla, `sharp.metadata()`
  devuelve el tamaño CRUDO, y los motores de imagen y de video de la pasarela
  leen los píxeles tal como están. `planExpansion` decidía «horizontal» sobre
  una foto vertical, la adaptación al 9:16 se hacía sobre la geometría
  equivocada y el clip salía girado. Las fotos subidas desde el panel pasan por
  `compressImage` (canvas → sin EXIF); las de una Solicitud llegan del teléfono
  intactas y se promueven con `CopyObject` byte a byte (v4.968). **El módulo
  nunca había visto una foto con EXIF hasta que ese flujo lo alimentó.** Al
  conectar una fuente nueva de fotografías, preguntarse qué metadatos trae que
  la anterior no traía.
- **⚠️ LA ORIENTACIÓN SE RESUELVE UNA VEZ, FÍSICAMENTE, Y ANTES DE GASTAR.**
  `rotate()` sin argumento aplica el EXIF y sharp descarta la etiqueta al
  re-codificar: lo que sale no depende de que ningún motor interprete nada. Se
  comprueba que quedó derecha (`isUpright` contra las medidas orientadas) y la
  copia se guarda en la fila; una foto ya derecha NO se re-codifica (no se pierde
  una generación de JPEG sin motivo). Un fallo normalizando NUNCA cuesta la
  escena: se sigue con la original y se anota. **Lo consumen la adaptación, el
  despacho y el respaldo — los tres por `ensureNormalizedSource`**, y una prueba
  lee el controlador para exigirlo. Un segundo punto de normalización se
  separaría en silencio.
- **`animationSourceOf` sigue siendo el ÚNICO punto de decisión** (v4.664) y
  ahora tiene tres escalones: adaptada → normalizada → original. `sourceImageUrl`
  no se toca (la foto original nunca se pisa).
- **⚠️ CAUSA 2 — LA ADAPTACIÓN PODÍA DEVOLVER DOS FOTOS PEGADAS Y, REPROBADA,
  SE ANIMABA IGUAL.** La costura sólo la preguntaba el modelo de visión
  (`seam` en `judgeExpansionPeople`, v4.801) —ruido de una lectura sobre una
  imagen reducida—, y `advanceSceneExpansion`, agotados los reintentos, dejaba
  `expandedImageUrl` puesto y despachaba: el lienzo con la foto duplicada era la
  referencia de todos los controles de escena (v4.799), así que el clip pasaba.
  Ahora (1) `detectSeam` MIDE la diferencia entre líneas en el borde exacto de la
  región original contra la mediana del resto de la imagen —medido: collage
  ≥ 2× el umbral, extensión fundida por debajo—, se juzga junto al mosaico y
  ANTES de la preservación (por lo mismo que v4.793: con el centro intacto la
  conservación da nota alta y tapa el defecto); y (2) **una adaptación reprobada
  NO se anima**: `expandedImageUrl` queda NULL, el rechazo se guarda con su
  consecuencia (la escena se anima con la foto entera y el montaje recorta al
  centro) y se anota en el proyecto.
- **⚠️ Y EL CLIP SE REVISA POR COMPOSICIÓN**, porque el motor de video también
  puede fabricar un collage o girar la imagen. `judgeComposition` junta tres
  señales: `collage` y `rotated` del modelo de visión —corroboradas en DOS
  fotogramas, como toda señal binaria de una lectura reducida (v4.795)—,
  `checkClipOrientation` (determinista: la proporción del clip contra la de la
  imagen animada; un clip cuya proporción es la INVERSA de la foto está girado;
  una foto cuadrada nunca decide) y `detectLetterbox` (bandas del 4 % oscuras Y
  planas en los dos lados opuestos). Descalifica sin apelación
  (`SCENE_FAILURE_CODES`: `collage`, `wrong_orientation`, `letterbox`) y el
  motivo nombra la puerta. **Al agregar una señal de composición, preguntarse
  cuál es su ruido de medición** —es la pregunta de las cuatro puertas de v4.795—.
- **⚠️ CAUSA 3 — v4.1028 REINTRODUJO EL KEN BURNS AUTOMÁTICO, y v4.801 lo había
  vetado con las palabras del cliente**: «prefiero una escena marcada como
  fallida antes que un falso resultado animado». `STRATEGY_LADDER` es
  `['narrativo','conservador']`; `fotografico` NO es automática
  (`AUTOMATIC_STRATEGIES`); `nextStrategy('conservador')` es `null`; y
  `planSceneRecovery` devuelve **`exhausted`** —nunca `fallback` sin
  `forceStrategy: 'fotografico'`—, comprobado recorriendo TODA combinación de
  estrategia × intentos × código × historial. `markSceneExhausted` deja la
  escena en `error` con `errorCode = 'exhausted'`, `videoUrl NULL`, el gasto
  dicho y la SALIDA escrita: revisar la fotografía, volver a intentar la escena
  viva o elegir expresamente la foto en movimiento. `resolveSceneWithStillMotion`
  tiene DOS llamadores (la elección expresa del modo Fotográfico y
  `fallbackSceneSafely`), y `fallbackSceneSafely` TRES, todos por gesto humano
  (`forceStrategy`, «Continuar» con estrategia pedida, botón por escena); una
  prueba cuenta los dos números y otra exige que ninguno viva dentro del avance
  automático. **El Reel se COMPLETA con N de M y queda `incomplete`** —la regla
  de v4.1028 de que el Reel se deriva de sus escenas sigue entera—; lo que no
  hace es completarse con un paneo.
- **⚠️ TODO PROMPT DE ESCENA ARRANCA CON `SCENE_BASE_PROMPT`, y ningún recorte
  lo quita.** Es el bloque que pidió el cliente, en POSITIVO (regla del sitio):
  una sola fotografía, una sola vez, derecha, sin espejo, en su encuadre, cámara
  fija, vida sutil de lo que ya está. Va PRIMERO en `buildScenePrompt`; el
  recorte de último recurso conserva el bloque, la cámara, el censo, la oclusión
  y las interacciones, y recorta el resto por palabra entera. **Al agregar una
  frase al prompt, medir**: el bloque mide ~345 caracteres y un bloque de 492
  empujaba el prompt al último recorte y se comía la cláusula de la cámara —lo
  destapó la prueba de `locked off`—. Las prohibiciones van en
  `COMPOSITION_NEGATIVE_TERMS`, dentro de `negative_prompt`, SIEMPRE (como el
  anti-paneo de v4.787).
- **UNA FOTO = UNA ESCENA = UNA IMAGEN AL MOTOR.** `createKieVideoTask` recibe
  `imageUrl` singular (nunca `imageUrls`), el `INSERT` de `ReelScene` va por
  foto, y el Reel de una Solicitud no tiene ni INSERT de escenas ni despacho
  propio: usa `startReelProject`. Las tres cosas las fija la prueba leyendo los
  archivos, porque son exactamente las que un refactor puede deshacer sin que
  nada avise.
- **⚠️ LAS PRUEBAS DE CRITERIO CODIFICABAN EL DEFECTO** (la lección de v4.1001,
  otra vez): el fixture de «extensión legítima» de `test:reels:fidelity` pegaba
  colores planos con un escalón en el borde —o sea, un collage— y pasaba porque
  nadie medía la costura. Con el detector, reprobaba con razón; el fixture
  correcto continúa el fondo de la foto. Al agregar una medición, revisar qué
  fixtures la contradicen.
- **Un `|| true` en una prueba es una prueba que no existe.** Dos comprobaciones
  de la batería nueva nacieron así y se reescribieron: los píxeles CRUDOS del
  fixture EXIF-6 están acostados (sharp no aplica el EXIF al leer `raw()` sin
  `.rotate()`), y la guarda de la comilla invertida en el SQL exige que tras la
  primera comilla de cierre de cada `db.query(`…`)` venga `)` o `,` —
  verificada a la inversa inyectando una.

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

**Pendientes conocidos:** los motores `runway_gen4` y `luma_ray2`
están declarados con `available:false` porque necesitan su propio adaptador (hoy
sólo existe el de KIE); y el texto en pantalla **no tiene todavía una pantalla
para editarlo a mano** — se escribe solo y se puede regenerar, pero corregir una
palabra exige regenerar el rótulo entero.

### El outro de un Reel (v4.1032)

Un clip ya renderizado —de la Biblioteca Multimedia, subido en el momento, o
del Generador de Outros— que cierra el Reel DESPUÉS de la última escena (y de
la tarjeta de cierre, si la hay) con una transición suave. Era el pendiente
declarado desde v4.647: `config.outro` viajaba en la petición y **no se
guardaba ni se montaba**.

| Pieza | Qué es |
|---|---|
| `server/lib/reelOutro.js` | El CRITERIO. **Puro**: transiciones admitidas, acotación de la duración, normalización de `config.outro`, el clip que entra al montaje, la vista y `clipOverlap` |
| `PUT`/`DELETE /reels/:id/outro` (`setReelOutro`, `removeReelOutro`) | Poner, ajustar y quitar. Sólo tocan `config` |
| `OutroSection` en `ReelLibrary.tsx` | Activar, elegir de la Biblioteca, subir, vista previa, reemplazar, quitar, transición, audio y «Volver a montar» |

Pruebas: `npm run test:reels:outro` (57 casos, **sin base, credenciales ni
red**: criterio, spec de montaje, grafo de ffmpeg y cableado leído de los
archivos).

- **⚠️ CAMBIAR EL OUTRO SÓLO RELANZA EL MONTAJE.** Entra como el ÚLTIMO clip
  de `buildEditSpec` y `submitAssembly` lo toma de `config.outro`; la vía es
  `POST /reels/:id/render`, que monta con las escenas que ya existen. Ningún
  crédito de image-to-video. Una prueba lee `setReelOutro` y falla si toca
  escenas o crea tareas de video.
- **⚠️ `clipOverlap` ES EL ÚNICO PUNTO QUE DECIDE CUÁNTO SE SOLAPAN DOS
  CLIPS.** Lo consumen el grafo de ffmpeg, el spec y la línea de tiempo de los
  proveedores alojados. Un clip puede declarar `transitionSec` (el outro, 0,3
  a 1,2 s, 0,6 por defecto); si no, manda el catálogo `TRANSITIONS`. Con
  la aritmética escrita en tres sitios, la duración total y el `offset` del
  `xfade` se separarían en silencio.
- **LA TRANSICIÓN ES UN CATÁLOGO CERRADO Y SUAVE** (`OUTRO_TRANSITIONS`:
  fundido, disolvencia, corte). Un zoom o un barrido cambian la composición
  del cierre institucional; lo que no está en el catálogo cae al fundido.
- **⚠️ `audioEnabled` SÓLO PUEDE SER CIERTO CON `hasAudio` MEDIDO.** Pedirle a
  ffmpeg `[i:a]` de un archivo mudo rompe el grafo entero. La medición es
  `probeMp4` sobre el archivo (`measureOutroAsset`), al guardar; si no se pudo,
  se mide al montar. Ajustar la transición del MISMO archivo no vuelve a
  descargarlo.
- **CON AUDIO DEL OUTRO, LA MÚSICA SE RETIRA DURANTE LA TRANSICIÓN** y el outro
  entra con fundido de su mismo largo; se mezclan con `amix … normalize=0` y un
  limitador —con `normalize=1` la cama bajaría 6 dB durante TODO el Reel por el
  solo hecho de que exista un outro—. **Con outro mudo, la música sigue debajo**
  y cierra con el fundido de siempre: `totalSec` ya lo cuenta.
- **NO HAY NORMALIZACIÓN APARTE.** El outro se conforma dentro del grafo como
  toda entrada —`scale … force_original_aspect_ratio=increase, crop, fps,
  setsar, yuv420p`—: cover/crop al centro, sin bandas. Es la regla de v4.671.
- **⚠️ EL ASSET SE COMPRUEBA CONTRA EL ALCANCE DEL SITIO** (`fetchOutroMedia`,
  `scopeClause` en el `WHERE`): un `mediaId` ajeno responde «no existe». La
  subida entra por `uploadMediaFiles` con el `clubId` del Reel, así que el
  archivo queda en la Biblioteca de ESE sitio y se puede volver a elegir.
- **`outroRendered` dice con qué outro se montó el video ACTUAL** (del
  `renderSpec` guardado). Es lo que permite avisar «el video final todavía no
  refleja este cambio» sin adivinarlo en la pantalla.
- **Los proveedores alojados reciben el outro como un clip más y NO mezclan su
  audio**: se dice en `limitations`, como con los rótulos.

### Guardar el outro es montarlo, y el master viejo no se publica (v4.1047)

Reporte con dos capturas juntas: la ficha del Reel con su outro puesto
—activado, con su transición, su duración y «Usar el audio del outro»— y, al
abrir «Publicar en redes sociales», el MISMO Reel de 20 s de antes, sin cierre.

| Pieza | Qué es |
|---|---|
| `outroMontageKey` · `renderedOutroKey` · `outroSyncState` (`reelOutro.js`) | El CRITERIO. **Puro**: la huella de lo que el outro aporta AL ARCHIVO y si el master la refleja |
| `remountReel` (`reelController.js`) | EL camino de remontaje. Lo usan el botón y las dos vías del outro |
| `respondOutroChange` | Guardar el outro y dejar el master al día, en el mismo gesto |
| `outroSync` en el DTO · `masterStale` en la entidad de publicación | El veredicto, RESUELTO, en las dos puntas |

Pruebas: la sección 9 de `npm run test:reels:outro` (195 casos; la 7 sigue
montando con ffmpeg de verdad). Verificadas a la inversa sobre los cinco
puntos. Medido de punta a punta con archivos reales: 18,50 s de escenas + un
outro de 5,2 s − 0,6 s de fundido = **23,10 s** en un solo MP4, con el color
del fotograma comprobado a los 10 s (escena), en la transición (mezcla) y a
falta de 1,5 s (outro).

- **⚠️ NO FALLABA EL COMPOSITOR: EL MASTER CON OUTRO NUNCA SE PEDÍA.**
  `setReelOutro` escribía `config.outro` y nada más; el archivo se rehacía sólo
  con `POST /reels/:id/render`, detrás de un botón al final de la otra columna.
  Hasta que alguien lo encontrara, `videoUrl` —lo que se reproduce, lo que se
  descarga y lo que `resolveReel` le entrega a Meta— seguía siendo el montaje
  anterior. **Ante un «se guarda y el archivo no cambia», mirar quién dispara
  el montaje antes de buscar el defecto en el pipeline.**
- **⚠️ GUARDAR EL OUTRO Y MONTAR SON UN SOLO GESTO** (`respondOutroChange`, en
  las DOS vías). Es la regla de v4.1032 —«cambiar el outro sólo relanza el
  montaje»— cumplida de verdad: antes describía lo que el botón hacía, no lo
  que pasaba al guardar. Sigue sin regenerarse ninguna escena; una prueba lee
  el cuerpo de `remountReel` y falla si aparece `createKieVideoTask`,
  `dispatchScene` o cualquier otro motor.
- **SE MONTA SÓLO SI HACE FALTA.** Renombrar el outro, cambiarle la miniatura o
  volver a guardar lo mismo no cuesta una codificación: lo decide
  `outroSyncState`, no el hecho de haber pulsado guardar.
- **⚠️ SE COMPARA LA CONFIGURACIÓN CONTRA EL SPEC DEL MASTER, no contra la
  configuración anterior.** Dos configuraciones contestan «¿cambió algo desde
  la última vez?», que no es la pregunta: un montaje que falló —o que no llegó
  a lanzarse— deja el archivo atrasado sin que la configuración vuelva a
  moverse, y así el Reel se queda desincronizado para siempre sin que nada lo
  diga.
- **⚠️ LA HUELLA LLEVA SÓLO LO QUE CAMBIA UN FOTOGRAMA**: el clip, su duración,
  su transición y si su audio se mezcla. Meter ahí el título, la miniatura o de
  qué outro del Generador salió tiene una consecuencia concreta y silenciosa:
  el spec del montaje NO guarda esos campos, así que la huella del master nunca
  coincidiría con la de la configuración y **todo Reel recién montado quedaría
  eternamente desincronizado** —aviso permanente, publicar bloqueado y una
  codificación en cada guardado—. Lo fija la comprobación 9b, que exige
  `renderedOutroKey(buildEditSpec(...)) === outroMontageKey(config)`: es la que
  hay que correr al tocar `outroClipFor` o `buildEditSpec`.
- **SIN MASTER NO HAY NADA QUE CONTRADECIR.** Un Reel sin montar ya está
  bloqueado para publicar por no tener archivo; decir además que «está
  desactualizado» mandaría a diagnosticar lo que no está roto.
- **⚠️ UN MASTER DESACTUALIZADO NO SE PUBLICA, Y LA PUERTA ESTÁ EN EL
  SERVIDOR** (`shareabilityOf` con `entity.masterStale`). Cubre las DOS puntas
  con un solo punto de decisión —el modal lo pinta como bloqueo y la API
  responde 409—, porque las dos pasan por ahí. Sin ella, el modal lee
  `videoUrl`, lo ve alcanzable y manda la versión anterior: una publicación no
  se deshace desde acá, hay que ir a borrarla a mano en Meta.
- **⚠️ `resolveReel` SELECCIONA `config` Y `renderSpec`.** Sin ellas
  `outroSyncState` lee `undefined`, da el master por al día y el resolutor
  vuelve a entregar la pieza anterior — la trampa del SELECT corto (v4.886),
  esta vez sobre lo que sale a la red. Lo fija una prueba que lee la consulta.
- **LA PANTALLA PINTA; NO DECIDE.** `desincronizado` sale de `outroSync.stale`;
  la comparación a mano (`montadoCon !== outro.url`) se retiró. Con dos copias
  del criterio, la ficha diría «al día» mientras la publicación manda otra
  cosa, y lo que se separaría es qué archivo aparece en la cuenta de una
  institución. Una prueba comprueba que no vuelva.
- **NO SE PROMETE «INTEGRADO» SI NO LO ESTÁ.** El aviso de éxito sale del
  veredicto que devuelve el servidor, no de lo que se pidió: si el montaje no
  se pudo hacer, el outro queda guardado, se dice por qué y Publicar sigue
  bloqueado. Lo peor que puede pasar es tener que pulsar «Volver a montar»;
  nunca que salga a la red la pieza anterior.
- **QUITAR EL OUTRO LLEVA LA MISMA GUARDIA QUE PONERLO** (409 sobre un Reel en
  proceso): quitarlo también vuelve a montar, y no se relanza un montaje sobre
  un Reel que ya está montando.
- **⚠️ HAY UN SOLO CAMINO DE REMONTAJE** (`remountReel`), compartido por el
  botón «Volver a montar» y las dos vías del outro. Con uno por vía, el día que
  cambie qué se exige antes de montar —o cómo se libera el candado— una se
  queda atrás y el fallo es MUDO: las dos siguen devolviendo un proyecto, y lo
  que se separa es qué archivo termina publicándose. Una prueba cuenta las
  definiciones y los llamadores.
- **El montaje sigue siendo UNO a la vez** (v4.786): `submitAssembly` reclama
  la fila y, si otro proceso la tiene, devuelve el proyecto sin montar. Ahí el
  outro queda guardado y desincronizado — que es visible y se resuelve, no
  silencioso.

### Un outro APAGADO no es un outro puesto, y hay que decirlo (v4.1048)

Segundo reporte con la ficha delante, ya con v4.1047 desplegada: *«supuestamente
al activar el outro se incluye en el video, pero cuando voy a reproducirlo no
aparece: sigue teniendo los 20 segundos del reel generado»*. **No fallaba nada
del montaje ni de la publicación: el outro estaba guardado y DESACTIVADO.**

- **⚠️ EL DIAGNÓSTICO SALIÓ DE TRIANGULAR LA CAPTURA, NO DE LEER EL PIPELINE.**
  Tres señales decían lo mismo: la casilla «Activar outro» sin marcar; la línea
  de AUDIO diciendo «se ajustan a **20.0 s**, que es lo que duran las escenas y
  el cierre» —ese número sale de `timelineSecFor`, que suma el outro **sólo si
  `enabled`**—; y 24 MB a 10075 kbps, que son 20 s de archivo real. Con el outro
  activo, `respondOutroChange` habría remontado o el toast habría salido en
  ROJO. **Ante un «lo activé y no pasó nada», comprobar primero si de verdad
  está activo — el módulo ya publica los números con los que se comprueba.**
- **⚠️ NO HAY CONTRADICCIÓN QUE AVISAR, Y ÉSE ERA EL PUNTO CIEGO.** Con el outro
  apagado las dos huellas de `outroSyncState` son «sin-outro», así que
  `stale: false`: no se monta, no sale la banda de desincronización y publicar
  se permite. **Todo correcto y todo mudo.** `stale` contesta «¿el archivo
  contradice a la configuración?» y hacía falta contestar además «¿el archivo
  lleva el cierre, y si no, por qué?». De ahí los cuatro campos ADITIVOS
  —`configured`, `active`, `inMaster`, `disabled`— con su `note` y su `noteFix`.
- **⚠️ Y NO SE VOLVIÓ `stale`, que era el camino corto.** Marcar un outro apagado
  como desincronizado bloquearía publicar un Reel que alguien configuró así a
  propósito: se cambiaría un problema de comunicación por uno de servicio. Lo
  fija una prueba que exige `stale === false` con el outro apagado.
- **APAGADO NO ES INSERVIBLE.** Un outro con el archivo fuera de rango tampoco
  entra al montaje, pero su motivo es otro y su salida es otra —ya la dicen sus
  `problems`—: por eso `disabled` mira `enabled === false` y no `!active`.
  Nombrar mal el motivo manda a marcar una casilla que ya está marcada.
- **⚠️ LA TARJETA PINTABA EL OUTRO SIN MIRAR `enabled`.** Duración, resolución,
  relación de aspecto, transición y «Usar el audio del outro» salían idénticos
  estuviera activo o no; la única señal era una casilla de 14 px arriba a la
  derecha. Un outro apagado se lee como un outro puesto — y de ahí a «el video
  debería llevarlo» hay un paso. Ahora la tarjeta se atenúa y encima va la banda
  ámbar con **su salida**: el botón que lo activa e integra ahí mismo (un aviso
  que sólo dice «no» es un callejón, v4.1008). Y cuando SÍ está en el archivo
  también se dice: es la pregunta que trae a alguien a esta sección.
- **⚠️ EL AVISO DESCRIBE EL RESULTADO, NO LA ACCIÓN QUE SE PIDIÓ**
  (`outroChangeMessage`). Era `montando ? 'Outro integrado al video' : label`,
  así que DESACTIVAR el outro —que vuelve a montar sin él— contestaba «Outro
  integrado al video»: literalmente el toast verde de la captura, al lado de la
  casilla desmarcada. Se compara `inMaster` ANTES y DESPUÉS —el de antes lo
  tiene la ficha, el de después viene en la respuesta—, que es lo que distingue
  «se acaba de integrar» de «ya lo llevaba y sólo se ajustó la transición» sin
  que la pantalla adivine si hubo montaje. Es la regla de v4.1047 —«no se
  promete integrado si no lo está»— extendida al caso que no cubría: aquélla
  miraba si el montaje FALLÓ, no si la acción era quitar.
- **QUITAR TAMPOCO AFIRMA UN MONTAJE QUE NO OCURRIÓ.** Con el outro apagado, el
  archivo nunca lo llevó: el aviso dice «Outro quitado del Reel», no «y del
  video montado».
- **La función del mensaje es PURA y vive en el espejo** (`reelSpec.ts`), así
  que se ejercita de verdad —transpilada con esbuild— y no con una expresión
  regular sobre el JSX. Una frase escrita suelta en el componente es la que se
  vuelve a contradecir sin que nada avise.
- Pruebas: la sección 10 de `npm run test:reels:outro` (220 casos). Verificadas
  a la inversa por las tres puntas: el toast fijo, el criterio que confunde
  apagado con inservible, y la banda sin su botón de salida.

### El outro y la publicación, desde la Biblioteca de Reels (v4.1040)

Pedido con la ficha de un Reel delante: *«tiene que ser desde la biblioteca…
en la biblioteca de estudio de contenido AI es donde se administra toda la
creación de contenido que vamos a generar con AI. Entonces, desde aquí, se
debe agregar el outro al video y se debe compartir en o publicar en las
redes sociales.»*

| Pieza | Qué es |
|---|---|
| `server/lib/outroAssets.js` | EL resolutor de un outro guardado. **Uno**: alcance por sitio, miniatura y datos declarados |
| `SavedOutroPicker.tsx` | EL selector del catálogo: `useSavedOutros`, `preselectOutro` (puro), `SavedOutroList` |
| La rama `outroId` de `setReelOutro` | Atar al Reel un outro del Generador, sin pasar por `mediaId` ni por una URL |
| `ReelOutroPicker` en `ReelLibrary.tsx` | Las tres vías: los outros generados, un video de la Biblioteca Multimedia o subir uno |
| `onPublish` → `DistributionPrefill` | «Publicar en redes sociales»: el asistente de Distribución de siempre, con el archivo cargado |

Pruebas: la sección 8 de `npm run test:reels:outro` (141 casos, **sin base,
credenciales ni red**; las funciones puras del selector se EJERCITAN
transpilando el `.tsx` con esbuild). Verificadas a la inversa sobre la rama
`outroId`, la enumeración de `outroId` en el normalizador y `preselectOutro`.

**Reglas durables:**

- **⚠️ NO HAY UN SEGUNDO MOTOR DE PUBLICACIÓN, Y DE AHÍ CUELGA TODO LO DEMÁS.**
  «Publicar en redes sociales» lleva a la **Distribución multi-destino**
  (v4.864) con `prefill`, que es el camino por el que ya sale todo lo demás
  —con su cola, su cadencia, su idempotencia por destino y su registro—. Un
  botón que llamara a Meta por su cuenta desde la Biblioteca de Reels se
  separaría de ése en silencio y lo que se separaría es en la cuenta de qué
  organización aparece una publicación. Lo fija una prueba que comprueba que
  `ReelLibrary.tsx` **no** mencione `social/publish` ni el servicio de
  publicación.
- **⚠️ EL SELECTOR DE OUTROS GUARDADOS ES UNO SOLO**, compartido por la
  Biblioteca de Reels y la Biblioteca Multimedia (`SavedOutroPicker.tsx`), y
  la consulta del catálogo vive **dentro** de él. Escrito dos veces, una
  pantalla ofrecería un outro que la otra no encuentra —y el día que se filtre
  algo más (`readyOnly`, el alcance, el predeterminado) una de las dos se
  queda atrás—. Es la lección de `SubmissionDetail` (v4.999) y del selector de
  pools (v4.877). Una prueba cuenta que ninguna de las dos pantallas conserve
  su propia consulta a `content-studio/outros?readyOnly=true`.
- **⚠️ Y EL RESOLUTOR DEL OUTRO TAMBIÉN ES UNO** (`loadOutroProject` +
  `outroAssetFrom` en `server/lib/outroAssets.js`), compartido por el
  controlador de la composición de la Biblioteca (v4.1039) y por el del Reel.
  Ahí viven el alcance por sitio —un outro ajeno responde «no existe», nunca
  403 (v4.999)— y la precedencia de la miniatura. Con dos, un outro podría ser
  alcanzable por una vía y no por la otra: **el aislamiento entre sitios no
  puede estar escrito dos veces**. Lo fija una prueba que exige que los dos
  controladores lo importen y que ninguno conserve su propio
  `SELECT * FROM "OutroProject"`.
- **⚠️ ELEGIR EL OUTRO SÓLO VUELVE A MONTAR: la regla de v4.1032 no se toca.**
  `setReelOutro` resuelve el outro y escribe `config.outro`; el archivo lo
  produce `POST /reels/:id/render` con las escenas que YA existen. Cero
  créditos de image-to-video, ninguna escena regenerada — lo comprueba la
  prueba leyendo el manejador (`!createKieVideoTask|dispatchScene`). **Esto no
  es lo de v4.1039**: allá se compone una VERSIÓN nueva de un video de la
  Biblioteca con ffmpeg; acá el outro entra como el último clip del montaje
  del propio Reel.
- **LA URL SALE DEL OUTRO RESUELTO, NUNCA DEL CUERPO.** El navegador manda un
  `outroId`; el servidor lo busca acotado al sitio y de la fila salen la
  dirección, el título y la miniatura. Aceptando la URL del cuerpo, cualquiera
  con el endpoint pegaría al final de un Reel institucional el archivo que
  quisiera.
- **⚠️ `outroId` VA ENUMERADO EN `normalizeOutroConfig`.** Ese normalizador
  RECONSTRUYE el outro campo por campo, así que lo que no se enumere se pierde
  al guardar y **no da ningún error**: la ficha simplemente deja de saber de
  qué outro del Generador salió. Es la trampa de `normalizeNode` en Plantillas
  IA. Se conserva mientras el ARCHIVO sea el mismo y se suelta al cambiarlo
  —un `outroId` que apunta a otro archivo es una afirmación falsa—, y un clip
  elegido de la Biblioteca Multimedia no lo inventa.
- **LAS TRES VÍAS SE CONSERVAN**, y los outros generados van PRIMERO porque
  son el caso normal en el Estudio: elegir de la Biblioteca Multimedia y subir
  un archivo siguen ahí (regla de v4.700 — una casilla de medios ofrece las
  dos vías, y acá son tres).
- **PUBLICAR SÓLO SE OFRECE CON ARCHIVO MONTADO** (`onPublish && reel.videoUrl`).
  Un Reel sin video no tiene qué publicar, y un botón que no lleva a ninguna
  parte es peor que ninguno (v4.650).
- **⚠️ EL TRADUCTOR DE DOM REESCRIBÍA «OUTRO» COMO «CIERRE», y ésa era la
  causa del reporte.** `LanguageContext` barre `#root` —el panel incluido, sin
  ninguna puerta por ruta— y **el idioma base también se traduce** (regla de
  v4.662, deliberada: el contenido no siempre está escrito en español). Como
  `looksLikeData` da `false` para «Outro» —tiene letras, no es una cifra ni
  una URL—, la palabra viaja al proveedor como lenguaje y vuelve traducida:
  quien buscaba la opción por su nombre no la encontraba en ninguna pantalla.
  **«Outro» es el nombre del módulo, no lenguaje**, así que va con
  `data-no-translate` en el rótulo de la sección, en los botones, en el
  selector compartido y en la pestaña «Outro IA». Funciona en el acto —
  `getTextNodes` **rechaza el subárbol entero**, así que no hay caché de
  traducción que invalidar. Al agregar una pantalla que nombre un módulo por
  su nombre propio, marcarlo.
- **⚠️ Y POR ESO LAS PRUEBAS QUE LEEN RÓTULOS DESARMAN LA MARCA ANTES DE
  BUSCARLOS** (`sinMarcas` en `test:library:outro`). Lo que se comprueba es el
  RÓTULO, no cómo esté envuelto: fijada a la forma literal, la comprobación se
  rompe al marcar una palabra con el criterio intacto — la lección de v4.984.
- **⚠️ UN DISTRITO VUELVE A VER «CUENTAS SOCIALES» Y «DISTRIBUCIÓN»**
  (`DISTRICT_HIDDEN_TABS`, hoy vacía). **Supersede la decisión de v4.931** en
  ese punto, con el mismo precedente que v4.1035 con «Outro IA»: las escondió
  porque «la Secretaría no las usa y estorban», y es el propio Distrito el que
  pide ahora publicar un Reel en redes desde su Biblioteca — sin destinos
  conectados, ese botón no llevaría a ninguna parte. La lista **se conserva**
  aunque esté vacía: es el único punto donde se declara qué se le esconde a un
  distrito, y volver a esconder una es agregarla ahí. La prueba comprueba que
  ninguna de las TRES que el Distrito pidió vuelva a ocultarse, no que la
  lista esté vacía.
- **`preselectOutro` PRESELECCIONA; no aplica nada.** Lo ya elegido manda sobre
  el predeterminado del sitio —cambiarle la elección a quien ya eligió sería
  desobedecerlo— y una elección que ya no está en la lista no se conserva.
- **⚠️ Y SE EJERCITA DE VERDAD, no con una expresión regular.** Es puro y
  decide qué outro aparece marcado: el `.tsx` se transpila con esbuild —React
  y lucide quedan externos, no se monta ningún componente— y el bloque se
  salta solo si esbuild no está instalado. El bundle se escribe DENTRO del
  proyecto a propósito: desde un `data:` URL, Node no resuelve los
  especificadores desnudos («react») y el módulo no llega a cargar.
- **NINGUNA RESPUESTA SE LEE CON `.json()` A CIEGAS** (`useSavedOutros`): una
  página de error HTML rompe el parseo y el error resultante no nombra ninguna
  capa (v4.946). Se lee como texto y lo que no es JSON se dice con su estado
  HTTP.
- **`ReelOutroPicker` vive en el ÁMBITO DEL MÓDULO** (v4.971): declarado dentro
  de la ficha sería un tipo nuevo en cada render y React desmontaría el árbol
  a cada pulsación.

**Pendientes conocidos:** el Reel **no se programa** desde su ficha — «Publicar
en redes sociales» abre la Distribución y ahí se decide, y la programación de
una difusión sigue siendo el pendiente declarado de v4.1013; y el selector de
outros **no ofrece crear uno nuevo** desde la ficha del Reel (se crea en
«Outro IA» y vuelve a abrirse el selector). ~~La ficha del Reel no se comprueba
en un navegador~~ — **RESUELTO en v4.1041**, y el defecto que ese pendiente
escondía se cobró en la versión siguiente: ver abajo.

### El control del outro, donde se busca qué hacerle al video (v4.1041)

Segundo reporte sobre lo mismo, con v4.1040 desplegada: *«sigue sin aparecer la
opción de agregar el outro en el video reel generado ya en la biblioteca; sí
aparece publicar en redes sociales»* — **y el botón estaba EN la captura**,
asomando contra el borde inferior del modal.

Pruebas: `npm run test:reels:ficha:ui` (14 comprobaciones en un navegador con el
CSS compilado; pide `playwright`, `esbuild` y `dist/`, y se salta solo) y cuatro
comprobaciones de criterio dentro de `npm run test:reels:outro` (145 casos).
Verificadas a la inversa por las DOS mitades.

- **⚠️ NO FALTABA NINGUNA FUNCIÓN: FALTABA VERLA, y el diagnóstico es
  geométrico.** El cableado de v4.1040 estaba entero —medido en el navegador: el
  selector abre, se pinta con `z-index: 70` por encima de la ficha y trae los
  outros guardados—. Lo que fallaba es DÓNDE caía el botón: `OutroSection` era
  el último bloque de la columna derecha, detrás de los dieciséis campos de la
  `<dl>` de metadatos. **Medido en una ventana de 1000 px: «Publicar en redes
  sociales» en y=713 (a la vista) y «Agregar outro» en y=992-1020 — el borde
  inferior VEINTE PÍXELES por debajo de la pantalla**, con 97 px de
  desplazamiento por delante. Es la regla de v4.1007 con otra forma: *un control
  que hay que descubrir es, para quien lo necesita, un control que no está.*
  **Ante un «no aparece» con el control en la captura, medir dónde cae — no
  buscar el fallo en el cableado.**
- **LO QUE SE HACE VA ANTES DE LO QUE SE CONSULTA.** `AudioSection` y
  `OutroSection` suben por encima de la `<dl>`: los metadatos son REFERENCIA
  —identificador, tasa de bits, peso— y no se accionan; poner dieciséis campos de
  consulta por encima de la única acción que transforma el video es el orden
  inverso al del uso. Sólo con eso el botón sube de y=992 a y=559.
- **⚠️ Y EL ATAJO VA EN LA COLUMNA DE LAS ACCIONES, que es donde se miró.** La
  columna izquierda son 280 px fijos con el video, «Publicar en redes sociales»
  y «Descargar»: ahí se busca qué hacerle a un Reel terminado, y ahí no había
  nada del outro. El atajo queda entre los dos, y dice «Agregar» o «Cambiar»
  según lo que haya. Subir la sección sin esto deja el control en la otra
  columna — visible, y no donde se lo busca.
- **⚠️ DOS PUERTAS, UN SOLO SELECTOR.** El estado del selector vive en
  `ReelDetail` y `OutroSection` lo recibe controlado (`chooserOpen` /
  `onChooserOpenChange`, **aditivos**: sin esas props se comporta como antes).
  Con un estado por control habría dos `ReelOutroPicker` montados y dos verdades
  sobre el mismo outro. Una prueba de navegador cuenta los selectores abiertos
  al pulsar cada puerta: **uno**. No contradice «no hay un segundo camino»
  (v4.1040): el camino es el mismo — lo que hay son dos accesos, como el menú y
  el avatar en «Mi perfil» (v4.941).
- **`puedeTocarOutro` ES UN SOLO PUNTO DE DECISIÓN.** Lo preguntan la sección y
  el atajo. Escrito dos veces, uno ofrecería el control sobre un Reel que
  todavía se mueve y el servidor rechazaría — la lección de la casilla de
  distritos (v4.748) y del selector de pools (v4.877). Una prueba cuenta sus
  llamadores: dos, y una sola definición.
- **⚠️ SE MIDE EN UN NAVEGADOR Y CON EL CSS COMPILADO.** Sin él la página se
  monta con todo en `display:block` y las medidas no son las de la maquetación
  real: la prueba pasaría por los motivos equivocados (v4.851). Y la prueba de
  navegador **se salta sola sin `dist/`**, así que el orden se fija ADEMÁS con
  una comprobación de criterio que lee el archivo — las dos hacen falta (v4.973).
- **⚠️ UNA COMPROBACIÓN FIJADA A LA FORMA LITERAL SE ROMPE AL REFACTORIZAR.**
  `test:reels:outro` exigía el texto exacto
  `<OutroSection reel={reel} onChanged={onChanged} />` y falló al agregarle una
  prop, con el criterio intacto. Se reescribió sobre la INVARIANTE —que la ficha
  monte la sección y le pase el Reel y su `onChanged`—, que es la lección de
  v4.984, ya pagada en v4.1040 con `sinMarcas`.
- **La palabra «outro» sigue marcada** con `data-no-translate` en las dos
  puertas: es el nombre del módulo, no lenguaje, y sin la marca el traductor de
  DOM la reescribe como «Cierre» — que fue el reporte de v4.1040. Una prueba de
  navegador comprueba que TODO botón que la nombre la lleve marcada.

### Publicar un Reel es Página + Instagram, NO grupos (v4.1042)

Reporte con la ficha de un Reel delante: *«desde un reel ya generado, al
presionar "Publicar en redes sociales" me lleva al módulo de Distribución, que
está orientado a grupos de Facebook. Eso no es lo que debe pasar»*. El pedido:
una pantalla de publicación directa a la **Página de Facebook** conectada y a
la **cuenta de Instagram vinculada a esa Página**, detectadas solas.

| Pieza | Qué es |
|---|---|
| `SHARE_KINDS` · `shareKindOf` · `networkSupports` (`socialShareSpec.js`) | La FORMA de lo que se publica. Un artículo es `link`, un Reel es `video` — y de eso cuelga que Instagram sea o no un destino posible |
| `videoOf` · `videoReadiness` · `IG_VIDEO_LIMITS` · `mediaReachable` | Qué archivo acepta cada red, comprobado ANTES de gastar la llamada |
| `REEL_COPY_BY_NETWORK` · `defaultMessagesForReel` · `messageForNetwork` | El copy POR RED: el que el generador ya escribió para cada una |
| `resolveReel` (`socialPublishingService.js`) | El resolutor de la segunda entidad. Lee el MASTER; no monta nada |
| `describeIntegration` (`contentShareController.js`) | El estado de la conexión con Meta, resuelto, con los tres casos que en pantalla se ven idénticos |
| `ContentDistribution."mediaUrl"` | Qué ARCHIVO salió. `link` es del artículo y no se mezclan |
| `onGroups` en `ShareModal.tsx` | Los grupos, como puerta SECUNDARIA del mismo modal |

Pruebas: `npm run test:social:share` (217 casos: criterio, el CAMINO con la
base, Meta y el descifrado sustituidos, e invariantes leídas de los archivos) y
`npm run test:reels:outro` (148). **Ninguna necesita Postgres, credenciales ni
red.** Verificadas a la inversa sobre el ruteo y sobre `videoOf`.

**Reglas durables:**

- **⚠️ LA CAUSA ERA UNA LÍNEA DE RUTEO, NO UNA FUNCIÓN QUE FALTARA.**
  `ContentStudio.tsx` resolvía `onPublish` de la Biblioteca de Reels con
  `setDistributionPrefill(...)` + `setTab('distribution')` — la decisión de
  v4.1040, tomada cuando el único camino a Meta con un archivo era la cola de
  la Distribución. **El motor ya publicaba video a los dos destinos**:
  `publishContentToTarget` sabe hacer `/{page-id}/videos` con `file_url` y el
  contenedor `media_type=REELS` de Instagram desde v4.864, y `'reel'` ya estaba
  en `ENTITY_TYPES` con el resolutor en `null`. Lo que faltaba era el resolutor
  y que la puerta llevara al modal. **Al diagnosticar «me lleva al módulo
  equivocado», mirar primero quién decide el destino del botón.**
- **⚠️ NO HAY UN SEGUNDO MOTOR DE META, y de eso cuelga todo lo demás.**
  `publishContentToTarget` sigue siendo el ÚNICO cliente de la Graph API, y el
  Reel entra por el MISMO `shareEntity`, el MISMO `ShareModal` y el MISMO
  registro que una noticia. Con dos caminos al proveedor, el día que se corrija
  el manejo de un rechazo una mitad se queda atrás y el fallo es MUDO: las dos
  siguen publicando. Lo fija una prueba que cuenta los LLAMADORES.
- **⚠️ PUBLICAR NO REGENERA NADA, Y ES ESTRUCTURAL.** Lo que viaja a Meta es
  `ReelProject.videoUrl` —el master que la ficha reproduce y que «Descargar»
  entrega—: `resolveReel` sólo LEE. El servicio no importa `kieService`, ni el
  compositor, ni la música, ni la narración, y una prueba lo lee. Cero créditos
  de IA, cero escenas reprocesadas.
- **⚠️ LA FORMA LA DECIDE LA ENTIDAD, NUNCA LA PANTALLA** (`shareKindOf`). Con
  `link`, Instagram no es un destino posible —su pie no hace pulsable una URL—;
  con `video`, sí, y es el destino principal de un Reel vertical. Si el
  navegador pudiera elegirla, el modal ofrecería una cuenta que el servidor va
  a rechazar. `ENTITY_KINDS` es un catálogo: el día que otra entidad se
  comparta como video, entra ahí y el resto no cambia.
- **⚠️ `videoOf` ES EL ÚNICO PUNTO QUE TRADUCE LA ENTIDAD AL ARCHIVO, y hace
  falta porque los dos nombres existen.** La entidad llama `mediaUrl` a su
  master —es lo que viaja al navegador y lo que se guarda en el registro— y el
  criterio del archivo lo llama `url`. **Lo destapó la prueba del camino, no la
  lectura**: con la traducción escrita en cada punto de llamada,
  `videoReadiness` leía `undefined`, lo tomaba por «sin archivo» y dejaba
  TODAS las cuentas sin poder publicar — sin ningún error, porque el motivo que
  se pinta es exactamente el de un Reel a medio montar. Es la lección de v4.744:
  el criterio estaba entero y el defecto vivía en el camino.
- **⚠️ EL ARCHIVO SE JUZGA CONTRA LA RED QUE LO VA A RECIBIR, ANTES de gastar
  la llamada.** El rechazo de Meta llega como un código que no dice qué
  corregir. `IG_VIDEO_LIMITS` son los límites DECLARADOS de un contenedor
  `media_type=REELS` (3 s a 15 min, MP4/MOV, 1 GB).
- **NO SE RECHAZA DE MÁS.** Sólo bloquea lo que Meta rechaza seguro; lo demás
  AVISA con su consecuencia — un apaisado en Instagram **se publica** y se dice
  que va a salir recortado; una duración que no se pudo medir no bloquea. Es la
  regla del Outro importado (v4.1036): un control demasiado estricto no falla
  ruidosamente, deja sin publicar una pieza que servía. Y el contenedor sólo lo
  exige Instagram: un `.webm` sale por Facebook.
- **⚠️ LA CUENTA Y EL ARCHIVO SON DOS MOTIVOS DISTINTOS y se dicen por
  separado.** El primero se corrige reconectando la cuenta; el segundo,
  montando otra pieza. Con un solo texto, quien lee «no se puede publicar» va a
  Configuración a reconectar algo que está bien.
- **⚠️ EL COPY ES POR RED.** Un Reel ya lo tiene escrito para Facebook y para
  Instagram (`ReelCopy`), y mandarle a una el de la otra sería tirar trabajo que
  ya se pagó. `REEL_COPY_BY_NETWORK` es la correspondencia DECLARADA entre la
  red y la plataforma para la que se escribió el copy — no una deducción por
  parecido de nombres. `messages` es **ADITIVO**: un cliente que sólo mande
  `message` (el flujo de Noticias) se comporta exactamente como antes, porque
  `messageForNetwork` cae a él. El texto editado NO toca el Reel.
- **⚠️ EL ESTADO DE LA CONEXIÓN SE RESUELVE EN EL SERVIDOR, y son TRES casos
  que en la pantalla se ven idénticos**: sin Página conectada, con Página y sin
  Instagram vinculado, y con las dos pero alguna sin servir. El segundo es el
  que de verdad se reporta («no me aparece Instagram»), y su salida es concreta:
  la cuenta tiene que ser **Profesional** y estar **vinculada a la Página en
  Meta Business**, y después hay que reconectar Meta — Meta sólo devuelve el
  `instagram_business_account` de una Página cuando se cumplen las dos cosas.
  No fallar en silencio es exactamente esto.
- **NO SE INVENTAN CREDENCIALES.** La Página se guarda como
  `SocialAccount platform='facebook'` y la cuenta de Instagram vinculada como
  `platform='instagram'` con su `pageId` y su `metadata.linkedPageId /
  linkedPageName / igUsername`, compartiendo el token de la Página — es lo que
  `handleMetaCallback` ya escribe. De qué Página cuelga un Instagram **se
  DICE**: es lo que permite comprobar que el que se ve es el de ESTA Página.
- **⚠️ EL TOKEN NO SALE AL NAVEGADOR, NI RECORTADO.** `describeTargets` no lo
  selecciona y el servicio lo lee en UN solo punto, en el momento de publicar.
- **⚠️ `ContentDistribution."mediaUrl"` ES UNA COLUMNA APARTE DE `link`.** Un
  enlace y un archivo son dos cosas distintas y el historial tiene que poder
  decir cuál salió: «se publicó un video» sin la dirección no se puede cotejar
  con nada. Va con su `ADD COLUMN IF NOT EXISTS` **enumerada en el atajo del
  ensure** (la trampa de v4.908), y una prueba lo recorre.
- **NO ES ATÓMICO Y SE DICE.** El desenlace es POR PLATAFORMA: si Facebook sale
  e Instagram falla, el estado global es `partial` —nunca «error»—, la que salió
  queda `published` con su id externo y su enlace, y **se reintenta sólo la que
  falló**, con otra clave de operación. En la pantalla, el reintento FUSIONA los
  desenlaces por cuenta: sin eso, volver a intentar la que falló borraría de la
  vista la que sí había salido.
- **⚠️ LOS GRUPOS NO SE QUITAN: PASAN A SER LA PUERTA SECUNDARIA**, dentro del
  mismo modal (`onGroups`), y siguen llevando al módulo de Distribución de
  siempre. Y el modal **no publica en ningún grupo**: la Facebook Groups API
  está retirada desde el 22 de abril de 2024 de TODAS las versiones (regla de
  v4.864) — ahí `group_manual` es una tarea para una persona, no una llamada.
  Lo fija una prueba.
- **EL MODAL ES UNO SOLO**, montado ahora por TRES entradas: el listado de
  Noticias, su editor y la ficha de un Reel. Escrito de nuevo para el Reel, el
  día que se agregue una red una de las pantallas se queda sin ella — la lección
  de `SubmissionDetail` (v4.999) y del selector de pools (v4.877).
- **CON VIDEO SE PRESELECCIONAN TODAS LAS CUENTAS LISTAS**; con un enlace se
  conserva la regla de v4.1013 (una sola Página). El pedido dice que Facebook e
  Instagram pueden venir marcadas cuando la conexión está sana, y un Reel se
  publica en las dos por defecto — un artículo no, porque ahí sólo hay un
  destino posible.
- **⚠️ EL ESPEJO DEL NAVEGADOR SIGUE SIENDO MÍNIMO.** No trae `videoReadiness`,
  ni `IG_VIDEO_LIMITS`, ni `mediaReachable`, ni `videoOf`, ni `shareKindOf`: qué
  archivo acepta Instagram y qué forma tiene una entidad lo decide el SERVIDOR y
  viaja resuelto. Con dos criterios, el modal ofrecería una cuenta que la API
  rechaza. Lo fija una prueba que comprueba su AUSENCIA.
- **⚠️ UNA COMPROBACIÓN DE RUTEO SE MIDE SOBRE EL MONTAJE, no sobre el
  archivo.** El Estudio lleva `setTab('distribution')` en otros sitios
  legítimos —el atajo secundario a los grupos es uno—, así que buscarlo suelto
  no distingue nada; y un regex atado a la forma exacta del manejador pasó en
  verde con el defecto reintroducido. Se recorta el montaje de `<ReelLibrary>`
  y se mira ahí. Verificado a la inversa en las DOS baterías.

**Pendientes conocidos:** la **programación** de una publicación no está —hoy se
publica en el acto, y el patrón vive en la cola de la Distribución
(`DistributionJob.scheduledAt`), que es el pendiente declarado desde v4.1013—;
la pantalla **no ofrece «Programar publicación»** a propósito, en vez de fingir
una cola que no existe. No hay **reintento automático** de un fallo transitorio
(`retryable` se calcula y se reintenta a mano desde el modal). Instagram
**no recibe enlaces** y por eso un artículo sigue saliendo sólo por Facebook.
Y el modal **no se comprueba en un navegador**: al tocar su maquetación,
mirarla (la lección de v4.717).

### El copy de un Reel: corto, sin hashtags y con su emoji — v4.1052

Reporte con el modal «Publicar en redes sociales» delante: un Reel saliendo a
Facebook y a Instagram con tres párrafos, una lista de hashtags al final y dos
textos distintos para el mismo video. Lo que se publica ahora es un pie breve
—máximo 100 caracteres, sin etiquetas, terminado en un emoji pertinente— y es
UNO solo para las dos redes.

| Pieza | Qué es |
|---|---|
| `server/lib/reelShareCopy.js` | El CRITERIO. **Puro**: catálogo cerrado de políticas, cuánto mide un copy, qué es un hashtag, qué es un emoji, cómo se limpia, cómo se acorta, el veredicto y el prompt |
| `src/lib/reelShareCopy.ts` | Espejo, comparado por SALIDAS. **Sin** el prompt, ni la lectura de la respuesta, ni la instrucción de reintento |
| `server/lib/reelShareCopyAI.js` | La orquestación de la varita: contexto, llamada, reintento con la regla rota y reparación por código |
| `validateShareMessage(message, policy)` (`socialShareSpec.js`) | El ÚNICO punto que decide si un texto puede salir |
| `reelShareMessage` · `resolveReel` | El copy corto que el modal recibe, compuesto sin gastar una llamada al modelo |
| `POST /social/share/copy` → `regenerateShareCopy` | La varita |

Pruebas: `npm run test:reels:sharecopy` (132 casos: criterio, paridad de los
dos espejos por SALIDAS, el CAMINO de la varita con la base y el redactor
sustituidos, e invariantes leídas de los archivos) y
`npm run test:social:share` (234, con la puerta del servidor ejercitada de
verdad). **Ninguna necesita Postgres, credenciales ni red.** Verificadas a la
inversa sobre cinco puntos.

**Reglas durables:**

- **⚠️ LA REGLA VIVE EN LAS DOS PUNTAS Y LA QUE MANDA ES LA DEL SERVIDOR.**
  `shareEntity` revalida CADA texto, cuenta por cuenta, justo antes de llamar
  a Meta: un navegador con el bundle anterior en caché —o cualquiera que
  conozca el endpoint— seguiría mandando el copy largo con sus hashtags, y la
  pantalla nueva no lo impediría (v4.868). El espejo del navegador existe para
  que el contador se mueva con cada tecla sin pagar un viaje de red, y lo que
  lo hace seguro es que la prueba compara las SALIDAS de los dos sobre una
  matriz de textos —el patrón de `fxRates` (v4.870) y de `checkoutSurcharge`
  (v4.980)—. Verificado a la inversa: neutralizando la puerta del servidor
  fallan ocho comprobaciones.
- **⚠️ ESTO MATIZA «EL COPY ES POR RED» (v4.1042), Y HAY QUE LEER LAS DOS
  JUNTAS.** `ReelCopy` sigue guardando un copy por red y `REEL_COPY_BY_NETWORK`
  sigue diciendo cuál corresponde a cuál: eso es la MATERIA PRIMA y no cambió
  —fundirlo en el almacenamiento tiraría trabajo ya pagado—. Lo que cambia es
  que de un Reel SALE un solo texto. `resolveReel` devuelve `defaultMessages:
  null` a propósito: con un copy por red la pantalla pinta una pestaña por red,
  los dos textos se pueden separar y la vista previa deja de prometer lo que se
  publica. Un artículo no cambia ni una línea.
- **⚠️ UNA SOLA FUENTE DE VERDAD, Y SE COMPRUEBA CONTÁNDOLA.** El modal compone
  `textoActual` UNA vez y de ahí lo leen el campo, la vista previa y el cuerpo
  de la petición. Una prueba cuenta las definiciones (una) y que nadie más
  vuelva a componerlo — fijada a la forma exacta se rompería al refactorizar
  con el criterio intacto (v4.984), así que se comprueba la INVARIANTE.
- **⚠️ CUATRO COSAS BLOQUEAN Y UNA AVISA.** Bloquean vacío, más de 100, un
  hashtag y no terminar en emoji: son exactamente las que el pedido enumera
  antes de publicar. Una dirección web sólo AVISA —no está en esa lista, y
  convertir toda observación en bloqueo es cómo se llega a que nadie las lea
  (v4.854)—. Cada bloqueo dice su MOTIVO y su SALIDA: uno sin salida se lee
  como una avería (v4.1008).
- **⚠️ SE ACORTA POR FRASES COMPLETAS ANTES QUE CON PUNTOS SUSPENSIVOS, y
  NUNCA a mitad de palabra.** `fitShareCopy` prueba primero con las oraciones
  que entran enteras; sólo si ninguna cabe corta en el último espacio y cierra
  con `…`. Un texto partido a mitad de palabra se lee como un error del
  sistema, y el pedido lo dice con esas palabras: «preferimos una reescritura
  completa».
- **⚠️ Y POR ESO EL VEREDICTO SE CALCULA SOBRE LO QUE EL MODELO ESCRIBIÓ, NO
  SOBRE LO QUE QUEDARÍA DESPUÉS DE REPARARLO.** Validando la salida ya
  saneada, acortada y con su emoji pegado, el veredicto diría «cumple»
  SIEMPRE y la instrucción de reescritura no saldría nunca: la varita
  entregaría siempre un recorte y jamás un texto reescrito. Es la trampa más
  fácil de este módulo y está verificada a la inversa.
- **EL MODELO ESCRIBE Y EL CÓDIGO DECIDE**, con la regla CONCRETA de vuelta
  —cuántos caracteres lleva, qué hashtags hay— y hasta tres intentos. Pedirle
  «revisá el formato» no corrige nada (`templateComposer.js`, v4.891). Y
  agotados los intentos **no se tira el trabajo**: se repara por código y se
  DICE qué hubo que hacerle, con `source` distinguiendo `ia`, `ia_reparado` y
  `plantilla`. Presentar la plantilla del sistema como si la hubiera escrito la
  IA sería afirmar algo que no pasó (v4.929).
- **⚠️ LA VARITA NO TOCA EL VIDEO, Y ES ESTRUCTURAL.** `reelShareCopyAI.js` no
  importa `kieService`, ni el compositor, ni la música, ni la narración, ni
  despacha una escena: lo único que produce es TEXTO. Una prueba lee el archivo
  y falla si aparece cualquiera de ellos — el fallo sería MUDO (el copy sale
  igual y el gasto aparece en el medidor de créditos un mes después).
  Verificado a la inversa inyectando el import.
- **EL COPY POR DEFECTO SE COMPONE SIN LA IA.** Abrir el modal no cuesta una
  llamada al modelo: `reelShareMessage` toma el copy que el Reel ya tiene
  escrito, le quita los hashtags, lo acorta por frases y le pone su emoji. La
  varita es el gesto EXPRESO y on-demand — de lo exacto a lo inseguro (v4.811).
- **EL EMOJI SE ELIGE POR LO QUE DICE EL TEXTO** (`EMOJI_HINTS`, catálogo
  declarado de doce), con `🤝` de neutro, y el que el texto ya traía se
  respeta. Al agregar una palabra clave, probarla contra copys REALES: `jornada`
  y `encuentro` ya casan, y una demasiado común se come a las específicas.
- **⚠️ `#4281` NO ES UN HASHTAG.** La expresión exige al menos una LETRA, o
  «Distrito #4281» quedaría destrozado. Y `hasHashtags` cuenta las
  coincidencias en vez de usar `.test()` sobre una expresión global: el
  `lastIndex` avanza y la segunda pregunta sobre el MISMO texto contestaría
  `false`.
- **⚠️ `®` Y `™` NO SON EMOJI.** `\p{Extended_Pictographic}` solo los incluye,
  así que «Rotary International®» pasaría por «termina en emoji». Se exige
  `\p{Emoji_Presentation}` **o** `\p{Extended_Pictographic}` seguido de
  `U+FE0F`. Las cadenas ZWJ, los tonos de piel, las banderas y los teclados
  numéricos se reconocen aparte. Verificado a la inversa.
- **SE CUENTA EN PUNTOS DE CÓDIGO**, no en unidades UTF-16 ni en grafemas: es
  la única cuenta idéntica en el servidor y en el navegador sin depender de
  `Intl.Segmenter`. Una bandera cuenta dos y una familia con ZWJ cuenta de más
  — hacia el lado SEGURO, que es el que no deja publicar de largo.
- **⚠️ LOS HASHTAGS SE QUITAN SIEMPRE; LAS DIRECCIONES, SÓLO CON EL GESTO
  EXPRESO.** Quitar un hashtag deja una frase legible; quitar una URL deja
  «Mirá todo en y sumate», con la preposición colgando. Por eso
  `sanitizeShareCopy` conserva los enlaces —que además sólo avisan— y
  `cleanShareCopy` —lo que hace «Limpiar automáticamente»— sí los quita: ahí es
  una persona la que lo pide y ve el resultado antes de publicar.
- **EL ESPEJO ES MÍNIMO.** No trae `buildShareCopyPrompt`, ni `readShareCopy`,
  ni `retryInstructionFor`, ni `COPY_RULES_TEXT`, ni `EMOJI_HINTS`: cómo se le
  pide al modelo y cómo se lee su respuesta lo decide el servidor. Lo fija una
  prueba que comprueba su AUSENCIA.
- **LA POLÍTICA ES UN CATÁLOGO CERRADO** (`COPY_POLICIES`) y `null` significa
  «comportate como siempre». Un artículo no pasa por acá —su Copy Estratégico
  tiene otro tope y sus hashtags— y la varita lo rechaza con su motivo: un
  copy de noticia reescrito a 100 caracteres sería un cambio que nadie pidió.
- **`/share/copy` VA ANTES DE `/share`.** Una literal debajo de su paramétrica
  es inalcanzable y el fallo es MUDO (`check:routes`).
- **⚠️ `check:server-undef` ES LA BARRERA QUE ATRAPA ESTO.** Al cablear la
  política en `shareEntity` quedó un `policy` usado y sin declarar: el archivo
  PARSEA, el typecheck no mira el servidor y las pruebas puras no ejecutan el
  manejador. Lo destapó esa comprobación —y la prueba del CAMINO, que sí lo
  ejecuta—. Al agregar una variable a un manejador del servidor, correrla.

### Compartir una noticia: un copy POR RED, con la URL del sitio — v4.1061

Pedido con cuatro capturas: el modal de «Compartir en redes» generaba UN texto
con listas de hashtags, pasado del tope («359 / 260 ch» en rojo) y cerrado con
el dominio técnico de Club Platform en vez del dominio del sitio.

| Pieza | Qué es |
|---|---|
| `ARTICLE_COPY_POLICIES` · `copyPolicyFor(tipo, red)` · `copyPoliciesFor` (`reelShareCopy.js`) | El CRITERIO. **Puro**: una política POR RED, con su tope real, su forma y qué avisa |
| `composeArticleCopy` · `defaultArticleCopies` · `ARTICLE_CTA` | El compositor. **Reserva el cierre ANTES de acortar** |
| `ARTICLE_BRIEF` · `ARTICLE_COPY_RULES_TEXT` · `buildArticleCopyPrompt` | El encargo al modelo, con la instrucción del cliente textual |
| `runShareCopyLoop` · `generateArticleShareCopy` (`reelShareCopyAI.js`) | El bucle extraído: escribe, valida, reintenta con la regla rota, repara por código |
| `publicHostFor` en `campaignPostController.js` | La corrección de la URL: **un solo resolutor**, no un segundo |
| `redesConProblema` · `acortarCopy` · `yaPublicadas` (`ShareModal.tsx`) | Las tres mitades de la pantalla: avisar antes, acortar sin cortar, y el repetido por cuenta |

Pruebas: `npm run test:reels:sharecopy` (179 casos: criterio, paridad de los dos
espejos sobre políticas de artículo y el cableado leído de los archivos) y
`npm run test:social:share` (245, el CAMINO con la base, Meta y el descifrado
sustituidos). **Ninguna necesita Postgres, credenciales ni red.** Verificadas a
la inversa.

**Reglas durables:**

- **⚠️ LA DIRECCIÓN NO ESTABA MAL EN NOTICIAS: ESTABA MAL EN CAMPAÑAS, y ahí
  está el diagnóstico.** `postPublicUrl.js` ya resolvía el dominio propio con
  `publicHostFor` —Club.domain → la fila de District para un sitio de distrito
  → el subdominio de la plataforma— y lo hacía bien. Quien componía la
  dirección por su cuenta era `campaignPostController.siteUrlFor`, que miraba
  sólo `Club.domain` y `subdomain`: en el sitio de un DISTRITO eso nunca
  encuentra nada (v4.744) y caía al dominio técnico. **Al reportarse «publica
  la URL equivocada», buscar cuántos resolutores hay antes de corregir el que
  se tenía delante.** Ahora hay UNO y lo importan los dos.
- **⚠️ EL CIERRE SE RESERVA ANTES DE ACORTAR.** Es el punto que sostiene el
  módulo entero. Compuesto al revés —acortar el cuerpo al tope y pegarle
  después el llamado a la acción y la URL— el copy de X saldría SIEMPRE pasado,
  que es literalmente lo que el cliente fotografió. `composeArticleCopy` mide el
  cierre, se lo descuenta al tope y ajusta el cuerpo contra lo que queda.
- **UNA POLÍTICA POR RED, Y LOS TOPES SON LOS REALES** (2.000 / 2.200 / 280 /
  3.000). Un solo tope para las cuatro deja el de LinkedIn inservible o el de X
  imposible; y el contador de la pantalla se pinta con la política de la
  PESTAÑA ACTIVA, no con una global.
- **⚠️ `copyPolicyFor` ES ADITIVO EN LA RED.** `copyPolicyFor('post')` sin red
  sigue devolviendo `null` —que es lo que hace que un cliente anterior a
  v4.1061 se comporte exactamente como antes— y con red devuelve la de esa red.
  Lo fija una prueba en los dos sentidos.
- **⚠️ LOS RÓTULOS SON DATOS DE LA POLÍTICA, no cadenas dentro del validador.**
  Con el texto pegado al `if`, el copy de un artículo de LinkedIn decía «El copy
  del Reel debe tener máximo 3000 caracteres». Los valores por omisión
  reproducen LETRA POR LETRA los de antes, así que el Reel no cambió ni una
  palabra.
- **⚠️ SIN HASHTAGS, Y ESO SÍ BLOQUEA.** Es el pedido expreso y repetido del
  cliente, y el bloqueo es admisible porque tiene salida de UN CLIC —«Limpiar
  automáticamente»—: un bloqueo sin salida se lee como una avería (v4.1008).
  Ningún copy de artículo los genera, y el compositor los quita de la materia
  prima antes de componer.
- **⚠️ LA DIRECCIÓN QUE FALTA AVISA; NO BLOQUEA** (`wantsLink`, y el nombre lo
  dice a propósito). En Facebook el enlace viaja en su PROPIO campo y Meta arma
  la tarjeta igual, así que un texto sin la URL se publica bien: bloquearlo
  sería rechazar de más (v4.1042) y dejaría sin publicar un pie correcto a quien
  la borró a sabiendas. Lo que garantiza la estructura es el COMPOSITOR y el
  bucle de la IA, no la puerta.
- **⚠️ EL BUCLE DE LA IA ES MÁS ESTRICTO QUE LA PUERTA DE PUBLICAR, y esa
  asimetría es deliberada.** A un modelo se le pide la estructura entera y se le
  vuelve a pedir con la regla concreta si omite el enlace; a una persona no se
  le impide publicar. Agotados los intentos, la reparación **la escribe el
  código con la URL EXACTA** — que es además lo que impide que un modelo acorte
  o invente una dirección.
- **⚠️ INSTAGRAM NO LLEVA ENLACE, ni pegado al final.** Su pie no hace pulsable
  una dirección: escribirla ocupa caracteres y no lleva a ninguna parte, la
  misma razón por la que el Reel tampoco la lleva. Componerla Y avisar de ella
  sería generar lo que después se desaconseja.
- **EL COPY POR DEFECTO SE COMPONE SIN LA IA.** Abrir el modal no cuesta una
  llamada al modelo: `defaultArticleCopies` compone las cuatro de una vez con lo
  que la noticia ya tiene escrito. La varita es el gesto EXPRESO (v4.1052).
- **«REGENERAR COPY» ES POR RED.** El endpoint exige `network` para un artículo
  y responde 400 con los topes de las cuatro cuando falta: sin él reescribiría
  las cuatro pestañas de una vez y se llevaría por delante lo editado a mano.
  **La URL no viaja en la petición**: la resuelve el servidor, o cualquiera con
  el endpoint elegiría a dónde apunta un enlace publicado por una institución.
- **⚠️ SE COMPRUEBAN TODAS LAS REDES ELEGIDAS, NO SÓLO LA PESTAÑA ABIERTA.** Con
  una sola, alguien corrige Facebook, cambia de pestaña, publica, y el de X —que
  se pasa de 280— lo rechaza el servidor DESPUÉS de que Facebook ya salió: un
  fallo parcial que se podía haber dicho antes de gastar el gesto. El aviso
  nombra la red y salta a su pestaña.
- **«ACORTAR CON IA» REESCRIBE; NO RECORTA.** Va por el mismo endpoint de la
  varita con una instrucción, así que hereda su validación y su veracidad. Un
  texto cortado a mitad de idea se lee como un error del sistema.
- **⚠️ EL SERVIDOR RESUELVE LA POLÍTICA POR CUENTA, no una vez por operación.**
  `shareEntity` la pide con `copyPolicyFor(entityType, acc.platform)`: con una
  sola, el texto de Facebook se validaría contra el tope de X o al revés. La
  pantalla es comodidad; la puerta que no se puede saltar es ésta.
- **EL AVISO DE REPETIDO ES POR CUENTA.** «Ya se publicó 3 veces» no dice que la
  Página recién marcada sea una de ellas, y una publicación duplicada en la
  cuenta de una institución hay que ir a borrarla a mano en Meta. Se casa por
  `accountId` —que por eso entró al `SELECT` del historial (la trampa del SELECT
  corto, v4.886)— y, para las filas viejas, por red + página. **No bloquea**:
  repetir puede ser exactamente lo que se quiere.
- **NO HAY UN SEGUNDO MOTOR NI UN SEGUNDO MODAL.** Se publica por
  `publishContentToTarget` —el único cliente de la Graph API— desde el MISMO
  `ShareModal` que montan el listado de Noticias, su editor y la ficha de un
  Reel. Lo que cambió es el texto que se compone, no por dónde sale.
- **⚠️ UNA COMPROBACIÓN FIJADA A LA FORMA LITERAL SE ROMPE AL REFACTORIZAR.** Dos
  de `test:reels:sharecopy` exigían `copyPolicyFor(entityType)` y `estadoCopy.ok`
  junto a `puedePublicar`, y fallaron con el criterio intacto y MÁS estricto. Se
  reescribieron sobre la INVARIANTE — la lección de v4.984, pagada otra vez.
- **⚠️ Y UN FIXTURE PUEDE CODIFICAR EL CONTRATO ANTERIOR.** `test:social:share`
  daba por bueno que «un artículo se publica con su copy largo y sus hashtags»:
  era cierto cuando un artículo no tenía ninguna regla, y es justo lo que el
  cliente pidió cambiar. Se conservó la mitad que sigue siendo verdad —el tope
  de 100 del Reel NO es el del artículo— y se agregó la que cambió.

**Pendientes conocidos:** **X y LinkedIn se declaran y no publican** —el único
proveedor conectado es Meta, así que sus políticas existen para que el copy ya
esté escrito el día que haya adaptador—; el botón **«Programar» sigue sin
guardar** la publicación para más tarde (el patrón vive en
`DistributionJob.scheduledAt` y engancharlo es la vuelta siguiente, que es el
mismo pendiente declarado desde v4.1013); y la **imagen es la destacada de la
noticia**, sin formatos por plataforma —Facebook la resuelve leyendo el Open
Graph que el servidor ya compone—. ~~El modal no se comprueba en un
navegador~~ — **RESUELTO en v4.1062**, y esa comprobación se cobró tres
defectos en el acto: ver abajo. ⚠️ **Y una afirmación de esta sección era
FALSA**: decía que «el modal las ofrece como pestañas de redacción», y no lo
hacía —las pestañas salían de los destinos LISTOS, así que con sólo Meta
conectado X y LinkedIn no se pintaban—. Al escribir un pendiente, comprobar
que la mitad que se declara resuelta lo esté.

### Montar el modal es lo que destapa lo que ninguna prueba ve — v4.1062

Reporte de dos palabras: **«No funciona»**. Con v4.1061 desplegada, el
servidor componía bien, las 179 comprobaciones estaban en verde y el `build`
salía limpio. Montar `ShareModal` en un navegador —el pendiente que la propia
sección anterior declaraba— dio los TRES defectos en una sola corrida.

| Pieza | Qué es |
|---|---|
| `multiline` en la política (`reelShareCopy.js` y su espejo) | Si el copy se escribe en varios párrafos. Lo declara el SERVIDOR |
| `normalizeSpaces(s, { keepParagraphs })` | El saneado, ahora con dos comportamientos declarados |
| `redesDeCopy` en `ShareModal.tsx` | Las pestañas: las redes con REGLA, no las con cuenta |
| El rótulo de `Publicar en …` | Las redes realmente elegidas |

Pruebas: los grupos 15 y 16 de `npm run test:reels:sharecopy` (200 casos),
verificados a la inversa por los tres puntos.

- **⚠️ UN COPY DE UNA LÍNEA Y UNO DE VARIOS PÁRRAFOS NO SE SANEAN IGUAL, y era
  UNA sola causa con DOS síntomas.** `normalizeSpaces` aplanaba `\n\n` → `\n`
  porque se escribió para el pie de un Reel —cien caracteres corridos, donde
  dos saltos seguidos son un descuido— y `composeArticleCopy` lo reutilizaba:
  Facebook salía en **un solo bloque** donde el pedido pide «2 a 4 párrafos
  cortos», con el gancho, el contexto y el llamado a la acción pegados. Y el
  MISMO aplanado hacía que `canClean` fuera cierto SIEMPRE —el texto compuesto
  nunca coincidía con su propio saneado—, así que «Limpiar automáticamente» se
  ofrecía sin nada que limpiar y, pulsado, habría destruido justamente la
  maquetación que alguien acababa de revisar. `multiline` es una declaración de
  la POLÍTICA y no una constante del saneado: un artículo lo lleva, un Reel no.
- **La línea en blanco ES la estructura**, así que se conserva UNA y nunca más
  de una: `\n{3,}` sigue colapsando. Lo fija una prueba en los dos sentidos —el
  copy del Reel tiene que seguir aplanando—.
- **⚠️ LAS PESTAÑAS SON LAS REDES QUE TIENEN REGLA, NO LAS QUE TIENEN CUENTA.**
  Salían de `redesListas` —los destinos listos para publicar—, así que con sólo
  Meta conectado el modal pintaba DOS y las políticas de X (280) y de LinkedIn
  (3.000) **no se podían ni mirar**: el copy de esas redes se componía, viajaba
  con la noticia y nadie podía revisarlo ni corregirlo. Redactar y publicar son
  dos cosas distintas. El orden lo da el catálogo del SERVIDOR, no el de las
  cuentas: si no, cambiaría según en qué orden se conectaron.
- **UNA PESTAÑA SIN DESTINO SE ATENÚA Y LO DICE**, no desaparece ni se
  deshabilita: «se redacta y se guarda con la noticia; todavía no se publica
  desde la plataforma». Un control ausente sin explicación es indistinguible de
  que falte algo (v4.938); uno presente y mudo promete lo que no va a pasar.
- **⚠️ Y AGREGAR PESTAÑAS NO PUEDE BLOQUEAR LA PUBLICACIÓN.** `redesConProblema`
  y `faltaTexto` siguen mirando **sólo** `redesElegidas` —las redes de las
  cuentas MARCADAS—, así que un copy de X pasado de 280 no impide publicar en
  Facebook: ahí X no es un destino. Con la comprobación sobre las pestañas, el
  modal se habría bloqueado por una red que no publica.
- **EL BOTÓN NOMBRA LAS REDES ELEGIDAS.** Decía `Publicar en Facebook` escrito a
  mano con Instagram también marcado, mientras el «(2)» de al lado lo desmentía.
  Un rótulo que nombra una red que no es la única es la misma clase de
  afirmación falsa que el toast de v4.1048.
- **⚠️ CASI DIAGNOSTIQUÉ UN COMPOSITOR SANO COMO ROTO.** La primera sonda llamó
  a `defaultArticleCopies({title, excerpt, socialCopy, url})` y la firma real es
  `{ source, title, publicUrl, cta }`: salieron los cuatro copys iguales al
  título y parecía el defecto. **Al sondear una función, leer su firma antes de
  creerle a la salida.**
- **Verificado a la inversa los tres**: `multiline: false` → 8 fallos; las
  pestañas desde `redesListas` → 1; el rótulo escrito a mano → 2. La tercera
  inversión pasó en verde al primer intento porque mi sustitución no casó — una
  comprobación que no falla al reintroducir el defecto es una comprobación
  vacua (v4.896), y hubo que rehacerla con el texto exacto.

### El MÁSTER es el archivo, no la orden de montaje — v4.1049

Tercer reporte sobre lo mismo, con las tres capturas juntas: la ficha diciendo
«Outro integrado al video» y la banda verde «el video montado lleva este outro»,
el reproductor con **20,0 s** y sin cierre, y la pantalla de publicar mandando a
Facebook e Instagram ese mismo archivo de 20 s. **No fallaba el compositor** —la
sección 7 de las pruebas monta de verdad y la duración sale bien—: fallaba qué se
leía para saber qué lleva el archivo.

| Pieza | Qué es |
|---|---|
| `masterOutroKey` (`reelOutro.js`) | El CRITERIO. **Puro**: qué outro lleva el ARCHIVO — el sello, o el spec corroborado con la duración medida |
| `masterStamp` (`reelController.js`) | El sello, escrito en el MISMO `UPDATE` que `videoUrl` y `durationSec` |
| `config.master` | Dónde vive: `{ stampedAt, outro, totalSec, durationSec }` |
| `CLIP_FETCH_TIMEOUT_MS` · `MASTER_FETCH_TIMEOUT_MS` | El tope de cada descarga del montaje |

Pruebas: la sección 11 de `npm run test:reels:outro` (247 casos; monta de
verdad 20,0 s + un outro de 5,2 s y mide **24,6 s** con el mismo `probeMp4` que
escribe la duración de la ficha). Verificadas a la inversa sobre los cinco
puntos.

- **⚠️ `renderSpec` ES LA INTENCIÓN, NO EL ARCHIVO, y de ahí salían las tres
  afirmaciones falsas.** `submitAssembly` lo escribe **antes** de llamar al
  compositor. Con un montaje que falla —un clip que no se descarga, el tiempo
  agotado, el proveedor caído— la fila queda en `error`, con el `videoUrl` del
  máster ANTERIOR de 20 s… y con un spec que dice que ese archivo lleva el
  cierre. `renderedOutroKey(renderSpec)` leía eso como un hecho: de ahí el aviso
  «Outro integrado al video», la banda verde de la ficha y —lo caro— `stale:
  false`, que DESBLOQUEA publicar. Reproducido con las funciones reales antes de
  tocar nada. **Ante un «lo activé y el archivo no cambió», mirar si lo que se
  consulta se escribe antes o después del trabajo.**
- **⚠️ EL ARCHIVO SE SELLA CON EL ARCHIVO.** `config.master` lo escribe la
  ingesta en el MISMO `UPDATE` que `videoUrl` y la duración medida, así que un
  montaje que no terminó **no puede sellar nada**. Es exacto de acá en adelante
  y no depende de ninguna heurística. Lo fija una prueba que cuenta las dos
  ingestas —local y alojada—: con una sola sellando, el camino del proveedor
  alojado volvería a mentir en silencio.
- **⚠️ Y PARA LO MONTADO ANTES, LA DURACIÓN DESMIENTE AL SPEC.** Es además la
  comprobación que el reporte pedía: **si el archivo sigue durando lo que duraba
  sin el outro, el montaje no lo llevó**, conteste lo que conteste el spec. Sólo
  se usa cuando el cierre aporta metraje DISTINGUIBLE: por debajo de la
  tolerancia de duración las dos hipótesis miden lo mismo y no hay nada que
  desmentir. Ante la duda se conserva lo que dice el spec — equivocarse hacia
  «no lo lleva» cuesta un remontaje (cero créditos); hacia «sí lo lleva» cuesta
  una publicación con el archivo equivocado, que no se deshace desde acá.
- **⚠️ `num(null)` ES 0, Y ACÁ ESO DABA TODO REEL LEGADO POR DESINCRONIZADO.**
  El helper del archivo es `Number.isFinite(Number(v)) ? Number(v) : null` y
  `Number(null) === 0`: leída a secas, la duración ausente se juzgaba como un
  archivo de cero segundos. Es la trampa de `previewSec` y `sortOrder` (v4.954),
  pagada otra vez. Lo destapó la prueba, no la lectura.
- **NO HIZO FALTA TOCAR LA PANTALLA.** El aviso, las dos bandas y el bloqueo de
  Publicar ya salían todos de `outroSync` (v4.1047-v4.1048): corregido el
  criterio, el toast se pone en rojo con su motivo, la banda verde desaparece,
  aparece «Volver a montar con el outro» y Publicar queda bloqueado. Es lo que
  se gana con un solo punto de decisión — y es la comprobación de que el defecto
  estaba en la fuente de verdad y no en cómo se pintaba.
- **⚠️ QUE EL MONTAJE SE HAYA LANZADO NO ES QUE HAYA TERMINADO.**
  `remountReel` devuelve `ok` cuando encontró con qué montar; el montaje puede
  fallar después. `respondOutroChange` relee el veredicto de la fila RESULTANTE
  y anota el motivo: sin eso, el outro quedaba guardado, el video sin cierre y
  no se escribía nada en la ficha.
- **⚠️ UN ARCHIVO CON CIERRE DEJABA DE PASAR SU PROPIA VALIDACIÓN.** Las dos
  ingestas juzgaban la duración contra `config.timing.finalDurationSec`, que son
  las ESCENAS y no cuenta el outro: un máster correcto de 24,6 s se comparaba
  contra 20 y salía «Duración fuera de rango» → `needs_review`. Se juzga contra
  `renderSpec.totalSec`, que es lo que el montaje dijo que iba a producir. Una
  prueba lo comprueba en los dos sentidos: el archivo pasa contra el spec y
  reprueba contra las escenas solas.
- **⚠️ NINGUNA DESCARGA DEL MONTAJE SIN TOPE DE TIEMPO** (regla de v4.875, que
  este camino incumplía en dos sitios). Los clips y el outro los baja
  `ffmpegLocal.submit` DENTRO del presupuesto del montaje: un origen que no
  responde se come los 240 s de ffmpeg antes de que ffmpeg arranque, y el Reel
  muere con «no se pudo montar» sin decir que lo que falló fue una descarga.
  `fetchRenderBuffer` —el máster de un proveedor alojado— tenía el mismo hueco.
- **EL OUTRO SE NOMBRA CUANDO SU DESCARGA FALLA.** Es el último clip, así que
  sin eso su fallo salía como «el clip 6» y mandaba a revisar una escena que
  está perfecta.
- **NO SE AFLOJÓ NADA DEL MONTAJE.** Un clip que no se puede bajar sigue
  tumbando el montaje en vez de producir en silencio un máster sin cierre: con
  el criterio corregido eso se reporta como desincronizado y se resuelve
  volviendo a montar, que es visible; un máster sin el outro que alguien pidió
  no lo es.
- **EL CACHE BUSTING YA ESTABA RESUELTO y conviene no tocarlo**: cada montaje
  sube a una clave NUEVA (`…/reels/${Date.now()}-${slug}.mp4`), así que
  `videoUrl` cambia y el reproductor, la descarga y la publicación —que leen ese
  mismo campo— ven el archivo nuevo sin invalidar nada. No sobrescribir la clave
  anterior.
- **UN AVISO SIN SALIDA ES UN CALLEJÓN.** Desincronizado y sin poder montar
  —quedan escenas pendientes, o el Reel está en curso— no pintaba NADA: el outro
  guardado, el video sin cierre y publicar bloqueado sin decir por qué.
- **⚠️ UNA COMPROBACIÓN FIJADA A LA FORMA LITERAL SE ROMPE AL ENDURECER EL
  CRITERIO.** La de v4.1047 exigía el texto `if (!montado.ok)` y falló al sumarle
  la relectura del veredicto, con el criterio intacto y MÁS estricto. Se
  reescribió sobre la invariante — la lección de v4.984, pagada otra vez.
- **⚠️ Y UN FIXTURE MAL CALCULADO DENUNCIA AL COMPOSITOR POR SU PROPIA CUENTA
  MAL ECHADA.** El primer intento de la prueba de 20 s usaba cuatro escenas de
  5 s y esperaba 20: con tres fundidos de 0,5 s el origen son **18,5 s**, y la
  prueba acusó al montaje de entregar de menos. Son cinco escenas de 4,4 s. Al
  escribir un fixture de duración, descontar los fundidos.

### Volver a montar NO es haber montado — v4.1050

Cuarto reporte sobre el mismo outro, con tres capturas a la vez: el toast VERDE
«Montaje relanzado con las escenas existentes. No se regenera ninguna», el
reproductor marcando **20,0 s** sin cierre, y «Publicar en redes sociales»
bloqueado. **Las tres eran ciertas al mismo tiempo**, y por eso el reporte no
tenía por dónde empezar.

| Pieza | Qué es |
|---|---|
| `remountOutcome` · `REMOUNT_WORKING_STATUSES` (`reelOutro.js`) | El CRITERIO del desenlace. **Puro**: qué pasó de verdad con el archivo tras un remontaje |
| `remountReading` · `remountReel` (`reelController.js`) | La relectura de la fila RESULTANTE, en UN punto para las dos vías |
| `remount` en la respuesta de `POST /reels/:id/render` y de `PUT/DELETE /reels/:id/outro` | El desenlace, resuelto, al lado del DTO |
| `decirDesenlace` (`ReelLibrary.tsx`) | Lo que se dice al terminar, en un solo sitio |

Pruebas: la sección 12 de `npm run test:reels:outro` (273 casos). Verificadas a
la inversa sobre los cinco puntos.

- **⚠️ EL SERVIDOR CONTESTA 200 TAMBIÉN CUANDO EL MONTAJE TERMINÓ MAL, y ahí
  estaba el defecto.** `submitAssembly` devuelve una fila en CUATRO desenlaces
  distintos —montó, terminó en `error`, faltan escenas, otro proceso tenía el
  candado— y `remountReel` contestaba `ok: true` en todos: le bastaba haber
  encontrado con qué montar. La pantalla cantaba el mismo verde en los cuatro.
  **Ante un «dice que se montó y el archivo no cambió», mirar si quien contesta
  llegó a mirar el resultado.**
- **⚠️ Y ES LA LECCIÓN DE v4.1049 POR LA OTRA PUERTA.** Aquélla puso la
  relectura del veredicto en `respondOutroChange` —la vía de GUARDAR el
  outro— y no en `renderReel`, que es el botón que se pulsa cuando la ficha
  dice que hay que volver a montar. Por eso el criterio vive ahora en
  `reelOutro.js` y lo consumen las DOS vías: con uno por vía, la próxima se
  queda atrás y el fallo es MUDO — las dos siguen devolviendo un proyecto, y
  lo que se separa es si alguien se entera de que su video no cambió.
- **⚠️ EL MOTIVO CONCRETO EXISTÍA Y NO LLEGABA A NINGUNA PANTALLA.**
  `submitAssembly` escribe en `statusDetail` qué falló —qué descarga, qué
  tiempo, qué escena— desde v4.664, y el diagnóstico técnico en `renderRaw`
  desde v4.786. El listado pinta `statusDetail`; **la FICHA no**, que es donde
  se está intentando arreglar. Quien abría el Reel veía un badge rojo sin una
  sola palabra de por qué. Se pinta entero: el motivo del compositor termina
  justo en la parte que un `line-clamp` se come.
- **⚠️ EL BOTÓN PISABA UN MONTAJE EN CURSO** (regla de v4.786, rota desde
  v4.1032). `remountReel` borraba `renderClaimAt` **a ciegas** antes de llamar
  a `submitAssembly`: liberaba el candado de un montaje que estaba corriendo y
  lanzaba una SEGUNDA codificación del mismo Reel en paralelo, con los dos
  procesos escribiendo `videoUrl`, `renderSpec` y el sello del máster, y
  ganando el que terminara último. Con el montaje local durando minutos, dos
  clics separados por dos minutos bastan — es el reloj de las capturas. Ahora
  se respeta el candado vivo y se DICE; el huérfano lo sigue rescatando la
  ventana de 6 minutos del propio reclamo.
- **UN MONTAJE EN CURSO NO SE PINTA COMO ERROR.** Se está resolviendo solo:
  decirlo en rojo manda a diagnosticar algo que no está roto. Es un tercer
  estado, como `unknown` en el diagnóstico del CRM y `sinRegistro` en las
  notificaciones.
- **`error` E `incompleto` SON DOS COSAS Y SU SALIDA ES DISTINTA**: uno se
  reintenta, el otro pide terminar las escenas que faltan. Fundirlos manda a
  reintentar lo que no se puede reintentar.
- **⚠️ «TERMINÓ SIN ERROR» NO ES «EL ARCHIVO CAMBIÓ».** Un outro que no se
  pudo medir entra al montaje como «se montó sin él»: el Reel queda `ready` y
  el video sigue igual. Ese caso se dice (`sin_cambio`) en vez de celebrarse —
  es el que no se puede callar, porque no hay ningún error que mirar.
- **ANTE UN ESTADO QUE NO SE RECONOCE NO SE CANTA ÉXITO.** Equivocarse hacia
  «se montó» es exactamente lo que produjo el reporte; hacia «no se montó»
  cuesta volver a pulsar un botón que no gasta créditos.
- **⚠️ EL PROYECTO VIAJA SIEMPRE, TAMBIÉN CUANDO NO SE MONTÓ.** Un 400 dejaría
  a la ficha con la copia ANTERIOR —`onChanged` no corre— y quien mira seguiría
  viendo el estado de hace un intento. Lo que cambia es el DESENLACE, que va al
  lado del DTO y es **aditivo**: un cliente que no lo lea se comporta como
  antes. `extra` en `respondProject` describe la OPERACIÓN, nunca la ficha —
  el DTO tiene que seguir significando lo mismo venga de donde venga.
- **⚠️ DOS COMPROBACIONES FIJADAS A LA FORMA LITERAL SE ROMPIERON AL MOVER LA
  RELECTURA**, con el criterio intacto y MÁS estricto. Van tres versiones
  seguidas pagando la lección de v4.984 en este mismo archivo. Se reescribieron
  sobre la INVARIANTE: que el motivo salga del veredicto de la fila resultante
  y que el éxito no se cante sin mirarlo, **no** sobre dónde está escrito.
- **`REMOUNT_WORKING_STATUSES` se declara en `reelOutro.js` en vez de
  importarse de `reelSpec.js`**, como `MASTER_DURATION_TOLERANCE_SEC` y por el
  mismo motivo: ese archivo lo importa el servicio de publicación y tiene que
  seguir siendo dependency-light. La paridad con `REEL_STATUSES` —que existan y
  que NO sean terminales— la fija una prueba.
- **NO SE AFLOJÓ NADA DEL MONTAJE NI DE LA PUBLICACIÓN.** El bloqueo de
  Publicar lo sigue decidiendo `outroSync.stale` y ninguna de estas vías
  regenera una escena ni consume créditos de video. Lo que cambia es que el
  fallo se ve, con su motivo, donde se está intentando arreglar.

### `código null` es el sistema matando ffmpeg: el montaje se hace por TRAMOS — v4.1051

Quinto reporte sobre el mismo outro, esta vez con el motivo a la vista:
**«ffmpeg: montaje del Reel falló (código null)»**, con el registro cortado en
`frame= 19` —o sea, medio segundo de salida— y la ficha en «No se pudo
completar». Las cuatro versiones anteriores corrigieron QUÉ SE DICE del
montaje; ésta corrige POR QUÉ el montaje moría.

| Pieza | Qué es |
|---|---|
| `estimateGraphMemoryMB` · `chainDurationSec` · `planComposition` (`reelFfmpeg.js`) | El CRITERIO. **Puro**: cuánta memoria pide un grafo, cuánto dura la cadena y si la pieza entra de una pasada o hay que trocearla |
| La rama `plan.mode === 'chunked'` de `composeReel` | El montaje por tramos: cada grupo a un intermedio y una pasada de unión |
| El manejador `close` de `runFfmpeg` | `(code, signal)`: una señal NO es un código de salida |
| `RENDER_BUDGET_MS` · `UPLOAD_RESERVE_MS` · el reintento por `killedBySignal` (`reelRenderProviders.js`) | El presupuesto REAL de tiempo y la red de seguridad |
| `src/lib/leerJson.ts` | El patrón de v4.946, extraído de las seis pantallas que lo llevaban copiado |

Pruebas: la sección 13 de `npm run test:reels:outro` (317 casos). Verificadas
a la inversa sobre OCHO puntos: la señal reportada como «código null», el
intermedio codificado por tasa fija, la calibración que se queda corta, el
outro metido en un tramo, el presupuesto que no descuenta lo gastado, el
reintento sin acotar, el `.json()` a ciegas y los fundidos sin descontar.

- **⚠️ `código null` NO ES UN CÓDIGO DE SALIDA: ES UNA SEÑAL.** Node emite
  `close` con `code === null` **cuando el proceso lo mató una señal** — el
  código no existe porque el proceso nunca llegó a devolver ninguno.
  `runFfmpeg` lo formateaba como «(código null)» y eso mandó a buscar el
  defecto dentro de ffmpeg, que estaba haciendo su trabajo. Dos hechos lo
  descartan como tiempo agotado: nuestro propio timeout dice «se agotó el
  tiempo (240s)» con esas palabras, y el registro muere en `frame= 19`
  —**0,6 s de salida**—, que no es un proceso que llevara cuatro minutos.
  **Al diagnosticar un fallo de un proceso hijo, mirar la SEÑAL antes que el
  código.**
- **⚠️ LA CAUSA ES LA MEMORIA, Y ESTÁ MEDIDA.** El grafo encadena `xfade` y
  **cada enlace RETIENE los fotogramas crudos de su entrada B** hasta el punto
  del fundido. Un fotograma 1080×1920 yuv420p pesa **3,11 MB**, así que un clip
  de 4,4 s a 30 fps son 132 fotogramas ≈ **410 MB** esperando su turno. Medido
  con el ffmpeg empaquetado, muestreando el RSS del proceso: grafo desnudo 3
  clips **790 MB**, 5 clips **1161 MB**, 7 clips **1509 MB** —crecimiento
  lineal de ~180 MB por clip—; el `composeReel` completo con música, voz y
  cuatro rótulos, **3163 MB**. El sistema lo mata.
- **⚠️ Y POR ESO EL FALLO APARECÍA EXACTAMENTE AL ACTIVAR EL OUTRO.** El Reel
  sin cierre son 6 clips y montaba bien; el outro agrega el séptimo, sus ~180 MB
  y cruza el techo. **Nunca fue el outro: era el clip de más.** Ésa es la
  pregunta que las cuatro versiones anteriores no se hicieron — al reportarse un
  fallo que aparece «al activar X», preguntarse qué cambia X en la MAGNITUD del
  trabajo, no sólo en su contenido.
- **⚠️ SE TROCEA EL MONTAJE; NO SE SUBE LA MEMORIA DE LA FUNCIÓN.**
  `api/index.js` sirve el sitio ENTERO, así que subir su `memory` en
  `vercel.json` multiplicaría el costo de cada petición de cada visita para
  resolver el caso de un montaje. Eso es una decisión de negocio, no una
  corrección, y se deja como palanca DECLARADA
  (`REEL_FFMPEG_MEMORY_BUDGET_MB`). Medido: el troceo baja de **3163 MB a
  1563 MB (−51 %)** por un **+18 %** de tiempo.
- **⚠️ EL TROCEO PRODUCE EXACTAMENTE LA MISMA PIEZA, y se comprobó fotograma a
  fotograma.** Una pasada contra tramos, comparados en **12 instantes**
  incluidos los CENTROS de los fundidos: **0,00/255 de diferencia**. Sin esa
  comprobación, «entra en memoria» no autoriza nada — lo que se estaba
  cambiando es el archivo que se publica. De punta a punta: esperado 24,6 s,
  **medido 24,60 s**, 1080×1920, audio y portada presentes, pico 1732 MB.
- **⚠️ EL OUTRO NUNCA ENTRA EN UN TRAMO.** Su audio lo mezcla `buildFilterGraph`
  en el sitio (`outroAudio`) y los tramos se montan SIN audio: metido en un
  tramo, su pista se perdería y el cierre saldría mudo — el defecto que este
  módulo lleva cinco versiones corrigiendo, por una puerta nueva. Lo fija una
  prueba que recorre de 5 a 9 clips.
- **LA ESTIMACIÓN NUNCA PUEDE QUEDARSE CORTA, y ése es el lado que importa.**
  Pasarse cuesta un troceo innecesario —segundos—; quedarse corta cuesta el
  montaje entero. La primera calibración usaba el grafo DESNUDO (41 MB/s) y
  estimaba 2400 sobre 3163 medidos: se recalibró contra el `composeReel` REAL
  (74 MB/s), con el peor caso de rótulos (272 MB) y el costo de cada pista de
  audio. Una prueba la contrasta contra los tres casos medidos y falla si
  estima de menos. **Al calibrar una estimación, medir el camino COMPLETO, no
  la pieza aislada.**
- **`chainDurationSec` es el MISMO número que `buildFilterGraph`.** Con dos
  aritméticas de los fundidos, el tramo declararía una duración y el montaje
  produciría otra, y la unión cortaría donde no toca. Lo fija una prueba que
  las compara.
- **EL TRAMO INTERMEDIO SE CODIFICA POR CALIDAD (`-crf 16`), no por la tasa del
  máster.** El tramo se vuelve a codificar en la unión, así que con la tasa del
  máster se acumularían dos compresiones al mismo objetivo y lo perdido en la
  primera no se recupera. Tampoco lleva `+faststart` ni portada: vive unos
  segundos en `/tmp` y nadie lo reproduce.
- **⚠️ EL PRESUPUESTO DE TIEMPO DESCUENTA LO YA GASTADO.** Se le daban a ffmpeg
  240 s fijos dentro de una función de 300, sin restar lo que las descargas de
  los clips ya habían consumido: con orígenes lentos, el montaje arrancaba con
  menos margen del que creía tener y la subida del resultado se quedaba sin
  tiempo. Y se reserva lo que cuesta subir (`UPLOAD_RESERVE_MS`): un montaje
  que termina y no se puede subir es un montaje perdido.
- **EL REINTENTO SE ACOTA A `killedBySignal` Y BAJA EL PRESUPUESTO.** Reintentar
  cualquier fallo duplicaría el trabajo de un error que se va a repetir igual;
  reintentar con el MISMO presupuesto de memoria repetiría la muerte. Es una
  red de seguridad, no el camino habitual — el plan ya debería haber troceado.
- **⚠️ LA REGLA DEL `.json()` A CIEGAS YA ESTABA ESCRITA (v4.946) Y ESTA
  PANTALLA LA INCUMPLÍA.** El segundo mensaje del reporte —«Unexpected token
  'A', "A server e"... is not valid JSON»— es la plataforma devolviendo una
  página de error mientras el montaje corría, leída como JSON. El patrón se
  EXTRAJO a `src/lib/leerJson.ts` en vez de copiarlo por séptima vez, y lo que
  se dice ahora incluye que **el montaje puede seguir en curso**: la ficha se
  actualiza sola cuando termine. Una prueba cuenta que ninguna de las tres vías
  que montan vuelva a llamarlo a ciegas.
- **NADA DE ESTO REGENERA UNA ESCENA.** El troceo es postproducción de los
  clips que ya existen: ni una llamada a KIE, ni a `dispatchScene`, ni un
  crédito de video. Lo siguen fijando las pruebas de v4.1047 que leen el cuerpo
  de `remountReel`.

### El audio acompaña toda la pieza (v4.1033)

Reporte con el Reel delante: la música y la voz terminaban antes que las
escenas y los últimos segundos quedaban mudos. Tres causas en el compositor
(`buildFilterGraph` / `composeReel`), ninguna daba error. Pruebas: secciones 6
y 7 de `npm run test:reels:outro` (la 7 monta un Reel REAL con ffmpeg y mide
el nivel de audio del final; se salta sin binario).

- **⚠️ UNA PISTA MÁS CORTA QUE LA PIEZA DA LA VUELTA; NO SE RELLENA CON
  SILENCIO.** El `apad` del final completaba con silencio lo que faltara —y
  eso era exactamente el tramo mudo—. `composeReel` MIDE la música
  (`measureAudioDuration`) y, si no alcanza, `aloop=loop=-1:size=<muestras>`
  antes del `atrim`, con el `aformat` a 48 kHz DELANTE para que el tamaño
  esté en la tasa correcta. Sin medida no hay loop y el plan lo avisa.
- **⚠️ LA VOZ SE RELLENA A LA DURACIÓN DE LA PIEZA ANTES DE LA CADENA
  LATERAL.** `sidechaincompress` termina cuando se acaba la MÁS CORTA de sus
  entradas —la locución— y con ella se cortaba la MÚSICA de la cadena
  principal. El comentario de v4.674 lo describía y sólo protegía la duración
  del VIDEO. Ahora `[voice]` lleva `apad,atrim=0:total`: no se estira ni se
  acelera la locución, se le suma silencio detrás y el compresor suelta solo.
- **⚠️ EL AUDIO DEL OUTRO SE MONTABA MUDO** (defecto de v4.1032): con
  `loudnorm → adelay → apad,atrim` la pista salía vacía (medido: 752 KiB para
  17,4 s, `n_samples: 0` en su ventana) — `loudnorm` emite fotogramas con
  marcas propias y `atrim` recorta por MARCAS. Se renumera por muestras
  (`asetpts=N/SR/TB`) después de `adelay`. Al desplazar una pista con
  `adelay`, renumerar por muestras antes de recortar.
- **`planAudioTimeline` es puro y corre ANTES de exportar**: escenas, voz,
  música, outro y duración final salen de la suma real de los clips; dice
  qué se hace con cada pista (loop/trim/exact) y sus avisos viajan a las
  `notes` del montaje. Nada asume 20 s.
- `fadeOutStart` se redondea a milésimas: `17.4 - 2` da `15.399999999999999`
  y así se escribía en el grafo.
- **Sigue sin regenerar nada**: el compositor no importa el cliente de KIE
  (una prueba lo fija) y cambiar música u outro sólo vuelve a montar.
- **⚠️ EL ARCHIVO YA MONTADO NO SE REHACE SOLO** (v4.1034). Corregir el
  compositor no toca un Reel montado antes: la ficha tiene la sección
  «Audio» con «Volver a montar el audio» (`POST /render`) y «Regenerar banda
  sonora» (`POST /music` con `regenerate: true`, mismo estilo). Al regenerar,
  la pista se pide para la línea de tiempo REAL —escenas + outro,
  `timelineSecFor`—, no para `config.timing.finalDurationSec`, que no cuenta
  el outro. Ninguna de las dos crea tareas de video; una prueba lo fija.


## Voz en off: diagnóstico, selector de motor y borrador → aplicar — v4.1236

Reporte: al pulsar «Generar voz en off» en la ficha de un Reel, el panel decía
**«No se pudo generar la narración. Revisá los avisos del Reel»** y no había
ningún aviso que revisar.

**Causa raíz.** `regenerateNarration` encendía la voz con
`jsonb_set(config, '{narration,enabled}', 'true', true)`. `jsonb_set` sólo crea
la ÚLTIMA clave del camino: si `config.narration` no existe —Reels de «Video
listo», Reels creados antes de la narración, `config` nula— devuelve la
`config` **sin cambios**. `produceNarration` leía `enabled` vacío, devolvía
`null` sin llamar a ningún proveedor y el endpoint contestaba el 502 genérico.
Reproducido contra Postgres 16. Y para los Reels que sí tenían el objeto,
**cualquier** fallo real (credencial, cuota, voz, modelo, red, S3) se anotaba y
salía con el mismo mensaje genérico, así que desde la pantalla no había forma
de distinguirlos. Además ElevenLabs recibía `language_code` con
`eleven_multilingual_v2`, que según su documentación no lo admite, y ninguna
llamada de voz tenía tope de tiempo.

**Reglas durables:**

- **La voz se enciende FUSIONANDO el objeto** (`enableNarrationConfig`:
  `COALESCE(config,'{}') || jsonb_build_object('narration', … || $prefs)`),
  nunca con `jsonb_set` sobre un camino que puede no existir. La misma trampa
  vale para cualquier `jsonb_set` de dos niveles en la plataforma.
- **Un fallo de voz se NOMBRA.** `TtsError` lleva `code` (`TTS_ERRORS` en
  `reelNarration.js`: `not_configured`, `auth`, `quota`, `rate_limit`,
  `voice_not_found`, `model_unsupported`, `bad_request`, `provider_down`,
  `timeout`, `network`, `empty_audio`, `script_failed`, `measure_failed`,
  `storage`, `mix`, `unsupported_reel`). `classifyTtsFailure` lee los cuerpos
  de error reales de OpenAI (`error.code`) y ElevenLabs (`detail.status`), y
  borra los fragmentos de clave (`sk-…`) antes de mostrarlos o registrarlos.
- **El camino manual lanza; el automático no.** `produceNarration` con
  `throwOnError` (el panel) propaga el `TtsError` y no deja notas; sin él (el
  Reel que se monta solo) anota y sigue con música sola, como siempre.
- **El respaldo entre motores es una POLÍTICA.** `synthesize({ fallback })`:
  `true` intenta UNA vez con el otro motor, `false` devuelve el fallo con la
  oferta (`fallback: { provider, label }` en la respuesta), `null` obedece a
  `REEL_TTS_AUTO_FALLBACK`. Elegir un motor sin credencial ya no se cambia en
  silencio por otro: es `not_configured` (salvo respaldo permitido).
- **Generar no es aplicar.** `POST /reels/:id/narration` con `apply:false`
  inserta la versión como **borrador** (`isCurrent = false`); `POST
  /reels/:id/narration/:narrationId/apply` la vuelve vigente, guarda las
  preferencias en `config.narration` y rehace sólo la mezcla. Sin `apply`, el
  endpoint conserva el comportamiento anterior (aplica y remonta).
- **El estado de los motores se consulta con llamadas de LECTURA**
  (`GET /reels/narration/providers`: `/v1/user/subscription` y `/v1/voices` de
  ElevenLabs, `/v1/models/{modelo}` de OpenAI), con 5 min de caché por
  instancia. OpenAI no informa saldo por API: se dice.
- **La muestra de voz** (`POST /reels/narration/preview`) sintetiza una frase
  fija de ~90 caracteres, sin respaldo, con un freno de 4 s por usuario.
- **«Video listo» no recibe voz desde la ficha** (`unsupported_reel`): ya trae
  música y outro adentro y remontarlo los duplicaría.
- En ElevenLabs **el acento lo pone la voz**: las voces por defecto
  (Rachel/Daniel) son angloparlantes. Para acento colombiano hay que elegir o
  configurar (`ELEVENLABS_VOICE_FEMALE/MALE`) una voz latina de la cuenta; el
  panel lista las de la cuenta con las latinas primero.

Pruebas: `npm run test:reels:voice` (sin base, credenciales ni red: `fetch`
simulado con los cuerpos de error reales y un MP3 fabricado por ffmpeg-static
y medido de verdad).

### v4.1237 — OpenAI sin saldo y la voz automática de ElevenLabs

Con el diagnóstico de v4.1236 la captura de producción mostró la causa real:
OpenAI respondía **HTTP 429 «You have no credits remaining. Add credits…»**.
La cuenta de OpenAI no tiene saldo; no es un fallo del código y se resuelve
recargando créditos en platform.openai.com. Lo que sí era del código:

- **OpenAI usa el 429 para dos cosas**: límite de solicitudes y cuenta sin
  saldo. Sólo el texto las distingue. `classifyTtsFailure` lee «no credits»,
  «add credits», «insufficient_quota» como `quota` (no reintentable).
- **«Conectado» no es «con saldo».** El chequeo de lectura de OpenAI
  (`/v1/models`) sale bien con la cuenta en cero. `getNarrationProviders`
  cruza el estado con el ÚLTIMO intento real de cada motor en `ReelUsage`
  (`withRecentOutcome`): un fallo de `quota`/`auth` en las últimas 12 h sin un
  éxito posterior pone la tarjeta en ese estado.
- **La voz automática de ElevenLabs sale de la CUENTA**
  (`resolveElevenLabsVoice` → `pickAccountVoice`): manda
  `ELEVENLABS_VOICE_FEMALE/MALE` si está; si no, la voz de `/v1/voices` que
  mejor encaja por idioma verificado (`verified_languages`), acento de la
  región y género (el género manda: nunca una mujer por un hombre pedido). Las
  voces se cachean 5 min. Rachel/Daniel sólo si la cuenta no se puede leer.
- **El panel no arranca en un motor bloqueado** si el otro está conectado, y
  lo dice.
