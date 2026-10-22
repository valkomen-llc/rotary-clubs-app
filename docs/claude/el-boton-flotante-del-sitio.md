<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El botón flotante del sitio — v4.1021

Un círculo fijo en la esquina **inferior izquierda** de las páginas públicas,
espejo del que abre el chatbot a la derecha. Lo llena el administrador de cada
sitio: sube una imagen y escribe a dónde lleva.

| Archivo | Qué es |
|---|---|
| `src/lib/floatingButton.ts` | El CRITERIO. **Puro**: forma canónica, catálogo de esquemas admitidos, cuándo se pinta, dónde no y qué le falta |
| `server/lib/floatingButton.js` | Espejo MÍNIMO del servidor: sólo lo que decide qué se GUARDA |
| `src/components/FloatingSiteButton.tsx` | El botón |
| La tarjeta «Botón Flotante del Sitio» en `ClubSettings.tsx` | Imagen, enlace, rótulo e interruptor |
| `Setting floating_button` → `floatingButton` en `by-domain` | Dónde vive |

Pruebas: `npm run test:floating-button` (122 casos: criterio, cableado leído de
los archivos y la pantalla MEDIDA en un navegador). Verificadas a la inversa
sobre las tres invariantes.

**Reglas durables:**

- **NACE VACÍO Y APAGADO, y por eso desplegarlo no cambió ningún sitio.** Se
  monta en TODAS las páginas públicas de TODOS los sitios de la plataforma, así
  que una imagen o un enlace escritos en el código aparecerían en cada club: es
  la lección de v4.737, cuando la campaña de un distrito se convirtió en la
  portada de todos los distritos, y la misma regla del Bloque Destacado
  (v4.746). Un sitio que no lo use no puede notar que existe — ni el espacio.
- **⚠️ TODO SE CONFIGURA EN UNA SOLA PANTALLA, y ahí se aparta a propósito del
  Bloque Destacado.** Aquél tiene la imagen en Distribución de Imágenes y el
  texto en Configuración → Identidad, y por eso su regla obliga a DECIR en la
  pantalla dónde está la otra mitad. Esa separación es histórica —la imagen es
  un hueco de `useSiteImages`—, no algo que convenga repetir: lo que se pidió
  acá fue subir la imagen y enlazarla de una vez, y un botón que se arma en dos
  pantallas se queda a medias en la primera. La imagen vive como URL dentro del
  mismo ajuste, que es lo que ya hace `stats_section_image`.
- **⚠️ EL ENLACE TERMINA COMO `href` DE UNA PÁGINA PÚBLICA, así que el ESQUEMA
  se cierra a un catálogo** (`SAFE_SCHEMES`: `http`, `https`, `mailto`, `tel`).
  Se valida por FORMA —un club puede enlazar un acortador, un dominio propio o
  una campaña— pero `javascript:` y `data:` no son enlaces, son código. Es la
  regla del mapa de la sede (v4.717), la de las redirecciones (v4.781) y la de
  las publicaciones del formulario público (v4.972).
- **⚠️ Y NO ALCANZA CON `ctaTarget`.** Aquél decide cómo se ABRE un enlace, y
  para eso pregunta si apunta a otro dominio: `javascript:alert(1)` no apunta a
  ninguno, así que lo devuelve como EXTERNO y lo pondría tal cual en el `href`.
  La comprobación del esquema va ANTES. **Y el caso que de verdad la prueba
  lleva host**: `javascript:alert(1)` lo rechazaría también un filtro que sólo
  mire el host —no tiene punto—, así que la prueba pasaría sin la guardia;
  `javascript://evil.com/%0aalert(1)` parsea, tiene host con punto y sólo lo
  detiene el esquema. Se encontró verificando a la inversa, no leyendo.
- **UN ENLACE INSEGURO NO SE GUARDA: SE DESCARTA AL NORMALIZAR.** Si se
  guardara, cada lector tendría que acordarse de comprobarlo y el que se olvide
  lo pone en un `href`. Se normaliza además AL LEER, así que una fila escrita
  antes de que el saneado existiera tampoco puede colarlo.
- **EL SERVIDOR DECIDE QUÉ SE GUARDA.** La pantalla comprueba mientras se
  escribe —eso es comodidad—, pero quien conoce el endpoint no pasa por la
  pantalla (v4.868). Los dos espejos se comparan por SALIDAS en la prueba: con
  dos saneados, el panel aceptaría un enlace que la página no dibuja, y lo que
  se separaría es qué termina en un `href` público.
- **El espejo del servidor es MÍNIMO** —sólo el saneado del guardado— y una
  prueba comprueba su AUSENCIA de `floatingButtonVisible` y del aviso: qué se
  PINTA con lo guardado es otra pregunta y vive donde se pinta.
