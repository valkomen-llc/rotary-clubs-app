// ════════════════════════════════════════════════════════════════════
// Doble de la base para el CAMINO de las acciones en bloque. v4.1024.0
//
// ⚠️ LEE EL SQL; NO REIMPLEMENTA EL CRITERIO. Un doble que decidiera por su
// cuenta qué fila se borra volvería VACUA la prueba que dice comprobarlo —y
// encima afirmaría lo contrario (la lección de v4.896)—. Acá las condiciones
// se buscan en el TEXTO de la consulta: si alguien quita el `AND "archivedAt"
// IS NULL` del UPDATE real, el doble deja de aplicarlo y la prueba falla, que
// es lo que tiene que pasar.
//
// Toda consulta que no reconoce queda anotada en `unhandled`: un doble que
// devuelva vacío en silencio da por bueno código que en producción no hace
// nada.
// ════════════════════════════════════════════════════════════════════

let submissions = [];
let children = {};
let events = [];
let tags = [];
let submissionTags = [];
export const queries = [];
export const unhandled = [];

// Simula la CARRERA que el UPDATE condicional existe para ganar: dos
// peticiones que leyeron la fila ANTES de que la otra la escribiera. Con
// `staleRead` activo, la lectura del lote devuelve la foto de ese momento
// aunque la fila ya haya cambiado — que es exactamente lo que ve la segunda
// petición de un doble clic.
let stale = null;
export const staleRead = (on) => { stale = on ? submissions.map(r => ({ ...r })) : null; };

export const reset = (rows = [], opts = {}) => {
    submissions = rows.map(r => ({ ...r }));
    stale = null;
    children = { ...(opts.children || {}) };
    events = [];
    tags = (opts.tags || []).map(t => ({ ...t }));
    submissionTags = (opts.submissionTags || []).map(t => ({ ...t }));
    queries.length = 0;
    unhandled.length = 0;
};

export const state = () => ({
    submissions: submissions.map(r => ({ ...r })),
    children: JSON.parse(JSON.stringify(children)),
    events: events.map(e => ({ ...e })),
    submissionTags: submissionTags.map(t => ({ ...t })),
});

const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();
const tableIn = (sql, verb) => {
    const m = new RegExp(`${verb}\\s+(?:INTO\\s+|FROM\\s+)?"([A-Za-z]+)"`, 'i').exec(sql);
    return m ? m[1] : null;
};

const query = async (sql, params = []) => {
    const q = norm(sql);
    queries.push({ sql: q, params });

    // El esquema: se ejecuta y no devuelve filas.
    if (/^(CREATE|ALTER|DROP)\b/i.test(q)) return { rows: [], rowCount: 0 };
    // El UPDATE de arrastre de `workflowStatus` del ensure.
    if (/UPDATE "ProjectFairSubmission" SET "workflowStatus" = CASE/i.test(q)) return { rows: [], rowCount: 0 };

    // La convocatoria: sin fila propia, el controlador cae a los valores por defecto.
    if (/FROM "ProjectFairConfig"/i.test(q)) return { rows: [], rowCount: 0 };

    // ── Lectura del lote ────────────────────────────────────────────
    if (/SELECT \* FROM "ProjectFairSubmission" WHERE id = ANY/i.test(q)) {
        const ids = params[0] || [];
        // ⚠️ Si la consulta real volviera a acotar por edición en el WHERE, el
        // doble lo aplicaría acá y la prueba de «una sin edición se opera»
        // fallaría — que es exactamente la señal que se busca.
        const acotaEdicion = /"eventId" = \$2/.test(q);
        return {
            rows: (stale || submissions)
                .filter(r => ids.includes(r.id))
                .filter(r => !acotaEdicion || r.eventId === params[1])
                .map(r => ({ ...r })),
        };
    }
    if (/SELECT id, label FROM "ProjectFairTag"/i.test(q)) {
        return { rows: tags.filter(t => t.id === params[0]).map(t => ({ ...t })) };
    }

    // ── Borrado de una hija ─────────────────────────────────────────
    if (/^DELETE FROM "ProjectFair/i.test(q) && /"submissionId" = \$1/.test(q) && !/"tagId"/.test(q)) {
        const table = tableIn(q, 'DELETE');
        const antes = (children[table] || []).length;
        children[table] = (children[table] || []).filter(r => r.submissionId !== params[0]);
        return { rows: [], rowCount: antes - children[table].length };
    }
    // Quitar una etiqueta.
    if (/^DELETE FROM "ProjectFairSubmissionTag"/i.test(q) && /"tagId"/.test(q)) {
        const antes = submissionTags.length;
        submissionTags = submissionTags.filter(t => !(t.submissionId === params[0] && t.tagId === params[1]));
        return { rows: [], rowCount: antes - submissionTags.length };
    }
    // Ponerla.
    if (/^INSERT INTO "ProjectFairSubmissionTag"/i.test(q)) {
        const ya = submissionTags.some(t => t.submissionId === params[0] && t.tagId === params[1]);
        if (ya && /ON CONFLICT/i.test(q)) return { rows: [], rowCount: 0 };
        submissionTags.push({ submissionId: params[0], tagId: params[1] });
        return { rows: [], rowCount: 1 };
    }

    // ── Borrado de la postulación ───────────────────────────────────
    if (/^DELETE FROM "ProjectFairSubmission" WHERE id = \$1/i.test(q)) {
        const row = submissions.find(r => r.id === params[0]);
        if (!row) return { rows: [], rowCount: 0 };
        // La cláusula de alcance se LEE del SQL, no se da por supuesta.
        if (/"eventId" = \$2/.test(q)) {
            const admiteNulo = /"eventId" IS NULL/.test(q);
            const casa = row.eventId === params[1] || (admiteNulo && !row.eventId);
            if (!casa) return { rows: [], rowCount: 0 };
        }
        submissions = submissions.filter(r => r.id !== params[0]);
        return { rows: [], rowCount: 1 };
    }

    // ── Archivar / restaurar / cambiar estado ───────────────────────
    if (/^UPDATE "ProjectFairSubmission"/i.test(q)) {
        const row = submissions.find(r => r.id === params[0]);
        if (!row) return { rows: [], rowCount: 0 };
        if (/"archivedAt" IS NULL/.test(q) && row.archivedAt) return { rows: [], rowCount: 0 };
        if (/"archivedAt" IS NOT NULL/.test(q) && !row.archivedAt) return { rows: [], rowCount: 0 };

        if (/SET "archivedAt" = NOW\(\)/i.test(q)) {
            row.archivedAt = new Date().toISOString();
            row.archivedBy = params[1] ?? null;
            row.archivedReason = params[2] ?? null;
        } else if (/SET "archivedAt" = NULL/i.test(q)) {
            row.archivedAt = null; row.archivedBy = null; row.archivedReason = null;
        } else if (/SET "workflowStatus" = \$2/i.test(q)) {
            row.workflowStatus = params[1];
        } else {
            unhandled.push(q);
            return { rows: [], rowCount: 0 };
        }
        return { rows: [{ ...row }], rowCount: 1 };
    }

    // ── El historial ────────────────────────────────────────────────
    if (/^INSERT INTO "ProjectFairEvent"/i.test(q)) {
        const ev = {
            id: `ev_${events.length + 1}`,
            submissionId: params[0], type: params[1], title: params[2], detail: params[3],
            actorName: params[5], metadata: params[7],
        };
        events.push(ev);
        return { rows: [ev], rowCount: 1 };
    }

    unhandled.push(q);
    return { rows: [], rowCount: 0 };
};

export default { query };
export { query };
