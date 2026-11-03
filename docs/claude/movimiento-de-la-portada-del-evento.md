<!-- Léelo ANTES de tocar la portada (hero) de la ficha pública de un evento. -->

# Movimiento de la portada del evento (Ken Burns) — v4.1276.0 / v4.1277.0

Pedido: que la portada de la ficha de un evento (p. ej. Villavicencio 2027) se
vea «como si estuviera en movimiento», con un efecto Ken Burns de acercamiento.

| Pieza | Archivo |
|---|---|
| Configuración, normalización y plan (`planHeroMotion`, puro) | `src/lib/eventHeroMotion.ts` |
| Keyframes `heroKenBurns` | `src/index.css` (al FINAL, fuera de `@layer`) |
| Imagen con movimiento (público y vista previa) | `src/components/EventHeroImage.tsx`, usada en `src/pages/EventoDetalle.tsx` |
| Editor (pestaña Multimedia) | `src/components/admin/events/EventHeroMotionEditor.tsx` |
| Pruebas | `npm run test:event-hero-motion` |

Datos: `CalendarEvent.metadata.heroMotion = { enabled, mode, intensity, durationSec, focus, respectReducedMotion }`.
Sin tablas ni endpoints nuevos; con un alcance acotado lo escribe la capacidad `media`.

## ⚠️ Por qué existe v4.1277.0 (no volver atrás)

La v4.1276.0 hacía UN acercamiento del 5 % en 5 s (transición) y se apagaba
del todo con «Reducir movimiento». En producción corría — Firecrawl renderizó
la ficha con `data-hero-motion="running"` y `scale(1.05)` — pero el comité la
veía **estática**: el único movimiento terminaba mientras la página se
acomodaba, y en un Mac con «Reducir movimiento» (el mismo caso del carrusel
lateral en v4.1274.0) no se movía nada. Por eso:

- **Por defecto es CONTINUO**: `heroKenBurns <dur>s ease-in-out infinite alternate`
  — acerca y aleja sin parar, con un desplazamiento leve hacia el foco.
- **Intensidades perceptibles**: 8 / 12 / 18 %. Por debajo de ~8 % no se ve.
- **«Reducir movimiento» → más suave, no quieta**: mitad de la escala,
  ×1,5 de duración y sin desplazamiento (`state: 'gentle'`). Sólo queda quieta
  si el evento marca `respectReducedMotion`.
- Lo guardado por v4.1276.0 (sin `mode`) se lee como continuo.

## Reglas

- **Encendido por defecto** (continuo, 8 %, 8 s, centro). Apagarlo es `enabled: false`.
- **Arranca cuando la imagen CARGÓ** (`onLoad`, o `img.complete` si vino del
  caché). Mientras carga, opacidad 0 y luego fundido; si falla, se muestra igual.
- **Animación CSS, no transición ni temporizadores**: sólo `transform` dentro
  del `overflow-hidden` del hero (GPU, sin mover el diseño). Con la pestaña
  oculta el navegador la pausa solo.
- **Los keyframes van fuera de `@layer`**: dentro de una capa de Tailwind
  pueden purgarse y la imagen quedaría quieta sin ningún error.
- **Diagnóstico**: `data-hero-motion` en la imagen = `waiting`, `running`,
  `gentle`, `still-reduced` u `off`. Ante «no se mueve», mirar ese atributo.
