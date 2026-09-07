// `db.js` en memoria para la prueba del CAMINO del desembolso agrupado.
//
// ⚠️ EL DOBLE LEE EL SQL, NO REIMPLANTA EL CRITERIO. Es la lección de v4.896 y
// de v4.938: un doble que escribe en JavaScript la regla que la prueba dice
// comprobar la vuelve vacua. Acá se interpreta cada sentencia —la tabla, las
// columnas del INSERT, el `ON CONFLICT` con su predicado, los `WHERE` de
// igualdad, `ANY`, `IS NULL`, los `SET` del UPDATE— sobre tablas en memoria.
// Si alguien quita el `ON CONFLICT` del lote o el `WHERE "batchId" = $1` del
// aviso, la prueba lo VE porque el doble deja de comportarse como Postgres.
//
// Lo que NO demuestra es que el SQL sea válido para Postgres: eso se comprueba
// al desplegar, y no se afirma de más.

let seq = 0;
const nuevoId = () => `stub-${++seq}`;

/** Las tablas. La prueba las siembra directamente. */
export const tablas = {
    Payment: [], Donation: [], Disbursement: [], DisbursementBatch: [],
    PaymentLifecycleEvent: [], NotificationDelivery: [], NotificationDomain: [],
    NotificationProfile: [], NotificationBeneficiary: [], ContributionCampaign: [],
    Club: [], District: [], PlatformConfig: [], WhatsAppTemplate: [],
};
/** Cada sentencia ejecutada, para que la prueba pueda contar y mirar. */
export const consultas = [];
export const reset = () => {
    for (const k of Object.keys(tablas)) tablas[k].length = 0;
    consultas.length = 0;
    seq = 0;
};

/** Las columnas JSONB: Postgres convierte solo el texto JSON que el driver
 *  manda; acá hay que hacerlo a mano o la fila guardaría una cadena. */
const JSONB = new Set(['notifyEmails', 'notifyPhones', 'notifyResults', 'meta']);
const comoJson = (v) => {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
};

const sinComillas = (s) => String(s).replace(/"/g, '').replace(/^\w+\./, '');
const literal = (v) => (v === null || v === undefined ? null : v);

/** Evalúa un valor del SQL: `$n`, `'texto'`, `NOW()`, `NULL`, `gen_random_uuid()`. */
const valorDe = (expr, args) => {
    const e = expr.trim();
    let m;
    if ((m = /^\$(\d+)(::\w+(\[\])?)?$/.exec(e))) {
        const v = args[Number(m[1]) - 1];
        if (m[2] && /jsonb/.test(m[2]) && typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } }
        return v === undefined ? null : v;
    }
    if (/^NOW\(\)$/i.test(e)) return new Date().toISOString();
    if (/^NULL$/i.test(e)) return null;
    if (/^gen_random_uuid\(\)(::text)?$/i.test(e)) return nuevoId();
    if ((m = /^'([^']*)'$/.exec(e))) return m[1];
    if (/^\d+(\.\d+)?$/.test(e)) return Number(e);
    if (/^(true|false)$/i.test(e)) return e.toLowerCase() === 'true';
    if ((m = /^NOW\(\)\s*\+\s*INTERVAL/i.exec(e))) return new Date(Date.now() + 60_000).toISOString();
    return e;
};

