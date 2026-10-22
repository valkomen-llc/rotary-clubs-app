<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Qué entra en el menú y qué botones se muestran — v4.1022

Pedido con el desplegable «Sobre Nosotros» abierto y sus catorce entradas a la
vista: *«que puedan activar o desactivar qué menús van a ir dentro de los menús
principal … también quiero desactivar el botón de contribuye»*. Para TODOS los
sitios, no sólo el que lo pidió.

| Archivo | Qué es |
|---|---|
| `src/lib/headerMenu.ts` | El CRITERIO. **Puro**: el catálogo del desplegable, qué entrada está encendida, la resolución con las categorías especiales, si un botón está oculto y los dos avisos |
| `server/lib/headerMenu.js` | Espejo MÍNIMO: sólo lo que el servidor necesita para SANEAR (`ABOUT_MENU_KEYS`, `normalizeAboutMenu`, `ctaHidden`, `normalizeHeaderCtas`) |
| `resolveAboutMenu` en `src/sections/Navbar.tsx` | El desplegable, armado con el criterio |
| `Setting about_menu` · `Setting header_ctas` | Dónde vive |
| Las dos tarjetas de `ClubSettings.tsx` | «Botones del menú principal» y «Menú «Sobre Nosotros»» |

Pruebas: `npm run test:header-menu` (91 casos: criterio, cableado leyendo los
archivos y el desplegable REAL en un navegador; los dos últimos bloques se
saltan solos si faltan `playwright`, `esbuild` o `dist/`). Verificadas a la
inversa sobre siete defectos.

**Reglas durables:**

- **⚠️ EL PRIMER NIVEL DEL MENÚ YA SE PODÍA APAGAR, y esto NO lo duplica.** El
  editor «Menú Principal» (`eventNavOrder`) gobierna desde siempre qué entradas
  de primer nivel se ofrecen —«Sobre Nosotros» incluido—; lo que no existía era
  tocar lo que va DENTRO de un desplegable ni los dos botones de la cabecera.
  Un segundo editor del primer nivel habría dado dos verdades sobre el mismo
  menú y se habrían contradicho en cuanto alguien tocara una. **Al pedir «apagar
  un menú», preguntar de qué nivel se habla**: la respuesta al primero ya
  existía y la pantalla lo dice con todas las letras.
- **⚠️ SÓLO SE GUARDA LO APAGADO, y la ausencia de una clave es «visible».** Es
  lo que hace que desplegar esto no cambie ni un sitio: `about_menu` no existe
  en ninguna fila, así que las catorce entradas se siguen pintando. Guardar la
  lista de lo ENCENDIDO tendría el defecto contrario y peor — una entrada nueva
  del catálogo nacería apagada en todos los sitios que ya guardaron su
  configuración, en silencio, y aparecería sólo donde nadie tocó nada.
- **⚠️ EL AJUSTE ESTÁ EN LA LISTA DE `by-domain`.** Esa ruta **REEMPLAZA**
  `settings` por un objeto de llaves escritas a mano: una llave que no esté ahí
  no la ve NUNCA el sitio público, y —como la pantalla la leería siempre vacía—
  el siguiente guardado la borraría. Es exactamente lo que destruyó las
  redirecciones de enlaces (v4.993). Al agregar un ajuste que el sitio público
  tenga que leer, agregarlo a esa lista.
- **⚠️ EL CATÁLOGO DEL DESPLEGABLE ES CERRADO Y VIVE EN EL SERVIDOR**
  (`ABOUT_MENU_KEYS`). `normalizeAboutMenu` descarta cualquier otra clave, así
  que el cuerpo de la petición no puede escribir un ajuste que nadie lee — el
  patrón `stripProtected`. Y está espejado: el navegador PINTA el catálogo y el
  servidor DECIDE qué se guarda.
- **⚠️ LAS TRES CATEGORÍAS ESPECIALES CONSERVAN SU PROPIO CAMPO.**
  `honoraryMembersVisible`, `governorsVisible` y `authorsVisible` ya existían en
  la base, ya se cargaban y ya se guardaban — **y no tenían ningún control en
  ninguna pantalla**: eran interruptores muertos, sólo alcanzables por API. La
  tarjeta los SACA A LA LUZ leyendo y escribiendo esos mismos campos; meterlos
  además dentro de `about_menu` habría dado dos verdades sobre lo mismo, que se
  contradicen en cuanto alguien toque una (el error que `publicKeyOf` evitó en
  Plantillas IA). Por eso `ABOUT_MENU_ITEMS` declara `visibleField` y
  `resolveAboutMenu` no mira el ajuste para ellas.
