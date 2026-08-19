/**
 * Distribución multi-destino — LA COLA.
 *
 * v4.864 — Acá vive la I/O: crear la campaña, reclamar un job, despacharlo al
 * proveedor y registrar el resultado. El CRITERIO —calendario, límites,
 * clasificación de errores, idempotencia— vive en distributionSpec.js, que es
 * puro y se prueba sin base ni red.
 *
 * EL "WORKER" ES UN VERCEL CRON, no un proceso persistente: en Vercel la
 * función se congela al cerrar la respuesta, así que una cola con trabajador
 * clásico exigiría infraestructura aparte. Hay TRES vías que llaman al mismo
 * advance() —el cron cada minuto, el sondeo del navegador mientras alguien mira
 * y el reintento manual— y los UPDATE condicionales de adentro son lo que
 * impide que dos hagan el mismo trabajo. No quitar ninguna: sin el cron, una
 * campaña se queda parada si el usuario cierra la pestaña.
 *
 * NADA DE ESTO LANZA. Corre dentro de un cron y dentro del sondeo de una
 * pantalla: una excepción acá dejaría la campaña a medias sin decir por qué.
 * Toda función devuelve su resultado con el motivo escrito.
 */
import crypto from 'crypto';
import db from './db.js';
import { decryptToken } from './tokenCrypto.js';
import { ensureDistributionSchema } from './ensureDistributionSchema.js';
import { publishContentToTarget } from '../services/socialPublishService.js';
import { findGroupsByIds, markPublished } from './distributionGroups.js';
import { splitByPublishability } from './groupSpec.js';
import {
    publishesViaApi, normalizeLimits, buildSchedule,
    classifyMetaError, retryDelayMinutes, shouldRetry,
    contentHash, summarizeJobs, foldCampaignStatus, validateCampaign, normalizeConcurrency,
} from './distributionSpec.js';

const uid = () => crypto.randomUUID();
const nowOr = (d) => (d instanceof Date && Number.isFinite(d.getTime()) ? d : new Date());

