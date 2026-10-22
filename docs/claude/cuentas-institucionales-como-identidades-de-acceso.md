<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Cuentas institucionales como identidades de acceso — v4.932

Una cuenta de correo del sitio (`usuario@dominio.org`) puede además ser una
IDENTIDAD que entra al panel, con su propietario, su perfil y sus permisos.

| Archivo | Qué es |
|---|---|
| `server/lib/institutionalAccess.js` | El CRITERIO. **Puro**: catálogo cerrado de permisos, roles, `can()`, normalización, validación del alta, alcance de buzones y mapa de rutas |
| `src/lib/institutionalAccess.ts` | Espejo comparado por SALIDAS |
| `server/lib/ensureInstitutionalSchema.js` | `InstitutionalProfile` y `InstitutionalAccessEvent` en runtime |
| `server/lib/institutionalStore.js` | La I/O: perfil, auditoría, tokens de recuperación |
| `server/lib/loginThrottle.js` | El freno de intentos de ingreso |
| `server/middleware/institutionalGuard.js` | `requirePermission`, el único guardia de autorización |
| `server/controllers/institutionalAccessController.js` | La API: administración y perfil propio |
| `src/pages/admin/Perfil.tsx` | Mi perfil |
| `src/pages/RestablecerPassword.tsx` | «¿Olvidaste tu contraseña?» y el enlace del correo |
| `src/components/admin/institutional/InstitutionalAccountModal.tsx` | El alta |

Pruebas: `npm run test:institutional` (164 casos, **sin base, credenciales ni
red**; el bloque del espejo pide `esbuild` y se salta solo). Verificadas a la
inversa: quitando la puerta de `can()` fallan 3, y aflojando el `WHERE` de la
bandeja falla 1.

**Reglas durables:**

- **⚠️ NO HAY UNA SEGUNDA AUTENTICACIÓN, y de eso cuelga todo lo demás.** El
  propietario es una fila de `User` como cualquier otra: entra por
  `authenticatePlatform`, con su bcrypt, su audiencia `rotary-platform` y su
  token de siempre; `resolveSession` sigue siendo el ingreso unificado del
  encabezado. Lo que este módulo agrega es el PERFIL y los PERMISOS de esa
  fila. Una segunda vía de acceso sería un segundo sitio donde equivocarse, y
  lo comprueba una prueba que busca `jwt.sign` y `bcrypt.compare` de sesión
  dentro del módulo.
- **⚠️ NI `User` NI `EmailAccount` GANAN UNA COLUMNA.** Era el camino corto y
  es la regla de `logo_intl` (v4.699) en su versión más cara: los dos se
  consultan con `findMany` **sin `select`** en media plataforma, así que una
  columna declarada y todavía inexistente deja esas consultas en **500** desde
  el primer despliegue — y lo que caería es EL INGRESO y LA BANDEJA. El `build`
  no ejecuta `db push` desde el incidente del 2026-07-13, así que ese «hasta
  que alguien lo corra» no tiene fecha. Las dos tablas viven fuera de Prisma,
  sin clave foránea, y el guardián de `db:push` las protege solo.
- **⚠️ LOS PERMISOS NO VIAJAN EN EL TOKEN**, y es lo que hace posible la
  revocación que el pedido pide. Con ellos adentro, suspender una cuenta o
  quitarle una herramienta no surtiría efecto hasta que el token venciera
  —hasta un día—, y eso no es una revocación. Se leen de la base en cada
  petición protegida. El costo está acotado: para un rol administrativo
  `requirePermission` CORTA sin tocar la base, porque su rol ya es la
  concesión. Lo que sí viaja es el buzón: es con lo que la bandeja arranca.
- **`can()` ES EL ÚNICO PUNTO DE DECISIÓN**, en el servidor y en su espejo.
  Escrito a mano en cada ruta y otra vez en cada pantalla, la número once se
  escribe mal y el fallo es MUDO: la ruta responde de más y nadie lo ve hasta
  que alguien lo aprovecha.
- **UN PERMISO ADMINISTRATIVO NO SE CONCEDE SUELTO, Y HAY DOS PUERTAS.**
  `normalizePermissions` lo descarta al GUARDAR y `can()` lo rechaza al
  COMPROBAR. Con una sola, una fila escrita antes de que la otra existiera
  pasaría — y eso está probado a la inversa con una fila que lleva los tres.
- **⚠️ EL AISLAMIENTO VA EN EL `WHERE`, NO EN LA PANTALLA.** `mailboxScopeFor`
  devuelve `null` (sin restricción) o la lista de direcciones, y esa lista
  entra en la consulta de la bandeja, del listado de cuentas y de los
  borradores. Esconder un control no protege un endpoint de quien lo conoce
  (v4.868). Un mensaje ajeno responde **404**, no 403: un 403 confirmaría que
  ese id existe, que es la mitad de lo que hace falta para ir a buscarlo.
- **`[]` NO ES `null`.** Lista vacía significa «tiene restricción y no le
  corresponde ninguna cuenta», o sea que no ve nada — lo correcto para un
  acceso al que todavía no se le ató su buzón, y el lado seguro para
  equivocarse.
- **⚠️ EL REMITENTE DE SALIDA TAMBIÉN SE FUERZA.** `fromEmail` llega del
  navegador, así que sin esto un usuario institucional firmaba un correo con la
  dirección del presidente escribiendo otro valor en el cuerpo. Es el mismo
  criterio del `WHERE` de la bandeja, aplicado a la salida.
- **`institutional_user` está en `ADMIN_ROLES` y NO en `SITE_ADMIN_ROLES`**, en
  las dos listas —servidor y `App.tsx`—. Es exactamente la posición de
  `crm_agent` desde v4.696: pinta el panel para llegar a sus herramientas, y lo
  que responde cada ruta lo decide el permiso, no el hecho de haber entrado.
- **EL MENÚ SE FILTRA EN UN SOLO SITIO.** `getMenuItems` arma la lista con
  decenas de `push` repartidos por trescientas líneas: filtrar en cada uno
  dejaría el número treinta y uno fuera, con un fallo mudo. Se filtra la lista
  ENTERA con `canOpenPath`, así que una entrada nueva nace acotada sola. Y lo
  que no está en `TOOL_ROUTES` NO se le pinta: una pantalla que nadie clasificó
  no debe aparecerle por omisión a quien tiene el acceso más acotado.
- **`/admin/perfil` se ve SIEMPRE.** Es donde se cambia la contraseña temporal:
  dejarla fuera encerraría a un usuario nuevo en un panel vacío sin forma de
  cumplir lo que se le pide al entrar.
- **LA CONTRASEÑA DEL ADMINISTRADOR NACE TEMPORAL**, y el valor por omisión es
  el seguro. La conoce alguien que no es su dueño, así que el primer ingreso
  redirige a `/admin/perfil?cambiar=1` —decidido en el SERVIDOR, como el resto
  de las redirecciones—. El aviso dice el MOTIVO: sin él se lee como un trámite
  y se pospone.
- **NUNCA SE DEVUELVE LA CONTRASEÑA, ni recortada.** Para entregársela a su
  dueño está «Enviar acceso», que manda un enlace de un solo uso. Y el listado
  de cuentas dejó de traer la columna `password`, que llegaba entera al
  navegador de cualquier sesión del panel.
- **EL TOKEN DE RECUPERACIÓN SE COMPRUEBA CONTRA LA FILA, no sólo por su
  firma.** Así un enlace ya usado —o uno emitido antes de otro más nuevo— deja
  de servir; con la firma sola, un enlace filtrado valdría sus dos horas
  completas aunque el dueño ya hubiera cambiado la contraseña.
- **LA RESPUESTA DE `/auth/forgot` ES IDÉNTICA EXISTA O NO EL CORREO.** Sin
  eso, el endpoint es un censo de las direcciones institucionales del
  ecosistema. El formulario del encabezado pregunta a las TRES identidades a la
  vez por lo mismo.
- **CAMBIAR LA CONTRASEÑA EXIGE LA ACTUAL.** Tener la sesión abierta no
  demuestra que la cuenta sea tuya: sin ese paso, quien encuentre una sesión en
  un equipo prestado se queda con la cuenta.
- **⚠️ EL CATÁLOGO DE LO EDITABLE EN `/me` ES CERRADO Y VIVE EN EL SERVIDOR.**
  Rol, permisos, sitio, estado y buzón NO están: concedérselos a uno mismo
  sería el agujero entero. Es la frontera ESTRUCTURAL del portal de Plantillas
  IA — lo que no se puede expresar en la petición no se puede pedir.
- **NADIE SE EDITA A SÍ MISMO DESDE LA ADMINISTRACIÓN.** Con el permiso
  `users`, un administrador podría quitarse el suyo y quedarse fuera. Para lo
  propio está `/me`, que no toca rol ni permisos.
- **SÓLO EL OPERADOR DE LA PLATAFORMA NOMBRA ADMINISTRADORES DE SITIO.** Un
  administrador de sitio que puede nombrar administradores multiplica el
  alcance de una credencial robada.
