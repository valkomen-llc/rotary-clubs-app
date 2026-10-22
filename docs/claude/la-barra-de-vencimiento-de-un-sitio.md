<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## La barra de vencimiento de un sitio — v4.878

| Archivo | Qué es |
|---|---|
| `src/lib/siteExpiration.ts` | El CRITERIO. **Puro**: qué estado enciende la barra y por qué |
| `src/components/ExpirationBanner.tsx` | La barra roja de la portada |
| `Navbar.tsx` (`showBannerOffset`) | El desplazamiento del menú, que tiene que coincidir |

Pruebas: `npm run test:expiration` (128 casos desde v4.1204; el bloque de navegador monta el
componente REAL y pide `playwright`, y se salta solo si falta).

**Reglas durables:**

- **EL ESTADO MANDA; LA CASILLA SUMA.** Se reportó con dos sitios delante:
  `rotarypasto.org` mostraba la barra y `rotarynuevocali.org` no, estando los
  dos en «Expirado / Vencido». La barra **nunca miró** `subscriptionStatus`:
  dependía sólo de `expirationBannerActive`, una casilla aparte que alguien
  había marcado a mano en uno y no en el otro. O sea que poner un sitio en
  «Expirado» no hacía **nada visible**, y no había forma de notarlo salvo
  comparando dos sitios. Ahora el estado enciende la barra siempre y la casilla
  queda para lo único que el estado no cubre: avisar ANTES del vencimiento, con
  el sitio todavía activo.
- **⚠️ NO SE DERIVA DE `expirationDate`.** Sería lo aparentemente natural —«si
  la fecha pasó, está vencido»— y es justo lo que no se puede hacer sin mirar
  la base de producción primero: hay sitios con una fecha vieja y la
  suscripción al día, y la consecuencia de equivocarse es una barra ROJA de
  impago en la portada de un club que sí pagó. La fecha es un dato de
  facturación; el estado es la decisión. Se lee la decisión, y una prueba lee
  el archivo y falla si `expirationDate` reaparece en el criterio.
- **El catálogo de estados es CERRADO** (`EXPIRED_SUBSCRIPTION_STATUSES`).
  `inactive` es un prospecto que nunca contrató y `pending` es un cobro en
  curso: en ninguno de los dos «Sitio en periodo de renovación» sería cierto.
- **⚠️ LA BARRA Y EL MENÚ DECIDEN CON LA MISMA FUNCIÓN.** La barra es `sticky`
  y `Navbar` se desplaza para dejarle sitio (`showBannerOffset`). Con la
  condición escrita en los dos lados —que es como estaba— alcanza con tocar uno
  para que el menú se monte encima del aviso, y eso no lo ve ninguna otra
  comprobación.
- **Un sitio vencido no puede apagar la barra desde la casilla, y la ficha lo
  DICE** (`bannerLockNotice`). Sin ese aviso, el panel muestra una casilla sin
  marcar mientras la portada muestra la barra: es pintar el indicador en contra
  del veredicto, el defecto que este archivo ya prohibió una vez (v4.787).
- **El estado ya viajaba al navegador y nadie lo leía.** `by-domain` arma la
  respuesta con `{ ...activeClub }` —la fila entera de Prisma—, así que no hizo
  falta tocar el servidor. Si algún día esa respuesta pasa a una lista de
  campos, `subscriptionStatus` tiene que estar en ella; lo comprueba una prueba
  sobre el archivo.
- **⚠️ ALCANZA A LOS SITIOS QUE EL SISTEMA MARCA SOLO.** `/api/cron/…` pasa a
  `status: 'inactive'` y `subscriptionStatus: 'expired'` todo sitio cuya fecha
  de expiración tenga más de cinco días. Esos sitios pasan a mostrar la barra,
  que es lo correcto —están suspendidos— pero es un cambio visible en varias
  portadas a la vez, no sólo en la que se reportó. Si un sitio no debía
  mostrarla, lo que se corrige es su estado de suscripción.
- **Pagar sigue apagándola.** El webhook de cobro ya dejaba `subscriptionStatus:
  'active'` y `expirationBannerActive: false` en la misma escritura, así que al
  renovar la barra desaparece sola. La derivación no cambia eso.

**Pendiente conocido:** ~~`expirationBannerMessage` no lo lee la barra~~ —
**RESUELTO en v4.1204** sólo para la barra MANUAL: los veredictos derivados del
estado y de la fecha llevan su propio texto, que no puede contradecir al
veredicto.

### La fecha decide y la casilla no se queda vieja — v4.1204

Reporte con la ficha delante: Club Rotario Bogotá Occidente en «Activo»,
«Pagado / Activo», expiración 04/09/2027, y rotarybogotaoccidente.org con la
barra roja «VENCIMIENTO — Sitio en periodo de renovación…».