/** La traza. Append-only y nunca lanza: es registro nuestro, no del usuario. */
export const logEvent = async ({ campaignId, jobId = null, kind, message = null, detail = null, userId = null }) => {
    try {
        await db.query(
            `INSERT INTO "DistributionEvent" (id,"campaignId","jobId",kind,message,detail,"userId")
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [uid(), campaignId, jobId, kind, message, detail ? JSON.stringify(detail) : null, userId]
        );
    } catch (e) {
        console.warn('[distribution] no se pudo anotar el evento:', e.message);
    }
};

// ── Crear ───────────────────────────────────────────────────────────────────

/**
 * Crea la campaña y UN JOB POR DESTINO, con su hora ya calculada.
 *
 * La fila de la campaña se inserta ANTES que nada, igual que en el Creador de
 * Reels: si la petición muere a mitad, queda una campaña con su motivo escrito
 * en vez de no quedar nada.
 */
export const createCampaign = async ({
    clubId = null, userId = null, name, sourceType = 'manual', sourceId = null,
    content = {}, targets = [], intervalMinutes = 15, startAt = null,
    timezone = 'UTC', scheduleWindow = null, perDay = null, limits = {},
    copyMode = 'same', concurrency = 1, now = new Date(),
}) => {
    const ready = await ensureDistributionSchema();
    if (!ready) return { ok: false, reason: 'No se pudo preparar el almacenamiento de la distribución.' };

    const check = validateCampaign({ content, targets, intervalMinutes, limits });
    if (!check.ok) return { ok: false, reason: check.errors.join(' '), errors: check.errors, warnings: check.warnings };

    let eligible = check.eligible;
    const warnings = [...check.warnings];

    // ⚠️ LA PUERTA DE VERIFICACIÓN, y va acá y no en la pantalla.
    //
    // Un grupo sólo recibe trabajo si alguien confirmó que se puede publicar en
    // él. El estado se lee de la BASE, no del cuerpo de la petición: confiar en
    // lo que mande el navegador dejaría la puerta abierta a quien conozca el
    // endpoint, y el pedido dice expresamente «no permitir publicar en un grupo
    // no autorizado».
    const pedidosGrupo = eligible.filter(t => !publishesViaApi(t.targetType));
    if (pedidosGrupo.length) {
        const guardados = await findGroupsByIds({ clubId, groupIds: pedidosGrupo.map(t => t.targetId) });
        const porId = new Map(guardados.map(g => [g.groupId, g]));
        const { blocked } = splitByPublishability(
            pedidosGrupo.map(t => porId.get(t.targetId) || { ...t, status: 'sin_verificar' })
        );
        const vetados = new Set(blocked.map(b => b.group.groupId || b.group.targetId));
        if (vetados.size) {
            eligible = eligible.filter(t => publishesViaApi(t.targetType) || !vetados.has(t.targetId));
            // Se NOMBRAN los que quedaron fuera y por qué. «Algunos grupos no se
            // pudieron usar» obliga a adivinar cuáles.
            for (const b of blocked) {
                const nombre = b.group.name || b.group.targetName || b.group.groupId || b.group.targetId;
                warnings.push(`${nombre}: ${b.reason} No se le programó nada.`);
            }
        }
    }

    if (!eligible.length) {
        const motivo = pedidosGrupo.length
            ? 'Ningún destino quedó disponible: los grupos elegidos todavía no están verificados.'
            : 'Ningún destino admite este tipo de contenido.';
        return { ok: false, reason: motivo, errors: [motivo], warnings };
    }

    const hash = contentHash(content);
    const interval = check.interval;
    const lim = check.limits;
    const start = startAt ? new Date(startAt) : nowOr(now);
    const campaignId = uid();

    // El calendario se calcula UNA vez, acá, y se guarda con cada job. El
    // intervalo no es un sleep: así la cadencia sobrevive a que la función
    // muera, a que cierren la pestaña y a un despliegue en medio.
    const slots = buildSchedule({
        startAt: start, intervalMinutes: interval, count: eligible.length,
        timezone, window: scheduleWindow, perDay: perDay || lim.maxPerDay, now: nowOr(now),
    });

    try {
        await db.query(
            `INSERT INTO "DistributionCampaign"
               (id,"clubId","userId",name,"sourceType","sourceId",content,"contentHash","copyMode",
                "intervalMinutes","startAt",timezone,"scheduleWindow","perDay",limits,status,notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [campaignId, clubId, userId, name || 'Distribución', sourceType, sourceId,
             JSON.stringify(content), hash, copyMode, interval, slots[0]?.at || start, timezone,
             scheduleWindow ? JSON.stringify(scheduleWindow) : null, perDay || null,
             JSON.stringify({ ...lim, concurrency: normalizeConcurrency(concurrency) }), 'scheduled',
             warnings.length ? JSON.stringify({ warnings }) : null]
        );
    } catch (e) {
        console.error('[distribution] no se pudo crear la campaña:', e.message);
        return { ok: false, reason: `No se pudo crear la campaña: ${e.message}` };
    }

    let created = 0, duplicated = 0;
    for (let i = 0; i < eligible.length; i++) {
        const t = eligible[i];
        const at = slots[i]?.at || start;
        // El copy por destino se resuelve acá y se congela en el job: la
        // campaña puede tener uno común o uno por destino, y el job publica lo
        // que se aprobó, no lo que la campaña diga después.
        const message = (copyMode === 'per_target' && t.message != null) ? t.message : (content.message || '');
        try {
            // LA IDEMPOTENCIA. Sin ON CONFLICT, dos envíos del mismo formulario
            // crean dos veces el mismo destino y se publica dos veces. Comprobar
            // con un SELECT antes no sirve: entre la lectura y la escritura
            // caben dos peticiones.
            const r = await db.query(
                `INSERT INTO "DistributionJob"
                   (id,"campaignId","clubId",position,"targetType","targetId","targetName",
                    "socialAccountId","targetUrl",message,"linkUrl","mediaUrl","contentHash","scheduledAt",status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                 ON CONFLICT ("campaignId","targetId","contentHash") DO NOTHING
                 RETURNING id`,
                [uid(), campaignId, clubId, i, t.targetType, t.targetId, t.targetName || null,
                 t.socialAccountId || null, t.targetUrl || null, message,
                 content.link || null, content.mediaUrl || null, hash, at, 'scheduled']
            );
            if (r.rows?.length) created++; else duplicated++;
        } catch (e) {
            console.error('[distribution] no se pudo crear el job:', e.message);
        }
    }

    await logEvent({
        campaignId, kind: 'created', userId,
        message: `${created} destinos programados cada ${interval} min`,
        detail: { created, duplicated, warnings },
    });

    return { ok: true, campaignId, created, duplicated, interval, warnings, schedule: slots };
};

// ── Lectura ─────────────────────────────────────────────────────────────────

const parseJson = (v) => {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return null; }
};

