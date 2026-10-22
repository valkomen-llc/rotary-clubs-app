<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Una sola herramienta: Campañas de Contribución — v4.987 (supersede v4.986; el alcance de escritura lo matiza v4.988)

v4.986 quitó el módulo «Maneras de Contribuir» y, para el sitio, le puso
DEBAJO de la dirección nueva la pantalla vieja rebautizada: un formulario de
contacto, nota, QR y centros, sin forma de crear ni publicar una campaña. El
cliente lo vio desde el panel del Distrito 4281 y lo dijo textual: *«así como
aparece Campañas de Contribución en Club Platform debe aparecer la misma
herramienta integrada para los distritos o sitios. No que montes todo en la
antigua Maneras de Contribuir. Bórrala.»* Esa pantalla se borró.

| Archivo | Qué es |
|---|---|
| `src/pages/admin/ContributionCampaigns.tsx` | LA pantalla. Una sola, para el operador y para un sitio |
| `src/components/admin/contribution/SiteLocalPanel.tsx` | Lo que un sitio le AGREGA a una campaña ajena: contacto, nota, QR, centros |
| `src/components/admin/contribution/DonatePageTextsCard.tsx` | El accesorio: los textos de la página de aportes cuando NO hay campaña |
| `scopedCampaign` / `scopeForSite` en `contributionCampaignController.js` | El ALCANCE: qué campañas existen para quien pregunta y cuáles puede escribir |
| `ContributionCampaign."ownerClubId"` | El DUEÑO. NULL = de la plataforma |

Pruebas: `npm run test:contribution:module` (46 casos de criterio, **sin base,
credenciales ni red**) y `npm run test:contribution:ui` (20 en un navegador con
la API interceptada y los tres roles; pide `playwright` y `esbuild` y se salta
solo).

**Reglas durables:**

- **⚠️ ES LA MISMA PANTALLA, Y LO QUE CAMBIA ES EL ALCANCE.** No hay una vista
  del operador y otra del sitio: `/admin/campanas-contribucion` monta
  `ContributionCampaigns` para todos, y el SERVIDOR dice qué campañas entran
  (`scope`, `own`, `showing` en el listado). Dos pantallas para el mismo
  módulo es exactamente lo que se pagó en v4.986: la del sitio se quedaba
  atrás en cada mejora de la otra, y era además una pantalla vieja con otro
  nombre. Lo fija una prueba que exige que los dos archivos de v4.986 NO
  existan y que la ruta monte una sola.
- **⚠️ EL ALCANCE LO RESUELVE EL SERVIDOR POR ROL, NO LA PANTALLA POR DOMINIO.**
  En el servidor `administrator` es el operador (el mismo criterio de
  `/api/admin/districts`); cualquier otro rol administrativo del panel
  administra SU sitio, y el sitio sale del TOKEN. La regla de v4.986 —«quién
  ve cuál lo decide el contexto de plataforma»— se retira con la segunda
  vista: ya no hay dos cosas entre las que elegir, y deducir el alcance en el
  navegador sería un segundo criterio que se separa en silencio.
- **⚠️ UNA CAMPAÑA TIENE DUEÑO, y `own` es la frontera.** NULL es la campaña
  de la PLATAFORMA: la crea el operador y alcanza a muchos sitios, así que
  ningún sitio la reescribe — le cambiaría la página a los otros veinte. Un
  sitio la VE, y de ella administra lo suyo: contacto, nota, QR y centros de
  acopio, que se SUMAN a la campaña y no la reemplazan (misma
  `OVERRIDE_WHITELIST` + `sanitizeOverride` de siempre). Con valor, la creó
  ESE sitio y es suya entera: la edita, la publica, la pausa y la retira.
  Todas las filas existentes quedan en NULL, que es lo que eran.
- **⚠️ ESCRIBIR LO AJENO RESPONDE 404, NO 403.** `scopedCampaign(req, id,
  { write: true })` devuelve `null` para una campaña que no es de quien
  pregunta, y para quien no la alcanza siquiera: confirmar que existe es la
  mitad de lo que hace falta para ir a buscarla. Pasan por ahí las CINCO
  escrituras de campaña —guardar, estado, borrar, centros centrales, decidir
  una lectura— y una prueba las cuenta.
