<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## El ciclo de vida de un aporte — v4.885

Reporte con captura: aportes del 19, 20 y 21 de agosto todavía «En tránsito» el
24, y ninguna forma de registrar que el dinero se trasladó al beneficiario.

| Archivo | Qué es |
|---|---|
| `server/lib/walletLifecycle.js` | El CRITERIO. **Puro**: estados, `bucketOf`, calendario de liberación, transiciones legales, validación del desembolso y la línea de tiempo |
| `server/lib/ensureDisbursementSchema.js` | Crea `PaymentLifecycleEvent` y `Disbursement` en runtime |
| `server/lib/paymentLifecycle.js` | La I/O de la traza: escribir eventos y leerlos |
| `server/lib/disbursements.js` | La I/O del desembolso: registrar, reversar, comprobante y aviso |
| `server/lib/walletSweep.js` | El barrido: reconcilia con Stripe y avanza estados |
| `server/lib/walletReconcile.js` | La pasada histórica, de ensayo por defecto |
| `server/controllers/disbursementController.js` | La API |
| `src/components/admin/wallet/DisbursementSection.tsx` | Calendario, línea de tiempo, desembolsos y el modal |

Pruebas: `npm run test:wallet:lifecycle` (119 casos, **sin base, credenciales ni
red**). Verificadas a la inversa: reintroduciendo el defecto, seis fallan.

**Reglas durables:**

- **⚠️ «PENDING» NO ES UNA FECHA, y ésa era la causa raíz.** `bucketOf` decía
  `if (p.stripeStatus === 'pending' || (p.availableOn && availableOn > now))
  return 'in_transit'`, y **la primera mitad de esa condición no dependía del
  tiempo**. `stripeStatus` lo escribe el webhook con lo que Stripe contesta EN
  EL MOMENTO DEL COBRO, y en ese momento una balance transaction está SIEMPRE
  en `pending`: el dinero acaba de entrar. Así que **todo aporte nacía en
  «pending» y se quedaba «En tránsito» para siempre**, hubieran pasado seis días
  o seis meses. Ahora una **fecha vencida gana sobre una columna sin
  actualizar**: una fecha vencida es un hecho, una columna vieja es una opinión
  desactualizada.
- **⚠️ Y LO ÚNICO QUE ACTUALIZABA ESA COLUMNA ERA UN BOTÓN MANUAL** que, por
  defecto, **excluía de sus candidatos a los pagos que ya tenían
  `availableOn`** (v4.846 lo acotó a los que les faltara `stripeFeeRate`). O
  sea: el aporte que más necesitaba corregirse era justo el que el botón no
  miraba. Hacen falta las DOS mitades —el criterio corregido y el barrido
  automático—: sin la primera, la pantalla mentiría hasta que corriera el cron;
  sin la segunda, la columna mentiría para siempre y el libro mayor nunca se
  enteraría de la liberación.
- **LA REGLA DE LOS 6 DÍAS SE AUDITÓ Y NO SE CAMBIÓ.** Son DOS esperas
  encadenadas con orígenes distintos: `availableOn` es la fecha **oficial** de
  Stripe (`balance_transaction.available_on`) —no la calculamos, la leemos— y
  `clubAvailableOn` es ésa **más 6 días CALENDARIO**, que es el margen operativo
  de la plataforma. Que sean calendario y no hábiles está **medido**, no
  supuesto: el código vigente suma `6 * 24 * 60 * 60 * 1000`, o sea 144 horas
  corridas. Cambiarlo a días hábiles movería la fecha de todos los aportes
  vivos, y eso es una decisión de negocio, no la corrección de un defecto.
- **⚠️ NO SE INVENTA UNA FECHA DE STRIPE QUE STRIPE NO DIO.** Cuando
  `availableOn` falta —la balance transaction no existía cuando el webhook la
  buscó, que es el caso común— se puede ESTIMAR para pintar un contador, pero
  esa estimación viaja **marcada** (`estimado: true`), se dice en la pantalla y
  **nunca decide un bucket ni dispara un asiento**. Presentar un promedio propio
  como si fuera el calendario del proveedor es lo que hace que alguien
  planifique un pago contra una fecha que no existe.
- **⚠️ `Payment` NO GANÓ NI UNA COLUMNA, y es la decisión más cara de la lista.**
  Era el camino corto —un `lifecycleState` y listo— y no se hace: `Payment` y
  `Donation` se consultan con `findMany` **sin `select`** en media plataforma,
  así que Prisma pide TODAS las columnas del esquema y una declarada y todavía
  inexistente deja esas consultas en **500** (regla de `logo_intl`, v4.699). El
  `build` no ejecuta `db push` desde el incidente del 2026-07-13, así que ese
  «hasta que alguien lo corra» no tiene fecha. Y lo que caería en 500 acá es
  **el webhook del cobro**. Las dos tablas nuevas viven fuera de Prisma, sin
  clave foránea a `Payment`, y están en la lista del guardián de `db:push`.
- **EL BARRIDO ES IDEMPOTENTE POR LA FORMA DE LA CONSULTA, no por un candado.**
  Los candidatos se eligen por CRITERIO —«a éste le falta la fecha», «a éste la
  columna se le quedó atrás»—, nunca por «a éste no lo he mirado», así que un
  pago corregido **deja de ser candidato solo** y correr el barrido diez veces
  hace trabajo la primera. Es el patrón que estrenó v4.846. Y no hay dinero que
  duplicar: el barrido **no crea ni un movimiento** —escribe fechas que vienen
  de Stripe, el mismo valor cada vez— y el único asiento que dispara lo protege
  el índice único de `LedgerTransaction`.
- **Cada 15 minutos y no cada uno.** `available_on` es una fecha con resolución
  de DÍA: mirarla sesenta veces por hora no la adelanta un segundo, y cada
  vuelta gasta una llamada a Stripe por aporte desactualizado. En régimen la
  mayoría de las vueltas no hacen nada, que es lo ESPERADO — por eso sólo se
  registra en consola cuando hubo algo.
- **La ventana del barrido son 120 días.** Un aporte sin resolver de hace cuatro
  meses no es un cobro lento, es uno roto, y gastar una llamada por él en cada
  vuelta deja sin atender a los vivos. Lo que queda fuera **no se pierde**: lo
  alcanza la reconciliación histórica, y el barrido lo dice.
- **⚠️ EL BARRIDO NO RECALCULA LA RETENCIÓN CON LA TARIFA DE HOY.** Es la regla
  de v4.854 y acá pesa más que en el botón: esto corre solo cada quince minutos,
  así que un recálculo silencioso movería el neto de todos los aportes vivos sin
  que nadie lo pidiera. Lo que sí se completa es la comisión del PROCESADOR
  cuando nunca se pudo leer — ahí no se corrige una decisión nuestra, se rellena
  un dato que Stripe no había dado.
