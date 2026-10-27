<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Postulación de Proyectos — ediciones (v4.683)

El módulo administra **una edición a la vez**. Su primera pantalla es el listado
de versiones (`EdicionesList.tsx`), igual que el módulo de Eventos.

**Una edición ES un `CalendarEvent`.** No se inventó una entidad nueva: es el
mismo evento que ya usa el registro de asistentes, así que «XIII Feria 2029» es
UNA cosa en toda la plataforma y no dos que haya que mantener sincronizadas.

**Reglas durables:**

- **El aislamiento vive en `buildFilters`** (`projectFairAdminController.js`) y
  en `withAccess`, que son los dos puntos por donde pasan TODAS las consultas y
  la configuración del panel. Al agregar un endpoint administrativo, usarlos:
  si se consulta la tabla por fuera, se pierde el aislamiento en silencio.
- **La edición abierta viaja en la URL** (`?evento=`), no en el estado. Por eso
  `currentEventId()` y `withEvento()` son de módulo en `PostulacionesPagos.tsx`:
  hay peticiones dentro de subcomponentes y pasarla por props obligaría a
  hilarla por media pantalla. El enlace se puede compartir y «atrás» devuelve al
  listado.
- **Sin `?evento=` NO se filtra**, a propósito: es lo que necesitan las filas
  aún sin migrar y las consultas internas que no vienen del panel. Desde la
  pantalla no hay forma de pedir «todas».
- **Clonar copia la ESTRUCTURA, nunca los datos.** `createEdition` hereda
  precios, textos, distritos, áreas, tipos de documento, cargos y la plantilla
  del formulario; las postulaciones, pagos, formularios diligenciados y
  etiquetas se quedan en su edición. Clonar datos sería inventar inscripciones.
- **Una edición nueva nace CERRADA** (`enabled: false`) y **sin fecha límite**:
  abrir una convocatoria al público es una decisión explícita, y la fecha de la
  edición anterior ya venció.
- **`CalendarEvent` es de TODA la plataforma, no de un sitio.** Cualquier
  consulta sobre eventos —la migración, los eventos disponibles— tiene que
  acotarse por `clubId`, o traerá los de los demás sitios alojados. Fue
  exactamente lo que impidió que la migración de v4.683 vinculara nada.
- **`bindLegacyEdition` no adivina.** Migra la convocatoria global de v4.682 y
  sus postulaciones a su edición sólo si el evento se identifica sin ambigüedad
  (uno solo, o coincidencia exacta de nombre). Si no, deja la convocatoria sin
  vincular y el listado lo muestra — atar postulaciones pagadas a la edición
  equivocada es peor que no atarlas. Es idempotente y se reintenta en cada
  arranque en frío, así que se autorrepara si el evento se crea después.
  Cuando de verdad no puede, el listado ofrece **«Vincular evento»**
  (`linkEdition`): avisar sin dar salida dejaba la edición en un callejón.
- **El conteo del listado une con `IS NOT DISTINCT FROM`**, no con `=`: una
  edición sin vincular tiene `eventId` NULL y sus postulaciones también, y con
  igualdad NULL nunca casa con NULL — mostraba «0 postulaciones» teniendo
  cuatro.
- **El índice único de `ProjectFairConfig` es PARCIAL** (`WHERE "eventId" IS NOT
  NULL`), así que su `ON CONFLICT` **debe repetir el predicado** o la sentencia
  falla entera. Mismo error real que costó una corrección en v4.648.
- **El formulario público usa `readOpenEdition()`**, no una edición fija: la
  postulación se sella con la edición en la que se hizo. Hasta v4.682 sólo
  guardaba `editionKey`, un texto que no filtraba nada.

### Limpiar el registro: selección múltiple y archivado — v4.1024

Pedido con el listado delante: *«poder seleccionar una o múltiples postulaciones
para hacer acciones como eliminarlas o editarlas, pero principalmente
eliminarlas con el objetivo de limpiar el listado»*. Hasta v4.1023 el módulo
**no tenía ninguna forma de eliminar una postulación, ni de a una**.

| Archivo | Qué es |
|---|---|
| `server/lib/projectFairBulk.js` | El CRITERIO. **Puro**: qué tocó dinero, qué le pasa a cada fila, el plan, la frase de la confirmación y sus avisos |
| `src/lib/projectFairBulk.ts` | Espejo MÍNIMO: pinta la previsión mientras se marcan casillas |
| `SUBMISSION_CHILDREN` · `bulkScopeFor` · `archiveRow` · `hardDelete` | La orquestación, en `projectFairAdminController.js` |
| `POST /admin/postulaciones/bulk-{archive,restore,delete,status,tag}` | Las cinco acciones |
| `ProjectFairSubmission."archivedAt" / "archivedBy" / "archivedReason"` | El archivado |

Pruebas: `npm run test:fair:bulk` (109 casos: criterio, paridad de los dos
espejos, el CAMINO con la base sustituida en memoria e invariantes leídas de
los archivos) y `npm run test:fair:bulk:ui` (26 en un navegador con la API
interceptada y el CSS compilado; se salta solo si faltan `playwright`,
`esbuild` o `dist/`). **Ninguna necesita Postgres, credenciales ni red.**
Verificadas a la inversa sobre los ocho puntos que sostienen el módulo.

⚠️ **La de navegador hace falta teniendo las 109**, y acá es lo caro: lo único
que demuestra que lo que se MARCA es lo que viaja al endpoint que BORRA. Una
dependencia que falte en un `useCallback` no la ve el typecheck —el código es
válido y el ajuste simplemente no llega nunca (la lección de `conQr`, v4.836)—
y en este módulo eso significaría eliminar filas que nadie eligió. Comprueba
los ids exactos, el `confirm: true` y el `?evento=` del cuerpo y la URL.

**Reglas durables:**

- **⚠️ LO QUE COBRÓ SE ARCHIVA, NO SE BORRA, y de ahí cuelga todo lo demás.**
  Es la decisión del cliente, tomada con el argumento delante. Una postulación
  no es una fila suelta: arrastra la CUENTA con la que ese club entra a
  `/mi-proyecto`, su Formulación, su solicitud del FDD, sus adjuntos, su
  historial y la traza del cobro en Stripe. Archivar la saca del listado —que
  es literalmente lo que se pidió— y no pierde nada; eliminar es definitivo y
  sin respaldo. Es el criterio de las campañas de contribución (v4.807)
  —«una campaña que estuvo al aire no se borra: se archiva; sólo se elimina un
  borrador que nunca se publicó»— aplicado al dinero.
- **⚠️ «TOCÓ DINERO» NO ES `hasConfirmedPayment`, y confundirlos borra un
  registro financiero.** Aquél contesta «¿está pagada HOY?» y lo usa el cobro;
  `hasFinancialTrace` contesta «¿cobró ALGUNA VEZ?» — una REEMBOLSADA cobró y
  se devolvió, y una fila cuyo `status` se quedó atrás por un webhook perdido
  puede tener el cargo, el importe recibido o la fecha de pago escritos. Basta
  UNA señal: equivocarse hacia «no cobró» destruye; hacia «cobró» sólo archiva
  de más, que se deshace.
- **EL ESPEJO PINTA, EL SERVIDOR DECIDE.** El espejo existe para prever
  «se eliminarán 3 y se archivarán 5» sin pagar un viaje de red por casilla
  marcada; el veredicto se recalcula sobre la fila FRESCA. **No trae
  `BULK_CAPABILITY` ni `validateBulkPlan`** —quién puede eliminar y si el plan
  se ejecuta son del servidor— y lo fija una prueba que comprueba su AUSENCIA.
  La paridad se compara por SALIDAS sobre una matriz de filas: con dos
  criterios, la pantalla prometería eliminar lo que el servidor archiva.