- **UNA CATEGORÍA ESPECIAL EXIGE LAS DOS COSAS**: que el club tenga socios en
  ella **y** que su campo no esté apagado. La condición de socios es de v4.596 y
  no se afloja: encender la casilla no hace aparecer una categoría vacía, y la
  tarjeta lo dice («Sólo con socios») para que la casilla encendida sin efecto
  no se lea como un fallo.
- **⚠️ CON EL DESPLEGABLE VACÍO NO SE PINTA «SOBRE NOSOTROS»** (`hasAboutItems`,
  en las CUATRO ramas que lo dibujan). Un botón que abre un recuadro vacío es
  peor que no tenerlo (v4.650), y con una sola de las cuatro sin la guardia el
  defecto aparecería sólo en una de las presentaciones —el menú fijo, el móvil o
  el configurable— sin que nada avisara. Lo cuenta una prueba.
- **Y SE AVISA ANTES DE GUARDAR** (`aboutMenuNotice`), con la SALIDA: si lo que
  se quiere es quitar «Sobre Nosotros» del menú, se apaga en «Menú Principal».
  Un aviso sin salida se lee como una avería (v4.1008).
- **⚠️ `hidden` VA ENUMERADO EN EL NORMALIZADOR DE CARGA DEL PANEL.** Esa
  función RECONSTRUYE el botón campo por campo, así que lo que no se enumere se
  pierde al abrir la pantalla y el interruptor vuelve solo a «visible» — y el
  siguiente guardado lo escribe encendido. No da ningún error: el botón apagado
  simplemente reaparece. Es la trampa de `normalizeNode` en Plantillas IA, y lo
  fija una prueba que lee el archivo.
- **APAGAR UN BOTÓN NO BORRA LO QUE SE ESCRIBIÓ EN ÉL.** Su texto y su enlace se
  conservan en la fila y la pantalla lo dice: apagar es una decisión reversible,
  y perder el enlace al apagarlo convertiría «probemos sin este botón» en volver
  a escribirlo desde cero.
- **`hidden` SE NORMALIZA A BOOLEANO REAL** (`ctaHidden`, que también entiende
  la cadena `'true'`). Un ajuste guardado como JSON puede volver con el booleano
  hecho texto, y `'false'` es cierto en JavaScript: leerlo a secas apagaría un
  botón encendido.
- **EL FILTRO DE AUDIENCIA DE v4.596 SIGUE EN PIE.** `showProjectFairCta` decide
  aparte si el botón de la Feria le toca a este visitante; lo nuevo se SUMA
  (`!ctaHidden(...) && (...)`). Fundirlos habría hecho que apagar el botón
  también apagara el criterio de audiencia, o al revés — dos preguntas distintas
  contestadas con un solo campo, que es la forma exacta del defecto de v4.1009.
- **APAGAR LOS DOS BOTONES SE PERMITE Y SE AVISA** (`headerCtasNotice`). Un
  sitio puede querer la cabecera limpia y decidirlo es suyo; callarlo dejaría
  una cabecera sin ninguna llamada a la acción sin que nadie lo haya mirado dos
  veces. Los avisos NO bloquean (regla del panel de tarifas, v4.854).
- **`undefined` ES «NO LO TOQUES».** El ajuste sólo se escribe cuando el cuerpo
  trae el campo, así que guardar cualquier otra cosa de Configuración no puede
  borrarlo — la mitad de la lección de v4.993 que el `by-domain` no cubre.
- **EL ORDEN DEL DESPLEGABLE NO SE TOCA.** `ABOUT_MENU_ITEMS` reproduce el orden
  que ya se pintaba, con las tres especiales entre «Nuestra Junta Directiva» y
  «Programa de Intercambios». Reordenar el menú es otra función y otra decisión;
  mezclarla acá habría movido catorce entradas en todos los sitios a la vez sin
  que nadie lo pidiera.
- **⚠️ QUE EL DESPLEGABLE OBEDEZCA SE COMPRUEBA EN UN NAVEGADOR.** El criterio
  puede quedar entero mientras el `Navbar` vuelve a su lista escrita a mano, y
  ese fallo es MUDO: el código es válido, los tipos están bien y el ajuste
  simplemente no decide nada. La prueba monta `resolveAboutMenu` de verdad y
  cuenta las entradas pintadas — verificado a la inversa reintroduciendo la
  lista fija.
- **Las dos tarjetas viven en Identidad**, que es donde se pidieron y donde ya
  está el editor de los botones. Una pantalla propia para dos juegos de casillas
  sería el segundo sitio donde mirar, y las pantallas que se olvidan son siempre
  las del segundo lugar.

**Pendientes conocidos:** las entradas de los OTROS desplegables del menú
—Proyectos, Noticias, Eventos— no se pueden apagar de a una: hoy se apaga el
desplegable entero desde «Menú Principal». Y el desplegable **no se puede
reordenar** desde la pantalla: su orden es el declarado en el catálogo.
