<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Notificaciones de Contribuciones — v4.855 (Fase 0: la traza)

Cuando alguien aporta, el recibo sale y **hasta v4.854 no quedaba rastro de
nada**: `EmailService.sendPlatformEmail` —el camino que usa el recibo— no llama
a `logCommunication`, que sólo se invoca desde `sendEmail`, el camino del correo
de club. La respuesta a «¿le llegó la confirmación a este aportante?» vivía en
un `console.log`, efímero en Vercel. Es el mismo vacío que tenía el CRM antes de
`CrmWebhookEvent` (v4.702).

| Archivo | Qué es |
|---|---|
| `server/lib/notificationSpec.js` | El CRITERIO. **Puro**: eventos, estados de entrega, papeles del destinatario, llave de idempotencia, reintentos y el resumen de la ficha |
| `server/lib/ensureNotificationSchema.js` | Crea `NotificationDelivery` en runtime |
| `server/lib/notificationLog.js` | La I/O: reclamar, marcar, aplicar el evento del proveedor y leer |

Pruebas: `npm run test:notifications` (74 casos, **sin base, credenciales ni
red**).

**Reglas durables:**

- **La Fase 0 NO cambia lo que recibe el aportante.** Registra lo que ya se
  envía: mismo asunto, mismo remitente, mismo cuerpo. La identidad
  institucional, los perfiles y las plantillas llegan en las fases siguientes.
- **EL ENVÍO SE RECLAMA ANTES DE MANDARSE, no se anota después.** Es la
  decisión de la que cuelga la no-duplicación: `INSERT ... ON CONFLICT (key)
  DO NOTHING RETURNING *` decide quién manda. Comprobar con un `SELECT` previo
  no sirve —entre la lectura y la escritura caben dos entregas concurrentes del
  mismo webhook, porque Stripe reintenta— y el resultado serían dos correos
  diciéndole a la misma persona que recibimos su aporte. Es el mismo
  razonamiento que sostiene `Payment_provider_providerRef_key` unas líneas
  arriba en el mismo webhook.
- **La llave es `contribución + evento + destinatario`**, con el correo en
  minúsculas y sin espacios. `Ana@Club.org` y `ana@club.org` son la misma
  persona: con dos llaves distintas recibiría el aviso dos veces. Se normaliza
  en `deliveryKey` y en ningún otro sitio — construida distinto en dos lugares,
  el índice único dejaría pasar el duplicado que existe para impedir.
- **El índice único NO es parcial**, y eso es a propósito: las tres columnas de
  la llave son `NOT NULL`, así que no hay predicado que repetir en el
  `ON CONFLICT` — la trampa que costó una corrección en v4.648.
- **Si el registro falla, el recibo SE MANDA IGUAL.** Quedarse sin recibo por
  no poder anotarlo sería cambiar un problema de auditoría por uno de servicio.
  Lo mismo si la tabla todavía no existe: se degrada en silencio.
- **Nada de la bitácora puede lanzar.** Corre dentro del webhook de Stripe,
  después de acreditar el cobro: una excepción tumbaría el `200` que Stripe
  espera y provocaría el reintento de un evento ya procesado. Toda función
  devuelve `{ ok, reason }`; las lecturas degradan a `[]` / `{}`. Mismo criterio
  que `postDonation` y `bumpMetric`.
- **Se sale con una BANDERA, no con un `return`.** Un `return` dentro del bloque
  del recibo saldría de `handleSuccessfulDonationCheckout` entera y dejaría
  fuera cualquier paso que se agregue después.
- **`sent` no es `delivered`, y la diferencia es el diagnóstico.** `sent`
  significa que el proveedor lo aceptó; `delivered`, que el servidor del
  destinatario lo recibió. Cuando alguien dice que no le llegó nada, `sent` sin
  `delivered` señala el camino y no nuestro envío. Por eso el resumen cuenta
  como «le llegó» sólo `delivered` y `opened`.
- **LOS EVENTOS DEL PROVEEDOR LLEGAN DESORDENADOS.** Resend entrega por webhook
  sin garantizar orden: es normal recibir `delivered` DESPUÉS de `opened`,
  porque son dos peticiones HTTP compitiendo. Si el último pisara al anterior,
  una entrega abierta volvería a «Entregado» y se contarían mal las aperturas.
  `mergeDeliveryState` hace que el progreso sólo AVANCE.
