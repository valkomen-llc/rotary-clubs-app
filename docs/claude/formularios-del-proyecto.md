<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Formularios del proyecto (Gestión de Proyectos) — v4.788

Un proyecto inscrito tiene **varios** formularios, no uno. La lista vive en
`server/lib/projectFormsRegistry.js`:

| `formKey` | Plantilla | Tabla | Config editable |
|---|---|---|---|
| `master` | `projectFairMasterForm.js` — Formulación del Proyecto | `ProjectFairMasterForm` | `cfg.masterForm` |
| `fdd_2026_2027` | `projectFairFddForm.js` — Solicitud de Aportes del FDD | `ProjectFairProjectForm` | `cfg.fddForm` |

**Agregar un formulario nuevo** = escribir su plantilla + una entrada en el
registro. No se tocan rutas, ni pantallas, ni el modelo de datos: el panel del
club (`src/pages/MiProyecto.tsx`) dibuja una tarjeta por lo que devuelve
`/portal/me → forms`, y `ProjectFormView` renderiza cualquier plantilla.

**Reglas durables:**

- **Las dos tablas conviven a propósito.** La Formulación se queda en
  `ProjectFairMasterForm` porque migrar respuestas ya guardadas de los clubes
  sería una operación destructiva sobre datos de producción. Tienen la misma
  forma; `storageOf(formKey)` decide cuál se usa. No unificarlas.
- **Dos formas de marcar el espacio institucional**, y la diferencia es quién
  escribe, no cómo se ve:
  - `districtSpace: true` — lo diligencian el club **y** el Distrito. Se guarda
    con el resto de `answers`. Es lo que usa la Aprobación institucional del
    FDD (decisión del cliente, v4.643): el Gestor la llena con lo que le
    corresponde al proyecto y al club, y el Distrito la confirma. Sus campos
    van **sin `required`** a propósito, para que no bloqueen el envío.
  - `adminOnly: true` — no la escribe nunca el club. Se guarda en la columna
    `approval`, aparte de `answers`, y toda escritura que llega del panel del
    club pasa por `stripProtected`. Queda disponible para un formulario futuro
    que sí necesite una sección cerrada.

  En ambos casos el único camino administrativo es
  `PUT /admin/postulaciones/:id/forms/:formKey/approval`, con rol
  administrativo del sitio y permiso `changeStatus`; sólo escribe la sección
  institucional y sólo los campos que la plantilla declara.
- **El estado que ve el usuario se deriva, no se guarda** (`deriveState`): así
  no puede haber una fila "enviada" con 40% de avance.
- **`prefill` y `prefillFrom`** son la precarga: el primero copia datos de la
  inscripción; el segundo, respuestas de otro formulario del mismo proyecto
  (`'master.objetivos.generalObjective'`). Sólo actúan al crear el borrador.
- El motor común (avance, validación, campos derivados) está en
  `server/lib/projectFormEngine.js`, con su espejo en `src/lib/projectForms.ts`.
  El servidor valida siempre, aunque el navegador ya lo haya hecho.

### Retirar un campo de una plantilla (v4.788)

El comité quitó del paso 5 (Presupuesto) de la Formulación los tres conceptos
internacionales: «Aporte clubes internacionales», «Distrito Internacional» y
«Fundación Rotaria». Parece un cambio de tres líneas y tiene dos trampas.
Pruebas: `npm run test:project-form` (31 casos, sin base ni red).

- **Borrarlo del código NO alcanza: lo guardado manda.** `templateFor` mezcla la
  plantilla de `projectFairMasterForm.js` con la copia que la convocatoria tenga
  en `ProjectFairConfig`, y el merge **reemplaza los arrays enteros**: si la fila
  guardada trae su propio `masterForm.sections`, el cambio del archivo no llega
  nunca a producción. Es la misma trampa del catálogo de clubes (v4.707) y del
  Generador de Pendones. `dropRetiredBudgetRows` lo limpia **al leer**, dentro de
  `normalizeSavedConfig`, junto a la etiqueta de los CADRES y el orden de los
  distritos: así se autorrepara y **no hay que escribir en la base durante un
  despliegue**, que es lo que prohíbe la sección de base de datos de este
  archivo. Sólo toca las filas nombradas y devuelve la misma referencia cuando
  no hay nada que quitar.
- **Retirar un campo es dejar de PEDIRLO, no dejar de mostrarlo.** La ficha
  administrativa, el PDF y el Word dibujan la tabla recorriendo `rows`, así que
  una fila borrada se lleva con ella el valor que un club ya hubiera escrito:
  seguiría en la base, invisible, en una postulación que se paga. Las filas
  retiradas se DECLARAN en el campo (`retiredRows`) y `matrixRowsToShow` las
  añade **si tienen valor** — vacías no, nadie necesita ver un concepto muerto y
  en blanco. Misma regla que `RETIRED_LABELS` en el registro de eventos.
- **El rótulo «(retirado del formulario)» se pone UNA vez**, dentro de
  `matrixRowsToShow`. Son tres vistas y escribirlo tres veces las deja
  separarse; sin él, un concepto retirado se lee como si todavía se pidiera.
- **Quitar filas no puede bajarle el avance a nadie.** Una tabla cuenta como
  diligenciada con CUALQUIER celda llena (`anyCellFilled`), así que una
  postulación que sólo había llenado un concepto ya retirado sigue contando.
  Comprobarlo al retirar un campo de otro tipo, donde la regla puede no valer.
- Al retirar otra fila: agregarla a `RETIRED_BUDGET_ROWS`, no borrarla y ya.