- **EL CAMINO DEL DINERO NO RETROCEDE**, y no es estética: impide que un aporte
  ya desembolsado vuelva a «disponible» porque una consulta llegó tarde. Es la
  lección de `mergeDeliveryState` —los eventos de un proveedor llegan sin orden
  garantizado— aplicada a dinero, donde el precio de equivocarse es pagar dos
  veces. Las dos excepciones (reembolso y fallo) son HECHOS NUEVOS, no
  correcciones, y terminan el camino desde donde estén.
- **⚠️ DISPONIBLE NO ES DESEMBOLSADO.** «Disponible» contesta «¿se puede usar
  este dinero?»; «desembolsado» contesta «¿se trasladó?». La Bóveda contestaba
  la primera y no tenía dónde registrar la segunda, así que el traslado ocurría
  fuera de la plataforma y la única forma de saber si un aporte ya se había
  girado era preguntárselo a alguien.
- **SE ADMITEN PARCIALES y no se marca completo hasta que la suma llega.**
  Marcarlo con el primer giro afirmaría que el beneficiario recibió todo cuando
  recibió la mitad. Un desembolso **reversado no suma**: no trasladó nada. La
  tolerancia es media unidad mínima de la moneda, contra el punto flotante — sin
  ella, 1.484.437 pesos en tres giros exactos no cerraría nunca.
- **⚠️ UNA OPERACIÓN FINANCIERA CONFIRMADA NO SE BORRA.** No hay `DELETE` en
  `disbursements.js` ni ruta `DELETE` en la API, y su ausencia es deliberada.
  Corregir es REVERSAR: la fila se queda, se marca, se anota quién y **por qué**
  —un reverso sin motivo es un borrado con otro nombre— y deja de contar. Lo
  comprueban dos pruebas sobre los archivos.
- **⚠️ EL COMPROBANTE NO SE SIRVE DESDE UNA DIRECCIÓN PÚBLICA.** Se guarda la
  CLAVE de S3 —bajo `private/disbursements/`, aparte del resto de la Biblioteca
  para poder ponerle su propia política— y el enlace **se firma al pedirlo y
  caduca a los 5 minutos**. La clave **no viaja al navegador**: sólo
  `hasReceipt` y el nombre. Si viajara, bastaría abrir la consola para componer
  la URL del bucket. A diferencia de una foto, acá el contenido es un documento
  financiero con nombres y números de cuenta.
- **NO SE ESCRIBE UN SEGUNDO SISTEMA DE CORREO.** El aviso reutiliza
  `EmailService.sendPlatformEmail`, `renderTemplate` con sus bloques,
  `resolveSenderPlan` —que no envía jamás desde un dominio sin verificar— y
  `NotificationDelivery` para la traza. Un envío propio bifurcaría en silencio
  cómo escribe la plataforma y dejaría este correo fuera del panel de entregas,
  que es justo donde alguien lo va a buscar cuando digan que no llegó. Lo único
  propio es el DESTINATARIO: sale del formulario, no del perfil, porque quién
  recibe el dinero lo sabe el administrador que registró el traslado.
- **⚠️ SI EL CORREO FALLA, EL DESEMBOLSO NO SE REVIERTE.** El dinero se movió de
  verdad: deshacer el registro de un hecho financiero porque no salió un aviso
  sería cambiar un problema de comunicación por uno de contabilidad. Queda
  desembolsado y la notificación queda fallida y **reintentable**, con su motivo
  TEXTUAL a la vista.
- **`disbursed` entra al catálogo de notificaciones con `available: true`**, y
  la diferencia con `in_transit` —que sigue en `false`— es la fuente: aquél
  necesitaría que alguien nos avisara cuando Stripe libera y no hay quien lo
  haga, mientras que un desembolso es un **acto administrativo con nombre y
  comprobante** del que no hay ninguna duda.
- **EL DESEMBOLSO TIENE SU PROPIA PLANTILLA.** Con una sola, avisar de un
  desembolso saldría diciendo «gracias por tu aporte» a alguien que no aportó:
  el destinatario acá **recibe** dinero. Y `defaultTemplateFor` la devuelve para
  cualquier papel, invirtiendo a propósito la regla de arriba —ahí
  «beneficiary» no es un observador interno al que se informa de un movimiento
  ajeno—. **No se promete una fecha de acreditación**: sabemos cuándo se ordenó
  el traslado, no cuándo lo abona el banco.
- **⚠️ LA LÍNEA DE TIEMPO SALE DE LA BASE, NUNCA SE FABRICA EN LA PANTALLA.**
  Componerla en el navegador a partir de fechas sueltas afirmaría que algo
  ocurrió sin que nadie lo haya registrado, y entonces deja de servir para
  auditar — que es lo único para lo que sirve. Cada evento guarda estado
  anterior, estado nuevo, cuándo, **quién** (`system` / `user` / `provider`),
  referencia y observaciones.
- **UN EVENTO SE ANOTA CON LA FECHA EN QUE OCURRIÓ, no con la de hoy.** Un
  aporte que venció hace tres días venció hace tres días aunque lo descubramos
  ahora; anotarlo con la fecha del descubrimiento falsearía el historial. Por
  eso `occurredAt` y `createdAt` son dos columnas.
- **La idempotencia de la traza es un índice único** sobre `(paymentId, kind,
  toState)`. Sin él, un aporte acumularía un evento idéntico por cada vuelta del
  cron y la línea de tiempo sería ilegible en un día. Lo que SÍ puede repetirse
  —una notificación, un desembolso parcial tras otro— se escribe con
  `recordFact`, sin `toState`: en Postgres NULL es distinto de NULL, así que no
  se funden. **Son dos hechos, no dos anotaciones del mismo.**
- **⚠️ LA RECONCILIACIÓN NO INVENTA NADA PARA QUE LA PANTALLA SE VEA BIEN.** Lo
  que hace es PREGUNTARLE A STRIPE y escribir lo que Stripe conteste; si Stripe
  no contesta, o el pago no tiene referencia del proveedor, el aporte queda como
  está y **se reporta por qué**. Una Bóveda que se ve bien y miente es peor que
  una que enseña el problema.
- **De ENSAYO por defecto**, como `ledgerBackfill` (v4.848). Sin `apply: true`
  no escribe y devuelve lo que haría. Y **lo que no se pudo corregir es la mitad
  del informe**, agrupado por MOTIVO con ejemplos: un listado de doscientas
  filas no lo lee nadie, y sin esa parte «no pasó nada» es indistinguible de «no
  se pudo».
- **Registrar o reversar EXIGE confirmación explícita** (`confirm: true`, 428 si
  falta). No es ceremonia: la acción mueve el estado financiero de un aporte y
  puede mandar un correo a un tercero, y ninguna de las dos cosas se deshace
  pulsando «atrás». La confirmación **dice lo que va a pasar** —importe,
  beneficiario, a quién se avisa— en vez de preguntar «¿estás seguro?»: lo que
  hay que poder revisar es el hecho, no la certeza.
