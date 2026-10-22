<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## WhatsApp CRM — motor de automatización — v4.701

El módulo dejó de ser sólo un enviador de campañas manuales. Ahora observa el
estado de cada sitio, lo ubica en un momento del ciclo de vida y dispara
recorridos a partir de las TRANSICIONES.

**La plataforma es el único remitente.** El motor emite desde el WABA del club
«Origen» (`crmTenant.js`) hacia los dirigentes de cada club cliente. No hay un
WABA por club. El administrador de un sitio sólo CONSULTA lo suyo.

| Archivo | Qué es |
|---|---|
| `server/lib/lifecycleSpec.js` | Los 17 estados y la derivación (función PURA) |
| `server/lib/crmLifecycle.js` | La pasada de observación: señales, persistencia y eventos |
| `server/lib/crmEventBus.js` | Catálogo de eventos y registro idempotente |
| `server/lib/crmSegments.js` | Audiencias dinámicas (catálogo cerrado de campos) |
| `server/lib/crmGuardrails.js` | Consentimiento, exclusión, horario, frecuencia, duplicados |
| `server/lib/journeySpec.js` | Nodos, condiciones, variables y validación del grafo |
| `server/lib/journeyEngine.js` | Inscripción y avance de las inscripciones |
| `server/lib/journeySeeds.js` | Bienvenida y Renovación precargados |
| `server/lib/whatsappSender.js` | Envío de plantilla + registro en el log |
| `server/lib/crmTenant.js` | Resolución del sitio «Origen» |
| `server/lib/ensureAutomationSchema.js` | Crea las 7 tablas en runtime |
| `src/components/admin/whatsapp/JourneyBuilder.tsx` | Constructor visual |
| `src/components/admin/whatsapp/LifecycleBoard.tsx` | Tablero, guardias y exclusión |
| `server/lib/crmIntents.js` | Catálogo CERRADO de intenciones y su detección |
| `server/lib/crmInbox.js` | Estado de la atención, enrutamiento y agentes |
| `server/lib/crmChatbot.js` | Orquesta un entrante: conversación, intención, ruta y respuesta |
| `server/lib/crmTraining.js` | Puente con el módulo de Capacitaciones (sólo lectura) |
| `src/components/admin/whatsapp/ConversationInbox.tsx` | La bandeja |
| `server/lib/crmAnalytics.js` | Métricas y conversiones ATRIBUIDAS |
| `server/lib/crmAlerts.js` | Alertas internas y presupuesto |
| `server/lib/crmRecommendations.js` | Hallazgos por regla + redacción con modelo |
| `src/components/admin/whatsapp/CrmAnalytics.tsx` | Inteligencia: analítica, campañas, calendario |
| `server/lib/templateSpec.js` | Reglas de Meta, carpetas y traducción al payload |
| `server/lib/templateComposer.js` | Redactor con IA + bucle de validación |
| `server/controllers/crm/templates.controller.js` | Biblioteca, carpetas y envío a Meta |
| `src/components/admin/whatsapp/TemplateLibrary.tsx` | La biblioteca |

Pruebas: `npm run test:crm` (178 casos). Necesita una `DATABASE_URL` de una base
**vacía** con el schema aplicado; el guion aborta si la cadena parece de un
entorno real. La llamada a Meta se intercepta reemplazando `globalThis.fetch`.

**Reglas durables:**

- **Los eventos se OBSERVAN, no se empujan.** El pedido enumera 21 eventos
  repartidos por once módulos. Instrumentar 21 puntos de llamada habría atado el
  motor a código ajeno y, peor, habría perdido el evento para siempre cuando esa
  línea fallara o el hecho ocurriera por otra vía (una corrección a mano en la
  base, una importación masiva). `sweepDerivedEvents` MIRA el estado real y es
  autorreparable: si el motor estuvo caído dos días, al volver observa igual.
  `recordEvent` queda exportado para quien quiera menos latencia; comparten
  `dedupeKey`, así que no se duplica.
- **Un sitio visto por primera vez NO emite transición.** La primera vuelta
  encuentra `CrmLifecycleState` vacía; sin esta regla TODOS los sitios
  «entrarían» en su estado a la vez y se inscribirían en todos los recorridos el
  día del despliegue. La primera observación sólo fotografía.
- **Los eventos derivados tienen ventana** (`CRM_EVENT_LOOKBACK_DAYS`, 7). Un
  proyecto publicado hace tres años es un hecho, no una noticia. Sin la ventana
  la primera pasada emitiría el historial completo de la plataforma como si
  acabara de ocurrir.
- **La transición es el disparador, no el estado.** «Está vencido» no es un
  evento; «acaba de vencer» sí. Por eso el estado se PERSISTE en vez de
  recalcularse y descartarse, y por eso la fila guarda también el anterior.
- **`contentTracked:false` significa «no lo medimos», no «no tiene».** Un
  distrito no tiene `Post` ni `Publication` colgando. Sin esa distinción todos
  los distritos caían para siempre en «en implementación» por una ausencia que
  nunca se iba a llenar.
- **`prospecto` y `cancelado` no se deducen**: son `manualOnly`. La plataforma no
  observa nada que los distinga, y fabricarlos desde una señal parecida sería
  inventar. `manualState` gana sobre la derivación.
- **APLAZAR y DESCARTAR no son lo mismo, y confundirlos es el defecto clásico.**
  Fuera de horario o pasado el tope de frecuencia el mensaje se APLAZA
  (`defer` + `retryAt`) y sale cuando corresponde. Una baja, una exclusión o un
  número inválido lo DESCARTAN (`skip`). Tratar «es de noche» como descarte
  pierde el mensaje; tratar «pidió la baja» como aplazamiento lo convierte en
  acoso diferido.
- **La ventana horaria se evalúa en la zona del DESTINATARIO.** La función corre
  en UTC y «las 8 de la mañana» no significa lo mismo en Bogotá que en Madrid.
  Hay clubes en varios países.
- **La lista de exclusión vive aparte del contacto** (`CrmSuppression`, por
  NÚMERO). Es lo que hace que la baja sobreviva a que el contacto se borre y se
  vuelva a crear, que es exactamente como se le termina escribiendo a quien pidió
  que no. Probado en `test:crm`.
- **La condición de salida se evalúa ANTES DE CADA PASO, no sólo al inscribir.**
  El recorrido de renovación dura 75 días y el club renueva en medio. Es lo que
  impide seguir cobrándole la renovación a quien ya renovó, y recordarle el
  onboarding a quien ya lo completó.
- **Una variable sin resolver NO se envía.** Meta rechaza el parámetro vacío y,
  aunque no lo hiciera, «tu sitio vence el » es peor que no mandar nada. Se anota
  una alerta interna y se sigue.
- **`clicked` no existe como condición y no es un olvido.** La Cloud API informa
  `sent`, `delivered`, `read` y `failed`; el clic en un botón de URL **no** se
  reporta. Lo único observable es el botón de respuesta rápida, que llega como
  mensaje entrante y por eso se pregunta con `replied`. Declarar `clicked` daría
  una rama que nunca sería verdadera. No agregarla.