- **Un fallo gana, salvo contra la entrega demostrada.** Un rebote después de un
  `sent` es la corrección de lo que creíamos y manda; después de un `opened` es
  una CONTRADICCIÓN —nadie abre un correo que rebotó— y ahí se conserva la
  evidencia más fuerte. Dejar ganar al fallo pintaría de rojo una entrega que el
  destinatario demostró haber leído.
- **Un estado desconocido no cambia nada.** Es dato de un tercero y no se
  inventa una traducción.
- **No se reintenta lo definitivo.** Un rebote duro o un bloqueo no mejoran por
  insistir, y en volumen es lo que arruina la reputación del dominio desde el
  que envía TODA la plataforma. `retryable` lo DECLARA quien registra el fallo,
  no se deduce: ante la duda no se reintenta — un aviso que no sale se ve en la
  ficha y se reenvía a mano; uno que sale cinco veces ya salió.
- **El motivo del proveedor se guarda TEXTUAL**, acotado a 500 caracteres pero
  nunca resumido ni traducido. Convertirlo en «no se pudo enviar» deja a quien
  corrige sin saber si el problema es el dominio, la dirección o la credencial —
  la regla que el CRM aprendió con `metaCode` / `metaDetails`.
- **«Sin registro» NO es «no le llegó».** `sinRegistro` es un tercer estado y se
  dice distinto: confundirlo con un fallo manda a buscar el problema donde no
  está. Misma regla que `unknown` en el CRM.
- **Un evento que no se puede observar se DECLARA como no disponible.** De los
  seis del pedido, hoy sólo `payment_confirmed` tiene fuente real:
  `charge.refunded` no está enrutado a donaciones y
  `payment_intent.payment_failed` no está suscrito. Cada entrada del catálogo
  lleva su `source` y su `available`, como los motores del Generador de
  Publicaciones. Ofrecerlos igual sería una casilla que no hace nada (v4.650).
- **`NotificationDelivery` vive fuera de Prisma** y sin clave foránea a
  `Donation`. Acá pesa más que de costumbre: `Donation` y `Payment` se consultan
  con `findMany` **sin `select`** en media plataforma, así que una columna
  declarada y todavía inexistente dejaría esas consultas en 500 desde el primer
  despliegue — y eso cae sobre el cobro. El vínculo va por `contributionId`
  desde esta tabla, nunca al revés.
- **`contributionId` es `Donation.id`**, que es además la referencia que el
  recibo ya le muestra al aportante.

### Fase 1 — perfiles, beneficiarios y plantillas (v4.856)

| Archivo | Qué es |
|---|---|
| `server/lib/notificationTemplate.js` | El correo: bloques, variables, escapado y render. **Puro** |
| `server/controllers/notificationProfileController.js` | CRUD del operador, resolución, vista previa y envío de prueba |
| `server/routes/notification-profiles.js` | Las rutas, todas del operador |
| `src/pages/admin/ContributionNotifications.tsx` | La pantalla del Administrador Central |

- **La Fase 1 NO manda correos de aportes**, y la pantalla lo DICE. Se
  configura, se previsualiza y se manda una PRUEBA; el recibo real sigue
  saliendo como en v4.855. Un panel que parece gobernar algo que todavía no
  gobierna es peor que uno que no existe — quien lo configure creería que ya
  está al aire.
- **EL ALCANCE DE UN PERFIL SE RESUELVE CON `targetsSite` DE
  `contributionSpec.js`**, no con un criterio propio. Ya trata `Club.district`
  como una LISTA (v4.748) y ya está probado; con dos criterios, un perfil
  podría alcanzar a un sitio que la campaña no alcanza y el correo hablaría de
  una campaña que ese sitio no muestra.
- **La resolución va de lo más específico a lo más general y DEVUELVE EL
  MOTIVO**: la campaña que lo eligió expresamente → el perfil que alcanza al
  sitio (mayor prioridad) → el perfil global → nada, y entonces sale el recibo
  de siempre. El último escalón es deliberado (criterio 19): una contribución
  no se queda sin notificación porque falte una personalización. Y el `reason`
  es lo que contesta «¿por qué este aporte salió firmado así?» dos semanas
  después.
- **Que la campaña apunte a un perfil apagado o borrado NO deja el aporte sin
  aviso**: se sigue bajando por la jerarquía.
- **El desempate es ESTABLE** (prioridad, luego `updatedAt`, luego id). Si
  dependiera del orden en que la base devuelve las filas, el mismo sitio
  firmaría distinto en dos aportes seguidos — la lección de `pickDistrictSite`.
