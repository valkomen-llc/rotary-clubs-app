// ════════════════════════════════════════════════════════════════════════════
// Solicitud → artículo — la ORQUESTACIÓN — v4.1000
//
// El CRITERIO vive en `submissionArticleSpec.js` y es puro; acá está lo que
// necesita base, S3 y modelos. Mismo reparto que `contentSubmissionStore.js`
// frente a `contentSubmissionSpec.js`.
//
// ─── Cómo avanza ──────────────────────────────────────────────────────────
//
// `advanceArticle` ejecuta UNA etapa y suelta el reclamo. Tres vías lo llaman
// —el cron cada minuto, el sondeo de la ficha y el botón «Generar»— y el
// reclamo sobre `attempts` (entero exacto, v4.800) hace que sólo una ejecute
// la etapa. En Vercel la función se congela al cerrar la respuesta, así que
// no hay «segundo plano»: lo que no termina en una invocación lo retoma la
// siguiente, y por eso cada etapa es corta.
//
// ─── Lo que NUNCA hace ────────────────────────────────────────────────────
//
// - Publicar. El Post nace `published = false` y sólo `publishArticle` —una
//   acción con actor— lo pone en línea.
// - Hacer públicas las fotos. Siguen en el prefijo privado hasta que alguien
//   aprueba el material; el análisis las lee por el SDK y se las enseña al
//   modelo con un enlace firmado que caduca. Cuando se promueven, el Post
//   recibe sus URLs (`syncArticleMedia`) — sin copiar ningún archivo.
// - Inventar. Lo que la solicitud no dice se declara y el validador de
//   veracidad rechaza cifras, atribuciones y cuantificadores no suministrados.
// ════════════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import db from './db.js';
import { ensureSubmissionArticleSchema } from './ensureSubmissionArticleSchema.js';
import ensureContentSubmissionSchema from './ensureContentSubmissionSchema.js';
import { filesOf, clubsOf, postsOf, logEvent, transitionSubmission, promoteToLibrary, markUsage, getSubmission } from './contentSubmissionStore.js';
import { signedSubmissionUrl, readStagingObject, putStagingObject, deleteStagingObject } from './submissionFiles.js';
import { normalizeSubmissionsConfig, stateLabel as submissionStateLabel } from './contentSubmissionSpec.js';
import { ensureSubmissionFolder, adoptFilesIntoFolder, folderById } from './submissionMediaFolder.js';
import { describeSync, pendingFiles, syncPlan, folderPathLabel } from './submissionFolders.js';
import { generateArticleFromContext } from './articleGenerate.js';
import { routeToModel, getDefaultModel } from './ai-router.js';
import { generateCopy } from '../services/copywritingService.js';
import { inspectSourceImage } from './reelQuality.js';
import { LIMITS, stripHtml } from './seoSpec.js';
import { validateArticle, analyzeArticleBody } from './articleSpec.js';
import { checkSlug, freeSlug, articleUrl } from './postSlug.js';
import { isDistrictSiteType } from './districtSite.js';
import {
    STAGES, STAGE_MAX_TRIES, CLAIM_WINDOW_MIN, deriveWorkflowStatus, stageToRetry, isWorkingState,
    checkSubmissionReady, missingInfo, articleDepth, buildArticleContext, buildArticleExtraRules, readArticleExtras, excerptFor,
    veracityContextFor, checkArticleVeracity,
    mergeTags, fixedTagsFor, pickCategory, DEFAULT_CATEGORIES,
    dhashBits, markDuplicates, scoreImage, coverExcluded, pickCover, planGallery, isGalleryRole,
    SHEET_COLUMNS, SHEET_THUMB, buildSheetSystemPrompt, parseSheetAnalysis, altFallback, ALT_MAX,
    snapshotOf, diffSnapshots, REGENERABLE_SECTIONS, isRegenerableSection, splitIntro, originNote,
    canTransitionArticle, articleNeedsReason, articleStateLabel,
} from './submissionArticleSpec.js';

const WORKING = ['recibida', 'analizando', 'generando'];
const str = (v, max) => (v === null || v === undefined || v === '' ? null : String(v).trim().slice(0, max));
const nuevoId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

/** Apagado por entorno: `SUBMISSION_ARTICLES=off` deja de encolar. Lo que ya
 *  está en cola termina; lo que llegue no se genera solo. */
export const autoArticlesEnabled = () => String(process.env.SUBMISSION_ARTICLES || 'on').toLowerCase() !== 'off';

/** Y el envío automático a la Biblioteca: `SUBMISSION_ARTICLE_LIBRARY=off` lo
 *  apaga en toda la instalación. Apagado, el borrador nace sin portada y el
 *  botón de la ficha sigue estando — no se pierde la vía, se pierde el
 *  automatismo. */
export const autoLibraryEnabled = () => String(process.env.SUBMISSION_ARTICLE_LIBRARY || 'on').toLowerCase() !== 'off';

const ensureAll = async () => { await ensureContentSubmissionSchema(); await ensureSubmissionArticleSchema(); };

// ─── Lectura ───────────────────────────────────────────────────────────────

export async function articleOf(submissionId) {
    await ensureAll();
    const { rows } = await db.query(`SELECT * FROM "SubmissionArticle" WHERE "submissionId" = $1`, [submissionId]);
    return rows[0] || null;
}

/** Estado del artículo de VARIAS solicitudes, para la bandeja. DEGRADA a {}. */
export async function articlesFor(submissionIds = []) {
    const ids = (Array.isArray(submissionIds) ? submissionIds : []).filter(Boolean);
    if (!ids.length) return {};
    try {
        await ensureAll();
        const { rows } = await db.query(
            `SELECT "submissionId", id, status, "postId", "publicUrl", "publishedAt", "generatedAt" FROM "SubmissionArticle" WHERE "submissionId" = ANY($1)`,
            [ids]
        );
        return Object.fromEntries(rows.map(r => [r.submissionId, { id: r.id, status: r.status, postId: r.postId, publicUrl: r.publicUrl, publishedAt: r.publishedAt, generatedAt: r.generatedAt }]));
    } catch (e) {
        console.warn('[articles] estado degradado:', e.message);
        return {};
    }
}

/** De qué solicitud salió cada Post, para Noticias. DEGRADA a {}. */
export async function originsForPosts(postIds = []) {
    const ids = (Array.isArray(postIds) ? postIds : []).filter(Boolean);
    if (!ids.length) return {};
    try {
        await ensureAll();
        const { rows } = await db.query(
            // El recuento va en la MISMA consulta: una por fila dejaría el
            // listado de Noticias con una consulta por artículo.
            `SELECT a."postId", a.id, a.status, a."submissionId", a."campaignId", a."mediaFolderId", s.club, s."senderName", c.name AS "campaignName",
                    (SELECT COUNT(*)::int FROM "ContributionSubmissionFile" f
                      WHERE f."submissionId" = a."submissionId" AND f."mediaId" IS NULL) AS "pendingLibrary"
               FROM "SubmissionArticle" a
               LEFT JOIN "ContributionSubmission" s ON s.id = a."submissionId"
               LEFT JOIN "ContributionCampaign" c ON c.id = a."campaignId"
              WHERE a."postId" = ANY($1)`,
            [ids]
        );
        return Object.fromEntries(rows.map(r => [r.postId, {
            articleId: r.id, status: r.status, submissionId: r.submissionId, campaignId: r.campaignId,
            club: r.club, senderName: r.senderName, campaignName: r.campaignName,
            pendingLibrary: Number(r.pendingLibrary) || 0,
            // La carpeta de la Biblioteca, para que el selector de portada de
            // Noticias abra DENTRO del material del club en vez de en la
            // biblioteca entera. Vale `null` para lo anterior a v4.1004: esas
            // solicitudes reciben su carpeta en la primera sincronización.
            mediaFolderId: r.mediaFolderId || null,
        }]));
    } catch (e) {
        console.warn('[articles] origen degradado:', e.message);
        return {};
    }
}

export async function mediaOf(articleId) {
    const { rows } = await db.query(
        `SELECT m.*, f."s3Key", f."mediaId", f."mediaUrl", f.filename, f.bytes
           FROM "SubmissionArticleMedia" m
           LEFT JOIN "ContributionSubmissionFile" f ON f.id = m."fileId"
          WHERE m."articleId" = $1
          ORDER BY m."sortOrder", m."createdAt"`,
        [articleId]
    );
    return rows;
}

export async function postOf(postId) {
    if (!postId) return null;
    const { rows } = await db.query(`SELECT * FROM "Post" WHERE id = $1`, [postId]);
    return rows[0] || null;
}

export async function versionsOf(articleId) {
    const { rows } = await db.query(
        `SELECT id, kind, section, "changedFields", actor, "actorName", note, "createdAt"
           FROM "SubmissionArticleVersion" WHERE "articleId" = $1 ORDER BY "createdAt" DESC LIMIT 100`,
        [articleId]
    );
    return rows;
}

/** Los borradores listos que alcanza una sesión: es la NOTIFICACIÓN dentro de
 *  la plataforma. Se OBSERVA del estado, no se empuja (regla del CRM): un
 *  aviso que se deriva no se pierde si la función murió a mitad. */
export async function pendingDrafts(campaignIds, { limit = 20 } = {}) {
    try {
        await ensureAll();
        const params = [];
        let where = `a.status = 'borrador_listo'`;
        if (campaignIds !== null) {
            if (!Array.isArray(campaignIds) || !campaignIds.length) return { count: 0, items: [] };
            params.push(campaignIds.map(String));
            where += ` AND a."campaignId" = ANY($1::text[])`;
        }
        params.push(Math.min(Number(limit) || 20, 50));
        const { rows } = await db.query(
            `SELECT a.id, a."submissionId", a."campaignId", a."postId", a."generatedAt", a.generated->>'title' AS title,
                    s.club, s."senderName", c.name AS "campaignName",
                    COUNT(*) OVER() AS total
               FROM "SubmissionArticle" a
               LEFT JOIN "ContributionSubmission" s ON s.id = a."submissionId"
               LEFT JOIN "ContributionCampaign" c ON c.id = a."campaignId"
              WHERE ${where}
              ORDER BY a."generatedAt" DESC NULLS LAST
              LIMIT $${params.length}`,
            params
        );
        return { count: Number(rows[0]?.total) || 0, items: rows.map(r => ({ ...r, total: undefined })) };
    } catch (e) {
        console.warn('[articles] pendientes degradados:', e.message);
        return { count: 0, items: [] };
    }
}

