# Conciliación de inscripciones y traslados de un evento — v4.1250

## ⚠️ REGLA DURABLE: LOS EVENTOS SON UN DOMINIO FINANCIERO PROPIO

v4.1248–v4.1249 llevaron los pagos de inscripción a la **Bóveda de Fondos**:

- confirmar un pago creaba una fila de `Payment`;
- `GET /financial/wallet?eventId=` leía esos pagos;
- la ficha del inscrito pedía «Registrar movimiento en la Bóveda».

**El equipo lo rechazó.** La Bóveda se compartió como REFERENCIA de cómo se
gestionan los comprobantes, no como destino de los pagos de los eventos.

Desde v4.1250:

- **Ningún archivo de este módulo lee ni escribe** `Payment`, `Disbursement`,
  `DisbursementNotice`, `DisbursementBatch`, `PaymentLifecycleEvent` ni el
  libro mayor. Lo comprueba `npm run test:event-funds`, en el código y en el
  camino real (registra todas las consultas y exige que ninguna toque esas
  tablas).
- **Los archivos de la Bóveda quedaron byte a byte como en v4.1247**
  (`financialController.js`, `disbursementController.js`, `disbursements.js`,
  `projectFairCollections.js`), y `confirmPaidSession` ya no crea un `Payment`.
- **La única excepción es de solo lectura:**
  `server/lib/eventFundsVaultAudit.js` (`GET /api/event-funds/admin/vault-audit`).
  Lista las filas que v4.1248–v4.1249 alcanzaron a crear en la Bóveda. Se
  reconocen por `"eventId"` dentro del `rawPayload` de un cobro
  `event_registration`, una marca que sólo ese código escribía. **No se borró
  nada:** un registro financiero no se elimina sin revisar antes si ya se giró.
  La decisión es del equipo.

## Los dos procesos, separados

| | Proceso A — el PAGO | Proceso B — el TRASLADO |
|---|---|---|
| Qué es | El participante paga su inscripción por Stripe | El organizador traslada los fondos a la cuenta oficial del evento (Concorrotarios u otro) |
| Dónde vive | `EventRegistration` + `EventRegistrationPayment` (ya existían) | `EventFundsTransfer` + `EventFundsAllocation` |
| Estados | confirmado · pendiente · fallido · reembolsado | pendiente · registrado · pendiente_verificacion · confirmado · rechazado · revertido |

**Un pago confirmado no es un traslado confirmado.** `paymentOf` calcula lo que
le corresponde al evento: lo cobrado, menos el recargo de la pasarela (que pagó
el participante, v4.980), menos lo reembolsado. Eso es lo que se propone
trasladar, y se puede ajustar al registrar.

## Piezas

| Archivo | Qué es |
|---|---|
| `server/lib/eventFundsSpec.js` (+ `.d.ts`) | El criterio, puro. Lo importan el servidor y el panel. Incluye `paymentOf`, `registrationTransferState`, `validateTransfer`, `canTransition`, `checkPdf`, `transferEmail` y `eventFundTotals` |
| `server/lib/ensureEventFundsSchema.js` | Las siete tablas, en runtime y fuera de Prisma. Están protegidas en CLAUDE.md y en `db-push-guard.mjs` |
| `server/lib/eventFundsStore.js` | La I/O: lectura resuelta, historial, S3 privado y verificación con Stripe |
| `server/controllers/eventFundsController.js` · `server/routes/event-funds.js` | `/api/event-funds/*`, montada en `api/index.js` y en `server/server.js` |
| `src/components/admin/events/RegistrationFundsPanel.tsx` | En la ficha del inscrito: «Conciliación y comprobante de traslado» |
| `src/components/admin/events/EventFundsTab.tsx` | La pestaña «💰 Conciliación de inscripciones» |
| `src/components/admin/events/funds/*` | `TransferFormModal`, `TransferCard`, `SendTransferNoticeModal`, `BeneficiaryConfig` y `eventFundsApi.ts` |

## Reglas

