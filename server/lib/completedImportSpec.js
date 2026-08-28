// ════════════════════════════════════════════════════════════════════
// Importación de inscripciones históricas — el CRITERIO — v4.950.0
//
// Migra a «Inscripciones COLROTARIOS» los registros capturados en el sistema
// anterior (otro formulario, otra página). La regla principal del pedido:
// UN REGISTRO IMPORTADO ES UN REGISTRO NORMAL de EventCompletedRegistration,
// con `registrationSource: 'historical_import'` — no existe un segundo
// universo de «inscripciones importadas» desconectado del sistema.
//
// Este archivo es PURO: sin base, sin red. Parseo del archivo, mapeo
// automático de encabezados, normalización de valores, clasificación de
// duplicados y el resumen del lote. Los DESTINOS del mapeo se DERIVAN de
// `buildCompletedSchema` — la misma fuente del formulario público: un campo
// nuevo en el formulario aparece solo como destino, sin mantener dos listas.
//
// La validación de cada fila es `validateCompletedAnswers`, LA MISMA del
// formulario público: un registro importado pasa por el mismo criterio que
// uno diligenciado en línea.
// ════════════════════════════════════════════════════════════════════

import {
    flattenCompletedFields, isCompletedFieldRequired,
    COMPLETED_STATUS_KEYS,
} from './completedRegistrationSpec.js';

export const IMPORT_SOURCE = 'historical_import';
export const IMPORT_SOURCE_LABEL = 'Importación histórica';

// El estado inicial del lote lo elige el administrador; el valor por defecto
// es «Pendiente de validación» — no se asume que lo histórico está validado.
export const IMPORT_INITIAL_STATUSES = ['submitted', 'validated', 'needs_correction'];
export const DEFAULT_IMPORT_STATUS = 'submitted';

export const isAllowedInitialStatus = (status) =>
    IMPORT_INITIAL_STATUSES.includes(status) && COMPLETED_STATUS_KEYS.includes(status);

// Tope defensivo: un archivo histórico razonable son cientos de filas. Miles
// exigirían otro camino (cola), y decirlo es mejor que colgar la función.
export const IMPORT_MAX_ROWS = 2000;

// ── Parseo del archivo ───────────────────────────────────────────────
//
// El TEXTO viaja al servidor y se parsea UNA sola vez acá (cliente y commit
// re-parsean con el mismo criterio): un parser en el navegador y otro en el
// servidor se separarían en silencio, y lo que se importa tiene que ser lo
// que se previsualizó.

/** El delimitador, mirando la primera línea: tab (pegado de Excel) gana. */
export const detectDelimiter = (firstLine = '') => {
    const line = String(firstLine);
    if (line.includes('\t')) return '\t';
    const semis = (line.match(/;/g) || []).length;
    const commas = (line.match(/,/g) || []).length;
    return semis > commas ? ';' : ',';
};

/** Una línea delimitada, con soporte de comillas dobles al estilo CSV. */
export const parseDelimitedLine = (line, delimiter) => {
    const cells = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; continue; }
            if (ch === '"') { inQuotes = false; continue; }
            current += ch;
            continue;
        }
        if (ch === '"') { inQuotes = true; continue; }
        if (ch === delimiter) { cells.push(current); current = ''; continue; }
        current += ch;
    }
    cells.push(current);
    return cells.map(c => c.trim());
};

const stripBom = (text) => String(text || '').replace(/^\uFEFF/, '');

/**
 * El texto completo → { delimiter, headers, rows, emptyDropped, headerDetected }.
 * La primera fila se toma como encabezados cuando al menos DOS de sus celdas
 * casan con un campo conocido; si no, se generan «Columna N» y la primera fila
 * es un dato — no se pierde un registro por no traer encabezados.
 */