- **La DIRECCIÓN de envío no se declara en el perfil.** Se declara el nombre
  visible y el reply-to; la dirección la resuelve el servidor con el sitio de
  origen (Fase 2). Dejarla escribir a mano permitiría firmar desde un dominio
  ajeno, que es lo que el criterio 23 del pedido prohíbe.
- **El beneficiario NO lleva cuentas bancarias**, y no es un olvido: el dinero
  entra a la cuenta Stripe de la plataforma y se liquida por la Bóveda. Datos
  de recaudo acá serían una segunda verdad sobre a dónde va el dinero, y sería
  falsa.
- **NO se manda todo por defecto** (criterio 12). Un perfil nuevo avisa al
  aportante de su pago confirmado y a nadie más. Y un evento que la plataforma
  todavía no puede observar se DESCARTA aunque venga marcado: encenderlo daría
  una casilla que no dispara nunca.
- **EL CORREO SE COMPONE CON BLOQUES, NUNCA CON HTML LIBRE.** Esto lo edita un
  administrador y se renderiza en el cliente de correo de un tercero: HTML
  arbitrario ahí es una inyección con pasos extra —un `<script>` no corre en
  Gmail, pero un `<a>` a un destino ajeno, un `<img>` que llama a un servidor de
  terceros o un `<style>` que tapa el contenido, sí—. Con bloques el HTML lo
  escribimos nosotros y del administrador sólo entra TEXTO, que se escapa.
  Misma decisión que `MASK_SHAPES` en Plantillas IA.
- **El nombre de un aportante lo escribe un desconocido en un formulario
  público**: es la entrada menos confiable del módulo y pasa por `escapeHtml`
  como todo lo demás.
- **Un color sólo puede ser un hexadecimal de seis** (`hexOrNull`): termina
  dentro de un atributo `style`.
- **La dirección de un botón se comprueba DESPUÉS de sustituir la variable**,
  que es cuando se sabe a dónde apunta de verdad. Sólo `http` y `https`; un
  botón cuya variable no se resolvió no se dibuja — uno que no lleva a ninguna
  parte es peor que ninguno (v4.650), y en un correo no se corrige después de
  enviado.
- **UNA VARIABLE SIN VALOR NO SE BORRA: se deja el marcador y se REPORTA.** Es
  lo contrario de `resolveVariables` en Plantillas IA, y a propósito — allá el
  hueco se ve en el editor antes de publicar; acá el correo ya salió.
  «Recibimos tu aporte de  » es peor que «Recibimos tu aporte de {{amount}}»:
  lo segundo se lee como un error del sistema y lo primero como que no aportó
  nada.
- **El resumen no dibuja las filas sin valor.** Un renglón «Campaña: » en
  blanco se lee como un error del sistema.
- **El correo lleva versión en TEXTO PLANO.** No es un adorno: sin ella algunos
  filtros puntúan el correo como sospechoso, y un cliente que no dibuja HTML
  mostraría una página en blanco.
- **Las plantillas se VERSIONAN; nunca se actualiza una fila.** Editar baja la
  bandera de la vigente e inserta una versión nueva — es lo que permite
  explicar un aporte de hace seis meses con la plantilla que lo generó
  (criterio 18). Mismo patrón que `ReelCopy` y `CreativeProfile`.
- **El índice único de la vigente es PARCIAL, así que NO se usa `ON CONFLICT`
  contra él**: tendría que repetir el predicado o la sentencia falla entera
  (v4.648). Se baja la bandera con un `UPDATE` y después se inserta. Y lleva
  `COALESCE` porque en Postgres NULL nunca es igual a NULL: sin él, dos
  plantillas globales —las dos con perfil y campaña en NULL— no chocarían
  jamás, que es justo donde más se repiten.
- **La plantilla se valida ANTES de escribirse.** Guardar una que no se puede
  enviar deja una versión inservible marcada como vigente, y la siguiente
  notificación sale con ella.
- **Borrar un perfil se lleva sus plantillas y NO sus entregas.** Las entregas
  son la traza de correos que de verdad salieron: borrarlas dejaría aportes sin
  poder explicar.
- **Esto es del OPERADOR de la plataforma**, comprobado en las rutas **y otra
  vez** en cada método del controlador. Se protegen por separado a propósito:
  una ruta que se reordene o se copie a otro archivo perdería la guardia sin
  que nada avise.
- **La vista previa va en un `iframe` con `sandbox=""`.** Es HTML compuesto con
  datos de una campaña y no puede tocar el panel.
