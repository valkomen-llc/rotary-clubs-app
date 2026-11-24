# Presentación comercial de Club Platform — v4.1356

Presentación web pública de **cinco slides** en `/presentacion`, para reuniones
con presidentes, juntas directivas, capacitaciones distritales y campañas de
vinculación. Léelo antes de tocar el módulo.

## Qué se encontró (2026-11-23)

| Qué se miró | Qué había |
|---|---|
| Módulo de presentaciones | No existe. Hay un editor por contenedores (Programas, Sitio web de Club Platform), pero pinta páginas con desplazamiento, no un mazo 16:9. Se hizo una **ruta pública independiente**, sin CMS ni tablas. |
| Sistema de diseño | Tailwind + shadcn. Tokens en `src/index.css` (`--rotary-blue`, `--rotary-navy`, `--rotary-gold`), barra `rotary-topbar` `#28354b`, patrón `bg-rotary-geo`, pieles de botón en `src/lib/ctaStyles.ts`, tipografía Open Sans. Es lo que usa la presentación; no hay paleta propia. |
| Capturas del producto | **No hay ninguna en el repositorio** (`public/` sólo trae tres de Mission Control). El sitio institucional tampoco usa capturas: «representación esquemática». |
| Precios o planes | No había componentes de *pricing*. Las tarjetas son nuevas, con los botones del proyecto. |
| Rutas para los botones | `/activar-mi-club` (captación y registro) y `/agendar-capacitacion` (agenda pública) ya existen. No se creó ningún formulario. |

## Archivos

| Qué | Dónde |
|---|---|
| **Contenido** (textos, precios, planes, enlaces, contacto, capturas, disponibilidad) | `src/config/clubPlatformPresentation.ts` |
| Página y ruta | `src/pages/PresentacionClubPlatform.tsx`, `<Route path="/presentacion">` en `src/App.tsx` |
| Estado del mazo (slide, modo, escala, teclado, gestos, pantalla completa) | `src/components/presentation/useDeck.ts` |
| Piezas | `SlideLayout.tsx` (marco, encabezado, cierre), `DeckChrome.tsx` (barra y navegación), `DeviceMockups.tsx`, `InfrastructureVisual.tsx`, `ResourceTools.tsx`, `AutomationFlow.tsx`, `PlanCards.tsx`, `Slides.tsx` |
| Estilos | `src/components/presentation/presentation.css` (todo con prefijo `cpd-`) |
| `<head>` para compartir | `server/lib/presentationHead.js`, llamado desde el catch-all de `api/index.js` |
| Prueba | `scripts/test-presentation.mjs` (`npm run test:presentation`, en `prebuild`) |

## Reglas durables

- **Son exactamente cinco slides.** La prueba cuenta los de la configuración y
  los componentes de `SLIDE_COMPONENTS` (en la página).
- **El copy vive en la configuración, no en los componentes.** Cambiar un
  precio, un texto o un enlace es tocar un solo archivo.
- **Precios vigentes**: Club Digital $1.000.000 y Club Inteligente $1.480.000
  COP al año. Prevalecen sobre documentos comerciales anteriores. La prueba
  comprueba el monto, el precio mostrado y el equivalente mensual.
- **Una interfaz dibujada no es una captura.** Con `media.screens.*` en `null`
  se pinta la versión esquemática y el slide lo dice («Interfaces representadas
  de forma esquemática»). Con una URL se muestra la captura y el aviso
  desaparece. Las mini-interfaces no llevan cifras: una barra de avance no
  promete un recaudo.
- **Una herramienta que no está operativa no se simula.** `availability:
  'concept'` la rotula «Representación conceptual · próximamente».
- **Un enlace que no existe no se inventa.** `href: null` deja el botón sin
  pintar; la prueba exige que una ruta interna esté registrada en `App.tsx`.
- **La marca de Club Platform va por defecto en todos los slides** (`brand.mark`):
  logotipo en la esquina inferior (izquierda de fábrica, configurable) y, en la
  portada, grande sobre el título en vez de en la esquina. Sólo se fija la
  altura: el logotipo nunca se deforma.
- **Las capturas del slide 1 van en `public/presentacion/`** y su ruta en
  `media.screens.siteDesktop` / `siteMobile` (ver el LEEME de esa carpeta).
- **Tres modos, un marcado.** Escenario (lienzo de 1600 × 900 escalado) desde
  1024 px con proporción ≥ 5:4; flujo (slides apilados y reorganizados) por
  debajo; impresión siempre con el lienzo. Lo propio del escenario y del flujo
  va dentro de `@media screen`: si no, imprimir desde un móvil rompe la página.
- **El escenario es una capa fija (`z-index: 60`)**: tapa el chat y el botón
  flotante sin tocar esos componentes.
- **La dirección recuerda el slide con `history.replaceState`**, no con el
  router: `ScrollToTop` y el contador de páginas no deben dispararse por pasar
  de slide. `?slide=3` abre en el tercero; `?modo=presentacion` abre sin barra.
- **El `<head>` va en el servidor** y su título y descripción son los de la
  configuración (la prueba compara los dos archivos).
- **`presentacion` es una dirección reservada** (`RESERVED_SLUGS`): el sitio
  institucional no puede crear una página con ese nombre.
- Ningún selector de la hoja toca algo fuera de `.cpd-*` (lo fija la prueba):
  no puede alterar un sitio publicado.

## Uso

- Enlace público: `https://app.clubplatform.org/presentacion` (funciona en
  cualquier host que sirva la aplicación).
- Teclado: ← → (o Re Pág / Av Pág, espacio), Inicio, Fin, 1–5, `F` pantalla
  completa, Esc para salir.
- PDF: botón de impresora → «Guardar como PDF». Sale en 16:9, un slide por
  página, con fondos.

## Pendientes comerciales (no se hicieron: requieren decisión)

1. **Capturas reales** de un sitio de club (escritorio y móvil), almacenamiento,
   proyectos/crowdfunding, tienda, Rotary en Acción y Estudio de contenido:
   subirlas a la Biblioteca y pegar las URL en `media.screens`.
2. **Imagen para compartir** de 1200 × 630 (`meta.shareImage` y
   `PRESENTATION_META.image`, con `largeImage: true`). Hoy se usa el logotipo.
3. **Contacto** (`contact.email`, `contact.whatsapp`): vacíos a propósito.
4. Confirmar que «Agendar una demostración» debe llevar a
   `/agendar-capacitacion` (hoy es la agenda de capacitaciones y soporte) o
   crear allí una categoría de demostración abierta.
5. Validar el alcance comercial antes de difundir: condiciones de
   almacenamiento y correos «ilimitados», pasarelas y monedas por club (COP /
   USD), redes compatibles con la publicación automática y qué incluye cada
   plan. Los cuatro módulos de recaudo existen en el código y dependen de la
   configuración de cada club; están marcados `setup`.

## Cómo se probó

- `npm run test:presentation`: comprobaciones puras (en `prebuild`).
- Chromium sobre el servidor de desarrollo: los cinco slides a 1920 × 1080 sin
  desborde, modo web a 1440 × 810, flujo a 390 y 820 px sin desplazamiento
  horizontal, teclado y acceso directo, y PDF de 5 páginas de 1600 × 900.
