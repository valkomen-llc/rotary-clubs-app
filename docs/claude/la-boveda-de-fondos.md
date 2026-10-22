<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## La Bóveda de Fondos — libro mayor en sombra (v4.847, Fase 1)

Fase 1 del rediseño financiero. Se crean las tablas del libro y se escriben los
asientos EN PARALELO con lo que ya existe; **nadie los lee**. La Bóveda sigue
calculando sus saldos desde `Payment` y `PayoutRequest`, igual que antes. La
reversa es dejar de escribir: las tablas quedan sin consumidor.

| Archivo | Qué es |
|---|---|
| `server/lib/ledgerSpec.js` | El CRITERIO. **Puro**: cuentas, tipos de asiento, unidad mínima, cuadre y los constructores de asiento |
| `server/lib/ensureLedgerSchema.js` | `LedgerAccount`, `LedgerTransaction` y `LedgerLine` en runtime |
| `server/lib/ledger.js` | La escritura, la lectura de saldos y la conciliación |
| `GET /api/payouts/admin/ledger/:clubId` | El informe: el libro contra la Bóveda. Sólo del operador |

Pruebas: `npm run test:ledger` (88 casos, criterio puro) y
`npm run test:ledger:write` (44, el CAMINO de escritura con la base sustituida
en memoria). **Ninguna necesita Postgres, credenciales ni red.**

**Reglas durables:**

- **Se estrena EN SOMBRA porque los saldos de esta pantalla son dinero que un
  club va a pedir.** Cambiar de dónde salen sin haber comprobado antes que el
  libro nuevo dice lo mismo que el viejo sería estrenar un motor contable sobre
  producción. Lo que hace útil la fase es `reconcileClub`: sin una forma de
  contrastar los dos libros, el nuevo sería una promesa.
- **TODO ENTRA COMO ENTERO, EN LA UNIDAD MÍNIMA**, y el motivo está MEDIDO en la
  Fase 0: `roundMoney(8.915, 'USD')` devuelve 8,91 y no 8,92 —el doble más
  cercano a 8.915 es 8.9149999…—, así que el redondeo de un importe con
  decimales depende de cómo cayó el binario. Sobre un aporte suelto es un
  centavo; sobre un libro que se suma miles de veces es un descuadre que nadie
  puede explicar. `minor` es `BIGINT`: un `numeric` invitaría a meter decimales
  y un `int` desbordaría —50.000 COP ya son 5.000.000 de unidades mínimas—.
- **⚠️ La unidad del LIBRO es la del PROVEEDOR (`stripeDecimals`), no la de
  presentación.** Son dos nociones distintas —es la regla de `money.js`— y COP
  es justo donde difieren: se cobra con dos decimales y se escribe sin ninguno.
  Llevar el libro en la unidad de presentación tiraría los centavos de cada
  comisión, y la comisión de Stripe es precisamente la cifra con centavos.
- **UN ASIENTO CUADRA POR MONEDA, NO EN TOTAL.** Un apunte de +10 USD y −40.000
  COP no «cuadra en cero» de ninguna forma útil: es la misma mezcla que produjo
  el «$47.507,75», escondida detrás de una invariante que parece rigurosa. Una
  operación que cruza monedas son DOS asientos, cada uno cuadrado en la suya.
- **La conversión ocurre ANTES del asiento, no dentro.** La comisión de un cobro
  en pesos la cobra Stripe en dólares; su línea va en PESOS —es lo que de verdad
  se le descontó al cobro— y el importe original en dólares viaja en `meta`, con
  su tasa, su fuente y su fecha. Sin eso, «¿por qué la comisión de este aporte
  son 4.750 pesos?» no se puede contestar dentro del libro.
- **EL LIBRO SÓLO AGREGA.** No hay UPDATE ni DELETE sobre una línea ni sobre un
  asiento; corregir es escribir un asiento que REVIERTE al anterior y lo nombra.
  Un libro que se puede editar no responde «¿qué decía esto en marzo?», que es
  la única pregunta para la que existe un libro. Lo comprueba una prueba leyendo
  el archivo: un UPDATE escrito ahí no lo ve ninguna otra comprobación.
- **ANULAR NO ES REVERTIR.** Un retiro rechazado deja un asiento NUEVO que
  devuelve el dinero a disponible; el asiento del retiro se queda, porque el
  club lo pidió de verdad. Un reverso diría que nunca existió.
- **El NETO se DERIVA, no se recibe.** `buildDonationEntry` resta las
  retenciones del bruto. Aceptarlo de fuera permitiría escribir un asiento que
  cuadra porque alguien mandó el número que hacía falta, y entonces el libro
  deja de comprobar nada. Un neto negativo se RECHAZA: no es un asiento raro, es
  un dato mal leído, y se atrapa donde todavía se puede.
- **Una retención en CERO no deja línea.** Un libro lleno de ceros esconde las
  líneas que sí dicen algo.
- **`basis` separa lo MEDIDO de lo ESTIMADO.** La comisión que devolvió el
  proveedor es un hecho; la que calculamos con su tarifa publicada porque la
  consulta falló es una cuenta nuestra. Presentarlas igual es lo que hace que un
  libro deje de servir para cuadrar.
- **NADIE PAGA POR EL LIBRO.** Toda función de escritura devuelve `{ ok, reason }`
  y NUNCA lanza; el asiento va después de acreditar el cobro y en su propio
  `try`. Un aporte que se perdiera porque falló su asiento sería cambiar un
  problema de auditoría por uno de dinero — y el libro está en sombra, así que
  todavía no vale nada.
- **La idempotencia es de la BASE**: índice único sobre `(sourceType,
  sourceRef)`. No hay lectura previa que sirva contra dos entregas concurrentes
  del mismo webhook — es la misma lección que costó
  `Payment_provider_providerRef_key` en v4.841. El aporte y su liberación llevan
  la MISMA referencia y no chocan porque su `sourceType` difiere; una anulación
  lleva el sufijo `:anulado`, así que rechazar dos veces el mismo retiro no
  devuelve el dinero dos veces.
