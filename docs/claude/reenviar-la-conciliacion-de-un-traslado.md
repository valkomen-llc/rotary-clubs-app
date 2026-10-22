<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Reenviar la conciliación de un traslado — v4.1014

Un club recibió un traslado en agosto y en septiembre su presidente pide la
conciliación. El dinero ya se movió y el aviso salió a otro correo: lo que hace
falta es **volver a mandar el documento**, no volver a girar.

| Archivo | Qué es |
|---|---|
| `server/lib/reconciliationSpec.js` | El CRITERIO. **Puro**: qué aporte se puede seleccionar y de qué clase, cómo se agrupa una selección por traslado, qué se dice del alcance, qué valida un reenvío, las columnas y los totales del documento, el saneado para el PDF y cómo se compone el historial |
| `server/lib/reconciliationPdf.js` | El documento consolidado: PDF (jsPDF) y CSV |
| `server/lib/reconciliationNotices.js` | La I/O: resolver traslados, componer, archivar, enviar y registrar |
| `DisbursementNotice` en `ensureDisbursementSchema.js` | La tabla del reenvío, en runtime |
| `src/lib/reconciliationSpec.ts` | Espejo MÍNIMO: rótulos y la clase de un aporte |
| `BulkReconciliationBar.tsx` · `ResendNoticeModal.tsx` | La barra y el modal |

Pruebas: `npm run test:reconciliation` (104 casos de criterio, con el PDF y el
CSV compuestos de verdad) y `npm run test:reconciliation:path` (95, el CAMINO
con la base, el correo y S3 sustituidos en memoria). **Ninguna necesita
Postgres, credenciales ni red.** Verificadas a la inversa sobre las tres
invariantes que sostienen el módulo.

**Reglas durables:**

- **⚠️ REENVIAR NO MUEVE DINERO, Y ESO SE DEMUESTRA, no se afirma.** Es el
  punto 8 del pedido y es la regla de la que cuelga todo lo demás:
  `resendReconciliation` no escribe ni un `INSERT INTO "Disbursement"`, ni un
  `UPDATE` de `status`, `amount`, `disbursedAt` o `netAmount`, ni llama a la
  pasarela. Lo fijan DOS pruebas: una lee el archivo —una regla escrita en
  prosa no protege nada (v4.859)— y la del camino toma una **foto** de todo lo
  que la base dice sobre el dinero antes del reenvío y la compara después.
  Verificada a la inversa: basta agregar un `UPDATE "DisbursementBatch"` para
  que falle.
- **⚠️ EL ESTADO FINANCIERO Y EL DE COMUNICACIÓN SON DOS COSAS, y la traza lo
  respeta.** El hecho que queda en cada aporte (`reconciliation_resent`) va por
  `recordFact`, **sin `toState`**: con estado, un reenvío movería el aporte en
  el camino del dinero. Es la regla de v4.885 y acá es lo que impide que
  mandar un correo cambie un `DISBURSED`.
- **⚠️ EL AVISO ORIGINAL DEL LOTE NO SE PISA.** `DisbursementBatch.notifyState`,
  `notifyEmails` y `notifyResults` son las columnas del aviso que salió CUANDO
  SE GIRÓ, y son lo único que contesta «a quién se le avisó entonces».
  Escribir ahí para anotar un reenvío borraría el dato que el historial existe
  para conservar. Los reenvíos viven en su propia tabla.
- **⚠️ EL HISTORIAL SE COMPONE AL LEER, NO SE MIGRA** (`noticeHistory`). La
  entrada del aviso original se DERIVA de las columnas del lote y viaja marcada
  `derived: true`, para que la pantalla no ofrezca sobre ella acciones que no
  existen. Migrar una fila por cada aviso viejo exigiría que un despliegue
  escribiera en la base, que es lo que la sección de base de datos prohíbe
  desde el 2026-07-13.
- **⚠️ EL REENVÍO ES UN EVENTO PROPIO DEL REGISTRO DE ENTREGAS**
  (`disbursement_reconciliation`), no `disbursed`. La llave de
  `NotificationDelivery` es contribución + evento + destinatario: con el evento
  del giro, reenviarle la conciliación al MISMO tesorero al que ya se le avisó
  se marcaría «duplicado» y **no saldría nunca**. Y al revés, el historial
  dejaría de distinguir «se le avisó del traslado» de «se le mandó la
  conciliación después», que es la pregunta que el módulo existe para
  contestar. Lo destapó la prueba del camino: sin el evento en el catálogo
  CERRADO, `normalizeDelivery` devuelve `null`, `claimDelivery` falla y **no
  quedaba ninguna traza** — o sea, el punto 17 del pedido sin cumplir, en
  silencio.
- **`available: true` PERO `configurable: false`.** El evento OCURRE —lo
  dispara una persona con nombre desde la Bóveda, como `disbursed`— y por eso
  no puede declararse «no disponible»; lo que no tiene es regla que configurar,
  porque ningún perfil lo decide. `availableEvents()` dice qué ocurre y
  `configurableEvents()` qué se configura: ofrecerlo como interruptor en el
  panel de Notificaciones sería un control que no controla nada (v4.650).
- **⚠️ LA IDEMPOTENCIA ES DE LA BASE Y ES POR OPERACIÓN**, no por lote. El
  índice único parcial es `("clubId","operationKey") WHERE "operationKey" <> ''`
  —parcial porque un cliente que no la mande no puede chocar con otro—, así que
  el `ON CONFLICT` **repite su predicado** o la sentencia falla entera (la
  trampa de v4.648). La `operationKey` la genera la PANTALLA al abrir el modal:
  eso es lo que hace que el doble clic caiga en la misma operación y que un
  reenvío pedido de verdad tres semanas después salga igual.
- **Y la llave de la entrega es `resend:<noticeId>`, no el lote.** Con el lote
  como contribución, el segundo reenvío a la misma dirección se marcaría
  duplicado para siempre. Con la operación, dentro de UNA petición no se le
  escribe dos veces a nadie y entre operaciones distintas no hay duplicado que
  evitar: el reenvío se pide a propósito.
- **⚠️ LA CONCILIACIÓN ES SIEMPRE DEL TRASLADO COMPLETO, Y EL ALCANCE SE DICE
  ANTES.** Se pueden marcar tres aportes y el traslado cubrir ocho: una
  conciliación parcial no cuadra contra ningún extracto. `describeTransferScope`
  lo escribe en la barra —«los 3 aportes elegidos pertenecen a un traslado que
  cubre 8»— antes de abrir el modal. Un alcance que se descubre cuando el
  correo ya salió no se puede deshacer.
- **A QUÉ TRASLADO PERTENECE UNA SELECCIÓN LO RESUELVE EL SERVIDOR**
  (`/disbursement-batches/resolve`) y viaja RESUELTO. El vínculo vive en
  `Disbursement.batchId` y no viaja con el aporte; con un agrupamiento propio
  en la pantalla, la barra diría «una conciliación» y saldrían dos. Por eso el
  espejo del navegador **no trae** `groupByTransfer`, `validateResend` ni
  `reconciliationTotals`, y una prueba comprueba su AUSENCIA: dos aritméticas
  sobre el mismo traslado dirían dos totales, y lo que se separaría es lo que
  un club cree que recibió.
