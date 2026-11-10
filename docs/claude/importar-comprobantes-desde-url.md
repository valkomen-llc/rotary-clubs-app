# Importar el comprobante de una inscripción desde una URL — v4.1312

Pedido del Distrito 4281 para la Conferencia Distrital: los asistentes migrados
de otra plataforma («Importación histórica», v4.950) dejaron sus comprobantes
allá. El Equipo de Registro pega el enlace en la ficha y Club Platform guarda
**una copia propia**, asociada a la inscripción abierta. Sirve para cualquier
inscripción completada de cualquier evento, no sólo las históricas.

Es una ampliación del comprobante de v4.1291
(`cuenta-del-participante-en-completar-inscripcion.md`): mismas columnas
`receipt*`, mismo prefijo S3 privado, mismo camino único.

## Diagnóstico previo (cómo estaba)

- El comprobante de una inscripción completada vive en cuatro columnas de
  `EventCompletedRegistration` (`receiptKey`, `receiptName`, `receiptMime`,
  `receiptBytes`) y el objeto en S3 bajo `private/event-receipts/{evento}/`,
  sin lectura pública: el panel lo abre con un enlace firmado de 5 minutos.
- Subirlo/reemplazarlo (v4.1291) pasa por `replaceCompletedReceipt`: clave del
  prefijo del evento, no reclamada por otra inscripción, objeto real
  (`headReceipt`), `UPDATE` condicionado a la clave anterior e historial
  `receipt_replaced` con el anterior en `payload.previous`.
- La importación histórica guardó la URL del comprobante del sistema anterior
  en `importMeta.receiptUrl` (sólo como referencia; nunca se descargó).
- ⚠️ El doble de S3 de las pruebas (`receipts-completed-stub.mjs`) no exportaba
  `presignPrivateReceiptUpload`/`verifyPrivateReceipt`, que v4.1310 empezó a
  importar: el extremo a extremo de `test:completed:receipt`, `:path` y
  `:accounts` fallaba al enlazar el router. Reparado aquí.

## Piezas

| Pieza | Qué es |
|---|---|
| `server/lib/receiptUrlFetch.js` | La DESCARGA segura y lo puro: `checkImportUrl`, `isBlockedAddress`, `guardedLookup`, `normalizeShareUrl` (Drive/Dropbox → descarga directa), `redactSourceUrl`, `resolveReceiptName`, `IMPORT_ERRORS` (los mensajes del pedido) y `fetchReceiptFromUrl` |
| `server/lib/completedReceiptImport.js` | El FLUJO: `verifyReceiptImport` (descarga, valida, huella, copia «en espera») y `commitReceiptImport` (vincula por `replaceCompletedReceipt`) |
| `completedReceipts.js` → `putReceiptObject`, `readReceiptObject`, `signedReceiptUrl({ download })` | Guardar lo que trajo el servidor (con metadatos), leer el vigente para su huella, descargar con nombre |
| `POST /admin/completed/:id/receipt-import/verify` · `POST /admin/completed/:id/receipt-import` · `GET …/receipt?download=1` | Capacidad `completed` del evento (`loadDetail`), como subirlo |
| `src/components/admin/events/ComprobanteDeLaInscripcion.tsx` | La tarjeta de la ficha (miniatura, origen, visor, descarga, subir/reemplazar) + `ImportReceiptUrlModal` + `ReceiptViewer`, todos de nivel superior |
| `scripts/test-receipt-url-import.mjs` | `npm run test:receipt-url-import`: 93 sin base (criterio + descarga contra HTTPS local con certificado propio) y 139 con `RECEIPT_IMPORT_E2E_DATABASE_URL` (Postgres real + router real). Verificada a la inversa: sin la guarda del `lookup`, sin revisar redirecciones, sin el duplicado o sin atar la copia a la inscripción → falla |
| `scripts/test-receipt-url-import-ui.mjs` | `npm run test:receipt-url-import:ui` (25, Chromium contra el router real, SDK de S3 real contra un S3 local, 1500 y 390 px) |
| `scripts/fixtures/receipt-url-fetch-local.mjs` | Doble que re-exporta el módulo REAL y sólo le pasa las opciones de prueba (certificado, `*.test` → 127.0.0.1) |

## Reglas durables

- **⚠️ LA DESCARGA LA HACE EL SERVIDOR, CON GUARDAS CONTRA SSRF.** Sólo
  HTTPS y el puerto 443, sin usuario/contraseña en el enlace, sin `localhost`
  ni hosts internos (`.local`, `.internal`, nombres sin punto). La dirección se
  valida **después de resolver el DNS y dentro del mismo `lookup` con el que se
  abre el socket** (`guardedLookup`): validar en un paso y conectar en otro deja
  abierto el «DNS rebinding». Una IP literal no pasa por `lookup` (Node conecta
  directo): `checkImportUrl` la revisa. Bloquea privadas, loopback, link-local
  (incluye 169.254.169.254, metadatos), CGNAT, reservadas, multicast y sus
  formas IPv6 (`::ffff:`, NAT64, 6to4, ULA, fe80). **No usar `fetch()` global
  aquí**: no deja validar la dirección conectada (lo fija una prueba).