- **⚠️ LOS IDENTIFICADORES DE STRIPE SÓLO VIAJAN CON PERMISO FINANCIERO**
  (`mapRow`), así que en la previsión pueden faltar. Por eso el criterio lee
  también `status`, `paidAt`, `amountReceived` y `refundedAmount`, que viajan
  siempre — y por eso acepta las DOS formas del mismo dato (`status` crudo y
  `paymentStatus` mapeado): con un solo nombre, el espejo leería `undefined` y
  daría por no cobrada TODA fila.
- **LA CONFIRMACIÓN DICE EL HECHO** —cuántas se eliminan, cuántas se archivan y
  por qué, con la lista de las seleccionadas— en vez de preguntar «¿estás
  seguro?»: lo que hay que poder revisar es el hecho (criterio de los
  desembolsos, v4.885). `confirm: true` → 428, y el 428 devuelve el PLAN, no un
  error genérico.
- **EL BLOQUE NO ES ATÓMICO Y SE DICE** (v4.886). Cada fila reporta su
  desenlace con su motivo y la pantalla los pinta todos: «se eliminaron 5»
  habiendo tocado 3 es el defecto que el desglose existe para no tener.
  Envolverlo en una transacción sería peor — un fallo tiraría abajo
  eliminaciones que sí ocurrieron.
- **⚠️ EL HISTORIAL SOBREVIVE A LA FILA, a propósito.** `ProjectFairEvent` NO
  está en `SUBMISSION_CHILDREN`: al eliminar se conserva entero y se le SUMA el
  evento de la eliminación. Las filas quedan huérfanas —nadie las consulta sin
  su `submissionId`— y son el rastro: es lo único que contesta «¿por qué esta
  postulación ya no está?» dentro de seis meses. Lo fija una prueba en los dos
  sentidos.
- **⚠️ AL AGREGAR UNA TABLA QUE CUELGUE DE `submissionId`, AGREGARLA A
  `SUBMISSION_CHILDREN`.** Ninguna de las tablas del módulo tiene clave foránea
  ni cascada, así que lo que no se enumere queda huérfano: filas que nadie
  puede ver ni volver a borrar desde el panel, y el fallo es MUDO. Una prueba
  lee el esquema, junta todas las tablas con esa columna y exige que estén —
  así una tabla nueva no se puede olvidar.
- **`remove` ES UNA CAPACIDAD PROPIA, no se deduce de `edit`.** Editar es
  corregir una errata de captura; archivar saca una postulación del listado y
  eliminar se lleva el acceso de un club. Sólo la tiene el rol admin: un
  `finance` mueve pagos y un `reviewer` mueve estados, y ninguno tiene por qué
  poder vaciar el registro. El permiso de cada acción lo declara
  `BULK_CAPABILITY` y no está escrito a mano en la ruta.
- **⚠️ SE OPERA LO QUE SE VE, y eso obligó a mirar qué se ve.** `loadRows` NO
  pasa por `withEvento`, así que el listado enseña también las postulaciones
  **sin edición** —las anteriores a v4.683, que nunca se migraron—. Acotar la
  consulta del bloque a la edición las habría hecho desaparecer de una acción
  sobre filas que el usuario TIENE delante, con el motivo «no existe», que es
  falso. Se carga sin acotar y se clasifica: esta edición y las sin edición se
  operan; una de OTRA edición se conserva y se NOMBRA con su motivo
  (`otra_edicion`). Un `WHERE` sólo sabe decir «no está», y son tres
  respuestas distintas.
- **SIN EDICIÓN ABIERTA NO SE OPERA EN BLOQUE**, y se dice por qué: el listado
  sin filtrar mezcla ferias, y ahí un borrado transversal es silencioso.
- **⚠️ ARCHIVAR ES UN UPDATE CONDICIONAL** (`AND "archivedAt" IS NULL`), y lo
  que protege es una CARRERA: la segunda petición de un doble clic —o de otro
  administrador— leyó la fila ANTES, así que su plan dice «archivar» y lo único
  que la detiene es la cláusula. Sin ella pisaría la fecha, el nombre y el
  motivo de quien archivó primero, y dejaría un segundo registro en el
  historial. **La prueba de arriba no lo ejercitaba** —el plan la frenaba antes
  de llegar al UPDATE— y hubo que simular la lectura obsoleta para verlo: al
  probar un candado de concurrencia, comprobar que la prueba llegue hasta él.
- **LO ARCHIVADO NO SE VE POR DEFECTO, Y ALCANZA A LOS REPORTES.** El filtro
  vive en `buildFilters`, que es el único punto por el que pasan el listado,
  el Centro de Inteligencia y la exportación: una postulación archivada no
  debería seguir sumando en las cifras. Como hoy no hay ninguna archivada,
  desplegarlo no mueve ni un número — ésa es la comprobación que lo autoriza.
  El catálogo es CERRADO y un valor que el servidor no reconozca cae en
  `activas`, que es el comportamiento de siempre.
- **ARCHIVAR SIN SALIDA SERÍA UN BORRADO CON OTRO NOMBRE**, así que el selector
  «Sin archivar · Sólo archivadas · Todas» va junto a los filtros y restaurar
  es una acción en bloque más.
- **LA SELECCIÓN GUARDA LAS FILAS ENTERAS, NO SUS IDS** (v4.886). El listado se
  filtra y se pagina: una marcada antes de cambiar de página tiene que
  sobrevivir a que la vista cambie, y con sólo el id no habría con qué prever
  qué le va a pasar ni cómo nombrarla. El contador AVISA cuántas están fuera de
  la página: actuar sobre lo que no se ve es cómo alguien elimina lo que no
  quería.
- **LA CASILLA VA FUERA DEL BOTÓN QUE ABRE LA FICHA** (v4.940) y lleva el
  NOMBRE en su etiqueta accesible (v4.740): con la tabla llena, «Seleccionar» a
  secas se repite en cada fila y no se distinguen. «Todos los visibles» dice
  que alcanza sólo a la página que se está mirando.
- **EL MOTIVO ES OBLIGATORIO AL CAMBIAR EL ESTADO** y opcional en el resto. Es
  lo que queda en el historial de cada una, y un cambio de estado en bloque sin
  explicación no se puede reconstruir después.
- **AL ETIQUETAR, EL PLAN PREVIO NO PUEDE SABER SI LA FILA YA TENÍA LA
  ETIQUETA** —eso vive en la tabla puente, no en la postulación—, así que la
  petición se atiende y el desenlace lo dice fila por fila. Responder 400
  habría exigido que el criterio adivinara algo que no sabe. Con archivar es al
  revés: ahí el estado está en la propia fila y el plan sí lo ve.
- **LA IDENTIDAD NO SE EDITA EN BLOQUE** (regla de v4.952). Lo que se ofrece es
  lo COMPARTIDO —estado y etiqueta—; nombre, correo, club y proyecto se
  corrigen de a uno, porque el mismo valor en veinte filas destruye datos.

