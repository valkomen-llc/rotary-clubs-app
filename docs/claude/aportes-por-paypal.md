<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Aportes por PayPal — v4.866

Segunda vía de cobro en el modal de aportes, espejo del camino de Stripe.

| Archivo | Qué es |
|---|---|
| `server/lib/paypalSpec.js` | El CRITERIO. **Puro**: moneda, formato del importe, lectura de la captura, disponibilidad |
| `server/lib/paypalService.js` | La I/O: token OAuth cacheado, crear pedido, capturar, verificar la firma del webhook |
| `server/controllers/paypalController.js` | Disponibilidad, creación, captura y webhook |
| `src/pages/DonacionPaypal.tsx` | El retorno del donante, donde se COBRA |

Pruebas: `npm run test:paypal` (43 casos, **sin base, credenciales ni red**).

**Reglas durables:**

- **EL DINERO ENTRA A LA CUENTA DE LA PLATAFORMA** (`isPlatformCollection: true`),
  igual que con Stripe. Es la decisión del cliente y es lo que hace que todo lo
  demás siga funcionando: la retención se aplica igual, el saldo de la Bóveda
  sigue siendo la verdad y el club retira por donde retira hoy.
  `PaymentProviderConfig` modela una cuenta de PayPal POR CLUB desde hace
  versiones y **no se usa**: con el dinero entrando directo al club, el 2,1 % no
  se podría retener y el saldo de la Bóveda dejaría de ser real. Queda declarado
  y sin implementar, que es distinto de olvidado.
- **⚠️ NO SE INVENTA UNA TASA — pero convertir A LA VISTA sí se puede**
  (v4.870, supera la forma de esta regla, no su fondo). Hasta v4.869 acá no se
  convertía nunca y el botón no se mostraba. El motivo era bueno —«el visitante
  ya vio una cifra concreta»— y la consecuencia, inaceptable: **PayPal no
  procesa pesos colombianos**, así que en el sitio de un distrito colombiano el
  botón no aparecía JAMÁS, que es donde vive la mayoría de los aportes. La regla
  real del sitio nunca fue «no se convierte»: es la del `fx` de las
  inscripciones a eventos —`currency` es lo que se PUBLICA,
  `settlementCurrency` lo que COBRA la pasarela, y si difieren se convierte con
  una tasa **configurada** guardando los TRES datos—. **Sin tasa configurada no
  se convierte y el botón no se muestra**: eso no cambió.
  **`PAYPAL_CURRENCY` vacía significa «la que venga»** y es el valor por
  defecto — así se comporta como Stripe.
- **La comisión viene MEDIDA en la captura** (`seller_receivable_breakdown`), no
  estimada; la Bóveda ya distingue las dos desde v4.850. **Si viniera en otra
  moneda NO se resta**: restar una moneda de otra es el defecto que costó la
  v4.845 con Stripe. Y `null` es «no se sabe», no cero.
- **LA CONFIRMACIÓN LA DA EL WEBHOOK, no el retorno del navegador.** PayPal
  separa aprobar de cobrar, así que hay una pantalla que dispara la captura —
  pero el donante puede cerrar la pestaña. Las dos vías convergen en
  `registrarAporte`, que es idempotente: la protección es el índice único
  `(provider, providerRef)`, que ya distinguía proveedores, más el
  `PayPal-Request-Id` del lado de PayPal. Son dos barreras y las dos hacen falta.
- **LA INTENCIÓN SE GUARDA ANTES de mandar al donante a PayPal.** PayPal no
  acepta metadata arbitraria como Stripe: `custom_id` es UN campo de 127
  caracteres donde no entran la campaña, el bloque, el proyecto, el nombre y el
  mensaje. Sin esa fila `pending`, al volver no se sabría a qué campaña atribuir
  el aporte ni a nombre de quién emitir el recibo.
- **Campaña, bloque y moneda se IMPORTAN de `financialController`**, no se
  copian. Dos criterios sobre el mismo aporte dirían cosas distintas según por
  dónde entró — el problema que `sendCampaign` arrastra en el CRM.
- **La retención sale de `feeRules`**, sin porcentaje escrito acá. Un segundo
  número es cómo se llega a que dos vías retengan distinto por el mismo concepto
  (la lección de v4.854).
