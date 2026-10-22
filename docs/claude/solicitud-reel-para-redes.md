<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Solicitud → Reel para redes — v4.1010

La SEGUNDA salida de una Solicitud de Contenido. La primera es el artículo de
noticia y **no se toca**: misma solicitud, mismo contexto, mismos archivos y la
MISMA carpeta de la Biblioteca.

| Archivo | Qué es |
|---|---|
| `server/lib/submissionReelSpec.js` | El CRITERIO. **Puro**: estados, etapas, clasificación del material, selección de hasta 5 fotos, storyboard, cláusula de datos y créditos |
| `server/lib/reelFacts.js` | De dónde salen la cláusula, el brief y el universo de hechos de CUALQUIER Reel |
| `server/lib/ensureSubmissionReelSchema.js` | `SubmissionReel` en runtime |
| `server/lib/submissionReelEngine.js` | La orquestación: encolar, reclamar, las cuatro etapas, seguir al proyecto |
| `server/controllers/submissionReelController.js` | La API |
| `src/components/admin/contribution/SubmissionReelPanel.tsx` | El bloque «Reel para redes» dentro de la ficha |
| `src/lib/submissionReelSpec.ts` | Espejo MÍNIMO: rótulos y redes |

Pruebas: `npm run test:submissions:reel` (134 casos de criterio) y
`npm run test:submissions:reel:path` (67, el CAMINO con la base, el modelo y el
motor de Reels sustituidos en memoria). **Ninguna necesita Postgres,
credenciales ni red.** Verificadas a la inversa sobre catorce defectos.

⚠️ **La del CAMINO hace falta teniendo las 134 de criterio**, y no es celo: el
criterio puede estar entero y el defecto vivir en el camino —`pickDistrictSite`
era correcto y el fallo estaba en la ruta (v4.744), el `WHERE` de las
publicaciones fantasma nunca miró el criterio (v4.938) y un renombrado a medias
entre dos capas no lo ve ninguna prueba pura (v4.889)—. Ahí se ejercita que el
SQL lleve los parámetros que lleva, que una etapa deje lo que la siguiente
espera, que el reclamo impida dos vueltas y que se le pida UN solo Reel al
motor. Lo que ese doble NO demuestra es que el SQL sea válido para Postgres:
eso se comprueba al desplegar.

⚠️ **Y su fixture codificó el defecto una vez** (la lección de v4.1001): el
doble del modelo devolvía «Escena 1», «Escena 2»… y el validador de veracidad
las rechazaba —con razón, porque esos números no los suministró nadie—
disparando el reintento. La prueba culpaba al módulo de llamar dos veces al
modelo y el módulo estaba bien. Al ajustar un criterio, mirar si el fixture que
lo declara «correcto» sigue siéndolo.

**Reglas durables:**

- **⚠️ NO HAY UN SEGUNDO MOTOR DE REELS, y es la decisión de la que cuelga todo
  lo demás.** El Reel lo produce `startReelProject` —el MISMO que usa el Estudio
  de Contenido—, y lo que este módulo aporta es QUÉ fotos, en qué orden, qué
  cuenta cada una y con qué hechos. Con dos caminos hacia el proveedor, el día
  que se corrija el reparto de duraciones, el prompt de escena o el candado de
  la expansión, una mitad se queda atrás y el fallo es **MUDO**: las dos siguen
  produciendo un Reel. Lo fija una prueba que cuenta los `INSERT INTO
  "ReelProject"` de la cadena: tiene que haber **UNO**.
- **⚠️ `createReel` PASÓ A SER UNA ENVOLTURA HTTP.** Su cuerpo se extrajo a
  `startReelProject(input, user)`, que no conoce Express. Es la misma extracción
  que `articleGenerate.js` en v4.1001 y por el mismo motivo. Lo que NO se hizo
  fue mover el cuerpo a otro archivo: usa diez helpers privados del controlador
  —`dispatchScene`, `startSceneExpansion`, `creditUsage`— y exportarlos todos
  para moverlo sería más superficie de la que se gana.
- **La diferencia entre las dos piezas es un PRESET** (`solicitud`, en
  `reelPresets.js`), y es **interno**: no se ofrece en el selector del Estudio de
  Contenido porque su contexto sale de la solicitud, no de un formulario.
  Ofrecerlo daría una pantalla pidiendo a mano los datos que la solicitud trae.
- **⚠️ NO SE VUELVE A ANALIZAR NINGUNA FOTO.** El workflow del artículo ya midió
  cada una con sharp (nitidez, brillo, resolución), ya la describió con el modelo
  de visión y ya marcó los duplicados por dHash, y lo guardó en
  `SubmissionArticleMedia`. Este módulo lo CONSUME. Volver a mirarlas serían N
  llamadas de visión para saber lo mismo. El precio está dicho: sin artículo
  generado, la selección cae al orden que mandó el club **y lo dice**.
- **⚠️ LO QUE DESCALIFICA UNA FOTO ES SU CLASE, NO SU NOTA** (v4.1010). Es la
  consecuencia de consumir el análisis del artículo, y hay que leerla junto a
  v4.1009: allá `excluded` dejó de traer los motivos automáticos —pasaron a
  `coverNote`— y quedó significando **sólo** «lo dejó fuera una persona». Sin
  mirar eso, este módulo habría aflojado su puerta en silencio: una captura de
  pantalla o un documento escaneado habrían pasado a poder animarse como
  escena. Se parte en dos preguntas distintas. **Grado** —oscura, desenfocada—:
  el puntaje ya las penaliza y compiten como las demás, porque descartarlas por
  nota dejaría fuera media selección de un club que fotografía de noche.
  **Clase** —captura de pantalla, documento (`NOT_A_PHOTO_NOTES`)—: no son una
  fotografía de lo que ocurrió y no se animan; se descartan **con su motivo**.
  La decisión de una persona (`excluded`) manda siempre. Verificado a la
  inversa por las DOS puntas: quitando el descarte por clase fallan 3
  comprobaciones, y endureciéndolo hasta el grado fallan 2.