**Pendientes conocidos:** los **adjuntos de S3 no se borran** al eliminar una
postulación — el módulo nunca los borró (`deleteFile` quita la fila y deja el
objeto desde siempre) y sus `fileUrl` son URLs, no claves; como sólo se elimina
lo que nunca cobró, en la práctica casi nunca hay adjuntos, y limpiarlos es una
regla de ciclo de vida sobre el prefijo, no un barrido propio. **No hay
eliminación de a una** desde la ficha: se selecciona esa sola y se usa el
bloque. **Prioridad y responsable no se editan en bloque** — el andamiaje está
y cada campo pide su control en la pantalla. Y el **listado sigue sin mandar
`?evento=`**, así que mezcla ediciones: corregirlo cambiaría lo que se ve hoy
—las postulaciones sin edición desaparecerían— y merece su propia vuelta.

### Distrito y club en el formulario público (v4.706)

- **El distrito se pregunta ANTES que el club**, porque es lo que decide qué
  clubes se ofrecen. Preguntar el club primero obligaría a volver atrás.
- **Los clubes viven DENTRO de cada distrito** (`districts[].clubs`), no en un
  mapa aparte con el nombre del distrito como llave: renombrar un distrito no
  puede dejar su lista huérfana. El campo es **opcional y aditivo** — una
  convocatoria guardada antes no lo trae, y `normalizeSavedConfig` lo completa a
  lista vacía. Un distrito sin lista pide el club a mano, que es como funcionó
  siempre; así se pueden ir cargando los catálogos sin romper nada.
- **La lista NO es obligatoria de cumplir.** Un catálogo se queda viejo solo
  —clubes nuevos, fusiones, cambios de nombre— y esta es una inscripción que se
  paga: dejar fuera a quien no figure sería perder la postulación. Por eso el
  desplegable termina en «Mi club no está en la lista» y el servidor acepta
  cualquier nombre. La opción va de ÚLTIMA y cuesta un clic extra, así que quien
  sí está en la lista la usa.
- **Lo que SÍ se rechaza es un club del catálogo de OTRO distrito.** Eso no es
  un club que falte, es una pareja distrito-club que se contradice. Sin falso
  positivo posible: un club que figure en los dos catálogos pasa por la primera
  condición. En la pantalla no llega a ocurrir porque **cambiar de distrito
  borra el club elegido** —y también la marca de «no está en la lista»—.
- **Volver del texto libre a la lista es un botón explícito.** Re-elegir el
  mismo distrito no dispara nada, así que sin él quien se equivocara al marcar
  «no está en la lista» se quedaría escribiendo a mano.
- `clubNotListed` es estado **de la pantalla**: dice de dónde salió el nombre,
  no cuál es. No se envía ni se guarda.
- **El catálogo de los distritos 4271 y 4281 es una SEMILLA** (v4.707,
  `server/lib/rotaryClubs.js`), no un valor por defecto. `deepMerge` reemplaza
  los arrays enteros, así que un catálogo escrito en `DEFAULT_CONFIG` nunca
  llegaría a producción: lo taparía el array `districts` de la fila guardada.
  Por eso `seedDistrictClubs` corre dentro de `normalizeSavedConfig`, **antes**
  de normalizar — normalizar primero convertiría todo en `[]` y borraría la
  distinción de la que depende todo esto.
- **`undefined` y `[]` significan cosas distintas.** Un distrito sin el campo
  `clubs` nunca se tocó y recibe la semilla; uno con la lista VACÍA es una
  decisión del administrador («que el club se escriba a mano») y se respeta.
  Es lo que hace innecesario un flag en la base y una escritura al arrancar, y
  es la misma regla del Generador de Pendones: una vez que el operador tocó
  algo, un despliegue no vuelve a tocarlo.
- **El distrito se reconoce por su NÚMERO de cuatro dígitos**, no por el texto:
  el nombre guardado puede ser «Rotary Distrito 4271», «Distrito 4271» o
  «D-4271». Un distrito renombrado a algo sin número no recibe semilla — mejor
  sin lista que con la lista de otro.
- Pruebas: `npm run test:clubes` (24 casos). Comprueban que el catálogo llegó
  completo, la ortografía —mayúscula inicial, tildes, preposiciones internas en
  minúscula, números romanos intactos— y que la semilla no pisa lo editado.

### Centro de Inteligencia (v4.689)

`Dashboard` y `Reportes` eran dos pestañas que mostraban lo mismo con otros
nombres y lo calculaban **dos veces**. Ahora hay una sola pantalla y un solo
endpoint (`getIntelligence`); `/admin/overview` y `/admin/reports` son alias
suyos, conservados para un navegador con el panel viejo en caché.

- **Ninguna métrica se pinta dos veces.** Al agregar una, buscar antes si ya
  está en otro bloque: la duplicación fue justo lo que hubo que deshacer.
- **El embudo sólo tiene etapas que el módulo REGISTRA.** No se inventa
  «proyecto publicado» ni nada que nadie marque: una etapa siempre en cero no
  dice dónde se pierde nada, sólo estorba.
- **Un bloque sin datos no se pinta**, y un eje geográfico sólo aparece si
  dice algo (`hasGeo`): con todo en un país, «por país» es una barra que ocupa
  sitio y no informa.
- **El acumulado se deriva de la serie diaria** en el navegador, no con otra
  consulta: el dato ya venía.

### El panel del club conoce SU edición (v4.691)

- **`/mi-proyecto` resuelve la convocatoria por `submission.eventId`**
  (`readConfigForSubmission`), no la abierta. Hasta v4.690 usaba
  `readConfigForAdmin()` sin edición: acertaba sólo porque hay una feria. Con la
  XIII abierta, un club de la XII habría visto el plazo, los precios y **la
  plantilla del formulario** de la XIII.
- **Si la edición no tiene fila propia se cae a la abierta**, a propósito.
  `readConfig` mezcla contra `DEFAULT_CONFIG` y nunca devuelve vacío, así que
  sin esa comprobación un `eventId` huérfano dejaría al club con la plantilla
  POR DEFECTO —perdiendo el formulario que está diligenciando— sin avisar.
- **La sede y las fechas salen del `CalendarEvent`** (`readEditionEvent`), no de
  `cfg.edition`. Una edición ES un evento de la plataforma: si el panel leyera
  del bloque escrito a mano, podría decir una ciudad mientras la ficha del
  evento dice otra. `cfg.edition` queda de respaldo para una edición sin
  vincular. Sin evento se devuelve `null`; no se inventa uno.
- **El encabezado contesta dos preguntas y ninguna más**: cuál es mi proyecto y
  a qué feria va, separadas por una línea. El monto y el estado del pago **no**
  van ahí: ya tienen su tarjeta y en el encabezado convertirían el dinero en el
  titular de una pantalla que trata del proyecto.

### Un pago rechazado no es un callejón sin salida (v4.978; la puerta de lectura, v4.979)

Reporte con captura: la ficha de un proyecto con «Inscripción — Pendiente de
pago», los formularios bloqueados y **ninguna acción a la vista**. El club creó
su cuenta, postuló su proyecto, llegó al checkout, el banco declinó la tarjeta,
y ahí quedó: sin forma de reintentar y sin poder tocar sus formularios.

| Archivo | Qué es |
|---|---|
| `server/lib/projectFairPayment.js` | El CRITERIO. **Puro**: qué cuenta como pago confirmado, a quién se le ofrece pagar, qué se le dice, qué sesión se reutiliza y cómo se lee el historial |
| `server/lib/projectFairPaymentAttempts.js` | La I/O de `ProjectFairPaymentAttempt`: reclamo, cierre y lectura |
| `beginCheckout` · `syncPaymentState` · `paymentStateFor` | La orquestación, en `projectFairController.js` |
| `POST /portal/checkout` → `startCheckout` | La acción del panel del club |
| `PaymentCallout` en `MiProyecto.tsx` | La banda con el estado, el motivo, el historial y el botón |