- **PayPal NO tiene tránsito del proveedor.** Al capturar, el dinero ya está en
  el saldo: `availableOn` es el momento de la captura y sólo corre el margen
  operativo de la plataforma, **el mismo que con Stripe**. Dos aportes del mismo
  día no pueden tener reglas de disponibilidad distintas según por dónde
  entraron.
- **Las columnas se siguen llamando `stripe*` y se usan igual.** Renombrarlas
  toca Prisma y es el riesgo de despliegue de `logo_intl` (v4.699). Guardan el
  estado y la fecha que `bucketOf` lee.
- **`verifyPaypalWebhook` devuelve `null` cuando no se puede comprobar**, que es
  DISTINTO de `false`. Decir «firma inválida» sin haberla verificado manda a
  buscar un problema de seguridad inexistente — la regla que el CRM dejó escrita.
- **SANDBOX es el valor por defecto** (`PAYPAL_ENV=live` para producción): una
  variable mal escrita deja los cobros en pruebas, no en producción por
  descuido. Y sin credenciales el botón no se pinta (v4.650).
- **El estado del modal guarda QUÉ vía se está usando**, no un booleano: con dos
  botones, `true` no dice cuál girar y los dos quedarían en «Conectando…».

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Credenciales de la cuenta de la plataforma. Sin las dos, el botón no aparece |
| `PAYPAL_ENV` | `live` para producción. Cualquier otra cosa —incluido vacío— es sandbox |
| `PAYPAL_WEBHOOK_ID` | Verifica la firma del webhook. Sin él la firma queda «sin comprobar», que no es «inválida» |
| `PAYPAL_CURRENCY` | La moneda que la cuenta puede recibir. **Vacía = la que venga** |

### Cobrar en una moneda y publicar en otra — v4.870

Pedido literal: *«está bien que mapeen pesos colombianos para los rotarios de
acá, pero cuando vaya a pagar a través de PayPal que lo convierta
automáticamente a dólares; es muy importante que aparezca el botón de PayPal»*.

| Archivo | Qué es |
|---|---|
| `server/lib/fxRates.js` | El CRITERIO. **Puro**: llave del par, conversión, edad de la tasa y validación |
| `src/lib/fxRates.ts` | Espejo MÍNIMO: convertir con una tasa ya conocida, para poder DECIRLO |
| `server/lib/fxRatesStore.js` | La I/O: `PlatformConfig`, caché, y la mezcla con la TRM automática de `trm.js` |
| `resolvePaypalCharge` en `paypalSpec.js` | Qué se le va a cobrar a ESTE visitante |
| `src/components/admin/FxRatesPanel.tsx` | El editor, dentro de Métodos de pago |

Pruebas: `npm run test:fx` (80 casos, **sin base, credenciales ni red**;
incluye la paridad de los dos espejos y se salta ese bloque si falta `esbuild`).

**Reglas durables:**

- **⚠️ LA CONVERSIÓN SE DICE ANTES DE COBRAR.** Es la mitad que la hace
  legítima y lo único que separa esto de lo que la regla anterior prohibía:
  quien eligió «$ 100.000» tiene que leer «se te cobrarán US$ 24,80» **antes**
  de salir hacia PayPal. Convertir en SILENCIO sería cambiarle el trato a mitad
  de camino; convertir A LA VISTA es otra cosa. Lo comprueba una prueba sobre el
  archivo del modal.
- **⚠️ NINGUNA CONSULTA A UN TERCERO SIN TOPE DE TIEMPO** (v4.875). `fetch`
  sin `signal` espera lo que el otro extremo quiera, y desde v4.871 la TRM corre
  en el camino de un VISITANTE —al abrir el modal de aportes y al crear el
  pedido—: una fuente lenta es un botón que gira sin fin y tiempo de función
  gastado en no hacer nada. Cada proveedor lleva 3 s y la CADENA un presupuesto
  total, porque seis proveedores suman seis tiempos de espera. La primera
  consulta del día paga la red; las demás salen de la caché en base. Lo comprueba
  una prueba que cuenta las llamadas sin envolver.
