// ════════════════════════════════════════════════════════════════════
// Recursos del proyecto — la plantilla oficial de presentación (v4.1264.0)
//
// EL CRITERIO, PURO: sin base, sin S3, sin red. Lo usan el controlador
// (`projectFairResourceController.js`) y las pruebas
// (`npm run test:fair:resources`), así que lo que se decide acá se decide en
// un solo lugar:
//
//   · qué formatos se aceptan y cómo se reconoce el TIPO REAL de un archivo
//     (los bytes, no la extensión ni lo que declara el navegador);
//   · el tope de tamaño, configurable dentro de un margen;
//   · qué ve el club en su tarjeta (disponible, próximamente, actualizada,
//     ya descargada);
//   · cómo se cuenta la adopción: una descarga ENTREGADA de un proyecto
//     ELEGIBLE. Un intento fallido no cuenta, y «no han descargado» sale de
//     comparar los elegibles con las entregas — no de mirar sólo la tabla de
//     auditoría, que no sabe de quien nunca lo intentó.
// ════════════════════════════════════════════════════════════════════

/** Los recursos que existen. Uno por ahora; la forma es de lista a propósito. */
export const RESOURCE_KEYS = ['presentation_template'];

export const RESOURCE_DEFAULTS = {
    presentation_template: {
        title: 'Plantilla de presentación del proyecto',
        description: 'Descarga la plantilla oficial de la XII Feria de Proyectos Rotary Colombia 2027 y prepara la presentación de tu proyecto siguiendo el formato establecido por el comité organizador.',
    },
};

/**
 * Formatos admitidos. PowerPoint y PDF, y ninguno más: Keynote, Google
 * Presentaciones y LibreOffice Impress abren un PPTX, así que sumar ODP o KEY
 * agregaría validaciones sin sumar a nadie que hoy no pueda abrir la plantilla.
 */
export const RESOURCE_FORMATS = {
    pptx: {
        label: 'PowerPoint (PPTX)',
        short: 'PPTX',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    pdf: {
        label: 'PDF',
        short: 'PDF',
        mime: 'application/pdf',
    },
};
export const ACCEPTED_EXTENSIONS = Object.keys(RESOURCE_FORMATS).map(f => `.${f}`);

/** Tope de tamaño: por defecto 50 MB, configurable entre 1 y 200 MB. */
export const DEFAULT_MAX_MB = 50;
export const MIN_MAX_MB = 1;
export const LIMIT_MAX_MB = 200;
export const clampMaxMb = (v) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return DEFAULT_MAX_MB;
    return Math.min(LIMIT_MAX_MB, Math.max(MIN_MAX_MB, n));
};

/** Estados de una descarga. «Entregada» = el servidor autorizó y entregó el enlace. */
export const DOWNLOAD_STATUS = { REQUESTED: 'requested', DELIVERED: 'delivered', FAILED: 'failed' };

export const isResourceKey = (k) => RESOURCE_KEYS.includes(String(k || ''));

/**
 * El ámbito de un recurso es la EDICIÓN (`CalendarEvent.id`), igual que la
 * convocatoria: la plantilla de la XII no es la de la XIII. Sin edición, el
 * ámbito es 'global' — el respaldo, como la convocatoria abierta.
 */
export const scopeOf = (eventId) => {
    const v = String(eventId || '').trim().slice(0, 80);
    return v || 'global';
};

export const extensionOf = (filename) => {
    const m = /\.([a-z0-9]+)$/i.exec(String(filename || '').trim());
    return m ? m[1].toLowerCase() : '';
};

export const fmtBytes = (n) => {
    const b = Number(n) || 0;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
    if (b >= 1024) return `${Math.round(b / 1024)} KB`;
    return `${b} B`;
};

/**
 * Lo que se puede comprobar ANTES de subir: extensión admitida y tamaño
 * declarado. No prueba nada sobre el archivo —eso lo hace `sniffFormat` con
 * los bytes ya subidos—, pero evita que alguien espere a subir 300 MB para
 * enterarse de que no se aceptan.
 */
