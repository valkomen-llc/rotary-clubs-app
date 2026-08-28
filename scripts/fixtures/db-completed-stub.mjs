// ════════════════════════════════════════════════════════════════════
// La base, en memoria — para probar el CAMINO de Inscripciones completadas.
// v4.943.0
//
// ⚠️ ESTE DOBLE NO IMPLEMENTA NINGUNA REGLA DEL MÓDULO. Interpreta el SQL que
// los controladores ESCRIBIERON —qué columnas insertan, qué condiciones
// filtran, qué agregados cuentan—, no una copia en JavaScript del criterio: un
// doble que reescribe la condición que la prueba dice comprobar no comprueba
// nada (la lección de v4.896). Si alguien quita el `"eventId" = $1` de una
// consulta, este doble deja de acotar y la prueba de aislamiento falla, que es
// lo que tiene que pasar.
//
// Lo que este doble NO demuestra es que el SQL sea válido para Postgres. Eso
// se comprueba al desplegar, y se dice para no afirmar de más.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';

export const tablas = {
    CalendarEvent: [],
    EventEdition: [],
    EventRegistration: [],
    EventCompletedRegistration: [],
    EventRegistrationHistory: [],
    EventRegistrationMessage: [],
};

export const consultas = [];

export const reset = () => {
    for (const key of Object.keys(tablas)) tablas[key] = [];
    consultas.length = 0;
};

const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();
const parseJson = (v, fb) => {
    if (v === null || v === undefined) return fb;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return fb; }
};

/** Divide una lista SQL por comas de PRIMER nivel (respeta paréntesis). */
const splitTop = (text) => {
    const parts = [];
    let depth = 0, current = '';
    for (const ch of text) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
        current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
};

const valueOf = (token, params) => {
    const t = token.trim();
    if (/^\$\d+$/.test(t)) return params[Number(t.slice(1)) - 1];
    if (/^NOW\(\)$/i.test(t)) return new Date().toISOString();
    if (/^NULL$/i.test(t)) return null;
    const lit = t.match(/^'([^']*)'$/);
    if (lit) return lit[1];
    throw new Error(`token de VALUES no interpretado: ${t}`);
};

/** INSERT genérico: lee las columnas y los valores DEL SQL, no los supone. */
const runInsert = (q, params) => {
    const m = q.match(/^INSERT INTO "(\w+)" \(([^)]+)\) VALUES \((.+?)\)(?:\s+ON CONFLICT.*)?(?:\s+RETURNING (.+))?$/is);
    if (!m) throw new Error(`INSERT no interpretado: ${q.slice(0, 120)}`);
    const [, table, colsRaw, valsRaw, returning] = m;
    const cols = colsRaw.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const vals = splitTop(valsRaw).map(t => valueOf(t, params));
    if (cols.length !== vals.length) {
        throw new Error(`INSERT en ${table}: ${cols.length} columnas y ${vals.length} valores`);
    }
    const row = Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
    row.id = row.id || randomUUID();
    row.createdAt = row.createdAt || new Date().toISOString();
    row.updatedAt = row.updatedAt || row.createdAt;
    tablas[table].push(row);
    return { rows: returning ? [row] : [] };
};