Pruebas: `npm run test:fair:payment` (53 casos de criterio) y
`npm run test:fair:payment:path` (79, el CAMINO con la base y Stripe
sustituidos, recorriendo los trece casos del pedido). **Ninguna necesita
Postgres, credenciales ni red.** Verificadas a la inversa: sin el candado del
`ON CONFLICT` fallan 5, sin la consulta previa a la pasarela 5, y tomando un
intento anterior por pago, 5.

**Reglas durables:**

- **⚠️ LA REGLA ES UNA SOLA PREGUNTA: ¿EXISTE UN PAGO CONFIRMADO?**
  `hasConfirmedPayment` mira `status === 'paid'` y nada más. Lo que NO cuenta
  —y es lo que se confundía— es que exista un `stripeSessionId`, un
  `stripePaymentIntentId`, un `stripeChargeId` o un intento anterior: todo eso
  demuestra que alguien INTENTÓ pagar. Mientras la respuesta sea no, el club
  tiene una ruta segura para completarlo; en cuanto sea sí, la acción
  desaparece y los formularios se habilitan.
- **⚠️ UN INTENTO NO ES UNA INSCRIPCIÓN, y por eso son dos tablas.**
  `ProjectFairSubmission.status` es el estado GLOBAL y
  `ProjectFairPaymentAttempt` la lista de VECES que se intentó cobrar. Tres
  rechazos y una aprobación dan una inscripción PAGADA con cuatro filas de
  historial: el aprobado **no borra** los anteriores, que son lo único que
  contesta «¿por qué este club llamó a soporte?» dentro de seis meses. El
  NÚMERO del intento se deriva del orden — un contador guardado sería una
  segunda verdad sobre lo que las filas ya dicen.
- **⚠️ SE LE PREGUNTA AL PROVEEDOR ANTES DE COBRAR, Y ANTES DE CALCULAR EL
  PRECIO.** Es el paso que impide cobrar dos veces por un problema de
  sincronización: un pago puede estar confirmado en Stripe y todavía no acá
  —el webhook se demoró, se perdió, o el club cerró la pestaña—. Va antes del
  precio a propósito: «¿ya está pagado?» no puede depender de que la
  convocatoria tenga bien puesto su valor. Y `/portal/me` sincroniza al
  cargar, así que abrir el panel basta para que un pago confirmado se
  destrabe solo.
- **UN SOLO PUNTO DE CONSULTA, y no dos «por si acaso».** La primera versión
  sincronizaba al entrar a `beginCheckout` **y** al mirar la sesión
  candidata; la prueba destapó que la primera era redundante —quitarla no
  hacía fallar nada—, así que se quitó. Código que no se puede probar es
  código que se separa en silencio.
- **⚠️ EL CANDADO CONTRA EL COBRO DUPLICADO ES DE LA BASE**: índice único
  PARCIAL sobre `("submissionId") WHERE status = 'open'`. Comprobar con un
  `SELECT` antes no sirve —entre la lectura y la escritura caben dos
  peticiones—, y acá el precio de repetir ese error es cobrarle dos veces a un
  club. Por ser parcial, el `ON CONFLICT` **repite su predicado** o la
  sentencia falla entera (la trampa de v4.648).
- **EL RECLAMO VA DESPUÉS DE CREAR LA SESIÓN, no antes.** Un reclamo previo
  que muriera a mitad dejaría un intento abierto sin sesión y la inscripción
  bloqueada para reintentar. Perder la carrera acá cuesta una sesión de Stripe
  que se expira en el acto — nunca un segundo cobro, porque a la sesión
  huérfana no llega nadie.
- **⚠️ UN INTENTO QUE SE DESCARTA SE CIERRA CON SU SESIÓN.** Si la sesión
  caducó, o ya no sirve porque el importe cambió con la TRM, hay que cerrar el
  intento que la sostenía: dejarlo vivo deja al club en «ya hay un pago en
  curso» hasta que llegue el webhook de caducidad —minutos u horas—, que es el
  mismo callejón por otra puerta. **Lo destapó la prueba del camino, no la
  lectura.**
- **LA SESIÓN ABIERTA SE REUTILIZA, y eso resuelve tres casos de una**
  (`reusableCheckout`): doble clic, varias pestañas y refresco a mitad del
  checkout llevan al MISMO cobro. Tres condiciones y las tres importan: que
  siga abierta, que le quede vida (`REUSE_MARGIN_MS` — mandar a alguien a un
  enlace que caduca a mitad del pago es peor que abrir otro) y que cobre el
  MISMO importe: el precio se fija en pesos y se cobra en dólares a la TRM del
  momento, así que una sesión de ayer puede cobrar un valor que ya no es el
  vigente. Si no sirve, se **expira**: dejarla viva sería un enlace que cobra
  de menos.
- **UNA SESIÓN `complete` PUEDE NO ESTAR PAGADA** (`readSessionOutcome` mira
  `payment_status` ANTES que `status`). Darla por pagada habilitaría los
  formularios sin cobro — es el error caro de este módulo.
- **UN RECHAZO CIERRA SU INTENTO, NO LA INSCRIPCIÓN.** Stripe deja la sesión
  abierta para que se pruebe otra tarjeta: si el club vuelve y pulsa
  «Reintentar pago», se retoma esa sesión y se abre el intento SIGUIENTE. Así
  el historial dice «Intento #1 → Rechazado · Intento #2 → …» y no se paga por
  una sesión de más.
- **⚠️ EL ERROR DEL PROVEEDOR NO SE LE MUESTRA A QUIEN PAGA.** El crudo se
  conserva siempre —en `lastPaymentError` y en el intento, que es lo que
  necesita soporte— y lo que se muestra sale del catálogo CERRADO de
  `friendlyFailure`. Un código desconocido cae en la frase genérica, nunca en
  el texto del gateway: es de un tercero, va en inglés y a veces nombra
  objetos internos de la pasarela.
- **⚠️ EL VEREDICTO LO ARMA EL SERVIDOR Y VIAJA RESUELTO** (`payment` en
  `/portal/me`: estado, rótulo, frase, `canPay`, rótulo de la acción e
  historial). **Por eso NO hay espejo de `projectFairPayment.js` en `src/`**:
  una segunda copia del criterio en el navegador se separaría de ésta en
  silencio, y lo que se separaría es si a alguien se le ofrece pagar algo que
  ya pagó. Es la exigencia expresa del pedido — el frontend nunca es la fuente
  de verdad del estado de un cobro.
- **LA ACCIÓN VA JUNTO AL AVISO QUE LA RECLAMA.** «Tu formulario se habilita
  cuando se confirme el pago» se conserva, y ahora se puede resolver desde ahí
  mismo (regla del modo Fotográfico, v4.798). Con el pago pendiente **no se
  pintan dos avisos**: la banda del pago sustituye al genérico, porque decir
  dos veces lo mismo en dos recuadros amarillos seguidos es ruido.
- **LA INSCRIPCIÓN SALE DEL TOKEN, nunca del cuerpo de la petición.** Si
  viniera del cliente, cualquiera con este endpoint abriría un cobro contra la
  inscripción de otro club.
- **UN REEMBOLSO NO SE VUELVE A COBRAR SOLO** (`canStartPayment`). Es una
  decisión administrativa, y volver a cobrarle por su cuenta a quien acaba de
  recibir su dinero de vuelta sería desobedecerla. Se bloquea **con su salida
  escrita** —escribir al comité—: un bloqueo sin salida se lee como una avería.
