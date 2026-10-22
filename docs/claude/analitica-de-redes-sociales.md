<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Analítica de Redes Sociales — v4.1053

Facebook e Instagram con **histórico propio**: la plataforma sincroniza las
métricas de Meta día a día y el dashboard lee de esa base, no del proveedor.

| Archivo | Qué es |
|---|---|
| `server/lib/socialMetricsSpec.js` | El CRITERIO. **Puro**: la matriz de métricas con su endpoint, permiso, período y ventana de histórico; fechas, rangos, troceo, agregación, comparación y clasificación del fallo de Meta |
| `server/lib/ensureSocialAnalyticsSchema.js` | Las cuatro tablas en runtime |
| `server/lib/metaInsights.js` | La I/O contra la Graph API: tope de tiempo, reintento acotado, paginación y el SONDEO de qué métricas responde un token |
| `server/lib/socialAnalyticsSync.js` | La sincronización: reclamo, backfill, incremental y el barrido del cron |
| `server/lib/socialAnalyticsStore.js` | La lectura: series, totales y contenido, agregados en SQL |
| `server/controllers/socialAnalyticsController.js` | La API interna, con el alcance resuelto en UN punto |
| `src/components/admin/analytics/SocialAnalytics.tsx` | El panel, dentro de Analytics |
| `GET /api/cron/social-analytics-tick` | El barrido, cada 6 horas |

Pruebas: `npm run test:social:analytics` (150 casos: criterio y cableado leído
de los archivos, **sin base, credenciales ni red**). Verificadas a la inversa
sobre los cinco puntos que sostienen el módulo.

**Reglas durables:**

- **⚠️ EL PANEL NO CONSULTA A META, Y DE ESO CUELGA TODO LO DEMÁS.** Con una
  llamada por tarjeta, abrir el dashboard serían decenas de consultas, la
  ventana de la aplicación se agotaría en una tarde y **el histórico no
  existiría**: al deprecar Meta una métrica se perdería también el pasado. El
  sincronizador construye la serie; el dashboard sólo la lee — por eso abre
  aunque Meta esté caído o el token haya vencido, y lo DICE.
- **⚠️ LA INTEGRACIÓN QUE YA FUNCIONA NO SE RECONSTRUYE: SE EXTIENDE.** El OAuth,
  el descubrimiento de Páginas, el cifrado del token y la publicación son los de
  siempre y no se tocaron. Lo único que cambió del camino existente son DOS
  líneas: `read_insights` e `instagram_manage_insights` **agregados** a
  `REQUIRED_SCOPES`, y `tokenOf` exportado para no escribir un segundo
  descifrado. Un segundo flujo de OAuth daría dos tokens del mismo usuario para
  la misma Página y ninguna forma de saber cuál manda. Lo fija una prueba que
  cuenta `buildAuthUrl` y comprueba que los siete permisos de siempre sigan ahí.
- **⚠️ PEDIR UN PERMISO NO LO CONCEDE HACIA ATRÁS.** Toda cuenta conectada antes
  de v4.1053 conserva su token con los permisos de entonces: **hay que
  RECONECTARLA**. `insightsReadiness` lo detecta por la lista guardada y el panel
  lo dice cuenta por cuenta, con su salida. Presentar «faltan permisos» como «0
  visualizaciones» es exactamente lo que el punto 14 del pedido prohíbe.
- **⚠️ Y ESA PUERTA SIRVE PARA EL NEGATIVO, NO PARA EL POSITIVO.** `metaSync`
  guarda en `permissions` lo que se PIDIÓ (`META_SCOPES`), no lo que Meta
  concedió: si la aplicación todavía no tiene aprobado `read_insights` en App
  Review, la lista lo llevará igual. Quien de verdad decide es el error de Meta,
  que `classifyMetaError` traduce a `no_permission` con el mismo motivo. **No
  leerla como una verificación de permisos.**
- **⚠️ LA VERSIÓN DE LA GRAPH API ESTÁ AISLADA DEL CAMINO QUE PUBLICA**
  (`META_INSIGHTS_GRAPH_VERSION`, `v23.0` por defecto; el publicador sigue en
  `v18.0`). Compartir la constante haría que subirla para LEER moviera el camino
  que ESCRIBE en la cuenta de una institución — que hoy funciona y nadie pidió
  tocar. Que la v18.0 esté vencida es una deuda declarada del módulo de
  publicación, no algo que esta versión resuelva de refilón.
- **⚠️ EL CATÁLOGO DE MÉTRICAS ES UNA HIPÓTESIS; EL SONDEO ES LA VERDAD.** Meta
  retiró ~85 métricas de alcance e impresiones el 15/06/2026 y una lista escrita
  en el código se queda vieja sola. `probeAccount` pregunta **métrica por
  métrica** contra el token real —en lote, una muerta tumba la consulta entera—
  y devuelve qué responde de verdad. Cuesta una llamada por métrica, así que se
  pide a propósito: no corre en cada vuelta.