- **AL REBASAR SOBRE UN CAMBIO DEL WORKFLOW DEL ARTÍCULO, MIRAR QUÉ SIGNIFICAN
  SUS CAMPOS AHORA.** Este módulo no vuelve a medir nada, así que lee columnas
  ajenas: un cambio de semántica allá llega acá **sin ningún error** —el código
  es válido, los tipos están bien y la selección simplemente entrega otra cosa—.
  Es la misma forma de fallo que este archivo documenta una y otra vez.
- **DIVERSIDAD ANTES QUE PUNTAJE.** `selectStoryImages` recorre POSICIÓN por
  posición —contexto, personas, acción, resultado, cierre— y cada una se lleva la
  mejor foto para SU función, no las cinco mejores del montón: cinco fotos casi
  iguales tienen cinco puntajes altísimos y no cuentan ninguna historia. La
  afinidad con la posición DESEMPATA sobre el puntaje de calidad, no lo
  sustituye: una foto floja no gana una posición por encajar en su rol.
- **Lo descartado se DICE con su motivo.** Un descarte silencioso deja al usuario
  mirando una selección sin saber por qué falta la foto que esperaba (la regla de
  `skipped` en los centros de acopio).
- **⚠️ SÓLO SE ANIMA LO QUE YA ESTÁ EN LA BIBLIOTECA.** Un archivo de una
  solicitud vive en el prefijo PRIVADO hasta que se aprueba el material (v4.968)
  y el motor de video necesita una URL alcanzable. Eso es estructural y **no se
  afloja**: se exige la promoción antes y se DICE dónde se hace, en vez de fallar
  con un error del proveedor que no explica nada.
- **⚠️ LA CLÁUSULA DE DATOS NO ES LA DE EMERGENCIA, pero el VALIDADOR sí es el
  mismo.** `EMERGENCY_FACT_CLAUSE` habla de un desastre real y de personas
  afectadas: aplicada a la entrega de un mercado describe una situación que no
  existe, y a un modelo al que se le describe mal la situación escribe mal (la
  regla de v4.967). `SUBMISSION_FACT_CLAUSE` prohíbe exactamente lo mismo con las
  palabras que corresponden. Quien DECIDE sigue siendo `validateEmergencyCopy`,
  sobre el universo que arma `veracityContextFor` —el mismo del artículo—: un
  segundo validador de cifras se separaría del primero.
- **`reelFacts.js` es la costura, y es ADITIVA.** `resolveFactGuard` devuelve
  `{ clause, brief, universe }`; sin `facts` y sin `emergencyContext` devuelve
  todo en `null`, que es el Reel estándar de siempre. La guardia se guarda en
  `ReelProject.config.facts`, así que regenerar la voz o el copy meses después
  afirma lo MISMO que el día que se creó la pieza.
- **⚠️ NO HAY ETAPA «GUION», y su ausencia es deliberada.** Lo que el pedido pide
  —hook, narrativa, cierre y CTA— lo produce `storyboard` en la MISMA llamada,
  porque son el mismo texto visto dos veces. El guion HABLADO ya tiene dueño:
  `reelNarration.js` lo escribe con su Narrative Timing Engine, que le pone un
  presupuesto de palabras, sintetiza, **mide el audio real** y corrige hasta que
  entra. Una etapa que escribiera un segundo guion sería un segundo generador de
  voz, y uno que no mide nada.
- **LA ANIMACIÓN ES CONSERVADORA A PROPÓSITO** (`documental` + `sutil`, no `auto`
  + `natural`). Este material NO lo eligió un editor: son las fotos que mandó un
  club desde el teléfono, con sus pendones, sus chalecos y sus logotipos. Cada
  acción que se le pide al motor es una ocasión más de que redibuje lo que la
  foto no muestra (v4.705), y acá lo que se redibuja es la marca de una
  institución. La cámara sigue fija (v4.674).
- **⚠️ SIN TARJETA DE CIERRE, y no es una decisión estética.** Componer texto
  sobre el video rasteriza un SVG con sharp, y eso necesita una fuente del
  SISTEMA: el entorno de Vercel **no tiene ninguna instalada**, así que cada
  glifo sale como un cuadrito (medido, con capturas, en v4.794). El cierre
  institucional del punto 16 se resuelve con lo que SÍ se puede hacer hoy: la
  última escena lleva el rol `cierre_club` y es la fotografía con la marca del
  club. Para reactivarla hay que resolver ANTES la fuente.
- **La expansión de lienzo es OBLIGATORIA.** Las fotos de un club vienen
  apaisadas del teléfono y el Reel es 9:16; cuando la adaptación no actúa el
  montaje RECORTA AL CENTRO y ese recorte se lleva los bordes, que es donde están
  las personas de los extremos.
- **⚠️ LA IDEMPOTENCIA ES UN ÍNDICE ÚNICO, no una lectura previa.** Entre un
  SELECT y un INSERT caben dos vueltas del cron, el sondeo del navegador y el
  botón, y el precio de equivocarse acá son créditos de video pagados dos veces
  (la lección de `Payment_provider_providerRef_key`). El índice es
  `("submissionId","versionNumber")` y **no es parcial** a propósito: las dos
  columnas son NOT NULL, así que el `ON CONFLICT` va a secas — contra uno parcial
  habría que repetir su predicado o la sentencia falla entera (la trampa de
  v4.648). La versión vigente sí lleva índice parcial (`WHERE "isCurrent"`) y por
  eso se marca con dos UPDATE, nunca con un upsert.