- **NO SE DESEMBOLSA LO QUE TODAVÍA NO ESTÁ DISPONIBLE.** Registrar el traslado
  de un dinero que el proveedor aún retiene sería anotar un hecho que no pudo
  ocurrir; se rechaza diciendo el estado y los días que faltan.
- **El aislamiento va en el `WHERE`, no en una comprobación posterior.** Ningún
  endpoint lee un pago por su id y mira después de quién es: el `clubId` del
  token entra en la consulta, así que para quien pregunta por un aporte ajeno
  **ese aporte no existe** — confirmar que existe ya es filtrar que existe. Y el
  permiso se comprueba en el SERVIDOR: esconder un botón no protege un endpoint
  de quien lo conoce (v4.868).
- **Los días restantes se redondean HACIA ARRIBA** y se ven en la fila **sin
  desplegar la ficha**. Es lo que se pidió eliminar: hasta ahora la única forma
  de saber cuándo se liberaba un aporte era abrirlo, mirar «Stripe libera» y
  sumarle seis días de cabeza. Prometer que algo está listo medio día antes es
  peor que decir un día de más.
- **`bucketOf` ya no vive en `financialController.js`**: aquél importa el puro.
  Un segundo criterio escrito a mano volvería a separarse en silencio, y lo
  comprueba una prueba sobre el archivo.
- **Las dos tablas están en la lista del guardián de `db:push`.**

### Lo desembolsado se ve y se marca en bloque (v4.886)

Segundo reporte, con la Bóveda del Sistema Central delante: **no aparecía la
opción de marcar un aporte como desembolsado**, el informe decía «5:
no_provider_reference» sobre cinco pagos, y faltaba un indicador de cuánto se
había trasladado.

- **⚠️ EL `SELECT` NO PEDÍA `providerRef`, Y EL FALLO ERA MUDO Y TOTAL.**
  `findCalendarCandidates` seleccionaba nueve columnas y la reconciliación
  pregunta `if (necesitaStripe && p.providerRef)`: con la columna sin pedir
  —`undefined`— **NINGÚN** aporte llegaba a consultarse contra Stripe y todos
  caían en «sin referencia del proveedor». Es exactamente el error que este
  archivo ya documentó en v4.847 con `clubId` y el asiento de liberación. Al
  agregar una lectura a `reconcileOne` o a `anotarAvance`, **agregar su columna
  al SELECT**; lo comprueba una prueba columna por columna, porque el código es
  válido, los tipos están bien y la condición simplemente nunca se cumple.
- **⚠️ «EN TRÁNSITO» SIGNIFICA DOS COSAS Y SÓLO UNA BLOQUEA** (`canDisburse`).
  Una es «el proveedor lo retiene» —hay una `availableOn` futura, o sea Stripe
  nos dio la fecha— y ahí registrar un traslado sería anotar un hecho que no
  pudo ocurrir. La otra es «no sabemos»: sin fecha, el aporte se pinta en
  tránsito porque es el lado seguro para MOSTRAR, no porque sepamos nada.
  v4.885 exigía `estado === 'available'` y con eso los cinco aportes sin fecha
  **no se podían desembolsar por ninguna vía**. Un control que no se puede
  satisfacer no protege: obliga a llevar la contabilidad fuera de la
  plataforma, que es lo que este módulo existe para evitar. Se permite y **se
  avisa con la consecuencia** («comprobá en tu banco que el dinero salió»).
- **⚠️ DESEMBOLSADO NO ES TRANSFERIDO, y por eso son dos tarjetas.**
  «Transferido» son los payouts al banco del CLUB —dinero que sale de la
  plataforma hacia él—; «Desembolsado» es el traslado al BENEFICIARIO final,
  que el club registra y puede ocurrir por fuera de un payout. Fundirlas
  contaría dos veces el mismo dinero en unos sitios y ninguna en otros.
- **La tarifa de la tarjeta va en VIOLETA, no en verde.** El verde ya es
  «Disponible para retiro», y dos tarjetas verdes seguidas se leen como la
  misma cosa contada dos veces — justo la confusión que este indicador existe
  para deshacer.
- **Se pinta SIEMPRE, aunque esté en cero.** Es la cifra que se lleva a un
  informe, y una tarjeta que aparece y desaparece según si hubo movimiento hace
  pensar que el módulo se rompió.
- **Las monedas de la Bóveda salen de los aportes Y de lo desembolsado.** Si
  sólo salieran de los aportes, un sitio que desembolsó en una moneda cuyos
  cobros ya se archivaron perdería esa tarjeta entera, y con ella la única
  cifra que dice a dónde fue ese dinero.
- **`disbursedTotals` agrega EN LA BASE** (`GROUP BY currency`), no trayendo
  las filas para sumarlas fuera: con un club grande serían cientos de filas por
  visita para calcular dos números. Criterio de `getCentralOverview` (v4.853).
- **⚠️ EL BLOQUE COMPARTE EL FORMULARIO, NO EL REGISTRO.** El servidor escribe
  **una fila por aporte**. Un movimiento agregado que cubriera cinco aportes no
  se podría reversar parcialmente, no se podría atribuir a su campaña y no
  cuadraría contra un extracto aporte por aporte — es la regla que separó
  `DistributionJob` de la campaña (v4.864) y `ReelScene` de `ReelProject`.
- **⚠️ Y EL MONTO NO SE RECIBE: se calcula por aporte como lo que le falta.**
  Dejarlo entrar del cuerpo permitiría repartir un total entre cinco aportes
  con un criterio que nadie puede reconstruir después. Un desembolso en bloque
  es «giré lo que quedaba de estos cinco»; si fue otra cosa, se registran de a
  uno.
- **El bloque NO es atómico y se dice.** Cada aporte se registra por su cuenta:
  si el tercero falla, los dos primeros quedan registrados —el dinero se
  movió— y el informe **nombra cuáles no entraron y por qué**. Envolverlo en
  una transacción sería peor: un fallo tiraría abajo registros de traslados que
  sí ocurrieron.
- **⚠️ EL COMPROBANTE DEL GIRO SÍ SE OFRECE EN EL BLOQUE** (v4.887, corrige
  v4.886). Aquélla no lo ofrecía con el argumento de que un mismo archivo en
  cinco filas afirmaría respaldar a cada una por separado. **El argumento era
  demasiado purista y el caso real lo desmiente**: si los cinco aportes
  salieron en UNA transferencia, hay un solo soporte y ése SÍ los respalda a
  los cinco. Lo que no se puede es presentarlo como el comprobante de un
  aporte suelto — y de eso se encarga el LOTE.