- **⚠️ EL ALCANCE DE UNA CAMPAÑA DE UN SITIO SE IMPONE AL CREAR **Y** AL
  GUARDAR.** Nace con `targeting = { mode: 'clubs', clubIds: [su sitio] }` y
  `updateCampaign` lo vuelve a fijar en cada PUT si la fila tiene dueño. Sin
  la segunda mitad, bastaría un `PUT` con `mode: 'all'` para publicar en los
  sitios de los demás desde un endpoint que este rol ya tiene — la pantalla
  no ofrece el selector, y esconder un control nunca protege un endpoint
  (v4.868). Verificado a la inversa.
- **TRES SECCIONES DEL EDITOR SON DEL OPERADOR** (`esOperador && <>`):
  Alcance (un sitio no lo decide), Notificaciones (los perfiles son de la
  plataforma y su endpoint responde 403 a un sitio) y Solicitudes de contenido
  (la bandeja sigue `superAdminOnly`; una bandeja que no se puede abrir es
  peor que ninguna, v4.650). Lo demás —identidad, hero, formas de ayudar,
  elementos, galería, centros, panorama, lectura, bloques, cierre, aliados,
  SEO, resultados, historial— es de quien es dueño de la campaña.
- **⚠️ UNA CAMPAÑA AJENA SE ABRE EN SU PANEL LOCAL, NO EN EL EDITOR** (`if
  (!own)` en la pantalla). No se le piden sus centros centrales, sus lecturas
  ni sus métricas, y `getCampaign` no manda su historial ni sus bloqueos de
  publicación —son del operador— sino `local`, que es lo que ese sitio le
  agrega. `SiteLocalPanel` guarda por `/site/override` y `/site/centers` con
  el `campaignId`, y descarta el borrador al cambiar de campaña: la
  información local es POR CAMPAÑA y llevarse el borrador de una a otra lo
  guardaría en la equivocada.
- **⚠️ LOS TEXTOS DE LA PÁGINA SIN CAMPAÑA SON UN ACCESORIO, NO UNA PANTALLA.**
  Eran lo único de la pantalla borrada que no es una campaña, y la página
  pública los SIGUE mostrando cuando ninguna está al aire
  (`ManerasDeContribuir.tsx` lee `ContentSection` page=`contribucion`).
  Borrar el editor y dejar el texto publicado sería dejarlo sin forma de
  corregirse — un fallo mudo. Van como UNA card plegada al final del listado,
  sólo para un sitio, con los MISMOS respaldos que pinta la página.
- **⚠️ `ownerClubId` ESTÁ ENUMERADA EN EL ATAJO DEL ENSURE** (trampa de
  v4.908), y al enumerarla se vio que `feed` (v4.825) nunca lo estuvo: entraba
  junto con `feedRunAt` por casualidad. Una prueba recorre ahora TODOS los
  `ADD COLUMN` del archivo y exige cada uno en el atajo.
- **Las rutas de gestión son `siteRead`/`siteWrite`** —el rol de siempre **O**
  el permiso, por acción (v4.941)—, ya no `superAdminOnly`. Lo que sigue
  siendo del operador es la bandeja de aportes de contenido y nada más.
- **Lo que NO cambió de v4.986 y sigue vigente:** `/admin/maneras-de-contribuir`
  REDIRIGE y sigue declarada en el registro; la página pública
  `/maneras-de-contribuir` no se toca; `contribution_campaigns` y
  `contributions` son dos módulos de permisos; `INSTITUTIONAL_BASE` recibe
  `.view` y `.edit`; `/site/current`, `/site/override` y `/site/centers` se
  conservan (regla aditiva); los ids `ways_to_contribute`, `contribucion` y
  `contribution` no se tocaron; los prompts tampoco.

**Pendientes conocidos:** ~~la bandeja de aportes de contenido sigue siendo del
operador~~ — **RESUELTO en v4.999**: su gate es `requireCampaignAccess` y la
sección se le ofrece al sitio sobre toda campaña que lo alcanza. Y un sitio no puede duplicar una campaña de la plataforma para
hacerla suya: hoy se crea desde cero.
