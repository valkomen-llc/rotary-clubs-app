// ════════════════════════════════════════════════════════════════════
// Importación de inscripciones históricas — el CRITERIO — v4.962.0
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
// formulario público, pero su veredicto se REPARTE (v4.960): lo que falta
// AVISA y lo que no identifica a ninguna persona BLOQUEA. Ver
// `splitImportFindings` — supersede la regla de v4.950 «importar no afloja
// ningún criterio», con su motivo medido escrito ahí.
// ════════════════════════════════════════════════════════════════════

import {
    flattenCompletedFields, isCompletedFieldRequired,
    COMPLETED_STATUS_KEYS,
} from './completedRegistrationSpec.js';
// La conversión hora-de-pared → instante vive en UN solo sitio del servidor
// (`timezone.js`, sin dependencias y a prueba de horario de verano): escribir
// una segunda daría dos criterios sobre el mismo minuto.
import { zonedWallToUtc } from './timezone.js';

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

/**
 * ⚠️ v4.960 — El texto ENTERO, no línea por línea.
 *
 * Un salto de línea DENTRO de una celda entrecomillada es parte del dato —una
 * observación de dos renglones, una dirección con salto—, y partir el archivo
 * por saltos ANTES de mirar las comillas convierte ese único registro en dos o
 * tres filas inventadas: la segunda arranca a media frase y cae en la columna
 * equivocada. Es lo que hacía que un archivo de 273 registros se detectara como
 * 333 filas. Se recorre el texto de una vez llevando el estado de las comillas.
 *
 * Devuelve además `unterminated`: si el archivo cierra con una comilla abierta,
 * NO está entrecomillado al estilo CSV (una comilla suelta en un texto libre) y
 * seguir así fundiría todo el resto del archivo en una sola celda. Ahí manda el
 * parseo por líneas, que es lo que hacía este motor hasta v4.959.
 */
export const parseDelimitedText = (text, delimiter) => {
    const src = String(text || '');
    const rows = [];
    let row = [], cell = '', inQuotes = false;
    const pushCell = () => { row.push(cell.trim()); cell = ''; };
    const pushRow = () => { pushCell(); rows.push(row); row = []; };
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; continue; }
            if (ch === '"') { inQuotes = false; continue; }
            cell += ch;
            continue;
        }
        if (ch === '"') { inQuotes = true; continue; }
        if (ch === delimiter) { pushCell(); continue; }
        if (ch === '\r') { if (src[i + 1] === '\n') i++; pushRow(); continue; }
        if (ch === '\n') { pushRow(); continue; }
        cell += ch;
    }
    if (cell !== '' || row.length) pushRow();
    return { rows, unterminated: inQuotes };
};

const stripBom = (text) => String(text || '').replace(/^\uFEFF/, '');

/**
 * El texto completo → { delimiter, headers, rows, emptyDropped, headerDetected }.
 * La primera fila se toma como encabezados cuando al menos DOS de sus celdas
 * casan con un campo conocido; si no, se generan «Columna N» y la primera fila
 * es un dato — no se pierde un registro por no traer encabezados.
 */
