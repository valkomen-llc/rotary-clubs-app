// Una base en memoria que entiende lo justo del SQL de la Distribución.
//
// v4.864 — NO es un Postgres: es un doble que reconoce las sentencias que
// `distributionQueue.js` emite y guarda las filas en arrays. Lo que se prueba
// con él es el CAMINO —que el reclamo sea de verdad exclusivo, que la
// idempotencia rechace el duplicado, que un fallo de un destino no arrastre a
// los demás—, que es exactamente lo que una prueba de criterio no puede ver.
// Es la lección de v4.744: el criterio era correcto y el defecto estaba en el
// camino.
//
// Lo que este doble NO demuestra es que el SQL sea válido para Postgres. Eso
// exige una base y se comprueba al desplegar; se dice acá para no afirmar de más.

export let tablas = { DistributionCampaign: [], DistributionJob: [], DistributionEvent: [], DistributionGroup: [] };
export let cuentas = [];
export let log = [];

export const reset = () => {
    tablas = { DistributionCampaign: [], DistributionJob: [], DistributionEvent: [], DistributionGroup: [] };
    cuentas = [];
    log = [];
};

/** Siembra un grupo declarado, con el estado que se quiera probar. */
export const sembrarGrupo = (g) => {
    tablas.DistributionGroup.push({
        id: `row-${tablas.DistributionGroup.length + 1}`, clubId: 'club-4281',
        socialAccountId: null, url: null, source: 'manual', status: 'sin_verificar',
        favorite: false, tags: [], notes: null, lastPublishedAt: null, ...g,
    });
};

export const sembrarCuenta = (c) => {
    cuentas.push({ tokenVersion: 1, status: 'active', accessToken: 'TOKEN-PLANO', platform: 'facebook', ...c });
};

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Traduce el SET dinámico de un UPDATE a un objeto de cambios. */
const parseSet = (sql, params) => {
    const set = sql.slice(sql.indexOf(' SET ') + 5, sql.indexOf(' WHERE '));
    const cambios = {};
    for (const m of set.matchAll(/"([^"]+)"\s*=\s*\$(\d+)/g)) cambios[m[1]] = params[Number(m[2]) - 1];
    if (/"updatedAt" = NOW\(\)/.test(set)) cambios.updatedAt = new Date();
    return cambios;
};

