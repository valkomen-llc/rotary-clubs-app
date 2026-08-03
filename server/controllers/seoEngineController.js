// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — API DEL PANEL
//
// AISLAMIENTO: cada endpoint resuelve el sitio con `resolveScope`, que toma el
// club del TOKEN salvo que quien pide sea administrador de plataforma. Ningún
// endpoint recibe un `clubId` del cliente y lo usa a secas — es el mismo
// criterio que el panel del asistente al evento: el aislamiento va en el
// `WHERE`, no en una comprobación posterior.
// ════════════════════════════════════════════════════════════════════════════

import prisma from '../lib/prisma.js';
import {
    ISSUES, SEVERITY_RANK, INTEGRATIONS, PAGE_KINDS, normalizePath, slugify,
} from '../lib/seoSpec.js';
import { auditSite } from '../lib/seoAudit.js';
import { resolvePage, siteOrigin, listSitePages, invalidateClubCache } from '../lib/seoEntities.js';
import { buildMetaSet } from '../lib/seoRender.js';
import { buildJsonLd } from '../lib/seoSchema.js';
import * as store from '../lib/seoStore.js';
import * as ai from '../lib/seoAI.js';
import { integrationStatus } from '../lib/seoIntegrations.js';

const PLATFORM_ROLES = ['super_admin', 'platform_admin', 'admin'];

async function resolveScope(req) {
    const isPlatform = PLATFORM_ROLES.includes(req.user?.role);
    const requested = req.query.clubId || req.body?.clubId;
    const clubId = isPlatform && requested ? String(requested) : req.user?.clubId;
    if (!clubId) return { error: 'La sesión no está asociada a ningún sitio.' };
    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) return { error: 'Sitio no encontrado.' };
    return { club, clubId, isPlatform };
}

// El host con el que se compone la dirección canónica. Se prefiere el dominio
// del sitio y no el del panel: el administrador puede estar en
// `app.clubplatform.org` auditando un sitio con dominio propio.
const hostOf = (club, req) => club?.domain
    || (club?.subdomain ? `${club.subdomain}.clubplatform.org` : null)
    || (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();

const fail = (res, e, where) => {
    console.error(`[seo-engine] ${where}:`, e);
    res.status(500).json({ error: e.message || 'Error interno del módulo SEO.' });
};

// ── Tablero ──────────────────────────────────────────────────────────────────
export const getOverview = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const { club, clubId } = scope;

        const [audit, history, config, keywords, issues] = await Promise.all([
            store.latestAudit(clubId),
            store.auditHistory(clubId, 30),
            store.readSiteConfig(clubId),
            store.listKeywords(clubId, { limit: 10 }),
            store.listIssues(clubId, { status: 'open', limit: 500 }),
        ]);

        const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const i of issues) bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;

        // El comparativo mensual sale del histórico de auditorías, no de otra
        // consulta: el dato ya está y derivarlo evita una segunda verdad.
        const previous = history.find(h => audit && h.id !== audit.id) || null;

        res.json({
            club: { id: club.id, name: club.name, domain: club.domain, subdomain: club.subdomain },
            origin: siteOrigin(club, hostOf(club, req)),
            audit: audit ? {
                id: audit.id,
                score: audit.score,
                healthScore: audit.healthScore,
                axisScores: audit.axisScores,
                pagesScanned: audit.pagesScanned,
                issuesCount: audit.issuesCount,
                criticalCount: audit.criticalCount,
                summary: audit.summary,
                notes: audit.notes,
                finishedAt: audit.finishedAt,
                trigger: audit.trigger,
            } : null,
            delta: (audit && previous) ? {
                score: audit.score - (previous.score ?? 0),
                healthScore: audit.healthScore - (previous.healthScore ?? 0),
                since: previous.finishedAt,
            } : null,
            history: history.map(h => ({
                date: h.finishedAt, score: h.score, healthScore: h.healthScore,
                issues: h.issuesCount, critical: h.criticalCount,
            })).reverse(),
            openIssues: { total: issues.length, bySeverity, autoFixable: issues.filter(i => i.autoFixable).length },
            topKeywords: keywords,
            autoMode: config.autoMode,
            lastAuditAt: config.lastAuditAt,
            integrations: await integrationStatus(config),
        });
    } catch (e) { fail(res, e, 'getOverview'); }
};

