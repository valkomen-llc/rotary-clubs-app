<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## En qué moneda se cobra un aporte — v4.834

Hasta v4.833 la moneda salía de `resolveClubCurrency` y nada más: la del SITIO.
Con un sitio colombiano eso significa que **todo el mundo pagaba en pesos** — un
rotario de Estados Unidos leyendo la página en inglés veía «$» y recibía un
cargo en COP. Estaba declarado como pendiente conocido: *«la pasarela cobra en
UNA sola moneda por club»*.

| Archivo | Qué es |
|---|---|
| `server/lib/donationCurrency.js` | El CRITERIO. **Puro**: qué moneda le toca a cada visitante y por qué |
| `src/lib/donationCurrency.ts` | Espejo en el navegador |
| `GET /api/financial/currency` | La consulta pública que hace el modal antes de pintar montos |

Pruebas: `npm run test:currency` (40 casos, **sin base, credenciales ni red**;
incluye las 112 combinaciones de la matriz comparadas entre los dos espejos). El
smoke de navegador cubre los tres casos sobre la página de Aportes real (13).

**Reglas durables:**

- **La regla es una CONJUNCIÓN**: se cobra en la moneda del sitio sólo si el
  idioma activo es el nacional **y** el visitante está en el país del sitio.
  Cualquier otra combinación cobra en dólares. **Ninguna de las dos señales
  alcanza sola**: el idioma no distingue al rotario mexicano que lee en español
  —a ése se le cobraba en pesos—, y el país no distingue al colombiano que lee
  el sitio en inglés y espera dólares.
- **El idioma se compara con `isNationalLocale` / `isNationalLang`**, los
  catálogos que ya deciden qué registro de evento se ofrece (v4.652) y qué
  logotipo se pinta (v4.699). Una tercera lista se separaría en silencio.
- **Sin geolocalización manda el idioma, y eso es a propósito.** El borde falla
  —VPN, red corporativa, un proveedor que no manda el encabezado—. Con el idioma
  nacional y sin país se conserva la moneda del sitio, que es lo que pasaba
  antes: ante la duda no se cambia lo que ya funcionaba. Al revés —dólares por
  defecto— convertiría un fallo de geolocalización en un cambio de moneda para
  el visitante mayoritario.
- **El PAÍS nunca lo manda el cliente**: sale del encabezado del borde
  (`x-vercel-ip-country` y sus equivalentes). El IDIOMA sí viene del cliente, y
  está bien: es la elección del propio visitante en el selector.
- **La moneda la decide el SERVIDOR también al cobrar.** `createDonationCheckout`
  la resuelve con el mismo criterio y sigue ignorando la del cuerpo — lo que
  cambió es que ya no es siempre la del sitio. Así la cifra que el visitante vio
  es la que se le cobra.
- **El modal PREGUNTA la moneda antes de pintar un monto**
  (`GET /financial/currency`). No puede deducirla: el país sólo lo ve el
  servidor. Ofrecer «50.000» a alguien a quien se le van a cobrar dólares es el
  defecto más caro que este cambio puede introducir.
- **Esa consulta va sin caché** (`no-store`): la respuesta depende de quién
  pregunta, y una caché intermedia le serviría a un visitante la moneda de otro.
  Y **degrada a la moneda del sitio** ante cualquier fallo: no poder aportar
  sería peor que aportar en la moneda de siempre.
- **LOS IMPORTES NO SE CONVIERTEN.** No hay tasa de cambio configurada e
  inventar una está prohibido —la misma regla que rige el `fx` de las
  inscripciones a eventos—. Lo que cambia es la moneda EN LA QUE SE PIDE, con
  los montos sugeridos propios de esa moneda (`donationPresets`), no el mismo
  número releído en otra unidad.
- **Los montos configurados por un bloque sólo valen en SU moneda**
  (`blockAmountsApply`). El club los eligió en la del sitio: ofrecer «50.000» en
  dólares invitaría a un aporte de US$ 50.000. Cuando la moneda cambia se
  reemplazan por los de la moneda, no se convierten.
- **La MEMBRESÍA se queda en la moneda del sitio**, y no es un olvido: su
  importe es un PRECIO que el club fijó —«$50.000 al año»— y cobrarlo en otra
  moneda exige convertirlo. Cobrar «50.000 dólares» sería catastrófico. Cuando
  haga falta, la vía es un importe por moneda en el bloque, no una conversión al
  vuelo. Lo comprueba una prueba sobre el archivo.
- **El motivo de la decisión viaja a la metadata de Stripe** (`currencyReason`).
  Sin ese rastro, «¿por qué este aporte entró en dólares?» no se puede contestar
  dos semanas después — el mismo vacío que el CRM tenía antes de
  `CrmWebhookEvent`.
- **Un sitio que ya cobra en dólares no decide nada**, y se contesta ANTES que
  el interruptor: apagarlo no puede cambiar el comportamiento de un sitio al que
  esta función no alcanza.
- **El interruptor es de la INSTALACIÓN, no del sitio** (`DONATION_INTL_CURRENCY`,
  `off` lo apaga). La pasarela es una sola para toda la plataforma
  (`STRIPE_SECRET_KEY`): si la cuenta no pudiera presentar dólares, el problema
  sería de todos los sitios a la vez. Es la salida sin desplegar código.
- **El visitante internacional VE por qué se le cobra en dólares.** Sin esa
  línea, quien esperaba pesos no tiene forma de saber si es un error.

**Riesgo que hay que verificar en producción:** que la cuenta de Stripe de la
plataforma pueda **presentar** cargos en USD además de en COP. Si los rechazara,
el error de Stripe se propaga textual a la pantalla y la salida inmediata es
`DONATION_INTL_CURRENCY=off`. No se puede comprobar desde el entorno de
desarrollo — hay que probar un aporte real con el sitio en inglés.
