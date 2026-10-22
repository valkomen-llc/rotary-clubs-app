<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## La agenda del Distrito: traer eventos del ecosistema — v4.747

El sitio de un Distrito trae a su propia agenda los eventos próximos de las
organizaciones vinculadas a él —clubes, la Feria de Proyectos, RYE, fundaciones,
programas—. Se resolvió **CLONANDO**, no referenciando.

| Archivo | Qué es |
|---|---|
| `server/lib/districtEcosystem.js` | El CRITERIO. **Puro**: qué se copia, cómo se rotula cada organización, a dónde apunta el original, qué cuenta como divergencia |
| `src/lib/districtEcosystem.ts` | Espejo en el navegador |
| `server/controllers/districtEcosystemController.js` | La orquestación y el aislamiento |
| `server/routes/district-ecosystem.js` | `/sites`, `/events`, `/clone`, `/refresh/:cloneId` |
| `src/components/admin/events/EcosystemPicker.tsx` | El buscador y la selección múltiple |
| `src/components/admin/DistrictPicker.tsx` | El selector de distritos registrados, compartido por las cinco pantallas de sitios |

Pruebas: `npm run test:ecosystem` (192 casos de criterio, **sin base,
credenciales ni red**) y `npm run test:ecosystem:ui` (48 casos: monta los
componentes en un navegador con la API interceptada; pide `npm i --no-save
playwright esbuild` y **se salta solo** si no están).

**Reglas durables:**

- **Es un CLON, no una referencia, y la decisión fue del cliente sabiendo el
  precio.** Se evaluaron las dos: una tabla de referencias con `JOIN` daría una
  única fuente de verdad garantizada por construcción —todos los sitios viven en
  la MISMA base Postgres, así que «consumir el evento del club» es un `JOIN`, no
  una federación—; el clon no la da, pero **no exige ningún cambio de esquema**
  y el evento traído es una fila más de `CalendarEvent` que el módulo de siempre
  lista, edita y publica sin enterarse. Se eligió el clon por eso. Si algún día
  la divergencia duele más que el esquema, la migración está preparada: **todos
  los clones son localizables** por `metadata.source.eventId`.
- **La huella `metadata.source` es lo único que separa esto de un copiar y
  pegar.** De ella salen las tres cosas que hacen el clon sostenible: la
  ATRIBUCIÓN en la ficha pública, la DIVERGENCIA (`divergenceOf`) y el botón de
  ACTUALIZAR. Sin huella, una copia es irrecuperable: nadie puede saber de dónde
  vino ni contra qué compararla. Cuesta una línea al clonar.
- **El clon NO se lleva la inscripción**, y es el punto de todo el módulo.
  `EventEdition."eventId"` es UNIQUE y `EventRegistration`,
  `EventRegistrationCategory` y `EventRegistrationPayment` cuelgan de `eventId`:
  el clon nace con un id nuevo, así que no tiene edición, ni categorías, ni
  precios. Copiar `metadata.registration` —o `metadata.latir`, que es la otra
  llave del panel— le pondría un botón «Inscribirme» que lleva a un formulario
  **vacío**, y quien se inscribiera desde el sitio del Distrito no se estaría
  inscribiendo a nada. Eso **no se ve mirando la pantalla**: se ve el botón y
  parece que funciona. `metadata.venue` SÍ se copia: la sede es un dato del
  lugar, no del cobro.
- **Se acredita al organizador y se enlaza a su ficha original.** Es lo que
  separa difundir de apropiarse, y es además dónde vive la inscripción. Va en la
  página pública del evento (`EventoDetalle.tsx`) y en el panel.
- **El Distrito clona LIBREMENTE de sus sitios; no hay casilla de permiso.** Son
  eventos ya públicos y el clon siempre acredita y enlaza. Una casilla de
  autorización por evento dejaría la función **vacía el día del despliegue** —no
  aparece nada hasta que cada club haga algo— y obligaría a tocar el formulario
  de eventos de todos los sitios. Si alguna vez se pide, el sitio para ponerla es
  el formulario del evento, no una pantalla nueva: las pantallas que se olvidan
  son siempre las del segundo lugar.
- **Sólo se vigilan CUATRO campos** (`TRACKED_FIELDS`): título, fecha de inicio,
  fecha de fin y ubicación. La descripción y el HTML cambian por correcciones de
  redacción que a nadie le urge propagar; esos cuatro son los que mandan a
  alguien al sitio equivocado el día equivocado. Avisar de todo sería avisar de
  nada: el aviso que salta siempre se deja de leer.
- **«El original ya no existe» es distinto de «no cambió nada»** (`missing`), y
  se dice distinto. Refrescar un clon huérfano devuelve 409 con el motivo y **la
  copia se conserva**: borrarla por nuestra cuenta sería decidir por el Distrito.
- **Editar un clon lo separa de su original, y eso es legítimo** —el Distrito
  puede querer su propio texto—. Lo que no puede pasar es que ocurra sin saberlo,
  así que se avisa **donde se edita**.
- **Al refrescar se conserva el SLUG del clon.** Es su dirección publicada y
  puede estar circulando; renombrarla rompería enlaces ya compartidos.