- **⚠️ Y LA COMPROBACIÓN SE HACE SOBRE EL CUERPO DE `enqueueReel`, NO SOBRE EL
  ARCHIVO.** Hay DOS puntos que insertan una fila —encolar y crear una versión—
  así que buscar la forma en todo el archivo pasa en verde con el `ON CONFLICT`
  quitado de uno de los dos: una prueba vacua que además afirma lo contrario
  (v4.896). Lo destapó la verificación a la inversa, no la lectura.
- **VERSIONAR NO DUPLICA LOS ARCHIVOS.** La versión nueva apunta a los mismos
  `fileId` de la solicitud; lo que se vuelve a pagar son las escenas de video, y
  por eso «Crear nueva versión» es un gesto aparte con su confirmación.
- **EL RECLAMO VA SOBRE `attempts`**, que es un entero exacto: sobre `updatedAt`
  no funcionaría porque el driver de pg trunca los microsegundos (v4.800).
- **⚠️ EL ESTADO DEL RENDER NO SE DUPLICA: SE LEE.** `ReelProject` tiene su
  máquina de estados, su barrido, su webhook y su sondeo desde v4.670.
  `followReelProject` traduce ese estado al del workflow y nada más — con un
  estado propio, un Reel podría estar «listo» acá y «montando» allá.
- **HAY TRES VÍAS Y LLAMAN AL MISMO `advanceReel`**: el cron
  (`/api/cron/submission-reels-tick`, cada minuto), el sondeo de la ficha y el
  botón. No quitar el cron: sin él, un Reel se queda parado en cuanto el usuario
  cierra la pestaña. El sondeo del navegador **sólo existe mientras hay trabajo**.
- **⚠️ LA AUTOMATIZACIÓN NO PUBLICA, Y ES ESTRUCTURAL.** `FLOW` no tiene ningún
  camino a `publicado` que saltee `aprobado`, y una prueba lo recorre ENTERO —no
  el par feliz—: el día que alguien agregue un atajo desde «en revisión», falla.
  Y aprobar tampoco publica: publicar es el paso siguiente y lo hacen los módulos
  que ya existen (la Distribución multi-destino y las Cuentas Sociales).
- **UNA ESCENA QUE FALLA NO CANCELA EL PROYECTO.** Se dice «4 de 5» con el botón
  de regenerar la que falló, que es lo que evita volver a pagar las cuatro que ya
  salieron. La regeneración por escena ya existe en el Estudio de Contenido y es
  la que se usa: un segundo editor de Reels sería el módulo duplicado que este
  pedido prohíbe.
- **EL COSTO SE DICE ANTES DE GASTARLO**, y se rotula como el medidor PROPIO de
  la plataforma, no el saldo del proveedor.
- **⚠️ EL MODO VIDEO ESTÁ DECLARADO Y NO IMPLEMENTADO, y se dice.**
  `content_mode` admite `image_reel | video_reel | mixed`; los dos últimos llevan
  `available: false` y su motivo con las palabras del pedido. Es la costura de la
  segunda fase: cuando exista el adaptador entra por ahí sin tocar la máquina de
  estados. Declararlo disponible sería prometer una integración que no existe.
- **Facebook Reels entró al catálogo de copy** (`COPY_PLATFORMS`), junto a
  TikTok, Instagram Reels y YouTube Shorts. Un catálogo es DATOS: agregar una
  plataforma es una entrada más. Consecuencia conocida: un Reel generado antes de
  v4.1010 no tiene esa versión guardada y su pestaña sale vacía hasta que se
  regenere el copy.
- **El espejo del navegador es MÍNIMO**: rótulos y redes. El criterio —qué fotos
  entran, qué etapa sigue, cuánto cuesta— viaja RESUELTO en la respuesta.
  Copiarlo daría dos verdades sobre el mismo Reel, y lo que se separaría es qué
  se le cobra a alguien. Lo fija una prueba que comprueba su AUSENCIA.
- **`SubmissionReel` vive fuera de Prisma** y está en la lista del guardián de
  `db:push`. `ReelProject` **no gana ni una columna**: el vínculo va desde
  `SubmissionReel.reelProjectId`, nunca al revés (regla de `logo_intl`, v4.699).

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `SUBMISSION_REELS` | `off` apaga la generación automática; el botón de la ficha sigue |
| `CRON_SECRET` | Protege `/api/cron/submission-reels-tick`, igual que el resto |

**Pendientes conocidos:** el Reel **no se publica ni se programa desde la ficha**
—aprobar lo deja listo y la salida a redes es de la Distribución multi-destino,
que todavía no lo consume—; el **modo video** está declarado y sin implementar,
como dice su propia regla; la **tarjeta de cierre institucional** exige resolver
antes la fuente del sistema; y **cambiar la selección de fotos después de generar
NO rehace el Reel** —se guarda, se dice, y para verlo con las fotos nuevas hay
que crear una versión—, porque rehacerlo solo gastaría los créditos otra vez sin
que nadie lo pidiera.

### «Generar Reel» abre el asistente; sólo confirmar gasta — v4.1012