- **⚠️ NO SE PROGRAMA CONTRA LOS NOMBRES QUE SE VEN EN LA PANTALLA DE META.**
  Cada entrada declara su endpoint, su campo real, su permiso, su período y su
  ventana de histórico; una deprecada se CONSERVA declarada —con su fecha y su
  reemplazo— y **no entra en la lista que se le pide** al proveedor. Lo que la
  UI de Facebook muestra y la API no expone vive en `UI_ONLY_METRICS` **con su
  motivo**, nunca aproximado (punto 16 del pedido).
- **⚠️ LA DEMOGRAFÍA NO ES UNA SERIE Y POR ESO NO ESTÁ EN `METRICS`.** Las
  aristas `audience_*` de Instagram son de período `lifetime` y **no aceptan
  `since`/`until`**: devuelven una FOTO del momento, así que no hay día al que
  atribuirlas; las de Facebook entraron en la depreciación de junio. Guardarlas
  como serie sería inventarles la fecha y pintarlas contra un rango haría creer
  que responden al período elegido. La pestaña «Audiencia» las DECLARA como
  previstas y no disponibles. Cuando se implementen, van como INSTANTÁNEA con su
  fecha de captura, no como una fila de `SocialDailyMetric`.
- **⚠️ INSTAGRAM NO PUEDE TENER BACKFILL A LA FECHA DE INICIO, y está medido.**
  `follower_count` guarda **30 días** y `followers` sólo el valor de hoy: pedirle
  julio devuelve **vacío, no un error**, y un backfill ingenuo lo reintentaría en
  cada vuelta para siempre. `effectiveStart` acota la ventana de cada métrica y
  **devuelve el MOTIVO**, que es lo que el panel enseña en vez de un cero.
  Facebook sí admite ~2 años. El histórico de Instagram se construye hacia
  adelante, capturándolo cada día — que es todo el sentido del cron.
- **⚠️ META ACOTA UNA CONSULTA A 93 DÍAS, y pasarse NO da error.** Devuelve menos
  de lo pedido y el histórico queda con un hueco que nadie ve. `splitWindows`
  trocea siempre, y las ventanas son CONTIGUAS: un solape duplicaría el día y un
  hueco lo perdería. **El signo del corte estuvo invertido** en la primera
  versión y devolvía UNA ventana de 257 días — lo destapó la prueba, no la
  lectura.
- **⚠️ `null` NO ES `0`, Y ES EL PUNTO 14 DEL PEDIDO.** `aggregate` devuelve
  `null` cuando no hay ningún dato; un cero MEDIDO sí es cero. **`num(null)` es
  0 en JavaScript** —la trampa que este repositorio ya pagó con `previewSec`
  (v4.954) y con la duración del máster (v4.1049)— y volvió a colarse acá: el
  helper rechaza `null`, `undefined` y `''` explícitamente. Un KPI sin dato **no
  se pinta**: se omite y la cobertura lo explica.
- **⚠️ UN PORCENTAJE QUE NO SE PUEDE CALCULAR NO SE INVENTA.** De 0 a 40 no es
  «+100 %» ni «+∞ %»: se devuelve la variación absoluta con `percent: null` y
  `basis: 'sin_base'`, y la pantalla dice «sin base de comparación». Igual el
  engagement rate sin denominador.
- **EL ESTADO DE LA SINCRONIZACIÓN ES UN CATÁLOGO CERRADO** (`SYNC_STATES`), y
  es lo que distingue «no hubo actividad» de «faltan permisos», de «el token
  venció» y de «Meta no contestó» — tres cosas que se corrigen en sitios
  distintos. Ante un código que no se reconoce, `error`: un estado desconocido
  **no se disfraza** de uno conocido. Y sólo se reintenta lo que puede salir
  distinto (`rate_limited`, `provider_down`): insistir con un permiso que falta
  gasta la ventana de Meta para recibir siempre el mismo rechazo.
- **⚠️ EL AISLAMIENTO VA EN EL `WHERE`, NUNCA EN LA PANTALLA.** Es la exigencia
  literal del pedido —«Nunca mezclar métricas entre tenants»— y el error más caro
  del módulo. El alcance se resuelve en UN punto (`resolveScope` →
  `accountsInScope`) por el que pasan las ocho rutas; con una resolución por
  ruta, la octava se olvida y el fallo es MUDO: contesta de más. Una cuenta ajena
  responde **404, no 403** — confirmar que existe es la mitad de lo que hace
  falta para ir a buscarla. Y el sitio sale del TOKEN: si `clubId` viniera del
  cuerpo, acotar no serviría de nada (v4.868).
- **⚠️ `[]` NO ES `null`.** `null` es «sin restricción» y **sólo lo recibe el
  operador de la plataforma**; `[]` es «ninguno» —una sesión sin sitio— y fuerza
  el vacío. Se escribe explícito en el SQL en vez de apoyarse en que
  `= ANY('{}')` da falso en Postgres: la regla que sostiene el aislamiento no
  puede depender de que quien la lea conozca esa semántica (la lección de
  `mailboxScopeFor`, v4.932).
- **⚠️ EL TOKEN NO SALE AL NAVEGADOR, NI RECORTADO.** El listado de cuentas
  enumera sus columnas y **no selecciona la credencial**; `publicAccount` es el
  único punto que compone la respuesta y no la incluye. El token se lee APARTE y
  sólo en el momento de consultar a Meta, reutilizando el `tokenOf` que ya
  existía — no un segundo descifrado.