- **El archivo se sube UNA vez, fuera del bucle**, y las N filas comparten la
  clave: subirlo por aporte serían N objetos idénticos en S3 y N veces el mismo
  gasto de red. Su clave lleva el id del LOTE, no el de un aporte: el archivo
  no es de ninguno en particular. Lo comprueba una prueba mirando que la subida
  esté ANTES del bucle.
- **`batchId` agrupa los movimientos de un mismo giro y existe SIEMPRE**,
  también sin comprobante: sirve para un informe aunque no haya archivo. De él
  se DERIVA que el soporte es compartido —`batchSize` sale de la misma consulta
  que trae los desembolsos— en vez de guardar una segunda verdad que pueda
  contradecirse.
- **Y se DICE en la ficha**: «Ver comprobante del giro (5 aportes)» y «Salió
  dentro de un giro conjunto de 5 aportes». Rotularlo «Ver comprobante» a secas
  sería exactamente la afirmación que no se puede hacer.
- **⚠️ `batchId` se agrega con `ADD COLUMN IF NOT EXISTS` Y EL `ALTER` CORRE
  TAMBIÉN CUANDO LA TABLA YA EXISTÍA.** `CREATE TABLE IF NOT EXISTS` no amplía
  nada: una base que estrenó el módulo en v4.885 tiene la tabla sin la columna,
  y el `INSERT` fallaría con «column does not exist» —en silencio, porque este
  módulo degrada—. Es la regla de `EventRegistration` (v4.648): se AMPLÍA,
  jamás se recrea. Lo comprueba una prueba sobre el archivo.
- **Al añadir un segundo SQL en template literal, la prueba de las comillas
  invertidas se comprueba POR BLOQUE.** Buscar «del primer backtick al último»
  abarca el hueco entre los dos literales y da un falso positivo. Verificada a
  la inversa metiendo una comilla en un comentario del SQL.
- **El aviso por correo en bloque DICE cuántos correos son** antes de
  confirmar. Un desembolso por aporte es un aviso por aporte, y cinco correos
  seguidos a la misma dirección es algo que hay que saber antes, no después.
- **Los aportes elegidos se guardan ENTEROS, no por id.** La lista se filtra
  por período y por destino: uno elegido antes de cambiar el filtro tiene que
  sobrevivir a que la vista cambie — regla del panel de grupos (v4.876), y acá
  el precio de perderlo sería registrar de menos.
- **La casilla va FUERA del botón que despliega la ficha.** Anidar un control
  dentro de otro haría que marcar el aporte abriera también su ficha, y elegir
  veinte dejaría veinte fichas abiertas.
- **Un motivo técnico no se pinta en crudo** (`NO_CORREGIDO_LABEL`). En la
  captura se leía «5: no_provider_reference»: una clave interna, en inglés
  porque el traductor del sitio la trató como una frase, delante de alguien que
  sólo quiere saber qué le pasa a su dinero. Lo que no esté rotulado se pinta
  tal cual y **marcado como dato**, para que al menos no se traduzca — el error
  del proveedor se propaga textual y traducirlo lo vuelve irreconocible.

### El aviso del desembolso: varios destinatarios y WhatsApp (v4.888)

| Archivo | Qué es |
|---|---|
| `server/lib/disbursementNotice.js` | El CRITERIO. **Puro**: canales, saneado de correos y teléfonos, plantilla canónica de WhatsApp y las variables |
| `src/components/admin/wallet/NoticeRecipients.tsx` | Los destinatarios, COMPARTIDOS por los dos modales |

Pruebas: `npm run test:disbursement:notice` (71 casos, **sin base, credenciales
ni red**).

- **⚠️ WHATSAPP NO ADMITE TEXTO LIBRE HACIA UN DESCONOCIDO, y eso decide todo
  el diseño.** Fuera de la ventana de 24 horas desde el último mensaje
  entrante, Meta SÓLO entrega plantillas previamente aprobadas — y un
  beneficiario al que le vamos a avisar de un giro casi nunca nos escribió
  antes. Por eso el texto de WhatsApp está ESTANDARIZADO y es una constante del
  código, no algo que se redacte por sitio: lo que cambia son las variables. El
  CORREO no tiene esa restricción y sigue componiéndose con los bloques de
  `notificationTemplate.js`. Son dos canales con dos reglas y unificarlos sería
  inventar una limitación donde no la hay, o saltarse una donde sí.
- **⚠️ LAS VARIABLES DE META SON POSICIONALES, y el orden es el contrato.**
  `{{1}}`, `{{2}}`… no tienen nombre: reordenar `WA_VARIABLES` sin volver a
  someter la plantilla pone el nombre del beneficiario donde va el monto, y Meta
  **no da ningún error** — entrega el mensaje mal armado. Por eso el orden se
  declara UNA vez y de ahí salen tanto el cuerpo como los valores
  (`buildWaParameters`). Al agregar una variable, agregarla AL FINAL y volver a
  enviar la plantilla a revisión. Lo comprueba una prueba que cuenta los
  marcadores del cuerpo contra la lista.
- **La plantilla se SIEMBRA como borrador; NO se envía a Meta.** Someterla es un
  acto con consecuencia —un rechazo baja la calificación de calidad de la cuenta
  y puede limitar el volumen diario (v4.701)— y se hace desde Comunicaciones CRM
  → Plantillas, donde además se ve el estado de la revisión. La siembra es
  **aditiva e idempotente**: si ya existe no se pisa, porque a esa altura es del
  operador y puede haberla ajustado.
- **⚠️ SALE DEL WABA DE LA PLATAFORMA, no del sitio.** Es la regla del CRM desde
  v4.701 —«la plataforma es el único remitente; no hay un WABA por club»— y es
  justamente lo que hace posible una plantilla estandarizada: se aprueba UNA vez
  para todos los sitios y el nombre del sitio viaja como variable. Sin él, un
  beneficiario recibiría un WhatsApp de un número que no reconoce hablándole de
  un dinero, que es exactamente lo que parece una estafa.
- **`omitido` NO es `fallido`.** Fallido es que se intentó y el proveedor lo
  rechazó; omitido es que no se intentó porque falta un paso — y el paso se
  NOMBRA. Confundirlos manda a diagnosticar un problema de entrega donde lo que
  hay es una plantilla sin aprobar.
- **La pantalla DICE por qué WhatsApp no está disponible**, en vez de sólo
  apagar el campo. «No disponible» a secas obliga a adivinar entre la
  configuración, la plantilla y su aprobación, que se corrigen en tres sitios
  distintos.
- **⚠️ LOS TELÉFONOS LOS VALIDA `phone.js`, NO ESTE MÓDULO.** Aquél ya sabe
  distinguir un móvil colombiano de un fijo, cuándo anteponer el código de país
  y cuándo NO adivinar, y es el mismo que usa el CRM para todo lo que sale hacia
  Meta. Un segundo criterio daría dos formas de normalizar el mismo número, y
  entonces el aviso saldría a un destino y el registro diría otro. Se recibe
  como PARÁMETRO para que el criterio siga siendo puro.