// ── Ejecutar la auditoría ────────────────────────────────────────────────────
export const runAudit = async (req, res) => {
    let auditRow = null;
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const { club, clubId } = scope;
        const host = hostOf(club, req);

        auditRow = await store.startAudit(clubId, req.body?.trigger || 'manual');
        const result = await auditSite(club, { host, maxPages: Number(req.body?.maxPages) || 250 });

        const saved = await store.saveIssues(auditRow.id, clubId, result.issues);

        await store.finishAudit(auditRow.id, {
            score: result.score,
            healthScore: result.healthScore,
            axisScores: result.axisScores,
            pagesScanned: result.pagesScanned,
            issuesCount: saved,
            criticalCount: result.criticalCount,
            summary: result.summary,
            notes: result.notes,
        });
        await store.touchAuditTimestamp(clubId);

        // La redacción con IA va DESPUÉS de guardar y no bloquea el resultado.
        // Si el proveedor no responde, la auditoría ya está completa y cada
        // hallazgo conserva la explicación de su regla.
        let written = 0;
        if (req.body?.writeRecommendations !== false) {
            try {
                const open = await store.listIssues(clubId, { auditId: auditRow.id, status: 'open', limit: 40 });
                const config = await store.readSiteConfig(clubId);
                const { texts } = await ai.writeRecommendations({ issues: open, club, config });
                for (const iss of open) {
                    const t = texts[iss.id];
                    if (t) { await store.setIssueRecommendation(iss.id, t); written++; }
                }
            } catch (e) {
                console.warn('[seo-engine] recomendaciones sin redactar:', e.message);
            }
        }

        res.json({
            auditId: auditRow.id,
            score: result.score,
            healthScore: result.healthScore,
            axisScores: result.axisScores,
            pagesScanned: result.pagesScanned,
            issuesCount: saved,
            criticalCount: result.criticalCount,
            summary: result.summary,
            notes: result.notes,
            recommendationsWritten: written,
        });
    } catch (e) {
        if (auditRow) await store.failAudit(auditRow.id, e.message).catch(() => { });
        fail(res, e, 'runAudit');
    }
};

// ── Hallazgos y Centro de Recomendaciones ────────────────────────────────────
export const getIssues = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });

        const rows = await store.listIssues(scope.clubId, {
            status: req.query.status || 'open',
            limit: Math.min(Number(req.query.limit) || 200, 500),
        });

        res.json(rows.map(r => {
            const spec = ISSUES[r.code] || {};
            return {
                ...r,
                label: spec.label || r.code,
                // Sin texto redactado se cae al porqué de la regla, que ya es
                // una explicación correcta. Nunca se deja el hueco vacío.
                recommendation: r.recommendation || spec.why || null,
                recommendationSource: r.recommendation ? 'ai' : 'rule',
                severityRank: SEVERITY_RANK[r.severity] || 0,
            };
        }));
    } catch (e) { fail(res, e, 'getIssues'); }
};

/**
 * Aplica un hallazgo automático.
 *
 * `autoFixable` es una PROMESA: si el catálogo dice que se puede resolver solo,
 * este endpoint tiene que resolverlo sin que nadie escriba nada. Un hallazgo
 * marcado como automático que devolviera "abrí el formulario" sería peor que
 * uno marcado como manual.
 */