- **SUSPENDER NO ES BORRAR.** Borrar la fila dejaría sin explicación los
  correos que esa persona envió; y borrar la cuenta de CORREO no borra a su
  dueño, sólo suelta el vínculo. La suspensión cierra las dos puertas:
  `authenticatePlatform` no abre sesión nueva y `requirePermission` rechaza la
  que hubiera abierta.
- **NO SE CREA UN USUARIO DUPLICADO.** Si el correo ya pertenece a una cuenta,
  se VINCULA — y **no se le pisa la contraseña**: quien ya entraba con la suya
  no sabría que se la cambiaron, y el administrador acabaría teniendo la
  credencial de alguien que no se la dio. Se dice en los avisos del alta.
- **EL FRENO DE INTENTOS ES UN FRENO, NO UNA GARANTÍA**, y hay que decirlo así:
  el mapa vive en memoria de la instancia y se reinicia con ella (misma cautela
  declarada que el contador público de campañas, v4.808). La clave es
  correo+IP: sólo por IP castigaría a toda una oficina, y sólo por correo
  dejaría que cualquiera bloqueara la cuenta ajena fallando ocho veces a
  propósito. Lo que SÍ es sólido es que cada intento queda en la auditoría: un
  ataque no se frena del todo, pero se VE.
- **LA AUDITORÍA SÓLO AGREGA Y NUNCA GUARDA UN SECRETO.** No hay UPDATE ni
  DELETE sobre una fila; corregir es escribir otro evento. `detail` es texto
  redactado por nosotros, jamás un volcado del `req.body` —que llevaría la
  contraseña adentro—. El catálogo de eventos es cerrado: uno inventado no se
  puede reportar ni filtrar.
- **EL DOMINIO LO PONE EL SERVIDOR.** Si viajara en la petición, cualquiera con
  el endpoint crearía una cuenta —y con ella una identidad— en el dominio de
  otro sitio.
- **EL AVATAR ES DE LA PERSONA, NO DEL SITIO.** Pintaba `club.avatarUrl` y el
  literal «Admin User»: con varias personas entrando al mismo sitio, todas se
  veían igual y ninguna se veía a sí misma. Sin fotografía van sus INICIALES,
  que ya distinguen a dos personas.
- **LA FOTOGRAFÍA VA POR `uploadMediaFiles`**, el mismo camino de toda subida
  del sitio (regla de v4.784), y se guarda la URL que devuelve el SERVIDOR: con
  un HEIC el servidor lo convierte y guarda otra dirección.
- **`/restablecer` está en `PRIVATE_PREFIXES`.** Abierta y no indexada son
  cosas distintas: se llega desde el enlace del correo, e indexarla sería
  publicar la puerta de servicio del panel en los buscadores.

### Roles y permisos por sitio — RBAC multi-tenant (v4.937; el menú vacío: v4.939)

El acceso al panel deja de ser igual para todos: **Sitio → Usuario → Rol →
Permisos → Módulo/acción**.

| Archivo | Qué es |
|---|---|
| `server/lib/rbacSpec.js` | El CRITERIO. **Puro**: registro de módulos, implicaciones, roles predeterminados, resolución, escalamiento, último administrador y matriz |
| `src/lib/rbacSpec.ts` | Espejo comparado por SALIDAS. **Sin `resolveGrant`** |
| `server/lib/ensureRbacSchema.js` | `SiteRole` y `SiteMembership` en runtime |
| `server/lib/rbacStore.js` | La I/O: roles, membresías, resolución y protección del último administrador |
| `server/middleware/institutionalGuard.js` | `attachGrant`, `requirePermission` (ampliado) y `requireAction` |
| `server/controllers/rbacController.js` · `server/routes/rbac.js` | La API |
| `src/hooks/useSiteAccess.ts` | Los permisos ya resueltos, para pintar |
| `src/pages/admin/UsersAndRoles.tsx` | La pantalla: Usuarios, Roles y Auditoría |

Pruebas: `npm run test:rbac` (182 casos, **sin base, credenciales ni red**; el
bloque del espejo pide `esbuild` y se salta solo). Verificadas a la inversa: sin
la puerta de `LEGACY_ADMIN_ONLY` fallan 2, sin la prevención de escalamiento 4,
sin la protección del último administrador 3, sin `ROLE_FALLBACK` 3, y con la
clasificación del recorte de v4.937 fallan 8.

**Reglas durables:**

- **⚠️ NO ES UN SEGUNDO SISTEMA DE AUTORIZACIÓN: ES LA GRANULARIDAD DEL QUE YA
  HABÍA.** `institutionalAccess.js` (v4.932) sigue siendo la puerta —su catálogo
  cerrado, su `can()`, su `requirePermission`, su auditoría—. Lo que se agrega es
  partir cada herramienta en ACCIONES y poder agruparlas en roles con nombre. El
  puente en los dos sentidos es `LEGACY_PERMISSION_MAP` / `satisfiesLegacy`: un
  permiso viejo escrito en `InstitutionalProfile.permissions` se expande al leer,
  y una comprobación vieja (`can(u, 'users')`) se sigue contestando. **Sin ese
  puente, desplegar esto dejaría sin herramientas a toda cuenta institucional
  existente**, en silencio.
- **⚠️ LA MIGRACIÓN NO ES UNA TABLA: ES `ROLE_FALLBACK`.** Un `club_admin` sin
  fila resuelve al preset «Administrador del sitio» y conserva EXACTAMENTE lo que
  tenía. Reescribir las filas en el despliegue está prohibido por la sección de
  base de datos —un despliegue no escribe— y además sería irreversible. Se
  traduce AL LEER: es gratis, se autorrepara y no deja dos verdades.
- **⚠️ NINGÚN `if (role === 'editor')` EN NINGUNA PARTE.** Un rol es un CONJUNTO
  DE PERMISOS y nada más; quien decide siempre es `hasPermission`. Es la razón
  por la que `can()` es el único punto de decisión: escrita a mano en cada
  pantalla, la comprobación número once se escribe mal y el fallo es MUDO.
- **EL REGISTRO DE MÓDULOS ES DATOS, NO CÓDIGO.** Agregar un módulo es una
  entrada en `MODULES` —con sus acciones y sus rutas— y nada más: ni el guardia,
  ni la matriz, ni la barra lateral, ni el modelo de datos se tocan. Es el
  criterio de aceptación del pedido.
- **LAS IMPLICACIONES SON TRES Y SE LEEN SOLAS**: `manage` implica todas las
  acciones de su módulo, una acción amplia implica su variante propia (**al revés
  NUNCA** — es la mitad del sentido de un rol de autor), y cualquier acción
  implica `view`. Sin ellas habría que marcar seis casillas para decir «puede
  editar», y la que se olvida deja un botón sobre una pantalla que no abre.
- **⚠️ SIN `ownerId` SE EXIGE EL PERMISO AMPLIO.** `canActOn` ante la ausencia del
  dato aplica el criterio ESTRICTO, nunca el laxo: quien escriba el resolutor mal
  obtiene menos acceso, no más.
- **⚠️ LOS PERMISOS NO VIAJAN EN EL TOKEN**, y es lo que hace posible la
  revocación. Se leen en cada petición protegida y **no se cachean entre
  peticiones**: una caché de un minuto le devolvería ese minuto de acceso a quien
  acaban de suspender. El costo está acotado — el operador no toca la base, un rol
  administrativo paga una consulta, la identidad institucional dos.
- **⚠️ CERRAR SESIONES ES UNA MARCA DE TIEMPO, no un borrado de token.** Un token
  firmado no se puede retirar: `sessionsRevokedAt` invalida todo el emitido antes,
  comparando contra su `iat`. Sin esto, «cerrar sesiones» no cerraría nada hasta
  que el token venciera solo —hasta un día después—.
- **⚠️ NADIE CONCEDE LO QUE NO TIENE, y son DOS puertas.** `filterGrantable` al
  GUARDAR y `resolveGrant` al LEER —que borra los permisos de plataforma de
  cualquier rol de sitio, escriba lo que escriba su fila—. Con una sola, una fila
  escrita antes de que existiera la otra pasaría. Va en el SERVIDOR y sobre lo que
  se guarda: esconder un control no protege un endpoint de quien lo conoce.
- **⚠️ LAS LLAVES `adminOnly` DE v4.932 SE DESCARTAN AL TRADUCIR**
  (`LEGACY_ADMIN_ONLY`). `can()` las rechazaba aunque estuvieran escritas en la
  fila; traducirlas sin filtrar perdería esa puerta sola y convertiría a su dueño
  en administrador por la puerta de atrás.
- **⚠️ UNA MEMBRESÍA DE OTRO SITIO NO DECIDE NADA ACÁ.** Es lo que hace esto
  multi-tenant y no una lista global de permisos con un nombre bonito. La misma
  persona puede ser Editor en un sitio y Usuario institucional en otro
  (`SiteMembership`, una fila por usuario y por sitio).
