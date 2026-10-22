<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Solicitudes de contenido: la BANDEJA — v4.999

Reporte con las dos pantallas delante: la tarjeta «Solicitudes de contenido ·
15 · 15 sin revisar» mostraba una cifra y **no llevaba a ninguna parte**, y en
`rotary4281.org` el número aparecía igual sin que hubiera forma de abrir nada.

| Archivo | Qué es |
|---|---|
| `server/lib/submissionInbox.js` | El CRITERIO. **Puro**: qué cuenta como «sin revisar», catálogo CERRADO de filtros, alcance y resumen |
| `listInbox` · `countInbox` · `inboxFacets` · `getInboxSubmission` · `assignSubmission` | La I/O transversal, en `contentSubmissionStore.js` |
| `requireCampaignAccess` · `listSubmissionsInbox` · `getInboxCounts` | La puerta y la vista, en `contentSubmissionController.js` |
| `campaignIdsInScope` | El alcance en ids, en `contributionCampaignController.js` |
| `src/components/admin/contribution/SubmissionDetail.tsx` | La FICHA, compartida por las dos pantallas |
| `src/pages/admin/SubmissionsInbox.tsx` | La bandeja (`/admin/campanas-contribucion/solicitudes`) |
| `src/lib/submissionInbox.ts` | Espejo MÍNIMO: rótulos y la forma de la URL. **Sin el alcance** |

Pruebas: `npm run test:submissions:inbox` (90 casos: criterio + el CAMINO con
la base sustituida en memoria) y `npm run test:submissions:inbox:ui` (21 en un
navegador con la API interceptada). Verificadas a la inversa: quitando la
cláusula del alcance fallan 10, incluida la que exige que el correo de otra
organización no asome.

**Reglas durables:**

- **⚠️ LA BANDEJA YA EXISTÍA Y ESTABA ENTERRADA — no se construyó una segunda.**
  `SubmissionsPanel` (v4.972) lista, filtra y opera desde v4.968; lo que fallaba
  eran tres cosas: vivía dentro del editor de UNA campaña, en una sección
  plegada, y sus ocho rutas eran `superAdminOnly`. Lo que se agrega es la
  pregunta TRANSVERSAL —«qué solicitudes tengo, de todas mis campañas»—; la
  sección de la campaña se conserva con su enlace para compartir y su
  configuración, que son de la campaña.
- **⚠️ EL GATE DEJÓ DE SER `superAdminOnly` Y ESO ERA EL PENDIENTE DECLARADO
  DESDE v4.987** («abrirlo exige acotar `contentSubmissionController` por
  dueño»). Lo sustituye `requireCampaignAccess`, que es el MISMO `scopedCampaign`
  con el que ese sitio ya abre, edita y publica esa campaña. **No se escribe un
  segundo criterio de alcance**: con dos, un tenant vería solicitudes de una
  campaña que su panel no le deja abrir, y el fallo sería MUDO. Va como
  middleware DELANTE de cada manejador, no dentro de cada uno: el noveno se
  olvidaría.
- **⚠️ UNA SOLICITUD NO PERTENECE A UN SITIO: PERTENECE A UNA CAMPAÑA.** El
  formulario es PÚBLICO y anónimo, así que no hay sesión que registrar, y el
  club que escribe quien envía es texto libre de un formulario abierto —deducir
  de ahí un `tenant_id` sería adivinar—. Quién puede verla se resuelve por quién
  alcanza esa campaña (`campaignIdsInScope` → `scopeForSite`). Es también lo que
  el pedido describe: un sitio ve las de las campañas que publica, incluidas las
  compartidas que le llegan del Distrito.
- **⚠️ `null` ES «TODAS» Y `[]` ES «NINGUNA», Y CONFUNDIRLOS ABRE LA BANDEJA
  ENTERA.** `campaignIdsInScope` devuelve `null` sólo para el operador; una
  sesión sin sitio devuelve `[]`, y el `WHERE` fuerza `FALSE` —no «sin
  filtro»—. Es la distinción de `mailboxScopeFor` (v4.932), y acá el precio de
  equivocarse son los datos de contacto de personas reales de otra
  organización. Lo comprueba una prueba con una sesión sin sitio.
