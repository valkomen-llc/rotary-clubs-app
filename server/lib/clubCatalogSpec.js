// ════════════════════════════════════════════════════════════════════
// Catálogo Maestro de Clubes — el criterio — v4.1269.0
//
// PURO: sin base, sin red, sin DOM. Decide qué es un club válido, cómo se
// llama, qué estado tiene, cuándo dos fichas PUEDEN ser el mismo club, qué
// hace cada fila de un archivo de importación y quién puede tocar qué
// distrito. Lo consume `clubCatalog.js` (la base) y lo prueba
// `scripts/test-club-catalog.mjs` sin levantar nada.
//
// ── LA FUENTE ÚNICA ES EL DIRECTORIO, NO UNA TABLA NUEVA ─────────────
// El catálogo maestro es `DistrictClubProfile` —la tabla del Directorio de
// Clubes (v4.1212)—, ampliada con las columnas del catálogo. No se creó un
// segundo catálogo: ya había tres listas (la estática de `rotaryClubs.js`, el
// Directorio y la copia congelada de la convocatoria de proyectos) y una
// cuarta habría sido el mismo problema con otro nombre. Ver
// `docs/claude/catalogo-maestro-de-clubes.md`.
//
// ── DOS ESTADOS DISTINTOS EN LA MISMA FILA ───────────────────────────
//   · `status` (published | draft | archived) es la PUBLICACIÓN de la ficha
//     en el Directorio público. Lo maneja el Directorio, como siempre.
//   · `catalogStatus` (activo | inactivo | pendiente_verificacion) es la
//     EXISTENCIA INSTITUCIONAL del club: si se puede elegir en un formulario.
// Un club puede estar activo y con la ficha en borrador (existe, su página no
// está lista), y un club inactivo conserva su ficha y su historia.
// ════════════════════════════════════════════════════════════════════

/** Estados del club en el catálogo. Ninguno borra nada. */
export const CATALOG_STATES = {
    activo: { key: 'activo', label: 'Activo', selectable: true },
    inactivo: { key: 'inactivo', label: 'Inactivo', selectable: false },
    pendiente_verificacion: { key: 'pendiente_verificacion', label: 'Pendiente de verificación', selectable: false },
};
export const CATALOG_STATE_KEYS = Object.keys(CATALOG_STATES);
export const DEFAULT_CATALOG_STATE = 'activo';
export const catalogStateLabel = (s) => CATALOG_STATES[s]?.label || 'Activo';

/** Tipo de organización (la columna histórica del Directorio). */
export const ORGANIZATION_TYPES = {
    rotary: 'Club Rotario',
    rotaract: 'Club Rotaract',
    interact: 'Club Interact',
};

/** Tipo de club, cuando corresponde. Opcional: no bloquea nada. */
export const CLUB_TYPES = {
    tradicional: 'Tradicional',
    e_club: 'E-Club (virtual)',
    satelite: 'Club satélite',
    pasaporte: 'Club pasaporte',
    causa: 'Club de causa',
    corporativo: 'Club corporativo',
    otro: 'Otro',
};

export const MAX_NOTES = 2000;
export const MAX_ALIASES = 30;