- **Los recorridos sembrados nacen en `draft` y SIN `templateId`.** Una plantilla
  la aprueba Meta y vive en la cuenta del cliente: sembrar un recorrido activo
  que apunte a plantillas inventadas daría uno que falla en el primer envío o
  —peor— que parece funcionar. Cada paso trae `templateHint` con qué debe decir
  la suya, y `validateJourney` impide activar hasta que estén asignadas. La
  siembra es **aditiva e idempotente**: una vez creado, el recorrido es del
  operador y un despliegue no vuelve a tocarlo (misma regla que el Generador de
  Pendones).
- **El grafo se guarda como documento JSON**, no normalizado: se lee y se escribe
  siempre entero, y normalizarlo obligaría a migrar el esquema cada vez que
  aparezca un tipo de nodo nuevo, sin ganar ninguna consulta.
- **`entryNodeId` vive en `settings`, no es «el primer nodo del array».**
  Funcionaría hoy y se rompería el día que alguien reordene los pasos.
- **Un ciclo sin espera se rechaza al guardar.** Un bucle que no pasa por un
  `wait` gira sin fin dentro de una vuelta del motor. Un ciclo CON espera es
  legítimo (un recorrido que sondea) y se permite.
- **Una regla de audiencia con campo u operador desconocido se DESCARTA y se
  reporta** (`skipped`), no se ignora en silencio: un filtro que no se aplica
  ENSANCHA la audiencia, que en un motor de envíos es el error que no se puede
  pasar por alto. Los campos y operadores son un catálogo cerrado; ningún valor
  del cliente entra en el SQL.
- **El JOIN con `CrmLifecycleState` es LEFT.** Con INNER, vincular mal un
  contacto lo volvería invisible sin decirlo.
- **Un recorrido activo que se edita hasta quedar inválido se PAUSA solo.**
  Dejarlo activo lo haría fallar contacto por contacto en el próximo tick.
- **Un recorrido con inscripciones vivas no se borra, se pausa.** Borrarlo
  dejaría inscripciones apuntando a un grafo inexistente, y con ellas la única
  traza de por qué un club recibió lo que recibió.
- **El bloqueo es un UPDATE condicional sobre la fila** (`lockedAt`), igual que
  en el Creador de Reels: es lo que impide que el cron, el webhook y el panel
  hagan el mismo envío dos veces.
- **El orden del tick es observar → inscribir → avanzar**, y no otro: así un club
  recién activado recibe su primer mensaje en el mismo minuto. Al revés harían
  falta tres vueltas.
- **Las columnas nuevas de `WhatsAppContact` y `WhatsAppMessageLog` están
  declaradas EN `schema.prisma` además de en el ensure.** El guardián de
  `db:push` compara TABLAS, no columnas: una columna que existiera sólo en el
  ensure la borraría el primer `npm run db:push` sin que nada avisara.
- **`sendCampaign` conserva su propia copia de la lógica de envío.** Unificarla
  con `whatsappSender.js` es deseable pero cambia el camino por el que hoy salen
  las campañas manuales de producción. Al corregir algo del envío, mirar los dos
  sitios.

### Fase 3 — bandeja, intención y enrutamiento (v4.696)

- **Una conversación NO guarda mensajes.** Ya viven en `WhatsAppMessageLog`;
  duplicarlos daría dos verdades sobre el mismo hilo. `CrmConversation` guarda el
  ESTADO de la atención: en qué punto está, quién la tiene, qué quería la persona
  y qué sitio hay detrás.
- **Un hilo abierto por contacto, por índice único PARCIAL** (`WHERE "closedAt"
  IS NULL`). Al cerrarse deja el lugar libre y el mensaje siguiente abre otro, así
  el historial queda por episodio. Ojo: por ser parcial, el `ON CONFLICT` tiene
  que repetir el predicado o la sentencia falla entera — mismo error que costó una
  corrección en v4.648.
- **`resuelto` NO cierra; `cerrado` sí.** Un hilo resuelto que recibe un mensaje
  vuelve a `nuevo` en vez de quedarse ahí con alguien esperando. Sólo `cerrado`
  libera el índice.
- **La detección de intención va de lo exacto a lo inseguro**: botón pulsado →
  palabras clave → modelo. Empezar por el modelo costaría una llamada por mensaje
  para resolver lo que una palabra clave resuelve, y haría el enrutamiento no
  reproducible («¿por qué esto fue a soporte?»). Gana la coincidencia MÁS LARGA:
  «ayuda técnica» tiene que ganarle a «ayuda».
- **El catálogo de intenciones es CERRADO.** Si el modelo contesta algo que no
  está, se descarta y queda `otro`. Una etiqueta inventada no enruta a ningún
  equipo y no se puede reportar.
- **El chatbot viene APAGADO y el seguimiento no.** La bandeja clasifica y enruta
  siempre —eso no le manda nada a nadie—, pero las respuestas automáticas sólo
  salen con `chatbot.enabled`. El sitio ya tenía dos respondedores en producción
  (`WhatsAppAutoReplyRule` y `WhatsAppAgentConfig`, en `whatsappAgent.js`) y
  cambiar lo que reciben los contactos no es un efecto secundario aceptable de
  agregar una bandeja. Cuando el bot contesta, el respondedor histórico se saltea
  para no mandar dos mensajes por el mismo entrante.
- **La BAJA se atiende siempre**, encendido o no el chatbot, y antes que nada.
  Que la respuesta automática esté apagada no puede significar ignorar a quien
  pide no recibir más mensajes.
- **`clicked` sigue sin existir.** Un botón de respuesta rápida llega como
  mensaje entrante y por eso lo detecta el catálogo de intenciones; el clic en un
  botón de URL Meta no lo reporta.
- **El reparto de conversaciones es por CARGA, no por turnos.** Con turnos, quien
  estuvo ausente vuelve y recibe lo mismo que quien atendió todo el día.
- **Sin agente disponible, la conversación se enruta al EQUIPO igual** y queda sin
  asignar. Dejarla sin equipo la volvería invisible en los filtros, que es peor
  que verla sin dueño.
- **Tomar un hilo es un UPDATE condicional** (`WHERE "assignedTo" IS NULL`): si
  otro agente llegó primero, este pierde y se le dice quién lo tiene. Sin la
  condición, dos personas creerían tenerla.
- **Escalar crea un `TechnicalRequest` REAL**, no una tarea propia del CRM. El
  equipo ya trabaja en ese módulo; una cola paralela sería un segundo lugar donde
  mirar, y las que se olvidan son siempre las del segundo lugar. Sin sitio
  vinculado NO se escala: se dice por qué, en vez de colgar la solicitud del
  Origen y dejarla en la cola equivocada.
- **El error de Meta al responder se propaga TEXTUAL.** Fuera de la ventana de 24
  horas un mensaje libre se rechaza y hay que usar una plantilla; convertirlo por
  lo bajo dejaría a quien atiende sin entender qué pasó.
- **Las capacitaciones NO se duplican.** El catálogo y las citas viven en el
  módulo de Capacitaciones y desde acá sólo se leen. Copiar las categorías daría
  dos listas que se separan en silencio y el CRM ofrecería un tema que no se puede
  reservar.
- **La recomendación de capacitación sigue el `sortOrder` del catálogo**, que ya
  es el itinerario que definió el equipo. Inventar un segundo criterio se
  contradiría con el suyo. Si ya las hizo todas, no recomienda nada: repetir la
  última sería empujar por empujar.