- **⚠️ LA IDEMPOTENCIA ES DEL ÍNDICE ÚNICO** (cuenta × día × métrica), no de una
  lectura previa: entre un `SELECT` y un `INSERT` caben dos vueltas del cron, y
  sin él resincronizar el mismo rango dejaría la serie contando doble sin que
  nadie lo viera hasta mirar un total que no cuadra. Las tres columnas son
  `NOT NULL`, así que **no es parcial** y el `ON CONFLICT` va a secas (v4.648).
- **⚠️ LA CUENTA SE RECLAMA ANTES DE LLAMAR A META.** El precio de que dos
  vueltas sincronizaran la misma no es una fila duplicada —de eso se ocupa el
  `ON CONFLICT`— sino gastar dos veces la ventana de consultas y que la segunda
  reciba un límite que retrasa a **todas** las cuentas del ecosistema. El reclamo
  VENCE (`CLAIM_TTL_MIN`): una corrida que murió a mitad no bloquea para siempre,
  y todo final de intento lo libera con su motivo.
- **LA INCREMENTAL ARRANCA CON UN DÍA DE SOLAPE.** Meta consolida la cifra del
  mismo día a lo largo de la jornada: sin el solape, el último día quedaría
  congelado en el valor parcial que tenía cuando se sincronizó.
- **⚠️ CADA 6 HORAS, NO CADA MINUTO.** Las métricas diarias tienen resolución de
  DÍA: preguntar sesenta veces por hora no adelanta un número y sí gasta la
  ventana de la aplicación. El barrido tiene presupuesto de tiempo —la función
  corta a los 300 s— y lo que no entra se devuelve en `pending`, nunca se pierde
  en silencio. Una excepción de una cuenta no se lleva el barrido.
- **NINGUNA CONSULTA A META SIN TOPE DE TIEMPO** (regla de v4.875): esto corre
  dentro de un cron y dentro del sondeo de una pantalla. El reintento es acotado,
  con espera creciente y **jitter** —sin él, todas las cuentas reintentarían a la
  vez y el límite se volvería permanente—.
- **LA AGREGACIÓN OCURRE EN LA BASE.** Con las filas crudas, un rango de un año
  por cuenta serían miles de filas por visita para calcular cuatro números. Un
  flujo se SUMA y un acumulado toma el ÚLTIMO valor —`ARRAY_AGG ... ORDER BY
  "metricDate" DESC`—: sumar seguidores día a día daría una cifra absurda.
- **⚠️ EL VÍNCULO CON LO QUE LA PLATAFORMA PUBLICÓ YA EXISTÍA.**
  `ContentDistribution.externalId` guarda el id que devolvió Meta desde v4.1013,
  así que saber qué contenido generado por Club Platform rinde mejor (punto 10
  del pedido) **no necesitó ninguna tabla nueva**: `linkToDistribution` casa por
  ese id y la ficha de cada pieza dice de dónde salió. El upsert conserva el
  vínculo con `COALESCE`, así que una pasada que no lo resuelva no lo borra.
- **LAS CUATRO TABLAS VIVEN FUERA DE PRISMA** y están en la lista del guardián de
  `db:push`. `SocialAccount` **no gana ni una columna**: se consulta con
  `findMany` sin `select` en el camino que PUBLICA, y una columna declarada y
  todavía inexistente lo dejaría en 500 desde el primer despliegue (regla de
  `logo_intl`, v4.699).
- **⚠️ EL MÓDULO VIEJO DE `/insights` SE CONSERVA ENTERO.** Sus tres rutas siguen
  sirviendo a cualquier navegador con el bundle anterior en caché; lo nuevo vive
  bajo `/analytics/*`. Aquél consulta en vivo y guarda una foto **sin fecha de
  métrica** (`SocialMetricSnapshot` no tiene `metricDate`), que es justamente por
  qué no se podía construir una serie idempotente sobre él.
- **⚠️ UN `req.params` QUE UN MANEJADOR LEE Y LA RUTA NO DECLARA LLEGA
  `undefined`, y el fallo es MUDO**: el manejador busca por un id vacío y
  contesta 404 sobre una cuenta que sí existe. No lo ve `check:routes` —la ruta
  está bien formada— ni el typecheck —es `.js` fuera de `src`—. Ocurrió en dos de
  las ocho rutas al registrarlas y lo atrapó una prueba que cruza cada ruta con
  los `req.params` de su manejador.
- **EL PANEL PINTA; NO DECIDE.** Los KPIs con su comparación, el estado de cada
  sincronización, el motivo de lo que falta y su salida viajan RESUELTOS. Con dos
  criterios, la pantalla afirmaría un número que la API no respalda.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `META_INSIGHTS_GRAPH_VERSION` | La versión de la Graph API para LEER (default `v23.0`). Aislada de la del publicador |
| `SOCIAL_ANALYTICS_START` | Desde cuándo se construye el histórico (default `2026-07-01`) |
| `META_INSIGHTS_TIMEOUT_MS` · `META_INSIGHTS_MAX_RETRIES` | Tope de cada consulta y del reintento |
| `SOCIAL_ANALYTICS_CLAIM_MIN` | Cuánto vale un reclamo antes de vencer (15) |
| `SOCIAL_ANALYTICS_CONTENT_BUDGET` | Cuántas piezas se miden por vuelta (25) |
| `CRON_SECRET` | Protege `/api/cron/social-analytics-tick`, igual que el resto |

