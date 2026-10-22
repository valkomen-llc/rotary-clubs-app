<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Solicitud → artículo de noticia — v4.1003

Cada solicitud de contenido válida se convierte SOLA en un borrador de noticia
—texto, SEO, portada y galería— que espera revisión humana. La automatización
**nunca publica**.

| Archivo | Qué es |
|---|---|
| `server/lib/submissionArticleSpec.js` | El CRITERIO. **Puro**: estados y transiciones, etapas, validación previa, lo no suministrado, prompt, veracidad, etiquetas, categorías, puntaje de portada, plan de galería, versiones, tracking e impacto |
| `server/lib/articleGenerate.js` | El bucle de generación, EXTRAÍDO de `/api/ai/generate-article` para que la ruta y el workflow compartan uno |
| `server/lib/submissionArticleEngine.js` | La orquestación: encolar, reclamar, las siete etapas, publicar, versiones, regenerar |
| `server/lib/articleAnalytics.js` | La medición: un viaje por golpe, agregado diario, estadísticas y el resumen |
| `server/lib/ensureSubmissionArticleSchema.js` · `ensureArticleAnalyticsSchema.js` | Las seis tablas, en runtime |
| `server/controllers/submissionArticleController.js` | La API y el beacon público |
| `src/components/admin/contribution/SubmissionArticlePanel.tsx` | El bloque «Artículo de noticia» dentro de la ficha |
| `src/components/admin/contribution/ArticleMediaPicker.tsx` | Portada y galería. **COMPARTIDO** por la ficha y el editor de Noticias |
| `src/lib/submissionArticleSpec.ts` · `src/lib/articleTracking.ts` | Espejo MÍNIMO de rótulos y los tres beacons |

Pruebas: `npm run test:submissions:article` (52 casos, **sin base, credenciales
ni red**). Verificadas a la inversa sobre las invariantes que sostienen el
módulo.

**Reglas durables:**

- **⚠️ LA AUTOMATIZACIÓN NO PUBLICA, Y ES ESTRUCTURAL.** El `INSERT INTO "Post"`
  del motor lleva `published FALSE` literal —no una variable— y el ÚNICO
  `UPDATE … published = TRUE` del archivo vive dentro de `publishArticle`, que
  es una acción humana con su permiso (`news.publish`). El avance de etapas no
  lo llama. Lo fija una prueba que lee el archivo, cuenta los puntos que
  publican y comprueba dónde caen: una regla escrita en prosa no protege nada
  (la lección de `check:routes`, v4.859).
- **⚠️ Y `FLOW` NO TIENE NINGÚN CAMINO A «publicado» QUE NO PASE POR
  «aprobado».** Se comprueba recorriendo los diez estados, no el par feliz: el
  día que alguien agregue un atajo desde «en revisión», la prueba falla.
- **⚠️ LA IDEMPOTENCIA ES UN ÍNDICE ÚNICO SOBRE `submissionId`, no una lectura
  previa.** Entre un `SELECT` y un `INSERT` caben dos vueltas del cron, el
  sondeo del navegador y el webhook — es la lección de
  `Payment_provider_providerRef_key` y de `deliveryKey`. `enqueueArticle` es
  `INSERT … ON CONFLICT DO NOTHING`, así que encolar diez veces la misma
  solicitud crea UN artículo. Duplicar es otra cosa: una acción expresa que
  crea un Post aparte y **deja la fila del workflow apuntando al principal**.
- **EL RECLAMO VA SOBRE `attempts`, NO SOBRE `updatedAt`** (v4.800): el driver
  de pg trunca los microsegundos y la igualdad no casaría nunca. Acá el precio
  de repetir ese error es pagar dos veces la misma generación.
- **⚠️ UNA ETAPA POR VUELTA, y las opcionales no tumban el borrador.** Son
  siete —validar, analizar, portada, multimedia, generar, SEO, borrador— y sólo
  tres son obligatorias. `deriveWorkflowStatus` DERIVA el estado de lo que
  ocurrió: con el SEO fallado el artículo queda «Borrador listo» con «SEO
  pendiente», y `stageToRetry` reintenta **sólo esa** — lo que está en `ok` no
  se regenera. Es el requisito literal del pedido («Borrador generado — SEO
  pendiente»).
- **EL PROGRESO SON ETAPAS REALES, no un porcentaje inventado** (v4.756). La
  pantalla muestra la etapa cuando OCURRIÓ, porque cada `advance` hace UNA y
  contesta; en Vercel la función se congela al cerrar la respuesta, así que un
  `fire-and-forget` quedaría a medias. Hay TRES vías que llaman al mismo
  `advanceArticle`: el cron cada minuto, el sondeo del navegador y el reintento
  manual — el patrón del Creador de Reels (v4.670). No quitar el cron: sin él,
  cerrar la pestaña deja el borrador a medias.
- **⚠️ EL MODELO ESCRIBE Y EL CÓDIGO DECIDE, con el validador que ya existía.**
  `checkArticleVeracity` corre `validateEmergencyCopy` —la capa 3 de la Campaña
  de Emergencia (v4.783)— sobre el titular, el cuerpo y el extracto, con el
  universo de lo suministrado armado desde la solicitud: si el club escribió
  «120 mercados», ese 120 deja de ser invención. Un segundo validador de cifras
  se separaría del primero en silencio.
- **LO QUE NO SE SABE SE DECLARA** (`missingInfo` → «INFORMACIÓN NO
  SUMINISTRADA» en el prompt, y guardado con el artículo). Un hueco en silencio
  es una invitación a que el modelo lo llene — la lección de v4.783 y de
  v4.967. La pantalla lo muestra: quien revisa tiene que poder pedirle ese dato
  a quien envió.
- **⚠️ HAY UN SOLO GENERADOR DE ARTÍCULOS.** El bucle —llamar, validar,
  reintentar con la regla concreta, reparar por código— vivía dentro de
  `/api/ai/generate-article`; se extrajo a `articleGenerate.js` y la ruta ahora
  lo llama. Copiarlo habría dado dos redactores que se separan en silencio: el
  asistente de Noticias mejoraría y el workflow se quedaría atrás. Lo fija una
  prueba en las dos puntas.
- **⚠️ LAS FOTOS NO SE COPIAN, Y ENTRAN AL ARTÍCULO CUANDO EL MATERIAL SE
  APRUEBA.** `SubmissionArticleMedia` referencia el ARCHIVO de la solicitud
  (`fileId`), nunca una copia. Y el archivo vive en el prefijo PRIVADO hasta
  que alguien lo aprueba (v4.968): eso es estructural y no se afloja, así que
  el borrador nace con su texto y su plan de galería, y `syncArticleMedia`
  escribe las URLs públicas en el Post recién cuando se promueven. **Un
  borrador sin imágenes no es un fallo de la IA**, y por eso el editor de
  Noticias lo DICE — sin esa línea se lee como una avería.
  **⚠️ Desde v4.1002 QUIÉN aprueba cambió**: la promoción es una etapa del
  workflow y ya no espera a que alguien la busque. Lo estructural sigue igual
  —el archivo nace privado y sólo `promoteToLibrary` lo hace público, y el
  artículo sigue naciendo sin publicar—; ver «La portada y la galería las pone
  el WORKFLOW».
- **LA PORTADA SE SUGIERE, NO SE IMPONE.** `scoreImage` combina lo MEDIDO
  (resolución, nitidez laplaciana con `inspectSourceImage`, exposición, dHash
  para duplicados) con lo DESCRITO por el modelo de visión, y `coverExcluded`
  nombra el motivo —captura de pantalla, documento, desenfocada, oscura,
  repetida—. Sin ninguna elegible se sugiere la mejor y **se avisa** (`weak`):
  una galería sin portada es peor que una portada floja. La persona la cambia
  desde la ficha.
- **⚠️ LO EXCLUIDO NO SE BORRA** —y desde v4.1009 tampoco se excluye. Aquella
  regla protegía la FILA y dejaba la foto fuera de la PUBLICACIÓN; ver «El
  veredicto de portada es una NOTA» más abajo, que la supersede en ese punto.
- **UNA SOLA LLAMADA DE VISIÓN PARA TODAS LAS FOTOS.** `generateCopy` acepta
  UNA imagen, así que las fotos viajan compuestas en una cuadrícula numerada
  —la técnica de la comparación lado a lado del Creador de Reels (v4.664)— y el
  modelo describe cada posición. Una llamada por foto serían diez llamadas por
  solicitud.
- **EL ROL Y LA CATEGORÍA SON CATÁLOGOS CERRADOS.** Un rol que el modelo
  invente cae a «secundaria»; una categoría fuera de las existentes **no se
  crea**: vuelve como `suggested` para que una persona decida. Es la regla de
  las intenciones del CRM y de `validateMeta` en el SEO.
- **LAS ETIQUETAS CONSERVAN LA FORMA QUE EL SITIO YA USA** (`mergeTags` por
  `tagKey`, sin tildes ni caja): con «Sevilla» ya en uso, «sevilla» no crea una
  segunda. Las fijas —club, distrito, campaña, ciudad— van primero porque son
  las que de verdad agrupan.
- **⚠️ `Post` NO GANA NI UNA COLUMNA.** Era el camino corto y es la regla de
  `logo_intl` (v4.699) en su versión más cara: `Post` se consulta con `findMany`
  **sin `select`** en media plataforma, así que una columna declarada y todavía
  inexistente deja en 500 el listado de Noticias y la ficha pública de cada
  artículo. El vínculo va desde `SubmissionArticle.postId`, nunca al revés, y
  una prueba lee `schema.prisma` para comprobarlo.
- **LA TRAZABILIDAD ES BIDIRECCIONAL Y SE PINTA EN LAS DOS PUNTAS**: la ficha
  de la solicitud lleva a «Revisar artículo» y a «Ver publicación»; el listado
  de Noticias marca «SOLICITUD · club» y enlaza «Ver solicitud original» con
  `?abrir=`. `originsForPosts` resuelve el origen de TODO el listado en UNA
  consulta, nunca una por fila.
- **CADA EDICIÓN HUMANA DEJA VERSIÓN, y el historial SÓLO AGREGA.**
  `onPostUpdated` compara la foto anterior con la nueva (`diffSnapshots`) y
  escribe qué campos cambiaron, quién y cuándo; restaurar **no borra**: inserta
  otra versión. Es el patrón de `ReelCopy` (v4.669). El hook se ESPERA antes de
  responder —la función se congela al cerrar la respuesta— y **nunca lanza**:
  un fallo registrando la versión no puede tumbar el guardado de una noticia.
- **REGENERAR ES POR SECCIÓN Y PROPONE ANTES DE APLICAR.** Título,
  introducción, extracto, SEO o redacción; `splitIntro` toca sólo el primer
  párrafo. La propuesta se ve y se aplica a mano, y aplicar deja versión: un
  reemplazo silencioso sería sobrescribir el trabajo de quien editó.
