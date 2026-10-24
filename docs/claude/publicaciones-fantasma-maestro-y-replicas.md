<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Publicaciones fantasma: maestro y réplicas — v4.938

Reporte con dos capturas: un artículo creado en Club Platform y distribuido a
varios sitios se publicaba, se veía en la página pública, y **no aparecía ni en
`/admin/noticias` del sitio destino ni en el panel central** — `app.clubplatform
.org/admin/noticias` decía «0 noticias registradas» y `rotary4281.org/admin/
noticias` mostraba tres que no eran las distribuidas.

| Archivo | Qué es |
|---|---|
| `server/lib/postScope.js` | El CRITERIO. **Puro**: la cláusula de visibilidad, el origen de cada fila, los estados, quién puede editar/retirar/eliminar y el alcance del listado |
| `getClubPosts` en `contentController.js` | El listado del panel |
| `reconcilePosts` (`GET /admin/posts/reconcile`) | El diagnóstico, de sólo lectura |
| `scripts/fixtures/db-posts-stub.mjs` | La base en memoria que ejercita el CAMINO |

Pruebas: `npm run test:posts` (83 casos, **sin base, credenciales ni red**).
Verificadas a la inversa: con el `WHERE` anterior fallan **10**, incluida la que
reproduce el reporte literal.

**Reglas durables:**

- **⚠️ LA CAUSA RAÍZ FUERON DOS CRITERIOS DE VISIBILIDAD PARA LA MISMA
  PREGUNTA.** Una publicación centralizada se guarda con `clubId = NULL` y sus
  destinos en `targetClubIds`. La consulta PÚBLICA
  (`CLUB_VISIBILITY_CLAUSE`) miraba el array —por eso el artículo se veía en el
  sitio— y `getClubPosts` **no**: filtraba `WHERE "clubId" = $1` y no la
  encontraba jamás. Publicada, visible y sin representación administrativa: eso
  es exactamente un fantasma. Ahora la cláusula vive en `postScope.js` y la usan
  las DOS puntas; con una sola no se pueden volver a separar.
- **⚠️ Y EL SEGUNDO FANTASMA ERA UN 400 MUDO.** Para el operador,
  `getClubPosts` tomaba `clubId = req.query.clubId` y `News.tsx` llama a
  `/admin/posts` **sin ese parámetro** → `400 clubId is required`. La pantalla
  hacía `if (response.ok) … else setPosts(staticMapped)`, así que el error se
  pintaba como «0 noticias registradas». **Un vacío sin explicación es
  indistinguible de «no hay nada»**: ahora un fallo se dice con su causa y una
  sesión sin sitio recibe lista vacía CON su motivo, no un 400.
- **⚠️ LA RELACIÓN MAESTRO↔RÉPLICA YA EXISTÍA Y NO SE CREÓ UNA TABLA NUEVA.**
  `MasterArticle` + `SitePublication` es lo que uno dibuja en una pizarra y acá
  habría sido un error con precio conocido: una centralizada es **UNA fila** que
  cada sitio resuelve al leer (misma decisión que Campañas de Contribución,
  v4.807, y la contraria a la del ecosistema del Distrito, v4.749, donde el clon
  sí se justifica). Con N filas, corregir una cifra o despublicar serían N
  escrituras y la que fallara quedaría desincronizada en silencio. Lo comprueba
  una prueba que lee `schema.prisma`.
- **⚠️ NO SE MIGRÓ NI UN DATO, Y ÉSA ES LA RECUPERACIÓN.** Las filas estaban
  escritas y eran correctas; lo roto era la CONSULTA. Corregido el `WHERE`, las
  publicaciones antiguas aparecen solas, sin duplicar ninguna. Escribir una
  migración para arreglar un `WHERE` habría sido el peor intercambio posible.
- **⚠️ CON UNA SOLA FILA, UN DESTINO NO PUEDE FALLAR A MEDIAS**, y hay que
  decirlo en vez de fingir lo contrario. Publicar en tres sitios es un solo
  UPDATE de un array: entra entero o no entra. «Error de publicación en el sitio
  B» describe un fallo que esta arquitectura no puede tener, y fabricar una
  tabla de estado por destino para reportarlo sería inventar estado. Lo que sí
  es real y se reporta es `desincronizado`: un destino que apunta a un sitio que
  ya no existe, o una centralizada que se quedó sin destinos.
