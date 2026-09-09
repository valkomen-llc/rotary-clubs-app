// El PERÍODO ROTARIO — v4.1023
//
// Rotary cambia de período el 1 de julio: de ahí al 30 de junio siguiente, el
// año rotario se nombra «2026-2027». Es un dato que se queda viejo solo, así
// que no se escribe a mano en ninguna pantalla: se calcula.
//
// El NÚCLEO no toca el reloj (`rotaryPeriodFrom` recibe el año y el mes ya
// extraídos) por el mismo motivo que `yearsSince` en `designSpec.js`: una
// función que consulta la hora por dentro no se puede probar, y la frontera de
// este cálculo es exactamente el instante que hay que poder fijar en una
// prueba.
//
// ⚠️ LA ZONA IMPORTA, y por eso hay DOS lecturas declaradas. El servidor corre
// en UTC (`rotaryPeriod` en `designSpec.js`, `rotaryPeriodFor` en
// `anniversarySpec.js`) y compone piezas firmadas por el Gobernador; una
// página pública la lee una PERSONA, en su propia zona. Leer las partes UTC en
// el navegador adelantaría el cambio de período: el 30 de junio a las 7 de la
// tarde en Bogotá ya es 1 de julio en UTC, y el título saltaría al período
// siguiente cinco horas antes de que empiece — la trampa de v4.991 por la otra
// puerta. `rotaryPeriodLocal` es la lectura del navegador y
// `rotaryPeriodUTC` la que se compara por SALIDAS contra el servidor.
//
// No se adivina la zona del club: el sitio no la declara (sólo las ediciones de
// eventos tienen `timezone`), y deducirla del país sería inventar el dato. La
// discrepancia posible es de horas, una vez al año, para quien mire el sitio de
// un club colombiano desde otro huso.

/** El período que contiene ese año y ese mes (mes 0-11, como `getMonth`). */
export const rotaryPeriodFrom = (year: number, monthIndex: number): string | null => {
    const y = Number(year);
    const m = Number(monthIndex);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
    const start = m >= 6 ? y : y - 1;   // julio es el mes 6
    return `${start}-${start + 1}`;
};

/** Lectura en UTC. Es la que coincide con el criterio del servidor. */
export const rotaryPeriodUTC = (today: Date = new Date()): string | null =>
    rotaryPeriodFrom(today.getUTCFullYear(), today.getUTCMonth());

/** Lectura en la zona de quien mira. Es la de las pantallas públicas. */
export const rotaryPeriodLocal = (today: Date = new Date()): string | null =>
    rotaryPeriodFrom(today.getFullYear(), today.getMonth());

// Un período ya escrito: «2026-2027», «2026 – 2027», «2026/27», «2026-27».
const PERIOD_RE = /\b\d{4}\s*[-–—/]\s*\d{2,4}\b/;

/** ¿Ese texto ya nombra un período? */
export const namesPeriod = (text: string): boolean => PERIOD_RE.test(String(text || ''));

/**
 * El período que hay que AÑADIR a un título, o `null` si no hay que añadir
 * ninguno.
 *
 * Devuelve `null` cuando el título ya nombra un período: quien lo escribió a
 * mano en el CMS ya dijo cuál es, y pegarle otro al lado daría «Nuestra Junta
 * Directiva 2026-2027 2026-2027». Es la misma regla con la que `putAuto`
 * respeta una traducción manual — lo explícito manda.
 */
export const periodSuffixFor = (title: string, period: string | null): string | null => {
    const p = String(period || '').trim();
    if (!p) return null;
    return namesPeriod(title) ? null : p;
};

export default { rotaryPeriodFrom, rotaryPeriodUTC, rotaryPeriodLocal, namesPeriod, periodSuffixFor };
