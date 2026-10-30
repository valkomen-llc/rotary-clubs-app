<!-- Lo nuevo de este tema se escribe AQUÍ, no en CLAUDE.md. -->

## Guía de pago por COLROTARIOS / AvalPay en «Completar inscripción» — v4.1268

En el paso 4 del formulario COLROTARIOS (v4.943), elegir «Pasarela de pagos de
COLROTARIOS» despliega una tarjeta con los pasos para aportar en el micrositio
de AvalPay (`https://micrositios.avalpaycenter.com/fundacion-colombian-rotarios-ma`)
y volver a adjuntar el comprobante.

| Pieza | Dónde |
|---|---|
| `normalizePaymentGuide`, `safePaymentUrl`, `publicPaymentGuide`, `paymentGuideSteps` | `server/lib/completedRegistrationSpec.js` (puro) |
| La guía en la configuración pública (`paymentGuide`) | `getPublicCompletedConfig` |
| `PaymentGuideCard` (nivel superior) y la indicación junto al comprobante | `src/pages/CompletarInscripcion.tsx` |
| «Guía de pago (paso 4)» en la configuración del formulario | `EventCompletedRegistrationsManager.tsx` |
| Pruebas | `npm run test:completed:payment-guide` |

### Reglas durables

- **Es una GUÍA, no una integración.** Abrir AvalPay no prueba nada; el
  formulario no pide datos de tarjeta ni bancarios; el registro sigue naciendo
  `submitted` y lo valida el Equipo de Registro con el comprobante.
- **Todo lo del evento es configuración**: `settings.completedForm.paymentGuide`
  = `{ enabled, method, providerName, url, concept, title, intro, buttonLabel,
  warning, receiptHint }`. Textos vacíos = predeterminados. Cambiar proveedor,
  enlace o concepto no exige desplegar. Lo guarda `saveConfig` (con
  `requireEvent`): nadie sin permiso del evento cambia un enlace de pago.
- **El enlace sólo puede ser https** (`safePaymentUrl`). Sin enlace válido la
  guía NO se publica aunque esté encendida: un botón de pago que no lleva a
  ninguna parte es peor que no tenerlo.
- **Los pasos se ARMAN con el proveedor, el concepto y el texto del botón**
  (`paymentGuideSteps`): el paso que dice qué botón pulsar o qué concepto
  elegir nunca contradice al botón o al concepto reales. Sin concepto
  configurado no se inventa uno.
- **La semilla no pisa al panel.** Villavicencio trae la guía desde
  `COMPLETED_FORM_SEEDS` sólo mientras la configuración guardada NO tenga la
  clave `paymentGuide` (su configuración ya existía en producción antes de
  v4.1268). En cuanto el panel guarda —también si la apaga— manda lo guardado.
- **El concepto se verificó antes de publicarlo** (2026-10-30): el campo
  «Aportes Colrotarios» del micrositio ofrece «Conferencia Villavicencio 2027»
  (además de «Feria de Proyectos» y «Conferencia Bidistrital 4281-4271»). Que
  ese sea el concepto AUTORIZADO lo confirma el responsable financiero; el panel
  lo recuerda junto al campo.
- **El enlace abre una pestaña NUEVA** (`target="_blank" rel="noopener
  noreferrer"`): la pestaña de AvalPay no puede tocar el formulario
  (`window.opener === null`). Nunca un iframe.
- **Volver de pagar retoma el paso.** El borrador de `localStorage` guarda
  también `stepIndex` y `wantsAccount` (si escribió contraseña en el paso 1).
  La contraseña NUNCA se guarda: si la pestaña se recargó y había pedido crear
  su acceso, al enviar se le vuelve a pedir en vez de enviar sin cuenta en
  silencio. El comprobante ya subido (su clave de S3, que no da lectura)
  sobrevive a la recarga.
- La tarjeta aparece con una transición corta que se apaga con «reducir
  movimiento» (`motion-reduce:transition-none`) y se desmonta al cambiar de
  método. Tipo y tamaño del comprobante se validan en el navegador
  (`checkReceiptFile`) y en el servidor (`headReceipt`, como siempre).
