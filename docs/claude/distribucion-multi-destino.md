<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Distribución multi-destino — v4.864 (vista previa v4.865, panel de grupos v4.876)

Una pieza sale hacia varias Páginas e Instagram del ecosistema, un destino por
vez y con el intervalo que se elija. Pestaña propia en Estudio de Contenido.

| Archivo | Qué es |
|---|---|
| `server/lib/distributionSpec.js` | El CRITERIO de la cola. **Puro**: destinos, estados, intervalos, calendario con zona horaria y ventana, límites, clasificación de errores de Meta e idempotencia |
| `server/lib/groupSpec.js` | El CRITERIO de los grupos. **Puro**: estados, transiciones, proveedores, importación (CSV/JSON/líneas), exportación, filtro y paginación |
| `server/lib/distributionGroups.js` | La I/O de los grupos y la migración desde el `Setting` |
| `src/components/admin/content-studio/GroupPicker.tsx` | El panel de grupos: buscador, casillas, listas, favoritos y paginación |
| `server/lib/ensureDistributionSchema.js` | Crea `DistributionCampaign`, `DistributionJob` y `DistributionEvent` en runtime |
| `server/lib/distributionQueue.js` | La I/O: crear, reclamar, despachar, reintentar y los controles |
| `server/controllers/distributionController.js` | La API del asistente y del historial |
| `src/lib/distributionSpec.ts` | Espejo MÍNIMO: rótulos y colores. **Sin aritmética de fechas** |
| `src/components/admin/content-studio/DistributionPanel.tsx` | El asistente, la línea de tiempo y el historial |

Pruebas: `npm run test:distribution` (167 casos) y
`npm run test:distribution:queue` (84, con la base y `fetch` sustituidos) — **ninguna
necesita base, credenciales ni red**— más `npm run test:distribution:ui` (26, en un
navegador con la API interceptada; se salta sola si falta `playwright`).

**Reglas durables:**

- **⚠️ NO HAY GRUPOS POR API, Y NO ES UN PENDIENTE.** Meta retiró la Facebook
  Groups API el **22 de abril de 2024**, de TODAS las versiones, junto con
  `publish_to_groups`, `groups_access_member_info` y la capacidad de que un
  administrador instale una app en su grupo. No hay endpoint, no hay permiso que
  solicitar y no hay App Review que pase. **La trampa a descartar**:
  `metaService.js` fija `v18.0` y el anuncio dice «en v19» — el propio anuncio
  dice *removed from all versions* y quedó confirmado en el foro de Meta que
  ocurre igual en v18 y anteriores. Bajar la versión no lo devuelve. Lo único
  que queda para un grupo es que una persona publique a mano, y las
  herramientas que «siguen publicando en grupos» lo hacen con extensiones que
  simulan pulsaciones dentro de la sesión del usuario: eso arriesga la cuenta de
  quien publica y la reputación institucional. **No implementarlo por esa vía.**
  Lo comprueba una prueba que lee los archivos y falla si reaparece la llamada
  al feed de un grupo o el permiso — un comentario que depende de que alguien lo
  lea no protege nada (la lección de `check:routes`, v4.859).
- **`viaApi` es un campo DECLARADO del destino, no una deducción del nombre.**
  Es lo único que separa un destino que la cola despacha de uno que deja
  esperando a una persona; deducirlo del tipo haría que un destino nuevo cayera
  en la rama equivocada por omisión.
- **El modo asistido se AVISA junto al botón que lo dispara**, no sólo en la
  lista. Si la pantalla dijera «distribuir a 25 grupos» y en realidad dejara 25
  tareas manuales, se leería como una función rota — la regla del modo
  Fotográfico del Creador de Reels (v4.798). Y registra **quién** publicó: sin
  ese dato el modo no aporta lo único que puede aportar, que es la trazabilidad.
- **UN DESTINO, UNA FILA.** `SocialPublication.targetAccounts` guarda el
  resultado por cuenta en un array JSON y alcanza para tres destinos publicados
  a mano; para veinticinco jobs que avanzan solos no, porque dos vueltas del
  cron que escriben la misma fila se pisan. Es el mismo motivo por el que
  `ReelScene` se separó de `ReelProject`. **Nunca volver a meterlos en un JSON
  de la campaña.**