export const applyIssue = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const { club, clubId } = scope;

        const rows = await store.listIssues(clubId, { status: 'all', limit: 500 });
        const issue = rows.find(r => r.id === req.params.id);
        if (!issue) return res.status(404).json({ error: 'Hallazgo no encontrado.' });
        if (!issue.autoFixable) {
            return res.status(400).json({ error: 'Este hallazgo se resuelve editando el contenido; no tiene arreglo automático.' });
        }

        const host = hostOf(club, req);
        const page = await resolvePage({ club, pathname: issue.path, host });
        const config = await store.readSiteConfig(clubId);

        const METADATA_CODES = new Set([
            'title_missing', 'title_too_short', 'title_too_long', 'title_duplicated',
            'description_missing', 'description_too_short', 'description_too_long',
            'description_duplicated', 'og_missing', 'og_duplicated', 'twitter_missing',
        ]);

        if (METADATA_CODES.has(issue.code)) {
            const keywords = (await store.listKeywords(clubId, { limit: 8 })).map(k => k.keyword);
            const out = await ai.composeMeta({ page, club, config, keywords });
            if (!out.meta) {
                return res.status(503).json({
                    error: 'No se pudo redactar el texto nuevo.',
                    detail: out.reason,
                    hint: 'Requiere una credencial de modelo configurada (OPENAI_API_KEY, ANTHROPIC_API_KEY o GEMINI_API_KEY).',
                });
            }
            const { saved, skippedManual } = await store.savePageMeta(clubId, issue.path, {
                kind: page.kind,
                title: out.meta.title,
                description: out.meta.description,
                keywords: out.meta.keywords,
            }, { source: 'ai', aiModel: out.model || out.provider });

            if (skippedManual) {
                return res.status(409).json({
                    error: 'Esta página tiene metadatos editados a mano y no se sobrescriben automáticamente.',
                    hint: 'Editala desde la ficha de la página si querés cambiarla.',
                });
            }
            await store.setIssueStatus(issue.id, 'fixed');
            return res.json({ applied: true, code: issue.code, saved, generated: out.meta, repaired: out.repaired === true });
        }

        if (issue.code === 'og_image_missing') {
            const image = config.defaultImage || club.logo;
            if (!image) {
                return res.status(400).json({
                    error: 'El sitio no tiene imagen por defecto ni logo.',
                    hint: 'Cargá una imagen por defecto en la configuración global del módulo.',
                });
            }
            await store.savePageMeta(clubId, issue.path, { kind: page.kind, image }, { source: 'ai' });
            await store.setIssueStatus(issue.id, 'fixed');
            return res.json({ applied: true, code: issue.code, image });
        }

        if (issue.code === 'canonical_fragment') {
            await store.savePageMeta(clubId, issue.path, {
                kind: page.kind,
                canonical: siteOrigin(club, host) + normalizePath(issue.path),
            }, { source: 'ai' });
            await store.setIssueStatus(issue.id, 'fixed');
            return res.json({ applied: true, code: issue.code });
        }

        if (issue.code === 'not_in_sitemap') {
            // El caso real detrás de este código es contenido sin slug. Se
            // propone la dirección legible; escribirla toca la fila del
            // contenido, así que se deja explícito qué cambiaría.
            const suggested = issue.evidence?.suggested;
            return res.json({
                applied: false, needsConfirmation: true, code: issue.code,
                suggestion: suggested,
                message: 'Cambiar la dirección de un contenido publicado rompe los enlaces que ya se compartieron. Se propone, no se aplica solo.',
            });
        }

        if (issue.code === 'robots_fragment_rule') {
            const cleaned = String(config.robotsExtra || '')
                .split('\n').filter(l => !l.includes('/#')).join('\n');
            await store.saveSiteConfig(clubId, { robotsExtra: cleaned });
            await store.setIssueStatus(issue.id, 'fixed');
            return res.json({ applied: true, code: issue.code });
        }

        if (issue.code === 'schema_missing' || issue.code === 'schema_wrong_type' || issue.code === 'breadcrumb_missing') {
            // Los datos estructurados los emite el servidor en cada petición a
            // partir de la entidad. Cuando faltan es porque a la entidad le
            // falta un dato que Schema.org exige — típicamente la fecha de un
            // evento — y eso no se puede rellenar sin inventarlo.
            return res.status(400).json({
                error: 'Los datos estructurados se generan solos; falta un dato en el contenido.',
                detail: issue.evidence?.reason || null,
            });
        }

        if (issue.code === 'alt_missing') {
            return res.json({
                applied: false, needsConfirmation: true, code: issue.code,
                message: 'Usá "Generar textos alternativos" en la ficha de la página: cada imagen se describe mirándola.',
                images: issue.evidence?.samples || [],
            });
        }

        return res.status(400).json({ error: `Sin acción automática definida para "${issue.code}".` });
    } catch (e) { fail(res, e, 'applyIssue'); }
};