- **⚠️ LA TRM SE RESUELVE SOLA, Y NO SE ESCRIBE UNA SEGUNDA CADENA** (v4.871,
  `getEffectiveRates`). `trm.js` ya la resolvía desde v4.846 —Superintendencia
  Financiera vía `datos.gov.co`, cinco respaldos de mercado, caché por fecha y
  consulta histórica— y es la que la Bóveda usa para expresar en pesos la
  comisión que Stripe cobra en dólares. Otra cadena daría dos fuentes que se
  separan en silencio; lo comprueba una prueba sobre el archivo.
- **⚠️ LA AUTOMÁTICA MANDA SOBRE LA ESCRITA A MANO** (`mergeRates`), que es lo
  contrario de la regla habitual del sitio —«la preferencia explícita del
  usuario manda»—. Acá no aplica: **una tasa de cambio no es una preferencia,
  es un hecho que cambia todos los días**, y el fallo característico de la
  manual es quedarse vieja — justo lo que la automática resuelve. La manual
  queda de RESPALDO (la fuente no contesta) y como única vía para un par que la
  TRM no cubre. El orden vive en el criterio PURO y está probado: dentro de la
  capa que habla con la red no se podría, y es la decisión que gobierna cuánto
  se le cobra a alguien.
- **La automática se muestra de SÓLO LECTURA.** Editable invitaría a cambiar un
  número que se vuelve a resolver solo en la consulta siguiente, y el cambio se
  leería como que no se guardó.
- **La TRM es DIARIA y su día es el de BOGOTÁ**, no el del servidor —que corre
  en UTC—. La fuente que se guarda con el aporte dice de qué día es la tasa: sin
  eso no se sabe cuál se usó.
- **La tasa se guarda COMO LA DICE UNA PERSONA**: «4.032 pesos por dólar»
  (`perUnit`), no «0,00025 dólares por peso». Un número con cuatro ceros a la
  derecha de la coma se teclea mal y el error no se ve — y acá el error es
  cuánto se le cobra a alguien.
- **Se guardan los TRES datos** —importe original con su moneda, importe
  cobrado con la suya, y la tasa con su fuente y su fecha—, igual que el `fx`
  de las inscripciones a eventos. Sin los tres, «¿por qué este aporte entró en
  dólares?» no se puede contestar dos semanas después.
- **El aporte se registra en la moneda que SE COBRÓ.** Es lo que de verdad
  entró a la cuenta y lo que la Bóveda tiene que poder cuadrar; el importe en
  pesos viaja como dato del aporte. Consecuencia aceptada: una campaña
  colombiana puede tener aportes en las dos monedas, y la Bóveda ya las
  presenta separadas — nunca sumadas.
- **Un mismo criterio para pintar el botón y para cobrar** (`resolvePaypalCharge`,
  usado por la disponibilidad y por la creación del pedido). Con dos, el modal
  promete una cifra y el cobro sale por otra. Lo comprueba una prueba contando
  las llamadas.
- **El espejo del navegador existe para no pagar un viaje de red por
  pulsación**, y lo que lo hace seguro es que la prueba compara las SALIDAS de
  los dos módulos sobre una matriz de importes y pares, no que se parezcan. Al
  tocar `fxRates.js`, tocar `fxRates.ts`.
- **El redondeo es al de la moneda que SE COBRA**, con los decimales de
  PRESENTACIÓN —no los de la unidad mínima del proveedor—: son las dos nociones
  que `money.js` documenta y COP es justo donde difieren.
- **Un importe que se redondea a CERO se rechaza con su motivo.** No es un cobro
  raro: es una tasa mal escrita, y la pasarela lo rechazaría con un mensaje que
  no explica nada.
- **Una tasa vieja AVISA y sigue valiendo** (`STALE_DAYS`, 45). Dejar de cobrar
  porque nadie actualizó un número sería peor que cobrar con uno de hace dos
  meses. La fuente tampoco es obligatoria y se pide igual: sin ella, «¿de dónde
  salió este 4.032?» no tiene dónde mirarse.
- **El editor vive DENTRO de Métodos de pago**, no en una pantalla propia: la
  conversión existe POR la restricción de un método, y la decisión se toma donde
  ya se está trabajando — las pantallas que se olvidan son siempre las del
  segundo lugar.
- **Leer las tasas NUNCA lanza**: corre en el camino del cobro. Una
  configuración ilegible degrada a «sin tasas», que es no ofrecer PayPal, no
  tumbar el aporte.
