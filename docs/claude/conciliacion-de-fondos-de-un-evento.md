# Conciliación de fondos de un evento — v4.1248

Pedido: en `/admin/eventos`, llevar a los pagos de inscripción por Stripe la
herramienta de conciliación de las campañas de contribución (la del
terremoto): registrar el traslado al beneficiario, adjuntar el comprobante PDF
y enviarlo por correo a los rotarios. **Sin un segundo sistema.**

## Diagnóstico (antes de implementar)

1. **Ya existía casi todo.** Las campañas (`WalletManagement.tsx`, la Bóveda) y
   la Feria (`ConciliacionesDesembolsos.tsx`, `/admin/conciliaciones`) comparten:
   - `BulkDisbursementBar`: registra el traslado agrupado, con su comprobante
     PDF (`comprobanteOpcional`) y el aviso al beneficiario.
   - `BulkReconciliationBar` y `ResendNoticeModal`: concilian lo ya trasladado
     y envían el documento consolidado (PDF que se compone en el servidor, con
     adjuntos opcionales) por correo, con vista previa, idempotencia por
     operación e historial (`DisbursementNotice`).
   - `DisbursementSection`: la ficha de un pago (ciclo de vida, traslados,
     comprobantes, reenvío y reverso; no existe un `DELETE`).
   - La API `/financial/wallet/*` y `/financial/disbursements/*`, el almacenamiento
     privado en S3 con enlace firmado y el motor de correo único
     (`sendPlatformEmail` + `claimDelivery`).
2. **Las inscripciones ya tenían su fila de `Payment`**
   (`buildDraftForEventRegistration`, `rawPayload.type = 'event_registration'`,
   `clubId` = sitio del `CalendarEvent`). Pero **sólo** las creaba la
   reconstrucción manual (`/wallet/rebuild-collections`): al confirmarse un pago,
   la inscripción no llegaba a la Bóveda.
3. **Lo que faltaba**: ver esa Bóveda acotada a UN evento, saber qué inscripción
   es cada pago y separar los estados del dinero.

## El flujo financiero real (punto 9 del pedido)

Es el **escenario C**: el cobro entra a la cuenta Stripe de la PLATAFORMA
(`isPlatformCollection`, `stripeBalanceTxId`, `availableOn`), y el traslado al
beneficiario es una operación bancaria EXTERNA que se registra a mano en
`Disbursement` con su comprobante. No hay Stripe Connect (`transfers.create`) ni
payouts automáticos en el código. Por eso Stripe no puede probar el traslado
final, y el estado «Traslado» sale sólo de un `Disbursement` con estado
`confirmado`.

Los retiros a la cuenta del sitio (`PayoutRequest`) son del SITIO: en la vista
de un evento no se restan ni se muestran (no hay forma honesta de repartirlos).

## Piezas

| Archivo | Qué es |
|---|---|
| `server/lib/eventFundsSpec.js` (+ `.d.ts`) | El CRITERIO, puro: `matchRegistrationsToPayments`, `fundStatesOf`, `eventFundTotals`, `registrationFundBadge`. Lo importa también el navegador |
| `server/lib/eventFunds.js` | La I/O: `eventFundsScope({ clubId, eventId })` |
| `getClubWallet` (`financialController.js`) | `?eventId=` → la MISMA respuesta acotada, más `eventScope` |
| `listClubNotices` / `listAuditEvents` | `?eventId=` → sólo los avisos y la traza de los pagos del evento |
| `rebuildCollections` + `pendingCollections` | `eventId` → registrar sólo los movimientos que le faltan a ese evento |
| `confirmPaidSession` (`eventRegistrationController.js`) | Registra el `Payment` EN VIVO, con el mismo constructor |
| `src/components/admin/events/EventFundsTab.tsx` | La pestaña «💰 Conciliación de fondos» |
| `EventRegistrationsManager.tsx` | La etiqueta del dinero bajo el estado de cada inscrito |

## Reglas durables

- **⚠️ INSCRIPCIÓN ↔ PAGO SE EMPAREJAN POR IDENTIFICADOR DE STRIPE**
  (PaymentIntent o Checkout Session contra `Payment.providerRef`), **nunca** por
  nombre ni por correo. Una inscripción pagada SIN referencia de Stripe (pago
  marcado a mano) se informa como «sin referencia» y **no se asocia
  automáticamente a ningún movimiento**: se revisa a mano.
- **⚠️ CINCO ESTADOS QUE NO SE FUNDEN** (`fundStatesOf`): pago, Stripe
  (atado a su balance transaction), liquidación, traslado y comprobante. Un pago
  confirmado no prueba que el beneficiario recibió nada. «Enviado» quiere decir
  que el proveedor ACEPTÓ el correo, no que llegó.
- **⚠️ LA MISMA LISTA DE ESTADOS COBRADOS EN LOS DOS LADOS**
  (`PAID_REGISTRATION_STATUSES`: paid, accredited, attended, no_show). La usan
  la pestaña para decir «sin movimiento» y `pendingCollections` para
  registrarlo. Con dos listas, una pantalla diría «falta» de algo que la
  reconstrucción ignora.
- **⚠️ LA RECONSTRUCCIÓN MIRA LAS DOS REFERENCIAS**
  (`p."providerRef" IN (PI, Session)`). Antes miraba sólo
  `COALESCE(PI, Session)`: un cobro registrado con la Session y cuya inscripción
  luego recibió su PaymentIntent se habría DUPLICADO (el `ON CONFLICT` es por
  `providerRef` exacto).
- **COP y USD nunca se suman** (`eventFundTotals`, una tarjeta por moneda).
- **El movimiento en vivo nunca tumba la confirmación**: va en `try/catch`, como
  el de la Feria. Lo que falte se registra desde la pestaña.
- **`rawPayload.eventId`**: el movimiento de una inscripción ya no se rotula
  «12-valledupar» fijo (era falso para cualquier otro evento).
- **La pestaña la gobierna la capacidad SENSIBLE `payments`** («Gestionar
  pagos»), y el servidor además exige el rol financiero (`finance.view` para
  leer, `requireSiteAdmin` para trasladar y enviar). Un evento de otro sitio
  responde 404.

## Pendiente de decisión (no se cambió)

El registro de un traslado acepta el comprobante como OPCIONAL
(`comprobanteOpcional`), en campañas, Feria y eventos por igual. El pedido dice
«no declarar un traslado como confirmado sin evidencia»: volverlo obligatorio
cambia el comportamiento de las campañas también, así que es una decisión del
equipo, no de este módulo.

## Pruebas

`npm run test:event-funds` (en `prebuild`): el criterio, el CAMINO real de
`GET /financial/wallet?eventId=` con la base sustituida en memoria (incluido el
404 de un evento ajeno y que no se leen los payouts del sitio) y lo que tiene
que seguir siendo verdad en el código (que la pestaña reusa las cuatro piezas de
la Bóveda y no llama a ningún endpoint nuevo).
