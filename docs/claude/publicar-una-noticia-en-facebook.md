<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Publicar una noticia en Facebook — v4.1013

Cada artículo de Gestión de Noticias se abre pulsando su fila, tiene cuatro
acciones (Ver · Editar · Compartir · Eliminar) y se publica en las páginas de
Facebook conectadas a ESE sitio, con su historial de difusión.

| Archivo | Qué es |
|---|---|
| `server/lib/socialShareSpec.js` | El CRITERIO. **Puro**: redes y su disponibilidad, si una entidad se puede compartir, si una cuenta sirve, el texto que se manda y la traducción de los fallos de Meta |
| `server/lib/ensureContentDistributionSchema.js` | `ContentDistribution` en runtime |
| `server/lib/socialPublishingService.js` | El SERVICIO central: resolver la entidad, las cuentas del tenant, reclamar, publicar, registrar, historial |
| `server/lib/postPublicUrl.js` | La dirección pública de un artículo, resuelta por SITIO |
| `server/controllers/contentShareController.js` | `targets` · `share` · `history` · `summary` |
| `src/components/admin/social/ShareModal.tsx` | El modal, COMPARTIDO por el listado y el editor |
| `src/lib/socialShare.ts` | Espejo MÍNIMO: rótulos y la clave de operación |

Pruebas: `npm run test:social:share` (126 casos: criterio, el CAMINO con la
base, Meta y el descifrado sustituidos, e invariantes sobre los archivos).
**Sin Postgres, credenciales ni red.** Verificadas a la inversa sobre los tres
candados.

**Reglas durables:**

- **⚠️ LAS TRES CASILLAS DEL EDITOR NO PUBLICABAN NADA, y ése era el defecto de
  fondo.** `publishFacebook`, `publishLinkedin` y `publishTwitter` existían
  **sólo** en `News.tsx` —ni columna en Prisma ni una sola lectura en el
  servidor— y el aviso azul afirmaba que «la noticia se publicará
  automáticamente en tus perfiles institucionales al guardar los cambios». Se
  marcaba, se guardaba y no salía nada: la clase de fallo que este archivo
  documenta una y otra vez —no falla ruidosamente, entrega otra cosa—. Lo fija
  una prueba que lee el archivo: si vuelven los tres campos o la frase,
  falla. **Publicar es un acto EXPLÍCITO**, con su modal y su confirmación real
  de Meta.
- **⚠️ NO HAY UN SEGUNDO MOTOR DE META, y de eso cuelga todo lo demás.** Quien
  habla con la Graph API sigue siendo `services/socialPublishService.js`
  (`publishContentToTarget`), el MISMO que usa la Distribución multi-destino
  desde v4.864 y que ya sabía publicar texto + enlace en una Página. Lo que se
  agregó es la ORQUESTACIÓN. Con dos caminos hacia el proveedor, el día que se
  corrija el manejo de un rechazo de Meta una mitad se queda atrás y el fallo es
  MUDO: las dos siguen publicando. Lo fija una prueba que cuenta los
  LLAMADORES, no la forma de llamar — fijar la sintaxis se rompe al
  refactorizar con el criterio intacto (la lección de v4.984).
- **⚠️ UN ARTÍCULO VIAJA COMO ENLACE, NUNCA COMO FOTO.** `publishPost` —el
  camino del Estudio de Contenido— EXIGE una imagen y publica por
  `/photos`: usarlo acá perdería el enlace, que es justo lo que este flujo
  existe para llevar. La imagen y el titular los resuelve Facebook leyendo el
  Open Graph que el servidor ya compone (v4.702), así que la portada del
  artículo llega sin mandar un solo byte.
- **⚠️ LA PROTECCIÓN CONTRA EL DOBLE CLIC ES DE LA BASE, no una lectura
  previa.** Entre un SELECT y un INSERT caben dos peticiones —el doble clic, el
  reintento del navegador, dos pestañas— y el precio de equivocarse acá es una
  publicación duplicada en la página de una institución, que hay que ir a
  borrar A MANO en Facebook. El índice único `(operationKey, accountId)` **no
  es parcial** —las dos columnas son NOT NULL— así que el `ON CONFLICT` va a
  secas (la trampa de v4.648). Y **se reclama ANTES de llamar a Meta**: un
  reclamo posterior no protegería de nada, porque las dos peticiones ya
  habrían publicado.