export const getCampaign = async ({ campaignId, clubId = null, isPlatform = false }) => {
    const ready = await ensureDistributionSchema();
    if (!ready) return null;
    // El aislamiento va en el WHERE, no se lee y se comprueba después: para
    // quien pregunta por una campaña ajena, simplemente no existe.
    const params = [campaignId];
    let sql = `SELECT * FROM "DistributionCampaign" WHERE id = $1`;
    if (!isPlatform) { params.push(clubId); sql += ` AND "clubId" IS NOT DISTINCT FROM $2`; }
    try {
        const { rows } = await db.query(sql, params);
        const c = rows[0];
        if (!c) return null;
        const jobs = await db.query(
            `SELECT * FROM "DistributionJob" WHERE "campaignId" = $1 ORDER BY position ASC`, [campaignId]
        );
        return {
            ...c,
            content: parseJson(c.content),
            limits: parseJson(c.limits),
            notes: parseJson(c.notes),
            scheduleWindow: parseJson(c.scheduleWindow),
            jobs: jobs.rows,
            counts: summarizeJobs(jobs.rows),
        };
    } catch (e) {
        console.error('[distribution] getCampaign:', e.message);
        return null;
    }
};

export const listCampaigns = async ({ clubId = null, isPlatform = false, limit = 50 }) => {
    const ready = await ensureDistributionSchema();
    if (!ready) return [];
    const params = [];
    let where = '';
    if (!isPlatform) { params.push(clubId); where = `WHERE c."clubId" IS NOT DISTINCT FROM $1`; }
    params.push(Math.min(200, Math.max(1, limit)));
    try {
        // Los conteos salen en la MISMA consulta: con uno por campaña serían
        // decenas de viajes por pantalla.
        const { rows } = await db.query(
            `SELECT c.id, c.name, c.status, c."createdAt", c."startAt", c."intervalMinutes",
                    c.timezone, c."sourceType", c."clubId", c."userId", c.content, c.notes,
                    COUNT(j.id)::int AS total,
                    COUNT(j.id) FILTER (WHERE j.status = 'published')::int AS publicados,
                    COUNT(j.id) FILTER (WHERE j.status IN ('failed','no_permission','needs_reconnect'))::int AS fallidos,
                    COUNT(j.id) FILTER (WHERE j.status = 'awaiting_manual')::int AS manuales
               FROM "DistributionCampaign" c
               LEFT JOIN "DistributionJob" j ON j."campaignId" = c.id
               ${where}
              GROUP BY c.id
              ORDER BY c."createdAt" DESC
              LIMIT $${params.length}`,
            params
        );
        return rows.map(r => ({ ...r, content: parseJson(r.content), notes: parseJson(r.notes) }));
    } catch (e) {
        console.error('[distribution] listCampaigns:', e.message);
        return [];
    }
};

// ── El avance ───────────────────────────────────────────────────────────────

const touchCampaign = async (campaignId, patch = {}) => {
    const sets = ['"updatedAt" = NOW()'];
    const params = [campaignId];
    for (const [k, v] of Object.entries(patch)) {
        params.push(v);
        sets.push(`"${k}" = $${params.length}`);
    }
    try {
        await db.query(`UPDATE "DistributionCampaign" SET ${sets.join(', ')} WHERE id = $1`, params);
    } catch (e) {
        console.warn('[distribution] touchCampaign:', e.message);
    }
};

/** Recalcula el estado de la campaña a partir de sus jobs. */
const refreshCampaignStatus = async (campaignId) => {
    try {
        const { rows } = await db.query(`SELECT status FROM "DistributionJob" WHERE "campaignId" = $1`, [campaignId]);
        const { rows: cr } = await db.query(`SELECT status FROM "DistributionCampaign" WHERE id = $1`, [campaignId]);
        const current = cr[0]?.status;
        if (current === 'cancelled' || current === 'paused') return current;
        const next = foldCampaignStatus(rows, {});
        if (next !== current) await touchCampaign(campaignId, { status: next });
        return next;
    } catch (e) {
        console.warn('[distribution] refreshCampaignStatus:', e.message);
        return null;
    }
};