- **⚠️ RETIRAR DE UN SITIO NO ES ELIMINAR EL MAESTRO**, y es el riesgo que
  APARECIÓ al hacer visibles las réplicas: la primera reacción ante «esto no lo
  escribí yo» es borrarlo, y eso se llevaría la publicación de los otros sitios.
  El mismo botón hace dos cosas distintas según de quién sea la fila y
  `removalIntent` es el único punto que lo decide. La respuesta DICE cuál
  ocurrió: «se eliminó» y «se retiró de este sitio» no son lo mismo.
- **⚠️ QUITAR EL ÚLTIMO DESTINO NO PUEDE DEJARLA GLOBAL.** Con `clubId` NULL y
  el array vacío, la cláusula la lee como GLOBAL HEREDADA: retirarla del último
  sitio la haría aparecer en **TODOS** los del ecosistema, lo contrario de lo
  que pidió quien la retiró. `retirePlan` la despublica y lo dice.
- **UNA RÉPLICA NO SE EDITA DESDE EL SITIO DESTINO.** El contenido maestro y la
  publicación de cada sitio son cosas distintas (punto H del pedido): editarla
  desde A cambiaría lo que ven B y C sin que nadie de B ni de C lo pidiera. Se
  bloquea en el SERVIDOR y se DICE dónde se edita — un bloqueo sin salida se lee
  como una avería.
- **EL ORIGEN SE PINTA EN CADA FILA** —Propia, Replicada, Global— con sus
  destinos. Sin decirlo, una réplica se ve idéntica a una propia y no hay forma
  de entender por qué una se puede editar y la otra no.
- **⚠️ SE CERRÓ LA FUGA INVERSA.** El listado añadía `OR "clubId" IS NULL` para
  los roles `administrator` y `editor`: eso le daba a CUALQUIER editor todas las
  centralizadas del ecosistema —incluidas las dirigidas a otros sitios— con sus
  botones de editar y eliminar al lado. El aislamiento va en el `WHERE`, no en
  la pantalla (v4.932).
- **EL BORRADO EN BLOQUE NO MIENTE.** Era `deleteMany({ id in ids, clubId })`:
  sobre una réplica no casaba y la fila se salteaba **en silencio**, así que se
  marcaban cinco y se anunciaban cinco habiendo tocado tres. Ahora cada fila pasa
  por `removalIntent` y el resultado dice qué se eliminó, qué se retiró y qué no
  se pudo tocar y por qué.
- **EL DIAGNÓSTICO ES DE SÓLO LECTURA Y DEMUESTRA, NO AFIRMA.** Por cada sitio
  compara cuántas publicaciones le son alcanzables en público contra cuántas le
  lista el panel: **la diferencia tiene que ser cero**. Un diagnóstico que
  cambia cosas al mirarlas no sirve para diagnosticar (regla del CRM, v4.702).
- **⚠️ EL DOBLE DE LA BASE FILTRA LEYENDO EL SQL, no reimplantando el criterio.**
  Un doble que reescribe en JavaScript la condición que la prueba dice comprobar
  la vuelve vacua —la lección de v4.896—: acá, si alguien quita
  `= ANY("targetClubIds")` de la consulta real, el doble deja de devolver la
  fila y la prueba falla, que es lo que tiene que pasar.
- **PROBAR EL CAMINO, NO SÓLO EL CRITERIO.** El criterio de visibilidad NUNCA
  estuvo mal —la cláusula pública era correcta desde v4.548—; lo que estaba mal
  era el `WHERE` que escribía el controlador. Una prueba de criterio habría
  pasado en verde con el fantasma delante. Es la lección de v4.744 y v4.889.

**Pendiente conocido:** `getTrashedProjects` conserva el mismo patrón
(`clubId = req.query.clubId` + `400 clubId is required`), así que la papelera de
proyectos le responde 400 al operador sin sitio elegido. Es **otro módulo** y no
se tocó acá: corregirlo cambiaría una pantalla que hoy funciona para quien la
usa con un sitio seleccionado, y merece su propia vuelta.

## Dónde se publica una noticia que ya existe — v4.1243

