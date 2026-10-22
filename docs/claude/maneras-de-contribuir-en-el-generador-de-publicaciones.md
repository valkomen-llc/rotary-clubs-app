<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## «Maneras de Contribuir» en el Generador de Publicaciones — v4.967

El DÉCIMO tipo de publicación. Se elige la campaña de contribución, se elige una
de sus fotografías, se escribe (o no) un contexto adicional y se genera con el
flujo de siempre.

| Archivo | Qué es |
|---|---|
| `server/lib/waysToContribute.js` | El CRITERIO. **Puro**: fotos de la campaña, brief, cláusula de veracidad, universo de lo suministrado y lectura de la recomendación |
| `server/lib/campaignScope.js` | Qué campañas alcanza la sesión. UN solo criterio, compartido |
| `server/controllers/waysToContributeController.js` | La orquestación: catálogo, recomendación y `resolveWaysContext` |
| `server/lib/ensurePublicationOriginSchema.js` · `publicationOrigin.js` | `SocialPublicationOrigin`: de qué campaña salió cada publicación |
| `src/components/admin/content-studio/WaysToContributePanel.tsx` | Campaña, contenido de la campaña y contexto adicional |

Pruebas: `npm run test:ways` (42 casos, **sin base, credenciales ni red**; el
bloque del espejo pide `esbuild` y se salta solo). Verificadas a la inversa.

**Reglas durables:**

- **⚠️ ES UNA AMPLIACIÓN DEL FLUJO, NO UN SEGUNDO GENERADOR.** La generación
  sigue corriendo por `POST /generate-post`: la misma imagen, los mismos tres
  formatos, el mismo autosave a la Biblioteca, el mismo publicar y el mismo
  programar. Lo único que agrega el tipo es CONTEXTO al copy y de dónde salen
  las fotos. El panel **no tiene botón de generar** y una prueba lo comprueba —
  un segundo camino de generación se separa del de siempre en silencio.
- **⚠️ NO ES LA INFOGRAFÍA DE CAMPAÑA (v4.833), y por eso el botón de arriba se
  RENOMBRÓ a «Infografía de Campaña».** Las dos salen de la MISMA campaña y son
  cosas distintas: aquélla DIBUJA la pieza con el motor de Plantillas IA —el
  modelo no escribe dentro de la imagen— y ésta usa la fotografía tal cual y lo
  que la campaña aporta es el texto. Con los dos llamados «Maneras de
  Contribuir» en la misma pantalla no había forma de saber cuál era cuál. **El
  id `contribution` NO se tocó**: está guardado en publicaciones ya generadas.
- **⚠️ EL CATÁLOGO DE TIPOS ESTABA DUPLICADO Y ESO IMPEDÍA QUE UN TIPO NUEVO
  LLEGARA.** La regla de v4.667 dice que vive en un solo sitio; v4.833 resolvió
  la copia del navegador y dejó la de `contentStudioController.js` en pie, con
  su propio `TYPE_PROMPTS` y su propio `INTEREST_AREAS`, **idénticos por
  casualidad**. No daba ningún error —los dos decían lo mismo— y lo que hacía
  era que un tipo agregado al catálogo apareciera en la pantalla, se mandara en
  la petición y **cayera a `standard` en silencio**. Es la clase de fallo que
  este archivo documenta una y otra vez: no falla ruidosamente, entrega otra
  cosa. Lo fija una prueba que lee el archivo.
- **LOS OBJETIVOS SON LOS DE `campaignPostSpec.js`, no un catálogo propio.** El
  mismo «Ayuda humanitaria» tiene que significar lo mismo en una infografía y en
  un post. De aquél se toman `label`, `tone` y `focus`; `layout` y `needs` NO
  aplican —son de la composición gráfica— y por eso este flujo no los mira: una
  publicación con fotografía nunca sale vacía, así que la puerta de
  `validateBeforeGenerate` no tiene nada que proteger.
