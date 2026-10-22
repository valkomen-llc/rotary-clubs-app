<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El período rotario en un título — v4.1023

El título de «Nuestra Junta Directiva» dice el año rotario:
**«Nuestra Junta Directiva 2026-2027»**. El año no se escribe: se calcula.

| Archivo | Qué es |
|---|---|
| `src/lib/rotaryPeriod.ts` | El CRITERIO. **Puro**: dónde cae la frontera del 1 de julio, las dos lecturas —UTC y local— y qué título ya nombra su período |
| `src/pages/NuestraJuntaDirectiva.tsx` | El `<h1>` de la página pública |
| `src/pages/GeneradorPendones.tsx` | El otro sitio donde el período estaba escrito a mano |

Pruebas: `npm run test:rotary-period` (47 casos: criterio, paridad por salidas
contra los dos cálculos del servidor y el cableado leído de los archivos) y
`npm run test:junta:ui` (8 en un navegador, montando la página REAL con su
contexto de club y su contenido del CMS). Verificadas a la inversa sobre diez
defectos.

**Reglas durables:**

- **⚠️ UN AÑO ESCRITO A MANO SE QUEDA VIEJO EL 1 DE JULIO Y NADIE LO NOTA.** No
  falla ruidosamente: el título sigue pintándose y pasa a decir un período que
  ya no es —que es la clase de fallo que este archivo documenta una y otra
  vez—. Por eso el período se calcula en TODA pantalla que lo nombre, y una
  prueba recorre el `<h1>` de la Junta y la cabecera del Generador de Pendones
  y falla si vuelve a aparecer un `20xx-20xx` literal.
- **⚠️ LA ZONA IMPORTA, Y POR ESO HAY DOS LECTURAS DECLARADAS.** El servidor
  corre en UTC y sus dos cálculos (`rotaryPeriod` en `designSpec.js`,
  `rotaryPeriodFor` en `anniversarySpec.js`) leen las partes UTC; una página
  pública la mira una PERSONA, en su huso. Leer UTC en el navegador adelantaría
  el cambio: el 30 de junio a las 7 de la tarde en Bogotá ya es 1 de julio en
  UTC y el título saltaría al período siguiente cinco horas antes de que
  empiece — la trampa de v4.991 por la otra puerta. `rotaryPeriodLocal` es la
  del navegador; `rotaryPeriodUTC` existe para poder comparar por SALIDAS
  contra el servidor, y la prueba lo hace sobre 252 fechas y sus bordes.
- **NO SE ADIVINA LA ZONA DEL CLUB.** El sitio no la declara —sólo las
  ediciones de eventos tienen `timezone`— y deducirla del país sería inventar
  el dato. La discrepancia posible es de horas, una vez al año, para quien mire
  el sitio de un club colombiano desde otro huso.
- **EL NÚCLEO NO TOCA EL RELOJ** (`rotaryPeriodFrom(year, monthIndex)`). Es la
  regla de `yearsSince` en `designSpec.js`: una función que consulta la hora
  por dentro no se puede probar, y la frontera de este cálculo es exactamente
  el instante que hay que poder fijar en una prueba.
- **⚠️ UN TÍTULO QUE YA NOMBRA SU PERÍODO NO RECIBE OTRO** (`periodSuffixFor`).
  El título sale del CMS: quien lo escribió a mano con su año ya dijo cuál es,
  y pegarle otro al lado daría «Nuestra Junta Directiva 2026-2027 2026-2027».
  Es la regla con la que `putAuto` respeta una traducción manual — lo explícito
  manda. Se reconocen las formas en que se escribe de verdad: `2026-2027`,
  `2026 – 2027`, `2026/2027`, `2026-27`. Un año SUELTO no cuenta como período.
- **⚠️ EL AÑO ES UN DATO, NO LENGUAJE: VA EN SU PROPIO NODO Y CON
  `data-no-translate`.** El sitio traduce sobre el DOM ya pintado (v4.662), así
  que un `<h1>` con el año adentro viajaría entero al proveedor y un modelo
  puede reescribir «2026-2027». `domTranslator` guarda el original POR NODO, y
  eso es lo que hace que el título se traduzca y el año quede intacto.
- **UN DATO ILEGIBLE NO SE PINTA.** Con un año o un mes que no son números
  —una fecha inválida— se devuelve `null` y no se añade nada, antes que un
  título que diga «NaN-NaN».
- **NO SE ESCRIBE UN CUARTO CÁLCULO.** El servidor ya tenía DOS —deuda previa
  que no se tocó acá: moverlos exigiría tocar dos módulos probados por otras
  razones— y lo que faltaba era el criterio EN EL NAVEGADOR. La paridad por
  salidas es lo que impide que se separen: con tres criterios sueltos, el
  título de una pantalla y la firma de una pieza podrían nombrar períodos
  distintos.
- **⚠️ EL GUARDIÁN DEL AÑO LITERAL SE ACOTA A LA CABECERA, no al archivo
  entero.** Los datos de ejemplo de la junta traen «Past RDR 2008-2009», que es
  el cargo de una persona y no el período del sitio: un guardián que grita en
  falso se termina desactivando (v4.972).
- **Del mismo cambio, el Generador de Pendones dejó de llevar su período
  escrito a mano** — en el título y en el EJEMPLO del campo de cada persona,
  que seguía sugiriendo `2025-2026`, un período ya vencido. Un ejemplo
  desactualizado invita a escribir mal.
- **⚠️ QUE EL AÑO LLEGUE AL TÍTULO SE MIRA EN UN NAVEGADOR.** Es lo que se pidió
  mirando la pantalla (la lección de v4.717), y hay algo que la lectura del
  archivo no ve: que el espacio entre el título y el año se renderice. Se monta
  la página REAL —con su `ClubProvider`, su `CartProvider` y su contenido del
  CMS— y se lee el `<h1>` pintado. El período esperado sale del MISMO criterio
  que la página, no de un año escrito en la prueba: fijado a «2026-2027»,
  empezaría a fallar sola el 1 de julio de 2027 y no por un defecto.

**Pendientes conocidos:** los dos cálculos del servidor siguen siendo dos
—convergerlos es una vuelta aparte, y la paridad por salidas los sostiene
mientras tanto—; y el período **no llega al `<head>`**: el título que compone
`seoServe` para esta página es el genérico con el nombre del club, así que la
pestaña del navegador y la tarjeta de WhatsApp no nombran el año.