- **La liberación se asienta cuando el CLUB puede pedirlo, no cuando Stripe
  suelta.** Entre las dos fechas hay `PLATFORM_HOLDING_DAYS`, y asentar en la
  primera pondría en «disponible para retiro» un dinero que la Bóveda todavía no
  deja retirar: dos libros diciendo cosas distintas sobre lo mismo es
  exactamente lo que la fase en sombra existe para no estrenar.
- **NO hay tabla de saldos materializados**, y es a propósito: sería una segunda
  verdad sobre las mismas líneas, y las segundas verdades se contradicen en
  silencio en cuanto alguien escriba sin actualizarla —es lo que evitan
  `publicKeyOf` y `hasBackdrop`—. El saldo es `SUM(minor)` con `GROUP BY account,
  currency`. **Ese `GROUP BY currency` no es opcional**: su ausencia es
  literalmente el defecto que abrió este rediseño. El día que la consulta duela
  se materializa a sabiendas, con su recálculo; hoy no duele.
- **Las tres tablas viven FUERA de Prisma** y están en la lista del guardián de
  `db:push`. Un modelo declarado en `schema.prisma` que todavía no exista en la
  base deja en 500 toda consulta que lo toque —la regla de `logo_intl`
  (v4.699)— y acá caería sobre el cobro.
- **El asiento y sus líneas van en UNA transacción de base.** Un asiento a
  medias es un libro descuadrado que no se puede corregir, porque el libro sólo
  agrega. Hace falta una conexión DEDICADA del pool: `db.query` toma una
  distinta por llamada, así que un `BEGIN` por ahí no envolvería a los `INSERT`
  siguientes y la transacción sería decorativa.
- **El criterio vive aparte de la orquestación**, como `seoRules.js` frente a
  `seoAudit.js`: un motor contable que sólo se ejercita contra una base real
  termina sin pruebas, y entonces nadie se entera de que una regla cambió de
  signo.
- **Y aun así se prueba el CAMINO, no sólo el criterio** (`test:ledger:write`,
  con la base sustituida en memoria). Es la lección de v4.744: `pickDistrictSite`
  era correcto y el defecto estaba en el camino. Ahí se ve lo que una prueba
  pura no puede ver — que la cuenta se cree antes que la línea, que un evento
  reentregado no duplique dinero, que los saldos salgan agrupados por moneda—.
  **Lo que ese doble NO demuestra es que el SQL sea válido para Postgres**: eso
  se comprueba al desplegar, y no se afirma de más.
- **⚠️ Al escribir SQL en un template literal, ninguna comilla invertida
  adentro** — ni en un comentario. Cierra el literal a mitad y el módulo entero
  deja de parsear; lo atrapó `npm run check:syntax`, que es la única barrera que
  lo ve. Ya había pasado en `ensureDesignSchema.js` (v4.721.1).
- **El informe de conciliación es del OPERADOR, sólo lectura, y HOY VA A
  DIFERIR.** Decirlo es parte del informe: el libro arranca vacío y sólo asienta
  lo posterior a v4.847, así que la diferencia mide cuánto historial le falta, no
  un error. Presentarlo sin esa frase mandaría a buscar una avería inexistente —
  misma regla que `unknown` en el diagnóstico del CRM.
- **La etiqueta de `gasto_procesador` es la que pidió el cliente**, textual
  («Tarifa de procesamiento de traslado desde interbancos»), y una prueba la
  fija: renombrarla de vuelta por criterio propio tiene que fallar.

### La carga hacia atrás (v4.848, Fase 2 — primer paso)

`POST /api/payouts/admin/ledger/:clubId/backfill`. Criterio en
`server/lib/ledgerBackfill.js` (**puro**), orquestación en `backfillClub`.
Pruebas: `npm run test:ledger:backfill` (59 casos) más la sección de punta a
punta de `test:ledger:write`, que comprueba que **después de cargar el informe
CUADRA** — sin eso, la Fase 2 sería una promesa.

- **SE REPRODUCE, NO SE CORRIGE, y de ahí cuelga todo lo demás.** La comisión no
  se recalcula: se DERIVA restando (`bruto − retención − neto`), de modo que el
  neto del libro sea EXACTAMENTE el `netAmount` guardado. Varios aportes
  anteriores a v4.845 tienen el neto mal calculado —se les restó una comisión en
  dólares como si fueran pesos— y la carga los reproduce MAL a propósito. Si se
  arreglaran al cargarlos, el informe pasaría a mezclar «lo que falta por
  cargar» con «lo que decidimos corregir» y un descuadre dejaría de distinguir
  un fallo de la carga de una corrección deliberada. El informe es el ÚNICO
  instrumento que autoriza el cambio de fuente; no puede quedar ambiguo. Los
  netos malos se corrigen después, con asientos de reverso que lo dicen.
- **Todo asiento cargado se marca `reconstruido`**, y su comisión `basis:
  'estimado'` cuando se dedujo restando (`meta.derivada`). Dentro de un año
  nadie tiene por qué confundir lo observado en vivo con lo deducido del
  historial.
- **La referencia es la MISMA que usa el webhook** (`providerRef`, o `id:<id>`
  si falta). Es lo que impide que la carga duplique un aporte que ya se asentó
  en vivo: el índice único lo rechaza. Correrla dos veces es seguro y el segundo
  pase debe salir todo duplicado — lo comprueba una prueba.
- **De ENSAYO por defecto.** Sin `{"apply": true}` no escribe y devuelve lo que
  haría. Escribir es idempotente, pero lo valioso es mirar primero: **lo que no
  se puede cargar y por qué es la mitad del resultado**, agrupado por motivo con
  ejemplos — un listado de doscientas filas no lo lee nadie.
- **Un pago SIN neto registrado no se carga**, y no es una omisión: la Bóveda lo
  cuenta como cero (`Number(null) || 0`), así que dejarlo fuera hace que los dos
  coincidan. Asentarlo con neto cero diría que el procesador se quedó con todo.
- **Un retiro RECHAZADO tampoco**, por lo mismo: `computeBalances` no lo cuenta.
  Asentarlo completo —retiro y anulación— exigiría inventar cuándo se pidió y
  cuándo se rechazó, y ninguna de las dos fechas está guardada.
- **Un retiro en una moneda sin aportes se REPORTA, no se adivina.** Hasta
  v4.840 `PayoutRequest.currency` no se escribía y toda fila vieja quedó en USD
  por omisión: adivinar cuál era es adivinar cuánto dinero salió.