- **⚠️ LA RELACIÓN CAMPAÑA↔BIBLIOTECA YA EXISTE Y NO SE INVENTA UNA SEGUNDA.**
  Las fotos de una campaña son las que su contenido ya declara —la portada, sus
  diapositivas, la galería «Rotarios en acción», las carátulas de sus videos—,
  todas subidas por la Biblioteca y guardadas como URL dentro de `content`. Una
  tabla puente sería una SEGUNDA verdad sobre lo mismo, que se contradice en
  cuanto alguien cambie una foto desde el editor de la campaña: el error que ya
  se evitó con `publicKeyOf` en Plantillas IA y con `hasBackdrop` en el
  compositor. El `mediaId` se resuelve POR URL al leer, y una foto que no tiene
  fila no es un error: es una foto que se subió por otra vía.
- **Un video y un logotipo de aliado NO se ofrecen como fotografía**
  (`pickableAssets`). El generador trabaja sobre una foto, y un escudo
  institucional como imagen de una publicación se ve roto. Pero los videos **se
  derivan igual y se marcan**: esconderlos haría creer que la campaña no los
  tiene.
- **⚠️ EL CONTEXTO ADICIONAL NO ES OBLIGATORIO, Y SU AUSENCIA SE DECLARA.** Sin
  él se genera igual y el brief dice explícitamente qué se está haciendo
  (`DEFAULT_CONTEXT_NOTE`). No se deja el hueco en silencio: un hueco es una
  invitación a completarlo y un modelo de lenguaje completa huecos por diseño —
  la lección de la Campaña de Emergencia (v4.783). El botón **no se bloquea** por
  este campo; lo que sí bloquea es no haber elegido campaña, y se dice por qué.
- **⚠️ EL TEXTO DEL USUARIO ES DATO SUMINISTRADO.** Si alguien escribe
  «entregamos 300 mercados en Quibdó», ese 300 y ese Quibdó dejan de ser
  invención: el contexto adicional entra al universo de lo permitido de
  `validateEmergencyCopy`. Sin eso, contar lo que de verdad pasó sería imposible
  aunque quien lo escribe lo sepa de primera mano.
- **NO SE INVENTA NADA, Y ESO SON TRES CAPAS.** (1) al brief sólo entra lo que la
  campaña tiene guardado, y **lo que NO se sabe se declara como desconocido**;
  (2) la cláusula de veracidad; (3) `validateEmergencyCopy` —el CÓDIGO decide—
  sobre los CUATRO copies, con hasta tres intentos y reintento que devuelve la
  REGLA CONCRETA que se rompió. Sin la capa 3, «le pedimos que no invente» es una
  afirmación que no se puede sostener. Se validan las cuatro redes: un copy de
  Facebook limpio con uno de Instagram inventando una cifra es el mismo defecto
  por la otra puerta.
- **LA CLÁUSULA LA DECIDE EL TIPO DE CAMPAÑA, no su nombre.**
  `EMERGENCY_FACT_CLAUSE` habla de un desastre real y de personas afectadas:
  aplicada a una campaña de educación o de agua describe una situación que no
  existe, y a un modelo al que se le describe mal la situación escribe mal. Lo
  que NO cambia es la regla de fondo, y por eso el VALIDADOR es el mismo. Un
  tipo desconocido cae a la institucional: no se puede afirmar un desastre que
  quizá no ocurrió.
- **AGOTADOS LOS INTENTOS EL TRABAJO NO SE TIRA**: el copy se entrega CON SUS
  AVISOS —viajan en `metadata.copyIssues` y la pantalla los muestra— porque es
  editable ahí mismo. Quitarlo dejaría la publicación sin ninguno (regla del
  guion de la Campaña de Emergencia); callarlos sería publicarlo creyendo que
  cumple.
- **Los otros nueve tipos no pagan ni una llamada de más**: sin campaña,
  `MAX_TRIES` es 1 y `ways` queda en `null`. El flujo de siempre no cambia una
  línea, y una prueba lo fija.