- **UN APORTE REVERSADO NO ENTRA EN EL DOCUMENTO.** Un comprobante que cuenta
  dinero que se devolvió no cuadra contra ningún extracto. Y el reenvío guarda
  `count` y `netAmount` **del momento en que salió**: un reverso posterior
  cambia el lote, y el historial tiene que poder decir qué se afirmó aquel día.
- **⚠️ EL DOCUMENTO SE COMPONE AUNQUE EL CORREO FALLE.** Es el punto 15 del
  pedido con sus palabras —«el documento fue generado correctamente y puede
  descargarse»—: primero se arma el PDF y se archiva, después se manda. Un
  envío rechazado deja la fila con su estado `fallido`, el motivo TEXTUAL del
  proveedor y el documento a mano para reintentar.
- **EL PDF SE COMPONE EN EL SERVIDOR, y no contradice la regla de v4.794.**
  Aquélla dice que rasterizar texto con sharp exige una fuente del SISTEMA y
  que Vercel no tiene ninguna instalada, así que salen cuadritos. jsPDF es otra
  cosa: sus fuentes base-14 las tiene el VISOR de PDF, no el servidor — sólo se
  escriben nombres de tipografía y coordenadas.
- **⚠️ PERO WINANSI DESCARTA EN SILENCIO LO QUE NO TIENE**, y está MEDIDO: el
  guion largo, los puntos suspensivos y las comillas tipográficas desaparecen
  sin dejar rastro. `toWinAnsi` los sustituye por su equivalente y marca con
  `?` lo que de verdad no cabe. Los acentos y la eñe sí sobreviven. **Todo
  texto que entre al PDF pasa por ahí.**
- **EL CSV LLEVA BOM Y PUNTO Y COMA** (regla de v4.850): sin BOM Excel abre los
  acentos rotos y con coma mete la fila entera en una columna.
- **⚠️ LA CLAVE DE S3 NO VIAJA AL NAVEGADOR.** El documento se archiva en el
  prefijo PRIVADO (`private/disbursements/<club>/documentos/…`) por
  `uploadPrivateDocument` —el MISMO cliente de S3 de los comprobantes, no un
  segundo— y se abre con un enlace firmado que caduca. `noticePublico` publica
  `hasDocument` y el nombre, nunca la clave: es un documento financiero con
  nombres de aportantes y cifras.
- **⚠️ EL AISLAMIENTO VA EN EL `WHERE`, y lo ajeno responde 404, no 403.**
  Confirmar que un traslado existe es la mitad de lo que hace falta para ir a
  buscarlo. Alcanza a las CINCO rutas —resolver, historial, comprobante,
  reenvío y documento—, todas con `authMiddleware` + `requireSiteAdmin`, y el
  sitio sale del TOKEN, nunca del cuerpo. Lo comprueba la prueba del camino
  pidiendo el lote de otro club con cada una.
- **REENVIAR EXIGE CONFIRMACIÓN EXPLÍCITA** (`confirm: true`, 428 sin ella).
  Manda un correo a un TERCERO con los datos de los aportantes de una campaña:
  no se deshace pulsando «atrás». Mismo criterio que reversar un desembolso.
- **⚠️ WHATSAPP NO SE OFRECE, y su ausencia es deliberada.** Una conciliación es
  una TABLA con un documento adjunto, y la única plantilla aprobada es la del
  AVISO DE GIRO: mandarla acá le diría al club que le giraron otra vez, que es
  exactamente lo que este correo existe para no decir. Los teléfonos que
  lleguen se reportan como **omitidos con su motivo** — y no pasan por
  `resolveRecipients`, que sin un validador los descarta en SILENCIO, ni
  siquiera como descartados.
- **NO HAY UN SEGUNDO MOTOR DE CORREO.** El mensaje lo compone `buildBatchEmail`
  con un `mode: 'reconciliation'` ADITIVO —sin él, el correo del giro sale
  idéntico a antes—, lo reclama `claimDelivery` y lo manda `sendPlatformEmail`,
  que **no lanza** y contesta `{ success }` (v4.901/v4.945). Un segundo camino
  se separaría del primero en silencio y dejaría estos envíos fuera del panel
  de entregas, que es donde alguien los va a buscar cuando digan que no llegó.
- **LA FRASE QUE LO DISTINGUE ES UNA CONSTANTE** (`RECONCILIATION_NOTE`), va en
  el HTML **y en el texto plano**, y se muestra en el modal ANTES de enviar:
  quien lo pide tiene que saber exactamente qué va a leer el destinatario.
- **UNA SELECCIÓN MEZCLADA NO EJECUTA NADA.** `selectionClassOf` parte los
  aportes en `disponible` —sobre los que se REGISTRA un giro, y eso mueve
  dinero— y `trasladado` —sobre los que se REENVÍA un documento—. Son dos
  barras y no una con un `if`: un solo componente con las dos acciones adentro
  haría que un cambio pensado para el reenvío pudiera colarse en el registro, y
  ahí el precio es un desembolso que nadie pidió. Con una mezcla se dice y se
  ofrece quedarse con una de las dos clases.
- **LA TARJETA «Desembolsado» FILTRA LA LISTA; «Transferido» NO.** Aquélla
  cuenta APORTES y por eso puede filtrarlos; ésta cuenta PAYOUTS al banco del
  club, que son otra cosa (v4.886). Y el filtro de estado **no toca el saldo**:
  un saldo es a una fecha, no dentro de un rango (regla de v4.849) — se dice
  con `AVISO_ESTADO`, porque un número que no cambia al filtrar se lee como que
  el filtro no funciona.
- **`DisbursementNotice` vive fuera de Prisma** y está en la lista del guardián
  de `db:push`. `Payment` y `Donation` no ganan ni una columna: se consultan
  con `findMany` **sin `select`** en media plataforma, así que una declarada y
  todavía inexistente deja en 500 el webhook del COBRO (regla de `logo_intl`,
  v4.699).
- **La tabla se crea en las DOS vías del ensure** —la creación y el atajo—, o no
  existiría en la base de producción y el reenvío degradaría en silencio (la
  trampa de v4.908). Lo fija una prueba que extrae cada `db.query(...)` del
  archivo y exige que `NOTICE_SQL` aparezca en las dos.

### La conciliación no exige un traslado agrupado — v4.1015

Reporte con la Bóveda delante: ocho aportes con su insignia **DISBURSED**, la
barra diciendo «8 contributions trasladados seleccionados · **Ninguno pertenece
a un traslado agrupado**» y el botón «Reenviar notificación» apagado. El dinero
había salido y no había forma de mandarle el comprobante al presidente.