- **`PAYOUT_COUNTED` tiene que ser la MISMA lista que usa `computeBalances`** o
  el libro y la Bóveda contarían retiros distintos y el informe nunca cuadraría.
- **Presupuesto de tiempo, y lo que no entra se DICE** (`pendientes`). Un corte
  mudo se lee como «ya está todo cargado», que es la conclusión equivocada.

**⚠️ El informe comparaba dos cantidades que no son la misma** (corregido en
v4.848). La v4.847 contrastaba `club_disponible` del libro contra `available` de
la Bóveda: aquélla calcula `collected − requested` **sin** mirar el período de
retención, y el libro sólo llama disponible a lo que el proveedor ya liberó. Con
un aporte en tránsito los dos difieren estando los dos bien, y el informe habría
reportado un descuadre inexistente — el error que la conciliación existe para no
cometer. Ahora se compara `neto − transferido`, que sí es la cantidad
equivalente, y lo que el libro sabe de más —liberado y en tránsito— se devuelve
en `soloEnElLibro`, **sin compararlo contra nada**: no hay contra qué.

- **⚠️ Limitación conocida: un asiento no se corrige solo.** El de liberación
  se queda con el neto que se conocía la primera vez; si un sync posterior
  mejora la comisión —porque apareció la TRM del día—, el segundo asiento choca
  con el índice y se descarta. Corregirlo es revertir y volver a asentar, y eso
  es Fase 2. Mientras tanto es un descuadre que la conciliación VE, que es
  exactamente para lo que sirve la fase en sombra.

**Lo que sigue (Fase 2, segundo paso):** correr la carga en producción, mirar el
informe y —**sólo si cuadra**— cambiar la fuente de los saldos de la Bóveda al
libro. Hasta que cuadre, no se cambia nada. Después quedan los reversos de los
netos mal calculados, que son otra cosa y van con su propio asiento.

### La Bóveda se filtra por período y por destino (v4.849, bloque A)

Debajo del selector de moneda: el PERÍODO (7/15/30/90 días o un rango a mano) y
el DESTINO del aporte. Debajo de la lista, lo recibido en el período.

| Archivo | Qué es |
|---|---|
| `server/lib/walletFilters.js` | El CRITERIO. **Puro**: rangos, qué cae dentro, catálogo de destinos y qué se filtra y qué no |
| `src/lib/walletFilters.ts` | Espejo MÍNIMO: sólo lo que hace falta para pintar el selector |
| `resumenDelPeriodo` en `financialController.js` | Los flujos del período, por moneda |

Pruebas: `npm run test:wallet:filters` (72 casos, **sin base ni red**) y 20
comprobaciones más en `npm run test:wallet:ui`.

**Reglas durables:**

- **UN SALDO NO SE FILTRA POR FECHA.** Es la regla de la que cuelga el bloque.
  Los aportes de un período son un FLUJO —existen dentro de un rango—; el
  disponible para retiro es un SALDO —existe A UNA FECHA—. «Disponible para
  retiro entre el 1 y el 15» no significa nada. Si el filtro tocara la caja
  azul, alguien elegiría «últimos 7 días», vería «US$ 0,00» y concluiría que no
  tiene dinero, justo en el número con el que decide si pide un retiro. Es la
  misma clase de defecto que el «$47.507,75». Por eso `FILTRABLE` es un catálogo
  EXPLÍCITO y el saldo no está en él, y por eso una prueba comprueba sobre el
  archivo que `computeBalances` no reciba ningún rango.
- **Y se DICE.** Que el saldo no cambie al filtrar se lee como que el filtro no
  funciona; el aviso vive en el espejo (`AVISO_SALDO`), no suelto en el JSX,
  porque es una afirmación sobre cómo se comporta el módulo, no una etiqueta.
- **El valor por defecto es `todo`, NO «hoy».** Con «hoy» la Bóveda abriría casi
  siempre en cero —los aportes de un club no son diarios— y se leería como un
  módulo roto. `todo` es además lo que la pantalla muestra desde siempre: el
  filtro es ADITIVO y quien no toque nada ve lo de antes.
- **NO se llama «campaña», y no es un detalle de nombre.** Un aporte puede venir
  de una campaña, de un PROYECTO, de un BLOQUE de la página de aportes o del
  club a secas. Un filtro que sólo listara campañas haría desaparecer del
  listado a todos los demás sin que nadie supiera por qué. Hay
  `DESTINO_SIN_DECLARAR` para los anteriores a v4.844: existen y tienen que
  poder filtrarse como grupo.
- **El catálogo de destinos sale de los aportes REALES**, no de una lista de
  campañas, y se arma ANTES de filtrar — si saliera de los filtrados, elegir un
  destino haría desaparecer del desplegable a todos los demás y no habría forma
  de volver. Lo comprueba una prueba mirando el orden en el archivo.
- **El destino se agrupa con `originOf`**, el mismo criterio con que se rotula
  la ficha del aportante y el recibo. Un segundo criterio de origen daría dos
  verdades sobre el mismo aporte.
- **Se DICE cuántos aportes dejó fuera el filtro** (`excluidos`). Sin ese
  número, quien filtra no distingue «este período no tuvo aportes» de «el filtro
  se comió algo». Y el vacío CON filtro dice algo distinto que el vacío sin
  filtro, con la salida a mano.
- **Una fila sin fecha legible se INCLUYE.** Descartarla haría desaparecer
  dinero de la pantalla por un dato ausente, que es el error que este módulo no
  puede cometer.
- **El último día entra ENTERO** (`finDelDia`). Acotar «del 1 al 15» a las 00:00
  del 15 se come el último día y nadie entiende por qué falta un aporte.
- **Un rango a mano invertido se endereza** —es un error de dedo— y uno sin
  ninguna punta degrada a `todo` en vez de vaciar la lista: ante la duda se
  muestra de más, porque esconder dinero es el lado caro.
- **El período lo resuelve el SERVIDOR y viaja resuelto.** La pantalla no rehace
  la aritmética de fechas: con dos cálculos, el rótulo del selector y las filas
  de la lista podrían discrepar sobre qué días entran. Lo comprueba una prueba
  buscando aritmética de fechas en el `.tsx`.