// ─── Encolar ───────────────────────────────────────────────────────────────

/**
 * Crea la fila del workflow. `ON CONFLICT DO NOTHING` sobre `submissionId`: la
 * idempotencia es de la base. Devuelve la fila —nueva o la que ya estaba— y
 * `created` para que quien llama sepa cuál de las dos.
 */
export async function enqueueArticle({ submissionId, campaignId, clubId = null }) {
    await ensureAll();
    const { rows } = await db.query(
        `INSERT INTO "SubmissionArticle" (id, "submissionId", "campaignId", "clubId", status)
         VALUES ($1, $2, $3, $4, 'recibida')
         ON CONFLICT ("submissionId") DO NOTHING
         RETURNING *`,
        [nuevoId(), submissionId, campaignId, clubId]
    );
    if (rows[0]) {
        await logEvent({ submissionId, campaignId, type: 'article', detail: 'Artículo en cola: se genera solo.' });
        return { created: true, article: rows[0] };
    }
    return { created: false, article: await articleOf(submissionId) };
}

// ─── El reclamo ────────────────────────────────────────────────────────────

const claim = async (row) => {
    const { rows } = await db.query(
        `UPDATE "SubmissionArticle"
            SET attempts = attempts + 1, "claimedAt" = NOW(), "updatedAt" = NOW()
          WHERE id = $1 AND attempts = $2 AND status = ANY($3)
            AND ("claimedAt" IS NULL OR "claimedAt" < NOW() - ($4 || ' minutes')::interval)
          RETURNING *`,
        [row.id, row.attempts, WORKING, String(CLAIM_WINDOW_MIN)]
    );
    return rows[0] || null;
};