| Pieza | Qué es |
|---|---|
| `planReconciliation` · `describeReconciliationPlan` (`reconciliationSpec.js`) | El CRITERIO del ÁMBITO. **Puro**: de los aportes elegidos a `traslado` o `seleccion`, qué queda fuera y qué hay que decir |
| `reconciliationRef` · `CONSOLIDATED_COLUMNS` · `columnsForScope` · `dateRangeOf` | La identidad del documento consolidado y sus columnas |
| `resolveReconciliation` (`reconciliationNotices.js`) | El punto ÚNICO por el que pasan la vista previa, la descarga y el envío |
| `itemsForPayments` · `mapearAportes` (`disbursements.js`) | La otra puerta a los mismos aportes: por lote o por aportes, con UN solo mapeador |
| `POST /wallet/reconciliations/{resolve,document,resend}` | La API por aportes. Las del lote se conservan enteras |
| `DisbursementNotice.scope` · `paymentIds` · `disbursementIds` · `batchIds` | El alcance REAL del documento, congelado con el envío |

Pruebas: `npm run test:reconciliation` (173 casos de criterio) y
`npm run test:reconciliation:path` (154, el CAMINO con la base, el correo y S3
sustituidos). **Ninguna necesita Postgres, credenciales ni red.** Verificadas a
la inversa sobre seis defectos, incluido el del reporte.

- **⚠️ EL LOTE ERA UNA NECESIDAD DE LA BÚSQUEDA, NO DEL DOCUMENTO, y ése es
  todo el diagnóstico.** `Disbursement.batchId` es NULLABLE y el camino de a
  uno **nunca lo llena** (`registerDisbursement({ batchId = null })`; ninguna
  pantalla manda el lote), así que todo giro registrado de a uno —y todo giro
  anterior a v4.996— lo tiene en NULL para siempre. De ahí colgaba el bloqueo en
  CINCO capas: la columna `DisbursementNotice."batchId" TEXT NOT NULL`,
  `groupByTransfer` mandando esos aportes a `sueltos`, `validateResend`
  exigiendo `batch?.id`, `resendReconciliation` entrando por `batchRow` →
  `batchItems` (`WHERE d."batchId" = $1`), y la pantalla con
  `puede = lotes.length > 0`. Lo que un comprobante necesita son los APORTES y
  sus movimientos; el lote es UNA de las dos formas de llegar a ellos, y sólo
  existía esa.
- **⚠️ HAY DOS ÁMBITOS Y LOS ELIGE EL CÓDIGO.** `traslado` —todos los aportes
  de un mismo lote, sin sueltos— reutiliza el comprobante del giro COMPLETO,
  con su historial y su referencia `LOTE-…`: la regla de v4.1014 de que una
  conciliación parcial no cuadra contra el extracto **sigue entera ahí**, y una
  prueba lo fija eligiendo 3 de 5 y comprobando que salgan los 5. `seleccion`
  —varios lotes, giros sueltos o una mezcla— compone UNA conciliación
  consolidada sobre los aportes elegidos.
- **⚠️ LA CONSOLIDADA NO FINGE SER UN TRASLADO.** Lleva su propia referencia
  `CONC-…` —«Referencia de la conciliación», nunca «del traslado»—, un RANGO de
  fechas en vez de una, y la lista de movimientos de origen con la referencia,
  la fecha, el medio y la referencia bancaria de cada uno, en el PDF, en el CSV
  y en el correo. Un `LOTE-` inventado afirmaría una transferencia que el banco
  nunca vio, que es la misma mentira que la regla original quería evitar.
- **⚠️ Y NO CREA UN `DisbursementBatch`.** Fabricar un lote para poder conciliar
  era el camino corto y es exactamente el movimiento de dinero prohibido: un
  lote tiene totales, comprobante bancario y aparece en la lista de traslados.
  Lo fija una prueba que lee el archivo —ni un `INSERT INTO "Disbursement"`, ni
  uno en `"DisbursementBatch"`, ni un `UPDATE` de ninguno de los dos— y otra que
  **fotografía la base antes y después** del reenvío y compara.
- **⚠️ ESA PRUEBA SE LEE CON `codigo()`, NO CON `read()`.** El encabezado de
  `reconciliationNotices.js` EXPLICA la regla nombrando `INSERT INTO
  "Disbursement"`: leído con comentarios, la comprobación falla contra su propia
  documentación. Es la lección de v4.991, pagada otra vez.
- **⚠️ NINGÚN AVISO BLOQUEA.** El de v4.1014 era el único que sí lo hacía y era
  FALSO: esos aportes sí tienen conciliación, sólo que no es la de un lote. Lo
  que se dice ahora es de dónde vienen («2 traslados agrupados y 1 giro
  suelto»), que el documento conserva cada referencia, que no se modifica
  ninguno, y cuándo de un lote entra sólo una parte («2 de sus 5»). Un bloqueo
  sin salida se lee como una avería (v4.1008).
- **⚠️ Y NO SE RESOLVIÓ ESCONDIENDO EL MENSAJE.** El botón mira si hay aportes
  CONCILIABLES, no si hay lotes; una prueba comprueba las dos cosas sobre el
  archivo y falla si vuelve `lotes.length > 0` o la frase vieja.
- **UN SOLO PUNTO DE RESOLUCIÓN** (`resolveReconciliation`), compartido por la
  vista previa, la descarga y el envío. Con tres, la pantalla prometería un
  documento y el correo llevaría otro; y cuando el ámbito cae en un lote,
  DELEGA en el camino de siempre en vez de duplicarlo.
- **UN SOLO MAPEADOR DE APORTES** (`mapearAportes`), leído por lote o por
  aportes. Con dos, la conciliación de un lote y la consolidada mostrarían
  cifras distintas del mismo aporte y no habría cómo saber cuál creer.
- **⚠️ EL GIRO DE A UNO NO GUARDA `donationId`, Y SIN ÉL EL DOCUMENTO NO SABE A
  QUIÉN NOMBRAR.** Sólo el camino agrupado lo escribe —`createDisbursement` lo
  toma del cuerpo y **ninguna pantalla lo manda**—, así que esas filas llegaban
  al documento como «Aportante sin nombre», las ocho. Se cae al vínculo que el
  propio pago declara en su `rawPayload`, que es la MISMA primera pasada EXACTA
  de `linkDonationsToPayments`; la heurística por importe y fecha **no se usa**:
  atribuir un aporte por parecido en un documento financiero es inventar. **Lo
  destapó la prueba del camino, no la lectura.**
- **⚠️ UNA CONCILIACIÓN ES DE UNA SOLA MONEDA.** Una selección que mezcle se
  rechaza nombrando las dos y diciendo la salida (filtrar por moneda): sumar
  pesos con dólares es el defecto que abrió el rediseño financiero (v4.841) y
  acá terminaría impreso en un documento que alguien archiva.
- **LA FILA GUARDA SU ALCANCE** (`paymentIds`, `disbursementIds`, `batchIds`),
  no sólo el lote. No se deriva al leer y no puede: los desembolsos cambian —se
  reversan, se completan— y el historial tiene que poder decir QUÉ afirmó ese
  documento el día que salió. Mismo motivo por el que ya se congelaban `count` y
  `netAmount`.