export const parseImportText = (text, fields = []) => {
    const lines = stripBom(text).split(/\r\n|\r|\n/);
    const firstNonEmpty = lines.find(l => l.trim() !== '') || '';
    const delimiter = detectDelimiter(firstNonEmpty);

    const parsed = [];
    let emptyDropped = 0;
    for (const line of lines) {
        if (line.trim() === '') { emptyDropped++; continue; }
        parsed.push(parseDelimitedLine(line, delimiter));
    }
    if (!parsed.length) {
        return { delimiter, headers: [], rows: [], emptyDropped, headerDetected: false };
    }

    const width = Math.max(...parsed.map(r => r.length));
    const padded = parsed.map(r => [...r, ...Array(Math.max(0, width - r.length)).fill('')]);

    const candidate = padded[0];
    const mapped = autoMapColumns(candidate, fields);
    const hits = Object.values(mapped).filter(Boolean).length;
    const headerDetected = hits >= 2;

    const headers = headerDetected
        ? candidate.map((h, i) => String(h || '').trim() || `Columna ${i + 1}`)
        : candidate.map((_, i) => `Columna ${i + 1}`);
    const rows = (headerDetected ? padded.slice(1) : padded)
        // Una fila cuyo contenido entero está vacío no es un registro.
        .filter(r => r.some(c => String(c).trim() !== ''));

    return { delimiter, headers, rows, emptyDropped, headerDetected };
};

// ── Los destinos del mapeo ───────────────────────────────────────────
//
// Salen del ESQUEMA REAL del formulario (la exigencia del pedido: una sola
// lista). Los extras son destinos propios de una migración: la URL del
// comprobante del sistema anterior y «dato adicional», que conserva la columna
// en `importMeta.extra` SIN contaminar el esquema principal.

export const EXTRA_DESTINATIONS = [
    { key: 'receiptUrl', label: 'Comprobante de pago (URL del sistema anterior)', extra: true },
];

export const importFieldsFor = (config = {}) => [
    ...flattenCompletedFields(config).map(f => ({
        key: f.key, label: f.label, required: Boolean(f.required),
        type: f.type, options: f.options || null, catalog: f.catalog || null,
    })),
    ...EXTRA_DESTINATIONS,
];

// ── Mapeo automático por similitud ───────────────────────────────────

const normalizeToken = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Sinónimos habituales de un archivo histórico. La coincidencia EXACTA del
// token normalizado gana; después se intenta contra el rótulo real del campo.
export const HEADER_SYNONYMS = {
    firstName: ['nombre', 'nombres', 'first name', 'primer nombre', 'name'],
    lastName: ['apellido', 'apellidos', 'last name', 'surname', 'primer apellido'],
    documentNumber: ['documento', 'documento de identidad', 'cedula', 'cc', 'identificacion', 'numero de documento', 'document', 'id'],
    email: ['email', 'correo', 'correo electronico', 'e mail', 'email address', 'mail'],
    phone: ['telefono', 'celular', 'whatsapp', 'mobile', 'numero de contacto', 'contacto', 'telefono whatsapp', 'phone'],
    district: ['distrito', 'district', 'distrito rotario'],
    clubName: ['club', 'club rotario', 'rotary club', 'nombre del club'],
    membershipType: ['socio o invitado', 'condicion', 'tipo de participante', 'membresia', 'es socio'],
    clubRole: ['cargo', 'cargo en el club', 'rol', 'cargo periodo', 'cargo 2026 2027'],
    eps: ['eps', 'salud', 'entidad de salud'],
    foodAllergy: ['alergia', 'alergias', 'alergico', 'restriccion alimentaria', 'alimentos'],
    emergencyName: ['contacto de emergencia', 'nombre emergencia', 'emergencia nombre', 'persona de contacto'],
    emergencyPhone: ['telefono de emergencia', 'telefono emergencia', 'emergencia telefono', 'celular emergencia'],
    paymentMethod: ['metodo de pago', 'forma de pago', 'medio de pago', 'pago', 'forma pago'],
    receiptUrl: ['comprobante', 'comprobante de pago', 'url comprobante', 'soporte de pago', 'recibo', 'voucher'],
    comments: ['comentarios', 'observaciones', 'peticiones', 'notas', 'comentario'],
};

/**
 * Mapea encabezados → clave de campo. Devuelve `{ [header]: fieldKey | null }`
 * por POSICIÓN (dos encabezados iguales no se pisan: decide el índice).
 * Es una SUGERENCIA: el administrador corrige antes de importar.
 */
