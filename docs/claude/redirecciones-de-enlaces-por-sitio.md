<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Redirecciones de enlaces por sitio — v4.781

Direcciones cortas del propio dominio que llevan a otra parte
(`rotary4281.org/conferencia` → el formulario de inscripción). Se configuran en
Configuración → Identidad.

⚠️ **Un destino que apunta directo a S3 se resuelve por la vía pública de la
Biblioteca desde v4.1016** — ver «Un PDF público de la Biblioteca se abre en el
móvil».

⚠️ **El ajuste `link_redirects` quedó SUPERADO por v4.993** —ver la sección
siguiente—: cada redirección es hoy una fila de `LinkRedirect` con su id, su
estado, su autor y su historial de clics. Lo que sigue vigente de esta sección
es el CRITERIO de la dirección y del destino (`linkRedirects.js`), que no
cambió; `SETTING_KEY` se conserva sólo para la migración perezosa.

| Archivo | Qué es |
|---|---|
| `server/lib/linkRedirects.js` | El CRITERIO. **Puro**: qué regla se acepta, a dónde manda |
| `src/lib/linkRedirects.ts` | Espejo en el navegador, para avisar mientras se escribe |
| `server/lib/linkRedirectStore.js` | La I/O: resolución por dominio, caché, CRUD y medición |
| `api/index.js` (catch-all) | El salto, antes de servir el documento |

Pruebas: `npm run test:redirects` (65 casos). **Sin Postgres, credenciales ni
red**: la base se sustituye en memoria con un hook de resolución de módulos.

**Reglas durables:**

- **El salto lo hace el SERVIDOR, no un `<Navigate>` de React.** La vista previa
  de WhatsApp, los rastreadores y `curl` no ejecutan JavaScript: con una
  redirección del navegador verían la aplicación vacía. Es el mismo motivo por
  el que el `<head>` se resuelve en el servidor (v4.702).
- **Se resuelve ANTES de `renderPublicDocument`.** Una dirección corta no es una
  página de la aplicación: si llegara al documento, el visitante vería la
  pantalla de «no encontrado».
- **`/admin` no se puede redirigir, y es la barrera que importa.** Una regla ahí
  deja al administrador sin panel y sin forma de entrar a quitarla — la puerta
  cerrada con la llave adentro. Lo mismo la portada, que dejaría el sitio
  inaccesible desde su propio dominio. Se comprueba DOS veces: al validar y al
  resolver, porque en la base puede haber reglas escritas antes de que la
  validación existiera.
- **Temporal por DEFECTO.** Un 301 lo cachea el navegador durante meses, así que
  una redirección equivocada sigue actuando para quien ya la visitó AUNQUE se
  corrija. Lo permanente se elige a propósito y la pantalla dice qué implica.
  La temporal se sirve con `Cache-Control: no-store`, que es lo que hace que
  corregirla se note en la visita siguiente.
- **El destino sólo puede ser `http(s)` o una ruta interna.** El valor termina
  en una cabecera `Location`: aceptar cualquier esquema convertiría un campo del
  panel en un hueco por donde inyectar. `//otrositio.com` también se rechaza —
  parece interno y el navegador lo trata como externo. Mismo criterio que el
  mapa de la sede (v4.717).
- **La resolución por dominio repite el camino de `by-domain`, NO el de
  `resolveClubByHost`.** Ese atajo del módulo de SEO sólo mira `Club.domain`, y
  el dominio propio de un distrito vive en la fila de `District` (v4.744): con
  él, `rotary4281.org` no encontraría sitio y sus redirecciones no existirían,
  en silencio.
- **La coincidencia es EXACTA, sin comodines.** Un comodín es cómodo de escribir
  y difícil de razonar cuando hay varios —¿gana el más largo, el primero?—, y
  acá equivocarse significa que una página real del sitio deja de ser
  alcanzable.
- **La query de la visita viaja al destino**, igual que en `ctaTarget` (v4.657):
  `?utm_source=…` es lo que distingue de dónde vino el clic. El ancla no: el
  navegador nunca la manda al servidor, así que aceptarla en el formulario daría
  una regla que no puede funcionar.
- **Se SANEA en el servidor al guardar, no sólo en la pantalla.** El panel avisa
  mientras se escribe con el MISMO criterio (`src/lib/linkRedirects.ts`), pero
  quien decide qué se guarda es el servidor.
- **Guardar limpia la caché** (`invalidateRedirectCache`). Quien acaba de crear
  una redirección la prueba en seguida, no cuando venza el TTL.
- **Una consulta fallida devuelve `[]`, no una excepción.** Esto corre en el
  catch-all: si lanzara, se caería la página pública entera.

### Enlaces medibles y persistencia real — v4.993