- **EL RECLAMO VA SOBRE `attempts`, NO SOBRE `updatedAt`**: el driver de pg
  trunca los microsegundos del timestamp y la igualdad no casaría jamás
  (v4.800). Acá el precio de repetir ese error es publicar dos veces en la misma
  Página.
- **⚠️ `job.attempts` YA viene incrementado por el reclamo.** Sumarle uno al
  decidir el reintento contaba un intento de más: recortaba la cadena a DOS en
  vez de tres y hacía esperar 8 minutos donde tocaban 2. Lo destapó
  `test:distribution:queue`, no el typecheck.
- **El instante de publicación lo manda el BARRIDO, no el reloj de pared**
  (`dispatchJob(job, campaign, now)`). Es lo que hace que el freno por hora y la
  hora publicada hablen del mismo momento; en producción son el mismo valor y
  bajo prueba no, y esa divergencia daba un falso verde.
- **El intervalo NO es un `sleep`**: cada job nace con su hora calculada y el
  cron recoge los que vencieron. Así la cadencia sobrevive a que la función
  muera, a que cierren la pestaña y a un despliegue en medio. **El piso son 5
  minutos** porque el cron corre una vez por minuto: prometer «cada 30 segundos»
  sería una promesa que la infraestructura no cumple.
- **La franja horaria se evalúa en la zona del SITIO.** La función corre en UTC
  y «las 8 de la mañana» no significa lo mismo en Bogotá que en Madrid — hay
  clubes en varios países. Lo que no cabe en el día se empuja al comienzo de la
  ventana del día siguiente, no se dispara de madrugada.
- **⚠️ EL CALENDARIO LO RESUELVE EL SERVIDOR Y VIAJA RESUELTO**
  (`POST /distribution/preview`). La pantalla no rehace la aritmética de fechas:
  con dos cálculos, la línea de tiempo del asistente y las horas que de verdad
  se guardan podrían discrepar, y eso se lee como que la programación no
  funciona. Misma regla que el período de la Bóveda (v4.849), y lo comprueba una
  prueba que busca aritmética de fechas en el `.tsx`.
- **La CLASE del error decide, no el número.** Un límite pausa la campaña y la
  retoma; un permiso marca ESE destino y deja correr los demás; un token
  revocado detiene y pide reconectar; **un bloqueo por política detiene y NUNCA
  reintenta** —insistir ahí es la conducta que Meta lee como abuso, y lo que
  está en juego es la app entera, no una campaña—. El error se guarda TEXTUAL
  con su código: convertirlo en «no se pudo publicar» deja a quien corrige sin
  saber cuál de las tres cosas pasó (la regla del CRM con `metaCode`).
- **`retryable` se DECLARA al registrar el fallo, no se deduce, y ante la duda
  es FALSE.** Un error desconocido no se reintenta: un aviso que no sale se ve
  en el historial y se relanza a mano; uno que sale cinco veces ya salió. Regla
  de `NotificationDelivery` (v4.855).
- **Se reintenta SÓLO el destino que falló**, nunca la campaña: eso volvería a
  publicar en los que ya salieron. Y un destino ya publicado no se puede
  reintentar, se dice con esas palabras.
- **La idempotencia es de la BASE**: índice único sobre
  `(campaignId, targetId, contentHash)`, con `ON CONFLICT DO NOTHING`. Las tres
  columnas son `NOT NULL`, así que el índice **no es parcial** y el
  `ON CONFLICT` no repite predicado — la trampa que costó una corrección en
  v4.648. Comprobar con un `SELECT` antes no sirve: entre la lectura y la
  escritura caben dos peticiones.
- **UNA CAMPAÑA CON DESTINOS FALLIDOS NUNCA SE MARCA EXITOSA**: queda `partial`,
  con los destinos nombrados. Es exigencia expresa del pedido y el estado que
  `SocialPublication` ya traía.
- **El tope por hora ESPACIA, no descarta.** Un job que llega al límite se corre
  una hora hacia adelante; descartarlo perdería el destino en silencio. Y lo que
  acaba de salir cuenta dentro de la misma vuelta, o un barrido de 25 jobs se
  saltaría el límite entero.