export const ignoreIssue = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const rows = await store.listIssues(scope.clubId, { status: 'all', limit: 500 });
        if (!rows.find(r => r.id === req.params.id)) return res.status(404).json({ error: 'Hallazgo no encontrado.' });
        const updated = await store.setIssueStatus(req.params.id, req.body?.status === 'open' ? 'open' : 'ignored');
        res.json(updated);
    } catch (e) { fail(res, e, 'ignoreIssue'); }
};

// ── Inventario de páginas ────────────────────────────────────────────────────
export const getPages = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const { club, clubId } = scope;

        const [{ pages, notes, truncated }, overrides, issues] = await Promise.all([
            listSitePages(club, { limit: 1000 }),
            store.listPageMeta(clubId),
            store.listIssues(clubId, { status: 'open', limit: 500 }),
        ]);
        const byPath = new Map(overrides.map(o => [o.path, o]));
        const issuesByPath = issues.reduce((acc, i) => {
            (acc[i.path] ||= []).push({ code: i.code, severity: i.severity }); return acc;
        }, {});

        res.json({
            notes, truncated,
            pages: pages.map(p => {
                const o = byPath.get(p.path);
                return {
                    ...p,
                    hasOverride: Boolean(o),
                    source: o?.source || null,
                    title: o?.title || null,
                    description: o?.description || null,
                    indexable: o?.indexable ?? !PAGE_KINDS[p.kind]?.noindex,
                    issues: issuesByPath[p.path] || [],
                };
            }),
        });
    } catch (e) { fail(res, e, 'getPages'); }
};

/** Vista previa REAL: las mismas etiquetas que se van a servir, no una copia. */
export const getPagePreview = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const { club, clubId } = scope;

        const path = normalizePath(req.query.path || '/');
        const host = hostOf(club, req);
        const origin = siteOrigin(club, host);
        const [page, config, override] = await Promise.all([
            resolvePage({ club, pathname: path, host }),
            store.readSiteConfig(clubId),
            store.readPageMeta(clubId, path),
        ]);

        const meta = buildMetaSet({
            page, club, origin, config,
            overrides: override ? {
                title: override.title || undefined,
                description: override.description || undefined,
                image: override.image || undefined,
                canonical: override.canonical || undefined,
                keywords: override.keywords?.length ? override.keywords : undefined,
                indexable: override.indexable ?? undefined,
            } : {},
        });

        res.json({
            path, kind: page.kind, found: page.found, meta,
            jsonLd: buildJsonLd({ page, club, origin, config }),
            override,
            entity: page.entityType ? { type: page.entityType, id: page.entityId } : null,
        });
    } catch (e) { fail(res, e, 'getPagePreview'); }
};

export const savePage = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const path = normalizePath(req.body?.path || '/');

        const { saved } = await store.savePageMeta(scope.clubId, path, {
            kind: req.body.kind,
            title: req.body.title ?? null,
            description: req.body.description ?? null,
            image: req.body.image ?? null,
            canonical: req.body.canonical ?? null,
            keywords: Array.isArray(req.body.keywords) ? req.body.keywords : [],
            indexable: typeof req.body.indexable === 'boolean' ? req.body.indexable : null,
            priority: req.body.priority ?? null,
            changefreq: req.body.changefreq ?? null,
        }, { source: 'manual' });

        res.json(saved);
    } catch (e) { fail(res, e, 'savePage'); }
};

