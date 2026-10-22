<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Campañas de Contribución — v4.807 (COMPLETO, F1-F5)

«Maneras de Contribuir» es una landing de campañas configurable desde el
Administrador Central y desplegable a los sitios por targeting. F1 entregó
el modelo, el criterio puro y el editor central; F2, la página pública con
fallback exacto; F3, los elementos requeridos, los centros de acopio y los
aliados; F4, el panorama con fuentes, los bloques informativos, el cierre y
la vía local de cada club; F5, las métricas, su panel y la tarjeta social.
Las NUEVE secciones del spec están implementadas.

| Archivo | Qué es |
|---|---|
| `server/lib/contributionSpec.js` | El CRITERIO. **Puro**: tipos, estados, targeting, validación de indicadores, whitelist de overrides, mezcla por sitio |
| `src/lib/contributionSpec.ts` | Espejo mínimo en el navegador (catálogos del editor, estado efectivo, avisos en vivo) |
| `server/lib/ensureContributionSchema.js` | Crea las 5 tablas en runtime |
| `server/controllers/contributionCampaignController.js` | CRUD, estados con historial, caché de lectura pública, token de vista previa |
| `server/routes/contribution-campaigns.js` | Gestión (operador) + lectura pública |
| `src/pages/admin/ContributionCampaigns.tsx` | La pantalla del Administrador Central |
| `src/components/campaign/CampaignLanding.tsx` | La landing pública de campaña (F2) |
| `src/components/DonationModal.tsx` | El modal de donación COMPARTIDO, con la moneda real del club |

Pruebas: `npm run test:contribution` (150 casos). **Sin base, credenciales ni
red**; el espejo se compara por SALIDAS con esbuild y se salta solo si falta.

**Reglas durables:**

- **La campaña es una REFERENCIA, no un clon.** Todos los sitios comparten una
  base: la campaña es UNA fila y cada sitio la resuelve al leer
  (`/api/contribution-campaigns/active?clubId=`). Es la decisión contraria al
  ecosistema del Distrito (v4.747) y con motivo: aquellos contenidos son del
  club de origen y el clon da autonomía; una campaña es de la plataforma y
  corregir una cifra debe reflejarse en todos los sitios al instante.
- **Sin campaña activa, la página genérica se pinta EXACTAMENTE igual.** El
  fallback es el rollout: todo se despliega apagado por construcción y la
  lectura pública DEGRADA a `{ campaign: null }` ante cualquier fallo — esto
  corre en cada visita de la página de aportes y no puede responder 500.
- **El estado efectivo se DERIVA, no se empuja** (`effectiveStatus`, con `now`
  como parámetro — pureza). `scheduled` con inicio vencido se sirve como
  activa; `active` con fin vencido, como finalizada. Sin cron. `paused` no se
  reactiva sola: es una decisión del operador, no del calendario.
- **Un indicador sin fuente NO se publica.** `source` y `updatedAt` son
  obligatorios por indicador; lo decide `validateForPublish` en el servidor
  (la capa 3 de emergencySpec: el administrador escribe, el código decide) y
  el editor avisa en vivo con el MISMO criterio y los MISMOS mensajes del
  espejo. `resolveForSite` además filtra: un indicador activo sin fuente no
  viaja al público aunque esté guardado.
- **Los tipos de desastre salen de `emergencySpec.js`** (`DISASTER_TYPES`),
  no de una segunda lista: dos catálogos de desastres se separan en silencio.
  El `otro` de los desastres se excluye a propósito — el catálogo cierra con
  su propio `otro` genérico.
- **El targeting por distrito usa el criterio DOBLE** de v4.744/v4.748:
  `districtId` O el número dentro de `Club.district`, que es una LISTA
  («4271, 4281», partida con `parseDistrictTags`). «42811» no cuenta como
  4281. Si dos campañas alcanzan un sitio, gana la de mayor `priority`
  (desempate: `publishedAt` más reciente, luego id — estable a propósito) y
  nunca se decide en silencio.
- **La frontera de lo local es ESTRUCTURAL** (`OVERRIDE_WHITELIST`:
  `contact`, `localNote`, `qrImage`). `sanitizeOverride` descarta cualquier
  otra clave — lo que no está en la lista no se puede ni expresar en la
  petición (patrón `stripProtected`). El override viaja en su propia clave
  (`local`), nunca mezclado con el contenido central.
- **El estado no se escribe sin historial** (`ContributionCampaignHistory`,
  patrón EventRegistrationHistory). Publicar/programar valida y devuelve los
  motivos CONCRETOS (422 con la lista). Una campaña que estuvo al aire no se
  borra: se archiva — sólo se elimina un borrador que nunca se publicó.
- **El único camino de cobro es `/financial/donate`** (modal → Stripe
  Checkout → webhook). Desde v4.808 lo usan TAMBIÉN las tarjetas de la página
  de Aportes — ver la sección siguiente. Ojo con la moneda: el cobro sale en
  la del club (Colombia → COP), así que hay que verificar `club_currency` del
  sitio receptor ANTES de publicar una campaña.
