<!-- Léelo ANTES de tocar el wizard de /postular-proyecto, el pago de la inscripción, «Mi proyecto» o los indicadores de Postulaciones y Pagos. Supersede «un (1) proyecto por club» donde todavía lo diga postulacion-de-proyectos.md. -->

## Hasta dos proyectos por club: la INSCRIPCIÓN (v4.1299)

Pedido del comité (XII Feria, Valledupar 2027): cada club puede postular **uno
o dos proyectos**. El primero vale la inscripción de siempre (**$250.000 COP**)
y el segundo tiene **tarifa especial ($100.000 COP adicionales)**: dos
proyectos por **$350.000 COP**, en un solo pago. La intención es traer más
proyectos, no cobrar dos inscripciones completas. Y un club que **ya pagó** su
primer proyecto tiene que poder agregar el segundo pagando **sólo** los
100.000, sin tocar la transacción original.

### Auditoría (cómo estaba hasta v4.1298)

Una fila de `ProjectFairSubmission` era a la vez el proyecto, la inscripción y
el cobro. Lo que impedía dos proyectos por club:

1. `ProjectFairAccount` era 1:1 con la fila (índice único por `submissionId`,
   único por correo) y el token del perfil llevaba UN `submissionId`; todas las
   rutas del perfil —formularios, FDD, videos, recursos— leen
   `req.portal.submissionId`.
2. `createSubmission` rechazaba un correo con cuenta (409) y creaba una fila.
3. El pago (`status`, sesión, intentos, `amountReceived`, Bóveda, webhooks)
   vivía en la fila; `priceSubmission` cobraba `registration.amountCop` sin
   más; la metadata de Stripe ataba la sesión a un solo `submissionId`.
4. `maxProjectsPerClub: 1` existía en la configuración y **nadie lo leía**.
5. El wizard tenía una ficha de proyecto y el panel contaba clubes = filas.

### El modelo

| Archivo | Qué es |
|---|---|
| `server/lib/projectFairRegistration.js` | El CRITERIO, **puro**: tarifas (`pricingRulesOf`), línea por posición, qué cubre una orden (`orderFor`, `coveredByCheckout`), desglose (`registrationBreakdown`), veredictos para agregar / quitar el segundo (`secondProjectVerdict`, `removeProjectVerdict`), lectura de los cubiertos desde la metadata del cobro, y las reglas en SQL |
| `ProjectFairRegistration` | La INSCRIPCIÓN del club: `eventId`, club, distrito, correo, `accountId`, `modality` (`single`/`double`). Es un **PADRE**: no va en `SUBMISSION_CHILDREN` |
| `ProjectFairSubmission."registrationId"` · `"projectIndex"` | Cada proyecto conoce su inscripción y su posición (1 = principal, 2 = adicional). Índice único parcial `("registrationId","projectIndex")` y `CHECK (projectIndex BETWEEN 1 AND 2)` |
| `ProjectFairAccount."registrationId"` | La cuenta conoce su inscripción; su `submissionId` sigue siendo el proyecto principal |
| `validateWizard` · `insertProjectRow` · `createSubmission` · `linePricing` | La creación: UNA inscripción, una fila por proyecto, UNA cuenta |
| `registrationRows` · `computeOrderPricing` · `priceSubmission` · `beginCheckout` · `markCoveredPaid` · `coveredProjectsFor` | El cobro de la ORDEN y su propagación |
| `migrateRegistrations` | Lo heredado: una inscripción de UN proyecto por fila |
| `projectFairPortalController.js`: `registrationViewOf`, `issueProjectToken`, `accountForSubmission`, `addProject`, `withdrawProject`, `restoreProject` | El perfil |
| `POST /portal/projects` · `POST /portal/projects/:id/withdraw` · `POST /portal/projects/:id/restore` | Agregar, quitar antes de pagar, restaurar |
| `src/pages/FeriaProyectos.tsx` | Modalidad en el paso 1, pestañas por proyecto en el paso 2, resumen de inscripción en el 3 |
| `src/pages/MiProyecto.tsx`: `ProjectSwitcher`, `SecondProjectCard`, `PaymentCallout` | «Mis proyectos postulados», el segundo proyecto, la inscripción con su desglose y los pagos realizados |

