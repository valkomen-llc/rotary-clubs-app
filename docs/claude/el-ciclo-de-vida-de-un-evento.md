# El ciclo de vida de un evento — v4.1247

## El problema

`GET /api/clubs/:clubId/events` devolvía **todos** los eventos del sitio y
`/eventos` los pintaba tal cual. Nada decidía que un evento ya había pasado:
en rotary4281.org el «Instituto Rotary Cancún 2026» (17–19/09/2026) seguía
promocionándose como próximo el 26/10/2026. No había ni filtro por fecha en la
consulta, ni en la página, ni estado editorial (todo evento existente estaba
«publicado» por omisión).

## Dónde vive el criterio

`server/lib/eventLifecycle.js` — **una sola fuente de verdad**. Lo importan el
servidor (`routes/clubs.js`, `routes/calendar.js`), el sitio público
(`src/pages/Eventos.tsx`, `src/pages/EventoDetalle.tsx`) y el panel
(`src/pages/admin/Events.tsx`). Sus tipos están en `eventLifecycle.d.ts`, al
lado. No toca la base: la zona de respaldo del sitio la resuelve
`server/lib/siteEventTimezone.js`.

## Dos ejes que no se mezclan

| Eje | Valores | Dónde |
|---|---|---|
| Editorial (lo decide una persona) | `draft`, `published`, `cancelled` | `metadata.status`. **Sin valor = `published`**: los eventos que ya existían no cambian. |
| Temporal (se calcula en cada lectura) | `upcoming`, `ongoing`, `finished`, `tbd` | **Nunca se guarda.** Viaja en `event.lifecycle`. |

Otras claves de `metadata` (capacidad «info» del evento, ver
`METADATA_KEYS_BY_CAPABILITY` en `calendar.js`): `timezone` (IANA), `dateTbd`
(fecha por confirmar) y `allDay` (todo el día, sin hora). **No hay columnas
nuevas**: no hace falta `db:push`.

## Reglas de vigencia

1. Con fin posterior al inicio: antes del inicio → próximo; hasta el fin → en
   curso; después → finalizado.
2. **Sin fin** (con o sin hora de inicio): vigente todo su día calendario **en
   la zona del evento**; finalizado desde las 00:00 del día siguiente. No se
   inventa una duración.
3. «Todo el día»: de 00:00 del día de inicio al cierre del día de fin (o del de
   inicio).
4. «Fecha por confirmar»: `startDate` es NOT NULL en la tabla, así que guarda
   un valor de relleno que el ciclo de vida **ignora** y nunca se muestra.
5. Fin anterior al inicio = error de captura: se ignora y rige la regla 2.

## Zona horaria

`startDate`/`endDate` son instantes absolutos (UTC). La zona sólo decide dónde
cae la medianoche y cómo se escribe la hora. Orden de resolución:

evento (`metadata.timezone`) → Setting del sitio `events_timezone` → país del
sitio (`COUNTRY_TIMEZONES`) → variable `EVENTS_DEFAULT_TIMEZONE` →
`America/Bogota`.

⚠️ **El panel escribe y lee las horas en la zona del evento**
(`toZonedInputValue` / `zonedInputToIso`). Hasta v4.1246 el campo mostraba
`toISOString().slice(0,16)` (UTC) y el servidor reinterpretaba lo escrito en
su propia zona: en Colombia, tocar la hora la corría 5 horas. Los datos
guardados ya eran instantes UTC correctos para lo que ve el público, así que no
hay migración.

## Público

- `GET /clubs/:id/events`: sin borradores, cada evento con `lifecycle`,
  `Cache-Control: no-store`. `?scope=upcoming` (en curso + próximos + por
  confirmar, sin cancelados) y `?scope=past` (finalizados) para otros
  consumidores.
- `GET /clubs/:id/events/:ref`: la ficha de un evento **finalizado o
  cancelado se sigue sirviendo** (los enlaces compartidos no se rompen); sólo
  un borrador da 404.
- `/eventos`: en curso (destacados) + próximos por fecha; aparte
  «Próximamente» con los `tbd`. `/eventos/anteriores`: finalizados del más
  reciente al más antiguo. Los cancelados no salen en ninguna de las dos. Las
  categorías filtran en ambas vistas.
- El reparto lo hace `partitionPublicEvents`. El navegador re-evalúa cada
  minuto con su reloj **corregido por la cabecera `Date` del servidor**: un
  evento que termina con la página abierta cambia de sección sin recargar, y un
  equipo con la hora mal puesta no lo resucita.
- La búsqueda pública (`/clubs/:id/search`) tampoco devuelve borradores.

## Panel

`/admin/eventos`: filtros por estado (Todos, Próximos y en curso, Fecha por
confirmar, Finalizados, Borradores, Cancelados), etiquetas en cada fila con lo
que ve el público HOY (calculado por el servidor) y, en «Nuevo evento» y en la
pestaña Información, `ScheduleFields`: estado editorial, zona horaria, fecha
por confirmar, todo el día y **vista previa del estado** que tendrá al guardar.
`GET /calendar` devuelve `eventDefaults.timezone` (la zona del sitio).

## Sin tareas programadas

No hay cron: la clasificación se calcula en cada petición con la hora del
servidor, y la página es una SPA sin render estático; `no-store` evita que un
caché intermedio sirva una lista vieja.

## Pruebas

`npm run test:event-lifecycle` (en `prebuild`): los 14 escenarios del pedido
más el caso real de Cancún con fecha de referencia 26/10/2026.