- **El rango personalizado no pide nada hasta tener sus DOS fechas.** Con una
  sola, el servidor lo degrada a `todo` y el selector diría una cosa y la lista
  otra.
- **Al cambiar un filtro se recarga en SILENCIO.** Con el esqueleto de carga
  completo, cada cambio haría parpadear la pantalla entera — incluida la caja
  del saldo, que ni siquiera se filtra.
- **Los filtros van en su PROPIA línea**, debajo del selector de moneda y no a
  la derecha del título: con cuatro controles en una fila se rompe en un
  portátil.
- **El resumen del período es por MONEDA y nunca se suma entre ellas**, y si esa
  moneda no tuvo nada en el período no se pinta — cuatro ceros no informan.
  Un aporte sin movimiento asociado aporta su bruto y NO sus retenciones: se
  cuenta lo que se sabe y se DICE cuántos quedaron sin medir, en vez de
  inventarles una comisión.
- **Que el filtro LLEGUE a la petición se comprueba en un navegador.** Una
  dependencia que falta en un `useCallback` no la ve el typecheck: es la lección
  de `conQr` (v4.836) y `profileId` (v4.838). El smoke guarda las URLs pedidas.

**Pendiente de los bloques B y C:** exportar a Excel y PDF lo filtrado, y la
varita de análisis. Sobre el PDF, la restricción ya conocida: **Vercel no tiene
ninguna fuente instalada** (medido en v4.794), así que se compone en el
NAVEGADOR, como `designRender.ts` y `qrcode.ts`. Y sobre la varita, la regla del
sitio: los hallazgos los calcula el código con reglas y el modelo sólo los
REDACTA — darle la base a un modelo y pedirle «analizá» produce cifras plausibles
y no auditables, que en un informe financiero descargable es peligroso.

⚠️ **Antes de publicar la exportación conviene cerrar los reversos de los netos
mal calculados** (los aportes anteriores a v4.845, que el libro reproduce mal a
propósito). Un número equivocado en pantalla se corrige y desaparece; uno en un
PDF que alguien archivó, no.

### La Bóveda se exporta: Excel, CSV y PDF (v4.850, bloque B)

Tres botones al final de la línea de filtros. Se exporta LO QUE SE VE.

| Archivo | Qué es |
|---|---|
| `src/lib/walletReport.ts` | El INFORME. **Puro**: filas, totales, contexto y avisos |
| `src/lib/walletExport.ts` | Los tres formatos, todos leyendo ese mismo informe |

Pruebas: `npm run test:wallet:export` (46 casos, **sin base ni red**) y 9
comprobaciones de navegador que **descargan los tres archivos de verdad**.

**Reglas durables:**

- **UN APORTE ANÓNIMO NO LLEVA CORREO AL ARCHIVO.** El correo sigue guardado y
  la pantalla lo tiene, así que se habría colado en un archivo que va a una
  junta o por correo. Un dato que en pantalla es de quien administra el sitio
  deja de serlo en cuanto se descarga.
- **Cada fila declara si su comisión se MIDIÓ o se estimó**, y el archivo avisa
  cuántas son estimadas. Es lo que hace que el informe se pueda usar para
  cuadrar mientras existan aportes anteriores a v4.845 con el neto aproximado.
- **UN INFORME ES DE UNA MONEDA.** Uno «de todas» exigiría un total que las
  sume. En un archivo la regla pesa más que en pantalla: la pantalla se
  corrige, un archivo que alguien archivó, no.
- **Los tres formatos leen el MISMO informe.** Escribir cada uno por su cuenta
  daría tres verdades sobre el mismo período — es la razón por la que
  `buildPiece` es único en las Infografías de Campaña.
- **Se compone en el NAVEGADOR.** Vercel no tiene ninguna fuente instalada y
  componer texto en el servidor saca cuadritos (medido en v4.794). `jspdf` y
  `xlsx` ya eran dependencias y se importan de forma PEREZOSA: quien entra a
  mirar su saldo no las descarga. **No mover esto al servidor.**
- **El CSV lleva BOM y separador PUNTO Y COMA.** Sin BOM Excel abre los acentos
  como «RodrÃ­go»; con coma mete toda la fila en una sola columna, porque en
  configuración regional española el separador de lista es el punto y coma. Un
  CSV que Excel abre mal es un CSV que nadie usa. Y todo texto se cita: un
  nombre con coma partiría la fila y correría el resto.
- **Los importes van como NÚMERO en el Excel**, no como texto con su símbolo:
  una hoja en la que no se puede sumar una columna no sirve para lo que se pide
  una hoja.
- **El contexto va DENTRO del archivo** —sitio, moneda, período con sus fechas,
  destino, emisión y totales—, no sólo en el nombre. Y los avisos también: quien
  lo abra dentro de seis meses no tiene la pantalla delante.
- **El saldo del archivo va rotulado «actual»**, aparte de los totales del
  período. Sin esa etiqueta se leería como si el filtro lo hubiera calculado —
  misma regla que el aviso de la pantalla.
- **El PDF va en HORIZONTAL y deja fuera dos columnas** (`Base` y `Referencia`,
  que sí van en el Excel, que es donde se audita): en vertical las doce columnas
  obligan a una letra que no se lee en un teléfono, que es donde se mira.
- **Los botones sólo salen si hay algo que exportar**, y cada uno dice DE QUÉ
  MONEDA es: tres botones que sólo dijeran «Excel», «CSV» y «PDF» no distinguen
  los dos archivos que esta pantalla puede emitir.
- **La prueba DESCARGA los tres archivos**, no comprueba que el botón exista.
  Las librerías se importan de forma perezosa y sólo se resuelven al pulsarlo:
  el arnés las marcaba como externas y la exportación moría con «Failed to
  resolve module specifier» — una prueba que no puede fallar donde el código
  falla no prueba nada.

**⚠️ `movementOf` NO usa los nombres de la columna de la base**, y van TRES
tropiezos con esto en dos versiones: la retención viaja como `applicationFee` y
el neto como `amount`, mientras la tabla los llama `applicationFee` y
`netAmount`. Leerlos con el nombre de la columna **no da error**: da `undefined`,
que cae a cero, y una columna entera sale en cero pareciendo un dato. Pasó en el
resumen del período, en la base de la comisión y en la fila del informe. Al leer
un movimiento, mirar `movementOf` — no la tabla.