- **Cada redirección pasa por las mismas reglas** (máximo 5); de HTTPS a HTTP
  no se sigue. Topes: 8 s de conexión, 25 s en total, 10 MB cortando el flujo
  aunque no venga `Content-Length` (primero el desenlace, después `destroy()`:
  al revés gana «aborted» con el motivo equivocado).
- **No viajan cookies, tokens ni cabeceras de Club Platform**: un User-Agent
  propio y `Accept`. Nada descargado se ejecuta.
- **⚠️ QUÉ ES EL ARCHIVO SE LEE DE SUS BYTES** (`receiptKindOf`: PDF, JPG, PNG,
  WebP). La extensión y el Content-Type no obligan; el nombre se guarda con la
  extensión del tipo REAL. Una página HTML (login de Drive, por ejemplo) da
  «abre una página web, no el archivo».
- **Un enlace con acceso restringido no se intenta eludir**: 401/403 →
  «Descárgalo desde la plataforma original y utiliza «Subir comprobante»».
- **⚠️ SE ASOCIA POR EL ID DE LA INSCRIPCIÓN ABIERTA**, nunca por nombre,
  correo o documento. La copia «en espera» de una verificación lleva en sus
  metadatos S3 el `registration-id` y la huella del enlace redactado: otra
  inscripción no la reclama, y cambiar el enlace después de verificar obliga a
  verificar de nuevo (`staged`; el panel reintenta una vez sin la copia).
- **⚠️ NO CAMBIA EL ESTADO NI EL PAGO.** Ni valida, ni confirma, ni toca el
  valor, la conciliación, la Bóveda o `EventRegistrationPayment`. Lo fija una
  prueba sobre la fuente y otra sobre la base (estado y pagos antes/después).
- **Duplicados por huella SHA-256**: el mismo archivo que el comprobante
  VIGENTE → 409 «Comprobante duplicado» (la huella sale del historial o se
  calcula leyendo el objeto). Si fue un comprobante anterior de la misma
  inscripción, o es el vigente de OTRA inscripción del evento (participante
  duplicado), sólo se AVISA y se asocia a la abierta; la otra no cambia.
- **Trazabilidad**: el `receipt_replaced` lleva `via: 'url_import'`, `next.sha256`
  y `payload.import` (enlace REDACTADO, host, host final, redirecciones, nombre
  original, huella, peso, tipo, si se verificó antes). **La URL completa no se
  guarda**: los valores de la consulta se tapan salvo una lista corta de
  inofensivos (`id`, `export`, `dl`…), porque una URL firmada lleva su llave
  ahí. El comentario nombra el HOST, no el enlace. Los fallos de una
  importación quedan como `receipt_import_failed` (código y host). Los logs de
  consola sólo llevan id, host y código.
- **Sin huérfanos por un fallo propio**: si la vinculación falla, la copia
  subida en ESA petición se borra; la de una verificación se conserva para
  reintentar (si nadie la reclama, la regla de ciclo de vida del prefijo, como
  una subida prefirmada abandonada). Antes de vincular se confirma con
  `HeadObject` que lo guardado existe y pesa lo descargado. El éxito sólo se
  informa después de guardar Y vincular.
- **El participante no ve nada nuevo**: `receipt_import_failed` no está en su
  lista cerrada y `receipt_replaced` sigue siendo «Comprobante de pago
  actualizado».

## La ficha

- Sin comprobante: «Subir comprobante» y, **justo debajo**, «Importar
  comprobante desde URL» (secundario). Si `importMeta.receiptUrl` existe, la
  ventana ofrece «Usar este enlace».
- Con comprobante: «Comprobante adjunto» con miniatura (imagen, enlace firmado)
  o ícono, nombre, tipo, tamaño, fecha y origen (formulario, Equipo de
  Registro, participante o «URL externa (host)», derivado del último
  `receipt_replaced`), y «Ver comprobante» (visor: PDF en iframe, imagen
  ampliable), «Descargar» (`?download=1`, `Content-Disposition: attachment`),
  «Reemplazar comprobante» y «Reemplazar desde URL».

## Verificación en producción

El sandbox no tiene DNS directo (sale por proxy), así que la descarga contra
internet real sólo se puede probar desplegada. Caso real sugerido: en la
Conferencia Distrital, abrir un registro de «Importación histórica», pegar el
enlace público de su comprobante, «Verificar enlace» → «Importar comprobante»,
y comprobar que el estado no cambió y que «Ver comprobante» abre la copia.

## Fase 2 (diseñada, no activada): importación en lote

La importación histórica YA guardó `importMeta.receiptUrl` por inscripción,
así que el lote más seguro NO necesita un CSV que se vincule por nombre:
recorrer las inscripciones del lote (`importBatchId`) que tengan URL y no
tengan comprobante, y llamar `commitReceiptImport` para cada una **por su id**,
con progreso e informe de éxitos/errores (los mismos códigos). Un CSV con
`ID de inscripción | URL` sería el segundo camino, también por id; una fila sin
id inequívoco va a revisión manual, nunca a una coincidencia de nombre. Ojo con
el tope de 120 s de Vercel: por tandas, como las acciones en bloque (v4.1092).
