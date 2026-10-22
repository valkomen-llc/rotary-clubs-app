<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Plantillas IA (Generador de Diseños) — v4.729

> **Aniversarios IA (v4.895) es OTRO módulo y no toca éste.** Aquél genera por
> instrucciones y no tiene lienzo, capas ni coordenadas; éste sigue siendo el
> editor y conserva su propósito. No se importa nada de aquí allá —lo comprueba
> `npm run test:anniversary`— ni al revés. Al tocar este módulo, no hace falta
> mirar el otro; lo que sí comparten son SERVICIOS globales (KIE, el redactor,
> `designGuard`, `designBranding`, `designFonts` y el proxy de imágenes), y ésos
> siguen siendo de un solo sitio.


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

**Un manejador que llega undefined: `npm run check:route-handlers`** (v4.1027).
Corre en `prebuild` y **rompe el despliegue**. Es la SEXTA causa de módulo caído
y la última que quedaba del hueco que este archivo daba por incubrible —«exigiría
ejecutar los módulos, y eso arrastra la base de datos»—. **Esa premisa era
falsa**: se midió, y los 58 módulos de rutas se cargan en **1,1 s** sin ninguna
conexión; la del pool es perezosa.

- **⚠️ EXPRESS LANZA AL REGISTRAR, NO AL ATENDER.** `router.post('/x',
  ctrl.handler)` con el manejador `undefined` revienta **al importarse el módulo
  de rutas**, así que tumba el router ENTERO —todos sus endpoints, no sólo el
  roto— en el primer arranque en frío tras el despliegue. Y como las rutas se
  importan de forma perezosa, el defecto viaja intacto a producción.
- **⚠️ EN LA PANTALLA NO SE VE COMO UN FALLO DE RUTAS.** v4.1026 dejó
  `/admin/postulaciones-pagos` en **«Tu perfil no tiene acceso a este módulo»**:
  con el router caído, la pantalla no puede leer ni su configuración ni sus
  permisos y cae a su `return` temprano (v4.689). El aviso rojo llegaba además
  **traducido al español por el propio traductor del sitio**, irreconocible al
  buscarlo (misma trampa que v4.721.1). **Ante un «no tenés acceso» que aparece
  justo después de un despliegue, cargar el módulo de rutas antes de mirar el
  RBAC.**
- **⚠️ LA CAUSA FUE UN `export default {…}` A MITAD DE ARCHIVO.**
  `resolveTransfers` se declaró 29 líneas DEBAJO del objeto que las rutas
  consumen (`import fair from …`), así que no entró en él. **El `export default`
  va al FINAL del archivo**, después de la última declaración: ahí el problema no
  puede volver a ocurrir. Agregar el nombre al objeto sin moverlo **no arregla
  nada** —la `const` todavía no está inicializada y sale un `ReferenceError` al
  cargar—, y las dos formas están verificadas a la inversa.
- **⚠️ `check-imports.mjs` (v4.884) NO LO VE, y ahí está el hueco exacto.**
  Aquélla mira los SÍMBOLOS de un `import`; `fair.resolveTransfers` no es un
  símbolo importado, es una PROPIEDAD del objeto que se importó por defecto. Las
  otras cuatro tampoco: el typecheck sólo mira `src`, `check:syntax` da el
  archivo por bueno —parsea perfectamente, es un error de EJECUCIÓN—,
  `check:server-undef` corre `no-undef` sobre identificadores sueltos, y
  `check:routes` sólo compara el ORDEN de las literales contra sus paramétricas.
- **⚠️ SE CARGAN LOS MÓDULOS DE VERDAD; NO SE ANALIZA EL TEXTO.** Es la decisión
  de la que cuelga la barrera, y se pagó dos veces antes de llegar a ella. El
  primer intento leía los archivos y comprobaba **CERO** manejadores pasando en
  verde con el defecto delante —el limpiador de cadenas borraba la RUTA de cada
  `import`, así que no resolvía ninguno—; el segundo denunciaba **en falso**
  decenas de manejadores que sí existen, porque emparejar comillas y literales
  de expresión regular con expresiones regulares no funciona (una plantilla
  anidada se comía seis `export const` de `crmController.js`). Un guardián que
  grita en falso se termina desactivando. **Cargar el módulo es exactamente lo
  que hace Express en producción: ni un falso positivo ni un falso negativo.**
- **⚠️ Y SE CARGAN CON LA BASE NEUTRALIZADA** (`DATABASE_URL` vaciada antes de
  importar nada). `prebuild` corre en el despliegue, donde esa variable SÍ está:
  sin esta precaución, un módulo con efectos al importarse podría escribir en
  producción durante un build — lo que este archivo prohíbe desde el incidente
  del 2026-07-13. Medido: el intento de conexión falla, se registra, y el
  registro de rutas ocurre completo.
- **UN FALLO DE ENTORNO NO ROMPE EL DESPLIEGUE, PERO SE DICE.** Una dependencia
  que este equipo no tiene instalada o una credencial ausente no son un defecto
  del código; lo que no se puede callar es que ese módulo **tampoco se
  comprobó** — decir «todo bien» sobre lo que no se miró es la afirmación que
  este repositorio no hace. En el despliegue, donde están los paquetes y las
  claves, se comprueban los 58.
- **⚠️ UNA PRUEBA QUE LEE LA RUTA NO COMPRUEBA QUE EL MANEJADOR EXISTA.**
  `test:fair:transfers` tenía —y sigue teniendo— una comprobación llamada «la
  ruta está declarada» que pasó en verde con el módulo roto: leía el archivo de
  rutas y encontraba la línea. La línea estaba; lo que faltaba era el otro lado.
  Al fijar una ruta por prueba, comprobar el manejador, no su registro.

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