- **⚠️ `floatingButton` TIENE QUE ESTAR EN LA LISTA DE `by-domain`.** Ese
  endpoint REEMPLAZA `settings` por un objeto de llaves escritas a mano: un
  ajuste que no figure ahí el sitio público NO LO VE NUNCA y el panel lo carga
  vacío — y entonces el siguiente guardado de cualquier otro campo lo borra.
  Es exactamente lo que borró las redirecciones de enlaces en v4.993. Lo fija
  una prueba que lee el archivo; una de criterio lo habría dado por bueno.
- **`undefined` es «no lo toques».** El ajuste sólo se escribe cuando el cuerpo
  trae el campo, así que guardar cualquier otra cosa de Configuración no puede
  vaciarlo (la otra mitad de la lección de v4.993).
- **LAS TRES CONDICIONES PARA PINTARSE SON INDEPENDIENTES**: encendido, con
  imagen y con enlace. Sin enlace sería un botón que no lleva a ninguna parte,
  que es peor que ninguno (v4.650); sin imagen, un círculo vacío. Y **lo que
  falta se DICE en el panel**: encender el botón, no verlo en el sitio y no
  saber por qué es exactamente como se reporta un módulo roto.
- **LA IZQUIERDA ES SUYA Y LA DERECHA ES DEL CHATBOT.** Los dos son
  `fixed bottom-6` y miden 70 px: puestos del mismo lado se taparían justo en
  el móvil, que es donde menos sitio hay. Que comparta tamaño y forma con el
  del chat no es adorno — es lo que hace que se lean como una pareja.
- **⚠️ QUE ESTÉ A LA IZQUIERDA SE MIDE EN UN NAVEGADOR, no se deduce del
  marcado.** Es literalmente lo que se pidió mirando la pantalla, y una clase
  puede no llegar al CSS compilado (v4.719) o llegar y perder la cascada
  (v4.974): las dos fallan calladas. Se compara la caja real con el CSS
  compilado cargado (v4.851). Verificada a la inversa moviéndolo a la derecha.
- **NO SE PINTA EN EL PANEL.** Es contenido del sitio, no una herramienta de
  administración: sobre `/admin` sería ruido encima de una pantalla de trabajo
  y a la izquierda choca justo con la barra lateral. **La comparación es por
  SEGMENTO** —`/admin` cubre `/admin/noticias` y NO `/administracion`, que es
  otra página—: la lección de las reglas de `robots.txt` (v4.702).
- **VA DENTRO DE `ConstructionGate` Y DENTRO DEL `Router`.** Lo primero porque
  un sitio que todavía no se anuncia tampoco anuncia su botón; lo segundo
  porque lee la ruta con `useLocation` y fuera del Router no existe. El
  `<ChatBot />` sigue montado fuera, como estaba: no se tocó.
- **NO ESTÁ ACOTADO POR TIPO DE SITIO.** Se pidió para un club, así que
  acotarlo a Evento/Convención —como `actionContent` o `joinContent`— lo habría
  dejado sin poder llenarse. Misma decisión que el Bloque Destacado.
- **LA CASILLA DE IMAGEN OFRECE LAS DOS VÍAS** (v4.700): subir un archivo o
  elegirlo de la Biblioteca Multimedia.
- **⚠️ Y PARA ESO `setImageField` ENTIENDE NOTACIÓN DE PUNTO**
  (`'floatingButton.imageUrl'`), en la subida Y en el `MediaPicker`. Es
  genérico a propósito: con un caso especial por campo anidado, el segundo que
  aparezca necesita otro y el tercero se olvida — y el fallo es MUDO, la imagen
  se sube y la casilla no cambia. Los campos planos que ya existían pasan por
  la misma función sin notarlo.
- **EL RÓTULO ES EL NOMBRE ACCESIBLE, no un texto en pantalla.** Un botón que
  es sólo una imagen lo necesita: sin él, el lector de pantalla lee la
  dirección del enlace. Sin rótulo hay un respaldo, y eso **no es contenido
  inventado** —es un nombre funcional, como «Abrir chat»—: lo que no se inventa
  es la imagen ni el enlace, y sin ellos el botón no existe.
- **Un `mailto:`/`tel:` NO va en pestaña nueva** (`opensExternalApp`): abre una
  aplicación, no una página, y `target="_blank"` deja una pestaña en blanco
  detrás en varios navegadores.
- **LA FORMA DEL BOTÓN NO SE CONFIGURA.** Tamaño, borde, sombra y recorte
  circular son del sistema: es lo que garantiza que se vea sobre cualquier
  fondo y que se alcance con el dedo. Quien publica elige la imagen y el
  enlace; el contraste y el área táctil no son decisiones editoriales (regla de
  v4.746).

**Pendientes conocidos:** el botón **no tiene aro pulsante ni punto de estado**
como el del chat — aquéllos invitan a conversar y acá no dirían nada, pero si
se piden, van con `prefers-reduced-motion`. La imagen **no pasa por un
recortador**: se recorta en círculo con CSS, así que una foto muy apaisada
pierde los lados (se advierte en la pantalla y lo ideal es subirla cuadrada).
Y **hay un solo botón por sitio**: dos exigirían decidir cómo se apilan en un
móvil.