| Pieza | Qué es |
|---|---|
| `subscriptionHealth` (`src/lib/siteExpiration.ts`) | El CRITERIO. **Puro**: fase, barra, texto, días restantes y avisos. La consumen la barra, el menú y el panel |
| `server/lib/subscriptionHealth.js` | Espejo MÍNIMO del servidor: `daysUntilExpiration`, `isComfortablyActive`, `shouldClearManualBanner` |
| `server/lib/siteConfigCache.js` | La caché de `by-domain`, extraída para que el guardado la pueda vaciar |
| `src/components/admin/SubscriptionHealthPanel.tsx` | La tarjeta de estado, en las SEIS pantallas de sitios |

Pruebas: `npm run test:expiration` (128 casos, con el bloque de navegador que
monta la barra REAL). Verificadas a la inversa: reintroduciendo «la casilla
manda sobre la fecha» fallan 7, incluida la de navegador.

- **⚠️ LA CAUSA ERA LA CASILLA MANUAL, QUE NADIE APAGABA.** El criterio de
  v4.878 era `estado vencido` **O** `expirationBannerActive`, y esa casilla sólo
  la desmarcaba el webhook de Stripe. Un sitio renovado A MANO desde el panel
  —que es como se renueva casi siempre— quedaba con la casilla encendida para
  siempre y la barra roja sobre un club al día. No fallaba nada: la barra
  obedecía un dato viejo.
- **⚠️ SUPERSEDE «NO SE DERIVA DE `expirationDate`» de v4.878, pero sólo a
  medias y a propósito.** El estado SIGUE mandando cuando dice «vencido» —una
  fecha futura con el estado vencido pinta la barra y AVISA de la
  contradicción en el panel—. Lo que la fecha decide ahora es el caso
  «Pagado / Activo»: más de `RENEWAL_WINDOW_DAYS` (15) por delante → **al día,
  ninguna barra, aunque la casilla esté marcada** (`manualFlagIgnored`, y el
  panel lo dice); dentro de la ventana → aviso PREVENTIVO ámbar, no la barra
  roja; fecha pasada → vencimiento, y pasada la gracia del cron
  (`GRACE_DAYS`, 5) → suspensión. La casilla manual sólo decide donde no hay
  fecha que mirar. La consecuencia que v4.878 temía —barra roja de impago sobre
  un club que pagó— queda imposible por construcción en vez de evitada por no
  mirar la fecha.
- **`pending` NUNCA dice «suspendido»**: es un cobro en curso. Avisa en ámbar
  sólo si el vencimiento está cerca, y el sitio sigue en línea.
- **LOS DÍAS SE CUENTAN EN BOGOTÁ, la fecha se lee por sus partes UTC.** La
  función corre en UTC: con el día de hoy en UTC, la ventana se abriría cinco
  horas antes; y `expirationDate` es medianoche UTC del día facturado, así que
  leída en hora local se correría al día anterior.
- **⚠️ GUARDAR UN SITIO LIMPIA LA CASILLA VIEJA** (`shouldClearManualBanner` en
  `updateClub`). Se decide sobre el RESULTADO de mezclar la fila y la petición,
  no sobre la petición sola: guardar el nombre del club también tiene que
  limpiarla. **Sólo apaga, nunca enciende** — encenderla es una decisión de una
  persona. No se migró ninguna fila: un despliegue no escribe en la base, y el
  criterio ya oculta la barra en el acto; la casilla se limpia en el siguiente
  guardado.
- **⚠️ LA CACHÉ DE `by-domain` SE VACÍA AL GUARDAR** (`invalidateSiteConfig`):
  la renovación desde el panel, el `PUT` de un distrito, la renovación por
  Stripe y la suspensión del cron. Vivía como constante dentro de
  `routes/clubs.js` y nadie podía vaciarla. Es EN MEMORIA por instancia: las
  demás instancias la renuevan al vencer su TTL (20 s), y el panel además pide
  con `fresh=1`.
- **LOS DOS ESPEJOS SE COMPARAN POR SALIDAS.** Con dos cuentas de días, el panel
  diría «al día» y el servidor dejaría la casilla encendida, o al revés.
- **LA TARJETA DEL PANEL ES UNA SOLA, COMPARTIDA POR LAS SEIS PANTALLAS**, y
  calcula sobre lo que hay EN PANTALLA, así que es también vista previa: estado
  del sitio, estado de pago, fecha, días restantes, período de renovación, qué
  barra se va a pintar, última actualización y avisos. Con la condición escrita
  en cada pantalla, el panel diría una cosa y la portada otra — que es lo que se
  reportó.
- **No hay excepción por sitio ni se esconde nada con CSS.** El criterio es
  global; la barra ni se monta cuando no corresponde.