**Pendientes conocidos:** los permisos `read_insights` e
`instagram_manage_insights` **pueden exigir App Review** de Meta antes de que se
concedan fuera de los administradores de la aplicación — hasta entonces sólo
responderán para las cuentas cuyo usuario sea admin/tester de la app, y el panel
lo dirá cuenta por cuenta con su motivo. La **demografía de la audiencia** está
declarada y no implementada, por lo dicho arriba. El **sondeo de métricas**
(`/analytics/probe/:accountId`) existe en la API y **todavía no tiene botón en la
pantalla**: hoy se llama a mano, y es lo que hay que correr para confirmar qué
responde de verdad un token real — el catálogo es una hipótesis hasta entonces.
Y el panel **no se comprueba en un navegador**: al tocar su maquetación, mirarla
(la lección de v4.717).

### La analítica de redes tiene su entrada en el menú (v4.1054)

Pedido con la barra lateral delante: *«Agrega este menú en el menú de la barra
lateral izquierda, debajo de Analíticas»*. La vista existía desde v4.1053 y
había que saber que existía: se entraba a Analytics y se cambiaba de pestaña.

| Pieza | Qué es |
|---|---|
| `src/lib/adminMenu.ts` | El CRITERIO. **Puro**: partir una entrada en ruta y consulta, si describe la dirección que se mira, y cuál gana cuando dos casan |
| La entrada de `AdminLayout.tsx` | «Analítica de Redes Sociales» → `/admin/analytics?vista=social`, debajo de Analytics |
| `rutaActiva` en `AdminLayout.tsx` | El resaltado y el título de la pantalla, resueltos en UN punto |
| `vista` en `Analytics.tsx` | Derivada de la dirección del router; las pestañas la ESCRIBEN |

Pruebas: `npm run test:admin:menu` (32 casos: criterio con esbuild y cableado
leído de los archivos) y `npm run test:institutional-menu` (73). Verificadas a
la inversa sobre las tres claves.

- **⚠️ NO HAY UNA SEGUNDA PANTALLA: LA ENTRADA ENLAZA LA PESTAÑA QUE YA
  EXISTE.** El tráfico del sitio y el rendimiento en redes son dos preguntas
  sobre lo mismo y viven en la misma pantalla a propósito (v4.1053). Una ruta
  propia habría dado dos superficies que se separan en silencio: la de redes se
  queda atrás en cada mejora de la otra — la lección de `SubmissionDetail`
  (v4.999) y del selector de pools (v4.877). Lo que faltaba era la PUERTA: una
  vista que hay que descubrir es, para quien la necesita, una vista que no está
  (v4.1041). Lo fija una prueba que exige que la analítica siga montándose como
  pestaña y que no aparezca una ruta `/admin/analytics/redes…` en `App.tsx`.
- **⚠️ LEER LA VISTA UNA SOLA VEZ AL MONTAR HABRÍA HECHO LA ENTRADA MUDA.**
  `Analytics.tsx` tomaba `vista` de `window.location.search` en el estado
  inicial, y navegar a la MISMA ruta **no remonta el componente**: pulsar la
  entrada del menú estando ya en Analytics no habría hecho nada, sin ningún
  error — el enlace compila y la pestaña no carga (v4.1011). La vista se DERIVA
  de `useLocation`, así que sigue a la dirección venga de donde venga.
- **Y LAS PESTAÑAS ESCRIBEN LA DIRECCIÓN.** Con la vista sólo en memoria, la
  barra resaltaría una entrada y la pantalla mostraría la otra: dos verdades
  sobre dónde está uno. Van con `replace` para no llenar el historial con cada
  ida y vuelta entre dos pestañas. De paso, el enlace de la vista de redes se
  puede compartir y abre ahí.
- **⚠️ UNA ENTRADA CON CONSULTA NO SE PUEDE COMPARAR CON `location.pathname`, y
  el defecto ya estaba en producción en dos entradas más.**
  `location.pathname === item.path` **nunca** es cierto para
  `/admin/configuracion?tab=avanzado` ni para `/admin/crm?tab=wa-chat`: el
  pathname no lleva el `?`. Esas entradas no se resaltaban jamás y su hermana
  sin consulta se resaltaba siempre —estando en «Dominio y Publicación» la
  barra decía «Configuración / Identidad»—. No falla ruidosamente: pinta el
  sitio equivocado. Al agregar una entrada que enlace una vista, **no** volver a
  escribir la comparación a mano.
- **GANA LA MÁS ESPECÍFICA, Y SÓLO UNA.** Sin eso, `/admin/analytics` y
  `/admin/analytics?vista=social` casarían las dos sobre la misma dirección y se
  pintarían dos entradas activas — la contradicción que este panel ya prohibió
  (v4.787: un indicador en contra de su propio veredicto). Una entrada exige lo
  que DECLARA y nada más: un filtro o un `utm_` de más no pueden apagar el
  resaltado. A igualdad manda el orden del menú — el resaltado no puede depender
  de en qué orden se recorra una lista.
