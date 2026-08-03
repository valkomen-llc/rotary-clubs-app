// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — AI TRACKER (barrido automático)
//
// El seguimiento no depende de que nadie tenga el panel abierto. Igual que en el
// Creador de Reels y en el CRM, el "trabajador" es un **Vercel Cron**, no un
// proceso persistente: en Vercel la función se congela al cerrar la respuesta,
// así que una cola con trabajador clásico exigiría infraestructura aparte.
//
// Reglas heredadas de esos dos módulos y válidas acá por los mismos motivos:
//
//  • **Presupuesto de tiempo.** La función corta a los 120 s. Se auditan los
//    sitios que quepan y el resto espera al barrido siguiente — no se pierden.
//  • **Un UPDATE condicional es lo que impide el trabajo doble.** Acá el
//    candado es `lastAuditAt`: se toma el sitio marcándolo antes de auditarlo,
//    así dos barridos simultáneos no auditan el mismo.
//  • **Lo que se recorta se DICE.** Un recorte callado se lee como "se revisó
//    todo".
//
// Cadencia: cada sitio se audita como mucho una vez cada `MIN_INTERVAL_HOURS`.
// Auditar más seguido no aporta —el contenido de un sitio institucional cambia
// en días, no en minutos— y multiplicaría el gasto de modelo por nada.
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';
import prisma from './prisma.js';
import { ensureSeoSchema } from './ensureSeoSchema.js';
import { auditSite } from './seoAudit.js';
import * as store from './seoStore.js';
import * as ai from './seoAI.js';

const MIN_INTERVAL_HOURS = Number(process.env.SEO_AUDIT_INTERVAL_HOURS || 24);

function hostOf(club) {
    return club.domain || (club.subdomain ? `${club.subdomain}.clubplatform.org` : null);
}

/**
 * Toma el siguiente sitio pendiente marcándolo en el acto.
 *
 * El `UPDATE ... WHERE lastAuditAt < corte RETURNING` es atómico: si dos
 * barridos coinciden, sólo uno recibe la fila. Sin eso, dos invocaciones del
 * cron —que Vercel puede solapar si una tarda— auditarían el mismo sitio y
 * gastarían el doble de llamadas al modelo.
 */
async function claimNextSite(cutoff) {
    const { rows } = await db.query(
        `UPDATE "SeoSiteConfig" SET "lastAuditAt" = now()
          WHERE "clubId" = (
              SELECT "clubId" FROM "SeoSiteConfig"
               WHERE "autoMode" = true
                 AND ("lastAuditAt" IS NULL OR "lastAuditAt" < $1)
               ORDER BY "lastAuditAt" NULLS FIRST
               LIMIT 1
               FOR UPDATE SKIP LOCKED
          )
          RETURNING "clubId"`,
        [cutoff],
    );
    return rows[0]?.clubId || null;
}

/**
 * Da de alta en el módulo los sitios activos que todavía no lo estén.
 *
 * Es ADITIVO e IDEMPOTENTE, como la siembra de recorridos del CRM: una vez
 * creada la fila es del administrador, y un despliegue no vuelve a tocarla. El
 * `autoMode` nace encendido porque el módulo sólo LEE y propone: no publica
 * nada por su cuenta.
 */
export async function enrollActiveSites({ limit = 200 } = {}) {
    await ensureSeoSchema();
    const clubs = await prisma.club.findMany({
        where: { status: 'active' },
        select: { id: true },
        take: limit,
    });
    if (!clubs.length) return { enrolled: 0 };
    const { rowCount } = await db.query(
        `INSERT INTO "SeoSiteConfig" ("clubId") SELECT unnest($1::text[])
         ON CONFLICT ("clubId") DO NOTHING`,
        [clubs.map(c => c.id)],
    );
    return { enrolled: rowCount || 0 };
}

/**
 * Una vuelta del tracker.
 *
 * Devuelve lo que hizo y lo que dejó pendiente. El campo `pending` no es
 * decorativo: es lo que permite ver desde fuera que el barrido va por detrás y
 * que hace falta subir la cadencia o el presupuesto.
 */