- **⚠️ `DisbursementNotice."batchId"` PASÓ A NULLABLE, y las cuatro columnas
  nuevas están ENUMERADAS en el atajo del ensure.** `CREATE TABLE IF NOT EXISTS`
  no amplía nada y la base de producción ya tiene la tabla desde v4.1014: sin
  los `ALTER` el INSERT fallaría con «column does not exist» **en silencio**,
  porque este módulo degrada. Es la trampa de v4.908, y una prueba exige cada
  columna en la lista.
- **LAS RUTAS DEL LOTE SE CONSERVAN ENTERAS.** Un navegador con el bundle
  anterior en caché sigue funcionando; lo nuevo vive en
  `/wallet/reconciliations/*` y son POST porque llevan la lista de aportes —ocho
  identificadores en una barra de direcciones es frágil y con cuarenta no entra—.
- **EL ADJUNTO DEL BANCO VIAJA SÓLO EN EL ÁMBITO DEL LOTE.** Una consolidada
  abarca varios movimientos y adjuntar los soportes de todos daría un correo de
  decenas de MB; el documento nombra cada referencia, que es lo que hace falta
  para pedirlos.
- **⚠️ AL AGREGAR UNA COLUMNA DEL PAGO AL `SELECT` DE UN APORTE, comprobar que
  el doble de la base la pegue.** Tenía un caso especial por columna
  (`providerRef`) y `rawPayload` llegaba `undefined`: el documento salía sin ese
  dato y nada avisaba. Ahora el doble pega CUALQUIER `p."col"` sin alias.
- **⚠️ Y AL AGREGAR UN BLOQUE A `test-reconciliation-path.mjs`, VA ANTES DE
  `server.close()`.** Puesto después, todas sus peticiones mueren con «socket
  hang up» y el arnés no dice por qué — el servidor ya estaba cerrado.

**Pendientes conocidos:** ~~el reenvío no se puede reintentar desde el
historial~~ — **MATIZADO en v4.1018**: «Reenviar nuevamente» trae los
destinatarios de esa notificación al formulario, pero **no reintenta el mismo
envío**: sigue siendo una operación nueva, a propósito (un reenvío manda un
correo a un tercero y no se deshace). Los destinatarios sugeridos salen de quién ya recibió algo de ESE
traslado y **no del CRM** —no hay todavía un catálogo de cargos
(presidente/tesorero/secretario) por club que consultar—; y ~~la conciliación de
un aporte girado **por fuera** de un traslado agrupado (los anteriores a v4.996)
no existe~~ — **RESUELTO en v4.1017**: aquélla cubrió el giro de a uno
(`batchId` en NULL) y no el giro en BLOQUE anterior a v4.996, que tiene marca de
agrupación sin ficha de traslado y seguía muriendo en 404. Ver la sección
siguiente.

### Una marca de agrupación no es un lote — v4.1017

Segundo reporte con la Bóveda delante y v4.1015 desplegada: los mismos aportes
`DISBURSED`, la barra diciendo **«Este traslado no existe en este sitio»** y el
botón de reenviar apagado otra vez. La v4.1015 resolvió el caso del giro de a
uno (`batchId` en NULL) y no el que hay en producción.

| Pieza | Qué es |
|---|---|
| `knownBatches` en `planReconciliation` | El catálogo de marcas que SÍ tienen ficha. Omitirlo se comporta como antes |
| `plan.agrupaciones` | Las marcas sin ficha, aparte de `batchIds`: nadie puede leerlas como un lote |
| `groupSizes` (`disbursements.js`) | Cuántos aportes cubre una agrupación, DERIVADO de sus propias filas |
| `Disbursement.batchTracked` | Si esa marca tiene ficha. Es con lo que la pantalla decide si ofrece el botón |

Pruebas: dentro de `npm run test:reconciliation` (190 casos) y
`npm run test:reconciliation:path` (170, el CAMINO con la base sustituida).
Verificadas a la inversa sobre las cinco invariantes.

- **⚠️ `Disbursement.batchId` ES DE v4.887 Y `DisbursementBatch` DE v4.996, así
  que hay marcas de agrupación SIN FICHA — y son las que hay en producción.**
  Ésa es toda la causa. La columna agrupa los movimientos de un mismo giro
  desde que el desembolso en bloque compartió comprobante (v4.887); la fila con
  los totales, el comprobante y el historial llegó nueve versiones después. Todo
  giro en bloque de en medio tiene la marca y no tiene fila. `planReconciliation`
  la tomaba por un lote, declaraba ámbito `traslado`, y `resolveReconciliation`
  se iba a `batchRow` a buscar una fila que no existe: 404 con el dinero ya
  girado y ninguna forma de conciliarlo. **Al leer una columna que apunta a otra
  tabla, preguntarse desde cuándo existe cada una.**
- **LO QUE DECIDE ES QUÉ FILAS EXISTEN, no qué marca traen los desembolsos.**
  `resolveReconciliation` consulta los lotes ANTES de decidir y pasa
  `knownBatches`; el criterio sigue siendo puro y probable. `knownBatches`
  omitido da todas las marcas por buenas, que es el comportamiento anterior:
  aditivo, y las 173 pruebas de v4.1015 pasaron sin tocar ninguna.
- **⚠️ UNA AGRUPACIÓN SIN FICHA NO ABRE EL CAMINO DEL TRASLADO.** No hay fila
  que leer, ni comprobante del lote que reutilizar, ni historial de lote que
  continuar: va por la CONSOLIDADA, que es exactamente el mecanismo que v4.1015
  creó para los movimientos sin ficha. Fabricarle una fila de lote para poder
  conciliar sería el movimiento de dinero que este módulo tiene prohibido.
- **SU TAMAÑO SE DERIVA DE SUS PROPIAS FILAS** (`groupSizes`), que es como el
  listado lo viene calculando desde v4.887 —«giro conjunto de N aportes»—, en
  UNA consulta agrupada y no una por marca. Así se puede decir «del giro entran
  3 de sus 8» igual que con un lote, que es lo que le falta a quien elige sólo
  una parte de una transferencia.
- **NO SE AMPLÍA LA SELECCIÓN POR NUESTRA CUENTA, y ahí está la asimetría con
  el lote.** Con ficha, la conciliación va COMPLETA porque la fila DECLARA qué
  conjunto es el traslado y trae su comprobante; sin ficha lo único que hay es
  una marca en las filas, y meter en el documento aportes que el usuario no
  eligió sería decidir por él sobre un conjunto que nadie declaró. Se avisa con
  el número y él completa la selección si quiere.
- **PARA QUIEN LEE EL AVISO, UN GIRO CONJUNTO ES UN GIRO CONJUNTO** tenga ficha
  o no: su pantalla ya los nombra igual (`LOTE-XXXXXXXX`, derivado del id). La
  distinción es NUESTRA —de dónde se lee la cabecera— y no le sirve de nada,
  así que `describeReconciliationPlan` los cuenta juntos.
