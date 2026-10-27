<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Inscripciones a eventos / Feria de Proyectos — v4.648

El módulo de **Eventos** maneja la inscripción completa de cada edición de la
feria. La XII (Valledupar 2027) es la primera; el módulo está hecho para que la
XIII se levante **sin tocar código**.

| Archivo | Qué es |
|---|---|
| `server/lib/eventRegistrationSpec.js` | Fuente de verdad: categorías, campos, estados, etiquetas, monedas y cálculo del cobro |
| `server/lib/ensureEventRegistrationSchema.js` | Crea las tablas en runtime (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`) |
| `server/lib/eventRegistrationStore.js` | Acceso a datos común al flujo público y al panel |
| `server/controllers/eventRegistrationController.js` | Flujo público: configuración, borrador, envío, checkout y webhooks |
| `server/controllers/eventRegistrationAdminController.js` | Panel: edición, categorías, tablero, fichas, acreditación y exportación |
| `src/pages/RegistroEvento.tsx` | Asistente público por pasos |
| `src/components/admin/events/EventRegistrationTab.tsx` | Contenedor de las cuatro pantallas del panel |
| `src/lib/qrcode.ts` | Generador de QR propio, sin dependencias (modelo 2, byte, nivel M, v1-10) |

**Reglas durables:**

- **Todo cuelga de `eventId`.** Categoría, inscripción, acompañante, pago,
  comunicación e historial llevan el id del evento. Ninguna consulta del módulo
  devuelve datos de una edición distinta a la que se le pide. Es lo que permite
  que la XII y la XIII convivan sin mezclarse.
- **El precio se congela al enviar el formulario** (`pricing` en la
  inscripción). El checkout lee esa foto guardada, **no** la configuración viva.
  Cambiar el precio o la moneda de una categoría no puede mover lo que ya se le
  prometió a alguien. Y el importe nunca viene del navegador.
- **La confirmación del pago la da el webhook**, no el retorno del navegador.
  `/api/payments/webhook` → `confirmPaidSession`. El regreso desde Stripe sólo
  consulta estado.
- **La idempotencia del webhook es doble**: `EventRegistrationPayment.stripeEventId`
  tiene índice único (parcial) y el UPDATE es condicional
  (`WHERE status <> ALL(SETTLED)`). Un reenvío de Stripe no vuelve a notificar
  ni a ocupar cupo. Ojo: el índice único es **parcial**, así que el
  `ON CONFLICT` tiene que repetir su predicado (`WHERE "stripeEventId" IS NOT
  NULL`) o la sentencia falla entera — fue un error real, corregido en v4.648.
- **Multimoneda**: `currency` es lo que se publica, `settlementCurrency` lo que
  cobra la pasarela. Si difieren, se convierte con `fx` de la edición y se
  guardan **los tres datos**: valor original, valor convertido y tasa. Sin tasa
  configurada NO se inventa una: se cobra en la moneda publicada y el panel
  avisa. La tasa se guarda en `NUMERIC(24,12)` — con menos decimales una tasa
  COP→USD (~0,000244) pierde precisión.
- **El formulario de cada categoría lo arma el servidor** (`buildFormSchema`) y
  viaja al navegador dentro de `category.form`. Agregar una categoría o un campo
  desde el panel no exige desplegar el frontend. El servidor valida siempre.
- **Las etiquetas de sistema** (`internacional`, `nacional`, `cadres`,
  `pago_confirmado`, `pendiente`, `con_acompanantes`) las deduce el módulo de la
  propia inscripción y no se editan a mano; el panel sólo cambia las manuales.
- **El estado no se escribe sin historial.** Todo cambio de estado, etiqueta,
  nota o acreditación deja fila en `EventRegistrationHistory` con usuario, fecha
  y comentario.
- **Una categoría con inscripciones no se borra**, se desactiva. Lo impide el
  servidor, no sólo la pantalla. Y `key` no se edita después de crearla: es lo
  que ata las inscripciones a su categoría.
- **Marcar "reembolsado" en el panel no mueve dinero.** El reembolso se hace en
  Stripe y llega por webhook; el cambio manual sólo refleja el estado
  administrativo.
- **Las siete tablas viven fuera de Prisma** (`EventRegistration`,
  `EventEdition`, `EventRegistrationCategory`, `EventRegistrationCompanion`,
  `EventRegistrationPayment`, `EventRegistrationHistory`,
  `EventRegistrationMessage`), como manda la sección de base de datos de este
  archivo. `EventRegistration` ya existía desde v4.606 con datos de producción:
  se **amplía** con `ADD COLUMN IF NOT EXISTS`, jamás se recrea. Las columnas
  viejas (`ticketKey`, `ticketLabel`, `quantity`) se siguen alimentando.
- **El QR es propio.** No agregar una librería de QR: `src/lib/qrcode.ts` cubre
  hasta 213 bytes, que es de sobra para un código de inscripción. Lleva el
  **código**, no una URL: en la sede puede no haber internet.

### Botones de la ficha pública (v4.650)

La ficha del evento muestra **dos** botones: el principal —nacional o
internacional según quien mire— y **Registro CADRES** debajo, siempre visible.
Cada uno abre `/eventos/:ref/registro?categoria=<clave>`.

| Archivo | Qué es |
|---|---|
| `resolveAudienceHint` / `resolveCtaButtons` en `eventRegistrationSpec.js` | Detección y resolución de los botones |
| `src/components/EventRegistrationCta.tsx` | Los botones en la ficha |
| `src/components/admin/events/EventCtaManager.tsx` | Pestaña "Botones" del panel |

- **Los botones se arman por `audience`, nunca por nombre ni por clave.** El
  administrador renombra las categorías (ya lo hizo: «Rotario Internacional» →
  «Registro Internacional») y los botones deben seguir apuntando a donde deben.
- **La segmentación es del servidor, no de la pantalla.** Con `?categoria=`, el
  endpoint público devuelve **sólo** esa categoría: los precios y los campos de
  las otras no llegan siquiera al navegador. No "mostrar una y ocultar dos".
- **Manda el IDIOMA ACTIVO del sitio, no el país** (v4.652). `es`/`es-CO` abre el
  registro nacional; cualquier otro idioma, el internacional. Nunca los dos. El
  navegador lo manda en `?locale=` tomándolo de `useLang()`, y ese parámetro está
  en las dependencias del efecto, así que cambiar de idioma repinta los botones
  sin recargar. `lang` está en las dependencias **a propósito**: quitarlo deja la
  ficha mostrando el registro del idioma anterior.
  El país (`x-vercel-ip-country`) quedó relegado a respaldo, y sólo actúa cuando
  no llega idioma alguno. Hasta v4.651 mandaba el país, y por eso un visitante
  con el sitio en inglés desde Colombia veía el botón nacional.
- **Los idiomas nacionales se comparan EXACTO** (`DEFAULT_NATIONAL_LOCALES`, y
  `cta.nationalLocales` por evento). `es-MX` o `es-ES` no son `es-CO`: son
  visitantes de fuera. En este sitio el selector ofrece un solo español y es el
  colombiano, por eso `es` cuenta como nacional.
- **El precio y el formulario los define la categoría, no el botón.** Si se
  duplicaran en el botón, podría anunciar un valor y el formulario cobrar otro.
- **Categoría cerrada**: con mensaje configurado el botón se ve apagado y
  explicado; sin mensaje se oculta. Nunca un botón que no lleva a ninguna parte.
- `decorateCategory` **debe** incluir `active`: su salida vuelve a pasar por
  `categoryWindow` dentro de `resolveCtaButtons`, y sin ese campo se dan todas
  las categorías por inactivas y desaparecen todos los botones (error real,
  corregido antes de publicar v4.650).

### Inscribirse con una cuenta que ya existe (v4.692)

Un rotario que ya postuló un proyecto tiene cuenta, contraseña y perfil. El
Registro Nacional lo reconoce y no le pide una segunda credencial.

| Pieza | Qué hace |
|---|---|
| `accountLinkingFor` (`eventRegistrationSpec.js`) | Política por edición y **por audiencia** |
| `identityFromRequest` (`eventAttendeeController.js`) | Quién viene, mirando el token |
| `prefillForIdentity` | Datos de precarga desde su postulación |
| `linkAttendeeAccountTo` | Vincula sin crear una segunda cuenta |

- **La inscripción sigue perteneciendo SIEMPRE a un `EventAttendeeAccount`.** Es
  lo que sostiene el panel, los permisos y el aislamiento por `accountId`. Lo
  nuevo es que esa cuenta puede estar VINCULADA (`linkedRealm` + `linkedId`) a
  una identidad anterior, y entonces no tiene contraseña propia
  (`passwordHash = '!'`): se entra con la de siempre. No hay usuario duplicado
  ni segunda credencial.
- **Se limita por AUDIENCIA, no por clave de categoría** (`audiences:
  ['national']` por defecto). El administrador renombra las categorías; la
  audiencia no cambia. Sólo el nacional porque la cuenta que se reutiliza es la
  del Gestor de Proyectos, y esa convocatoria es para clubes colombianos.
- **La audiencia de una categoría se RESUELVE, no se lee a secas** (v4.694,
  `audienceOfCategory`). `normalizeCategory` siempre deja un valor —`'general'`
  cuando no reconoce ninguno—, así que `category.audience || RESPALDO` **nunca**
  cae al respaldo: el `||` era código muerto. Y el formulario de categorías del
  panel nace en `'general'`, de modo que una categoría creada ahí no pertenece
  a ninguna audiencia. Eso dejó la reutilización de cuenta apagada en silencio
  en el Registro Nacional de producción, con el paso 1 pidiendo contraseña a
  quien ya tenía sesión. El orden es: lo que declara la CATEGORÍA, lo que
  declara el BOTÓN que lleva a ella (`settings.cta.buttons[].audience`, donde
  el administrador ya dejó escrito cuál es el nacional) y, por último,
  `AUDIENCE_BY_CATEGORY`. **Sigue siendo por audiencia**: la clave es el último
  recurso y sólo para las que el módulo ya conoce. Al agregar una categoría con
  clave nueva, declararle la audiencia — no confiar en la deducción.
- **La audiencia resuelta viaja en la respuesta** (`accountLinking.audience`).
  Es el dato del que depende todo esto y no se veía en ninguna parte: sin él,
  un formulario que no reconoce una cuenta no distingue entre la política, la
  sesión y la categoría.
- **La política vive en la edición** (`settings.accountLinking`): `both` /
  `account_only` / `new_only`, más la lista de audiencias. Un evento nuevo
  decide sin desplegar.
- **El token se verifica en el SERVIDOR** (firma + audiencia) y **el correo del
  formulario tiene que ser el de la cuenta**. Sin esa segunda comprobación,
  quien tuviera sesión podría inscribir a otra persona a nombre de su cuenta.
- **Una cuenta vinculada NUNCA responde `needsPassword`** al iniciar sesión: su
  clave vive en la identidad de origen, así que ese mensaje la mandaría a crear
  justo la segunda credencial que esto evita. Devuelve un fallo normal y
  `resolveSession` sigue probando.
- **La precarga sólo rellena campos VACÍOS.** Un borrador a medias no se pisa.
- `attendeeAuth` acepta el token de la identidad vinculada, así que quien se
  inscribió reutilizando su cuenta entra a `/mi-inscripcion` con esa misma
  clave, sin una segunda sesión.
- El aviso de ingreso completado va por `emitLoginSuccess` / `onLoginSuccess`
  (`src/lib/loginModal.ts`), por el mismo motivo que la apertura del modal: el
  `Navbar` se monta dentro de cada página, no por encima. **Emitirlo en las tres
  ramas de `handleLogin`** — se escapó la del panel del club y el formulario no
  se enteraba hasta recargar.

### Reconocer una sesión no es ofrecerla (v4.983)

Reporte con dos capturas: el mismo formulario abierto con la sesión iniciada
—el avatar en el encabezado—, en `?categoria=registro_nacional` con los datos
precargados y en `?categoria=cadre` **en blanco y con «Crea tu clave de acceso»
debajo**, para una cuenta que ya existía.

- **⚠️ LA AUDIENCIA DECIDÍA DOS COSAS A LA VEZ, Y UNA DE ELLAS NO LE
  CORRESPONDE.** `identityFromRequest` colgaba de `linking.allowed`
  (`eventRegistrationController.js`), que estaba acotado a
  `accountLinking.audiences` —por defecto `['national']`—: en el CADRE y en el
  internacional **ni siquiera se llegaba a leer el token**. Sin identidad no
  hay precarga y se pinta el bloque de contraseña. Son dos preguntas distintas
  y ahora son dos campos: `offered` (a quien NO ha entrado se le ofrece
  «¿ya tienes cuenta?» — ahí la audiencia sigue mandando y el argumento de
  v4.692 sigue en pie) y `allowed` (a quien SÍ entró se le reconoce la sesión,
  venga por donde venga). **No hay nada que ofrecerle a quien ya entró: la
  sesión es un hecho, no una oferta.**
- **⚠️ Y EL ARGUMENTO ORIGINAL SÓLO CUBRÍA UNA DE LAS TRES IDENTIDADES.**
  v4.692 lo justificó con que «la cuenta que se reutiliza es la del Gestor de
  Proyectos, y esa convocatoria es para clubes colombianos». Pero
  `LINKABLE_REALMS` son tres, y dos no tienen nada que ver con esa
  convocatoria: el usuario de la PLATAFORMA y —el caso caro— el ASISTENTE que
  ya se inscribió antes, que **tiene `EventAttendeeAccount`**. A ése se le
  pedía «crear» la contraseña de una cuenta que existe, y escribir una
  distinta lo mandaba al `conflict: 'password'` de `ensureAttendeeAccount` →
  409. Al acotar algo por una razón, comprobar que la razón cubra todos los
  casos que ese algo alcanza.
- **`new_only` apaga las DOS**, también para quien ya entró: es la salida
  explícita del evento que quiera siempre credenciales nuevas, y la política
  sigue viviendo en la edición (`settings.accountLinking`), no en el código.
- **`account_only` sólo puede regir donde el ingreso se OFRECE.** Exigir cuenta
  en una audiencia a la que no se le ofrece entrar dejaría esa categoría sin
  ninguna forma de inscribirse — un bloqueo sin salida.
- **⚠️ EL CORREO DEL FORMULARIO ES EL QUE DECIDE SI SE PIDE CONTRASEÑA, no el
  hecho de tener sesión.** El servidor sólo vincula cuando el correo coincide
  con el de la cuenta (v4.692, y no se afloja); la pantalla no lo miraba, así
  que quien con sesión cambiaba el correo para inscribir a otra persona no veía
  el bloque de contraseña **y el envío fallaba con un `fieldErrors.password`
  que se escribía en un bloque oculto**: un callejón mudo. Ahora vuelve a
  pedirse la contraseña **con su motivo**, nombrando el correo de la sesión. Al
  ampliar dónde se reconoce una sesión, ese callejón se habría ampliado con
  ella: por eso las dos mitades van juntas.
- **Sin sesión NO cambia nada.** Sin token, `identity` es null y el formulario
  se comporta exactamente como antes — lo que acota el riesgo del cambio a
  quien ya inició sesión, que es justo lo reportado.
- **`offered` es ADITIVO**: un navegador con el bundle anterior no lo lee y
  cae a `allowed`, que es como se comportaba. Y el servidor que aún no lo mande
  se resuelve con `?? linkingAllowed`.
- **El fallback de `linkingTarget` busca por `offered`, no por `allowed`.**
  Desde esta versión `allowed` es cierto en casi toda categoría, así que buscar
  por él tomaría la primera de la lista y el bloque «¿Ya tienes una cuenta?»
  saldría en un evento que no lo ofrece.
- **⚠️ UNA COMPROBACIÓN CON `a + (b >= 2)` NO COMPRUEBA LO QUE DICE.** La
  precedencia de `+` sobre `>=` la volvía «al menos una», así que revertir UNA
  de las dos llamadas a `identityFromRequest` la dejaba en verde. Se cuentan
  las llamadas y las guardias por separado y se exige que coincidan; verificado
  a la inversa revirtiendo **cada punta por su lado**.
- Pruebas: dentro de `npm run test:event-form` (79 casos, **sin base,
  credenciales ni red**), incluidas las que leen el controlador y la pantalla —
  el criterio puede quedar intacto mientras alguien vuelve a envolver la
  identidad en la audiencia, y ese fallo es MUDO: el formulario sale en blanco
  y no hay ningún error.

### La sede del evento (v4.717)

La ficha pública muestra, bajo la ubicación, dónde se realiza el evento: foto
del lugar, nombre, dirección, sitio web, personas de contacto y mapa.

| Archivo | Qué es |
|---|---|
| `src/lib/eventVenue.ts` | El criterio: forma, normalización y qué mapa se acepta |
| `src/components/EventVenueCard.tsx` | El bloque en la ficha pública |
| `src/components/admin/events/EventVenueEditor.tsx` | La pestaña «Sede» del panel |

- **Vive en `CalendarEvent.metadata.venue`**, la columna `Json` que ya existe.
  No se agrega una columna a Prisma: eso obligaría a sincronizar la base, que
  es justo lo que la sección de base de datos de este archivo manda evitar.
- **Es POR EVENTO, no escrito en el código.** El único mapa que había era el de
  la Conferencia LATIR, con la dirección dentro de `EventoDetalle.tsx` y detrás
  de un `if` por id de evento: servía para ese evento y para ninguno más, y no
  se podía cambiar sin desplegar. Ese bloque se conserva; el nuevo no lo
  sustituye porque sus datos siguen sin estar en la base.
- **Sólo se admiten mapas de GOOGLE** (`normalizeMapUrl`). Es un `<iframe>` que
  se dibuja en una página pública: aceptar cualquier dirección convertiría un
  campo de texto del panel en un hueco por donde meter cualquier cosa en el
  sitio. Se rechazan otro dominio, `http`, `javascript:`, `data:` y una URL de
  Google que no sea un mapa.
- **Se pega lo que Google da.** El administrador copia el `<iframe>` completo y
  del texto se extrae el `src`; también vale la dirección suelta. Pedirle que
  recorte el atributo a mano es pedirle que edite HTML.
- **El borrador NO es el contrato de lectura** (v4.718, `draftVenue` frente a
  `normalizeVenue`). Es el fallo que rompió «Agregar contacto»: la limpieza de
  lectura descarta el contacto vacío y le completa el `https://` al sitio web
  —lo correcto antes de publicar—, pero aplicada al borrador hace imposible
  escribir. Un contacto recién agregado nace vacío por definición: se creaba y
  se descartaba en el mismo render. Y el sitio web se convertía en `https://w/`
  con la primera pulsación. El editor trabaja sobre `draftVenue`, que sólo da
  forma; se limpia al leer.
- **El mapa y el sitio web se normalizan al SALIR de la casilla, no en cada
  pulsación.** Normalizar mientras se escribe borra el texto a mitad de pegarlo.
- **Probar el EDITOR, no sólo la ficha.** v4.717 verificó cómo se ve la sede en
  la página pública y no cómo se carga desde el panel: por eso el defecto llegó
  a producción. `editor-sede` monta el componente a pelo —sin el resto del
  panel— y lo maneja en un navegador.
- **Cada pieza se dibuja sólo si está** (`venueHasContent`). Una sede con foto y
  sin contactos no deja un hueco donde iban los contactos, y un evento sin sede
  configurada se ve exactamente como antes.
- **Correo y teléfonos van con su enlace** (`mailto:`, `tel:`). Esto se mira
  sobre todo desde el móvil, donde copiar un número es trabajo.
- **La casilla de la foto ofrece las DOS vías** —subir o elegir de la Biblioteca
  Multimedia—, que es la regla del sitio desde v4.700.
- Pruebas: `npm run test:event-venue` (35 casos). **No necesitan base,
  credenciales ni red**: prueban el CRITERIO —qué mapa se acepta, cómo se
  normaliza el sitio web, qué contacto se descarta y cuándo se dibuja la sede—,
  separado de cómo se pinta.

### Dirección pública de un evento (v4.658)

Un evento se abre igual con su **id interno** que con su **slug**: el endpoint
acepta los dos (`id = $1 OR slug = $1`). Eso es cómodo, pero deja que el
visitante acabe mirando un identificador en la barra de direcciones.

- **El slug manda cuando existe.** `EventoDetalle` y `RegistroEvento`
  reemplazan la dirección por la del slug (`navigate(..., { replace: true })`)
  en cuanto saben cuál es. Conservan query y ancla —`?categoria=` es lo que
  distingue un registro de otro— y usan `replace` para que el "atrás" no rebote.
  La condición es `slug && ref !== slug`, así que no puede entrar en bucle.
- **Lo que se GUARDA es el id; lo que se PUBLICA es el slug.** El destino de la
  redirección de `/eventos` se guarda por id (lo único que no cambia) y la
  página pública lo resuelve al slug del momento. Así, renombrar el slug no
  rompe la redirección. El desplegable del panel acepta las dos formas, porque
  hasta v4.657 se guardaba el slug.
- `useSEO` recibe la dirección canónica, no la que se usó para entrar: el
  evento se indexa por su slug.

**Nueva edición**: crear el `CalendarEvent`, abrir la pestaña Registro y usar
"clonar" desde la edición anterior. El número de edición y la ciudad se deducen
del título (`XIII …`) y de `location`. La edición clonada nace con el registro
**cerrado**, a propósito.

### Rol "Asistente al Evento" y su panel (v4.655)

Al enviar el formulario, la inscripción **crea la cuenta** con la que esa
persona consultará su registro. Es el mismo patrón del Gestor de Proyectos, y
está escrito aparte a propósito.

| Archivo | Qué es |
|---|---|
| `server/controllers/eventAttendeeController.js` | Identidad, permisos, panel y auditoría del asistente |
| `src/pages/MiInscripcion.tsx` | El panel (`/mi-inscripcion`) |
| `src/components/forms/FairField.tsx` | Campos compartidos con Postular Proyecto |

- **Una cuenta por CORREO, no por inscripción.** Es la diferencia con
  `ProjectFairAccount`, que es 1:1 con la postulación. Quien vuelva en la XIII
  entra con la misma clave y ve su historial separado por evento. Por eso la
  unicidad es sobre `lower(email)` y el vínculo con cada inscripción vive en
  `EventRegistration.accountId`. Con esa columna más `eventId` y `categoryKey`,
  una sola fila lleva la relación completa usuario ↔ evento ↔ categoría ↔
  inscripción.
- **Si el correo ya tiene cuenta, NO se crea otra.** Se vincula la inscripción
  nueva, y para hacerlo se exige la contraseña vigente. Sin eso, cualquiera que
  conociera un correo podría sobrescribir su clave inscribiéndose de nuevo. El
  409 explica cómo salir (entrar o recuperar la contraseña); no es un callejón.
- **La cuenta se resuelve ANTES de escribir la inscripción.** Un choque de
  contraseña no puede dejar una inscripción a medio crear.
- **La contraseña nunca entra en `answers`.** Viaja aparte en el envío final —no
  en el autoguardado ni en el borrador de `localStorage`— y sólo se persiste su
  hash (bcrypt).
- **Permisos propios** (`ATTENDEE_PERMISSIONS`), no los del Gestor de Proyectos:
  leer su inscripción y su perfil. Reutilizar los de proyectos le habría dado
  acceso a formularios y documentos que no le corresponden.
- **El aislamiento va en el `WHERE`.** Toda consulta del panel filtra por
  `"accountId" = <cuenta del token>`. Ningún endpoint recibe un id y lo devuelve
  comprobando la pertenencia después. La ficha tampoco expone notas internas,
  identificadores de Stripe ni etiquetas de segmentación.
- **Una inscripción pagada no puede quedar sin cuenta.** Si el formulario se
  envió antes de v4.655, `confirmPaidSession` la crea con hash inutilizable
  (`'!'`) y la persona la estrena por "olvidé mi contraseña": el pago ya
  demostró que ese correo es suyo. Mismo mecanismo que `ProjectFairAccount`.
- **El estado del panel lo mueve el módulo, no la pantalla**: el webhook de
  Stripe y el panel administrativo. El asistente sólo lee.
- La verificación de correo existe pero está **apagada** por defecto
  (`EVENT_ATTENDEE_EMAIL_VERIFICATION=true` la enciende): encenderla obliga a
  confirmar el correo y sólo tiene sentido con el envío de correo sano.
- **El campo `language` ("Idioma") se retiró del formulario** en v4.655: el
  idioma de navegación lo decide el selector del encabezado y ya gobierna qué
  registro se ofrece (`resolveAudienceHint`); preguntarlo otra vez duplicaba un
  dato que el sitio ya conoce y podía contradecirlo. `preferredLanguage`
  ("Idioma preferido durante el evento") **se conserva**: es otra cosa —sirve
  para traducción y salas—. La columna `language` no se toca: las inscripciones
  viejas conservan su valor.
- **Los dos formularios públicos comparten componentes de verdad**
  (`src/components/forms/FairField.tsx`). Postular Proyecto y el registro a un
  evento importan `Field`, `PhoneField` y `StepProgress` del mismo módulo. No
  duplicar estos controles: el formulario del evento es dinámico (los campos los
  define el servidor) y `DynamicField` sólo TRADUCE cada campo a esas piezas.
- **Nunca un `<datalist>`** (v4.656, pedido del cliente). País y Departamento
  tenían uno de sugerencias y el navegador lo desplegaba encima del formulario
  al hacer clic: parecía un selector obligatorio con un catálogo corto, cuando
  en realidad admitían cualquier valor. La conclusión que quedó escrita es que
  **si hay que ofrecer una lista, es un `select`**; un `datalist` sugiere sin
  restringir y confunde las dos cosas. Desde v4.708 esos campos SÍ son `select`
  cuando hay catálogo — ver la sección siguiente—, que es exactamente lo que
  esa conclusión decía que había que hacer.

### Ubicación y datos rotarios del asistente (v4.708)

El paso 1 pide, además de los datos básicos, dos bloques: **Ubicación** (país,
departamento/estado/provincia, ciudad) y **Tu club en Rotary** (distrito, club,
rol en la feria). Van en las tres categorías.

- **Lo que decide la forma de los campos es el PAÍS DECLARADO, no el idioma ni
  la audiencia.** Con Colombia, el departamento, el distrito y el club salen de
  listas; con cualquier otro país, los tres son texto libre. El idioma habría
  sido el criterio equivocado y el propio cliente lo señaló: un rotario
  colombiano puede leer el sitio en inglés y un extranjero en español. La
  audiencia tampoco sirve —un colombiano puede inscribirse por el registro
  internacional—. Lo que sí decide la audiencia es **con qué nace** el
  formulario: el nacional trae Colombia puesta (`defaultAnswersFor`), porque
  hacer buscar «Colombia» en doscientos países a quien seguro es de aquí es
  trabajo para todos los inscritos.
- **`catalog` + `dependsOn` en el campo, `optionsForField` para resolverlo.** Un
  campo declara de qué catálogo salen sus opciones y de qué respuesta depende
  ese catálogo; una sola función devuelve la lista o `null`. `null` y `[]` son
  cosas distintas: `[]` es «hay catálogo y está vacío». Está espejado en
  `src/lib/eventRegistrationSpec.ts` — al tocar uno, tocar el otro.
- **Los catálogos van donde ya tienen su fuente de verdad.** Los distritos con
  sus clubes los manda el SERVIDOR en la respuesta de la configuración, porque
  `rotaryClubs.js` (v4.707) es su única verdad y copiarla al bundle daría dos
  listas que se separan en silencio. Los países y los departamentos de Colombia
  los pone el NAVEGADOR, que ya los lleva para el selector telefónico y para
  Postular Proyecto: mandarlos desde el servidor sería duplicar en la respuesta
  lo que el bundle carga de todos modos.
- **La lista ayuda a escribir; NO cierra los valores aceptados.** El servidor
  valida departamento, distrito y club como texto. Un catálogo se queda viejo
  solo —clubes nuevos, fusiones, cambios de nombre— y esta es una inscripción
  que se PAGA: rechazar a quien no figure sería perderlo. Por eso el club
  termina en «Mi club no está en la lista», va de última y cuesta un clic extra.
  La única lista que sí es cerrada es la del rol en la feria, que es nuestra.
- **Lo que SÍ se rechaza es un club del catálogo de OTRO distrito.** No es un
  club que falte: es una pareja distrito-club que se contradice. Sin falso
  positivo posible —un club que figure en los dos pasa por la primera
  condición—. Misma regla que la postulación (v4.706).
- **El distrito va ANTES que el club**, porque es lo que decide qué clubes se
  ofrecen. Cambiar de distrito descarta el club, y cambiar de país descarta el
  departamento: el anterior ya no describe nada.
- **La lista de distritos es la COLOMBIANA y por eso también depende del país.**
  Ofrecer dos distritos a quien vive en Miami es ofrecerle una lista en la que
  no está. Una edición que traiga su propio catálogo declara a qué país
  corresponde (`catalogs.districtsCountry`).
- **`fairRole` NO es `rotaryRole` renombrado.** El cargo dice qué es esa persona
  en su club todo el año; el rol dice qué va a hacer DURANTE el evento, que es
  lo que necesita la logística. Por eso la clave es nueva: escribir uno donde
  estaba el otro convertiría «Tesorero» en un papel en la feria que nadie
  declaró. `rotaryRole` sigue exportado para rotular lo que respondieron las
  inscripciones anteriores, y su columna **no se vacía al reenviar** el
  formulario — misma regla que `language` en v4.655.
- **Un campo retirado sigue viéndose en la ficha.** `RETIRED_LABELS` en
  `EventRegistrationsManager.tsx` le pone nombre a lo que ya no está en el
  formulario (`rotaryRole`, `residenceCountry`, `language`); sin eso la ficha
  mostraba la clave cruda como si fuera la pregunta. Al retirar un campo,
  agregarlo ahí.
- **`department` y `fairRole` son columnas promovidas**, como ya lo eran ciudad
  y distrito: son los ejes por los que el comité segmenta y un filtro sobre el
  JSON no se indexa. Al agregar una columna, ampliar también
  `OWNED_REGISTRATION_COLUMNS` en el ensure — esa lista **no es un número de
  versión**: si no se amplía, la comprobación rápida da la columna por presente
  y no se crea.
- **Las columnas las decide CADA bloque, no el paso** (`columns` en el grupo).
  Un bloque de tres campos tiene su propia rejilla y ocupa el ancho completo,
  igual que en Postular Proyecto: heredar las dos columnas del paso dejaba el
  tercero colgando bajo el primero. Los datos básicos siguen a dos porque son
  pares naturales. Y por eso el departamento tiene DOS rótulos (`altLabel`):
  «Departamento / Estado / Provincia» se parte en dos líneas dentro de una
  columna de un tercio y baja el control respecto de sus vecinos. Al agregar un
  campo a estos bloques, mirar que su rótulo quepa en una línea.
- **Los `groups` del paso son ADITIVOS.** `FormStep.fields` sigue trayendo todo
  aplanado y en orden, así que un navegador con el bundle anterior dibuja el
  mismo formulario sin los subtítulos, en vez de quedarse sin los campos nuevos.
- Pruebas: `npm run test:event-form` (61 casos). **No necesitan base,
  credenciales ni red**: prueban el CRITERIO —composición del formulario,
  resolución de catálogos, validación y valores por defecto—, separado de la
  orquestación.

### Inscripciones completadas por fuera de la página (v4.943)

Pestaña del evento — desde v4.949 es PESTAÑA PRINCIPAL, rotulada
**«Inscripciones COLROTARIOS»** (el rótulo es SÓLO de interfaz: la clave
interna `completadas`, los endpoints y el slug público no cambian), segunda de
la barra; «Inscripciones» es la primera y la vista con la que ABRE el evento, y
Registro se queda con la configuración (Edición, Categorías, Botones,
Acreditación). Las tres vistas montan el MISMO `EventRegistrationTab` con su
prop `view` — cero duplicación. Registra a
quienes YA se inscribieron y pagaron por otro canal (transferencia bancaria,
pasarela externa) y entregan acá la información que faltaba. La XIII
Conferencia del 4281 es la primera; su formulario público vive EXACTO en
`/inscripcion-conferencia-distrital-villavicencio-2027`.

| Archivo | Qué es |
|---|---|
| `server/lib/completedRegistrationSpec.js` | El CRITERIO. **Puro**: estados, el formulario de 4 pasos, validación, comprobante, código y la semilla del slug |
| `server/lib/completedRegistrationStore.js` | La I/O: resolución por slug (con siembra perezosa), filas, código y duplicados |
| `server/lib/completedReceipts.js` | El comprobante en S3: prefirmar, verificar el objeto real y firmar la lectura |
| `server/controllers/completedRegistrationController.js` | El flujo público |
| `server/controllers/completedRegistrationAdminController.js` | La pestaña: tablero, ficha, acciones, exportes |
| `src/pages/CompletarInscripcion.tsx` | El formulario público de 4 pasos |
| `src/lib/completedRegistrationSpec.ts` | Espejo MÍNIMO, comparado por SALIDAS |
| `src/components/admin/events/EventCompletedRegistrationsManager.tsx` | La pestaña administrativa |

Pruebas: `npm run test:completed` (178 casos de criterio) y
`npm run test:completed:path` (107, el CAMINO del servidor con la base, el correo
y el S3 sustituidos). **Ninguna necesita base, credenciales ni red.**

**Reglas durables:**

- **⚠️ TABLA PROPIA (`EventCompletedRegistration`), NO una columna de origen en
  `EventRegistration`.** Con una columna, cada consulta existente del módulo
  —tablero, cupo, panel del asistente, `attachOrphanRegistrations`, el webhook
  de Stripe— sería un punto donde mezclar en silencio, que es exactamente lo
  que el pedido prohíbe. Con tabla propia la separación es estructural y los
  puntos de contacto son EXPLÍCITOS: los duplicados y la acreditación. La
  auditoría y los correos reutilizan `EventRegistrationHistory` y
  `EventRegistrationMessage` (por `registrationId`, sin FK; los ids son UUID).
  `registrationSource` existe igual — la fuente se DICE, no se deduce de la
  tabla.
- **ENVIAR NO CONFIRMA NADA.** El registro nace `submitted` («Pendiente de
  validación»); valida el Equipo de Registro mirando el comprobante. El insert
  no acepta otro estado (lo fija una prueba) y sólo `validated` y
  `payment_confirmed` se pueden acreditar.
- **⚠️ LA URL SE RESUELVE POR CONFIGURACIÓN Y LA SIEMBRA ES PEREZOSA.** El slug
  vive en `EventEdition.settings.completedForm.slug` y la ruta de App.tsx monta
  el MISMO componente, que deriva el slug de su propia ruta. Como un despliegue
  no escribe en la base (2026-07-13), la semilla (`COMPLETED_FORM_SEEDS`) ata
  el slug pedido a su evento AL LEER, como `bindLegacyEdition`: sólo si lo
  identifica SIN AMBIGÜEDAD, y jamás pisa una configuración con slug propio.
  Otro evento futuro = configurar su slug en la pestaña + una línea de `<Route>`.
- **⚠️ EL SLUG ES ÚNICO EN LA PLATAFORMA y clonar una edición NO lo clona**
  (`cloneEdition` lo vacía y apaga el formulario): dos eventos peleando la
  misma URL harían que uno se quede con las visitas del otro en silencio. Las
  rutas del sitio están reservadas (`RESERVED_SLUGS`).
- **⚠️ `saveEdition` PARTE DE LO GUARDADO** (`...current.settings`). Antes
  reconstruía `settings` desde cero y guardar la pestaña «Edición» habría
  borrado `completedForm` (y el `rotaryCatalog` propio de una edición) sin que
  nada avisara. Al agregar una clave a `settings`, no confiar en que cada
  pantalla la conserve: la conserva el spread.
- **EL COMPROBANTE SUBE DIRECTO A S3 CON URL PREFIRMADA** — el cuerpo de una
  función se corta en ~4,5 MB y el archivo admite 10 (la lección de v4.700). Va
  al prefijo propio `private/event-receipts/{eventId}/`, sin lectura pública:
  el panel lo abre con un enlace firmado de 5 minutos (patrón desembolsos). Al
  enviar, el servidor comprueba el OBJETO REAL (existencia, prefijo de SU
  evento, peso): lo declarado al prefirmar no obliga a nada. La clave de S3 NO
  viaja al navegador — sólo `hasReceipt` y el nombre.
- **LOS DUPLICADOS SE MARCAN Y SE RELACIONAN, NUNCA SE BORRAN.** Antes de crear
  el registro se busca el mismo documento o correo entre las inscripciones
  normales Y las completadas del evento; la coincidencia va en `flags`, la
  inscripción en línea queda en `linkedRegistrationId`, la ficha reconsulta EN
  VIVO al abrirse, y la respuesta pública NO expone nada de esto: la alerta es
  del panel.
- **Pedir corrección o rechazar EXIGE el motivo** (400 sin él): es lo que le
  llega al participante y lo que queda en la auditoría. Todo cambio de estado,
  edición (con valores anterior y nuevo), reenvío y check-in deja historial con
  quién y cuándo.
- **La acreditación consume los validados por una clave ADITIVA** (`completed`
  en `/admin/checkin/lookup`): la lista de siempre no cambia y un navegador con
  el bundle anterior simplemente no los pinta. El check-in vive en su propio
  endpoint (`/admin/completed/:id/checkin`) y un `submitted` no se acredita.
- **El formulario es de estructura FIJA (contrato del pedido) y textos
  configurables**: título, intro, imagen de cabecera (con las DOS vías de
  v4.700), período rotario del cargo, prefijo del código y mensaje. El distrito
  y el club usan el MISMO catálogo curado (`rotaryCatalogFor`) con «Mi club no
  está en la lista», y sólo se rechaza el club que figura en OTRO distrito
  (v4.706). Distrito y club dejan de ser obligatorios con «No pertenezco
  actualmente a un Club Rotario» (`requiredIf`).
- **⚠️ LAS COLUMNAS DEL LISTADO SE DERIVAN DEL ESQUEMA** (v4.964,
  `columnasDelFormulario` sobre el `form` que `/config` ya devolvía): un campo
  nuevo en el formulario aparece solo como columna, sin una segunda lista que
  se quede atrás en silencio — la misma regla que los destinos del mapeo de la
  importación. Sólo se excluyen el nombre y el apellido, que SON la columna
  «Participante», y el comprobante, que es un archivo y tiene la suya.
- **⚠️ `w-full` EN UNA TABLA ANULA `overflow-x-auto`**, y por eso el listado
  nunca se pudo desplazar: comprime las columnas hasta el ancho del contenedor,
  así que por muchas que sean no desbordan y no hay nada que desplazar. La
  tabla mide su CONTENIDO (`min-w-max`) y el contenedor desborda. La barra se
  pinta SIEMPRE (`.scroll-x-visible`, la opuesta de `.no-scrollbar`): en macOS
  el sistema la esconde hasta que algo se mueve, así que una tabla ancha no
  parece desplazable y no se intenta.
- **La identidad queda FIJA a la izquierda** (`sticky left-0`) y la fila lleva
  `group` para que la celda pegada siga el hover — sin eso, la celda fija se
  queda blanca mientras el resto de la fila se tiñe. En modo selección NO se
  fija: la casilla ocupa ese sitio, y dos columnas pegadas exigen calcular
  desplazamientos y se rompen solas.
- **KPIs sin país a propósito**: el formulario de referencia no pregunta el
  país y no se inventa una columna para un dato que no se pide. Los ejes son
  estado, método de pago, distrito, club, duplicados y acreditados.
- **Limitación declarada**: el endpoint público que prefirma la subida no tiene
  freno por IP —como el resto de los formularios públicos—; los objetos que
  ningún envío reclama se limpian con una regla de ciclo de vida sobre el
  prefijo.
- **⚠️ LA CONFIRMACIÓN POR CORREO CONFIRMA EL FORMULARIO, NO EL PAGO** (v4.945,
  evento `FORM_COMPLETED`). Sale automática tras guardar el registro y asignar
  el código —nunca antes de la persistencia—, con la plantilla del EVENTO
  (`buildCompletedEmail`, PURA en el spec): la cabecera es la MISMA
  `headerImageUrl` configurada (se consulta al enviar, no se copia), el código
  va SIEMPRE en su propio bloque aunque el cuerpo editable no lo nombre
  (exactitud por construcción), y el pie usa el logotipo REAL del sitio
  organizador o texto — jamás un emblema dibujado. Asunto y cuerpo son
  configurables con variables de catálogo CERRADO ({{nombre_participante}},
  {{codigo_registro}}, {{nombre_evento}}, {{fechas_evento}}, {{lugar_evento}});
  una variable desconocida queda LITERAL. Si algún día se notifica la
  validación del pago, es OTRA plantilla con OTRO disparador — no reutilizar
  este.
- **⚠️ `sendPlatformEmail` NUNCA LANZA: contesta `{ success, messageId }` o
  `{ success: false, error }`.** La v4.943 esperaba una excepción y registraba
  como «enviado» un correo que el proveedor rechazó — el fallo era invisible y
  la pantalla afirmaba lo contrario (la misma clase de defecto que v4.942).
  TODO envío de este módulo comprueba `success`; el doble de las pruebas
  devuelve LA MISMA FORMA que el servicio real (lección v4.901) — un stub que
  lanzara dejaría este defecto en verde. El `messageId` del proveedor se
  guarda en `EventRegistrationMessage."providerId"` (columna nueva: su ADD
  COLUMN está ENUMERADO en el atajo del ensure — la trampa de v4.908, fijada
  por una prueba).
- **El registro y el correo están DESACOPLADOS, y el envío automático es
  idempotente.** Un correo que no sale jamás revierte una inscripción
  guardada: queda `failed` con el motivo TEXTUAL del proveedor, visible en la
  ficha («Error al enviar confirmación») junto a «Reenviar confirmación» — el
  reenvío queda en el historial con quién lo pidió. El candado
  (`hasSentMessage`) sólo frena el disparo AUTOMÁTICO: el reenvío manual lo
  saltea a propósito. Vista previa y correo de prueba corren por LA MISMA
  plantilla del envío real (regla de v4.857) y aceptan lo que está EN PANTALLA
  sin guardar; la prueba sale marcada «[Prueba]» y no toca ningún registro.
  `notifyEnabled` se normaliza con `!== false`: una config guardada antes del
  interruptor no puede apagar un correo que ya salía. Desde v4.947 la cabecera
  va SEPARADA de la tarjeta del cuerpo —mismo aire arriba y abajo; pegada se
  leía como un logo montado sobre el texto— y el pie usa el logotipo del
  ENCABEZADO del sitio (`Club.logo`, con `footerLogo` de respaldo): pedido
  expreso del cliente con el correo real delante, fijado por prueba a la
  inversa.
- **⚠️ LA LECTURA PÚBLICA NO DEPENDE DEL ENSURE** (v4.944, del reporte con
  captura el día del estreno: «No se pudo cargar el formulario»). Con la tabla
  nueva en `OWNED_TABLES`, el atajo de `alreadyApplied` falló por primera vez
  en meses y la ráfaga completa del DDL volvió a correr en el arranque en frío
  tras el despliegue — y un tropiezo ahí (la base despertando, el
  `connectionTimeoutMillis` de 2 s) tumbaba un GET que sólo lee `EventEdition`
  y `CalendarEvent`, tablas de v4.648. El ensure de la resolución por slug y el
  de `requireForm` van en `try` con aviso: si de verdad falta una tabla, la
  consulta siguiente lo dice con su motivo, que es más específico. Los tres 500
  públicos llevan además el motivo TEXTUAL en `detail` (patrón del proxy de
  imágenes, v4.912) — sin él, la captura del reporte no distinguía un esquema
  roto de una base caída ni de una semilla sin evento—; y el navegador
  reintenta UNA vez ante red o 5xx (un bucle sería peor: la lección de
  v4.791). La semilla también AVISA con cero candidatos: «el título del evento
  no coincide» era invisible. Verificado a la inversa: sin la defensa, el
  grupo 0 de `test:completed:path` reproduce el cuerpo exacto del reporte.
- **⚠️ NINGÚN `fetch` DEL FORMULARIO PÚBLICO LLAMA `.json()` A CIEGAS**
  (v4.946, del reporte con captura: «Unexpected token '<', "<!DOCTYPE"…» al
  subir el comprobante). Una respuesta HTML —el finalhandler de Express, una
  página de error de la plataforma, el propio documento de la SPA— rompe el
  parseo y el error resultante no nombra NINGUNA capa. Toda respuesta se lee
  como texto (`leerJson`) y la que no es JSON se DICE con su estado HTTP, su
  `content-type` y un fragmento del cuerpo (`describirNoJson`): la próxima
  captura es un diagnóstico, no un misterio. La prefirma del comprobante
  reintenta UNA vez ante HTML o 5xx (la lección de v4.791: un bucle sería
  peor), y el fallo del `PUT` a S3 dice el estado HTTP del almacenamiento —
  son dos saltos distintos y se corrigen en sitios distintos. El POST exacto
  reproducido en local contra el `api/index.js` completo responde 200 JSON:
  la causa más probable fue una página de error transitoria de la plataforma
  tras el despliegue de v4.945 (el `ADD COLUMN` de `providerId` volvió a
  invalidar el atajo del ensure → ráfaga DDL en el arranque en frío).

### La rama del formulario: socio o invitado (v4.958)

El vínculo con el club —última pregunta del paso 1— decide el paso siguiente:
al socio se le pregunta su CARGO; al invitado, qué CLASE de invitado es
(`GUEST_TYPE_OPTIONS`, cuatro opciones, radio). Nunca los dos, nunca ninguno.

- **⚠️ EL ESQUEMA DECLARA CINCO PASOS Y SE RECORREN CUATRO.** `cargo` e
  `invitado` llevan `showIf` a nivel de PASO y el navegador filtra
  (`steps.filter(isCompletedFieldVisible)`); el servidor sigue validando por
  CAMPO, así que **cada rama repite su condición en sus campos**: el paso es lo
  que se pinta, el campo es lo que se exige. Sin la condición en `clubRole`, a
  un invitado se le seguiría exigiendo un cargo que no ve.
- **La condición del cargo es `notIn: ['invitado']`, no `in: ['socio_activo']`**,
  y no es un capricho: con la respuesta en blanco —como abre el formulario—
  tiene que haber UNA rama visible, o el contador diría «Paso 1 de 3» y saltaría
  a «de 4» al contestar.
- **El filtro de pasos va en UN solo sitio** (el `useMemo` de `steps`), porque
  son CUATRO los consumidores de esa lista: el paso actual, el contador, el
  botón de Siguiente y el salto al primer paso con error que devuelve el
  servidor. Filtrado sólo en el render, los otros tres contarían pasos que
  nadie recorre.
- **⚠️ «No pertenezco actualmente a un Club Rotario» SE RETIRÓ del catálogo**
  (pedido del cliente: el evento es del Distrito y sólo caben socio o
  invitado). Retirar una opción es dejar de OFRECERLA, no dejar de entenderla:
  `RETIRED_MEMBERSHIP_LABELS` conserva su rótulo y viaja al panel aparte del
  catálogo ofrecible, o la ficha de un registro viejo pintaría la clave cruda
  `sin_club` (regla v4.708). Y con ella se fue el `requiredIf` de distrito y
  club, que había quedado sin condición posible — un `||` muerto (v4.694).
- **⚠️ EL TIPO DE INVITADO PASÓ DE TEXTO LIBRE A CATÁLOGO CERRADO, y eso NO
  puede costarle la importación a nadie.** v4.951 lo abrió como texto porque
  sólo se conocía una respuesta del sistema anterior; ahora el cliente entregó
  la lista completa. En `assembleRow`, el rótulo histórico se casa con su clave
  y SE ANOTA; lo que no case —o lo que traiga una fila cuyo vínculo NO es
  invitado, que es una contradicción del archivo— se conserva en `extra` con su
  nota, en vez de rechazar la fila entera. Es la lección de v4.706 en su forma
  aplicable: la lista no le cierra la puerta a un dato histórico.
- **El rótulo del campo se conserva LETRA POR LETRA** («Sí es invitado,
  seleccione una opción», con la tilde del formulario de referencia): es lo que
  hace que la columna del archivo histórico se mapee sola (v4.951).
- **Un catálogo cerrado se corrige ELIGIENDO, no tecleando su clave.** El
  asistente de importación pinta un `<select>` cuando el destino declara
  opciones — antes obligaba a escribir `conyuge_socio_activo` a mano.
- Verificado a la inversa: sin el `showIf` del paso, el invitado ve el paso del
  cargo; sin los rótulos retirados, `sin_club` sale crudo; sin el respaldo del
  importador, un tipo de invitado desconocido bloquea la fila.

### Acciones en bloque sobre el listado (v4.952)

«Seleccionar» en la barra del listado COLROTARIOS: casillas por fila (con el
NOMBRE en la etiqueta accesible — v4.740), «todos los visibles», y tres
acciones sobre la selección: cambiar estado, editar UN campo compartido y
eliminar. Rutas literales `/admin/completed/bulk-status|bulk-edit|bulk-delete`
ANTES de `/admin/completed/:id`.

- **La selección guarda las filas ENTERAS** (v4.886): sobrevive a filtros y
  páginas, el contador avisa cuando incluye registros fuera de la vista, y la
  confirmación NOMBRA a los primeros elegidos — dice QUÉ va a pasar, no
  «¿estás seguro?».
- **⚠️ LA IDENTIDAD NO SE EDITA EN BLOQUE** (`BULK_EDITABLE` en el
  controlador): nombre, documento, correo, teléfono y emergencia quedan fuera
  — el mismo valor en veinte personas destruye datos. Dos puertas: la
  pantalla no los ofrece y el SERVIDOR los rechaza (v4.868). Lo que sí se
  escribe en bloque es lo COMPARTIDO (distrito, club, vínculo, cargo,
  guestType, EPS, alergia, método de pago, notas internas), y la edición
  actualiza la columna Y la foto de `answers` (regla de `update`).
- **⚠️ EL ENVÍO EN BLOQUE DE LA CONFIRMACIÓN CORRE POR
  `sendCompletedConfirmation`** (v4.965, `POST /admin/completed/bulk-notify`),
  la MISMA del envío automático y del reenvío de a uno. Un segundo camino de
  correo se separa en silencio y dejaría estos envíos fuera del historial del
  participante, que es donde alguien los va a buscar cuando digan que no
  llegó. Va SIN `auto`: el candado de «ya se le envió» frena el disparo
  automático (v4.945), no un acto que una persona pide — quien no quiera
  repetirle a nadie usa `soloFaltantes`, que es el valor por defecto de la
  pantalla porque repetirle a doscientos por un segundo clic no se deshace.
- **⚠️ SE ENVÍA POR TANDAS Y SE DEVUELVE LO QUE FALTA** (`NOTIFY_BUDGET_MS`,
  `pendientes`). Cada correo es una llamada al proveedor y doscientos setenta
  no entran en una invocación (300 s en `vercel.json`): se atiende lo que cabe
  y el navegador vuelve a pedir hasta terminar, con tope de vueltas y salida
  si una tanda no avanza. Cortar en silencio se leería como «ya salieron
  todos». Mismo patrón que el commit de la importación y el barrido de Reels.
- **`sendPlatformEmail` NUNCA lanza** (v4.901): un rechazo del proveedor
  cuenta como FALLO y su motivo viaja TEXTUAL al desglose. Darlo por enviado
  es el defecto que v4.945 corrigió, y una prueba lo fija a la inversa.
- **⚠️ UN REGISTRO ACREDITADO NO SE BORRA EN BLOQUE**: se conserva y se
  NOMBRA con su motivo (`ya_acreditada`) — la acreditación registra un hecho
  físico; para eliminarlo se anula primero su acreditación en la ficha, a
  propósito. El comprobante de S3 se quita ANTES que la fila
  (`deleteReceiptObject`, mejor esfuerzo — regla v4.740) y el rastro queda en
  `EventRegistrationHistory` (`completed_deleted`), que sobrevive a la fila.
- **Confirmación explícita (`confirm: true` → 428)**, tope `BULK_MAX` (500),
  NO atómico con desenlace por fila (`cambiada`/`editada`/`borrada`/
  `sin_cambio`/`conservada`/`no_existe`/`error`) y el resultado se DESGLOSA
  completo en la pantalla (v4.886). Corrección/rechazo en bloque exige el
  MOTIVO, como el cambio de a uno. Cada acto deja historial. El gate es el
  mismo del panel; una fila de otro evento «no existe» para quien pregunta.
- Verificado a la inversa: sin la guardia del acreditado o sin la
  confirmación, las pruebas del camino fallan.

### Seleccionar TODO lo que coincide con el filtro (v4.1092)

Pedido con el listado delante —285 registros, «50 seleccionados»—: poder
eliminarlos todos de una vez y no por grupos de 50. Junto al contador aparece
**«Seleccionar los N que coinciden con el filtro»**
(`GET /admin/completed/select-all`), y las acciones en bloque se mandan en
TANDAS. `BULK_MAX`, `SELECT_ALL_MAX` y `chunkIds` viven en el spec puro, con su
espejo mínimo en `src/lib/completedRegistrationSpec.ts`.

- **⚠️ EL TOPE NO ERA EL DEL SERVIDOR: ERA LA PÁGINA.** `bulkDelete` aceptaba
  500 desde v4.952 y la selección sólo podía marcar lo VISIBLE
  (`toggleVisible` sobre `rows`, `PAGE_SIZE = 50`), así que vaciar un listado
  era hacerlo a mano seis veces. **Al reportarse «sólo puedo de a 50», mirar
  qué conjunto puede marcar la pantalla antes de subir el tope del endpoint.**
- **⚠️ LOS IDS LOS RESUELVE EL SERVIDOR CON `buildFilters`, el MISMO del
  listado.** Con un segundo armado, «seleccionar todo» tomaría un conjunto
  distinto del que se está mirando y se eliminaría lo que nadie vio. Lo fija
  una prueba del CAMINO, verificada a la inversa.
- **LA CASILLA DE LA CABECERA SIGUE MARCANDO SÓLO LO VISIBLE.** Es lo que su
  rótulo promete; ampliarla a todo el filtro convertiría un gesto conocido en
  un borrado masivo por sorpresa. Son dos gestos y el nuevo DICE su número.
- **⚠️ SE DEVUELVEN FILAS MÍNIMAS** —id, código, nombre, correo, estado y si
  está acreditado—, no la fila entera: `answers` por cada uno de 285 son
  megabytes para escribir un nombre en la confirmación. Y no se resuelve
  paginando el listado: serían seis viajes para lo que hace uno.
- **LO QUE NO ENTRA EN `SELECT_ALL_MAX` NO SE RECORTA EN SILENCIO** (v4.886).
  Se pide UNA fila de más para saber que hay más, se anuncia `truncated`, y la
  pantalla dice cuántos quedaron fuera y la SALIDA: acotar el filtro y repetir.
  Un recorte mudo haría creer que se eliminó todo cuando no.
- **⚠️ `BULK_MAX` ESTÁ EN EL SPEC Y SE COMPARA POR SALIDAS.** Estaba escrito a
  mano en el controlador; con una copia en la pantalla, una selección de 600 se
  trocearía en tandas que el servidor rechaza — el mismo «máximo N» por otra
  puerta. El espejo NO trae el criterio de quién puede seleccionar qué: eso lo
  decide el servidor, que acota por evento en el `WHERE`.
- **EL TROCEO ES PURO Y NO PIERDE IDS.** `chunkIds` deduplica y una prueba
  comprueba que la suma de las tandas sea la selección entera; un tamaño
  imposible cae al tope declarado en vez de dejar el bucle girando.
- **NINGUNA TANDA ES ATÓMICA Y SE SIGUE DICIENDO.** Los desenlaces se ACUMULAN
  entre tandas y el resumen se escribe contra el total SELECCIONADO, no contra
  la última tanda. El avance se ve (`bulkProgreso`), como en el envío de
  confirmaciones: una selección grande deja la pantalla quieta minutos.
- **⚠️ LOS ACREDITADOS SE DICEN ANTES DE CONFIRMAR, no después.** `bulkDelete`
  los conserva desde v4.952; con 285 marcados de una vez, «se eliminaron 254 de
  285» sin haberlo advertido se lee como que algo falló.
- **⚠️ EL DOBLE DE LA BASE APRENDIÓ A LEER EL `WHERE`.** Sólo honraba el
  `"eventId" = $1` y pasaba de largo cualquier otro filtro: la comprobación de
  «el filtro se respeta» habría quedado en verde sobre un controlador que lo
  ignorara. `whereMatcher` interpreta las formas que `buildFilters` ESCRIBE y
  **lanza ante lo que no reconoce** — un doble no puede dar por bueno lo que no
  entiende (v4.896). Y la rama de la búsqueda de acreditación se ANCLÓ: sin
  anclar interceptaba cualquier consulta con `status = ANY($2)` y devolvía
  vacío, culpando al módulo.
- **⚠️ DOS COMPROBACIONES FIJADAS A LA FORMA LITERAL SE ROMPIERON.** Una exigía
  `useState<Map<string, CompletedRow>>` —y la selección pasó a guardar filas
  mínimas— y otra `as const` en la barra de pestañas, que v4.1091 tipó como
  `as EventTab[]` y llevaba una versión en rojo con el criterio intacto. Se
  reescribieron sobre la INVARIANTE: que la selección guarde FILAS y que la
  barra empiece por esas pestañas (la lección de v4.984, pagada otra vez).

**Pendientes conocidos:** `SELECT_ALL_MAX` (5.000) es un tope de una selección,
no del evento: un listado mayor se elimina acotando el filtro y repitiendo, y se
dice. Y la barra de selección **no se comprueba en un navegador** — al tocar su
maquetación, mirarla (la lección de v4.717).

### El motor de importación de inscripciones históricas (v4.950)

Registro → **Importar inscripciones** (junto a Acreditación): migra al módulo
los registros capturados en el sistema anterior, desde un CSV o pegando desde
Excel. Criterio puro en `completedImportSpec.js`, I/O en
`completedImportStore.js`, endpoints en el controlador del panel
(`/admin/completed/import/*`, literales ANTES de `/admin/completed/:id`),
asistente en `EventImportWizard.tsx`, lotes en `EventImportBatch` (runtime,
fuera de Prisma, en la lista del guardián).

- **⚠️ UN REGISTRO IMPORTADO ES UNA FILA NORMAL de
  `EventCompletedRegistration`** con `registrationSource: 'historical_import'`
  + `importBatchId` + `importMeta` (archivo, fila origen, quién, URL del
  comprobante del sistema anterior, columnas extra conservadas). NO existe un
  segundo universo de «inscripciones importadas»: acreditación, exportes,
  filtros y estadísticas lo ven como a cualquier otro, y el origen SE DICE
  (insignia «Importación histórica», `SOURCE_LABELS` en los dos espejos).
- **Los destinos del mapeo se DERIVAN de `buildCompletedSchema`** — la misma
  fuente del formulario público: un campo nuevo aparece solo como destino, sin
  segunda lista. Y **la validación de cada fila es `validateCompletedAnswers`**,
  la misma del formulario — pero su veredicto se REPARTE (v4.960, abajo): en
  importación lo que falta AVISA. **La promesa se
  cobró en v4.951**: la columna del archivo histórico «Sí es invitado,
  seleccione una opción:» no tenía destino porque la pregunta no existía en el
  formulario — se agregó como campo del ESQUEMA (`guestType`, paso 2, texto
  libre opcional, `showIf` invitado) y el mapeo lo ofreció solo, sin tocar el
  importador. Un catálogo cerrado habría inventado opciones: del sistema
  anterior sólo se conoce «Soy cónyuge de socio activo». La columna nueva está
  ENUMERADA en `OWNED_COMPLETED_COLUMNS` (trampa v4.908) y la conocen los tres
  caminos de escritura: el insert público (sólo si el vínculo es invitado), el
  importado y «completar».
- **⚠️ NINGÚN CAMPO ES OBLIGATORIO PARA IMPORTAR** (v4.960,
  `splitImportFindings`). **Supersede la regla de v4.950 «importar no afloja
  ningún criterio»**, que nació de una intuición correcta —el formulario y la
  importación no pueden tener dos verdades sobre un registro— y cuya
  consecuencia práctica fue la contraria de la buscada: el archivo real del
  Distrito trae 273 personas inscritas y pagadas, y **165 de ellas no
  terminaron de llenar el formulario del sistema anterior**; con el criterio
  del formulario aplicado tal cual, esas 165 quedaban fuera del evento al que
  van a asistir. Es el patrón que este archivo documenta una y otra vez: un
  control demasiado estricto no falla ruidosamente, entrega otra cosa —media
  lista— y la presenta como resultado. **La distinción es de MOMENTO, no de
  rigor**: el formulario público y la carga a mano siguen exigiendo sus campos
  —ahí HAY alguien que puede llenarlos, y una prueba lo fija—; una migración
  registra lo que YA ocurrió, y un dato que nadie escribió el año pasado no se
  puede exigir ahora. Lo que falta va a `avisos`, se pinta en ámbar con su
  motivo, la fila se importa y **lo que faltaba queda escrito en
  `importMeta.avisos`** — sin eso, «¿por qué este registro no tiene correo?»
  no se puede contestar dentro de un año.
- **⚠️ LO ÚNICO QUE SIGUE BLOQUEANDO ES QUE LA FILA NO SEA DE NADIE**
  (`identifiesPerson`: nombre, apellido, documento o correo). Sin ninguno de
  los cuatro no hay a quién acreditar, con quién cotejar un duplicado ni a
  quién escribirle: es un renglón suelto del archivo, no un inscrito — y es lo
  único que no se puede completar después. Es además la red que atrapa un
  archivo mapeado con las columnas corridas, donde lo caro sería crear 273
  registros fantasma con la confirmación ya dada.
- **LA PROTECCIÓN DE DUPLICADOS NO SE AFLOJÓ.** El pedido era sobre campos
  vacíos, no sobre duplicados: «confirmado» y «posible» siguen sin importarse
  solos y su decisión por defecto sigue siendo omitir. Lo fija una prueba, para
  que aflojar una puerta no se lleve la de al lado.
- **Un valor que el catálogo CERRADO no reconoce tampoco cuesta la fila.** Se
  conserva como dato adicional y se ANOTA, en vez de guardarse crudo en su
  columna —donde la ficha lo pintaría como una clave ilegible, la lección de
  `sin_club` (v4.958)—. Es la técnica del tipo de invitado (v4.951),
  generalizada a vínculo, cargo y método de pago.
- **⚠️ EL ARCHIVO SE PARSEA ENTERO, NO LÍNEA POR LÍNEA** (v4.960,
  `parseDelimitedText`). Un salto de línea DENTRO de una celda entrecomillada
  es parte del dato —una observación de dos renglones—, y partir el texto por
  saltos ANTES de mirar las comillas convierte ese único registro en dos o tres
  filas inventadas que arrancan a media frase y caen en la columna equivocada:
  es lo que hacía que un archivo de **273 registros se detectara como 333**. El
  respaldo por líneas se conserva para un caso concreto y se elige solo: si el
  archivo cierra con una comilla ABIERTA no está entrecomillado al estilo CSV
  —una comilla suelta en un texto libre— y seguir así fundiría todo el resto en
  una sola celda. Los dos caminos cuentan las filas vacías igual, o reportarían
  cifras distintas sobre el mismo archivo.
- **⚠️ El parseo vive en el SERVIDOR y es UNO** (`parseImportText`): el
  navegador manda el TEXTO y pinta lo que el servidor contesta — inspección,
  preflight y commit re-parsean con el mismo criterio, así que lo que se
  importa es exactamente lo que se previsualizó. Las tres rutas llevan su
  propio `express.json({ limit: '10mb' })`.
- **La normalización se ANOTA, nunca corrige en silencio** (`notes` por fila):
  «Distrito 4281»/«D4281»→4281 (`(?<!\d)(\d{4})(?!\d)` — `\b` no corta
  entre la D y el 4), «Consignación»→transferencia, y un cargo sin equivalente
  NO se descarta: cae a «Otro cargo» con el texto original. El club que no
  coincide exacto recibe `clubSuggestion` («Revisión sugerida»), no un
  descarte — descartar por una diferencia de escritura es lo que el pedido
  prohíbe.
- **⚠️ NINGÚN DUPLICADO SE CREA NI SE SOBRESCRIBE EN SILENCIO.** Documento o
  correo CONFIRMAN; teléfono o nombre completo sólo SUGIEREN; el propio
  archivo también cuenta (filas repetidas). «Completar el registro existente»
  rellena SÓLO columnas vacías —el `WHERE` lo exige (`IS NULL OR = ''`), no la
  pantalla— y jamás toca una inscripción EN LÍNEA. Una fila sin persona nunca
  se importa, pida lo que pida la decisión.
- **⚠️ QUÉ SE HACE CON UN DUPLICADO ES UNA DECISIÓN DEL EVENTO, y la del
  Distrito es IMPORTARLO** (v4.962, `duplicatePolicy`, por defecto
  `importar`). **Supersede «la decisión por defecto de todo duplicado es
  OMITIR»** de v4.950, por pedido expreso y con el argumento en contra
  delante: *«no importa que se importen datos o registros duplicados, ya los
  de logística del evento se encargarán de eliminarlos; permitamos que importe
  tal cual lo que recibimos en el formulario anterior»*. El archivo del
  sistema anterior se migra COMPLETO y la depuración es un trabajo humano
  posterior, que es como el equipo trabaja. **Lo que NO se aflojó —y es lo que
  hace defendible el cambio— es la mitad que da el nombre a la regla**: el
  duplicado se sigue DETECTANDO, se crea MARCADO (`flags.hasDuplicates` con
  sus coincidencias y el motivo del cotejo), y cuántos se van a crear se DICE
  antes de confirmar. En silencio sería crearlo sin marca; esto es crearlo con
  ella. La política es un control VISIBLE del paso 3 y «Dejarlos fuera» sigue
  disponible.
- **⚠️ CAMBIAR LA POLÍTICA LA APLICA EN EL ACTO, y son DOS mitades** (v4.963).
  v4.962 la escribía en el estado y esperaba a que alguien pulsara
  «Revalidar» —un comentario prometiendo algo que el código no hacía—; y aun
  pulsándolo, `decisiones[r.n] || r.defaultDecision` conservaba lo elegido
  antes y anulaba la política nueva, así que el control se veía roto. La
  política es una decisión GLOBAL y tiene que ganarle a lo elegido fila por
  fila (`reiniciarDecisiones`); una revalidación normal —la de después de
  corregir campos— sigue conservándolo, que es lo correcto ahí.
- **⚠️ EL NÚMERO GRANDE DEL PASO 3 ES EL QUE SE VA A CREAR** (`importables`),
  no la clasificación `listas`. Aquélla excluye los duplicados aunque se vayan
  a importar: sobre un archivo de 273 con 29 duplicados enseñaba **244** y se
  leía como «sólo entran 244». Es la misma clase de defecto que «273 filas
  detectadas» leído como registros a crear (v4.961): en el sitio donde se
  busca la respuesta tiene que estar la respuesta, no una cifra vecina.
- **Un duplicado CONFIRMADO admite las tres decisiones** (`nuevo`, `omitir`,
  `completar`), no dos. Sin `nuevo` en su lista, la decisión por defecto de la
  política del evento no estaría entre sus opciones y el desplegable de esa
  fila saldría en blanco.
- **`importables` sigue a la política; la CLASIFICACIÓN no.** Cuántos
  duplicados hay es un hecho del archivo y no cambia porque se decida
  importarlos; cuántos registros se van a crear sí. Mezclarlos haría que el
  panel dijera que no hay duplicados sólo porque se van a importar.
- **El commit exige `confirm: true` (428)**, el lote se INSERTA antes de la
  primera fila (v4.669), NO es atómico y se dice (v4.886): cada fila reporta su
  desenlace con su motivo. El estado inicial del lote está ACOTADO
  (`IMPORT_INITIAL_STATUSES`: submitted/validated/needs_correction; por defecto
  «Pendiente de validación» — no se asume que lo histórico está validado). El
  insert del formulario público NO cambió: sigue fijando `submitted` + origen
  manual, y lo fija una prueba.
- **⚠️ NO SALE NINGÚN CORREO por una importación histórica.** La confirmación
  automática es del `submitCompleted` público; avisarle a doscientas personas
  que «su inscripción llegó» meses después sería falso. La confirmación del
  asistente lo dice.
- **La reversión sólo borra filas INTACTAS** — en su estado inicial, sin
  acreditar y sin comunicaciones; lo que cambió se conserva y se NOMBRA con su
  motivo. Exige `confirm: true`, un lote revertido responde 409 al segundo
  intento, y todo queda en `EventRegistrationHistory` (`imported` /
  `import_filled`).
- **La trampa de v4.908, pagada otra vez en preventa**: `importBatchId` e
  `importMeta` van con `ADD COLUMN IF NOT EXISTS` **y enumeradas en
  `OWNED_COMPLETED_COLUMNS`** del atajo del ensure — verificado a la inversa.
  El comprobante del sistema anterior se conserva como URL de REFERENCIA en
  `importMeta` (no se descarga a S3: traer archivos remotos desde una función
  es SSRF y presupuesto que este motor no necesita para cumplir su promesa).
- **⚠️ LA FECHA DEL REGISTRO SALE DEL ARCHIVO** (v4.959, destino `submittedAt`
  en `EXTRA_DESTINATIONS`). La «Marca temporal» del formulario anterior NO es
  una pregunta del formulario —nadie escribe la suya— así que vive con la URL
  del comprobante y no en el esquema. Sin ella, doscientos registros
  históricos entraban todos con la fecha de la importación.
- **Dos cosas que NO se adivinan en silencio, y por eso las dos se ANOTAN en
  la fila**: (1) el ORDEN — «4/06/26» se lee día/mes, que es como escribe el
  formulario de referencia, y con día y mes ≤ 12 la lectura es AMBIGUA por
  construcción, así que la nota escribe la fecha en letras («4 de junio de
  2026, 14:47») para contrastarla antes de importar; (2) la ZONA — «14:47» es
  hora de PARED de quien llenó el formulario y se interpreta en la zona de la
  EDICIÓN (`edition.timezone`), no en la del servidor, que corre en UTC:
  guardarla como UTC la correría cinco horas y la ficha mostraría las 9:47.
- **La conversión hora-de-pared → instante se REUTILIZA** (`zonedWallToUtc` de
  `timezone.js`, sin dependencias y a prueba de horario de verano). Escribir
  una segunda daría dos criterios sobre el mismo minuto.
- **⚠️ La alternancia de la expresión regular prueba EN ORDEN**: con
  `(\d{2}|\d{4})`, «2025» casaba «20» y el resto dejaba de ser hora — año
  2020 y hora 00:00, **en silencio**. El año de cuatro cifras va primero.
- **Lo que no se puede leer NO se inventa.** Una marca temporal ilegible,
  imposible (31 de febrero) o futura deja la fila con la fecha de la
  importación y conserva su valor como dato adicional, con su nota. Rellenar
  con «hoy» a la callada sería inventar el dato que se vino a migrar.
- **El filtro «Desde/Hasta» mira la MISMA fecha que pinta la columna**
  (`COALESCE("submittedAt","createdAt")`). Filtrando sólo por `createdAt`, un
  registro importado con su fecha real quedaba fuera del rango en el que se
  ve: el filtro diría una cosa y la tabla otra.
- **El CSV de errores sale con BOM y punto y coma** (regla v4.850): fila,
  campo, valor y problema, para corregir el archivo y volverlo a cargar.
- El gate es el MISMO del panel (`requireEvent`/`assertEventAccess`): un
  administrador de otro sitio recibe 404. Tope defensivo `IMPORT_MAX_ROWS`
  (2000) — miles de filas exigirían una cola, y decirlo es mejor que colgar la
  función.

### PayPal de la plataforma por defecto en las inscripciones — v4.1251

Pedido literal (Distrito 4281): *«el medio de pago de los eventos sea por
defecto el que está conectado de PayPal en las pasarelas de pago, ya que
aparece Stripe y debe ser el PayPal de COLROTARIOS»*.

| Archivo | Qué es |
|---|---|
| `server/lib/eventPaymentMethods.js` | El CRITERIO. **Puro**: qué vías se ofrecen, cuál va por defecto, la referencia `evreg:` y la clave de idempotencia |
| `paymentOptionsFor` / `startPaypalCheckout` / `confirmPaypalCapture` / `captureRegistrationOrder` en `eventRegistrationController.js` | La I/O: opciones, pedido, captura y confirmación |
| `handlePaypalRegistrationEvent` (llamado desde `paypalWebhook`) | El webhook compartido con los aportes |
| `PaymentMethodPicker` en `src/pages/RegistroEvento.tsx` | El selector, con PayPal preseleccionado |

Pruebas: `npm run test:event-payment` (28 casos, **sin base, credenciales ni red**).

**Reglas durables:**

- **PayPal va POR DEFECTO cuando se OFRECE**: credenciales cargadas, activado
  en *Integraciones → Métodos de pago* y capaz de cobrar la moneda (directa o
  convertida con la tasa del día). Es la MISMA cuenta de la plataforma que
  cobra los aportes y la misma decisión (`resolvePaypalCharge`,
  `isMethodOffered('paypal')`): no hay un segundo criterio.
- **La tarjeta (Stripe) queda SIEMPRE como alternativa** y el interruptor de la
  tarjeta en Métodos de pago sigue sin alcanzar a los eventos: apagarlo no
  puede dejar a nadie sin inscribirse. `test:payment-methods` comprueba que el
  controlador sólo consulta el interruptor de PayPal.
- **Pedir PayPal cuando no se puede NO cae en silencio a la tarjeta**: el
  checkout responde 409 `PAYMENT_METHOD_UNAVAILABLE` y la pantalla deja
  elegida la tarjeta. Cobrar por otra vía distinta de la elegida es otro trato.
- **La conversión se DICE antes de salir hacia PayPal** (regla de v4.870):
  PayPal no procesa COP, así que una inscripción en pesos se cobra en la moneda
  de la cuenta (`PAYPAL_CURRENCY`) con la tasa efectiva. Sin tasa, PayPal no se
  ofrece y se cobra con tarjeta. La intención (fila `created` en
  `EventRegistrationPayment`) guarda los tres datos de la conversión.
- **El recargo se guarda EN LA MONEDA COBRADA** (`payload.surcharge`, convertido
  con la misma tasa; el original al lado). La conciliación del evento y el panel
  de ingresos restan el recargo de `amount` en `currency`: un recargo en pesos
  restado de un cobro en dólares es el defecto de v4.845.
- **`custom_id = evreg:<inscripción>`** separa, en el webhook compartido, una
  inscripción de un aporte (los aportes llevan el id del sitio). El webhook las
  despacha ANTES de leer un aporte: si no, se registraría una donación.
- **Aprobar no es cobrar.** Al volver (`?pago=paypal&token=<pedido>`) la
  pantalla llama a `POST /:id/paypal/capture`. Si la persona cierra la pestaña,
  `CHECKOUT.ORDER.APPROVED` captura y `PAYMENT.CAPTURE.COMPLETED` confirma. Las
  vías convergen en `confirmPaypalCapture`, idempotente por el índice único de
  `stripeEventId` (`paypal:<captura>`) y por el UPDATE condicional. Un pedido de
  otra inscripción no confirma ésta (`pedido_ajeno`).
- **Sólo una captura `COMPLETED` confirma.** Una en `PENDING` (retenida por
  PayPal) no ocupa cupo: se confirma cuando llega el webhook.
- **Stripe y PayPal comparten el cierre** (`finalizePaidRegistration`: código,
  cuenta de asistente, historial y correo).
- **Un `expired`/`failed` de Stripe no deshace un pago confirmado**: con dos
  vías, quien abrió la tarjeta, la canceló y pagó por PayPal recibe 24 h
  después el vencimiento de la sesión que no usó. Sólo un reembolso mueve una
  inscripción liquidada.
- **Pendiente, a sabiendas**: los reembolsos de PayPal no llegan por webhook a
  la inscripción (sí los de Stripe). Se reembolsa en PayPal y se marca a mano.

### Necesidades y condiciones: detalle alimentario y talla de camiseta — v4.1257

- `dietaryDetail` se pide SÓLO con `dietary = 'otra'` (`showIf.in`), en todas
  las categorías. Antes era `notIn: ['ninguna']` y aparecía con cualquier
  opción.
- `TSHIRT_FIELD` (`tshirtSize`, XS–2XL, opcional) entra en el paso `needs`
  SÓLO cuando la audiencia es `international`, después de `accessibility` y
  antes de `acceptTerms` (`buildFormSchema`). Vive en `answers` y sale en la
  exportación («Talla de camiseta»).
- Pruebas: grupo «Necesidades y condiciones (v4.1257)» de `npm run test:event-form`.