Pedido con la ficha delante: *«no quiero que al hacer clic se dispare
inmediatamente la generación y se consuman créditos»*. Entre el botón y el
motor entra **Preparar Reel**: qué fotografías, en qué orden, cuánto dura cada
escena, la voz, la música y un resumen con el consumo estimado.

| Pieza | Qué es |
|---|---|
| `configurando` en `REEL_STATES` | El estado que NO es de trabajo. Ahí espera el Reel, preparado y sin gastar |
| `deriveReelWorkflowStatus(stages, { confirmed })` | La PUERTA: con el plan sin confirmar no pide la etapa que gasta |
| `SubmissionReel."plan"` | Duración, voz con su guion, música y `confirmedAt`. JSONB, enumerada en el atajo del ensure |
| `resolveReelTiming` · `durationOptionsFor` · `defaultDurationFor` | El CRITERIO de la duración. **Puro** |
| `updateReelPlan` · `suggestReelSelection` · `reorderReelSelection` · `confirmReelPlan` | Las cuatro acciones. Sólo la última autoriza el gasto |
| `PrepareReelModal.tsx` | El asistente. Pinta y pide; no decide nada |

Pruebas: `npm run test:submissions:reel` (220 casos) y
`npm run test:submissions:reel:path` (89, el CAMINO con la base y el motor
sustituidos). **Ninguna necesita base, credenciales ni red.** Verificadas a la
inversa sobre las claves.

- **⚠️ LA ESPERA ES ESTRUCTURAL, NO UNA COMPROBACIÓN DE PANTALLA.** Con las tres
  etapas gratuitas hechas y el plan sin confirmar, el estado derivado se queda
  en `configurando`, que **no** es `working`: `advanceReel` corta en su primera
  línea, el barrido del cron no lo recoge y el sondeo del navegador se desmonta.
  La generación no se detiene porque una pantalla se acuerde de no pedirla — se
  detiene porque no hay ninguna vía que la mueva. Es la misma clase de garantía
  que sostiene «la automatización no publica» en el artículo.
- **⚠️ Y HAY UNA SEGUNDA PUERTA EN `stageProyecto`, que no sobra.** Esa etapa es
  lo ÚNICO del módulo que llama a un proveedor de video: un reintento manual, un
  camino nuevo o un barrido que llegue por otra vía tienen que encontrársela
  también. Con una sola comprobación, el día que aparezca una segunda vía el
  gasto se dispara sin autorización **y el fallo es mudo** — el Reel sale bien.
- **⚠️ Y LA PRUEBA QUE LA DEFENDÍA ERA VACUA.** Buscaba `planIsConfirmed(row.plan)`
  en TODO el archivo y pasaba en verde con la guardia quitada de la etapa, porque
  `advanceReel` —que está más abajo— la usa igual. Se mira el CUERPO de la
  función. Lo destapó verificar a la inversa, no leerla (la lección de v4.896).
- **`costs: true` MARCA LA FRONTERA DEL DINERO** en `REEL_STAGES`, y no es
  decorativa: es lo que la puerta lee. Al agregar una etapa que llame a un
  proveedor de video, marcarla — una que gaste sin declararlo se saltea la
  puerta. Lo fija una prueba.
- **⚠️ LA DURACIÓN ES UN OBJETIVO QUE SE RESUELVE, NO UNA PROMESA, y el techo lo
  fija el MOTOR.** Es la regla de v4.669 y acá decide todo el selector: con Kling
  (clips de 5 o 10 s) el techo REAL por escena son **5 s**, no los 6 de
  `MAX_SCENE_SEC`, porque pedir 5,4 s obliga a generar un clip de 10 para usar la
  mitad. De ahí sale el rango medido: **3 fotos → 11-14 s, 4 → 14,5-18,5 s, 5 →
  18-23 s**. Así que **25 y 30 s no son alcanzables con ningún material que este
  preset admite**, y **15 s no lo es con cinco fotografías** (el piso son 18).
  Las cuatro opciones del pedido se OFRECEN igual, marcadas, con la duración real
  y con qué falta para llegar — esconderlas haría creer que el módulo no las
  admite. Para llegar de verdad a 25-30 s hay que subir el techo por escena, y
  eso duplica la espera y el costo en el proveedor: es una decisión de producto,
  no un ajuste.
- **⚠️ SIEMPRE QUEDA UNA DURACIÓN ELEGIBLE.** Con tres fotografías NINGUNA de las
  cuatro se alcanza y el selector salía entero deshabilitado: un control donde no
  se puede elegir nada no se lee como un límite, se lee como un módulo roto, y
  deja sin salida a quien sólo tiene tres fotos. Se habilita la más cercana con
  su duración real al lado. **Lo destapó una prueba, no la lectura.**
- **UNA DURACIÓN POR ESCENA FUERA DE RANGO SE ACOTA Y SE AVISA.** Un recorte
  silencioso convierte «lo configuré así» en una afirmación falsa.
- **EL REPARTO FIJADO A MANO VIVE EN `distributeDurations`** (`fixed`), no en un
  segundo repartidor: con dos, el día que cambie el techo por escena o la
  compensación de los fundidos una mitad se queda atrás y las dos siguen
  devolviendo un reparto.
- **⚠️ EL PLAN NO GUARDA LAS FOTOS.** La selección vive en `selection.items` con
  su orden y su función narrativa; escribir los `fileId` también en el plan daría
  DOS verdades sobre las mismas fotografías (el error que `publicKeyOf` evitó en
  Plantillas IA). Lo fija una prueba sobre la forma del plan.