- **EL RESALTADO Y EL TÍTULO DE LA PANTALLA SALEN DEL MISMO PUNTO**
  (`rutaActiva`). Con dos criterios, la barra marcaría una sección y la cabecera
  nombraría otra.
- **⚠️ Y LA ENTRADA ENTRA EN EL MENÚ BASE DEL USUARIO INSTITUCIONAL, sin abrir
  nada nuevo.** `matches` casa también por `?`, así que
  `modulesForPath('/admin/analytics?vista=social')` resuelve al módulo
  `analytics` de siempre: quien ve Analytics ve su pestaña de redes y quien no,
  tampoco. Por eso `BASE_ESPERADO` de `test:institutional-menu` la lista — esa
  prueba comprueba EXACTAMENTE qué ve esa cuenta, así que una entrada nueva se
  declara ahí o la prueba falla, que es lo correcto.
- **EL ICONO ES EL MISMO DE LA PESTAÑA** (`Share2`): la entrada del menú y la
  pestaña a la que lleva tienen que reconocerse como la misma cosa. Se rotula
  «Analítica de Redes Sociales» y no «Redes Sociales» para no confundirla con
  «Hub Social», que es donde se CONECTAN las cuentas.

### Los permisos de Meta se leen de META, no de lo que pedimos (v4.1055)

Reporte con la pantalla delante (`rotary4281.org/admin/analytics?vista=social`):
la Página «Distrito 4281 de RI» y la cuenta `rotary4281` conectadas y
publicando, y el panel diciendo **«Esta conexión no concedió `read_insights`»**,
«0 de 2 cuenta(s) al día» y ninguna métrica guardada.

| Pieza | Qué es |
|---|---|
| `readTokenGrant` (`metaService.js`) | UNA llamada a `debug_token` que devuelve lo CONCEDIDO: `scopes` planos, `granular_scopes` por activo, validez y vencimiento del acceso a datos |
| `permisosGuardados` · `auditoriaPermisos` (`metaSync.js`) | Lo que se guarda en `SocialAccount.permissions` y de dónde salió |
| `insightsReadiness` (`socialAnalyticsSync.js`) | El VEREDICTO: medido y ausente / nunca medido / la Página sin la tarea `ANALYZE` |
| `server/lib/metaPermissionCheck.js` | La comprobación EN VIVO contra Meta, con su catálogo CERRADO de bloqueos |
| `POST /social/analytics/verify/:accountId` | «Comprobar permisos con Meta», por cuenta |
| `SocialSyncRun."diagnostics"` | El detalle técnico de cada intento. **Nunca el token** |

Pruebas: `npm run test:social:analytics` (193 casos: criterio y cableado leído
de los archivos, **sin base, credenciales ni red**). Verificadas a la inversa
sobre los cinco puntos que sostienen la corrección.

**Reglas durables:**

- **⚠️ LA CAUSA ERA GUARDAR LO PEDIDO COMO SI FUERA LO CONCEDIDO, y son DOS
  mitades del mismo defecto.** `metaSync` escribía `permissions: META_SCOPES`
  —la lista que le PEDIMOS a Meta— en los dos upserts. De ahí: (1) toda cuenta
  conectada ANTES de v4.1053 tiene guardada la lista de siete permisos de
  entonces, sin los dos de estadísticas, así que `insightsReadiness` la marcaba
  «sin permiso» **para siempre**, y (2) —peor, y es lo que hacía inútil el
  arreglo obvio— una cuenta RECONECTADA hoy quedaría marcada «con permiso»
  aunque Meta lo hubiera negado, porque `META_SCOPES` ya los contiene. Es decir:
  reconectar habría hecho desaparecer el aviso amarillo **sin demostrar nada**,
  que es exactamente lo que el pedido prohibía dar por solucionado.
- **⚠️ `debug_token` YA SE LLAMABA Y SU RESPUESTA SE TIRABA.**
  `readGranularScopes` existía desde v4.1046 para resolver qué Páginas se
  concedieron, y descartaba el array `scopes` —que es la concesión real—.
  `readTokenGrant` devuelve las dos cosas en la MISMA llamada: no se agregó un
  viaje de red, se dejó de tirar la mitad de la respuesta. `readGranularScopes`
  se conserva como envoltorio para no tocar a sus consumidores.
- **⚠️ LO QUE NUNCA SE MIDIÓ NO SE DA POR NEGADO** (`permissionsSource`). Es la
  distinción que evita cambiar un defecto por su opuesto: con la fuente en
  `requested` —una fila escrita antes de esta versión— `insightsReadiness`
  devuelve `ok` con una NOTA, no un bloqueo. Sólo bloquea cuando la fuente es
  `debug_token` y el permiso de verdad no está. Un cero es una afirmación; un
  hueco es la verdad (regla del sitio), y acá afirmar «no concedido» sobre algo
  que no se miró es lo que produjo el reporte.
