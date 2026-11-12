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

## Columnas FDD y FAP en Proyectos postulados — v4.1304

Pedido del comité: ver lo que cada club pide al Distrito sin abrir proyecto por
proyecto. Orden de la tabla: Registro | Inscripción | Proyecto | Club / Distrito |
Responsable | Área de enfoque | Presupuesto | **FDD** | **FAP** | Estado | Pago | Valor.

| Archivo | Qué es |
|---|---|
| `server/lib/projectFairFddAmounts.js` | El CRITERIO: de dónde salen los valores y la ÚNICA lectura (SQL) |
| `server/controllers/projectFairAdminController.js` | `listSubmissions` y `exportCsv` agregan `SQL_FDD_COLUMNS`; `SORTABLE` suma `FDD_SORTABLE`; `buildFilters` los rangos `fddMin/fddMax/fapMin/fapMax`; `mapRow` → `fddAmountsOf` |
| `src/pages/admin/PostulacionesPagos.tsx` | `SortHeader` (ayuda accesible), `AmountCell`, `fmtUsdAmount`, filtros de rango, Excel con hoja «Columnas» |
| `src/lib/projectFairReportPdf.ts` | Columnas FDD/FAP y leyenda en el PDF |

Pruebas: `npm run test:fair:fdd-columns` (sin base; con
`FDD_TEST_DATABASE_URL=<postgres desechable>` corre además los doce escenarios
contra Postgres real) y `npm run test:fair:fdd-columns:ui` (navegador, 1500 y
390 px; necesita `dist/assets` para el CSS).

**Reglas durables:**

- **⚠️ NO HAY CAMPO NUEVO.** FDD = `answers.fdd.requestedUsd` y FAP =
  `answers.fdd.fapGoalUsd` de la fila de `"ProjectFairProjectForm"` con
  `formKey = 'fdd_2026_2027'` y `"submissionId"` = el proyecto. Nada de esto
  escribe: lo que guardó el club no se normaliza en la base.
- **CADA FILA LEE SU PROYECTO**, por `id` (nunca por club, correo ni
  inscripción): con dos proyectos, cada uno muestra lo suyo.
- **⚠️ UNA SOLA LECTURA, EN SQL** (`sqlUsdAmount`): la misma expresión muestra,
  ordena (numérico, vacíos al final), filtra por rango y exporta. No hay un
  segundo parser en el navegador. Acepta el texto del `<input type="number">`
  y formatos históricos («5.000» = miles, «5000,5», «US$ 2,500.75», «1e3»);
  lo demás (negativos, texto) es NULL y se marca «ilegible». Los tramos de
  dígitos están acotados para que ningún texto guardado rompa la consulta.
- **«—» ≠ «USD 0»**: vacío/ausente/sin formulario es null; un cero escrito es 0.
  En CSV/Excel el vacío es celda vacía, no 0.
- **⚠️ RECARGAR EN EL MISMO CLIC VA POR `reloadNext()`** (ref a `loadRows`).
  `setTimeout(() => loadRows(1), 0)` cerraba sobre el render anterior: ordenar
  pedía el orden del clic previo y «Limpiar» pedía con los filtros puestos.
  Defecto heredado, corregido en v4.1304 para orden, «Limpiar», archivadas y
  tamaño de página.
- Los formatos «5.000» y similares son AMBIGUOS en origen (en Colombia el punto
  separa miles; en el campo numérico, decimales). Se leen como miles porque un
  importe en USD no lleva tres decimales, y la celda lo marca con lo que el
  club escribió para que el comité lo confirme.

## «Ver» abre el expediente integral — v4.1324

El botón «Ver» de Proyectos postulados (también embebido aquí) abre el
expediente completo del proyecto y suma el menú «⋯»; la fila muestra la
insignia «EN · estado» de la traducción. Todo está en
`docs/claude/expediente-integral-del-proyecto.md`.