- **EL ORDEN AUTOMÁTICO NO CUESTA NI UNA LLAMADA A NINGÚN MODELO** y es
  DETERMINISTA. La función narrativa de cada foto la decidió `selectStoryImages`
  con el análisis que el artículo ya pagó; ordenar es leer ese dato. Pedírselo a
  un modelo daría un resultado distinto en cada pulsación. Lo mismo «Sugerir
  mejores imágenes con IA»: es el análisis ya pagado, no una segunda pasada de
  visión.
- **REORDENAR REASIGNA LA FUNCIÓN POR POSICIÓN.** Conservar el rol viejo dejaría
  el cierre en medio de la pieza. Y un arrastre a medias **no pierde ninguna
  foto**: las que el navegador no nombró conservan su sitio al final.
- **⚠️ LOS CATÁLOGOS SON CERRADOS Y VIVEN EN EL SERVIDOR.** Una duración, un modo
  de voz o una música que no estén declarados NO se guardan. La música son ids de
  `MUSIC_STYLES` —el catálogo del motor de siempre— y de ahí salen sus rótulos:
  una segunda lista haría que la pantalla ofreciera un estilo que el montaje no
  sabe pedir, y la pieza saldría con otra música. El «emocional» del pedido es
  **Cálido** en ese catálogo; no se renombra un estilo en producción para que
  coincida con una palabra.
- **⚠️ EL TEXTO EN PANTALLA SE OFRECE APAGADO, CON SU MOTIVO, y `normalizeReelPlan`
  lo fuerza a `false` aunque el cuerpo lo pida.** Componer rótulos rasteriza un
  SVG con sharp y eso necesita una fuente del SISTEMA: Vercel no tiene ninguna
  instalada y cada glifo sale como un cuadrito (medido con capturas en v4.794).
  Un interruptor que se puede encender y devuelve cuadritos sobre una pieza
  institucional es peor que uno apagado con su explicación.
- **⚠️ EL GUION APROBADO A MANO VIAJA EN `config.narration.script` Y
  `produceNarration` LO LEE.** Sin esa línea el texto que alguien revisó llegaría
  al proyecto y el motor lo reescribiría igual: la promesa de «leé y editá antes
  de gastar» sería falsa. Va en la `config` y no en la petición del día en que se
  sintetiza, para que regenerar la voz meses después diga lo mismo que se aprobó.
- **CONFIRMAR EXIGE `confirm: true` (428 sin él) Y DEJA ESCRITO QUIÉN.** Lo que
  sigue crea escenas que se cobran y no se deshacen pulsando «atrás» (criterio de
  los desembolsos, v4.885). El botón **dice qué va a pasar** —cuántas escenas y
  cuántos créditos— en vez de preguntar si estás seguro.
- **TOCAR EL PLAN DESCONFIRMA**, mientras el Reel no se haya generado: lo que se
  confirmó ya no es lo que hay. Con el Reel ya generado no se rehace nada solo —
  se guarda, se dice y se crea una versión (la regla de v4.1010).
- **EL RESUMEN LO RESUELVE EL SERVIDOR** y viaja en `planner`. El espejo del
  navegador **no trae** `resolveReelTiming`, `durationOptionsFor`,
  `summarizeReelPlan` ni `validateReelPlan`, y lo fija una prueba que comprueba
  su AUSENCIA: con dos cálculos, el resumen diría una cosa y el motor haría otra,
  y lo que se separaría es cuánto se le cobra a alguien.
- **EL MEDIDOR ES PROPIO Y ES PLANO POR ESCENA**, y se dice: un clip más largo
  cuesta lo mismo en este contador y no en el proveedor. Presentarlo como el
  costo real sería una afirmación que no se sostiene.
- **NO HAY UN SEGUNDO SELECTOR DE FOTOGRAFÍAS.** El inline de `SubmissionReelPanel`
  se retiró: dos selectores se separan en silencio (la lección de
  `SubmissionDetail`, v4.999). Y `startReelProject` sigue siendo el ÚNICO motor —
  lo que cambió es que acepta tres parámetros más (`targetTotalSec`,
  `sceneDurations`, `narration.script`), todos **aditivos**: sin ellos el Estudio
  de Contenido se comporta exactamente como antes.
- **La adaptación a 9:16 NO cambió y se DICE en el resumen**: el preset ya exige
  `requireExpansion`, así que una foto apaisada se completa con IA en vez de
  recortarse, y la conservación se MIDE (`verifyExpansion`). Igual la animación:
  la cámara está fija y lo que se mueve es la escena (v4.674), con el anti-paneo
  en el prompt negativo (v4.787).

**Pendientes conocidos:** ~~25 y 30 segundos no son alcanzables~~ —**SUPERADO EN
v4.1058**: dejaron de ofrecerse y se conservan sólo para no perder lo heredado;
ver «La cantidad de escenas manda la duración»—; «reemplazar por otra de la
biblioteca» alcanza a las fotografías **de la solicitud**, no a la Biblioteca
entera (una foto ajena a la actividad rompería la cadena de veracidad que el
módulo sostiene); y el asistente **no se comprueba en un navegador** — al tocar
su maquetación, mirarla (la lección de v4.717).

### La cantidad de escenas manda la duración, y la voz se configura antes de gastar — v4.1058

Pedido con las dos pantallas delante: el asistente decía «15.0 s con 4 escenas y
un consumo estimado de 80 créditos» sin ninguna forma de bajar a tres, y la ficha
de la Biblioteca no decía con qué voz se había hecho el Reel ni permitía cambiar
sólo la locución. Doce puntos, y el eje de todos es CONTROLAR EL COSTO ANTES DE
GASTARLO.

