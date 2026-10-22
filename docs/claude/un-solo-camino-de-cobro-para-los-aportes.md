<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

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

### Pegar centros desde el Excel del comité (v4.994)

Pedido con la hoja delante: 19 puntos nuevos para «Emergencia Terremoto
Colombia 2026», «tal cual como está estructurado el contenedor» y «si hay
lugares que se repiten, me lo haces saber». Los centros son filas de
`ContributionCenter` —no código—, así que lo que se construyó es la vía para
cargarlos: **«Pegar desde Excel»** en la tarjeta de centros. Criterio puro en
`parseCentersPaste` / `markDuplicateCenters` (`contributionSpec.js`), vista
previa en `POST /:id/centers/preview`, panel `CentersPastePanel` en
`ContributionCampaigns.tsx`. Pruebas en `npm run test:contribution` (492 casos)
con el Excel REAL como fixture (`scripts/fixtures/centros-acopio-excel.tsv`);
verificadas a la inversa: sin el alias «Cll» y sin los sectores fallan 12.

- **EL PARSEO ES UNO Y VIVE EN EL SERVIDOR.** Reutiliza `parseDelimitedText`
  del motor de importación (v4.960), que ya sabe que un salto de línea dentro
  de una celda entrecomillada es parte del dato — y es exactamente como Excel
  copia una dirección de dos renglones. Una prueba comprueba que la pantalla
  no parta el texto por su cuenta.
- **LA VISTA PREVIA NO ESCRIBE.** Agregar pone las filas en la lista del
  editor y marca «sucio»; guardar sigue siendo el `PUT /:id/centers` de
  siempre. Un segundo camino de escritura se separaría del primero en
  silencio. Lo fija una prueba que busca `INSERT|UPDATE|DELETE` en el
  manejador.
- **LO QUE SE DEDUCE SE ANOTA, no se decide en silencio.** El segundo renglón
  de la dirección va al complemento, «Norte 1» se lee como el SECTOR «Norte»
  con el nombre vacío —el número no le dice nada al público y la página ya
  agrupa Cali así—, y dos contactos o dos teléfonos en la misma celda se
  conservan los dos. Cada deducción viaja en `_deductions` y se pinta bajo la
  fila de la vista previa. «Quinta Paredes» o «Compensar» NO son un sector:
  `SECTOR_WORDS` es un catálogo cerrado.
- **LA MISMA DIRECCIÓN SE ESCRIBE DE VEINTE FORMAS** y comparar el texto tal
  cual no encuentra ninguna. `addressKey` reduce la vía a su forma canónica
  (Cra/Carrera/CRA → `cra`, Cll/Calle → `calle`, No./#, sin tildes, sin
  espacios ni guiones). Es el ÚNICO punto de comparación.
- **DOS GRADOS DE REPETIDO Y LOS DOS SE DICEN.** `exacto` (misma ciudad, misma
  llave) nace DESMARCADO; `probable` (misma ciudad, misma placa «#54-61» y
  mismo número de vía: «Cra 1D1 #54-61» contra «Carrera 1D #54–61») nace
  marcado y en ámbar. Afirmar que el probable es el mismo portón sería decidir
  por quien revisa; esconderlo sería el descarte silencioso. Cada uno dice
  CONTRA QUÉ se repite. Los repetidos se comparan también entre las filas de
  la propia hoja.
- **Se compara contra LO QUE ESTÁ EN PANTALLA** (`existing` en el cuerpo, con
  sus cambios sin guardar); sin él, contra la base. Es lo que hace que pegar
  dos veces la misma hoja marque la segunda entera.
- **Lo descartado se reporta con el NÚMERO DE FILA del Excel**, no con un
  índice interno: es lo que permite volver a la hoja y corregirlo.
- **Un punto con dos teléfonos lleva un `tel:` por número** en la landing
  (`c.phone.split(/)`). Con los dos en un solo enlace, el número marcado
  sería la concatenación de ambos.
- **Medido con la hoja real**: 19 puntos leídos, 0 descartados; contra lo
  publicado en rotary4281.org el 4/09/2026, 4 repetidos exactos (Cali Norte 1,
  Centro 1, Centro 2, Sur 1) y 1 probable (Norte 2).

### Los repetidos del Excel se REEMPLAZAN (v4.995)

Pedido con la vista previa delante: *«reemplaza los repetidos y por favor
agregar los números de contacto»*. Con v4.994 un repetido nacía desmarcado y
la página se quedaba con la versión vieja —sin contacto ni teléfono—.
Criterio puro `mergeCenterRows` en `contributionSpec.js`; el servidor devuelve
por cada repetido de un centro EXISTENTE su `duplicateId` y la fila `merged`.
Pruebas en `npm run test:contribution` (505 casos); verificadas a la inversa.

- **LA FUSIÓN LA ARMA EL SERVIDOR.** La pantalla recibe la fila ya fusionada y
  la aplica POR ID sobre la existente; combinar campos en el navegador sería
  un segundo criterio que se separa en silencio del que se prueba.
- **LA HOJA MANDA DONDE TRAE ALGO; LO VACÍO NO BORRA.** Dirección, complemento,
  contacto y teléfono se actualizan; el horario o la nota que la hoja no
  pregunta se conservan del existente. Un campo que la hoja no tiene no es un
  campo que alguien haya borrado.
- **TELÉFONOS Y CONTACTOS SE SUMAN, no se pisan**, deduplicados por dígitos
  («310 239 3037» y «3102393037» son uno). Un número nuevo no vuelve falso al
  anterior.
- **LA IDENTIDAD ES LA DEL EXISTENTE**: `id`, `sortOrder` y `active`. Así
  reemplazar no mueve el punto de sitio en la página ni reactiva uno apagado
  a propósito, y `saveCenters` lo escribe sobre la misma fila.
- **Reemplazar es el DEFAULT para exacto y probable con id**; la fila ofrece
  las TRES decisiones y la vista previa muestra cómo QUEDA, no lo que dice la
  hoja. Un repetido de otra fila de la MISMA hoja no tiene a quién reemplazar:
  sin `duplicateId`, exacto se omite y probable se agrega.
- El `SELECT` de respaldo del preview trae la fila ENTERA (id incluido): con
  sólo ciudad, nombre y dirección no habría nada que fusionar — la trampa del
  `SELECT` corto de v4.886.

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