- **El recorrido de Onboarding no repite los recordatorios de 24 h y 1 h** de la
  cita: los manda el módulo de Capacitaciones por correo
  (`/api/cron/training-reminders`). Duplicarlos le llegaría dos veces a la misma
  persona por el mismo hecho.
- **`crm_agent` está en las DOS listas `ADMIN_ROLES`** (servidor y `src/App.tsx`),
  y NO en `SITE_ADMIN_ROLES`: entra al panel para atender su bandeja y nada más.
- **Un administrador de sitio no ve las notas internas ni la traza.** Están
  escritas para el equipo y hablan de su organización.

### Fase 4 — analítica, campañas y optimización (v4.697)

- **Una conversión se DERIVA, no se declara.** Es la coincidencia de un mensaje
  que salió y un evento del sistema POSTERIOR, del mismo sitio, dentro de
  `CRM_ATTRIBUTION_DAYS` (14). Un contador que alguien incremente al enviar
  mediría envíos, no resultados.
- **Es ATRIBUCIÓN, no causalidad, y la UI lo dice.** El club pudo renovar solo.
  El número responde «de los que recibieron esto, cuántos hicieron aquello
  después». Llamarlo «renovaciones generadas» sería atribuirse un mérito que el
  dato no demuestra.
- **Las conversiones se cuentan por SITIO, no por mensaje.** Tres dirigentes del
  mismo club que reciben el aviso y un club que renueva son UNA renovación.
  Contar por mensaje infla el número con el tamaño de la audiencia.
- **«Respondido» no existe como columna** y no se agrega una: se cuenta el
  saliente que tuvo un entrante del mismo contacto DESPUÉS. Es la única
  definición observable.
- **La muestra insuficiente se declara, no se esconde** (`enoughSample`,
  `MIN_SAMPLE` = 20). Con seis envíos, un 100 % de lectura no dice nada, y
  ordenar por esa tasa pondría arriba justo lo que menos se sabe.
- **Sin tarifa configurada el costo es NULL, no 0.** Un cero es una afirmación
  falsa; un hueco es la verdad. Misma regla que el panel de auditoría del Creador
  de Reels. El costo es una ESTIMACIÓN propia sobre ventanas de 24 h: la Cloud
  API no devuelve el importe y Meta cobra por conversación y país.
- **El corte por presupuesto está APAGADO por defecto** (`budgetHardStop`).
  Frenar los envíos por un número estimado puede dejar sin avisar a un club que
  vence mañana; quien lo enciende elige ese riesgo. Se comprueba una vez por
  vuelta del cron, no por envío.
- **La asignación de variantes A/B es ESTABLE, no aleatoria** (hash FNV-1a de
  nodo+contacto). Con `Math.random()` un reintento —por horario o por fallo de
  red— movería al contacto de rama, y el resultado mediría la suerte en vez de
  las variantes. Además es reproducible sin haberlo guardado. Peso 0 saca una
  variante del reparto sin romper las inscripciones que ya estaban en ella.
- **Las variantes de un `split` son salidas como cualquier otra**: entran en la
  detección de referencias colgantes y de ciclos (`outgoingTargets`). Olvidarlas
  dejaría pasar una rama rota que revienta en producción.
- **Del token NO se declara vencimiento.** Meta no nos dice cuándo vence y no
  tenemos las credenciales de la app para consultarlo. Se avisa por lo
  observable: que rechazó una llamada (código 190) o que hace mucho que nadie
  verifica la conexión. Decir «vence en 5 días» sin poder saberlo es peor que no
  avisar.
- **Las alertas se deduplican por PERÍODO** (día o mes según el tipo), no por
  existencia: una condición que persiste tiene que volver a avisar mañana, pero
  no cada cinco minutos. Y el volumen se agrupa: veinte alertas iguales informan
  menos que una que diga «veinte».
- **El barrido de alertas va al FINAL del tick**, después de observar, inscribir
  y avanzar: depende del estado que esas tres etapas acaban de dejar.
- **La IA de las recomendaciones NO mira los datos.** Los hallazgos los calcula
  SQL con reglas, cada uno con su evidencia; el modelo sólo los redacta. Darle la
  base y pedirle «decime qué mejorar» produciría cifras plausibles y no
  auditables, que en un módulo que decide a quién escribirle son peligrosas. Sin
  credencial de modelo las recomendaciones se muestran igual, con su texto de
  regla.
- **Ninguna recomendación se aplica sola.** Son sugerencias con un enlace a la
  pantalla donde se resuelven.
- **El calendario muestra inscripciones REALES con espera pendiente**, no una
  proyección del grafo. Un recorrido de diez pasos sin inscripciones vivas no va
  a mandar nada, y el calendario tiene que reflejarlo.
- **El centro de campañas unifica en la LECTURA, no en el modelo.** Una campaña
  es un envío puntual y un recorrido es una máquina que corre sola; se muestran
  juntos porque para quien mira el mes son lo mismo.

### Biblioteca de plantillas con IA (v4.701)

- **`createTemplate` NUNCA mandaba la plantilla a Meta.** Insertaba una fila local
  con estado `pending` y nada más, así que la plantilla no existía para la Cloud
  API y un recorrido que la usara fallaba con «template name does not exist». Lo
  corrige `submitToMeta` (`POST /{waba}/message_templates`). La ruta vieja
  `/templates` se conserva porque la usan la pestaña original y `sendCampaign`.
- **El modelo escribe; el CÓDIGO decide si es válido.** Las reglas de Meta son
  aritméticas —1024 caracteres de cuerpo, variables numeradas sin saltos, ni al
  principio ni al final, topes por tipo de botón— y un modelo de lenguaje las
  incumple con naturalidad aunque se le pidan. `composeTemplate` valida con
  `validateTemplate` y REINTENTA devolviéndole los errores concretos. Pedirle
  «revisá el formato» no corrige nada: hay que decirle qué regla rompió.
- **Un rechazo de Meta no es gratis**: baja la calificación de calidad de la
  cuenta y puede limitar el volumen diario. Por eso se valida antes y por eso
  enviar es un paso explícito con confirmación, no algo que pase al redactar.
- **`folder` y `category` son DOS cosas y por eso son dos columnas.** `folder` es
  la organización interna (bienvenida, renovación…); `category` es lo que se le
  declara a Meta —UTILITY o MARKETING— y define el precio por conversación y si
  hace falta consentimiento. Mezclarlas obligaría a elegir entre ordenar el
  trabajo y declarar la verdad.
- **AUTHENTICATION no se ofrece.** Es para códigos de un solo uso, con un formato
  que Meta impone, y nada de lo que este módulo manda encaja: ofrecerla sólo
  daría rechazos.
- **`example` es obligatorio cuando hay variables.** Meta rechaza sin explicar
  bien si falta. Por eso el redactor genera `variableSamples` junto con el texto:
  no son decorativos. Y cuando NO hay variables, no se manda `example` vacío —eso
  también se rechaza—.
- **Una plantilla ya enviada a Meta no se edita.** Allá el texto es inmutable una
  vez aprobado; permitir editarla acá daría dos verdades —lo que muestra el panel
  y lo que WhatsApp envía—. Se bloquea y se ofrece duplicar. Lo único editable es
  la carpeta.
