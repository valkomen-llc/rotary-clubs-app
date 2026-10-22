<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## Rendimiento de carga — v4.659

Se midió el recorrido de una visita y se corrigieron cinco causas. Las reglas
que quedan, para no reintroducirlas:

- **Ningún recurso de terceros bloquea el pintado.** La hoja de Google Fonts
  estaba con `rel="stylesheet"`, así que el navegador no dibujaba NADA hasta
  que respondía `fonts.googleapis.com`. Con el servidor inaccesible, el primer
  contenido tardaba **13,2 s**; con `preload as="style"` + `onload`, **0,28 s**.
  Si se agrega otra fuente o CSS externo, va igual (o autoalojado).
- **`manualChunks` debe fijar el núcleo compartido.** Sólo se asignaba
  `react-dom`, así que React —y el runtime de JSX— caía en el primer chunk que
  lo pidiera: el del editor del panel. Igual `clsx`, que acabó dentro del de
  gráficas. El entry importaba los dos y toda visita pública se tragaba 683 kB
  de librerías del panel. Al agregar una librería pesada al split, comprobar
  que el entry NO la importe: `grep -o 'from"\./vendor-[^"]*"' dist/assets/index-*.js`.
- **Las páginas públicas van con `React.lazy`**, dentro del `<Suspense>` que ya
  envuelve `<Routes>`. Las 36 se importaban de golpe (entry de 823 kB → 256 kB).
  Las **secciones** de la portada (`src/sections/*`) siguen eager a propósito:
  son el primer pintado y cargarlas aparte añadiría un viaje de red.
  Ojo: separar en chunks destapa identificadores no importados que el bundle
  único resolvía por accidente (pasó con `useClub` en `Checkout.tsx`). Tras
  tocar el split, recorrer las rutas públicas antes de publicar.
- **Una petición compartida, no una por componente.** `useSiteImages` lo llaman
  17 componentes —siete en la portada— y cada uno disparaba su par de fetches
  con `_t=Date.now()`, que además impedía el caché del navegador: diez
  peticiones para dos respuestas. Igual el pie de página, que se pedía dos veces
  porque el `type` del club llega vacío en el primer render. Ambos comparten
  ahora la promesa en vuelo y guardan el resultado un rato
  (`invalidateSiteImages()` la descarta tras guardar desde el panel). La portada
  pasó de 14 llamadas a 6.
- **`ensure*Schema` comprueba antes de ejecutar.** Sus sentencias son
  idempotentes pero no gratis: 62 viajes a la base en cada arranque en frío de
  la función (~400 ms en local; 1-2,5 s contra una base gestionada), pagados por
  la primera visita tras un rato sin tráfico. Ahora dos consultas al catálogo
  deciden si hay algo que hacer. La lista de tablas y columnas de
  `ensureEventRegistrationSchema` **no es un número de versión**: enumera los
  objetos reales del archivo, y hay que ampliarla al agregar uno nuevo o la
  comprobación lo dará por presente.

**Pendiente conocido, ajeno a esto:** `getPublicProducts` y `getPublicProduct`
(`productController.js`) filtran por `published`, columna que el modelo
`Product` no tiene —se llama `status`—, así que `/shop` responde 500. Es
anterior a esta versión y no se tocó porque cambia qué productos se publican.
