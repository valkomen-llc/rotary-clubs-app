<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El asistente de redacción de Noticias — v4.891

Reporte con captura: «cuando intento generar un artículo con IA aparece un
error». El aviso decía **«La IA dice: Intenta de nuevo en unos segundos»** — un
mensaje que no distingue una credencial ausente de un modelo retirado ni de un
presupuesto de tokens agotado. Eran cuatro defectos encadenados.

| Archivo | Qué es |
|---|---|
| `server/lib/articleSpec.js` | El CRITERIO. **Puro**: estructura del artículo, construcción del prompt, lectura de la respuesta, validación y reparación |
| `POST /api/ai/generate-article` | La orquestación: reintento con las reglas rotas y propagación del motivo |
| `server/lib/ai-router.js` | El presupuesto de salida, el razonamiento acotado y la respuesta vacía |

Pruebas: `npm run test:article` (71 casos de criterio) y
`npm run test:article:route` (35, con la base y el proveedor sustituidos por un
hook de resolución de módulos). **Ninguna necesita base, credenciales ni red.**

**Reglas durables:**

- **⚠️ LOS TOKENS DE RAZONAMIENTO SALEN DEL MISMO PRESUPUESTO QUE LA RESPUESTA**,
  y ésa era la causa raíz. Los modelos Gemini 2.5 razonan por defecto y ese gasto
  se descuenta de `maxOutputTokens`: con los 4096 por defecto y un artículo
  completo —titular, cuerpo HTML, y seis campos de SEO— el modelo agotaba el
  presupuesto pensando y devolvía texto vacío o un JSON cortado a mitad, con
  `finishReason=MAX_TOKENS`. Para redactar no hace falta cadena de razonamiento,
  así que se acota con `thinkingConfig: { thinkingBudget: 0 }`. **La señal ya
  estaba escrita en el propio archivo** —un comentario advertía que
  `responseMimeType: 'application/json'` causaba «MAX_TOKENS prematuro»— y nadie
  relacionó las dos cosas. `supportsThinking` lo aplica sólo a los modelos que
  declaran el campo: mandárselo a uno que no lo tiene lo rechaza con un 400 y el
  candidato se saltearía **en silencio**.
- **⚠️ UNA RESPUESTA VACÍA NO ES UN ÉXITO.** `callGemini` hacía
  `if (res.ok) return rawText;` y devolvía la cadena vacía como si fuera la
  respuesta del modelo: la cadena de candidatos **se cortaba en el primero** —el
  respaldo no llegaba a probarse nunca— y quien llamaba fallaba después, al leer
  un JSON que jamás existió. Ahora sólo se devuelve texto con contenido, y el
  motivo se NOMBRA (`describeEmpty`): presupuesto agotado, filtro de contenido y
  petición rechazada se corrigen en sitios distintos.
- **La respuesta puede venir partida en varias `parts`.** Quedarse con
  `parts[0].text` pierde el resto del texto en una respuesta larga, que es
  justamente el caso de un artículo.
- **⚠️ EL MOTIVO DEL PROVEEDOR SE PROPAGA TEXTUAL, CON ESTADO HTTP REAL.** El
  endpoint respondía **`status(200)`** con `{ error: 'Intenta de nuevo en unos
  segundos' }`: el navegador daba la petición por buena, el `details` con la
  causa real no se mostraba en ninguna parte, y las tres averías posibles se
  veían idénticas. Es la regla que el CRM aprendió con `metaCode` y la Bóveda con
  el error de Stripe. Un 200 con un error dentro es además una mentira HTTP.
- **La pantalla distingue sesión vencida de fallo del proveedor**
  (`mensajeDeFalloIA`): 401 se corrige volviendo a entrar, 403 pidiéndole el
  permiso a un administrador y 502 en Integraciones → Modelos IA. «No se pudo
  generar» a secas obliga a diagnosticar a ciegas (regla de `FeeRulesPanel`).
- **⚠️ UN JSON TRUNCADO NO SE TIRA ENTERO.** El rescate era
  `cleaned.match(/\{[\s\S]*\}/)`, que **exige la llave de cierre**: una
  respuesta cortada por el presupuesto no casa con NADA y un artículo casi
  completo se descartaba. `closeTruncated` descarta la clave incompleta del final
  y cierra lo que falte. **No adivina contenido**: sin un solo campo completo
  devuelve `null`, porque cerrar la llave daría un objeto vacío presentado como
  respuesta del modelo.
- **EL MODELO ESCRIBE, EL CÓDIGO DECIDE.** `validateArticle` comprueba y la ruta
  reintenta devolviéndole **la regla concreta** que rompió, con su número («el
  titular tiene 84 caracteres y el máximo es 60»). Pedirle «revisá el formato» no
  corrige nada — la regla de `templateComposer.js` y `seoAI.js`.