export const parseImportText = (text, fields = []) => {
    const clean = stripBom(text);
    const lines = clean.split(/\r\n|\r|\n/);
    const firstNonEmpty = lines.find(l => l.trim() !== '') || '';
    const delimiter = detectDelimiter(firstNonEmpty);

    const streamed = parseDelimitedText(clean, delimiter);
    const quotedRows = streamed.unterminated ? null : streamed.rows;
    // El respaldo por líneas NO pre-filtra: las vacías se descartan y se
    // CUENTAN en el mismo bucle que las del camino entrecomillado, o los dos
    // caminos reportarían cifras distintas sobre el mismo archivo.
    const source = quotedRows || lines.map(l => parseDelimitedLine(l, delimiter));

    const parsed = [];
    let emptyDropped = 0;
    for (const cells of source) {
        if (!cells.some(c => String(c).trim() !== '')) { emptyDropped++; continue; }
        parsed.push(cells);
    }
    if (!parsed.length) {
        return {
            delimiter, headers: [], rows: [], emptyDropped, headerDetected: false,
            unterminatedQuote: streamed.unterminated,
        };
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

    return {
        delimiter, headers, rows, emptyDropped, headerDetected,
        unterminatedQuote: streamed.unterminated,
    };
};

// ── Los destinos del mapeo ───────────────────────────────────────────
//
// Salen del ESQUEMA REAL del formulario (la exigencia del pedido: una sola
// lista). Los extras son destinos propios de una migración: la URL del
// comprobante del sistema anterior y «dato adicional», que conserva la columna
// en `importMeta.extra` SIN contaminar el esquema principal.

export const EXTRA_DESTINATIONS = [
    { key: 'receiptUrl', label: 'Comprobante de pago (URL del sistema anterior)', extra: true },
    // v4.959 — la «Marca temporal» del formulario anterior: CUÁNDO se registró
    // esa persona. No es una pregunta del formulario (nadie escribe su propia
    // marca temporal), así que vive acá y no en el esquema: es un destino
    // propio de la migración, como la URL del comprobante.
    { key: 'submittedAt', label: 'Fecha del registro (marca temporal del sistema anterior)', extra: true },
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
    guestType: ['si es invitado', 'tipo de invitado', 'invitado seleccione', 'conyuge'],
    eps: ['eps', 'salud', 'entidad de salud'],
    foodAllergy: ['alergia', 'alergias', 'alergico', 'restriccion alimentaria', 'alimentos'],
    emergencyName: ['contacto de emergencia', 'nombre emergencia', 'emergencia nombre', 'persona de contacto'],
    emergencyPhone: ['telefono de emergencia', 'telefono emergencia', 'emergencia telefono', 'celular emergencia'],
    paymentMethod: ['metodo de pago', 'forma de pago', 'medio de pago', 'pago', 'forma pago'],
    receiptUrl: ['comprobante', 'comprobante de pago', 'url comprobante', 'soporte de pago', 'recibo', 'voucher'],
    submittedAt: ['marca temporal', 'timestamp', 'fecha', 'fecha de registro', 'fecha y hora',
        'fecha de envio', 'fecha de diligenciamiento', 'registrado el', 'enviado el'],
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

// ── La marca temporal del sistema anterior (v4.959) ──────────────────
//
// ⚠️ DOS COSAS QUE NO SE PUEDEN ADIVINAR EN SILENCIO, y por eso las dos se
// DICEN en la nota de la fila:
//
// 1. EL ORDEN. «4/06/26» es 4 de junio para el formulario de referencia
//    —Google Forms en español escribe día/mes— y sería 6 de abril leído al
//    revés. Con día y mes ≤ 12 la lectura es AMBIGUA por construcción: se
//    resuelve día/mes (que es el origen real del archivo) y la nota escribe la
//    fecha en letras, para que el administrador la contraste antes de importar.
// 2. LA ZONA. «14:47» es la hora de pared de quien llenó el formulario, en la
//    zona del evento. Guardarla como si fuera UTC la correría cinco horas y la
//    ficha mostraría las 9:47. La zona sale de la EDICIÓN, no de una constante.
//
// Lo que NO se hace: inventar. Una marca temporal ilegible, imposible o futura
// deja el registro con la fecha de la importación y su valor se conserva como
// dato adicional — nunca se rellena con «hoy» a la callada.

export const IMPORT_DATE_MIN_YEAR = 2000;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** El día EXISTE de verdad: descarta 31/04, 30/02 y compañía. */
const diaReal = (year, month, day) => {
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
};

export const parseImportDate = (raw, { timeZone = 'America/Bogota', now = new Date() } = {}) => {
    const value = String(raw || '').trim();
    if (!value) return null;

    let year; let month; let day; let hour = 0; let minute = 0;
    let ambiguous = false;

    // ISO primero: `2026-06-04` es inequívoco y no admite otra lectura.
    let m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2})(?::\d{2})?)?/);
    if (m) {
        year = Number(m[1]); month = Number(m[2]); day = Number(m[3]);
        hour = Number(m[4] || 0); minute = Number(m[5] || 0);
    } else {
        m = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?:[ T,]+(\d{1,2}):(\d{2})(?::\d{2})?)?/);
        if (!m) return null;
        day = Number(m[1]); month = Number(m[2]);
        const y = Number(m[3]);
        // Dos cifras: el archivo es de este siglo. Un «26» que significara 1926
        // no es una marca temporal de nada.
        year = m[3].length === 2 ? 2000 + y : y;
        hour = Number(m[4] || 0); minute = Number(m[5] || 0);
        ambiguous = day <= 12 && month <= 12;
    }

    // «2:47 p. m.» — algunos exportadores escriben la hora en 12 horas.
    const meridiano = value.toLowerCase().replace(/[.\s]/g, '').match(/(a|p)m\b/);
    if (meridiano && hour >= 1 && hour <= 12) {
        if (meridiano[1] === 'p' && hour < 12) hour += 12;
        if (meridiano[1] === 'a' && hour === 12) hour = 0;
    }

    if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
    if (!(hour >= 0 && hour <= 23) || !(minute >= 0 && minute <= 59)) return null;
    if (year < IMPORT_DATE_MIN_YEAR || year > now.getUTCFullYear() + 1) return null;
    if (!diaReal(year, month, day)) return null;

    const at = zonedWallToUtc(year, month, day, hour * 60 + minute, timeZone);
    if (Number.isNaN(at.getTime())) return null;
    // Una marca temporal del sistema ANTERIOR no puede estar en el futuro. Se
    // toleran 36 horas por el reloj de quien exportó el archivo.
    if (at.getTime() > now.getTime() + 36 * 3600 * 1000) return null;

    const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return {
        iso: at.toISOString(),
        year, month, day, hour, minute, ambiguous,
        legible: `${day} de ${MESES[month - 1]} de ${year}, ${hhmm}`,
    };
};

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
    let submittedAt = null;
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
        if (dest === 'submittedAt') {
            const fecha = parseImportDate(value, { timeZone: options.timeZone, now: options.now });
            if (fecha) {
                submittedAt = fecha.iso;
                notes.push(`Marca temporal «${value}» → ${fecha.legible}`
                    + `${fecha.ambiguous ? ' (se leyó día/mes)' : ''}, hora de ${options.timeZone || 'America/Bogota'}.`);
            } else {
                extra[header] = value;
                notes.push(`No se pudo interpretar la marca temporal «${value}»: el registro queda con la fecha de la importación y el valor se conservó como dato adicional.`);
            }
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
        } else if (!matched) {
            // ⚠️ v4.960 — Un valor que el catálogo CERRADO no reconoce no se
            // guarda crudo en su columna: la ficha lo pintaría como una clave
            // ilegible (la lección de `sin_club`, v4.958). Se conserva como
            // dato adicional y se ANOTA — misma técnica que el tipo de
            // invitado, generalizada.
            extra[`${field?.label || key} (sin equivalente)`] = answers[key];
            notes.push(`${field?.label || key} «${answers[key]}» sin equivalente en la lista: se conservó como dato adicional.`);
            delete answers[key];
        }
    }

    // ⚠️ v4.958 — El tipo de invitado pasó a catálogo CERRADO, y eso no puede
    // costarle la importación a nadie: es un detalle secundario de la ficha, no
    // la identidad de la persona. Se intenta casar contra las opciones; lo que
    // no case —o lo que traiga alguien que NO es invitado, que es una
    // contradicción del archivo— se conserva como dato adicional y SE ANOTA,
    // en vez de rechazar la fila entera. La lección de v4.706 en su forma
    // aplicable: la lista no puede cerrarle la puerta a un dato histórico.
    if (answers.guestType) {
        const field = fields.find(f => f.key === 'guestType');
        const original = answers.guestType;
        if (answers.membershipType && answers.membershipType !== 'invitado') {
            extra['Tipo de invitado (el vínculo no es «invitado»)'] = original;
            delete answers.guestType;
            notes.push(`«${original}» describe a un invitado y el vínculo declarado no lo es: se conservó como dato adicional.`);
        } else {
            const matched = matchOptionValue(field, original);
            if (matched) {
                if (matched !== original) notes.push(`${field?.label || 'Tipo de invitado'}: «${original}» → ${matched}.`);
                answers.guestType = matched;
            } else {
                extra['Tipo de invitado (sin equivalente)'] = original;
                delete answers.guestType;
                notes.push(`Tipo de invitado «${original}» sin equivalente en la lista: se conservó como dato adicional.`);
            }
        }
    }

    if (!answers.paymentMethod && options.defaultPaymentMethod) {
        answers.paymentMethod = options.defaultPaymentMethod;
        notes.push(`Método de pago del lote: ${options.defaultPaymentMethod}.`);
    }

    return { answers, receiptUrl, submittedAt, extra, notes };
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