const finishJob = async (jobId, patch) => {
    const sets = ['"updatedAt" = NOW()'];
    const params = [jobId];
    for (const [k, v] of Object.entries(patch)) {
        params.push(v);
        sets.push(`"${k}" = $${params.length}`);
    }
    await db.query(`UPDATE "DistributionJob" SET ${sets.join(', ')} WHERE id = $1`, params);
};

/**
 * Cuántas publicaciones salieron de esta campaña en la última hora.
 * Es el freno de `maxPerHour`, comprobado contra lo que DE VERDAD salió, no
 * contra lo que se había planeado.
 */
const publishedLastHour = async (campaignId, now) => {
    try {
        const { rows } = await db.query(
            `SELECT COUNT(*)::int AS n FROM "DistributionJob"
              WHERE "campaignId" = $1 AND status = 'published' AND "publishedAt" > $2`,
            [campaignId, new Date(now.getTime() - 3600_000)]
        );
        return rows[0]?.n || 0;
    } catch { return 0; }
};

/** Resuelve la cuenta conectada y su token. Nunca lanza. */
const resolveAccount = async (socialAccountId) => {
    try {
        const acc = await db.prisma.socialAccount.findUnique({ where: { id: socialAccountId } });
        if (!acc) return { ok: false, status: 'failed', reason: 'La cuenta conectada ya no existe.' };
        if (acc.tokenVersion === 0) {
            // Token heredado en texto plano: no se usa. Se pide reconectar, que
            // es lo que ya hace el resto del Hub Social.
            return { ok: false, status: 'needs_reconnect', reason: 'La cuenta usa una conexión antigua. Hay que reconectarla en Cuentas Sociales.' };
        }
        if (acc.status !== 'active') {
            return { ok: false, status: 'needs_reconnect', reason: `La cuenta está en estado "${acc.status}". Hay que reconectarla.` };
        }
        return { ok: true, account: acc, token: decryptToken(acc.accessToken) };
    } catch (e) {
        return { ok: false, status: 'failed', reason: `No se pudo leer la cuenta: ${e.message}` };
    }
};

/**
 * Despacha UN job ya reclamado. Devuelve el estado en el que quedó.
 *
 * Un destino manual no llega nunca al proveedor: queda esperando a una persona.
 * La rama se decide por `publishesViaApi`, que es un campo declarado del
 * destino, no por el nombre del tipo.
 */
