<!-- Léelo ANTES de tocar la columna «Exchange» de «Proyectos postulados», la conciliación de traslados de la Feria, sus comprobantes, el perfil exchange_viewer o las tablas Exchange*. -->

## Exchange — traslados y conciliación financiera de la Feria — v4.1335

Pedido del comité (XII Feria, Valledupar 2027): lo recaudado por inscripción
llega a una cuenta de Mercury y se traslada a la de Colrotarios. Documentar
cada traslado, asociarlo a los proyectos, conciliarlo, y que el administrador
autorizado del evento pueda consultar los comprobantes.

### Auditoría (qué había antes)

| Pieza existente | Qué se encontró | Qué hizo Exchange |
|---|---|---|
| Pago de la postulación (`ProjectFairSubmission.status`, Stripe + confirmación manual v4.1308) | Estado del PAGO, independiente | Se lee; nunca se escribe |
| **Traslado de lo cobrado (v4.1025–v4.1026)** | YA existía: cada cobro de la Feria es un `Payment` de la Bóveda; «Registrar traslado» en Postulaciones monta `BulkDisbursementBar` → `Disbursement` por cobro + `DisbursementBatch` (giro agrupado, comprobante compartido, idempotencia, reversión con motivo, `balanceFor` impide trasladar dos veces) | **Es el motor.** Exchange no crea un segundo motor de traslados (regla durable «no hay un segundo motor de desembolsos») |
| Conciliación de inscripciones a EVENTOS (`EventFunds*`, v4.1250) | Dominio propio de los eventos, ligado a `EventRegistration` | No se reutiliza: la Feria vive en la Bóveda. Se tomaron sus criterios (no se confirma sin evidencia, reversión con motivo, totales por moneda) |
| Comprobantes de inscritos a eventos (`ComprobanteDeLaInscripcion.tsx`) | `ReceiptViewer` exportado | **El mismo visor** para los comprobantes de Exchange |
| Archivos privados (`completedReceipts.js`) | `presignPrivateReceiptUpload`, `verifyPrivateReceipt` (prefijo + objeto real + primeros bytes), `signedReceiptUrl` (5 min, descarga con nombre) | Se reutilizan; prefijo propio `private/exchange/<operación>/` |
| Permisos de la Feria (`withAccess`, `ROLE_CAPABILITIES`) | admin/finance/reviewer/translator por correo en la Convocatoria; `viewer` sin acceso (v4.1326) | Cinco capacidades nuevas y el perfil `exchange_viewer` |
| Exportaciones (CSV servidor, Excel y PDF cliente) | — | Columnas Exchange + dos CSV propios |

### Modelo

- **Operación** («Transferencia Exchange») = el giro de la Bóveda: `b:<batchId>`
  (lote) o `d:<disbursementId>` (suelto). **Asignación** = cada fila de
  `Disbursement` (su proyecto, valor y moneda). Un comprobante compartido vive
  UNA vez en el lote; la operación se cuenta UNA vez en los totales.
- **Tres estados independientes**: A. pago (`status`), B. traslado
  (`Disbursement`), C. conciliación (`ExchangeReconciliation.status`:
  `en_conciliacion` · `conciliado` · `con_diferencia`).
- **Estado Exchange de un proyecto** (`projectExchangeState`, puro):
  `no_aplica` (pago sin confirmar) · `pago_directo` (confirmación manual: el
  dinero no pasó por la cuenta de la plataforma) · `sin_traslado` («Pendiente»;
  `needsMovement` si el cobro aún no tiene `Payment`) · `sin_comprobante` ·
  `en_conciliacion` · `parcial` · `con_diferencia` · `conciliado`. Prioridad:
  diferencia > parcial > falta comprobante > en conciliación > conciliado.
  Conciliado sólo si TODAS sus operaciones activas lo están y lo trasladado
  cubre lo esperado (neto del `Payment`, nunca una conversión).
- **Proyecto cubierto** (dos proyectos, un pago): sigue a su ancla (`via`) y no
  suma dos veces.

### Piezas

