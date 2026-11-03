<!-- Léelo ANTES de tocar la portada (hero) de la ficha pública de un evento. -->

# Movimiento de la portada del evento — v4.1276.0

Pedido: que la cabecera de la ficha de un evento (p. ej. Villavicencio 2027) se
sienta más viva con un acercamiento muy suave de la imagen de portada durante
unos cinco segundos.

| Pieza | Archivo |
|---|---|
| Configuración y normalización | `src/lib/eventHeroMotion.ts` |
| Imagen con movimiento (público y vista previa) | `src/components/EventHeroImage.tsx`, usada en `src/pages/EventoDetalle.tsx` |
| Editor (pestaña Multimedia) | `src/components/admin/events/EventHeroMotionEditor.tsx` |
| Pruebas | `npm run test:event-hero-motion` |

Datos: `CalendarEvent.metadata.heroMotion = { enabled, intensity, durationSec, focus }`.
Sin tablas ni endpoints nuevos; con un alcance acotado lo escribe la capacidad
`media`.

## Reglas

- **Encendido por defecto** (sutil 5 %, 5 s, centro): un evento sin
  `heroMotion` guardado se mueve. Apagarlo es `enabled: false`.
- **Un solo acercamiento, sin bucle**: termina y queda en la escala final.
- **Arranca cuando la imagen CARGÓ** (`onLoad`, o `img.complete` si vino del
  caché), dos cuadros después de pintarla a escala 1 para que la transición
  corra siempre. Mientras carga, la imagen está oculta (opacidad 0) y aparece
  con un fundido; si falla, se muestra igual (no queda invisible).
- **Sólo `transform` y `opacity`** dentro del contenedor `overflow-hidden` del
  hero: lo anima la GPU y no mueve el diseño.
- **«Reducir movimiento»** del sistema → quieta; el título tampoco anima
  (`motion-reduce:animate-none`).
- **Diagnóstico**: `data-hero-motion` en la imagen (`waiting`, `running`,
  `reduced`, `off`).
- Intensidades topadas en 12 %: más que eso ya se lee como zoom y pixela
  portadas de baja resolución.