- **EL AVISO ES UN ESTADO OBSERVADO, NO UNA TABLA DE NOTIFICACIONES.**
  `pendingDrafts` cuenta los `borrador_listo` del alcance y la campana del panel
  lo pinta. Sin correos: el pedido dice «notificación en plataforma, sin correos
  innecesarios», y una tabla de avisos se queda desactualizada en cuanto alguien
  revisa desde otra pantalla. El contador **sólo se pinta con algo detrás**
  (v4.650).
- **⚠️ EL TENANT DEL ARTÍCULO LO RESUELVE EL SERVIDOR**: sitio de origen de la
  solicitud → dueño de la campaña → destinatario → **alcance de un solo sitio →
  sitio de la sesión** (las dos últimas, v4.1006 — ver «El artículo nace en un
  sitio»). Sin ninguna, la etapa falla con «sin sitio» en vez de crear un Post
  huérfano que aparecería en el listado equivocado. Y el aislamiento va en el `WHERE` con `campaignIdsInScope` —`null`
  es «todas» y `[]` es «ninguna» (v4.932)—: pedir el artículo de una campaña
  ajena responde **404**, no 403.
- **LA MEDICIÓN REUTILIZA `linkTracking.js` ENTERO** —bots, dispositivo,
  atribución, UTM, `visitorSeed`, `dayKey`— y `visitorKeyFor` de las
  Redirecciones. Escribir un segundo clasificador de bots sería la copia que se
  queda atrás. **La IP no se guarda en ninguna parte**: entra en la semilla y
  sale como hash con sal; una prueba lee el esquema y falla si aparece una
  columna de dirección.
- **UNA VISTA DE WHATSAPP NO ES UNA VISITA.** El bot se cuenta aparte, como en
  los enlaces (v4.993): contarlo infla el número en proporción a lo bien que se
  compartió el artículo.
- **LOS TRES BEACONS VAN POR `sendBeacon`** —`view`, `leave`, `click`—, que
  sobrevive a la navegación; un `fetch` normal se cancela al salir. El golpe se
  escribe en UN viaje a la base con CTEs encadenadas: visitante, evento,
  agregado diario. Y **sólo se mide un artículo PUBLICADO y visible para ese
  sitio**, con la misma cláusula con la que se sirve su ficha.
- **EL INFORME LO CALCULA EL CÓDIGO; EL MODELO SÓLO REDACTA.**
  `buildImpactFacts` saca los hechos y `impactSentence` escribe la conclusión;
  si un modelo la mejora, `summaryIsFaithful` **descarta el texto entero** en
  cuanto trae un número que no está en los hechos. Darle la base a un modelo y
  pedirle «analizá» produce cifras plausibles y no auditables — la regla de
  `crmRecommendations.js` y de `seoAI.js`.
- **LO QUE NO SE MIDE SE DICE.** Las «sesiones» y las «veces compartido» del
  pedido **no se reportan**: una sesión exige una ventana de inactividad que
  este módulo no modela, y compartir sólo es observable cuando el navegador
  ofrece `navigator.share`. Un cero sería una afirmación; un hueco es la verdad.
- **FACEBOOK E INSTAGRAM QUEDAN PREPARADOS, NO IMPLEMENTADOS.** La respuesta de
  estadísticas trae `channels` con el canal `web` medido y los otros dos
  declarados como no disponibles, y `SubmissionArticle` es el eje de
  distribución donde colgarían. Afirmar que se miden sería prometer una
  integración que no existe.
- **La dirección pública de un artículo es `/blog/:slug`**, la que el sitio ya
  sirve (v4.873) — no `/noticias`, que es la pantalla del panel. `publicUrlFor`
  la compone con el dominio del sitio, con conciencia de distrito (v4.744), y se
  guarda en la solicitud al publicar.
- **Las seis tablas viven fuera de Prisma** y están en la lista del guardián de
  `db:push`.
- **Se apaga por campaña** (`autoArticle: false` en la configuración de
  solicitudes, aditivo: `!== false`) **y por entorno** (`SUBMISSION_ARTICLES=off`).
  Nace ENCENDIDO a propósito: una campaña que ya recibe solicitudes empieza a
  producir borradores, que es lo que se pidió, y ningún borrador sale a la luz
  sin que alguien lo publique.


### La extensión de un artículo se configura y se RESUME, no se trunca — v4.1059

Reporte con dos capturas: la Gestión de Noticias del Distrito 4281 y un artículo
que el equipo considera demasiado largo. La extensión objetivo pasa a ser un
ajuste del panel, y cambiarla permite **regenerar** uno o varios artículos.

| Archivo | Qué es |
|---|---|
| `server/lib/articleLength.js` | El CRITERIO. **Puro**: el puente caracteres↔palabras MEDIDO, el piso derivado del informe de SEO, la tolerancia, la validación, el escalado del perfil, el resumen del corpus y el plan del lote |
| `server/lib/articleLengthStore.js` | La I/O: `PlatformConfig`, caché de 60 s e invalidación. Nunca lanza |
| `server/controllers/articleLengthController.js` | La medición del corpus, el panel, el plan y el lote |
| `src/lib/articleLength.ts` | Espejo MÍNIMO: sólo lo que hace falta para pintar el contador |
| `src/components/admin/ArticleLengthPanel.tsx` | El campo, la referencia medida y el perfil resuelto |
| La rama `extension` de `regenerateSection` | La reescritura, desde la solicitud original |

Pruebas: `npm run test:article:length` (137 casos, **sin base, credenciales ni
red**; el bloque de paridad del espejo pide `esbuild` y se salta solo).
Verificadas a la inversa sobre cinco puntos.

**Reglas durables:**

- **⚠️ NO ES QUE NO HUBIERA LÍMITE: ES QUE ESTABA EN PALABRAS, NO ERA
  CONFIGURABLE Y SE ELEGÍA SOLO.** `DEPTH_PROFILES` fija 900 palabras para
  `estandar` y 1.100 para `reportaje` (topes 1.400 y 1.600), y `articleDepth`
  elige el perfil mirando cuánto material trae la solicitud. **Al auditar «no
  hay límite», mirar el prompt y el validador antes que la configuración**: acá
  el límite vivía en los dos y en ningún ajuste.
- **⚠️ Y EL ARTÍCULO REPORTADO ESTABA MUY POR DEBAJO DEL OBJETIVO: 2.938
  caracteres / 461 palabras**, contra un objetivo configurado de ~5.700. El
  problema no era que el modelo se pasara — el objetivo está muy por encima de
  lo que el cliente quiere. Diagnosticarlo como «se pasa» habría llevado a
  apretar el validador, que es lo contrario de lo que hacía falta.
- **⚠️ LA RAZÓN CARACTERES/PALABRA ESTÁ MEDIDA, NO ESTIMADA** (`CHARS_PER_WORD
  = 6,37`, de ese mismo artículo) y se vuelve a medir en producción
  (`summarizeCorpus().charsPerWord`). Un 5 o un 6 redondos habrían corrido el
  piso y el techo sin que nadie pudiera comprobarlo.
- **⚠️ EL PISO NO ES UN GUSTO: SALE DEL PROPIO INFORME DE SEO.** `seoRules.js`
  marca `content_thin` por debajo de 150 palabras y recomienda 300; el mínimo
  configurable es el RECOMENDADO (≈1.911 caracteres), no el umbral de denuncia
  — un artículo que nace justo por encima de 150 pasa el informe por un pelo y
  no compite por nada. Los dos números se EXPORTARON de `seoRules.js` en vez de
  escribirse otra vez: con dos catálogos, el generador cumpliría un número y la
  auditoría aplicaría otro.
- **⚠️ UN OBJETIVO CORTO ESCALA TAMBIÉN LA ESTRUCTURA, y es aritmética.**
  `reportaje` pide 4 secciones de 130 palabras más la entrada: ~3.630
  caracteres SÓLO de mínimos, por encima del techo de un objetivo de 2.500 —
  imposible de cumplir, así que el validador rechazaría toda respuesta y se
  gastarían los reintentos para nada. `profileForTarget` escala secciones y
  palabras por sección proporcionalmente; `maxParagraphWords` se hereda —es
  legibilidad, no extensión—.
- **⚠️ NADA SE TRUNCA, Y ES ESTRUCTURAL.** El valor entra al PROMPT y al
  VALIDADOR; no hay ningún `substring` ni `slice` sobre el cuerpo en todo el
  camino, y una prueba lo lee. Un artículo largo se REESCRIBE resumido, y el
  error que dispara el reintento dice qué se quita (relleno, repeticiones,
  contexto general) y qué NO se sacrifica nunca: hechos, nombres propios,
  lugares, fechas, organizaciones y cifras.
- **ES UN OBJETIVO CON TOLERANCIA** (±18 %, piso de 300 caracteres), no un
  corte exacto, y el prompt lo dice con esas palabras: nunca cerrar una frase a
  la mitad para llegar al número.
- **⚠️ `null` ES «SIN OBJETIVO», ASÍ QUE DESPLEGAR ESTO NO CAMBIÓ NI UN
  ARTÍCULO.** `resolveArticleProfile({config: null})` devuelve EXACTAMENTE el
  preset de siempre, y una prueba lo compara objeto contra objeto. Es la
  comprobación que autoriza el despliegue.
- **⚠️ LA REESCRITURA PARTE DE LA SOLICITUD ORIGINAL, NO DEL TEXTO
  PUBLICADO.** Resumir un resumen degrada el artículo en cada vuelta. El prompt
  declara el contexto de la solicitud como **FUENTE PRIMARIA** y el artículo
  actual como **REFERENCIA SECUNDARIA** —para conservar el ángulo y el orden de
  los hechos, y nada que contradiga a la fuente—. Lo fija una prueba que lee el
  CÓDIGO del prompt, no sus comentarios.
- **⚠️ ANTES DE REEMPLAZAR EL CUERPO SE GUARDA UNA VERSIÓN `previa`**
  (`ensureRestorePoint`), y sólo si el estado actual difiere del último
  guardado. Es lo que hace que un artículo PUBLICADO se pueda regenerar sin
  perder lo que había: `SubmissionArticleVersion` sólo agrega y ya tenía
  restauración. Sin ese punto, «regenerar» sería un borrado con otro nombre.
- **SE CONSERVA TODO LO QUE NO ES EL CUERPO.** La rama escribe `content` y
  nada más: id, slug, imágenes, galería, autor, solicitud asociada, fecha, SEO
  y estado de publicación quedan intactos. Regenerar no publica ni despublica.
- **EL LOTE NO ES ATÓMICO Y SE DICE** (regla de v4.886). Cada artículo reporta
  su desenlace con su motivo, un fallo no cancela los demás, y lo que queda
  fuera se NOMBRA con su bloqueo (`sin_solicitud`, `sin_cuerpo`, `estatico`,
  `ajeno`). Hay presupuesto de tiempo: lo que no entra vuelve como `pending` y
  la pantalla sigue pidiendo hasta terminar — cortar en silencio se leería como
  «ya se regeneraron todos».
