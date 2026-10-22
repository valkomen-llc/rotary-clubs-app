<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

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
