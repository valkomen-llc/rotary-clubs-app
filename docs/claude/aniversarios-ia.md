<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Aniversarios IA — v4.895 (motor multimodelo: v4.897; **FLUJO SIMPLE: v4.907**)

Módulo **nuevo e independiente**. Genera la pieza gráfica del aniversario de un
club a partir de cuatro datos: club, años, fotografía y un botón. El
administrador no diseña: **configura con instrucciones en lenguaje natural**.

**NO es Plantillas IA y no depende de él.** Aquél es un EDITOR —grafo de escena,
capas, coordenadas, propiedades gráficas— y sigue existiendo, intacto. Éste es
un GENERADOR por instrucciones. De aquél no se importa nada: ni `designSpec`, ni
`designCompose`, ni `designTemplates`, ni `designRender`, ni `DesignCanvas`. Lo
comprueba una prueba que lee los once archivos y falla si aparece el import — la
independencia declarada en prosa no protege nada.

| Archivo | Qué es |
|---|---|
| `server/lib/anniversarySpec.js` | El CRITERIO. **Puro**: formatos, zonas de texto, instrucciones por defecto, construcción de los prompts, lectura y validación de lo que contesta el modelo, validación de la pieza y huella de versión |
| `server/lib/ensureAnniversarySchema.js` | Crea `AnniversaryConfig`, `AnniversaryConfigVersion` y `AnniversaryPiece` en runtime |
| `server/lib/anniversaryStore.js` | La I/O: borrador, publicado, versiones y piezas |
| `server/lib/anniversaryEngine.js` | La orquestación: visión, redacción, KIE, S3, sharp y el control de preservación |
| `server/controllers/anniversaryController.js` | El panel y **las cuatro etapas compartidas** |
| `server/controllers/anniversaryPublicController.js` | El formulario público |
| `server/routes/anniversaries.js` | `/api/anniversaries` — público y panel en el mismo archivo |
| `src/lib/anniversarySpec.ts` | Espejo MÍNIMO: zonas, formatos y etapas |
| `src/lib/anniversaryRender.ts` | **EL compositor.** Uno solo |
| `src/pages/admin/AnniversaryStudio.tsx` | El panel (`/admin/aniversarios-ia`) |
| `src/pages/AniversarioIA.tsx` | El formulario público (`/aniversarios`) |

Pruebas: `npm run test:anniversary` (134 casos de criterio),
`npm run test:anniversary:path` (108, el CAMINO del servidor con la base y los
proveedores sustituidos en memoria) y `npm run test:anniversary:render` (14 en
un navegador de verdad; pide `playwright` y `esbuild` y **se salta solo** si
faltan). **Ninguna necesita base, credenciales ni red.**

### ⚠️ EL FLUJO SIMPLE (v4.907) SUPERSEDE LA ARQUITECTURA HÍBRIDA — LEER ESTO PRIMERO

> **⚠️ MATIZADO EN v4.1064 PARA EL TEXTO INSTITUCIONAL** — ver «El nombre
> oficial lo IMPRIME la plataforma» más abajo. El modelo sigue componiendo el
> fondo, la decoración y el marco de la fotografía; el saludo, el nombre del
> club y la cifra de años los imprime el compositor con tipografía real. Todo
> lo demás de esta sección sigue vigente.

Decisión EXPRESA del cliente, con su propia muestra de ChatGPT delante («ni con
la referencia adjunta lo toma como referencia»): la generación se comporta como
una conversación simple. Referencia visual + fotografía del club + prompt base
en texto plano → el modelo dibuja TODO, incluidos los textos. Muchas reglas de
abajo (v4.895-v4.906) describen la arquitectura anterior y quedan superadas en
lo que contradiga esto; se conservan escritas porque explican POR QUÉ cada capa
existió y qué costó — como v4.786 y v4.801 con el Ken Burns.

- **EL PROMPT VIAJA VERBATIM** (`buildSimpleRequest`): el prompt base con
  `{NOMBRE_CLUB}`, `{ANOS_CLUB}` y `{FOTO_CLUB}` sustituidos, byte a byte.
  NADA se agrega solo — se eliminaron `buildImagePrompt`, las cláusulas
  (NO_TEXT, PRESERVE, FOOTER, clearZone, decoración por semilla, BASE_STYLE) y
  el análisis de visión de la foto. «No agregues al prompt final instrucciones
  que no estén configuradas» es el pedido literal. El único tratamiento es el
  recorte por tope POR MODELO (KIE 2500), declarado en `trimmed`.
- **EL MODELO ESCRIBE LOS TEXTOS** — **superado en v4.1064**: el nombre del
  club y los años salieron del prompt y los imprime la plataforma, porque un
  modelo generativo no dibuja tildes de forma fiable y no hay salida limpia
  cuando falla. Lo que decía: supersede «la IA no escribe texto» de la
  arquitectura híbrida: el prompt base predeterminado le pide el título, la
  cifra y el mensaje con ortografía perfecta — es lo que el cliente vio
  funcionar en ChatGPT. El compositor lee `document.simple` y NO imprime la
  capa de texto en modo `ai`; el respaldo `plain` (sin imagen del modelo)
  conserva la estructura fija de v4.902, porque ahí no hay imagen que traiga
  el texto. La capa 3 (pie institucional desde archivos reales) SIGUE: el
  emblema es marca registrada y no se dibuja jamás.
- **LA REFERENCIA VIAJA COMO PRIMERA IMAGEN y la fotografía como segunda**, en
  KIE (`imageUrls`) y en GPT Image (`image[]`) por igual, y el prompt base lo
  DECLARA («La PRIMERA imagen adjunta es la REFERENCIA VISUAL»). La auditoría
  que pidió el cliente mostró que la referencia SIEMPRE viajó como imagen: lo
  que desviaba el resultado eran nuestras cláusulas (prohibirle reproducir la
  tipografía de la referencia, forzar zonas vacías) y las puertas que
  descartaban composiciones. La referencia ya NO se analiza con visión al
  guardarla.
- **SIN PUERTAS, SIN REINTENTO AUTOMÁTICO.** `runSync` entrega TAL CUAL lo que
  el modelo devuelve (`renderMode: 'ai'`, `status: 'ready'`). Las puertas de
  v4.899-v4.906 (fondo blanco, franja, texto dibujado, preservación) NO corren
  en el flujo — descartaban piezas legítimas y gastaban generaciones dobles; el
  juicio es del ojo de quien genera y la salida es «Volver a probar». El
  fallback de INFRAESTRUCTURA (timeout, 5xx, modelo retirado) sí sigue.
  `judgePiece`, `verifyComposition` y el verificador de rotulado quedan para el
  BENCHMARK, que es donde puntuar modelos sí exige medir.
- **EL PROMPT NEGATIVO SON LAS RESTRICCIONES CONFIGURADAS, textuales**
  (`buildNegativePrompt`). Es un campo VISIBLE del panel con su default
  editable — nada invisible viaja.
- **«VER SOLICITUD ENVIADA AL MODELO»** (`AnniversaryPiece.request`, JSONB
  aditivo): el prompt final exacto, las dos imágenes, el modelo, el proveedor,
  el endpoint y el tamaño, guardados al despachar y visibles en el panel de
  pruebas. Es lo que permite comprobar que al modelo le mandamos lo que
  creemos — la mitad del diagnóstico que faltó en el reporte original.
- **`/analyze` y `/copy` se CONSERVAN como no-ops baratos** (regla aditiva): un
  navegador con el bundle anterior todavía los llama. Los frontends nuevos van
  foto → componer → sondear, y `STAGES` quedó en tres (prepare/compose/done) en
  los DOS espejos. El redactor aparte no se llama: `test:anniversary:path`
  cuenta CERO llamadas al modelo de texto/visión en el flujo.
- **Probar generación corre por la MISMA función que el público** (las mismas
  `runCompose`/`runSync`) — eso ya era regla y ahora es también el requisito
  expreso del pedido.
- Las cuatro baterías se reescribieron para este contrato (167 + 171 + 77 + 16)
  y las claves están verificadas a la inversa: un agregado al prompt, el orden
  de las imágenes invertido o la capa de texto reencendida hacen fallar.
- **⚠️ LA FOTO VIAJA PRIMERA; LA REFERENCIA, SEGUNDA — Y NO AL REVÉS**
  (v4.909, supersede el orden de v4.907). Los modelos de edición toman la
  PRIMERA imagen como base: con la referencia primera, la salida era la
  REFERENCIA EDITADA — conservaba su foto interna, copiaba sus textos
  («Cuatro décadas» en un club de 10 años) y sólo cambiaba el nombre, mal
  escrito. El prompt predeterminado declara la referencia como EJEMPLO que se
  imita sin copiarse (ni su foto ni sus textos), el nombre letra por letra y
  el mensaje NUEVO coherente con `{ANOS_CLUB}`. `{VARIACION}` es la única
  variable que llena la PLATAFORMA: motivo decorativo determinista por id de
  pieza (`variationForSeed`), visible en el debug y borrable del prompt base.
  Y el default guardado SIN EDITAR se actualiza al vigente en
  `normalizeConfig` (upgrade perezoso, `LEGACY_MASTER_PROMPTS`): sin eso, una
  mejora del predeterminado no llega jamás a la fila que un guardado
  anterior congeló; un prompt editado no se toca jamás.
- **⚠️ LA ÚNICA PUERTA DEL FLUJO ES EL PATRÓN VISUAL** (v4.910, directiva
  expresa del cliente con su referencia-plantilla delante — matiza el «SIN
  PUERTAS» de v4.907). El prompt base predeterminado lleva un bloque
  PERMANENTE de identidad (fondo blanco premium, paleta dorado/blanco/azul,
  fondos oscuros prohibidos) y `judgeStylePattern` mide el fondo de la pieza
  con la calibración de v4.899 (duro sólo bajo 165 de luminancia): un fondo
  café/oscuro se regenera UNA vez con `STYLE_RETRY_CLAUSE` y, si insiste, SE
  ENTREGA con su aviso — nunca al modo plano, nunca en silencio. Interruptor
  `styleGuard` (default true, versionable). Franja, texto dibujado y
  preservación SIGUEN fuera del flujo. La referencia ideal es una plantilla
  VACÍA — una pieza terminada invita al modelo a copiarla (v4.909).
- **⚠️ NINGUNA ESPERA DEL CAMINO DE PINTADO VA SIN TOPE** (v4.911). Pieza
  generada, botones pintados, lienzo vacío por minutos sin error: una
  petición estancada dejaba la promesa del compositor sin resolver PARA
  SIEMPRE — el proxy `banner-image` hacía fetch sin límite, `loadImage` no
  tenía tope y la espera de tipografías tampoco. Ahora: proxy 20 s
  (`AbortSignal.timeout` — alcanza a Pendones y Plantillas IA), imagen 25 s
  (el rechazo cae en la degradación que ya pinta con aviso), fuentes 8 s. Y
  la vista previa dice «Componiendo la pieza…» mientras trabaja. Al agregar
  un `await` a ese camino, acotarlo — verificado a la inversa: sin tope, la
  carga colgada supera los 5 s del guardia del test.
- **⚠️ LA HERRAMIENTA ES UNA Y SE MONTA EN DOS SUPERFICIES** (v4.931,
  `AnniversaryTool` exportado desde `AniversarioIA.tsx`): la página pública
  `/aniversarios` (wrapper que sólo agrega el SEO) y la pestaña
  «Aniversarios IA» del Estudio de Contenido — donde la sesión del
  administrador ya está presente y los contactos y el correo funcionan sin
  volver a pedir credenciales (`tokenAdmin` los detecta igual en las dos).
  NO hay segunda copia del generador; lo fija una prueba que busca la
  importación. Y el Estudio de Contenido de un DISTRITO ocultaba «Outros»,
  «Cuentas Sociales» y «Distribución» — **las tres volvieron a pedido del
  propio Distrito** (v4.1035 y v4.1040) y hoy `DISTRICT_HIDDEN_TABS` está
  vacía; lo que sigue vigente es DÓNDE se decide: vive en
  `contentStudioTabs.ts` (puro) sobre el TIPO del sitio
  (`isDistrictSite` en `entityTypes.ts` — identidad de tenant, NUNCA el
  dominio), disparador y contenido condicionados JUNTOS (v4.894), ante un
  tipo desconocido no se oculta nada, y los módulos siguen enteros para los
  demás sitios — se decide qué se PINTA, no el acceso.
- **⚠️ LA PIEZA SALE CON SU MENSAJE INSTITUCIONAL, Y LA FIRMA ES EXACTA POR
  CONSTRUCCIÓN** (v4.929, `POST /public/greeting`). El modelo escribe el
  CUERPO y el código pone la FIRMA (`composeGreeting`): el Gobernador se lee
  de la fila REAL de `District` número 4281 (respaldo `DEFAULT_GOVERNOR`),
  el período lo calcula `rotaryPeriodFor(today)` — julio a junio, `today`
  como parámetro—. `validateGreeting` decide (la ÚNICA cifra permitida son
  los años; el «Distrito 4281» del cuerpo es legítimo — el ejemplo del
  cliente lo lleva; sin enlaces, hashtags, markdown ni firma colada) y el
  reintento devuelve LA REGLA CONCRETA; agotado, sale `fallbackGreeting`
  (determinista, sin hechos inventados) y SE DICE (`source: 'plantilla'`).
  El mensaje se guarda en la pieza (`copy.greeting`): pedirlo de nuevo no
  gasta otra llamada, y regenerar crea otra pieza con otro mensaje. Es
  INDEPENDIENTE de la generación: un redactor caído no pierde la imagen, y
  al revés. Los botones son HONESTOS: WhatsApp abre `wa.me` con el TEXTO
  (por web no se puede adjuntar la imagen y no se finge), «Compartir» sólo
  aparece con `navigator.share` y manda la imagen sólo si `canShare({files})`.
  **El mensaje es POR CANAL** (v4.930, pedido expreso): UNA llamada devuelve
  JSON `{social, email}` — la de redes corta (100-550) con 1-4 emojis
  sutiles VALIDADOS, la de correo completa y sin emojis — con pestañas como
  la Biblioteca de Publicaciones. Cada versión se valida con las reglas de
  SU canal (`channel` en `validateGreeting`) y la inválida cae a SU
  plantilla sin tirar la válida (la lección de v4.792). WhatsApp y
  «Compartir» llevan SIEMPRE la corta; el correo, SIEMPRE la completa;
  «Copiar» copia la pestaña elegida. Una pieza de v4.929 con una sola
  versión guardada completa la corta con su plantilla, sin otra llamada.