const release = async (id, patch = {}) => {
    const sets = ['"claimedAt" = NULL', '"updatedAt" = NOW()'];
    const params = [id];
    for (const [k, v] of Object.entries(patch)) {
        params.push(k === 'stages' || k === 'generated' || k === 'mediaPlan' ? JSON.stringify(v) : v);
        sets.push(`"${k}" = $${params.length}${['stages', 'generated', 'mediaPlan'].includes(k) ? '::jsonb' : ''}`);
    }
    const { rows } = await db.query(`UPDATE "SubmissionArticle" SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
    return rows[0];
};

// ─── Contexto compartido por las etapas ────────────────────────────────────

const loadContext = async (row) => {
    const { rows: sub } = await db.query(`SELECT * FROM "ContributionSubmission" WHERE id = $1`, [row.submissionId]);
    const submission = sub[0];
    if (!submission) throw new Error('La solicitud ya no existe.');
    submission.clubs = await clubsOf(submission.id);
    submission.posts = await postsOf(submission.id);
    const { rows: camp } = await db.query(`SELECT id, name, slug, content, "ownerClubId", "recipientClubId" FROM "ContributionCampaign" WHERE id = $1`, [row.campaignId]);
    const campaign = camp[0] || null;
    // La configuración de solicitudes de ESTA campaña: es la que decide si el
    // workflow manda las fotos a la Biblioteca por su cuenta. Leerla acá y no
    // dentro de la etapa evita una segunda consulta por vuelta.
    let submissionsConfig = null;
    try {
        const contenido = typeof campaign?.content === 'string' ? JSON.parse(campaign.content) : (campaign?.content || {});
        submissionsConfig = normalizeSubmissionsConfig(contenido?.submissions);
    } catch { submissionsConfig = null; }
    const clubId = row.clubId || submission.originClubId || campaign?.ownerClubId || campaign?.recipientClubId || null;
    let site = null;
    if (clubId) {
        const { rows: c } = await db.query(`SELECT id, name, domain, subdomain, type, "districtId", district FROM "Club" WHERE id = $1`, [clubId]);
        site = c[0] || null;
    }
    const files = await filesOf(submission.id);
    return { submission, campaign, clubId, site, files, submissionsConfig };
};

/** El host público del sitio: dominio propio, el del DISTRITO cuando el sitio
 *  es de un distrito (v4.744: ese dominio vive en la otra fila), o el
 *  subdominio de la plataforma. Sin ninguno, la ruta relativa. */
export async function publicHostFor(site) {
    if (!site) return '';
    if (site.domain) return site.domain;
    if (isDistrictSiteType(site.type)) {
        try {
            const { rows } = await db.query(
                `SELECT domain, subdomain FROM "District" WHERE id = $1 OR ($2::int IS NOT NULL AND number = $2::int) LIMIT 1`,
                [site.districtId || '', /^\d{4}$/.test(String(site.district || '').trim()) ? Number(site.district) : null]
            );
            if (rows[0]?.domain) return rows[0].domain;
            if (rows[0]?.subdomain) return `${rows[0].subdomain}.clubplatform.org`;
        } catch (e) { console.warn('[articles] dominio del distrito:', e.message); }
    }
    return site.subdomain ? `${site.subdomain}.clubplatform.org` : '';
}

export const publicUrlFor = async (site, post) => articleUrl(await publicHostFor(site), post?.slug || '') || `/blog/${post?.id || ''}`;

// ─── Las etapas ────────────────────────────────────────────────────────────

const stageValidar = async (row, ctx) => {
    const files = ctx.files.map(f => ({ ...f, accessible: true }));
    const juicio = checkSubmissionReady(ctx.submission, { files });
    if (!juicio.ok) throw new Error(juicio.errors.join(' '));
    if (!ctx.clubId) throw new Error('No se pudo determinar en qué sitio nace el artículo: la solicitud no llegó por el dominio de un sitio y la campaña no declara dueño ni beneficiario.');
    return {
        patch: { clubId: ctx.clubId },
        note: juicio.warnings.join(' ') || null,
        generated: { ...(row.generated || {}), validation: juicio, missingInfo: missingInfo(ctx.submission) },
    };
};

/** Lee los bytes de un archivo, esté en staging o ya en la Biblioteca. */
const bytesOf = async (f) => {
    if (f.mediaUrl) {
        try {
            const r = await fetch(f.mediaUrl, { signal: AbortSignal.timeout(15000) });
            if (r.ok) return Buffer.from(await r.arrayBuffer());
        } catch (e) { console.warn('[articles] no pude leer de la Biblioteca:', e.message); }
    }
    return readStagingObject(f.s3Key);
};

const measureImage = async (buffer) => {
    const sharp = (await import('sharp')).default;
    const base = sharp(buffer, { failOn: 'none' }).rotate();
    const meta = await base.metadata();
    const insp = await inspectSourceImage(buffer);
    const stats = await sharp(buffer, { failOn: 'none' }).rotate().greyscale().resize({ width: 256, withoutEnlargement: true }).stats();
    const gris = await sharp(buffer, { failOn: 'none' }).rotate().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
    return {
        width: meta.width || insp.width || null,
        height: meta.height || insp.height || null,
        sharpness: insp.sharpness,
        brightness: typeof stats.channels?.[0]?.mean === 'number' ? Number(stats.channels[0].mean.toFixed(1)) : null,
        hash: dhashBits(Array.from(gris)),
    };
};

const buildSheet = async (thumbs) => {
    const sharp = (await import('sharp')).default;
    const cols = SHEET_COLUMNS;
    const filas = Math.ceil(thumbs.length / cols);
    const gap = 12;
    const W = cols * SHEET_THUMB + (cols + 1) * gap;
    const H = filas * SHEET_THUMB + (filas + 1) * gap;
    const composite = thumbs.map((buf, i) => ({
        input: buf, left: gap + (i % cols) * (SHEET_THUMB + gap), top: gap + Math.floor(i / cols) * (SHEET_THUMB + gap),
    }));
    return sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
        .composite(composite).jpeg({ quality: 82 }).toBuffer();
};

const stageAnalizar = async (row, ctx) => {
    const sharp = (await import('sharp')).default;
    const imagenes = ctx.files.filter(f => f.kind === 'image');
    const videos = ctx.files.filter(f => f.kind === 'video');
    const medidas = [];
    const thumbs = [];
    const notas = [];
    for (const f of imagenes) {
        const buf = await bytesOf(f);
        if (!buf) { notas.push(`«${f.filename || f.id}» no se pudo leer.`); medidas.push({ fileId: f.id, kind: 'image', unreadable: true, sortOrder: f.sortOrder }); continue; }
        try {
            const m = await measureImage(buf);
            medidas.push({ fileId: f.id, kind: 'image', sortOrder: f.sortOrder, ...m });
            thumbs.push(await sharp(buf, { failOn: 'none' }).rotate().resize(SHEET_THUMB, SHEET_THUMB, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer());
        } catch (e) {
            notas.push(`«${f.filename || f.id}» no se pudo analizar: ${e.message}`);
            medidas.push({ fileId: f.id, kind: 'image', unreadable: true, sortOrder: f.sortOrder });
        }
    }

    // La VISIÓN: una sola llamada sobre la hoja de contacto. Si falla, se
    // decide sólo con lo medido y se dice.
    let vision = { ok: false, byIndex: new Map(), missing: [] };
    let visionNote = '';
    const legibles = medidas.filter(m => !m.unreadable);
    if (thumbs.length) {
        try {
            const hoja = await buildSheet(thumbs);
            const key = await putStagingObject({ campaignId: row.campaignId, name: `${row.id}.jpg`, body: hoja });
            const url = key ? await signedSubmissionUrl(key, { seconds: 600 }) : null;
            if (!url) throw new Error('no se pudo publicar la hoja de contacto para el modelo');
            const r = await generateCopy({
                system: buildSheetSystemPrompt(thumbs.length),
                userText: `Describí las ${thumbs.length} fotografías de la cuadrícula. Contexto de la actividad (no lo uses para inventar lo que no se ve): «${ctx.submission.title || ''}».`,
                imageUrl: url, jsonMode: true, maxTokens: 1800, temperature: 0.2,
            });
            vision = parseSheetAnalysis(r?.content ?? r?.text ?? r, thumbs.length);
            if (!vision.ok) visionNote = 'El modelo de visión no devolvió una lectura legible: la portada se eligió sólo con lo medido.';
            if (key) deleteStagingObject(key).catch(() => {});
        } catch (e) {
            visionNote = `Sin análisis de visión (${e.message}): la portada se eligió sólo con lo medido.`;
        }
    }

    // Lo descrito se pega a lo medido por POSICIÓN en la hoja, que es el
    // orden de `legibles`.
    const conVision = legibles.map((m, i) => ({ ...m, vision: vision.byIndex.get(i + 1) || null }));
    const conDup = markDuplicates(conVision);

    const filas = [];
    let idx = 0;
    for (const m of medidas) {
        idx++;
        const d = conDup.find(x => x.fileId === m.fileId) || m;
        const puntaje = m.unreadable ? { score: 0, reasons: ['no se pudo leer'] } : scoreImage(d);
        const motivo = m.unreadable ? 'no se pudo leer' : coverExcluded(d);
        filas.push({
            fileId: m.fileId, kind: 'image',
            role: d.vision?.role || 'secundaria',
            alt: d.vision?.alt || altFallback(ctx.submission, idx),
            caption: d.vision?.caption || null,
            score: puntaje.score,
            excluded: Boolean(motivo),
            excludedReason: motivo,
            analysis: {
                measured: { width: d.width ?? null, height: d.height ?? null, sharpness: d.sharpness ?? null, brightness: d.brightness ?? null, hash: d.hash || null, duplicateOf: d.duplicateOf || null },
                vision: d.vision || null,
                reasons: puntaje.reasons,
            },
            sortOrder: m.sortOrder ?? idx,
        });
    }
    for (const v of videos) {
        idx++;
        filas.push({ fileId: v.id, kind: 'video', role: 'video', alt: altFallback(ctx.submission, idx), caption: null, score: null, excluded: false, excludedReason: null, analysis: {}, sortOrder: v.sortOrder ?? idx });
    }

    for (const f of filas) {
        await db.query(
            `INSERT INTO "SubmissionArticleMedia" (id, "articleId", "submissionId", "fileId", kind, role, "sortOrder", excluded, "excludedReason", alt, caption, score, analysis)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
             ON CONFLICT ("articleId", "fileId") DO UPDATE SET
                role = EXCLUDED.role, "sortOrder" = EXCLUDED."sortOrder", excluded = EXCLUDED.excluded,
                "excludedReason" = EXCLUDED."excludedReason", alt = EXCLUDED.alt, caption = EXCLUDED.caption,
                score = EXCLUDED.score, analysis = EXCLUDED.analysis, "updatedAt" = NOW()`,
            [nuevoId(), row.id, row.submissionId, f.fileId, f.kind, f.role, f.sortOrder, f.excluded, str(f.excludedReason, 200), str(f.alt, ALT_MAX), str(f.caption, 160), f.score, JSON.stringify(f.analysis)]
        );
    }
    return {
        note: [visionNote, ...notas].filter(Boolean).join(' ') || null,
        mediaPlan: { ...(row.mediaPlan || {}), analyzed: filas.length, vision: vision.ok, visionNote: visionNote || null, notes: notas },
    };
};

const stagePortada = async (row) => {
    const media = await mediaOf(row.id);
    const eleccion = pickCover(media.map(m => ({
        fileId: m.fileId, kind: m.kind, score: m.score, sortOrder: m.sortOrder, excluded: m.excluded,
        sharpness: m.analysis?.measured?.sharpness, brightness: m.analysis?.measured?.brightness,
        duplicateOf: m.analysis?.measured?.duplicateOf, vision: m.analysis?.vision,
    })));
    await db.query(`UPDATE "SubmissionArticleMedia" SET "isCover" = ("fileId" = $2), role = CASE WHEN "fileId" = $2 THEN 'portada' WHEN role = 'portada' THEN 'secundaria' ELSE role END, "updatedAt" = NOW() WHERE "articleId" = $1`, [row.id, eleccion.cover || '']);
    return {
        note: eleccion.cover ? `Portada sugerida: ${eleccion.reason}${eleccion.weak ? ' (floja: conviene revisarla)' : ''}.` : 'Sin fotografías: el artículo sale sin portada.',
        mediaPlan: { ...(row.mediaPlan || {}), cover: eleccion.cover, coverScore: eleccion.score ?? null, coverReason: eleccion.reason, coverWeak: Boolean(eleccion.weak) },
    };
};

const stageMultimedia = async (row) => {
    const media = await mediaOf(row.id);
    const plan = planGallery(media.map(m => ({ fileId: m.fileId, kind: m.kind, role: m.role, score: m.score, sortOrder: m.sortOrder, excluded: m.excluded, sharpness: m.analysis?.measured?.sharpness, brightness: m.analysis?.measured?.brightness, duplicateOf: m.analysis?.measured?.duplicateOf, vision: m.analysis?.vision })), row.mediaPlan?.cover || null);
    for (const it of plan.items) {
        await db.query(`UPDATE "SubmissionArticleMedia" SET "sortOrder" = $3, excluded = $4, "updatedAt" = NOW() WHERE "articleId" = $1 AND "fileId" = $2`, [row.id, it.fileId, it.sortOrder, it.excluded]);
    }
    return { mediaPlan: { ...(row.mediaPlan || {}), blocks: plan.blocks, videos: plan.videos, gallery: plan.items.filter(i => !i.excluded).map(i => i.fileId) } };
};

const existingTaxonomy = async (clubId) => {
    try {
        const [c, t] = await Promise.all([
            db.query(`SELECT category, COUNT(*)::int n FROM "Post" WHERE "clubId" = $1 AND category IS NOT NULL AND category <> '' GROUP BY category ORDER BY n DESC LIMIT 40`, [clubId]),
            db.query(`SELECT tag, COUNT(*)::int n FROM (SELECT unnest(tags) AS tag FROM "Post" WHERE "clubId" = $1) x GROUP BY tag ORDER BY n DESC LIMIT 200`, [clubId]),
        ]);
        return { categories: c.rows.map(r => r.category), tags: t.rows.map(r => r.tag) };
    } catch (e) {
        console.warn('[articles] taxonomía degradada:', e.message);
        return { categories: [], tags: [] };
    }
};

const stageGenerar = async (row, ctx) => {
    const taxonomia = await existingTaxonomy(ctx.clubId);
    const context = buildArticleContext({ submission: ctx.submission, campaign: ctx.campaign, siteName: ctx.site?.name || '' });
    const veracidad = veracityContextFor(ctx.submission, ctx.campaign);
    const categorias = [...new Set([...taxonomia.categories, ...DEFAULT_CATEGORIES])];
    // Cuánto se le exige al cuerpo lo decide el material que trae la solicitud,
    // no una constante: un reportaje pedido sobre tres líneas se rellena, y
    // rellenar acá es inventar.
    const profundidad = articleDepth(ctx.submission);
    const r = await generateArticleFromContext({
        context,
        siteName: ctx.site?.name || '',
        depth: profundidad.depth,
        extra: buildArticleExtraRules({ categories: categorias, clubName: ctx.submission.club || '' }),
        check: async (article, data) => {
            const extras = readArticleExtras(data);
            const v = checkArticleVeracity({ title: article.title, body: article.body, excerpt: extras.excerpt }, veracidad);
            return v.issues;
        },
    });
    if (!r.ok) throw new Error(r.error);
    const extras = readArticleExtras(r.raw);
    const veracidadFinal = checkArticleVeracity({ title: r.article.title, body: r.article.body, excerpt: extras.excerpt }, veracidad);
    const generated = {
        ...(row.generated || {}),
        title: r.article.title,
        body: r.article.body,
        seoTitle: r.article.seoTitle,
        seoDescription: r.article.seoDescription,
        slug: r.article.slug,
        keywords: r.article.keywords,
        socialCopy: r.article.socialCopy,
        categoriesRaw: r.article.categories,
        excerpt: excerptFor(extras.excerpt, r.article.body),
        tagsRaw: extras.tags,
        categoryRaw: extras.category,
        suggestedCategoryRaw: extras.suggestedCategory,
        ogTitle: extras.ogTitle,
        ogDescription: extras.ogDescription,
        notProvided: extras.notProvided,
        copyIssues: veracidadFinal.issues,
        depth: profundidad.depth,
        depthReason: profundidad.reason,
        meta: r.meta,
        taxonomy: taxonomia,
    };
    const notas = [
        veracidadFinal.issues.length ? `El texto quedó con ${veracidadFinal.issues.length} aviso(s) de veracidad: revisalos antes de publicar.` : '',
        profundidad.reason,
    ].filter(Boolean);
    return { generated, patch: { generatedAt: new Date() }, note: notas.join(' ') || null };
};

const stageSeo = async (row, ctx) => {
    const g = row.generated || {};
    const tax = g.taxonomy || { categories: [], tags: [] };
    const cat = pickCategory({ proposed: g.categoryRaw || g.categoriesRaw?.[0] || '', suggested: g.suggestedCategoryRaw || '', existing: tax.categories });
    const tags = mergeTags({ proposed: [...(g.tagsRaw || []), ...(g.categoriesRaw || [])], existing: tax.tags, fixed: fixedTagsFor(ctx.submission, ctx.campaign) });
    let seoTitle = g.seoTitle || '', seoDescription = g.seoDescription || '', slug = g.slug || '', keywords = g.keywords || '';
    let ogTitle = g.ogTitle || '', ogDescription = g.ogDescription || '';
    const faltan = [];
    if (!seoTitle || seoTitle.length > LIMITS.title.hardMax) faltan.push('seo_titulo');
    if (!seoDescription || seoDescription.length > LIMITS.description.hardMax) faltan.push('seo_descripcion');
    if (faltan.length) {
        // Un segundo intento acotado a lo que falta: no se regenera el artículo.
        const r = await regenerateSeoFields({ title: g.title, body: g.body, siteName: ctx.site?.name || '' });
        if (r.ok) {
            seoTitle = r.seoTitle || seoTitle; seoDescription = r.seoDescription || seoDescription;
            slug = slug || r.slug; keywords = keywords || r.keywords;
        }
    }
    if (!ogTitle) ogTitle = seoTitle || g.title || '';
    if (!ogDescription) ogDescription = g.excerpt || seoDescription || '';
    const generated = { ...g, category: cat.category, categoryIsNew: cat.isNew, suggestedCategory: cat.suggested, tags, seoTitle, seoDescription, slug, keywords, ogTitle, ogDescription };
    if (!seoTitle || !seoDescription) {
        // La etapa es OPCIONAL: el borrador se crea igual y el SEO queda
        // pendiente, con su botón de reintento.
        return { generated, error: 'El modelo no devolvió un título o una descripción SEO válidos. El borrador se crea igual; el SEO se puede reintentar.' };
    }
    return { generated };
};

const stageBorrador = async (row, ctx) => {
    if (row.postId) return {};   // idempotente: el Post ya existe
    const g = row.generated || {};
    if (!g.title || !g.body) throw new Error('No hay texto generado para crear el borrador.');

    // La dirección: única en toda la plataforma (v4.873). Se libera con sufijo.
    let slug = null;
    try {
        const revision = checkSlug(g.slug || g.title);
        const base = revision.ok ? revision.slug : checkSlug(g.title).slug;
        if (base) {
            const { rows: parecidos } = await db.query(`SELECT slug FROM "Post" WHERE slug LIKE $1`, [`${base}%`]);
            slug = freeSlug(base, new Set(parecidos.map(p => p.slug).filter(Boolean)));
        }
    } catch (e) { console.warn('[articles] slug no resuelto:', e.message); }

    const postId = nuevoId();
    // ⚠️ published = FALSE, siempre. La publicación es humana.
    await db.query(
        `INSERT INTO "Post" (id, title, slug, content, image, published, category, tags, keywords, "seoTitle", "seoDescription", "seoImage",
                             "socialCopy", "ctaCopy", "videoUrl", images, "videoGallery", "isAI", "clubId", "targetClubIds", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,NULL,FALSE,$5,$6,$7,$8,$9,NULL,$10,'','','{}','{}',TRUE,$11,'{}',NOW(),NOW())`,
        [postId, g.title, slug, g.body, g.category || '', g.tags || [], g.keywords || '', g.seoTitle || '', g.seoDescription || '', g.ogDescription || g.socialCopy || '', ctx.clubId]
    );
    const post = await postOf(postId);
    await db.query(
        `INSERT INTO "SubmissionArticleVersion" (id, "articleId", "postId", kind, snapshot, "changedFields", actor, "actorName", note)
         VALUES ($1,$2,$3,'ai',$4::jsonb,$5,'ai_workflow','Workflow IA',$6)`,
        [nuevoId(), row.id, postId, JSON.stringify(snapshotOf(post)), Object.keys(snapshotOf(post)), originNote(row.submissionId)]
    );
    await logEvent({ submissionId: row.submissionId, campaignId: row.campaignId, type: 'article', detail: `Borrador de noticia generado: «${g.title}»`, reference: postId });
    return { patch: { postId, generatedAt: row.generatedAt || new Date() } };
};

/**
 * ⚠️ LA PORTADA Y LA GALERÍA LAS PONE EL WORKFLOW (v4.1002).
 *
 * Hasta v4.1001 el borrador nacía sin portada y con la galería vacía, y la
 * única salida era un botón que había que ir a pulsar a la ficha de la
 * solicitud. Se reportó con la pantalla delante: «NO QUEDAN LAS IMÁGENES DE
 * PORTADA Y LA GALERÍA MULTIMEDIA, DEBERÍAN QUEDAR EN EL WORKFLOW DE LA
 * AUTOMATIZACIÓN». Es una decisión de producto y supersede el texto de
 * v4.1000/v4.1001 sobre «entran al aprobar el material».
 *
 * NO es un segundo camino de promoción: llama al MISMO `sendMediaToLibrary`
 * que usan el botón del panel y publicar. Lo que cambia es QUIÉN lo dispara.
 *
 * La consecuencia se dice completa: promover COPIA los archivos al prefijo
 * público de la Biblioteca y mueve la solicitud a «aprobado» → «listo para
 * difusión», con el workflow como autor. El ARTÍCULO sigue naciendo
 * `published = FALSE`: la publicación sigue siendo humana y eso no se afloja.
 */
const stageBiblioteca = async (row, ctx) => {
    if (!row.postId) return { error: 'No hay borrador al que ponerle la portada.' };
    if (!autoLibraryEnabled()) return { note: 'Apagado por entorno (SUBMISSION_ARTICLE_LIBRARY=off): las fotos se envían a mano.' };
    if (ctx.submissionsConfig && ctx.submissionsConfig.autoLibrary === false) {
        return { note: 'Apagado en la campaña: las fotos se envían a mano desde la ficha.' };
    }

    // ⚠️ UNA DECISIÓN HUMANA NO SE PISA. El workflow aprueba lo que NADIE
    // decidió todavía; una solicitud que alguien mandó a «requiere info»,
    // descartó o archivó se deja como está y se DICE. `sendMediaToLibrary` no
    // lleva esta guardia a propósito: ahí quien decide es la persona que pulsa.
    const AUTO_APROBABLES = ['recibido', 'en_revision', 'aprobado', 'listo_difusion', 'publicado'];
    // Se relee: entre `loadContext` y esta etapa alguien pudo tocar la ficha, y
    // decidir con una lectura vieja es decidir sobre algo que ya no es.
    const solicitud = await getSubmission(row.campaignId, row.submissionId);
    if (!solicitud) return { error: 'La solicitud ya no existe.' };
    if (!AUTO_APROBABLES.includes(solicitud.status)) {
        return { note: `La solicitud está en «${submissionStateLabel(solicitud.status)}»: el workflow no pisa esa decisión. Las fotos se envían a mano desde la ficha.` };
    }

    const envio = await sendMediaToLibrary({
        campaignId: row.campaignId,
        row,
        submission: solicitud,
        clubIdForLibrary: ctx.clubId,
        actor: 'ai_workflow',
        actorName: 'Workflow IA',
    });
    if (!envio.ok) return { error: envio.detalle || 'No se pudo enviar el material a la Biblioteca.' };
    if (envio.reason === 'sin_archivos') return { note: 'La solicitud no trae archivos: el artículo sale sin portada ni galería.' };

    // Lo que no llegó se NOMBRA con su número: un «listo» sobre una promoción
    // a medias haría creer que están todas las fotos. La frase la arma
    // `describeSync`, la MISMA que ve quien sincroniza a mano — con dos
    // redacciones, la etapa diría una cosa y el panel otra sobre lo mismo.
    const cover = envio.sync?.cover ? 'con portada' : 'sin portada';
    const carpeta = envio.folder?.ok ? ` En «${envio.folder.path}».` : '';
    return { note: `${envio.report?.headline || 'Material sincronizado.'} ${cover}.${carpeta}` };
};

const RUNNERS = { validar: stageValidar, analizar: stageAnalizar, portada: stagePortada, multimedia: stageMultimedia, generar: stageGenerar, seo: stageSeo, borrador: stageBorrador, biblioteca: stageBiblioteca };

// ─── Avanzar ───────────────────────────────────────────────────────────────

/**
 * Ejecuta UNA etapa. Devuelve la fila actualizada y qué pasó. Nunca lanza:
 * corre dentro de un cron y dentro del sondeo de una pantalla.
 */
export async function advanceArticle(input) {
    let row = typeof input === 'string' ? await articleOf(input) : input;
    if (!row) return { ok: false, reason: 'sin_fila' };
    if (!isWorkingState(row.status)) return { ok: true, done: true, article: row };

    const derivado = deriveWorkflowStatus(row.stages || {});
    const etapa = derivado.nextStage ? STAGES.find(s => s.id === derivado.nextStage) : null;
    if (!etapa) {
        // Todas hechas (o las que faltan son opcionales fallidas): se cierra.
        const final = await release(row.id, { status: derivado.status, statusDetail: derivado.pending.length ? `Borrador generado — pendiente: ${derivado.pending.join(', ')}` : null, lastError: derivado.error || null });
        return { ok: true, done: true, article: final };
    }

    const reclamada = await claim(row);
    if (!reclamada) return { ok: true, busy: true, article: row };
    row = reclamada;

    const stages = { ...(row.stages || {}) };
    const previo = stages[etapa.id] || {};
    const tries = Number(previo.tries || 0) + 1;
    const estadoDeTrabajo = etapa.state;
    try {
        const ctx = await loadContext(row);
        const r = await RUNNERS[etapa.id](row, ctx) || {};
        stages[etapa.id] = { status: r.error ? 'error' : 'ok', tries, at: now(), note: r.note || null, error: r.error || null };
        const nuevoEstado = deriveWorkflowStatus(stages);
        const patch = { stages, status: nuevoEstado.status, lastError: null, ...(r.patch || {}) };
        if (r.generated) patch.generated = r.generated;
        if (r.mediaPlan) patch.mediaPlan = r.mediaPlan;
        if (nuevoEstado.status === 'borrador_listo') patch.statusDetail = nuevoEstado.pending.length ? `Borrador generado — pendiente: ${nuevoEstado.pending.join(', ')}` : null;
        else if (isWorkingState(nuevoEstado.status)) patch.statusDetail = STAGES.find(s => s.id === nuevoEstado.nextStage)?.label || null;
        const final = await release(row.id, patch);
        if (nuevoEstado.status === 'borrador_listo' && row.status !== 'borrador_listo') {
            await logEvent({ submissionId: row.submissionId, campaignId: row.campaignId, type: 'article', detail: 'Borrador listo para revisión.' });
            // Si el material ya estaba en la Biblioteca, las URLs entran al Post.
            await syncArticleMedia(row.submissionId).catch(() => {});
        }
        return { ok: true, article: final, stage: etapa.id, done: !isWorkingState(final.status) };
    } catch (e) {
        const agotado = tries >= STAGE_MAX_TRIES;
        stages[etapa.id] = { status: agotado ? 'error' : 'retry', tries, at: now(), error: String(e?.message || e).slice(0, 600) };
        const nuevoEstado = deriveWorkflowStatus(stages);
        const status = agotado ? nuevoEstado.status : estadoDeTrabajo;
        const final = await release(row.id, { stages, status, lastError: String(e?.message || e).slice(0, 600), statusDetail: agotado ? `Falló «${etapa.label}»: ${String(e?.message || e).slice(0, 200)}` : `Reintentando «${etapa.label}»` });
        if (final.status === 'error') await logEvent({ submissionId: row.submissionId, campaignId: row.campaignId, type: 'article', detail: `Falló la etapa ${etapa.id}: ${String(e?.message || e).slice(0, 300)}` });
        return { ok: false, article: final, stage: etapa.id, error: e?.message };
    }
}

/** Corre etapas hasta terminar o agotar el presupuesto. Para el cron. */
export async function runArticleUntilDone(submissionId, { budgetMs = 200000 } = {}) {
    const inicio = Date.now();
    let ultimo = null;
    for (let i = 0; i < STAGES.length + 2; i++) {
        if (Date.now() - inicio > budgetMs) break;
        ultimo = await advanceArticle(submissionId);
        if (!ultimo?.article || ultimo.done || ultimo.busy || !isWorkingState(ultimo.article.status)) break;
        if (ultimo.ok === false && ultimo.article.status === 'error') break;
    }
    return ultimo;
}

/**
 * El barrido del cron: lo que está en cola o a medias, lo más viejo primero,
 * dentro del presupuesto. Un artículo sin tocar en 6 horas deja de barrerse:
 * no es un workflow lento, es uno perdido, y se marca para que alguien lo vea.
 */
export async function sweepArticles({ budgetMs = 240000, windowHours = 6 } = {}) {
    await ensureAll();
    const inicio = Date.now();
    const { rows: viejos } = await db.query(
        `UPDATE "SubmissionArticle" SET status = 'error', "statusDetail" = 'Se quedó a medias más de ' || $1 || ' horas. Reintentar desde la ficha.', "claimedAt" = NULL, "updatedAt" = NOW()
          WHERE status = ANY($2) AND "updatedAt" < NOW() - ($1 || ' hours')::interval RETURNING id`,
        [String(windowHours), WORKING]
    );
    const { rows } = await db.query(
        `SELECT "submissionId" FROM "SubmissionArticle" WHERE status = ANY($1) AND ("claimedAt" IS NULL OR "claimedAt" < NOW() - ($2 || ' minutes')::interval) ORDER BY "updatedAt" ASC LIMIT 20`,
        [WORKING, String(CLAIM_WINDOW_MIN)]
    );
    const atendidos = [];
    for (const r of rows) {
        if (Date.now() - inicio > budgetMs) break;
        const res = await runArticleUntilDone(r.submissionId, { budgetMs: budgetMs - (Date.now() - inicio) });
        atendidos.push({ submissionId: r.submissionId, status: res?.article?.status || null });
    }
    return { ok: true, attended: atendidos, expired: viejos.length, pending: Math.max(0, rows.length - atendidos.length) };
}

// ─── Multimedia: del archivo al Post ───────────────────────────────────────

/**
 * Escribe en el Post las URLs de los archivos ya PROMOVIDOS, en el orden del
 * plan. No copia ningún archivo: lee `mediaUrl` de la fila del archivo. La
 * portada sólo se pisa si el Post no tiene una elegida a mano.
 */
export async function syncArticleMedia(submissionId, { forceCover = false } = {}) {
    const row = await articleOf(submissionId);
    if (!row?.postId) return { ok: false, reason: 'sin_post' };
    const media = await mediaOf(row.id);
    const post = await postOf(row.postId);
    if (!post) return { ok: false, reason: 'sin_post' };
    const incluidas = media.filter(m => !m.excluded && m.mediaUrl);
    const imagenes = incluidas.filter(m => m.kind === 'image').map(m => m.mediaUrl);
    const videos = incluidas.filter(m => m.kind === 'video').map(m => m.mediaUrl);
    const portada = media.find(m => m.isCover && m.mediaUrl)?.mediaUrl || imagenes[0] || null;
    const urlsConocidas = new Set(media.map(m => m.mediaUrl).filter(Boolean));
    // ⚠️ SÓLO SE PISA LA PORTADA QUE ESCRIBIMOS NOSOTROS (v4.1003). Hasta
    // v4.1002 también se pisaba cualquier portada que fuera UNA FOTO DE LA
    // SOLICITUD, y eso incluye la que acaba de elegir una persona: desde que
    // el editor de Noticias ofrece ese material (v4.1003), elegir una de esas
    // fotos es el caso NORMAL, y la siguiente sincronización la revertía sin
    // decir nada. `coverSynced` responde la pregunta exacta —«¿esta portada la
    // puso el workflow?»— y el Post nace con `image = NULL`, así que la
    // primera vez entra por el primer término. Un hueco no pisa nada.
    // `forceCover` es la excepción declarada: una persona acaba de decir «usá
    // ésta de portada» desde el selector. Obedecerla no es pisar, es hacer lo
    // que pidió — y sin esto su elección no se aplicaría cuando la portada
    // anterior también la había puesto ella.
    const pisarPortada = forceCover || !post.image || row.mediaPlan?.coverSynced === post.image;
    await db.query(
        `UPDATE "Post" SET images = $2, "videoGallery" = $3, image = CASE WHEN $4::boolean THEN $5 ELSE image END,
                "seoImage" = CASE WHEN "seoImage" IS NULL OR "seoImage" = '' OR "seoImage" = ANY($6) THEN $5 ELSE "seoImage" END, "updatedAt" = NOW()
          WHERE id = $1`,
        [post.id, imagenes, videos, pisarPortada, portada, [...urlsConocidas]]
    );
    await db.query(`UPDATE "SubmissionArticle" SET "mediaPlan" = "mediaPlan" || $2::jsonb, "updatedAt" = NOW() WHERE id = $1`, [row.id, JSON.stringify({ coverSynced: portada, syncedAt: now(), syncedImages: imagenes.length, syncedVideos: videos.length })]);
    return { ok: true, images: imagenes.length, videos: videos.length, cover: portada, pendingFiles: media.filter(m => !m.mediaUrl && !m.excluded).length };
}

/** Lo que una persona decide sobre la galería: portada, orden, ALT, exclusión. */
export async function updateArticleMedia({ row, items = [], actor = null, actorName = null }) {
    const media = await mediaOf(row.id);
    const porFile = new Map(media.map(m => [m.fileId, m]));
    let portada = null;
    for (const it of items) {
        const m = porFile.get(String(it.fileId));
        if (!m) continue;
        const role = isGalleryRole(it.role) ? it.role : m.role;
        if (it.isCover === true && m.kind === 'image') portada = m.fileId;
        await db.query(
            `UPDATE "SubmissionArticleMedia" SET role = $3, "sortOrder" = $4, excluded = $5, alt = COALESCE($6, alt), caption = COALESCE($7, caption), "updatedAt" = NOW()
              WHERE "articleId" = $1 AND "fileId" = $2`,
            [row.id, m.fileId, role, Number.isFinite(Number(it.sortOrder)) ? Number(it.sortOrder) : m.sortOrder, it.excluded === true, str(it.alt, ALT_MAX), str(it.caption, 160)]
        );
    }
    if (portada) {
        await db.query(`UPDATE "SubmissionArticleMedia" SET "isCover" = ("fileId" = $2), "updatedAt" = NOW() WHERE "articleId" = $1`, [row.id, portada]);
        await db.query(`UPDATE "SubmissionArticle" SET "mediaPlan" = "mediaPlan" || $2::jsonb, "updatedAt" = NOW() WHERE id = $1`, [row.id, JSON.stringify({ cover: portada, coverReason: 'elegida a mano', coverWeak: false })]);
    }
    await logEvent({ submissionId: row.submissionId, campaignId: row.campaignId, type: 'article', detail: 'Portada o galería ajustadas a mano.', actor, actorName });
    const sync = await syncArticleMedia(row.submissionId, { forceCover: Boolean(portada) });
    return { ok: true, sync };
}

// ─── Estado editorial ──────────────────────────────────────────────────────

export async function transitionArticle({ row, to, reason = '', actor = null, actorName = null }) {
    if (row.status === to) return { ok: true, article: row, sinCambio: true };
    if (!canTransitionArticle(row.status, to)) return { ok: false, reason: 'transicion_invalida', detalle: `No se puede pasar de «${articleStateLabel(row.status)}» a «${articleStateLabel(to)}».` };
    if (articleNeedsReason(to) && !String(reason || '').trim()) return { ok: false, reason: 'falta_motivo', detalle: `Para dejarlo en «${articleStateLabel(to)}» hay que escribir el motivo.` };
    if (to === 'recibida') {
        // Reintentar desde el error: sólo se limpia la etapa fallida.
        const stages = { ...(row.stages || {}) };
        const etapa = stageToRetry(stages);
        if (etapa) delete stages[etapa];
        const { rows } = await db.query(`UPDATE "SubmissionArticle" SET status = 'recibida', stages = $2::jsonb, "statusDetail" = NULL, "lastError" = NULL, "claimedAt" = NULL, "updatedAt" = NOW() WHERE id = $1 AND status = $3 RETURNING *`, [row.id, JSON.stringify(stages), row.status]);
        if (!rows[0]) return { ok: false, reason: 'cambio_concurrente', detalle: 'Alguien cambió el estado mientras mirabas. Recargá.' };
        return { ok: true, article: rows[0] };
    }
    const sellos = to === 'aprobado' ? ', "approvedAt" = COALESCE("approvedAt", NOW())' : '';
    const { rows } = await db.query(
        `UPDATE "SubmissionArticle" SET status = $2, "statusDetail" = $3, "updatedAt" = NOW()${sellos} WHERE id = $1 AND status = $4 RETURNING *`,
        [row.id, to, str(reason, 1000), row.status]
    );
    if (!rows[0]) return { ok: false, reason: 'cambio_concurrente', detalle: 'Alguien cambió el estado mientras mirabas. Recargá.' };
    await logEvent({ submissionId: row.submissionId, campaignId: row.campaignId, type: 'article', fromState: row.status, toState: to, detail: str(reason, 1000), actor, actorName });
    return { ok: true, article: rows[0] };
}

/** Reintenta UNA etapa sin regenerar las demás. */
export async function retryArticleStage({ row, stage = '' }) {
    const stages = { ...(row.stages || {}) };
    const etapa = stageToRetry(stages, stage);
    if (!etapa) return { ok: false, reason: 'nada_que_reintentar' };
    delete stages[etapa];
    // Las etapas posteriores que dependen de ésta se limpian también: el SEO
    // depende del texto; el borrador, de los dos. Las anteriores no se tocan.
    const idx = STAGES.findIndex(s => s.id === etapa);
    for (const s of STAGES.slice(idx + 1)) if (stages[s.id]?.status !== 'ok' || (etapa === 'generar' && s.id === 'seo')) delete stages[s.id];
    const { rows } = await db.query(
        `UPDATE "SubmissionArticle" SET status = $2, stages = $3::jsonb, "statusDetail" = NULL, "lastError" = NULL, "claimedAt" = NULL, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
        [row.id, STAGES[idx].state, JSON.stringify(stages)]
    );
    const r = await advanceArticle(rows[0]);
    // Un reintento de SEO o de análisis sobre un borrador que YA existe tiene
    // que escribir lo que faltaba en el Post, sin pisar lo humano.
    if (r.ok && rows[0].postId && (etapa === 'seo' || etapa === 'multimedia' || etapa === 'portada')) await fillMissingPostFields(r.article).catch(() => {});
    return r;
}