- **`notificationProfileId` es COLUMNA de `ContributionCampaign`**, aditiva.
  NULL —el valor de todas las campañas existentes— significa «heredar». Es
  columna y no un campo del documento `content` porque la resolución la
  consulta por campaña.

### Fase 2 — la resolución del remitente (v4.857)

Acá el módulo empieza a gobernar el correo real.

| Archivo | Qué es |
|---|---|
| `server/lib/senderDomains.js` | Qué dominios están verificados, con caché y vencimiento |
| `server/lib/notificationSender.js` | El envío: perfil → plantilla → remitente → reclamo → correo |

- **NUNCA se intenta enviar desde un dominio SIN VERIFICAR.** Es la regla que no
  se negocia. Hasta hoy `EmailService.sendEmail` sí lo intentaba —le bastaba que
  existiera una fila en `EmailAccount`— y descubría el problema por el rechazo
  del proveedor: eso es un correo perdido por intento, y en volumen es lo que
  hunde la reputación del dominio desde el que envía TODA la plataforma.
- **La jerarquía es N1 dominio del sitio → N2 dominio central → N3 respaldo**, y
  `resolveSenderPlan` devuelve el NIVEL y el MOTIVO. «No está verificado» y «el
  perfil pide el central» se corrigen en sitios distintos: el motivo es la mitad
  del diagnóstico.
- **El criterio es PURO y recibe la lista de dominios verificados**, no la
  consulta. Consultarla por dentro lo haría imposible de probar y metería una
  llamada de red dentro del webhook de Stripe.
- **La verificación NO está en nuestra base: se CACHEA con vencimiento**
  (`NotificationDomain`, 12 h). Consultarla en cada envío sería una llamada a un
  tercero en el camino crítico de un cobro, y Stripe da de baja los endpoints
  que tardan. La caché se queda vieja y eso se asume: el riesgo está acotado por
  el TTL y por lo que pasa después —el proveedor rechaza, el fallo queda escrito
  con su motivo textual y el correo se puede reenviar—.
- **«No se pudo preguntar» NO es «no hay ninguno».** `consultarProveedor`
  devuelve `null` y no `[]`: con `[]` se borraría la caché guardada y todos los
  sitios caerían al respaldo hasta la siguiente consulta exitosa. Ante un fallo
  se usa lo último que se supo, aunque esté vencido.
- **Se usa la key de LECTURA si existe** (`RESEND_INBOUND_API_KEY`): una key de
  sólo-envío no puede listar dominios y devuelve `restricted`.
- **Con perfil aplicable, el recibo de siempre NO sale.** Dos correos por el
  mismo aporte es justo lo que este módulo existe para no producir. Se marca con
  una BANDERA y no con un `return`, que saldría de
  `handleSuccessfulDonationCheckout` entera.
- **Sin ningún perfil, sale el recibo de v4.855, idéntico.** Es el último
  escalón de la jerarquía y lo que hace que esta fase no rompa nada: todos los
  sitios están así hasta que alguien cree un perfil.
- **Un fallo del camino nuevo degrada al recibo de siempre.** El aportante no se
  queda sin confirmación porque falle la configuración.
- **`sendContributionNotifications` envuelve TODO su cuerpo en un `try`.**
  «Nunca lanza» tiene que ser una propiedad del código y no un argumento sobre
  qué puede fallar por dentro: así lo que se agregue después queda protegido
  solo. Corre dentro del webhook de Stripe y una excepción tumbaría el `200`.
- **Una notificación por destinatario, cada una con su propio reclamo.** Si el
  correo del aportante falla, el de la entidad no tiene por qué caerse con él.
- **Los dominios se consultan UNA vez por aporte**, no por destinatario: es la
  misma pregunta.
- **`resolveRecipients` DICE los papeles que no se pudieron resolver**, con su
  motivo. Un aviso marcado que no sale y no lo dice es el silencio que este
  módulo existe para no tener. «Responsable de campaña» se salta siempre y
  explica por qué: la plataforma no guarda todavía un responsable por campaña, y
  un aviso que llega al buzón equivocado es peor que uno que no llega.
- **No se le escribe dos veces a la misma dirección.** La misma persona puede
  ser dirección interna del perfil y correo del sitio.
- **El correo lleva versión en TEXTO PLANO** (`text` en `EmailService`, aditivo).
  Sin ella algunos filtros lo puntúan como sospechoso y un cliente que no dibuja
  HTML mostraría una página en blanco.