**Y por eso el resumen del período se movió a `walletFilters.js`**: en el
controlador no se podía probar —importa la base— y ahí se coló el primero de los
tres.

### Los filtros y las descargas comparten línea con el saldo (v4.851)

Pedido expreso del equipo: período → campaña → Excel · CSV · PDF, todo en la
MISMA línea de los chips de moneda y alineado a la derecha (`ml-auto` dentro de
un `flex flex-wrap`).

- **La v4.850 los separaba en dos líneas por miedo a que no cupieran**, y el
  miedo era razonable. El ajuste no lo ignora: la fila ENVUELVE, así que en
  pantalla ancha va todo en una línea y al estrecharse el grupo de la derecha
  baja solo — que es exactamente la disposición anterior. Medido con el CSS
  compilado: fila 1132 px, chips 256, grupo derecho 788.
- **El filtro de campaña se muestra con UNA sola**, invirtiendo a propósito la
  regla del sitio «un control que no controla nada». El motivo que aquella regla
  no contemplaba: acá el desplegable no sólo filtra, NOMBRA de qué campaña vino
  el dinero, y eso el administrador lo quiere ver sin abrir ninguna ficha.

**⚠️ EL ARNÉS DE NAVEGADOR NO CARGABA NINGÚN CSS**, y eso invalidaba toda
comprobación de disposición: la página se montaba con `display: block` en todo,
las clases estaban en el DOM y las reglas no existían. Las primeras medidas de
esta versión daban los dos grupos a 1484 px —el ancho del contenedor— porque
eran bloques, no elementos flex. Es la lección de v4.719 —una clase que no llega
al CSS no existe, en silencio— aplicada al propio arnés. Ahora se inyecta
`dist/assets/index-*.css` y las medidas son reales; sin `dist/` se salta ese
bloque y el resto de la prueba sigue valiendo. **Al comprobar disposición en una
prueba de navegador, verificar primero que el CSS esté cargado** — si no, pasa
por los motivos equivocados.

**Pendiente del bloque C:** la varita de análisis. La regla del sitio ya está
decidida: los hallazgos los calcula el CÓDIGO con reglas, cada uno con su
evidencia, y el modelo sólo los REDACTA. `descargarPDF` ya acepta ese texto y lo
pinta DEBAJO de las cifras — lo que manda es el dato.

### La Bóveda Central: todos los sitios, sin mezclar (v4.853, Fase 1)

El Administrador Central abre en una vista consolidada de la plataforma; el
administrador de un sitio sigue viendo exactamente lo de siempre.

| Archivo | Qué es |
|---|---|
| `server/lib/centralWallet.js` | El CRITERIO. **Puro**: fila por sitio y moneda, consolidación, take rate y ticket promedio |
| `getCentralOverview` en `payoutController.js` | Dos consultas agregadas sobre `Payment` y `PayoutRequest` |
| `src/components/admin/CentralVault.tsx` | La vista consolidada, de sólo lectura |
| `GET /api/payouts/admin/overview` | Del OPERADOR de la plataforma |

Pruebas: `npm run test:wallet:central` (32 casos, **sin base ni red**) y
`npm run test:wallet:central:ui` (13, navegador con la API interceptada).

**Reglas durables:**

- **CONSOLIDAR NO ES MEZCLAR, y son DOS ejes que no se cruzan.** El primero es la
  MONEDA: una tarjeta por moneda y ninguna cifra que sume COP con USD — la regla
  del módulo desde v4.841, agravada acá porque el error se multiplicaría por la
  cantidad de sitios alojados. El segundo es el SITIO: un total consolidado es
  legítimo —«¿cuánto movió la plataforma este mes?» es una pregunta real— pero
  **no sustituye al detalle**, y toda fila conserva su `clubId`. Las dos
  preguntas son distintas y ninguna reemplaza a la otra: lo del Distrito 4281 es
  del Distrito 4281, no de un fondo común.
- **LA BÓVEDA LOCAL NO SE TOCA.** Es la exigencia expresa del pedido y por eso
  `computeBalances` sigue acotado a un club y una prueba lo comprueba sobre el
  archivo. Lo central AGREGA una vista; no cambia una línea de cómo cada sitio
  calcula lo suyo ni de cómo se piden los retiros.
- **La comisión del procesador se DERIVA** (`bruto − plataforma − neto`), igual
  que en el libro mayor y por el mismo motivo: aceptarla de fuera permitiría un
  desglose que cuadra porque alguien mandó el número que hacía falta. Y las dos
  retenciones son DOS campos, no uno: fundirlas haría imposible contestar
  «¿cuánto monetiza Club Platform?», que es justamente la pregunta que esta
  pantalla existe para responder.
- **El disponible usa el MISMO criterio que la Bóveda local** (`neto − retirado`,
  acotado en cero dentro de SU moneda). Un segundo criterio daría dos cifras
  distintas para el mismo club en dos pantallas de la misma plataforma.
- **DOS CONSULTAS AGREGADAS, NO UNA POR SITIO.** Los aportes se agrupan en la
  base con `GROUP BY p."clubId", p.currency` y los retiros con `GROUP BY
  "clubId", currency`. Trayendo las filas y sumándolas fuera, la central sería
  inusable con el segundo cliente grande — es el punto de escalabilidad del
  pedido. Una prueba comprueba sobre el archivo que no haya `await db.query`
  dentro de un bucle.
- **⚠️ Los dos modos se deciden por ROL, no por si hay sitio.** La forma
  aparentemente natural —«sin club, vista central»— **no funciona**: el operador
  entra por el dominio de la plataforma y `by-domain` le devuelve el sitio
  «Origen», así que «no hay club» nunca es cierto para él. `esOperador` decide
  el modo y `sitioElegido` lo abandona; todas las consultas de la pantalla usan
  `clubIdActivo`, no `club?.id`.
- **`null` es «no se sabe», NO «cero por ciento».** Sin bruto, el take rate no es
  0 %: es que no hubo nada que cobrar. Misma regla que el costo sin tarifa
  configurada en el panel de auditoría del Creador de Reels — un cero es una
  afirmación, un hueco es la verdad.