- **⚠️ ERAN CUATRO PUERTAS AL MISMO 404 Y SÓLO UNA ESTABA REPORTADA.** La barra
  de reenvío, «Ver traslado y conciliación» de la ficha del aporte, «Ver
  desembolso» de la lista de desembolsos, y el modal que abre la primera de
  esas dos. Arreglar sólo la reportada habría dejado al usuario chocando con las
  otras tres en la misma pantalla. Es la regla de v4.979: **al cerrar una
  puerta, contar cuántas hay.**
- **UN BOTÓN SÓLO SE OFRECE SI TIENE A DÓNDE LLEVAR** (`batchTracked`, v4.650).
  El comentario que ya estaba en `WalletManagement.tsx` decía la intención
  correcta —«los sueltos, anteriores a v4.996, no tienen uno, y entonces no se
  ofrece un botón que no lleva a ninguna parte»— y la condición miraba `batchId`:
  daba por hecho que «anterior a v4.996» era «sin batchId», y es al revés.
  **Una suposición escrita en un comentario no la comprueba nadie.**
- **`!== false` Y NO `=== true`**: un servidor anterior no manda el campo, y sin
  el dato la pantalla se comporta como siempre. Y `false` no es `null`: aquél es
  «esta marca no tiene ficha que abrir» y éste «este desembolso no salió en un
  giro conjunto». Son cosas distintas y la pantalla dice cosas distintas.
- **DONDE ESTABA EL BOTÓN QUEDA LA SALIDA, no un hueco.** Un giro conjunto sin
  ficha dice cuántos aportes cubrió y que su conciliación se genera marcando los
  aportes. Un hueco sin explicación es indistinguible de que falte algo (v4.938)
  y un botón que da 404 es peor.
- **⚠️ Y HABÍA UN RENOMBRADO A MEDIAS DE v4.1015 EN PRODUCCIÓN.**
  `ResendNoticeModal` pasó a recibir `paymentIds` y el montaje que lo abre desde
  la ficha de un aporte se quedó con `batchIds`: llegaba sin ningún aporte. **El
  typecheck SÍ lo veía** —`TS2322`, desde el día del despliegue— y se perdió
  entre los 276 errores heredados. La regla del sitio ya lo dice: al tocar un
  archivo, dejarlo sin errores PROPIOS. Ahora una prueba lo fija leyendo el
  archivo, que es lo único que ve un cableado a medias entre dos capas (v4.889).
- **EL MODAL RECIBE UN APORTE Y EL SERVIDOR RESUELVE SU TRASLADO.** Un solo
  aporte del lote basta para que la conciliación salga completa —está probado
  desde v4.1015—, así que este camino y el de la selección múltiple entran por
  la MISMA puerta en vez de tener el modal dos formas de abrirse.
- **⚠️ NI UNA COMILLA INVERTIDA DENTRO DE UN SQL EN TEMPLATE LITERAL, tampoco en
  un comentario.** Van cuatro veces (v4.721.1, v4.847, v4.998 y ésta): el
  comentario que explicaba la columna nueva citaba el nombre de la columna con
  comillas invertidas, cerró el literal y el módulo entero dejó de parsear. Lo
  atrapó `npm run check:syntax`, que es la única barrera que lo ve.
- **AL DOBLE DE LA BASE HAY QUE ENSEÑARLE LA FORMA NUEVA, leyendo el SQL**
  (v4.1005). No conocía el segundo `CASE ... END AS`, así que dejaba su `FROM`
  interno dentro del texto y `tablaDe` resolvía la tabla equivocada: la consulta
  devolvía vacío y la prueba culpaba al módulo. Se generalizó a CUALQUIER alias
  en vez de añadir otro caso especial — con uno por columna, la siguiente
  subconsulta vuelve a romperlo en silencio.


### El documento lleva marca y el correo lleva el comprobante — v4.1018

Pedido con las dos capturas delante: que el PDF de conciliación comparta la
identidad visual del correo de Club Platform, y que el reenvío adjunte los
comprobantes REALES del traslado en vez de dejar que se busquen a mano.

| Pieza | Qué es |
|---|---|
| `server/lib/brandLogos.js` | Descarga y normaliza un logotipo para el PDF: `https` únicamente, tope de tiempo y de peso, sharp a 96 px de alto, caché, y NUNCA lanza |
| `fitLogo` · `dedupeReceipts` · `planAttachments` · `describeAttachments` · `sourceKindLabel` (`reconciliationSpec.js`) | El CRITERIO. **Puro**: geometría del logotipo, deduplicación de comprobantes, presupuesto de peso y qué se dice de lo que viaja |
| `receiptsForReconciliation` · `reconciliationReceiptUrl` (`reconciliationNotices.js`) | La I/O: de qué filas salen los comprobantes y cómo se mira uno antes de mandarlo |
| `DisbursementNotice."attachments"` | Qué archivos salieron en ESE reenvío |
| La sección «Archivos adjuntos» de `ResendNoticeModal.tsx` | Los dos interruptores, la lista, «Ver» y «Reenviar nuevamente» |

Pruebas: `npm run test:reconciliation` (235 casos de criterio),
`npm run test:reconciliation:path` (189, el CAMINO con la base, el correo y S3
sustituidos) y `npm run test:reconciliation:ui` (18 en un navegador con la API
interceptada y el CSS compilado). **Ninguna necesita Postgres, credenciales ni
red.** Verificadas a la inversa sobre las tres invariantes.

- **⚠️ LA IDENTIDAD VISUAL NO SE ESCRIBE DOS VECES, Y ESTABA ESCRITA DOS
  VECES.** `reconciliationNotices.js` tenía su propia copia de `marcaDelSitio`
  —más pobre que la de `disbursements.js`, que resuelve Club → District de
  respaldo (v4.996)—: la consecuencia medida es que **el correo de conciliación
  salía sin ningún logotipo** mientras el del giro sí los llevaba, con el mismo
  sitio y la misma configuración. La copia se retiró y las dos funciones se
  EXPORTARON de su dueño. Al necesitar la marca de un sitio, importarla; una
  copia se separa en silencio y lo que se separa es qué ve el destinatario.
- **⚠️ EL LOGOTIPO DEL PIE SE RESUELVE DEL SITIO QUE ORIGINÓ EL TRASLADO, no
  del que mira.** Es lo que hace que cualquier club o distrito muestre el suyo
  sin escribir nada: `marcaDelSitio(clubId)` sobre el `clubId` de la
  conciliación. El de la cabecera es el de la PLATAFORMA
  (`marcaDeLaPlataforma`), y son dos preguntas distintas — el documento lo
  emite Club Platform y lo firma el sitio.
- **UN LOGOTIPO QUE NO CARGA NO CUESTA EL DOCUMENTO.** `loadBrandLogo` devuelve
  `{ ok:false, motivo }` ante cualquier fallo y el PDF pinta el nombre en
  texto. Un documento financiero que no se puede emitir porque un `<img>` no
  respondió sería cambiar un problema de estética por uno de servicio.