- **CONFIRMACIÓN EXPLÍCITA** (`confirm: true`, 428 sin ella) y tope
  `BULK_MAX = 50`. La confirmación DICE el hecho —cuántos artículos y con qué
  objetivo— en vez de preguntar si estás seguro.
- **EL PLAN ES DE SÓLO LECTURA** y se resuelve en el SERVIDOR: cuántos entran,
  cuáles no y por qué, con el objetivo vigente. Con el plan armado en el
  navegador, la pantalla prometería regenerar lo que la API rechaza.
- **⚠️ EL CONTADOR DEL EDITOR AVISA Y NUNCA BLOQUEA.** La configuración
  gobierna lo que escribe la IA, no lo que escribe una persona: un artículo
  editado a mano por encima del objetivo se guarda igual, y lo único que pasa
  es que el contador lo dice. Convertirlo en una restricción destructiva sobre
  la edición humana es exactamente lo que este módulo no hace.
- **⚠️ EL ESPEJO DEL NAVEGADOR ES MÍNIMO.** No trae `validateArticleLength`,
  `profileForTarget`, `resolveArticleProfile` ni `planBulkRegeneration` —qué se
  puede configurar y qué se puede regenerar lo decide el SERVIDOR— y lo fija
  una prueba que comprueba su AUSENCIA leyendo el CÓDIGO, no los comentarios
  (la lección de v4.991). Lo que sí comparte se compara por SALIDAS sobre una
  matriz.
- **LA MEDICIÓN DEL CORPUS ES REAL Y SE DICE CUÁNDO NO SE PUDO.** El panel
  muestra cuántos artículos se midieron, el promedio, el mínimo, el máximo y la
  mediana; si la consulta falla devuelve `measured: false` y `stats: null` en
  vez de inventar un número — un cero sería una afirmación. Está acotada
  (`SAMPLE_LIMIT`, 500) y lo declara (`truncated`).
- **⚠️ LA CONSULTA DEL CORPUS USA `FROM "Post"` SIN ALIAS, a propósito.** La
  cláusula de visibilidad (`visibilitySql`) nombra sus columnas sin calificar:
  reescribirla con un alias sería una segunda versión de la misma regla, la que
  se queda atrás el día que el aislamiento cambie.
- **EL AISLAMIENTO VA EN EL `WHERE`** (`adminScopeFor` → `visibilitySql`) y lo
  editable lo decide `canEditPost`: un artículo ajeno se reporta como bloqueado,
  no se regenera. Guardar el ajuste es del OPERADOR de la plataforma
  (`superAdminOnly`); leerlo, de quien puede ver noticias.
- **LEER LA CONFIGURACIÓN NUNCA LANZA Y VA CACHEADA** (60 s, invalidada por
  toda escritura). Esto corre en el camino de la generación: una configuración
  ilegible degrada a «sin objetivo» —lo anterior a v4.1059— en vez de tumbar la
  generación de un artículo.
- **NO HAY UN SEGUNDO GENERADOR NI UNA SEGUNDA VERSIÓN.** La regeneración es
  `regenerateSection` con una sección nueva (`extension`), así que hereda su
  propose-then-apply, su `checkArticleVeracity` y su versionado. Un camino
  propio se separaría del primero en silencio.

**Pendientes conocidos:** la **estadística del corpus no se pudo calcular en el
entorno de desarrollo** —`DATABASE_URL` está sin definir ahí—, así que los
números reales se ven al abrir el panel en producción: la medición está dentro
del producto, no en un informe suelto. El objetivo es **de la plataforma, no
por sitio** (la columna existiría en `PlatformConfig`, hoy hay una sola fila).
Y la regeneración **no está en la ficha de la solicitud**: se dispara desde
Gestión de Noticias, de a uno o en lote.

### El veredicto de portada es una NOTA, no una exclusión — v4.1009

Reporte con la galería del artículo delante: dos fotografías que el club mandó
aparecían apagadas, con **«Fuera: es demasiado oscura»**, y no llegaban al
artículo publicado. Pedido literal: *«sean videos, sean imágenes, no pueden
quedar fuera; debe ir en la publicación del artículo lo que el club o la
persona rotaria haya solicitado publicar»*.

| Pieza | Qué es |
|---|---|
| `coverExcluded` (`submissionArticleSpec.js`) | El criterio de la PORTADA. No cambió, y su único consumidor legítimo es `pickCover` |
| `AUTO_COVER_NOTES` · `isAutoCoverNote` · `droppedByPerson` | El CRITERIO nuevo. **Puro**: qué motivo lo escribió la automatización y qué archivo dejó fuera una persona |
| `SubmissionArticleMedia."coverNote"` | La nota de portada, separada de `excludedReason` |

Pruebas: dentro de `npm run test:submissions:article` (97 casos, **sin base,
credenciales ni red**). Verificadas a la inversa sobre los cinco puntos.

- **⚠️ ERAN DOS PREGUNTAS OPUESTAS CONTESTADAS CON UN SOLO CAMPO.**
  `coverExcluded` responde «¿sirve de PORTADA?» —y responde bien: una foto
  oscura, borrosa, una captura o casi igual a otra no encabeza un artículo—, y
  su respuesta se escribía en `excluded`, que es lo que
  `syncArticleMedia` filtra para decidir **qué se PUBLICA**. Una foto que
  alguien tomó y nos mandó para que se publicara no llegaba al artículo por no
  servir de portada. Es la forma exacta de FIDELIDAD contra NIVEL DE VIDA
  (v4.675) y del recuento de personas (v4.787): un control correcto aplicado a
  la pregunta de al lado no falla ruidosamente — entrega otra cosa y la
  presenta como resultado.
- **⚠️ Y LA REGLA ESCRITA TAPABA EL DEFECTO.** «LO EXCLUIDO NO SE BORRA:
  `planGallery` lo manda al final de la lista con su motivo» (v4.1000) era
  cierta sobre la FILA y falsa sobre la PUBLICACIÓN — la fila sobrevivía y la
  foto no salía. **Al escribir que algo «no se borra», comprobar qué lee el
  punto que decide lo que se entrega.**
- **⚠️ LO ÚNICO QUE DEJA UN ARCHIVO FUERA ES UNA PERSONA** (`droppedByPerson`),
  y es un solo predicado que comparten `planGallery`, `syncArticleMedia` y la
  respuesta del controlador. Con la pregunta contestada en dos sitios, la
  pantalla mostraría una foto que el artículo no lleva —y en una fila heredada
  eso es exactamente lo que pasaría—. Lo fija una prueba que lee los archivos:
  el criterio puede quedar intacto mientras alguien vuelve a poner
  `filter(m => !m.excluded)` en el motor, y ese fallo es MUDO.
- **LA PORTADA NO SE AFLOJÓ.** `coverExcluded` sigue entero y `pickCover` sigue
  descartando lo oscuro, lo borroso, la captura, el documento y el duplicado:
  lo que cambió es que su veredicto ya no decide la publicación. Una prueba lo
  fija en los dos sentidos.
- **⚠️ LO HEREDADO VUELVE SOLO, SIN MIGRAR NI UNA FILA.** Un despliegue no
  escribe en la base (regla durable desde el 2026-07-13), así que la
  recuperación es el propio predicado: una fila con `excluded = true` y un
  motivo del catálogo CERRADO `AUTO_COVER_NOTES` la excluyó la automatización y
  se INCLUYE. Por eso el catálogo tiene que contener **todo** lo que
  `coverExcluded` devuelve —lo comprueba una prueba—: un motivo sin catalogar
  se leería como la decisión de alguien y esa foto seguiría fuera para siempre.
- **UNA EXCLUSIÓN DE UNA PERSONA SE FIRMA** (`PERSON_EXCLUSION_NOTE`).
  `updateArticleMedia` la escribe en `excludedReason`, así que de ahí en
  adelante la distinción no depende de ninguna heurística; y la firma **no
  está** en `AUTO_COVER_NOTES`, o el predicado se comería la decisión que
  existe para respetar.
- **⚠️ DOS PREGUNTAS, DOS COLUMNAS** (`coverNote`). Reusar `excludedReason`
  para la nota era el camino corto y se rompe solo: excluir a mano habría
  borrado la nota, y la nota se habría vuelto a leer como una exclusión. Va
  ENUMERADA en el atajo del ensure con su comprobación por
  `information_schema` —la trampa de v4.908, más la de v4.944: con el atajo
  contando columnas sin mirarlas, la ráfaga completa del DDL correría en cada
  arranque en frío—.
- **RE-ANALIZAR NO REVIVE UNA EXCLUSIÓN.** El `ON CONFLICT` de la etapa de
  análisis dejó de escribir `excluded` y `excludedReason`: sólo actualiza el
  rol, el orden, la nota, el ALT y el puntaje. Volver a analizar una foto no
  puede deshacer lo que una persona decidió sobre ella.
- **EL DUPLICADO TAMBIÉN SE PUBLICA.** Es lo más discutible de la lista y es
  deliberado: la comparación es una huella perceptual con tolerancia (dHash a
  distancia 6), así que «repite otra foto» alcanza a dos tomas legítimamente
  distintas del mismo momento. Quien revisa puede quitar la que sobre; el
  sistema no decide por él cuál de las dos no cuenta.
- **LA PANTALLA DEJÓ DE DECIR «FUERA» SOBRE ALGO QUE SÍ SE PUBLICA.** La nota
  se pinta en gris y con esas palabras —«se publica; no se sugiere de
  portada»—; el ámbar queda para lo que de verdad está fuera. Un indicador
  contra su veredicto es la contradicción que este archivo ya prohibió dos
  veces (v4.787, v4.799).
- **Los VIDEOS nunca estuvieron afectados**: la etapa de análisis siempre los
  escribió con `excluded: false`. La suposición del reporte —que los dos
  excluidos eran videos— era razonable y no era el caso: eran fotografías con
  su puntaje.

### El cuerpo se desarrolla POR SECCIÓN y las fotos llegan a la portada (v4.1001)

Reporte con la primera prueba real —el artículo de Carmen Elena Román Sánchez,
Sevilla Capital Cafetera—: «el artículo te da una buena estructura, siento que
todavía le falta al cuerpo … y las imágenes no se ubican en la portada ni se
envían a la biblioteca multimedia». Dos defectos distintos.

- **⚠️ EL TOTAL DE PALABRAS NO MIDE SI UN ARTÍCULO ESTÁ DESARROLLADO, y ésa era
  la causa del primero.** `validateArticle` exigía 300 palabras, 3 secciones y
  ningún párrafo de más de 90 — y **nunca miraba una sección por dentro**. Cinco
  `<h2>` con un párrafo de 55 palabras cada uno suman 320, pasan el piso y son
  exactamente lo que se reportó: un índice, no un artículo. La regla dura pasó a
  ser POR SECCIÓN (`sectionsOf`, `minSectionBlocks`, `minSectionWords`) y el
  total quedó de objetivo. El error NOMBRA la sección y sus dos números —«La
  sección «Coordinación y puntos de entrega» tiene 1 bloque y 55 palabras»—,
  porque el bucle le devuelve al modelo la regla concreta y «desarrollá más» no
  corrige nada.
