<!-- Léelo ANTES de tocar «Confirmar pago manualmente» de Postulación de Proyectos (confirmManualPayment) o el recaudo de la Feria. -->

## Confirmación manual de pagos de la Feria — v4.1308

Pedido del comité con la ventana delante: al confirmar a mano el pago de una
postulación (transferencia, consignación), **adjuntar el comprobante** en la
misma ventana, y que lo confirmado **sume al balance** de proyectos pagados de
manera completa.

### Qué faltaba (hasta v4.1307)

1. El comprobante era un campo de texto («URL a comprobante, # extracto…»).
2. En una inscripción de DOS proyectos pagada con una sola transferencia, la
   confirmación marcaba UNA fila; el otro proyecto seguía debiendo y la
   inscripción nunca quedaba pagada completa (`pendingFirst/Second`, saldo).
3. Los indicadores suman la LÍNEA de cada fila pagada (`amountCop` /
   `amountUsd`, `amountColumn(priceMode)`), no `amountReceived`. Una fila sin
   línea contaba como «pagada» pero no sumaba al recaudo.
4. El conteo «N en el sistema · M pagadas» (`catalog.health`) no se refrescaba
   tras confirmar.
5. La fecha se prellenaba con `toISOString().slice(0,16)` (UTC) y el servidor
   leía el texto sin zona: 9:56 p. m. de Colombia → 2:56 a. m.
6. La ventana se cerraba aunque la confirmación fallara, y nada impedía
   confirmar dos veces.

### Piezas

| Archivo | Qué es |
|---|---|
| `server/lib/projectFairManualReceipts.js` | Prefijo privado `private/project-fair-receipts/{submissionId}/`, `manualReceiptKeyBelongs`, `presignManualReceipt`, `verifyManualReceipt` (prefijo + `headReceipt` + primeros bytes) |
| `server/lib/completedReceipts.js` | Suma `presignPrivateReceiptUpload({ prefix })`, `receiptKindOf` y `sniffReceipt`. El criterio del archivo (PDF/JPG/PNG/WebP, 10 MB) es UNO, el de `completedRegistrationSpec` |
| `server/lib/projectFairRegistration.js` → `manualCoverageFor` | PURO: qué otros proyectos de la inscripción puede cubrir el pago y la línea de cada uno |
| `projectFairAdminController.js` → `confirmManualPayment`, `manualReceiptUploadUrl`, `manualReceiptUrl` | La confirmación y el comprobante |
| `POST /admin/postulaciones/:id/manual-payment/receipt-url` (`fairEdit` + `managePayments`) · `GET …/manual-payment/receipt` (`fairRead` + `viewPayments`) | Subir y abrir |
| Columnas `manualPaymentReceiptKey/Name/Mime/Bytes` | En el ensure de `projectFairController.js` (sin atajo: corre entero una vez por instancia) |
| `src/lib/comprobantePagoManual.ts` | Subida directa a S3, propuesta de cobertura, valor esperado, fecha local ↔ ISO |
| `src/pages/admin/PostulacionesPagos.tsx` | La ventana (adjunto, cobertura, aviso de diferencia, revisión) y el bloque de la ficha |

Pruebas: `npm run test:fair:manual-payment` (57, sin base),
`test:fair:manual-payment:e2e` (39) y `test:fair:manual-payment:ui` (23,
Chromium contra el router real) — las dos últimas con
`FAIR_E2E_DATABASE_URL=<postgres local desechable>`. Verificada a la inversa:
sin escribir la línea del cubierto, falla «queda con la tarifa (100.000)».

**Reglas durables:**

- **⚠️ LO QUE CUBRE EL PAGO LO DECLARA QUIEN CONFIRMA** (`coverProjectIds`), no
  se deduce de «lo que debe hoy»: es quien tiene el soporte delante. La
  ventana lo PROPONE (los demás que deben, marcados) y el servidor sólo acepta
  otro proyecto de la MISMA inscripción, activo, postulado y sin pagar; lo
  demás → 409 con el motivo. Sin el campo, cubre sólo la fila (como antes).
- **⚠️ EL DINERO VIVE UNA SOLA VEZ, EN EL ANCLA** — la regla del cobro en
  línea (v4.1299). El cubierto queda `paid`, `paymentConfirmationOrigin =
  'manual_admin'`, `metadata.payment.coveredBy` y SIN `amountReceived`. El
  ancla guarda `metadata.payment.coveredProjects` (lo lee el resumen de la
  inscripción: «cubre FP-…, FP-…»). Una prueba fija la ausencia.
- **LA LÍNEA SE ESCRIBE SÓLO SI FALTABA** (`COALESCE(NULLIF(línea,0), tarifa)`):
  una pagada conserva su línea congelada. La tarifa sale de `pricingRulesOf`
  por la posición del proyecto, como en `registrationBreakdown`.
- **⚠️ UPDATE CONDICIONAL** (`status <> 'paid'`) en el ancla y en cada cubierto,
  más un 409 de entrada si ya estaba pagada: dos clics no confirman dos veces
  ni pisan la primera confirmación.
- **EL SOPORTE ES EL ARCHIVO, LA REFERENCIA ESCRITA O AMBOS — NUNCA NINGUNO.**
- **⚠️ EL ARCHIVO SE COMPRUEBA EN EL SERVIDOR**: clave del prefijo de ESTA
  postulación, objeto real (`headReceipt`) y primeros 32 bytes
  (`receiptKindOf`). Un texto renombrado a .pdf → 422. Lo que el navegador
  declaró al prefirmar no obliga a nada. La clave no viaja a la pantalla
  (`mapRow.manualPaymentReceipt` = nombre, tipo, peso); se abre con un enlace
  firmado de 5 minutos. Un cubierto abre el comprobante del pago que lo cubrió.
- **NO VA A LA BÓVEDA, a propósito.** La Bóveda registra lo que entró por
  Stripe y hay que girar (`paymentDraftFor` exige `providerRef` de Stripe); un
  pago por fuera ya está en la cuenta del comité. Lo confirmado suma a los
  indicadores de la Feria (`inteligencia`, `overview`, `dashboard-intelligence`,
  `catalog.health`), que cuentan `status = 'paid'` y la línea.
- La ventana sólo se cierra si `action` devolvió `true`; la fecha viaja con
  zona (`fechaInputAIso`) y una futura se rechaza (400).

**Lo mismo para los inscritos al evento (v4.1310):** ver la sección «Confirmar
a mano el pago, con el comprobante» de `inscripciones-a-eventos-feria-de-proyectos.md`.
Los dos módulos comparten `verifyPrivateReceipt` (`completedReceipts.js`) y
`src/lib/comprobantePagoManual.ts`.

**Pendientes conocidos:** no hay forma de ANULAR una confirmación manual desde
el panel (sigue como estaba); el comprobante subido y no confirmado queda
huérfano en el prefijo (conviene una regla de ciclo de vida sobre
`private/project-fair-receipts/`, como la de `private/event-receipts/`).