- **La MEMBRESÍA sigue sin convertirse** (v4.834): su importe es un PRECIO que
  el club fijó y cobrarlo en otra moneda exige convertirlo. Esto convierte lo
  que se le pide a un donante, no lo que un club puso como precio.

### El formulario de aporte tiene que ENTRAR (v4.872)

Pruebas: `npm run test:donation:ui` (15 casos; pide `playwright` y `esbuild` y
**se salta solo** si faltan, o si no hay `dist/` compilado).

- **⚠️ UN FLEX CENTRADO RECORTA POR ARRIBA.** Con el panel más alto que la
  ventana, el navegador **no** deja desplazarse hacia el margen negativo: se
  pierden la cabecera y la cruz de cerrar, o sea la forma de salir. Se reportó
  al aparecer el segundo botón de pago. Se acota el panel a la ventana
  (`max-h-[calc(100vh-2rem)]`) con desplazamiento PROPIO: en una pantalla normal
  entra entero y no aparece ninguna barra. **No volver a un panel sin tope de
  alto** — el defecto reaparece en cuanto se agregue una línea.
- **Se aprieta el RESPIRO, no el contenido.** No se quitó ningún campo ni
  ninguno de los cuatro datos del aviso de conversión —moneda de cobro, importe
  convertido, importe original y tasa—: quitar la tasa o el original dejaría la
  conversión sin poder comprobarse, que es lo que la hace legítima.
- **Correo y nombre van a la par.** Dos campos cortos apilados cuestan ~62 px
  medidos, que era la fila que dejaba el pie fuera. Con el nombre oculto
  —donación anónima— el correo ocupa el ancho completo en vez de dejar media
  fila vacía.
- **Se MIDE en un navegador y con el CSS compilado.** Sin él la página se monta
  con todo en bloque y las medidas no son las de la maquetación real: la prueba
  pasaría por los motivos equivocados (v4.851). Al agregar una fila al modal,
  correrla.
- **Por debajo de ~750 px de ventana el modal se desplaza**, y está bien: lo que
  no puede pasar es que se recorte. Lo comprueba el caso de 560 px.

**Pendiente conocido:** el reembolso por PayPal no está — hoy sólo se maneja el
de Stripe (v4.859). Y `Checkout.tsx` conserva su selector Stripe/PayPal
**decorativo**: la tienda sigue sin cobrar por ninguna de las dos vías, que es
el pendiente declarado desde v4.808.

### Declarar lo que el servidor MANDA, no lo que uno espera (v4.867)

`/admin/integraciones` quedaba en «Esta pantalla no se pudo mostrar» con
«Cannot read properties of undefined (reading 'toLocaleString')», y por eso **no
se podía llegar a cargar las credenciales**.

- **La pantalla leía CINCO campos que el endpoint no manda**
  —`estimatedTokensInput`, `estimatedTokensOutput`, `estimatedCostUSD`, `model`
  y `pricingNote`—. Al reescribirse el módulo de traducción en v4.662 —de un
  modelo único a una CADENA de proveedores— esas cifras dejaron de existir, y el
  comentario de `GET /translate/usage` sigue diciendo «compatibilidad con la
  pantalla de Integraciones» sin serlo. **El typecheck no lo ve**: la interfaz
  estaba escrita, y era la equivocada.
- **UN ERROR DE RENDER DESMONTA EL SUBÁRBOL ENTERO.** No se perdía un número: se
  perdía la pantalla, y con ella el acceso a las credenciales. Misma forma que el
  defecto que dejó la Bóveda en blanco en v4.852.
- **Un contador ausente se pinta «—», NO «0».** Un cero es una afirmación —«no
  hubo ninguna»— y un hueco es la verdad. Acá además evita que un dato que falta
  tumbe la pantalla.
- **No se estiman los tokens ni el costo.** DeepL, Google y Azure ni siquiera
  cobran por tokens: afirmar un costo que no se calcula es peor que no
  mostrarlo. Las tres tarjetas rotas se reemplazaron por lo que el servidor SÍ
  manda —caché en memoria, actividad de 30 días, proveedor activo—.
