// ════════════════════════════════════════════════════════════════════════════
// La base en memoria del Reel que nace de una solicitud — v4.1006
//
// ⚠️ LEE EL SQL; NO REIMPLEMENTA EL CRITERIO. Es la lección de v4.896: un doble
// que escribe en JavaScript la regla que la prueba dice comprobar la vuelve
// VACUA y encima afirma lo contrario. Acá lo que se prueba es la IDEMPOTENCIA
// y el RECLAMO, así que el doble busca en el texto de la consulta las cláusulas
// que los producen —el `ON CONFLICT` y el `AND attempts = $n`— y sólo las
// respeta si de verdad están: si alguien las quita, este doble crea la fila
// dos veces y la prueba falla, que es lo que tiene que pasar.
//
// Y leer de MENOS también miente (v4.992): las condiciones `id = $1` se
// escriben SIN comillas en este módulo, así que el matcher las reconoce en las
// dos formas — sin eso, un UPDATE tocaría todas las filas y la prueba lo daría
// por bueno.
// ════════════════════════════════════════════════════════════════════════════

export const datos = {
    reels: [],
    submissions: [],
    campaigns: [],
    clubs: [],
    files: [],
    articles: [],
    articleMedia: [],
    posts: [],
    projects: [],
    events: [],
    consultas: [],
};

export const reset = () => {
    for (const k of Object.keys(datos)) datos[k] = [];
};

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const clon = (o) => JSON.parse(JSON.stringify(o));

/**
 * Las condiciones `col = $n` de un WHERE, con o sin comillas.
 *
 * ⚠️ SÓLO LO QUE VA DESPUÉS DE `WHERE`. Un UPDATE lleva pares `"col" = $n` en
 * su SET, y tomarlos por condiciones hace que ninguna fila case: el doble
 * devolvía cero filas y la prueba culpaba al módulo, que estaba bien. Es la
 * otra cara de «un doble que lee de MENOS también miente» (v4.992).
 */
const condiciones = (sql, params) => {
    const s = norm(sql);
    const i = s.indexOf(' WHERE ');
    const donde = i < 0 ? s : s.slice(i + 7);
    const out = [];
    for (const m of donde.matchAll(/"?(\w+)"?\s*=\s*\$(\d+)/g)) {
        out.push([m[1], params[Number(m[2]) - 1]]);
    }
    return out;
};

const casa = (fila, conds, saltar = []) =>
    conds.every(([c, v]) => saltar.includes(c) || fila[c] === v || (fila[c] == null && v == null));

const query = async (sql, params = []) => {
    const s = norm(sql);
    datos.consultas.push({ sql: s, params: clon(params) });

    // ── Esquema ──
    if (/^(CREATE|ALTER|DROP)/i.test(s)) return { rows: [] };
    if (/to_regclass/.test(s)) return { rows: [{ r: true, a: true, m: true, v: true }] };

    // ── SubmissionReel ──
    if (/INSERT INTO "SubmissionReel"/.test(s)) {
        const [id, submissionId, campaignId, clubId, articleId, versionNumber, generatedBy] = params;
        // La idempotencia SÓLO se respeta si el SQL la pide.
        if (/ON CONFLICT \("submissionId", "versionNumber"\) DO NOTHING/.test(s)) {
            const ya = datos.reels.find(r => r.submissionId === submissionId && r.versionNumber === versionNumber);
            if (ya) return { rows: [] };
        }
        const fila = {
            id, submissionId, campaignId, clubId, articleId, versionNumber,
            isCurrent: true, status: 'recibida', statusDetail: null, contentMode: 'image_reel',
            stages: {}, classification: {}, selection: {}, storyboard: {}, facts: {},
            creditsEstimated: 0, attempts: 0, claimedAt: null, generatedBy: generatedBy || 'ai_workflow',
            generatedAt: null, approvedAt: null, publishedAt: null, reelProjectId: null,
            lastError: null, createdAt: new Date(), updatedAt: new Date(),
        };
        datos.reels.push(fila);
        return { rows: [clon(fila)] };
    }

    if (/UPDATE "SubmissionReel"/.test(s)) {
        const conds = condiciones(s, params);
        // El RECLAMO: sólo se respeta si el SQL lo pide.
        const reclamo = /SET attempts = attempts \+ 1/.test(s);
        const exigeAttempts = /AND attempts = \$2/.test(s);
        let tocadas = [];
        for (const r of datos.reels) {
            if (!casa(r, conds, reclamo ? ['attempts'] : [])) continue;
            if (reclamo) {
                if (exigeAttempts && r.attempts !== params[1]) continue;
                if (r.claimedAt) continue;
                r.attempts += 1; r.claimedAt = new Date(); r.updatedAt = new Date();
                tocadas.push(r);
                continue;
            }
            // El `release`: los pares `"col" = $n` que no son la condición.
            const sets = norm(s).slice(0, norm(s).indexOf(' WHERE '));
            for (const m of sets.matchAll(/"(\w+)" = \$(\d+)(::jsonb)?/g)) {
                const valor = params[Number(m[2]) - 1];
                r[m[1]] = m[3] ? JSON.parse(valor) : valor;
            }
            if (/"claimedAt" = NULL/.test(s)) r.claimedAt = null;
            if (/"isCurrent" = FALSE/.test(s)) r.isCurrent = false;
            r.updatedAt = new Date();
            tocadas.push(r);
        }
        return { rows: tocadas.map(clon) };
    }

    if (/FROM "SubmissionReel"/.test(s)) {
        const conds = condiciones(s, params);
        let filas = datos.reels.filter(r => casa(r, conds));
        if (/AND "isCurrent"/.test(s)) filas = filas.filter(r => r.isCurrent);
        filas = [...filas].sort((a, b) => b.versionNumber - a.versionNumber);
        if (/LIMIT 1/.test(s)) filas = filas.slice(0, 1);
        return { rows: filas.map(clon) };
    }

    // ── Tablas de sólo lectura ──
    const tabla = {
        ContributionSubmission: 'submissions',
        ContributionCampaign: 'campaigns',
        Club: 'clubs',
        ContributionSubmissionFile: 'files',
        SubmissionArticle: 'articles',
        SubmissionArticleMedia: 'articleMedia',
        Post: 'posts',
        ReelProject: 'projects',
    };
    for (const [nombre, clave] of Object.entries(tabla)) {
        if (new RegExp(`FROM "${nombre}"`).test(s)) {
            const conds = condiciones(s, params);
            return { rows: datos[clave].filter(f => casa(f, conds)).map(clon) };
        }
    }
    if (/UPDATE "ReelProject"/.test(s)) {
        const conds = condiciones(s, params);
        for (const p of datos.projects) if (casa(p, conds)) p.configPatched = params[1];
        return { rows: [] };
    }
    if (/INSERT INTO "ContributionSubmissionEvent"/.test(s)) {
        datos.events.push({ sql: s, params: clon(params) });
        return { rows: [] };
    }
    if (/FROM "ReelScene"/.test(s)) return { rows: [] };

    return { rows: [] };
};

export default { query, pool: { query }, connect: async () => ({ query, release() {} }) };