- **La PRUEBA sale por el mismo remitente que usaría un aporte real**, con el
  sitio que se elija. Una prueba que no prueba el camino que se va a usar no
  prueba nada. Y la vista previa muestra la dirección REAL, con su nivel y su
  motivo — hasta v4.856 decía «lo resuelve el servidor», que no se puede
  comprobar.
- **El monto va SIN símbolo** (`formatoDeMonto`): la plantilla dibuja el importe
  y la moneda por separado. Con el símbolo pegado saldría «$50.000 COP», y «$»
  de pesos junto a «$» de dólares es la confusión de v4.843.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `NOTIFICATION_CENTRAL_DOMAIN` | El dominio central verificado (default `clubplatform.org`) |
| `NOTIFICATION_FALLBACK_FROM` | La identidad de respaldo (default `noreply@clubplatform.org`) |
| `NOTIFICATION_DOMAIN_TTL_MIN` | Cuánto vale una comprobación de dominio (720) |
| `RESEND_INBOUND_API_KEY` | Key de LECTURA: la de sólo-envío no puede listar dominios |

### Fase 3 — la Bóveda, la campaña y el aviso interno (v4.858)

- **La ficha de un aporte muestra sus correos**, y distingue `sent` de
  `delivered`: el primero dice que el proveedor lo aceptó y el segundo que
  llegó. Es justo la distinción que hace falta cuando alguien dice que no
  recibió nada. Y una lista vacía NO es «no le llegó»: la tarjeta dice que no se
  registró nada, que es otra cosa.
- **Las notificaciones viajan CON los aportes**, en el mismo viaje: con una
  consulta por aporte serían decenas por pantalla.
- **El reenvío acota el aporte por el `clubId` del token en el `WHERE`**, no lo
  lee y comprueba después: para quien pregunta por un aporte ajeno, simplemente
  no existe. Y exige rol administrativo del sitio — reenviar no es leer, es un
  correo a un tercero — y queda registrado con quién lo pidió.
- **Reenviar al MISMO destinatario no vuelve a salir**, y es a propósito: la
  llave de idempotencia es contribución + evento + destinatario. Para volver a
  mandarlo hay que escribir otra dirección, y la pantalla lo dice.
- **Sin perfil que alcance al sitio, el reenvío responde 409 con su motivo** y
  el camino para resolverlo. Lo que falta es configuración, no una avería.
- **La campaña puede FIJAR su perfil** (`notificationProfileId`, columna
  aditiva). `null` es «heredar», que es el valor de todas las campañas
  existentes. La decisión se toma donde ya se está trabajando la campaña, no en
  una pantalla nueva: las pantallas que se olvidan son siempre las del segundo
  lugar. Al agregar la tarjeta hay que sumarla a `CARD_IDS` o se queda fuera de
  «Expandir todo».
- **EL AVISO INTERNO NO ES LA CONFIRMACIÓN AL APORTANTE**
  (`defaultInternalTemplate`). Con una sola plantilla, el aviso interno le
  agradecería a la tesorería por un aporte que no hizo. La interna informa de un
  movimiento, va sin botón y sin firma institucional, y su asunto sirve para
  reconocerla en una bandeja de trabajo. `defaultTemplateFor` decide cuál toca
  según el papel.
- **El editor carga y guarda la plantilla del destinatario ELEGIDO.** Sin
  `recipientKind` en la petición y en las dependencias, cambiar de destinatario
  cargaría siempre la del aportante y se guardaría encima de la otra.

### Fase 4 — el ciclo completo (v4.859)

Con esto el módulo queda cerrado: las cinco fases del pedido están
implementadas.

- **El webhook de Resend se AMPLÍA, no se duplica.** Resend manda todos sus
  eventos a la misma dirección: con dos endpoints habría que configurar dos, y
  una se quedaría sin configurar. Hace dos cosas independientes —dar de baja al
  contacto del CRM y actualizar la entrega— y el fallo de una no puede tumbar la
  otra; la baja va protegida porque es lo que impide seguir escribiéndole a
  quien dijo que no.
- **Una QUEJA se registra como `blocked`, no como `bounced`.** Un rebote es que
  la dirección rechazó el correo; una queja de spam es que la persona pidió no
  recibirlo. Confundirlos manda a buscar un problema de entrega donde hay una
  decisión de quien lo recibió.
- **`email.delivery_delayed` NO se traduce a ningún estado.** Un retraso no es
  un desenlace, y marcarlo como fallo mandaría a reintentar algo que todavía va
  en camino.