- **ANTE UN ESTADO QUE NO RECONOCEMOS, SE OFRECE PAGAR.** Equivocarse hacia
  ese lado deja un botón de más; hacia el otro, una inscripción encerrada, que
  es justamente el defecto que esta versión corrige.
- **(⚠️ SUPERSEDIDA en v4.1253: el bloqueo dejó de ser fijo; ver «Postular NO exige pagar».) EL BLOQUEO DE LOS FORMULARIOS NO SE AFLOJÓ.** `editability` sigue exigiendo
  `status === 'paid'` y una prueba lo fija: lo que cambió es que ahora hay cómo
  resolverlo, no qué se exige. Y se comprueba en las DOS mitades —el criterio y
  los manejadores que ESCRIBEN—, porque el criterio puede quedar intacto
  mientras `saveForm` o `submitForm` dejan de consultarlo, y ese fallo es mudo:
  el código es válido, los tipos están bien y el formulario simplemente se
  guarda.
- **⚠️ Y ABRIRLO ES OTRA PUERTA, QUE ESTABA ABIERTA** (v4.979). Las escrituras
  cortaban con 403 y aun así `getForm` devolvía la plantilla ENTERA con
  `canEdit:false`: los campos salían inhabilitados y sin botones, pero la
  tarjeta era un enlace y el formulario se podía abrir y recorrer. Se reportó
  como «cualquier usuario que no ha completado el pago puede acceder a los
  formularios», y era exacto — *inhabilitado* no es *inaccesible*. **Al cerrar
  una puerta, contar cuántas hay**: leer, escribir y enviar son tres.
- **⚠️ LA PUERTA SE DECIDE CON EL PAGO, NO CON `canEdit`, y confundirlos rompe
  el otro lado.** `canEdit` es falso por CINCO motivos y sólo uno justifica
  cerrar: sin pago confirmado no hay nada que consultar —el borrador ni
  siquiera se siembra—. Los otros cuatro —reembolso, cierre del comité,
  aprobación del Distrito, plazo vencido— dejan el trabajo en SOLO LECTURA a
  propósito, y el del reembolso lo dice con esas palabras («puedes consultar y
  descargar tu proyecto»): cerrar ahí le quitaría a un club el acceso a un
  trabajo que ya hizo y que pagó. Por eso `formIsAvailable` es
  `hasConfirmedPayment` —el MISMO criterio puro del cobro— y no una sexta
  condición escrita al lado.
- **LA PUERTA VA EN EL SERVIDOR; LA TARJETA SÓLO LO DECLARA.** `getForm`
  responde **402** con su motivo, y `cardFor` publica `available` para que la
  pantalla no vuelva a decidirlo. Esconder la tarjeta no protegería el endpoint
  de quien lo conoce (v4.868), y con la decisión escrita en los dos lados se
  separarían en silencio.
- **`available` es ADITIVO y ausente se comporta como antes** (`form.available
  !== false`). Un navegador con el bundle anterior sigue viendo lo de siempre, y
  el que no lo puede abrir **deja de ser un `button`**: un control desactivado
  que igual recibe el foco anuncia algo que no va a pasar (v4.650).
- **UN CANDADO SE PINTA COMO CANDADO.** Entrar por la dirección directa —o
  volver a una pestaña abierta desde antes del pago— devuelve 402, y la vista
  del formulario lo muestra en ámbar con su motivo, no en el rojo de un fallo
  de carga: pintar un bloqueo como avería manda a diagnosticar lo que no está
  roto.

### La comisión se SUMA a quien se inscribe (v4.980)

Pedido del cliente: aplicar a la inscripción de proyectos de la Feria y al
registro de asistentes al evento —nacional, internacional y CADRE— la misma
comisión que ya existe en «Maneras de Contribuir»: **2,9 % de pasarela de pagos
y 2,1 % de traslado interbancario a COLROTARIOS**. Los precios se siguen
anunciando tal cual; la comisión aparece **al final, desglosada, y se suma** al
valor cuando la persona va a pagar.

| Archivo | Qué es |
|---|---|
| `server/lib/checkoutSurcharge.js` | El CRITERIO. **Puro**: catálogo de líneas, catálogo de flujos, cascada por moneda, cálculo, validación y cómo se explica |
| `server/lib/checkoutSurchargeStore.js` | La I/O: `PlatformConfig`, caché e invalidación |
| `src/lib/checkoutSurcharge.ts` | Espejo MÍNIMO, comparado por SALIDAS |
| `src/components/admin/SurchargePanel.tsx` | El editor, dentro de la Bóveda Central junto al de tarifas |

Pruebas: `npm run test:surcharge` (92 casos, **sin base, credenciales ni red**;
el bloque de paridad pide `esbuild` y se salta solo). Verificadas a la inversa:
restando en vez de sumando fallan 69, redondeando el total aparte 16, con un
flujo desconocido cobrando 2, interpretando «2.9» como 2,9 % 3, y cobrando el
precio sin recargo 1.

**Reglas durables:**

- **⚠️ ACÁ LA COMISIÓN SE SUMA; EN LOS APORTES SE DESCUENTA, y de eso cuelga
  todo lo demás.** En «Maneras de Contribuir» el aportante da 100, la
  plataforma retiene su parte y la organización recibe 95: la comisión sale del
  RECEPTOR. Acá el precio publicado es lo que la organización tiene que
  recibir, así que la paga QUIEN SE INSCRIBE. Son preguntas opuestas y por eso
  **NO se reutiliza `feeRules.js`**: son dos configuraciones con dos llaves de
  `PlatformConfig`, y lo comprueba una prueba que lee el archivo. Lo que sí
  comparten es la PANTALLA — las dos se editan en la Bóveda Central.
- **⚠️ Y ATARLAS TENÍA UN PRECIO MEDIDO, no hipotético.** La retención por
  defecto de `feeRules` es del **5 %**, no del 2,1 %: heredarla habría cobrado
  ~7,9 % a cada inscrito sin que nadie lo decidiera, y cambiar la retención de
  los aportes movería en silencio lo que paga un inscrito. Al reutilizar una
  configuración para un caso nuevo, mirar QUÉ VALOR tiene hoy, no sólo qué
  significa.
- **⚠️ EL DESGLOSE LO PINTA LA PASARELA** (v4.981, decisión expresa del cliente
  con la banda del panel delante: *«ahí no debería aparecer, debería aparecer ya
  directamente en la pasarela de pagos de stripe»*). **Supersede la regla de
  v4.980**, que lo mostraba en los TRES sitios donde alguien puede pagar. La
  banda de «Completar pago» del panel del club vuelve a anunciar SÓLO el precio
  publicado: ahí el aviso es «te falta pagar», y una factura en su lugar era
  otra cosa. El resumen del formulario del evento y el paso de pago de la Feria
  **conservan su total** —ahí la persona está armando lo que va a pagar y elige
  acompañantes—; lo que se quitó es el desglose del panel.
- **⚠️ Y PARA QUE STRIPE PUEDA PINTARLO, SE MANDAN VARIAS `line_items`**: la
  inscripción y una por cada comisión con su porcentaje, en vez de UNA línea
  con el total y una descripción que decía «Incluye …». Una descripción no es
  un desglose: se lee como una nota al pie y no cuadra con ningún número.
- **⚠️ LAS LÍNEAS SUMAN EXACTAMENTE LO QUE SE COBRA, y el resto del redondeo lo
  absorbe la INSCRIPCIÓN, nunca una comisión** (`buildChargeLines`). Si el
  reparto no cerrara —o dejara la inscripción en cero— devuelve `null` y se
  cobra en una sola línea NOMBRANDO el recargo en la descripción: **un
  refinamiento de presentación no puede mover el cobro**, y un total mayor que
  el precio anunciado sin explicación se lee como un error. La comprobación es
  en la UNIDAD MÍNIMA, que es lo que Stripe suma; en decimales no alcanza.

