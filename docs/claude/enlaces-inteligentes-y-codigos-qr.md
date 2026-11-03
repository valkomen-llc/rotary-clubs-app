<!-- Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Enlaces inteligentes y códigos QR dinámicos — v4.1278

El bloque **Configuración → Identidad → «Redirecciones de Enlaces»** (v4.781,
v4.993) pasa a llamarse **«Enlaces inteligentes y códigos QR»**. Todo lo de
`redirecciones-de-enlaces-por-sitio.md` sigue vigente: este archivo cubre SÓLO
lo que se le agregó encima. Es UNA implementación para distritos, clubes,
ferias, eventos y cualquier sitio: el aislamiento es por `clubId` del token,
como en v4.993, y no hay una línea distinta por tipo de sitio.

**Qué hace**: cada enlace corto (`dominio.org/inscripcion`) puede tener uno o
varios **códigos QR** —afiche, Instagram, presentación, invitación— que llevan
al mismo destino y se miden **por separado**. El QR codifica una dirección
NUESTRA, `https://dominio.org/inscripcion?qr=<código>`, no el destino: cambiar
el destino, pausar, vencer, reactivar o extender la vigencia nunca invalida la
imagen ya impresa.

| Archivo | Qué es |
|---|---|
| `server/lib/linkQr.js` | El CRITERIO. **Puro**: forma del código, vigencia (30/90/nunca/fecha), estado efectivo, diseño y legibilidad, página institucional |
| `src/lib/linkQr.ts` | El espejo del navegador: presets, medios, rótulos, `normalizeDesign`, `trackingUrl`, `qrAccessState` |
| `src/lib/qrRender.ts` | El render: matriz con la librería `qrcode`, dibujo propio en SVG, canvas (PNG) y PDF (`jspdf`) con logo y etiqueta |
| `server/lib/ensureLinkRedirectSchema.js` | Tres tablas nuevas y siete columnas nuevas, enumeradas en el atajo |
| `server/lib/linkRedirectStore.js` | `attachQrs`, `lookupQrByCode`, `recordClick({qr})`, `recordBlockedScan`, CRUD de QR, `qrStatsFor`, `overviewFor` |
| `server/controllers/linkRedirectController.js` · `server/routes/link-redirects.js` | `/overview` y `/:id/qrs…` |
| `api/index.js` (catch-all) | Lee `?qr=`, evalúa estado y vigencia, registra, quita `qr` de la query reenviada, sirve la página cuando no salta |
| `src/components/admin/LinkRedirectsPanel.tsx` | El listado, el resumen del sitio, el editor del enlace y las estadísticas del enlace con la comparación entre QR |
| `src/components/admin/link-qr/` | `QrDrawer` (los QR de un enlace), `QrEditor` (crear/editar, vista previa, descargas), `QrStatsModal`, `StatsBits`, `api.ts`, `qrDownloads.ts` |

Pruebas: `npm run test:qr` (107 casos) además de `test:links` (101) y
`test:redirects` (65), todas sin Postgres, credenciales ni red.

### Reglas durables

- **⚠️ EL QR CODIFICA UNA DIRECCIÓN NUESTRA, NUNCA EL DESTINO.** Es la decisión
  de la que cuelga todo lo demás: un afiche impreso en marzo sigue funcionando
  en noviembre con otro destino, y el mismo código puede pausarse, vencer y
  volver a funcionar **sin generar otra imagen**. La URL es
  `https://dominio/slug?qr=código` (sin prefijo `/r/`: se reutiliza el salto
  que ya existe).
- **⚠️ EL CÓDIGO (`code`) ES PERMANENTE Y ÚNICO EN TODA LA PLATAFORMA.**
  Diez caracteres de un alfabeto sin `0/o/1/l/i` (se lee en voz alta cuando
  el lector falla), generado con `crypto` en el servidor. El índice único
  **no es parcial**: un código eliminado no se reutiliza, porque está impreso
  en alguna parte. Editar nombre, campaña, diseño, vigencia o estado nunca lo
  toca; descargarlo mil veces da mil veces la misma imagen.
- **⚠️ «VENCIDO» NO ES UN ESTADO GUARDADO: SE DERIVA DEL RELOJ.** La fila
  guarda `status` (active | paused | disabled) y `expiresAt`;
  `qrAccessState(qr, now)` decide en el escaneo. Por eso **extender la
  vigencia reactiva el código** sin tocar nada más, y por eso un código vence
  sin que nadie escriba en la base. El orden de severidad no es negociable:
  eliminado → deshabilitado → vencido → pausado → activo.
