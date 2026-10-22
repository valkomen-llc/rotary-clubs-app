<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El dinero de otra fuente llega a la Bóveda — v4.1025

Una inscripción a la **Feria de Proyectos** se traslada a los organizadores con
el MISMO mecanismo de la Bóveda de Fondos: se marcan los cobros, se registra el
giro con su comprobante y sale la notificación de confirmación.

| Archivo | Qué es |
|---|---|
| `server/lib/collectionSources.js` | El CRITERIO. **Puro**: catálogo CERRADO de fuentes, cascada del sitio, reparto de lo cobrado y rótulo de un cobro |
| `server/lib/projectFairCollections.js` | La I/O de la fuente Feria: resolver el sitio, construir la fila, listar lo pendiente y reconstruir |
| `POST /financial/wallet/rebuild-collections` | La reconstrucción hacia atrás. De ENSAYO por defecto |
| `originOf` · `donorLine` | Dónde se ve el rótulo: la ficha de la Bóveda, el correo del traslado y el documento de conciliación |

Pruebas: `npm run test:collections` (76 casos: criterio, el CAMINO con la base
sustituida en memoria e invariantes leídas de los archivos). **Sin Postgres,
credenciales ni red.** Verificadas a la inversa sobre los siete puntos.

**Reglas durables:**

- **⚠️ LA PLANTILLA DEL CORREO NO SE TOCÓ, Y NO HAY UNA SEGUNDA.** El pedido
  era «que tenga el logo de Club Platform arriba y el del sitio del traslado
  abajo», y `buildBatchEmail` ya lo hacía desde v4.996: la cabecera sale de
  `marcaDeLaPlataforma()` y el pie de `marcaDelSitio(lote.clubId)` —la fila de
  `Club` del sitio que recibe, con la del distrito de respaldo—. El correo del
  terremoto salió con el logotipo del 4281 porque el traslado era de ese sitio;
  registrado contra la Feria, sale con el suyo **sin escribir nada**. Al pedir
  «la misma plantilla con otro logo», comprobar primero de dónde saca el logo
  la que ya hay: escribir una segunda es cómo se llega a dos correos que se
  separan en silencio.
- **⚠️ LA CAUSA ERA UN CAMPO OPCIONAL QUE NADIE LLENABA.** El `Payment` de una
  inscripción sólo se creaba `if (submission.clubId)`, y ese valor salía de
  `cfg.clubId` — un campo de la Convocatoria rotulado «Opcional» que hay que
  pegar a mano y que el propio `projectFairAdminController` describe como «algo
  que nadie hacía». Medido: doce inscripciones pagadas, ningún movimiento
  registrado, y ninguna vía para girar ese dinero. **No fallaba ruidosamente**:
  el cobro entraba, el club quedaba inscrito y el dinero no aparecía en ninguna
  parte. Es la clase de fallo que este archivo documenta una y otra vez.
- **EL SITIO SE RESUELVE CON UNA CASCADA DE SEÑALES DECLARADAS**
  (`resolveCollectionSite`), y el orden no es negociable: lo que la Convocatoria
  DECLARÓ manda, y si no declaró nada vale el sitio del evento de la edición
  —`CalendarEvent.clubId` es NOT NULL, así que toda edición tiene uno—. Es el
  criterio de `resolveArticleSite` (v4.1006) y por el mismo motivo: el mismo
  cobro tiene que resolver siempre al mismo sitio, lo mire quien lo mire.
- **⚠️ LO QUE NO SE HACE ES DEDUCIR EL SITIO DEL DOMINIO NI DEL CLUB QUE PAGA.**
  Lo primero cambia con la pestaña desde la que se pagó; lo segundo es el club
  que se INSCRIBE, no el que recibe — confundirlos pondría el dinero de la Feria
  en la Bóveda de un club participante. Sin ninguna señal no se adivina: se DICE
  con su salida (crear la edición como evento del sitio, o declarar el id).
- **DE QUÉ SEÑAL SALIÓ EL SITIO QUEDA ESCRITO.** Sin eso, «¿por qué este cobro
  entró a la Bóveda de este sitio?» no se puede contestar dentro de seis meses —
  y acá la respuesta decide a quién se le gira un dinero.
- **⚠️ UN SOLO REPARTIDOR DE IMPORTES** (`splitCollectionAmounts`), compartido
  por el cobro en vivo y la reconstrucción. La aritmética estaba escrita dentro
  de `confirmPaidSession`; con una copia por camino, el día que cambie una línea
  del recargo una se queda atrás y el fallo es MUDO — las dos siguen devolviendo
  un neto, y lo que se separa es cuánto se le gira a alguien. Lo cuenta una
  prueba.