| Pieza | Qué es |
|---|---|
| `server/lib/reelVoices.js` | El CRITERIO de la voz, **puro**: idiomas/acentos, géneros, estilos y el presupuesto de palabras. Extraído de `reelNarration.js`, que lo RE-EXPORTA entero |
| `SCENE_COUNT_OPTIONS` · `sceneCountOptionsFor` · `DURATION_CEILING_BY_SCENES` · `durationRangeFor` (`submissionReelSpec.js`) | Cuántas escenas se pueden elegir, qué le falta a cada una y qué duración permite |
| `voiceCatalogFor` · `voiceGender`/`voiceLanguage` en el plan | El catálogo de voz resuelto, con la honestidad del proveedor |
| `setReelSceneCount` · `expansionsFor` (`submissionReelEngine.js`) | La acción GRATUITA de cambiar la cantidad, y las adaptaciones de lienzo que el estimado no contaba |
| `src/components/admin/content-studio/ReelNarrationPanel.tsx` | EL panel de voz. **Uno**, montado por el Creador de Reels y por la Biblioteca |
| `config.music` (`resolveSoundtrack`) | Con qué estilo y para cuánto se pidió el instrumental |

Pruebas: `npm run test:submissions:reel` (287 casos de criterio y de archivo) y
`npm run test:submissions:reel:path` (131, el CAMINO con la base y el motor de
Reels sustituidos). **Ninguna necesita Postgres, credenciales ni red.**
Verificadas a la inversa sobre seis puntos.

**Reglas durables:**

- **⚠️ CAMBIAR LA CANTIDAD DE ESCENAS ES LA PALANCA DE COSTO Y TIENE QUE SER
  GRATIS.** Bajar de cinco a tres son dos generaciones de video menos MÁS las
  adaptaciones de lienzo que se ahorran, y sólo sirve si se puede probar sin
  gastar: `setReelSceneCount` no llama a ningún proveedor —rehace la SELECCIÓN y
  descarta el STORYBOARD, que son las dos etapas gratuitas— y lo fija una prueba
  que lee el CUERPO de la función (no el archivo: `stageProyecto` está más abajo
  y despacha legítimamente, así que buscarlo en todo el archivo pasaría en verde
  con un despacho metido ahí adentro — la lección de v4.896). Verificado a la
  inversa metiendo un `dispatchScene`.
- **⚠️ UNA SELECCIÓN HECHA A MANO SE RECORTA, NO SE REEMPLAZA.** Quien ya eligió
  cinco fotos y baja a tres conserva las TRES PRIMERAS en su orden —su decisión,
  acotada— en vez de que el sistema vuelva a elegir y le deshaga el trabajo; y se
  lo DICE. Subir sí vuelve a proponer: no hay de dónde sacar la cuarta. Es la
  regla de `putAuto` con las traducciones.
- **⚠️ Y SE DESCONFIRMA EL PLAN Y SE DESCARTA `perScene`.** El techo depende de la
  cantidad y `perScene` es una lista POR ÍNDICE: conservar la de cinco escenas con
  tres dejaría dos duraciones sin escena y el reparto las ignoraría en silencio.
  Lo confirmado ya no es lo que hay, así que la confirmación se suelta.
- **⚠️ SOBRE UN REEL YA GENERADO NO SE CAMBIA, y se dice por qué.** Las escenas
  están pagadas: cambiar la cantidad ahí exigiría regenerarlas. La salida está
  escrita —crear una versión nueva—; un bloqueo sin salida se lee como una avería
  (v4.1008).
- **⚠️ EL NÚMERO QUE SE MUESTRA ES EL REAL, NO EL REDONDO DEL PEDIDO.** El pedido
  dice «3 escenas → máximo 15 s» y con Kling (`[5, 10]`) el máximo alcanzable son
  **14,0 s**: tres clips de 5 s menos dos fundidos de 0,5. Medido: **3 escenas →
  11-14 s, 4 → 14,5-18 s, 5 → 18-20 s**, con 4-5 s por escena en las tres, que es
  lo que el pedido pide. Redondear a 15 prometería un segundo que la pieza no va
  a tener, así que el tope entra como OPCIÓN PROPIA con su número y `defaultDurationFor`
  abre ahí. Contra una lista cerrada de valores redondos, elegir «14 s (máximo)»
  volvía sola a 15 y el control se leería como roto — por eso la duración pasó a
  ser un RANGO ACOTADO (se clampa a `[12, 30]` y se redondea a la décima) y no un
  catálogo.
- **⚠️ Y POR ESO LO HEREDADO (25 y 30 s) SE ACEPTA SIN OFRECERSE**
  (`LEGACY_REEL_DURATIONS`, `ACCEPTED_REEL_DURATIONS`). Un plan guardado antes de
  esta versión no puede perder su duración por abrir el asistente (regla
  aditiva); lo que no puede es seguir apareciendo como una opción que ningún
  material alcanza.
- **⚠️ HAY DOS TECHOS, MANDA EL MÁS BAJO, Y SE DICE CUÁL** (`cappedBy`). El del
  MOTOR (cuántos segundos entrega un clip) SUBE agregando una fotografía; el del
  PRODUCTO (3→15, 4→18, 5→20) NO. Con un solo mensaje, «no se puede llegar a 20 s»
  manda a buscar la solución donde no está.
- **⚠️ Y EL TECHO DE PRODUCTO ACOTA, no sólo avisa.** Pidiendo 30 s con cinco
  escenas la nota decía «se arma hasta 20 s» y el reparto devolvía **23**: el del
  motor acota solo —ninguna escena pasa de `ceiling`— y el de producto no lo
  hacía. Una nota que contradice al número que la acompaña no es un aviso, es un
  defecto. Lo destapó escribir la prueba, no leer el código.
