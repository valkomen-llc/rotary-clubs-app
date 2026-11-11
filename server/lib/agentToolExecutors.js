// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — ejecutores de las herramientas (v4.1316.0)
//
// Cada ejecutor recibe `(args, ctx)` con `ctx.siteId` resuelto por el RUNTIME
// desde la instalación. Ningún esquema del catálogo tiene `siteId`, y ninguna
// consulta de aquí lo toma de `args`: el alcance nunca lo decide el modelo.
//
// Las lecturas devuelven datos recortados (sin documentos completos ni
// teléfonos en bloque): lo justo para el hallazgo, con su id para verificarlo.
// `content_publish_news` sólo llega aquí desde una aprobación humana.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { reviewRegistrations, reviewSubmission, REGISTRATION_FINDING_LABELS, reviewFinance } from './agentRuntimeSpec.js';
import { searchKnowledgeForSite } from './agentMemory.js';

const safe = async (sql, params) => { try { return (await db.query(sql, params)).rows; } catch { return []; } };
const clamp = (n, lo, hi, d) => { const v = parseInt(n, 10); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

export const TOOL_EXECUTORS = {
    async site_context(args, ctx) {
        const [site] = await safe(`SELECT id, name, type, district, city, country, subdomain, domain FROM "Club" WHERE id::text = $1`, [ctx.siteId]);
        if (!site) return { ok: false, error: 'Sitio no encontrado.' };
        const news = await safe(`SELECT id, title, published, "createdAt" FROM "Post" WHERE "clubId" = $1 ORDER BY "createdAt" DESC LIMIT 5`, [ctx.siteId]);
        const projects = await safe(`SELECT COUNT(*)::int AS n FROM "Project" WHERE "clubId" = $1`, [ctx.siteId]);
        const events = await safe(`SELECT title, "startDate" FROM "CalendarEvent" WHERE "clubId" = $1 AND "startDate" >= NOW() - INTERVAL '7 days' ORDER BY "startDate" ASC LIMIT 5`, [ctx.siteId]);
        return { ok: true, site, recentNews: news, projectCount: projects[0]?.n ?? null, upcomingEvents: events };
    },

    async events_list(args, ctx) {
        const limit = clamp(args.limit, 1, 30, 15);
        const rows = await safe(
            `SELECT x."eventId", SUM(x.n)::int AS registrations, MAX(x.last) AS "lastRegistrationAt", e.title, e."startDate"
               FROM (
                 SELECT "eventId", COUNT(*) AS n, MAX("createdAt") AS last FROM "EventRegistration" WHERE "clubId" = $1 GROUP BY "eventId"
                 UNION ALL
                 SELECT "eventId", COUNT(*) AS n, MAX("createdAt") AS last FROM "EventCompletedRegistration" WHERE "clubId" = $1 GROUP BY "eventId"
               ) x LEFT JOIN "CalendarEvent" e ON e.id::text = x."eventId"
              GROUP BY x."eventId", e.title, e."startDate" ORDER BY MAX(x.last) DESC NULLS LAST LIMIT $2`,
            [ctx.siteId, limit]
        );
        return { ok: true, events: rows };
    },

    async events_registration_review(args, ctx) {
        const eventId = String(args.eventId || '');
        const [registrations, completed] = await Promise.all([
            safe(`SELECT id, "publicRef", "registrationCode", email, "documentNumber", "firstName", "lastName", phone, status, "totalAmount", currency, "paidAt", "stripePaymentIntentId", "receiptUrl", "createdAt"
                    FROM "EventRegistration" WHERE "eventId" = $1 AND "clubId" = $2`, [eventId, ctx.siteId]),
            safe(`SELECT id, "registrationCode", email, "documentNumber", "firstName", "lastName", phone, status, "paymentMethod", "receiptKey", "createdAt"
                    FROM "EventCompletedRegistration" WHERE "eventId" = $1 AND "clubId" = $2`, [eventId, ctx.siteId]),
        ]);
        const review = reviewRegistrations({ registrations, completed });
        const codeOf = new Map([...registrations, ...completed].map(r => [r.id, r.registrationCode || r.publicRef || null]));
        return {
            ok: true, eventId, total: review.total, active: review.active, counts: review.counts,
            labels: REGISTRATION_FINDING_LABELS,
            findings: review.findings.slice(0, 60).map(f => ({ ...f, code: codeOf.get(f.registrationId) || null })),
            truncated: review.findings.length > 60,
        };
    },

    async fair_submissions_list(args, ctx) {
        const limit = clamp(args.limit, 1, 100, 50);
        const rows = await safe(
            `SELECT id, "publicRef", "projectName", "clubName", district, status, "budgetUsd", "createdAt" FROM "ProjectFairSubmission"
              WHERE "clubId" = $1 ORDER BY "createdAt" DESC LIMIT $2`, [ctx.siteId, limit]);
        return { ok: true, submissions: rows };
    },

    async fair_submission_review(args, ctx) {
        const [s] = await safe(
            `SELECT id, "publicRef", "projectName", "projectDescription", "focusArea", "focusAreaLabel", "budgetUsd", "clubName", district, email, phone, status
               FROM "ProjectFairSubmission" WHERE id::text = $1 AND "clubId" = $2`, [String(args.submissionId || ''), ctx.siteId]);
        if (!s) return { ok: false, error: 'Postulación no encontrada en este sitio.' };
        const r = reviewSubmission(s);
        return { ok: true, review: r, project: { ref: s.publicRef, name: s.projectName, club: s.clubName, district: s.district, focusArea: s.focusAreaLabel || s.focusArea, budgetUsd: s.budgetUsd, descriptionExcerpt: String(s.projectDescription || '').slice(0, 600) } };
    },

    async content_recent(args, ctx) {
        const limit = clamp(args.limit, 1, 20, 8);
        return { ok: true, news: await safe(`SELECT id, title, published, "createdAt" FROM "Post" WHERE "clubId" = $1 ORDER BY "createdAt" DESC LIMIT $2`, [ctx.siteId, limit]) };
    },

    async seo_latest_audit(args, ctx) {
        const [a] = await safe(`SELECT id, status, score, "healthScore", "issuesCount", "criticalCount", "startedAt" FROM "SeoAudit" WHERE "clubId" = $1 ORDER BY "startedAt" DESC LIMIT 1`, [ctx.siteId]);
        if (!a) return { ok: true, audit: null, note: 'El sitio todavía no tiene una auditoría de SEO Inteligente.' };
        const issues = await safe(`SELECT path, code, axis, severity, impact FROM "SeoIssue" WHERE "auditId" = $1 AND "clubId" = $2 ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, impact DESC LIMIT 10`, [a.id, ctx.siteId]);
        return { ok: true, audit: a, topIssues: issues };
    },

    async knowledge_search(args, ctx) {
        const q = String(args.query || '').trim();
        if (q.length < 3) return { ok: false, error: 'Escribe qué buscar.' };
        const results = await searchKnowledgeForSite(ctx.siteId, q, { k: 6 });
        return { ok: true, results, note: results.length ? 'Cita la fuente (scope, source) de lo que uses.' : 'No hay conocimiento sobre eso en este sitio.' };
    },

    async finance_review(args, ctx) {
        const [unbalanced, orphanReversals, regs, fair] = await Promise.all([
            safe(`SELECT t.id, t.kind, l.currency, SUM(l.minor)::bigint AS total FROM "LedgerTransaction" t JOIN "LedgerLine" l ON l."transactionId" = t.id
                   WHERE t."clubId" = $1 GROUP BY t.id, t.kind, l.currency HAVING SUM(l.minor) <> 0 LIMIT 100`, [ctx.siteId]),
            safe(`SELECT t.id, t.reverses FROM "LedgerTransaction" t WHERE t."clubId" = $1 AND t.reverses IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM "LedgerTransaction" o WHERE o.id = t.reverses) LIMIT 100`, [ctx.siteId]),
            safe(`SELECT id, "publicRef" AS ref, status, "totalAmount" AS amount FROM "EventRegistration" WHERE "clubId" = $1 AND status IN ('paid', 'confirmed') AND COALESCE("totalAmount", 0) > 0
                   AND "paidAt" IS NULL AND "stripePaymentIntentId" IS NULL AND "receiptUrl" IS NULL LIMIT 100`, [ctx.siteId]),
            safe(`SELECT id, "publicRef" AS ref, status, COALESCE("amountCop", "amountUsd") AS amount FROM "ProjectFairSubmission" WHERE "clubId" = $1 AND status = 'paid'
                   AND "paidAt" IS NULL AND "stripePaymentIntentId" IS NULL LIMIT 100`, [ctx.siteId]),
        ]);
        const paidWithoutSupport = [...regs.map(r => ({ ...r, source: 'Inscripción a evento' })), ...fair.map(r => ({ ...r, source: 'Postulación de la Feria' }))];
        const findings = reviewFinance({ unbalanced, orphanReversals, paidWithoutSupport });
        return { ok: true, readOnly: true, findings, counts: { unbalanced: unbalanced.length, orphanReversals: orphanReversals.length, paidWithoutSupport: paidWithoutSupport.length } };
    },

    async content_create_news_draft(args, ctx) {
        const title = String(args.title || '').slice(0, 250).trim();
        const content = String(args.content || '').slice(0, 20000);
        if (!title || content.length < 40) return { ok: false, error: 'La noticia necesita título y un cuerpo de al menos 40 caracteres.' };
        const rows = await safe(
            `INSERT INTO "Post" (id, title, content, published, "clubId", category, "isAI", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, false, $3, 'noticias', true, NOW(), NOW()) RETURNING id, title, published`,
            [title, content, ctx.siteId]);
        if (!rows[0]) return { ok: false, error: 'No se pudo crear el borrador.' };
        return { ok: true, draft: rows[0], note: 'Borrador creado: una persona lo revisa y lo publica.' };
    },

    async content_publish_news(args, ctx) {
        if (!ctx.approved) return { ok: false, error: 'Publicar requiere aprobación humana.' };
        const rows = await safe(`UPDATE "Post" SET published = true, "updatedAt" = NOW() WHERE id::text = $1 AND "clubId" = $2 AND published = false RETURNING id, title`, [String(args.postId || ''), ctx.siteId]);
        if (!rows[0]) return { ok: false, error: 'No se encontró ese borrador en este sitio (o ya estaba publicado).' };
        return { ok: true, published: rows[0] };
    },
};