export const autoMapColumns = (headers = [], fields = []) => {
    const byToken = new Map();
    for (const [key, tokens] of Object.entries(HEADER_SYNONYMS)) {
        for (const token of tokens) byToken.set(normalizeToken(token), key);
    }
    const fieldKeys = new Set([...fields.map(f => f.key), ...EXTRA_DESTINATIONS.map(f => f.key)]);
    const labelIndex = fields.map(f => ({ key: f.key, label: normalizeToken(f.label) }));

    const result = {};
    headers.forEach((header, i) => {
        const token = normalizeToken(header);
        let match = byToken.get(token) || null;
        if (!match) {
            // Contención por sinónimo («correo_electronico_participante»).
            for (const [syn, key] of byToken.entries()) {
                if (syn.length >= 4 && token.includes(syn)) { match = key; break; }
            }
        }
        if (!match && token) {
            const byLabel = labelIndex.find(f => f.label === token || (token.length >= 6 && f.label.includes(token)));
            if (byLabel) match = byLabel.key;
        }
        result[i] = match && (fieldKeys.size === 0 || fieldKeys.has(match)) ? match : null;
    });
    return result;
};

// ── Normalización de valores ─────────────────────────────────────────

/** «Distrito 4281», «D4281», «4281» → «4281». Sin número de 4 cifras, tal cual. */
export const normalizeDistrictValue = (value) => {
    const raw = String(value || '').trim();
    const m = raw.match(/(?<!\d)(\d{4})(?!\d)/);
    return m ? m[1] : raw;
};

/**
 * Casa un valor libre contra las opciones CERRADAS de un campo (membresía,
 * cargo, método de pago): por valor exacto, por rótulo normalizado y por
 * contención. `null` = no se reconoce (el administrador decide).
 */
export const matchOptionValue = (field, raw) => {
    const options = Array.isArray(field?.options) ? field.options : null;
    if (!options) return null;
    const value = String(raw || '').trim();
    if (!value) return null;
    if (options.some(o => o.value === value)) return value;
    const token = normalizeToken(value);
    const exact = options.find(o => normalizeToken(o.label) === token);
    if (exact) return exact.value;
    const contained = options.find(o => {
        const label = normalizeToken(o.label);
        return (token.length >= 4 && label.includes(token)) || (label.length >= 4 && token.includes(label));
    });
    return contained ? contained.value : null;
};

// Equivalencias frecuentes del método de pago histórico, ANTES del match
// genérico: «consignación» no contiene «transferencia» y aun así lo es.
const PAYMENT_SYNONYMS = [
    { value: 'transferencia', tokens: ['transferencia', 'consignacion', 'banco', 'bancolombia', 'transfer', 'ach', 'pse'] },
    { value: 'pasarela_colrotarios', tokens: ['colrotarios', 'pasarela', 'wompi', 'plataforma'] },
    { value: 'otro', tokens: ['efectivo', 'otro', 'cash', 'datafono'] },
];

export const normalizePaymentMethod = (raw) => {
    const token = normalizeToken(raw);
    if (!token) return null;
    for (const entry of PAYMENT_SYNONYMS) {
        if (entry.tokens.some(t => token.includes(t))) return entry.value;
    }
    return null;
};

/** ¿La celda parece una URL usable como referencia de comprobante? */
export const isUsableReceiptUrl = (raw) => /^https?:\/\/\S+$/i.test(String(raw || '').trim());

/**
 * Una fila del archivo → respuestas del formulario, con las normalizaciones
 * ANOTADAS (`notes`): lo que se ajustó se dice, no se corrige en silencio.
 * Un cargo que no casa con el catálogo NO se descarta: cae a «Otro cargo» con
 * el texto original en `clubRoleOther` — descartar por una diferencia de
 * escritura es justo lo que el pedido prohíbe.
 */
