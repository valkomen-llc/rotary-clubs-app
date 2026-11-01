# Carrusel de la «Imagen lateral del evento» — v4.1273.0

El widget de la columna derecha de la ficha pública de un evento (debajo del
mapa de la sede), nacido en v4.1207.0 con UNA imagen, admite desde v4.1273.0
varias imágenes y las publica como carrusel. Mismo lugar, mismo diseño.

## Dónde vive

| Pieza | Archivo |
|---|---|
| Modelo, normalización, migración, serialización | `src/lib/eventWidgets.ts` |
| Carrusel (público **y** vista previa) | `src/components/EventSidebarImageCarousel.tsx` |
| Widget público (título + carrusel) | `src/components/EventSidebarImageWidget.tsx`, usado en `src/pages/EventoDetalle.tsx` |
| Editor del panel (pestaña Widgets / Sede) | `src/components/admin/events/EventWidgetsEditor.tsx` |
| Pruebas | `npm run test:event-widgets` |

Datos: `CalendarEvent.metadata.widgets.sidebarImage` (Jsonb). **Sin tablas
nuevas ni cambios de servidor**: el `PUT /api/calendar/events/:id` guarda la
metadata tal cual, así que cada evento conserva su propia configuración.

## Esquema

```ts
sidebarImage = {
  enabled,            // «Visualización activa»: apaga/enciende TODO el widget
  title, showTitle,   // título del widget (no por imagen)
  images: [{ id, imageUrl, altText, linkUrl, openInNewTab, enabled }],  // orden = orden de presentación
  carousel: { autoplay, intervalMs, transition: 'fade'|'slide', transitionMs,
              showArrows, showDots, loop, pauseOnInteraction },
  // Reflejo HEREDADO de la primera imagen activa (lectores antiguos):
  imageUrl, altText, linkUrl, openInNewTab,
}
```

Predeterminados (`DEFAULT_CAROUSEL_SETTINGS`): autoplay sí, 5000 ms, fade,
500 ms, flechas sí, puntos sí, continua sí, pausar al interactuar sí.
Límites (`CAROUSEL_LIMITS`): intervalo 2–30 s, transición 100–3000 ms, 20 imágenes.

## Reglas

- **`images` manda.** Si existe (aunque esté vacía), los campos heredados se
  ignoran al leer. Sólo un widget SIN `images` (anterior a v4.1273.0) se migra:
  su `imageUrl`/`altText`/`linkUrl`/`openInNewTab` pasan a ser una lista de una
  imagen. La migración ocurre al LEER (público y editor); al guardar desde el
  editor queda escrito en el esquema nuevo. No hay script de migración.
- **El editor siempre escribe con `serializeSidebarImageWidget`**, que
  recalcula el reflejo heredado. No escribir `sidebarImage` a mano.
- **Una sola imagen activa = como antes**: sin flechas, puntos ni contador.
- **La vista previa usa el mismo componente** que el público (con
  `disableLinks` para no salir del panel y `showCounter`). Si se cambia el
  comportamiento del carrusel, se cambia en un solo sitio.
- **Sin saltos de alto**: las imágenes se apilan en la MISMA celda de una
  grilla (`gridArea: '1 / 1'`), así que el carrusel mide lo que la más alta y
  no cambia al pasar de una a otra. Trade-off aceptado: una imagen apaisada
  junto a afiches verticales queda centrada con aire arriba y abajo (nunca
  recortada ni deformada: `object-contain`).
- **Movimiento reducido** (`prefers-reduced-motion`): transiciones instantáneas
  y SIN avance automático; las flechas se muestran aunque estén desactivadas
  para que todas las imágenes sigan siendo alcanzables.
- **Pausa**: con cursor encima, foco dentro o un toque (se retoma tras un
  intervalo completo), y con la pestaña oculta. Cualquier cambio de imagen
  reinicia la cuenta.
- **Deslizar no abre el enlace**: un swipe sobre una imagen enlazada cancela el
  clic. Los enlaces de imágenes ocultas salen del orden de tabulación.
- Subida múltiple: un archivo por petición contra `/calendar/events/upload-image`
  (el mismo endpoint de siempre), en el orden elegido. Las subidas leen el
  estado y el `onChange` MÁS RECIENTES (`latestRef`) para no pisar lo editado
  mientras subían.
- El reordenamiento es HTML5 drag & drop **más** flechas por miniatura: el
  arrastre nativo no funciona en pantallas táctiles.