### El precio se fija Y SE COBRA en pesos (v4.982)

Reporte con la pantalla de Stripe delante: la inscripción vale **250.000 COP** y
la pasarela ofrecía «COP 272.170,76 / $82,44 · 1 USD = 3.301,4406 COP», con la
partida de inscripción en **259.196,10**. El precio publicado había dejado de
ser el precio.

- **⚠️ LA CAUSA ERAN DOS CONVERSIONES ENCADENADAS EN SENTIDOS OPUESTOS.**
  Nosotros pasábamos 250.000 COP a dólares con NUESTRA TRM (3.184 → US$ 78,52,
  US$ 82,44 con el recargo) y creábamos la sesión en `usd`; Stripe, con el
  pagador en Colombia, volvía a presentarlo en pesos con SU tasa (3.301,44) y
  daba 272.170. Dos tasas distintas sobre el mismo cobro, y el valor anunciado
  subiendo y bajando con el dólar. **La regla es la del `fx` de las
  inscripciones a eventos**: lo que se PUBLICA manda, y la conversión la hace
  quien cobra, una sola vez.
- **⚠️ ESTO SUPERSEDE «el cobro en Stripe siempre se hace en USD» (v4.612).**
  `priceMode: 'COP'` crea la sesión en `cop` y `priceMode: 'USD'`, en `usd`:
  la partida va en la moneda del precio (`quoteCheckout` publica
  `chargeCurrency` y `chargeAmount`, y el cobro sale de ahí). No es terreno
  nuevo — los aportes de Maneras de Contribuir cobran en COP por esta MISMA
  cuenta de Stripe desde v4.834.
- **⚠️ SIN TRM SE COBRA IGUAL, y es la consecuencia directa, no un extra.** La
  tasa dejó de intervenir en el cobro, así que no puede impedirlo: hasta v4.981
  un proveedor de TRM caído respondía **503** y dejaba a un club sin poder pagar
  sus 250.000 pesos por no haber podido consultar el dólar — la inversión exacta
  que esta versión corrige. `computePricing` queda `ready` con `amountUsd` en
  **null**, que es la verdad; un cero sería una afirmación.
- **Y el equivalente que ya se sabía no se borra**: el UPDATE escribe
  `"amountUsd" = COALESCE($3, "amountUsd")`. Un hueco de hoy no puede pisar un
  dato de ayer.
- **⚠️ `reusableCheckout` COMPARA LA MONEDA, no sólo el importe.** Toda sesión
  abierta en dólares de antes de v4.982 cobra en otra moneda y se expira sola en
  vez de reutilizarse. Apoyarse en que 26.250.000 y 8.244 no coincidirían sería
  apoyarse en la suerte. Y el importe se compara con `toStripeAmount`, no con un
  `* 100`: **COP es exactamente donde la unidad mínima de Stripe difiere de los
  decimales de presentación** (`money.js`), así que escribirlo a mano acá daría
  una comparación que se separa del cobro.
- **`projectFairPayment.js` puede importar `money.js` y NADA MÁS**, y es una
  excepción declarada en su propia prueba: aquél es igual de puro y es el único
  sitio donde vive esa unidad mínima. Copiar el `* 100` sería un segundo
  criterio sobre lo mismo — la regla del sitio.
- **⚠️ EL PASO DE PAGO DEJÓ DE ANUNCIAR UN COBRO EN DÓLARES.** Decía «Valor que
  se cobrará US$ X» con su TRM y su botón «Actualizar TRM»: era falso además de
  al revés. Ahora dice el total en pesos y, si la tasa está disponible, un
  «≈ US$ X» rotulado como **referencia**. El comprobante muestra lo REALMENTE
  cobrado (`amountReceived` + `chargeCurrency`) y no `amountUsd`, que es el
  equivalente del precio: presentarlo como «valor pagado» afirmaría un importe
  en dólares sobre un cobro que salió en pesos.
- **`confirmPaidSession` convierte con `fromStripeAmount`**, no con un `/ 100`
  fijo. Hoy da lo mismo —peso y dólar cobran los dos con dos decimales— y
  dejaría de darlo con una moneda sin decimales, con la avería multiplicada por
  cien y en silencio.
- **El doble de Stripe toma la moneda del PAYLOAD.** Fijada en `usd` daba por
  bueno un cobro en pesos y dejaba sin comprobar justo lo que esta versión vino
  a corregir; y guarda el payload (`__payload`) porque sin él ninguna prueba
  puede mirar en qué moneda salió cada partida. El doble de la base sirve la
  TRM en caché, que es lo que permite ejercitar el camino en pesos **sin red**.
- **El evento NO cambió**: `createCheckout` ya cobraba en la moneda de su
  categoría (`toStripeAmount(l.amount, currency)`) desde v4.980. La
  inconsistencia era sólo de la Feria.
- **EL RECARGO YA NO VIAJA AL PANEL DEL CLUB.** `paymentStateFor` dejó de
  calcularlo: un campo que nadie lee es la clase de silencio que este archivo
  documenta una y otra vez, así que se quitó en vez de dejarlo colgando.
- **⚠️ CADA LÍNEA SE REDONDEA Y EL TOTAL ES LA SUMA DE LAS LÍNEAS.** No al
  revés: si el total se redondeara por su cuenta, las líneas que se le muestran
  a quien paga no sumarían el total que se le cobra, y un desglose que no
  cuadra por un peso se lee como una avería. Se comprueba sobre una matriz de
  importes y monedas.
- **SE SUMA; NO SE HACE «GROSS-UP».** La alternativa aritmética —dividir por
  (1 − tasa) para que lo que quede tras la pasarela sea exactamente el precio—
  es más exacta y es inexplicable en una pantalla: el número mostrado dejaría
  de ser un porcentaje redondo de lo que se está pagando. Medido sobre el caso
  real (250.000 COP al 5 %): sumando da 262.500 y quedan ~249.600 tras la
  pasarela; con gross-up, 263.158. La diferencia es del 0,14 % y el primero se
  puede leer.
- **⚠️ EL IMPORTE LO CALCULA EL SERVIDOR AL ABRIR EL PAGO, NUNCA EL NAVEGADOR.**
  El espejo de `src/lib/` existe para PINTAR el desglose mientras la persona
  arma su inscripción —sin pagar un viaje de red por cada acompañante que
  agrega—, y lo que lo hace seguro es que la prueba compara las SALIDAS de los
  dos módulos. Con el importe viajando desde el navegador, cualquiera con el
  endpoint elegiría cuánto paga. Lo fija una prueba que busca `req.body` en los
  dos controladores.
- **EL PRECIO SE CONGELA; EL RECARGO NO.** El precio es una promesa que se le
  hizo a quien se inscribió y por eso `pricing` se congela al enviar el
  formulario (v4.648); el recargo es lo que cuesta cobrarlo HOY y se resuelve al
  abrir el pago. Una prueba comprueba que el orden sea ése.
- **⚠️ UNA SESIÓN ABIERTA SE COMPARA CONTRA LO QUE SE COBRA, no contra el
  precio.** Si el recargo cambió, la sesión que sigue viva cobra un valor que ya
  no es el vigente y hay que expirarla — exactamente igual que cuando se mueve
  la TRM (v4.978).