- **⚠️ EL ENVÍO POR CORREO EXIGE SESIÓN Y REUTILIZA LA INFRAESTRUCTURA DE
  SIEMPRE** (v4.929, `POST /anniversaries/email`, `authMiddleware` en la
  ruta Y `req.user` comprobado OTRA VEZ en el controlador): un formulario
  anónimo mandando correos firmados por el Gobernador sería un cañón de
  spam institucional. Nada nuevo: `EmailService.sendPlatformEmail` (con
  adjuntos), remitente por `resolveSenderPlan` sobre el dominio de la fila
  de `District` — NUNCA un dominio sin verificar (v4.857), y el nivel se
  devuelve—, y los contactos del autocompletado salen del CRM existente
  (`GET /crm/contacts`, autenticado y acotado por el servidor), más correos
  manuales validados; tope `EMAIL_MAX_RECIPIENTS` (10), deduplicados en
  minúsculas y el inválido NOMBRADO. La pieza FINAL la compone el navegador
  (la vista previa ES el archivo): viaja como data URL JPEG, se sube a
  nuestro bucket (`anniversaries/mail`) y el correo la embebe (https-only,
  todo escapado, con versión en texto plano) Y la adjunta. Un correo POR
  destinatario con su resultado: «enviado» SÓLO cuando el proveedor lo
  confirmó — `ok` global sólo si confirmó TODOS—, el botón se apaga
  mientras envía, y un fallo nunca pierde la pieza ni el mensaje.
- **⚠️ LA BIBLIOTECA MULTIMEDIA SE RESUELVE EN EL SERVIDOR, POR NOMBRE DE CLUB,
  Y EL UNIVERSO LO ACOTA EL CATÁLOGO** (v4.928, `GET /public/library`). El
  bloque «Fotografía del club» ofrece las dos vías (regla de v4.700): archivo
  local y la Biblioteca del ecosistema. La resolución REUTILIZA relaciones que
  ya existen — club escrito → sitio por NOMBRE (la misma consulta de
  `subjectClubFor` que imprime el logotipo real; jamás construyendo un dominio
  a mano), y sin club / sin sitio / sitio `inactive` → el sitio del Distrito
  4281 vía `DISTRICT_SITE_SQL` + `pickDistrictSite` (v4.744; un segundo
  criterio serviría un sitio distinto del que sirve rotary4281.org)—. El
  AISLAMIENTO es estructural: la petición sólo lleva el NOMBRE del club (el
  mismo texto libre que ya viaja a la generación) y
  `findPublicClub(…, ANNIVERSARY_DISTRICT)` acota lo alcanzable — un sitio
  alojado cuyo nombre no esté en el catálogo del 4281 no expone su biblioteca
  por ninguna vía (probado a la inversa con un sitio vivo de otro distrito).
  Sólo imágenes, sin HEIC (v4.739); la elegida se trae por el proxy
  `banner-image` (CORS) y entra a `setFoto` como data URL: el MISMO pipeline
  que un archivo local, sin tocar la composición. Cambiar de club descarta lo
  traído; el endpoint DEGRADA siempre — corre en una página pública. Lo que
  este endpoint agrega es la LISTA, no una clase de acceso nueva: son archivos
  con URL pública que ese sitio ya sirve — pero cualquier visitante puede
  listar la biblioteca de un club del 4281 escribiendo su nombre, y eso se
  asume como parte del pedido, no se descubre después.
- **⚠️ EL BUSCADOR DE CLUBES SE ACOTA AL DISTRITO 4281, Y EL FILTRO VA EN EL
  DATASET** (v4.927, pedido expreso con el selector delante — sugería
  «Bucaramanga Ruitoque — Distrito 4271»). No hay lista nueva: la fuente es
  el catálogo curado Distrito → Clubes de `rotaryClubs.js` (v4.707) —el mismo
  de los formularios de la Feria—, y lo que se agregó es el parámetro
  `district` OPCIONAL en `searchPublicClubs`/`findPublicClub`
  (`publicClubs.js`): omitido, todo queda como estaba — Plantillas IA sigue
  buscando sobre el catálogo entero, y lo fija una prueba. Aniversarios pasa
  `ANNIVERSARY_DISTRICT` ('4281', en el spec) en sus DOS buscadores (público
  y panel de pruebas) y en el reconocimiento del nombre escrito: el servidor
  nunca manda un club de otro distrito — esconderlo en la pantalla no
  protegería nada (v4.868). El campo sigue siendo texto libre (v4.706: la
  lista ayuda a escribir, no cierra los valores). La paridad se prueba
  contra los 74 clubes del 4281 y la exclusión barriendo el 4271 ENTERO,
  verificado a la inversa.
- **⚠️ LA GEOMETRÍA ESTÁNDAR DECLARA LAS DOS COTAS Y LA BANDA SE CALIBRA
  CONTRA LA PIEZA APROBADA** (v4.925, directiva con las dos capturas
  delante). «El contenido termina antes del 72 %» (v4.922) sólo acotaba por
  abajo: el modelo entregaba bloques FLOTANDO arriba — foto chica, vacío
  grande antes del pie. El prompt declara ahora el equilibrio entero: bloque
  del 14 % al 76 % del alto, la cinta CIERRA la composición cerca del 76 %,
  foto PROTAGONISTA de ancho declarado (~60 % — su alto ya lo fija el 16:9
  impuesto) y años GRANDES (9 % del alto desde v4.926 — el estándar aprobado
  menos los 15 px pedidos; supersede el «MODERADO» de
  v4.924 — la oscilación quedó escrita: moderado porque invadía, grande
  porque flotaba; el aire lo garantiza la banda medida, no el achique). Y la
  banda del pie se RECALIBRÓ de 0.74 a 0.78 porque la pieza que el cliente
  eligió como referencia cierra la cinta en ~0.76: la puerta marcaba con
  «tinta 6,2 %» un layout aprobado — al calibrar una puerta, medirla contra
  la pieza BUENA, no sólo contra la defectuosa. Los «tokens de layout»
  pedidos viven donde de verdad gobiernan: el 16:9 en `ingestPhoto` (lo que
  la plataforma imprime o impone es determinista), las proporciones del
  lienzo generativo en la cláusula de GEOMETRÍA ESTÁNDAR del prompt (a un
  modelo no se le imponen coordenadas: se le declaran proporciones y se
  MIDE la salida).
- **⚠️ SIN PIEZA SUSTITUTA JAMÁS** (v4.924, directiva expresa: «la IA genera
  A → A se muestra → A se descarga; nunca A falla → se muestra B». Supersede
  la degradación de v4.915 que imprimía la estructura de texto y la foto
  sobre blanco). Si el diseño generado no carga tras los reintentos, el
  compositor retorna con `backdropFailed` y el lienzo VACÍO, y la pantalla
  muestra un ESTADO DE ERROR con «Reintentar la carga (gratis)» — sin
  Descargar (no hay nada correcto que descargar), sin gastar generación: la
  pieza ya está persistida en NUESTRO almacenamiento desde el sondeo (la URL
  efímera de KIE nunca llega al navegador). El modo `plain` NO es esto: es
  una decisión del SERVIDOR y conserva su camino. Verificado a la inversa.
- **⚠️ LA FRASE CONMEMORATIVA SE ELIMINÓ DEFINITIVAMENTE** (v4.924,
  directiva expresa; supersede la capa impresa de v4.920-v4.923). La
  jerarquía termina en «{ANOS_CLUB} AÑOS»: el prompt no reserva franja, el
  despacho no guarda frase ni gate, `pieceView` no emite `phraseOverlay` y
  el compositor no tiene el bloque — una pieza vieja con `printPhrase`
  guardado tampoco imprime nada (lo fija una prueba de navegador). El
  catálogo `ANNIVERSARY_PHRASES`/`phraseForSeed` y la variable `{FRASE}`
  quedan SÓLO para un prompt EDITADO que la conserve (ahí la dibuja el
  modelo). El número de años va «de tamaño MODERADO … con aire claro antes
  de la zona inferior». Y la PALETA FESTIVA está bloqueada: dorado
  metálico / champagne muy claro / blanco / perlado en el positivo («ante
  la duda, dorado metálico o blanco perla») y rose gold, rosados, salmón,
  cobre, naranja, marrón y bronce rojizo en el NEGATIVO — las prohibiciones
  van al negativo, regla del sitio.
- **⚠️ EL MARCO DE LA FOTO ES FIJO: LA PLATAFORMA RECORTA A 16:9 ANTES DEL
  MODELO** (v4.923, directiva expresa — «la fotografía se adapta al marco, el
  marco NO se adapta a la fotografía»). Un modelo de edición HEREDA la
  proporción de la imagen que recibe: una foto vertical producía un marco
  alto → cinta baja → colisión con la frase, la cadena completa del reporte.
  `ingestPhoto` estandariza a `PHOTO_FRAME_RATIO` (16:9) con cover +
  estrategia de atención de sharp — NO es detección de rostros y no se
  afirma como tal—; una foto ya ~16:9 (±5 %) no se toca, y el recorte
  fuerte (desvío > 0,45) se AVISA con su consecuencia. Pedirle la altura al
  prompt no alcanzaba: la geometría se IMPONE en la entrada, no se pide.
- **⚠️ LA FRASE SOBRE LA CIFRA ESTÁ TÉCNICAMENTE PROHIBIDA** (v4.923). La
  escalera del compositor: franja limpia medida (dirt ≤ `PHRASE_DIRT_MAX`)
  → cuerpo reducido (0,026 → 0,022) → **OMITIR** la frase con
  `PHRASE_OMITTED_WARNING`. Una frase impresa sobre el «10 AÑOS» se lee como
  un módulo roto; una omitida con su aviso es honesta y se regenera — la
  postura de v4.801 («prefiero una escena fallida antes que un falso
  resultado»). Y los avisos de un render anterior se REEMPLAZAN en el
  siguiente (`avisosDeRender`): un «no se pudo cargar…» de un intento que
  después cargó bien se quedaba para siempre bajo una pieza perfecta.
- **⚠️ CON EL PIE PUESTO, NADA SE IMPRIME ENCIMA** (v4.922, supersede el «el
  logotipo del club y la línea del distrito se imprimen ENCIMA, en la banda»
  de v4.917). Los «logos duplicados» del reporte NO los generó el modelo:
  eran NUESTRA capa 3 —el logotipo del club y la línea «Distrito 4271 ·
  2026-2027»— pintados sobre el PNG del pie. El PNG es la firma institucional
  COMPLETA y es la CAPA FINAL, pixel-perfect; el logotipo y la línea sólo se
  imprimen cuando NO hay pie configurado. Y el PNG del pie JAMÁS viaja al
  modelo (al modelo van la foto y la referencia, nada más — lo fija una
  prueba del camino). Al diagnosticar «la IA volvió a generar logos en el
  pie», mirar PRIMERO nuestra capa 3: se ve idéntico.
- **⚠️ LA FRANJA DE LA FRASE SE ELIGE MIDIENDO, y la banda inferior es la
  segunda mitad de la puerta** (v4.922). La frase impresa iba a altura FIJA
  (74,5 %) y el modelo bajó la cinta de años hasta ahí: chocaban (reporte con
  captura). El compositor mide el diseño (muestra reducida, tinta oscura por
  fila) y elige la franja más limpia entre el 66 % y el 80 % del alto, con
  separación de lo ocupado; sin medición posible, la altura de siempre. Y el
  prompt fija la DISTRIBUCIÓN VERTICAL —todo el contenido en el 72 %
  superior, título en el tercio superior, foto de alto ~un cuarto, zona
  reservada 25 %— mientras `judgeFooterZone` + `measureFooterZone` (sharp,
  banda 0.74-0.96, materializada a buffer — v4.799) miden la salida CRUDA:
  contenido en el cuarto inferior regenera UNA vez con `FOOTER_RETRY_CLAUSE`
  y, si insiste, SE ENTREGA con su aviso. Las dos puertas (patrón + banda)
  COMPARTEN el único reintento (`styleRetried`): dos reintentos serían tres
  generaciones pagadas. Calibrado con bandas sintéticas — limpia 0 %/0,2,
  cinta baja 5,5 %/22, pie generado 36 %/86; umbral 2 %/36 parte las
  brechas. Al tocar el prompt default, MEDIR el peor caso (2.495/2.500 con
  nombre de 33 caracteres) — el recorte cae del final, sobre la cláusula del
  pie.
- **⚠️ LA FRASE CONMEMORATIVA LA ELIGE **Y LA IMPRIME** LA PLATAFORMA**
  (v4.919-v4.920). Era el único texto libre del modelo y salía mal escrito
  («Sirvingo… construuido»); v4.919 la pasó a catálogo (`ANNIVERSARY_PHRASES`,
  CERRADO, 8-12 palabras, sin cifras, determinista por pieza con
  `phraseForSeed`) para que el modelo la copiara — y aun copiada la DEFORMÓ
  al pintarla («Celerbamos… servico»): un modelo de imagen no dibuja español
  fiable ni copiando, y cambiar el generador de TEXTO no toca ese paso.
  v4.920: la frase se IMPRIME como capa del compositor (la técnica del pie),
  centrada en su franja (~74,5 % del alto), azul institucional, tipografía
  real. El prompt ya NO lleva `{FRASE}` — pide una franja horizontal LIMPIA
  debajo de la cinta— y el despacho guarda `copy.message` + el gate
  `printPhrase` (sólo enciende si el prompt de ESA pieza no llevó la frase):
  piezas viejas y prompts editados con `{FRASE}` no reciben una segunda frase
  encima. `{FRASE}` sigue soportada en `applyMasterVariables` para prompts
  editados. Al agregar una frase al catálogo, contar sus palabras y no meter
  cifras. Y la espera de generación se VE viva: barra INDETERMINADA
  (`animate-progress-slide`, en el tema de Tailwind — v4.813) más segundos
  reales — nunca un porcentaje inventado (v4.756).
