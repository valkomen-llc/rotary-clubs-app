<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Lo que el panel descarga para abrirse — v4.880

Reporte con captura: «a veces la configuración se queda en blanco, no carga, o
se demora mucho en cargar el administrador o el panel de control». El spinner
de la captura es el `fallback` del `<Suspense>` de `App.tsx`, así que el
problema estaba en CARGAR EL CHUNK, no en los datos de la pantalla.

Pruebas: `npm run test:admin-weight` (20 casos; la parte de navegador pide
`playwright` y `dist/` compilado, y se salta sola si faltan).

**Reglas durables:**

- **⚠️ `AdminLayout` NO IMPORTA `SYSTEM_UPDATES`.** Era la causa principal y la
  más difícil de ver: un `import` de una línea traía `pages/SystemUpdates.tsx`
  —el historial COMPLETO de la plataforma, **1.096 kB**— para escribir «Release
  4.879.0» en la barra lateral, dos veces. Y `AdminLayout` lo monta TODA
  pantalla del panel, así que esa descarga la pagaba cada una. Lo peor no era
  el tamaño: **crecía con cada despliegue**, porque cada versión suma su
  entrada al changelog, y nada avisaba. El número sale ahora de
  `src/lib/appVersion.ts`, que **no importa nada** — si importara algo,
  volvería a arrastrarlo.
- **Las tres versiones son la misma, y lo comprueba una prueba.** Separar el
  número de su changelog es lo que quita el peso; lo que lo hace seguro es que
  `package.json`, `APP_VERSION` y `SYSTEM_UPDATES[0].version` no puedan
  discrepar en silencio — la barra diría una versión y la pantalla de novedades
  otra. Al bumpear hay que tocar los tres.
- **⚠️ LA HOJA DE ESTILOS DEL EDITOR TIENE QUE VIAJAR CON EL EDITOR.** El otro
  hallazgo, y el más sutil. `react-quill-new` son 206 kB y en Configuración se
  usa en UN campo de la pestaña «identidad», mientras que la de entrada es
  «estado»: importarlo estático lo descargaba siempre. Puesto el `lazy()`, el
  chunk SEGUÍA descargándose — porque el `import` del CSS estaba en el módulo
  ESTÁTICO (`RichTextEditor.tsx`), y la regla de `manualChunks` captura todo
  `node_modules/react-quill*`: Vite asignaba esa hoja al chunk `vendor-editor`,
  que pasaba a ser dependencia estática de la pantalla y `__vitePreload` lo
  bajaba igual. **El `lazy()` estaba puesto y no servía de nada, sin que nada
  avisara.** Se resolvió moviendo el CSS a `QuillEditor.tsx`, que es el módulo
  perezoso. Al hacer perezoso un componente de una librería con estilos,
  comprobar QUIÉN pide el chunk en el navegador — no basta con escribir
  `lazy()`.
- **`Suspense` vive DENTRO del envoltorio, no en cada pantalla que lo use.**
  Puesto afuera, la siguiente pantalla se olvidaría y el fallo sería mudo:
  React sube al `Suspense` más cercano, que en el panel es el de las rutas, y
  entonces la PANTALLA ENTERA parpadearía a un spinner mientras baja el editor.
- **El respaldo del editor conserva su ALTURA.** Un hueco vacío hace que la
  pantalla salte medio segundo después de abrirse, y eso se lee como que algo
  se rompió.
- **⚠️ UN AHORRO QUE ROMPE LA PANTALLA NO ES UN AHORRO.** La prueba comprueba
  las DOS mitades: que al abrir no se descargue, y que al ir a «Identidad» el
  editor se monte, tenga su barra de herramientas —o sea, que el CSS llegó— y
  se pueda escribir dentro. Sólo la primera mitad dejaría pasar un editor roto
  presentado como una mejora de rendimiento.
- **El peso se MIDE en un navegador, no se estima leyendo el `dist`.** Es lo
  único que distingue «este chunk es dependencia» de «este chunk se descarga»:
  el `lazy()` del editor parecía correcto en el grafo de imports y aun así se
  bajaba. El iniciador de la petición (CDP `Network.requestWillBeSent`) es lo
  que lo destapó.
- **Las tres causas de PANTALLA EN BLANCO se descartaron una por una**, y
  conviene saberlo antes de volver a buscar ahí: los hooks están en su sitio
  (`npm run check:hooks`), no hay **ningún** identificador inexistente
  (`tsc` no reporta un solo TS2304 — el `Plus` de `MissionControl.tsx` que este
  archivo daba por pendiente ya no existe), y el fallo de carga de módulos se
  resolvió en v4.791. Lo que quedaba era el peso.
- **El techo de la prueba (1.600 kB) deja margen a propósito.** Una prueba que
  salta con cada kilobyte se termina desactivando; ésta salta si alguien vuelve
  a colgarle un megabyte al panel, que es el defecto que se corrigió.

**Pendiente conocido:** `News.tsx`, `Publicaciones.tsx` y `Projects.tsx` siguen
importando el editor de forma estática. Ahí es la pieza CENTRAL de la pantalla
—se entra a escribir— así que hacerlo perezoso no ahorraría una espera, sólo la
movería; y tocarlas por simetría cambiaría tres pantallas que hoy funcionan. Si
alguna vez se hace, el envoltorio `RichTextEditor` ya está y el cambio es
sustituir el import. Y `vendor-icons` (133 kB) lo paga toda visita: es lucide ya
sacudido, y bajarlo exigiría revisar los ~60 iconos que importa `AdminLayout`.