Pruebas: `npm run test:fair:registration` (116: criterio + invariantes leídas
de los archivos). `test:fair:payment:path`, `test:fair:lifecycle` y
`test:fair:bulk` siguen en verde con sus regexes actualizadas al nuevo
`startCheckout`/`createSubmission`. **Ninguna necesita Postgres ni red.**

**Reglas durables:**

- **⚠️ LA FILA SIGUE SIENDO EL PROYECTO.** De `submissionId` cuelgan la
  Formulación, el FDD, los videos, los recursos, el historial, los intentos de
  pago y la cuenta: nada de eso cambió de llave. Lo nuevo es el PADRE. Al
  agregar una tabla que cuelgue de `submissionId`, sigue la regla de
  `SUBMISSION_CHILDREN`; una que cuelgue de `registrationId` NO va ahí.
- **⚠️ CADA PROYECTO GUARDA SU LÍNEA, NO EL TOTAL.** `amountCop`/`amountUsd`
  de la fila es 250.000 en el primero y 100.000 en el segundo. Así el recaudo
  por primeras y por segundas postulaciones se SUMA fila por fila
  (`collectedFirst`/`collectedSecond`) sin repartir nada después. Lo que la
  pasarela cobró de verdad (`amountReceived`, con recargo) vive UNA sola vez,
  en el **ancla** de la orden; los demás proyectos cubiertos quedan `paid` con
  `metadata.payment.coveredBy` y SIN `amountReceived`. Una prueba fija que
  `markCoveredPaid` no escriba `amountReceived`.
- **⚠️ UN COBRO CUBRE TODO LO QUE EL CLUB DEBE EN ESE MOMENTO**
  (`coveredByCheckout`: postulado, no retirado ni rechazado, no archivado,
  sin pagar). Dos postulados → una orden de 350.000 anclada en el primero.
  Primero pagado + segundo nuevo → orden de 100.000 anclada en el segundo:
  es el **cobro complementario** del pedido, y es la misma regla vista desde
  otro momento. Un borrador no se cobra (v4.1253).
- **⚠️ QUÉ CUBRIÓ UN COBRO SE LEE SÓLO DE SU METADATA** (`coveredSubmissionIds`,
  en la sesión y en el PaymentIntent). Deducirlo de «lo que debe hoy» al
  confirmar marcaría pagado un proyecto agregado DESPUÉS de abrir el cobro.
  Una sesión anterior a v4.1299 no lo trae y cubre sólo su ancla. Lo fija una
  prueba que comprueba la AUSENCIA de `orderFor` en `confirmPaidSession`.
- **EL ANCLA ES EL PRIMER PROYECTO QUE DEBE**, se mire el que se mire en el
  perfil (`startCheckout`). El intento se reclama sobre ella y el índice único
  de intentos abiertos sigue impidiendo el doble cobro. Si el conjunto cubierto
  cambia (se agrega o quita el segundo), el importe cambia y `reusableCheckout`
  expira la sesión vieja, como con la TRM (v4.978).
- **⚠️ EL TOKEN ES EL SELECTOR DE PROYECTO** (`issueProjectToken`). El perfil
  recibe en `/portal/me → registration.projects[].token` un token por proyecto,
  firmado, de la misma cuenta y con el MISMO `exp`. Cambiar de pestaña en «Mi
  proyecto» es cambiar de token: `ProjectFormView`, `VideoPitchCard`,
  `ProjectVideoCard`, `PresentationTemplateCard` siguen leyendo
  `req.portal.submissionId` sin saber que hay dos. Es lo que mantiene «no
  mezclar archivos ni formularios entre proyectos» sin tocar seis
  controladores. La sesión guardada en `localStorage` sigue siendo la del
  proyecto principal.
- **LA CUENTA SE BUSCA POR LA INSCRIPCIÓN** (`accountForSubmission`: por
  proyecto, por `registrationId`, por correo). Un segundo proyecto no es el
  `submissionId` de la cuenta: `claim` al volver de Stripe con el segundo como
  ancla, `grantProjectManagerRole` y `getPortalData` lo necesitan.
- **⚠️ EL TOPE VIVE EN LA BASE** y en el criterio, nunca en el navegador: el
  índice único `(registrationId, projectIndex)` impide que dos pestañas creen
  dos «segundos proyectos» (el 23505 se responde como 409), el CHECK acota la
  posición a 2, y `pricingRulesOf` acota `maxProjectsPerClub` a 2 aunque el
  panel mande 5.