Reporte con la pantalla delante: se crean redirecciones, funcionan, y al cabo
de un tiempo «algunas dejan de funcionar» y el listado del módulo aparece
**vacío**. Eran DOS defectos encadenados y el primero causaba el segundo.

| Archivo | Qué es |
|---|---|
| `server/lib/linkTracking.js` | El CRITERIO de la MEDICIÓN. **Puro**: bots, dispositivo, atribución de la fuente, UTM, código HTTP, días y períodos |
| `server/lib/ensureLinkRedirectSchema.js` | Las cinco tablas en runtime |
| `server/lib/linkRedirectStore.js` | La I/O: resolución, migración perezosa, registro del clic, CRUD y estadísticas |
| `server/controllers/linkRedirectController.js` · `server/routes/link-redirects.js` | La API del panel |
| `src/components/admin/LinkRedirectsPanel.tsx` | El módulo: listado, editor y «Ver estadísticas» |
| `src/lib/linkTracking.ts` | Espejo MÍNIMO: sólo rótulos |

Pruebas: `npm run test:redirects` (65 casos) y `npm run test:links` (101, el
criterio de la medición y el CAMINO con la base sustituida en memoria).
**Ninguna necesita Postgres, credenciales ni red.** Verificadas a la inversa
sobre diez defectos, incluidos los dos que originaron el reporte.

**Reglas durables:**

- **⚠️ LA CAUSA RAÍZ NO ERA QUE CADUCARAN: LAS BORRABA EL PROPIO PANEL, y las
  dos mitades hacen falta para entenderlo.** (1) `GET /clubs/by-domain`
  **reemplaza** `settings` por un objeto de DOCE llaves elegidas a mano
  (`routes/clubs.js`), y `link_redirects` no está entre ellas: la pantalla leía
  `settingsMap['link_redirects']` y obtenía siempre `undefined`, así que el
  listado salía vacío por más redirecciones que hubiera guardadas — que es
  exactamente la captura del reporte. (2) Como `linkRedirects` era un campo de
  `formData` y el guardado manda `{...formData}`, el siguiente cambio de
  CUALQUIER campo de Configuración enviaba `linkRedirects: []`, y
  `updateClub` lo escribía (`linkRedirects !== undefined` → `JSON.stringify([])`)
  **encima del documento**. Ése es el «dejan de funcionar al cabo de un tiempo»:
  no caducaban, las pisaba el panel la próxima vez que alguien guardó cualquier
  otra cosa. Reproducido con el código real antes de tocar nada.
- **⚠️ AGREGAR LA LLAVE A `by-domain` NO ERA LA SOLUCIÓN.** Habría arreglado el
  listado y dejado en pie la segunda mitad: mientras las redirecciones fueran un
  array dentro del formulario, cualquier fallo cargándolas volvería a borrarlas
  enteras. El modelo era el problema — **un documento que se reescribe entero no
  puede guardar algo que no se puede perder**.
- **⚠️ CADA REDIRECCIÓN ES UNA FILA CON IDENTIDAD** (`LinkRedirect`), no una
  entrada de un JSON. De ahí cuelga todo lo demás: sin un id estable no hay
  dónde colgar un clic, ni quién la creó, ni un estado, ni un historial — y
  cambiar el texto del slug tiraría la analítica con él. **La analítica cuelga
  del ID, nunca del slug**, y por eso editar la dirección corta conserva cada
  clic.
- **`updateClub` YA NO ESCRIBE `link_redirects`, y lo que llegue con ese nombre
  se IGNORA.** Un navegador con el bundle anterior en caché sigue mandando
  `linkRedirects: []` durante días; lo que no puede es volver a borrar nada. Lo
  fija una prueba que comprueba la INVARIANTE —que esa llave no se escriba— y no
  la forma exacta del código viejo: fijada a `'link_redirects': linkRedirects`,
  pasaba en verde con un `'link_redirects': JSON.stringify([])` reintroducido al
  lado. **Lo destapó la verificación a la inversa, no la lectura.**
- **⚠️ EL MÓDULO NO ES PARTE DEL FORMULARIO.** Cada acción es su propia petición
  contra `/api/link-redirects` y se guarda sola: «Guardar Configuración» no las
  toca ni puede tocarlas. Es lo que hace estructuralmente imposible el defecto.
- **LA MIGRACIÓN OCURRE AL LEER, NO AL DESPLEGAR.** Un despliegue no escribe en
  la base (regla durable desde el 2026-07-13), así que esto no podía ser un
  script: la primera lectura —del catch-all o del panel— importa lo que quedara
  en el `Setting` y lo deja como filas. El ajuste se **VACÍA, no se borra**: esa
  fila vacía es la marca de que ya ocurrió. Mismo patrón que los grupos de
  distribución (v4.876) y `migrateFromLegacyConfig` (v4.992). Es idempotente por
  el índice único parcial.