const dispatchJob = async (job, campaign, now = new Date()) => {
    if (!publishesViaApi(job.targetType)) {
        await finishJob(job.id, { status: 'awaiting_manual', error: null, errorCode: null });
        await logEvent({ campaignId: job.campaignId, jobId: job.id, kind: 'awaiting_manual',
            message: `${job.targetName || job.targetId}: listo para publicar a mano.` });
        return 'awaiting_manual';
    }

    const resolved = await resolveAccount(job.socialAccountId);
    if (!resolved.ok) {
        await finishJob(job.id, { status: resolved.status, error: resolved.reason, errorCode: null, retryable: false });
        await logEvent({ campaignId: job.campaignId, jobId: job.id, kind: 'error', message: resolved.reason });
        if (resolved.status === 'needs_reconnect') {
            await touchCampaign(job.campaignId, { status: 'paused', pausedReason: resolved.reason });
        }
        return resolved.status;
    }

    const content = {
        kind: campaign.content?.kind,
        message: job.message || '',
        link: job.linkUrl || campaign.content?.link || null,
        mediaUrl: job.mediaUrl || campaign.content?.mediaUrl || null,
    };

    let result;
    try {
        result = await publishContentToTarget({ account: resolved.account, decryptedToken: resolved.token, content });
    } catch (e) {
        result = { ok: false, error: e.message, network: true };
    }

    if (result.ok) {
        await finishJob(job.id, {
            // El instante lo manda el barrido, no el reloj de pared: es lo que
            // hace que el freno por hora y la hora publicada hablen del mismo
            // momento. En producción son el mismo valor; bajo prueba, no.
            status: 'published', publishedAt: now,
            externalId: result.externalId || null, externalUrl: result.externalUrl || null,
            error: null, errorCode: null, retryable: false,
        });
        await logEvent({ campaignId: job.campaignId, jobId: job.id, kind: 'published',
            message: `${job.targetName || job.targetId}: publicado.`, detail: { externalId: result.externalId } });
        return 'published';
    }

    // El error se guarda TEXTUAL y su CLASE decide el comportamiento.
    const verdict = classifyMetaError({
        code: result.code, subcode: result.subcode, message: result.error,
        httpStatus: result.httpStatus, network: result.network,
    });
    const limits = normalizeLimits(campaign.limits);
    // ⚠️ `job.attempts` YA viene incrementado por el reclamo: es el número de
    // intentos HECHOS. Sumarle uno más contaba un intento de más —recortaba la
    // cadena a dos en vez de tres— y hacía esperar 8 minutos donde tocaban 2.
    const reintenta = shouldRetry({ verdict, attempts: job.attempts, limits });

    if (reintenta) {
        const delay = retryDelayMinutes(job.attempts);
        await finishJob(job.id, {
            status: 'scheduled',
            scheduledAt: new Date(now.getTime() + delay * 60000),
            error: result.error, errorCode: String(result.code ?? verdict.kind), retryable: true,
        });
        await logEvent({ campaignId: job.campaignId, jobId: job.id, kind: 'retry',
            message: `${job.targetName || job.targetId}: ${result.error}. Se reintenta en ${delay} min.` });
    } else {
        await finishJob(job.id, {
            status: verdict.status, error: result.error,
            errorCode: String(result.code ?? verdict.kind), retryable: false,
        });
        await logEvent({ campaignId: job.campaignId, jobId: job.id, kind: 'error',
            message: `${job.targetName || job.targetId}: ${result.error}`, detail: { verdict: verdict.kind } });
    }

    // Un límite o un bloqueo por política no son cosa de un destino: paran la
    // campaña. Insistir ante un bloqueo es la conducta que Meta lee como abuso.
    if (verdict.pauseCampaign) {
        await touchCampaign(job.campaignId, {
            status: 'paused',
            pausedReason: verdict.reason,
            resumeAt: verdict.waitMinutes ? new Date(now.getTime() + verdict.waitMinutes * 60000) : null,
        });
        await logEvent({ campaignId: job.campaignId, kind: 'paused', message: verdict.reason });
    }
    return verdict.status;
};

/**
 * Una vuelta del barrido.
 *
 * Presupuesto de tiempo porque la función corta: se atienden los jobs que
 * quepan y el resto espera al minuto siguiente — no se pierden. Un corte mudo
 * se lee como "ya está todo", así que lo que queda pendiente se devuelve.
 */