/** Sólo los campos VACÍOS del Post se completan con lo regenerado. */
async function fillMissingPostFields(row) {
    if (!row?.postId) return;
    const g = row.generated || {};
    await db.query(
        `UPDATE "Post" SET "seoTitle" = CASE WHEN COALESCE("seoTitle",'') = '' THEN $2 ELSE "seoTitle" END,
                "seoDescription" = CASE WHEN COALESCE("seoDescription",'') = '' THEN $3 ELSE "seoDescription" END,
                keywords = CASE WHEN COALESCE(keywords,'') = '' THEN $4 ELSE keywords END,
                category = CASE WHEN COALESCE(category,'') = '' THEN $5 ELSE category END,
                tags = CASE WHEN COALESCE(array_length(tags,1),0) = 0 THEN $6 ELSE tags END,
                "updatedAt" = NOW()
          WHERE id = $1`,
        [row.postId, g.seoTitle || '', g.seoDescription || '', g.keywords || '', g.category || '', g.tags || []]
    );
    await syncArticleMedia(row.submissionId).catch(() => {});
}

// ─── Publicar ──────────────────────────────────────────────────────────────

/**
 * ⚠️ EL MATERIAL A LA BIBLIOTECA — UN SOLO CAMINO, ALCANZABLE DESDE EL ARTÍCULO.
 *
 * Las fotos de una solicitud nacen en el prefijo PRIVADO y sólo la aprobación
 * las copia al público (v4.968): eso es estructural y no se afloja. Lo que
 * faltaba era poder hacerlo desde donde está el artículo — hasta v4.1000 el
 * borrador se entregaba sin portada y sin galería, con un aviso que decía que
 * las fotos entran «al aprobar el material» y ningún botón que lo hiciera. Se
 * reportó, con razón, como «las imágenes no se ubican en la portada ni se
 * envían a la biblioteca multimedia»: el aviso va JUNTO al botón que lo
 * dispara (regla de v4.798), y sin botón el aviso es un callejón.
 *
 * Es la MISMA secuencia de «Aprobar y enviar a Biblioteca» —transición →
 * `promoteToLibrary` → `syncArticleMedia`—, no una segunda: la comparten
 * publicar y la acción del panel del artículo. Un segundo camino de promoción
 * se separaría del primero en silencio.
 */