- **LOS PRESETS NO SE SIEMBRAN EN LA BASE.** Sembrarlos exigiría que un
  despliegue escribiera, y dejaría a cada sitio con una copia que se separa en
  silencio de la versión siguiente: corregir un permiso mal puesto en «Editor»
  habría que hacerlo sitio por sitio. Un preset se lee del código, no se edita ni
  se borra, y para adaptarlo se **DUPLICA** — el duplicado sí es una fila.
- **UN ROL EN USO NO SE BORRA: SE DESACTIVA.** Borrarlo dejaría membresías
  apuntando a algo inexistente, y con ellas la única traza de por qué esa persona
  entraba a lo que entraba. Misma regla que un recorrido con inscripciones vivas
  (v4.701).
- **⚠️ EL RECORTE DE LA BARRA LATERAL SÓLO ALCANZA A QUIEN TIENE ROL NUEVO**
  (`acceso.restricted`). El registro no cubre TODAS las rutas del panel —quedan
  fuera Capacitaciones, Rotaract, ROTEX, Solicitudes Técnicas y una decena más— y
  el `canOpenPath` del RBAC esconde lo no registrado por ser el lado seguro:
  aplicárselo a los administradores actuales les borraría esas entradas el día del
  despliegue, en silencio. **Al registrar un módulo nuevo, sumar sus rutas a
  `MODULES` — no ensanchar esa condición.**
- **⚠️ EL NAVEGADOR NO RESUELVE PERMISOS, LOS CONSULTA.** `/api/rbac/me` devuelve
  la lista efectiva ya expandida —y si el menú se recorta o no—; el espejo NO trae
  `resolveGrant`, `filterGrantable` ni `isRestrictedGrant`. Con dos resoluciones,
  el menú y lo que responde la ruta podrían discrepar, y eso se lee como que los
  permisos no funcionan. Misma regla que el calendario de la distribución (v4.864)
  y el período de la Bóveda (v4.849).
- **⚠️ ANTE UN ORIGEN QUE EL CRITERIO NO CLASIFICA, NO SE RECORTA** (v4.939,
  `isRestrictedGrant`). Fue el defecto de v4.937 y llegó a producción: un rol que
  `ROLE_FALLBACK` no enumera —`member`, `crm_agent`, `crowdfunder`, cualquiera que
  se agregue— resuelve `source: 'none'`, la barra lateral lo tomaba por acceso
  acotado y el panel quedaba con **«Mi perfil» y nada más**, bajo unas cabeceras de
  categoría vacías. Medido sobre las 66 entradas del menú: **1 de 66**. El acceso
  de esas cuentas nunca cambió —cada ruta se sigue guardando en el servidor—: el
  recorte les quitó la VISTA. Se recorta sólo `membership`, `legacy_permissions` y
  el `legacy_role` de `institutional_user`; **`suspended` tampoco se recorta**,
  porque un panel vacío no dice que la cuenta está suspendida —se lee como una
  avería— y el servidor le contesta con su motivo al primer clic. Y un grant que ya
  tiene TODO lo de un administrador de sitio no se toca venga de donde venga.
- **⚠️ CON PERMISOS RESUELTOS MANDA EL RBAC; `canOpenPath` de v4.932 es el
  RESPALDO.** Aquél lee `user.permissions`, que es la **foto del ingreso** guardada
  en `localStorage` (lo dice su propia interfaz en `useAuth`): una cuenta
  institucional cuyo token no la traiga se quedaba con todo escondido — el mismo
  panel vacío, por la otra puerta. El servidor sí sabe sus permisos.
- **UN MENÚ CORTO SE EXPLICA.** Con el recorte activo, la barra dice con qué rol se
  está entrando y dónde se amplía. Sin esa línea, quien ve dos entradas no
  distingue «no me toca» de «el panel está roto», y lo reporta como avería. Y no se
  pinta la cabecera de una categoría que quedó sin entradas: el orden de producción
  está fijado a propósito, pero un título sin nada debajo no informa de nada.
- **UNA PANTALLA NO PUEDE AFIRMAR UN ROL QUE NO ES.** `Users.tsx` mostraba «Admin
  de Sitio» a toda cuenta cuyo rol no fuera uno de los tres que su desplegable
  ofrece, y eso mandó a diagnosticar el panel vacío al sitio equivocado —el reporte
  decía «supuestamente es Admin del sitio»—. El rol se rotula como es, y el que no
  se puede asignar desde ahí entra igual al desplegable como «(rol actual)»: sin
  esa opción, el primer guardado le CAMBIABA el rol sin que nadie lo pidiera.
- **⚠️ NO SE PUEDE DEJAR UN SITIO SIN ADMINISTRADOR** (`wouldOrphanSite`), y se
  comprueba en las TRES vías: cambiar el rol, suspender y retirar. Un operador de
  la plataforma **no cuenta** como administrador del sitio a estos efectos: un
  sitio cuyo único administrador es el equipo de Club Platform está, para su
  organización, sin administrador. El bloqueo dice la SALIDA —nombrar a otro
  primero—: un bloqueo sin salida se lee como una avería.
- **NADIE SE EDITA A SÍ MISMO** el rol, los permisos ni el estado: con
  `users.manage` podría quitarse el suyo y quedarse fuera. Para lo propio está
  `/admin/perfil`, que no toca ninguna de las tres (regla de v4.932).
- **LAS DENEGACIONES NO PASAN POR `filterGrantable`**: quitar no es conceder, y
  exigirle al actor tener el permiso que va a quitar impediría acotar a alguien
  que sabe más que uno. Lo que sí hacen es llevarse **lo que ese permiso
  implicaba** — denegar `news.delete` y dejar `news.delete_own` sería una
  denegación que no deniega.
- **LA AUDITORÍA ES UNA SOLA TABLA Y DOS CATÁLOGOS.** Los eventos del RBAC se
  UNEN a los de v4.932 en `InstitutionalAccessEvent`: partirla obligaría a leer
  dos tablas y ordenarlas a mano para pintar UNA lista. Sólo agrega, y **nunca
  guarda una contraseña, ni su hash, ni un token**.
- **⚠️ EL SITIO LO RESUELVE EL SERVIDOR, NUNCA EL CUERPO DE LA PETICIÓN.** Si
  `clubId` viajara en el `body`, acotar los permisos a un sitio no serviría de
  nada. Sólo el operador puede pedir otro sitio por query — que es lo que su rol
  ya le permite.
- **EL ALTA DE UNA CUENTA INSTITUCIONAL PUEDE ASIGNAR EL ROL, y es OPCIONAL.**
  Sin `siteRoleKey` el alta se comporta exactamente como en v4.932 —regla
  aditiva— y un fallo al asignar el rol **no tumba el alta**: el usuario, la
  cuenta y el perfil ya están escritos. El modal DICE qué podrá abrir ese rol.
- **`SiteRole` y `SiteMembership` viven fuera de Prisma** y están en la lista del
  guardián de `db:push`. `User` no gana ni una columna: se consulta con `findMany`
  **sin `select`** en media plataforma, así que una declarada y todavía
  inexistente deja EL INGRESO en 500 (regla de `logo_intl`, v4.699).

**Pendientes conocidos:** la ficha individual de un usuario
(`GET /rbac/users/:userId`) existe en la API y **la pantalla todavía no la abre**
—hoy el rol se cambia desde el desplegable de la tabla—; las **excepciones
individuales** tienen endpoint, criterio y prueba pero aún no tienen formulario
(se ven en la tabla cuando existen); y `requireAction` está implementado y **no
está cableado en ninguna ruta de contenido todavía**: la distinción propio/todos
se decide hoy en `canActOn`, y engancharla a Noticias, Eventos y Proyectos es la
vuelta siguiente — hasta entonces un Autor ve el módulo y el servidor no le
distingue sus filas de las ajenas en esos tres módulos.

### El menú base del usuario institucional — v4.941

Un usuario institucional entra con un conjunto de módulos DECLARADO, no con una
lista de navegación escrita en la pantalla.

| Archivo | Qué es |
|---|---|
| `INSTITUTIONAL_BASE` en `rbacSpec.js` | El menú base, como DATOS: los permisos que recibe por defecto |
| `MENU_LABEL_OVERRIDES` · `menuLabelFor` | El rótulo «Correo Institucional». Espejado en `src/lib/rbacSpec.ts` |
| `requireRoleOrPermission` en `institutionalGuard.js` | El rol de siempre **o** el permiso, declarado por ACCIÓN |
| `AdminLayout.tsx` | Avatar del encabezado, «Mi perfil» fuera del sidebar, el rótulo |

Pruebas: `npm run test:institutional-menu` (72 casos, **sin base, credenciales
ni red**; el menú se arma sobre las rutas REALES leídas de `AdminLayout.tsx`).
Verificadas a la inversa: sin la unión con lo legado falla 1, con `news.delete`
en el base fallan 2, sin el permiso en el DELETE 1, y sin `crowdfunder` en
`ROLE_FALLBACK` 1.

- **⚠️ EL MENÚ BASE SON PERMISOS, NO UNA LISTA.** Se declara en
  `INSTITUTIONAL_BASE` y la barra lateral de siempre se recorta sola con
  `canOpenPath`. **No hay una segunda navegación**: agregar un módulo al base es
  agregarlo ahí y nada más, y el rol del sitio lo amplía o lo acota desde
  «Usuarios y permisos» sin tocar código.