- **Un BLOQUE es un párrafo, una lista o una cita suelta**, contados juntos: una
  sección resuelta con un párrafo y una lista de seis aliados está desarrollada,
  y exigirle dos párrafos la marcaría en falso. Una cita con `<p>` adentro no se
  cuenta dos veces.
- **⚠️ EL MÍNIMO TOTAL NO SE SUBIÓ, y es la decisión que sostiene la
  veracidad.** Subirlo sería lo obvio y es lo peligroso: un piso alto sobre un
  contexto pobre obliga a rellenar, rellenar acá es INVENTAR, y lo inventado lo
  rechaza después `validateEmergencyCopy` quemando los dos intentos. Lo que sube
  es la exigencia de DESARROLLO, y sólo cuando hay con qué.
- **⚠️ LA PROFUNDIDAD SE DERIVA DEL MATERIAL** (`articleDepth`, puro): relato,
  cifras, una cita, varios clubes, el lugar y la fecha. Con `DEEP_ARTICLE_CHARS`
  de texto y tres señales, `reportaje`; si no, `estandar`. **Y el motivo se
  DICE** y queda guardado con el artículo: un perfil que se elige solo y no se
  explica no se puede discutir cuando el texto sale corto. El prompt lleva
  además la contracara —«un artículo corto y cierto es mejor que uno largo e
  inventado»—, o el modelo cumpliría la extensión completando huecos.
- **El perfil es un PARÁMETRO y no una constante porque los dos consumidores del
  generador reciben material distinto**: el Asistente de Redacción escribe desde
  lo que teclee un editor —que pueden ser dos líneas— y el workflow desde un
  brief estructurado. Ante un perfil desconocido, el estándar: equivocarse hacia
  el exigente haría fallar artículos que hoy se entregan bien.
- **⚠️ EL PROMPT DE USUARIO SE RECORTABA A 2.500 CARACTERES Y SÓLO EN GEMINI.**
  Las reglas viven en el prompt del sistema y el CONTEXTO en el del usuario
  (v4.891), así que lo que se cortaba era la materia prima del artículo — y como
  ningún otro proveedor recortaba, el MISMO material llegaba entero o cortado
  según quién de la cadena contestara. Ahora el tope es `maxInputChars`, con el
  valor de siempre por defecto (aditivo) y uno amplio para artículos. **Y el
  recorte dejó de mentir**: el «[Resumen del resto: …]» pegaba los 200
  caracteres siguientes en crudo y los llamaba resumen; ahora corta por palabra
  entera, lo dice y lo anota como aviso.
- **⚠️ EL AVISO DE LAS FOTOS NO TENÍA BOTÓN, y ése era el segundo defecto.** La
  regla estructural no cambió y no se afloja: el archivo de una solicitud vive
  en el prefijo PRIVADO y sólo aprobar el material lo copia al público (v4.968),
  así que el borrador nace sin portada y con la galería vacía. Lo que faltaba
  era poder resolverlo desde donde está el artículo: el aviso decía «entran al
  aprobar el material» y no había forma de aprobarlo ahí — un aviso sin salida
  es un callejón, y el aviso va JUNTO al botón que lo dispara (regla del modo
  Fotográfico, v4.798).
- **UN SOLO CAMINO A LA BIBLIOTECA** (`sendMediaToLibrary`): transición →
  `promoteToLibrary` → `syncArticleMedia`. Lo comparten publicar y el botón del
  panel, y una prueba cuenta que `promoteToLibrary` se llame **desde un solo
  sitio**. Un segundo camino de promoción se separaría del primero en silencio.
- **La confirmación DICE qué va a pasar** —cuántos archivos pasan a la
  Biblioteca, que la portada y la galería quedan puestas y que **el artículo NO
  se publica**—, en vez de preguntar si estás seguro. Y la ruta no exige
  `news.publish`: enviar a la Biblioteca no publica nada, y pedirlo dejaría sin
  aprobar el material a quien sí puede aprobar la solicitud.
- **UN BORRADOR SIN PORTADA SE EXPLICA DONDE SE MIRA, CON SU NÚMERO.** El editor
  de Noticias decía que las fotos entran al aprobar; ahora dice **cuántas**
  esperan y por qué eso deja la portada vacía. El recuento va en la MISMA
  consulta de `originsForPosts` —una por fila dejaría el listado de Noticias con
  una consulta por artículo—.
- **⚠️ EL FIXTURE DE LA PRUEBA CODIFICABA EL DEFECTO.** `cuerpoBueno` en
  `test-article.mjs` tenía secciones de un párrafo y se llamaba «un artículo
  correcto»: la prueba daba por bueno justo lo que el cliente reportó como
  débil. Al ajustar un criterio, mirar si el fixture que lo declara «correcto»
  sigue siéndolo.
- **Y de paso, un guardián roto desde v4.1000**: la comprobación «TODA ruta de
  la bandeja pasa por `requireCampaignAccess`» de `test:contribution:module`
  contaba 8 rutas y las del artículo cuelgan del mismo prefijo, así que llevaba
  una versión en rojo — el suite hermano se corrigió y éste no. Ahora la puerta
  se comprueba sobre TODAS las rutas del prefijo y el conteo excluye las del
  artículo, que tienen su propia comprobación.

### La portada y la galería las pone el WORKFLOW (v4.1002)

Respuesta con la pantalla de Noticias delante y el aviso de v4.1001 a la vista:
*«NO QUEDAN LAS IMÁGENES DE PORTADA Y LA GALERÍA MULTIMEDIA, DEBERÍAN QUEDAR EN
EL WORKFLOW DE LA AUTOMATIZACIÓN»*. Decisión de producto, con el argumento en
contra delante.

- **⚠️ SUPERSEDE «LAS FOTOS ENTRAN CUANDO EL MATERIAL SE APRUEBA» de v4.1000 y
  el botón de v4.1001 como ÚNICO camino.** Aquella regla era correcta sobre el
  ALMACENAMIENTO —el archivo nace en el prefijo privado y sólo `promoteToLibrary`
  lo copia al público— y de ahí se dedujo, mal, que la aprobación tenía que ser
  un gesto humano en otra pantalla. v4.1001 hizo alcanzable ese gesto y el
  resultado seguía siendo un borrador sin portada hasta que alguien lo buscara.
  Lo que se invierte es QUIÉN dispara la secuencia, no la secuencia.
- **⚠️ NO HAY UN SEGUNDO CAMINO DE PROMOCIÓN.** `stageBiblioteca` llama al MISMO
  `sendMediaToLibrary` que usan el botón del panel y publicar, y una prueba
  comprueba que `promoteToLibrary` se siga llamando **desde un solo sitio** y que
  la etapa no transicione ni promueva por su cuenta. Un segundo camino se
  separaría del primero en silencio (regla del sitio desde v4.967).
- **⚠️ VA DESPUÉS DE `borrador` PORQUE NECESITA EL POST.** `syncArticleMedia`
  escribe `image`, `images`, `videoGallery` y `seoImage` sobre una fila que tiene
  que existir. Antes del borrador no habría dónde escribir, y `stagePortada` /
  `stageMultimedia` sólo PLANIFICAN — no copian ningún archivo.
- **ES OPCIONAL, Y ESO ES LO QUE PROTEGE EL ARTÍCULO.** Un fallo copiando
  archivos no puede costar el texto: el borrador queda `borrador_listo` con
  «pendiente: biblioteca», el motivo escrito, y `stageToRetry` reintenta **sólo
  esa** —lo que está en `ok` no se regenera—. El botón de la ficha se conserva
  como reintento manual, y el aviso lo DICE: presentarlo como el único camino
  volvería a ser falso.
- **⚠️ LA CONSECUENCIA SE DICE COMPLETA: promover HACE PÚBLICOS los archivos y
  APRUEBA la solicitud.** La copia al prefijo público de la Biblioteca les da
  dirección alcanzable, y la solicitud pasa a «aprobado» → «listo para difusión»
  con `actor: 'ai_workflow'`, así que el historial dice que no fue una persona.
  Promover sin transicionar habría sido peor: los archivos quedarían en la
  Biblioteca con la bandeja afirmando que siguen privados — dos verdades sobre
  lo mismo.
- **⚠️ EL ARTÍCULO SIGUE SIN PUBLICARSE SOLO, y eso NO se afloja.** El
  `INSERT INTO "Post"` conserva su `published FALSE` literal y el único
  `UPDATE … published = TRUE` sigue viviendo dentro de `publishArticle`. Una
  prueba cuenta los puntos que publican y comprueba dónde caen: la etapa nueva
  toca la Biblioteca, nunca la publicación.
- **⚠️ UNA DECISIÓN HUMANA NO SE PISA** (`AUTO_APROBABLES`). El workflow
  aprueba lo que NADIE decidió todavía —`recibido` o `en_revision`—; una
  solicitud que alguien mandó a «requiere información», descartó o archivó se
  deja como está y la etapa lo DICE. La guardia vive en la ETAPA y no en
  `sendMediaToLibrary`: ahí quien decide es la persona que pulsa el botón, y
  meterla adentro le quitaría al equipo la vía de aprobar lo que había pedido
  completar. Y se decide con una lectura FRESCA de la solicitud: entre
  `loadContext` y la etapa alguien pudo tocar la ficha, y decidir con una
  lectura vieja es decidir sobre algo que ya no es.
- **SE APAGA POR CAMPAÑA Y POR ENTORNO**, como `autoArticle`: `autoLibrary` en
  la configuración de solicitudes (aditivo, `!== false`, así que una campaña
  guardada antes de v4.1002 queda encendida) y `SUBMISSION_ARTICLE_LIBRARY=off`.
  **Apagado, la etapa se cierra en `ok` con su motivo escrito, no en `error`**:
  dejarla pendiente para siempre haría que un artículo correcto se leyera como
  incompleto.
- **La configuración de la campaña se lee en `loadContext`**, no dentro de la
  etapa: una consulta por vuelta del workflow para leer dos interruptores es una
  consulta de más, y `loadContext` ya trae la campaña.
- **La nota de la etapa lleva la MEDIDA** —cuántos archivos llegaron, si quedó
  portada, cuántos fallaron—, no un «listo». Una promoción a medias presentada
  como éxito haría creer que están todas las fotos.


### El encuadre de la portada: un PUNTO, no un recorte — v4.1007

Reporte con dos capturas: en el editor la portada se ve entera y en
`/blog/:slug` sale «mocha» —sin las cabezas—, con el pedido de «poder
seleccionar el área que va a aparecer».

| Archivo | Qué es |
|---|---|
| `server/lib/mediaFocal.js` | El CRITERIO. **Puro**: normalización, `object-position`, la aritmética de `object-cover` (`visibleRegion`), si un punto sobrevive y qué se guarda |
| `src/lib/mediaFocal.ts` | Espejo MÍNIMO, comparado por SALIDAS. **Sin `focalRecord`** |
| `Media."focal"` | Dónde vive: JSONB en la FOTOGRAFÍA, resuelto por URL |
| `GET`/`PUT /api/media/focal` | Leer y escribir, literales ANTES de las paramétricas |
| `CoverFocusModal` en `News.tsx` | El área dibujada sobre la foto entera y las dos vistas previas |
| `attachImageFocus` en `contentController.js` | La lectura pública, en su propia consulta y sin lanzar |