- **⚠️ EL ÍNDICE ÚNICO DEL SLUG ES PARCIAL** (`("clubId", slug) WHERE "deletedAt"
  IS NULL`) para que una dirección eliminada quede libre otra vez. Por serlo,
  **no se usa `ON CONFLICT` contra él**: tendría que repetir el predicado o la
  sentencia falla entera (v4.648). El alta comprueba el duplicado y traduce el
  rechazo del índice a un motivo legible — misma decisión que `MediaFolder`.
- **⚠️ EL CLIC SE REGISTRA ANTES DE RESPONDER Y EN UNA SOLA IDA A LA BASE.** En
  Vercel la función se CONGELA al cerrar la respuesta, así que «procesamiento
  desacoplado» no existe acá: un `fire-and-forget` quedaría a medias. Y cuatro
  escrituras sueltas son cuatro viajes de red antes del salto. Con CTEs
  encadenadas —visitante, evento, agregado diario y contadores del enlace— es
  UN viaje. Lo fija una prueba que cuenta las llamadas a `db.query` dentro de
  `recordClick`: dos, una para el clic humano y otra para el bot.
- **`recordClick` NUNCA lanza.** Un fallo midiendo no puede costar la
  redirección, que es lo que el visitante vino a buscar.
- **⚠️ LA LISTA DEL SITIO VA CACHEADA (60 s), así que una página normal no paga
  ninguna consulta de más** por pasar por el catch-all — que corre en CADA
  visita pública. Toda escritura del panel invalida la caché: quien acaba de
  guardar espera probar el enlace en seguida, no dentro de un minuto.
- **⚠️ 302 POR DEFECTO, Y AHORA HAY UN SEGUNDO MOTIVO.** El de v4.781 era que un
  301 cacheado sigue llevando al destino viejo aunque se corrija. El nuevo pesa
  igual: **un 301 deja de contarse**, porque el navegador ya no vuelve a
  preguntar. El editor lo dice con esas palabras. Un método que no es GET usa
  307/308: 301 y 302 autorizan a cambiarlo a GET y perder el cuerpo.
- **⚠️ LA VISTA PREVIA DE WHATSAPP NO ES UN CLIC.** Es el ruido principal de este
  módulo y no un caso raro: WhatsApp pide el enlace **una vez por chat** para
  dibujar la tarjeta, así que contarlo infla el número **en proporción a lo bien
  que se compartió**. El bot SÍ se redirige —la vista previa necesita llegar al
  destino— y SÍ se cuenta, en su propio contador, que se muestra aparte y nunca
  sumado. **No deja evento individual**: de un bot se guarda que ocurrió, no
  cada vez, o veinte chats llenan la tabla de ruido.
- **El patrón genérico de bots exige LÍMITE DE PALABRA y va al final.** `bot`
  aparece dentro de cadenas legítimas: un **CUBOT** es un teléfono real. Lo fija
  una prueba con su user-agent verdadero.
- **Un `Sec-Purpose: prefetch` tampoco es un clic**: es el navegador precargando
  porque alguien pasó el cursor por encima. Nadie decidió nada todavía. Y las
  cabeceras se leen **sin distinguir mayúsculas** — con la búsqueda atada a cómo
  vinieran escritas, un `Purpose: prefetch` legítimo se contaba como persona.
- **⚠️ LA FUENTE NO SE INVENTA, Y EL ORDEN NO ES NEGOCIABLE**: UTM (lo declaró
  quien armó el enlace) → `Referer` (lo declaró el navegador) → **«Directo o
  desconocido»**. No hay ninguna regla que deduzca la plataforma de otra cosa.
  Se rotula «Directo **o desconocido**» y no «Directo» a secas porque las dos
  cosas se ven igual desde acá: **WhatsApp en el móvil NO manda `Referer`**, así
  que su tráfico legítimo cae ahí — y alguien concluiría que compartir por ahí
  no sirvió. La pantalla lo explica y propone la salida: compartir con
  `?utm_source=`.
- **⚠️ LA IP NO SE GUARDA EN NINGUNA PARTE.** Entra en la semilla del
  identificador y sale como hash con una sal del servidor
  (`LINK_TRACKING_SALT`, o el secreto que ya existe): lo que se persiste es el
  hash. Sin sal, `sha256(ip+ua)` es reversible por fuerza bruta sobre el espacio
  de direcciones. Lo comprueba una prueba que lee el esquema y falla si aparece
  una columna de IP. El país sale de la cabecera que entrega la red
  (`x-vercel-ip-country`), que no exige conservarla.