- **⚠️ NINGUNA DESCARGA SIN TOPE DE TIEMPO** (v4.875): esto corre dentro de la
  petición que compone el PDF. `AbortSignal.timeout`, `https` únicamente
  —una URL de logotipo la escribe un administrador— y tope de peso antes de
  entregarlo a sharp.
- **EL LOGOTIPO SE RASTERIZA A 96 px DE ALTO Y SE INCRUSTA UNA VEZ POR ALIAS**
  (`addImage(..., alias, 'FAST')`). Está MEDIDO: sin `FAST` y a 132 px, el
  mismo documento pasaba de **16 KB a 274 KB**; con los dos ajustes queda en
  18 KB. El pie se dibuja en cada página y sin el alias jsPDF re-incrusta el
  archivo una vez por hoja. **Al añadir una imagen al PDF, darle alias y
  medir el peso.**
- **`fitLogo` NUNCA AGRANDA.** Un escudo pequeño estirado a la caja se ve
  pixelado, y el pedido dice expresamente que no se deforme: se escala por el
  primer límite que se alcanza y, si ya cabe, se deja como está.
- **⚠️ EL PIE SE MIDE DESDE ABAJO, no hacia abajo desde su separador.** Medido
  hacia abajo, la tercera línea caía fuera de la página. El presupuesto vertical
  del pie (`PIE_ALTO`) está MEDIDO, no estimado, y el corte de página
  (`LIMITE`) lo descuenta: sin eso la última fila de la tabla se metía debajo
  del pie. **Al añadir una línea al pie, volver a medir `PIE_ALTO`.**
- **LA CABECERA DE LA TABLA SE REPITE EN CADA PÁGINA Y SUS RÓTULOS SE PARTEN
  CON `splitTextToSize`.** El `maxWidth` de jsPDF envuelve en silencio y el
  segundo renglón se dibujaba ENCIMA del filete —se veía en la propia captura
  del reporte—: se reserva `(líneas − 1)` de alto antes del filete.
- **⚠️ LOS COMPROBANTES ESTÁN EN DOS TABLAS Y HAY QUE LEER LAS DOS.**
  `DisbursementBatch.receiptFiles` los tiene desde v4.996; un giro conjunto
  ANTERIOR no tiene ficha, así que su soporte vive en cada fila de
  `Disbursement` (v4.887, una clave compartida por las N filas). Leer sólo la
  primera deja sin comprobante justamente el caso que hay en producción — y el
  fallo es mudo: el correo sale, sin adjunto.
- **⚠️ LA DEDUPLICACIÓN ES POR CLAVE DE S3, no por lote ni por nombre.** Ocho
  aportes de una transferencia comparten UNA clave porque el archivo se subió
  una vez: la clave es lo único que identifica al archivo. Por `batchId` no
  bastaría —un giro suelto no tiene—, y por NOMBRE se fundirían dos soportes
  distintos que se llaman igual, que es peor que repetir uno. Verificado a la
  inversa: deduplicando por nombre, dos archivos homónimos dan un adjunto y el
  mismo archivo con dos nombres da dos.
- **EL PRESUPUESTO SE COMPRUEBA ANTES DE ACEPTAR** (`ATTACHMENTS_MAX_TOTAL_BYTES`).
  Aceptar y recortar después daría un correo que el proveedor no entrega; lo
  que no entra se NOMBRA con su motivo y se dice en la pantalla.
- **SIN COMPROBANTE NO SE BLOQUEA NADA.** Se dice «no se encontró un
  comprobante asociado a este traslado» y sale la conciliación sola. Un giro
  registrado sin soporte cargado es un caso normal, no un error.
- **⚠️ LA CLAVE DE S3 NO VIAJA AL NAVEGADOR** (v4.998). La lista del modal
  lleva nombre, peso, referencia del movimiento e ÍNDICE; mirar un comprobante
  es un POST que **vuelve a resolver** la conciliación en el servidor y firma
  por posición. Con la clave en la respuesta, cualquiera compondría la
  dirección de otro objeto del prefijo privado. El enlace firmado sí contiene
  la ruta del objeto —eso es lo que es un presigned—, y por eso la
  comprobación es que la clave no viaje como DATO aparte.
- **ADJUNTAR ES UNA PREFERENCIA DEL SERVIDOR, NO DE LA PANTALLA.**
  `includeReceipts` viaja en la petición y por defecto es cierto
  (`!== false`), así que un navegador con el bundle anterior sigue recibiendo
  los comprobantes.
- **EL CORREO DICE QUÉ LLEVA, y la frase la compone el criterio**
  (`describeAttachments` → `attachments_note`, variable OPCIONAL de
  `buildBatchEmail`). La nota de que NO es un traslado nuevo se conserva
  entera: lo que se agrega va detrás. Escribir la frase en el HTML del correo
  la dejaría fuera del texto plano y fuera de la vista previa.
- **LA FILA DEL REENVÍO GUARDA QUÉ ARCHIVOS SALIERON** (`attachments`, JSONB,
  con su `ADD COLUMN IF NOT EXISTS` **enumerado en el atajo del ensure** — la
  trampa de v4.908). Sin eso, «¿se le mandó el soporte del banco a este
  presidente?» no se puede contestar dentro de seis meses.
- **«REENVIAR NUEVAMENTE» RELLENA LOS DESTINATARIOS; NO ENVÍA.** El reenvío
  manda un correo a un tercero y no se deshace: repetirlo con un clic desde el
  historial sería exactamente el gesto que la confirmación explícita existe
  para evitar (v4.1014). Se copian los destinatarios al formulario y se
  desplaza hasta él.
- **EL RÓTULO DE LA CLASE DE MOVIMIENTO SALE DEL CRITERIO COMPARTIDO**
  (`sourceKindLabel`, espejado en `src/lib/reconciliationSpec.ts`). Escrito a
  mano en el modal decía «Giro suelto» sobre una agrupación — se vio mirando
  la pantalla pintada, no leyendo el archivo.
- **⚠️ Y LA AGRUPACIÓN SIN FICHA ENTRA EN «MOVIMIENTOS DE ORIGEN».**
  `consolidatedHeader` sólo recorría `plan.batchIds` y los sueltos, así que el
  caso más común de este cliente —el giro conjunto anterior a v4.996, que
  v4.1017 hizo conciliable— salía con «Movimientos de origen: 0» en el
  documento y en el modal. Al agregar una clase de origen al plan, agregarla
  también a quien compone la cabecera.
- **⚠️ EL REENVÍO SIGUE SIN MOVER UN PESO, y se demuestra igual.** La prueba
  del camino fotografía todo lo que la base dice sobre el dinero antes y
  después, y una prueba lee el archivo: ni un `INSERT INTO "Disbursement"`, ni
  uno en `"DisbursementBatch"`, ni un `UPDATE` de ninguno de los dos.