export const generatePageMeta = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const { club, clubId } = scope;

        const path = normalizePath(req.body?.path || '/');
        const host = hostOf(club, req);
        const [page, config, keywords] = await Promise.all([
            resolvePage({ club, pathname: path, host }),
            store.readSiteConfig(clubId),
            store.listKeywords(clubId, { limit: 8 }),
        ]);

        const out = await ai.composeMeta({ page, club, config, keywords: keywords.map(k => k.keyword) });
        if (!out.meta) {
            return res.status(503).json({
                error: 'No se pudo generar.', detail: out.reason,
                hint: 'Requiere una credencial de modelo configurada.',
            });
        }
        // Se DEVUELVE la propuesta; guardarla es un paso aparte y explícito.
        // Escribir sobre el sitio al pulsar "generar" quitaría la oportunidad de
        // mirar antes lo que se va a publicar.
        res.json({ path, proposal: out.meta, repaired: out.repaired === true, provider: out.provider, attempts: out.attempts });
    } catch (e) { fail(res, e, 'generatePageMeta'); }
};

export const generateAltText = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const out = await ai.composeAltText({
            imageUrl: req.body?.imageUrl,
            context: req.body?.context || '',
            club: scope.club,
        });
        if (!out.ok) return res.status(503).json({ error: out.reason });
        res.json(out);
    } catch (e) { fail(res, e, 'generateAltText'); }
};

// ── Palabras clave ───────────────────────────────────────────────────────────
export const getKeywords = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        res.json(await store.listKeywords(scope.clubId, { limit: 300 }));
    } catch (e) { fail(res, e, 'getKeywords'); }
};

export const suggestKeywords = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const { club, clubId } = scope;

        const [{ pages }, config] = await Promise.all([
            listSitePages(club, { limit: 200 }),
            store.readSiteConfig(clubId),
        ]);
        const out = await ai.suggestKeywords({ club, config, pages });
        if (!out.ok) return res.status(503).json({ error: out.reason });

        const saved = req.body?.save === false ? [] : await store.upsertKeywords(clubId, out.keywords);
        res.json({
            suggested: out.keywords, saved: saved.length, provider: out.provider,
            // La UI lo muestra junto a la tabla. No es un pie de página
            // decorativo: es lo que impide leer estos números como datos de
            // mercado.
            disclaimer: 'El volumen y la dificultad son estimaciones de un modelo, no datos de un proveedor de SEO. Las cifras reales de impresiones, clics y posición sólo llegan conectando Search Console.',
        });
    } catch (e) { fail(res, e, 'suggestKeywords'); }
};

export const saveKeyword = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const [row] = await store.upsertKeywords(scope.clubId, [{
            keyword: req.body?.keyword,
            kind: req.body?.kind,
            intent: req.body?.intent,
            volume: req.body?.volume ?? null,
            difficulty: req.body?.difficulty ?? null,
            competition: req.body?.competition ?? null,
            targetPath: req.body?.targetPath ?? null,
            priority: req.body?.priority ?? 0,
            notes: req.body?.notes ?? null,
            // Lo que escribe una persona no es una estimación del modelo.
            provenance: 'measured',
        }]);
        res.json(row);
    } catch (e) { fail(res, e, 'saveKeyword'); }
};

export const deleteKeyword = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        await store.deleteKeyword(scope.clubId, req.params.id);
        res.json({ deleted: true });
    } catch (e) { fail(res, e, 'deleteKeyword'); }
};

// ── Configuración global ─────────────────────────────────────────────────────
export const getConfig = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const config = await store.readSiteConfig(scope.clubId);
        res.json({ config, integrations: await integrationStatus(config), catalog: INTEGRATIONS });
    } catch (e) { fail(res, e, 'getConfig'); }
};

export const saveConfig = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        if (scope.error) return res.status(400).json({ error: scope.error });
        const { clubId, club } = scope;
        const patch = { ...(req.body?.config || {}) };
        delete patch.autoMode;
        const config = await store.saveSiteConfig(clubId, patch, { autoMode: req.body?.autoMode });
        // El <head> se sirve desde caché: sin esto, un cambio de imagen por
        // defecto tardaría un minuto en verse al compartir el enlace.
        invalidateClubCache(club.domain);
        res.json({ config });
    } catch (e) { fail(res, e, 'saveConfig'); }
};

export default {
    getOverview, runAudit, getIssues, applyIssue, ignoreIssue,
    getPages, getPagePreview, savePage, generatePageMeta, generateAltText,
    getKeywords, suggestKeywords, saveKeyword, deleteKeyword,
    getConfig, saveConfig,
};