- **⚠️ LO DE LECTURA VA ENTERO Y LO DESTRUCTIVO NO.** Ve el saldo de la Bóveda y
  no puede ordenar un retiro (`finance.manage`); lee, crea, edita y publica
  noticias y **no puede eliminarlas**. Es el ejemplo textual del pedido, y se
  comprueba en el SERVIDOR: `router.delete('/posts/:id')` exige `news.delete`.
- **⚠️ EL ROL DE SIEMPRE **O** EL PERMISO** (`requireRoleOrPermission`). Las
  rutas del panel se guardan con `roleMiddleware(contentRoles)`, una lista de
  ROLES donde el institucional no está. Sustituirla por un permiso a secas es lo
  elegante y es lo peligroso: si la consulta del grant falla, `can()` de v4.932
  **no conoce las llaves granulares** —`news.delete` no está en su catálogo, así
  que devuelve `false` para TODOS— y el panel se quedaría sin contenido para los
  administradores. Con la disyunción, lo que hoy funciona no puede romperse.
- **Y se declara POR ACCIÓN, no por módulo.** `GET` pide `.view` y `DELETE` pide
  `.delete`: con un permiso para toda la ruta, quien puede leer podría borrar.
- **⚠️ `crowdfunder` ENTRÓ A `ROLE_FALLBACK`.** Estaba fuera y resolvía a `none`
  (v4.939); con las rutas de contenido pidiendo permiso eso lo habría dejado sin
  publicar nada, cuando hoy está en `contentRoles` y `adminRoles`. Se mapea a lo
  que YA tiene, no a más. **Su menú salía igual con y sin el mapa**, así que
  contarlo no comprueba nada — lo que hay que comprobar es su GRANT.
- **⚠️ LOS QUE YA EXISTEN LO RECIBEN, Y SIN MIGRAR UNA FILA.** Un institucional
  de v4.932 tiene su lista gruesa escrita en `InstitutionalProfile` y **no pasa
  por el preset**: `resolveGrant` UNE esa lista con `INSTITUTIONAL_BASE` al
  leer. Es aditivo —lo que alguien le concedió a mano se conserva entero— y no
  exige que un despliegue escriba, que es lo que la sección de base de datos de
  este archivo prohíbe.
- **«Correo Institucional» es un RÓTULO, no un módulo.** Misma ruta, mismo
  `email_inbox`, mismos endpoints, misma bandeja, mismos borradores y adjuntos.
  El criterio vive en `menuLabelFor` y no como una cadena en el JSX: la pantalla
  y su prueba leen la misma tabla, y el menú de cualquier otro rol no cambia ni
  una palabra.
- **⚠️ «MI PERFIL» SALE DEL SIDEBAR, NO DE LA APLICACIÓN.** La ruta sigue viva y
  sigue en `ALWAYS_VISIBLE_ROUTES` —es donde se cambia la contraseña temporal, y
  el servidor redirige ahí con `?cambiar=1`—. Lo que cambió son los PUNTOS DE
  ACCESO: el avatar del encabezado (entre los mensajes y «Abrir Sitio») y la
  tarjeta de la esquina inferior, que ya llevaba ahí desde v4.932. **Dos puertas,
  ninguna escondida**; una sola habría sido peor que la entrada del menú.
- **El desplegable se cierra al pulsar fuera, con Escape y al navegar.** Uno que
  sólo se cierra con su propio botón deja al usuario atrapado, y abierto sobre
  la pantalla siguiente se lee como un fallo.
- **⚠️ CUATRO PANTALLAS DEJARON DE COMPARTIR PERMISO CON OTRA COSA**, y ninguna
  se duplicó: `/admin/miembros` salió de `users` —mantener el directorio de
  socios exigía la administración de usuarios entera—, `/admin/bloques-pago` y
  `/admin/maneras-de-contribuir` formaron `contributions` —la segunda **no
  estaba en ningún módulo**, o sea invisible por omisión para todo acceso
  acotado—, `/admin/ordenes` se fue con `store` y `/admin/estados-financieros` a
  `compliance`. Nadie pierde nada: `SITE_ADMIN_PERMISSIONS` se deriva de
  `SITE_MODULES`, así que un administrador de sitio recibe los módulos nuevos
  automáticamente.
- **Al añadir un módulo al menú base, comprobar QUÉ MÁS abre.** `finance.view`
  abría además los estados financieros y las órdenes; `projects.view`, la
  Postulación de Proyectos. Un permiso es tan ancho como las rutas de su módulo,
  y eso no se ve leyendo la lista del base — lo destapó la prueba comparando el
  menú resultante contra el pedido, entrada por entrada.

### El tercer nivel: rol → módulo → RECURSO (v4.1090)

Pedido del Distrito 4281 con la pantalla de Eventos delante: un usuario que
entre al panel, vea el módulo de Eventos y **sólo** la «XIII Conferencia
Rotaria del Distrito 4281 – Villavicencio 2027», sin alcanzar los demás
eventos ni el resto del panel. Y que la arquitectura sirva después para
Noticias, Proyectos o Campañas sin volver a escribirla.

| Pieza | Qué es |
|---|---|
| `RESOURCE_MODULES` · `normalizeResourceScopes` · `validateResourceScopes` · `canAccessResource` · `allowedResourceIds` · `resourceCapabilitiesFor` · `canCreateResource` · `filterGrantableScopes` (`rbacSpec.js`) | El CRITERIO. **Puro**: el registro de módulos que acotan por recurso, con sus capacidades, y todo lo que decide sobre un alcance |
| `SiteMembership."resourceScopes"` (JSONB) | Dónde vive el alcance: `{ [módulo]: { mode:'all', capabilities? } \| { mode:'specific', resources:[{ id, label, capabilities }] } }`. Módulo ausente = «todos» |
| `server/lib/eventAccess.js` | EL guardia de Eventos: `assertEventCapability`, `holdsCapability`, `allowedEventIdsFor`, `filterEventsFor`, `canCreateEventsFor`, `eventCapabilitiesFor` |
| `getResources` · `postCreateUser` · `putUserScopes` · `putUserProfile` · `postSendAccess` (`rbacController.js`) | El catálogo de recursos, el alta, el alcance, la ficha y el enlace de acceso |
| `canResource` · `allowedResources` (`useSiteAccess.ts`) · `TAB_CAPABILITY` (`Events.tsx`) | Lo que se PINTA con el veredicto del servidor |

Pruebas: `npm run test:rbac` (314 casos: criterio, paridad de los dos espejos
por SALIDAS, prevención de escalamiento, los tres escenarios de aceptación A/B/C
y el cableado leído de los archivos). Verificadas a la inversa: el guardia
saltado en un manejador → 1 fallo; `canAccessResource` devolviendo `true` sin
fila → 8; el alta sin `filterGrantableScopes` → 1.

**Reglas durables:**

- **⚠️ NO HAY UN SEGUNDO SISTEMA DE AUTORIZACIÓN.** El tercer nivel es una
  columna más de la MISMA membresía (`SiteMembership`), la resuelve el MISMO
  `resolveGrant`, la comprueba el MISMO `requirePermission` para el módulo y la
  acción, y el alta reutiliza `ensureUserFor` + `upsertProfile` +
  `upsertMembership` de v4.932/v4.937. El grant carga `resourceScopes` como
  carga `permissions`; lo que se agrega es la pregunta «¿y ESTE recurso?».
  Una prueba comprueba que el controlador no traiga su propio `bcrypt` ni su
  propio alta.
- **⚠️ CONCEDER «EVENTOS» NO CONCEDE TODOS LOS EVENTOS: LO DECIDE EL ALCANCE.**
  `canAccessResource(grant, 'events', id, cap)` mira `resourceScopes.events`:
  `all` alcanza cualquiera con las capacidades declaradas; `specific` sólo los
  ids de su lista, cada uno con las suyas; el módulo AUSENTE es «todos», que es
  como se comportaba todo administrador antes de esta versión — **regla
  aditiva**: ninguna fila existente tiene la columna y ninguna pierde nada.
  `allowedResourceIds` devuelve `null` para «todos» y `[]` para «ninguno», y
  son cosas distintas: `null` no filtra el `WHERE`, `[]` lo fuerza vacío.
- **⚠️ UN RECURSO AJENO RESPONDE 404, NUNCA 403, y es la pregunta que el
  pedido hacía con esas palabras** («no debe siquiera poder obtener mediante
  API los datos administrativos»). `assertEventCapability` devuelve `null`
  para lo que no alcanza y el manejador contesta «no existe»: confirmar que
  existe es la mitad de lo que hace falta para ir a buscarlo. El listado del
  calendario filtra en el `WHERE` con `allowedEventIdsFor`, y toda ruta de
  inscripciones —por evento Y por id de inscripción— pasa por `requireEvent`
  / `loadDetail` / `bulkScopeFor`, que llaman al mismo guardia. Una prueba
  recorre cada `export const … = async (req, res` de los dos controladores y
  falla si alguno no lo llama.
