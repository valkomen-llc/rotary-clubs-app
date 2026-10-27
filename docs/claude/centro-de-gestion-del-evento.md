<!-- Léelo ANTES de tocar el dashboard de la Feria o sus vistas embebidas. -->

## Centro de Gestión del Evento (dashboard de la Feria) — v4.1259

Pedido del comité organizador (Valledupar 2027): consultar y operar las
postulaciones de proyectos y las inscripciones al evento desde el dashboard,
sin navegar a los módulos.

| Archivo | Qué es |
|---|---|
| `src/components/admin/feria/EventManagementCenter.tsx` | Pestañas, tarjetas con indicadores y vistas embebidas |
| `src/pages/admin/ProjectFairDashboard.tsx` | Lo monta debajo de la cabecera; el Resumen conserva indicadores y gráficos |
| `src/pages/admin/PostulacionesPagos.tsx` | Props `embedded` y `eventId` (modo embebido) |
| `src/components/admin/events/EventRegistrationsManager.tsx` | Filtros rápidos (`QUICK_FILTERS`) |

Pruebas: `npm run test:management-center` (29). Verificado en navegador con la
API simulada a 1280 y 390 px.

**Reglas durables:**

- **⚠️ NO HAY SEGUNDA FUENTE DE DATOS NI SEGUNDA PANTALLA.** Las pestañas montan
  `PostulacionesPagos embedded` y `EventRegistrationTab view="inscripciones"`.
  Las cifras de las tarjetas salen de los tableros de esos módulos
  (`/project-fair/admin/inteligencia`, `/event-registrations/admin/dashboard`):
  coinciden por construcción. La prueba fija que el centro no llame a otro
  endpoint ni escriba nada.
- **LOS DOS PROCESOS NO SE MEZCLAN.** Cada tarjeta cuenta lo suyo; no se suman
  postulaciones con asistentes ni se deduce un estado del otro.
- **PERMISOS: una pestaña aparece sólo si su endpoint responde.** 401/403/404
  la ocultan; otro fallo se dice con «Reintentar» (una lista vacía por error de
  red se leería como «no hay nadie»). El backend autoriza cada petición como
  siempre.
- **El modo embebido de Postulaciones fija la edición en una variable de
  módulo** (`embeddedEventId`, leída por `currentEventId()`), porque la URL es
  la del dashboard. Se fija en un efecto declarado ANTES de los que cargan
  datos y se suelta al desmontar: en desarrollo React monta dos veces y, sólo
  con el inicializador del estado, la segunda vuelta pediría sin edición.
  `Frame` (página con `AdminLayout` o nada) vive en el ámbito del módulo.
- **La pestaña vive en la URL** (`?panel=proyectos|inscripciones`) y al volver
  al Resumen se revalidan las tarjetas y el tablero.
- **Los filtros nuevos viven en el SERVIDOR del módulo**: las vistas de
  proyectos en `VIEW_FILTERS` (`en_revision` ya NO incluye `needs_changes`,
  que es `requieren_ajustes`) y la acreditación de inscripciones en
  `buildFilters` (`accredited=yes|no`), así alcanzan al tablero y a las
  exportaciones del módulo.

**Pendientes conocidos:** el listado de postulaciones sigue sin mandar
`?evento=` (heredado del módulo, ver `postulacion-de-proyectos.md`): la vista
embebida muestra lo mismo que el módulo. El dashboard sigue pidiendo su
tablero con la edición de Valledupar escrita en el cliente
(`fetchDashboard`); el Centro de Gestión usa `data.event.id`.