- **Los correos se normalizan a minúsculas ANTES de deduplicar.**
  `Ana@Club.org` y `ana@club.org` son la misma persona, y con dos entradas
  recibiría el aviso dos veces. Es la misma normalización que `deliveryKey`
  (v4.855) y tiene que serlo, o la llave de idempotencia no coincidiría.
- **Lo que no se pudo interpretar se DEVUELVE con su motivo y su canal.** Un
  descarte silencioso deja a quien pegó cinco números sin saber cuál no entró, y
  lo que se pierde acá es que alguien no se entere de que le giraron.
- **Un resultado POR CANAL Y POR DESTINATARIO** (`notifyResults`). Con un solo
  estado, un aviso que llegó a dos de tres direcciones se vería como «enviado» y
  nadie sabría cuál falló. `parcial` es un estado real y presentarlo como
  «enviado» o como «fallido» sería mentir en las dos direcciones.
- **Las tres columnas son ADITIVAS y `notifyEmail` se conserva**: las filas
  escritas antes tienen ahí su única dirección, y borrarla las dejaría sin saber
  a quién se avisó. JSONB y no una tabla aparte porque NADIE consulta por
  destinatario: se leen siempre con su desembolso.
- **`NoticeRecipients` es UN componente compartido** por el modal de un aporte y
  el del bloque. Escrito dos veces, el día que se agregue un canal uno se queda
  atrás — el defecto que ya se pagó con la casilla de distritos (v4.748) y el
  selector de pools (v4.877).
- **Con varios aportes, cada destinatario recibe un aviso POR APORTE, y se dice
  ANTES de confirmar.** Cinco mensajes seguidos a la misma persona es algo que
  hay que saber antes, no después.

### ⚠️ Un typecheck que no comprueba nada sale en VERDE (v4.889)

Reporte: «después de marcar como registrado y confirmar, no aparece nada». El
botón del desembolso en bloque no producía ningún efecto.

- **La causa fue un RENOMBRADO A MEDIAS.** v4.888 cambió el estado del modal de
  `correo` a `correos` y agregó `telefonos`; la línea que arma el cuerpo de la
  petición se quedó con `notifyEmail: correo`. Es un `ReferenceError` DENTRO del
  `try`, así que caía en el `catch`, mostraba un toast genérico y devolvía al
  formulario — que se ve exactamente como «no pasa nada».
- **⚠️ Y EL TYPECHECK LO HABRÍA ATRAPADO, PERO NO ESTABA COMPROBANDO NADA.** Sin
  `node_modules`, `tsc -p tsconfig.app.json` falla al resolver `vite/client`
  (`TS2688`), **aborta antes de mirar `src`** y sale con **exit 0** y dos errores
  de configuración. Parece que pasó. En v4.885-v4.888 se dio por «cero errores
  propios» un typecheck que no había leído ni un `.tsx`.
- **LA SEÑAL ERA VISIBLE Y NO SE LEYÓ**: este archivo dice que el proyecto
  arrastra cientos de errores heredados, y el comando devolvía DOS. Un proyecto
  que de pronto está limpio no está limpio: es que no se miró.
- **`npm run check:typecheck` es la barrera** (`scripts/check-typecheck-real.mjs`).
  Falla si no hay `node_modules`, si aparece `TS2688` —sin sus tipos base `tsc`
  no comprueba nada— o si hay menos de 50 errores en `src`. **Correr `npm ci`
  antes de dar por verificado un cambio de frontend.** Verificado a la inversa:
  con el defecto reintroducido, `tsc` dice
  `TS2552: Cannot find name 'correo'. Did you mean 'correos'?`.
- **Y hay una SEGUNDA barrera que no depende de las dependencias**
  (`test:disbursement:notice`): comprueba sobre el archivo que los modales
  manden `notifyEmails`/`notifyPhones`, que el servidor lea esos mismos nombres
  y que no quede ningún `correo` suelto. Un renombrado a medias entre la
  pantalla y el servidor no lo ve ninguna prueba de criterio.
- **Sin beneficiario no se llega a la confirmación.** El servidor ya lo exigía
  —y sigue siendo quien decide— pero dejaba pasar a una pantalla que decía «se
  registrarán 5 desembolsos a —» y gastaba la petición para volver con cinco
  errores iguales. El motivo va A LA VISTA junto al campo: un botón apagado sin
  explicación se lee como que el módulo está roto.

### El estado de un aporte conoce su desembolso (v4.890)

Reporte con la lista delante: se marcan cinco aportes como girados, «no aparece
nada, siguen apareciendo ahí y el estado es todavía disponibles para retiro».
Eran DOS defectos encadenados y el primero tapaba al segundo.

- **⚠️ `createBulkDisbursements` USABA `destinatarios` SIN DECLARARLO.** v4.888
  agregó los destinatarios al desembolso de a uno y copió al bloque las líneas
  que los MANDAN sin traer la que los CALCULA: `ReferenceError` dentro del
  `try` → 500 → **ningún aporte se registraba**. Mismo renombrado a medias que
  v4.889, por la otra puerta.
- **⚠️ Y NADA LO VEÍA: EL SERVIDOR NO PASABA POR NINGÚN COMPROBADOR DE
  IDENTIFICADORES.** `npm run typecheck` mira `src` y esto es `.js` fuera de
  ese alcance; `check:syntax` da el archivo por bueno porque **parsea
  perfectamente** —es un error de EJECUCIÓN—; `check:hooks` corre ESLint sólo
  sobre `**/*.{ts,tsx}`; y las pruebas importan el criterio PURO y simulan la
  API, así que el cuerpo del manejador puede no ejecutarse nunca. Lo cierra
  `npm run check:server-undef` (en `prebuild`), que corre **una sola regla**,
  `no-undef`, por el mismo motivo que `check:hooks` corre una sola: con el juego
  completo el aviso que importa se pierde entre cientos heredados y el guardián
  se termina desactivando. Verificado a la inversa: reintroduciendo el defecto,
  señala las cuatro líneas.
- **⚠️ `bucketOf` NO SABÍA NADA DEL DESEMBOLSO**, y ése era el segundo defecto.
  Mira sólo las fechas del pago, así que un aporte girado entero al beneficiario
  seguía informándose `available` y la tarjeta pintaba «DISPONIBLE PARA RETIRO»
  en verde encima de un giro ya registrado. `bucketWithDisbursement` pliega el
  giro: el desembolso es el hecho **más tardío** del camino del dinero —`order`
  50 y 60, después de `available`— así que manda.