- Pruebas: `npm run test:integrations:ui` (9 casos, navegador con la API
  interceptada usando la RESPUESTA REAL del endpoint). Verificada a la inversa:
  con el código anterior falla con el mismo mensaje del reporte.

### Los métodos de pago se ven y se activan — v4.868

Integraciones abre con «Métodos de pago»: qué vías de cobro existen, si cada una
tiene sus credenciales, y un interruptor para activarla.

| Archivo | Qué es |
|---|---|
| `server/lib/paymentMethods.js` | El CRITERIO. **Puro**: catálogo, estado desde el entorno, validación |
| `server/lib/paymentMethodsStore.js` | La I/O: `PlatformConfig`, caché e invalidación |
| `src/components/admin/PaymentMethodsPanel.tsx` | El panel, dentro de Integraciones |

Pruebas: `npm run test:payment-methods` (36 casos, **sin base ni red**).

**Reglas durables:**

- **CONFIGURADO y ACTIVADO son dos cosas distintas.** Configurado lo dice el
  ENTORNO y no se edita desde el panel; activado lo decide el operador. Un
  método se OFRECE sólo si las dos son ciertas — eso es lo que permite dejar las
  credenciales cargadas y el método todavía apagado mientras se prueba en
  sandbox.
- **⚠️ LAS CREDENCIALES SIGUEN EN LAS VARIABLES DE ENTORNO**, y hay dos motivos
  concretos: un respaldo de la base no se lleva la llave de cobro, y Vercel
  separa las variables por entorno, así que preview puede usar una cuenta de
  pruebas mientras producción usa la real. **Con las credenciales en la base las
  dos ramas leerían la misma fila y una prueba podría cobrar de verdad.** Si
  algún día hace falta guardarlas, `tokenCrypto.js` ya hace AES-256-GCM
  versionado — la pieza difícil está resuelta y sólo falta decidir el riesgo.
- **El panel NUNCA muestra el secreto, ni recortado.** Los últimos cuatro
  caracteres de una llave de cobro no ayudan a diagnosticar nada y sí filtran.
  Sólo dice si está o no está, y **qué variable falta con su nombre exacto**: un
  «no configurado» a secas manda a adivinar.
- **`card` viene ACTIVADO por defecto y todo lo demás apagado.** Es la
  comprobación que autoriza el despliegue: era la única vía de cobro que
  existía, y si naciera apagada, desplegar dejaría a TODA la plataforma sin
  poder recibir aportes.
- **Activar sin credenciales no es un error, pero se DICE.** Se puede dejar
  listo; lo que no puede pasar es que alguien lo encienda y espere un botón que
  no va a aparecer. Y si se apagan todos, se avisa: quedarse sin ninguno no se
  descubre hasta que alguien intenta donar.
- **El interruptor se comprueba EN EL SERVIDOR**, no sólo al pintar el botón —
  en la disponibilidad y otra vez al crear el pedido. Esconder un control en la
  pantalla no protege el endpoint de quien lo conoce.
- **El catálogo es CERRADO.** Un método que no esté declarado no se puede
  activar ni ofrecer, así que no puede aparecer una vía de cobro que nadie
  declaró.
- **Un guardado parcial no apaga nada** (`mergeMethods`), y una configuración
  ilegible degrada a los valores por defecto: esto corre en el camino del cobro.
- **El dinero sigue entrando a la cuenta de la PLATAFORMA en todos los
  métodos.** Esto activa dónde se ofrece cada uno, no a qué cuenta entra.
  `PaymentProviderConfig` modela cuentas por club y sigue sin usarse — con el
  dinero yendo directo al club, la retención no se podría aplicar y el saldo de
  la Bóveda dejaría de ser real.

- **⚠️ «SE ESTÁ OFRECIENDO» NO ES «EN TODOS LOS APORTES»** (v4.869,
  `methodLimits`). Con las credenciales cargadas y el interruptor puesto, la
  insignia se pintaba y el botón **no aparecía en la página**: `PAYPAL_CURRENCY`
  acota PayPal a una sola moneda y el sitio cobra en otra. Se reportó como «ya
  aparece sincronizado pero no aparece el botón». El estado era correcto; la
  afirmación, incompleta — y un estado que afirma de más manda a diagnosticar
  donde no está el problema, que es lo que este panel existe para evitar. Al
  agregar un método cuya disponibilidad dependa de algo más que las
  credenciales, declararlo en `methodLimits`.
