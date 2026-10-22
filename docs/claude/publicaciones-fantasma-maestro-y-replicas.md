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