- **El índice único es (clubId, name)** porque en Meta el nombre es único por
  cuenta. Sin él, dos plantillas homónimas se guardan bien acá y la segunda es
  rechazada allá.
- **`variableTokens` ata cada `{{n}}` a un dato que el motor sabe resolver.** Sin
  esa columna una plantilla se aprueba pero ningún recorrido puede alimentarla.
- **No se borra una plantilla que un recorrido usa**: el recorrido quedaría
  apuntando a algo inexistente y fallaría en el próximo envío.
- **El error de Meta se propaga TEXTUAL.** Sus rechazos son específicos y
  convertirlos en «no se pudo enviar» deja a quien corrige sin saber qué.
- **La voz sale de `institutionalVoice.js`**, la misma del Generador de
  Publicaciones y del Creador de Reels. Escribir una voz propia acá bifurcaría en
  silencio cómo habla la plataforma.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `CRM_PLATFORM_CLUB_ID` | Sitio «Origen» desde el que emite la plataforma |
| `CRM_EVENT_LOOKBACK_DAYS` | Ventana de los eventos derivados (7 por defecto) |
| `LIFECYCLE_RENEWAL_WINDOW_DAYS` | Preaviso de renovación (45) |
| `LIFECYCLE_GRACE_START_DAYS` / `LIFECYCLE_GRACE_END_DAYS` | Tramos de gracia (3 / 5) |
| `LIFECYCLE_REACTIVATED_WINDOW_DAYS` | Cuánto dura el estado «reactivado» (14) |
| `LIFECYCLE_LOW_USAGE_DAYS` | Días sin contenido para considerar bajo uso (30) |
| `CRM_ATTRIBUTION_DAYS` | Ventana de atribución de conversiones (14 por defecto) |
| `CRON_SECRET` | Protege `/api/cron/crm-automation-tick`, como el resto de los crons |

Las guardias de envío (horario, frecuencia, consentimiento, enlaces
institucionales) **no** son de entorno: viven en `PlatformConfig` bajo
`crm_automation_settings` y se editan desde el panel, sin desplegar.

### Multi-WABA: varias cuentas de WhatsApp por sitio — v4.992

Hasta v4.991 el módulo admitía UNA sola cuenta de WhatsApp Business por sitio, y
**era una restricción de la base, no una convención**: `WhatsAppConfig.clubId` es
`@unique`. Ahora conviven varias líneas independientes —el WhatsApp del
Distrito, el de un club, el de una campaña, el de la Feria de Proyectos— cada
una con su número, sus credenciales, su agente, su base de conocimiento y sus
conversaciones.

| Archivo | Qué es |
|---|---|
| `server/lib/whatsappConnections.js` | El CRITERIO. **Puro**: catálogos cerrados, saneado, resolución del entrante, herencia del agente, puerta de salida y causas de fallo |
| `server/lib/ensureWhatsAppConnectionSchema.js` | `WhatsAppConnection`, `WhatsAppConnectionAgent` y `ContactChannel` en runtime |
| `server/lib/whatsappConnectionStore.js` | La I/O y la migración PEREZOSA desde `WhatsAppConfig` |
| `server/controllers/crm/connections.controller.js` | La API del panel |
| `src/components/admin/whatsapp/WhatsAppConnections.tsx` | Las cuentas conectadas, con sus ocho acciones |

Pruebas: `npm run test:whatsapp:connections` (157 casos de criterio) y
`npm run test:whatsapp:router` (105 del CAMINO, con la base, Prisma, Meta y el
modelo sustituidos). **Ninguna necesita Postgres, credenciales ni red.**

**Reglas durables:**

- **⚠️ ESTO INVIERTE UNA DECISIÓN EXPLÍCITA, no corrige un olvido.**
  `crmTenant.js` dice textual: «La plataforma es el único remitente… No hay un
  WABA por club». Esa regla queda **superada** en lo que contradiga esto; lo que
  sigue vigente de aquella sección es todo lo demás. `resolvePlatformClubId`
  se conserva porque el motor de recorridos y las alertas todavía la usan.
- **⚠️ LA CREDENCIAL DE SALIDA NO SE DEDUCE.** Era el riesgo más caro del
  módulo: `sendWhatsAppTextMessage({ clubId })` la deducía del sitio, así que
  con dos líneas un mensaje de la Feria podía salir por el número del Distrito
  —para quien lo recibe, otra organización escribiéndole—. `sendGuard` exige la
  conexión y los tres emisores de respuesta —el agente, el chatbot y la
  bandeja— la pasan; una prueba los CUENTA. Que no se pueda deducir es la
  garantía; que la pantalla muestre «Enviar desde: …» es la comodidad.
- **⚠️ EL HILO ABIERTO ES UNO POR CONTACTO Y POR LÍNEA.** El índice de v4.696
  era `(clubId, contactId) WHERE "closedAt" IS NULL`: con dos líneas del mismo
  sitio, quien escribiera a las dos caía en el MISMO hilo, con el agente de una
  leyendo el contexto de la otra. Ahora lleva `connectionId`.
- **⚠️ `CrmConversation.connectionId` ES `NOT NULL DEFAULT ''`, NO NULLABLE**, y
  es lo que hace la migración de un solo paso: con la columna nullable las filas
  heredadas quedarían con NULL y, como en Postgres NULL nunca es igual a NULL,
  el índice nuevo **no las restringiría** — dos mensajes del mismo contacto
  abrirían dos hilos justo en las conversaciones que ya existen. Con la cadena
  vacía las heredadas comparten un único hilo entre ellas, que es lo correcto:
  son de la línea que no se sabe cuál es.
- **`WhatsAppMessageLog.connectionId` SÍ es nullable, y la distinción es
  deliberada.** Lo anterior a esta versión no tiene línea conocida y rellenarlo
  con la principal sería afirmar algo que no se sabe: un cero es una afirmación,
  un hueco es la verdad.
- **⚠️ LA MIGRACIÓN OCURRE AL LEER, NO AL DESPLEGAR** (`resolveForInbound` →
  `migrateFromLegacyConfig`). Un despliegue no escribe en la base (regla durable
  desde el 2026-07-13), así que esto no podía ser un script: la primera vez que
  llega un mensaje de la línea que ya estaba configurada se crea su conexión y
  se atiende el mensaje, **sin ninguna ventana** en la que la línea no exista en
  ninguna de las dos tablas. Idempotente por el índice único de
  `phoneNumberId`. Mismo patrón que los grupos de distribución y
  `bindLegacyEdition`.
- **`WhatsAppConfig` NO SE TOCA NI SE BORRA.** Es el respaldo del emisor y la
  vuelta atrás: mientras siga escrita, revertir es un despliegue —el webhook
  vuelve a resolver por la tabla vieja y la cuenta activa no se enteró—. No se
  retira hasta que el router lleve semanas sin un solo `unknown_phone_number_id`.
- **EL AGENTE HEREDA DEL SITIO, y esa herencia es lo único que hace que
  desplegar esto no cambie la cuenta activa.** `resolveAgent` va agente de la
  conexión → agente del sitio (`WhatsAppAgentConfig`, el de siempre) → ninguno.
  Un agente propio **APAGADO no cae al del sitio**: apagarlo es una decisión
  sobre esa línea y heredar el del sitio la desobedecería, y por eso
  `connection_disabled` es un estado distinto de `none`.