- **⚠️ ACÁ EL RECARGO SE LE SUMÓ A QUIEN SE INSCRIBIÓ (v4.980), al revés que en
  un aporte.** El precio publicado es lo que la organización tiene que RECIBIR y
  el recargo cubre lo que cuesta cobrarlo, así que el neto se acerca al precio
  publicado y NO al bruto menos una tarifa nuestra. Aplicar acá el criterio de
  los aportes descontaría dos veces.
- **NINGUNA RAMA DEL REPARTO INVENTA UNA TARIFA, y son tres.** Con el desglose
  guardado se reparte proporcionalmente (`basis: 'medido'`). Sin desglose pero
  con el precio publicado en la MISMA moneda, el neto ES ese precio —no es una
  tarifa recalculada: es la cifra que el sistema publicó y congeló, y que el
  recargo existe para dejar intacta— y se declara `derivado` con su aviso. Sin
  ninguna de las dos NO se reparte y se dice por qué: antes que un neto
  inventado, que es sobre lo que después alguien ordena una transferencia.
- **⚠️ LA RETENCIÓN DE LA PLATAFORMA NO SE DERIVA NUNCA.** Es una cifra nuestra
  y, sin el desglose, no se sabe: `null` dice eso. Un cero afirmaría que no
  retuvimos nada, que es otra cosa — es la regla de `basis` en el libro mayor
  (v4.847).
- **⚠️ NO SE INVENTA NINGUNA FECHA DE LIBERACIÓN.** El movimiento reconstruido
  nace sin `availableOn`, así que `bucketOf` lo deja «en tránsito» —el lado
  seguro— y el barrido que ya existe va a preguntárselo a Stripe con su
  referencia. Escribir una fecha estimada sería presentar una cuenta nuestra
  como el calendario del proveedor.
- **LA RECONSTRUCCIÓN ES DE ENSAYO POR DEFECTO** y **lo que NO se pudo
  reconstruir es la mitad del informe**, agrupado por motivo con ejemplos: sin
  esa parte, «no pasó nada» es indistinguible de «no se pudo», y acá lo que está
  en juego es dinero que no aparece. Patrón de `ledgerBackfill` (v4.848).
- **⚠️ LA IDEMPOTENCIA ES DEL ÍNDICE ÚNICO `(provider, providerRef)`, no del
  filtro de la consulta.** El `LEFT JOIN ... p.id IS NULL` hace que un cobro ya
  reconstruido deje de ser candidato solo —así, correr la pasada diez veces hace
  trabajo la primera—, pero NO cubre la carrera: dos vueltas simultáneas leen
  los candidatos antes de que ninguna inserte. Ahí lo único que detiene el
  segundo cobro es el `ON CONFLICT`. **Y hay que probarlo en el punto que lo
  lleva**: la primera versión de la prueba comprobaba la segunda pasada y
  quitar el `ON CONFLICT` la dejaba en verde — se apoyaba en la barrera
  equivocada.
- **⚠️ NO SE TOCA EL LIBRO MAYOR.** Está en sombra y su carga hacia atrás es
  otra cosa, con su propio informe de conciliación (v4.848).
- **⚠️ UN COBRO QUE DECLARA SU FUENTE QUEDA FUERA DE LA HEURÍSTICA DE
  EMPAREJAMIENTO.** `linkDonationsToPayments` casa por club, moneda, importe y
  momento: una inscripción del mismo importe en el mismo minuto que un aporte
  casaría por parecido, y la ficha —y el correo de traslado— le atribuirían ese
  dinero a un donante que no lo dio. La heurística existe para las filas
  anteriores al vínculo, no para las que dicen de dónde vienen.
- **⚠️ UN COBRO SIN APORTANTE SE PUEDE TRASLADAR COMO CUALQUIER OTRO.** Hasta
  v4.1024 la tarjeta de «Otros movimientos» iba SIN `onElegir`, así que no se le
  pintaba casilla y ese dinero no se podía girar ni conciliar. El motor siempre
  lo soportó —`registerDisbursement` acepta `donationId: null`—: lo que faltaba
  era la casilla. Un cobro sin aportante no es un cobro de segunda; es el mismo
  dinero con otra procedencia.
- **Y SUS DESEMBOLSOS TIENEN QUE LLEGAR A LA PANTALLA.** Sin ellos la tarjeta
  calcula que le falta girar todo y ofrece girar otra vez lo ya girado. El
  servidor lo rechazaría —`balanceFor` manda— pero la pantalla habría dicho una
  cosa distinta del dinero.