- **⚠️ LOS LÍMITES SALEN DE `seoSpec.LIMITS`, NO DE UN SEGUNDO CATÁLOGO.** El
  prompt pedía un titular de «máx 70 caracteres» mientras `LIMITS.title.max` es
  **60**, así que el artículo nacía ya con un hallazgo de SEO encima; y la
  pantalla recortaba por su cuenta a 60 y 160 —la meta descripción real se corta
  en 155—. Con dos catálogos, el generador cumple un límite y la auditoría aplica
  otro. El recorte vive ahora en un solo sitio, el servidor.
- **El mínimo de palabras es el RECOMENDADO de la auditoría, no su umbral de
  denuncia.** `seoRules.js` marca `content_thin` por debajo de 150 y recomienda
  300: un artículo que nace en 160 pasa el informe por un pelo y no compite por
  nada. El piso es 300, el objetivo 900 y el techo 1.400 —más no cabe en una sola
  respuesta junto al resto del JSON—. El prompt anterior pedía «mínimo 3
  párrafos», que da unas 250 palabras.
- **El cuerpo se mide con el MISMO criterio que la auditoría**
  (`stripHtml` + palabras separadas por espacios, igual que
  `seoRules.analyzeBody`). Con dos formas de contar, el generador diría 320
  palabras y el informe marcaría contenido pobre sobre el mismo texto.
- **⚠️ EL CUERPO NO LLEVA `<h1>`.** La página pública ya pinta el título del
  artículo como `<h1>` (`BlogPost.tsx`), así que un H1 dentro del cuerpo produce
  DOS en la misma página — que es exactamente lo que Google señala. Las secciones
  empiezan en `<h2>`, y meter un H1 es **error**, no aviso.
- **Las etiquetas permitidas son las que el editor visual sabe guardar.** Pedirle
  al modelo un formato que Quill descarta al primer guardado es prometer una
  estructura que no sobrevive.
- **UN AVISO NO BLOQUEA.** `errors` impide entregar y dispara el reintento;
  `warnings` se entrega y se dice. Tratarlos igual convierte cualquier
  observación en un bloqueo y se dejan de leer (regla del panel de tarifas).
- **AGOTADOS LOS INTENTOS, EL TRABAJO NO SE TIRA**: se ajusta lo ajustable por
  código —recortar sin partir palabras, derivar el slug o la descripción— y se
  entrega **con sus avisos**. Un titular dos caracteres largo es mejor que ningún
  artículo, y quien redacta lo ve y lo corrige. Mismo criterio que `composeMeta`.
- **Y LO REPARADO SE DICE, no sólo se diagnostica.** Un titular que se recorta en
  silencio se publica con puntos suspensivos y quien lo escribió se entera al
  verlo en línea. `repaired` viaja como aviso a la pantalla, no sólo en el
  diagnóstico — lo destapó la prueba del camino, no el typecheck.
- **REPARAR NO INVENTA CONTENIDO.** Si el cuerpo es corto sigue siendo corto y la
  validación lo sigue diciendo. Alargarlo para pasar el umbral sería exactamente
  lo que la regla de veracidad prohíbe.
- **Se guarda el intento con MENOS reglas rotas**, no el último por ser el
  último: un segundo intento puede salir peor que el primero.
- **El prompt dice que NO SE INVENTAN DATOS** y qué hacer con lo que falta
  —escribir sin ese dato, no completarlo—. Un hueco en silencio es una invitación
  a llenarlo, que es la lección de la Campaña de Emergencia.
- **Las reglas viven en el prompt del SISTEMA y el contexto en el del USUARIO.**
  `callGemini` trunca el prompt de usuario a 2.500 caracteres y **no** el del
  sistema: con las reglas abajo, un reintento las empujaría fuera junto con el
  contexto real.
- **El registro de modelos ya intentados vive FUERA del bucle de candidatos.**
  Estaba declarado dentro, así que nacía vacío en cada vuelta y no deduplicaba
  nada: con el modelo por defecto —que además encabeza la lista de respaldos— se
  hacían dos llamadas idénticas al proveedor, con su latencia y su costo.
- **`routeToModel` acepta un presupuesto por llamada** (`options.maxTokens`,
  aditivo). Una respuesta corta —un titular, un icono— no necesita lo mismo que
  un artículo completo, y hasta v4.890 todo salía con los 4096 por defecto.
- **El slug definitivo lo sigue resolviendo `resolvePostSlug` al guardar**
  (v4.873). Aquí sólo se le da forma para que la pantalla muestre algo coherente:
  un segundo resolutor volvería a partir la dirección en dos criterios.
- **La marca del sitio es un EXTRA, no un requisito.** `/api/ai` no lleva
  middleware de autenticación, así que `req.user` no existe: leer el nombre del
  sitio va dentro de un `try` y sin él se redacta igual.

### Una avería en un proveedor no puede tumbar toda la IA (v4.892)