const query = async (text, params = []) => {
    const sql = norm(text);
    log.push(sql.slice(0, 70));

    if (/to_regclass/.test(sql)) return { rows: [{ ok: true }] };

    // ── Grupos declarados ───────────────────────────────────────────────
    if (/^SELECT \* FROM "DistributionGroup" WHERE "clubId" = \$1 AND "groupId" = ANY/.test(sql)) {
        const [clubId, ids] = params;
        return { rows: tablas.DistributionGroup.filter(g => g.clubId === clubId && ids.includes(g.groupId)).map(g => ({ ...g })) };
    }
    if (/^SELECT \* FROM "DistributionGroup"/.test(sql)) {
        return { rows: tablas.DistributionGroup.filter(g => g.clubId === params[0]).map(g => ({ ...g })) };
    }
    if (/^UPDATE "DistributionGroup"/.test(sql)) {
        const [clubId, groupId, at, jobId] = params;
        const g = tablas.DistributionGroup.find(x => x.clubId === clubId && x.groupId === groupId);
        if (g) { g.lastPublishedAt = at; g.lastJobId = jobId; }
        return { rows: [] };
    }

    if (/^INSERT INTO "DistributionCampaign"/.test(sql)) {
        const [id, clubId, userId, name, sourceType, sourceId, content, contentHash, copyMode,
               intervalMinutes, startAt, timezone, scheduleWindow, perDay, limits, status, notes] = params;
        tablas.DistributionCampaign.push({
            id, clubId, userId, name, sourceType, sourceId, content, contentHash, copyMode,
            intervalMinutes, startAt, timezone, scheduleWindow, perDay, limits, status, notes,
            pausedReason: null, resumeAt: null, claimedAt: null, createdAt: new Date(),
        });
        return { rows: [] };
    }

    if (/^INSERT INTO "DistributionJob"/.test(sql)) {
        const [id, campaignId, clubId, position, targetType, targetId, targetName,
               socialAccountId, targetUrl, message, linkUrl, mediaUrl, contentHash, scheduledAt, status] = params;
        // EL ÍNDICE ÚNICO. Es lo que impide que el mismo contenido salga dos
        // veces al mismo destino; sin él, un doble envío del formulario publica
        // dos veces.
        const ya = tablas.DistributionJob.find(j =>
            j.campaignId === campaignId && j.targetId === targetId && j.contentHash === contentHash);
        if (ya) return { rows: [] };  // ON CONFLICT DO NOTHING
        tablas.DistributionJob.push({
            id, campaignId, clubId, position, targetType, targetId, targetName,
            socialAccountId, targetUrl, message, linkUrl, mediaUrl, contentHash,
            scheduledAt: new Date(scheduledAt), status, attempts: 0,
            externalId: null, externalUrl: null, publishedAt: null, publishedBy: null,
            error: null, errorCode: null, retryable: false, updatedAt: new Date(),
        });
        return { rows: [{ id }] };
    }

    if (/^INSERT INTO "DistributionEvent"/.test(sql)) {
        const [id, campaignId, jobId, kind, message, detail, userId] = params;
        tablas.DistributionEvent.push({ id, campaignId, jobId, kind, message, detail, userId, createdAt: new Date() });
        return { rows: [] };
    }

    // La consulta del barrido: jobs vencidos con su campaña.
    if (/^SELECT j\.\*, c\.content AS "campaignContent"/.test(sql)) {
        const ahora = new Date(params[0]);
        const soloCampana = /j\."campaignId" = \$2/.test(sql) ? params[1] : null;
        const limite = params[params.length - 1];
        const rows = tablas.DistributionJob
            .filter(j => ['scheduled', 'pending'].includes(j.status))
            .filter(j => j.scheduledAt <= ahora)
            .filter(j => !soloCampana || j.campaignId === soloCampana)
            .filter(j => {
                const c = tablas.DistributionCampaign.find(x => x.id === j.campaignId);
                if (!c) return false;
                if (['cancelled', 'paused', 'done', 'partial', 'failed'].includes(c.status)) return false;
                if (c.resumeAt && new Date(c.resumeAt) > ahora) return false;
                return true;
            })
            .sort((a, b) => a.scheduledAt - b.scheduledAt)
            .slice(0, limite)
            .map(j => {
                const c = tablas.DistributionCampaign.find(x => x.id === j.campaignId);
                return { ...j, campaignContent: c.content, campaignLimits: c.limits, campaignStatus: c.status, campaignResumeAt: c.resumeAt };
            });
        return { rows };
    }

    // EL RECLAMO. Sólo casa si el estado y `attempts` son los que se leyeron:
    // dos vueltas simultáneas leen lo mismo y sólo una gana.
    if (/^UPDATE "DistributionJob" SET status = 'processing'/.test(sql)) {
        const [id, status, attempts] = params;
        const j = tablas.DistributionJob.find(x => x.id === id && x.status === status && x.attempts === attempts);
        if (!j) return { rows: [] };
        j.status = 'processing';
        j.attempts += 1;
        return { rows: [{ ...j }] };
    }

    if (/^UPDATE "DistributionJob" SET status = 'cancelled'/.test(sql)) {
        const [campaignId] = params;
        for (const j of tablas.DistributionJob) {
            if (j.campaignId === campaignId && ['scheduled', 'pending', 'paused', 'awaiting_manual', 'rate_limited'].includes(j.status)) {
                j.status = 'cancelled';
            }
        }
        return { rows: [] };
    }

    if (/^UPDATE "DistributionJob" SET/.test(sql)) {
        const j = tablas.DistributionJob.find(x => x.id === params[0]);
        if (j) Object.assign(j, parseSet(sql, params));
        return { rows: [] };
    }

    if (/^UPDATE "DistributionCampaign" SET status = 'scheduled'/.test(sql)) {
        const c = tablas.DistributionCampaign.find(x => x.id === params[0]);
        if (c && ['paused', 'failed', 'partial', 'done'].includes(c.status)) {
            c.status = 'scheduled'; c.pausedReason = null; c.resumeAt = null;
        }
        return { rows: [] };
    }

    if (/^UPDATE "DistributionCampaign" SET/.test(sql)) {
        const c = tablas.DistributionCampaign.find(x => x.id === params[0]);
        if (c) Object.assign(c, parseSet(sql, params));
        return { rows: [] };
    }

    if (/^SELECT COUNT\(\*\)::int AS n FROM "DistributionJob"/.test(sql)) {
        const [campaignId, desde] = params;
        const n = tablas.DistributionJob.filter(j =>
            j.campaignId === campaignId && j.status === 'published' && j.publishedAt && j.publishedAt > new Date(desde)).length;
        return { rows: [{ n }] };
    }

    if (/^SELECT status FROM "DistributionJob"/.test(sql)) {
        return { rows: tablas.DistributionJob.filter(j => j.campaignId === params[0]).map(j => ({ status: j.status })) };
    }

    if (/^SELECT status FROM "DistributionCampaign"/.test(sql)) {
        const c = tablas.DistributionCampaign.find(x => x.id === params[0]);
        return { rows: c ? [{ status: c.status }] : [] };
    }

    if (/^SELECT \* FROM "DistributionCampaign"/.test(sql)) {
        const c = tablas.DistributionCampaign.find(x => x.id === params[0]);
        if (!c) return { rows: [] };
        if (/"clubId" IS NOT DISTINCT FROM/.test(sql) && c.clubId !== params[1]) return { rows: [] };
        return { rows: [{ ...c }] };
    }

    if (/^SELECT \* FROM "DistributionJob" WHERE "campaignId"/.test(sql)) {
        return { rows: tablas.DistributionJob.filter(j => j.campaignId === params[0]).sort((a, b) => a.position - b.position).map(j => ({ ...j })) };
    }

    if (/^SELECT \* FROM "DistributionJob" WHERE id/.test(sql)) {
        const j = tablas.DistributionJob.find(x => x.id === params[0]);
        if (!j) return { rows: [] };
        if (/"clubId" IS NOT DISTINCT FROM/.test(sql) && j.clubId !== params[1]) return { rows: [] };
        return { rows: [{ ...j }] };
    }

    if (/^SELECT c\.id, c\.name/.test(sql)) {
        return { rows: tablas.DistributionCampaign.map(c => ({ ...c, total: 0, publicados: 0, fallidos: 0, manuales: 0 })) };
    }

    throw new Error(`[stub] sentencia no reconocida: ${sql.slice(0, 90)}`);
};

const prisma = {
    socialAccount: {
        findUnique: async ({ where }) => cuentas.find(c => c.id === where.id) || null,
    },
};

export default { query, prisma, pool: null };