- **La `operationKey` la genera la PANTALLA al abrir el modal, no al pulsar.**
  Es lo que hace que el doble clic caiga en la MISMA operación. «Publicar
  nuevamente» pide una clave nueva a propósito: es otra operación, y con la
  misma no saldría nada — que se leería como que el botón está roto.
- **⚠️ UN BORRADOR NO SE COMPARTE, y se rechaza ANTES de gastar una llamada al
  proveedor.** Su dirección pública devuelve 404, así que Facebook mostraría
  una tarjeta rota — y eso no se arregla después editando el artículo. El
  bloqueo se dice con su MOTIVO y su SALIDA: un bloqueo sin salida se lee como
  una avería (v4.1008).
- **⚠️ LA DIRECCIÓN PÚBLICA LA RESUELVE EL SERVIDOR Y VIAJA RESUELTA.**
  Componerla en el navegador daría una distinta según desde dónde se abrió el
  panel, y el dominio propio de un DISTRITO **no está en `Club.domain`** sino en
  la fila de `District` (v4.744). Se reutilizan `publicHostFor` y `articleUrl`
  —no se escribe un segundo resolutor—: con dos criterios, el enlace del ojo y
  el que se le manda a Facebook podrían apuntar a sitios distintos.
- **UNA PUBLICACIÓN CENTRALIZADA NO TIENE UNA SOLA DIRECCIÓN.** Es UNA fila que
  varios sitios resuelven al leer (v4.938): cuál se devuelve lo decide desde
  QUÉ panel se administra. Desde el panel del Distrito 4281, el enlace es el
  del 4281. Una que no está dirigida a este sitio **no tiene dirección acá** y
  se dice, en vez de componer una que devuelve 404.
- **Las URLs de TODO el listado salen en un número FIJO de consultas**
  (`publicUrlsForPosts`): se agrupa por sitio y el host de cada uno se resuelve
  una vez. Una consulta por publicación dejaría el listado inusable con el
  segundo cliente grande (el punto de escalabilidad de `getCentralOverview`,
  v4.853). Y DEGRADA: esto adorna un listado que ya funciona.
- **⚠️ `Post` NO GANA NI UNA COLUMNA, y tampoco `SocialPublication`.** Lo
  primero es la regla de `logo_intl` (v4.699) en su versión más cara: `Post` se
  consulta con `findMany` **sin `select`** en media plataforma, y el `build` no
  ejecuta `db push`. Lo segundo es de clasificación: `SocialPublication` modela
  una PIEZA generada por el Estudio de Contenido —imagen, copies por
  plataforma, programación— y esto es el REGISTRO DE DIFUSIÓN de una entidad
  que ya existe. Fundirlas obligaría a inventar una publicación con imagen para
  cada artículo compartido. `ContentDistribution` vive fuera de Prisma y está
  en la lista del guardián de `db:push`.
- **⚠️ EL TENANT SALE DEL TOKEN, NUNCA DEL CUERPO.** Si `clubId` viniera en la
  petición, acotar las páginas a un sitio no serviría de nada: bastaría mandar
  el id de otro distrito para publicar en su página. El aislamiento va en el
  `WHERE`, y un artículo ajeno responde **404, no 403** — confirmar que existe
  es la mitad de lo que hace falta para ir a buscarlo (v4.999).
- **⚠️ EL TOKEN NUNCA SALE AL NAVEGADOR, NI RECORTADO.** `accountsForTenant` no
  selecciona `accessToken` a propósito, y el token se lee **aparte y sólo en el
  momento de publicar** (`tokenOf`): así ninguna respuesta puede arrastrarlo por
  descuido. Lo comprueba una prueba que busca el token en el JSON de las
  respuestas.