- **Beneficiario por evento** (`EventFundsConfig`): el nombre, el banco, la
  cuenta, el tipo, la moneda, el NIT y los responsables autorizados que reciben
  los comprobantes.
  - Nada fijo en el código.
  - Sólo un rol que aprueba lo edita.
  - Los demás ven la cuenta enmascarada (`****4521`).
  - Una cuenta enmascarada que vuelva en el cuerpo no pisa la real (`CASE ... LIKE '****%'`).
- **Traslado individual o consolidado.** Un traslado consolidado es UNA
  operación con varias inscripciones, cada una con su valor asignado y un solo
  comprobante. Responde a que Stripe liquida varios cobros juntos.
  - El valor del traslado puede diferir de la suma asignada (costos bancarios).
    Se guarda la diferencia y se muestra como «diferencia por conciliar».
- **⚠️ Ninguna inscripción se traslada dos veces.** `validateTransfer` suma lo
  ya asignado en traslados ACTIVOS (rechazados y revertidos liberan su parte).
  Corre DENTRO de una transacción con `pg_advisory_xact_lock` por evento, con lo
  que hay en la base en ese instante. COP y USD no se mezclan.
- **⚠️ Para confirmar hacen falta un comprobante PDF vigente y la referencia de
  la operación**, y lo hace un `APPROVER_ROLES` (administrator, superadmin,
  district_admin, club_admin). Rechazar y revertir también lo hace ese rol y
  exige el motivo. Un traslado confirmado no se edita: se revierte con su motivo
  y se registra otro. No hay `DELETE`.
- **Comprobantes PDF**:
  - Se valida el tipo `application/pdf`, la firma `%PDF-` y un máximo de 10 MB.
  - Se guardan en el prefijo PRIVADO `private/event-funds/<club>/<evento>/<traslado>/`,
    sin ACL pública y con `no-store`.
  - Se abren con un enlace firmado que caduca en 10 minutos. La clave de S3 no
    sale al navegador.
  - Reemplazar crea una versión nueva; la anterior queda en el historial.
- **Correo del comprobante**:
  - Plantilla institucional de `transferEmail`. **Sólo dice «realizado» con el
    traslado confirmado**; en cualquier otro estado dice «registro del
    traslado» y su estado.
  - Destinatarios: los responsables del evento. No se envía al participante por
    defecto.
  - Exige confirmación explícita (si falta, responde 428).
  - Es idempotente por `operationKey`, mediante un índice único parcial. Después
    de un rechazo del proveedor, el panel genera otra clave para reintentar.
  - Lo manda `EmailService.sendPlatformEmail` con el PDF adjunto.
  - «Enviado» significa que el proveedor ACEPTÓ el correo.
- **Verificar con Stripe** sólo lee: consulta `paymentIntents.retrieve` con
  `latest_charge.balance_transaction`, con 15 s de tope por llamada, 45 s por
  pasada y un máximo de 60 pagos. Guarda en `EventStripeCheck` la comisión real,
  el neto, la fecha de liberación y la balance transaction.
- **Historial** (`EventFundsHistory`): traslado registrado, cambio de estado,
  corrección, comprobante adjuntado o reemplazado, enviado o con error,
  beneficiario configurado y Stripe verificado. Todo con el actor, la referencia
  y el documento. El historial de una inscripción se COMPONE al leer: incluye su
  creación y sus pagos, que vienen del propio registro de inscripciones.
- **Permisos**:
  - Todo exige la capacidad sensible `payments` del evento
    (`assertEventCapability`). Un evento ajeno responde 404.
  - Confirmar, rechazar, revertir y los datos bancarios exigen además un rol
    que aprueba.

## Pruebas

`npm run test:event-funds` corre en el `prebuild` y tiene 71 comprobaciones:

- el criterio, con los casos reales de Martha Isabel Ballen y Laura Espinel
  (278,91 USD pagados, 13,28 USD de recargo y 265,63 USD para el evento);
- el CAMINO real de los controladores con la base, S3 y el correo en memoria:
  el consolidado, el doble traslado bloqueado, el 404 de un evento ajeno, la
  confirmación sin PDF bloqueada, el editor sin permiso, el envío con el PDF
  adjunto, el doble clic sin duplicado y el historial;
- la independencia de la Bóveda, en el código y en las consultas.