- **⚠️ LA FECHA DE VENCIMIENTO LA CALCULA EL SERVIDOR** (`expiryFor`), nunca se
  acepta la del navegador. 30 y 90 días vencen **al final del último día**,
  no a esta misma hora dentro de 30 días: un afiche no puede dejar de
  funcionar a mitad de la tarde del evento. La fecha propia tiene que ser
  futura. Lo fija una prueba que busca que `"expiresAt"` nunca se asigne
  desde `patch`.
- **UN QR QUE NO SALTA MUESTRA UNA PÁGINA INSTITUCIONAL, NO LA PORTADA NI UN
  «NO ENCONTRADO».** Es HTML entero servido desde el catch-all (quien llega es
  un teléfono apuntando a un afiche), con `noindex`, **sin caché** (un código
  pausado que se reactiva tiene que volver a saltar en el escaneo siguiente),
  503 + `Retry-After` para pausado y 410 para vencido, deshabilitado o
  eliminado. Nombre del sitio y enlace de vuelta se escapan.
- **⚠️ EL ESCANEO DE UN CÓDIGO QUE NO SALTA SE REGISTRA APARTE** (`outcome`
  en el evento, `blockedScans` en el QR, `blocked` en su diario) y **nunca
  suma a los clics del enlace ni a los escaneos buenos**: nadie llegó al
  destino. «Siguen escaneando el afiche viejo» es lo que le dice al
  administrador si vale la pena extender la vigencia. Los bots no se
  registran ahí: de un código que no salta, una vista previa no dice nada.
- **⚠️ SIGUE SIENDO UNA SOLA IDA A LA BASE.** `recordClick` recibe `qr` y las
  mismas CTEs mantienen además el visitante del QR, su agregado diario y sus
  contadores; `recordBlockedScan` es otra única sentencia. La prueba de
  v4.993 que cuenta los `db.query` de `recordClick` (dos: humano y bot) sigue
  en pie y hay otra para el bloqueado (uno).
- **⚠️ POR QR Y DIRECTO SE DISTINGUEN POR EL IDENTIFICADOR, NO POR EL
  `Referer`.** Un escaneo desde la cámara llega sin referencia, así que caería
  en «Directo o desconocido» como el de WhatsApp. `qrId` / `accessKind` en el
  evento, `qrScans` en el enlace y en su diario son lo que separa las dos
  cifras sin recorrer eventos. **Lo que se mide son accesos a la dirección
  codificada en el QR**, y la pantalla lo dice: si alguien comparte esa
  dirección por chat, su tráfico se atribuye al mismo QR; ninguna cifra es
  una inscripción confirmada.
- **`?qr=` SE QUITA ANTES DE REENVIAR LA QUERY** (`stripQrParam`). Al destino
  le llega lo que traía el visitante —sus UTM—, no nuestra contabilidad. Y
  **un acceso por QR nunca se sirve como permanente** aunque el enlace sea
  301: un 301 cacheado en el teléfono dejaría de contar cada escaneo
  siguiente, y medir es exactamente lo que el QR vino a hacer.
- **LOS QR VIAJAN DENTRO DE LA LECTURA CACHEADA (60 s)**, colgados de su
  enlace, **incluidos los pausados, vencidos y eliminados**: un código
  impreso que ya no sirve tiene que contestar con la página, y eso exige
  encontrarlo. Toda escritura de QR invalida la caché. El único camino que
  consulta por código (`lookupQrByCode`) es el raro: la visita trae `?qr=` y
  ningún enlace **activo** casó —el enlace fue pausado o eliminado— y merece
  la página en vez de la portada.
- **UN QR SE BUSCA SIEMPRE POR (qrId, linkId, clubId).** Un QR de otro enlace
  o de otro sitio **no existe** (404, nunca 403), igual que los enlaces. El
  gate de las rutas es el mismo de v4.993: ni un rol más ni uno menos.
- **⚠️ LA LEGIBILIDAD SE PROTEGE EN EL CRITERIO, NO EN LA PANTALLA.**
  `normalizeDesign` (idéntica en servidor y navegador, lo fija la prueba)
  **rechaza** un código más claro que el fondo —un QR invertido lo leen pocos
  lectores— y un contraste menor a 3:1; **avisa** por debajo de 4,5:1 y con
  menos de 2 módulos de margen; y **fuerza H** cuando hay logotipo, que ocupa
  como máximo el 22 % del lado sobre un respaldo del color de fondo. La
  etiqueta va **fuera** del código, en una banda inferior, nunca encima.