- **⚠️ LA ZONA DEL PIE ES DE NO GENERACIÓN, con la causa nombrada** (v4.918).
  La referencia del cliente trae un pie de onda azul: el modelo lo imitaba
  dentro de la imagen y encima se imprimía el pie REAL — logos dobles
  (reporte con captura). La cláusula 7 dice expresamente «si la referencia
  trae un pie abajo, NO lo reproduzcas — la plataforma superpone después su
  pie real», y el negativo prohíbe el pie generado con sus formas concretas
  (ondas azules, emblemas, lemas). Del mismo pedido: título en DOS líneas
  letra por letra y ALTO en el lienzo, foto de alto ~un tercio del lienzo, y
  la frase conmemorativa es UNA, de 8 a 12 palabras, SIEMPRE presente. La
  prohibición de guirnaldas pasó entera al negativo.
- **⚠️ EL PIE INSTITUCIONAL SE IMPRIME TAL CUAL** (v4.917, pedido expreso;
  supersede el «cover recortado a la banda» de v4.902 para el flujo de
  Aniversarios): la imagen que subió el administrador va al ancho COMPLETO
  del lienzo, con su proporción NATIVA, anclada al borde inferior — sin
  recorte ni estirado; el archivo manda y la zona inferior ya viene
  reservada por el prompt. Se carga con los MISMOS reintentos que el diseño
  (`loadBackdrop`): es la firma estándar de todas las piezas, no un adorno —
  la excepción a «el branding conserva su intento único» de v4.915 (logotipo
  y marca de agua siguen con uno). El logotipo del club y la línea del
  distrito se imprimen ENCIMA, en la banda. Y el formulario público lee la
  configuración PUBLICADA: un pie subido al borrador no sale hasta publicar.
- **⚠️ EL DISEÑO GENERADO SE CARGA CON REINTENTOS, Y SU DEGRADACIÓN NO SALE
  MUDA** (v4.915). El diseño es LA pieza y ya está pagado: un 502 puntual no
  puede costarlo — `loadBackdrop` hace tres intentos con pausa (los fallos no
  se cachean, así que reintentar pide de verdad); el branding conserva su
  intento único porque su degradación es cosmética. Y cuando ni así carga,
  el respaldo IMPRIME la estructura de texto: en modo simple la capa venía
  apagada «porque la imagen trae el texto», pero sin imagen cargada no hay
  ninguna que lo traiga — la pieza salía como la foto suelta sobre blanco,
  sin título ni años (reporte con captura). La salida es visible y gratuita:
  `backdropFailed` en el resultado del compositor y el botón «Reintentar el
  diseño (gratis)» en la página pública, que re-compone sin gastar una
  generación.
- **⚠️ EL PROXY LEE NUESTRO BUCKET POR EL SDK, con credenciales** (v4.912).
  La lectura anónima por HTTP de la URL pública depende de que el bucket
  permita lecturas públicas; la subida por SDK funcionaba mientras las TRES
  cargas del proxy fallaban — dos caminos al mismo bucket, y sólo uno
  demostrado. `proxyBannerImage` usa `GetObjectCommand` para su propio bucket
  (fetch con tope para los demás hosts permitidos) y el 502 lleva `detail`
  con el motivo del origen. Alcanza a Aniversarios, Pendones y Plantillas IA.
- **⚠️ EL PROMPT PREDETERMINADO ES LA DIRECTIVA DE COMPOSICIÓN DEL CLIENTE y
  se refina POR CLÁUSULA, midiendo** (v4.913-v4.916). Desde v4.916 el marco
  de la foto es ESTÁNDAR (borde dorado fino, margen blanco, sombra suave) y
  los años son un componente FIJO e idéntico entre piezas — y **el prompt NO
  lleva frases de ejemplo copiables**: el ejemplo de tono terminó copiado
  literal y deformado en una pieza real («transformma comuniadies») — un
  ejemplo dentro del prompt se convierte en la salida (v4.905, por la puerta
  del texto). La cadena de legados se comprueba ENTERA
  (`LEGACY_MASTER_PROMPTS` exportada: todo default viejo resuelve al
  vigente). La estructura fija:
  globos y celebración arriba y en los laterales (nunca navideña — la
  guirnalda de luces está prohibida en el prompt, en el negativo y en
  `VARIATION_THEMES`), título «¡FELIZ ANIVERSARIO!» MUY GRANDE y dominante,
  nombre en MAYÚSCULAS con peso delgado entre dos líneas finas doradas, foto
  RECTANGULAR HORIZONTAL con borde dorado (nunca círculo/óvalo), años como
  REGLA FIJA (número dorado + cinta «AÑOS», centrado sobre el borde inferior
  de la foto), mensaje corto SIN repetir la cantidad de años (la cifra va una
  sola vez, en la cinta), y UN SOLO fondo continuo hasta el borde — la zona
  del pie (20 %) es continuación del mismo fondo, jamás un rectángulo blanco
  añadido (el corte va también al negativo). Cada versión del default entra a
  `LEGACY_MASTER_PROMPTS`/`LEGACY_RESTRICTIONS` para el upgrade perezoso, y
  el tope de KIE se mide con TODAS las variaciones y un nombre largo (peor
  caso v4.914: 2.467/2.500) — el recorte cae del final, o sea sobre la
  cláusula del pie, que es la estructural.
- **⚠️ LA COLUMNA NUEVA HAY QUE ENUMERARLA EN EL ATAJO DEL ENSURE, y la trampa
  se pagó el mismo día** (v4.908). `request` tenía su `ADD COLUMN IF NOT
  EXISTS` y la comprobación rápida del catálogo no la enumeraba: en producción
  —todo lo demás ya existía— el ensure cortaba en el atajo y el ALTER no corrió
  nunca («la columna request no existe», en la pantalla del cliente). El propio
  archivo lo advertía en prosa; un comentario no protege (v4.859). Ahora una
  prueba recorre TODOS los `ADD COLUMN` del archivo y exige cada uno en la
  lista del atajo — verificada a la inversa contra el esquema anterior.

- **⚠️ EL CRITERIO PUEDE ESTAR BIEN Y EL DEFECTO VIVIR EN EL CAMINO** (v4.896,
  `test:anniversary:path`). La v4.895 verificó el criterio y el compositor, y
  los controladores, el store y la orquestación no se habían ejecutado NUNCA —
  es la lección de v4.744 y la de v4.889—. La prueba corre las cuatro etapas de
  punta a punta y comprueba lo que ninguna prueba pura ve: que la consulta lleve
  los parámetros que lleva, que el nombre de una columna coincida con lo que el
  store escribe, que cada etapa deje la pieza donde la siguiente la espera, que
  el documento traiga **todos** los campos que el compositor lee, que el reclamo
  impida dos cobros y que la puerta del formulario público esté cerrada.
  **`sharp` no se sustituye**: las mediciones de blanco y de franja se ejercitan
  de verdad sobre imágenes reales.
- **⚠️ UN DOBLE QUE IMPLEMENTA LA REGLA QUE LA PRUEBA DICE COMPROBAR NO COMPRUEBA
  NADA.** La primera versión del doble de la base escribía en JavaScript el
  candado del reclamo, así que quitar el `AND attempts = $2` de la consulta real
  **no hacía fallar nada** — la comprobación era vacua y decía lo contrario. Lo
  destapó la verificación a la inversa, no la lectura. Ahora la condición se lee
  del propio SQL, igual que los pares `"campo" = $n` del UPDATE parcial. Al
  escribir un doble, preguntarse qué parte de la regla vive en él.
- **UNA IMAGEN DE PRUEBA PARA UN CONTROL DEJA EL RESTO EN VERDE.** La que
  ejercitaba «la franja del texto ocupada» llevaba además una banda gris que
  bajaba la luminancia media a 198: saltaban los DOS controles y se reportaba el
  otro. Y las aserciones van sobre los **identificadores guardados**, no sobre
  el primer texto: `reason` sólo trae el primero de los críticos.
- **Lo que estos dobles NO demuestran es que el SQL sea válido para Postgres.**
  Eso se comprueba al desplegar, y se dice para no afirmar de más.

**Reglas durables:**

- **⚠️ LA ARQUITECTURA ES HÍBRIDA, Y ES LA DECISIÓN DE LA QUE CUELGA TODO.** Son
  tres capas: la **IA hace el DISEÑO** (fondo, decoración y la fotografía
  integrada), la **plataforma imprime el TEXTO** encima (nombre del club, años,
  titular y mensaje) y la **plataforma imprime el BRANDING** desde archivos
  reales. El motivo de la capa 2 está medido en este repositorio y escrito en
  `designCompose.js`: **los modelos generativos no escriben texto de forma
  fiable**, y cuando sale mal no hay salida limpia —corregirlo encima es el
  composite que el equipo rechazó dos veces con las palabras «se ve overlay /
  montaje»—. Un aniversario lleva el nombre propio de un club y una cifra: son
  exactamente los dos textos que no pueden salir mal. El motivo de la capa 3 es
  más simple: el emblema de Rotary es marca registrada y se reproduce desde el
  archivo, no se dibuja. **Consecuencia buscada: el nombre y los años son
  exactos POR CONSTRUCCIÓN, no por medición.**
- **⚠️ `generateCopy` DEVUELVE `{ content }`, NUNCA `.text`** (v4.901). Las
  tres lecturas del módulo (análisis de foto, redactor, análisis de
  referencia) leían `raw?.text` — un campo que no existe— y caían al respaldo
  EN SILENCIO en producción: mensaje ausente siempre, zona siempre «abajo»,
  cláusula de referencia muda. Las pruebas no lo veían porque el doble del
  servicio devolvía `{text}`: **el doble tiene que devolver LA MISMA FORMA que
  el servicio real** — con `{content}` en el stub, leer el campo viejo rompe
  12 comprobaciones. `reelDirector.js` ya documentaba esta misma lección.
- **⚠️ LA ZONA DEL TEXTO SE FIJA EN LA CONFIGURACIÓN Y CALZA CON EL LAYOUT DEL
  MAESTRO** (v4.901, `config.textZone`, default `left`). El maestro por
  defecto FIJA la fotografía a la derecha; la zona automática se decidía POR
  FOTO y con un grupo centrado elegía «abajo»: el modelo no podía cumplir las
  dos cosas y la franja quedaba «ocupada» sin culpa suya. `zoneForConfig` es
  el ÚNICO punto de decisión (lo consumen las dos vías de análisis, el
  ensamblador y el benchmark); `auto` conserva la decisión por foto. La
  franja es además de DOS niveles como el fondo (`zoneHardStdDev: 78`):
  decoración fina sobre claro (caso real 72/217) se ENTREGA con nota; una
  fotografía en la franja (>78 o luma <175) se sigue descartando.
- **EL RESPALDO DEL MOTOR NO GENERA, y el panel lo dice** (v4.901). Poner un
  modelo en «Fallback» se leyó como usarlo; ahora el selector lo aclara y cada
  modelo elegible tiene su botón de UN clic «activarlo como modelo de
  producción» — la misma activación humana y registrada del benchmark, no una
  vía nueva.
- **⚠️ EL MODELO TIENE QUE DEJARLE SITIO AL TEXTO, Y ESO ES UN ACUERDO ENTRE LAS
  DOS MITADES.** `textZoneFor` decide la franja limpia mirando el análisis de la
  fotografía —personas a la derecha, texto a la izquierda; grupo centrado, texto
  abajo—, esa decisión entra al prompt EN PALABRAS (`clearZoneClause`, no en
  coordenadas: en coordenadas no se cumple) y el compositor del navegador lee
  **la misma** entrada de `TEXT_ZONES`. Con dos tablas, el modelo despeja un
  lado y el texto se imprime en el otro — y eso no da ningún error: da una pieza
  con el título encima de una cara. La paridad de los dos espejos la comprueba
  `test:anniversary`, número a número.
- **⚠️ MEDIR «¿HAY TEXTO EN LA MITAD IZQUIERDA?» NO DISCRIMINA.** Las tres zonas
  SE SOLAPAN —`left` llega a y=0,74 y `bottom` empieza en y=0,52—, así que la
  primera versión de la prueba de navegador pasaba con el compositor escribiendo
  SIEMPRE abajo. Sólo el **centroide** de la tinta distingue una zona de otra.
  Verificado a la inversa. Al comprobar dónde cae algo en un lienzo, medir el
  centro de masa, no la presencia en un rectángulo.
- **⚠️ LA VISTA PREVIA NO SE PARECE AL ARCHIVO: ES EL ARCHIVO.** Es el requisito
  14 y hay **un solo camino de composición**: `renderAnniversary` devuelve UN
  canvas, la pantalla monta ESE objeto y la descarga exporta ESE mismo objeto.
  No hace falta ninguna prueba de paridad píxel a píxel —la que Plantillas IA sí
  necesita, porque allá el DOM y el canvas son dos maquetadores— porque acá no
  hay dos cosas que comparar. **No reintroducir una vista previa en DOM.**
- **LA MAQUETACIÓN ESTÁ EN FRACCIONES DEL ANCHO**, nunca en píxeles. Por eso la
  descarga en alta resolución es la misma pieza con más píxeles y no otra
  composición.
- **⚠️ LA ESTRUCTURA DEL TEXTO ES PREESTABLECIDA** (v4.902, `planTextBlocks`;
  supersede la regla de redundancia de v4.898). Pedido literal del cliente con
  la referencia delante: «estilos preestablecidos… que quede distribuida tal
  cual». La jerarquía sale SIEMPRE: saludo fijo `HEADLINE_TEXT` en dos líneas
  con subrayado dorado → `KICKER_TEXT` → club en dos tonos → banda dorada con
  muescas y puntos → el mensaje de la IA como CITA centrada con comillas
  doradas → filete → el TITULAR de la IA como LÍNEA DE CIERRE («¡Gracias por
  tanto!…» — `buildCopySystem` se lo pide así, sin nombrar club ni años). El
  titular ya no reorganiza nada: con «Club Rotario Bello: cuatro décadas…»
  desaparecían el saludo, el pase y el club en dos tonos. Un cierre ausente NO
  se inventa; la cita y el cierre van centrados sea cual sea la zona
  (`align` en el estilo). La medición del saludo especial usa LA MISMA cuenta
  que su dibujo (`HEADLINE_TOP_RATIO`/`HEADLINE_RULE_GAP`).