- **⚠️ EL GUARDIA DEGRADA CUANDO NO HAY GRANT O SU FUENTE ES `none`.** Un rol
  que el RBAC no clasifica —`member`, `crm_agent`, `crowdfunder`— no puede
  quedarse sin sus eventos por una columna nueva: es la lección del panel
  vacío de v4.939 aplicada a los datos. Y el operador de la plataforma y el
  administrador sin fila resuelven `{}`, que es «sin restricción».
- **⚠️ UN ACOTADO NO CREA.** `canCreateResource` es falso con modo `specific`:
  un evento nuevo no está en ninguna lista, así que quien sólo alcanza la XIII
  no puede crear otro y adjudicárselo. La pantalla esconde «Nuevo evento» por
  `access.canCreate`, y el `POST` del calendario lo vuelve a comprobar.
- **⚠️ LAS CAPACIDADES SON UN CATÁLOGO CERRADO POR MÓDULO** (`RESOURCE_MODULES`).
  Para Eventos: ver (siempre), inscripciones, completadas, información,
  multimedia, HTML, redes, sede, panel de inscripción, registro/acreditación,
  **pagos** y **eliminar** (sensibles), exportar. `delete` exige además
  `events.delete` como permiso de módulo: el recurso no puede conceder lo que
  el módulo negó. Una capacidad que no esté en el catálogo se descarta al
  normalizar — el cuerpo de la petición no puede inventar una.
- **⚠️ NADIE CONCEDE LO QUE NO TIENE, TAMBIÉN EN EL TERCER NIVEL**
  (`filterGrantableScopes`). Un gestor acotado a la XIII no puede asignar
  OTRO evento, ni pagos que él no tiene, ni «todos los eventos»; un editor
  sin `events.delete` no puede conceder eliminar. Lo rechazado vuelve
  NOMBRADO con su motivo (`rechazados`) en vez de perderse en silencio, y la
  puerta está en el SERVIDOR: esconder el evento en el selector no protege el
  endpoint de quien lo conoce (v4.868). Nadie se cambia el alcance a sí mismo
  (409): es la misma regla que el rol y los permisos.
- **⚠️ `events.delete` IMPLICA `events.view`**, y eso hace que pedir
  `events.delete` desde un gestor no dé una lista vacía sino `['events.view']`.
  Es correcto —la implicación es del criterio de v4.937— y hay que saberlo al
  escribir una prueba: comprobar `includes('events.delete')`, no la longitud.
- **⚠️ LA COLUMNA VA ENUMERADA EN EL ATAJO DEL ENSURE**
  (`{ table: 'SiteMembership', column: 'resourceScopes' }`). `CREATE TABLE IF
  NOT EXISTS` no amplía nada y la base de producción tiene la tabla desde
  v4.937: sin enumerarla el `ALTER` no correría jamás y el alta fallaría con
  «column does not exist» (la trampa de v4.908). Y en el store `undefined` es
  «no lo toques» y `{}` es «sin restricción» —dos cosas distintas—: guardar un
  rol no puede borrar un alcance.
- **⚠️ EL ESPEJO DEL NAVEGADOR ES MÍNIMO Y SE COMPARA POR SALIDAS.**
  `src/lib/rbacSpec.ts` trae `normalizeResourceScopes`, `canAccessResource`,
  `allowedResourceIds`, `resourceCapabilitiesFor` y `canCreateResource` —lo
  que hace falta para PINTAR pestañas y botones— y **no** trae
  `filterGrantableScopes` ni `validateResourceScopes`: qué se puede conceder
  lo decide el servidor. Una prueba comprueba su AUSENCIA. Ojo al escribir la
  paridad: el `setOf` del espejo lee `permissions` como ARRAY, así que un grant
  de prueba con `new Set()` no compara nada.
- **LA PANTALLA PINTA; NO DECIDE.** `Events.tsx` recibe `access` resuelto
  del servidor (`canCreate`, capacidades por evento) y de ahí salen las
  pestañas (`TAB_CAPABILITY`), «Editar» y «Eliminar». `useSiteAccess` expone
  `canResource` y `allowedResources` con `true`/`null` sin grant: sin dato no
  se esconde nada, porque el acceso real lo sigue decidiendo cada petición.
- **EL ALTA ES «+ CREAR USUARIO» EN LA MISMA PANTALLA** (`UsersAndRoles.tsx`),
  con nombre, correo, cargo, estado, rol, módulos y alcance. La contraseña
  **no viaja**: el acceso se entrega con el enlace de un solo uso de v4.932
  (`deliverAccessLink`) y una prueba busca `randomBytes(` y la ausencia de
  `bcrypt` en el controlador. La lista de módulos y el catálogo de eventos
  salen de `/rbac/catalog` y `/rbac/resources/:moduleKey` —la ruta literal va
  ANTES de `/users/:userId`—, nunca de una lista escrita en el `.tsx`.
- **LA AUDITORÍA NOMBRA EL HECHO** (`user_created`, `user_updated`,
  `user_deactivated`, `module_access_changed`, `resource_scope_changed`,
  `resource_assigned`, `resource_removed`), con actor, afectado, recurso y
  fecha, en la MISMA `InstitutionalAccessEvent` de v4.932. Asignar y retirar
  un evento son DOS eventos, no un «alcance modificado» genérico: son las
  preguntas que se van a hacer dentro de seis meses. `putUserStatus` escribe
  `user_deactivated` sólo para `disabled`; suspender sigue siendo
  `membership_suspended`.
- **EL ADMINISTRADOR PRINCIPAL NO PIERDE NADA.** Es la comprobación que
  autoriza el despliegue: el operador y el administrador de sitio sin fila
  resuelven `resourceScopes: {}`, `isRestrictedGrant` no cambia para ellos, y
  el escenario A de la prueba lo fija. Los tres escenarios del pedido (A
  completo, B gestor acotado a la XIII, C sin Eventos) se ejercitan con
  `resolveGrant` sobre membresías reales, no con fixtures que codifiquen la
  respuesta.
- **⚠️ AL AGREGAR UN GRUPO A UNA BATERÍA LARGA, RENOMBRAR SUS IDENTIFICADORES.**
  `test-rbac.mjs` ya declaraba `ctrl`, `rutas`, `ensure`, `store`, `hook` en
  grupos anteriores y el nuevo tramo murió con «Identifier has already been
  declared» antes de correr nada. Un archivo de pruebas es un módulo: los
  `const` de arriba viven hasta el final.

**Pendientes conocidos:** sólo **Eventos** está registrado en
`RESOURCE_MODULES` — Noticias, Proyectos, Campañas y Capacitaciones entran como
una entrada más con sus capacidades y su guardia, sin tocar el criterio ni el
modelo; las **excepciones individuales** de permisos siguen sin formulario
(v4.937); y la ficha del usuario acotado **no se comprueba en un navegador** —
al tocar su maquetación, mirarla (la lección de v4.717).

### A dónde entra cada sesión: el destino es un DATO del rol — v4.1093

Pedido con la pantalla delante: *«cuando el usuario con rol de acceso de gestor
de evento … inicie sesión debe llevarlo directamente a las inscripciones,
principalmente Inscripciones Colrotarios»*.

| Pieza | Qué es |
|---|---|
| `landing` en un `ROLE_PRESET` · `DEFAULT_LANDING` · `landingFor` (`rbacSpec.js`) | El CRITERIO. **Puro**: el destino declarado del rol y su comprobación contra los permisos |
| `landingPathFor` (`authController.js`) | La I/O: resuelve el grant y lo traduce a una ruta. Nunca lanza |
| `redirect` en `POST /auth/session` y en `POST /auth/login` | El destino, ya resuelto, para las DOS puertas |
| `vistaDeLaUrl` · `vistaPedida` (`Events.tsx`) | Con qué pestaña ABRE la pantalla |
| `autoDesplegado` (`Events.tsx`) | Con un acceso acotado a UN evento, la fila se despliega sola |

Pruebas: el grupo 22 de `npm run test:rbac` (357 casos: criterio, la ausencia
en el espejo y el cableado leído de los archivos). Verificadas a la inversa
sobre las tres invariantes.

- **⚠️ EL DESTINO ES UN DATO DEL PRESET, NO UN `if (role === ...)`.** Es la
  regla que sostiene el módulo desde v4.937 —un rol es un CONJUNTO DE PERMISOS
  y quien decide siempre es `hasPermission`— y un destino escrito con una
  comparación de rol es la misma trampa por la otra puerta: se reparte por las
  pantallas y se separa en silencio. Se declara junto al rol (`landing`) y lo
  resuelve `landingFor`, que es puro.
- **⚠️ SE COMPRUEBA CONTRA LOS PERMISOS ANTES DE MANDAR A NADIE.** Un preset
  puede declarar un destino que ESTA sesión no alcanza —porque le quitaron el
  módulo, o porque su alcance se recortó—, y entrar ahí daría una pantalla que
  no carga nada: eso se lee como un panel roto, no como un permiso que falta.
  `landingFor` cae a `DEFAULT_LANDING`, y `canOpenPath` ignora la parte de
  consulta, así que el destino puede llevar `?vista=` sin invalidarse.
