// ════════════════════════════════════════════════════════════════════════════
// El último informe de sincronización con Meta, GUARDADO (v4.1045)
//
// Reporte con capturas: la pantalla de Facebook dice «Se seleccionó 1 Página»,
// el usuario pulsa Guardar, vuelve al panel y lee «SIN CONEXIÓN · 0 ACTIVAS».
// Ese texto no distingue tres cosas muy distintas —nunca se conectó, se
// conectó y Meta no devolvió nada, o se conectó y la Página no traía token—
// y el diagnóstico que sí lo distingue vivía en un `console.log` de la
// función, que nadie fuera del equipo de despliegue puede leer.
//
// ⚠️ EL INFORME NO GUARDA NI UN TOKEN, NI RECORTADO. Lo que se escribe son
// identificadores públicos —id de Página, id de cuenta de Instagram—, cuántas
// filas devolvió cada arista de la Graph API, los avisos redactados y quién
// autorizó. Un token acá sería una credencial de publicación en una fila que
// se lee desde el panel; lo comprueba una prueba sobre el archivo.
//
// ⚠️ VIVE EN `Setting`, NO EN UNA COLUMNA DE `SocialAccount`. Es un dato DEL
// SITIO —«qué contestó Meta la última vez»— y no de ninguna cuenta: con cero
// cuentas, que es justo el caso a explicar, no habría fila donde ponerlo. Y
// una columna nueva en un modelo de Prisma que todavía no exista en la base
// deja en 500 a todo consumidor (regla de `logo_intl`, v4.699). Mismo patrón
// que `social_default_accounts` y `default_outro`: único por `(key, clubId)`.
//
// ⚠️ ESCRIBIRLO NUNCA PUEDE COSTAR LA SINCRONIZACIÓN. Es auditoría: si la
// escritura falla, las cuentas ya quedaron guardadas y perder el informe es
// una molestia, mientras que propagar el fallo desharía el trabajo que sí
// ocurrió. Toda función de acá devuelve su resultado y no lanza.
// ════════════════════════════════════════════════════════════════════════════

import prisma from './prisma.js';

export const REPORT_KEY = 'meta_last_sync_report';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Tope de lo que se guarda. Un informe es para leerlo de un vistazo: con
 *  cincuenta avisos nadie lo lee, y la fila crece sin freno. */
const MAX_LISTA = 25;

const recortar = (lista) => (Array.isArray(lista) ? lista.slice(0, MAX_LISTA) : []);

/**
 * Reduce el informe del motor a lo que se puede enseñar.
 *
 * Es una lista BLANCA a propósito: lo que no se enumere no se guarda. Con un
 * `{...informe}` bastaría que el motor agregara mañana un campo con el token
 * de una Página para que terminara en una fila que el panel lee — y no daría
 * ningún error.
 */
export const shapeReport = (informe = {}) => ({
    syncedAt: str(informe.syncedAt) || new Date().toISOString(),
    connectedBy: informe.connectedBy?.id
        ? { id: String(informe.connectedBy.id), name: str(informe.connectedBy.name) || null }
        : null,
    counts: {
        facebook: Number(informe.counts?.facebook) || 0,
        instagram: Number(informe.counts?.instagram) || 0,
        revoked: Number(informe.counts?.revoked) || 0,
    },
    pages: recortar(informe.pages).map((p) => ({ pageId: String(p.pageId || ''), name: str(p.name) || null })),
    instagram: recortar(informe.instagram).map((i) => ({
        igId: String(i.igId || ''),
        username: str(i.username) || null,
        pageId: String(i.pageId || ''),
    })),
    // De dónde salió cada Página y cuántas trajo cada arista. Es lo que
    // contesta «¿por qué falta la mía?» sin entrar a la cuenta de Meta.
    sources: recortar(informe.sources).map((s) => ({
        source: str(s.source) || 'desconocida',
        count: Number(s.count) || 0,
    })),
    // Los activos que ESTA autorización concedió, por id. Es lo que permite
    // contrastar «lo marqué en Facebook» contra lo que Meta devolvió.
    granted: recortar(informe.granted).map((g) => ({
        id: String(g.id || ''),
        scopes: Array.isArray(g.scopes) ? g.scopes.map(String) : [],
    })),
    unresolved: recortar(informe.unresolved).map((g) => ({
        id: String(g.id || ''),
        scopes: Array.isArray(g.scopes) ? g.scopes.map(String) : [],
    })),
    notes: recortar(informe.notes).map((n) => ({
        code: str(n.code) || null,
        title: str(n.title) || str(n.pageName) || null,
        pageId: str(n.pageId) || null,
        reason: str(n.reason) || null,
        fix: str(n.fix) || null,
    })),
});

/** Guarda el informe del sitio. Devuelve `false` si no se pudo; nunca lanza. */
export const saveSyncReport = async (clubId, informe) => {
    if (!str(clubId)) return false;
    try {
        const valor = JSON.stringify(shapeReport(informe));
        const fila = await prisma.setting.findFirst({ where: { key: REPORT_KEY, clubId } });
        if (fila) await prisma.setting.update({ where: { id: fila.id }, data: { value: valor } });
        else await prisma.setting.create({ data: { key: REPORT_KEY, clubId, value: valor } });
        return true;
    } catch (e) {
        console.warn('[social] no se pudo guardar el informe de sincronización:', e.message);
        return false;
    }
};

/** El último informe del sitio, o `null`. Un fallo leyéndolo no puede dejar
 *  sin pantalla a quien entró a mirar sus cuentas. */
export const getSyncReport = async (clubId) => {
    if (!str(clubId)) return null;
    try {
        const fila = await prisma.setting.findFirst({ where: { key: REPORT_KEY, clubId } });
        if (!fila?.value) return null;
        return shapeReport(JSON.parse(fila.value));
    } catch {
        return null;
    }
};

export default { REPORT_KEY, shapeReport, saveSyncReport, getSyncReport };