export async function sweepSeoAudits({ timeBudgetMs = 90_000, maxSites = 10, writeRecommendations = true } = {}) {
    await ensureSeoSchema();
    const startedAt = Date.now();
    const cutoff = new Date(Date.now() - MIN_INTERVAL_HOURS * 3600_000);
    const done = [];
    const failed = [];
    const notes = [];

    while (done.length + failed.length < maxSites) {
        if (Date.now() - startedAt > timeBudgetMs) {
            notes.push('Se agotó el presupuesto de tiempo del barrido; el resto de los sitios espera al minuto siguiente.');
            break;
        }
        const clubId = await claimNextSite(cutoff);
        if (!clubId) break;

        let auditRow = null;
        try {
            const club = await prisma.club.findUnique({ where: { id: clubId } });
            if (!club) { notes.push(`Sitio ${clubId} sin fila en Club; se saltea.`); continue; }
            const host = hostOf(club);
            if (!host) { notes.push(`${club.name}: sin dominio ni subdominio, no se puede auditar.`); continue; }

            auditRow = await store.startAudit(clubId, 'cron');
            const result = await auditSite(club, { host, maxPages: 150 });
            const saved = await store.saveIssues(auditRow.id, clubId, result.issues);
            await store.finishAudit(auditRow.id, {
                score: result.score, healthScore: result.healthScore,
                axisScores: result.axisScores, pagesScanned: result.pagesScanned,
                issuesCount: saved, criticalCount: result.criticalCount,
                summary: result.summary, notes: result.notes,
            });

            // El histórico se alimenta acá, con lo MEDIDO. Los indicadores que
            // dependen de Search Console no se rellenan: sin la integración
            // conectada no hay dato, y un cero sería una afirmación falsa.
            const today = new Date().toISOString().split('T')[0];
            await store.recordMetrics(clubId, [
                { date: today, source: 'internal', metric: 'seo_score', value: result.score, provenance: 'measured' },
                { date: today, source: 'internal', metric: 'health_score', value: result.healthScore, provenance: 'measured' },
                { date: today, source: 'internal', metric: 'issues_open', value: saved, provenance: 'measured' },
                { date: today, source: 'internal', metric: 'issues_critical', value: result.criticalCount, provenance: 'measured' },
                { date: today, source: 'internal', metric: 'pages_indexable', value: result.pagesScanned, provenance: 'measured' },
            ]);

            if (writeRecommendations && Date.now() - startedAt < timeBudgetMs * 0.7) {
                try {
                    const open = await store.listIssues(clubId, { auditId: auditRow.id, status: 'open', limit: 25 });
                    const config = await store.readSiteConfig(clubId);
                    const { texts } = await ai.writeRecommendations({ issues: open, club, config, max: 25 });
                    for (const iss of open) {
                        if (texts[iss.id]) await store.setIssueRecommendation(iss.id, texts[iss.id]);
                    }
                } catch (e) {
                    // La redacción es el adorno; el hallazgo es el trabajo. Si el
                    // modelo no responde, la auditoría ya quedó completa.
                    notes.push(`${club.name}: hallazgos guardados sin redactar (${e.message}).`);
                }
            }

            done.push({ clubId, name: club.name, score: result.score, issues: saved, critical: result.criticalCount });
        } catch (e) {
            if (auditRow) await store.failAudit(auditRow.id, e.message).catch(() => { });
            failed.push({ clubId, error: e.message });
        }
    }

    const { rows: pendingRows } = await db.query(
        `SELECT count(*)::int AS n FROM "SeoSiteConfig"
          WHERE "autoMode" = true AND ("lastAuditAt" IS NULL OR "lastAuditAt" < $1)`,
        [cutoff],
    );

    return {
        audited: done.length,
        failed: failed.length,
        pending: pendingRows[0]?.n ?? 0,
        elapsedMs: Date.now() - startedAt,
        sites: done,
        errors: failed,
        notes,
    };
}

export default { sweepSeoAudits, enrollActiveSites };