- **⚠️ UN ROL SIN DESTINO DECLARADO ENTRA DONDE SIEMPRE, y ésa es la
  comprobación que autoriza el despliegue.** `landingFor` sobre un grant de
  administrador de sitio —o sin rol, o nulo— devuelve `/admin/dashboard`. Un
  preset nuevo no cambia a dónde entra nadie hasta que alguien lo decida.
- **⚠️ ERAN DOS PUERTAS CONTESTANDO COSAS DISTINTAS.** `/auth/session` (el modal
  del encabezado) resolvía el destino en el servidor y `AppLogin.tsx`
  (app.clubplatform.org) lo decidía en el navegador con
  `if (data.user?.role === 'editor')`. Ahora las dos leen el MISMO
  `landingPathFor` y `AppLogin` sólo OBEDECE `data.redirect`. **Consecuencia
  declarada**: el editor que entra por el modal pasa de `/admin/dashboard` a
  `/admin/analytics` — se eligió conservar lo que la puerta de la plataforma ya
  hacía, en vez de dejar dos verdades.
- **`redirect` en `/auth/login` es ADITIVO**: un cliente que no lo lea se
  comporta como siempre, y `AppLogin` conserva su respaldo.
- **RESOLVER EL DESTINO NUNCA CUESTA EL INGRESO.** Todo el RBAC degrada por
  diseño (`resolveUserGrant` no lanza) y aun así `landingPathFor` va en su
  propio `try`: un fallo decidiendo a qué pantalla entrar no puede dejar a
  nadie fuera. El `profile` ya lo cargó `authenticatePlatform`, así que pasarlo
  evita una segunda lectura de la misma fila en el camino del ingreso.
- **⚠️ LA PESTAÑA VIAJA EN LA DIRECCIÓN Y SU CATÁLOGO ES CERRADO.**
  `vistaDeLaUrl` sólo reconoce las claves de `TAB_CAPABILITY`; lo demás se
  ignora, y `getTab` cae después a la primera pestaña que el alcance SÍ
  permita. Por construcción el destino no puede ser una pestaña vacía ni una
  que esa sesión no alcanza — que es lo que hace seguro declarar
  `?vista=completadas` en el preset aunque un gestor futuro no tenga
  `completed`.
- **Y SE LEE SIEMPRE, FUERA DE CUALQUIER `if`** (lección de v4.1011 y v4.1030):
  un parámetro leído dentro del efecto de otra cosa compila igual y la pestaña
  no carga nunca.
- **CON UN ACCESO ACOTADO A UN SOLO EVENTO, LA PANTALLA ABRE POR ÉL.** Con
  varios no se despliega ninguno —elegir uno sería decidir por quien mira— y un
  administrador del sitio no se ve afectado. Se despliega UNA vez: si la
  cierra, se queda cerrada.
- **⚠️ EL ESPEJO DEL NAVEGADOR NO TRAE EL DESTINO.** No están `landing`,
  `landingFor` ni `DEFAULT_LANDING`, y lo fija una prueba que comprueba su
  AUSENCIA: quien decide a dónde entra una sesión es el servidor y lo manda
  resuelto. Con dos criterios, la puerta mandaría a una pantalla y el grant
  diría otra cosa.
- **⚠️ UNA COMPROBACIÓN FIJADA A LA FORMA LITERAL SE ROMPE AL ENDURECER EL
  CRITERIO.** La de v4.949 exigía el texto `activeTab[id] || 'inscripciones'` y
  falló al sumarle `?vista=`, con el criterio intacto y MÁS estricto. Se
  reescribió sobre la INVARIANTE —que la cadena de respaldo TERMINE en
  Inscripciones— (la lección de v4.984, pagada otra vez).
- **⚠️ AL AGREGAR UN GRUPO A UNA BATERÍA LARGA, RENOMBRAR SUS IDENTIFICADORES**
  (v4.1090, otra vez): `gAdminSitio` ya estaba declarado y el archivo murió con
  «Identifier has already been declared» antes de correr nada.

**Pendientes conocidos:** el destino es del ROL, no por usuario — acotar a una
persona dentro de su rol exigiría una columna en la membresía. Y nada de esto
**se comprueba en un navegador**: al tocar el ingreso o la apertura de Eventos,
mirarlo en pantalla (la lección de v4.717).

### El techo de capacidades de un ROL, y lo que un acceso acotado no ve — v4.1091

Reporte con cinco capturas del panel del Distrito 4281 visto por «Conferencia
Distrital», que entra con el rol **Gestor de eventos**: dentro de su evento veía
las siete pestañas de la ficha (Información, Multimedia, HTML, Social, Sede,
Panel de inscripción, Registro), y en la barra superior las siete cifras del
sitio y el saldo de la organización. Pedido literal: *«todo eso vamos a
ocultarlo de este usuario con rol de gestor de eventos»*.

| Pieza | Qué es |
|---|---|
| `resourceCapabilities` en un `ROLE_PRESET` (`rbacSpec.js`) | El TECHO: qué capacidades de un recurso alcanza ese rol, pase lo que pase |
| `roleCapabilityCeiling` · `applyRoleCeiling` | El CRITERIO. **Puro**: el techo de un rol y cómo recorta un alcance |
| `resolveGrant` | El ÚNICO punto que lo aplica — al RESOLVER, no al guardar |
| `kpisVisibles` · `verDinero` (`AdminLayout.tsx`) | Qué cifras de la barra se pintan |
| `!acceso.restricted` en `Events.tsx` | Las herramientas del SITIO que hay en esa pantalla |
| `techo` en `AlcanceDeRecurso` (`UsersAndRoles.tsx`) | El editor no OFRECE lo que el rol no alcanza |

Pruebas: dentro de `npm run test:rbac` (340 casos: criterio, paridad de los dos
espejos y cableado leído de los archivos). Verificadas a la inversa sobre los
cinco puntos.

- **⚠️ EL RECORTE NO PODÍA SALIR DEL PERMISO DE MÓDULO, y ahí está el
  diagnóstico.** Las pestañas ya se pintaban desde el alcance RESUELTO
  (`TAB_CAPABILITY` sobre `access.capabilities`, v4.1090): el gestor las veía
  porque su asignación las traía. Y quitarle `events.edit` del rol —lo primero
  que uno intenta— **le cierra también las inscripciones**: `registrations` y
  `completed` declaran ese mismo permiso en `RESOURCE_MODULES`. Por eso el techo
  es una propiedad del ROL y no un permiso menos.
- **⚠️ SE APLICA AL RESOLVER, NO AL GUARDAR.** Una migración de las filas
  existentes exigiría que un despliegue escribiera en la base —lo que la sección
  de base de datos prohíbe desde el 2026-07-13— y dejaría fuera toda asignación
  hecha antes. Aplicándolo en `resolveGrant`, la fila del Distrito 4281 —escrita
  en v4.1090 con las diez capacidades— se recorta sola al leerla, sin migrar
  nada, y el servidor (404 sobre lo que no alcanza) y la pantalla (pestañas)
  obedecen a la MISMA lista.
- **EL TECHO ACOTA; NO CONCEDE.** `payments` está en la lista del gestor para
  poder concederlo, y una asignación que no lo traiga sigue sin él. `delete`
  no está porque el rol tampoco tiene `events.delete`: el recurso no puede
  conceder lo que el módulo negó (v4.1090).
- **`view` NO SE RECORTA NUNCA.** Es la capacidad que existe por el solo hecho
  de tener el recurso asignado: quitarla dejaría un evento asignado que no abre
  nada.
- **⚠️ UN ROL SIN TECHO DECLARADO NO PIERDE NADA, y ésa es la comprobación que
  autoriza el despliegue.** `roleCapabilityCeiling` devuelve `null` para
  `site_admin`, `editor` y el resto, y `applyRoleCeiling` devuelve el alcance
  normalizado tal cual. Lo fija una prueba que lo compara objeto contra objeto.
- **⚠️ EL FIXTURE DEL ESCENARIO B CODIFICABA EL CONTRATO ANTERIOR.** La prueba de
  v4.1090 daba por bueno que el gestor alcanzara `info`, `media`, `html`,
  `social`, `venue`, `registration_panel` y `registration` — era cierto entonces
  y es justo lo que el cliente pidió cambiar. Se reescribió sobre la invariante
  nueva. Es la lección de v4.1001, otra vez: al ajustar un criterio, mirar qué
  fixture lo declara «correcto».
- **⚠️ EL ESPEJO LLEVA EL TECHO Y NO LO APLICA.** `src/lib/rbacSpec.ts` gana
  `resourceCapabilities` en el preset —el editor lo lee para no OFRECER lo que el
  rol no alcanza— y **no** `applyRoleCeiling`: quién resuelve es el servidor
  (regla de v4.937). Lo fija una prueba que comprueba su AUSENCIA y otra que
  compara el techo de cada preset entre los dos espejos.