export const assembleRow = (headers, row, mapping, fields, options = {}) => {
    const answers = {};
    const notes = [];
    let receiptUrl = '';
    const extra = {};

    headers.forEach((header, i) => {
        const dest = mapping[i];
        const value = String(row[i] ?? '').trim();
        if (!dest || dest === 'omit') {
            if (dest !== 'omit' && options.keepUnmapped && value) extra[header] = value;
            return;
        }
        if (!value) return;
        if (dest === 'receiptUrl') {
            if (isUsableReceiptUrl(value)) receiptUrl = value.slice(0, 500);
            else notes.push(`El comprobante de la columna «${header}» no es una URL y se conservó como dato adicional.`);
            if (!isUsableReceiptUrl(value)) extra[header] = value;
            return;
        }
        if (dest === 'extra') { extra[header] = value; return; }
        answers[dest] = value;
    });

    if (answers.district) {
        const normalized = normalizeDistrictValue(answers.district);
        if (normalized !== answers.district) {
            notes.push(`Distrito «${answers.district}» → ${normalized}.`);
            answers.district = normalized;
        }
    }
    if (answers.email) answers.email = answers.email.toLowerCase();

    for (const key of ['membershipType', 'clubRole', 'paymentMethod']) {
        if (!answers[key]) continue;
        const field = fields.find(f => f.key === key);
        let matched = key === 'paymentMethod' ? normalizePaymentMethod(answers[key]) : null;
        if (!matched) matched = matchOptionValue(field, answers[key]);
        if (matched && matched !== answers[key]) {
            notes.push(`${field?.label || key}: «${answers[key]}» → ${matched}.`);
            answers[key] = matched;
        } else if (!matched && key === 'clubRole') {
            notes.push(`Cargo «${answers.clubRole}» sin equivalente: quedó como «Otro cargo» con el texto original.`);
            answers.clubRoleOther = answers.clubRoleOther || answers.clubRole;
            answers.clubRole = 'otro_cargo';
        }
    }

    if (!answers.paymentMethod && options.defaultPaymentMethod) {
        answers.paymentMethod = options.defaultPaymentMethod;
        notes.push(`Método de pago del lote: ${options.defaultPaymentMethod}.`);
    }

    return { answers, receiptUrl, extra, notes };
};

/**
 * «Revisión sugerida» del club: el mejor candidato del catálogo del distrito
 * elegido, por contención normalizada. NO corrige solo — sugiere.
 */
export const suggestClub = (district, clubName, catalogs = {}) => {
    const name = normalizeToken(clubName);
    if (!name) return null;
    const districtEntry = (catalogs.districts || []).find(d =>
        d.value === String(district || '').trim() || normalizeToken(d.label) === normalizeToken(district));
    const clubs = districtEntry?.clubs || [];
    if (clubs.some(c => normalizeToken(c) === name)) return null; // ya es exacto
    const candidate = clubs.find(c => {
        const t = normalizeToken(c);
        return t.includes(name) || name.includes(t);
    });
    return candidate || null;
};

// ── Duplicados ───────────────────────────────────────────────────────
//
// Señales, de la más fuerte a la más débil: documento y correo CONFIRMAN;
// teléfono o nombre completo sólo SUGIEREN. Nada se sobrescribe ni se omite en
// silencio: la clasificación viaja a la vista previa y el administrador decide
// fila por fila.

const cleanKey = (v) => String(v || '').trim().toLowerCase();
const phoneKey = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const nameKey = (a) => normalizeToken(`${a.firstName || ''} ${a.lastName || ''}`);

/**
 * @param subject respuestas de la fila
 * @param existing filas ya guardadas del evento (normales + completadas), con
 *        `source` para poder nombrar de dónde viene cada coincidencia
 * @param seen mapa acumulado de filas ANTERIORES del mismo archivo
 */