- **DE DOS A UNO, ANTES DE PAGAR, NO SE BORRA NADA.** `withdrawProject` deja el
  segundo en `workflowStatus = 'withdrawn'` con `metadata.withdrawnByClub`
  (estado anterior incluido) y es un UPDATE condicional (`status NOT IN
  ('paid','refunded')`). `secondProjectVerdict` devuelve `restorable` en vez de
  dejar crear otro; `restoreProject` lo devuelve a su estado anterior. Un
  retirado por el COMITÉ (sin la marca) no se restaura solo. Después de pagar
  dos, no hay cómo reducir desde el perfil: `removeProjectVerdict` → `paid`.
- **UN REEMBOLSO TOTAL ALCANZA A LOS CUBIERTOS** (`handleRefund`): se devolvió
  la inscripción conjunta, no la de un proyecto. Sólo los que tienen
  `coveredBy = ancla`.
- **⚠️ LAS TARIFAS SE LEEN UNA VEZ (`pricingRulesOf`)**: tope, primera, segunda,
  interruptor, fecha propia del segundo. Con el interruptor apagado o la
  segunda tarifa en 0, la convocatoria vuelve a un proyecto por club.
  **Política de vigencia**: una orden pendiente se cobra al precio vigente al
  pagar; una pagada conserva su línea congelada en la fila. Cambiar tarifas en
  Convocatoria no toca ninguna orden pagada.
- **⚠️ LA COPIA GUARDADA DE `maxProjectsPerClub: 1` CEDE** (`normalizeSavedConfig`):
  el panel guardaba la convocatoria entera y la fila lleva el 1 de siempre,
  que nadie eligió. Si la fila no trae `secondProjectAmount*` (nunca pasó por
  el editor nuevo) se descarta el tope guardado y rige el 2 por defecto; en
  cuanto el comité guarde desde el editor, manda lo guardado. Misma regla para
  el texto introductorio de «un (1) proyecto» (`LEGACY_INTROS`). Es el patrón
  de Rotary Grants (v4.1254).
- **LA MIGRACIÓN NO ADIVINA.** Cada fila heredada recibe SU inscripción de un
  proyecto (`modality: 'single'`), apuntando a su cuenta; no agrupa por correo
  ni por club. Sólo toca `registrationId IS NULL`, con UPDATE condicional
  (idempotente entre instancias). No crea ningún segundo proyecto vacío ni
  toca pagos, comprobantes ni Stripe. El club agrega el segundo desde su perfil.
- **LOS INDICADORES DISTINGUEN CLUBES DE PROYECTOS**: `registrations` (COUNT
  DISTINCT `COALESCE(registrationId, id)`), `activeProjects`, clubes con uno /
  con dos, `secondProjects*`, `collectedFirst/Second`, `pendingFirst/Second`.
  Todo por `buildFilters`, así que respeta la edición y lo archivado. Filtros:
  `?proyectos=1|2` (cantidad de activos de la inscripción, subconsulta) e
  `?indice=1|2`.
- **EL WIZARD MANDA `projects: [...]` Y LA IDENTIDAD UNA VEZ**; sin `projects`
  el cuerpo entero es un proyecto (clientes anteriores). Los errores vuelven en
  `fields` (identidad) y `projects[i]` (por ficha), y la pantalla salta a la
  pestaña que falla. De dos a uno se CONFIRMA y la segunda ficha se conserva en
  el borrador local (`feria_proyectos_draft_v2`; el `_v1` se migra).
- **STRIPE PINTA UNA PARTIDA POR PROYECTO** (`partidasProyecto`) más las
  comisiones; si la suma no cuadrara en la unidad mínima cae a la partida
  única, como siempre (v4.981). Con un proyecto, las partidas no cambian.

**Pendientes conocidos:** la **Formulación no se siembra para los proyectos
cubiertos al confirmarse el pago** (se siembra al abrir el perfil, como hasta
ahora, así que en la práctica no se nota); el **tope de 2** está escrito en el
criterio y en el CHECK: subirlo es una decisión administrativa que pide tocar
los dos; no hay pruebas contra Postgres real de esta versión (las barreras son
el criterio puro, las invariantes y el camino con la base sustituida); y
`confirmManualPayment` (admin) confirma UNA fila con su línea: para una
inscripción de dos proyectos pagada por fuera, se confirma cada uno.