export async function sendMediaToLibrary({ campaignId, row, submission = null, clubIdForLibrary = null, fileIds = null, actor = null, actorName = null }) {
    const r = await syncSubmissionLibrary({
        campaignId,
        submissionId: row.submissionId,
        submission,
        clubId: clubIdForLibrary || row.clubId,
        fileIds, actor, actorName,
    });
    return r;
}

/**
 * ⚠️ EL ÚNICO CAMINO DEL MATERIAL A LA BIBLIOTECA (v4.1004).
 *
 * Lo comparten las CUATRO vías que existen —la etapa del workflow, el botón
 * del panel del artículo, el selector de Noticias y publicar—, y lo comprueba
 * una prueba que cuenta las llamadas a `promoteToLibrary`. Un segundo camino
 * de promoción se separaría del primero en silencio, que es la lección que
 * este módulo lleva escrita desde v4.1001.
 *
 * La secuencia es:
 *
 *   1. CARPETA. «Solicitudes de contenido / [nombre]» dentro de la Biblioteca
 *      del sitio, resuelta POR ID. Va primero porque el `folderId` viaja en el
 *      mismo INSERT de `Media`: escribirlo después dejaría una ventana con el
 *      archivo suelto en la raíz.
 *   2. APROBAR. Sólo si la solicitud todavía no lo estaba — la aprobación es
 *      lo que hace público el archivo, y eso no se afloja.
 *   3. PROMOVER. Idempotente por archivo: lo que ya tiene `mediaId` se saltea.
 *   4. ACOMODAR. Los que YA estaban en la Biblioteca de antes de v4.1004 caen
 *      en su carpeta sin volver a copiar un byte — sólo se llena la columna
 *      vacía, nunca se pisa una carpeta que alguien eligió a mano.
 *   5. ATAR EL ARTÍCULO a la misma carpeta y escribirle las URLs al Post.
 *
 * ⚠️ NO REGENERA EL ARTÍCULO NI TOCA UNA EDICIÓN HUMANA. No escribe título,
 * cuerpo, SEO, categoría ni etiquetas: lo único que toca del Post son
 * `images`, `videoGallery` y —bajo la guardia de `pisarPortada`— `image`. Es
 * lo que permite ofrecerlo como «Sincronizar archivos con Biblioteca» sobre
 * una solicitud vieja cuyo artículo alguien ya editó.
 *
 * NUNCA lanza: corre dentro del cron y dentro del sondeo de una pantalla.
 */