- **⚠️ EL RECARGO SE CALCULA SOBRE EL PRECIO PUBLICADO, EN SU MONEDA**, y el
  cobro en dólares sale de convertir el TOTAL. Al revés —convertir primero y
  recargar después— el desglose que ve el club en pesos no cuadraría con lo que
  se le cobra, porque el redondeo del peso y el del dólar no caen en el mismo
  sitio.
- **⚠️ LA RETENCIÓN REGISTRADA SALE DEL RECARGO COBRADO, no de `feeRules`.**
  `Payment.applicationFee` guarda la línea de traslado interbancario que pagó de
  más quien se inscribió; recalcularla con la tarifa de los aportes descontaría
  DOS veces —una al sumar y otra al retener—. El desglose completo se guarda con
  el cobro: dentro de un año, «¿por qué este club pagó 262.500 por una
  inscripción de 250.000?» tiene que poder contestarse sin reconstruir tarifas.
- **DÓNDE SE APLICA ES UN CATÁLOGO CERRADO Y POR FLUJO**, no un interruptor
  único: la Feria y el evento son dos cobros distintos y el cliente puede querer
  el recargo en uno y no en el otro sin desplegar. **Ante un flujo que nadie
  declaró, NO se cobra**: equivocarse hacia el otro lado es cobrarle de más a
  alguien por un identificador mal escrito. Los aportes NO están en la lista, y
  su ausencia es deliberada.
- **EL RECARGO DEL EVENTO NO DEPENDE DE LA CATEGORÍA, SINO DEL FLUJO**, así que
  las tres audiencias —nacional, internacional y CADRE— lo heredan solas y una
  categoría nueva también. Las TASAS viajan dentro de cada categoría decorada y
  no una sola vez en la respuesta, porque la nacional puede cobrar en pesos y la
  internacional en dólares, y el componente fijo de una tarifa sólo significa
  algo en su moneda.
- **UNA INSCRIPCIÓN SIN COSTO NO LLEVA RECARGO.** No hay nada que procesar ni
  que trasladar, y cobrar una comisión sobre cero sería cobrar por nada. Una
  línea en cero tampoco se pinta: un desglose lleno de ceros informa menos que
  uno con las dos líneas que sí cobran.
- **EL OPERADOR ESCRIBE, EL CÓDIGO DECIDE.** «2.9» queriendo decir 2,9 % se
  RECHAZA en vez de interpretarse: adivinar acá es cobrarle a alguien el 290 %
  de su inscripción. Los avisos NO bloquean — tratarlos igual convierte
  cualquier observación en un bloqueo y se dejan de leer.
- **EL EJEMPLO DEL PANEL NO ES DECORATIVO.** Un porcentaje suelto no dice
  cuánto paga de más quien se inscribe, y ése es el número por el que van a
  preguntar. Sale del MISMO `computeSurcharge` del cobro, así que lo que muestra
  el panel es lo que se cobra.
- **LEER LA CONFIGURACIÓN NUNCA LANZA Y VA CACHEADA.** Esto corre en el camino
  del cobro: una configuración ilegible degrada a la vigente en vez de tumbar un
  pago, y sin caché cada inscripción pagaría un viaje a la base para leer dos
  porcentajes que cambian una vez al año. Toda escritura invalida.
- **CAMBIARLO NO TOCA NINGUNA INSCRIPCIÓN YA PAGADA**, y la respuesta del panel
  lo dice: el recargo se calcula al ABRIR el pago. Es la misma garantía que
  `feeRules` da con `Payment.applicationFee`, por otra vía.

**Pendientes conocidos:** el recargo **no asienta nada en el libro mayor** —el
`Payment` de la Feria sí guarda su retención, pero el registro de asistentes
vive en `EventRegistrationPayment`, fuera de la Bóveda—; y **no hay tarifa por
sitio** como la tiene `feeRules` (`bySite`): hoy el recargo es de la plataforma
y por moneda, que es lo que el pedido necesitaba.

**Pendientes conocidos:** el panel administrativo (`Gestión de Postulaciones y
Pagos`) **no muestra todavía el historial de intentos** —los datos están y
`listAttempts` está listo, falta la columna en la ficha—; y el correo que le
avisa a un club que su pago quedó pendiente **no existe**: hoy se entera al
entrar a su panel.

### Fechas importantes del proceso, editables — v4.1252

Pedido: quitar de `/postular-proyecto` las dos fechas ya cumplidas (1-sep-2026,
Global Grants; 15-oct-2026, comunicación con los CADRES) y poder editar la
lista sin un cambio de código.

- **El editor vive en Convocatoria** (`ScheduleEditor` en
  `src/components/admin/feria/ConvocatoriaConfig.tsx`): título del bloque y,
  por fila, fecha, prefijo opcional («Hasta el») y texto; agregar, quitar y
  reordenar. Una fila sin texto no se publica; la lista vacía oculta el bloque.
- **⚠️ Una lista guardada SIN el editor cede al valor por defecto**
  (`normalizeSavedConfig`). Hasta v4.1251 no había editor, pero el panel manda
  la configuración entera al guardar y copiaba `content.schedule` en la fila:
  sin descartarla, quitar una fecha de `DEFAULT_CONFIG` no la quitaría del
  sitio. Lo editado en el panel lleva `content.scheduleEdited: true` y manda,
  incluida la lista vacía.
- Pruebas: `npm run test:fair-schedule`.

### Postular NO exige pagar: postulación y pago desacoplados — v4.1253

Pedido del cliente (XII Feria, Valledupar 2027), con las capturas del paso
«Confirmar y continuar al pago» y de la pantalla de Stripe: *«los clubes deben
poder completar su registro y postular sus proyectos sin pagar inmediatamente;
el pago debe seguir disponible, pero independiente»*.

**Auditoría (cómo estaba hasta v4.1252).** La fila y la cuenta del club ya se
creaban ANTES de pagar (`createSubmission`, `status = 'pending_payment'`), así
que el dato no se perdía. Lo que ataba la postulación al pago era:

1. **El wizard**: el último botón decía «Confirmar y continuar al pago» y la
   única salida era la pantalla de Stripe; no había confirmación de que el
   proyecto quedó postulado, ni correo (el único era el comprobante de pago).
2. **El estado del proyecto llevaba el del pago**: `workflowStatus` aceptaba
   `pending_payment`, `payment_confirmed`, `payment_failed`, `refunded`, y los
   webhooks lo escribían (pisando «En revisión», por ejemplo).
3. **Los formularios del proyecto** (Formulación, FDD) estaban cerrados sin
   pago confirmado (`editability`, `formIsAvailable`, v4.979), y el borrador de
   la Formulación sólo se sembraba al confirmarse el pago.
4. **El perfil** decía «Completa el pago para habilitar los formularios».

| Archivo | Qué es |
|---|---|
| `server/lib/projectFairLifecycle.js` | El CRITERIO. **Puro**: estados del proyecto, borrador vs. postulado, qué es deuda (`owesRegistration`), estado del pago para leer, puerta de los formularios (`formAccessOf`), fecha límite de pago y `reminderVerdict`. Exporta también `SQL_APPLIED` / `SQL_DRAFT` / `SQL_OWES`, ARMADOS desde las mismas listas |
| `createSubmission` (`mode: 'apply' \| 'draft'`) · `applicationViewOf` · `notifyApplication` · `priceSubmission` · `migrateDecoupledStates` | En `projectFairController.js` |
| `PUT /portal/application` · `POST /portal/application/submit` · `GET /portal/receipt` | Terminar y enviar un borrador desde el perfil; comprobante imprimible |
| `POST /admin/postulaciones/payment-reminders?evento=` | Recordatorios de pago (sin `confirm: true` devuelve el PLAN) |
| `VIEW_FILTERS` / `?vista=` | Vistas de participación y recaudo del listado |
| `ProjectFairSubmission."appliedAt"` | Cuándo se ENVIÓ la postulación (un borrador no la tiene) |