- **Por defecto sólo se listan los sitios que recaudaron**, y se dice cuántos son
  de cuántos. Sin ese filtro la tabla lista cientos de sitios en cero y el que
  importa se pierde entre ellos; sin el recuento, quien filtra no sabe qué dejó
  fuera.
- **Un retiro en una moneda sin aportes se REPORTA, no se resta contra otra.**
  Hasta v4.840 `PayoutRequest.currency` no se escribía y toda fila vieja quedó en
  USD por omisión: adivinar cuál era es adivinar cuánto dinero salió. Mismo
  criterio que la carga hacia atrás del libro.
- **El redondeo se hace UNA vez al final, no por fila.** Acumular redondeos corre
  el total en los céntimos, y acá se acumulan tantos como sitios haya.
- **La fuente se DECLARA** (`fuente: 'payments'`) y está escrito por qué todavía
  no lee del libro mayor: el libro está en sombra y su carga hacia atrás no se ha
  corrido en producción. Cuando el informe de conciliación cuadre, se cambia acá
  —en un solo sitio— y la pantalla podrá decirlo sin que nadie lo adivine.

**Lo que sigue:** los reversos de los netos mal calculados (aportes anteriores a
v4.845, que el libro reproduce mal a propósito), el `campaignId` en el libro, y
el cambio de fuente de los saldos —**sólo cuando el informe cuadre**—.

### La tarifa vive en un solo sitio (v4.854, Fase 2)

El 5 % que retiene la plataforma estaba escrito a mano en **cinco** sitios. Ahora
es un criterio puro, configurable desde el panel por moneda y por sitio.

| Archivo | Qué es |
|---|---|
| `server/lib/feeRules.js` | El CRITERIO. **Puro**: cascada, cálculo, validación y cómo se explica |
| `server/lib/feeRulesStore.js` | La I/O: `PlatformConfig`, caché e invalidación |
| `src/components/admin/FeeRulesPanel.tsx` | El panel, dentro de la Bóveda Central |
| `GET`/`PUT /api/payouts/admin/fee-rules` | Del operador de la plataforma |

Pruebas: `npm run test:fee-rules` (58 casos, **sin base ni red**) más 9 de
navegador dentro de `test:wallet:central:ui`.

**Reglas durables:**

- **DESPLEGAR ESTO NO CAMBIÓ NINGUNA CIFRA**, y es la comprobación que lo
  autoriza: `DEFAULT_RULES` reproduce exactamente lo que había, **incluido el
  estimado escrito para dólares y aplicado a toda moneda**. Se corrigió la
  duplicación, no la tarifa.
- **⚠️ SINCRONIZAR NO PUEDE APLICAR LA TARIFA DE HOY A UN COBRO DE AYER.**
  `syncPaymentsWithStripe` recalculaba `totalAmount * PLATFORM_FEE_PERCENTAGE`, y
  con la tarifa escrita a mano daba siempre lo mismo, así que el defecto era
  invisible. En cuanto la tarifa se puede cambiar desde el panel, recalcular es
  **reescribir la historia financiera de un cobro que ya ocurrió** — lo que el
  rediseño prohíbe expresamente. Ahora se usa `payment.applicationFee`, y sólo se
  calcula cuando falta. Al agregar un cálculo sobre un pago existente,
  preguntarse si el dato ya está guardado.
- **No hace falta una columna nueva en `Payment`, y no se agregó.** El importe
  retenido ya se guarda, así que la tasa se reconstruye dividiendo y la historia
  está preservada por construcción. Una columna en un modelo de Prisma que
  todavía no existe en la base deja en 500 toda consulta que lo toque —la regla
  de `logo_intl` (v4.699)— y acá caería sobre el cobro.
- **La cascada va de lo particular a lo general**: acuerdo del SITIO → tarifa de
  la MONEDA → general. Y **`0` es una tarifa válida**: con `||` en vez de una
  comprobación de nulo, un club exento se leería como «no configurado» y volvería
  a pagar el 5 %.
- **`source` dice de dónde salió cada mitad.** Sin él, «¿por qué a este club se
  le retuvo el 2 %?» no se puede contestar dos semanas después — el mismo vacío
  que el CRM tenía antes de `CrmWebhookEvent`.
- **⚠️ El estimado del procesador era `(total * 0.029) + 0.30` PARA TODA
  MONEDA.** El 0,30 es el componente fijo en DÓLARES de la tarifa de Stripe,
  aplicado tal cual a un cobro en pesos. **No se inventó** la tarifa real de
  Stripe en Colombia —es un dato que hay que mirar en su panel, y la regla del
  sitio prohíbe fabricarlo—: se conserva el valor heredado, se AVISA en la
  pantalla y ya se puede configurar por moneda.
- **La comisión se REDONDEA a la unidad de su moneda** y se acota al bruto. Sin
  redondeo, la de un cobro en pesos salía con decimales que el peso no tiene —el
  defecto de `roundMoney(8.915)` por la otra punta—; sin el tope, una tarifa fija
  mayor que el aporte daría un neto negativo.
- **El operador escribe, el CÓDIGO decide.** Escribir «5» queriendo decir 5 % se
  RECHAZA con su motivo en vez de interpretarse: adivinar ahí es quedarse con el
  500 % de un aporte. Y los errores se devuelven TODOS —«configuración inválida»
  a secas obliga a probar campo por campo—.
- **Los avisos NO bloquean.** Tratarlos como errores convierte cualquier
  observación en un bloqueo y se dejan de leer. Y se recalculan **al leer**, no
  sólo al guardar: una configuración que se dejó a medias hace meses tiene que
  seguir diciéndolo.
- **El catálogo de reglas es CERRADO** (`SCOPES`). Sin esa puerta podría aparecer
  una tercera retención que nadie sabe de dónde salió.
- **Un guardado parcial no deja la plataforma sin tarifa** (`mergeRules`). Misma
  regla aditiva que `putAuto` con las traducciones.
- **Leer la tarifa NUNCA lanza y va cacheada.** Esto corre en el camino del
  cobro: una configuración ilegible degrada a la vigente —que es lo que había
  antes— en vez de tumbar un pago, y sin caché cada aporte pagaría un viaje a la
  base para leer un número que cambia una vez al año. Toda escritura invalida.