export const checkUploadMeta = ({ filename, size, maxMb = DEFAULT_MAX_MB } = {}) => {
    const errores = [];
    const ext = extensionOf(filename);
    if (!filename) errores.push('Falta el nombre del archivo.');
    else if (!RESOURCE_FORMATS[ext]) errores.push(`Formato no admitido. Se acepta ${Object.values(RESOURCE_FORMATS).map(f => f.short).join(' o ')}.`);
    const bytes = Number(size) || 0;
    const max = clampMaxMb(maxMb) * 1024 * 1024;
    if (bytes <= 0) errores.push('El archivo está vacío.');
    else if (bytes > max) errores.push(`El archivo pesa ${fmtBytes(bytes)}; el máximo es ${clampMaxMb(maxMb)} MB.`);
    return { ok: errores.length === 0, errores, format: RESOURCE_FORMATS[ext] ? ext : null };
};

const toBuffer = (b) => (b ? (Buffer.isBuffer(b) ? b : Buffer.from(b)) : Buffer.alloc(0));

/**
 * El TIPO REAL del archivo, por sus bytes.
 *
 *   · PDF: la firma `%PDF-` en el primer kilobyte (la especificación la admite
 *     ahí, no sólo en el byte cero).
 *   · PPTX: es un ZIP (`PK\x03\x04`) cuyo directorio central —al FINAL del
 *     archivo, sin comprimir— nombra `ppt/presentation.xml` y
 *     `[Content_Types].xml`. Un DOCX o un XLSX también son ZIP: lo que los
 *     distingue es esa entrada, y por eso se lee la cola y no sólo la cabeza.
 *
 * `head` son los primeros bytes; `tail`, los últimos (64 KB alcanzan para el
 * directorio central de cualquier plantilla razonable).
 */
export const sniffFormat = (head, tail) => {
    const h = toBuffer(head);
    const t = toBuffer(tail);
    if (h.subarray(0, 1024).includes(Buffer.from('%PDF-'))) return 'pdf';
    const isZip = h.length >= 4 && h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04;
    if (isZip) {
        const cola = Buffer.concat([h, t]);
        if (cola.includes(Buffer.from('ppt/presentation.xml')) && cola.includes(Buffer.from('[Content_Types].xml'))) return 'pptx';
        return 'zip';
    }
    return null;
};

/**
 * Juicio final sobre un archivo YA SUBIDO: el tipo real tiene que coincidir con
 * la extensión, y el peso real (el de S3, no el declarado) caber en el tope.
 */
export const judgeUploadedFile = ({ filename, bytes, head, tail, maxMb = DEFAULT_MAX_MB }) => {
    const declared = extensionOf(filename);
    const real = sniffFormat(head, tail);
    const max = clampMaxMb(maxMb) * 1024 * 1024;
    if (!(Number(bytes) > 0)) return { ok: false, error: 'El archivo llegó vacío.' };
    if (Number(bytes) > max) return { ok: false, error: `El archivo pesa ${fmtBytes(bytes)}; el máximo es ${clampMaxMb(maxMb)} MB.` };
    if (!real || real === 'zip') return { ok: false, error: 'El contenido del archivo no corresponde a una presentación PowerPoint (PPTX) ni a un PDF.' };
    if (real !== declared) return { ok: false, error: `El archivo dice ser .${declared || '?'} pero su contenido es ${RESOURCE_FORMATS[real].short}. Renómbralo o súbelo en el formato correcto.` };
    return { ok: true, format: real, contentType: RESOURCE_FORMATS[real].mime };
};

/** Nombre del archivo que recibe quien descarga: título + versión + extensión. */
export const downloadFileName = (title, versionNumber, format) => {
    const base = String(title || 'Plantilla')
        .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'Plantilla';
    return `${base} - v${Number(versionNumber) || 1}.${RESOURCE_FORMATS[format] ? format : 'pdf'}`;
};