/** Parte por comas a nivel superior (respeta paréntesis). */
const partir = (s) => {
    const out = []; let nivel = 0, cur = '';
    for (const ch of s) {
        if (ch === '(') nivel++;
        if (ch === ')') nivel--;
        if (ch === ',' && nivel === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out.map(x => x.trim());
};

/** Un predicado del WHERE, con las formas que este módulo escribe. */
const condicion = (texto, args) => {
    const c = texto.trim();
    let m;
    if ((m = /^(?:\w+\.)?"?(\w+)"?\s*=\s*ANY\(\$(\d+)(?:::text\[\])?\)$/i.exec(c))) {
        const col = m[1], lista = args[Number(m[2]) - 1] || [];
        return (r) => lista.includes(r[col]);
    }
    if ((m = /^(?:\w+\.)?"?(\w+)"?\s*(=|<>)\s*(.+)$/.exec(c)) && !/\bANY\(/i.test(c)) {
        const col = m[1], op = m[2], v = valorDe(m[3], args);
        return (r) => (op === '=' ? literal(r[col]) == v : literal(r[col]) != v);
    }
    if ((m = /^(?:\w+\.)?"?(\w+)"?\s+IS NOT NULL$/i.exec(c))) { const col = m[1]; return (r) => r[col] !== null && r[col] !== undefined; }
    if ((m = /^(?:\w+\.)?"?(\w+)"?\s+IS NULL$/i.exec(c))) { const col = m[1]; return (r) => r[col] === null || r[col] === undefined; }
    if ((m = /^(?:\w+\.)?"?(\w+)"?$/.exec(c))) { const col = m[1]; return (r) => !!r[col]; }
    throw new Error(`[db-stub] condición no soportada: ${c}`);
};

const where = (texto, args) => {
    if (!texto) return () => true;
    const partes = texto.split(/\s+AND\s+/i).map(p => {
        const t = p.trim();
        // Un paréntesis que ENVUELVE la condición se quita; el de `ANY(...)` no.
        return /^\(.*\)$/.test(t) && !/^\w/.test(t) ? t.slice(1, -1).trim() : t;
    });
    const fns = partes.map(p => condicion(p, args));
    return (r) => fns.every(f => f(r));
};

const tablaDe = (sql, verbo) => {
    const m = new RegExp(`${verbo}\\s+"?(\\w+)"?`, 'i').exec(sql);
    return m ? m[1] : null;
};

const consulta = async (sql, args = []) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    consultas.push({ sql: s, args });

    // Los catálogos: todo existe ya.
    if (/to_regclass/i.test(s)) {
        return { rows: [{ ok: true, entrega: true, beneficiario: true, perfil: true, plantilla: true, dominio: true }] };
    }
    if (/^(CREATE|ALTER|--)/i.test(s) || /^ALTER TABLE/i.test(s)) return { rows: [], rowCount: 0 };

    // ── INSERT ────────────────────────────────────────────────────
    let m;
    if ((m = /^INSERT INTO "(\w+)" \(([^)]+)\) VALUES \((.+?)\)(?: ON CONFLICT \(([^)]+)\)(?: WHERE (.+?))? DO NOTHING)?(?: RETURNING (.+))?$/i.exec(s))) {
        const [, tabla, colsTxt, valsTxt, conflictCols, conflictWhere, returning] = m;
        const cols = partir(colsTxt).map(sinComillas);
        const vals = partir(valsTxt).map(v => valorDe(v, args));
        const fila = {};
        cols.forEach((c, i) => { fila[c] = JSONB.has(c) ? comoJson(vals[i]) : vals[i]; });
        if (!fila.id) fila.id = nuevoId();
        fila.createdAt ||= new Date().toISOString();
        fila.updatedAt ||= fila.createdAt;
        if (tabla === 'Disbursement' && !('status' in fila)) fila.status = 'confirmado';
        if (tabla === 'NotificationDelivery') { fila.retryCount ??= 0; fila.retryable ??= false; }
        if (tabla === 'DisbursementBatch') { fila.count ??= 0; fila.netAmount ??= 0; fila.grossAmount ??= 0; fila.fees ??= 0; fila.platformRetention ??= 0; }
        const t = tablas[tabla] || (tablas[tabla] = []);
        if (conflictCols) {
            const claves = partir(conflictCols).map(sinComillas);
            const pred = where(conflictWhere, args);
            const choca = t.some(r => pred(r) && pred(fila) && claves.every(k => literal(r[k]) == literal(fila[k]) && literal(fila[k]) !== null));
            if (choca) return { rows: [], rowCount: 0 };
        }
        t.push(fila);
        return { rows: returning ? [proyecta(fila, returning)] : [], rowCount: 1 };
    }

    // ── UPDATE ────────────────────────────────────────────────────
    if ((m = /^UPDATE "(\w+)" SET (.+?) WHERE (.+?)(?: RETURNING (.+))?$/i.exec(s))) {
        const [, tabla, setTxt, whereTxt, returning] = m;
        const pred = where(whereTxt, args);
        const cambios = partir(setTxt).map(a => {
            const mm = /^"?(\w+)"?\s*=\s*(.+)$/.exec(a.trim());
            if (!mm) throw new Error(`[db-stub] SET no soportado: ${a}`);
            const col = mm[1], expr = mm[2].trim();
            let fn;
            let cm;
            if ((cm = /^COALESCE\((\$\d+(?:::\w+)?), "?(\w+)"?\)$/i.exec(expr))) {
                const v = valorDe(cm[1], args); const alt = cm[2];
                fn = (r) => (v === null || v === undefined ? r[alt] : v);
            } else if ((cm = /^"?(\w+)"?\s*\+\s*1$/.exec(expr))) {
                const c2 = cm[1]; fn = (r) => (Number(r[c2]) || 0) + 1;
            } else {
                const v = valorDe(expr, args); fn = () => v;
            }
            return { col, fn: JSONB.has(col) ? (r) => comoJson(fn(r)) : fn };
        });
        const tocadas = [];
        for (const r of tablas[tabla] || []) {
            if (!pred(r)) continue;
            for (const c of cambios) r[c.col] = c.fn(r);
            tocadas.push(r);
        }
        return { rows: returning ? tocadas.map(r => proyecta(r, returning)) : [], rowCount: tocadas.length };
    }

    // ── SELECT ────────────────────────────────────────────────────
    if (/^SELECT /i.test(s)) {
        // La subconsulta del tamaño del lote se calcula aparte: para leer el
        // WHERE principal se la saca del texto.
        const plano = s.replace(/CASE WHEN .*? END AS "batchSize"/i, '"batchSize"');
        const tabla = tablaDe(plano, 'FROM');
        const t = tablas[tabla] || [];
        const mw = /WHERE (.+?)(?: ORDER BY (.+?))?(?: LIMIT (\S+))?$/i.exec(plano);
        const filtro = mw ? where(mw[1], args) : () => true;
        let filas = t.filter(filtro);

        // El JOIN de los aportes del lote con su pago: se pegan las columnas
        // que el SELECT pide con alias (`p.amount AS "paymentGross"`).
        if (/LEFT JOIN "Payment" p ON p\.id = d\."paymentId"/i.test(s)) {
            const alias = [...s.matchAll(/p\."?(\w+)"? AS "(\w+)"/g)].map(x => [x[1], x[2]]);
            filas = filas.map(d => {
                const p = tablas.Payment.find(x => x.id === d.paymentId) || {};
                const extra = {};
                for (const [src, dst] of alias) extra[dst] = p[src] ?? null;
                if (/p\."providerRef"/.test(s)) extra.providerRef = p.providerRef ?? null;
                return { ...d, ...extra };
            });
        }
        // El tamaño del lote de cada desembolso (subconsulta CASE).
        if (/AS "batchSize"/.test(s)) {
            filas = filas.map(d => ({
                ...d,
                batchSize: d.batchId ? tablas.Disbursement.filter(b => b.batchId === d.batchId && b.status === 'confirmado').length : null,
            }));
        }
        if (mw?.[2]) {
            const mo = /(?:\w+\.)?"?(\w+)"?\s*(ASC|DESC)?/i.exec(mw[2]);
            if (mo) {
                const col = mo[1], dir = /DESC/i.test(mo[2] || '') ? -1 : 1;
                filas = [...filas].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * dir);
            }
        }
        if (mw?.[3]) {
            const lim = /^\$(\d+)$/.test(mw[3]) ? Number(args[Number(mw[3].slice(1)) - 1]) : Number(mw[3]);
            if (Number.isFinite(lim)) filas = filas.slice(0, lim);
        }
        const proy = /^SELECT (.+?) FROM/i.exec(plano)?.[1] || '*';
        return { rows: filas.map(r => proyecta(r, proy)), rowCount: filas.length };
    }

    throw new Error(`[db-stub] sentencia no soportada: ${s.slice(0, 120)}`);
};

/** Proyección: `*`, `d.*`, o una lista de columnas (con alias `AS`). */
const proyecta = (fila, lista) => {
    const l = lista.trim();
    if (l === '*' || /^\w+\.\*/.test(l) || /\*/.test(l.split(',')[0])) return { ...fila };
    const out = {};
    for (const parte of partir(l)) {
        const ma = /AS "?(\w+)"?$/i.exec(parte);
        const nombre = ma ? ma[1] : sinComillas(parte.replace(/^.*\./, ''));
        out[nombre] = fila[nombre] ?? fila[sinComillas(parte)] ?? null;
    }
    return out;
};

const db = {
    query: consulta,
    pool: { connect: async () => null },
};
export default db;
export const query = db.query;
export const pool = db.pool;