- **⚠️ EL SITIO ENTRA EN LA SEMILLA.** Sin él, la misma persona tendría el mismo
  identificador en los enlaces de dos organizaciones del ecosistema: eso es
  exactamente el rastreo entre sitios que no queremos poder hacer.
- **VISITANTE ÚNICO = fila nueva en `LinkRedirectVisitor`.** La decisión se toma
  UNA vez, al insertar, y el contador queda exacto y O(1) para siempre. Un
  `COUNT(DISTINCT)` sobre todos los eventos daría lo mismo y costaría una
  pasada por enlace en cada listado. Sin IP y sin user-agent **no se identifica
  a nadie**: el clic se cuenta y el visitante no — la semilla sería la misma
  para todo el mundo y el contador diría 1 para siempre.
- **⚠️ EL LISTADO NO RECORRE NI UN EVENTO.** Los contadores viven en la propia
  fila, mantenidos en la misma ida que registra el clic, así que pintar cien
  enlaces cuesta una consulta tenga la plataforma mil clics o diez millones. La
  cabecera de las estadísticas sale del AGREGADO DIARIO (una fila por enlace y
  por día: dos años son 730). Sólo los DESGLOSES leen eventos, acotados al rango
  y por un índice `(linkId, createdAt)`. Lo fija una prueba que mira qué tablas
  tocó el listado.
- **⚠️ LOS DÍAS SE CUENTAN EN LA ZONA DEL SITIO, NO EN UTC** (`LINK_STATS_TZ`,
  Bogotá por defecto). La función corre en UTC: con los cortes ahí, un clic de
  las 8 de la noche en Colombia cae en el día siguiente y el gráfico se lee mal
  **justo en la franja de más tráfico**. `dayKey` es la MISMA función al
  escribir el agregado y al leer el rango — con dos formas de decidir el día,
  el gráfico y el contador dirían cosas distintas sobre el mismo clic.
- **El gráfico rellena los días sin clics.** Sin eso une dos puntos lejanos con
  una recta y hace creer que hubo tráfico donde no lo hubo.
- **PAUSAR NO BORRA NADA** y **ELIMINAR ES SUAVE**: la fila y su historial se
  conservan, el slug queda libre para volver a usarse, y la nueva es un enlace
  NUEVO con su propia historia — no hereda los clics de la anterior, que sería
  peor que perderlos. Eliminar exige confirmación explícita (428) y la
  confirmación DICE qué va a pasar: los enlaces ya repartidos dejan de
  funcionar en el acto.
- **LA AUDITORÍA SÓLO AGREGA.** Ni `UPDATE` ni `DELETE` sobre sus filas:
  corregir es escribir otro evento. Es lo único que contesta «¿por qué este
  enlace lleva a otro sitio que en marzo?» dentro de seis meses. Lo fija una
  prueba sobre el archivo.
- **EL SITIO SALE DEL TOKEN, NUNCA DEL CUERPO.** Si viajara en la petición,
  acotar las redirecciones a un sitio no serviría de nada: cualquiera con el
  endpoint crearía una dirección corta en el dominio de otra organización. Y el
  aislamiento va en el `WHERE`, no en la pantalla: una redirección ajena
  responde **404, no 403** — confirmar que existe es la mitad de lo que hace
  falta para ir a buscarla.
- **EL GATE ES EL MISMO QUE EL DE `PUT /admin/clubs/:id`**, exactamente los
  mismos roles. Sacar el módulo a su propia API no le da acceso a nadie que no
  lo tuviera ni se lo quita a quien sí; un permiso nuevo del RBAC habría
  cambiado quién puede administrarlas sin que nadie lo hubiera decidido.
- **MEDIR Y REENVIAR SON DOS DECISIONES DISTINTAS.** `forwardQuery` dice si la
  query sigue viaje al destino; los UTM **se miden siempre**, se propaguen o no.
- **Las cinco tablas viven fuera de Prisma** y están en la lista del guardián de
  `db:push`. Un `db push` que las borre rompe cada enlace ya repartido a la vez
  —por WhatsApp, impreso en un pendón— y se lleva todo el historial de clics.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `LINK_TRACKING_SALT` | La sal del identificador seudónimo. Sin ella se usa el secreto que el servidor ya tiene: el hash nunca viaja sin sal |
| `LINK_STATS_TZ` | La zona en la que se cuentan los días (`America/Bogota` por defecto) |

**Pendientes conocidos:** no hay **purga** de `LinkRedirectEvent` — el agregado
diario y los contadores son permanentes, pero los eventos crudos crecen con el
tráfico y conviene una retención antes de que duela; el desglose por **ciudad**
se guarda y **todavía no tiene pantalla** (se muestra el país, que es lo fiable);
y no hay **exportación** de las estadísticas a CSV ni un tablero que sume los
enlaces de un sitio — hoy se miran uno por uno.