- **⚠️ UN CLIP QUE SÓLO SE RECORTA NO SE ANUNCIA COMO MÁS CARO.** La nota decía «N
  escena(s) piden más de lo que el motor entrega de una vez … en el proveedor
  cuesta más» sobre una escena de 4,4 s, que pide MENOS que el escalón más corto
  de Kling: ahí el clip se genera de 5 s y el montaje recorta, que es edición
  declarada y no suma nada. El aviso de doble costo (v4.669) queda para el clip
  que de verdad OBLIGA a saltar de escalón. Importaba porque los valores por
  defecto de 4 y 5 escenas ponen esa nota en el camino feliz.
- **⚠️ EL CATÁLOGO DE VOZ ES EL DEL REEL ESTÁNDAR, y por eso se EXTRAJO en vez de
  copiarse.** `reelNarration.js` importa el redactor, que arrastra credenciales y
  clientes HTTP: cualquier módulo PURO que necesitara el catálogo dejaba de poder
  probarse sin credenciales. La alternativa era una segunda lista, y una copia se
  separa en silencio —la pantalla ofrecería un acento que el motor no sabe pedir—.
  `reelVoices.js` es el criterio puro y `reelNarration.js` lo RE-EXPORTA entero,
  así que ninguna importación existente cambió.
- **⚠️ SI EL MOTOR NO CONTROLA EL ACENTO, SE DICE CON EL NOMBRE DEL PROVEEDOR**
  (`accentControl` → `accentNote`). OpenAI tiene voces buenas y no seleccionables
  por acento: el español sale con deje anglosajón. Prometer «acento colombiano»
  con ese motor es exactamente la afirmación que este módulo no hace (v4.797). Y
  las regiones se siguen OFRECIENDO: el guion se escribe en ese idioma igual.
- **LA VOZ SE PIDE ANTES DE GENERAR Y VIAJA AL MOTOR DE SIEMPRE.**
  `stageProyecto` pasa `gender` y `language` a `startReelProject`, que es el único
  motor: no hay un segundo camino de locución. Los catálogos son CERRADOS —un
  idioma inventado llegaría a `synthesize` y saldría un rechazo del proveedor que
  no explica nada—.
- **⚠️ EL PRESUPUESTO DE PALABRAS SE DICE ANTES DE GASTAR LA SÍNTESIS, Y VA
  MARCADO COMO ESTIMACIÓN.** La duración real la MIDE `fitNarrationToDuration` del
  MP3 con ffmpeg y corrige el presupuesto con el ritmo REAL de esa voz (v4.669):
  este número sirve para avisar, nunca para decidir que un guion encaja. Y lo que
  se hace cuando no entra es RESUMIR el guion —el bucle reescribe con menos
  palabras—, no acelerar la voz: `atempo` sigue acotado al 4 %, por debajo del
  umbral audible.
- **UN GUION MANUAL QUE NO ENTRA AVISA, NO BLOQUEA.** `scriptOverride` se
  sintetiza tal cual —decisión documentada del módulo— así que el aviso es lo
  único que hay: dice cuántas palabras tiene, cuántas entran, y que la voz no se
  acelera. Bloquear convertiría cualquier observación en un muro y se dejarían de
  leer (regla del panel de tarifas, v4.854).
- **⚠️ EL ESTIMADO CONTABA DE MENOS: FALTABAN LAS ADAPTACIONES DE LIENZO.** El
  preset `solicitud` exige `requireExpansion`, así que una foto apaisada se
  completa con IA a 4 créditos (`REEL_CREDITS_EXPANSION`) y el «80 créditos» de la
  captura no las contaba. `expansionsFor` mira las medidas guardadas de cada foto
  contra el maestro del formato; y **lo que no se sabe se DICE** —cuántas fotos no
  tienen medidas registradas y cuánto sumarían— en vez de dar el número por
  completo. Un cero es una afirmación, un hueco es la verdad.
- **⚠️ EL PANEL DE VOZ ES UNO SOLO, MONTADO POR LAS DOS PANTALLAS.** Vivía dentro
  de `VideoCreator.tsx` y la Biblioteca no tenía ninguno: copiarlo habría repetido
  lo de la casilla de distritos (v4.748) y el selector de pools (v4.877), y acá lo
  que se separaría es con qué voz sale una pieza institucional. Se extrajo a
  `ReelNarrationPanel.tsx`; una prueba comprueba que las dos lo importen y que
  **ninguna conserve el suyo**. Verificado a la inversa.
- **EL CATÁLOGO SE CONSULTA DENTRO DEL PROPIO PANEL.** La Biblioteca no carga
  `ReelOptions`, así que pedirlo desde cada pantalla dejaría a una sin él —y el
  fallo sería mudo: los selectores saldrían vacíos—. Se pide una sola vez y sólo
  si no llegó por props. La respuesta se lee como TEXTO antes de `JSON.parse`: una
  página de error HTML rompe el parseo y el error resultante no nombra ninguna
  capa (v4.946).
- **⚠️ REGENERAR LA VOZ O EL INSTRUMENTAL NO REGENERA NINGUNA ESCENA, y ya era
  estructural.** `POST /reels/:id/narration` y `/music` limpian `renderJobId` y
  vuelven a `submitAssembly` con los clips que YA existen; el outro se conserva
  porque viaja en `config.outro` y entra como el último clip de `buildEditSpec`
  (v4.1032). Lo que faltaba era DECIRLO donde se pulsa y separar las dos acciones:
  «Regenerar voz en off» y «Regenerar instrumental» son dos preguntas distintas y
  un solo botón obligaba a rehacer las dos.
