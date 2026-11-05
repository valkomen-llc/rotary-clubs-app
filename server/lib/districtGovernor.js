// ════════════════════════════════════════════════════════════════════
// El Gobernador del Distrito por período rotario — v4.1283.0
//
// UNA sola fuente para «quién es el Gobernador ahora»:
//
//   1. La fila REAL de `District` (`governor`), que el equipo edita en
//      Administración → Distritos. Es la configuración institucional y manda.
//   2. Si esa fila no lo tiene cargado, el respaldo POR PERÍODO de abajo.
//
// El nombre no se escribe en ningún formulario: el de Visitas del Gobernador
// lo recibe de `GET …/visitas-gobernador/config` como valor predeterminado de
// una visita NUEVA, y Aniversarios IA lo usa como respaldo de su firma. Un
// período nuevo con otro Gobernador se resuelve cambiando el dato en
// Distritos (o agregando su línea aquí), sin tocar el formulario.
//
// Las visitas ya guardadas conservan SU `governorName`: nada de esto se
// aplica hacia atrás.
//
// Puro al importarse (lo importa `anniversarySpec.js`, que las pruebas cargan
// sin base): la conexión se pide sólo dentro de `currentDistrictGovernor`.
// ════════════════════════════════════════════════════════════════════

/** Respaldo por período («2026-2027» = 1 jul 2026 → 30 jun 2027). */
export const GOVERNOR_BY_PERIOD = {
    '2026-2027': 'Fabio Enrique Véjar Montañez',
};

/** El Gobernador del período vigente al publicar este archivo. */
export const DEFAULT_GOVERNOR = GOVERNOR_BY_PERIOD['2026-2027'];

/**
 * El período rotario de una fecha. Acepta «2026-10-29» (se lee tal cual, sin
 * zona: es una fecha de calendario) o un `Date` (partes UTC, el criterio del
 * servidor, igual que `rotaryPeriod` en `designSpec.js`).
 */
export const rotaryPeriodOf = (value = new Date()) => {
    let y; let m;
    const s = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-\d{2}/) : null;
    if (s) { y = Number(s[1]); m = Number(s[2]) - 1; }
    else if (value instanceof Date && !Number.isNaN(value.getTime())) { y = value.getUTCFullYear(); m = value.getUTCMonth(); }
    else return null;
    const start = m >= 6 ? y : y - 1;
    return `${start}-${start + 1}`;
};

/** El respaldo de un período, o '' si no hay uno registrado. */
export const fallbackGovernorFor = (period) => GOVERNOR_BY_PERIOD[period] || '';

/**
 * El Gobernador vigente del distrito: `{ name, period, source }`.
 * `source` es 'district' (Administración → Distritos) o 'respaldo'.
 * DEGRADA siempre: sin base responde con el respaldo.
 */
export async function currentDistrictGovernor(districtNumber, { today = new Date() } = {}) {
    const period = rotaryPeriodOf(today);
    let name = '';
    try {
        const { default: db } = await import('./db.js');
        const { rows } = await db.query(`SELECT governor FROM "District" WHERE number = $1 LIMIT 1`, [Number(districtNumber)]);
        name = String(rows[0]?.governor || '').trim();
    } catch { /* sin base: respaldo */ }
    if (name) return { name, period, source: 'district' };
    return { name: fallbackGovernorFor(period), period, source: 'respaldo' };
}