- **El slug se libera con sufijo antes de insertar** (`freeSlug`). El slug del
  original no choca al llegar a otro sitio —es otro `clubId`—, pero clonar dos
  eventos homónimos dentro del mismo distrito sí choca con el índice único
  `(clubId, slug)`, y el error de Postgres saldría como un 409 sin explicación.
- **El aislamiento vive en `resolveScope`**, en un solo punto por el que pasan
  las cuatro rutas — mismo patrón que `buildFilters` en Postulaciones y
  `ownedMedia` en la Librería. Un evento de un sitio ajeno al distrito no se trae
  y se reporta como «no disponible»: confirmar que existe sería filtrar que
  existe.
- **Hacía falta una ruta nueva porque hoy no hay ninguna.** `GET /api/calendar`
  filtra por `req.user.clubId` (sólo el propio sitio) y `/api/admin/districts` es
  `superAdminOnly` (sólo el operador): un administrador de distrito **no podía
  ver los eventos de sus sitios por ninguna vía**. `/api/district-ecosystem` abre
  esa lectura ACOTADA; no reabre la ruta del operador.
- **El vínculo se busca por las DOS formas.** `Club.districtId` (clave foránea) y
  el número en `Club.district` conviven en producción: el alta desde
  `/admin/distritos` escribe una y el registro público escribe la otra. Mirar
  sólo una deja fuera a la mitad de los sitios. El tipo de sitio se resuelve con
  `isDistrictSiteType` de `districtSite.js` —**no se escribe un segundo
  criterio**—, y el espejo del navegador lo compara contra él en las pruebas.
- **`Club.district` ES UNA LISTA, no un valor** (v4.748). El formulario del panel
  lo dice desde siempre en su marcador de posición —«Ej: 4271, 4281, 4290…»— y
  una Feria de Proyectos o una Zona pertenecen de verdad a varios distritos. La
  v4.747 comparaba por IGUALDAD EXACTA, así que un sitio con «4271, 4281» **no lo
  reconocía NINGUNO de los dos** y su evento no aparecía en «Traer del
  ecosistema». Se reportó con la Feria. Ahora se parte por todo lo que no es
  dígito (`parseDistrictTags` en JS, `regexp_split_to_table(district,
  '[^0-9]+')` en SQL): así «4271, 4281», «Distrito 4281» y «D-4281» dan lo mismo,
  y «42811» **no** cuenta como 4281 —es otro número—. **Los dos criterios tienen
  que coincidir**; la prueba los contrasta contra los mismos casos y comprueba
  sobre el archivo del controlador que no haya vuelto la igualdad exacta.
- **Los distritos se ELIGEN de la lista registrada, no se escriben**
  (`src/components/admin/DistrictPicker.tsx`). Con texto libre no había forma de
  saber qué distritos existen ni de acertar el número, que es exactamente lo que
  impedía conectar la Feria. La lista sale de `/api/admin/districts`, que es
  `superAdminOnly` — y estas cinco pantallas son del operador de la plataforma,
  así que no hace falta abrir nada.
- **La lista ayuda a escribir; NO cierra los valores aceptados.** Un distrito
  puede existir en Rotary y no estar todavía dado de alta, y este formulario se
  usa justo mientras se están creando las cosas. Queda la vía de escribir el
  número a mano —con un aviso de que aún no está registrado y de que el vínculo
  se activará solo—, igual que «Mi club no está en la lista» en la postulación
  (v4.706) y en el registro al evento (v4.708). Y si el catálogo no carga, la
  casilla **se degrada a texto libre** en vez de dejar el formulario inservible.
- **El selector es UN componente compartido por las cinco pantallas** —Ferias,
  Zonas, Programas, Eventos y Asociaciones—, que hasta v4.747 llevaban esa
  casilla escrita cinco veces, idéntica. Arreglar una y dejar cuatro es la copia
  que se queda atrás: el panel se comportaría distinto según por dónde se entre.
  Lo comprueba `test:ecosystem` leyendo los cinco archivos.
- **NO se deduce `districtId` de la lista.** Es de un solo valor y la lista puede
  traer dos: elegir uno codificaría una mentira sobre a cuál «pertenece» el
  sitio, y ese campo lo usan además otros módulos (segmentación de noticias,
  v4.551). La lista de números es la verdad multi-distrito; el que la lee es el
  criterio de arriba.
- **Los parámetros del SQL van como TEXTO VACÍO, no como NULL**, cuando el mismo
  parámetro se usa en dos comparaciones. Con NULL, Postgres tiene que inferir el
  tipo y la sentencia puede fallar en ejecución — que es justo lo que no se ve
  sin una base delante.
- **El color de la etiqueta viaja en HEXADECIMAL, no como clase de Tailwind.**
  Una clase armada al vuelo (`bg-${color}-100`) no llega al CSS compilado y la
  regla no existe, en silencio: es el fallo de `bg-rotary-blue/90` de v4.719. Con
  un hexadecimal y un `style` en línea el color llega siempre, y la prueba de
  navegador comprueba el color RESUELTO, no el atributo.