- **HAY UN VEREDICTO, NO DOS.** v4.886 resolvía esto con una segunda insignia
  violeta AL LADO de la verde, y las dos hablaban del mismo aporte diciendo
  cosas distintas: es la contradicción que este archivo ya prohibió dos veces
  (v4.787, indicador rojo bajo cabecera verde; v4.799, insignia verde sobre una
  tarjeta que grita «REQUIERE REGENERACIÓN»). Lo que queda junto a la insignia
  es cuánto falta cuando el giro fue parcial, en texto llano.
- **`refunded` y `failed` NO se tapan con «desembolsado».** No son etapas
  anteriores del camino sino HECHOS NUEVOS sobre el dinero mismo, y esconderlos
  detrás del giro escondería justo lo que hay que ver.
- **⚠️ EL DISPONIBLE PARA RETIRO SE CALCULA SOBRE EL ESTADO FINANCIERO Y RESTA
  LO GIRADO, aporte por aporte.** Sobre el estado plegado, un aporte girado a
  MEDIAS saldría entero del disponible y la cifra quedaría corta; con el total
  por moneda de `disbursedTotals` se restarían giros de aportes que nunca
  estuvieron disponibles y quedaría corta por el otro lado. Por eso el item
  declara `financialBucket` y `disbursedAmount` además del `bucket` plegado —dos
  preguntas distintas sobre el mismo pago, resueltas en el servidor y no
  deducidas otra vez en la pantalla—.
- **`computeBalances` NO se toca.** Es el cálculo autorizado de un payout y
  vive en el módulo de retiros; esta cifra es la de esta pantalla. Al cambiar
  una, mirar la otra.
- **Lo girado por aporte se pide en UNA consulta agregada** (`disbursedByPayment`,
  `GROUP BY "paymentId"`), no trayendo las filas ni con un `await` dentro de un
  `.map` —que además no se esperaría—. Criterio de `disbursedTotals` y de
  `getCentralOverview`.
- **`disbursing` y `disbursed` entraron a la lista de grupos de la Bóveda.**
  Estaban declarados en `LIFECYCLE_STATES` desde v4.885 y ningún agrupador los
  contemplaba: un aporte plegado a esos estados habría desaparecido de todos los
  grupos —y de los totales— en silencio.

### Lo que la validación lee tiene que salir del shaper (v4.966)

Reporte con dos capturas: el formulario del desembolso en bloque lleno, con dos
correos escritos y el comprobante adjunto, y al confirmar «Se registraron 0 de 8
— se pidió notificar al beneficiario pero no hay a qué dirección escribirle».
Las direcciones estaban a la vista. Eran DOS mitades del mismo olvido de v4.888.

- **⚠️ `disbursementShape` NO ENUMERABA `recipientCount`, y `validateDisbursement`
  sólo ve lo que el shaper produce.** `registerDisbursement` valida sobre
  `disbursementShape(body)`, no sobre el cuerpo: el controlador mandaba el
  recuento, el shaper lo tiraba, y la comprobación leía `undefined` →
  `Number.isFinite(NaN)` falso → caía al respaldo del camino viejo y afirmaba que
  no había a quién escribirle con dos correos saneados en el mismo objeto.
  **Es la lección del `SELECT` de v4.886 aplicada a un objeto**: lo que el
  llamador va a leer tiene que salir de ahí. Ahora el recuento se **DERIVA** de
  los arrays que el propio shaper ya sanea, así que no puede perderse ni
  discrepar; y la validación **cuenta lo que ve** (`notifyEmails` +
  `notifyPhones` + la dirección suelta) y toma el campo declarado sólo como
  respaldo — el veredicto deja de depender de un campo que un shaper puede
  dejar fuera.
- **⚠️ Y LA OTRA MITAD, PEOR: la puerta del aviso miraba `datos.notifyEmail`**,
  el campo de UNA sola dirección de v4.885, que por el camino de varios
  destinatarios vale `null`. Corregido lo anterior, el desembolso se habría
  registrado y **el correo no habría salido nunca**, en silencio. La puerta mira
  ahora `datos.recipientCount > 0`. Al agregar un camino nuevo a un campo,
  buscar QUIÉN más lo lee: acá lo leían la validación y el disparo del aviso, y
  los dos se quedaron con el campo viejo.
- **La regla se comprueba en general, no sólo el caso reportado.** Una prueba
  extrae del cuerpo de `validateDisbursement` todos los `raw?.X` y exige que
  cada uno lo produzca `disbursementShape`. Verificada a la inversa: quitando el
  campo derivado fallan tres comprobaciones.
- Alcanza también al desembolso **de un solo aporte**: comparte shaper y puerta,
  así que tenía el mismo defecto por las dos vías.
- **Un solo mensaje de error, y dice QUÉ HACER.** Los dos que había —«no quedó
  ningún destinatario válido» y «no hay a qué dirección escribirle»— obligaban a
  adivinar en qué se diferenciaban.

**Consecuencia conocida (superada en v4.996):** hasta v4.995 el aviso se
mandaba **por aporte**, así que un giro que cubría 8 aportes con 2
destinatarios eran 16 correos. Desde v4.996 el aviso es UNO por lote y por
destinatario — ver la sección siguiente.

### El desembolso en bloque es UN LOTE y avisa UNA vez (v4.996)

Reporte con la bandeja delante: ocho aportes marcados como desembolsados, ocho
correos «Tu aporte ha sido desembolsado» a la misma persona, cada uno con
`{{beneficiary_name}}` sin resolver en la firma y «Sitio de origen: Club
Platform for Rotary» donde iba el nombre del sitio.

| Archivo | Qué es |
|---|---|
| `server/lib/disbursementBatch.js` | El CRITERIO. **Puro**: clave de agrupación, totales, variables obligatorias y opcionales, el correo consolidado y la puerta de marcadores sin resolver |
| `DisbursementBatch` en `ensureDisbursementSchema.js` | El lote: identidad, totales, medio, referencia, `operationKey`, estado del aviso y sus resultados |
| `openBatch` · `closeBatch` · `notifyBatch` · `batchDetail` en `disbursements.js` | La I/O del lote |
| `previewBulkDisbursements` · `createBulkDisbursements` en `disbursementController.js` | La vista previa y la confirmación |
| `src/components/admin/wallet/DisbursementBatchModal.tsx` | La ficha del lote: aportes, destinatarios, estado de cada envío, «Ver el correo», reintento |

Pruebas: `npm run test:disbursement:batch` (120 casos de criterio y de
archivo) y `npm run test:disbursement:batch:path` (109, el CAMINO del
controlador con la base y el correo sustituidos en memoria, recorriendo las
seis pruebas de aceptación del pedido). **Ninguna necesita Postgres,
credenciales ni red.**

