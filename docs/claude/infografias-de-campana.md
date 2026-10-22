<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

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
