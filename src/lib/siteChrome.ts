// Los colores de las bandas que enmarcan el sitio público.
//
// Están acá y no repetidos en cada pantalla porque cada uno lo consumen VARIOS
// componentes, y una copia que se queda atrás no da error: simplemente pinta
// otro color y nadie se entera hasta que alguien mira las dos bandas juntas.

/**
 * El fondo del pie de página de un sitio normal (club, distrito, feria, zona).
 *
 * Lo usan el pie de verdad (`Footer.tsx`) y la vista previa del panel
 * (`FooterSystem.tsx`). Si las dos no salen de acá, el panel enseña un pie que
 * no es el que ve el visitante — que es peor que no tener vista previa.
 *
 * NO es el de un sitio Evento/Convención: ésos tienen su propio color
 * configurable (`colors.footerBg`), con su propio valor por defecto, y pisarlo
 * sería desobedecer al operador que ya eligió.
 */
export const SITE_FOOTER_BG = '#212C3F';

/**
 * El azul de la barra superior, la banda de la portada y la de copyright.
 *
 * Se consume como CLASE (`bg-rotary-topbar`), así que el valor vive en
 * `tailwind.config.js` — una clase escrita a mano en `@layer utilities` no
 * genera los modificadores de opacidad y falla en silencio (v4.719). Está acá
 * sólo para quien necesite el color en línea; `test:nav` comprueba que los dos
 * digan lo mismo.
 */
export const SITE_TOPBAR_BG = '#28354b';