export const advance = async ({ now = new Date(), timeBudgetMs = 45_000, campaignId = null, limit = 25 } = {}) => {
    const ready = await ensureDistributionSchema();
    if (!ready) return { ok: false, processed: 0, reason: 'esquema no disponible' };

    const started = Date.now();
    const t = nowOr(now);
    const params = [t];
    let sql = `
        SELECT j.*, c.content AS "campaignContent", c.limits AS "campaignLimits",
               c.status AS "campaignStatus", c."resumeAt" AS "campaignResumeAt"
          FROM "DistributionJob" j
          JOIN "DistributionCampaign" c ON c.id = j."campaignId"
         WHERE j.status IN ('scheduled','pending')
           AND j."scheduledAt" <= $1
           AND c.status NOT IN ('cancelled','paused','done','partial','failed')
           AND (c."resumeAt" IS NULL OR c."resumeAt" <= $1)`;
    if (campaignId) { params.push(campaignId); sql += ` AND j."campaignId" = $${params.length}`; }
    params.push(Math.min(100, Math.max(1, limit)));
    sql += ` ORDER BY j."scheduledAt" ASC LIMIT $${params.length}`;

    let due = [];
    try {
        const r = await db.query(sql, params);
        due = r.rows;
    } catch (e) {
        console.error('[distribution] advance/select:', e.message);
        return { ok: false, processed: 0, reason: e.message };
    }

    let processed = 0, pending = 0;
    const touched = new Set();
    // El conteo por hora es la misma pregunta para todos los jobs de una
    // campaña: se hace una vez por vuelta y se lleva en memoria mientras dura.
    const enLaHoraPorCampana = new Map();
    // El tope de concurrencia: cuántos destinos de la MISMA campaña salen en
    // esta pasada. Lo que no entra espera al minuto siguiente, no se pierde.
    const enEstaVuelta = new Map();

    for (const row of due) {
        if (Date.now() - started > timeBudgetMs) { pending = due.length - processed; break; }

        const limitsRaw = parseJson(row.campaignLimits) || {};
        const limits = normalizeLimits(limitsRaw);
        const tope = normalizeConcurrency(limitsRaw.concurrency);
        if ((enEstaVuelta.get(row.campaignId) || 0) >= tope) { pending++; continue; }
        // El freno por hora se comprueba contra lo que de verdad salió. Si se
        // llegó al tope, el job se corre en el tiempo — no se descarta.
        if (publishesViaApi(row.targetType)) {
            if (!enLaHoraPorCampana.has(row.campaignId)) {
                enLaHoraPorCampana.set(row.campaignId, await publishedLastHour(row.campaignId, t));
            }
            const enLaHora = enLaHoraPorCampana.get(row.campaignId);
            if (enLaHora >= limits.maxPerHour) {
                await finishJob(row.id, { scheduledAt: new Date(t.getTime() + 3600_000) });
                await logEvent({ campaignId: row.campaignId, jobId: row.id, kind: 'throttled',
                    message: `Tope de ${limits.maxPerHour} por hora alcanzado. Este destino se corre una hora.` });
                continue;
            }
        }

        // EL RECLAMO. Sobre `attempts`, que es un entero exacto: el driver de pg
        // trunca los microsegundos de un timestamp y una igualdad sobre
        // "updatedAt" no casaría nunca (v4.800). Dos vueltas leen el mismo valor
        // y sólo la que gana el UPDATE llega al proveedor.
        let claimed = null;
        try {
            const r = await db.query(
                `UPDATE "DistributionJob"
                    SET status = 'processing', attempts = attempts + 1, "updatedAt" = NOW()
                  WHERE id = $1 AND status = $2 AND attempts = $3
                  RETURNING *`,
                [row.id, row.status, row.attempts]
            );
            claimed = r.rows[0] || null;
        } catch (e) {
            console.error('[distribution] no se pudo reclamar el job:', e.message);
        }
        if (!claimed) continue; // otra vuelta se lo llevó

        const campaign = { content: parseJson(row.campaignContent), limits: parseJson(row.campaignLimits) };
        try {
            await dispatchJob(claimed, campaign, t);
        } catch (e) {
            // Una excepción inesperada no puede dejar el job en "processing"
            // para siempre: ahí se queda fuera del barrido y nadie lo retoma.
            console.error('[distribution] dispatch:', e.message);
            await finishJob(claimed.id, { status: 'failed', error: e.message, retryable: false }).catch(() => {});
        }
        // Lo que acaba de salir cuenta para el tope de la hora en esta misma
        // vuelta: sin esto, un barrido con 25 jobs se saltaría el límite entero.
        if (publishesViaApi(row.targetType)) {
            enLaHoraPorCampana.set(row.campaignId, (enLaHoraPorCampana.get(row.campaignId) || 0) + 1);
        }
        enEstaVuelta.set(row.campaignId, (enEstaVuelta.get(row.campaignId) || 0) + 1);
        processed++;
        touched.add(row.campaignId);
    }

    for (const id of touched) await refreshCampaignStatus(id);
    return { ok: true, processed, pending, elapsedMs: Date.now() - started };
};

// ── Controles ───────────────────────────────────────────────────────────────

export const pauseCampaign = async ({ campaignId, userId = null, reason = 'Pausada desde el panel.' }) => {
    await touchCampaign(campaignId, { status: 'paused', pausedReason: reason, resumeAt: null });
    await logEvent({ campaignId, kind: 'paused', message: reason, userId });
    return { ok: true };
};

export const resumeCampaign = async ({ campaignId, userId = null }) => {
    await touchCampaign(campaignId, { status: 'scheduled', pausedReason: null, resumeAt: null });
    await logEvent({ campaignId, kind: 'resumed', message: 'Reanudada desde el panel.', userId });
    return { ok: true };
};