// ── Lo que bloquea una importación y lo que sólo se avisa ────────────
//
// ⚠️ v4.960 — SUPERSEDE la regla de v4.950 «importar no afloja ningún
// criterio». Aquélla nació de una intuición correcta —el formulario y la
// importación no pueden tener dos verdades sobre un registro— y su
// consecuencia práctica fue la contraria de la buscada: el archivo real del
// Distrito trae 273 personas inscritas y pagadas, y **165 de ellas no
// terminaron de llenar el formulario del sistema anterior**. Con el criterio
// del formulario aplicado tal cual, esas 165 quedaban fuera del evento al que
// van a asistir. Un control demasiado estricto no falla ruidosamente: entrega
// otra cosa —aquí, media lista— y la presenta como resultado.
//
// La distinción es de MOMENTO, no de rigor: el formulario público y la carga a
// mano exigen sus campos porque ahí HAY alguien que puede llenarlos; una
// migración registra lo que YA ocurrió, y un dato que nadie escribió en 2026 no
// se puede exigir en 2027. Lo que falta se ANOTA como aviso, viaja a la ficha y
// se completa después — nunca se inventa.
//
// Lo único que sigue bloqueando es lo que no se puede completar después: una
// fila que **no identifica a ninguna persona**. Sin nombre, sin documento y sin
// correo no hay a quién acreditar, con quién cotejar un duplicado ni a quién
// escribirle: es un renglón suelto del archivo, no un inscrito. Y es además la
// red que atrapa un mapeo corrido de columna, donde lo caro sería importar 273
// registros fantasma con la confirmación ya dada.