### Las tarjetas sin precio: postular sin pensar en el pago (v4.1300)

Pedido del comité con la captura delante: las tarjetas de modalidad mostraban
«Primer proyecto $250.000 · Total $350.000» y debajo una franja con el total,
y el precio se volvía el elemento dominante del formulario. Ahora las tarjetas
dicen CUÁNTOS proyectos («Registra y presenta una iniciativa…» / «Registra dos
iniciativas independientes… en una misma inscripción»), la franja del total
desapareció y debajo va «Puedes comenzar ahora y pagar después…» (sin precios).

- **Las tarifas se CONOCEN arriba y se CONFIRMAN al pagar.** El texto
  informativo con los valores se conserva encima de las tarjetas; el desglose
  completo vive en la pantalla de pago del wizard y en «Mi proyecto». En el
  paso 3 el valor es UNA línea de referencia que aclara que postular no
  requiere pagar ahora.
- **Nada cambió en el cálculo ni en el cobro**: `pricingRulesOf`, la orden,
  Stripe, comprobantes e indicadores siguen igual. Es presentación.
- **Postular ya no exigía pagar desde v4.1253**; esta versión lo hace visible
  en el momento de elegir, que es donde aparece la barrera «necesito el dinero
  antes de empezar».
- El mensaje de pago pendiente del perfil (`paymentViewOf`) dice «Tu
  información está guardada… cuando estés listo, completar el pago para
  confirmar tu inscripción». Sigue diciendo que la postulación permanece
  registrada (lo fija `test:fair:payment`).

### La ampliación desde «Mi proyecto» (v4.1301)

Pedido del comité: que un club que ya postuló un proyecto agregue el segundo
desde su perfil, sin registrarse de nuevo ni volver a pagar el primero, con un
pago complementario de $100.000 y comprobante propio, y que el panel distinga
esa AMPLIACIÓN de la inscripción inicial de dos proyectos.

- **El botón vive en el encabezado** (`SecondProjectHeaderAction`) y su estado
  lo resuelve el servidor (`registration.action`): `add` → abre el asistente;
  `continue` → cambia al token del borrador (lo termina el `DraftEditor` de
  siempre); `pay` → `handlePay` (la orden ya cubre el segundo); `restore`;
  `complete` → «Tu club ya tiene dos proyectos registrados», sin botón. La
  pantalla no decide.
- **El asistente (`SecondProjectView`) tiene tres momentos**: presentación con
  club, distrito, responsable y correo precargados (`registration.club`), el
  Proyecto 1 con su estado (`registration.primary`), la tarifa y el saldo real
  (`registration.balance` + tarifa: primero pagado → 100.000; sin pagar →
  350.000); la ficha (los MISMOS cuatro campos de la postulación, por
  `POST /portal/projects`); y «listo para continuar» con guardar y salir,
  revisar (cambia al token del nuevo proyecto) y completar pago. **No manda a
  Stripe al comenzar.**
- **`metadata.addedVia`** en la fila del proyecto: `'wizard'` (registro
  inicial) o `'portal_extension'` (ampliación). La inscripción guarda
  `extendedAt`. Es lo que el panel usa para «Inscripción inicial de dos
  proyectos» vs «Ampliación posterior», el filtro `?origen=`, los indicadores
  `extensions*` / `collectedExtensions` y la columna «Origen» del CSV.
- **El cobro de SÓLO el segundo proyecto se nombra «Inscripción adicional —
  Segundo proyecto — <edición>»** en Stripe (`soloAmpliacion` en
  `beginCheckout`) y en el comprobante. Sigue siendo la misma orden del
  criterio: no hay un camino de cobro aparte.
- **La ficha administrativa resume la inscripción** (`registrationSummary` en
  `getSubmission`): modalidad, origen, fecha del segundo, líneas, total pagado,
  saldo, y la lista de pagos con `kind: 'original' | 'complementary'` y qué
  proyectos cubrió cada uno.
- Los duplicados los impide lo de siempre: índice único `(registrationId,
  projectIndex)` (el 23505 responde 409) y `secondProjectVerdict` en cada
  petición; un tercer proyecto no entra ni por la API.