/**
 * Cancelar detiene NUESTRA máquina de estados. Lo que ya salió, salió: no se
 * borra de Facebook ni se puede. La confirmación de la pantalla lo dice con
 * esas palabras — misma regla que cancelar un Reel.
 */
export const cancelCampaign = async ({ campaignId, userId = null }) => {
    try {
        await db.query(
            `UPDATE "DistributionJob" SET status = 'cancelled', "updatedAt" = NOW()
              WHERE "campaignId" = $1 AND status IN ('scheduled','pending','paused','awaiting_manual','rate_limited')`,
            [campaignId]
        );
        await touchCampaign(campaignId, { status: 'cancelled', resumeAt: null });
        await logEvent({ campaignId, kind: 'cancelled', message: 'Cancelada desde el panel.', userId });
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
};

/** Reintenta UN destino. Nunca la campaña entera: eso publicaría de nuevo en los que ya salieron. */
export const retryJob = async ({ jobId, clubId = null, isPlatform = false, userId = null }) => {
    try {
        const params = [jobId];
        let sql = `SELECT * FROM "DistributionJob" WHERE id = $1`;
        if (!isPlatform) { params.push(clubId); sql += ` AND "clubId" IS NOT DISTINCT FROM $2`; }
        const { rows } = await db.query(sql, params);
        const job = rows[0];
        if (!job) return { ok: false, reason: 'Ese destino no existe.' };
        if (job.status === 'published') return { ok: false, reason: 'Ese destino ya se publicó. Reintentar lo publicaría dos veces.' };
        await finishJob(jobId, { status: 'scheduled', scheduledAt: new Date(), error: null, errorCode: null, attempts: 0 });
        // Una campaña detenida por un fallo vuelve a correr al reintentar: si no,
        // el reintento no haría nada y parecería que el botón no funciona.
        await db.query(
            `UPDATE "DistributionCampaign" SET status = 'scheduled', "pausedReason" = NULL, "resumeAt" = NULL, "updatedAt" = NOW()
              WHERE id = $1 AND status IN ('paused','failed','partial','done')`,
            [job.campaignId]
        );
        await logEvent({ campaignId: job.campaignId, jobId, kind: 'retry_manual', message: 'Reintento pedido desde el panel.', userId });
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
};

/**
 * El modo asistido: una persona publicó en el grupo y lo registra.
 *
 * Esto NO llama a Meta —no hay a qué llamar— y por eso guarda quién lo dijo.
 * Sin ese dato el modo no aporta lo único que puede aportar, que es saber quién
 * publicó dónde y cuándo.
 */
export const markManualPublished = async ({ jobId, clubId = null, isPlatform = false, userId = null, userName = null, postUrl = null }) => {
    try {
        const params = [jobId];
        let sql = `SELECT * FROM "DistributionJob" WHERE id = $1`;
        if (!isPlatform) { params.push(clubId); sql += ` AND "clubId" IS NOT DISTINCT FROM $2`; }
        const { rows } = await db.query(sql, params);
        const job = rows[0];
        if (!job) return { ok: false, reason: 'Ese destino no existe.' };
        if (publishesViaApi(job.targetType)) {
            return { ok: false, reason: 'Ese destino lo publica la plataforma; no se marca a mano.' };
        }
        await finishJob(jobId, {
            status: 'published', publishedAt: new Date(),
            publishedBy: userName || userId || 'desconocido',
            externalUrl: postUrl || null, error: null,
        });
        await logEvent({ campaignId: job.campaignId, jobId, kind: 'published_manual',
            message: `${job.targetName || job.targetId}: publicado a mano por ${userName || userId || 'alguien'}.`, userId });
        // El grupo recuerda cuándo salió lo último: es la columna que el panel
        // muestra para saber a cuál no se le manda nada hace tiempo.
        await markPublished({ clubId: job.clubId, groupId: job.targetId, jobId });
        await refreshCampaignStatus(job.campaignId);
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
};

export default {
    createCampaign, getCampaign, listCampaigns, advance,
    pauseCampaign, resumeCampaign, cancelCampaign, retryJob, markManualPublished, logEvent,
};