export const IMPORT_IDENTITY_KEYS = ['firstName', 'lastName', 'documentNumber', 'email'];

export const identifiesPerson = (answers = {}) =>
    IMPORT_IDENTITY_KEYS.some(k => String(answers?.[k] ?? '').trim() !== '');

/**
 * Reparte el veredicto del formulario entre lo que impide importar y lo que
 * sólo se avisa. Puro: recibe los errores ya calculados, no valida nada.
 */
export const splitImportFindings = (errors = {}, answers = {}) => {
    const avisos = { ...(errors || {}) };
    const errores = {};
    if (!identifiesPerson(answers)) {
        errores.__identidad = 'La fila no trae nombre, documento ni correo: no identifica a ninguna persona.';
    }
    return { errores, avisos };
};

/** Cuántos avisos tiene la fila (0 = la fila viene completa). */
export const warningCountOf = (row) => Object.keys(row?.avisos || {}).length;

// ⚠️ v4.962 — QUÉ SE HACE CON UN DUPLICADO ES UNA DECISIÓN DEL EVENTO, y la
// del Distrito es importarlo. La política viaja en el lote (`duplicatePolicy`)
// y su valor por defecto es `importar`: el archivo del sistema anterior se
// migra TAL CUAL y el equipo de logística depura después, que es como trabaja.
// Lo que NO cambia —y es lo que hace defendible el cambio— es que el duplicado
// se crea MARCADO: se detecta, se relaciona con el registro que coincide
// (`flags.hasDuplicates` + sus coincidencias) y el número se DICE antes de
// confirmar. «Ningún duplicado se crea en silencio» sigue en pie; lo que se
// retira es que además se omita.
export const DUPLICATE_POLICIES = ['importar', 'omitir'];
export const DEFAULT_DUPLICATE_POLICY = 'importar';
export const isDuplicatePolicy = (v) => DUPLICATE_POLICIES.includes(v);