- **El panel vive DENTRO de la Bóveda Central**, no en una pantalla propia: la
  tarifa es lo que explica el take rate que se está mirando justo encima. Nace
  plegado —se toca una vez al año— pero **su cabecera dice la tarifa vigente y
  cuántos avisos hay**: plegar no puede esconder un problema (v4.826).
- **El panel dice ANTES de que se toque nada que el cambio no reescribe los
  cobros anteriores.** Es la pregunta que se hace quien va a mover una tarifa, y
  sin respuesta a la vista no la mueve.
- **El porcentaje se guarda en tanto por uno y se ESCRIBE en por ciento.** Nadie
  teclea «0.05» pensando en una comisión. La conversión vive en un solo sitio y
  una prueba de navegador comprueba que lo que SALE hacia el servidor sea `0.03`
  y no `3` — una dependencia que falta o una conversión olvidada no las ve el
  typecheck (la lección de `conQr` y `profileId`).

### Cuánto comisiona la plataforma en las INSCRIPCIONES (v4.984)

La Bóveda Central medía lo retenido en los aportes y no había forma de
contestar «¿cuánto hemos comisionado en la Feria?». Criterio puro en
`registrationRevenue.js`, endpoint `GET /admin/registration-revenue` (operador)
y panel `RegistrationRevenuePanel.tsx` dentro de la Bóveda Central, junto al
editor del recargo que lo produce. Pruebas: `npm run test:registration-revenue`
(36 casos, **sin base, credenciales ni red**), verificadas a la inversa.

- **⚠️ ES LA PREGUNTA CONTRARIA A LA DE LA BÓVEDA Y NUNCA SE SUMA CON ELLA.**
  En los aportes la comisión se **descuenta** del receptor y vive en
  `Payment.applicationFee` —eso es lo que ya suman las tarjetas de arriba—; en
  las inscripciones se **suma** a quien paga (v4.980), así que el dinero no sale
  de lo recaudado por el sitio sino de encima del precio publicado. Una sola
  cifra contaría dos cosas distintas como si fueran la misma. Por eso es una
  sección aparte y un endpoint aparte.
- **⚠️ NO TODO EL RECARGO ES INGRESO** (`LINE_MEANING`). `transfer` es lo que la
  plataforma monetiza; `gateway` se cobra para CUBRIR lo que se lleva el
  procesador. Presentarlos juntos diría que se gana casi el 5 % cuando la mitad
  se va a Stripe. El catálogo es CERRADO: una línea que no esté ahí **no se
  cuenta como ingreso** —ante la duda no es nuestro— y se DICE
  (`lineasDesconocidas`). Al agregar una línea a `SURCHARGE_LINES`, clasificarla
  aquí; lo fija una prueba (`unclassifiedLineKeys`).
- **⚠️ EL DESGLOSE DE LA FERIA SÓLO SOBREVIVÍA CON `cfg.clubId` CONFIGURADO, que
  es `null` por defecto.** Se escribía dentro de `Payment.rawPayload`, y esa
  fila sólo se crea cuando el administrador asoció un club a la feria: sin eso
  la **única copia estaba en la metadata de Stripe** y la pregunta no se podía
  contestar desde la plataforma. Ahora va siempre en
  `ProjectFairSubmission.metadata.payment.surcharge` —JSONB que ya existía, sin
  columna nueva—, que es lo que `EventRegistrationPayment.payload` ya hacía en
  el registro de asistentes. **La traza tiene que ser NUESTRA, no del
  proveedor.**
- **UN SOLO LECTOR DEL DESGLOSE, en cada punta.** `surchargeFromMetadata` en la
  Feria (lo consumen la inscripción y el `Payment`) y `parseSurchargeLines` en
  el criterio, que entiende las DOS formas en que se guarda —objeto en la Feria,
  la cadena `"gateway:11600,transfer:8400"` de la metadata de Stripe en el
  evento—. Con un lector por punta, el día que se agregue una línea una se queda
  sin ella y el fallo es MUDO: el total sigue cuadrando y la línea nueva no
  aparece.
- **⚠️ SIN DESGLOSE NO SE REPARTE NADA, aunque se sepa el total.** Atribuirle el
  2,1 % con la tarifa de HOY sería inventar justo el dato que se vino a medir:
  la tarifa es configurable y pudo ser otra el día del cobro. Los cobros
  anteriores a v4.984 se **cuentan aparte** (`sinDesglose`) y se dicen en la
  pantalla — presentarlos como cero sería una afirmación falsa; un hueco es la
  verdad (regla del panel de auditoría del Creador de Reels). El total sí se
  conserva: ése es una medida.
- **El total del DESGLOSE manda sobre el declarado.** Es la suma de lo que de
  verdad se cobró línea por línea; el `surchargeAmount` de la metadata es una
  copia que puede quedarse atrás.
- **Por MONEDA y nunca entre ellas**, como todo el módulo financiero desde
  v4.841. Y el redondeo se hace UNA vez al final, no por cobro: acumular
  redondeos corre el total en los céntimos y aquí se acumulan tantos como cobros
  haya.
- **⚠️ EL JSON SE FILTRA AMPLIO Y SE LEE EN JS.** Castear a `jsonb` una columna
  de TEXTO estalla con una sola fila mal formada, y Postgres no garantiza que el
  filtro que protege el casteo se evalúe antes que el casteo — mismo patrón que
  el reenvío de la Bóveda. Lo fija una prueba que busca `::jsonb` en el
  controlador.
- **Las dos consultas DEGRADAN a `[]`.** Si una de las dos tablas todavía no
  existe, el panel muestra lo que sí se pudo leer en vez de responder 500.
- **Un flujo no declarado cae en «otro», no se descarta**, y un registro sin
  moneda no entra: no se le puede asignar ninguna sin adivinarla.
- **⚠️ UNA COMPROBACIÓN QUE FIJA LA FORMA LITERAL SE ROMPE AL REFACTORIZAR.** La
  de v4.980 exigía `surcharge: totalRecargo > 0 ? {` y falló al unificar el
  lector, con el criterio intacto. Se reescribió sobre la INVARIANTE —que el
  `Payment` guarde el desglose y que lo arme el mismo lector— y no sobre la
  sintaxis. Igual pasó con la de este módulo: pedía cero coincidencias de
  `md.surchargeLines` cuando el único lector legítimo usa esa misma forma; se
  cuentan los LECTORES, no la forma de leer.