- **⚠️ EL AISLAMIENTO VA EN EL `WHERE`, Y EL DOBLE DE LA BASE LO LEE DEL SQL.**
  `db-inbox-stub.mjs` busca `s."campaignId" = ANY($n::text[])` en el texto de la
  consulta y sólo filtra si de verdad está: quitarla del `WHERE` real hace
  fallar la prueba. Un doble que reimplemente la regla que la prueba dice
  comprobar la vuelve VACUA y encima afirma lo contrario (v4.896).
- **⚠️ PEDIR UNA CAMPAÑA AJENA POR LA URL RESPONDE 404, NO UNA LISTA VACÍA.**
  Se comprueba ANTES de consultar (`resolveInboxCampaigns`): un vacío mudo se
  lee como que el módulo está roto, y un 403 confirmaría que esa campaña existe
  —que es la mitad de lo que hace falta para ir a buscarla—.
- **⚠️ LA FICHA ES UNA SOLA** (`SubmissionDetail`). Vivía dentro de
  `SubmissionsPanel`, así que la bandeja nueva habría sido una segunda copia —y
  una copia se separa en silencio: el día que se agregue una acción, una de las
  dos pantallas se queda sin ella (la lección de la casilla de distritos,
  v4.748, y del selector de pools, v4.877). Lo fija una prueba que exige que el
  panel ya no tenga acciones propias.
- **LA BANDEJA TRANSVERSAL ES DE SÓLO LECTURA.** Las acciones siguen entrando
  por la ruta de la campaña, que ya comprueba la transición, ya deja historial y
  ya pasa por la puerta. Un segundo camino de escritura se separaría del primero
  en silencio (v4.967). La única excepción es asignar responsable, que no
  depende de la campaña.
- **⚠️ EL FILTRO DE ESTADO NO SE APLICA AL RESUMEN.** Es lo que permite pintar
  las pestañas con su número mientras una está seleccionada: con el filtro
  puesto, la elegida mostraría su cuenta y las demás cero, y no habría a dónde
  ir. Y el resumen se cuenta sobre lo que hay en la BASE, no sobre la página: el
  listado está paginado y contar las filas visibles diría «50» en una bandeja de
  200.
- **⚠️ «15 SIN REVISAR» ES UNA LISTA DECLARADA, no «el primer estado»**
  (`PENDING_STATES`). Deducirlo del orden dejaría el número a merced de que
  alguien reordene el catálogo. `requiere_info` cuenta como pendiente: le
  pedimos algo a quien envió y hasta que conteste sigue esperando a alguien.
- **Los ejes de los filtros salen de lo que HAY** (`inboxFacets`), no de un
  catálogo escrito a mano —un desplegable con opciones que no devuelven ninguna
  fila es peor que ninguno (v4.650)—, y se calculan sobre el ALCANCE entero y no
  sobre lo filtrado: si salieran de lo filtrado, elegir una campaña haría
  desaparecer a las demás del desplegable y no habría forma de volver (regla del
  catálogo de destinos de la Bóveda, v4.849).
- **Un filtro que el servidor no reconoce se DESCARTA y se DICE.** Un filtro que
  no se aplica ENSANCHA lo que se ve, que acá es el error caro (regla de las
  audiencias del CRM, v4.701). El catálogo es CERRADO: ningún valor del cliente
  entra en el SQL.
- **⚠️ EL ESPEJO DEL NAVEGADOR NO TRAE EL ALCANCE, y es deliberado.** Con
  `reachesSubmission` en `src/lib/`, la pantalla y el `WHERE` podrían discrepar
  sobre quién ve qué — y lo que se separaría es el aislamiento entre
  organizaciones. Lo fija una prueba que comprueba su AUSENCIA.
- **La forma de la URL vive en UN solo sitio** (`inboxLink`). Con la ruta
  escrita a mano en cada pantalla que enlaza, el día que cambie una queda
  apuntando a una página que no existe; y con el nombre del parámetro escrito de
  un lado y leído de otro, el enlace se abriría sin el filtro que dice llevar.