- **⚠️ LA CAUSA DE LOS OCHO CORREOS ERA ESTRUCTURAL, no un olvido.**
  `createBulkDisbursements` recorría los aportes llamando a
  `registerDisbursement({ notify: true })` por cada uno, y cada llamada
  disparaba `notifyDisbursement` con su propio correo. La llave de
  idempotencia de `NotificationDelivery` es `contribución + evento +
  destinatario`, así que ocho contribuciones eran ocho llaves distintas y
  nada lo frenaba: **la idempotencia protegía exactamente contra lo que no
  estaba pasando**. Ahora el bucle registra con `notify: false` y quien avisa
  es el LOTE, una sola vez (`notifyBatch`). Una prueba lee el archivo y falla
  si vuelve `notify: true` dentro del bucle o si hay más de una llamada a
  `notifyBatch`.
- **⚠️ Y `{{beneficiary_name}}` SALÍA PORQUE `salida.missing` NO SE LEÍA.**
  `renderTemplate` deja el marcador LITERAL y lo reporta (v4.856, a
  propósito: mejor un marcador que un hueco); el envío del desembolso lo
  ignoraba. Ahora un correo con variables sin resolver NO sale y el motivo
  queda escrito — en el aviso de a uno y en el del lote. En el lote la puerta
  es `checkRendered`: `{{x}}`, `${x}`, `undefined`, `null`, `NaN` y
  `[object Object]` sobre asunto, HTML y texto. Lo obligatorio que falta
  (`REQUIRED_VARS`: referencia, total, moneda, fecha, sitio, cantidad) frena
  el envío; lo opcional que falta (campaña, referencia bancaria, medio, logos)
  esconde su línea.
- **UNA FILA POR APORTE SE CONSERVA, y el lote se SUMA.** `Disbursement`
  sigue siendo una fila por aporte —su referencia, su reverso, su atribución a
  la campaña— y gana `batchId`. Fundir cinco aportes en un movimiento
  agregado sería el error que v4.886 ya evitó: no se podría reversar uno ni
  cuadrarlo contra el extracto. `DisbursementBatch` es OTRA tabla, con sus
  totales derivados de sus filas (`closeBatch` los recalcula al cerrar).
- **⚠️ LOS LOTES SE PARTEN POR `sitio | moneda | campaña | beneficiario`**
  (`batchGroupKey`), y el criterio vive en el servidor: `previewBulkDisbursements`
  agrupa con la MISMA función que la confirmación, y la pantalla sólo pinta lo
  que vuelve. Con el agrupamiento escrito también en el navegador, la vista
  previa diría «1 notificación» y saldrían dos. Dos campañas o dos monedas en
  la misma selección son dos lotes y dos correos, **nunca un correo que las
  mezcle** — las monedas no se suman (regla del módulo desde v4.841) y un
  beneficiario no puede recibir el listado de otro.
- **⚠️ LA IDEMPOTENCIA SON DOS CANDADOS, y los dos son de la BASE.** (1) La
  confirmación viaja con `operationKey` (un UUID que la pantalla genera al
  abrir la barra) y el lote lleva índice único parcial sobre
  `("operationKey","groupKey") WHERE "operationKey" <> ''`: un doble clic o un
  refresco tras confirmar encuentra los lotes ya creados
  (`findBatchesByOperation`) y contesta `repetida: true` sin registrar ni
  enviar nada. Por ser parcial, el `ON CONFLICT` repite el predicado (v4.648).
  (2) El aviso reclama `NotificationDelivery` con `contributionId =
  batch:<id>` — la llave pasa a ser `lote + evento + destinatario`—, y el lote
  guarda `notifyState`: un `notifyBatch` sobre un lote ya `enviado` devuelve
  `duplicado` sin tocar el proveedor. El reintento (`retry`) sólo alcanza a
  quien NO lo recibió y conserva los resultados de quien sí.
- **EL CORREO LO ARMA EL CÓDIGO CON UNA PLANTILLA FIJA** (`buildBatchEmail`),
  no los bloques configurables de `notificationTemplate.js`: el listado de
  aportes es una TABLA con N filas y un total, y eso no cabe en un bloque de
  texto que edita un administrador. La estructura es la del correo de
  inscripción de la Conferencia: logotipo de la plataforma arriba, tarjeta
  resumen, tabla de aportes, fila de total, logotipo del SITIO abajo —
  `marcaDelSitio` lo resuelve por sitio (Club → District de respaldo), jamás
  escrito a mano— y el pie «generado automáticamente por Club Platform».
- **UN APORTANTE ANÓNIMO NO SALE EN EL CORREO CON SU NOMBRE NI SU CORREO**
  (`donorLine`): el correo va a un tercero y es la misma regla que la
  exportación de la Bóveda (v4.850) y la línea de aportantes (v4.862). Su
  importe sí suma al total.
- **LA TRAZABILIDAD VIVE EN TRES SITIOS y se lee desde la ficha del lote**:
  el lote (`DisbursementBatch`: quién, cuándo, cuánto, a quién se avisó y con
  qué resultado por destinatario), cada aporte (`Disbursement.batchId` + su
  propia referencia) y la línea de tiempo de cada pago (`recordFact`
  `notified` / `notify_failed` con `reference = batchId`). La ficha de un
  aporte desembolsado dice «Desembolso: LOTE-… · giro conjunto de N aportes»
  y abre el lote.
- **EL COMPROBANTE DEL LOTE SE SUBE UNA SOLA VEZ**, fuera del bucle, con la
  clave del `operationKey`, y las N filas la comparten (regla de v4.887).
- **La respuesta conserva la forma de v4.886** (`registrados`, `saltados`,
  `totalesPorMoneda`, `hechos`, `batchId`) y SUMA `lotes`, `repetida` y
  `notificacionesEnviadas`: un navegador con el bundle anterior sigue leyendo
  lo de siempre.
- **La pantalla dice ANTES cuántos lotes y cuántas notificaciones van a salir**
  y DESPUÉS «Desembolso completado · N aportes · $X · 1 notificación
  consolidada» con «Ver desembolso». Decir «se enviará un aviso por cada
  aporte» ya no es cierto y una prueba comprueba que no vuelva.
- **`DisbursementBatch` vive fuera de Prisma** y está en la lista del guardián
  de `db:push`. `Payment` y `Donation` no ganan ni una columna (regla de
  `logo_intl`, v4.699).

### El comprobante del giro viaja ADJUNTO (v4.997)

Reporte con los dos correos delante: las notificaciones consolidadas llegaban
bien, y **sin el comprobante** que se había adjuntado al confirmar.

- **⚠️ LA CAUSA: `sendPlatformEmail` ADMITE `attachments` DESDE SIEMPRE Y NADIE
  SE LOS PASABA.** `uploadReceipt` subía el archivo a
  `private/disbursements/`, `openBatch` guardaba su clave en el lote, la
  ficha lo mostraba, y los dos envíos del desembolso —`enviarCorreoLote` y
  `enviarCorreo`— armaban el correo con asunto, HTML y texto y nada más. El
  soporte del banco existía en tres sitios y no llegaba al único que le
  importa a quien recibe el dinero.