- **⚠️ EL DOBLE DEL BUCKET GUARDA `{ bytes, contentType }`, la forma del SDK
  v3.** Sembrarlo con un Buffer suelto hace que `receiptAttachment` lea un
  objeto vacío y el comprobante no viaje — la prueba culpa al módulo, que está
  bien. Y el fixture del comprobante tiene que ser COHERENTE: un archivo
  llamado `.png` con MIME `application/pdf` es un fixture que codifica un
  defecto (v4.1001), no un caso a soportar.
- **AL PROBAR EL MODAL EN UN NAVEGADOR, SERVIRLO DESDE UN ORIGEN REAL.**
  `setContent` deja `about:blank` y una dirección relativa no tiene base
  contra la que resolverse: la petición no sale y la prueba pasa sin
  ejercitar nada (v4.720). Y las rutas de Playwright resuelven la ÚLTIMA
  primero, así que el comodín `**/api/**` va antes que las específicas.

### El botón que se quedaba en «Enviando…» — v4.1019

Reporte con la pantalla delante: se pulsa «Enviar conciliación», el botón pasa
a «Enviando…» y no ocurre nada. El correo no llega y no aparece ningún error.

| Pieza | Qué es |
|---|---|
| `EmailService.RESEND_TIMEOUT_MS` | El tope del envío al proveedor, por entorno |
| `DOMAIN_LOOKUP_TIMEOUT_MS` (`senderDomains.js`) | El tope de la consulta de dominios verificados |
| `NodeHttpHandler` en `getS3()` (`disbursements.js`) | Los topes de conexión y de socket del cliente de S3 de este módulo |
| `etapas` + `medir()` (`reconciliationNotices.js`) | Qué tardó cada paso y cuál falló, en la respuesta |
| `TIMEOUT_ENVIO_MS` (`ResendNoticeModal.tsx`) | El tope del navegador y su desenlace honesto |

Pruebas: las de `npm run test:reconciliation` (252 casos). Verificadas a la
inversa sobre las cinco: quitando cualquiera de los tres topes, el paralelismo
o el tope del navegador, falla una comprobación.

- **⚠️ EL DIAGNÓSTICO SALIÓ DE UNA ELIMINACIÓN, NO DE UNA CORAZONADA.**
  `resendReconciliation` está ENTERO envuelto en `try`, y cada paso de dentro
  también: por construcción **siempre devuelve algo**. Así que un botón que se
  queda en «Enviando…» para siempre no puede ser un error tragado — tiene que
  ser una llamada de salida que nunca se resuelve. Medido antes de tocar nada:
  el PDF se compone en 1,4 s con los dos logotipos y en 32 ms cuando el origen
  del logotipo no existe, así que el documento no era. Quedaban tres llamadas
  sin tope y **las tres viven en este camino**. Al diagnosticar un cuelgue,
  empezar por descartar lo que no puede colgarse.
- **⚠️ ERAN TRES VIOLACIONES DE LA MISMA REGLA (v4.875), y una de ellas era
  nuestra segunda instancia de un cliente que ya estaba bien configurado.**
  `storage.js` declara `connectionTimeout` y `socketTimeout` desde siempre;
  `getS3()` en `disbursements.js` creaba OTRO `S3Client` sin ellos, y el valor
  por omisión del SDK v3 en Node es **0 — sin tope**. Dos clientes del mismo
  bucket con dos comportamientos distintos ante el mismo fallo. **Al crear una
  segunda instancia de un cliente que ya existe, copiar su configuración, no
  sus argumentos mínimos.**
- **⚠️ «NO CONTESTÓ» NO ES «NO SE ENVIÓ», y confundirlos invita a duplicar un
  correo institucional.** El proveedor pudo aceptarlo y no habernos contestado
  a tiempo, así que ni el servidor ni la pantalla afirman que falló: se dice
  que puede haber salido igual y que hay que mirar «Notificaciones anteriores»
  antes de reenviar. Es la misma distinción que `sent` frente a `delivered`
  (v4.855) y que `unknown` en el diagnóstico del CRM.
- **EL TOPE DEL NAVEGADOR VA POR DEBAJO DEL DE LA FUNCIÓN** (120 s contra los
  300 de `vercel.json`), a propósito: el servidor sigue y termina aunque acá ya
  se haya dejado de esperar, y el reenvío queda escrito. Por eso, al agotarse,
  la pantalla **recarga el historial** en vez de ofrecer un reintento a ciegas.
- **LOS DESTINATARIOS SE ATIENDEN EN PARALELO.** Cada envío sube el mismo
  cuerpo con sus adjuntos —cientos de KB— al proveedor: en serie, tres
  personas son tres esperas encadenadas y el botón tarda el triple sin que nada
  haya fallado. `Promise.all` **conserva el orden**, así que el detalle por
  destinatario sigue saliendo como se escribió, y cada uno reclama su propia
  fila de la bitácora —la llave lleva el destinatario— así que no hay carrera.
- **⚠️ QUÉ ETAPA TARDÓ Y CUÁL FALLÓ VIAJA EN LA RESPUESTA** (`etapas`), y la
  pantalla lo pinta **sólo cuando el envío no salió**: en verde sería ruido, y
  su ausencia el día que algo se cuelgue obliga a diagnosticar a ciegas — que
  es exactamente lo que costó esta vuelta. Es la regla del sitio de que un
  fallo que se ve y se explica es aceptable y uno mudo no.
- **LA PLANTILLA DEL CORREO NO SE TOCÓ.** Sigue siendo `buildBatchEmail`, la
  MISMA que usa el aviso de traslado (v4.996), con su modo de conciliación: lo
  único que cambia entre los dos es la redacción que impide leerlo como un giro
  nuevo. Un segundo constructor se separaría del primero en silencio.

### Y además, archivos que elige quien escribe — v4.1020

Pedido con el modal delante: *«debe tener la opción también de adjuntar archivos
adicionales a los adjuntos que ya se habían enviado»*. Junto al PDF de
conciliación y a los comprobantes del traslado entra un bloque **«Otros
archivos»**.

| Pieza | Qué es |
|---|---|
| `EXTRA_MIMES` · `EXTRA_MAX_FILES` · `EXTRA_MAX_TOTAL_BYTES` · `isAcceptableExtra` · `checkExtraAttachments` · `extraAttachmentName` (`reconciliationSpec.js`) | El CRITERIO. **Puro**: qué archivo se admite, cuántos, cuánto pesan entre todos y cómo se llama cada uno en el correo |
| `planAttachments` con `adicionales` | Quién cede ante el presupuesto del correo, y el `id` con el que el correo obedece al plan |
| `uploadExtraAttachment` (`disbursements.js`) | La copia archivada, en el prefijo PRIVADO y con el MISMO cliente de S3 |
| `adjuntosOpcionales` (`routes/financial.js`) | El multipart del reenvío, bajo el campo `extra` |
| El bloque «Otros archivos» de `ResendNoticeModal.tsx` | Elegir, ver, quitar y el contador |