- **El historial que lee el agente y la base de conocimiento son DE LA LÍNEA.**
  Sin eso, el «Asistente Feria de Proyectos» leería lo que esa misma persona
  conversó con el Distrito y contestaría sobre otra cosa. `brainId` nulo = el
  cerebro del sitio, que es el comportamiento de siempre.
- **⚠️ UNA LÍNEA PAUSADA O CON ERROR SIGUE RECIBIENDO.** Lo que se detiene es la
  respuesta automática. Descartar el entrante sería perder lo que alguien nos
  escribió por una decisión administrativa nuestra o por un token vencido, que
  es la peor de las dos consecuencias. Sólo `active` puede enviar.
- **LA RESOLUCIÓN DEL ENTRANTE ES DETERMINISTA Y TERMINA EN EL ID.** Meta
  reintenta el webhook: dos entregas del mismo evento tienen que encaminar
  igual, o el mismo mensaje aparecería en dos organizaciones. **Nunca «la
  primera fila»**: encaminar un mensaje a una organización porque su fila salió
  primero es peor que no encaminarlo, porque no deja rastro de la equivocación.
  Y **el número receptor manda sobre la cuenta**: compartiendo WABA, el
  `phone_number_id` decide, o la Feria recibiría en el inbox del Distrito.
- **`phoneNumberId` lleva índice ÚNICO.** Es único en Meta, así que dos filas
  con el mismo número son una contradicción, no una preferencia: sin el índice,
  el desempate tendría que decidir a cuál organización pertenece un mensaje.
- **⚠️ EL SITIO SALE DEL TOKEN, NUNCA DEL CUERPO.** Si `clubId` viniera en la
  petición, acotar las conexiones a un sitio no serviría de nada. Y lo ajeno
  responde **404, no 403**: confirmar que existe es la mitad de lo que hace
  falta para ir a buscarlo.
- **EL TOKEN NUNCA VUELVE AL NAVEGADOR, NI RECORTADO.** Los 8 primeros y 4
  últimos caracteres que devolvía `getConfig` son 12 caracteres de una
  credencial. Lo que sale es `hasToken`. Y se guarda cifrado con
  `tokenCrypto.js` — **`sealToken` tolera que falte `TOKEN_ENCRYPTION_KEY`**:
  `encryptToken` LANZA sin llave, y eso no puede tumbar el guardado de una línea
  de WhatsApp; sin llave se guarda en claro —como lo hacía `WhatsAppConfig`, así
  que no se empeora nada— y **se dice**, para que alguien configure la variable.
- **⚠️ `ContactChannel` ES LO QUE EVITA DUPLICAR LA PERSONA.**
  `WhatsAppContact` tiene `@@unique([phone, clubId])`, así que la ficha es una
  por sitio y lo que se guarda por línea es el CANAL. Su `connectionId` es
  `NOT NULL DEFAULT ''` por lo mismo que el de las conversaciones. `phone`
  **no** se retira: esto se SUMA (regla aditiva).
- **⚠️ LOS ESTADOS DE ENTREGA SE CASAN ACOTADOS POR LÍNEA.** Era
  `WHERE "messageId"=$1 LIMIT 1` sin acotar por cuenta, y ese índice **no es
  único**: una colisión entre dos WABAs es improbable, pero el `LIMIT 1` la
  resolvería EN SILENCIO y hacia el lado equivocado —el estado de entrega de una
  organización escrito sobre el mensaje de otra—.
- **⚠️ Y LA VISTA PREVIA DEL ÚLTIMO MENSAJE TAMBIÉN.** La subconsulta de
  `listConversations` era `WHERE l."contactId"=c."contactId"` a secas, así que
  en un hilo de la Feria se leía el último mensaje que esa persona le mandó al
  Distrito: contenido de otra organización en una bandeja que no es la suya. Al
  agregar una consulta que cruce mensajes y conversaciones, **acotarla por
  conexión**.
- **EL WEBHOOK ES UNO Y SE DICE EN LA PANTALLA.** Una App de Meta tiene UNA URL
  de callback, así que todas las WABAs de la misma App entran por
  `/api/crm/webhook` — eso es lo que hace viable el router con un solo endpoint.
  Lo que sí es por cuenta es la **suscripción** (`POST /{waba_id}/subscribed_apps`),
  y se automatiza desde el diagnóstico. Meta la da de baja por su cuenta cuando
  el endpoint falla, y cuando pasa todo parece normal salvo que no vuelve ningún
  estado.
- **`webhookProvider` es un campo DECLARADO con catálogo cerrado.**
  `meta_cloud` es el único con adaptador. Existe para que un intermediario que
  reciba de Meta y nos reenvíe entre como un adaptador de ENTRADA sin tocar la
  resolución: lo que cambiaría es cómo llega el `phone_number_id` y cómo se
  valida la firma, no a quién pertenece el mensaje. **No se declara ningún
  proveedor sin adaptador**: sería una opción de la pantalla que no hace nada.
- **DESCONECTAR NO BORRA EL HISTORIAL.** Los mensajes y las conversaciones son
  el registro de lo que ocurrió; borrarlos dejaría sin explicación los mensajes
  que esa línea envió. Se retira la fila y el historial queda apuntando a un id
  que ya no está; la pantalla lo dice como «línea desconectada». Y si era la
  principal, se asciende otra: sin ninguna, los caminos que no eligen línea a
  mano no sabrían por dónde enviar.
- **La principal se marca con un UPDATE en DOS pasos, no con un upsert.** Su
  índice `(clubId) WHERE "isDefault"` es PARCIAL, así que un `ON CONFLICT`
  contra él tendría que repetir el predicado o la sentencia falla entera (la
  trampa de v4.648). Los índices de `ContactChannel` y
  `WhatsAppConnectionAgent` **no** son parciales, así que ahí el `ON CONFLICT`
  va a secas.
- **Las reglas de palabra clave siguen siendo del SITIO** y valen para todas sus
  líneas. Es deliberado: «horario» o «dirección» contestan lo mismo por
  cualquier número de la organización, y acotarlas por línea obligaría a
  duplicarlas. El día que haga falta, la vía es una columna `connectionId`
  nullable donde NULL siga significando «todas» (regla aditiva).
- **Los tres endpoints de `/config` se CONSERVAN** y operan sobre la línea
  principal: un navegador con el bundle anterior en caché tiene que seguir
  funcionando. Lo de `/connections` se SUMA, con las literales declaradas ANTES
  de las paramétricas (`check:routes`).
- **⚠️ EL DOBLE DE LA BASE LEE EL SQL, y leer de MENOS también miente.** Su
  primera versión sólo miraba `"col"=$n` y el módulo escribe `id=$1` sin
  comillas, así que esa condición se ignoraba: un `UPDATE … WHERE id=$1`
  tocaba **todas** las filas del sitio y `getConnection` de una conexión ajena
  devolvía la primera del sitio propio. Un doble que lee de menos afirma cosas
  que el módulo no hace — es la otra cara de la lección de v4.896.
