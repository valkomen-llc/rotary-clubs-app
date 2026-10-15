// ════════════════════════════════════════════════════════════════════
// LA SUSCRIPCIÓN VIGENTE, del lado del servidor — v4.1204
//
// Espejo MÍNIMO de `src/lib/siteExpiration.ts`: sólo lo que el servidor
// necesita para decidir, al GUARDAR, si la casilla «Activar Banner» quedó
// vieja. El criterio de qué barra se pinta vive en el navegador; acá sólo se
// contesta «¿esta suscripción está al día, más allá de la ventana de aviso?».
//
// Las dos mitades se comparan por SALIDAS en `test:expiration`: con dos
// cuentas de días, el panel diría «al día» y el servidor dejaría la casilla
// encendida, o al revés.
// ════════════════════════════════════════════════════════════════════

export const RENEWAL_WINDOW_DAYS = 15;
export const EXPIRATION_TZ = 'America/Bogota';

const normalizar = v => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/** Día calendario de la fecha de expiración (partes UTC), AAAA-MM-DD. */
export const expirationDay = value => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const p = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

/** Hoy en la zona de la plataforma. La función corre en UTC. */
export const todayIn = (today = new Date(), timeZone = EXPIRATION_TZ) => {
    try {
        const partes = new Intl.DateTimeFormat('en-CA', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(today);
        const v = t => partes.find(x => x.type === t)?.value || '';
        return `${v('year')}-${v('month')}-${v('day')}`;
    } catch {
        return expirationDay(today) || '';
    }
};

const diaNumero = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
};

export const daysUntilExpiration = (value, today = new Date()) => {
    const dia = expirationDay(value);
    if (!dia) return null;
    const hoy = todayIn(today);
    if (!hoy) return null;
    return Math.round(diaNumero(dia) - diaNumero(hoy));
};

/**
 * La suscripción está pagada y vence más allá de la ventana de aviso.
 * En ese caso ninguna barra de vencimiento tiene sentido.
 */
export const isComfortablyActive = (site, today = new Date()) => {
    if (!site || normalizar(site.subscriptionStatus) !== 'active') return false;
    const d = daysUntilExpiration(site.expirationDate, today);
    return d !== null && d > RENEWAL_WINDOW_DAYS;
};

/**
 * Si al guardar hay que DESMARCAR la casilla de la barra manual.
 *
 * `before` es la fila como estaba; `body` lo que llegó en la petición. Se
 * decide sobre el RESULTADO de mezclar los dos —lo que va a quedar escrito—,
 * no sobre la petición sola: guardar el nombre del club también tiene que
 * limpiar una casilla que quedó vieja de una renovación anterior.
 *
 * Sólo se apaga, nunca se enciende: encenderla es una decisión de una persona.
 */
export const shouldClearManualBanner = (before = {}, body = {}, today = new Date()) => {
    const pick = k => (body[k] !== undefined ? body[k] : before[k]);
    const flag = pick('expirationBannerActive');
    if (flag !== true && flag !== 'true') return false;
    return isComfortablyActive({
        subscriptionStatus: pick('subscriptionStatus'),
        expirationDate: pick('expirationDate'),
    }, today);
};