- **EL PIE INSTITUCIONAL OCUPA LA BANDA ENTERA** (v4.902). La imagen del pie
  —las curvas de la referencia— está diseñada a lo ancho: en una caja a la
  derecha quedaba como un sello suelto. Se dibuja como fondo de TODA la banda
  (cover, recortada a la banda) y el logotipo y la línea del distrito van
  ENCIMA; el velo blanco y el filete dorado sólo se pintan cuando NO hay
  imagen de pie — ella es el pie.
- **LAS REGLAS VISUALES SON DEL SISTEMA, NO DEL ADMINISTRADOR.** La paleta, los
  cuerpos de letra y el contraste no se configuran: son lo que garantiza que el
  texto se lea sobre cualquier fondo que devuelva el modelo. Quien configura
  elige las instrucciones y las referencias; la legibilidad no es una decisión
  editorial. Misma regla que el Slider Global (v4.879).
- **CUATRO CLÁUSULAS NO SE NEGOCIAN Y NO SE RECORTAN NUNCA** (v4.898 sumó la
  cuarta): que la imagen no traiga texto ni logotipos, que conserve a las
  personas de la fotografía, que deje libre la franja del texto y que la BANDA
  INFERIOR quede limpia (`FOOTER_CLAUSE`). Sin ellas la pieza no es publicable
  por bonita que salga.
- **⚠️ LA REFERENCIA LLEVA SU ROTULADO Y EL MODELO LO IMITA** (v4.905). El
  reporte con capturas: un «¡FELIZ ANIVERSARIO!» fantasma DENTRO del fondo,
  debajo del nuestro — y la medición de la franja no lo distingue de
  decoración fina (por eso pasó). Tres defensas, las tres hacen falta: el
  núcleo del prompt dice que el rotulado de la referencia se imprime DESPUÉS
  («never draw it»), el envoltorio del maestro dice lo mismo de las palabras
  que la dirección mencione, y `detectDrawnText` lo PREGUNTA con visión sobre
  el lienzo crudo — con certeza descalifica (`texto_dibujado`, reintenta una
  vez con la instrucción concreta; agotado, `plain` con su motivo), sin
  certeza se entrega con nota. El doble del stub contesta este system también,
  con la forma real `{content}`.
- **⚠️ EL TEXTO QUE LA FOTOGRAFÍA TRAE CONSIGO ES LEGÍTIMO** (v4.906). El
  primer despliegue del verificador descalificó una pieza real por los rótulos
  de las CAJAS DE DONACIÓN de la fotografía («en las cajas dentro de la
  fotografía», dijo el propio verificador — y el criterio no usó ese dato):
  gastó las dos generaciones y entregó el modo plano sin diseño. Una foto de
  donaciones SIEMPRE trae texto — es el «¿cuál es su ruido de medición y a
  cuántas piezas legítimas alcanza?» de las cuatro puertas de Reels, pagado
  acá el mismo día. Dos capas: la pregunta exime expresamente el texto DENTRO
  de la fotografía, y el campo acotado `insidePhoto` hace que el CÓDIGO no
  descalifique cuando el verificador lo ubica ahí, conteste como conteste
  `hasText`. Sólo descalifica el texto FUERA de la foto — fondo, decoración,
  franjas.
- **⚠️ «VARIÁ LA DECORACIÓN» ESCRITO EN EL PROMPT NO VARÍA NADA** (v4.905):
  el prompt idéntico entre generaciones converge, y estos motores no exponen
  semilla. La variedad de verdad exige que el PROMPT cambie por pieza:
  `DECOR_MOTIFS` (catálogo CERRADO de ocho motivos del tema aniversario) y
  `motifForSeed(pieceId)` — DETERMINISTA, como la asignación A/B del CRM: el
  reintento de la misma pieza conserva su motivo, dos piezas varían, y «¿por
  qué esta pieza tiene velas?» tiene respuesta (el motivo va en el sello
  `engine.motifId`; en el benchmark la semilla es POR FOTOGRAFÍA, para que
  todos los modelos reciban el mismo juego de prompts). Interruptor
  `promptOptions.varyDecor` (default true, entra a la huella); sin semilla no
  se varía — sería una ruleta. En el orden de sacrificio de KIE la decoración
  cae después del ambiente y antes de la referencia: es variedad, no
  identidad; con las cláusulas anti-rotulado el caso KIE-con-referencia queda
  al borde del tope y recorta según el orden declarado — GPT Image (30.000)
  lleva todo.
- **⚠️ EL PROMPT MAESTRO (v4.898) SUPERSEDE a `designInstruction` y al estilo
  base.** La dirección de arte vive en `config.masterPrompt` —en la BASE, no en
  el código—, se edita y restaura desde el panel, y se versiona al publicar con
  el resto de la configuración (`fingerprintOf`). Entiende TRES variables —
  `{NOMBRE_CLUB}`, `{ANOS_CLUB}`, `{FOTO_CLUB}` (`MASTER_VARIABLES`)— que
  `applyMasterVariables` sustituye con los datos reales ANTES de llamar al
  modelo; una variable desconocida se AVISA en `validateConfig` y viaja literal
  —borrarla en silencio dejaría al administrador editando un token que
  desaparece—. Una configuración vieja con `designInstruction` la conserva como
  Prompt Maestro (fallback de lectura en `normalizeConfig`, regla aditiva). El
  bloque `estilo` (BASE_STYLE) YA NO se ensambla: el maestro por defecto lo
  supersede — BASE_STYLE queda exportado como referencia.
- **⚠️ EL PROMPT MAESTRO SE RECORTA, NUNCA SE ELIMINA.** El orden de sacrificio
  es ambiente → recortar el maestro (`master(recortado)`). Es lo ÚNICO del
  prompt específico de ESTA configuración — misma decisión que `motionHint` en
  el Creador de Reels. El presupuesto es **2.500** y está MEDIDO (v4.898,
  `PROMPT_VERSION = '2'`): con el maestro por defecto el prompt entero mide
  2.343 —núcleo 1.386 (incluida `FOOTER_CLAUSE`), maestro sustituido y envuelto
  710, ambiente hasta 370— y el peor caso cierra en 2.491. **Al agregar una
  frase, medir.** `promptOptions` trae los dos interruptores opcionales:
  `ambient` (la frase por foto) y `useReference` (mandar la referencia visual);
  lo que no es opcional no tiene interruptor.
- **⚠️ LA BANDA DEL PIE ES DEL 16 %** (`FOOTER_BAND = { y: 0.84, h: 0.16 }`,
  dentro del 15-20 % pedido) y es el MISMO acuerdo en tres lectores: la
  `FOOTER_CLAUSE` del prompt (en palabras), el compositor (dibuja el pie ahí) y
  las zonas de texto (terminan por encima; `bottom` es y 0.50–0.82). Al mover
  la banda, mover los tres — la paridad la comprueba `test:anniversary`.
- **EL COMPOSITOR HABLA EL LENGUAJE DE LA REFERENCIA** (v4.898): titular azul
  en mayúsculas, el pase `KICKER_TEXT` («FELICIDADES», constante del código —
  lenguaje de la PIEZA, no algo que escriba un modelo), el nombre del club en
  DOS tonos (`splitClubName`: prefijo institucional azul + parte distintiva
  dorada, sólo cuando cabe en una línea — partir el color por el salto de línea
  se lee como un error), la banda dorada `yearsBandLabel` («40 AÑOS», pastilla
  dorada con texto blanco) y el mensaje. El espaciado de letra se fija ANTES de
  medir y de dibujar con el mismo valor (`applyLetterSpacing`): medir sin él y
  dibujar con él saca el texto del recuadro.
- **LO PROHIBIDO VIAJA EN `negative_prompt`**, no pegado al positivo: dentro de
  la descripción de la escena el modelo se obsesiona con lo prohibido (v4.705),
  y en su campo libera presupuesto del positivo.
- **EL MODELO ESCRIBE, EL CÓDIGO DECIDE.** `validateCopy` comprueba longitudes,
  frases, hashtags, emojis, enlaces, marcadores sin resolver y —lo más
  importante— **que el texto no mencione otra cantidad de años que la que la
  pieza imprime al lado**. El bucle le devuelve LA REGLA CONCRETA con su número;
  pedirle «revisá el formato» no corrige nada.
- **AGOTADOS LOS INTENTOS EL TRABAJO NO SE TIRA**: se ajusta lo ajustable por
  código y se entrega CON SUS AVISOS. Y **reparar no inventa contenido**: un
  mensaje corto sigue siendo corto y la validación lo sigue diciendo. Se guarda
  el intento con MENOS reglas rotas, no el último por ser el último.
- **⚠️ LA PUERTA DEL FONDO ESTÁ CALIBRADA CONTRA LA REFERENCIA, con DOS
  niveles** (v4.899). El umbral original (luminancia media ≥ 205) rechazaba
  exactamente el estilo que el Prompt Maestro pide —la referencia aprobada,
  con la fotografía en un tercio del lienzo, mide ~185-195—, gastaba las dos
  generaciones pagas y entregaba la foto plana sobre blanco: la lección
  repetida de Reels (v4.787/v4.790/v4.792), acá con el caso real medido en
  196 / 49 %. Ahora `whiteMinLuma: 165` DESCARTA sólo lo realmente oscuro
  (la restricción expresa del cliente) y la zona media hasta
  `whiteIdealLuma: 205` se ENTREGA con una nota — la estética no se mide, se
  muestra. Al ajustar el umbral, medir contra la referencia y contra el caso
  reportado; lo fija `test:anniversary` (196/49 % pasa) y una composición
  sintética estilo referencia en `test:anniversary:path`, por el sharp real.
- **EL TITULAR DE RESPALDO NO NOMBRA AL CLUB NI A LOS AÑOS** (v4.899). Cuando
  el redactor falla, el titular derivado decía «40 años del Club Rotario X» y
  `planTextBlocks` —correctamente— suprimía el pase, el club en dos tonos y la
  banda dorada: la pieza de respaldo salía plana. Queda en «¡Feliz
  aniversario!» (constante de la pieza) y el club y los años se imprimen como
  bloques. Y un mensaje vacío dice su CAUSA (el redactor no devolvió JSON
  utilizable), no sólo «falta el mensaje».
- **⚠️ ACÁ SE DICE QUÉ SE MIDE Y QUÉ NO.** Se **garantiza por construcción** el
  nombre, los años, el mensaje corto, el branding y que ningún texto salga de su
  zona. Se **mide**: el formato entregado, cuánto blanco tiene el fondo (media
  de luminancia + proporción de píxeles claros), si la franja del texto está
  tranquila (luminancia y desviación típica **de ESA región, recortada** — sobre
  la imagen entera la señal se diluye, la lección de v4.715) y si la fotografía
  se conservó (`designGuard.checkPreservation`, **reutilizado**). **NO se mide**
  la «estética de aniversario» —no hay forma de medir si una pieza se ve festiva:
  se PIDE y se MUESTRA— ni que la imagen no traiga texto dibujado —exigiría OCR,
  decenas de MB en una función que ya empaqueta FFmpeg dentro del tope de 250 MB—.
  No afirmar en la pantalla que se comprueba algo que no se comprueba.
- **⚠️ `sharp.stats()` IGNORA el `extract()` encadenado** y devolvería la
  estadística de la imagen entera, idéntica para cualquier franja. El recorte se
  MATERIALIZA a buffer antes de medir (v4.799).
- **LA CORRECCIÓN AUTOMÁTICA ES UNA, NO UN BUCLE.** Un fallo crítico reintenta
  **una vez** con el problema concreto (`retryClauseFor`): cada vuelta cuesta
  créditos y un modelo que falló dos veces por lo mismo no acierta a la tercera.
- **⚠️ AGOTADO EL REINTENTO, LA PIEZA SE ENTREGA IGUAL PERO EL MODO DICE LA
  VERDAD.** `ai` usa la composición; `plain` la DESCARTA y compone con la
  fotografía intacta sobre blanco, y **se dice en la pantalla con su motivo**.
  `plain` NO es un segundo sistema de diseño: es el MISMO compositor con la capa
  1 vacía. Y **la imagen del modelo no se retoca**: pegarle la fotografía
  original encima es el composite rechazado dos veces. Este control mide y
  decide; no toca el archivo.
- **BORRADOR → PROBAR → PUBLICAR.** Guardar NO cambia lo que genera la gente, y
  la cabecera lo dice mientras el borrador difiera de lo publicado — sin ese
  aviso, alguien corrige una instrucción, abre el formulario público, no ve
  ningún cambio y no tiene forma de saber por qué. **Publicar exige que la
  configuración sea válida; retirarla no**: poner al aire un generador roto es
  caro y retirarlo nunca puede quedar bloqueado por una validación.
- **⚠️ PUBLICAR Y PROBAR ACTÚAN SOBRE LO QUE SE VE, y con cambios sin guardar
  los veredictos del servidor SE CALLAN** (v4.904). Los avisos, la validación y
  el `dirty` los calcula el servidor sobre el borrador GUARDADO; editar la
  pantalla (agregar una referencia, tocar el maestro) no los mueve. El reporte
  con captura mostraba las tres cosas a la vez: la referencia recién agregada
  a la vista, el aviso «No hay ninguna referencia visual» debajo y la franja
  verde «lo que ves es lo que genera el público» — y peor, «Publicar» y
  «Probar» usaban el draft del servidor, así que la referencia sin guardar
  quedaba FUERA de lo publicado y de las pruebas, en silencio. Ahora
  `sinGuardar` (la foto `savedJson` de lo que devolvió el servidor) gobierna
  tres cosas: la franja propia «tenés cambios sin guardar» reemplaza a las que
  ya no son ciertas, `persistir` es EL único PUT del borrador y lo comparten
  Guardar, Publicar y Probar — los dos últimos guardan ANTES de actuar. Al
  agregar un botón que actúe sobre el borrador, pasarlo por `persistir`
  primero. Lo fijan siete comprobaciones en `test:anniversary`, verificadas a
  la inversa.
- **UNA VERSIÓN SE CREA AL PUBLICAR, Y SÓLO SI CAMBIÓ LO QUE SE IMPRIME**
  (`fingerprintOf`). Renombrar la configuración o mover el interruptor de activo
  no es una versión nueva. Volver a publicar sin tocar nada REUTILIZA la
  vigente: dos versiones idénticas con números distintos rompen la única
  pregunta que el versionado existe para responder. **RESTAURAR NO PUBLICA**:
  trae el texto al borrador y quien publica decide.