- **El doble del modelo usa la firma REAL de `routeToModel`**, que es POSICIONAL
  (`slug, systemPrompt, userPrompt, history`) y devuelve una CADENA, no
  `{ content }`. La primera versión usó un objeto: el prompt llegaba vacío, la
  respuesta salía vacía y la prueba reportaba «no respondió» sobre un módulo que
  estaba bien (v4.901).
- **⚠️ AL PROBAR EL DETERMINISMO, BARAJAR MUCHAS VECES.** Con dos filas,
  comparar un orden contra el inverso acierta la mitad de las veces: la prueba
  pasaría por suerte y sería INESTABLE, que es peor que no tenerla. Son seis
  filas y treinta barajadas reproducibles —no `Math.random()`, o un fallo no se
  podría volver a producir para diagnosticarlo—.
- **Las tres tablas viven fuera de Prisma** y están en la lista del guardián de
  `db:push`. `WhatsAppConnection` lleva los tokens de todas las líneas del
  ecosistema: un `db push` que la borre no se arregla con un respaldo del
  código, hay que volver a generar cada token en Meta Business.

**Pendientes conocidos:** el filtro de la bandeja y el «Enviar desde» están
cableados y **no se comprueban en un navegador** — al tocar esa pantalla, mirarla
(la lección de v4.717); ~~`sendCampaign` todavía no elige línea~~ y ~~las
plantillas y las campañas se comparten entre las líneas de un mismo sitio~~ —
**RESUELTOS en v4.1060**, ver la sección siguiente; y **no hay observabilidad
por línea** (P3): los
datos están en `CrmWebhookEvent` y `CrmOutboundLog` con su `connectionId`, falta
el panel que los agregue.

⚠️ **Y una advertencia sobre el pedido que originó esto:** se pidió adaptar «el
webhook centralizado ya integrado con Balcony». **No existe ninguna referencia a
Balcony en el repositorio** —se buscó en todo el árbol, sin distinguir
mayúsculas—. El webhook centralizado que existe es nuestro (`/api/crm/webhook`) y
ya resolvía por `phone_number_id`; la otra pasarela del módulo habla con
**Evolution API**, que es otro camino y no pasa por la Cloud API de Meta. El
router se construyó sobre el webhook que existe, con `webhookProvider` como
costura declarada para que un intermediario entre después sin tocar el núcleo.

### Cada cuenta conectada funciona por su cuenta — v4.1060

v4.992 resolvió la ENTRADA —qué línea recibió un mensaje y con qué agente se
contesta— y dejó fuera todo lo demás: las plantillas, las campañas, la
configuración de la IA y las respuestas del chat seguían deduciéndose del SITIO.
Con las dos cuentas del pedido conectadas —Club Platform para Rotary y Feria de
Proyectos Rotary Colombia— eso significa que a quien le escribió a la Feria le
contestaba el Distrito.

| Archivo | Qué es |
|---|---|
| `server/lib/whatsappScope.js` | El CRITERIO. **Puro**: catálogo de entidades acotadas, catálogo CERRADO de bloqueos con su SALIDA, qué cuenta manda y por qué, identidad de una plantilla, qué ve cada cuenta, la puerta de envío y la atribución de lo heredado |
| `server/lib/whatsappScopeStore.js` | La I/O: `resolveScope`, `connectionForEntity`, `adoptLegacyRows`. Nunca lanza |
| `src/components/admin/whatsapp/WhatsAppAccountPicker.tsx` | EL selector. **Uno**, montado por las cinco pantallas, con `useWhatsAppAccounts` y `accountLabel` |
| `uniq_wa_template_scope` (`ensureAutomationSchema.js`) | La llave real de una plantilla: `(clubId, COALESCE(wabaId,''), name, language)` |

Pruebas: `npm run test:whatsapp:scope` (158 casos: criterio, cableado leído de
los archivos y el esquema, **sin base, credenciales ni red**), más
`test:whatsapp:router` (105) y `test:whatsapp:connections` (157), que siguen
verdes: la entrada no cambió. Verificadas a la inversa sobre nueve defectos.

**Reglas durables:**

- **⚠️ `connectionId` NULL ES «NO SE SABE», NUNCA «LA PRINCIPAL».** Es la regla
  de la que cuelga todo lo demás y es la de v4.1009 aplicada al dinero ajeno:
  rellenarlo con la cuenta por defecto AFIRMARÍA que esa plantilla vive en esa
  WABA, y si no vive, Meta la rechaza con «template name does not exist» —un
  error que no dice de qué cuenta habla— una vez por contacto. Lo heredado se le
  MUESTRA a la principal, marcado y contado (`X-WA-Unassigned`), y a ninguna
  otra cuenta.
- **⚠️ UNA PLANTILLA SE IDENTIFICA POR (WABA, NOMBRE, IDIOMA), NO POR NOMBRE, y
  ahí estaba el bloqueo real del pedido.** `WhatsAppTemplate_club_name_key` era
  `UNIQUE(clubId, name)`: con dos WABAs en el mismo sitio, la «bienvenida» de la
  Feria chocaba con la homónima del Distrito y **no se podía importar**. Meta
  permite el mismo `name` en dos WABAs y son plantillas distintas —distinto id,
  distinto estado de revisión, distinto cuerpo—. Retirar el índice **no pierde
  ninguna fila** (un índice no es dato) y **no está declarado en
  `schema.prisma`**, así que `db push` no lo recrea; el que lo reemplaza es más
  LAXO, o sea que crearlo nunca puede fallar. Va con `COALESCE("wabaId",'')`
  porque en Postgres NULL nunca es igual a NULL: sin eso, dos plantillas
  heredadas homónimas —que es justo lo que hay hoy— no chocarían entre sí.
- **⚠️ EL BORRADO DE UNA PLANTILLA EN META ES POR NOMBRE**, así que la
  confirmación DICE de qué cuenta se está borrando. Con la cuenta equivocada
  seleccionada se destruye la plantilla homónima de otra organización, y eso no
  se deshace desde la plataforma.
- **⚠️ LA CAMPAÑA PERSISTE SU EMISORA Y EL ENVÍO NO MIRA LA PANTALLA.**
  `createCampaign` graba `connectionId` y `sendCampaign` lo lee con
  `connectionForEntity(clubId, campaign.connectionId)` — **nunca**
  `req.body.connectionId`. Si el envío dependiera de lo seleccionado, una
  campaña creada hoy saldría por otro número dentro de tres semanas, y lo que
  cambia es en la cuenta de qué organización aparece. Lo fija una prueba que lee
  el cuerpo del manejador.
- **⚠️ LA RESPUESTA DEL CHAT SALE POR LA LÍNEA QUE RECIBIÓ, y ése era el defecto
  más caro.** `sendMessageToContact` leía `getClubConfig(clubId)` —la fila única
  de `WhatsAppConfig`—, así que TODA respuesta manual salía por la línea
  heredada. Ahora resuelve primero la conversación abierta del contacto
  (`CrmConversation.connectionId`, `closedAt IS NULL`) y **la conversación manda
  sobre el selector**: al revés, elegir una cuenta cambiaría por dónde sale la
  respuesta a un hilo que llegó por otro número. La cuenta pedida sólo decide
  cuando NO hay hilo, que es el único caso en que hay algo que elegir. Si la
  línea del hilo se desconectó **no se responde por otra**: se dice, con su
  salida.
