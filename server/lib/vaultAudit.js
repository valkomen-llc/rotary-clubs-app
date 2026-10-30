/**
 * v4.1265 — LA TRAZA DE QUIÉN CONSULTA LA BÓVEDA.
 *
 * Pedido del Distrito 4281 al abrirle la Bóveda a la Secretaría Digital: que
 * quede registrado quién la abrió, quién exportó un informe y quién descargó un
 * comprobante, con usuario, fecha, acción y recurso.
 *
 * ⚠️ NO ES UNA TABLA NUEVA. Se escribe en `InstitutionalAccessEvent`, la MISMA
 * de los cambios de permisos (v4.932/v4.937): la pantalla de Auditoría de
 * «Usuarios y permisos» ya la lista, y partirla obligaría a leer dos tablas y
 * ordenarlas a mano para contestar «¿qué hizo esta persona?».
 *
 * ⚠️ SE ANOTA LO QUE SALIÓ, NO LO QUE SE PIDIÓ. El middleware espera a que la
 * respuesta TERMINE y sólo escribe con un código < 400: un 404 sobre un
 * comprobante ajeno no es una descarga, y anotarlo como tal llenaría la traza
 * de hechos que no ocurrieron.
 *
 * NUNCA LANZA y nunca retrasa la respuesta: `audit` ya degrada sola, y acá
 * además corre después de que el archivo salió.
 */
import { audit } from './institutionalStore.js';

const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Quién hizo esto, sin nada que no sea suyo. */
export const actorDe = (req) => ({
    kind: 'user',
    id: req?.user?.id || req?.user?.userId || null,
    label: req?.user?.email || req?.user?.name || null,
});

/** El sitio sobre el que se consulta: el mismo criterio que `clubDe` en los controladores. */
export const sitioDe = (req) =>
    (req?.user?.role === 'administrator' && (req?.query?.clubId || req?.body?.clubId))
        ? (req.query?.clubId || req.body?.clubId)
        : (req?.user?.clubId || null);

/**
 * Anota el evento cuando la respuesta termina bien.
 *
 * `describir(req)` redacta el `detail`: texto NUESTRO —«comprobante del
 * desembolso X»—, jamás un volcado del cuerpo de la petición.
 */
export const auditarBoveda = (kind, describir = () => null) => (req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode >= 400) return;
        let detail = null;
        try { detail = str(describir(req), 500) || null; } catch { detail = null; }
        audit(kind, {
            clubId: sitioDe(req), userId: actorDe(req).id, email: req?.user?.email || null,
            actor: actorDe(req), detail, req,
        }).catch(() => {});
    });
    next();
};

/** Los dos eventos que DECLARA el navegador: abrir la pantalla y exportar lo que se ve. */
export const EVENTOS_DECLARADOS = {
    opened: 'vault_opened',
    exported: 'vault_report_exported',
};

export const FORMATOS_EXPORTACION = ['xlsx', 'csv', 'pdf'];

/**
 * Redacta el detalle de un evento declarado desde la pantalla. Catálogo CERRADO:
 * lo que no se reconoce se descarta, así que el cuerpo de la petición no puede
 * meter texto libre en la auditoría.
 */
export const describirDeclarado = (body = {}) => {
    const evento = str(body?.evento, 20);
    const kind = EVENTOS_DECLARADOS[evento];
    if (!kind) return { ok: false, error: 'Evento no reconocido.' };
    const partes = [];
    if (evento === 'exported') {
        const formato = str(body?.formato, 10).toLowerCase();
        if (!FORMATOS_EXPORTACION.includes(formato)) return { ok: false, error: 'Formato de exportación no reconocido.' };
        partes.push(`formato ${formato.toUpperCase()}`);
        const vista = str(body?.vista, 30);
        if (vista === 'control') partes.push('vista Control y Justificación');
        else partes.push('informe de movimientos');
    }
    const moneda = str(body?.moneda, 3).toUpperCase();
    if (/^[A-Z]{3}$/.test(moneda)) partes.push(`moneda ${moneda}`);
    const periodo = str(body?.periodo, 60);
    if (periodo) partes.push(`período ${periodo}`);
    const filas = Number(body?.filas);
    if (Number.isFinite(filas) && filas >= 0) partes.push(`${Math.floor(filas)} fila${Math.floor(filas) === 1 ? '' : 's'}`);
    return { ok: true, kind, evento, detail: partes.join(' · ') || null };
};

export default { auditarBoveda, describirDeclarado, EVENTOS_DECLARADOS, FORMATOS_EXPORTACION, actorDe, sitioDe };