- **Hay TRES vías que llaman al mismo `advance`**: el cron cada minuto (siempre),
  el sondeo del navegador (el más rápido cuando alguien mira) y el reintento
  manual. No quitar el cron: sin él una campaña se para en cuanto se cierra la
  pestaña. El sondeo del navegador **sólo existe mientras hay trabajo**.
- **Cancelar detiene NUESTRA máquina de estados, no lo ya publicado.** La
  confirmación lo dice con esas palabras: prometer que se retira de Facebook
  sería falso.
- **La cola NUNCA lanza.** Corre dentro de un cron y dentro del sondeo de una
  pantalla: toda función devuelve su resultado con el motivo escrito.
- **⚠️ EN QUÉ GRUPOS ESTÁ UNA PÁGINA NO SE PUEDE CONSULTAR** (v4.865). Se pidió
  que al elegir la fan page apareciera sola la lista de sus grupos, y no hay
  forma: la Groups API se retiró ENTERA —también la parte de lectura— y la
  referencia de `Page` ya no declara ninguna arista `groups`. No existe endpoint
  que preguntar. Lo único implementable es que declararlos cueste UN gesto:
  `parseGroupLines` interpreta lo pegado —«Nombre | enlace», el enlace solo o un
  nombre suelto—, uno por línea. Desde v4.876 viven en `DistributionGroup`, no
  en el `Setting`.
- **Lo que no se pudo interpretar se DICE, con su motivo.** Con veinte líneas
  pegadas, un descarte silencioso deja sin saber cuáles entraron — la regla de
  `skipped` en los centros de acopio. Y el enlace de una PUBLICACIÓN pegado
  donde va un grupo se rechaza nombrando el error, en vez de guardarse como un
  destino que no existe.
- **⚠️ UN GRUPO SÓLO RECIBE TRABAJO SI ESTÁ VERIFICADO** (v4.876), y la puerta
  está en el SERVIDOR —`splitByPublishability` dentro de `createCampaign`—, no
  en la pantalla: el estado se lee de la BASE, no del cuerpo de la petición.
  Confiar en lo que mande el navegador dejaría la puerta abierta a quien conozca
  el endpoint, y el pedido dice expresamente «no permitir publicar en un grupo
  no autorizado». Los destinos que quedan fuera se **NOMBRAN** con su motivo: un
  descarte silencioso deja adivinando cuáles.
- **`verificado` significa «una persona con nombre lo confirmó», no que Meta lo
  haya dicho** — y por eso se guarda `verifiedBy` y `verifiedAt`. Sin el nombre,
  la verificación no sirve para lo único que puede servir, que es rendir cuentas.
- **⚠️ NO HAY ESTADOS DE ROL** —«Administrador», «Moderador», «Sin permiso de
  publicación» como rol— y su ausencia es deliberada: **no existe API que
  devuelva el rol de nadie en un grupo**. Pintarlos sería inventar un dato y
  presentarlo como verificado, y alguien lo usaría para decidir dónde publicar.
  Lo comprueba una prueba que lee el archivo y falla si aparece la palabra.
- **IMPORTAR NO AUTORIZA.** Un archivo puede traer `status: verificado` y
  `normalizeGroup` lo baja a `sin_verificar`: la verificación es un acto sobre
  esta plataforma, no un campo de un CSV. Vale también para NUESTRO propio
  formato de exportación — lo fija una prueba de ida y vuelta.
- **⚠️ EL FILTRO Y LA PAGINACIÓN DE GRUPOS LOS RESUELVE EL SERVIDOR.** Es lo que
  hace que «elegir los de esta página» tome exactamente lo que se está viendo.
  Con el filtro implementado también en la pantalla, marcar todos elegiría
  grupos fuera de la vista — la forma más cara de equivocarse acá. Misma regla
  que el calendario (v4.864) y que el período de la Bóveda (v4.849).
- **Los grupos elegidos se guardan ENTEROS en el panel, no por id.** La columna
  derecha pagina y filtra: un grupo elegido en la página 2 tiene que sobrevivir
  a que la lista visible cambie.