Pruebas: `npm run test:media:focal` (55 casos, **sin base, credenciales ni
red**; el bloque del espejo pide `esbuild` y se salta solo). Verificadas a la
inversa.

- **⚠️ NO FALTABA UN RECORTADOR: EL EDITOR TIENE UNO DESDE HACE VERSIONES**
  (`CropModal`, 16:6). Lo que fallaba es que **un recorte no puede resolver
  esto**: el hero mide `w-full h-[400px] md:h-[500px]`, así que su PROPORCIÓN
  cambia con el ancho de la ventana —≈0,98 en un teléfono de 390 px, 2,88 a
  1440, 3,84 a 1920— y `object-fit: cover` recorta al CENTRO lo que sobra.
  Medido: una foto 4:3 en el hero de 1920×500 empieza a verse en el **32,6 %**
  de su alto —las cabezas se van— y una ya recortada a 16:6 **sigue perdiendo
  arriba y abajo**. Lo que sobrevive a un recorte de proporción variable es un
  PUNTO, no un rectángulo. Al diagnosticar «se ve cortada», mirar primero qué
  proporción tiene la caja que la recorta.
- **⚠️ EL ENCUADRE ES DE LA FOTOGRAFÍA, NO DEL ARTÍCULO.** «Dónde están las
  caras» es una propiedad de la foto: vive en `Media."focal"`, se elige una vez
  y vale para el hero, para las tarjetas del listado y para cualquier artículo
  que use esa imagen. En `Post` sería además **imposible**: esa tabla no gana
  columnas (regla de `logo_intl`, v4.699, reafirmada en v4.1000), y una prueba
  lee `schema.prisma` para comprobarlo.
- **SE RESUELVE POR URL, no por id** (regla de v4.967). Quien acaba de elegir
  la foto tiene el id a mano; quien reabre un artículo de hace meses sólo tiene
  la URL de `Post.image`. Con el id como llave, el encuadre sólo se podría
  tocar en el mismo gesto en que se elige la foto.
- **⚠️ LA LECTURA PÚBLICA VA EN SU PROPIA CONSULTA Y NUNCA LANZA.** Meter el
  encuadre en el `SELECT` del artículo haría que la ficha dependiera de que la
  columna exista, y el `build` no ejecuta `db push`: entre el despliegue y la
  primera pasada del ensure **toda página de artículo respondería 500** (la
  lección de v4.944). Sin encuadre la portada se ve como hasta ahora, que es un
  defecto de encuadre y no una página caída.
- **`Media."focal"` está declarada en `schema.prisma` Y en el ensure**, y
  **ENUMERADA en el atajo** (trampa de v4.908): `CREATE TABLE IF NOT EXISTS` no
  amplía nada, así que sin enumerarla el `ALTER` no correría jamás sobre una
  base que ya tiene `Media`. La prueba recorre **todos** los `ADD COLUMN` del
  archivo — y así destapó que `MediaFolder.sourceType` y `campaignId` nunca
  estuvieron en el atajo: entraban junto a `sourceId` **por casualidad**, igual
  que `feed` en v4.987. Se enumeran todas.
- **⚠️ Y AL ESCRIBIR ESE COMENTARIO SE VOLVIÓ A PAGAR LA TRAMPA DE LAS COMILLAS
  INVERTIDAS**: el SQL vive en un template literal, así que citar `feed` con
  comillas invertidas dentro de un comentario del SQL **cierra el literal** y
  el módulo entero deja de parsear. Ya había pasado en `ensureDesignSchema.js`
  (v4.721.1) y en el libro mayor (v4.847). Dentro de un `db.query(\`…\`)`, ni
  una comilla invertida — tampoco en un comentario.
- **UN ENCUADRE CENTRADO SE GUARDA COMO NULL, o sea que se borra.** Decir «el
  centro» y no decir nada significan lo mismo para quien pinta; dejar escrito
  lo que no aporta convierte «esta foto tiene encuadre» en una afirmación que
  no distingue nada. Pero `null` y «el centro» **sí** se distinguen al LEER:
  sólo así la pantalla puede decir «centrado» sin mentir.
- **`objectPositionOf` devuelve el centro EXPLÍCITO cuando no hay encuadre**,
  no `undefined`: un solo camino de pintado, en vez de uno con `style` y otro
  sin él que puedan comportarse distinto.
- **⚠️ EL CONTROL SE VE; NO SE ESCONDE EN EL HOVER.** Se reportó como «no me
  permite seleccionar el área»: elegir la portada del material o de la
  Biblioteca **no pasaba por ningún paso de encuadre** —eso sólo ocurría al
  subir desde el computador— y el botón de recortar sólo aparecía al pasar el
  cursor por la miniatura. Un control que hay que descubrir es, para quien lo
  necesita, un control que no está.
- **LA VISTA PREVIA ES EL RESULTADO, no una aproximación**: usa el MISMO
  `object-cover` + `object-position` del hero, y el rectángulo que se dibuja
  sobre la foto entera sale de `visibleRegion`, la misma aritmética. Y **las
  cajas de la vista previa siguen al hero de verdad**: una prueba lee
  `BlogPost.tsx` y falla si `h-[400px] md:h-[500px]` cambia sin que
  `HERO_PREVIEWS` lo siga — si no, la vista previa prometería un encuadre que
  no es.
- **SIN LAS MEDIDAS DE LA IMAGEN NO SE DIBUJA NADA.** `visibleRegion` devuelve
  `null` con medidas imposibles: pintar un rectángulo aproximado sería afirmar
  un encuadre que no se calculó.
- **EL RECORTE DEL ARCHIVO SIGUE EXISTIENDO, y son dos cosas distintas.**
  Aquél corta el ARCHIVO a 16:6 y sube uno nuevo; éste elige qué parte queda
  dentro y **no toca el archivo**. Conviven a propósito y una prueba lo fija:
  no contradice la regla #1 del sitio, que prohíbe retocar el output de un
  motor GENERATIVO — acá no hay modelo, es una decisión declarada de una
  persona sobre su propia foto, como el recorte de video de v4.934.
- **UNA PORTADA SIN FICHA EN LA BIBLIOTECA NO ES UN ERROR**: es una dirección
  externa o una subida antigua. Se dice —y el botón de guardar se apaga— en vez
  de fallar; la foto se sigue viendo, centrada, como hasta ahora.
- **`CoverFocusModal` vive en el ÁMBITO DEL MÓDULO** (v4.971): declarado dentro
  de la pantalla sería un tipo nuevo en cada render y React desmontaría el árbol
  a cada arrastre.
- **El aislamiento va en el `WHERE`** y el CÓDIGO decide qué se guarda
  (`focalRecord` acota a 0-1 y convierte el centro en NULL): el cuerpo de la
  petición no elige el valor guardado. Varias filas con la misma URL se
  encuadran todas — son la misma imagen.
- **El espejo NO trae `focalRecord`**, a propósito: quien decide qué se
  escribe es el servidor. Con dos criterios, la pantalla y la base podrían
  discrepar sobre el mismo encuadre.

**Pendientes conocidos:** el `og:image` que compone `seoServe` **no aplica el
encuadre** —una tarjeta de WhatsApp o de Facebook recorta a su manera y ahí no
hay `object-position` que valga: haría falta generar una variante recortada, y
eso sí crea archivo—; y la Biblioteca Multimedia **no ofrece encuadrar una foto
desde su propia ficha**: hoy se hace desde el editor del artículo, que es donde
se pidió.

### El material del club se elige DESDE NOTICIAS (v4.1003)

Reporte revisando el artículo real: *«cuando voy a elegir una imagen de portada,
me lleva a la opción de subir; igual en Galería & Media»*, con el pedido de que
esos campos queden atados al material que suministró el club.

- **⚠️ EL SELECTOR YA EXISTÍA Y ESTABA ENTERRADO EN LA OTRA PANTALLA.** El
  bloque «Portada y galería» —con su elección de portada, su orden, su texto
  alternativo y su botón para traer las fotos— vive desde v4.1000 dentro de
  `SubmissionArticlePanel`, o sea en la **bandeja de solicitudes**. Pero este
  mismo archivo dice que **el texto se edita en Noticias**, y ahí las dos
  casillas de imagen sólo ofrecían `<input type="file">`: quien revisaba el
  artículo no tenía por dónde usar las fotos del club. No se construyó un
  segundo selector — se **extrajo a `ArticleMediaPicker` y se monta en las dos**
  (la regla de `SubmissionDetail`, v4.999). Lo fija una prueba que exige el
  import y el montaje en los dos archivos, y que el panel ya no lleve su copia.
- **⚠️ ESCRIBE POR EL CAMINO DE SIEMPRE.** Guardar es `PUT …/article/media`
  (`updateArticleMedia` → `syncArticleMedia`) y traer las fotos es
  `POST …/article/library` (`sendMediaToLibrary`, el MISMO del workflow). Una
  prueba cuenta las escrituras del componente: **dos**. Un segundo circuito se
  separaría del primero en silencio (regla del sitio desde v4.967).
- **⚠️ Y POR ESO LA VISTA COMPLETA VUELVE AL CONSUMIDOR** (`onView`). El
  servidor acaba de reescribir `image`, `images` y `videoGallery` del Post: si
  el formulario abierto en Noticias no se entera, «Guardar Cambios» escribiría
  encima la portada anterior — y se leería como que elegir la foto no funcionó.
  `aplicarMediaDeSolicitud` refresca los tres campos y el recuento de lo que
  falta; los DOS montajes lo pasan.
- **⚠️ LA SINCRONIZACIÓN SÓLO PISA LA PORTADA QUE PUSO EL WORKFLOW.**
  `pisarPortada` incluía `urlsConocidas.has(post.image)` —«la portada actual es
  una foto de la solicitud, luego es nuestra»— y desde v4.1003 elegir una de
  esas fotos a mano **es el caso normal**: la siguiente sincronización la
  revertía sin decir nada. `coverSynced` responde la pregunta exacta y el Post
  nace con `image = NULL`, así que la primera vez entra igual. `forceCover` es
  la única excepción y es explícita: una persona acaba de decir «usá ésta» desde
  el selector, y sin ella su elección no se aplicaría cuando la portada anterior
  también la había puesto ella. Lo fuerza **un solo** llamador
  (`updateArticleMedia`); el workflow y la promoción, no.
- **⚠️ LAS DOS CASILLAS DE NOTICIAS OFRECEN LAS DOS VÍAS** (regla de v4.700,
  que este archivo llevaba incumpliendo desde siempre en esta pantalla). Portada
  y galería abren además la Biblioteca Multimedia, con **UN solo `MediaPicker`**
  y el destino en `pickerTarget`: uno por casilla los deja separarse. La portada
  admite una sola imagen; en la galería, un video elegido va a `videoGallery` y
  no a `images` — mezclarlos dejaría un `<img>` apuntando a un mp4.