- **El límite se pinta SÓLO cuando el método de verdad se ofrece.** Con el
  interruptor apagado, «sólo en USD» explica una restricción de algo que no
  está pasando.
- **Un límite ACOTA dónde se ofrece; NO lo apaga.** `offered` sigue en `true` y
  lo fija una prueba: confundirlos dejaría PayPal desactivado por el solo hecho
  de tener una moneda configurada.
- **El modo de PRUEBAS se avisa.** Sandbox es el valor por defecto a propósito
  —una variable mal escrita deja los cobros en pruebas y no en producción por
  descuido—, pero entonces hay que decirlo: un aporte hecho en sandbox no es
  dinero y eso no se ve mirando el panel.
- **PayPal no procesa pesos colombianos**, y está dicho en el `help` del
  catálogo porque es el hecho del proveedor que más cuesta descubrir. Desde
  v4.870 la consecuencia ya no es que el botón desaparezca: el aporte **se cobra
  convertido** con la tasa configurada, y la conversión **se le dice al
  visitante antes de cobrarle**. Sin tasa para ese par, el botón sigue sin
  aparecer.

### El interruptor gobierna el cobro, no sólo el botón (v4.1057)

Reporte con las dos pantallas: Stripe **DESACTIVADO** en Integraciones y el
modal de «Emergencia Terremoto Colombia 2026» mostrando igual «Donar ahora con
tarjeta de débito o crédito».

| Pieza | Qué es |
|---|---|
| `methodAvailability` · `METHODS_SCOPE` (`paymentMethods.js`) | El CRITERIO. **Puro**: si una vía se ofrece, con su motivo, y qué alcanza el interruptor |
| `cardAvailability` · `cardBlocked` (`financialController.js`) | El ÚNICO punto de decisión del servidor, y el 503 con su código |
| `card` en `GET /financial/currency` | La disponibilidad de la tarjeta, en la ruta que el modal YA consulta |
| `src/hooks/useCardPayment.ts` | El hook COMPARTIDO por las pantallas que cobran con tarjeta fuera del modal |

Pruebas: `npm run test:payment-methods` (97 casos: criterio y cableado leído de
los archivos), `npm run test:payment-methods:path` (19, el CAMINO con la base,
Prisma y Stripe sustituidos) y `npm run test:payment-methods:ui` (13, el modal
REAL en un navegador con el CSS compilado y la API interceptada). **Ninguna
necesita Postgres, credenciales ni red.** Verificadas a la inversa.

- **⚠️ ERA UN INTERRUPTOR MUERTO, Y EL CRITERIO SIEMPRE ESTUVO BIEN.**
  `isMethodOffered` existía desde v4.868 y lo consultaba **sólo**
  `paypalController`: el camino de Stripe —`createDonationCheckout` y
  `createSubscriptionCheckout`— no lo leía en ninguna parte, y el modal pintaba
  el botón de tarjeta **incondicionalmente**. `card` se guardaba, se pintaba en
  el panel y no gobernaba nada. **Una prueba de criterio habría pasado en verde
  con el defecto delante** — es la lección de v4.744 y v4.889, y por eso la
  mitad de `test:payment-methods` LEE LOS ARCHIVOS y existe además la del
  CAMINO. Al agregar un interruptor, contar quién lo LEE, no quién lo escribe.
- **⚠️ UN SOLO PUNTO DE DECISIÓN EN EL SERVIDOR** (`cardAvailability`), y una
  prueba cuenta que `methodAvailability` se llame UNA vez en el controlador.
  Con la comprobación escrita en cada cobro, el tercero se olvida y el fallo es
  MUDO: la pantalla esconde el botón y el endpoint sigue cobrando.
- **LA GUARDIA VA ANTES DE CREAR LA SESIÓN DE STRIPE**, y antes de validar el
  monto y el correo: «¿se puede cobrar así?» no depende de que el formulario
  esté bien escrito, y comprobar después de crear la sesión no protege de nada.
  Lo fija una prueba que compara los índices en el cuerpo del manejador.
