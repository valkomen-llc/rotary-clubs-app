<!-- Léelo ANTES de tocar las cuentas de la Feria (gestores de proyecto o asistentes al evento), sus contraseñas o la pestaña «Usuarios». -->

## Usuarios de la Feria — v4.1342

Pedido del comité (2026-11-20): *«Mónica Gaitán (mgaitanr77@gmail.com, FP-J2WJZQ)
no recibe el correo de recuperar contraseña y no recuerda la suya. Necesitamos un
módulo de usuarios para ver los perfiles creados al registrarse en la feria o
postular proyectos, y cambiarles la contraseña si la pierden.»*

### Diagnóstico

- El comité no tenía ninguna pantalla con las cuentas de acceso: sólo el
  listado de postulaciones (que muestra el responsable, no la cuenta).
- **`forgotPassword` del panel del proyecto descartaba el resultado del
  correo** (`sendFairEmail(...).catch(() => {})`): si el proveedor lo
  rechazaba, nadie se enteraba. Ahora deja `console.error` con el motivo. El
  «Olvidé mi contraseña» sigue respondiendo lo mismo exista o no la cuenta
  (no revela correos).

### Qué es

| Pieza | Dónde |
|---|---|
| El criterio, puro: estados de acceso, a quién se le puede asignar clave, qué clave sirve | `server/lib/fairUsersSpec.js` |
| Listado, ficha, asignar contraseña, enlace de restablecimiento, bitácora | `server/controllers/projectFairUsersController.js` |
| Rutas `GET /admin/usuarios`, `GET /admin/usuarios/:realm/:id`, `POST …/password`, `POST …/reset-link` | `server/routes/project-fair.js` (guardia `fairManage` + `withAccess(…, 'manageUsers')`) |
| La pestaña «Usuarios» | `src/components/admin/feria/UsuariosFeria.tsx`, montada en `PostulacionesPagos.tsx` (`?tab=users`) |

Dos clases de cuenta (`realm`), cada una con su tabla y su panel:

| `realm` | Etiqueta | Tabla | Panel |
|---|---|---|---|
| `project` | Gestor de proyecto | `ProjectFairAccount` | `/mi-proyecto` (o `cfg.portal.path`) |
| `attendee` | Asistente al evento | `EventAttendeeAccount` | `/mi-inscripcion` |

Una cuenta es «de la edición» si su proyecto principal, o alguno de su
inscripción (`registrationId`), tiene ese `eventId`; un asistente, si tiene
una `EventRegistration` o `EventCompletedRegistration` de ese evento. Una
cuenta de OTRA edición responde 404 aunque se conozca su id.

**Tabla nueva: `FairUserAccessLog`** (quién hizo qué sobre qué cuenta:
`password_set`, `reset_link`), creada con `CREATE TABLE IF NOT EXISTS` y sin
`ADD COLUMN`. Para un gestor la acción va también a `ProjectFairEvent`
(`account_password_set`, `account_reset_link`).

### Reglas durables

- **Sólo el perfil «admin» de la Feria** (`manageUsers` en
  `ROLE_CAPABILITIES`, `false` en todos los demás). La pestaña no aparece sin
  el permiso, y el servidor lo exige igual.
- **En la base sólo el hash bcrypt.** La contraseña GENERADA vuelve UNA vez en
  la respuesta para copiarla; la escrita por el comité no vuelve (ya la
  conoce). Nunca va a la bitácora ni a un correo: el aviso opcional dice que
  cambió, sin incluirla.
- **Asignar una contraseña anula el enlace de restablecimiento pendiente**
  (`resetToken`/`resetExpiry` a NULL). En un asistente además apaga
  `mustChangePassword`/`tempPasswordExpiresAt` y pasa a `active` una cuenta
  `pending_activation`/`invitation_*`.
- **Cuenta VINCULADA (`linkedRealm`, hash `!`)**: 409 `linked_account`. Su
  contraseña es la de la identidad de origen (v4.692); la ficha ofrece abrir
  esa cuenta. **Cuenta SUSPENDIDA**: 409 `suspended`; cambiar la clave no la
  reactiva.
- **El enlace del comité dura 24 horas** (el de «Olvidé mi contraseña», 2) y
  usa los mismos `purpose` (`reset` / `attendee_reset`) y la misma ruta de
  canje de cada panel, así que sirve una sola vez. ⚠️ El canje de un
  asistente marca su correo como demostrado (`markEmailProven`): si el comité
  manda el enlace por WhatsApp, es el comité quien responde por la identidad.
- **Validación de la clave** (`passwordProblem`): ≥ 8 y ≤ 128 caracteres, sin
  espacios en los extremos, que no sea el correo ni su usuario, nada trivial.
  Sin reglas de «mayúscula y símbolo».
- **Búsqueda sin tildes ni mayúsculas** (`translate(lower(…))` contra el texto
  plegado en JS; los comodines del usuario se escapan). «gaitan» encuentra a
  «Gaitán».
- Las sesiones abiertas antes del cambio siguen vigentes hasta que venzan: el
  token no lleva versión de contraseña (pendiente si algún día hace falta
  «cerrar todas las sesiones»).

### Pruebas

- `npm run test:fair:users` (30, puro, en `prebuild`): criterio e invariantes
  (sólo admin, sólo hash, nada en la bitácora, rutas, pestaña con permiso).
- `npm run test:fair:users:e2e` (37, Postgres local): listado por edición,
  búsqueda sin tildes, permisos, asignar escrita y generada y entrar con
  ellas, la anterior deja de servir, bitácora sin contraseña, enlace de una
  sola vez, vinculada 409, asistente que entra, resultado del correo.
- `npm run test:fair:users:ui` (17, navegador, necesita `dist/assets`): caso
  Mónica de punta a punta en 1280 y 390 px sin desbordes. Ojo: el `sr-only`
  de la cabecera de la tabla es absoluto; el contenedor con `overflow-x-auto`
  lleva `relative` o desborda la página en el teléfono.