- **`receiptAttachment` lo baja del bucket por el SDK** (`GetObjectCommand` +
  `transformToByteArray`), no por la URL pública: el prefijo es privado y la
  lectura anónima no está garantizada (v4.912). Viaja en base64, que es la
  forma que entienden los dos caminos de envío (Resend y SMTP).
- **UNA lectura por lote, no por destinatario**: el archivo es el mismo para
  todos y bajarlo N veces son N viajes al bucket por un solo adjunto. Lo fija
  la prueba de camino contando las llamadas al bucket.
- **⚠️ LEERLO NUNCA LANZA, Y EL CORREO SÓLO DICE «ADJUNTO» CUANDO LO LLEVA.**
  Un comprobante ilegible no puede costar la notificación —es lo que el
  beneficiario vino a recibir—: sale sin él, sin la fila «Comprobante», y el
  resultado del envío guarda el motivo (`attachment.error`), visible en la
  ficha del lote. Por eso `receipt_name` es OPCIONAL en `buildBatchEmail` y
  lo declara **quien envía** (`receipt: { name }`), no se toma de
  `batch.receiptName`: el previo dice lo que VA a ir; el envío sólo afirma lo
  que consiguió.
- **Alcanza también al desembolso de UN aporte** —comparte la regla y la
  función— y al **reintento**, que vuelve a adjuntarlo.
- **Los dobles de S3 tienen LA MISMA FORMA que el SDK v3**
  (`s3-disbursement-stub.mjs`: `Body.transformToByteArray()`): un doble que
  devolviera el Buffer suelto dejaría en verde un código que en producción no
  sabe leer el stream. Y la prueba entra por **multipart real** con el mismo
  `multer` de la ruta, no por JSON: el comprobante llega como desde la
  pantalla.

### Un giro deja VARIOS comprobantes (v4.998)

Pedido con el modal delante: *«debemos poder seleccionar múltiples archivos:
voy a adjuntar un PDF y una imagen, una captura con el fee que nos cobraron
por hacer la transferencia»*. La casilla admitía UN archivo
(`multer.single`, `receiptKey` y tres columnas más), y un giro real deja dos
soportes distintos que respaldan cosas distintas.

| Pieza | Qué es |
|---|---|
| `checkReceipts` · `RECEIPT_MAX_FILES` (`walletLifecycle.js`) | El CRITERIO del juego: tope de cinco, cada archivo juzgado y NOMBRADO |
| `uploadReceipts` · `receiptFilesOf` · `receiptAttachments` (`disbursements.js`) | Subir la lista, leerla venga de donde venga, adjuntarla entera |
| `"receiptFiles" JSONB` en `Disbursement` y `DisbursementBatch` | La lista `[{ key, name, mime, bytes }]` |
| `src/lib/receiptFiles.ts` · `ReceiptFilesInput.tsx` | El espejo mínimo y el selector COMPARTIDO por los dos modales |

- **⚠️ LA LISTA ES ADITIVA Y LAS CUATRO COLUMNAS DE SIEMPRE LLEVAN EL
  PRIMERO.** `receiptKey/Name/Mime/Bytes` no se retiran ni se vacían: toda
  fila anterior a v4.998 tiene ahí su único comprobante, y un bundle anterior
  sigue leyendo `hasReceipt`/`receiptName`. `receiptFilesOf` es el ÚNICO
  lector —cae a esas columnas cuando la lista no está— y lo consumen el
  correo, la ficha y el enlace firmado. Con dos lectores, el correo adjuntaría
  uno y la ficha mostraría otro. Lo fija una prueba que reenvía un lote de
  v4.997 con la lista borrada de la fila.
- **`receiptFiles` se agrega con `ADD COLUMN IF NOT EXISTS` en las DOS tablas**
  (`ALTERS` y `BATCH_SQL`): la base de producción ya tiene `DisbursementBatch`
  de v4.996, y `CREATE TABLE IF NOT EXISTS` no la amplía — la trampa de
  v4.908, otra vez.
- **⚠️ SE JUZGAN TODOS ANTES DE SUBIR NINGUNO.** Con el PDF válido y la
  captura inválida, subir el primero y rechazar después dejaría un objeto
  huérfano en el bucket y un 422 sobre una operación a medias. Cada motivo
  nombra su archivo (««virus.exe»: sólo se admiten PDF, JPG y PNG»): «uno de
  los comprobantes no vale» obliga a adivinar cuál. El peso se juzga POR
  ARCHIVO, no sumado — el tope de cinco existe porque los adjuntos viajan en
  base64 dentro del mismo correo.
- **La ruta recibe UNO DE MÁS** (`array('receipt', RECEIPT_MAX_FILES + 1)`)
  para que el sexto lo rechace el CRITERIO con su frase, y no multer con
  «Unexpected field». El campo sigue llamándose `receipt`: un solo archivo
  cumple `array` igual que cumplía `single`.
- **⚠️ CADA ARCHIVO DECIDE POR SU CUENTA AL ADJUNTAR.** `receiptAttachments`
  lee cada uno UNA vez por lote; el PDF que sí se pudo leer viaja aunque la
  captura no, el correo sólo afirma los que lleva —en singular o en plural
  según cuántos fueron— y el resultado del envío (`attachment.name`,
  `count`, `files`, `error`) nombra el que faltó con su motivo. Todo o nada
  habría dejado sin el soporte del banco a quien sí lo tenía.
- **El enlace firmado devuelve TODOS** (`files[{ index, url, name }]`), con
  `url`/`name` del primero para el bundle anterior. Firmar es cálculo local:
  cinco firmas no son cinco viajes al bucket. La ficha pinta UN botón por
  comprobante; la clave de S3 sigue sin viajar.
- **El selector es UNO, compartido** (`ReceiptFilesInput`), como
  `NoticeRecipients`. **SUMA, no reemplaza**: quien eligió el PDF y vuelve al
  selector por la captura espera tener los dos. El tipo se mira por MIME y por
  extensión (el carrete del móvil manda el tipo vacío, v4.739), y el `input`
  se limpia tras cada elección (v4.784). Los números del espejo se comparan
  contra los del servidor en la prueba.

**Variables de entorno:** ninguna nueva. `CRON_SECRET` protege
`/api/cron/wallet-tick` como al resto de los crons.

**Pendientes conocidos:** el desembolso **no asienta contrapartida en el libro
mayor** —hoy sólo el aporte y la liberación tienen asiento—; el evento
`in_transit` sigue declarado y sin implementar porque nadie nos avisa cuando
Stripe libera (hay que ir a preguntárselo, que es lo que hace el barrido); y la
plantilla del desembolso **no tiene todavía una pantalla en el panel de
Notificaciones** — se lee de `NotificationTemplate` si alguien la crea, y si no
sale la de fábrica.