Segundo reporte, con el asistente ya corregido: **«Lightning dunning decision is
deny for project: projects/746648100373»**. El mensaje es de Google y llegó
entero a la pantalla, que es exactamente lo que v4.891 vino a conseguir — el
motivo real en vez del genérico.

- **⚠️ ESO NO SE ARREGLA DESDE LA PLATAFORMA, Y DECIRLO ES LA MITAD DEL
  ARREGLO.** *Dunning* es el proceso de cobro de una deuda: Google devuelve un
  **403** cuando la cuenta de facturación del proyecto tiene un pago pendiente o
  rechazado. No es la clave, no es el modelo y no es el prompt. Ninguna
  corrección de código lo levanta. Lo que sí se corrige es todo lo demás.
- **⚠️ UN FALLO DE CUENTA NO SE REINTENTA CON LA MISMA CLAVE**
  (`isAccountLevelFailure`). Los cinco candidatos de `callGemini` comparten la
  MISMA credencial y la MISMA cuenta, así que un 403 de facturación gastaba
  cinco viajes para recibir cinco veces el mismo rechazo. Un 404 de «modelo no
  encontrado» sí vale reintentarlo con otro modelo — la distinción es esa y por
  eso no basta con mirar el estado HTTP.
- **⚠️ HAY RESPALDO ENTRE PROVEEDORES, NO SÓLO ENTRE MODELOS.** Hasta v4.891
  `routeToModel` elegía UN proveedor y si fallaba se acababa ahí: un pago
  rechazado en Google dejaba sin asistente de redacción, sin sugerencias de SEO
  y sin copys **teniendo `OPENAI_API_KEY` cargada** —la usan Content Studio y los
  Reels—. `buildFallbackChain` cae al siguiente proveedor CON CREDENCIAL: uno sin
  clave no es un respaldo, es un viaje garantizado a un 401.
- **Un modelo pedido A MANO no tiene respaldo** (`options.explicit`): quien lo
  eligió eligió, y silenciarlo con otro motor sería desobedecerlo. Es la misma
  regla que el montaje y la música del Creador de Reels. El modelo por DEFECTO sí
  lo tiene — un valor por omisión no es una elección para esta petición.
- **El orden de respaldo está DECLARADO** (`PROVIDER_FALLBACK_ORDER`), no
  deducido de las claves disponibles: con la lista implícita, agregar un
  proveedor lo metería en medio de la cadena sin que nadie lo hubiera decidido.
- **Cuando responde un respaldo se DICE** (`options.notes` → aviso en pantalla).
  Sin eso, el modelo principal se queda caído y nadie se entera hasta que alguien
  mire los registros: la plataforma «funciona» y la factura la paga otro
  proveedor.
- **Agotada la cadena, se propaga el motivo de CADA proveedor.** Con un mensaje
  único no se distingue una credencial ausente de una deuda ni de una caída
  general, y son tres cosas que se corrigen en sitios distintos.
- **El rechazo del proveedor se TRADUCE conservando su texto**
  (`describeProviderFailure`). Se propaga textual —regla del sitio— pero
  «Lightning dunning decision is deny» no le dice a nadie que su cuenta tiene un
  pago rechazado: el diagnóstico va delante, en español y con qué hacer, y el
  original entre paréntesis, que es lo que se busca en el soporte del proveedor.
  Vale para los CUATRO proveedores, no sólo Google.
- **⚠️ HABILITAR EL RESPALDO DESTAPÓ UN DEFECTO LATENTE: `callOpenAI` forzaba
  `response_format: json_object` A TODOS.** No se notaba porque el modelo por
  defecto es Gemini y nada caía en OpenAI; con respaldo entre proveedores, un
  endpoint de CONVERSACIÓN aterrizaría ahí y recibiría JSON donde espera prosa
  —y OpenAI además RECHAZA ese modo si el prompt no nombra «json»—. Ahora es
  condicional (`wantsJson`), y se mira el PROMPT y no una bandera de quien llama:
  son quince puntos de llamada y una bandera nueva la olvida el siguiente, con un
  fallo mudo. **Al abrir un camino que antes nunca se recorría, revisar qué había
  al final de ese camino.**
- **Una respuesta vacía tampoco es un éxito en OpenAI**, igual que en Gemini
  (v4.891). La misma clase de defecto vivía en los dos sitios.

**Pendiente conocido:** la auditoría marca `h1_missing` en todo artículo cuyo
cuerpo tenga `<h2>` y ningún `<h1>` —`seoRules.js` mira sólo el cuerpo guardado y
no ve el `<h1>` que pinta la plantilla—. Es un **falso positivo preexistente**
sobre los posts, no algo que esta versión introduzca: le ocurre igual a cualquier
artículo escrito a mano con secciones. Corregirlo es acotar esa comprobación por
`page.kind`, y cambiaría la nota de SEO de todos los sitios, así que no se tocó
aquí.