/** UPDATE genérico sobre las tablas del módulo: SET y WHERE leídos del SQL. */
const runUpdate = (q, params) => {
    const m = q.match(/^UPDATE "(\w+)" SET (.+?) WHERE (.+?)(?:\s+RETURNING (.+))?$/is);
    if (!m) throw new Error(`UPDATE no interpretado: ${q.slice(0, 120)}`);
    const [, table, setRaw, whereRaw, returning] = m;

    const sets = splitTop(setRaw).map(item => {
        const pair = item.match(/^"?([\w]+)"?\s*=\s*(.+)$/s);
        if (!pair) throw new Error(`SET no interpretado: ${item}`);
        return [pair[1], pair[2].trim()];
    });

    const conds = whereRaw.split(/\s+AND\s+/i).map(c => c.trim());
    const matches = (row) => conds.every(cond => {
        let cm;
        if ((cm = cond.match(/^"?(\w+)"?\s*=\s*\$(\d+)$/))) return String(row[cm[1]] ?? '') === String(params[Number(cm[2]) - 1] ?? '');
        if ((cm = cond.match(/^"?(\w+)"?\s+IS NULL$/i))) return row[cm[1]] == null;
        throw new Error(`WHERE de UPDATE no interpretado: ${cond}`);
    });

    const updated = [];
    for (const row of tablas[table]) {
        if (!matches(row)) continue;
        for (const [col, expr] of sets) {
            row[col] = valueOf(expr, params);
        }
        updated.push(row);
    }
    return { rows: returning ? updated : [], rowCount: updated.length };
};