export const legalDecisionsFor = (row) => {
    if (row.errors && Object.keys(row.errors).length) return ['omitir', 'editar'];
    // Con avisos la fila SE PUEDE importar: «editar» se ofrece además, para
    // quien quiera completarla ahora en vez de después.
    // Un duplicado confirmado ya podía omitirse o completar al existente; desde
    // v4.962 también puede importarse como nuevo, porque es lo que el evento
    // decidió. Sigue siendo una decisión visible, no un camino automático mudo.
    if (row.duplicate?.kind === 'confirmado') return ['nuevo', 'omitir', 'completar'];
    if (row.duplicate?.kind === 'posible') return ['nuevo', 'omitir', 'completar'];
    return warningCountOf(row) ? ['importar', 'omitir', 'editar'] : ['importar', 'omitir'];
};

export const defaultDecisionFor = (row, options = {}) => {
    if (row.errors && Object.keys(row.errors).length) return 'omitir';
    const politica = isDuplicatePolicy(options.duplicatePolicy)
        ? options.duplicatePolicy : DEFAULT_DUPLICATE_POLICY;
    if (row.duplicate?.kind === 'confirmado' || row.duplicate?.kind === 'posible') {
        return politica === 'omitir' ? 'omitir' : 'nuevo';
    }
    return 'importar';
};

export const buildImportSummary = (rows = [], options = {}) => {
    // `importables` responde «¿cuántos registros se van a crear?», así que
    // depende de la política de duplicados: con la de importar, un duplicado
    // cuenta. Las demás cifras son la CLASIFICACIÓN y no cambian con ella.
    const politica = isDuplicatePolicy(options.duplicatePolicy)
        ? options.duplicatePolicy : DEFAULT_DUPLICATE_POLICY;
    const summary = {
        total: rows.length,
        listas: 0, conErrores: 0, posiblesDuplicados: 0, duplicadosConfirmados: 0,
        revisionClub: 0,
        // v4.960 — «con avisos» NO es «con errores»: son filas que SÍ se
        // importan y a las que les faltan datos. Contarlas juntas es lo que
        // hacía leer «165 con campos faltantes» como 165 registros perdidos.
        conAvisos: 0, importables: 0,
    };
    for (const r of rows) {
        const hasErrors = r.errors && Object.keys(r.errors).length > 0;
        if (hasErrors) summary.conErrores++;
        else if (r.duplicate?.kind === 'confirmado') summary.duplicadosConfirmados++;
        else if (r.duplicate?.kind === 'posible') summary.posiblesDuplicados++;
        else summary.listas++;
        if (!hasErrors && warningCountOf(r)) summary.conAvisos++;
        const esDuplicado = r.duplicate?.kind === 'confirmado' || r.duplicate?.kind === 'posible';
        if (!hasErrors && (!esDuplicado || politica === 'importar')) summary.importables++;
        if (r.clubSuggestion) summary.revisionClub++;
    }
    return summary;
};

// Reexportado para que el consumidor del motor no importe dos specs.
export { isCompletedFieldRequired };

export default {
    IMPORT_SOURCE, IMPORT_SOURCE_LABEL, IMPORT_INITIAL_STATUSES, DEFAULT_IMPORT_STATUS,
    isAllowedInitialStatus, IMPORT_MAX_ROWS,
    detectDelimiter, parseDelimitedLine, parseDelimitedText, parseImportText,
    EXTRA_DESTINATIONS, importFieldsFor, HEADER_SYNONYMS, autoMapColumns,
    normalizeDistrictValue, matchOptionValue, normalizePaymentMethod,
    isUsableReceiptUrl, parseImportDate, assembleRow, suggestClub,
    classifyDuplicate, rememberRow, newSeen,
    IMPORT_IDENTITY_KEYS, identifiesPerson, splitImportFindings, warningCountOf,
    DUPLICATE_POLICIES, DEFAULT_DUPLICATE_POLICY, isDuplicatePolicy,
    legalDecisionsFor, defaultDecisionFor, buildImportSummary,
};