- **⚠️ LA DISPONIBILIDAD VIAJA CON LA MONEDA, no en un endpoint nuevo.** El
  modal ya consulta `/financial/currency` SIEMPRE y antes de pintar un solo
  monto, así que no cuesta un viaje de red más por visitante. **Una vía, un
  dueño**: `/currency` es el dueño de `card` y `/paypal/available` el de
  `paypal` —ahí la disponibilidad depende además de la conversión—. Publicar
  las dos en los dos sitios daría dos verdades sobre el mismo botón.
- **`card` AUSENTE ES «NO SE SUPO», NO «APAGADA».** El servidor lo manda
  siempre, incluso cuando la moneda degrada. Sin el dato se ofrece la tarjeta
  —no poder aportar por un fallo de red transitorio es peor— y lo que lo hace
  seguro es que quien decide de verdad es la guardia del servidor. La pantalla
  decide qué se PINTA, nunca qué se puede cobrar.
- **⚠️ EL ALCANCE ES LOS APORTES, Y SE DICE EN EL PANEL** (`METHODS_SCOPE`).
  Hay NUEVE caminos que cobran con Stripe; el interruptor gobierna tres —la
  donación, la membresía de un bloque y PayPal— y **no** las inscripciones a
  eventos, a la Feria, a las capacitaciones, las solicitudes técnicas, los
  dominios ni la tienda: cada uno tiene su precio congelado y su propio flujo,
  ninguno pasa por el modal de aportes, y apagarlos no lo pidió nadie. Es la
  lección de v4.737 —al condicionar algo, preguntarse a cuántos sitios alcanza
  además del que se tenía en mente—. Tres pruebas leen esos controladores y
  fallan si empiezan a depender del interruptor.
- **⚠️ SÓLO LA MEMBRESÍA SE CONDICIONA POR LA TARJETA; EL BOTÓN QUE ABRE EL
  MODAL NO.** La suscripción cobra con Stripe y punto. El pago ÚNICO de un
  bloque abre el modal, que resuelve sus propias vías: esconderlo por la
  tarjeta escondería el aporte con PayPal —que es justo lo que el cliente tiene
  encendido— y sale igual de caro. Es el defecto opuesto y lo fija una prueba.
- **La ficha de un PROYECTO sí se condiciona entera**: su modal es sólo tarjeta
  —va directo a `/financial/donate` y no ofrece PayPal—, así que sin ella no
  queda ninguna vía. El botón no se pinta y se dice por qué.
- **UN HOOK COMPARTIDO** (`useCardPayment`), no la consulta escrita en cada
  pantalla: son tres y la tercera se olvida (la lección de la casilla de
  distritos, v4.748). Reutiliza `/financial/currency` en vez de un endpoint
  propio — un segundo endpoint daría dos verdades sobre el mismo botón.
- **SIN NINGUNA VÍA SE DICE, y sólo cuando las DOS respuestas llegaron.**
  `paypal` en null es «todavía no contestó»: decir «no hay métodos de pago»
  mientras se está preguntando sería un cartel que aparece y desaparece solo.
  No se pintan botones, no se reserva espacio y no se deja avanzar (v4.650).
- **EL PIE NO NOMBRA A UN PROCESADOR QUE NO INTERVIENE.** Decía «procesado por
  Stripe» aunque la tarjeta estuviera apagada: con las vías configurables, eso
  es afirmar de más.
- **SI LA VÍA SE APAGA CON EL MODAL ABIERTO, SE RETIRA EL BOTÓN.** El servidor
  rechaza con `PAYMENT_METHOD_DISABLED` —el MISMO código para las dos vías, o
  una de las dos se quedaría sin manejar— y la pantalla quita el control además
  de decirlo: dejarlo a la vista sería dejar uno que ya no puede funcionar. El
  texto del servidor es para el operador; al visitante se le dice lo que le
  sirve.
- **APAGAR SURTE EFECTO EN EL ACTO.** `savePaymentMethods` invalida la caché de
  60 s, y `/financial/currency` va con `no-store` —su respuesta depende de quién
  pregunta y de un interruptor que cambia: una caché intermedia le serviría a un
  visitante el estado de otro, que es justo lo que haría reaparecer un método
  apagado tras recargar—. Lo fija la sección 5 de la prueba del camino.