export async function syncSubmissionLibrary({ campaignId, submissionId, submission = null, clubId = null, fileIds = null, actor = null, actorName = null }) {
    let s = submission || await getSubmission(campaignId, submissionId);
    if (!s) return { ok: false, reason: 'sin_solicitud', detalle: 'La solicitud ya no existe.' };

    const row = await articleOf(submissionId);
    const sitio = clubId || row?.clubId || s.originClubId || null;

    // 1. La carpeta. Un fallo acá NO detiene la promoción: los archivos tienen
    //    que llegar a la Biblioteca igual, aunque queden en la raíz y se
    //    acomoden en la siguiente vuelta.
    const carpeta = await ensureSubmissionFolder({ submission: s, clubId: sitio, createdBy: actor });
    const folderId = carpeta.ok ? carpeta.folder.id : null;
    if (row && folderId && row.mediaFolderId !== folderId) {
        await db.query(`UPDATE "SubmissionArticle" SET "mediaFolderId" = $2, "updatedAt" = NOW() WHERE id = $1`, [row.id, folderId]).catch(() => {});
    }

    const files = await filesOf(submissionId);
    const plan = syncPlan(files);
    if (!plan.total) {
        return { ok: true, promotion: null, sync: null, folder: carpeta, reason: 'sin_archivos', detalle: 'La solicitud no trae archivos.', report: describeSync({ total: 0 }) };
    }

    // 4 (para lo que ya estaba). Se pide SIEMPRE: no copia nada y es lo que
    //    ordena las solicitudes anteriores a v4.1004.
    const acomodados = await adoptFilesIntoFolder(plan.inLibrary, folderId);

    if (plan.nothingToPromote) {
        // Ya estaban todos: se sincroniza igual — el Post puede haberse creado
        // después de la promoción y quedarse sin las URLs.
        const sync = row ? await syncArticleMedia(submissionId) : null;
        return {
            ok: true, promotion: null, sync, folder: carpeta, adopted: acomodados.moved, reason: 'ya_estaban',
            report: describeSync({ total: plan.total, already: plan.total }),
            pending: [],
        };
    }

    // 2. Aprobar.
    if (!['aprobado', 'listo_difusion', 'publicado'].includes(s.status)) {
        const paso = await transitionSubmission({ campaignId, id: s.id, to: 'aprobado', actor, actorName });
        if (!paso.ok) return { ok: false, reason: paso.reason, detalle: paso.detalle || 'No se pudo aprobar el material de la solicitud.', folder: carpeta };
        s = paso.submission;
    }

    // 3. Promover, con la carpeta en el mismo INSERT.
    const promotion = await promoteToLibrary({ campaignId, submission: s, clubId: sitio, folderId, fileIds, actor, actorName });
    const yaEstaban = (promotion.files || []).filter(f => f.mediaId).length - promotion.promovidos;
    const report = describeSync({
        total: promotion.total,
        promoted: promotion.promovidos,
        already: Math.max(0, yaEstaban),
        failed: (promotion.files || []).filter(f => !f.mediaId).length,
    });
    const pending = pendingFiles(promotion.files || []);

    // ⚠️ UN ARCHIVO QUE FALLA NO CANCELA EL ARTÍCULO (requisito 17). Sólo se
    // devuelve `ok:false` cuando NINGUNO llegó: ahí no hay nada que poner en
    // la portada y decir que sí lo habría.
    if (promotion.fallidos && !promotion.promovidos && !plan.inLibrary.length) {
        return { ok: false, reason: 'biblioteca', detalle: report.headline, promotion, folder: carpeta, report, pending };
    }

    const fresca = await getSubmission(campaignId, s.id);
    if (promotion.promovidos > 0 && fresca?.status === 'aprobado') await transitionSubmission({ campaignId, id: s.id, to: 'listo_difusion', actor, actorName });

    // Lo recién promovido ya nació con su carpeta; esto alcanza a lo que
    // estuviera suelto de antes.
    const acomodadosFinal = acomodados.moved + (await adoptFilesIntoFolder((promotion.files || []).map(f => f.mediaId).filter(Boolean), folderId)).moved;

    const sync = row ? await syncArticleMedia(submissionId) : null;
    return { ok: true, promotion, sync, folder: carpeta, adopted: acomodadosFinal, report, pending };
}