const str = (v, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Sin tildes, sin mayúsculas y sin dobles espacios. */
export const normText = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * El NÚCLEO del nombre: lo que queda al quitar el prefijo institucional y la
 * puntuación. Es lo que hace que «Club Rotario Armenia International»,
 * «Rotary Club Armenia International» y «Armenia International» se reconozcan
 * como el MISMO TEXTO. Que sean el mismo CLUB lo decide una persona.
 */
export const coreName = (s) => normText(s)
    .replace(/^(club\s+rotario|rotary\s+club(\s+de)?|club\s+rotaract|rotaract\s+club|club\s+interact|interact\s+club|rotaract|interact|rotary|club|rc)\s+/i, '')
    .replace(/\be\s*-?\s*club\b/g, 'eclub')
    .replace(/\binternacional\b/g, 'international')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** El nombre corto a partir del oficial cuando no se escribe: el que usan las listas. */
export const deriveShortName = (officialName) => {
    const n = str(officialName, 200);
    const sinPrefijo = n.replace(/^(club\s+rotario|rotary\s+club(\s+de)?|club\s+rotaract|club\s+interact)\s+/i, '');
    if (/^rotary\s+e-?club\b/i.test(sinPrefijo)) return sinPrefijo.replace(/^rotary\s+/i, '');
    return sinPrefijo.replace(/^rotary\s+/i, '') || n;
};

/** El nombre oficial a partir del corto, en español (misma regla que `publicClubs.clubDisplayName`). */
export const deriveOfficialName = (shortName, organizationType = 'rotary') => {
    const n = str(shortName, 200);
    if (!n) return '';
    if (/^(club\s+(rotario|rotaract|interact)|rotary|rotaract|interact)\b/i.test(n)) return n;
    if (/^e-?club\b/i.test(n)) return `Rotary ${n}`;
    if (organizationType === 'rotaract') return `Club Rotaract ${n}`;
    if (organizationType === 'interact') return `Club Interact ${n}`;
    return `Club Rotario ${n}`;
};

export const districtNumberFrom = (v) => {
    const m = String(v ?? '').match(/\b(\d{4})\b/);
    return m ? Number(m[1]) : null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normUrl = (u) => {
    const s = str(u, 300);
    if (!s) return '';
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

/** Normaliza lo que llega del formulario o de una fila de importación. */
export function shapeClubInput(raw = {}) {
    const organizationType = ORGANIZATION_TYPES[str(raw.organizationType, 20).toLowerCase()] ? str(raw.organizationType, 20).toLowerCase() : 'rotary';
    const officialIn = str(raw.officialName, 200);
    const shortIn = str(raw.shortName, 160);
    const officialName = officialIn || deriveOfficialName(shortIn, organizationType);
    const shortName = shortIn || deriveShortName(officialName);
    const ct = str(raw.clubType, 30).toLowerCase();
    const st = str(raw.catalogStatus, 40).toLowerCase();
    const aliases = Array.isArray(raw.aliases)
        ? [...new Set(raw.aliases.map(a => str(a, 200)).filter(Boolean))].slice(0, MAX_ALIASES)
        : undefined;
    return {
        officialName,
        shortName,
        organizationType,
        clubType: CLUB_TYPES[ct] ? ct : (ct ? 'otro' : ''),
        districtNumber: districtNumberFrom(raw.districtNumber),
        // Sin país escrito queda vacío: «Colombia» lo pone quien CREA, no la
        // normalización (si no, una importación «completaría» un país que nadie dio).
        country: str(raw.country, 80),
        state: str(raw.state, 120),
        city: str(raw.city, 120),
        rotaryInternationalId: str(raw.rotaryInternationalId, 30).replace(/[^0-9A-Za-z-]/g, ''),
        contactEmail: str(raw.contactEmail, 200).toLowerCase(),
        websiteUrl: normUrl(raw.websiteUrl),
        catalogStatus: CATALOG_STATES[st] ? st : '',
        adminNotes: String(raw.adminNotes ?? '').trim().slice(0, MAX_NOTES),
        ...(aliases ? { aliases } : {}),
    };
}

/**
 * Lo que impide guardar. Los campos opcionales NO bloquean: un club sin
 * departamento, sin ID de Rotary International o sin correo se incorpora
 * igual, y queda marcado como incompleto.
 */
export function validateClubInput(c) {
    const errors = [];
    const push = (field, message) => errors.push({ field, message });
    if (!c.officialName || c.officialName.length < 3) push('officialName', 'Escribe el nombre oficial del club.');
    if (!c.districtNumber) push('districtNumber', 'Indica el distrito rotario (cuatro dígitos, ej. 4281).');
    if (c.contactEmail && !EMAIL_RE.test(c.contactEmail)) push('contactEmail', 'El correo institucional no es válido.');
    if (c.websiteUrl) {
        try { const u = new URL(c.websiteUrl); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error('x'); }
        catch { push('websiteUrl', 'El sitio web no es una dirección válida.'); }
    }
    if (c.rotaryInternationalId && !/^\d{2,12}$/.test(c.rotaryInternationalId)) push('rotaryInternationalId', 'El ID de Rotary International es numérico.');
    return { ok: errors.length === 0, errors };
}

/** Qué le falta a una ficha para considerarse completa en el catálogo. */
export const COMPLETENESS_FIELDS = [
    ['city', 'Ciudad'],
    ['state', 'Departamento'],
    ['rotaryInternationalId', 'ID de Rotary International'],
    ['contactEmail', 'Correo institucional'],
    ['clubType', 'Tipo de club'],
];
export const missingFields = (club) => COMPLETENESS_FIELDS
    .filter(([k]) => !String(club?.[k] ?? '').trim())
    .map(([k, label]) => ({ field: k, label }));
export const isIncomplete = (club) => missingFields(club).length > 0;

/** Los campos que se auditan campo a campo. */
export const AUDITED_FIELDS = [
    'officialName', 'shortName', 'organizationType', 'clubType', 'districtNumber', 'country', 'state', 'city',
    'rotaryInternationalId', 'contactEmail', 'websiteUrl', 'catalogStatus', 'adminNotes', 'aliases', 'mergedIntoId',
];

const cmpVal = (v) => Array.isArray(v) ? JSON.stringify(v) : (v === null || v === undefined ? '' : String(v));

/** El cambio campo a campo, para la bitácora. Sólo lo que cambió. */
export function diffClub(before = {}, after = {}, fields = AUDITED_FIELDS) {
    const out = [];
    for (const f of fields) {
        if (!(f in after)) continue;
        if (cmpVal(before[f]) !== cmpVal(after[f])) out.push({ field: f, from: before[f] ?? null, to: after[f] ?? null });
    }
    return out;
}

/**
 * Al RENOMBRAR, el nombre anterior pasa a ser un alias. Es lo que mantiene la
 * integridad con los registros históricos que guardaron el nombre como texto
 * (inscripciones, postulaciones, solicitudes): «Armenia International» sigue
 * resolviendo al mismo club aunque hoy se llame de otra forma.
 */
export function aliasesAfterRename(before = {}, after = {}) {
    const actuales = Array.isArray(after.aliases) ? after.aliases : (Array.isArray(before.aliases) ? before.aliases : []);
    const set = new Map(actuales.map(a => [coreName(a), a]));
    for (const viejo of [before.officialName, before.shortName]) {
        if (!viejo) continue;
        const k = coreName(viejo);
        const vigentes = [after.officialName, after.shortName].map(coreName);
        if (k && !vigentes.includes(k) && !set.has(k)) set.set(k, viejo);
    }
    return [...set.values()].slice(0, MAX_ALIASES);
}

/** Todos los nombres por los que se reconoce un club (núcleos, sin repetir). */
export const namesOf = (club) => [...new Set(
    [club?.officialName, club?.shortName, ...(Array.isArray(club?.aliases) ? club.aliases : [])]
        .map(coreName).filter(Boolean)
)];

// ─── Duplicados ───────────────────────────────────────────────────────
// NUNCA se fusiona solo. Esto SEÑALA pares para que una persona decida, con el
// motivo y la confianza a la vista. Dos clubes con el mismo nombre en
// distritos distintos son, casi siempre, dos clubes: se señalan con confianza
// baja y nada más.

const levenshtein = (a, b) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
};
export const similarity = (a, b) => {
    const x = coreName(a); const y = coreName(b);
    if (!x || !y) return 0;
    const max = Math.max(x.length, y.length);
    return 1 - levenshtein(x, y) / max;
};

const pairKey = (a, b) => [String(a), String(b)].sort().join('|');

export function findDuplicateCandidates(clubs = [], { threshold = 0.88 } = {}) {
    const vivos = clubs.filter(c => c && !c.mergedIntoId);
    const out = [];
    const vistos = new Set();
    for (let i = 0; i < vivos.length; i++) {
        for (let j = i + 1; j < vivos.length; j++) {
            const a = vivos[i]; const b = vivos[j];
            if (String(a.organizationType || 'rotary') !== String(b.organizationType || 'rotary')) continue;
            const descartado = (Array.isArray(a.notDuplicateOf) && a.notDuplicateOf.includes(b.id))
                || (Array.isArray(b.notDuplicateOf) && b.notDuplicateOf.includes(a.id));
            if (descartado) continue;
            const mismoDistrito = Number(a.districtNumber) === Number(b.districtNumber);
            let reason = null; let confidence = null;
            if (a.rotaryInternationalId && a.rotaryInternationalId === b.rotaryInternationalId) {
                reason = 'Mismo ID de Rotary International'; confidence = 'alta';
            } else {
                const na = namesOf(a); const nb = namesOf(b);
                const exacto = na.some(n => nb.includes(n));
                if (exacto && mismoDistrito) { reason = 'Mismo nombre en el mismo distrito'; confidence = 'alta'; }
                else if (exacto) { reason = 'Mismo nombre en distritos distintos (probablemente homónimos)'; confidence = 'baja'; }
                else if (mismoDistrito) {
                    let best = 0;
                    for (const x of na) for (const y of nb) best = Math.max(best, similarity(x, y));
                    if (best >= threshold) { reason = `Nombres muy parecidos (${Math.round(best * 100)} %)`; confidence = 'media'; }
                }
            }
            if (!reason) continue;
            // Si ambos tienen ID oficial y es DISTINTO, no son el mismo club.
            if (a.rotaryInternationalId && b.rotaryInternationalId && a.rotaryInternationalId !== b.rotaryInternationalId) continue;
            const k = pairKey(a.id, b.id);
            if (vistos.has(k)) continue;
            vistos.add(k);
            out.push({ a: a.id, b: b.id, reason, confidence });
        }
    }
    const peso = { alta: 0, media: 1, baja: 2 };
    return out.sort((x, y) => peso[x.confidence] - peso[y.confidence]);
}

// ─── Importación ──────────────────────────────────────────────────────
// Encabezados aceptados (español o inglés, sin tildes ni mayúsculas).
export const IMPORT_HEADERS = {
    officialName: ['nombre oficial', 'nombre del club', 'officialname', 'official name', 'club', 'nombre', 'name'],
    shortName: ['nombre corto', 'denominacion', 'denominacion habitual', 'shortname', 'short name'],
    rotaryInternationalId: ['id rotary', 'id rotary international', 'id ri', 'club id', 'clubid', 'rotary id', 'rotaryinternationalid'],
    districtNumber: ['distrito', 'district', 'districtnumber'],
    country: ['pais', 'country'],
    state: ['departamento', 'region', 'estado/departamento', 'state', 'province'],
    city: ['ciudad', 'municipio', 'ciudad o municipio', 'city'],
    clubType: ['tipo', 'tipo de club', 'clubtype', 'club type'],
    organizationType: ['organizacion', 'tipo de organizacion', 'organizationtype'],
    contactEmail: ['correo', 'correo institucional', 'email', 'e-mail', 'contactemail'],
    websiteUrl: ['sitio web', 'web', 'website', 'url', 'websiteurl'],
    catalogStatus: ['estado', 'status', 'catalogstatus'],
};

const STATUS_WORDS = {
    activo: 'activo', active: 'activo', vigente: 'activo',
    inactivo: 'inactivo', inactive: 'inactivo', disuelto: 'inactivo', cerrado: 'inactivo',
    pendiente: 'pendiente_verificacion', 'pendiente de verificacion': 'pendiente_verificacion', pending: 'pendiente_verificacion',
};
const TYPE_WORDS = {
    tradicional: 'tradicional', traditional: 'tradicional',
    'e-club': 'e_club', eclub: 'e_club', 'e club': 'e_club', virtual: 'e_club',
    satelite: 'satelite', satellite: 'satelite', pasaporte: 'pasaporte', passport: 'pasaporte',
    causa: 'causa', cause: 'causa', corporativo: 'corporativo', corporate: 'corporativo',
};

/** Convierte una fila con encabezados libres en la forma del catálogo. */
export function mapImportRow(row = {}) {
    const byKey = {};
    for (const [k, v] of Object.entries(row || {})) byKey[normText(k)] = v;
    const out = {};
    for (const [campo, alias] of Object.entries(IMPORT_HEADERS)) {
        const k = alias.find(a => byKey[a] !== undefined && String(byKey[a]).trim() !== '');
        if (k) out[campo] = byKey[k];
    }
    if (out.catalogStatus !== undefined) out.catalogStatus = STATUS_WORDS[normText(out.catalogStatus)] || out.catalogStatus;
    if (out.clubType !== undefined) out.clubType = TYPE_WORDS[normText(out.clubType)] || normText(out.clubType).replace(/[^a-z_]/g, '_');
    if (out.organizationType !== undefined) {
        const o = normText(out.organizationType);
        out.organizationType = o.includes('rotaract') ? 'rotaract' : o.includes('interact') ? 'interact' : 'rotary';
    }
    return out;
}

/** El club existente que corresponde a una fila: primero el ID oficial, después el nombre (con alias) en su distrito. */
export function matchExisting(c, existing = []) {
    if (c.rotaryInternationalId) {
        const porId = existing.find(e => e.rotaryInternationalId && e.rotaryInternationalId === c.rotaryInternationalId);
        if (porId) return { club: porId, by: 'id' };
    }
    const nombres = namesOf(c);
    const mismoDistrito = existing.filter(e => Number(e.districtNumber) === Number(c.districtNumber)
        && String(e.organizationType || 'rotary') === String(c.organizationType || 'rotary'));
    const porNombre = mismoDistrito.find(e => namesOf(e).some(n => nombres.includes(n)));
    if (porNombre) return { club: porNombre, by: 'nombre' };
    let best = null;
    for (const e of mismoDistrito) {
        for (const x of namesOf(e)) for (const y of nombres) {
            const s = similarity(x, y);
            if (s >= 0.88 && (!best || s > best.score)) best = { club: e, score: s };
        }
    }
    return best ? { club: best.club, by: 'parecido', score: best.score } : null;
}

const IMPORT_UPDATABLE = ['rotaryInternationalId', 'country', 'state', 'city', 'clubType', 'contactEmail', 'websiteUrl'];

/**
 * Clasifica cada fila ANTES de incorporar nada. Ninguna fila escribe por sí
 * sola: la revisión decide.
 *   · nuevo              → no existe en el catálogo.
 *   · existente          → ya está, sin nada que completar.
 *   · actualiza          → ya está; la fila COMPLETA campos vacíos (nunca pisa uno lleno).
 *   · posible_duplicado  → se parece a uno existente pero no es seguro: revisión manual.
 *   · fuera_de_alcance   → distrito que este administrador no puede tocar.
 *   · invalido           → no se puede incorporar (falta el nombre, el distrito…).
 */
export function classifyImportRows(rows = [], existing = [], { defaultDistrict = null, scope = null } = {}) {
    const out = [];
    const vistosEnArchivo = new Map();
    rows.forEach((raw, i) => {
        const mapped = mapImportRow(raw);
        if (!mapped.districtNumber && defaultDistrict) mapped.districtNumber = defaultDistrict;
        const data = shapeClubInput(mapped);
        const v = validateClubInput(data);
        const base = { row: i + 1, data };
        if (!v.ok) { out.push({ ...base, status: 'invalido', errors: v.errors }); return; }
        if (scope && !catalogScopeAllows(scope, data.districtNumber)) {
            out.push({ ...base, status: 'fuera_de_alcance', errors: [{ field: 'districtNumber', message: `No tienes permiso para el Distrito ${data.districtNumber}.` }] });
            return;
        }
        const kArchivo = `${data.districtNumber}|${coreName(data.officialName)}`;
        if (vistosEnArchivo.has(kArchivo)) {
            out.push({ ...base, status: 'invalido', errors: [{ field: 'officialName', message: `Repetido en el archivo (fila ${vistosEnArchivo.get(kArchivo)}).` }] });
            return;
        }
        vistosEnArchivo.set(kArchivo, i + 1);
        const m = matchExisting(data, existing);
        if (!m) { out.push({ ...base, status: 'nuevo' }); return; }
        if (m.by === 'parecido') {
            out.push({ ...base, status: 'posible_duplicado', match: { id: m.club.id, officialName: m.club.officialName, score: Math.round(m.score * 100) } });
            return;
        }
        const changes = IMPORT_UPDATABLE
            .filter(f => data[f] && !String(m.club[f] ?? '').trim())
            .map(f => ({ field: f, from: null, to: data[f] }));
        out.push({
            ...base,
            status: changes.length ? 'actualiza' : 'existente',
            match: { id: m.club.id, officialName: m.club.officialName, by: m.by },
            changes,
        });
    });
    return out;
}

/**
 * Comparación con una fuente institucional oficial: además de lo que trae el
 * archivo, qué clubes ACTIVOS del catálogo NO aparecen en él. No se desactiva
 * nada solo: es una lista para revisar.
 */
export function missingFromSource(classified = [], existing = [], districtNumbers = []) {
    const tocados = new Set(classified.filter(r => r.match?.id).map(r => r.match.id));
    const ds = districtNumbers.map(Number);
    return existing
        .filter(e => !e.mergedIntoId && (e.catalogStatus || 'activo') === 'activo')
        .filter(e => !ds.length || ds.includes(Number(e.districtNumber)))
        .filter(e => String(e.organizationType || 'rotary') === 'rotary')
        .filter(e => !tocados.has(e.id))
        .map(e => ({ id: e.id, officialName: e.officialName, districtNumber: e.districtNumber, city: e.city || '' }));
}

// ─── Alcance de escritura ──────────────────────────────────────────────
// `{ all: true }` o `{ districts: [4281] }`. Sin alcance, sólo consulta.
export const catalogScopeAllows = (scope, districtNumber) => {
    if (!scope) return false;
    if (scope.all) return true;
    return Array.isArray(scope.districts) && scope.districts.map(Number).includes(Number(districtNumber));
};

/** Los indicadores del panel: cuántos, en qué estado, cuándo se tocó por última vez. */
export function summarizeCatalog(clubs = []) {
    const vivos = clubs.filter(c => !c.mergedIntoId);
    const cuenta = (s) => vivos.filter(c => (c.catalogStatus || 'activo') === s).length;
    const fechas = clubs.map(c => c.catalogUpdatedAt || c.updatedAt).filter(Boolean).map(d => new Date(d).getTime()).filter(Number.isFinite);
    return {
        total: vivos.length,
        activos: cuenta('activo'),
        inactivos: cuenta('inactivo'),
        pendientes: cuenta('pendiente_verificacion'),
        incompletos: vivos.filter(isIncomplete).length,
        fusionados: clubs.length - vivos.length,
        lastUpdatedAt: fechas.length ? new Date(Math.max(...fechas)).toISOString() : null,
    };
}

/** Lo que un formulario público puede ver de un club. Nada interno. */
export const publicClubShape = (c) => ({
    id: c.id,
    name: c.officialName,
    shortName: c.shortName,
    city: c.city || '',
    state: c.state || '',
    country: c.country || '',
    districtNumber: Number(c.districtNumber) || null,
    organizationType: c.organizationType || 'rotary',
    clubType: c.clubType || '',
});

/** El buscador: por nombre (con alias), ciudad o departamento; primero lo que EMPIEZA con el término. */
export function searchCatalog(clubs = [], term = '', limit = 20) {
    const q = normText(term);
    const tope = Math.max(1, Math.min(500, Number(limit) || 20));
    const orden = (a, b) => normText(a.officialName).localeCompare(normText(b.officialName));
    if (!q) return [...clubs].sort(orden).slice(0, tope);
    const qc = coreName(q) || q;
    return clubs
        .map(c => {
            const nombres = [normText(c.officialName), normText(c.shortName), ...namesOf(c)];
            const lugar = [normText(c.city), normText(c.state)];
            let rank = 9;
            if (nombres.some(n => n.startsWith(q) || n.startsWith(qc))) rank = 0;
            else if (lugar.some(l => l.startsWith(q))) rank = 1;
            else if (nombres.some(n => n.includes(q) || n.includes(qc))) rank = 2;
            else if (lugar.some(l => l.includes(q))) rank = 3;
            return rank < 9 ? { c, rank } : null;
        })
        .filter(Boolean)
        .sort((a, b) => (a.rank - b.rank) || orden(a.c, b.c))
        .slice(0, tope)
        .map(x => x.c);
}

export default {
    CATALOG_STATES, CATALOG_STATE_KEYS, DEFAULT_CATALOG_STATE, ORGANIZATION_TYPES, CLUB_TYPES,
    normText, coreName, deriveShortName, deriveOfficialName, shapeClubInput, validateClubInput,
    missingFields, isIncomplete, diffClub, aliasesAfterRename, namesOf, similarity,
    findDuplicateCandidates, mapImportRow, matchExisting, classifyImportRows, missingFromSource,
    catalogScopeAllows, summarizeCatalog, publicClubShape, searchCatalog, catalogStateLabel,
};