| Archivo | Qué es |
|---|---|
| `server/lib/exchangeSpec.js` | El criterio PURO: estados, transiciones (`canReconcile`), datos bancarios (`normalizeReconData`, sin tasa de hoy), operación, totales por moneda, filtros, cuentas enmascaradas, accesos (`grantMatches`), la siembra pedida |
| `server/lib/ensureExchangeSchema.js` | Las cinco tablas (`ExchangeReconciliation`, `ExchangeDocument`, `ExchangeEvent`, `ExchangeConfig`, `ExchangeAccessGrant`) |
| `server/lib/exchangeStore.js` | La I/O por lotes. **Lee** la Bóveda con `SELECT *` (sus columnas llegan por ALTER en arranques posteriores); escribe sólo `Exchange*` |
| `server/controllers/exchangeController.js` | Config, accesos, resumen, detalle, archivo firmado y auditado, soportes, datos, conciliación, CSV |
| `projectFairAdminController.js` | Capacidades, `exchange_viewer`, `exchangeGrantFor`, `RESTRICTED_ROW_FIELDS`, columna en `listSubmissions`/`exportCsv`, filtros en `getCatalog` |
| `src/lib/exchange.ts` · `src/components/admin/feria/exchange/*` | Tipos y llamadas; celda, visor (`ExchangeDrawer`), resumen expandible, cuentas y accesos |
| `PostulacionesPagos.tsx` · `projectFairReportPdf.ts` | Integración: columna junto a Pago/Valor, tarjeta móvil, filtros, Excel, PDF (EXCH.) |

Rutas (`server/routes/project-fair.js`, literales antes de `/:id`):

| Ruta | Capacidad |
|---|---|
| `GET /admin/exchange/config` · `/resumen` · `/export.csv?vista=operaciones\|asignaciones` · `/postulaciones/:id` · `/operaciones/:opKey/archivo` | `exchangeView` (descargar: `exchangeDownload`) |
| `POST /operaciones/:opKey/documentos/url` · `/documentos` · `PUT /datos` · `POST /documentos/:docId/retirar` | `exchangeManage` |
| `POST /operaciones/:opKey/estado` | `exchangeReconcile` |
| `PUT /config` · `POST /accesos` · `POST /accesos/:id/revocar` | `exchangeConfig` |

Las GET usan `fairOrExchange` (sólo rechaza sesiones inválidas; autoriza
`withAccess`); las escrituras, además, `fairEdit`/`fairManage`. También
`/admin/catalog` y `/admin/postulaciones` pasaron a `fairOrExchange` con
capacidad `{ any: ['view', 'exchangeView'] }`.

### Permisos

| Perfil | Ver | Descargar | Datos/soportes | Conciliar | Cuentas y accesos |
|---|---|---|---|---|---|
| admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| finance | ✓ | ✓ | ✓ | ✓ | — |
| reviewer / translator / viewer | — | — | — | — | — |
| **exchange_viewer** (administrador del evento) | ✓ su edición | según el acceso | — | — | — |

`exchange_viewer` se resuelve SÓLO si no hay perfil del comité, por dos vías:
un `ExchangeAccessGrant` de la edición (ligado al **usuario** en su primer uso;
el correo sólo enlaza la primera vez; revocable) o la **relación con el
evento**: `assertEventCapability(req, eventoDeLaEdición, 'payments')`. Tiene
`view: false` (sin ficha, expediente, formularios ni seguimiento documental) y
`viewPersonalData: false`: la fila del listado sale en LISTA BLANCA
(`RESTRICTED_ROW_FIELDS`). Una operación que toque otra edición no existe para
él (404). Registrar el traslado sigue siendo de quien tiene `managePayments` y
pasa la guardia de la Bóveda (`requireSiteAdmin`).

**Siembra pedida**: `INITIAL_EVENT_ADMIN_GRANTS` (valjupa@…) se siembra UNA vez
en la edición ABIERTA como fila de `ExchangeAccessGrant` (`source =
'siembra_v4.1335'`, marca `acceso_sembrado`). Revocarla es definitivo. No es una
regla de permiso: ninguna comparación de correo decide fuera de esa fila. Para
que esa persona vea la columna tiene que poder iniciar sesión en el panel donde
se abre «Proyectos postulados».