- **UNA CASILLA QUE SE MARCA Y NO HACE NADA SE LEE COMO UN MÓDULO ROTO.** Por eso
  el editor de «Usuarios y permisos» no ofrece las capacidades que el techo
  recorta, y **lo dice** en una línea: sin ella, un hueco donde antes había siete
  casillas es indistinguible de que falte algo (v4.938).
- **⚠️ LAS CIFRAS DE LA BARRA DECLARAN DE QUÉ MÓDULO SON**, y con un acceso
  acotado sólo se pinta la de un módulo que esa persona puede abrir. Una cifra
  de un sitio que no se puede mirar es información que no le corresponde. La
  lista vive en UN solo sitio (`kpisVisibles`): la consumen la rejilla y el
  separador que la sigue, y escrita dos veces el separador sobreviviría a un
  recorte que se llevó todas las cifras.
- **MIENTRAS EL GRANT NO LLEGÓ NO SE PINTA NINGUNA.** Pintarlas y quitarlas
  después es un parpadeo que enseña justo lo que se está escondiendo. Un grant
  que no se pudo leer degrada a lo de siempre, como `canPath`.
- **EL CHIP DEL DINERO EXIGE EL PERMISO QUE ABRE LA BÓVEDA.** Es un enlace a
  `/admin/boveda`: sin el permiso sería un control que no lleva a ninguna parte
  (v4.650) y además enseñaría el saldo de la organización a quien administra las
  inscripciones de un evento. Su separador va con él.
- **⚠️ «TRAER DEL ECOSISTEMA» Y «SECCIÓN PÚBLICA DE EVENTOS» SON HERRAMIENTAS
  DEL SITIO, no de un evento.** La primera crea un evento NUEVO en este sitio; la
  segunda decide a dónde lleva `/eventos` para TODOS los visitantes. **El
  servidor ya las rechazaba** —guardar una sección exige un rol de contenido y el
  clon pasa por `resolveScope`—, así que esto no abre ni cierra ningún acceso:
  evita ofrecer un control que va a contestar 403 (v4.868: esconder un control no
  protege un endpoint, y ofrecerlo sin poder usarlo se lee como una avería).
- **SE DECIDE POR `restricted`, NO POR EL ROL.** Es el mismo criterio con el que
  se recorta el menú (v4.939), así que alcanza a cualquier rol de sitio acotado
  que aparezca después sin volver a tocar la pantalla — y no alcanza al
  administrador de sitio ni al operador, que no están restringidos.

**Pendientes conocidos:** el techo es de un ROL entero, no por usuario: acotar a
una persona dentro de su rol sigue siendo la asignación de capacidades por
recurso. Y ni la barra ni la pantalla de Eventos **se comprueban en un
navegador** — al tocar su maquetación, mirarla (la lección de v4.717).

### El remitente de un correo institucional — v4.942

Reporte: «no me están enviando los correos desde las cuentas institucionales».
Los correos SALÍAN. Lo que fallaba era desde qué dirección salían, y que la
pantalla afirmaba lo contrario.

| Archivo | Qué es |
|---|---|
| `server/lib/mailboxSender.js` | El CRITERIO. **Puro**: dominio, nombre visible, plan de envío, traducción del fallo del proveedor y qué se le dice a quien envió |
| `EmailService.sendEmail` | Recorre el plan y devuelve el remitente REAL en `sender` |
| `sendCommunication` | Propaga `sender` y el mensaje de `describeSend` |
| `src/pages/admin/EmailManagement.tsx` | Pinta el mensaje del servidor; avisa cuando no salió desde su cuenta |

Pruebas: `npm run test:mail-sender` (48 casos, **sin base, credenciales ni
red**; prisma y `fetch` sustituidos). Verificadas a la inversa: reintroduciendo
el nombre visible con la dirección fallan 4, quitando `sender` de la respuesta
5, y quitando el filtro del SMTP propio 1.

**Reglas durables:**

- **⚠️ UN NOMBRE VISIBLE QUE ES OTRA DIRECCIÓN ES EL PATRÓN DE LA
  SUPLANTACIÓN, y ésa era la causa.** Al rechazar el proveedor la dirección del
  sitio —dominio no verificado para ENVÍO—, el reintento salía como
  `"presidencia@dominio.org" <noreply@clubplatform.org>`: el sobre dice una
  cosa y lo que se lee dice otra, así que Gmail y Outlook lo marcan o lo tiran.
  **El proveedor contesta que lo aceptó y el destinatario no lo recibe**, que es
  exactamente la forma del reporte. El nombre visible es un NOMBRE —el del
  sitio, o la parte local en texto llano—; nunca una dirección.
- **⚠️ Y LA PANTALLA AFIRMABA LO QUE NO PASÓ.** Decía «Mensaje enviado con éxito
  desde presidencia@…» habiendo salido por el respaldo, así que no había forma
  de enterarse ni de saber qué corregir. El remitente REAL viaja en `sender` y
  el mensaje lo redacta `describeSend`: desde dónde salió, por qué, y que las
  respuestas le llegan igual. Es la misma regla que `resolveSenderPlan` en las
  Notificaciones de Contribuciones (v4.857) — el motivo es la mitad del
  diagnóstico.
- **PRIMERO SE INTENTA LA PROPIA; NO SE CONSULTA LA LISTA DE DOMINIOS PARA
  DECIDIR.** Esa lista puede venir vacía porque no se pudo preguntar —una key
  de sólo-envío no puede listar dominios (v4.857)— y con ella decidiendo, un
  sitio que hoy envía perfectamente dejaría de hacerlo. Se intenta, y lo que
  cambia es el respaldo.
- **La cuenta institucional va como `Reply-To` SIEMPRE**, salga por donde
  salga. Es lo que hace que al responder se conteste a la persona y no al buzón
  genérico de la plataforma.
- **⚠️ EL RESPALDO NO INVENTA UNA DIRECCIÓN EN EL DOMINIO CENTRAL.** Conserva
  la parte local que la plataforma ya usa (`noreply@`): componer
  `presidencia@clubplatform.org` sería una dirección que no existe y que nadie
  puede leer.
- **Sólo se intenta la propia si de verdad es un buzón del sitio**
  (`EmailAccount`). Enviar desde una dirección que no administramos es lo que
  el proveedor rechaza, y gastar ese intento no aporta nada.
- **⚠️ UN CLUB CON SMTP PROPIO CONSERVA SU CAMINO** (`.filter(paso =>
  paso.usedOwnMailbox || !transporter)`). Meterlo en el relay de la plataforma
  le cambiaría el remitente a un sitio que tiene su servidor configurado; y si
  la institucional no sale, se sigue de largo al SMTP del club en vez de
  fallar — que es lo que hacía antes de esta versión.
- **El error del proveedor se propaga TEXTUAL y se traduce DELANTE**
  (`explainSendFailure`). «The X domain is not verified» es exacto y no le dice
  a nadie qué hacer; traducirlo a secas lo volvería irreconocible al buscarlo
  en su soporte. Va el diagnóstico en español —con **dónde** se corrige: Bandeja
  de Entrada → Cuentas → Diagnóstico— y el original entre paréntesis. Misma
  regla que `metaCode` en el CRM (v4.702) y `describeProviderFailure` (v4.892).
- **El criterio es PURO y por eso se puede probar.** Un remitente que sólo se
  ejercita contra el proveedor real termina sin pruebas, y entonces nadie se
  entera de que volvió el nombre visible con la dirección.
- **Lo que esto NO arregla, y hay que decirlo: verificar el dominio.** Que un
  sitio pueda firmar sus correos con `@sudominio.org` exige verificarlo para
  ENVÍO en el proveedor (SPF/DKIM en su DNS). `getEmailDiagnostics` ya lo
  informa —«ENVÍO NO verificado para X»— y esta versión hace que el envío deje
  de fingir que ocurrió. Mientras no esté verificado, el correo sale desde el
  dominio central con la institucional como Reply-To, **y se dice**.

### Editar una cuenta, sus contraseñas y las acciones en bloque — v4.940

| Archivo | Qué es |
|---|---|
| `server/lib/accountActions.js` | El CRITERIO. **Puro**: catálogo cerrado de lo editable, validación de las dos contraseñas, quién puede fijársela a quién y el plan de una acción en bloque |
| `PATCH /api/email-accounts/:id` · `POST /api/email-accounts/bulk-delete` | El buzón: rótulo, contraseña y borrado en bloque |
| `POST /api/institutional/owners/:userId/password` | La contraseña de ACCESO al panel |
| `src/components/admin/institutional/AccountEditModal.tsx` | El modal, con las dos contraseñas separadas |

Pruebas: `npm run test:account-actions` (102 casos, **sin base, credenciales ni
red**; los tres endpoints se ejercitan de punta a punta con la base, prisma y el
servicio de correo sustituidos en memoria). Verificadas a la inversa: sin el
límite de escalamiento fallan 7, sin la protección de la cuenta principal otras
7, y devolviendo la contraseña en la respuesta, 2.