- **⚠️ LA CONFIGURACIÓN ES DE LA PLATAFORMA, NO POR SITIO, y eso se conserva.**
  Vive en `PlatformConfig` y así estaba: las credenciales son de la plataforma
  (una cuenta de Stripe, una de PayPal), el dinero entra a su cuenta y de eso
  depende la retención. `PaymentProviderConfig` modela cuentas por club y su
  `enabled` significa OTRA cosa —«este club tiene su propia cuenta de Stripe»,
  y lo consume la TIENDA—: reutilizarlo sería contestar dos preguntas opuestas
  con un solo campo (la forma de v4.1009). **No se inventó un nivel por sitio**
  y el panel dice que la configuración es global, para que nadie la busque por
  sitio.
- **LEER EL INTERRUPTOR NUNCA LANZA.** Corre en el camino del cobro: una
  configuración ilegible degrada a los valores por defecto —la tarjeta
  activada—, que es lo que había antes de que el interruptor existiera.
- **⚠️ QUE EL BOTÓN NO SE PINTE SE MIRA EN UN NAVEGADOR.** El defecto se
  reportó MIRANDO LA PANTALLA, y eso no lo ve ninguna comprobación que lea
  archivos: el criterio puede quedar entero mientras alguien vuelve a pintar el
  botón sin condición, y el fallo es MUDO. Se monta el modal REAL con las
  cuatro combinaciones y se cuentan los botones pintados.
- **⚠️ Y SE ABORTA SI EL MODAL NO SE MONTÓ.** Al escribir esa prueba faltaba
  `LanguageProvider`, React abortaba el árbol, el cuerpo quedaba vacío y «el
  botón de tarjeta NO se pinta» salía **en verde**: una ausencia sobre una
  pantalla en blanco no comprueba nada. Se exige ver el contenido del modal
  antes de afirmar cualquier ausencia.
- **⚠️ EL COMODÍN DE RUTAS DE PLAYWRIGHT VA PRIMERO.** Resuelve la ÚLTIMA ruta
  registrada antes que las anteriores, así que un `'**/api/**'` al final se come
  a las específicas: las dos vías caían a su respaldo —tarjeta ofrecida, PayPal
  no— y la prueba pasaba por los motivos equivocados. Costó una vuelta.

### Probar las credenciales de un método (v4.874)

- **⚠️ «CLIENT AUTHENTICATION FAILED» TIENE DOS CAUSAS y el mensaje del
  proveedor no distingue entre ellas**: las credenciales son del OTRO entorno
  —Sandbox contra el servidor Live, o al revés— o al pegar el secreto se coló un
  espacio. Se reportó tal cual («PayPal rechazó las credenciales: fallo en la
  autenticación del cliente») y sin más datos no hay por dónde empezar.
- **EL ENTORNO ES EL DATO QUE PARTE EL DIAGNÓSTICO EN DOS**, y no estaba en el
  mensaje. Ahora el error lo nombra y `credentialHints` da vuelta las pistas
  según cuál esté activo.
- **Las credenciales se leen con `.trim()`** (`paypalCredentials`). No es
  cosmético: un salto de línea arrastrado al copiar el secreto produce
  exactamente este error, y es la única de las dos causas que se corrige desde
  el código.
- **La prueba es de SÓLO LECTURA**: pide un token, no crea ningún pedido ni
  cobra nada. Y **vacía la caché del token antes de probar** — con el guardado
  se comprobaría la credencial anterior, no la que se acaba de cargar.
- **Qué se puede probar se DECLARA** (`METHOD_TESTABLE`), no se deduce: el botón
  sólo aparece donde de verdad hace algo (v4.650). Al agregar la prueba de otro
  proveedor, agregarlo ahí.
- **El panel NUNCA muestra la credencial**, ni recortada: dice si sirve, en qué
  entorno se probó y qué mirar.

**⚠️ Deuda conocida:** `PaymentProviderConfig.secretRef` guarda el secreto en
TEXTO PLANO (`secretRef: stripeSecretKey`) y `paymentController` lo usa directo
(`new Stripe(config.secretRef)`). Hoy no lo llena ninguna pantalla —el endpoint
existe y nadie lo consume— pero el camino está abierto. Antes de habilitar
cuentas por sitio hay que cifrarlo con `tokenCrypto.js`, como los tokens de
redes sociales.