- **UN COBRO SE NOMBRA POR LO QUE ES** (`collectionLabel` → `originOf` y
  `donorLine`): «Inscripción FP-WZ2W3J · Rotary Barranquilla». Sin eso el correo
  del traslado repite «Aportante sin nombre» una vez por inscripción, y ese
  documento existe para cuadrar la transferencia contra un extracto. Quien donó
  MANDA sobre el rótulo de la fuente, y el respaldo de siempre se conserva: no
  se inventa un nombre, se dice que no hay uno.
- **⚠️ EL CATÁLOGO DE FUENTES ES CERRADO Y EL SERVICIO ES GENÉRICO DESDE EL
  PRIMER DÍA.** `event_registration` está DECLARADA con `available:false` y su
  motivo escrito —ese dinero vive en `EventRegistrationPayment` y no crea
  ninguna fila de `Payment`, así que no existe para la Bóveda—. Es la decisión
  de `ENTITY_RESOLVERS` (v4.1013): declararla disponible sería prometer una
  integración que no existe, y no declararla obligaría a rehacer el módulo el
  día que entre. El tipo se compara EXACTO, nunca por parecido.
- **`Payment` NO GANA NI UNA COLUMNA.** Todo lo nuevo vive dentro de
  `rawPayload`, que es texto con JSON libre: `Payment` se consulta con
  `findMany` **sin `select`** en media plataforma, y el `build` no ejecuta
  `db push` (regla de `logo_intl`, v4.699). Acá una columna declarada y todavía
  inexistente dejaría en 500 el webhook del COBRO.
- **REGISTRAR EL MOVIMIENTO NUNCA CUESTA EL COBRO.** Va en su propio `try`
  después de acreditar el pago: el dinero ya entró y la inscripción ya está
  confirmada.

**Pendientes conocidos:** las inscripciones al EVENTO (nacional, internacional,
CADRE y las completadas por fuera) **todavía no se pueden trasladar** — es la
fuente declarada sin implementar, y habilitarla exige su propio resolutor
porque `EventRegistrationPayment` no crea ninguna fila de `Payment`. El recargo
**sigue sin asentarse en el libro mayor** (pendiente declarado desde v4.980),
así que la reconstrucción tampoco escribe asientos. Y la reconstrucción **no se
comprueba en un navegador**: al tocar su informe, mirarlo en pantalla (la
lección de v4.717).

### El traslado se registra desde las propias Postulaciones — v4.1026

Reporte con la pantalla delante: *«al seleccionar las postulaciones a las que
voy a confirmar el traslado de recursos a colrotarios, no aparece la opción
como aparece, por ejemplo, en Bóveda de Fondos para enviar la notificación»*.

| Pieza | Qué es |
|---|---|
| `server/lib/projectFairTransfers.js` | El CRITERIO. **Puro**: catálogo CERRADO de bloqueos con su SALIDA, el rótulo, el sitio del traslado y el plan de la selección |
| `paymentsForSubmissions` (`projectFairCollections.js`) | La I/O: los movimientos de N inscripciones en UNA consulta |
| `resolveTransfers` → `POST /admin/postulaciones/transfers/resolve` | La resolución. **No escribe nada** |
| El botón «Registrar traslado» y el panel de `PostulacionesPagos.tsx` | Monta `BulkDisbursementBar`, la MISMA barra de la Bóveda |

Pruebas: `npm run test:fair:transfers` (53 casos: criterio e invariantes leídas
de los archivos, **sin base, credenciales ni red**). Verificadas a la inversa
sobre los cinco puntos.

- **⚠️ NO HAY UN SEGUNDO MOTOR DE DESEMBOLSOS, Y DE ESO CUELGA TODO LO DEMÁS.**
  Este módulo RESUELVE y no registra: traduce «estas postulaciones» a los
  mismos `Elegible` que la barra de la Bóveda ya consume, y el registro sigue
  yendo por `POST /financial/wallet/disbursements/bulk` —con su lote, su
  comprobante compartido, su notificación consolidada y su idempotencia por
  operación—. Con dos caminos, el día que se corrija el reparto de un lote o la
  llave de una notificación una mitad se queda atrás y el fallo es **MUDO**:
  las dos siguen registrando un desembolso, y lo que se separa es cuánto se le
  giró a alguien y a quién se le avisó. Es la decisión de v4.1013 con el modal
  de compartir —un solo modal montado por dos entradas, las dos contra el mismo
  servicio— aplicada al dinero. Lo fijan tres pruebas que leen los archivos: la
  pantalla IMPORTA la barra, la MONTA, y **no llama a `disbursements/bulk` por
  su cuenta**.