- **`getClubConfig` sobrevive SÓLO como respaldo, detrás de la resolución.** Sin
  él, desplegar multi-cuenta dejaría sin responder a quien no migró. Una prueba
  exige que se lea UNA vez y **después** de tomar el número de la conexión.
- **⚠️ «PRINCIPAL» ES UN VALOR POR DEFECTO, NO UN RESPALDO** (punto 8 del
  pedido). Decide la selección INICIAL y nada más: una entidad que declara su
  línea y esa línea ya no está **no cae a la principal** —sería atribuirle a otra
  cuenta el trabajo de una desconectada—, y pedir una cuenta que no existe
  responde 404 en vez de servir los datos de otra bajo el rótulo de la pedida.
  Con varias cuentas y ninguna marcada **no se elige por el orden de la base**:
  sería servir una cuenta distinta en dos visitas del mismo panel (v4.744).
- **⚠️ UN FALLO DE UNA CUENTA NO ALCANZA A LAS DEMÁS.** La credencial se abre POR
  CONEXIÓN en el momento de usarla (`openToken(conn.accessTokenEnc)`), así que un
  token vencido en el Distrito deja al Distrito sin responder y no toca a la
  Feria. El bloqueo viaja con su motivo Y SU SALIDA: un catálogo CERRADO donde
  **cada entrada tiene `fix`** — uno cuya única respuesta es «no se puede» se lee
  como una avería (v4.1008), y una prueba lo recorre entero.
- **⚠️ LA MIGRACIÓN SE MIRA, NO SE ADIVINA, Y OCURRE AL LEER.** Un despliegue no
  escribe en la base (regla durable desde el 2026-07-13), así que la atribución
  es perezosa —patrón de `migrateFromLegacyConfig` (v4.992) y de los grupos de
  distribución (v4.876)— y **sólo se escribe lo seguro**: que la WABA de la fila
  case con una conexión, que la WABA heredada case con exactamente una, o que
  haya una sola cuenta en el sitio. Dos líneas de la misma WABA heredada son
  AMBIGUAS y se dejan sin atribuir. Lo que no se puede determinar **se cuenta y
  se dice** (`unassigned`), nunca se atribuye a la principal «por si acaso»: es
  el punto 11 del pedido con sus palabras.
- **⚠️ UNA CAMPAÑA HEREDADA NO DESAPARECE AL ELEGIR UNA CUENTA.** El filtro la
  muestra bajo la principal y la cuenta aparte; hacerla desaparecer sería
  indistinguible de haberla borrado, que es justo lo que el pedido prohíbe.
- **⚠️ UNA PLANTILLA HEREDADA NO BLOQUEA EL ENVÍO DESDE LA PRINCIPAL, y es
  deliberado.** Hoy TODAS son así y todas las campañas que funcionan salen por
  esa línea: bloquearlas rompería lo que anda para corregir un dato que la
  migración perezosa resuelve sola. Desde cualquier OTRA cuenta sí bloquea —ahí
  no sabemos si la plantilla existe en esa WABA, y descubrirlo sería un rechazo
  de Meta por cada contacto—.
- **EL AGENTE DE IA ES POR LÍNEA Y HEREDA** (`WhatsAppConnectionAgent`, v4.992).
  Lo que esta versión agrega es la PANTALLA: crear un agente propio, volver a
  heredar el del sitio y el diagnóstico por línea. La semántica no se tocó —un
  agente propio APAGADO significa «esta línea no contesta» y **no** cae al del
  sitio; sólo la AUSENCIA de agente propio hereda—, que es lo único que hace que
  desplegar esto no cambie la cuenta que ya está activa.
- **EL SELECTOR ES UNO Y LA CONSULTA DEL CATÁLOGO VIVE DENTRO DE ÉL.** Escrito
  en cada pantalla, la sexta se olvida y el selector sale vacío sin que nada
  avise — la lección de la casilla de distritos (v4.748), del selector de pools
  (v4.877) y del `SavedOutroPicker` (v4.1040). Una prueba cuenta que ninguna de
  las cinco pantallas conserve su propia consulta a `crm/connections`. Pedirle
  algo a UNA conexión concreta —su agente, su diagnóstico— sí es legítimo: eso
  lleva la conexión en la ruta y no es el catálogo.
- **⚠️ CAMBIAR DE CUENTA CON TRABAJO SIN GUARDAR AVISA** (`dirty`, punto 10 del
  pedido). Sin eso, cambiar de línea en Automatización tira la configuración que
  se estaba escribiendo y no hay forma de recuperarla.
- **UN SOLO CONTROL POR DATO.** «Enviar desde» en el formulario de una campaña
  es de SÓLO LECTURA y la cuenta se cambia con el selector de arriba: un segundo
  control daría dos verdades sobre el mismo dato. Lo fija una prueba que cuenta
  los selectores montados en la pantalla: **uno**.
- **⚠️ EN ANALÍTICAS EL VALOR POR DEFECTO ES «TODAS», al revés que en las
  pantallas que OPERAN sobre una cuenta.** Abrirlas ya acotadas escondería, sin
  que nadie lo pidiera, lo que el panel venía mostrando — y alguien concluiría
  que se perdieron mensajes. Acotar es un gesto EXPRESO.
- **⚠️ LO QUE NO SE PUEDE ACOTAR SE DICE** (`scopeNote`). Los recorridos y el
  presupuesto son del SITIO: atribuir las conversiones de un recorrido a una
  línea sería inventar la asociación. El filtro por línea alcanza a lo que
  DECLARA su línea (`WhatsAppMessageLog.connectionId`,
  `CrmConversation.connectionId`) y es ADITIVO: sin `connectionId` se cuenta
  todo, que es como se comportaba. **Lo anterior a multi-cuenta no declara línea
  y por eso NO entra en el filtro**: contarlo en una cuenta concreta afirmaría
  que salió por ese número, y no se sabe.
- **EL TOKEN NO SALE AL NAVEGADOR, NI RECORTADO** (v4.992). `describeConnection`
  compone lo que la pantalla pinta —nombre, teléfono, WABA, estado— y nada más;
  una prueba busca la credencial dentro de lo que compone.
- **⚠️ LA COLUMNA NUEVA VA ENUMERADA EN EL ATAJO DEL ENSURE.** `CREATE TABLE IF
  NOT EXISTS` no amplía nada y la base de producción ya tiene estas tablas: sin
  enumerarla, el `ALTER` no corre JAMÁS y el INSERT falla con «column does not
  exist», en silencio (la trampa de v4.908). Una prueba recorre **todos** los
  `ADD COLUMN` del archivo y exige cada uno en `EXPECTED_COLUMNS`.
- **⚠️ Y VA DECLARADA TAMBIÉN EN `schema.prisma`, que es lo contrario de lo
  habitual.** La regla de `logo_intl` (v4.699) prohíbe declarar en Prisma una
  columna que todavía no existe porque cualquier `findMany` **sin `select`** la
  pediría y respondería 500; acá no aplica y hay que saber por qué: los dos
  únicos consumidores Prisma de estos modelos son un `count` y un `aggregate`
  con `_sum` explícito, envueltos en `safe(…)` con respaldo. Lo que SÍ manda es
  la regla de `folderId` (v4.738): el guardián de `db:push` compara TABLAS, no
  columnas, así que una columna que existiera sólo en el ensure la borraría el
  primer push **sin que nada avise**. Mismo precedente que `listIds` (v4.921).
  Al agregar una columna a una tabla que Prisma sí lee sin `select`, la decisión
  se invierte.