- **La versión guarda la configuración COMPLETA**, no una referencia: con sólo
  el id, editar el borrador cambiaría retroactivamente lo que dice haber
  generado una pieza de hace tres meses.
- **EL PANEL DE PRUEBAS CORRE LA MISMA CADENA QUE EL FORMULARIO PÚBLICO**
  (`runAnalyze`, `runCopy`, `runCompose`, `runSync`), con dos diferencias: prueba
  contra el BORRADOR y sus piezas quedan marcadas `test`. Con dos pipelines,
  probar una instrucción no diría nada sobre lo que hace la gente. Lo comprueba
  una prueba: el controlador público IMPORTA esas cuatro funciones.
- **LAS ETAPAS SON LLAMADAS REALES.** Son cinco peticiones y cinco etapas; la
  pantalla muestra una cuando OCURRIÓ, no cuando cree que va por ahí. Un
  progreso inventado hace esperar por nada (v4.756).
- **⚠️ LA CONFIGURACIÓN NO VIAJA EN LA PETICIÓN PÚBLICA.** Se lee de lo
  publicado, en el servidor. Con la configuración en el cuerpo, cualquiera con
  el endpoint mandaría sus propias instrucciones al modelo y gastaría créditos
  generando lo que quisiera. Es la frontera ESTRUCTURAL del portal de Plantillas
  IA: lo que no se puede expresar en la petición no se puede pedir. Lo comprueba
  una prueba sobre el archivo.
- **EL ALCANCE LO RESUELVE EL SERVIDOR** mirando el dominio desde el que se
  pide, nunca un campo del cuerpo: si lo mandara el navegador, acotarlo a unos
  sitios no serviría de nada.
- **EL RECLAMO DE DESPACHO VA SOBRE `attempts`**, que es un entero exacto: sobre
  `updatedAt` no funcionaría porque el driver de pg trunca los microsegundos y
  la igualdad no casaría nunca (v4.800). Sin candado, dos pulsaciones de
  «Regenerar» crean DOS tareas para la misma pieza: dos cobros.
- **LA FILA SE INSERTA ANTES DE LLAMAR A NINGÚN PROVEEDOR.** Si la petición
  muere a mitad queda el rastro con su motivo, en vez de no quedar nada (v4.669).
- **⚠️ LA FOTOGRAFÍA ANÓNIMA DEJA DE SER EFÍMERA, Y HAY QUE DECIRLO.** KIE
  necesita una URL que pueda descargar, así que subirla no es un descuido: es el
  precio de la composición generativa. Va al prefijo `public-tmp/`, aparte de la
  Biblioteca Multimedia, para poder vaciarlo con una regla de ciclo de vida sin
  tocar los archivos de nadie.
- **⚠️ EL COMPOSITOR PIDE LAS IMÁGENES POR EL PROXY** (`/api/public/banner-image`).
  Una imagen de S3 pintada directo deja el canvas «tainted» y `toBlob` lanza. No
  se abre un proxy nuevo: es el mismo que ya usan el Generador de Pendones y
  Plantillas IA.
- **LA MARCA SALE DE ARCHIVOS REALES O NO SALE.** Un club sin logotipo cargado
  no muestra logotipo, y eso **se dice** (`branding.missing`). Dibujar un emblema
  «parecido» es justo lo que una institución no puede publicar — misma regla que
  `designElements.js`, que a propósito no tiene ninguna rueda.
- **⚠️ LOS DOS ÍNDICES ÚNICOS DE LA CONFIGURACIÓN SON PARCIALES**, y no uno solo
  sobre `(kind, "clubId")`: en Postgres NULL nunca es igual a NULL, así que con
  un único índice las filas de la plataforma —que llevan `clubId` en NULL— no
  chocarían jamás entre sí, que es donde tiene que haber una sola. Por ser
  parciales **no se usa `ON CONFLICT` contra ellos**: habría que repetir el
  predicado o la sentencia falla entera (v4.648).
- **LAS TRES TABLAS VIVEN FUERA DE PRISMA** y están en la lista del guardián de
  `db:push`. Una tabla declarada en `schema.prisma` y todavía inexistente deja en
  500 a todo consumidor Prisma desde el primer despliegue (regla de `logo_intl`).
- **`kind` EXISTE PARA QUE REPLICAR EL ENFOQUE SEA UNA FILA MÁS.** Hoy hay un
  solo generador —`aniversario`— a propósito: el pedido dice que Aniversarios
  funcione excepcionalmente bien antes de abrir otro. Lo que se evita es
  hardcodear la palabra en la base, en las rutas y en el store, que es lo que
  obligaría a reescribirlos después.
- **`/aniversarios` está en `PRIVATE_PREFIXES`.** Abierto y no indexado son cosas
  distintas: es una herramienta que se abre desde un enlace y la comparten todos
  los sitios; indexarla haría competir una utilidad con las páginas reales del
  club por sus términos de marca.
- **EL PANEL ES DEL OPERADOR DE LA PLATAFORMA**, comprobado en la ruta **y otra
  vez** en cada método del controlador. Se protegen por separado a propósito: una
  ruta que se reordene o se copie a otro archivo perdería la guardia sin que nada
  avise. La configuración gobierna piezas que salen firmadas por clubes de todo
  el ecosistema; no es contenido de un sitio.
- **UN FALLO SE DICE CON SU CAUSA**: 401 se corrige volviendo a entrar, 403
  pidiendo el permiso y 502 mirando el proveedor. «No se pudo guardar» a secas
  obliga a diagnosticar a ciegas (v4.859).

### El español es contenido Unicode de primera clase (v4.1063)

Reporte con dos capturas: el formulario con «Bogotá Chapinero» escrito con su
tilde y la pieza generada diciendo «Club Rotario **Bogota** Chapinero».

| Pieza | Qué es |
|---|---|
| `server/lib/spanishText.js` | El CRITERIO compartido. **Puro**: `nfc`, `cleanVisible`, `foldForCompare`, `hasDiacritics`, `diacriticWords`, `spellOut`, `sameButForDiacritics`, `diacriticDiff` |
| `SPELLING_SYSTEM` · `judgeSpelling` · `spellingRetryClause` (`anniversarySpec.js`) | La puerta ortográfica: qué se pregunta y qué se decide |
| `readDrawnClubName` (`anniversaryEngine.js`) | La lectura de visión sobre el lienzo entregado |
| `checkGivenNameSpelling` | Lo mismo para el texto que ESCRIBE la IA (copy y saludo) |
| La regla 6 de `institutionalVoice.js` | La ortografía, para los NUEVE módulos del Estudio |

Pruebas: el grupo «OR» de `npm run test:anniversary` (334 casos; 19 nombres
reales, el caso reportado de punta a punta y las guardas del falso positivo).
Verificadas a la inversa por tres puntas: simplificando `printableClubName`,
quitando la guarda de `sameButForDiacritics` y usando el plegado en el
compositor.

- **⚠️ NINGUNA CAPA DE LA PLATAFORMA PIERDE UNA TILDE, Y ESO SE MIDIÓ ANTES DE
  TOCAR NADA.** Lo guardado, `printableClubName`, `applyMasterVariables`, el
  JSON de la petición y el compositor conservan el nombre letra por letra:
  simulado el caso reportado, el prompt que sale lleva `Club Rotario Bogotá
  Chapinero` y `!/Bogota\b/.test(prompt)`. **Lo que falla es el ROTULADO del
  modelo de imagen** — consecuencia directa de v4.907, que invirtió la regla
  fundacional del módulo («los modelos generativos no escriben texto de forma
  fiable… el nombre y los años son exactos POR CONSTRUCCIÓN») y le devolvió el
  texto al modelo. **Al reportarse «se perdió un carácter», recorrer el
  pipeline antes de escribir un corrector**: acá no había nada que corregir.
- **⚠️ NO SE ADIVINA NINGUNA TILDE, Y LA GUARDA ES `sameButForDiacritics`.** La
  puerta sólo actúa cuando las dos escrituras son la MISMA palabra salvo por
  las marcas: un nombre distinto, una lectura dudosa o un club sin diacríticos
  no la disparan jamás. Por construcción no puede inventar un acento donde no
  lo había — que es lo que el pedido prohibía expresamente. Es además lo que
  evita la generación pagada de más: la lección del falso positivo de v4.906,
  donde los rótulos de unas cajas de donación descalificaron una pieza buena.
- **⚠️ LA CLÁUSULA ORTOGRÁFICA NO ENTRA EN EL PROMPT BASE, Y ESO ESTÁ
  MEDIDO.** El prompt por defecto mide **2.500** caracteres y el peor caso
  **2.518** contra el tope de 2.500 que declara KIE: ya se recorta, y el
  recorte cae sobre la cláusula del pie, que es la estructural. Una frase más
  ahí no se suma, DESPLAZA. Viaja sólo en `extraClause`, o sea en el reintento.
  Lo fija una prueba. **Al agregar una frase al prompt de este módulo, medir
  primero.**
- **EL REINTENTO DELETREA EL NOMBRE** (`spellOut`: «B-o-g-o-t-á») y nombra las
  MAYÚSCULAS acentuadas. Pedirle «escribilo bien» a un modelo que acaba de
  escribirlo mal no corrige nada — es la regla de `templateComposer.js`: se le
  devuelve la regla CONCRETA, acá carácter por carácter.
- **UN SOLO REINTENTO, COMPARTIDO CON LAS OTRAS PUERTAS** (`styleRetried`). El
  patrón visual, la banda del pie y la ortografía se juzgan juntos y sus
  cláusulas se concatenan: con un reintento por puerta, una pieza con dos
  defectos costaría tres generaciones.
- **AGOTADO EL REINTENTO, LA PIEZA SE ENTREGA CON SU AVISO**, que NOMBRA la
  palabra y su forma correcta. Es la postura de v4.910: se entrega igual,
  nunca en silencio y nunca al modo plano.
- **LA PUERTA NO CUELGA DE `styleGuard`.** Ese interruptor gobierna la
  identidad visual; la ortografía de un nombre propio no es una preferencia
  estética de la que un sitio pueda salirse.
- **⚠️ `foldForCompare` SÓLO COMPARA. Su salida no se muestra, no se guarda y
  no viaja a ningún modelo.** Es la única función del repositorio que quita
  diacríticos a propósito, y por eso lleva ese nombre y esa advertencia. La
  regla del sitio es que `removeAccents`/`deburr`/`slugify` no tocan texto
  visible: valen para slugs, identificadores y búsqueda normalizada — como el
  `norm` de `publicClubs.js`, que encuentra «Bogotá» escribiendo «bogota» y
  **no** decide cómo se imprime (`clubDisplayName` conserva el nombre entero).
- **⚠️ NORMALIZAR UNICODE NO ES QUITAR TILDES: ES COMPONER.** El compositor
  pasa a **NFC** antes de medir y de dibujar (`visible`). En NFD la tilde es un
  carácter aparte, así que un `slice` o un salto de línea puede separar la
  letra de su acento y dejar «Bogota ́» — y eso ocurre de verdad: hay teclados
  y sistemas que entregan el texto descompuesto. `printableClubName` compone
  ANTES de recortar por la misma razón.
- **LA REGLA ORTOGRÁFICA VIVE EN `institutionalVoice.js`, no en nueve
  prompts.** Ahí ya estaba la voz de la plataforma y la consumen el Generador
  de Publicaciones, el Creador de Reels, las Infografías de Campaña, la
  Campaña de Emergencia, las Plantillas IA y el resto. Copiarla a cada módulo
  es cómo la voz se bifurca en silencio (regla de v4.666).
- **EL MODELO ESCRIBE Y EL CÓDIGO DECIDE, también acá.**
  `checkGivenNameSpelling` sólo comprueba que un nombre propio que la
  plataforma LE DIO al modelo vuelva con sus tildes; no juzga la ortografía
  general del copy —eso sería un corrector, y un corrector sobre nombres
  propios inventa—. Va en `validateCopy` y en `validateGreeting`, con sus
  bucles de reintento de siempre.
- **LAS TIPOGRAFÍAS YA CUBRÍAN EL ESPAÑOL** y no se tocaron: los subconjuntos
  `latin` (U+0000–00FF) y `latin-ext` de `designFonts.ts` traen Á É Í Ó Ú, ñ, ü
  y ¡ ¿. El respaldo termina en tipografías del sistema, no en una sin
  acentos. Al agregar una familia, comprobar que declare esos rangos.

### El nombre oficial lo IMPRIME la plataforma, no lo dibuja el modelo (v4.1064)

Segundo reporte sobre lo mismo, con v4.1063 desplegada: «Bogotá Capital», 10
años, y el PNG descargable diciendo «Club Rotario **Bogota** Capital». La
puerta ortográfica de v4.1063 mide y vuelve a pedir; lo que hacía falta era
dejar de pedírselo.

| Pieza | Qué es |
|---|---|
| `STANDARD_LAYOUT` · `LETTER_FREE_BANDS` (`anniversarySpec.js` y su espejo) | El ACUERDO entre el prompt y el compositor: las tres bandas, en fracciones del lienzo |
| `DEFAULT_MASTER_PROMPT` | Pide fondo + fotografía en su marco y **ni una letra**; ya no lleva `{NOMBRE_CLUB}` ni `{ANOS_CLUB}` |
| `drawInstitutionalLayer` · `drawHeadlineBand` · `drawClubBand` · `drawYearsBand` (`anniversaryRender.ts`) | La capa tipográfica determinista |
| `modelLetters` · `judgeLettering` · `LETTERING_RETRY_CLAUSE` | Quién rotula, y la puerta que atrapa al modelo si rotula igual |

Pruebas: `npm run test:anniversary` (414), `test:anniversary:render` (61, en un
navegador que RASTERIZA y mide los píxeles del acento), `test:anniversary:path`
(225) y `test:anniversary:engine` (77). Verificadas a la inversa.