- **El material del club va PRIMERO en la pestaña de galería.** Es lo que esta
  noticia tiene que mostrar; subir un archivo suelto es la excepción.
- **Una solicitud sin archivos lo DICE** en vez de dejar el bloque vacío, y un
  fallo cargando el material no rompe el editor: se pinta su motivo.

### Y cuando no se resuelve, se PREGUNTA — v4.1008

Tercer reporte del mismo bloqueo, con v4.1006 desplegado y la ficha delante:
«Falló «Validando la solicitud…»: No se pudo determinar en qué sitio nace el
artículo». La cascada de v4.1006 es correcta y sigue entera; lo que faltaba es
la otra salida.

| Pieza | Qué es |
|---|---|
| `articleSiteChoices` · `siteMatchKey` · `isChoosableArticleSite` (`submissionArticleSpec.js`) | El CRITERIO. **Puro**: qué sitios son elegibles, cuáles participaron en la actividad y el orden |
| `siteChoicesFor` · `chooseArticleSite` (`submissionArticleEngine.js`) | La I/O: qué filas de `Club` mirar y el candado al atar |
| `POST …/article/site` → `chooseSubmissionArticleSite` | La acción, con su evento en el historial |
| El bloque `necesitaSitio` en `SubmissionArticlePanel.tsx` | El desplegable, junto al mensaje que lo reclama |

Pruebas: dentro de `npm run test:submissions:article` (92 casos, **sin base,
credenciales ni red**). Verificadas a la inversa sobre once defectos.

- **⚠️ ELEGIR NO ES ADIVINAR, y de esa distinción cuelga todo.** La cascada de
  v4.1006 recorre señales DECLARADAS y se detiene antes que deducir el sitio
  del distrito de la actividad o del club que envió — **eso sigue sin hacerse
  y no se afloja**. Lo que se agrega es que una persona con nombre lo DIGA,
  que es exactamente lo que justifica la señal `sesion`, sólo que explícito.
- **⚠️ LAS DOS SALIDAS QUE OFRECÍA EL MENSAJE NO RESUELVEN ESTE ARTÍCULO, y
  por eso se reportó tres veces.** «Generá el artículo desde el panel del sitio
  que va a publicarlo» le pide cambiar de panel al OPERADOR, que no tiene sitio
  propio —`req.campaignScope.clubId` vale null para él, y debe valer null
  (v4.853)—; «declará el club beneficiario de la campaña» cambia la campaña
  ENTERA —su página pública y todas sus demás solicitudes— para desatascar un
  artículo. Un bloqueo cuyas salidas son «andá a otra pantalla» o «cambiá otra
  cosa» se lee como una avería. **Al escribir la salida de un bloqueo,
  preguntarse si quien lo va a ver puede tomarla.**
- **⚠️ LO ELEGIBLE SE ACOTA A LO QUE LA CAMPAÑA ALCANZA, con el MISMO
  `targetsSite` de la página pública** (v4.807). No es formalidad: el artículo
  enlaza a la landing de la campaña en el sitio que lo publica, y un sitio que
  la campaña no alcanza no la muestra — el enlace no llevaría a ninguna parte.
  Un segundo criterio de alcance daría una lista que la página no respalda.
- **⚠️ EL CUERPO PROPONE Y EL SERVIDOR DECIDE.** El id viaja del navegador y se
  comprueba contra la lista que arma el servidor: sin eso, acotar la elección
  no serviría de nada y quien conociera el endpoint publicaría en cualquier
  sitio del ecosistema (v4.868).
- **UN SITIO YA RESUELTO NO SE PISA** (`WHERE "clubId" IS NULL`, el mismo
  candado de `adoptArticleSite`). Que otro administrador abra la misma
  solicitud desde otro panel no puede mover un artículo que ya nació — y menos
  uno publicado, que arrastraría su dirección pública. Responde **409**.
- **⚠️ LA ELECCIÓN NO ES UNA SEÑAL MÁS DE LA CASCADA: se persiste en `clubId`,
  que es la PRIMERA.** Metida como sexta señal, el orden que hace que la misma
  solicitud resuelva al mismo sitio la abra quien la abra dejaría de valer.
  Persistida, es estable por construcción: la segunda persona ve `articulo`.
  Lo fija una prueba que cuenta los ids de `ARTICLE_SITE_SOURCES`.
- **NADA VIENE PRESELECCIONADO.** Los clubes que PARTICIPARON van primero y se
  dicen con esas palabras —con una campaña de distrito la lista son setenta
  nombres y encontrar el suyo a mano es donde alguien se equivoca—, pero eso es
  CONTEXTO: informa, no decide. Dejar uno marcado convertiría la ayuda en la
  deducción que la cascada evita, aceptada por reflejo.
- **⚠️ EL NOMBRE SE COMPARA SIN EL PREFIJO INSTITUCIONAL Y **EXACTO**
  (`siteMatchKey`). El catálogo curado guarda «Quimbaya» —es lo que hace usable
  un desplegable de 74 entradas— y el sitio se llama «Rotary Club Quimbaya»:
  sin quitar el prefijo, un club que sí participó nunca casaría. Y exacto
  porque la contención («Cali» dentro de «Cali San Fernando») afirmaría que
  participó un club que no — un falso positivo acá no es un orden distinto, es
  una frase falsa.
- **⚠️ LOS CLUBES PARTICIPANTES SE LEEN DE SU TABLA SI NO VIENEN PUESTOS.**
  `getSubmission` devuelve la fila y los participantes viven en
  `ContributionSubmissionClub` (v4.972): sin esa lectura dentro de
  `siteChoicesFor`, el grupo se llenaría desde el motor y **nunca desde el
  controlador** —que es justo desde donde lo mira quien elige—, en silencio.
- **UN SITIO DADO DE BAJA NO SE OFRECE**: no publica nada, y ofrecerlo sería
  una elección que no se puede cumplir (v4.650).
- **LAS OPCIONES SÓLO SE CALCULAN CUANDO FALTA EL SITIO.** Con el sitio
  resuelto la lista viaja vacía y la pantalla ni la pinta: una consulta de más
  en cada sondeo de un artículo que ya tiene sitio no la paga nadie.
- **QUEDA ESCRITO QUIÉN LO ELIGIÓ** (`article_site_chosen` en el historial de
  la solicitud, que sólo agrega). La cascada anota de qué SEÑAL salió el sitio;
  una elección a mano no tiene señal que anotar, así que sin esto «¿por qué
  este artículo quedó en este sitio?» no se puede contestar dentro de seis
  meses.
- **⚠️ AL AGREGAR UNA VÍA, SE CUENTAN LOS LLAMADORES Y SE EXIGE LA REGLA, no un
  número fijo.** La guardia de v4.1006 exigía TRES llamadas a `advanceArticle`
  y esta versión agrega la cuarta: fijada en tres, una vía nueva hace fallar la
  prueba **por existir** en vez de por saltarse la regla, y lo cómodo es subir
  el número — que es exactamente perder la comprobación. Ahora exige que
  **todas** pasen `sessionClubId`. La de `adoptArticleSite` sí queda en un
  número, porque ahí lo que se protege es que no aparezca un tercer punto que
  escriba `clubId` sin declararse.
- **NO SE MIGRA NI UNA FILA.** Las solicitudes atascadas resuelven eligiendo el
  sitio en su ficha; las que la cascada sí resuelve se comportan igual que
  antes.

### El artículo nace en un sitio, y eso se RESUELVE — v4.1006

Reporte con la ficha delante: «Falló «Validando la solicitud»: No se pudo
determinar en qué sitio nace el artículo». «Reintentar» repetía el mismo
mensaje indefinidamente y no había ninguna otra acción a la vista.

| Pieza | Qué es |
|---|---|
| `resolveArticleSite` · `articleSiteHelp` (`submissionArticleSpec.js`) | El CRITERIO. **Puro**: la cascada de señales, de qué señal salió y qué hacer cuando ninguna resuelve |
| `singleTargetClubId` (`submissionArticleEngine.js`) | La señal `alcance`: el único sitio al que apunta la campaña |
| `adoptArticleSite` | Ata el artículo al sitio de la sesión. UN solo punto, `WHERE "clubId" IS NULL` |
| `sessionClubIdOf` (`submissionArticleController.js`) | El sitio desde cuyo panel se pide, desde `req.campaignScope` |

Pruebas: dentro de `npm run test:submissions:article` (81 casos, **sin base,
credenciales ni red**). Verificadas a la inversa sobre diez defectos, incluido
el del reporte.

- **⚠️ LA CAUSA ERA UNA CASCADA INCOMPLETA, NO UN DATO PERDIDO.** v4.1000
  declaró tres señales —origen de la solicitud, dueño de la campaña,
  destinatario— y alcanzaban mientras toda campaña tuviera dueño. NO alcanzan
  para la combinación que es la NORMAL en este cliente: una campaña de la
  PLATAFORMA (`ownerClubId` es NULL **por definición**, v4.987) que recibe
  solicitudes anteriores a v4.999 (`originClubId` es aditivo y vale null para
  todas ellas — rellenarlo hacia atrás sería inventar el dato que se vino a
  medir). Las tres daban null a la vez. **Al declarar una cascada de señales,
  preguntarse si existe una combinación en la que todas se apaguen.**
- **⚠️ LAS DOS SEÑALES NUEVAS NO INVENTAN NADA, y por eso son admisibles.**
  `alcance` la declaró quien fijó el alcance de la campaña; `sesion` es una
  persona con nombre parada en el panel del sitio que va a publicar, y
  `requireCampaignAccess` ya demostró que ese sitio alcanza la campaña. Lo que
  se sigue sin hacer es deducir el sitio del distrito de la ACTIVIDAD o del
  club que envió: eso sí sería adivinar quién publica.
- **⚠️ EL ORDEN NO ES NEGOCIABLE: LO QUE DECLARA LA CAMPAÑA VA ANTES QUE QUIEN
  PREGUNTA.** Así la misma solicitud resuelve al mismo sitio la abra quien la
  abra. Con la sesión primero, dos administradores distintos producirían el
  mismo material como dos artículos en dos organizaciones distintas.
- **⚠️ EL SITIO DE LA SESIÓN NO ES `req.user.clubId` A SECAS.** Para el operador
  de la plataforma ese valor es el sitio por el que ENTRÓ —«Origen»—, no el que
  va a publicar: usarlo pondría el artículo en el listado de otra organización
  (la lección de v4.853). Sale de `req.campaignScope.clubId`, que ya vale `null`
  para el operador y ya está acotado por el mismo criterio de alcance. Lo fija
  una prueba que lee el controlador.
