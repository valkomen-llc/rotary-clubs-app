<!-- Léelo ANTES de tocar cuánto vale la inscripción de un proyecto de la Feria (la línea `amountCop`/`amountUsd`, `lineAmountFor`, `orderFor`, `registrationBreakdown`, `manualCoverageFor`) o «Editar valor» de la ficha. -->

## Editar el valor de la inscripción de un proyecto — v4.1313

Pedido del comité (XII Feria, Valledupar 2027) con la ficha del proyecto
delante: poder cambiar, desde «Ver» en Proyectos postulados, el valor de la
inscripción de un proyecto: de $250.000 a $100.000 o a cualquier otro valor.

Hasta v4.1312 el valor de cada proyecto salía SIEMPRE de la tarifa de su
posición (`lineAmountFor(rules, projectIndex)`: primero 250.000, segundo
100.000). No había cómo fijar un valor distinto para un proyecto concreto
(tarifa especial, una segunda postulación que entró como primera, un acuerdo
puntual) sin tocar la base a mano.

### Piezas

| Archivo | Qué es |
|---|---|
| `server/lib/projectFairRegistration.js` | El CRITERIO, puro: `amountOverrideOf`, `lineAmountOfRow`, `parseAmountInput`, `amountOverridePlan`, `AMOUNT_OVERRIDE_MAX` |
| `projectFairAdminController.js` → `updateProjectAmount` | La escritura: línea + marca, historial, cobro abierto expirado |
| `POST /admin/postulaciones/:id/amount` | `fairEdit` + capacidad `managePayments` (admin y finanzas) |
| `getSubmission` → `pricing` · `mapRow.amountOverride` | Lo que la ventana necesita: tarifas de la convocatoria y el ajuste vigente |
| `src/components/admin/feria/EditarValorProyecto.tsx` | La ventana (en el ámbito del módulo, nunca dentro de la ficha) |
| `src/pages/admin/PostulacionesPagos.tsx` | Botón «Editar valor» en la cabecera, renglón «Valor de la inscripción» en Datos, enlace en la tarjeta «Valor Inscripción» de Pago, «Valor ajustado» en el listado, columna en el Excel |

Pruebas: `npm run test:fair:amount-override` (49, sin base ni red).

### Reglas durables

- **⚠️ `lineAmountOfRow` ES LA ÚNICA PUERTA DEL VALOR DE UN PROYECTO.**
  `orderFor` (lo que el club paga desde «Mi proyecto» y lo que va a Stripe),
  `registrationBreakdown` (el desglose del perfil y de la ficha) y
  `manualCoverageFor` (lo que propone «Confirmar pago manualmente») leen el
  valor por ahí: el ajuste si lo hay, si no la tarifa de su posición. Una
  prueba fija que ninguna de las tres vuelva a llamar a `lineAmountFor`
  directo. Si aparece un cuarto lugar que calcule cuánto vale un proyecto,
  tiene que pasar por `lineAmountOfRow`.
- **SIN COLUMNA NUEVA.** El ajuste vive en `metadata.amountOverride`
  (`amount`, `currency`, `tariff`, `previous`, `reason`, `by`, `byId`, `at`) y
  la LÍNEA en `amountCop`/`amountUsd`, que es lo que ya muestra la columna
  «Valor» y lo que ya suman los indicadores (`collectedFirst/Second`,
  `pendingFirst/Second`, `totalCop`). No hay `ensure` ni atajo que tocar.
- **EL AJUSTE SÓLO VALE EN LA MONEDA DE LA CONVOCATORIA.** Si la convocatoria
  cambiara de COP a USD, `lineAmountOfRow` lo ignora en vez de cobrar pesos
  como dólares.
- **ESCRIBIR LA TARIFA QUITA LA MARCA.** Un valor igual a la tarifa de su
  posición se guarda sin `amountOverride`, para que un cambio posterior de
  tarifas en Convocatoria le vuelva a aplicar. «Volver a la tarifa»
  (`clear: true`) hace lo mismo.
- **⚠️ UN PROYECTO PAGADO SE PUEDE AJUSTAR, PERO SÓLO SU LÍNEA.** Cambia lo que
  suma al recaudo y al saldo; NO cambia `amountReceived` (lo que cobró la
  pasarela), el estado del pago, Stripe ni la Bóveda, y no cobra ni
  reembolsa nada. La ventana lo dice. Una prueba fija que el endpoint no
  escriba `amountReceived` ni `status`. Uno **reembolsado** no se ajusta (409).
- **UPDATE CONDICIONAL** (`status IS NOT DISTINCT FROM` el leído): si el pago
  se confirmó o se reembolsó entre la lectura y la escritura, 409 sin tocar.
- **UN COBRO ABIERTO SE EXPIRA.** Si la fila (o el ancla de su orden,
  `metadata.pendingOrder.sessionId`) tiene una sesión de Stripe abierta, se
  expira: el club no paga el valor anterior. Es limpieza; si Stripe no
  responde, `reusableCheckout` igual descarta la sesión en el siguiente
  intento porque compara el importe.
- **MOTIVO OBLIGATORIO (≥ 5) Y TOPES DE CORDURA** (`AMOUNT_OVERRIDE_MAX`:
  50.000.000 COP / 20.000 USD; cero y negativos, 400). El valor escrito se lee
  en el servidor (`parseAmountInput`: «100000», «100.000», «$ 1.250.000»,
  «100000,50»); la ventana usa la misma regla sólo para la vista previa.
- **HISTORIAL**: evento `amount_changed` con `before`/`after` (línea y ajuste),
  tarifa, moneda, estado del pago y si se cerró un cobro.
- La USD de una fila en COP se recalcula con la TRM de la fila (`trmRate`); sin
  TRM queda en `null`.

**Pendientes conocidos:**

- No hay «exonerar» (valor 0): un proyecto en cero no tendría orden que cobrar
  y quedaría debiendo para siempre. Si se pide, va como un estado de pago
  propio, no como un valor.
- Ajustar un proyecto pagado no reescribe `metadata.payment.coveredProjects`
  del ancla: ahí queda lo que se cobró, que es lo correcto para el
  comprobante.