- **EL ERROR DE META SE PROPAGA TEXTUAL Y SE TRADUCE DELANTE.** «(#190) Error
  validating access token» es exacto y no le dice a nadie qué hacer; traducirlo
  a secas lo vuelve irreconocible al buscarlo en el soporte de Meta. Va el
  diagnóstico en español con DÓNDE se corrige, y el original entre paréntesis
  — la regla del CRM (v4.702) y del remitente institucional (v4.942). Un código
  desconocido **no se disfraza de conocido**: sale con el texto de Meta.
- **⚠️ UNA PÁGINA QUE NO SIRVE SE MUESTRA IGUAL, con su motivo y su salida.**
  Esconderla dejaría preguntándose dónde quedó. Token del formato anterior,
  cuenta revocada, credencial vencida y falta de permiso se corrigen en sitios
  distintos, así que se nombran distinto.
- **Los permisos de la página se COMPRUEBAN cuando vienen; su ausencia no
  descalifica.** Hay conexiones antiguas que no los guardaron, y equivocarse
  hacia el otro lado deja a alguien sin poder publicar en una página que sí
  administra. Meta rechaza igual, y entonces el motivo llega textual.
- **⚠️ EL ESTADO EDITORIAL Y EL DE DIFUSIÓN NO SE MEZCLAN.** Un artículo
  «Publicado en sitio» puede estar «No publicado en Facebook», y son dos hechos
  distintos sobre la misma pieza: fundirlos haría que despublicar del sitio
  pareciera retirar lo que ya salió a una red, que es falso — lo publicado en
  Facebook sigue ahí. Van en dos líneas, no en una insignia.
- **UN SOLO MODAL, montado por las DOS entradas** —el botón del listado y
  «Publicar ahora» de la pestaña Redes Sociales—. Escrito dos veces, el día que
  se agregue una red una de las dos se queda sin ella (la lección de
  `SubmissionDetail`, v4.999). Las dos van contra el MISMO servicio.
- **NO ES ATÓMICO Y SE DICE.** Si la segunda página falla, la primera ya
  publicó de verdad y deshacerlo exigiría borrar un post en Facebook. El
  desenlace va POR PÁGINA y el estado global es `partial`: un resumen único
  diría «no se pudo publicar» cuando dos de tres sí salieron.
- **EL HISTORIAL SÓLO AGREGA.** Publicar de nuevo crea otra fila; no se edita
  ni se borra ninguna. Se guarda el TEXTO que de verdad salió, porque el copy
  del artículo se puede editar después y entonces el historial diría que salió
  algo que nunca salió.
- **Un fallo de la AUDITORÍA no cuesta la publicación** — va en su propio `try`
  y se comprueba a propósito con el doble lanzando.
- **`entityType` es un catálogo CERRADO y el servicio es GENÉRICO desde el
  primer día.** Hoy sólo `post` tiene resolutor; Eventos, Proyectos, campañas y
  Reels están declarados y se dice que todavía no. Agregarlos es una entrada en
  `ENTITY_RESOLVERS` — el servicio, el modal y el modelo de datos no cambian.
- **⚠️ EL ESPEJO DEL NAVEGADOR ES MÍNIMO.** Rótulos y la clave de operación;
  **no trae** `accountReadiness`, `shareability` ni la traducción de los fallos
  de Meta. Con dos criterios, el modal ofrecería una página que la API rechaza
  —y lo que se separaría es en la cuenta de qué organización aparece una
  publicación—. Lo fija una prueba que comprueba su AUSENCIA.
- **LinkedIn y X están DECLARADOS y sin implementar**, con su motivo: el único
  proveedor conectado es Meta. Ofrecerlos daría una casilla que no publica nada
  (v4.650) y, peor acá, una que promete que la noticia salió. Instagram está
  conectado y **no recibe enlaces**: su pie no los hace pulsables, y se dice con
  esas palabras.

**Pendientes conocidos:** la **programación** de una difusión no existe —hoy se
publica en el acto; el patrón está resuelto en la Distribución multi-destino
(`DistributionJob`) y engancharlo es la vuelta siguiente—; **no hay reintento
automático** de un fallo transitorio (`retryable` se calcula y todavía no lo
consume nadie: se reintenta a mano desde el modal); las **métricas** de la
publicación en Facebook no se leen —`SocialMetricSnapshot` existe y cuelga de
`SocialPublication`, no de `ContentDistribution`—; y **Eventos y Proyectos**
están declarados sin resolutor, así que su botón «Compartir» todavía no existe.