- **⚠️ EL SITIO SE ADOPTA EN UN SOLO PUNTO.** Las cuatro vías que hacen avanzar
  el workflow desde una pantalla —generar, sondear, reintentar la etapa y volver
  a la cola— convergen en `advanceArticle`; con una adopción por vía, la cuarta
  se queda sin ella **en silencio** y el mismo botón funciona o no según por
  dónde se pulse. Una prueba cuenta los llamadores: uno.
- **UN SITIO YA RESUELTO NO SE PISA** (`WHERE "clubId" IS NULL`). Que otro
  administrador abra la misma solicitud desde otro panel no puede mover un
  artículo que ya nació —y menos uno publicado, que arrastraría su dirección
  pública—. Es la misma guardia con la que `ensureLibraryFiling` respeta una
  carpeta elegida a mano.
- **⚠️ EL SITIO DE LA SESIÓN VIAJA COMO PARÁMETRO, NO PEGADO A LA FILA.**
  `claim()` devuelve una fila FRESCA de la base y `row = reclamada` se llevaría
  por delante cualquier campo colgado encima, sin dar ningún error: la señal
  llegaría muda justo en la etapa que la necesita. Lo destapó escribirlo así y
  releerlo, no una prueba.
- **`all` NO RESUELVE UN SITIO.** Una campaña que apunta a todos apunta a todos:
  elegir uno sería inventar cuál. `clubs` con un id sólo COMPRUEBA que ese sitio
  exista —uno colgado dejaría el Post apuntando a un sitio que no está— y
  `districts` con un distrito se resuelve con `pickDistrictSite`, el MISMO
  criterio de v4.744: un segundo criterio daría un sitio distinto del que sirve
  rotary4281.org. Nunca lanza: es una señal más, no un requisito.
- **DE QUÉ SEÑAL SALIÓ EL SITIO QUEDA ESCRITO** en la nota de la etapa. Sin eso,
  «¿por qué este artículo quedó en este sitio?» no se puede contestar dentro de
  seis meses.
- **⚠️ EL MOTIVO DE UNA ETAPA FALLIDA SE LEE ENTERO, Y DICE LA SALIDA.** Iba con
  `truncate max-w-md` y un `title` que nadie abre, así que lo que el servidor
  escribiera después de los primeros caracteres era invisible: el aviso se leía
  como un callejón. Ahora cuelga debajo de la etapa, completo, y el mensaje
  nombra qué hacer —generarlo desde el panel del sitio, o declarar el club
  beneficiario de la campaña—. El resumen del estado se recorta **sin partir
  palabras** (`truncateAtWord`): un corte a mitad de palabra se lee como un
  error del sistema.
- **NO SE MIGRA NI UNA FILA.** Lo que estaba escrito era correcto; lo que
  faltaba era la cascada. Las solicitudes atascadas resuelven solas al volver a
  pulsar «Generar» o «Reintentar» desde el panel de su sitio.
### El material vive en la CARPETA de su solicitud (v4.1004)

Reporte con el artículo real delante: «Faltan 10 archivos por llegar a la
Biblioteca Multimedia» y, al pulsar «Imagen de Portada», el explorador de
archivos del computador. Dos defectos distintos con la misma consecuencia —
volver a subir a mano lo que el club ya mandó.

| Archivo | Qué es |
|---|---|
| `server/lib/submissionFolderSpec.js` | El CRITERIO. **Puro**: nombre de la raíz, nombre derivado del título, recorte por palabra, liberación del nombre repetido |
| `server/lib/submissionFolders.js` | La I/O: resolver la carpeta, recoger lo ya promovido, la ficha y el origen |
| `ensureSubmissionFolder` · `fileFolderBackfill` · `folderOrigin` | Las tres operaciones que sostienen el módulo |
| `runLibraryStage` · `sweepArticleLibrary` en `submissionArticleEngine.js` | La etapa para lo que YA se generó |

Pruebas: `npm run test:submissions:folders` (22 casos, **sin base, credenciales
ni red**) y `npm run test:submissions:folders:ui` (18 en un navegador con la API
interceptada y el CSS compilado; pide `playwright`, `esbuild` y `dist/`, y se
salta solo). Verificadas a la inversa sobre diez defectos, incluidos los dos del
reporte.

- **⚠️ QUE EL SELECTOR ABRA EN LA CARPETA SE MIDE EN UN NAVEGADOR, y lo que se
  mide es la PETICIÓN.** Que se vean diez tarjetas podría ser casualidad; que el
  servidor reciba `folderId` sólo ocurre si el selector se paró ahí. Es lo que
  se pidió mirando la pantalla, y una dependencia que falte en un manejador no
  la ve el typecheck (la lección de `conQr`, v4.836).

- **⚠️ EL DEFECTO DE FONDO NO ERA QUE LA ETAPA NO EXISTIERA: ES QUE NO CORRÍA
  PARA LO YA GENERADO.** `stageBiblioteca` existe desde v4.1002 y sólo la
  dispara `advanceArticle`, que arranca con `if (!isWorkingState(row.status))
  return done`. Un artículo anterior quedó en `borrador_listo` —que NO es un
  estado de trabajo— así que el motor lo daba por terminado y la etapa nueva no
  corría para él **jamás**: de ahí el «Faltan 10 archivos» con el botón manual
  como única salida. **Reactivar el estado habría sido peor**: un artículo que
  alguien está revisando volvería a «generando» y el motor podría pisarle el
  trabajo. `runLibraryStage` corre SÓLO esa etapa, escribe su casilla de
  `stages` y **no toca `status`** — lo fija una prueba que mira el UPDATE.
- **HAY TRES VÍAS Y LLAMAN A LA MISMA FUNCIÓN**: el cron (segunda pasada de
  `submission-articles-tick`, con lo que sobre del presupuesto), el sondeo de la
  pantalla (`advanceArticle` sobre un artículo cerrado) y el botón de la ficha.
  Es el patrón del Creador de Reels (v4.670), y el tope de `STAGE_MAX_TRIES` es
  lo que impide que un fallo persistente se reintente en cada sondeo.
- **⚠️ LA RELACIÓN VA POR ID, NUNCA POR NOMBRE.** La identidad de la carpeta es
  `(clubId, sourceType, sourceId)` con índice único PARCIAL; el nombre es sólo
  lo que se lee en pantalla y se puede renombrar sin romper nada. Buscarla por
  nombre encontraría la de otra solicitud —dos títulos iguales son normales, y
  el tope de 60 caracteres recorta el del reporte, que mide 83— o ninguna, y el
  fallo sería MUDO: una carpeta nueva por reproceso, con el material repartido.
- **Por ser PARCIAL, NO se usa `ON CONFLICT` contra ese índice** (la trampa de
  v4.648): tendría que repetir su predicado exacto o la sentencia falla entera.
  La idempotencia es SELECT → INSERT → y ante el choque `23505`, volver a leer —
  que además cubre la carrera entre el cron, el sondeo y el botón.
- **⚠️ LAS TRES COLUMNAS NUEVAS ESTÁN ENUMERADAS EN EL ATAJO DEL ENSURE** (la
  trampa de v4.908). `CREATE TABLE IF NOT EXISTS` no amplía nada: toda base
  tiene ya `MediaFolder`, así que con el atajo mirando sólo tablas el `ALTER` no
  correría **nunca** y el INSERT fallaría con «column does not exist».
- **`MediaFolder.sourceType` NO es `Media.sourceType`, y no se reutilizó aquel
  nombre por casualidad.** En `Media` significa DE QUIÉN es el archivo
  (club/district/project/platform) y lo consume el filtro por sitio del
  selector; acá significa QUÉ ORIGINÓ la carpeta. Meter `content_submission` en
  el de `Media` habría sacado esas fotos del filtro por sitio, en silencio.
- **⚠️ NO PODER ORDENAR NO PUEDE COSTAR EL MATERIAL.** Con la carpeta sin
  resolver, `folderId` queda en `null` y la promoción **sigue**: los archivos
  quedan en la raíz de la Biblioteca, que es exactamente donde quedaban hasta
  v4.1003. El motivo viaja en `folderNote` y se anota en el historial. Perder el
  material por no poder ordenarlo sería cambiar un problema de orden por uno de
  contenido.
- **⚠️ LO VIEJO SE RECOGE SIN MOVER UN BYTE Y SIN MIGRACIÓN.** Una solicitud
  promovida antes de v4.1004 tiene sus `Media` creados, así que
  `promoteToLibrary` no llega a correr para ella —no queda nada por copiar— y la
  carpeta no nacería nunca. `ensureLibraryFiling` la resuelve y asigna las filas
  huérfanas con un UPDATE de una columna. Va en el camino de «ya estaban» de
  `sendMediaToLibrary`, y lo fija una prueba.
- **Y NO SE PISA UNA CARPETA YA ELEGIDA** (`WHERE "folderId" IS NULL`). Si
  alguien movió esa foto a otra carpeta desde la Librería, ésa es su decisión, y
  traerla de vuelta en cada sincronización sería desobedecerla.
- **⚠️ LA CARPETA DEL ARTÍCULO SE DERIVA; NO HAY `mediaFolderId`.** El vínculo
  vive en `MediaFolder.sourceId` y se resuelve por índice único. Una columna en
  `SubmissionArticle` sería una SEGUNDA verdad y se contradiría en cuanto
  alguien borrara la carpeta desde la Librería; y en `Post` sería además la
  trampa de `logo_intl` (v4.699). Lo fija una prueba que lee los dos esquemas.
- **⚠️ EL RECUADRO DE PORTADA ABRE LA BIBLIOTECA, NO EL COMPUTADOR** — pero sólo
  cuando hay carpeta. Hasta v4.1003 había SIEMPRE un `<input type="file">`
  cubriendo el recuadro entero, así que el gesto natural abría el explorador
  incluso en un artículo cuyas fotos ya estaban en la Biblioteca. En un artículo
  escrito a mano se comporta exactamente como siempre.
- **SUBIR NO PUEDE DESAPARECER AL ARREGLAR LO OTRO** (regla de v4.700). Con el
  recuadro abriendo el selector, la subida necesita su propia puerta: el botón
  «Subir desde el computador» debajo, y «Subir nuevo» dentro del selector. Lo
  fija una prueba que cuenta las DOS ramas del `handleImageUpload`.
- **Lo que se sube desde el selector CAE EN LA CARPETA ABIERTA**, por
  `uploadMediaFiles` —el mismo camino de la Librería, con su conversión de HEIC
  (v4.784)—. Un segundo camino de subida se separaría en silencio.
- **La carpeta es un PUNTO DE PARTIDA, NO UN ENCIERRO**: «Toda la Biblioteca» y
  «Volver al material de la solicitud» salen del mismo renglón. Y reabrir el
  selector vuelve a pararse ahí — queda montado con `isOpen` en falso, así que
  sin ese reseteo volvería donde lo dejaron (la lección de v4.903).
- **⚠️ `initialFolderId` NO CAMBIA EL VALOR POR DEFECTO DE NADIE.** Sin el prop,
  `null` sigue significando «sin filtrar por carpeta» y las diez pantallas que
  ya usaban el selector ven todas las imágenes del sitio, como siempre.