- **Los grupos pasaron de `Setting` a tabla propia** (`DistributionGroup`,
  v4.876) por el mismo motivo que separó `DistributionJob` de la campaña: ahora
  cada grupo tiene ESTADO —verificación, favorito, etiquetas, última
  publicación— y un JSON no se consulta, no se indexa y se pisa cuando dos
  pantallas escriben a la vez. La migración es **perezosa** —ocurre al leer, no
  al desplegar— porque la sección de base de datos de este archivo prohíbe que
  un despliegue escriba; el `Setting` se **vacía**, no se borra, y esa fila
  vacía es la marca de que la migración ya ocurrió.
- **El `ON CONFLICT` del alta de grupos NO pisa el estado ni la verificación.**
  Reimportar un archivo tiene que poder corregir un nombre sin desverificar lo
  que alguien confirmó — y sin verificar lo que nadie confirmó.
- **Las listas de distribución son ETIQUETAS** (`tags TEXT[]` con índice GIN), no
  una tabla con su puente: una lista es «los grupos con esta etiqueta»,
  seleccionarla es un filtro y renombrarla es un `UPDATE`. El precio —una lista
  no tiene descripción ni orden propio, y una lista vacía no existe— alcanza de
  sobra para las seis que el Distrito usa.
- **⚠️ LA CONCURRENCIA ES UN TOPE POR VUELTA, NO PARALELISMO**, y por eso la
  pantalla la llama «publicaciones por vuelta de la cola». Acota cuántos
  destinos de la misma campaña salen en cada pasada; donde de verdad actúa es al
  drenar un atraso, porque el intervalo mínimo de 5 minutos hace que dos
  destinos rara vez venzan juntos. **Cambió el comportamiento de v4.864**: antes
  una vuelta sacaba TODOS los atrasados de golpe, ignorando el intervalo justo
  cuando más importa. Y no se aplica a los grupos: ahí no hay ninguna llamada
  que paralelizar, y la pantalla lo dice.
- **Un enlace que NO es de un grupo se rechaza con el motivo específico**, y el
  orden de las comprobaciones importa: con el genérico primero, pegar el enlace
  de una publicación devolvía «sin identificador ni nombre», que manda a
  corregir lo que no está mal.
- **La vista previa de la publicación a compartir NO es decorativa** (v4.865): el
  enlace de la que se elige queda cargado en el campo que se distribuye, y
  cambiar de publicación cambia las dos cosas a la vez. Decidir sobre dos líneas
  recortadas es exactamente lo que se reportó. Se comprueba en un navegador
  (`test:distribution:ui`), porque es lo que se pidió mirando la pantalla.
- **El arnés del navegador necesita un ORIGEN real.** Sobre `about:blank` —que
  es lo que deja `setContent`— una dirección relativa no tiene base contra la
  que resolverse: la petición no sale y la prueba pasaría sin ejercitar nada. Es
  la lección de v4.720 y volvió a costar una vuelta acá. Y el bloque de grupos
  nace ABIERTO cuando no hay ninguno declarado, así que la prueba lo **asegura**
  en vez de pulsarlo: pulsar a ciegas lo cerraba.
- **Las cuatro tablas viven fuera de Prisma** y están en la lista del guardián de
  `db:push`.
- **`socialPublishService.js` cubría SÓLO foto única.** v4.864 le agrega texto,
  enlace y video (Página) y video (Instagram). El camino de la foto quedó
  intacto: lo usan el Generador de Publicaciones y la Expansión de Lienzo.

**Pendientes conocidos:** el archivo se manda por URL pública
(`file_url` / `video_url`) y no por subida por partes, así que un video tiene
que estar en S3 antes de distribuirlo —lo está, porque todo el sitio sube por
`uploadMediaFiles`—; el asistente pide la URL del archivo a mano en vez de
ofrecer el `MediaPicker`, que es la regla de v4.700 y queda para la vuelta
siguiente; y **no se usa la programación nativa de Meta**
(`scheduled_publish_time`), a propósito: con ella el control de la cadencia, la
pausa y el reintento pasarían a Meta y dejaríamos de poder pararlos.