- **NI UNA COMILLA INVERTIDA DENTRO DE UN `db.query(\`…\`)`, tampoco en un
  comentario del SQL.** Van cinco (v4.721.1, v4.847, v4.998, v4.1017 y ésta, que
  se pagó al escribir el comentario del índice nuevo): cierra el literal a mitad
  y el módulo entero deja de parsear. Lo atrapa `check:syntax`, y ahora también
  una prueba de esta batería.
- **⚠️ EL CRITERIO PUEDE QUEDAR ENTERO MIENTRAS EL CABLEADO SE SEPARA, y ese
  fallo es MUDO**: el mensaje sale igual, por el número de otra organización. Es
  la lección de v4.744 y v4.889, y por eso la mitad de `test:whatsapp:scope` LEE
  LOS ARCHIVOS —que la credencial salga de la conexión y no del sitio, que la
  campaña lea su emisora persistida, que el índice viejo no vuelva—.

**Pendientes conocidos:** **Recorridos (Journeys) y Ciclo de vida no tienen
selector de cuenta** —`JourneyBuilder.tsx` y `LifecycleBoard.tsx` no se
tocaron—: un recorrido sigue siendo del SITIO y sus pasos salen por la línea que
resuelva el envío, que es lo que hay que acotar en la vuelta siguiente y es
además el motivo por el que sus conversiones no se filtran en analíticas. Las
pantallas nuevas **no se comprueban en un navegador** — al tocar su maquetación,
mirarla (la lección de v4.717). No hay **pantalla de revisión** para lo que la
migración no pudo atribuir: se cuenta y se avisa en cada listado, y falta el
sitio donde asignarlo a mano. Y `sendCampaign` **conserva su propia copia de la
lógica de envío** (deuda declarada desde v4.701): al corregir algo del envío,
mirar los dos sitios.


### Auditoría y diagnóstico (v4.702)

El módulo no dejaba **ningún rastro persistente**. Todo iba a `console.warn` /
`console.error`, efímeros en Vercel, así que «¿Meta mandó los estados del 3/8?»
no tenía respuesta posible: no había dónde mirar. Eso era el defecto de fondo
detrás de «las conversaciones y las campañas no reflejan lo esperado» — no se
podía diagnosticar nada retroactivamente.

| Archivo | Qué es |
|---|---|
| `server/lib/crmWebhookAudit.js` | `CrmWebhookEvent` + `CrmOutboundLog`: persistencia, firma y consultas |
| `server/lib/crmDiagnostics.js` | Comprobaciones en vivo contra Meta y contra nuestra base |
| `server/controllers/crm/diagnostics.controller.js` | API del panel (sólo operador de plataforma) |
| `src/components/admin/whatsapp/CrmDiagnostics.tsx` | La pestaña «Diagnóstico» |

Pruebas: `npm run test:crm:diag` (69 casos, incluidas seis de punta a punta que
llaman al `handleWebhook` real). Misma exigencia que `test:crm`: base vacía.

**Reglas durables:**

- **La fila del webhook se abre ANTES de procesar y se cierra después de
  responder el 200.** Antes, porque un fallo a mitad de proceso tiene que dejar
  rastro —es justo el caso que hay que diagnosticar—; después del 200, porque la
  bitácora es registro nuestro y no puede sumar latencia al acuse que Meta
  espera. Meta da de baja la suscripción cuando el endpoint tarda.
- **El payload se guarda COMPLETO.** El campo que falta es siempre el que no se
  guardó. Es `jsonb`, así que Postgres normaliza el orden de las claves: se
  conserva el contenido, no los bytes.
- **Un `phoneNumberId` que no coincide se rescata por el WABA.** Era el descarte
  total y silencioso: el identificador guardado se queda viejo cuando alguien
  migra el número o rehace la conexión, y entonces mensajes Y estados se
  perdían. `entry[0].id` es el mismo dato en los dos lados y sobrevive a eso.
  Si aun así no se encamina, queda la fila con su payload y salta
  `webhook_unrouted` — nunca un `return` mudo.
- **Un estado sin envío conocido se CUENTA, no se saltea.** Era un `continue`
  mudo, y es exactamente el caso en que una campaña queda en «0 entregados»
  pareciendo un fallo de entrega. El lote se marca `partial` y dice cuántos.
- **Toda salida hacia Meta pasa por `metaApiCall` y queda registrada** con
  petición, respuesta y `code`. El error de Meta se propaga con `metaCode` /
  `metaDetails`: convertirlo en «no se pudo enviar» deja a quien corrige sin
  saber qué. Hay DOS `metaApiCall` (controlador y `whatsappSender.js`) porque
  hay dos caminos de envío — al tocar uno, mirar el otro.
- **`verifySignature` devuelve `null` cuando no se puede comprobar**, que es
  DISTINTO de `false`. Decir «firma inválida» sin haberla verificado manda a
  buscar un problema de seguridad inexistente. El cuerpo crudo se captura desde
  el `verify` de `express.json` y **sólo para la ruta del webhook**: guardarlo
  para todas duplicaría en memoria cada subida de 25 MB.
- **Una comprobación tiene CUATRO estados**, y `unknown` no es un tipo de «bien».
  Presentar «no se pudo comprobar» como verde manda a buscar el problema donde
  no está. Se pinta distinto a propósito.
- **`GET /{waba}/subscribed_apps` es la comprobación que faltaba.** Meta da de
  baja la suscripción por su cuenta cuando el endpoint falla o tarda; cuando
  pasa, todo parece normal —los envíos salen y se entregan— pero no vuelve
  ningún estado. Sin esta consulta la avería es indistinguible de un problema de
  entrega.
- **«Salieron N y no volvió NINGUNA confirmación» es un diagnóstico distinto de
  «se entregaron pocas».** El primero no es un problema de entrega: los mensajes
  llegaron y lo que no vuelve es la respuesta de Meta.
- **El panel es del OPERADOR de la plataforma.** Lleva identificadores de Meta y
  payloads crudos: infraestructura compartida, no datos de una organización. Lo
  comprueba el controlador, no sólo la pantalla.
- **El diagnóstico es de sólo lectura** salvo la prueba controlada, que manda un
  mensaje real y lo avisa. Un panel que cambia cosas al mirarlas no sirve para
  diagnosticar. Y un 200 en esa prueba confirma que Meta aceptó la llamada, **no**
  que entregó: fuera de la ventana de 24 h acepta y no entrega.
- **`auditSummary` incluye los webhooks con `clubId IS NULL`.** Son justamente
  los que no se pudieron encaminar: filtrarlos escondería la avería que el
  resumen existe para mostrar.

**Estado:** las cuatro fases del pedido están implementadas.

**Pendientes conocidos:** `WhatsAppChat.tsx` se conserva y convive con la bandeja
—es el chat libre de siempre, sin estado ni asignación—; unificarlos cambia una
pantalla que el equipo usa a diario. `sendCampaign` mantiene su copia de la
lógica de envío (ver arriba). Y el chatbot sigue **apagado** hasta que alguien lo
encienda a propósito.