- **UN ARCHIVO CAÍDO NO BLOQUEA A LOS DEMÁS, y se dice CUÁNTOS DE CUÁNTOS.**
  «Faltan 3» sin el total hace pensar que no llegó nada; el motivo va POR
  ARCHIVO (`promoteError` → `libraryError`), o hay que reintentar a ciegas.
- **LA TRAZABILIDAD VA EN LOS TRES SENTIDOS.** Artículo → solicitud y solicitud
  → artículo ya existían; se agregan artículo → carpeta, ficha → carpeta y, del
  otro lado, carpeta → solicitud y carpeta → artículo (`folderOrigin`, sobre el
  origen ANOTADO). Y la Librería aprendió a leer `?folder=<id>`: sin esa mitad,
  esos enlaces abrirían en la raíz y habría que buscar la carpeta a mano.
- **El aislamiento va en el `WHERE`.** Toda consulta de carpetas acota por
  sitio, `resolveTargetFolder` valida la carpeta de destino de una subida contra
  el sitio —una ajena cae a la raíz, nunca a la de otro tenant— y «Usado en»
  decide su 404 sobre la lista ya acotada. Lo fija una prueba que recorre las
  consultas del módulo.
- **Un artículo DESCARTADO queda fuera del barrido.** Promover su material
  aprobaría una solicitud que alguien decidió no usar.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `SUBMISSION_ARTICLES` | `off` apaga la generación automática en toda la plataforma |
| `SUBMISSION_ARTICLE_LIBRARY` | `off` apaga el envío AUTOMÁTICO de las fotos a la Biblioteca; el botón de la ficha sigue estando |
| `CRON_SECRET` | Protege `/api/cron/submission-articles-tick`, igual que el resto de los crons |
| `LINK_TRACKING_SALT` · `LINK_STATS_TZ` | Los mismos de las Redirecciones: la sal del visitante y la zona en la que se cuentan los días |

**Pendientes conocidos:** el artículo **no se distribuye a redes** —la
estructura está y el disparo no—; **no hay exportación** de las estadísticas a
CSV ni un tablero que sume los artículos de un sitio (se miran uno por uno); el
recuento de **sesiones** y de **veces compartido** no existe por lo dicho
arriba; y la generación **no se dispara desde el editor de la campaña** para
solicitudes anteriores a v4.1000 salvo con el botón «Generar artículo» de la
ficha, uno por uno.

### El icono del encabezado y el ancho de la bandeja — v4.1005

Pedido con la pantalla delante: *«adapta el contenido del contenedor de
solicitudes de contenido a ancho completo… y en la parte superior del header,
donde está el icono de notificaciones y la bandeja de mensajes, que haya un
icono donde podamos ver las solicitudes que hemos recibido»*.

| Pieza | Qué es |
|---|---|
| `pendingSubmissions` (`contentSubmissionStore.js`) | La I/O del contador: cuántas esperan a alguien y las últimas, en UNA consulta |
| `listPendingSubmissions` → `GET /submissions/inbox/pending` | La API, literal ANTES de `/submissions/inbox/:submissionId` |
| El bloque `<Inbox>` de `AdminLayout.tsx` | El icono, su badge y su desplegable |
| La prop `wide` de `AdminLayout` | Que UNA pantalla pueda pedir el ancho completo |

Pruebas: dentro de `npm run test:submissions:inbox` (112 casos) y
`npm run test:submissions:inbox:ui` (32 en un navegador con el CSS compilado).
Verificadas a la inversa sobre siete defectos: sin `wide`, con `wide` sin
efecto, el badge sin medir, el icono sin su puerta, los estados escritos a mano,
y la consulta sin acotar por estado o por alcance.

- **⚠️ EL TOPE QUE SOBRABA NO ERA EL DE LA PANTALLA.** `SubmissionsInbox` tenía
  un `max-w-[1600px] mx-auto` que **nunca llegaba a actuar**: el envoltorio de
  `AdminLayout` acota el panel ENTERO a `max-w-7xl` (1.280 px) y le suma 40 px
  de relleno por lado, y la pantalla agregaba otros 32 — 72 px de aire a cada
  lado de una tabla de seis columnas que además desborda. Corregir el tope de
  la pantalla habría sido corregir lo que no estaba actuando. **Al diagnosticar
  un ancho, medir cuál de los contenedores está mandando**, no el más cercano.
- **⚠️ Y EL TOPE DEL PANEL NO SE SUBE: SE DECLARA LA EXCEPCIÓN.** Ese
  contenedor lo comparten TODAS las pantallas del panel y ninguna otra lo pidió
  — es la lección de v4.985, donde tampoco se tocó `AdminLayout` por un defecto
  de una sola pantalla. `wide` es ADITIVO: sin la prop, el panel se comporta
  exactamente como siempre, y lo fija una prueba que mide las dos formas.
- **⚠️ EL ANCHO SE MIDE EN UNA PANTALLA ANCHA, que es donde el defecto se ve.**
  A 1.440 px de ventana el área útil ronda los 1.150 y `max-w-7xl` (1.280) ni
  siquiera llega a actuar: la medición pasaba con el defecto delante. A 1.920 la
  diferencia es de más de 300 px. Lo destapó la verificación a la inversa, no la
  lectura — y es la lección de v4.851 (sin el CSS compilado, una prueba de
  disposición pasa por los motivos equivocados) con una vuelta más: **con el CSS
  puesto y la ventana equivocada, también**.
- **⚠️ SE MIDE EL HIJO DEL CONTENEDOR CON DESPLAZAMIENTO, no `closest('.bg-white')`.**
  Aquél trepaba hasta el `<main>` —que también es blanco— y devolvía el ancho
  del área entera, así que la primera comprobación pasaba por el motivo
  equivocado.
- **⚠️ EL CONTADOR ES UN ESTADO OBSERVADO, NO UNA TABLA DE AVISOS.** Misma
  decisión que `pendingDrafts` en v4.1000 y por el mismo motivo: una tabla de
  notificaciones se queda desactualizada en cuanto alguien atiende una solicitud
  desde otra pantalla. Acá se pregunta por lo que HAY, así que el número no
  puede mentir y no se pierde si una función murió a mitad.
- **⚠️ «SIN REVISAR» ES `PENDING_STATES`, IMPORTADO.** Es el MISMO criterio con
  el que `summarizeInbox` calcula el «12 sin revisar» que titula la bandeja: con
  la lista escrita dos veces, el badge diría 12 y la pantalla a la que lleva
  diría otra cosa, y no habría forma de saber cuál de los dos está mal. Lo fija
  una prueba que exige el import y prohíbe la lista literal en el store.
- **⚠️ EL AISLAMIENTO SALE DE `inboxWhere`, EL MISMO QUE USAN EL LISTADO Y EL
  RESUMEN.** `null` es «todas» —sólo el operador llega con eso— y `[]` fuerza
  `FALSE`. Un segundo armado del WHERE es cómo se abre una bandeja entera sin
  que nadie lo note, y acá el precio son nombre, correo y teléfono de personas
  reales de otra organización — vistos desde CUALQUIER pantalla del panel,
  porque el encabezado está en todas.
- **UNA sola llamada trae el contador Y las últimas**, como `articles/pending`:
  el encabezado la sondea desde todas las pantallas, y una petición de más se
  paga en cada una.
- **⚠️ NUNCA LANZA, Y DEGRADAR NO ES LO MISMO QUE CONTAR CERO.** Un fallo
  leyendo un contador no puede dejar sin barra superior a quien está trabajando
  en otra cosa, así que el endpoint responde 200 con `error`. Y como un 200 ya
  no alcanza para saber si se midió, lo que lo dice es la AUSENCIA de ese campo
  (`medido`): sin esa distinción, una lectura rota se pintaría como «no llegó
  ninguna solicitud» — un cero es una afirmación y un hueco es la verdad
  (v4.650). El badge no se pinta y el desplegable lo DICE.
- **⚠️ NO SE LE PINTA A QUIEN NO PUEDE ABRIR LA BANDEJA**, y el permiso sale del
  MISMO `menuItems` que filtra la barra lateral —ya filtrado en un solo sitio
  (v4.932)—, no de un criterio propio que se separaría en silencio. Se pregunta
  por la ruta PADRE (`/admin/campanas-contribucion`) porque la bandeja no es una
  entrada del menú: se llega desde el tablero de campañas (v4.999) y en el RBAC
  cuelga de ese módulo, que casa por prefijo de segmento.
- **SON TRES ICONOS Y MIDEN TRES COSAS DISTINTAS**: la campana son borradores de
  noticia por revisar (v4.1000), el sobre son mensajes del formulario de
  contacto, y éste son solicitudes de contenido sin revisar. Cada uno con su
  icono, su color y su rótulo: tres insignias iguales con tres cifras que
  significan cosas distintas es el defecto que este panel ya evitó una vez
  (v4.863).
- **⚠️ LA DIRECCIÓN DE LA BANDEJA SE COMPONE EN UN SOLO SITIO** (`inboxLink` /
  `INBOX_PATH`, v4.999). La campana la llevaba escrita a mano desde v4.1000 y se
  corrigió de paso: con la ruta en dos sitios, el día que cambie uno queda
  apuntando a una página que no existe y nadie lo nota hasta pulsarlo.
- **⚠️ EL DOBLE DE LA BASE TUVO QUE APRENDER DOS COSAS**, o la prueba habría
  sido vacua (v4.992: leer de MENOS también miente): `s.status = ANY($n::text[])`
  —sin ella no filtraba por estado y quitar la cláusula del SQL real no habría
  hecho fallar nada— y `COUNT(*) OVER()`, que es como el icono sabe cuántas hay
  sin traérselas todas. **Al agregar una consulta con una forma nueva,
  enseñársela al doble leyendo el SQL, nunca reimplementando el criterio.**
- **⚠️ DOS ENDPOINTS QUE COMPARTEN PREFIJO SE CONFUNDEN EN LAS PRUEBAS.**
  `/submissions/inbox` y `/submissions/inbox/pending` empiezan igual: las
  comprobaciones que buscaban el prefijo a secas encontraban el del icono y
  daban por ausente el filtro del listado. `esListado` los distingue. Y en
  Playwright la ruta del contador va declarada DESPUÉS —resuelve la última
  primero—, o el comodín de la bandeja la taparía.
- **⚠️ EL COMENTARIO QUE EXPLICA UN CAMBIO PUEDE HACER FALLAR LA COMPROBACIÓN
  QUE LO DEFIENDE.** Acá al revés que en v4.991: el comentario que cuenta por
  qué se quitó `max-w-[1600px]` NOMBRA la clase, así que la comprobación de que
  ya no está la encontraba en su propia explicación. Se mira el CÓDIGO
  (`codigo()`, que quita comentarios), no el archivo.
- **`Inbox` se IMPORTA de lucide.** Un icono que se nombra y no se importa no lo
  ve el typecheck si el símbolo existe en otro alcance: revienta al PINTAR y
  deja el panel en blanco (la lección de `ClipboardList`).