Reporte con captura: en `app.clubplatform.org/admin/noticias`, el botón
«Gestionar destinos de distribución» sobre «E-Club Origen apoyó campaña Jaque
Mate a la Polio» (Origen: Propia, 0 réplicas) abría la Trazabilidad con «Este
artículo no tiene sitios de distribución asignados» y **no ofrecía ningún
sitio**. El modal sólo pintaba `targetClubIds`; para elegir destinos había que
abrir el editor, y su pestaña «Distribución» sólo la ven el operador y el
distrito. Se pidió: decir quién la publicó y desde qué distrito, mostrar el
sitio activo del club y ofrecer **por defecto el distrito y «con Rotarios»**,
que es **COLROTARIOS** (`colrotarios.org`): «todo lo que se publique en el
distrito y en los clubes Rotarios que tienen el ecosistema activo también se
pueda publicar en con Rotarios».

| Archivo | Qué es |
|---|---|
| `server/lib/postDistributionPlan.js` | El CRITERIO, **puro**: quién la publicó, el sitio de origen, los destinos por defecto, qué puede elegir cada cuenta y cómo se guarda. La lectura (`loadDistributionContext`) recibe la función de consulta |
| `getPostDistributionPlan` / `savePostDistribution` en `contentController.js` | `GET` y `PUT /admin/posts/:id/distribution` |
| `DistributionTraceabilityModal.tsx` | El modal: «Dónde se publica» arriba, las réplicas guardadas abajo |

Prueba: `npm run test:posts:distribution` (66, sin base ni red).

**Reglas durables:**

- **«CON ROTARIOS» ES COLROTARIOS.** No hay ningún sitio «ConRotarios»: el
  pedido llegó por voz. Hay **dos** filas `Club` llamadas COLROTARIOS (una sin
  dominio); `pickColrotarios` elige la activa con dominio propio. El criterio
  de reconocimiento es el de la bandeja (`submissionInbox.js`): tipo,
  categoría, nombre o dominio.
- **QUIÉN LA PUBLICÓ ES UN SITIO, NO UNA PERSONA.** `Post` no guarda autor, así
  que «Publicado por» es el sitio de `clubId` y su distrito (o Club Platform +
  `sourceDistrictId` para una central). No inventar un autor.
- **EL SITIO DE ORIGEN NO ES UN DESTINO.** Ya se ve allí por `clubId`; aparece
  primero, fijo y con su enlace, y `mergeTargetSelection` lo descarta si llega
  en la lista. El `PUT` **no toca `clubId`**.
- **POR DEFECTO = PRESELECCIONADO, NO PUBLICADO.** El distrito y COLROTARIOS
  vienen marcados sólo cuando la noticia aún no tiene destinos; nada cambia
  hasta pulsar «Guardar distribución». Una noticia del propio distrito no se
  ofrece a sí misma.
- **QUIÉN ELIGE QUÉ lo decide el servidor** (`distributionScopeFor`): el
  operador, cualquier sitio activo; el administrador de distrito, los de su
  distrito más COLROTARIOS; el administrador/editor **del club dueño**, sólo
  su distrito y COLROTARIOS (por eso el botón también le aparece a él). El
  resto, nada y con su motivo.
- **⚠️ NINGÚN DESTINO AJENO SE BORRA EN SILENCIO.** Lo que ya tenía la noticia y
  la cuenta que guarda no puede elegir se CONSERVA (`kept`): un club que
  añade COLROTARIOS no le quita a la noticia el destino que puso el distrito.
- **⚠️ UNA CENTRAL NO SE QUEDA SIN DESTINOS** (409): con `clubId` NULL y el array
  vacío se leería como global y aparecería en TODOS los sitios. Es la regla de
  `retirePlan`.
- **«RETIRAR» QUITA EL DESTINO.** Hasta v4.1242 el botón de la tabla llamaba a
  `distribution/target-status`, que sólo escribe `status: 'retired'` en
  `distributionStatus` — un campo que la cláusula de visibilidad **no mira**:
  la noticia seguía publicada en ese sitio. Ahora usa el mismo `PUT`.
- **EL EDITOR TAMBIÉN LO OFRECE.** `distribution-targets` devuelve
  `colrotariosId` (y lo añade a la lista aunque no sea del distrito), la
  pestaña muestra «Publicar también en COLROTARIOS · Por defecto» junto al
  distrito, y `resolveAllowedTargets` lo acepta para el distrito. Una noticia
  **nueva** lo trae marcado sólo desde un sitio concreto: en Club Platform sin
  sitio, un destino convertiría una noticia global en una visible SÓLO allí.

**Pendiente conocido:** `retryTargetDistribution` (`POST
/posts/:id/distribution/retry`) añade un destino sin comprobar permisos más allá
del rol de contenido. El modal ya no lo usa; merece su propia vuelta.