- **⚠️ NO SE TOCA LA BASE A MANO PARA QUE EL AVISO SE VAYA.** Era la salida
  corta —un `UPDATE` sobre `permissions`— y es la que el pedido prohíbe: dejaría
  el criterio equivocado en pie y el siguiente `metaSync` volvería a escribir lo
  pedido. Lo que se corrigió es QUIÉN escribe ese campo. Las filas heredadas se
  arreglan solas al reautorizar o al pulsar «Comprobar permisos con Meta»; no se
  migró ni una.
- **⚠️ EL VEREDICTO EN VIVO LO DA META, NO NUESTRO REGISTRO.**
  `verifyAccountInsights` hace dos cosas: inspecciona el token de ESA fila
  (`readTokenGrant` sobre su propio `refreshToken`) y **hace una consulta real
  de estadísticas** —tres días, una métrica barata, sin reintentos—. **Gana la
  arista**: si el endpoint responde, hay permiso, diga lo que diga el inventario;
  si rechaza, el motivo sale de su código y subcódigo. Un inventario de permisos
  no demuestra que el endpoint conteste — y era precisamente lo que el pedido
  exigía no deducir de nuestros propios registros.
- **⚠️ «NO CONCEDIDO» SON CINCO COSAS Y SE CORRIGEN EN SITIOS DISTINTOS**
  (`BLOCKERS`, catálogo CERRADO con su rótulo y su salida): `app_review` —la
  aplicación necesita **Acceso avanzado**, o sea App Review más verificación del
  negocio—, `user_declined` —la persona no marcó la casilla al autorizar—,
  `page_task` —la cuenta no tiene la tarea **ANALYZE** sobre esa Página—,
  `token_expired`, `account_type`, más `rate_limited` / `provider_down` /
  `no_token`. Un bloqueo sin salida se lee como una avería (v4.1008), y
  «reconectá» sobre un problema de App Review manda a repetir un gesto que no
  puede funcionar. Ante un código que no se reconoce, `unknown` **con el mensaje
  textual de Meta**: nunca se disfraza de uno conocido.
- **LA TAREA DE LA PÁGINA ES OTRA PREGUNTA, y por eso se comprueba aparte.**
  `read_insights` concedido y la Página sin `ANALYZE` es un caso real y frecuente
  —el rol sobre la Página lo decide Meta Business, no la autorización— y su
  salida no tiene nada que ver con reautorizar. Sólo se juzga cuando `tasks`
  viene con contenido: una lista vacía es «no lo sabemos», no «no la tiene».
- **⚠️ LOS NOMBRES DE LOS PERMISOS ESTABAN BIEN Y NO SE TOCARON.** Verificado
  contra la documentación vigente: `read_insights` es el de Page Insights, y
  `instagram_manage_insights` es el que corresponde a **Instagram API con
  Facebook Login**, que es nuestro flujo — `instagram_business_manage_insights`
  pertenece al flujo nuevo de Instagram Login y **no aplica acá**. Cambiarlos
  habría roto la autorización sin arreglar nada.
- **NO HAY UN SEGUNDO OAUTH.** Reautorizar es el MISMO
  `GET /social/connect/meta` de siempre, con el `auth_type=rerequest` que ya
  estaba, y las cuentas se escriben por **upsert**: reautorizar no puede
  duplicar una cuenta ni soltar la asociación del sitio con su Página y su
  Instagram. Y el sincronizador sigue siendo UNO (`metaSync`), compartido por el
  callback y por «Sincronizar cuentas» — lo fija una prueba.
- **LOS PERMISOS DE PUBLICACIÓN SE CONSERVAN ENTEROS.** Los de estadísticas se
  SUMAN a `REQUIRED_SCOPES`, no la reemplazan: una prueba cuenta los siete de
  publicación y falla si desaparece alguno. Nada de Reels, publicación o
  distribución cambió una línea.
- **⚠️ EL RANGO QUE SE GUARDA ES EL QUE DE VERDAD LLEGÓ.** `recoveredFrom` /
  `recoveredTo` se derivan de las FILAS obtenidas (`rows[].metricDate`, ordenadas),
  no del rango pedido; un fallo declara `null` en las dos y no un rango vacío que
  se leería como «se consultó y no había nada». Instagram guarda 30 días de
  `follower_count` y ese techo ya estaba modelado (`effectiveStart`): lo que esta
  versión agrega es **dejar escrito cuánto se recuperó**, en vez de suponer que
  fue lo pedido.
- **⚠️ EL DIAGNÓSTICO NUNCA LLEVA EL TOKEN, NI RECORTADO.** `diagnostics` guarda
  la cuenta, la plataforma, el id de la plataforma, el **tipo** de token
  (`page_access_token` — el tipo, no el valor), el endpoint, la versión de la
  Graph API, el rango pedido, el recuperado, los permisos y su fuente, y —cuando
  falla— el estado HTTP, el código y el **subcódigo** de Meta con su mensaje
  textual. Una prueba busca `accessToken`/`refreshToken`/`token:` dentro del
  objeto y falla si aparecen.
- **EL SUBCÓDIGO ES LO QUE DISTINGUE DOS CAUSAS BAJO EL MISMO CÓDIGO.** Un 190
  puede ser «la sesión caducó» (463) o «la persona cambió su contraseña» (460):
  sin él las dos salen como «token vencido» y una de las dos manda a hacer algo
  que no corrige nada. `httpStatus: 0` **no es un estado HTTP**: es que la
  petición no llegó a tener respuesta, y se distingue de un 500, que sí la tuvo.
