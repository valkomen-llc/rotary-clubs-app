<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## La pantalla en blanco del panel — v4.791

Reporte: «cada vez que intento ingresar al administrador de contenidos la página
se queda en blanco; tengo que cargarla de manera forzada varias veces». Es la
secuela directa del `React.lazy` de v4.659 combinado con la cadencia de
despliegue de este sitio, y son TRES defectos encadenados.

| Archivo | Qué es |
|---|---|
| `server/lib/staticAssets.js` | El CRITERIO. **Puro**: qué dirección es un archivo del build y qué es una página |
| `api/index.js` | El 404 de verdad y el `Cache-Control` del documento |
| `src/lib/lazyWithRetry.ts` | Reintento, recarga contada y el oyente de `vite:preloadError` |
| `src/components/ChunkErrorBoundary.tsx` | La última red: ninguna pantalla en blanco sin motivo |

Pruebas: `npm run test:spa` (39 casos; la parte de navegador pide `playwright` y
`esbuild` y **se salta sola** si faltan).

**Reglas durables:**

- **Un archivo que no existe responde 404, NUNCA el documento.** `vercel.json`
  reescribe todo lo que no es `/api/` a la función, así que
  `/assets/ContentStudio-VIEJO.js` —el que pide una pestaña con el `index.html`
  del despliegue anterior— llegaba al catch-all y recibía la aplicación entera
  con estado **200** y `Content-Type: text/html`. El navegador intenta
  interpretar HTML como módulo y falla. **Y React CACHEA la promesa rechazada**:
  ese componente no vuelve a cargar en toda la sesión, por más que se navegue.
  Ahí está la pantalla en blanco permanente. Comprobado contra el Express real:
  antes 200 + HTML, ahora 404 `text/plain` con `no-store`.
- **El documento NO se cachea** (`no-store, must-revalidate`). Es la mitad que
  explica el «varias veces»: el documento es quien nombra los archivos por su
  hash, y servido desde una función sin cabecera queda a merced de la caché
  heurística del navegador — una recarga normal devolvía la lista vieja y sólo
  la recarga forzada la saltaba. **No cuesta velocidad**: lo pesado son los
  archivos de `/assets/`, que llevan hash en el nombre y siguen cacheados.
- **Qué es un archivo se decide por EXTENSIÓN y CARPETA, no por «tiene un
  punto».** Equivocarse hacia el otro lado es peor que el defecto: una ruta
  legítima como `/eventos/xii-feria-2027.valledupar` dada por archivo dejaría esa
  página sin servir. Por eso el criterio vive aparte y es puro.
- **Recargar está CONTADO** (`permiteRecarga`, 2 por minuto). Recargar es lo
  único que cura un archivo que ya no existe —no hay nada que reintentar, hay
  que volver a preguntar qué archivos van—, pero si falta de verdad (despliegue
  a medias, fallo del CDN) recargar sin freno deja al usuario en un bucle
  infinito de pantallas blancas. Agotado el freno, la promesa se RECHAZA y el
  límite de error pinta el motivo. La política es pura y se prueba aparte:
  recargar para probarla sería absurdo.
- **Primero se reintenta, y sólo después se recarga.** Un tropiezo de red se
  resuelve solo y no justifica perder el estado de la pantalla. Comprobado en un
  navegador: con un fallo pasajero la pantalla carga al segundo intento, sin
  recargar y sin dejar marca.
- **`escucharFallosDePrecarga` se registra en `main.tsx`, no en un `useEffect`.**
  Es un oyente del documento, no del ciclo de vida de nadie: atarlo a un
  componente montado es justo lo que no se puede garantizar cuando lo que falla
  es la carga de una pantalla.
- **Ningún `React.lazy` a secas.** Al agregar una página, usar `lazyWithRetry`
  —lo comprueba `test:spa` contando: la conversión no puede quedar a medias, y
  una sola página cruda reintroduce el defecto justo en esa pantalla.
- **Un 404 limpio NO rescata a la pestaña que ya tenía el documento viejo**
  (v4.791, `reloadShim`). `no-store` protege de ahí en adelante; quien ya tenía
  guardado el documento anterior sigue pidiendo archivos de una versión que no
  existe, y el código que sabría recuperarse vive DENTRO del archivo que no
  llega. Lo único que ese navegador va a ejecutar es lo que se le devuelva en
  lugar del módulo, así que se le devuelve un módulo mínimo que recarga. Va con
  **200** a propósito —el navegador no ejecuta el cuerpo de un 404— y sólo para
  `Sec-Fetch-Dest: script`: una imagen o una hoja de estilos siguen dando 404,
  ahí no hay nada que rescatar. Comprobado de punta a punta en un navegador: la
  pestaña vieja recarga una vez y entra.
- **El rescate comparte el contador con el cliente** (`app:chunk-reloads`). Con
  dos frenos independientes se sumarían y volvería el bucle que el freno existe
  para impedir; agotado, el módulo LANZA y el error llega al límite.
- **Un fallo que se ve y se explica es aceptable; uno mudo, no.**
  `ChunkErrorBoundary` va dentro del enrutador y por fuera del `<Suspense>`, así
  que conserva la navegación: quien lo vea puede irse a otra sección sin
  recargar.