- **UN REEL SIN LOCUCIÓN REGISTRADA LO DICE; NO SE LE INVENTA UNA VOZ.** «Configuración
  de voz no registrada» y se puede elegir una nueva al regenerar. Rellenar el país
  o el género hacia atrás sería inventar el dato que se vino a medir (regla de
  v4.999 con `originClubId`).
- **⚠️ LA CONFIGURACIÓN DE VOZ YA SE PERSISTÍA Y NO SE AGREGÓ NINGUNA COLUMNA.**
  `ReelNarration` guarda `language`, `style`, `gender`, `voiceId`, `ttsProvider`,
  `script`, `actualSec` y `timing` desde su origen: los nombres del pedido
  (`voice_region`, `voice_gender`, `voiceover_script`, `voiceover_duration`) YA
  tienen equivalente y duplicarlos daría dos verdades sobre la misma voz. Lo único
  que faltaba era `music_duration`, y va en **`config.music`** (JSONB) y no en una
  columna: `ReelProject` se consulta en media plataforma y una columna declarada y
  todavía inexistente la dejaría en 500 desde el primer despliegue (regla de
  `logo_intl`, v4.699) — además de la trampa del atajo del ensure (v4.908).
- **EL PLAN NO GUARDA LAS FOTOS NI LA CANTIDAD.** `sceneCount` se DERIVA de
  `selection.items.length`: escribirlo también en el plan daría dos verdades sobre
  la misma selección y se contradirían en cuanto alguien la cambie desde el otro
  camino — el error que `publicKeyOf` evitó en Plantillas IA.
- **⚠️ EL ESPEJO DEL NAVEGADOR SIGUE SIENDO MÍNIMO.** No trae `resolveReelTiming`,
  `durationOptionsFor`, `summarizeReelPlan` ni `validateReelPlan`, y lo fija una
  prueba que comprueba su AUSENCIA: la duración resuelta, los créditos y el
  veredicto viajan RESUELTOS desde el servidor. Con dos aritméticas, el resumen
  diría un número y el motor produciría otro, y lo que se separaría es cuánto se
  le cobra a alguien.
- **NADA CONSUME CRÉDITOS DE VIDEO HASTA «REVISAR Y CONFIRMAR».** Sigue siendo la
  puerta de v4.1012 —`costs: true` sólo en `proyecto`, comprobada dos veces— y las
  cuatro acciones nuevas del asistente (cantidad, duración, género, región) son
  gratuitas por construcción, no por cuidado.

**Pendientes conocidos:** el asistente y el panel de voz **no se comprueban en un
navegador** — al tocar su maquetación, mirarla (la lección de v4.717); la
`voiceId` concreta no se elige a mano (la resuelve `voiceIdFor` a partir del
género y el proveedor: el catálogo de voces por id es del proveedor y cambia sin
avisar); y **25 y 30 segundos siguen sin ser alcanzables** con ningún material que
este preset admite — se aceptan para no perder lo heredado y no se ofrecen.

### Tres defectos MUDOS del cableado del Creador de Reels (v4.1011)

Los tres estaban vivos y ninguna comprobación los veía: el código es válido, los
tipos están bien y no dan ningún error. Los fija `npm run test:reels:wiring`
(13 casos, **sin base, credenciales ni red**), verificado a la inversa sobre los
tres leyendo los archivos — que es lo único que ve un cableado a medias entre
dos pantallas.

- **⚠️ `create` ES EL CREADOR DE VIDEO Y `post` EL GENERADOR DE
  PUBLICACIONES.** «Promocionar en redes» de una solicitud mandaba a `create`
  desde v4.968: aterrizaba en el creador de Reels —vacío, porque `postPrefill`
  se entrega en la otra pestaña— mientras la campaña y la fotografía esperaban
  sin que nadie las viera. **Al enlazar una pestaña por su id, mirar cuál es**:
  los rótulos no se parecen a los ids y el fallo se ve como una pantalla que no
  cargó. La prueba LEE del Estudio qué monta cada id en vez de darlo por sabido.
- **⚠️ `organizationName` LLEGABA SIEMPRE EN NULL en un Reel hecho a mano.**
  `startReelProject` la acepta desde siempre —titula la pieza con
  `buildReelTitle` y es el nombre por defecto de una de campaña
  (`defaultCampaignTitle`)— y `VideoCreator` no se la mandaba nunca. Ahora sale
  del SITIO desde cuyo panel se genera, **en su propio efecto con `club` en las
  dependencias**: puesta en el de las opciones —que corre una vez con `[]`— no
  llegaría jamás, porque el club viene del contexto en un render posterior (la
  lección de `conQr`, v4.836). Sólo rellena lo vacío: lo que el usuario ponga
  manda (la regla de `putAuto`). El workflow de una solicitud sí la mandaba; el
  defecto era sólo de la vía manual.
- **⚠️ DIEZ COLUMNAS FUERA DEL ATAJO DE `ensureReelSchema.js`.** No hacían daño
  por CASUALIDAD —`expandedS3Key` se creó en la misma tanda que
  `expandedImageUrl`, que sí figuraba, así que la comprobación fallaba por la
  hermana y la tanda corría igual—. Esa casualidad es la trampa de v4.908 y la
  que `feed` volvió a costar en v4.987: la próxima columna agregada **sola**
  habría dejado el atajo dando la base por al día y su `ALTER` no habría corrido
  nunca, en silencio. Ahora están las 15 y una prueba recorre todos los
  `ADD COLUMN` y los exige.
