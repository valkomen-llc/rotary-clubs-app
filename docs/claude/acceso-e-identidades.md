<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Acceso e identidades (v4.655)

El sitio tiene **un solo formulario de ingreso**: el del ícono del encabezado
(`src/sections/Navbar.tsx`). Ninguna pantalla dibuja el suyo. Cuando otra
pantalla necesita sesión, llama a `openLoginModal()` (`src/lib/loginModal.ts`).

Detrás hay **tres identidades**, y quien ingresa no tiene por qué saber cuál le
toca:

| Identidad | Tabla | Audiencia del token | Llave en el navegador | Destino |
|---|---|---|---|---|
| Administrador del sitio | `User` | `rotary-platform` | `rotary_token` | `/admin/dashboard` |
| Gestor de Proyectos | `ProjectFairAccount` | `project-fair-portal` | `feria_portal_token` | `/mi-proyecto` |
| Asistente al Evento | `EventAttendeeAccount` | `event-attendee-portal` | `evento_asistente_token` | `/mi-inscripcion` |

`POST /api/auth/session` (`server/controllers/sessionController.js`) recibe el
correo y la contraseña una sola vez, prueba la plataforma, después el panel del
club y por último el panel del asistente, y **devuelve la ruta de destino ya
calculada**. El navegador la obedece; no recalcula a dónde va cada rol. Al
agregar un rol o un destino, cambiarlo ahí, no en el `Navbar`.

**Reglas durables:**

- **Un ingreso abre TODAS las identidades que coincidan** (v4.711). Hasta
  v4.710 `resolveSession` devolvía la PRIMERA y se detenía: un rotario que paga
  la postulación de su proyecto y además su asistencia al evento sólo veía uno
  de los dos paneles, porque el otro no tenía sesión emitida. Ahora se prueban
  las tres y se abren las que correspondan; la primera manda para la
  redirección y las demás viajan en `sessions` para que el navegador guarde su
  token. **`sessions` es aditivo**: el nivel superior conserva la forma de
  siempre, así que un navegador con el bundle anterior entra igual.
- **Y se DESCUBREN entre sí sin volver a entrar** (v4.712,
  `useAttendeeLink` + `POST /event-registrations/portal/link`). Abrir las dos
  identidades al ingresar no alcanza: quien ya tenía una sesión de antes
  seguiría sin ver el otro panel, y cerrar sesión para descubrirlo no es algo
  que nadie adivine. El puente pregunta por el CORREO de la sesión que ya hay
  —token verificado en el servidor— y sólo emite la del mismo correo. Es el
  simétrico de `/project-fair/portal/link` y respeta su misma regla: la sesión
  que hubiera guardada sólo se retira si es de ESE correo. Se consulta una vez
  por carga y sólo si falta.
- **El puente busca por CORREO, no por `accountId`** (v4.713). Una inscripción
  anterior a que existieran las cuentas —o una cuyo vínculo no llegara a
  escribirse— tiene `accountId` en NULL y quedaba invisible para su propio
  dueño para siempre. Al encontrarla se le ata la cuenta ahí mismo
  (`attachOrphanRegistrations`), así que se arregla sola.
- **Un borrador no cuenta como inscripción** para el puente: sólo una enviada.
- **Un panel que falla al cargar DICE por qué** (v4.712). `PortalSignIn`
  descartaba el motivo y pintaba «Ingresa a tu panel» con el texto de siempre,
  así que un 404 o un 500 se veía idéntico a «no hay sesión» y mandaba a
  escribir otra vez unas credenciales correctas. Con sesión abierta y carga
  fallida se muestra el error y NO se abre el formulario de ingreso.
- **Los paneles siguen SEPARADOS y así se quedan.** Lo que se unifica es el
  ingreso, no los datos: cada identidad conserva su audiencia, su token y sus
  permisos, y el token de uno no abre el otro. Al agregar una identidad,
  agregarla a la sonda de `resolveSession`, no fundirla con otra.
- **El rótulo del menú es «Mi Inscripción al Evento», no «Mi Inscripción».**
  En el panel del proyecto también hay una inscripción —la de la postulación—,
  y en un menú que puede ofrecer las dos a la vez el nombre tiene que decir de
  cuál se trata.
- **La redirección es comodidad, no seguridad.** Toda ruta restringida se
  protege también en el servidor. `authMiddleware` exige la audiencia
  `rotary-platform`; `requireSiteAdmin` exige rol administrativo. Ambos en
  `server/middleware/auth.js`.
- **Las tres identidades comparten `JWT_SECRET`.** Por eso la audiencia es
  obligatoria: hasta v4.626 `authMiddleware` sólo verificaba la firma, así que
  el token del panel de un club pasaba y alcanzaba `/api/project-fair/admin/*`
  —que devuelve las postulaciones y los pagos de **todos** los clubes—.
  Nunca quitar la comprobación de `aud`.
- Los tokens sin `aud` (emitidos antes de v4.627) se siguen aceptando a
  propósito, para no cerrar sesiones en marcha. Duran un día y rotan solos;
  esa tolerancia se puede quitar pasada una semana del despliegue.
- **La casilla «Mantener la sesión iniciada» sólo puede ACORTAR la sesión**
  (v4.681). Marcada —por omisión, y también cuando el cliente no manda el
  campo— cada identidad conserva su vigencia de siempre: un día la de
  plataforma, treinta días las de los dos paneles. Desmarcada, las tres pasan a
  `SHORT_SESSION_TTL` (12 h). La decisión es del SERVIDOR, no del navegador:
  cambiar dónde se guarda el token exigiría tocar 186 lecturas de
  `localStorage` en 71 archivos, y además «no me recuerdes» no puede
  significar sólo que olvidamos dónde lo pusimos mientras sigue siendo válido.
  Al agregar una identidad, su `signToken` debe aceptar `{ remember }`.
