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
render con ffmpeg que esta infraestructura no tiene. Hoy el outro queda
**adjunto** al proyecto como clip independiente. Desde v4.663 el Creador de
Reels resuelve el montaje con un proveedor de render alojado; enganchar el outro
a ese mismo montaje es el paso que falta.

## Creador de Reels IA — v4.663

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
| `server/lib/reelRenderProviders.js` | Capa desacoplada del montaje: Shotstack, Creatomate, JSON2Video |
| `server/lib/reelMusic.js` | Banda sonora: KIE generativo + biblioteca licenciada |
| `server/lib/reelQuality.js` | Inspección de las fotos, validación de los archivos y control de fidelidad |
| `server/lib/ensureReelSchema.js` | Crea `ReelProject` y `ReelScene` en runtime |
| `server/controllers/reelController.js` | Flujo completo y máquina de estados |
| `src/components/admin/content-studio/VideoCreator.tsx` | Preparación, progreso y previsualización |
| `src/lib/reelSpec.ts` | Espejo mínimo: tipos y cálculo de la línea de tiempo |

**Reglas durables:**

- **Una tarea de video POR ESCENA.** Es la corrección de fondo del módulo
  anterior. Los modelos image-to-video reciben UNA imagen; mandarles un array
  de tres no produce tres clips. Nunca volver a agrupar.
- **El montaje NO es postprocesar.** La regla heredada del Generador de
  Publicaciones y del de Outros prohíbe retocar el archivo que devuelve un
  modelo —composite, máscara, blur, recorte— porque se ve pegado. Lo que hace la
  capa de render es **edición declarada**: qué clip va cuándo, cómo se encadenan
  y qué suena debajo. El CONTENIDO de cada clip viaja intacto. Ningún adaptador
  aplica filtros, escalas forzadas ni corrección de color.
- **Hace falta un proveedor de montaje y esta infraestructura no puede
  sustituirlo.** Vercel serverless no tiene ffmpeg y corta a los 120 s. Sin
  `REEL_RENDER_PROVIDER` + su credencial, las tres escenas se generan y quedan
  descargables por separado, y el proyecto termina en `needs_review` diciéndolo.
  Eso es un resultado válido, no un error: no inventar un montaje que no existe.
- **El techo de duración por escena lo fija el MOTOR, no el gusto.** Pedirle
  5,33 s a un motor que entrega 5 o 10 obliga a generar un clip de 10 para usar
  la mitad: el doble de créditos y de espera. `distributeDurations` acota al
  mayor valor que el motor entrega dentro de `[4, 6]`. Con Kling eso da tres
  clips de 5 s y una pieza de **14 s**, no 15 — y el módulo lo anota en `notes`
  para que el número esté a la vista. "Duración aproximada" no es licencia para
  callar la real.
- **Los clips se generan MUDOS cuando hay banda sonora.** Dos pistas compitiendo
  suena peor que una bien puesta. El audio nativo del motor sólo se pide si no
  va a haber música del montaje.
- **La fidelidad tiene TRES estados, no dos.** `ok`, `failed` y `unavailable`.
  El control compara un fotograma del clip contra la foto original con un modelo
  de visión, y **sólo puede correr si el proveedor entregó ese fotograma**. Sin
  él, la ficha dice "fidelidad no comprobada". Dar por buena una escena que
  nadie miró sería peor que decirlo. No se mide fotograma a fotograma ni se hace
  OCR sobre el video: eso exige decodificarlo, y no hay ffmpeg. Misma limitación
  y mismo criterio que en `outroQuality.js`.
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
- El medidor de créditos es **propio** (`REEL_MONTHLY_CREDIT_LIMIT`), no el saldo
  real de KIE. No presentarlo como el saldo del proveedor.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `REEL_RENDER_PROVIDER` | `shotstack` \| `creatomate` \| `json2video` |
| `SHOTSTACK_API_KEY` / `CREATOMATE_API_KEY` / `JSON2VIDEO_API_KEY` | Credencial del montaje |
| `SHOTSTACK_ENV` | `stage` para el entorno de pruebas gratuito |
| `REEL_DEFAULT_ENGINE` | Motor principal (default: `kling26`) |
| `REEL_MODEL_KLING26` y compañía | Corregir el id de un modelo sin desplegar |
| `REEL_ENGINE_VEO3_ENABLED`, `REEL_ENGINE_MINIMAX_ENABLED` | Habilitar motores tras verificar su id |
| `REEL_MUSIC_PROVIDER`, `REEL_MUSIC_MODEL` | Fuente y modelo de la banda sonora |
| `REEL_MONTHLY_CREDIT_LIMIT` | Freno de gasto mensual |

**Pendientes conocidos:** el outro adjunto sigue viajando en `config.outro` y no
se concatena al montaje —el sitio natural para engancharlo es `buildEditSpec`—;
y los motores `runway_gen4` y `luma_ray2` están declarados con `available:false`
porque necesitan su propio adaptador (hoy sólo existe el de KIE).

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

Las 19 tablas que la aplicación crea sola y que estas barreras protegen:
`BannerTemplate`, `EventRegistration`, `EventAttendeeAccount`,
`EventAttendeeLogin`, `FAQ`, `OutroProject`, `ReelProject`, `ReelScene` y las
once `ProjectFair*`.
(Más las seis del registro de eventos que enumera su propia sección:
`EventEdition`, `EventRegistrationCategory`, `EventRegistrationCompanion`,
`EventRegistrationPayment`, `EventRegistrationHistory` y
`EventRegistrationMessage`.)

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
- El ingreso con Google **no está implementado**: el botón nunca tuvo
  manejador. Está oculto tras `GOOGLE_LOGIN_ENABLED` en `Navbar.tsx`. Cuando
  se implemente, debe verificar el `id_token` en el servidor y converger en
  `resolveSession`, no ser una vía de acceso con reglas propias.
- `ADMIN_ROLES` está declarado dos veces a propósito (`src/App.tsx` y
  `server/middleware/auth.js`): el cliente decide qué pinta, el servidor qué
  responde. Si cambia una lista, cambiar la otra.

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