/**
 * Cabecera Content-Disposition para la descarga. Con acentos hace falta la
 * forma RFC 5987 (`filename*`), y un respaldo ASCII para navegadores viejos.
 */
export const contentDisposition = (fileName) => {
    const ascii = String(fileName).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

/**
 * Lo que el club ve en su tarjeta. Llega RESUELTO del servidor, como el
 * veredicto del pago: la pantalla lo pinta y no decide nada.
 *
 *   · `available`: hay un archivo publicado y el recurso está activo.
 *   · `updated`: la versión vigente reemplazó a otra (versión 2 o más).
 *   · `downloaded`: este proyecto ya recibió AL MENOS UNA entrega; no bloquea
 *     nada, sólo se dice con discreción.
 *   · `newerSinceDownload`: lo que bajó era una versión anterior.
 */
export const cardStateOf = ({ resource, version, myLastDelivered }) => {
    const key = resource?.key || 'presentation_template';
    const defaults = RESOURCE_DEFAULTS[key] || RESOURCE_DEFAULTS.presentation_template;
    const available = Boolean(resource?.active && version);
    const base = {
        key,
        title: resource?.title || defaults.title,
        description: resource?.description || defaults.description,
        available,
        message: available ? null : 'La plantilla oficial estará disponible próximamente.',
    };
    if (!available) return { ...base, version: null, downloaded: Boolean(myLastDelivered), lastDownloadedAt: myLastDelivered?.at || null, updated: false, newerSinceDownload: false };
    return {
        ...base,
        version: {
            number: Number(version.versionNumber) || 1,
            format: version.format,
            formatLabel: RESOURCE_FORMATS[version.format]?.short || String(version.format || '').toUpperCase(),
            sizeBytes: Number(version.sizeBytes) || 0,
            sizeLabel: fmtBytes(version.sizeBytes),
            publishedAt: version.publishedAt || null,
        },
        updated: (Number(version.versionNumber) || 1) > 1,
        downloaded: Boolean(myLastDelivered),
        lastDownloadedAt: myLastDelivered?.at || null,
        newerSinceDownload: Boolean(myLastDelivered) && Number(myLastDelivered.versionNumber) < (Number(version.versionNumber) || 1),
    };
};

/** Seguimiento: los tres filtros de estado de la tabla. */
export const TRACKING_FILTERS = [
    { key: 'all', label: 'Todos' },
    { key: 'downloaded', label: 'Ya descargaron' },
    { key: 'pending', label: 'No han descargado' },
];
export const normalizeTrackingFilter = (v) => (TRACKING_FILTERS.some(f => f.key === v) ? v : 'all');

/**
 * Los indicadores, a partir de las filas del seguimiento (una por proyecto).
 *
 * El universo son los proyectos ELEGIBLES (postulados y no archivados). Un
 * borrador que descargó aparece en la tabla —su descarga existió— pero no
 * entra en el denominador de la adopción: todavía no es un proyecto postulado.
 */
export const summarizeTracking = (rows = []) => {
    const elegibles = rows.filter(r => r.eligible);
    const conDescarga = elegibles.filter(r => r.deliveredCount > 0);
    const usuarios = new Set(rows.filter(r => r.deliveredCount > 0).map(r => r.accountId || r.submissionId));
    const clubesElegibles = new Set(elegibles.map(r => String(r.clubName || '').trim().toLowerCase()).filter(Boolean));
    const clubesCon = new Set(conDescarga.map(r => String(r.clubName || '').trim().toLowerCase()).filter(Boolean));
    const last = rows.map(r => r.lastDeliveredAt).filter(Boolean).sort().pop() || null;
    return {
        eligibleProjects: elegibles.length,
        projectsWithDownload: conDescarga.length,
        pendingProjects: elegibles.length - conDescarga.length,
        uniqueUsers: usuarios.size,
        totalDelivered: rows.reduce((a, r) => a + (Number(r.deliveredCount) || 0), 0),
        totalFailed: rows.reduce((a, r) => a + (Number(r.failedCount) || 0), 0),
        adoptionPct: elegibles.length ? Math.round((conDescarga.length / elegibles.length) * 1000) / 10 : 0,
        clubsWithDownload: clubesCon.size,
        clubsPending: [...clubesElegibles].filter(c => !clubesCon.has(c)).length,
        lastDeliveredAt: last,
    };
};

/** Descargas por distrito, sobre los elegibles. */
export const byDistrict = (rows = []) => {
    const map = new Map();
    for (const r of rows.filter(x => x.eligible)) {
        const k = String(r.district || '').trim() || 'Sin distrito';
        const d = map.get(k) || { district: k, eligible: 0, withDownload: 0, delivered: 0 };
        d.eligible += 1;
        if (r.deliveredCount > 0) d.withDownload += 1;
        d.delivered += Number(r.deliveredCount) || 0;
        map.set(k, d);
    }
    return [...map.values()]
        .map(d => ({ ...d, adoptionPct: d.eligible ? Math.round((d.withDownload / d.eligible) * 1000) / 10 : 0 }))
        .sort((a, b) => b.eligible - a.eligible || a.district.localeCompare(b.district));
};

/** Filtro de la tabla, en memoria: estado, club, distrito, proyecto y texto libre. */
export const filterTracking = (rows = [], { estado = 'all', club = '', district = '', project = '', q = '' } = {}) => {
    const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const st = normalizeTrackingFilter(estado);
    const nq = norm(q);
    return rows.filter(r => {
        if (st === 'downloaded' && !(r.deliveredCount > 0)) return false;
        if (st === 'pending' && (r.deliveredCount > 0 || !r.eligible)) return false;
        if (club && norm(r.clubName) !== norm(club)) return false;
        if (district && norm(r.district) !== norm(district)) return false;
        if (project && !norm(r.projectName).includes(norm(project))) return false;
        if (nq && ![r.responsible, r.email, r.clubName, r.projectName, r.publicRef].some(v => norm(v).includes(nq))) return false;
        return true;
    });
};

/** CSV del seguimiento (separador `;` y BOM: es lo que Excel en español abre bien). */
export const trackingCsv = (rows = []) => {
    const headers = ['Responsable', 'Correo', 'Club Rotario', 'Distrito', 'Proyecto', 'Código', 'Postulación',
        'Estado de descarga', 'Descargas', 'Primera descarga', 'Última descarga', 'Versión descargada', 'Intentos fallidos'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const iso = (v) => (v ? new Date(v).toISOString() : '');
    const lines = [headers.join(';')];
    for (const r of rows) {
        lines.push([
            r.responsible, r.email, r.clubName, r.district, r.projectName, r.publicRef,
            r.eligible ? (r.projectStateLabel || 'Postulado') : `${r.projectStateLabel || 'Borrador'} (no elegible)`,
            r.deliveredCount > 0 ? 'Descargó' : 'No ha descargado',
            r.deliveredCount, iso(r.firstDeliveredAt), iso(r.lastDeliveredAt),
            r.lastVersionNumber ? `v${r.lastVersionNumber}` : '', r.failedCount,
        ].map(cell).join(';'));
    }
    return '﻿' + lines.join('\n');
};

export default {
    RESOURCE_KEYS, RESOURCE_DEFAULTS, RESOURCE_FORMATS, ACCEPTED_EXTENSIONS, DEFAULT_MAX_MB, MIN_MAX_MB, LIMIT_MAX_MB,
    DOWNLOAD_STATUS, TRACKING_FILTERS, clampMaxMb, isResourceKey, scopeOf, extensionOf, fmtBytes, checkUploadMeta,
    sniffFormat, judgeUploadedFile, downloadFileName, contentDisposition, cardStateOf, normalizeTrackingFilter,
    summarizeTracking, byDistrict, filterTracking, trackingCsv,
};