export const classifyDuplicate = (subject, existing = [], seen = null) => {
    const doc = cleanKey(subject.documentNumber);
    const mail = cleanKey(subject.email);
    const phone = phoneKey(subject.phone);
    const name = nameKey(subject);

    const matches = [];
    let kind = 'nuevo';
    const push = (level, match, reason) => {
        matches.push({ ...match, reason });
        if (level === 'confirmado') kind = 'confirmado';
        else if (kind !== 'confirmado') kind = 'posible';
    };

    for (const row of existing) {
        const rDoc = cleanKey(row.documentNumber);
        const rMail = cleanKey(row.email);
        if ((doc && rDoc && doc === rDoc) || (mail && rMail && mail === rMail)) {
            push('confirmado', row, doc && rDoc && doc === rDoc ? 'mismo documento' : 'mismo correo');
            continue;
        }
        const rPhone = phoneKey(row.phone);
        if (phone && phone.length >= 7 && rPhone && phone === rPhone) {
            push('posible', row, 'mismo teléfono');
            continue;
        }
        const rName = nameKey(row);
        if (name && rName && name === rName) push('posible', row, 'mismo nombre y apellido');
    }

    if (seen) {
        if (doc && seen.docs?.has(doc)) push('confirmado', { source: 'archivo', name: subject.firstName }, `documento repetido en el archivo (fila ${seen.docs.get(doc)})`);
        else if (mail && seen.mails?.has(mail)) push('confirmado', { source: 'archivo', name: subject.firstName }, `correo repetido en el archivo (fila ${seen.mails.get(mail)})`);
        else if (name && seen.names?.has(name)) push('posible', { source: 'archivo', name: subject.firstName }, `nombre repetido en el archivo (fila ${seen.names.get(name)})`);
    }

    return { kind, matches };
};

/** Registra la fila en el acumulado del archivo (para las filas siguientes). */
export const rememberRow = (seen, subject, rowNumber) => {
    const doc = cleanKey(subject.documentNumber);
    const mail = cleanKey(subject.email);
    const name = nameKey(subject);
    if (doc && !seen.docs.has(doc)) seen.docs.set(doc, rowNumber);
    if (mail && !seen.mails.has(mail)) seen.mails.set(mail, rowNumber);
    if (name && !seen.names.has(name)) seen.names.set(name, rowNumber);
};

export const newSeen = () => ({ docs: new Map(), mails: new Map(), names: new Map() });

// ── Decisiones y resumen ─────────────────────────────────────────────
//
// Qué se hace con cada fila lo decide el administrador; el criterio sólo dice
// qué decisiones son LEGALES para su clasificación. Un duplicado nunca se crea
// en silencio: «posible» exige elegir, «confirmado» sólo se omite o se usa
// para COMPLETAR el registro existente (rellenar vacíos, jamás sobrescribir).

export const legalDecisionsFor = (row) => {
    if (row.errors && Object.keys(row.errors).length) return ['omitir', 'editar'];
    if (row.duplicate?.kind === 'confirmado') return ['omitir', 'completar'];
    if (row.duplicate?.kind === 'posible') return ['omitir', 'nuevo', 'completar'];
    return ['importar', 'omitir'];
};

export const defaultDecisionFor = (row) => {
    if (row.errors && Object.keys(row.errors).length) return 'omitir';
    if (row.duplicate?.kind === 'confirmado') return 'omitir';
    if (row.duplicate?.kind === 'posible') return 'omitir';
    return 'importar';
};

export const buildImportSummary = (rows = []) => {
    const summary = {
        total: rows.length,
        listas: 0, conErrores: 0, posiblesDuplicados: 0, duplicadosConfirmados: 0,
        revisionClub: 0,
    };
    for (const r of rows) {
        const hasErrors = r.errors && Object.keys(r.errors).length > 0;
        if (hasErrors) summary.conErrores++;
        else if (r.duplicate?.kind === 'confirmado') summary.duplicadosConfirmados++;
        else if (r.duplicate?.kind === 'posible') summary.posiblesDuplicados++;
        else summary.listas++;
        if (r.clubSuggestion) summary.revisionClub++;
    }
    return summary;
};

// Reexportado para que el consumidor del motor no importe dos specs.
export { isCompletedFieldRequired };

export default {
    IMPORT_SOURCE, IMPORT_SOURCE_LABEL, IMPORT_INITIAL_STATUSES, DEFAULT_IMPORT_STATUS,
    isAllowedInitialStatus, IMPORT_MAX_ROWS,
    detectDelimiter, parseDelimitedLine, parseImportText,
    EXTRA_DESTINATIONS, importFieldsFor, HEADER_SYNONYMS, autoMapColumns,
    normalizeDistrictValue, matchOptionValue, normalizePaymentMethod,
    isUsableReceiptUrl, assembleRow, suggestClub,
    classifyDuplicate, rememberRow, newSeen,
    legalDecisionsFor, defaultDecisionFor, buildImportSummary,
};