Pruebas: `npm run test:fair:lifecycle` (78: criterio + invariantes leídas de
los archivos) y la sección 19 de `npm run test:fair:payment:path` (borrador no
se cobra; el total del perfil es EXACTAMENTE el de la sesión de Stripe; el pago
no mueve el estado del proyecto). Verificado además contra un Postgres real:
migración idempotente, vistas, indicadores, doble envío del borrador y plan de
recordatorios.

**Reglas durables:**

- **⚠️ DOS ESTADOS INDEPENDIENTES.** `workflowStatus` es el PROYECTO
  (Borrador, En formulación, Postulado, En revisión, Requiere ajustes,
  Aprobado, Rechazado, Retirado; más Enviado a Rotary Grants y Cerrado);
  `status` es el PAGO (lo escribe la pasarela). «Postulado · Pago pendiente» y
  «En revisión · Pago confirmado» son combinaciones válidas. **Ningún webhook
  ni la confirmación manual escriben en `workflowStatus`**, salvo normalizar un
  valor heredado a `received`. Lo fija `test:fair:lifecycle`.
- **⚠️ LOS VALORES DE PAGO EN `workflowStatus` SON HEREDADOS** y se migran a
  «Postulado» (`migrateDecoupledStates`, en cada arranque, idempotente, con un
  evento `state_migrated` por fila). No toca `status`, `paidAt` ni nada de
  Stripe. Toda fila heredada es una postulación ENVIADA (el wizard sólo creaba
  la fila al confirmar el formulario completo), así que no se inventa nada.
  Un «Borrador» anterior a v4.1253 también pasa a Postulado: lo puso un
  administrador a mano; los borradores reales nacen con
  `metadata.createdAs = 'draft'`. Los cuatro heredados siguen en
  `WORKFLOW_STATES` con `legacy: true` (se LEEN), pero no se ofrecen al elegir.
- **⚠️ UN BORRADOR NO ES DEUDA NI SE COBRA.** `beginCheckout` lo bloquea
  (`blocked: 'draft'`) y `paymentViewOf(…, { applied: false })` no ofrece
  pagar. El «pendiente de recaudo» cuenta SÓLO obligaciones válidas
  (`SQL_OWES`): postuladas, no retiradas ni rechazadas, no archivadas, sin
  pagar. Usar `status = 'pending_payment'` a secas contaría borradores.
- **⚠️ ESTO SUPERSEDE EL BLOQUEO FIJO DE v4.979.** Los formularios del proyecto
  se abren con la postulación ENVIADA, pague o no. Exigir el pago para esa
  etapa es el interruptor `registration.requirePaymentForForms` de la
  Convocatoria (apagado; sólo `true` lo enciende) y entonces rige el MISMO
  `hasConfirmedPayment` vía `formAccessOf`. `getForm` responde 402 sólo si lo
  que falta es el pago, 409 si falta enviar la postulación.
- **⚠️ Y SUPERSEDE v4.981 EN EL PERFIL.** El pedido exige mostrar valor,
  cargos y total en el perfil y que coincida con Stripe. Por eso
  `priceSubmission` es la ÚNICA función que calcula el cobro: la usan
  `beginCheckout` (la sesión) y `paymentStateFor` (el perfil). Pagado, el
  perfil muestra lo COBRADO (`amountReceived` + el recargo guardado con el
  cobro), no un recálculo con tarifas de hoy.
- **La puerta de los formularios lee la convocatoria de SU edición**
  (`portalContext` → `readConfigForSubmission`, regla de v4.691): con el pago
  exigible por edición, leer la abierta aplicaría la regla de otra feria.
- **El pago iniciado desde el perfil vuelve al perfil** (`returnPath`); el del
  wizard, al wizard.
- **Enviar un borrador es un UPDATE condicional** (`workflowStatus IN
  ('draft','formulating')`): doble clic o dos pestañas no postulan dos veces ni
  mandan dos correos. Es la MISMA fila con su código: no se duplica nada.
- **`createSubmission` devuelve un token del perfil** (`issuePortalToken`):
  quien acaba de crear su cuenta con su contraseña entra a su perfil sin
  escribirla otra vez. Los correos enlazan al dominio desde el que se postuló
  (`metadata.origin`), también los que manda el comité desde la plataforma.
- **RECORDATORIOS SIN REPETIRSE.** `reminderVerdict`: intervalo mínimo (7
  días) y tope (3) por postulación, configurables en
  `notifications.paymentReminders`; nunca a un borrador, retirado, rechazado o
  pagado, ni con la fecha límite de pago vencida. El rastro son los eventos
  `payment_reminder` del historial, no una tabla aparte. Exigen `?evento=` y
  el permiso `managePayments`.
- **La fecha límite de pago es OPCIONAL** (`registration.paymentDeadline`,
  AAAA-MM-DD). Sin ella no se muestra ninguna ni se habla de plazos.

**Pendientes conocidos:** no hay preferencias de comunicación por club (el
tope de recordatorios y el interruptor de la Convocatoria son el control que
existe); el filtro «Postulaciones sin ningún intento de pago» mira
`ProjectFairPaymentAttempt`, que existe desde v4.978 — una sesión de Stripe
abandonada anterior a esa versión no cuenta como intento; y el correo de
confirmación usa el remitente de la Convocatoria con el respaldo de la
plataforma, como el comprobante.

### Rotary Grants 25A → 31A — v4.1254

El destino del «siguiente paso» (`redirect`: perfil del club, confirmación del
pago, redirección y correo del comprobante) es **Rotary Grants 31A,
https://grants31a.org/**.

- **⚠️ Cambiar `DEFAULT_CONFIG` no basta**: el panel guarda la convocatoria
  ENTERA y la fila lleva una copia de `redirect`, que `deepMerge` hace ganar.
  `normalizeSavedConfig` reemplaza campo por campo SÓLO lo que sigue siendo
  exactamente el valor viejo (URL, nombre y texto del botón de 25A); un
  destino escrito a mano en Convocatoria se respeta. Misma regla que la lista
  de fechas de v4.1252. Pruebas: sección 5 de `npm run test:fair-schedule`.

### FDD, paso «Aportes esperados» — v4.1255

En `server/lib/projectFairFddForm.js`: sin «Aportes esperados de distritos del
exterior» (`RETIRED_FDD_FIELDS`); `clubsDistrictUsd` y `foreignClubsUsd`
opcionales; el total suma esos dos; y `fapContributionUsd` lleva
`contact: { text, label, whatsapp, message }`, que `FormFields.tsx` pinta como
un aviso con enlace `wa.me` (abre la app o WhatsApp Web con el mensaje y el
nombre del campo). Cualquier campo de cualquier plantilla puede declarar
`contact`.

- **⚠️ La copia guardada de la plantilla taparía el cambio** (el panel guarda
  la convocatoria entera y el merge reemplaza el array de secciones).
  `syncFddAportes`, llamado en `normalizeSavedConfig`, reemplaza la sección
  `aportes` guardada por la vigente; las demás secciones no se tocan. No hay
  editor de esta plantilla en el panel, así que no se pisa nada decidido.
- Las respuestas ya guardadas en `foreignDistrictsUsd` se conservan en el JSON
  de respuestas; simplemente dejan de mostrarse y de sumar.
- Pruebas: sección 6 de `npm run test:fair-schedule`.
