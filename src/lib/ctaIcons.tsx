/**
 * Los iconos de los botones de la portada.
 *
 * El catálogo de emojis estaba escrito TRES veces —`ActionSection`,
 * `JoinSection` y `FoundationSection`, idénticos carácter por carácter— y el
 * Bloque Destacado iba a ser la cuarta. Tres copias del mismo valor se separan
 * en cuanto alguien agregue un icono a una sola, y entonces la lista que ofrece
 * el panel deja de coincidir con la que sabe pintar la portada: el
 * administrador elige un icono que no se dibuja.
 *
 * Es el mismo criterio que `ctaStyles.ts` (la piel de los botones) y
 * `siteChrome.ts` (los colores de las bandas): un solo sitio donde cambiarlo.
 */

/** Emoji multicolor por nombre. Es lo que ofrece el selector del panel. */
export const CTA_ICONS: Record<string, string> = {
    star: '⭐', heart: '❤️', handshake: '🤝', send: '✈️', sparkles: '✨',
    megaphone: '📣', flag: '🚩', gift: '🎁', users: '👥', calendar: '📅',
    award: '🏅', trophy: '🏆', rocket: '🚀',
};

/** Las opciones del selector, en el orden en que se muestran. */
export const CTA_ICON_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'star', label: '⭐ Estrella' },
    { value: 'heart', label: '❤️ Corazón' },
    { value: 'handshake', label: '🤝 Apretón de manos' },
    { value: 'send', label: '✈️ Enviar' },
    { value: 'sparkles', label: '✨ Destellos' },
    { value: 'megaphone', label: '📣 Megáfono' },
    { value: 'flag', label: '🚩 Bandera' },
    { value: 'gift', label: '🎁 Regalo' },
    { value: 'users', label: '👥 Personas' },
    { value: 'calendar', label: '📅 Calendario' },
    { value: 'award', label: '🏅 Medalla' },
    { value: 'trophy', label: '🏆 Trofeo' },
    { value: 'rocket', label: '🚀 Cohete' },
];

/**
 * El emoji que corresponde a lo elegido.
 *
 * Acepta también un emoji escrito a mano (hasta 4 caracteres, que es lo que
 * ocupa uno compuesto), porque el campo del panel siempre lo permitió y hay
 * sitios que lo usan así. Devuelve '' cuando no hay nada que pintar, para que
 * quien llame decida su propio respaldo.
 */
export function resolveCtaEmoji(icon?: string, fallback = ''): string {
    if (!icon) return fallback;
    if (CTA_ICONS[icon]) return CTA_ICONS[icon];
    return icon.length <= 4 ? icon : fallback;
}

/**
 * La estrella dorada de los botones de la portada.
 *
 * Es el icono por defecto cuando el sitio no eligió emoji. Va como SVG y no
 * como emoji para que se vea igual en todos los sistemas: el ⭐ del sistema
 * cambia de dibujo entre macOS, Windows y Android.
 */
export const CtaStarIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#F5A623" />
    </svg>
);
