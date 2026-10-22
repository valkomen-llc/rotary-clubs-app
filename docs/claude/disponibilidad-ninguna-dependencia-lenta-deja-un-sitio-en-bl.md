<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Disponibilidad: ninguna dependencia lenta deja un sitio en blanco — v4.1180

Reporte con dos capturas de rotary4281.org: carga eterna, a veces en blanco y a
veces en «Cargando plataforma…», que se resolvía recargando o cambiando de red.

| Archivo | Qué es |
|---|---|
| `server/lib/resilience.js` | `withDeadline`, `createSwrCache` (fresco → calculado → VIEJO ante fallo o plazo vencido, con dedupe en vuelo) y `serverTiming`. **Puro** |
| `server/lib/documentBudget.js` | Los presupuestos (`DOCUMENT_BUDGET`, `SITE_CONFIG_BUDGET`), las claves de caché y las cabeceras base del documento |
| `api/index.js` | El documento con plazo y respaldo; `GET /api/health/live` (sin base) y `/api/health/deps` (503 si degradada) |
| `server/routes/clubs.js` | `/by-domain` con caché SWR, `fresh=1` para saltarla y 503 cuando la base no responde |
| `src/lib/siteBoot.ts` · `ClubContext.tsx` | Arranque del navegador: timeout, reintentos acotados, última configuración buena y pantalla con «Reintentar» |
| `server/lib/siteHealthSpec.js` · `scripts/site-health.mjs` | El monitor reutilizable (`npm run site:health <dominios>`) y sus objetivos medibles |

Pruebas: `npm run test:resilience` (36 casos, sin base ni red; verificadas a la
inversa), más `test:spa` y `test:district-site`.

- **⚠️ LA CAUSA ERA QUE EL DOCUMENTO ESPERABA A LA BASE SIN TOPE.** Toda página
  pasa por el catch-all, y el `<head>` del SEO y la búsqueda de redirecciones
  consultaban la base antes de responder; `/by-domain` hacía ~8 consultas
  seguidas sin caché ni plazo, y el `fetch` de `ClubContext` no tenía timeout.
  Con Neon frío o el pool ocupado por los crons, la respuesta tardaba lo que la
  base quisiera —hasta los 300 s de la función—. Recargar «arreglaba» porque
  caía en otra instancia. **Nada de esto era DNS.**
- **⚠️ UNA DEPENDENCIA OPCIONAL NUNCA RETIENE EL DOCUMENTO.** Redirecciones
  (1,5 s) y render del SEO (2,5 s) van con `withDeadline`; vencido el plazo se
  sirve la copia vieja de la caché o el `index.html` base, que la SPA pinta
  igual. `X-Doc-Source` dice cuál salió. Medido con la base colgada: 200 en ~4 s
  en vez de colgar.
- **⚠️ STALE-WHILE-ERROR, NO STALE-WHILE-REVALIDATE A CIEGAS.** La caché sirve
  la copia vieja sólo cuando calcular falla o vence; mientras la base responde
  se calcula. `fresh=1` la salta —lo usan el panel al verificar el dominio y
  `refreshClub`— para que un cambio guardado se vea en el acto.
- **LA BASE CAÍDA ES 503, NO 500, y nunca se cachea un error** (`no-store`). Un
  500 manda a buscar un defecto en el código; un 503 dice «dependencia».
- **⚠️ EL NAVEGADOR NO ESPERA PARA SIEMPRE.** 10 s por intento, tres intentos
  con espera, la última configuración buena del sitio (≤7 días) para pintar al
  instante y revalidar detrás, aviso a los 5 s, y si todo falla una pantalla con
  motivo y «Reintentar». Nunca un spinner infinito.
- **LAS CABECERAS SON EL DIAGNÓSTICO**: `X-Doc-Source`, `X-Site-Config` y
  `Server-Timing` separan dominio / servidor / API / base sin acceso a los logs.
  `npm run site:health dominio1 dominio2` las lee, mide contra `HEALTH_TARGETS`
  y sale con código 2/1/0. Es de sólo lectura: sirve para todos los dominios.
- **Reversión**: revertir el commit squash; o ajustar sin desplegar
  `DOC_REDIRECTS_BUDGET_MS`, `DOC_RENDER_BUDGET_MS` y `SITE_CONFIG_BUDGET_MS`.
- **No se tocó el DNS** (externo, webhostbox). Recomendado y NO aplicado: sumar
  el A `216.150.16.1` que pide Vercel, apuntar `www` al CNAME que da Vercel y
  bajar el TTL antes de cualquier cambio.