/** La carpeta de una solicitud, para pintarla sin volver a resolverla. */
export async function articleFolder(row) {
    if (!row?.mediaFolderId) return null;
    const f = await folderById(row.mediaFolderId);
    if (!f) return null;
    const raiz = f.parentId ? await folderById(f.parentId) : null;
    return { id: f.id, name: f.name, parentId: f.parentId, path: folderPathLabel(f.name, raiz?.name) };
}


/**
 * «Aprobar» o «Aprobar y publicar». Publicar exige que el material esté en
 * la Biblioteca: si no lo está, se promueve por el MISMO camino que «Aprobar
 * y enviar a Biblioteca» —transición + `promoteToLibrary`—, nunca por uno
 * propio. Después el Post recibe sus URLs y recién entonces `published`.
 */
export async function publishArticle({ campaignId, row, publish = true, clubIdForLibrary = null, actor = null, actorName = null }) {
    if (!row?.postId) return { ok: false, reason: 'sin_borrador', detalle: 'Todavía no hay un borrador que publicar.' };
    const post = await postOf(row.postId);
    if (!post) return { ok: false, reason: 'sin_post', detalle: 'El borrador ya no existe en Noticias.' };
    const submission = await getSubmission(campaignId, row.submissionId);
    if (!submission) return { ok: false, reason: 'sin_solicitud' };

    // Aprobar el artículo (si no lo estaba).
    if (!['aprobado', 'publicado'].includes(row.status)) {
        const paso = await transitionArticle({ row, to: 'aprobado', actor, actorName });
        if (!paso.ok) return paso;
        row = paso.article;
    }
    if (!publish) return { ok: true, article: row, published: false };

    // El material a la Biblioteca, por el MISMO camino que la acción del panel.
    const envio = await sendMediaToLibrary({ campaignId, row, submission, clubIdForLibrary, actor, actorName });
    if (!envio.ok) return { ok: false, reason: envio.reason, detalle: envio.reason === 'biblioteca' ? 'Ningún archivo llegó a la Biblioteca; el artículo no se publicó.' : envio.detalle };
    const promocion = envio.promotion;
    const sync = envio.sync;

    await db.query(`UPDATE "Post" SET published = TRUE, "updatedAt" = NOW() WHERE id = $1`, [post.id]);
    const final = await afterPublished({ row, post: await postOf(post.id), actor, actorName, note: 'Aprobado y publicado desde la solicitud' });
    return { ok: true, article: final, published: true, promotion: promocion, sync, publicUrl: final.publicUrl };
}

/** Lo que pasa cuando el Post queda en línea, venga por donde venga. */
async function afterPublished({ row, post, actor = null, actorName = null, note = 'Publicado' }) {
    let site = null;
    if (row.clubId) {
        const { rows } = await db.query(`SELECT id, name, domain, subdomain, type, "districtId", district FROM "Club" WHERE id = $1`, [row.clubId]);
        site = rows[0] || null;
    }
    const url = await publicUrlFor(site, post);
    const { rows } = await db.query(
        `UPDATE "SubmissionArticle" SET status = 'publicado', "publishedAt" = COALESCE("publishedAt", NOW()), "publicUrl" = $2, "statusDetail" = NULL, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
        [row.id, url]
    );
    await db.query(
        `INSERT INTO "SubmissionArticleVersion" (id, "articleId", "postId", kind, snapshot, "changedFields", actor, "actorName", note) VALUES ($1,$2,$3,'human',$4::jsonb,'{published}',$5,$6,$7)`,
        [nuevoId(), row.id, post.id, JSON.stringify(snapshotOf(post)), actor, actorName, note]
    );
    await markUsage({ campaignId: row.campaignId, submissionId: row.submissionId, channel: 'web', reference: `post:${post.id}`, detail: `Artículo publicado: ${url}`, actor, actorName });
    try {
        const s = await getSubmission(row.campaignId, row.submissionId);
        if (s?.status === 'listo_difusion') await transitionSubmission({ campaignId: row.campaignId, id: s.id, to: 'publicado', actor, actorName });
    } catch (e) { console.warn('[articles] estado de la solicitud tras publicar:', e.message); }
    await logEvent({ submissionId: row.submissionId, campaignId: row.campaignId, type: 'article', detail: `Artículo publicado: ${url}`, reference: `post:${post.id}`, actor, actorName });
    return rows[0];
}

/**
 * El hook desde Noticias: cada edición humana deja versión, y publicar o
 * despublicar desde ahí mueve el workflow. NUNCA lanza — corre dentro de
 * `updatePost` y un fallo acá no puede impedir guardar una noticia.
 */
export async function onPostUpdated({ before, after, actor = null, actorName = null }) {
    try {
        if (!after?.id) return;
        await ensureAll();
        const { rows } = await db.query(`SELECT * FROM "SubmissionArticle" WHERE "postId" = $1`, [after.id]);
        const row = rows[0];
        if (!row) return;
        const cambios = diffSnapshots(snapshotOf(before), snapshotOf(after));
        if (cambios.length) {
            await db.query(
                `INSERT INTO "SubmissionArticleVersion" (id, "articleId", "postId", kind, snapshot, "changedFields", actor, "actorName", note) VALUES ($1,$2,$3,'human',$4::jsonb,$5,$6,$7,$8)`,
                [nuevoId(), row.id, after.id, JSON.stringify(snapshotOf(after)), cambios, actor, actorName, 'Editado en Noticias']
            );
        }
        if (Boolean(before?.published) !== Boolean(after.published)) {
            if (after.published && row.status !== 'publicado') await afterPublished({ row, post: after, actor, actorName, note: 'Publicado desde Noticias' });
            if (!after.published && row.status === 'publicado') {
                await db.query(`UPDATE "SubmissionArticle" SET status = 'aprobado', "statusDetail" = 'Despublicado desde Noticias', "updatedAt" = NOW() WHERE id = $1`, [row.id]);
                await logEvent({ submissionId: row.submissionId, campaignId: row.campaignId, type: 'article', detail: 'Artículo despublicado desde Noticias.', actor, actorName });
            }
        }
    } catch (e) {
        console.warn('[articles] hook de Noticias:', e.message);
    }
}

// ─── Duplicar, versiones, regenerar ────────────────────────────────────────

/** Otro Post copiado del principal. La fila del workflow sigue apuntando al
 *  principal: una solicitud tiene UN artículo principal. */
export async function duplicateArticle({ row, actor = null, actorName = null }) {
    const post = await postOf(row.postId);
    if (!post) return { ok: false, reason: 'sin_post' };
    const id = nuevoId();
    let slug = null;
    try {
        const base = checkSlug(post.slug || post.title).slug;
        const { rows } = await db.query(`SELECT slug FROM "Post" WHERE slug LIKE $1`, [`${base}%`]);
        slug = base ? freeSlug(base, new Set(rows.map(r => r.slug).filter(Boolean))) : null;
    } catch { slug = null; }
    await db.query(
        `INSERT INTO "Post" (id, title, slug, content, image, published, category, tags, keywords, "seoTitle", "seoDescription", "seoImage", "socialCopy", "ctaCopy", "videoUrl", images, "videoGallery", "isAI", "clubId", "targetClubIds", "createdAt", "updatedAt")
         SELECT $1, title || ' (copia)', $2, content, image, FALSE, category, tags, keywords, "seoTitle", "seoDescription", "seoImage", "socialCopy", "ctaCopy", "videoUrl", images, "videoGallery", "isAI", "clubId", '{}', NOW(), NOW() FROM "Post" WHERE id = $3`,
        [id, slug, post.id]
    );
    await logEvent({ submissionId: row.submissionId, campaignId: row.campaignId, type: 'article', detail: 'Se duplicó el artículo a mano (borrador aparte).', reference: `post:${id}`, actor, actorName });
    return { ok: true, postId: id };
}

export async function restoreVersion({ row, versionId, actor = null, actorName = null }) {
    const { rows } = await db.query(`SELECT * FROM "SubmissionArticleVersion" WHERE id = $1 AND "articleId" = $2`, [versionId, row.id]);
    const v = rows[0];
    if (!v || !row.postId) return { ok: false, reason: 'no_existe' };
    const s = v.snapshot || {};
    const post = await postOf(row.postId);
    await db.query(
        `UPDATE "Post" SET title = COALESCE($2, title), content = COALESCE($3, content), category = COALESCE($4, category), tags = COALESCE($5, tags),
                keywords = COALESCE($6, keywords), "seoTitle" = COALESCE($7, "seoTitle"), "seoDescription" = COALESCE($8, "seoDescription"),
                "seoImage" = COALESCE($9, "seoImage"), "socialCopy" = COALESCE($10, "socialCopy"), image = COALESCE($11, image),
                images = COALESCE($12, images), "videoGallery" = COALESCE($13, "videoGallery"), "updatedAt" = NOW()
          WHERE id = $1`,
        [row.postId, s.title, s.content, s.category, s.tags, s.keywords, s.seoTitle, s.seoDescription, s.seoImage, s.socialCopy, s.image, s.images, s.videoGallery]
    );
    const nuevo = await postOf(row.postId);
    await db.query(
        `INSERT INTO "SubmissionArticleVersion" (id, "articleId", "postId", kind, snapshot, "changedFields", actor, "actorName", note) VALUES ($1,$2,$3,'restaurada',$4::jsonb,$5,$6,$7,$8)`,
        [nuevoId(), row.id, row.postId, JSON.stringify(snapshotOf(nuevo)), diffSnapshots(snapshotOf(post), snapshotOf(nuevo)), actor, actorName, `Restaurada la versión del ${new Date(v.createdAt).toLocaleString('es-CO')}`]
    );
    return { ok: true, post: nuevo };
}

const modelJson = async (system, user, { maxTokens = 1500 } = {}) => {
    const slug = (await getDefaultModel()) || 'gemini-2.5-flash';
    const raw = await routeToModel(slug, system, user, [], { maxTokens });
    const limpio = String(raw || '').replace(/```(?:json)?/gi, '').trim();
    try { return JSON.parse(limpio); } catch {
        const m = limpio.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('El modelo no devolvió JSON.');
        return JSON.parse(m[0]);
    }
};

