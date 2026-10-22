<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

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