- **El reintento vuelve a COMPONER el correo; no se guarda el HTML.** Guardarlo
  serían decenas de KB por fila en una tabla que se lee en cada listado de la
  Bóveda, y dejaría el correo congelado con una plantilla que quizá ya se
  corrigió: si algo falló y se arregló, el reintento tiene que salir con lo
  arreglado. Las cifras se releen de la base por el mismo motivo.
- **El reintento se RECLAMA** (`allowRetry`), y el reclamo va sobre
  `retryCount`, que es un entero exacto: dos barridos simultáneos no reintentan
  el mismo envío. Sobre `updatedAt` no funcionaría — el driver de pg trunca los
  microsegundos (v4.800).
- **Si el perfil dejó de aplicar, el reintento se CIERRA con su motivo.** No se
  inventa un correo con otra identidad.
- **El barrido va cada CINCO minutos, no cada uno.** Un fallo pasajero no se
  resuelve en sesenta segundos, y la primera espera del reintento ya es de dos
  minutos. Con presupuesto de tiempo y protegido con `CRON_SECRET`.
- **UN APORTE REEMBOLSADO DEJA DE CONTAR COMO INGRESO.** `Donation.status` pasa
  a `refunded`, lo que lo saca de la Bóveda —que filtra `status = 'success'`— y
  de los totales. Es la consecuencia deliberada: hasta v4.858 un aporte devuelto
  seguía sumando para siempre, y un balance que cuenta dinero ya devuelto es
  peor que uno que baja.
- **El libro mayor y la fila de `Payment` NO se tocan.** Son el registro de lo
  que OCURRIÓ, y un reembolso es un hecho nuevo, no la corrección de uno viejo.
  Asentarlo como contrapartida es trabajo de la Bóveda y queda **pendiente**.
- **El UPDATE del reembolso es condicional** (`WHERE status = 'success'`): un
  reenvío del mismo evento de Stripe no vuelve a cambiar nada ni a notificar dos
  veces — y la llave de la bitácora lo remata.
- **Sin `donationId` en la traza del pago NO se adivina cuál aporte era.**
  Marcar el equivocado sería peor que no marcar ninguno; se anota para
  resolverlo a mano. El vínculo existe desde v4.844.
- **EL REEMBOLSO TIENE SU PROPIA PLANTILLA.** Notificarlo con «gracias por tu
  aporte» sería agradecerle a alguien por un dinero que se le devolvió. El
  EVENTO decide qué dice y el PAPEL decide el tono (`defaultTemplateFor`).
- **El texto del reembolso NO supone un motivo.** La plataforma no sabe por qué
  se reembolsó —lo decidió alguien en Stripe— y suponerlo sería inventar.
- **`failed` NO se implementa, y no es que falte trabajo.** Un pago que falla
  nunca crea una `Donation`, así que no hay contribución sobre la que notificar
  —y la llave de idempotencia es contribución + evento + destinatario— ni
  destinatario registrado: el correo del aportante viaja en la metadata de la
  SESIÓN de checkout, que un `payment_intent.payment_failed` no siempre trae.
  Se declara como «no aplica» y no como «pendiente», que haría pensar que es
  cuestión de tiempo. Stripe ya avisa a quien intentó pagar.

**Variables de entorno del módulo:**

| Variable | Para qué |
|---|---|
| `NOTIFICATION_CENTRAL_DOMAIN` | El dominio central verificado (default `clubplatform.org`) |
| `NOTIFICATION_FALLBACK_FROM` | La identidad de respaldo (default `noreply@clubplatform.org`) |
| `NOTIFICATION_DOMAIN_TTL_MIN` | Cuánto vale una comprobación de dominio (720) |
| `RESEND_API_KEY` | El envío |
| `RESEND_INBOUND_API_KEY` | Key de LECTURA: la de sólo-envío no puede listar dominios |
| `RESEND_WEBHOOK_SECRET` | Protege el webhook de estados de entrega |
| `CRON_SECRET` | Protege `/api/cron/notification-retries` |

**Pendientes conocidos del módulo:** el reembolso **no asienta una
contrapartida** en el libro mayor —hoy sólo saca el aporte de los totales—; el
evento `in_transit` está declarado y sin implementar (la fecha de liberación ya
se mide, falta decidir a quién le sirve saberlo); y **no hay freno de volumen
por sitio**: un sitio con muchísimos aportes podría copar la cola de reintentos
del barrido.