### Reglas durables

- **⚠️ EXCHANGE NO REGISTRA NI REVIERTE TRASLADOS.** «Registrar traslado» (en la
  columna o el visor) llama a la MISMA resolución (`transfers/resolve`) y monta
  la MISMA `BulkDisbursementBar`. Corregir un traslado = revertirlo en la Bóveda
  con motivo y registrarlo de nuevo. Lo fijan pruebas que leen los archivos.
- **⚠️ ADJUNTAR NO ES CONCILIAR.** «Conciliado» exige comprobante (de la Bóveda
  o un soporte de Exchange) + referencia, lo marca `exchangeReconcile`, y una
  diferencia medible se explica. UPDATE condicional al estado leído (dos clics
  no concilian dos veces).
- **⚠️ LO CONCILIADO NO SE EDITA**: se reabre con motivo y el evento
  `conciliacion_reabierta` guarda la conciliación anterior completa. Los datos
  llevan `version` (409 `STALE`) y su historial antes/después.
- **⚠️ MONEDAS**: ninguna conversión con tasa actual. Se registran enviado,
  recibido, tasa CON fuente y comisión; la diferencia sólo se mide en la misma
  moneda. Los indicadores van por moneda: COP y USD nunca se suman.
- **No hay DELETE** en Exchange: los soportes se retiran con motivo, los accesos
  se revocan con motivo. Cada consulta y descarga de un comprobante queda en
  `ExchangeEvent`. La clave de S3 nunca viaja al navegador.
- **Cuentas por edición** (`ExchangeConfig`): nada en el código; enmascaradas
  para quien no configura; una enmascarada que vuelve no pisa la guardada; la
  bitácora no guarda números completos. Al registrar los datos de una operación
  se congela la foto de las cuentas en su conciliación.

### Pruebas

- `npm run test:fair:exchange` (en `prebuild`, 92): criterio e invariantes
  (no escribe la Bóveda ni pagos, lista blanca, capacidades, rutas, tablas
  protegidas). Verificada a la inversa.
- `FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/…?sslmode=disable npm run test:fair:exchange:e2e`
  (90, Postgres real + S3 simulado): estados, agrupada sin duplicar, parcial,
  pago directo, cubierto, filtros combinados, visor y archivo firmado,
  conciliación, reapertura con original, diferencias y tasa con fuente,
  versión, soportes por bytes, acceso del administrador del evento (lista
  blanca, sin descarga, otra edición 404, revocación), siembra, cuentas,
  CSV sin duplicar, reversión en la Bóveda, y la HUELLA de pagos, traslados y
  postulaciones idéntica antes y después.
- `FAIR_E2E_DATABASE_URL=… npm run test:fair:exchange:ui` (31, Chromium,
  1600 y 390 px; necesita `dist/assets` para el CSS): columna junto a Pago y
  Valor, clip → visor de comprobantes correcto, conciliar desde el visor,
  resumen y filtros, «Registrar traslado» con la barra de la Bóveda, el
  administrador del evento (sin correos, sin ficha, sin acciones) y el
  teléfono sin desbordes. Encontró que la pantalla se cerraba a todo perfil
  sin `view` («Tu perfil no tiene acceso a este módulo»): ahora entra también
  con `exchangeView`.

### Pendientes conocidos

- **Exchange para inscripciones a EVENTOS** (Conferencia Distrital): ya tienen
  su propio motor (`EventFunds*`, v4.1250). Unificar la VISTA es posible
  reutilizando `exchangeSpec` (estados y totales); el registro debe seguir en
  cada dominio.
- **Soportes huérfanos**: un archivo subido y no adjuntado queda en
  `private/exchange/`; conviene una regla de ciclo de vida del bucket.
- **Registrar el traslado sin ser administrador del sitio**: un `finance` de la
  Convocatoria que no pasa `requireSiteAdmin` de la Bóveda no puede registrar
  (igual que desde v4.1026); sí concilia y documenta.