- **⚠️ SON DOS CONTRASEÑAS DISTINTAS Y CONFUNDIRLAS ES EL DEFECTO.** La del
  BUZÓN (`EmailAccount.password`, texto plano porque es lo que el proveedor
  necesita) es la del cliente de correo; la de ACCESO (`User.password`, bcrypt)
  es la del panel y **sólo existe si la cuenta tiene propietario**. Una cuenta
  «sólo buzón» —contacto@, info@— no tiene ninguna persona detrás: ofrecerle la
  segunda sería un campo que no hace nada (v4.650), y cambiar una creyendo que se
  cambia la otra deja a alguien fuera del panel o el correo sin entregar, **en
  silencio**. Son dos endpoints y dos botones a propósito.
- **⚠️ FIJAR NO ES LEER, y por eso esto no contradice v4.932.** Aquella regla
  prohíbe DEVOLVER una contraseña guardada —una credencial que su dueño cree
  suya— y sigue entera: ningún endpoint la devuelve, ni recortada, y la bitácora
  tampoco la guarda. Lo que se agrega es escribir una nueva, que el
  administrador ya conoce porque la acaba de teclear.
- **La que fija un administrador nace TEMPORAL** (v4.932) y **cierra sus
  sesiones abiertas**. Sin lo segundo, quien tuviera ese token lo seguiría usando
  hasta que venciera solo —hasta un día— y el restablecimiento no habría
  restablecido nada.
- **⚠️ FIJARLE LA CONTRASEÑA A ALGUIEN ES PODER ENTRAR COMO ÉL**, así que se
  decide con el criterio de los roles: se puede sobre quien uno podría haber
  nombrado y sobre nadie más. Un administrador de sitio **no** alcanza a otro
  administrador ni al operador — si pudiera, una credencial de administrador
  robada se convertiría en todas las demás. Y **nadie sobre sí mismo**: para lo
  propio está `/me/password`, que exige la actual. Todo bloqueo dice su SALIDA
  («Enviar acceso», que manda el enlace al buzón de su dueño y no le entrega la
  credencial a nadie): un bloqueo sin salida se lee como una avería.
- **⚠️ LO PROPIO SE CONTESTA PRIMERO.** Un administrador anterior a v4.932 no
  tiene fila en `InstitutionalProfile`: buscándola antes se le contestaría «ese
  usuario no existe en este sitio» a alguien que pregunta por sí mismo. Lo
  destapó la prueba del camino, no el typecheck.
- **⚠️ LA DIRECCIÓN NO SE EDITA, y no es un olvido.** `EmailAccount.email` es la
  llave por la que el perfil de su dueño encuentra su buzón, por la que la
  bandeja arma su `WHERE` y por la que el proveedor entrega: cambiarla dejaría
  los correos ya recibidos apuntando a una dirección que no existe. Una dirección
  nueva es una cuenta nueva. `MAILBOX_EDITABLE` es un catálogo CERRADO —lo que no
  está no se puede ni expresar en la petición, patrón `stripProtected`— y lo que
  llega de más se descarta y se DICE.
- **Una contraseña VACÍA es «no la cambies», no «déjala vacía».** Es la única
  excepción declarada a la regla de `undefined` vs `''` (v4.877): no existe una
  cuenta de correo sin contraseña, y borrarla dejaría el buzón sin entregar.
- **⚠️ UNA ACCIÓN EN BLOQUE NO ES ATÓMICA Y SE DICE.** Cada cuenta se resuelve
  por su cuenta —envolverlo en una transacción sería peor: un fallo tiraría abajo
  borrados que sí ocurrieron— y lo que queda fuera se NOMBRA con su motivo.
  «Se eliminaron 5» habiendo tocado 3 es el defecto que el plan existe para no
  tener (v4.938, v4.886).
- **⚠️ LA CUENTA PRINCIPAL NO SE BORRA NI EN BLOQUE, y la puerta va en el
  SERVIDOR.** Una selección de «todas» la incluye siempre, y esconder su casilla
  no protegería el endpoint de quien lo conoce (v4.868).
- **Una cuenta de OTRO sitio sale como «no existe», no como «es de otro
  sitio».** El universo se lee ya acotado al sitio, así que el plan nunca la ve;
  decir de quién es confirmaría que existe, que es la mitad de lo que hace falta
  para ir a buscarla. `otro_sitio` queda para el criterio, que sí la recibe.
- **⚠️ NO HAY CONTRASEÑA EN BLOQUE, y su ausencia se EXPLICA en la pantalla.**
  La misma credencial en varias cuentas convierte una sola filtración en todas
  ellas. Un hueco sin motivo se lee como algo pendiente.
- **La casilla va FUERA de cualquier otro control.** Anidarla dentro del botón de
  editar haría que marcar la cuenta disparara también su acción — y cada una
  lleva el nombre de su cuenta en la etiqueta accesible, o con la tabla llena
  «Seleccionar» se repite en cada fila y no se distinguen (la lección de la
  Biblioteca, v4.740).
- **La confirmación DICE qué va a pasar** —cuántas y cuáles— en vez de preguntar
  «¿estás seguro?»: lo que hay que poder revisar es el hecho.
- **Borrar el buzón NO borra a su dueño** (v4.932), tampoco en bloque: se suelta
  el vínculo y el usuario conserva su acceso. Borrarlo dejaría sin explicación
  los correos que envió.

### En qué dominio se crea una dirección institucional (v4.933)

- **⚠️ EL DOMINIO PROPIO DE UN DISTRITO NO ESTÁ EN `Club.domain`.** Un distrito
  existe dos veces —la fila de `District` guarda su dominio, la de `Club` es el
  sitio— y el dominio **no se duplica: se resuelve al leer** (v4.744). El
  catálogo del alta miraba sólo el club y ofrecía
  `@distrito-4281-de-rotary-international…` en un sitio cuyo correo vive en
  `@rotary4281.org`. Al resolver un dominio, preguntarse si el sitio es de un
  distrito.
- **La cascada está DECLARADA y es pura** (`resolveMailDomain`): dominio del
  sitio con conciencia de distrito → el que YA usan sus cuentas → nada. El
  segundo escalón no es un parche: es la evidencia más fuerte de qué dominio
  está VERIFICADO en el proveedor —si una dirección recibe correo, ese dominio
  funciona— y es el MISMO criterio con el que `getEmailDiagnostics` deriva los
  dominios que le pregunta a Resend, no un segundo criterio.
- **⚠️ UN HOST DE LA PLATAFORMA SE DESCARTA EN TODOS LOS ESCALONES.**
  `sub.clubplatform.org` sirve para ALCANZAR el panel y no se puede verificar
  como dominio de correo: una dirección ahí no recibiría nada, y eso **no falla
  ruidosamente** — falla el día que alguien escriba.
- **Sin ningún dominio NO se inventa uno**: se dice qué falta, con su causa, y
  el formulario lo explica en vez de dejar escribir una dirección que no se va
  a poder crear.
- **`descartados` recorre TODOS los candidatos aunque el primero sirva.** Si el
  recorrido cortara al encontrar el bueno, el host de la plataforma que se
  descartó no aparecería en ninguna parte — y ése es justo el dato que faltó
  para diagnosticar el reporte.
- **El navegador NO completa el dominio.** `EmailManagement` lo componía con
  `subdomain` cuando faltaba, así que daba uno distinto según por dónde se
  entrara al panel. El dominio lo resuelve el SERVIDOR y viaja resuelto — misma
  regla que el calendario de la distribución (v4.864) y el período de la Bóveda
  (v4.849).
- **El dominio se muestra ENTERO, no recortado.** El chip llevaba `truncate` y
  enseñaba `@distrito-4281-de-rotary…`: recortarlo deja al administrador sin
  poder comprobar en qué dominio va a quedar la dirección, que es la única
  pregunta que ese control contesta.
- **Al verificar a la inversa, quitar también el respaldo.** El primer intento
  de esta prueba pasaba con el defecto reintroducido: sin mirar el distrito, el
  respaldo por cuentas devolvía igual el dominio correcto. Hizo falta el caso
  de un distrito **sin cuentas todavía**, donde la fila de `District` es la
  única fuente.

**Limitaciones reales, dichas para no descubrirlas después:**

- **El freno de intentos es por instancia**, como se explica arriba. Un límite
  de verdad exige un almacén compartido que la plataforma no tiene.
- **`EmailAccount.password` sigue guardándose en claro** en su columna: es lo
  que el proveedor necesita y es anterior a este módulo. Lo que cambió es que
  ya no SALE hacia el navegador. Cifrarla exige decidir cómo la lee el envío;
  `tokenCrypto.js` ya hace AES-256-GCM versionado si se aborda.
- **Suspender NO invalida el token en el acto para las rutas que no declaran
  permiso.** Las que pasan por `requirePermission` o `requireActiveAccount` sí;
  una ruta antigua sin ninguna de las dos sólo verá la suspensión cuando el
  token venza. Al agregar una ruta sensible, declararle su permiso.
- **No hay pantalla para editar rol y permisos de un propietario ya creado.**
  El endpoint existe (`PATCH /institutional/owners/:userId`, con su auditoría)
  y la tabla muestra el estado; falta el formulario, que es la vuelta
  siguiente.