- **`diagnostics` va ENUMERADA en el atajo del ensure** (`OWNED_COLUMNS`, la
  trampa de v4.908): `CREATE TABLE IF NOT EXISTS` no amplía nada y la base de
  producción ya tiene `SocialSyncRun` desde v4.1053, así que sin contarla en el
  atajo el `ALTER` no correría jamás y el `INSERT` fallaría con «column does not
  exist» — en silencio, porque este módulo degrada.
- **EL AISLAMIENTO VA EN EL `WHERE`.** `/analytics/verify/:accountId` resuelve
  la cuenta con `accountsInScope` y una cuenta ajena responde **404, no 403**:
  confirmar que existe es la mitad de lo que hace falta para ir a buscarla. La
  verificación queda además en la auditoría (`analytics_verify`).
- **GUARDAR LO APRENDIDO NO PUEDE COSTAR EL VEREDICTO.** La escritura que
  persiste los permisos comprobados va en su propio `try`: un fallo de base
  devuelve igual el diagnóstico, que es lo que la persona vino a buscar. Y sólo
  se guardan los permisos cuando de verdad se pudieron medir — si el token no se
  pudo inspeccionar, se conserva lo que había.


### Cada métrica se pide como Meta la entrega (v4.1056)

Reporte con la pantalla delante: las dos cuentas del Distrito 4281 en
«Sincronizada en parte» y seis errores que **no eran de permisos** —la conexión
estaba sana y había datos guardados—. Lo que estaba mal era CÓMO se construía
cada petición.

| Pieza | Qué es |
|---|---|
| `metricType` · `maxWindowDays` · `PLATFORM_WINDOW_DAYS` · `responseShapeOf` · `maxWindowFor` (`socialMetricsSpec.js`) | Las CAPACIDADES por métrica: con qué parámetro se pide, en qué ventana y con qué forma vuelve |
| `planMetric` | El ÚNICO punto que combina retención + ventana + forma y devuelve las ventanas a pedir |
| `deriveFollowersNet` | El crecimiento NETO entre capturas consecutivas de seguidores |
| `LIMIT_NOTE_CODES` · `noteSeverity` · `needsPermissionCheck` · `classifyRun` | Qué aviso es un LÍMITE y qué aviso es una AVERÍA |
| `MAX_CALLS_PER_RUN` · `coveredThrough` (`metaInsights.js`) | El presupuesto de llamadas y hasta qué día llegó de verdad la vuelta |

Pruebas: `npm run test:social:analytics` (255 casos; el grupo 29 **simula una
sincronización completa con `fetch` sustituido** y comprueba las URLs REALES que
se construyen). Verificadas a la inversa sobre los cuatro defectos.

- **⚠️ NO ERAN PERMISOS, Y DARLO POR SENTADO HABRÍA SIDO EL ERROR CARO.** El
  propio reporte lo advertía y la evidencia lo confirma: dos de los seis avisos
  son métricas que Meta RETIRÓ, dos son ventanas más largas de lo que esa cuenta
  admite, uno es un parámetro que el esquema exige y uno es un límite de
  retención. Ninguno se corrige reautorizando. **Al diagnosticar un fallo de
  Insights, leer el código y el mensaje de Meta antes de mirar los scopes.**
- **⚠️ FACEBOOK NO EXPONE ALTAS NI BAJAS DE SEGUIDORES, Y NO SE INVENTAN.**
  `page_fan_adds` / `page_fan_removes` están retiradas **y su reemplazo
  documentado —`page_daily_follows_unique` / `page_daily_unfollows_unique`—
  también**: no queda ninguna arista que las devuelva. Lo que sí es un dato real
  es el crecimiento NETO entre dos capturas consecutivas de `followers_count`, y
  se rotula como lo que es (`followers_net`, «Crecimiento neto de seguidores»).
  **No se parte en ganados y perdidos**: con un solo número no se pueden conocer
  los dos, y presentarlos por separado sería fabricar la mitad.
- **Y sólo entre días CONSECUTIVOS.** Un hueco en la serie no se reparte ni se
  atribuye al día siguiente: la diferencia se omite y el hueco se DICE
  (`gapDays`). Repartirlo sería inventar el dato que el hueco significa que no
  tenemos.
- **⚠️ `metric_type=total_value` SE APLICA DONDE EL ESQUEMA LO EXIGE, NUNCA
  GLOBALMENTE.** Es un campo de la métrica (`metricType`), no una bandera de la
  petición: añadirlo a todas rompería las que sí devuelven serie diaria.
- **⚠️ Y CAMBIA LA FORMA DE LA RESPUESTA, NO SÓLO EL PARÁMETRO.** Con
  `total_value` Meta devuelve UN agregado del rango y **ningún `values[]`**: de
  ahí que esas métricas se pidan por ventanas de UN día
  (`AGGREGATE_WINDOW_DAYS`), que es lo único que permite atribuir el número al
  día correcto. Repartir un total de treinta días entre sus días sería inventar
  la distribución. Un agregado que llegue sobre un rango de más de un día **no
  se guarda**: se anota (`agregado_sin_dia`) y la vuelta baja a «en parte».