- **⚠️ ESTO SUPERSEDE EL «FLUJO SIMPLE» DE v4.907 PARA EL TEXTO
  INSTITUCIONAL, y hay que leer las dos juntas.** Aquélla fue una decisión
  EXPRESA del cliente con su muestra de ChatGPT delante —«el modelo dibuja
  TODO, incluidos los textos»— y su consecuencia estaba escrita en el propio
  archivo desde v4.895: *«los modelos generativos no escriben texto de forma
  fiable, y cuando sale mal NO HAY SALIDA LIMPIA»*. La v4.907 la aceptó a
  sabiendas; la factura llegó con los nombres propios del español. Lo que
  vuelve es la arquitectura híbrida **sólo para el texto institucional**: el
  modelo sigue componiendo el fondo, la decoración y el marco de la
  fotografía, que es lo que el cliente vio funcionar.
- **⚠️ NINGÚN ARREGLO DE CADENAS PODÍA CORREGIRLO, Y SE DEMOSTRÓ ANTES DE
  TOCAR NADA.** Traza de punta a punta con las funciones de producción: el
  formulario manda «Bogotá Capital»; `findPublicClub` devuelve el club;
  `clubDisplayName` compone «Club Rotario Bogotá Capital»; `printableClubName`
  lo deja con el codepoint `U+00E1`; y el prompt que sale hacia el proveedor
  lo lleva entero (`/Bogota[^á]/` es falso). El acento **nunca se perdió en la
  plataforma**: se perdía al dibujarlo el modelo. **Al reportarse «se pierde
  un carácter», recorrer el pipeline antes de escribir un corrector** — es la
  regla de v4.1063, y acá la respuesta fue que no había nada que corregir.
- **⚠️ `STANDARD_LAYOUT` ES UN ACUERDO, NO UNA CONSTANTE DE DIBUJO.** Las
  mismas fracciones las lee el prompt —para pedir tres bandas horizontales
  limpias— y el compositor —para imprimir ahí—. Escritas dos veces, el modelo
  dejaría libre una franja y la plataforma escribiría en otra: texto sobre
  decoración, sin que nada avise. La paridad de los dos espejos se compara
  banda por banda, y una prueba exige que el prompt declare por palabras el
  rango de cada una. **Al mover una banda, mover el prompt.**
- **LA CINTA DE AÑOS MONTA SOBRE EL BORDE INFERIOR DEL MARCO a propósito** y
  por eso su comprobación de solapamiento es distinta: el saludo y el nombre
  **no pueden** invadir la fotografía; los años **sí**, es el diseño aprobado.
  Una regla única de «nada se toca» habría reprobado la composición correcta.
- **⚠️ `modelLetters(config)` ES EL ÚNICO PUNTO QUE DECIDE QUIÉN ROTULA**, y
  lo decide mirando si el Prompt Maestro **de esa configuración** lleva
  `{NOMBRE_CLUB}`. Un administrador puede editarlo y volver a pedirle al
  modelo que escriba el nombre: entonces el compositor **no** imprime encima
  —`lettered: true` en el DTO— y la puerta que corre es la ortográfica de
  v4.1063, no la anti-rotulado. Son MUTUAMENTE EXCLUYENTES: con las dos
  activas se pagaría doble, y con las dos apagadas no habría ninguna. Lo fija
  una prueba que lee el controlador y el compositor.
- **⚠️ Y SIN ESE PUNTO SE IMPRIMIRÍA DOS VECES.** Es la consecuencia concreta
  de tratarlo como una constante: el modelo dibujando «Club Rotario Bogotá
  Capital» y la plataforma imprimiendo lo mismo encima, desalineado. La
  condición del compositor es `doc.lettered !== true`, aditiva: un DTO
  anterior que no la traiga se comporta como el caso normal.
- **⚠️ LA PUERTA ANTI-ROTULADO YA ESTABA ESCRITA Y LLEVABA DESDE v4.907 SIN
  CABLEAR.** `detectDrawnText` / `DRAWN_TEXT_SYSTEM` se construyeron en v4.905
  para la arquitectura híbrida y quedaron muertos al invertirla: el código era
  válido, las pruebas pasaban y la función no la llamaba nadie. **Al invertir
  una arquitectura, buscar qué guardas se quedan sin consumidor** — el fallo
  no es ruidoso, es una protección que deja de proteger.
- **`judgeLettering` NO descalifica lo que no puede juzgar.** Sin certeza
  (`confident: false`) no decide, y el texto DENTRO de la fotografía es
  legítimo (`insidePhoto`) — una foto de una donación trae rótulos en las
  cajas, y descalificarla es el falso positivo que ya costó dos generaciones
  en v4.906. Comparte el ÚNICO reintento pago con el patrón visual, la banda
  del pie y la ortografía (`styleRetried`): cuatro puertas y una sola
  regeneración.
- **⚠️ LA PRUEBA DEL COMPOSITOR DIBUJA DE VERDAD, letra por letra.** Un
  contexto 2D falso captura cada `fillText` y se compara con **igualdad
  Unicode real** contra escapes explícitos (`'BOGOT\u00c1 CAPITAL'`,
  `'MEDELL\u00cdN'`, `'MU\u00d1OZ'`, `'PING\u00dcINO'`…), con su
  contra-afirmación de que la forma SIN tilde no aparece. Ninguna comparación
  del módulo pliega diacríticos: eso sería dar por bueno justo el defecto.
- **⚠️ CONTAR PÍXELES DE TINTA NO ES UN INVARIANTE SANO.** La prueba de
  navegador intentó «la versión con tilde tiene más tinta» y falló con 7806
  contra 7818: el reparto en dos tonos corre el texto medio píxel y el
  antialias cambia la cuenta. Lo que sí es cierto es que **Á sube por encima
  de la altura de mayúscula**, así que se compara la primera FILA con tinta.
  Al medir una diferencia tipográfica, buscar la propiedad geométrica, no la
  cantidad.
- **NO SE TOCÓ NADA DE LO QUE FUNCIONABA**: el selector de clubes, el campo de
  años, la fotografía, la Biblioteca, los botones, la descarga, regenerar, el
  mensaje para compartir, las dimensiones ni el pie institucional. La
  comprobación que lo autoriza es que las 77 del motor y las del camino siguen
  en verde, y que el aspecto se verificó sobre tres PNG reales.
- **EL MENSAJE PARA COMPARTIR YA ESTABA CUBIERTO por v4.1063** y se le sumó su
  prueba: el modelo escribe el cuerpo, `validateGreeting` lo RECHAZA si
  simplifica el nombre oficial (`checkGivenNameSpelling`) y la firma la compone
  el código (`composeGreeting`). Ahí el nombre no se dibuja: se interpola del
  dato guardado.

**Qué se REUTILIZA de la plataforma** (servicios globales, no el editor):
`kieService` (el ÚNICO cliente de KIE del sitio), `copywritingService.generateCopy`
(la cadena de proveedores de texto y visión, con su respaldo entre proveedores),
`designGuard.checkPreservation` (personas inventadas / desaparecidas / rostros),
`designBranding` (club → identidad institucional real), `publicClubs` (el mismo
catálogo curado que la Feria), `mediaUpload` (las dos vías de toda casilla de
imagen), `designFonts` (el cargador de las tipografías empaquetadas — es un
servicio global con UN registro de caras en `document.fonts`; un segundo cargador
registraría las mismas dos veces), el proxy de imágenes y `useSEO`.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `KIE_API_KEY` | La misma credencial que ya usa el resto del sitio. Sin ella el módulo no compone nada, y el panel lo dice |
| `ANNIVERSARY_MODEL` | Id del modelo de imagen (default `google/nano-banana-edit`). KIE renombra ids: se corrige sin desplegar |
| `ANNIVERSARY_PROMPT_MAX_CHARS` | Tope del prompt de escena (2500) |

**Limitaciones reales, dichas para no descubrirlas después:**

- **El texto dibujado por el modelo SÍ se comprueba desde v4.905**
  (`detectDrawnText`), superando la limitación declarada en v4.895. No es OCR
  —ni un MB de más—: es una pregunta al modelo de visión sobre el lienzo CRUDO,
  la misma técnica del control de texto de Reels. Sólo `found && confident`
  descalifica (el ruido de una lectura única, v4.795); sin certeza se entrega
  con nota. Lo que sigue sin comprobarse es la ESTÉTICA del rotulado ausente:
  el verificador puede titubear, y quien genera ve la pieza antes de bajarla.
- **No hay detección de rostros propia.** `checkPreservation` pregunta por
  personas inventadas, desaparecidas y consistencia de rostros usando un modelo
  de visión; no hay un detector que devuelva coordenadas. Que el texto no caiga
  sobre una cara se consigue reservando la franja, no localizando las caras.
- **Con más de ocho personas el recuento no decide solo** (herencia de
  `designGuard`): contar catorce cabezas no lo hace bien ningún modelo de visión.
- **El formulario público no tiene freno de abuso por IP.** La subida está
  acotada en tamaño y el generador vive detrás de un interruptor, pero con un
  enlace muy difundido conviene ponerlo antes que después. Es la misma
  limitación declarada del portal de Plantillas IA.
- **Sólo el formato 1:1 está disponible.** 4:5 y 9:16 están declarados con
  `available:false`: la arquitectura los soporta —todo son fracciones— pero la
  geometría de las zonas de texto está medida para el cuadrado.
- **La configuración es de la PLATAFORMA, no por sitio.** La columna `clubId`
  existe y hoy no se escribe ninguna fila con ella.
- **No se sugiere el número de años desde la fecha de fundación.** El dato existe
  (`Setting club_foundation_date`) pero sólo para los clubes que son sitios de la
  plataforma y lo tengan cargado; ofrecerlo cuando casi nunca está haría un campo
  que parece roto. El usuario escribe los años, que es un dato que sabe.
- **Un aniversario generado no se guarda en la Biblioteca Multimedia.** Se
  descarga. La fila de `AnniversaryPiece` es la traza, no el archivo publicado.

### La plantilla aprobada es DETERMINISTA: la geometría también sale del modelo (v4.1065)

Reporte con dos capturas: la pieza aprobada —Club Rotario Neiva, 48 años— y la
generada después de v4.1064, donde «CLUB ROTARIO BOGOTÁ CENTENARIO» salió
impreso **encima de la fotografía**. El pedido: restaurar exactamente esa
composición conservando la corrección de las tildes, y que la IA no decida
dónde va nada.

| Pieza | Qué es |
|---|---|
| `STANDARD_LAYOUT` · `PHOTO_FRAME` (`anniversarySpec.js` y su espejo) | El ACUERDO, calibrado contra la referencia aprobada. Cuatro bandas y la geometría del marco |
| `modelPlacesPhoto` · `{MARCO_FOTO}` · `photoHoleClause` | Quién coloca la fotografía. UN punto de decisión, hermano de `modelLetters` |
| `photoFrameBox` · `drawPhotoFrame` (`anniversaryRender.ts`) | La geometría derivada y el marco con su halo, su sombra y su filete |
| `drawReservedWash` · `WASH_FADE` | La zona reservada, garantizada por el compositor |
| `framed` en el DTO · `framed: !modelPlacesPhoto(config)` | El veredicto, resuelto en el servidor |

Pruebas: `npm run test:anniversary` (426 casos) y
`npm run test:anniversary:render` (87 en un navegador, con las dos generaciones
de regresión que el pedido exige y un fondo hostil). Verificadas a la inversa.

- **⚠️ LA REGRESIÓN NO ESTABA EN LAS TILDES NI EN EL COMPOSITOR DE TEXTO: v4.1064
  LE DELEGÓ LA GEOMETRÍA AL MODELO.** Su `DEFAULT_MASTER_PROMPT` pedía tres
  franjas limpias en porcentajes exactos y la fotografía «arriba del 40 % y
  abajo del 68 %» mientras el compositor imprimía en coordenadas fijas. **Un
  modelo generativo no cumple una geometría pedida en palabras**: medido sobre
  la captura del reporte, puso la fotografía arrancando cerca del 29 % del alto,
  la banda del nombre cayó DENTRO de ella y el nombre se imprimió encima. No
  falló ruidosamente — entregó otra composición. Es la misma lección que el
  marco de la foto en el Generador de Outros (v4.923): **la geometría se IMPONE
  en la entrada, no se pide**.
- **⚠️ Y `STANDARD_LAYOUT` NUNCA SE HABÍA CALIBRADO contra la referencia
  aprobada.** Se escribió en v4.1064 con números razonables y jamás se comparó
  con la pieza que el cliente aprobó. Al declarar un acuerdo de geometría,
  medirlo contra la pieza real — si no, es una hipótesis con forma de tabla.
- **⚠️ LA FOTOGRAFÍA LA COLOCA EL COMPOSITOR, y ése es el arreglo.** El prompt
  pide **SOLO EL FONDO** —decoración en los márgenes y el centro limpio— y el
  compositor dibuja el marco y encuadra la foto dentro con `cover`. Así el
  tamaño original de la foto no puede alterar la estructura de la pieza, que es
  el requisito literal del pedido.
- **⚠️ `modelPlacesPhoto` ES EL ÚNICO PUNTO QUE DECIDE QUIÉN COLOCA LA FOTO**, y
  es el hermano de `modelLetters`: mira si el Prompt Maestro **de esa
  configuración** lleva `{MARCO_FOTO}`. Con los dos activos la fotografía
  saldría DOS veces —dentro del fondo y otra vez en el marco—; con ninguno, no
  saldría. Es **ADITIVO**: un prompt editado que no lleve el token se comporta
  como antes de v4.1065, y una prueba lo fija en los dos sentidos.
- **EL ALTO DEL MARCO SE DERIVA, no se declara.** Sale de la proporción interior
  (16:9, la misma a la que se estandariza la foto) más el margen blanco:
  declararlo aparte permitiría mover el ancho y dejar un marco que ya no es 16:9
  — y entonces la foto saldría deformada o con franjas. Si el alto derivado no
  entra en su banda, el marco se reduce ENTERO y se centra; nunca se recorta la
  banda ni se deforma la proporción.
- **EL HALO BLANCO DEL MARCO NO ES DECORACIÓN**: tapa con un desvanecido
  cualquier resto que el modelo haya dibujado en el hueco a pesar de habérselo
  pedido limpio. Sin él, un marco fantasma del modelo asomaría por detrás del
  nuestro.
