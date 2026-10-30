<!-- Lo nuevo de este tema se escribe AQUÍ, no en CLAUDE.md. -->

## La cuenta del participante en «Completar inscripción» — v4.1267

El formulario COLROTARIOS (`/inscripcion-conferencia-distrital-villavicencio-2027`,
v4.943) guardaba en `EventCompletedRegistration` sin ninguna cuenta. Desde
v4.1267 el participante crea su acceso al final del paso 1 —o entra con la
cuenta que ya tiene— y consulta su inscripción en «Mis eventos»
(`/mi-inscripcion`).

### Diagnóstico (lo que ya existía y se reutiliza)

- **Identidad**: `EventAttendeeAccount` (v4.655), una cuenta POR CORREO, bcrypt,
  token JWT con audiencia `event-attendee-portal`. Puede estar vinculada a otra
  identidad (`linkedRealm`: Gestor de Proyectos o usuario de la plataforma,
  v4.692) y entonces no tiene contraseña propia.
- **Ingreso**: el botón «Iniciar sesión» del encabezado (`/auth/session`,
  `sessionController.resolveSession`) prueba las tres identidades y manda al
  asistente a `/mi-inscripcion`, nunca al panel administrativo. Lleva el freno
  de intentos `loginThrottle` (correo + IP).
- **Recuperación**: «Olvidé mi contraseña» del encabezado consulta las tres
  identidades; la del asistente es `/portal/forgot` → `/portal/reset`.
- **Verificación de correo**: existe, apagada por omisión
  (`EVENT_ATTENDEE_EMAIL_VERIFICATION`).
- **Permisos**: `ATTENDEE_PERMISSIONS` (sólo leer lo propio); `authMiddleware`
  rechaza un token de otra audiencia en el panel administrativo.

No se creó un segundo sistema de autenticación ni otra tabla de usuarios.

### Modelo

`EventCompletedRegistration."accountId"` → `EventAttendeeAccount.id`. Con
`eventId` en la misma fila, una fila lleva **cuenta → evento → inscripción**.
Una cuenta tiene N registros (varias ediciones, o varias inscripciones en línea
y COLROTARIOS). El panel filtra por `accountId` **en el WHERE**; el correo nunca
autoriza nada por sí solo.

| Archivo | Qué hace |
|---|---|
| `completedRegistrationSpec.js` | `ACCOUNT_MODES`, `validateAccessPassword`, `participantStages`, `PARTICIPANT_HISTORY` (puro) |
| `eventAttendeeController.js` | `resolveParticipantAccess`, `attachOrphanCompleted`, `markEmailProven`, rutas `/portal/completed/*` |
| `completedRegistrationController.js` | `identity` + `prefill` en la configuración, `POST /access`, cuenta e idempotencia en el envío |
| `CompletarInscripcion.tsx` | `AccessSection` (nivel superior), borrador local, `submissionKey` |
| `MiInscripcion.tsx` | «Mis eventos»: tarjetas, `CompletedDetail`, `ClaimBox`, `?vincular=` |
| `scripts/test-completed-accounts.mjs` | `npm run test:completed:accounts` (Postgres real con `COMPLETED_E2E_DATABASE_URL`) |

### Reglas durables

- **El modo vive en la configuración del evento**:
  `settings.completedForm.accountMode` = `optional` (por omisión) | `required` |
  `off`. `optional` porque el secretario de un club que inscribe a otras personas
  no debe inventarles contraseñas; ellas crean su acceso después con su correo.
  No hay pantalla para cambiarlo todavía (fase 2).
- **⚠️ CREAR LA CUENTA NO CONFIRMA NADA.** El registro nace `submitted` con
  cuenta o sin ella. Autenticación y validación son procesos independientes.
- **Nunca una segunda cuenta para el mismo correo**: si existe una de asistente,
  de Gestor de Proyectos (`ProjectFairAccount`) o de la plataforma (`User`), se
  pide entrar con ella y se VINCULA (`linkAttendeeAccountTo`).
- **⚠️ Una cuenta sin contraseña elegida (`'!'`) NO se estrena desde el
  formulario.** Se responde `exists` + `recover` y se manda a «Recuperar
  contraseña», cuyo enlace llega al correo. Lo contrario sería quedarse con la
  cuenta de cualquier correo conocido. (El registro en línea, v4.655, sí lo
  permite en `ensureAttendeeAccount`: ver la tarea sugerida al respecto.)
- **⚠️ Un registro anterior sin cuenta se ata SÓLO con el correo demostrado**:
  al restablecer la contraseña, al verificar el correo o con el enlace
  `?vincular=` (`/portal/completed/claim` → `/claim/confirm`, JWT de 2 h con
  `sub` + `email` + `purpose: 'completed_claim'`). Crear una cuenta con
  contraseña ata SÓLO el registro que se acaba de enviar. Cada vinculación deja
  `account_linked` en `EventRegistrationHistory`.
- **La sesión cuenta sólo si el correo del formulario es el suyo**: con sesión y
  otro correo, se está inscribiendo a otra persona y se le ofrece SU acceso.
- **La comprobación del paso 1 (`POST /public/completed/:slug/access`) no
  contesta nada sin contraseña**. Con contraseña es un ingreso: si la clave
  coincide abre la sesión; si el correo ya tiene cuenta suma un fallo al freno
  del ingreso (correo + IP). Además tiene un tope de 30 consultas por IP cada 15
  minutos (en memoria, por instancia, como el freno del ingreso).
- **La contraseña nunca entra en `answers` ni en el borrador** de
  `localStorage` (`completar-inscripcion:<slug>`). El borrador guarda
  respuestas, comprobante ya subido y `submissionKey`; al recuperarlo se vuelve
  al paso 1 para resolver el acceso.
- **Idempotencia**: `submissionKey` (único parcial por evento,
  `EventCompletedRegistration_submission_uniq`). El repetido devuelve el mismo
  registro con `repeated: true` y **sin sesión**: la clave de envío no prueba
  identidad. Las dos columnas nuevas están en `OWNED_COMPLETED_COLUMNS`.
- **Lo que ve el participante es una lista CERRADA** (`PARTICIPANT_HISTORY`):
  envío, vinculación, cambios de estado (con el motivo sólo en corrección o
  rechazo) y acreditación. Nada de duplicados, ediciones, importaciones ni
  notas internas. El comprobante se abre con un enlace firmado de 2 minutos.
- La ficha del panel administrativo muestra «Cuenta del participante»
  (`hasAccount`); el id de la cuenta no sale del servidor.

### Fase 2 propuesta

Centro del Participante: actualizar datos y subir una corrección del
comprobante desde «Mis eventos», acreditación con QR, documentos oficiales,
notificaciones y agenda; pantalla para `accountMode` por evento; reforzar
`ensureAttendeeAccount` del registro en línea con la misma regla de cuentas sin
contraseña.