/** Un agregado del resumen, leído del propio SQL. */
const evalCond = (cond, row) => {
    const c = cond.trim();
    let m;
    if ((m = c.match(/^status = '([^']+)'$/))) return row.status === m[1];
    if ((m = c.match(/^"paymentMethod" = '([^']+)'$/))) return row.paymentMethod === m[1];
    if (c === `(flags->>'hasDuplicates') = 'true'`) return String(parseJson(row.flags, {})?.hasDuplicates) === 'true';
    if (c === '"checkedInAt" IS NOT NULL') return row.checkedInAt != null;
    if ((m = c.match(/^COALESCE\("?(\w+)"?, ''\) <> ''$/))) return String(row[m[1]] || '') !== '';
    throw new Error(`condición de agregado no interpretada: ${c}`);
};

const runSummary = (q, rows) => {
    const selectList = q.match(/^SELECT (.+?) FROM/is)[1];
    const out = {};
    for (const item of splitTop(selectList)) {
        let m;
        if ((m = item.match(/^COUNT\(\*\)::int AS (\w+)$/i))) {
            out[m[1]] = rows.length;
        } else if ((m = item.match(/^COUNT\(\*\) FILTER \(WHERE (.+)\)::int AS (\w+)$/is))) {
            out[m[2]] = rows.filter(r => evalCond(m[1], r)).length;
        } else if ((m = item.match(/^COUNT\(DISTINCT (?:lower\()?"?(\w+)"?\)?\) FILTER \(WHERE (.+)\)::int AS (\w+)$/is))) {
            const values = new Set(rows.filter(r => evalCond(m[2], r)).map(r => String(r[m[1]] || '').toLowerCase()));
            out[m[3]] = values.size;
        } else {
            throw new Error(`agregado no interpretado: ${item}`);
        }
    }
    return { rows: [out] };
};

const like = (value, pattern) => {
    const needle = String(pattern).replace(/^%|%$/g, '').toLowerCase();
    return String(value || '').toLowerCase().includes(needle);
};

const query = async (sql, params = []) => {
    const q = norm(sql);
    consultas.push({ sql: q, params });
    // pg devuelve OBJETOS NUEVOS en cada consulta: un SELECT que entregara la
    // referencia interna haría que un UPDATE posterior «viajara al pasado» y
    // el `fromStatus` del historial saldría igual al nuevo. Se clona siempre.
    const result = await route(q, params);
    return { ...result, rows: (result.rows || []).map(r => ({ ...r })) };
};

const route = async (q, params = []) => {

    // ── El catálogo: todo está aplicado, el DDL no corre ─────────────
    if (/FROM information_schema\.tables/i.test(q)) {
        return { rows: (params[0] || []).map(n => ({ table_name: n })) };
    }
    if (/FROM information_schema\.columns/i.test(q)) {
        return { rows: (params[0] || []).map(n => ({ column_name: n })) };
    }
    if (/^CREATE |^ALTER /i.test(q)) return { rows: [] };

    // ── CalendarEvent ────────────────────────────────────────────────
    if (/FROM "CalendarEvent" WHERE title ILIKE/i.test(q)) {
        return { rows: tablas.CalendarEvent.filter(e => params.every(p => like(e.title, p))).slice(0, 5) };
    }
    if (/FROM "CalendarEvent" WHERE id = \$1 LIMIT 1/i.test(q)) {
        return { rows: tablas.CalendarEvent.filter(e => e.id === params[0]) };
    }
    if (/FROM "CalendarEvent" WHERE \(id = \$1 OR slug = \$1\)/i.test(q)) {
        const scoped = /"clubId" = \$2/.test(q);
        return {
            rows: tablas.CalendarEvent.filter(e =>
                (e.id === params[0] || e.slug === params[0])
                && (!scoped || e.clubId === params[1])).slice(0, 1),
        };
    }

    // ── EventEdition ─────────────────────────────────────────────────
    if (/FROM "EventEdition" WHERE settings->'completedForm'->>'slug' = \$1/i.test(q)) {
        const excluded = /"eventId" <> \$2/.test(q);
        const rows = tablas.EventEdition.filter(e =>
            parseJson(e.settings, {})?.completedForm?.slug === params[0]
            && (!excluded || e.eventId !== params[1]));
        return { rows: rows.slice(0, /LIMIT 1/.test(q) ? 1 : 2) };
    }
    if (/^SELECT \* FROM "EventEdition" WHERE "eventId" = \$1/i.test(q)) {
        return { rows: tablas.EventEdition.filter(e => e.eventId === params[0]).slice(0, 1) };
    }
    if (/^UPDATE "EventEdition"/i.test(q)) return runUpdate(q, params);
    if (/^INSERT INTO "EventEdition"/i.test(q)) return runInsert(q, params);

    // ── Duplicados: se aplican SÓLO las ramas que el SQL trae ────────
    if (/FROM "(EventRegistration|EventCompletedRegistration)" WHERE "eventId" = \$1 AND (status <> 'draft' AND )?\(lower\(email\)/i.test(q)) {
        const table = q.match(/FROM "(\w+)"/)[1];
        const mailIdx = q.match(/lower\(email\) = \$(\d+)/);
        const docIdx = q.match(/lower\("documentNumber"\) = lower\(\$(\d+)\)/);
        const exclIdx = q.match(/id <> \$(\d+)/);
        const noDraft = /status <> 'draft'/.test(q);
        const rows = tablas[table].filter(r => {
            if (r.eventId !== params[0]) return false;
            if (noDraft && r.status === 'draft') return false;
            if (exclIdx && r.id === params[Number(exclIdx[1]) - 1]) return false;
            const byMail = mailIdx && String(r.email || '').toLowerCase() === String(params[Number(mailIdx[1]) - 1] || '');
            const byDoc = docIdx && String(r.documentNumber || '') !== ''
                && String(r.documentNumber).toLowerCase() === String(params[Number(docIdx[1]) - 1] || '').toLowerCase();
            return Boolean(byMail || byDoc);
        });
        return { rows: rows.slice(0, 10) };
    }

    // ── Acreditación: la búsqueda del mostrador ──────────────────────
    if (/FROM "EventRegistration" WHERE "eventId" = \$1 AND status = ANY\(\$2\)/i.test(q)) {
        return {
            rows: tablas.EventRegistration.filter(r =>
                r.eventId === params[0] && (params[1] || []).includes(r.status)
                && [r.registrationCode, r.publicRef, r.email, r.documentNumber,
                    `${r.firstName || ''} ${r.lastName || ''}`].some(v => like(v, params[2]))),
        };
    }
    if (/FROM "EventCompletedRegistration" WHERE "eventId" = \$1 AND status = ANY\(\$2\)/i.test(q)) {
        return {
            rows: tablas.EventCompletedRegistration.filter(r =>
                r.eventId === params[0] && (params[1] || []).includes(r.status)
                && [r.registrationCode, r.email, r.documentNumber,
                    `${r.firstName || ''} ${r.lastName || ''}`].some(v => like(v, params[2]))),
        };
    }

    // ── EventCompletedRegistration ───────────────────────────────────
    if (/^SELECT \* FROM "EventCompletedRegistration" WHERE id = \$1/i.test(q)) {
        return { rows: tablas.EventCompletedRegistration.filter(r => r.id === params[0]) };
    }
    if (/^SELECT COUNT\(\*\)::int AS total FROM "EventCompletedRegistration" WHERE "eventId" = \$1$/i.test(q)) {
        return { rows: [{ total: tablas.EventCompletedRegistration.filter(r => r.eventId === params[0]).length }] };
    }
    if (/^SELECT \* FROM "EventCompletedRegistration" WHERE "eventId" = \$1 ORDER BY/i.test(q)) {
        // El listado y el exporte, sin filtros extra: la acotación por evento
        // se lee del SQL. Un filtro que este doble no interprete revienta en
        // vez de pasar en silencio.
        const rows = tablas.EventCompletedRegistration.filter(r => r.eventId === params[0]);
        const limit = q.match(/LIMIT \$(\d+)/);
        const offset = q.match(/OFFSET \$(\d+)/);
        const start = offset ? Number(params[Number(offset[1]) - 1]) : 0;
        const end = limit ? start + Number(params[Number(limit[1]) - 1]) : undefined;
        return { rows: rows.slice(start, end) };
    }
    if (/^SELECT .*COUNT\(\*\)/i.test(q) && /FROM "EventCompletedRegistration" WHERE "eventId" = \$1$/i.test(q)) {
        return runSummary(q, tablas.EventCompletedRegistration.filter(r => r.eventId === params[0]));
    }
    if (/^SELECT "?(\w+)"?, COUNT\(\*\)::int AS total FROM "EventCompletedRegistration" WHERE "eventId" = \$1/i.test(q)) {
        const col = q.match(/^SELECT "?(\w+)"?,/i)[1];
        const filtered = tablas.EventCompletedRegistration.filter(r =>
            r.eventId === params[0] && (!/COALESCE/.test(q) || String(r[col] || '') !== ''));
        const groups = new Map();
        for (const r of filtered) groups.set(r[col], (groups.get(r[col]) || 0) + 1);
        return { rows: [...groups.entries()].map(([k, total]) => ({ [col]: k, total })).sort((a, b) => b.total - a.total) };
    }
    if (/^UPDATE "EventCompletedRegistration"/i.test(q)) return runUpdate(q, params);
    if (/^INSERT INTO "EventCompletedRegistration"/i.test(q)) return runInsert(q, params);

    // ── EventRegistration (la ficha vinculada) ───────────────────────
    if (/^SELECT \* FROM "EventRegistration" WHERE id = \$1 AND "eventId" = \$2/i.test(q)) {
        return { rows: tablas.EventRegistration.filter(r => r.id === params[0] && r.eventId === params[1]) };
    }

    if (/FROM "EventRegistrationCompanion" WHERE "registrationId" = \$1/i.test(q)) {
        return { rows: [] };
    }

    // ── Historial y comunicaciones ───────────────────────────────────
    if (/^INSERT INTO "EventRegistrationHistory"/i.test(q)) return runInsert(q, params);
    if (/^INSERT INTO "EventRegistrationMessage"/i.test(q)) return runInsert(q, params);
    if (/FROM "EventRegistrationHistory" WHERE "registrationId" = \$1/i.test(q)) {
        return { rows: tablas.EventRegistrationHistory.filter(h => h.registrationId === params[0]) };
    }
    if (/FROM "EventRegistrationMessage" WHERE "registrationId" = \$1/i.test(q)) {
        return { rows: tablas.EventRegistrationMessage.filter(m => m.registrationId === params[0]) };
    }

    throw new Error(`[db-completed-stub] consulta no interpretada: ${q.slice(0, 160)}`);
};

export default { query };