- **⚠️ Y LA ZONA RESERVADA LA GARANTIZA EL COMPOSITOR, NO EL PROMPT**
  (`drawReservedWash`). Un pedido en palabras no obliga a nada, y el defecto
  reportado fue justamente el modelo ocupando el centro: el velo es un
  rectángulo pleno por dentro que **se desvanece hacia AFUERA**, así que no
  tiene ningún borde visible. Con un fondo correcto —blanco liso ahí— **no
  cambia ni un píxel** y lo fija una prueba; cuando el modelo desobedece, el
  saludo, el nombre y la cifra se siguen leyendo. Un rectángulo blanco con borde
  se vería PEGADO, que es lo que el equipo rechazó dos veces (v4.323-v4.324).
- **EL ÁREA DEL VELO ES LA UNIÓN DE LAS BANDAS Y NO SE AGRANDA «POR SI ACASO»**:
  cada punto que se le sume se le resta a los globos, que son lo que hace que la
  pieza se vea de aniversario. Lo comprueba la prueba de fondo hostil midiendo
  que el fondo del modelo SOBREVIVA en las esquinas y en los márgenes.
- **EL VELO SÓLO ACTÚA EN LA CONFIGURACIÓN VIGENTE** (`framed === true &&
  lettered !== true`). Con un prompt editado en el que el modelo rotula o dibuja
  la fotografía, lavar el centro le borraría su propio trabajo.
- **LA CIFRA DE AÑOS LLEVA CONTORNO BLANCO** porque monta a propósito sobre el
  borde inferior del marco —es el diseño aprobado— y sobre una foto oscura el
  dorado no se leería. Por lo mismo se dibuja DESPUÉS del marco: al revés, el
  marco la taparía.
- **UN NOMBRE LARGO SE ACHICA DENTRO DE SU BANDA Y, SI NO ENTRA, SE PARTE EN DOS
  LÍNEAS** — nunca se mueve, nunca invade la fotografía, nunca desplaza nada. En
  dos líneas se queda entero en azul: partir el color por el salto de línea se
  lee como un error.
- **⚠️ LA REGRESIÓN SE MIDE, NO SE MIRA.** La prueba de navegador genera las DOS
  piezas que el pedido exige —Neiva 48 y Bogotá Centenario 10— y comprueba que
  **la CAPA FIJA sea idéntica píxel a píxel** fuera de las dos bandas de datos
  variables, que el marco caiga en el MISMO sitio en las dos, que no haya **ni un
  píxel de fotografía** en la banda del nombre y que la tilde de «BOGOTÁ» llegue
  al lienzo. «Se ve bien» no lo mide una prueba; esto sí.
- **LAS BANDAS DE LA PRUEBA SE LEEN DE LA FUENTE DE VERDAD**, no se escriben a
  mano: con las coordenadas copiadas, mover una banda dejaría la prueba midiendo
  el sitio anterior y pasando en verde.
- **NO SE TOCÓ NADA DEL ROTULADO DE v4.1063-v4.1064**: el nombre y la cifra los
  sigue imprimiendo la plataforma con tipografía real, en NFC, exactos por
  construcción. Lo que cambió es quién decide DÓNDE va cada cosa.
- **⚠️ UNA COMPROBACIÓN FIJADA AL TEXTO DEL PROMPT SE ROMPE AL REESCRIBIRLO.**
  Ocho de `test:anniversary` exigían frases literales del
  `DEFAULT_MASTER_PROMPT` de v4.1064 y fallaron con el criterio intacto y MÁS
  estricto. Se reescribieron sobre la INVARIANTE — la lección de v4.984, pagada
  otra vez en este mismo módulo.
- **EL DEFAULT ANTERIOR SE ARCHIVÓ EN `LEGACY_MASTER_PROMPTS`**, para que el
  upgrade perezoso de `normalizeConfig` alcance a la configuración que lo tenga
  guardado sin editar. Un prompt EDITADO no se toca jamás.

**Pendiente conocido:** el motor sigue mandando la fotografía del club como
PRIMERA imagen al modelo (`imageUrls = [photoUrl, referencia?.url]`, v4.909), y
los modelos de edición toman la primera como BASE. Con el prompt vigente —que
declara las dos imágenes como CONTEXTO y prohíbe dibujar la fotografía— eso es
coherente pero no está verificado contra el proveedor: desde este entorno no hay
credencial de KIE. Lo que protege la pieza mientras tanto son el halo del marco
y el velo de la zona reservada, que actúan sea cual sea el fondo que vuelva. **No
cambiar el orden sin medirlo contra el modelo real**: v4.909 documenta que con la
referencia primera la salida era la referencia editada, con su foto y sus textos.

### El ajuste fino de proporciones sobre esa misma plantilla (v4.1066)

Pedido con la pieza de «Club Rotario Bogotá Chicó, 10 años» delante y con estas
palabras: *«La funcionalidad ya está avanzando correctamente y NO quiero
reconstruir la plantilla desde cero … es un ajuste quirúrgico de proporciones,
espaciados y jerarquía sobre la plantilla actual»*. No hay arquitectura nueva:
`STANDARD_LAYOUT`, `PHOTO_FRAME`, `modelLetters`, `modelPlacesPhoto` y el velo
de la zona reservada son los de v4.1065 y no se tocaron. Lo que cambia son los
números, y **por qué** cambia cada uno.

Pruebas: `npm run test:anniversary` (427) y `npm run test:anniversary:render`
(113, en un navegador que RASTERIZA y mide píxeles). Verificadas a la inversa.

- **⚠️ EL SALUDO DEJA DE LLEVAR SIGNOS, y eso SUPERSEDE la regla de v4.1063**
  que exigía conservarlos. `HEADLINE_TEXT = 'Feliz aniversario'`. El motivo
  técnico, además del pedido: `headlineLines` parte por PALABRAS, así que el
  `¡` y el `!` se arrastraban a renglones distintos y el de apertura
  descentraba ópticamente la línea corta. Y `flat()` —que compara si el titular
  de la IA repite el saludo fijo— pasó a plegar también la puntuación: sin eso,
  un titular «¡Feliz aniversario!» dejaría de reconocerse y se imprimiría DOS
  veces. Lo fija una prueba sobre el CÓDIGO, no sobre el archivo: los
  comentarios siguen citando la forma anterior.
- **⚠️ EL SALUDO Y EL NOMBRE CRECEN SIN MOVER SU BANDA, y ése es todo el
  truco.** Las bandas están en un acuerdo con el prompt: ensancharlas obliga al
  modelo a despejar más lienzo y le quita sitio a los globos. El saludo gana
  ~10 % recortando `HEADLINE_RULE_GAP` (0,55 → 0,34) —ese hueco sólo sostiene
  un filete de 2 px— y el nombre ~45 % subiendo `base` de `bh*0.52` a `bh*0.74`:
  su banda estaba ocupada al 61 %. La fotografía no paga nada por ninguno de
  los dos.
- **⚠️ `PHOTO_FRAME.mat` ES LA PALANCA DE «FOTO MÁS GRANDE A HUELLA
  CONSTANTE».** Bajarlo de 0,038 a 0,026 da **+11 % de área de imagen** sin
  empujar nada hacia abajo: lo que se recorta es el passepartout, que sobrevive
  en ~16 px sobre un lienzo de 1080. El alto del marco se sigue DERIVANDO del
  ancho (`outerH = Wp × [(1−2·mat)/ratio + 2·mat]`): no se declara, para que no
  pueda quedar incoherente. Antes de tocar el ancho de la banda, mirar acá.
- **⚠️ «FOTO CONSIDERABLEMENTE MÁS GRANDE» Y «SEPARACIÓN CLARA ENTRE LA FOTO Y
  EL NÚMERO» SON INCOMPATIBLES EN 1:1, y está medido.** La curva dorada arranca
  en ≈0,784 y el pie es intocable (regla de v4.1065). Despejar el solape de la
  cinta cuesta ≈0,046 de alto contra ≈0,021 de holgura recuperable: la
  fotografía tendría que caer a ~0,52 de ancho de banda —**−14 % de ancho, −24 %
  de área**—. Cambiar la proporción del marco tampoco alcanza: a 2:1 el interior
  máximo da 0,1381 y a 21:9 da 0,1538, los dos POR DEBAJO del 0,1672 de
  entonces, y además recortan más una foto de grupo. Se eligió la fotografía: el
  bloque de años baja lo que la curva permite (0,636 → 0,646, con su margen a la
  curva subiendo de 0,0288 a 0,0298) y **la cinta sigue montando sobre el borde
  inferior del marco**, como en la pieza aprobada. **Esto MATIZA la regla de
  v4.1065** —que declaraba ese montaje deliberado— sin invertirla: sigue siendo
  el diseño, y ahora se sabe que además es el único que cabe.
- **⚠️ EL NOMBRE DEL CLUB SE CENTRA POR SU TINTA, NO POR SU CAJA EM, y esto lo
  destapó la prueba de navegador.** El acento de una **Á o una Ó MAYÚSCULA se
  dibuja POR ENCIMA del borde superior de la caja em**, así que con el centrado
  nominal la tinta DORADA de «TULUÁ» caía una fila por encima de la banda. La
  salida no podía ser achicar el cuerpo ni mover la banda —el pedido lo prohíbe
  con esas palabras («No vuelvas a resolver las tildes modificando el
  layout»)—: se le pregunta al navegador dónde empieza y dónde termina la tinta
  (`actualBoundingBoxAscent` / `Descent`) y se centra ESA caja, con el centrado
  de siempre como respaldo si el navegador no expone las métricas. **Al subir el
  cuerpo de un texto con mayúsculas acentuadas, medir la tinta, no la caja.**
- **⚠️ Y ESE PÍXEL NO LO VE UN UMBRAL DE OSCURIDAD.** El acento sale en DORADO y
  su borde antialiasado da una luminancia de ~205: la comprobación buscaba
  «tinta oscura» (< 200) y **pasaba en verde con el defecto delante**. Se busca
  cualquier píxel que NO SEA BLANCO. Verificado a la inversa: reintroduciendo el
  centrado por caja em fallan tres comprobaciones.
- **LA VENTANA DE ESA MEDICIÓN NO PUEDE SOLAPAR LAS BANDAS VECINAS.** El primer
  intento medía ±0,02 alrededor de la banda y atrapaba el filete dorado del
  saludo y la sombra del marco —capa FIJA, presente midiera lo que midiera—, así
  que denunciaba un desborde inexistente. Se mide del final de la banda del
  saludo al final de la del nombre; el borde inferior lo cubren `aire` y la
  comparación píxel a píxel de la capa fija.
- **LOS TRES CASOS DEL PEDIDO SON UNA REGRESIÓN, no un ejemplo** (grupo 5c):
  Bogotá Chicó 10, Tuluá 50 y Tuluá El Lago 60 se rasterizan y se comprueba que
  la CAPA FIJA sea idéntica **píxel a píxel en las tres** fuera de las dos
  bandas variables, que el marco caiga en el mismo sitio, que el nombre no toque
  la fotografía y que las tildes lleguen al lienzo. «Tuluá El Lago» es el nombre
  largo del pedido y es el que obliga al auto-ajuste: ahí es donde un compositor
  mal escrito bajaría la foto para hacerle sitio a un segundo renglón.
- **EL DEFAULT ANTERIOR SE ARCHIVÓ EN `LEGACY_MASTER_PROMPTS`** (el `76 %` pasó
  a `78 %` al bajar el marco): el upgrade perezoso alcanza a la configuración
  que lo tenga guardado SIN editar, y un prompt editado no se toca jamás.