**Pendiente conocido:** el recargo **sigue sin asentarse en el libro mayor**
—es el pendiente declarado de v4.980— y por eso este panel lee directo de
`ProjectFairSubmission` y `EventRegistrationPayment` en vez de pasar por la
Bóveda. Y **no hay reconstrucción de los cobros anteriores**: su desglose vive
en la metadata de Stripe y traerlo exigiría una pasada contra el proveedor;
mientras tanto se cuentan aparte y se dicen, que es la vía honesta.

### Corregir la retención de un aporte ya registrado (v4.861)

`server/lib/feeRecalc.js` (**puro**) + `POST /admin/fee-rules/recalculate`.
Pruebas: `npm run test:fee-recalc` (42 casos) y la sección 6b de
`test:fee-rules:route`, que ejercita el camino real.

- **⚠️ ESTO NO CONTRADICE LA REGLA DE v4.854; LA COMPLEMENTA.** Aquélla prohíbe
  que sincronizar RECALCULE —un cálculo que se dispara como efecto secundario de
  otra operación reescribe la contabilidad sin que nadie lo decida— y sigue
  intacta: una prueba comprueba sobre el archivo que `syncPaymentsWithStripe`
  siga usando la retención guardada. Lo que se agrega es la vía DELIBERADA que
  la propia especificación del rediseño pide («si se necesita corregir, crear un
  *adjustment entry*; no sobrescribir historia financiera»). Lo que separa una
  corrección de una reescritura son tres cosas: la pide una persona, queda
  registrada, y tiene un límite demostrable.
- **EL LÍMITE ES «TODAVÍA NO SE PUEDE RETIRAR», y el motivo es que es lo único
  DEMOSTRABLE.** No hay vínculo por fila entre un `Payment` y el retiro que se lo
  llevó —`PayoutRequest` es por club y por importe—, así que «¿este aporte ya se
  giró?» no se puede contestar. Lo contrario sí: con `clubAvailableOn` en el
  futuro, no puede haber salido en ningún retiro. Sin fecha NO se toca: ante la
  duda, no se corrige.
- **El límite va en el WHERE y OTRA VEZ en el UPDATE.** Entre leer y escribir
  puede pasar el tiempo, y el candado sobre `applicationFee` hace que dos vueltas
  simultáneas no se pisen — mismo criterio que `ingestScene`.
- **LA COMISIÓN DEL PROCESADOR NO SE TOCA.** No es nuestra y muchas veces está
  MEDIDA contra el balance transaction de Stripe: recalcularla sería inventar. Se
  deduce de lo guardado (`bruto − neto − plataforma`, lo mismo que hace
  `movementOf` para pintarla) y se vuelve a restar tal cual. **Si se moviera sólo
  la retención sin recalcular el neto, la comisión de Stripe —que es derivada—
  absorbería la diferencia** y la ficha mostraría una comisión de proveedor que
  nunca ocurrió.
- **De ENSAYO por defecto**, como el backfill del libro. Y lo que NO se pudo
  corregir se devuelve agrupado por motivo, con ejemplos: sin eso, «no pasó nada»
  es indistinguible de «no se pudo».
- **La traza es una LISTA** (`feeCorrections` en `rawPayload`): valor anterior,
  nuevo, regla, quién y cuándo. Una segunda corrección no borra la primera. Sin
  ella, «¿por qué éste retiene 2,1 % y aquél 5 %?» no tiene dónde mirarse.
- **Los totales son POR MONEDA**, como en todo el módulo. Acá el error sería
  sobre una corrección de dinero, que es peor.
- **Las pruebas usan los números REALES del reporte** —50.000 COP con comisión
  medida de 3.629, y US$ 10 con 0,59—, no unos inventados para que pasen. Misma
  exigencia que las cifras del sismo en `test:contribution`.

### Lo que la plataforma comisionó, en la barra (v4.863)

El indicador de dinero de la barra superior mide **dos cosas distintas según
dónde se mire**, y por eso cambia de icono y de rótulo.

- **En el sitio de un club es su SALDO** —dinero suyo que va a recibir—. **En el
  panel de Club Platform es la UTILIDAD**: lo retenido por prestar el servicio.
  Hasta v4.862 mostraba «US$ 0,00», el saldo del sitio «Origen», que no recauda
  nada: una cifra que no significaba nada. Dejar los dos con el mismo aspecto y
  el mismo texto sería el defecto que esta reingeniería vino a quitar — dos
  rótulos iguales con dos cifras que significan cosas distintas.
- **⚠️ Se decide por CONTEXTO DE PLATAFORMA (`isUIAdmin`), no por «no hay
  club».** En el dominio de la plataforma `by-domain` devuelve «Origen», así que
  «no hay club» nunca es cierto para el operador — la misma lección que la
  Bóveda Central (v4.853). Un operador que entra por el dominio de un club está
  mirando ESE club y sigue viendo su saldo.
- **Por moneda y nunca sumadas.** Los pesos comisionados no son dólares; acá el
  error sería sobre la utilidad de la empresa.
- **Un administrador de sitio no la ve, y la consulta NI SIQUIERA SE EJECUTA.**
  Esconder en la pantalla un dato que el servidor manda no lo protege: quien
  conoce el endpoint lo ve igual.
- **La cifra es GLOBAL, sin filtro de club.** La pregunta es «¿cuánto ha ganado
  Club Platform?», no «¿cuánto con este sitio?»: con filtro, el número cambiaría
  de significado según por dónde se entre. Lo comprueba una prueba mirando el
  SQL que se ejecutó.
- **Es `applicationFee`, la retención NUESTRA** — no la tarifa de Stripe, que es
  del procesador y no es un ingreso.
- **No se cae al campo suelto `availableFunds`** cuando falta la lista: ese
  respaldo es del SALDO y mostraría el de «Origen» como si fuera lo comisionado.
- Pruebas: `npm run test:platform-revenue` (15 casos, **sin base ni red**),
  sobre el endpoint REAL — el criterio puede estar bien y el defecto vivir en el
  camino (v4.744).
