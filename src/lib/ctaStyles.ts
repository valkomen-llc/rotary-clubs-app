// ════════════════════════════════════════════════════════════════════
// El ASPECTO de los botones de llamada a la acción — v4.719.0
//
// Los botones principales del sitio van en pareja y con la misma pareja de
// colores: uno sólido, que pesa, y uno suave a su lado. Es lo que hay en el
// encabezado —«Regístrarse» y «Postular Proyecto»— y es lo que tiene que verse
// también en la ficha de un evento.
//
// Vive aquí por el mismo motivo que `ctaTarget` en `ctaLinks.ts`: la regla es
// UNA. Hasta v4.718 el botón secundario de la ficha del evento se pintaba con
// su propio contorno azul marino, escrito a mano, así que la misma acción
// —entrar a un formulario de inscripción— se veía de dos maneras según desde
// dónde se mirara, y nada obligaba a que se parecieran.
//
// Sólo se comparte la PIEL —fondo, color de letra y su hover—, no la geometría:
// el botón del encabezado se ajusta a su texto y el de la ficha ocupa el ancho
// de la columna. Meter el alto y los márgenes aquí obligaría a uno de los dos a
// pelearse con lo que hereda.
// ════════════════════════════════════════════════════════════════════

export interface CtaSkin {
    /** Fondo y color de letra. */
    base: string;
    /** Cómo cambia al pasar el cursor. Se omite en un botón deshabilitado. */
    hover: string;
}

/**
 * El de más peso de la pareja: azul Rotary lleno.
 *
 * El hover oscurece con `bg-rotary-navy` y NO con `bg-rotary-blue/90`, que es
 * lo que decía hasta v4.718 y **no pintaba nada**: `bg-rotary-blue` es una
 * clase escrita a mano en `index.css` (`@layer utilities`), no un color del
 * tema, así que Tailwind no le puede aplicar el modificador de opacidad y
 * nunca llegó a generar la regla. Comprobado sobre el CSS compilado: cero
 * apariciones de `.hover\:bg-rotary-blue\/90`. Al escribir una clase de estas,
 * buscarla en `dist/assets/index-*.css` — no avisa nadie.
 */
export const CTA_SOLID: CtaSkin = {
    base: 'bg-rotary-blue text-white',
    hover: 'hover:bg-rotary-navy',
};

/** El de al lado: azul claro con letra azul. Es el de «Postular Proyecto». */
export const CTA_SOFT: CtaSkin = {
    base: 'bg-sky-100 text-rotary-blue',
    hover: 'hover:bg-sky-200',
};

/**
 * Las clases de una piel. Un botón que no lleva a ninguna parte —una categoría
 * cerrada o agotada— se pinta SIN hover: reaccionar al cursor es la promesa de
 * que algo va a pasar al pulsarlo.
 */
export const ctaSkin = (skin: CtaSkin, interactive = true): string =>
    (interactive ? `${skin.base} ${skin.hover}` : skin.base);