- **NO SE TOCÓ EL PIE INSTITUCIONAL** (ask #6), ni `photoFrameBox`, ni
  `drawPhotoFrame`, ni `drawReservedWash`, ni `drawInstitutionalLayer`, ni el
  orden de `renderAnniversary`, ni `canvasToBlob`/`downloadCanvas` — la vista
  previa sigue siendo el MISMO objeto que se exporta.

### El respiro sobre «FELIZ» se paga con el hueco del subrayado — v4.1067

Pedido con la pieza delante: «FELIZ» quedaba pegado al borde superior de la
forma blanca redondeada del fondo. Ajuste puntual sobre la MISMA plantilla:
nada más se movió.

- **⚠️ NO HABÍA NINGÚN AIRE QUE REPARTIR, Y ÉSE ERA EL DIAGNÓSTICO.** El bloque
  del saludo LLENA su banda EXACTA por construcción: el cuerpo sale de
  `alto = bh / (TOP_RATIO·1,04 + 1,04 + RULE_GAP)`, así que `totalH === bh` y el
  centrado vertical (`(bh − totalH)/2`) vale CERO. «FELIZ» arrancaba en `band.y`
  — el borde mismo —, medido en el navegador: primera tinta en y=131 sobre 1080.
  **Al diagnosticar un texto pegado a su borde, comprobar si su bloque deja
  algún hueco antes de buscar el defecto en la banda.**
- **⚠️ EL RESPIRO NO PUEDE SALIR DE MOVER LA BANDA NI DE ACHICAR EL SALUDO.** Lo
  primero lo impide el nombre del club, que empieza 6 px debajo (`club.y`) y no
  se toca; lo segundo lo prohíbe el pedido con esas palabras. Sale del hueco que
  separa «ANIVERSARIO» de su filete dorado, que sólo contiene una línea de 2 px:
  `HEADLINE_PAD_TOP` se le resta a `HEADLINE_RULE_GAP`.
- **⚠️ LA SUMA ES LA INVARIANTE, Y POR ESO EL HUECO SE DERIVA**
  (`HEADLINE_BAND_GAP = HEADLINE_RULE_GAP − HEADLINE_PAD_TOP`). Mientras esa
  resta se mantenga, el denominador del cuerpo no cambia y «FELIZ ANIVERSARIO»
  sale del MISMO tamaño al último decimal — medido en un navegador: la tinta de
  «ANIVERSARIO» mide **544 px antes y después**. Con dos constantes sueltas,
  tocar una encogería el saludo **sin que nada avisara**: la pieza sale igual de
  bien formada, sólo que con otra jerarquía. Tres comprobaciones fijan la forma
  que lo garantiza, verificadas a la inversa por las dos puntas.
- **EL RESPIRO SE SUMA DESPUÉS DEL CENTRADO, no desplazando la banda.**
  `STANDARD_LAYOUT.headline` no cambia ni un punto, y con él no cambia
  `drawReservedWash` — que DERIVA su rectángulo de las bandas (v4.1065): mover
  `headline.y` habría movido el velo de la zona reservada, o sea la geometría
  que el prompt y el compositor comparten.
- **`HEADLINE_RULE_GAP` SIGUE SIENDO EL DEL CAMINO HEREDADO.** Lo consumen
  también `measure` y el dibujo genérico de la pila de bloques (el modo `plain`,
  donde no hay forma blanca ni banda fija): el respiro se declara aparte y sólo
  lo lee `drawHeadlineBand`, que es la plantilla maestra. Cambiar la constante
  compartida habría movido el subrayado de una composición que nadie reportó.
- **EL FILETE ACOMPAÑA AL TÍTULO Y QUEDA ALGO MÁS CERCA DE ÉL**, que es su
  lectura correcta: pertenece al saludo, no al nombre del club. Medido: la tinta
  del filete baja de y=277 a y=283 y su distancia al nombre pasa de 21,8 a
  16,2 px — holgada, y sigue estando más cerca del título.
- **LO QUE GANA LA PIEZA, MEDIDO EN EL NAVEGADOR**: la primera tinta de «FELIZ»
  pasa de y=131 a y=142 sobre 1080 — **+11 px**, alrededor de un 45 % más de
  espacio libre contra el contenedor blanco—, y la banda sigue en 127..290.
- **NO SE TOCÓ NADA MÁS**: ni el prompt maestro (la forma blanca la sigue
  declarando el modelo con su misma geometría), ni `STANDARD_LAYOUT`, ni
  `PHOTO_FRAME`, ni `drawClubBand`, ni `drawYearsBand`, ni `drawPhotoFrame`, ni
  el pie institucional. Lo fijan las 113 comprobaciones de navegador de v4.1066,
  que siguen en verde — incluida la regresión de los tres clubes con la capa
  FIJA idéntica píxel a píxel.

### El motor de imagen: multimodelo sobre KIE, con benchmark (v4.897; segundo proveedor OpenAI: v4.900)

El módulo deja de tener un modelo escrito en el código y pasa a tener una capa:

    proveedor (KIE) → catálogo de modelos → elegibilidad por capacidades
    → benchmark → recomendado → ACTIVACIÓN EXPLÍCITA → producción → fallback

| Archivo | Qué es |
|---|---|
| `server/lib/anniversaryEngineSpec.js` | El CRITERIO del motor. **Puro**: catálogo, capacidades, elegibilidad, pesos, puntuación, recomendación, clasificación del fallo y sello de auditoría |
| `server/lib/anniversaryModels.js` | La I/O del motor y del benchmark |
| `src/components/admin/anniversaries/EnginePanel.tsx` | Las dos tarjetas: «Motor de imagen» y «Modelos IA — benchmark» |

Pruebas: `npm run test:anniversary:engine` (67 casos de criterio) más los
grupos 16-20 de `test:anniversary:path` (el camino real: despacho con modelo
configurable, sello, fallback y benchmark de punta a punta).

**Reglas durables:**

- **⚠️ NADA CAMBIA EL MODELO DE PRODUCCIÓN EN SILENCIO.** Un benchmark
  RECOMIENDA; una persona ACTIVA. `resolveProduction` sólo lee lo activado,
  jamás lo recomendado, y la activación guarda de qué corrida salió, cuándo y
  quién. Es el requisito 20 y lo comprueba la prueba del camino capturando el
  activo **antes** de correr el benchmark — la primera versión lo leía
  DESPUÉS y un cambio automático durante la corrida caía fuera de la ventana:
  la aserción pasaba por el motivo equivocado. **Al comprobar que algo NO
  cambió, capturar el estado antes del primer acto que podría cambiarlo.**
- **⚠️ EL FALLBACK ES DE INFRAESTRUCTURA, NUNCA ESTÉTICO.** Timeout, 5xx,
  límite del proveedor o un modelo retirado disparan el respaldo
  (`classifyProviderError`); una composición fea NO — de eso se ocupa la
  validación de calidad con su reintento, **en el mismo modelo**. Confundirlos
  haría que cada pieza mediocre gastara créditos en dos modelos. Lo comprueban
  las dos pruebas, verificado a la inversa.
- **⚠️ HAY DOS PROVEEDORES Y EL PROVEEDOR ES DEL MODELO** (v4.900,
  `PROVIDERS` + `providerOf`): KIE (asíncrono, multimodelo) y OpenAI con
  **GPT Image (`gpt-image-1`) — el mismo motor de ChatGPT**, directo contra
  OpenAI con la credencial que ya usa el Generador de Publicaciones. El
  adaptador es SÍNCRONO: la generación ocurre en la misma llamada (~20-60 s,
  dentro de los 300 s de `vercel.json`) y el marcador `sync:<url>` hace que el
  primer sondeo la encuentre lista — TODO el camino de después (medición,
  validación, reintento, fallback, benchmark) es el mismo que con KIE. La
  credencial que se comprueba y se nombra en el error es LA DEL PROVEEDOR DEL
  MODELO ACTIVO; el sello de auditoría dice el proveedor real. Un candidato
  agregado a mano sigue siendo SIEMPRE de KIE (su id es de esa pasarela); un
  proveedor nuevo entra por el catálogo declarado, con su adaptador. GPT Image
  no recibe `negative_prompt` ni proporción por parámetro (la pieza 1:1 sale
  1024×1024 — el compositor dibuja por fracciones y no le importa).
- **⚠️ EL PRESUPUESTO DEL PROMPT ES POR MODELO** (`capabilities.promptMaxChars`,
  v4.900). GPT Image admite prompts largos, así que el Prompt Maestro y el
  análisis de la referencia le llegan ENTEROS; a KIE (2.500) se le recorta con
  el orden declarado: ambiente → cláusula de la referencia → recortar el
  maestro. La cláusula de la referencia cae ANTES que el maestro porque la
  referencia además viaja como imagen — su descripción es refuerzo; el maestro
  no tiene segunda vía.
- **⚠️ LA REFERENCIA VISUAL SE ANALIZA UNA VEZ, AL GUARDARLA** (v4.900,
  `analyzeReference` en `putConfig`, cacheado en `references[].analysis`). La
  referencia ya viajaba al modelo COMO IMAGEN; el análisis agrega la otra
  mitad: describirla EN PALABRAS dentro del prompt (`referenceClauseFor`),
  que es la palanca más fuerte — ningún proveedor expone «fuerza de estilo»
  por parámetro. El modelo de visión DESCRIBE (JSON acotado campo por campo,
  `readReferenceAnalysis`) y el código ensambla la cláusula: misma regla que
  el Design DNA. Un análisis que falla DEGRADA (la referencia sigue viajando
  como imagen, sin cláusula); analizar por generación costaría una llamada de
  visión por pieza para saber siempre lo mismo. `normalizeReference`
  RECONSTRUYE la referencia: `analysis` está enumerado ahí, o se perdería al
  guardar (la lección de `normalizeNode`).
- **⚠️ EL CATÁLOGO ES DECLARADO, Y HAY QUE DECIRLO.** KIE **no expone** en esta
  integración ningún endpoint que liste modelos ni sus capacidades: lo que hay
  es `jobs/createTask` con un id. Así que las capacidades se declaran —desde la
  documentación del proveedor y lo medido en este repositorio— y un modelo
  nuevo se agrega como CANDIDATO desde el panel. **Afirmar «detección
  automática de modelos nuevos» sería fingir una integración que no existe.**
  Los ids se corrigen por entorno porque KIE los renombra.
- **UN MODELO QUE NO PUEDE RESPETAR LA FOTOGRAFÍA NO ENTRA**, por atractivas
  que sean sus imágenes (`eligibility`): imagen-a-imagen, al menos una imagen
  de referencia y resolución suficiente son OBLIGATORIAS y bloquean. Lo demás
  —una sola referencia, sin prompt negativo, sin extensión generativa— AVISA:
  el modelo sirve y quien lo activa tiene que saber qué pierde.
- **⚠️ UN MODELO SIN `negative_prompt` DECLARADO NO LO RECIBE.** KIE valida el
  `input` contra el esquema de CADA modelo y los campos que no declara rompen
  la tarea — es lo que tumbó el Generador de Outros en v4.645. Sus
  restricciones viajan sólo dentro del positivo, y la elegibilidad ya lo avisó.
- **NO SE MANDAN `guidance`, `strength` NI `seed`**, y no es una omisión: los
  modelos de edición de esta pasarela exponen `{ prompt, image_urls,
  negative_prompt?, image_size, output_format }` y nada más. Cualquier plan que
  dependa de «bajar la creatividad» por parámetro no es implementable con este
  proveedor — la misma lección que Kling en el Creador de Reels. Los parámetros
  por modelo que SÍ existen son los nuestros: timeout, reintentos y créditos.
- **EL BENCHMARK CORRE POR LA MISMA CADENA QUE PRODUCCIÓN**: mismo
  `startComposition`, mismo prompt del borrador, y las notas salen de **las
  mismas mediciones** que juzgan una pieza real (`verifyComposition`). Un
  benchmark con su propio pipeline no compararía nada. Y cada fotografía se
  ingiere y se analiza UNA vez: el análisis compartido es lo que garantiza que
  todos los modelos reciban exactamente el mismo prompt.
- **⚠️ «CUÁNTOS PROMPTS DISTINTOS HAY» NO COMPRUEBA ESO.** Con dos fotografías
  iguales, un solo prompt distinto es el resultado correcto y la aserción
  pasaba por el motivo equivocado. Lo que se comprueba es que **cada modelo
  recibió el mismo juego de prompts**.
- **EL SCORE SE CALCULA SOBRE LO MEDIDO, RENORMALIZANDO LOS PESOS**, y lo no
  medido **se nombra**. Promediar los nulos como ceros hundiría a un modelo por
  lo que nadie pudo mirar; ignorarlos sin renormalizar inflaría al que menos se
  midió. Un cero es una afirmación; un hueco es la verdad.
- **LO QUE NINGUNA MÁQUINA MIDE SÓLO PUNTÚA CON VOTOS.** Integración de la
  fotografía y calidad compositiva quedan declaradas «sin medir» hasta que
  alguien vote 👍👎⭐. El voto **no pisa** la fidelidad cuando el modelo de
  visión sí contestó: completa, no sustituye.
- **MÁS FALLOS QUE ÉXITOS DESCALIFICA POR INESTABLE**, por alta que sea la
  nota: la estabilidad es un criterio del pedido, no una nota más. Y el
  desempate es el ORDEN DEL CATÁLOGO: dos corridas del mismo benchmark no
  pueden recomendar modelos distintos.
- **FIDELIDAD Y ROSTROS PESAN MÁS QUE COSTO Y VELOCIDAD**, y los pesos son
  configurables. Estamos generando piezas institucionales: un rostro deformado
  invalida la generación por barata que haya salido.
- **UN BENCHMARK DE UN SOLO MODELO NO COMPARA NADA** y se rechaza con su
  motivo, igual que uno sin fotografías.
- **EL SONDEO DEL BENCHMARK TIENE PRESUPUESTO** (4 celdas por pasada). La
  función corta a los 300 s y una corrida de 4×8 no entra en una: lo que no
  entra espera al siguiente sondeo, **no se pierde**. Misma regla que el
  barrido del Creador de Reels.
- **EL CIERRE DE UNA CELDA ES UN UPDATE CONDICIONAL** (`AND status =
  'pending'`): dos sondeos simultáneos pueden mirar la misma tarea, pero sólo
  uno la cierra. Es la forma de `ingestScene`.
- **CADA PIEZA GUARDA SU SELLO DE AUDITORÍA** (`engine`): proveedor, modelo,
  versión de prompt, versión de preset, si se usó el respaldo y la latencia
  REAL medida desde el despacho. Es el requisito 21 — sin él, «¿por qué esta
  pieza de marzo salió así?» no distingue un cambio de modelo de un cambio
  nuestro de prompt. **El preset es POR MODELO**: mezclar parámetros entre
  modelos es mezclar semánticas distintas.
- **LA CONFIGURACIÓN DEL MOTOR VIVE APARTE DE LAS INSTRUCCIONES** (columna
  `engine`, fuera de `draft`/`published`): cambiar el modelo es una decisión
  técnica que aplica en el acto y no reescribe la dirección de arte ni crea una
  versión editorial. La traza no se pierde: viaja en el sello de cada pieza.
- **`ANNIVERSARY_MODEL` GANA SOBRE EL PANEL, Y EL PANEL LO DICE.** Es la salida
  de emergencia sin desplegar cuando KIE retira un id. Sin ese aviso, alguien
  cambia el activo, no pasa nada y no tiene forma de saber por qué.
- **UN ACTIVO QUE DEJÓ DE SER ELEGIBLE DEGRADA AL DEFAULT y lo dice**:
  producción no puede quedarse sin motor porque alguien declaró mal un
  candidato. Y un fallback igual al primario se ignora — reintentar contra lo
  que acaba de fallar no es un respaldo.
- **NADA DE ESTO LLEGA AL FORMULARIO PÚBLICO.** Club, años, fotografía y un
  botón. Lo comprueba una prueba sobre el archivo.

**Variables de entorno del motor:**

| Variable | Para qué |
|---|---|
| `ANNIVERSARY_MODEL` | Fuerza un modelo saltándose el panel. Salida de emergencia cuando KIE retira un id |
| `ANNIVERSARY_MODEL_NANO_BANANA` · `_FLUX_KONTEXT` · `_SEEDREAM` | Corregir el id de un modelo del catálogo sin desplegar |

**Limitaciones reales del motor:**

- **No hay descubrimiento automático de modelos.** KIE no lo permite en esta
  integración; un modelo nuevo se declara a mano y se prueba.
- **Las capacidades de un candidato agregado a mano son DECLARADAS, no
  verificadas.** Lo que las verifica es el benchmark.
- **Los créditos son el medidor PROPIO**, no el saldo de KIE: el proveedor no
  devuelve el costo de una tarea.
- **El benchmark gasta créditos reales**, una celda por modelo × fotografía.
- **No se compara contra un ojo humano ciego**: el voto sabe qué modelo generó
  cada pieza, así que arrastra el sesgo de quien vota.