- **El botón se muestra por TIPO DE SITIO, no por rol.** La función es del sitio
  de un distrito. Eso decide **qué se pinta**, nunca a qué se tiene acceso: el
  alcance real lo resuelve el servidor y devuelve 403 con su motivo.
- **Probar la PANTALLA, no sólo el criterio** (`test:ecosystem:ui`). Es la
  lección de v4.744 —`pickDistrictSite` era correcto y el fallo estaba en el
  camino— y la de v4.717 —se verificó la ficha y no el editor—. La prueba de
  navegador comprueba que se manden al servidor **los ids que el usuario marcó**,
  que un evento ya traído no ofrezca casilla, y que un 403 se vea con su motivo
  en vez de dejar el panel en blanco.

### Proyectos (v4.749)

Lo mismo, con dos diferencias que no son de estilo.

| Archivo | Qué es |
|---|---|
| `server/lib/ensureEcosystemCloneSchema.js` | Crea `EcosystemClone` en runtime |
| `server/lib/ecosystemClones.js` | Leer y escribir la procedencia |

- **La procedencia de un proyecto NO va en el proyecto, va en `EcosystemClone`.**
  `CalendarEvent` ya tenía una columna `Json` donde meter `metadata.source`;
  `Project` **no**, y añadirle una es el riesgo de despliegue que documenta la
  regla de `logo_intl` (v4.699), agravado: `Project` se consulta con Prisma en
  media plataforma —el listado del panel, el cerebro, los reportes— y con
  `findMany` **sin `select`**, así que Prisma pide todas las columnas del
  esquema. Y el build **no ejecuta `db push`** a propósito (v4.622). Una columna
  declarada y todavía inexistente dejaría sin listado de proyectos a TODOS los
  sitios hasta que alguien corriera `npm run db:push` a mano. Una tabla creada
  en runtime no tiene ese problema.
- **Toda lectura de la procedencia DEGRADA, nunca revienta.** Si la tabla aún no
  existe, lo que corresponde es que nada figure como traído, no que la ficha
  pública de un proyecto responda 500.
- **La copia NO RECIBE APORTES**, y es lo más importante del módulo. `Donation`
  cuelga de `projectId` y la pasarela cobra al `clubId` de la página: un aporte
  hecho sobre la copia entraría a la cuenta del DISTRITO y quedaría registrado
  contra un proyecto que no es el que se está financiando. **Eso es dinero en la
  cuenta equivocada, no una molestia.** La ficha manda a aportar al sitio de
  origen. Es el mismo hallazgo que la inscripción de un evento y es peor.
- **La copia nace CON `indexable: false`.** El proyecto ya está publicado e
  indexado en el sitio de su club; dos direcciones con el mismo contenido se
  compiten en Google. `seoEntities.js` respeta ese campo, así que la copia se ve
  perfectamente en el sitio del distrito y no entra en el sitemap. Es la
  respuesta al pendiente que quedó abierto con los eventos, donde no existía un
  campo así.
- **Las cifras SÍ se copian** (`meta`, `recaudado`, `donantes`,
  `beneficiarios`): son lo que hace que la ficha se vea completa. Lo que no
  hacen es aceptar dinero.
- **Pero `recaudado` y `donantes` NO se vigilan** (`PROJECT_TRACKED_FIELDS`). Se
  mueven con cada aporte, así que vigilarlos dejaría la copia marcada como
  «cambió» de forma permanente — y el aviso que salta siempre se deja de leer.
  Se refrescan igual al pulsar «Actualizar desde el origen»; lo que no hacen es
  disparar el aviso. `meta` sí se vigila: cambiar el objetivo es una decisión de
  quien dirige el proyecto, no el goteo de los aportes.
- **`Project.slug` es ÚNICO EN TODA LA PLATAFORMA**, no por sitio como el de
  `CalendarEvent`. El slug del original **sí** choca al llegar a otro sitio, así
  que se libera consultando los slugs de todos los proyectos, no sólo los
  propios.
- **Rutas propias, no un parámetro `kind` en el servidor.** Lo que se copia y lo
  que NO se copia es distinto en cada uno —la inscripción en un evento, los
  aportes en un proyecto—, y meterlo en una sola ruta con un `if` dentro haría
  fácil que un cambio para uno se cuele en el otro.
- **En la PANTALLA sí es un solo componente** (`EcosystemPicker` con `kind`): el
  flujo que ve el usuario es idéntico —buscar, marcar varios, traer— y
  escribirlo dos veces daría dos pantallas que se separan en silencio, que es
  justo lo que hubo que deshacer con la casilla de distritos.

**Pendiente conocido:** el clon de un EVENTO es **contenido duplicado para SEO**.
`/eventos/:slug` es indexable y va al sitemap (`seoSpec.js`), así que el evento
queda publicado en dos direcciones y los dos sitios se compiten en Google. Se
mitiga parcialmente con la atribución y el enlace al original, pero lo que lo
resolvería es declarar la canónica del clon apuntando al original — hay que
tocar `seoRender.js` / `seoEntities.js`, que hoy componen la canónica a partir
del propio sitio. Mientras tanto, no afirmar que el clon es neutro para SEO.