- **⚠️ «RECOMENDAR CONTENIDO» LEE LOS PIES, NO MIRA LAS FOTOS, Y LO DICE CON ESAS
  PALABRAS.** La Biblioteca **no tiene búsqueda semántica ni índice vectorial**
  —los embeddings de `brainService` son de memorias, no de archivos— y afirmar lo
  contrario sería prometer una integración que no existe. Mirar veinticuatro
  imágenes serían veinticuatro llamadas de visión por recomendación. El modelo
  PROPONE índices y el código DECIDE: cualquier índice fuera de la lista se
  descarta, así que una respuesta inventada no puede elegir una foto que no está
  (catálogo CERRADO, como las intenciones del CRM). **Sin ningún pie, el botón no
  se ofrece** — recomendar sin metadata sería ordenar al azar y presentarlo como
  criterio (v4.650).
- **⚠️ LA PROCEDENCIA NO ES UNA COLUMNA DE `SocialPublication`.** Era el camino
  corto y es el riesgo de despliegue de la regla de `logo_intl` (v4.699): el
  build no ejecuta `db push`, y `socialPublication.findMany` se llama SIN
  `select` en la Biblioteca de Publicaciones y en el cron de programadas — lo que
  caería en 500 es el listado y la publicación de lo agendado. Vive en
  `SocialPublicationOrigin`, tabla creada en runtime y en la lista del guardián
  de `db:push`. Es la misma decisión que `EcosystemClone` (v4.749). **Toda
  lectura DEGRADA a null y la escritura NUNCA lanza**: una publicación ya
  guardada no se pierde por no poder anotar de dónde salió.
- **EL ALCANCE ES UNO SOLO** (`campaignScope.js`). Estaba dentro de
  `campaignPostController.js` y ahora hay dos consumidores: con la consulta
  escrita dos veces, un generador ofrecería una campaña que el otro no —o peor,
  que la página del sitio no muestra— y la publicación mandaría a una landing
  que ahí no existe. Un administrador de sitio ve ÚNICAMENTE la campaña que su
  sitio muestra, resuelta con el MISMO `pickCampaignForSite` de la página
  pública; el aislamiento va en `campaignInScope`, no en una comprobación
  posterior.
- **EL CONTEXTO QUE VA A USAR LA IA SE MUESTRA EN LA PANTALLA.** Un contexto que
  se aplica sin verse es una caja negra: cuando el copy no sirve, no hay dónde
  mirar. Y el aviso de con qué se va a generar va **junto al botón que lo
  dispara**, no sólo arriba (regla del modo Fotográfico, v4.798).
- **LAS CUATRO REDES NO LLEVAN EL MISMO TEXTO.** Los HECHOS son idénticos;
  cambian la extensión, la estructura, el CTA, los hashtags y la densidad. Va
  dicho en el prompt para TODOS los tipos, no sólo para éste.
- **Una campaña sin fotografías NO bloquea**: se sube la foto o se elige de la
  Biblioteca completa, y el copy sale con el contexto igual. Un fallo cargando
  las campañas **no pierde el resto del formulario** y ofrece reintentar. Ninguna
  respuesta se lee con `.json()` a ciegas (lección de v4.946).
- **`CAMPAIGN_BACKED_TYPES` es una LISTA declarada, no una comprobación por
  nombre.** El día que entre un segundo tipo que se alimente de una entidad de la
  plataforma, entra ahí y el resto del flujo no cambia.

**Pendientes conocidos:** la Biblioteca de Publicaciones **todavía no pinta la
insignia de campaña** —la procedencia se guarda y `originsFor` está listo, falta
consumirlo en el listado—; la programación (`scheduledFor`) de una publicación de
este tipo funciona igual que las demás pero **no arrastra la campaña al
recordatorio**; y `publicationsOfCampaign` existe y **no tiene todavía pantalla**:
la pregunta «qué publicaciones salieron de esta campaña» se puede contestar por
API y no desde el panel.