- **⚠️ LA TARJETA ENTERA ES EL ENLACE, no un enlace dentro.** El gesto natural
  sobre un contador es pulsarlo, y un enlace pequeño deja el resto de la tarjeta
  muerto. Es un `Link` de verdad y no un `div` con `onClick`: eso es lo que da
  abrir en pestaña nueva, el foco con teclado y el destino en la barra de
  estado. Y **sólo enlaza si se pudo medir**: con el contador en «—» no se sabe
  si hay algo detrás, y una lista vacía por un fallo de lectura se lee como que
  no hay nada.
- **El «N solicitud(es)» de una campaña lleva a la bandeja YA FILTRADA por
  ella**, con `stopPropagation` para no abrir además el editor: la fila entera
  es pulsable y este enlace vive dentro (misma regla que la cifra de la Bóveda,
  v4.990).
- **⚠️ `archivado` NO ES `descartado`.** Descartado dice «esto no sirve» y EXIGE
  motivo, porque es lo que se le devuelve a quien mandó el material; archivado
  dice «ya se trabajó y se guarda» — el final normal de una solicitud atendida,
  sin ningún reproche que explicar. Fundirlos obligaría a rechazar lo que salió
  bien para poder sacarlo de la bandeja. Ninguno de los dos es terminal.
- **⚠️ «PROGRAMADA» NO SE AGREGÓ, y no es un olvido.** No hay quien la escriba:
  la programación de una publicación vive en `SocialPublication.scheduledFor`,
  en otro módulo. Un estado que nadie escribe es una rama que nunca es
  verdadera — la regla de `clicked` en el CRM (v4.701).
- **⚠️ `originClubId` DICE POR QUÉ PUERTA ENTRÓ, no de quién es.** Es lo único
  que se puede saber sin adivinar de un formulario anónimo: el dominio del que
  salió, resuelto con `resolveSiteId` —el camino de `by-domain`, no el atajo del
  SEO, que no encuentra el dominio propio de un distrito (v4.744)—. Es ADITIVO y
  vale `null` para todo lo anterior a v4.999: rellenarlo hacia atrás sería
  inventar el dato que se vino a medir. Un origen que no se pudo resolver NUNCA
  tumba el envío.
- **La columna está ENUMERADA en el atajo del ensure** (la trampa de v4.908),
  con su `ADD COLUMN IF NOT EXISTS`: `CREATE TABLE IF NOT EXISTS` no amplía
  nada, y una base que estrenó el módulo en v4.968 tiene las tablas y no la
  columna.
- **La ruta hija hereda el módulo del RBAC** (`matches` casa por prefijo de
  segmento), así que no se registra aparte. Se comprueba igual: si dejara de
  casar, la bandeja desaparecería de la barra lateral de quien tiene un rol
  acotado sin que nada avisara (v4.939).
- **⚠️ AL PROBAR ESTA PANTALLA EN UN NAVEGADOR, COMPARAR SIN DISTINGUIR CAJA.**
  `innerText` respeta `text-transform`, así que «Solicitudes de contenido» llega
  en MAYÚSCULAS y una comprobación exacta falla con la tarjeta pintada delante
  (v4.990). Y el arnés necesita un ORIGEN real: sobre `about:blank` —lo que deja
  `setContent`— `localStorage` LANZA y la petición no sale, así que la prueba
  pasaría sin ejercitar nada (v4.720).

**Pendientes conocidos:** el filtro por **tipo de contenido** distingue fotos,
videos y «sin archivos», y **no** por «tipo de publicación solicitada» — ese
dato no se pide en el formulario y no se inventa. No hay **acciones en bloque**
sobre varias solicitudes (aprobar diez de una vez): el patrón está resuelto en
la Bóveda y en COLROTARIOS, y aquí cada aprobación mueve archivos a la
Biblioteca, así que merece su propia vuelta. La **fecha límite** que menciona el
pedido no existe como dato y no se agregó: no hay quien la escriba hoy. Y el
listado **no se exporta** a Excel ni PDF.