Pruebas: dentro de `npm run test:reconciliation` (298 casos de criterio y de
archivo), `npm run test:reconciliation:path` (208, el CAMINO con multipart real)
y `npm run test:reconciliation:ui` (33 en un navegador que ELIGE archivos).
Verificadas a la inversa sobre las cuatro invariantes.

- **⚠️ SON UNA TERCERA CLASE, NO UN COMPROBANTE MÁS, y confundirlas pierde el
  dato.** Un comprobante es el soporte que YA está guardado contra un movimiento
  y se deduplica por su clave de S3 (v4.1018); esto lo elige una persona al
  escribir el correo y no respalda ninguna transferencia. Con una sola lista, un
  archivo suelto aparecería en la ficha del traslado como si lo hubiera emitido
  el banco. Van en su propio `kind`, en su propio campo del formulario (`extra`,
  no `receipt`) y el correo los nombra aparte — `describeAttachments` **nunca**
  llama comprobante a uno de ellos, y una prueba lo fija.
- **⚠️ EL TOPE SALE DEL CUERPO DE LA PETICIÓN, NO DEL CORREO** (4 MB entre
  todos). Estos archivos viajan en la MISMA petición del reenvío y una función
  serverless corta en ~4,5 MB: un tope mayor daría un 413 opaco justo después de
  elegir el archivo. Es más bajo que `ATTACHMENTS_MAX_TOTAL_BYTES` a propósito
  —aquél acota lo que el proveedor de correo entrega—. Si algún día hacen falta
  adjuntos grandes, la vía es prefirmar la subida directa a S3 (v4.968), **no**
  subir este número.
- **⚠️ NO SE SUBEN AL ELEGIRLOS: SE ARCHIVAN SI EL CORREO SALE.** Es lo que
  evita el otro precio de la subida prefirmada — elegir tres archivos y
  arrepentirse dejaría tres objetos huérfanos que sólo limpia una regla de ciclo
  de vida. Acá, lo que no se manda no se guarda. Y archivarlos **nunca cuesta el
  envío**: el archivo ya viaja adjunto, la copia es auditoría; si el bucket
  falla, el correo sale igual y la fila lo dice (regla de v4.997).
- **⚠️ EL CORREO OBEDECE AL PLAN, no al revés.** `planAttachments` es quien
  aplica el presupuesto y quien deja fuera lo que no cabe; el array de adjuntos
  se arma **filtrando por lo que el plan aceptó**. Si el correo se compusiera por
  su cuenta, adjuntaría lo que el plan dice haber omitido y la auditoría
  afirmaría lo contrario de lo que salió. El emparejamiento es por `id` y no por
  nombre: dos archivos pueden llamarse igual — la misma lección que la
  deduplicación por clave de S3.
- **ANTE EL TOPE CEDE LO ADICIONAL, nunca la conciliación ni el comprobante.**
  Aquélla es el motivo del correo y éste el soporte del banco, y los dos ya
  venían acotados. Lo que no entra se NOMBRA con su motivo: un recorte
  silencioso convierte «se adjuntó» en una afirmación falsa.
- **⚠️ SE JUZGAN TODOS ANTES DE COMPONER NADA, y cada motivo NOMBRA su
  archivo.** Componer el PDF, archivarlo y leer los comprobantes para descubrir
  después que un archivo no se admite es trabajo tirado; y «uno de los archivos
  no vale» obliga a adivinar cuál de los cinco (regla de `checkReceipts`,
  v4.998). Una prueba comprueba el ORDEN leyendo el archivo.
- **EL CATÁLOGO DE TIPOS SE IMPORTA DE LOS COMPROBANTES** (`RECEIPT_TYPES`), no
  se escribe una segunda lista: con dos, ampliar una dejaría la otra atrás y el
  fallo sería mudo —el archivo se sube y el correo lo rechaza, o al revés—. Y se
  decide por MIME **y** por extensión: el carrete de un móvil manda el tipo
  vacío (v4.739).
- **⚠️ UN ARCHIVO ADICIONAL NO SE RENOMBRA.** Un comprobante sí, porque su
  nombre de origen —«Captura de pantalla 2026-08-31 a la(s) 10.32.11 a. m..png»—
  no dice de qué movimiento es (v4.1018); éste lo eligió y lo nombró una persona
  hace un minuto, y cambiárselo le quitaría lo único que lo identifica. Sólo se
  sanea lo que rompería una cabecera de correo.
- **⚠️ MULTIPART SÓLO CUANDO HAY ARCHIVOS, Y EL JSON NO CAMBIA NI UN TIPO.** Sin
  adicionales se manda EXACTAMENTE el mismo cuerpo de siempre —`confirm`
  booleano, `paymentIds` como array, `includeReceipts` booleano—: el camino que
  ya funciona no puede cambiar por una función que casi nunca se usa. **Lo
  destapó la prueba de navegador**, que mira lo que de verdad SALE: la primera
  versión mandaba `includeReceipts: 'true'` como texto también en JSON. Del lado
  del servidor no hubo nada que adaptar —`aportesDe` ya partía la cadena por
  comas y `confirm` acepta `'true'` desde v4.1014—.
- **LAS FRASES ANTERIORES DEL CORREO SALEN LETRA POR LETRA.** Agregar una
  tercera clase no puede reescribir el texto de un correo que ya se venía
  mandando: el verbo concuerda con el PRIMER elemento, que es lo que reproduce
  «Se adjunta la conciliación … y el comprobante …». Cinco pruebas fijan las
  frases heredadas textualmente.
- **LO RECHAZADO SE DICE EN LA PANTALLA, no en un aviso que se va.** Un archivo
  que no entra se corrige mirándolo —volver a elegir el correcto— y un `toast`
  desaparece justo mientras se busca. Va en la misma lista ámbar donde ya se
  dice qué comprobante quedó fuera.
- **⚠️ NO SE OFRECE LA BIBLIOTECA MULTIMEDIA, y no incumple la regla de
  v4.700.** Aquélla es para las casillas de IMAGEN de un sitio, y lo que hay en
  la Biblioteca son archivos PÚBLICOS del club; esto es un correo con documentos
  financieros privados. Y el archivo tiene que estar en el navegador para viajar
  con la petición.
- **EL REENVÍO SIGUE SIN MOVER UN PESO, y se demuestra igual.** La prueba del
  camino fotografía todo lo que la base dice sobre el dinero antes y después de
  un reenvío CON archivos, y una prueba lee el archivo: ni un `INSERT INTO
  "Disbursement"`, ni uno en `"DisbursementBatch"`, ni un `UPDATE` de ninguno.

**Pendientes conocidos:** un archivo adicional archivado **no se puede volver a
abrir desde el historial** —su clave se guarda y falta el endpoint que la firme,
como sí lo tienen el documento y los comprobantes—; «Reenviar nuevamente» trae
los destinatarios pero **no los archivos**, que hay que volver a elegir (no están
en el navegador y traerlos exigiría leerlos de S3); y el tope de 4 MB es del
transporte: adjuntos mayores exigen la subida prefirmada directa a S3.
