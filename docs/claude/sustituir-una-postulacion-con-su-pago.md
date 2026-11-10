<!-- Léelo ANTES de mover un pago de una postulación de la Feria a otra, de «consolidar» dos postulaciones, o de tocar `coveredBy` fuera de la inscripción conjunta. -->

## Sustituir una postulación por otra del mismo club, con su pago — v4.1311

Pedido del comité (XII Feria, Valledupar 2027) con el caso delante: el club
Cúcuta Ciudad de los Árboles (D4271) tenía dos proyectos activos.

- **`FP-GLMGQL`** no va a la feria. Tiene el pago real de la inscripción
  (COP 250.000), hecho por Ximena Caicedo.
- **`FP-GVGEQX`** sí va. Su responsable es Francy Calderón Bonilla y tiene un
  pago de prueba de USD 1.

Hay que retirar el primero, dejar el segundo respaldado por el pago real y no
perder ni duplicar un peso.

Hasta ahora se hacía con un script suelto con los ids escritos a mano
(`scripts/reconcile-clara-hernandez.mjs`). Ese script **copiaba** los
identificadores de Stripe a la otra fila. Así quedaban dos filas con la misma
referencia, y la Bóveda y los webhooks elegían una cualquiera.

### Piezas

| Archivo | Qué es |
|---|---|
| `server/lib/projectFairSubstitution.js` | El CRITERIO, puro: `substitutionPlan` (comprobaciones, bloqueos, pagador, huella), `classifyReplacedPayment`, `substitutionWrites`, `substitutionViewOf`, `clubKey`/`districtKey` |
| `projectFairAdminController.js` → `verifySubstitution`, `applySubstitution` | Verificar (solo lectura: base + Stripe + Bóveda) y aplicar (transacción) |
| `POST /admin/postulaciones/sustitucion/verificar` · `…/aplicar` | `fairEdit` + capacidad `remove` + `managePayments` (sólo el rol admin) |
| `src/components/admin/feria/SustituirPostulacion.tsx` | La ventana, desde la ficha del proyecto que SE RETIRA |
| `mapRow.substitution` / `paidByName` | Lo que pintan la ficha, el listado, el CSV, el Excel y el PDF |

Pruebas:

- `npm run test:fair:substitution` (38, sin base).
- `test:fair:substitution:e2e` (55, Postgres real + Stripe simulado, con un
  ROLLBACK forzado a mitad de la transacción por un trigger).
- `test:fair:substitution:ui` (17, Chromium contra el router real, también a
  390 px).

Las dos últimas necesitan `FAIR_E2E_DATABASE_URL=<postgres local desechable>`.
`db.js` exige SSL, así que el Postgres local necesita un certificado
autofirmado. Stripe se simula con `STRIPE_API_BASE`, la misma salida que usa
el Video Pitch.

### Reglas durables

- **⚠️ EL DINERO NO CAMBIA DE FILA.** Se reutiliza la regla de la inscripción
  conjunta (v4.1299).
  - El pago se queda en su **ancla**: el proyecto retirado, con transacción,
    referencia, fecha, importe, comprobante y pagador intactos.
  - El ancla SUMA al conservado en `metadata.payment.coveredSubmissionIds` y
    `coveredProjects`.
  - El conservado queda `paid` con `metadata.payment.coveredBy` y SIN
    `amountReceived` ni referencias de Stripe.

  Así la Bóveda (emparejada por `providerRef`) no se duplica ni se
  desempareja, y un reembolso del pago real alcanza al conservado por la
  propagación de siempre.
- **⚠️ EL RETIRADO VA EN CERO en `coveredProjects`.** `paymentStateFor` suma
  esas líneas para explicar el cobro. Con las dos en 250.000, el perfil
  mostraría 500.000.
- **EL PAGO ANTERIOR DEL CONSERVADO NO SE BORRA NI SE REEMBOLSA.** Va entero a
  `metadata.substitution.previousPayment` (columnas + `metadata.payment` de
  antes). Se clasifica así:
  - `stripe_test`: la cuenta real no lo encuentra, o `livemode: false`.
  - `stripe_live`: cobro real; su movimiento en la Bóveda se conserva.
  - `manual`: confirmación administrativa sin pasarela.
  - `unverified`: Stripe no respondió. **Bloquea.**

  Sale de las columnas de la fila para que el webhook, la sincronización y la
  Bóveda no lo confundan con el pago oficial.
- **⚠️ LAS DIFERENCIAS DETIENEN.** Bloquea cualquiera de estas condiciones:
  - otro club, otro distrito u otra edición;
  - conservado archivado, retirado, rechazado o en borrador;
  - pago oficial sin pagar, reembolsado, cubierto por otro, que ya cubre a
    otro, o con un importe distinto del que informa el comité;
  - Stripe no lo confirma: no está en modo real, no está `succeeded`, tiene
    reembolso o disputa, o su metadata lo atribuye a otra inscripción;
  - un cobro abierto en el conservado.

  Es la exigencia del pedido: «no hacer cambios basándose en los textos de la
  captura».
- **⚠️ HUELLA.** La verificación devuelve un sha256 de las dos filas (con
  `updatedAt`), de lo que dijo Stripe y del importe informado. Aplicar exige la
  misma huella dos veces:
  1. antes de abrir la transacción;
  2. con las filas `FOR UPDATE`.

  Si algo cambió entre la verificación y la aplicación, se responde 409 sin
  tocar nada. Stripe se consulta FUERA de la transacción.
- **UNA TRANSACCIÓN**: las dos UPDATE condicionales y los eventos de auditoría
  (`substitution` en las dos fichas y `payment_reclassified` en el conservado,
  con `before`/`after`, comprobaciones y huella). Cualquier fallo → ROLLBACK.
- **IDEMPOTENTE** (`isAlreadyApplied`): volver a verificar o aplicar responde
  «ya aplicada» sin escribir nada.
- **EL RESPONSABLE NO SE TOCA.** El pagador vive en
  `substitution.payer`: nombre, correo y teléfono de la fila del pago, más el
  titular que registró Stripe.
- **El retirado queda archivado y `withdrawn`**, con su estado anterior en
  `substitution.previousWorkflowStatus`. No cuenta como activo, no debe pago,
  no recibe recordatorios y sale del listado, los indicadores y la exportación
  (`buildFilters`). Sigue consultable en «Archivadas».
- **Dos defensas que hacía falta poner:**
  - `handleRefund` no cambia el estado de un proyecto `coveredBy`. Un
    reembolso que lo encuentra por la metadata es de un pago anterior.
  - `syncStripe` responde 409 en un proyecto `coveredBy`. La búsqueda por
    correo le volvía a pegar el pago de prueba.
- `adminListForms` y `listMasterForms` excluyen los archivados: un proyecto
  archivado no se evalúa.

### Cómo se aplica el caso de Cúcuta en producción

1. Abrir la ficha de `FP-GLMGQL` y pulsar «Sustituir por otro proyecto».
2. Escribir `FP-GVGEQX` e importe `250000 COP`, y pulsar «Verificar».
3. Si todo pasa, revisar al pagador, el pago anterior y la Bóveda; marcar la
   autorización y pulsar «Aplicar».

Si algo no pasa, la ventana dice qué y no deja seguir.

**Pendientes conocidos:**

- La cuenta del perfil de quien pagó (Ximena) sigue apuntando al proyecto
  archivado. No se suspende su rol de Gestor ni se le avisa.
- No hay «deshacer sustitución» desde el panel. Todo lo necesario para
  revertirla a mano está en `metadata.substitution` y en los eventos.