const SEO_SYSTEM = `Sos el editor SEO de una publicación institucional de Rotary. Respondé ÚNICAMENTE con JSON:
{"seo_titulo":"entre ${LIMITS.title.min} y ${LIMITS.title.max} caracteres, sin el nombre del sitio","seo_descripcion":"entre ${LIMITS.description.min} y ${LIMITS.description.max} caracteres, con un motivo para hacer clic","keywords":"hasta 8 separadas por coma","slug":"url-en-minusculas-con-guiones"}
Usá sólo lo que dice el artículo. No inventes cifras ni lugares.`;

async function regenerateSeoFields({ title, body, siteName = '' }) {
    try {
        const data = await modelJson(SEO_SYSTEM, `Sitio: ${siteName}\nTítulo: ${title}\n\nArtículo:\n${stripHtml(String(body || '')).slice(0, 4000)}`, { maxTokens: 800 });
        const seoTitle = String(data?.seo_titulo || '').trim().slice(0, LIMITS.title.hardMax);
        const seoDescription = String(data?.seo_descripcion || '').trim().slice(0, LIMITS.description.hardMax);
        return { ok: Boolean(seoTitle && seoDescription), seoTitle, seoDescription, keywords: String(data?.keywords || '').trim().slice(0, 300), slug: String(data?.slug || '').trim().slice(0, 120) };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * Regenera UNA sección y devuelve la PROPUESTA. No escribe el Post salvo
 * `apply: true`: una regeneración no puede pisar una edición humana en
 * silencio. Con `apply`, deja versión «regenerada».
 */
export async function regenerateSection({ row, section, apply = false, actor = null, actorName = null }) {
    if (!isRegenerableSection(section)) return { ok: false, reason: 'seccion_desconocida' };
    const post = await postOf(row.postId);
    if (!post) return { ok: false, reason: 'sin_post' };
    const ctx = await loadContext(row);
    const context = buildArticleContext({ submission: ctx.submission, campaign: ctx.campaign, siteName: ctx.site?.name || '' });
    const veracidad = veracityContextFor(ctx.submission, ctx.campaign);
    const cuerpoTexto = stripHtml(String(post.content || ''));
    let proposal = {};
    const warnings = [];

    if (section === 'titulo') {
        const data = await modelJson(`Sos el redactor jefe de un club Rotary. Proponé un titular periodístico NUEVO, distinto del actual, entre ${LIMITS.title.min} y ${LIMITS.title.max} caracteres, que nombre al club y la acción concreta. Sin inventar datos. Respondé ÚNICAMENTE con JSON: {"titulo":"..."}`, `Contexto:\n${context}\n\nTitular actual: ${post.title}\n\nArtículo:\n${cuerpoTexto.slice(0, 3000)}`, { maxTokens: 300 });
        const t = String(data?.titulo || '').trim();
        if (!t) throw new Error('El modelo no devolvió un titular.');
        if (t.length > LIMITS.title.hardMax) warnings.push(`El titular tiene ${t.length} caracteres y el máximo es ${LIMITS.title.max}.`);
        const v = checkArticleVeracity({ title: t }, veracidad);
        warnings.push(...v.issues);
        proposal = { title: t };
    } else if (section === 'introduccion') {
        const data = await modelJson(`Sos el redactor jefe de un club Rotary. Reescribí SÓLO el primer párrafo del artículo: 40-60 palabras, responde qué pasó, quién, dónde (si se sabe) y para quién. HTML de un solo <p>. Sin inventar datos. Respondé ÚNICAMENTE con JSON: {"introduccion":"<p>...</p>"}`, `Contexto:\n${context}\n\nArtículo actual:\n${String(post.content || '').slice(0, 5000)}`, { maxTokens: 500 });
        const intro = String(data?.introduccion || '').trim();
        if (!/^<p[\s>]/i.test(intro)) throw new Error('El modelo no devolvió un párrafo HTML.');
        const { rest } = splitIntro(post.content || '');
        const v = checkArticleVeracity({ body: intro }, veracidad);
        warnings.push(...v.issues);
        proposal = { content: `${intro}\n${rest}`.trim(), intro };
    } else if (section === 'extracto') {
        const data = await modelJson(`Sos el redactor jefe de un club Rotary. Escribí un extracto de 1 o 2 frases, entre 120 y 300 caracteres, sin hashtags ni exclamaciones, que resuma el artículo sin inventar. Respondé ÚNICAMENTE con JSON: {"extracto":"..."}`, `Artículo:\n${cuerpoTexto.slice(0, 4000)}`, { maxTokens: 300 });
        const e = excerptFor(String(data?.extracto || ''), post.content);
        const v = checkArticleVeracity({ excerpt: e }, veracidad);
        warnings.push(...v.issues);
        proposal = { seoDescription: e.slice(0, LIMITS.description.hardMax), excerpt: e };
    } else if (section === 'seo') {
        const r = await regenerateSeoFields({ title: post.title, body: post.content, siteName: ctx.site?.name || '' });
        if (!r.ok) throw new Error(r.error || 'El modelo no devolvió un SEO válido.');
        proposal = { seoTitle: r.seoTitle, seoDescription: r.seoDescription, keywords: r.keywords || post.keywords, slug: r.slug || post.slug };
    } else if (section === 'redaccion') {
        const data = await modelJson(`Sos el redactor jefe de un club Rotary. Mejorá la redacción, la ortografía, la claridad y el ritmo del artículo CONSERVANDO todos los hechos, los nombres, las cifras y la estructura de secciones <h2>. No agregues ningún dato. Etiquetas permitidas: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>. Respondé ÚNICAMENTE con JSON: {"cuerpo":"<p>...</p>"}`, `Contexto (para no contradecirlo):\n${context}\n\nArtículo:\n${String(post.content || '').slice(0, 9000)}`, { maxTokens: 6000 });
        const cuerpo = String(data?.cuerpo || '').trim();
        if (!cuerpo) throw new Error('El modelo no devolvió el cuerpo.');
        const { errors } = validateArticle({ title: post.title, body: cuerpo, seoTitle: post.seoTitle, seoDescription: post.seoDescription }, { siteName: ctx.site?.name || '' });
        warnings.push(...errors.filter(e => /cuerpo|palabras|secci|párrafo|parrafo|etiqueta/i.test(e)));
        const v = checkArticleVeracity({ body: cuerpo }, veracidad);
        warnings.push(...v.issues);
        const antes = analyzeArticleBody(post.content || '').wordCount;
        const despues = analyzeArticleBody(cuerpo).wordCount;
        proposal = { content: cuerpo, wordsBefore: antes, wordsAfter: despues };
    }

    if (apply) {
        const campos = Object.keys(proposal).filter(k => ['title', 'content', 'seoTitle', 'seoDescription', 'keywords', 'slug'].includes(k));
        const sets = campos.map((k, i) => `"${k}" = $${i + 2}`);
        if (sets.length) {
            await db.query(`UPDATE "Post" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $1`, [post.id, ...campos.map(k => proposal[k])]);
            const nuevo = await postOf(post.id);
            await db.query(
                `INSERT INTO "SubmissionArticleVersion" (id, "articleId", "postId", kind, section, snapshot, "changedFields", actor, "actorName", note) VALUES ($1,$2,$3,'regenerada',$4,$5::jsonb,$6,$7,$8,$9)`,
                [nuevoId(), row.id, post.id, section, JSON.stringify(snapshotOf(nuevo)), campos, actor, actorName, `Regenerado: ${REGENERABLE_SECTIONS[section].label}`]
            );
        }
    }
    return { ok: true, section, proposal, warnings, applied: apply };
}

export default {
    autoArticlesEnabled, autoLibraryEnabled, articleOf, articlesFor, originsForPosts, mediaOf, postOf, versionsOf, pendingDrafts,
    enqueueArticle, advanceArticle, runArticleUntilDone, sweepArticles,
    syncArticleMedia, sendMediaToLibrary, syncSubmissionLibrary, articleFolder, updateArticleMedia, transitionArticle, retryArticleStage,
    publishArticle, onPostUpdated, duplicateArticle, restoreVersion, regenerateSection, publicHostFor, publicUrlFor,
};