- **⚠️ LA IMAGEN SE VERIFICA CON DOS CODIFICADORES INDEPENDIENTES.** La
  matriz la calcula `qrcode` (la librería estándar, cuatro niveles); el
  generador propio de v4.648 (`src/lib/qrcode.ts`, nivel M) no comparte una
  línea con ella. `test:qr` exige que los dos den **la misma matriz** para la
  misma URL. No se agregó una segunda librería al bundle del panel por
  capricho: la propia no tiene los niveles L/Q/H que el logotipo necesita.
- **SVG, PNG Y PDF SALEN DE LA MISMA GEOMETRÍA** (`geometry()`): entero por
  módulo, mismo margen, mismo logo en el mismo sitio. La vista previa de la
  pantalla ES la imagen que se descarga. Los módulos del SVG van en UN
  `<path>`, no en mil `<rect>`. El PDF usa `jspdf`, que ya era dependencia, y
  se importa a demanda.
- **SI EL LOGOTIPO NO SE PUEDE CARGAR (CORS), SE DESCARGA SIN LOGO Y SE
  AVISA.** Un código sin logo sigue siendo funcional; una pieza sin imagen,
  no. Con logo, la corrección ya es H, así que la imagen sin él es igual de
  válida.
- **EL LISTADO Y EL RESUMEN DEL SITIO NO RECORREN EVENTOS.** La cantidad de QR
  por enlace es una consulta sobre la tabla de códigos; el resumen suma
  contadores y agregados diarios acotados por `clubId`. Lo fija una prueba que
  mira qué tablas tocaron.
- **LAS TRES TABLAS NUEVAS VIVEN FUERA DE PRISMA** y están en la lista del
  guardián de `db:push`: `LinkRedirectQr` es el código IMPRESO en cada pieza.
  Las columnas nuevas de las tablas de v4.993 van con `ADD COLUMN IF NOT
  EXISTS` y **enumeradas en `EXPECTED_COLUMNS`**, o el `ALTER` no correría
  nunca en una base que estrenó el módulo antes.

### Modelo de datos (resumen)

- `LinkRedirect` **+** `name`, `qrScans`.
- `LinkRedirectEvent` **+** `qrId` (vacío = directo), `accessKind`
  (`link` | `qr`), `outcome` (`redirected` | `expired` | `paused` |
  `disabled` | `deleted`).
- `LinkRedirectDaily` **+** `qrScans`. `LinkRedirectAudit` **+** `qrId`.
- `LinkRedirectQr`: `code` (único global), `name`, `campaign`, `medium`
  (impreso | redes | presentacion | correo | whatsapp | otro), `label`,
  `design` (JSONB: fg, bg, size, margin, ecLevel, logoUrl, caption), `status`,
  `validityPreset`, `expiresAt`, contadores (`totalScans`, `uniqueVisitors`,
  `botHits`, `blockedScans`, `lastScanAt`), borrado suave, trazabilidad.
- `LinkRedirectQrDaily` (`qrId`, `day`): scans, uniques, bots, blocked.
- `LinkRedirectQrVisitor` (`qrId`, `visitorKey`): el único exacto y O(1) del
  QR, con la misma semilla seudónima de v4.993 (sin IP guardada).

### API

`GET /api/link-redirects/overview?period=` · `GET|POST /:id/qrs` ·
`GET /:id/qrs/:qrId/stats` · `PATCH /:id/qrs/:qrId/status` ·
`PUT|DELETE /:id/qrs/:qrId` (DELETE exige `confirm`, 428). `POST /:id/qrs`
recibe `{ name, campaign, medium, label, design, validity: { preset,
customDate } }`; el `PUT` sólo cambia la vigencia si viene `validity`.
`GET /:id/stats` devuelve además `totals.qrScans/linkClicks`, `series[].qrScans`,
`qrs[]` con escaneos del período y `recent[]`.

### Pendientes conocidos

- **Integración con inscripciones y aportes**: el evento guarda `qrId` y el
  QR guarda `campaign`, pero no hay todavía ningún cruce con
  `EventRegistration` ni con la Bóveda. Cuando se haga, la atribución tiene
  que apoyarse en un evento de conversión real, no en «alguien abrió la URL».
- **Retención** de `LinkRedirectEvent` (ya pendiente desde v4.993) y
  exportación a CSV.
- El **enlace pausado** sin `?qr=` sigue cayendo en la portada / «no
  encontrado» como antes; sólo el escaneo de un QR recibe la página
  institucional.
- El QR no se genera en el servidor (no hay endpoint de imagen): si hiciera
  falta incrustarlo en un correo, el mismo `qrcode` sirve en Node.