- **El texto del formulario NO enumera quién entra.** Decía «administradores
  del sitio y clubes que postularon su proyecto» y se quedó corto al aparecer
  la tercera identidad. Cada tipo de cuenta nuevo obligaría a reescribirlo y,
  hasta que alguien lo hiciera, dejaría gente fuera de un texto que sí la
  incluye.
- Los campos del modal declaran `name`, `id` y `autoComplete`
  (`username` / `current-password`): es lo que hace que el navegador reconozca
  el ingreso y ofrezca guardar y autocompletar. No quitarlos.
- El ingreso con Google **no está implementado**: el botón nunca tuvo
  manejador. Está oculto tras `GOOGLE_LOGIN_ENABLED` en `Navbar.tsx`. Cuando
  se implemente, debe verificar el `id_token` en el servidor y converger en
  `resolveSession`, no ser una vía de acceso con reglas propias.
- `ADMIN_ROLES` está declarado dos veces a propósito (`src/App.tsx` y
  `server/middleware/auth.js`): el cliente decide qué pinta, el servidor qué
  responde. Si cambia una lista, cambiar la otra.

### La inscripción ABRE la sesión (v4.710)

- **Terminar la inscripción deja la sesión abierta.** Hasta v4.709 el envío
  creaba la cuenta, comprobaba la contraseña y devolvía el correo y la ruta del
  panel —pero NINGÚN token—, así que «Ir a mi inscripción» llevaba al formulario
  de ingreso a quien acababa de crear su contraseña dos pasos antes. El
  encabezado, mientras tanto, mostraba el avatar porque leía OTRA identidad: dos
  verdades sobre la misma persona. La emite `issueAttendeeSession`, en el
  servidor, que es quien acaba de comprobar la credencial.
- **`POST /portal/claim` es para cuando el token no está en ESTE navegador**:
  se pagó desde otro dispositivo, se cerró la pestaña, se vuelve de Stripe sobre
  una sesión que nunca se abrió. La prueba de propiedad es el `accessToken` de
  la inscripción —el mismo secreto que ya permite leerla sin sesión
  (`GET /:id?t=`), así que no amplía lo que un enlace filtrado deja ver— o el
  `stripeSessionId`. Es el mismo mecanismo que el panel del club estrenó en su
  día. **Un borrador no abre sesión**: sólo una inscripción enviada.
- **Un canje rechazado no crea nada.** La cuenta se crea al abrir la sesión, no
  al mirar la inscripción.
- **El token NO viaja en la URL.** En el camino normal va en el cuerpo de la
  respuesta del envío; el canje existe para el camino en que sólo hay URL.
- **Los dos paneles se enlazan entre sí**, y el enlace aparece SÓLO si esa otra
  sesión existe: ofrecer un panel al que no se puede entrar es peor que no
  ofrecerlo. Sale de `useSiteSessions`, la misma fuente del encabezado.

### La sesión se VE en el encabezado (v4.693)

`src/lib/siteSession.ts` es lo que el `Navbar` consulta para saber quién está
dentro. Lee los tokens que ya existen; no abre ni renueva sesiones.

- **El encabezado conoce las TRES identidades, no sólo la de la plataforma.**
  Hasta v4.692 el avatar dependía de `isAuthenticated` (`useAuth`), que sólo
  mira `rotary_token`: un Gestor de Proyectos que salía de `/mi-proyecto` veía
  el ícono de «Ingresar» y daba su sesión por cerrada. **No lo estaba** —el
  token nunca se borró—, pero una sesión que no se ve no existe para quien la
  usa. Al agregar una identidad, agregarla a `REALMS`/`REALM_META`.
- **Se resuelve en el navegador, leyendo el propio token.** El encabezado se
  pinta en todas las páginas: una consulta al servidor por visita reabriría el
  problema de rendimiento de v4.659. Leer el token aquí decide **qué se
  pinta**, nunca a qué se tiene acceso — eso lo verifica el servidor en cada
  petición, con firma y audiencia.
- **Se comprueban vencimiento y audiencia.** Un token vencido se retira del
  navegador ahí mismo (dejarlo sólo sirve para que el siguiente intento falle
  con un 401); uno con audiencia ajena se ignora. Un token **ilegible no se
  toca**: puede no ser nuestro, y borrarlo sería cerrarle la sesión a alguien
  por no saber leerlo. Los tokens sin `aud` se siguen aceptando, igual que en
  el servidor.
- **El nombre lo guarda el panel, no el token.** El token lleva el correo; el
  menú del avatar quiere el nombre. Cada panel llama a `rememberProfile` al
  cargar sus datos (`site_session_<realm>`). Pedirlo al servidor sólo para
  dibujar el encabezado sería, otra vez, una consulta por visita.
- **«Cerrar sesión» cierra las TRES.** Quien lo pulsa quiere salir del sitio,
  no de una de tres identidades que ni sabe que tiene separadas.
- **`/portal/link` sólo retira la sesión del panel si es del MISMO correo**
  (v4.693). Antes la borraba siempre que el usuario de la plataforma no
  tuviera proyecto: eso cerraba la sesión de OTRA persona que la había abierto
  con sus credenciales en ese navegador. Que este usuario no tenga proyecto no
  dice nada sobre ella. Por eso el endpoint devuelve `email` también en la
  respuesta negativa.
- **Toda escritura de un token avisa** (`emitSessionChange`), y el hook escucha
  además `storage` (otra pestaña) y `visibilitychange` (venció en segundo
  plano). Sin el aviso, el avatar aparece recién en la siguiente recarga.