- **⚠️ LA VENTANA MÁXIMA ES POR PLATAFORMA, NO UNA SOLA** (`PLATFORM_WINDOW_DAYS`:
  Facebook 93, Instagram 30). Compartir el tope de Facebook es exactamente lo que
  producía «No puede haber más de 30 días entre since y until» en `reach` y
  `engagement` de Instagram. Una métrica puede además declarar el suyo propio y
  ése manda.
- **⚠️ UNA RETENCIÓN NO ES UN FALLO, Y CONFUNDIRLOS MANDA A REAUTORIZAR LO QUE
  ESTÁ BIEN.** Que Instagram guarde 30 días de `follower_count` es un límite de
  Meta —devuelve un conjunto VACÍO, no un error—: se acota la ventana
  (`effectiveStart`), se anota `historia_acotada` y **el estado NO se degrada**.
  Lo mismo una métrica retirada (`metrica_retirada`). Son LÍMITES
  (`LIMIT_NOTE_CODES`), y `noteSeverity` es el único punto que lo decide.
- **⚠️ LO QUE NO SE PUDO TRAER QUEDA EN BLANCO, NUNCA EN CERO.** Un cero afirma
  que sabemos que no hubo crecimiento; un hueco dice la verdad. Es la regla del
  sitio (`num(null)` es 0 en JavaScript — la trampa de v4.954 y v4.1049) aplicada
  al histórico: no se escribe ninguna fila para el día que Meta no entregó.
- **HAY UN ESTADO NUEVO, «Sincronizada con limitaciones»** (`limited`), y hace
  falta: sin él, una cuenta perfectamente sana con una retención de 30 días se
  leía como rota. `classifyRun` decide con un orden que no es negociable —
  permiso/bloqueo > avería (sin una sola fila escrita es `error`, no `partial`) >
  límite > `ok`—: un fallo de permisos tapa a un límite, jamás al revés.
- **⚠️ Y `limited` CUENTA COMO SINCRONIZACIÓN BUENA EN LA MARCA DE AGUA.**
  `lastSyncedThrough` filtra `status IN ('ok','limited','partial')`: sin
  `limited` en esa lista, Instagram volvería a recorrer su backfill entero en
  cada vuelta, para siempre.
- **⚠️ «COMPROBAR PERMISOS CON META» SÓLO SALE CON EVIDENCIA REAL**
  (`needsPermissionCheck`, catálogo CERRADO `PERMISSION_NOTE_CODES`). Ofrecerlo
  sobre una retención manda a repetir un gesto que no puede corregir nada — un
  bloqueo cuya salida no resuelve nada se lee como una avería (v4.1008). El
  veredicto lo resuelve el SERVIDOR y viaja resuelto; la pantalla **no deduce la
  severidad** y una prueba comprueba que `LIMIT_NOTE_CODES` no aparezca en el
  `.tsx`.
- **LO QUE SÍ LLEGÓ SE GUARDA AUNQUE OTRA MÉTRICA FALLE.** El fallo es por
  MÉTRICA y por VENTANA: se anota y se sigue. La idempotencia sigue siendo la del
  índice único `(accountId, metricDate, metric)`, así que volver a sincronizar no
  duplica una fila.
- **⚠️ LA MARCA DE AGUA ES EL DÍA QUE DE VERDAD SE CUBRIÓ** (`coveredThrough`, el
  MÍNIMO entre métricas), no el día que se pidió. Con el presupuesto de llamadas
  agotado —`MAX_CALLS_PER_RUN`, porque las métricas agregadas se piden día a
  día— una vuelta truncada que declarara el rango completo dejaría un agujero
  permanente en la serie: la vuelta siguiente reanuda donde quedó y lo que no
  entró se DICE (`presupuesto`).
- **EL DIAGNÓSTICO ES POR PETICIÓN Y NUNCA LLEVA EL TOKEN.** Métrica canónica,
  métrica de origen, endpoint, período, `metric_type`, `since`, `until`, ventana
  máxima, estado HTTP, código y subcódigo de Meta con su mensaje textual. Una
  prueba busca `accessToken`/`token:` dentro del objeto y falla si aparecen.
- **FACEBOOK E INSTAGRAM NO COMPARTEN LISTA.** `metricsFor(platform)` filtra por
  plataforma y por `status: 'live'`, así que una métrica retirada de una red no
  se le pide a la otra ni se le pide a nadie. Al agregar una métrica, declarar su
  plataforma, su endpoint, su `metricType` si su esquema lo exige y su ventana si
  difiere de la de su plataforma — **el registro es el único sitio donde eso se
  decide**, no una condición suelta dentro del sincronizador.

⚠️ **Lo que NO se pudo comprobar, dicho sin maquillar:** la sincronización de
prueba contra las cuentas reales **no se ejecutó** — este entorno no tiene
credenciales de Meta y el proxy de salida bloquea `developers.facebook.com`. Las
correcciones se apoyan en los mensajes de error del reporte, en la documentación
de las depreciaciones y en una **sincronización simulada** con `fetch`
sustituido que comprueba las URLs construidas. La confirmación contra Meta queda
pendiente de una corrida real desde producción.