- **⚠️ Y TAMPOCO UN SEGUNDO CRITERIO DE «SE PUEDE DESEMBOLSAR».** Quién se
  puede girar lo decide `canDisburse` (v4.885), el mismo que aplica el
  registro; acá se le AGREGAN las dos preguntas que la Bóveda no tiene que
  hacerse porque parte de sus propios movimientos —¿existe el cobro?, ¿es de
  este sitio?— y se traduce cada negativa a algo accionable. El motivo de
  `canDisburse` viaja **TEXTUAL**: ya trae su causa y sus días, y repetirlo acá
  daría dos textos para el mismo hecho.
- **⚠️ CADA BLOQUEO LLEVA SU SALIDA** (`TRANSFER_BLOCKS`, catálogo CERRADO). Es
  la regla de v4.1008: uno cuya única respuesta es «no se puede» se lee como
  una avería y se reporta como tal. `donde: 'boveda'` es lo que permite ofrecer
  el enlace en vez de nombrar una pantalla que hay que ir a buscar. Una prueba
  exige que **ninguno** quede sin salida.
- **⚠️ `sin_movimiento` ES EL QUE DE VERDAD VA A APARECER AL ESTRENARLO.** Las
  inscripciones cobradas antes de v4.1025 no tienen fila de `Payment` hasta que
  alguien corra la reconstrucción, y sin esa entrada —con su enlace a «Buscar
  cobros sin registrar»— el módulo entero se vería como «no funciona» cuando lo
  que falta es un paso que ya existe.
- **⚠️ EL SITIO ES EL MISMO QUE VA A APLICAR EL SERVIDOR** (`pickTransferSite`).
  `clubDe` en el registro ignora el `clubId` del cuerpo para todo el que no sea
  el operador de la plataforma, así que para un administrador de sitio se elige
  **siempre el suyo**: cualquier otro daría una barra que promete un traslado y
  recibe «no existe en este sitio», que manda a diagnosticar donde no está el
  problema. Para el operador, el que reúne más cobros, con desempate ESTABLE
  —cantidad y después id ascendente—: si dependiera del orden en que la base
  devolvió las filas, la misma selección se registraría contra sitios distintos
  en dos intentos seguidos.
- **Y el sitio se comprueba DOS veces**: acá para decirlo antes, y en el `WHERE`
  del registro, que es el que no se puede saltar.
- **LA RESOLUCIÓN NO ESCRIBE NADA**, y lo fija una prueba sobre el cuerpo de
  `resolveTransfers` —no sobre el archivo, que tiene decenas de escrituras
  legítimas—.
- **EL RÓTULO SALE DEL MISMO COMPOSITOR QUE EL CORREO** (`composeCollectionName`,
  extraído en esta versión de `collectionLabel`). Escrito dos veces, la lista de
  bloqueados diría un nombre y el comprobante del traslado otro para la MISMA
  inscripción, y nadie podría cruzarlos.
- **SE OPERA LO QUE SE VE.** Igual que las acciones en bloque de v4.1024: las
  postulaciones se cargan SIN acotar por edición y se clasifican después, porque
  el listado muestra también las que no tienen ninguna. Una de OTRA edición se
  bloquea nombrándolo, no se hace desaparecer con el motivo «no existe», que
  sería falso.
- **LOS TOTALES SON POR MONEDA Y NUNCA SE SUMAN ENTRE ELLAS** (regla del módulo
  financiero desde v4.841), y una prueba comprueba la AUSENCIA de un total
  único: acá la selección puede mezclar de verdad —una edición cobra en pesos y
  otra en dólares—.
- **EL AVISO DE `canDisburse` NO BLOQUEA Y SE DICE.** Un cobro reconstruido nace
  sin fecha de liberación del proveedor (v4.1025), así que su estado es una
  suposición prudente y no un dato: quien registra el giro tiene que saberlo
  antes de confirmarlo. Repetido se dice UNA vez — tres renglones idénticos son
  ruido.
- **SE RESUELVE AL PULSAR, no en cada cambio de selección.** Marcar catorce
  filas serían catorce consultas para pintar un botón que quizá nadie use.
- **`managePayments` ES LA CAPACIDAD**, no `changeStatus`: un `finance` mueve
  pagos y un `reviewer` mueve estados (v4.1024). Es sólo para PINTAR — el gate
  real está en el servidor, y el del registro es además el suyo propio.
- **El plan se descarta con los mismos gestos que la selección.** Un plan
  resuelto sobre filas que ya no están marcadas ofrecería girar lo que nadie
  eligió.

**Pendientes conocidos:** desde acá **no se reenvía la conciliación** de lo ya
trasladado —se dice con su enlace a la Bóveda, que es donde vive esa barra
(v4.1015)—; y el panel **no se comprueba en un navegador**: al tocar su
maquetación, mirarla (la lección de v4.717).
