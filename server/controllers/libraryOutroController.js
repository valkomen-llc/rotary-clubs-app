/**
 * Outro sobre un video de la Biblioteca — la ORQUESTACIÓN (v4.1039)
 * ================================================================
 *
 * Tres acciones sobre `/api/media/:id/outro`:
 *
 *   GET    → qué es este video (máster o versión con outro), sus versiones y
 *            la ficha de su composición, RESUELTO para la pantalla.
 *   POST   → componer. Sobre un MÁSTER crea una versión nueva; sobre una
 *            VERSIÓN («Cambiar outro») vuelve a componer DESDE EL MÁSTER y
 *            sobrescribe la clave de esa versión (misma URL). Nunca se parte
 *            de una versión que ya lleva outro: eso daría VIDEO → OUTRO 1 →
 *            OUTRO 2.
 *   DELETE → «Quitar outro»: retira la versión (fila de Media + objeto de S3) y
 *            devuelve el máster, que nunca se tocó. Sin reprocesar nada.
 *
 * ⚠️ ESTO NO LLAMA A NINGÚN MOTOR GENERATIVO. Ni Kling, ni image-to-video, ni
 * TTS, ni música: el máster viaja con su audio ya mezclado y el outro con el
 * suyo. Créditos: 0. Una prueba lee este archivo y falla si aparece el cliente
 * de KIE o el de voz.
 *
 * El criterio (plan, grafo, validación, nombres) vive en `libraryOutro.js`,
 * que es puro. Acá sólo hay I/O: base, S3, ffmpeg.
 */

import { randomUUID } from 'crypto';
import path from 'path';
import { writeFile, readFile, stat } from 'fs/promises';
import db from '../lib/db.js';
import { ensureLibraryOutroSchema } from '../lib/ensureLibraryOutroSchema.js';
import { ensureMediaFolderSchema } from '../lib/ensureMediaFolderSchema.js';
import { ensureOutroSchema } from '../lib/ensureOutroSchema.js';
import { probeMp4 } from '../lib/outroQuality.js';
import {
    LIBRARY_OUTRO_VERSION, MAX_MAIN_SEC, TMP_BUDGET_BYTES,
    planLibraryOutro, buildLibraryOutroGraph, buildLibraryOutroArgs,
    compositionBudget, validateComposedOutro, versionKeyFor, versionFilenameFor,
    normalizeOutroRequest, compositionView, processingIsStale, transitionOptions
} from '../lib/libraryOutro.js';

console.log(`[libraryOutroController] v${LIBRARY_OUTRO_VERSION} cargado — outro sobre un video de la Biblioteca: composición FFmpeg (video + outro + transición), cuatro escenarios de audio, versión nueva en la Biblioteca, «Cambiar» siempre desde el máster, «Quitar» sin reprocesar, cero créditos`);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = Number(process.env.LIBRARY_OUTRO_TIMEOUT_MS) || 240_000;
const FETCH_TIMEOUT_MS = 60_000;
const maxMainSec = () => Number(process.env.LIBRARY_OUTRO_MAX_MAIN_SEC) || MAX_MAIN_SEC;
const budgetBytes = () => (Number(process.env.VIDEO_TRIM_TMP_BUDGET_MB) * 1024 * 1024) || TMP_BUDGET_BYTES;

const ensureAll = async () => {
    await ensureMediaFolderSchema();
    await ensureLibraryOutroSchema();
};

// ─── Acceso ───────────────────────────────────────────────────────────────

// El MISMO gate que recortar, convertir y eliminar en `routes/media.js`:
// sesión + propiedad del sitio. Lo ajeno responde 403, como allá.
const loadMedia = async (id) => {
    if (!UUID_RE.test(String(id || ''))) return null;
    const { rows } = await db.query('SELECT * FROM "Media" WHERE id = $1', [id]);
    return rows[0] || null;
};
const canTouch = (user, item) => user.role === 'administrator' || (item.clubId && item.clubId === user.clubId);

// El outro del Generador: un administrador de sitio sólo alcanza los de SU
// sitio (el aislamiento va en el WHERE); el operador, cualquiera.
const loadOutroProject = async (id, user) => {
    if (!UUID_RE.test(String(id || ''))) return null;
    await ensureOutroSchema();
    const scoped = user.role === 'administrator' ? '' : ' AND "clubId" = $2';
    const params = user.role === 'administrator' ? [id] : [id, user.clubId || null];
    const { rows } = await db.query(`SELECT * FROM "OutroProject" WHERE id = $1${scoped}`, params);
    return rows[0] || null;
};

const compositionsOf = async (mediaId) => {
    const { rows } = await db.query(
        `SELECT * FROM "MediaOutroComposition"
          WHERE ("originalMediaId" = $1 OR "versionMediaId" = $1) AND status <> 'removed'
          ORDER BY "createdAt" DESC`,
        [mediaId]
    );
    return rows;
};

// ─── I/O de archivos ──────────────────────────────────────────────────────

// El cliente de S3 y la URL pública son los de `routes/media.js` (exportados
// desde v4.956): ningún segundo cliente. Se cargan perezosos porque ese
// módulo importa a éste —el ciclo se resuelve al llamar, no al cargar—.
const mediaDeps = async () => {
    const mod = await import('../routes/media.js');
    return { deps: await mod.getUploadDeps(), publicUrlFor: mod.publicUrlFor };
};

const s3ToFile = async (bucket, key, dest) => {
    const { deps } = await mediaDeps();
    const obj = await deps.s3.send(new deps.GetObjectCommand({ Bucket: bucket, Key: key }));
    const { createWriteStream } = await import('fs');
    const { pipeline } = await import('stream/promises');
    await pipeline(obj.Body, createWriteStream(dest));
};

// Ninguna descarga sin tope de tiempo (v4.875).
const urlToFile = async (url, dest) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`No se pudo descargar el outro (HTTP ${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buffer);
    return buffer;
};

// `probeMp4` lee el contenedor: con el `moov` al frente (faststart) basta la
// cabecera, pero un archivo con el índice al final exige leerlo entero. Se
// lee entero: el presupuesto ya se comprobó antes de bajar.
const probeFile = async (file) => probeMp4(await readFile(file));

// ─── GET ──────────────────────────────────────────────────────────────────

const viewFor = async (item) => {
    const rows = await compositionsOf(item.id);
    const asVersion = rows.find(r => r.versionMediaId === item.id) || null;
    const original = asVersion ? await loadMedia(asVersion.originalMediaId) : item;
    const versionsRows = asVersion ? [] : rows.filter(r => r.originalMediaId === item.id);
    const versions = [];
    for (const r of versionsRows) {
        const v = r.versionMediaId ? await loadMedia(r.versionMediaId) : null;
        versions.push(compositionView(r, { original, version: v }));
    }
    return {
        mediaId: item.id,
        role: asVersion ? 'version' : (versions.length ? 'original' : 'none'),
        original: original ? { id: original.id, filename: original.filename, url: original.url, thumbUrl: original.thumbUrl || null, folderId: original.folderId || null } : null,
        composition: asVersion ? compositionView(asVersion, { original, version: item }) : null,
        versions,
        transitions: transitionOptions(),
        maxMainSec: maxMainSec()
    };
};

export const getMediaOutro = async (req, res) => {
    try {
        await ensureAll();
        const item = await loadMedia(req.params.id);
        if (!item) return res.status(404).json({ error: 'Archivo no encontrado' });
        if (!canTouch(req.user, item)) return res.status(403).json({ error: 'No autorizado' });
        res.json(await viewFor(item));
    } catch (e) {
        console.error('[LIBRARY-OUTRO] get:', e);
        res.status(500).json({ error: 'No se pudo leer el estado del outro.', details: e.message });
    }
};

// ─── POST ─────────────────────────────────────────────────────────────────

export const applyMediaOutro = async (req, res) => {
    let claimedId = null;
    let claimedWasNew = false;
    const fail = async (code, message, detail = null, extra = {}) => {
        if (claimedId) {
            // El reclamo se suelta SIEMPRE con su motivo. Una versión que ya
            // existía vuelve a `ready`: su archivo anterior sigue intacto en
            // S3, porque nada se sobrescribe hasta que el resultado valida.
            await db.query(
                `UPDATE "MediaOutroComposition" SET status = $2, "statusDetail" = $3, "updatedAt" = NOW() WHERE id = $1`,
                [claimedId, claimedWasNew ? 'failed' : 'ready', String(detail || message).slice(0, 1200)]
            ).catch(() => { });
        }
        return res.status(code).json({ error: message, details: detail, ...extra });
    };

    try {
        await ensureAll();
        const item = await loadMedia(req.params.id);
        if (!item) return res.status(404).json({ error: 'Archivo no encontrado' });
        if (!canTouch(req.user, item)) return res.status(403).json({ error: 'No autorizado' });
        if (item.type !== 'video') return res.status(400).json({ error: 'Este archivo no es un video: no hay a qué agregarle un outro.' });

        const ask = normalizeOutroRequest(req.body || {});
        if (ask.problems.length) return res.status(400).json({ error: ask.problems.join(' ') });

        // ── El MÁSTER es siempre el original ──
        // Si este video es una versión con outro, se vuelve a componer desde
        // su original y se sobrescribe ESTA versión. Nunca se encadena.
        const existing = (await compositionsOf(item.id)).find(r => r.versionMediaId === item.id) || null;
        const original = existing ? await loadMedia(existing.originalMediaId) : item;
        if (!original) return res.status(409).json({ error: 'El video original de esta versión ya no está en la Biblioteca: no se puede volver a componer desde él.' });
        if (!original.s3Key || !original.bucket) return res.status(400).json({ error: 'No se sabe dónde está guardado el video original.' });

        // ── El outro: del Generador de Outros o un video de la Biblioteca ──
        let outro = null;
        if (ask.outroId) {
            const row = await loadOutroProject(ask.outroId, req.user);
            if (!row) return res.status(404).json({ error: 'Outro no encontrado en este sitio.' });
            if (!row.videoUrl) return res.status(400).json({ error: 'Ese outro todavía no tiene archivo generado.' });
            outro = {
                id: row.id, mediaId: row.mediaId || null, url: row.videoUrl, title: row.title || 'Outro',
                posterUrl: row.config?.library?.thumbUrl || row.sourceImageUrl || null,
                declared: { durationSec: row.durationSec, width: row.width, height: row.height, hasAudio: row.hasAudio, sizeBytes: Number(row.sizeBytes) || 0 }
            };
        } else {
            const m = await loadMedia(ask.outroMediaId);
            if (!m || !canTouch(req.user, m)) return res.status(404).json({ error: 'El video elegido como outro no se encontró en este sitio.' });
            if (m.type !== 'video') return res.status(400).json({ error: 'El outro tiene que ser un video.' });
            if (m.id === original.id) return res.status(400).json({ error: 'El outro no puede ser el mismo video.' });
            outro = { id: null, mediaId: m.id, url: m.url, title: m.filename.replace(/\.[^.]+$/, ''), posterUrl: m.thumbUrl || null, declared: { sizeBytes: Number(m.size) || 0 } };
        }

        const [{ runFfmpeg, withTempDir, isFfmpegAvailable, targetBitrate }] = await Promise.all([import('../lib/reelFfmpeg.js')]);
        if (!(await isFfmpegAvailable())) return res.status(503).json({ error: 'FFmpeg no está disponible en este entorno.' });

        // ── El RECLAMO, antes del trabajo ──
        // Una versión nueva: no puede haber otra composición «procesando» del
        // mismo máster (doble clic, dos pestañas). Una versión existente: se
        // reclama por estado.
        if (existing) {
            const claim = await db.query(
                `UPDATE "MediaOutroComposition" SET status = 'processing', "statusDetail" = NULL, "updatedAt" = NOW()
                  WHERE id = $1 AND (status <> 'processing' OR "updatedAt" < NOW() - INTERVAL '10 minutes')
                  RETURNING id`,
                [existing.id]
            );
            if (!claim.rows.length) return res.status(409).json({ error: 'Esta versión ya se está componiendo. Esperá a que termine.' });
            claimedId = existing.id;
        } else {
            const busy = (await compositionsOf(original.id)).find(r => r.originalMediaId === original.id && !processingIsStale(r));
            if (busy) return res.status(409).json({ error: 'Ya hay una composición en curso sobre este video. Esperá a que termine.' });
            claimedId = randomUUID();
            claimedWasNew = true;
            await db.query(
                `INSERT INTO "MediaOutroComposition"
                    (id, "clubId", "originalMediaId", "outroId", "outroMediaId", "outroUrl", "outroTitle",
                     "transitionType", "transitionSec", status, "createdBy")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'processing', $10)`,
                [claimedId, original.clubId || null, original.id, outro.id, outro.mediaId, outro.url, outro.title,
                 ask.transitionType, ask.transitionSec, req.user.email || req.user.id || null]
            );
        }

        // ── Presupuesto ANTES de bajar nada ──
        // Con lo que se sabe antes de bajar: el peso de los dos archivos. La
        // duración —y con ella el peso del resultado— se conoce al medir, y
        // entonces se vuelve a comprobar.
        const preBudget = compositionBudget({
            mainBytes: original.size, outroBytes: Number(outro.declared.sizeBytes) || 0,
            mainDurationSec: null, finalDurationSec: null, budgetBytes: budgetBytes()
        });
        if (!preBudget.ok) return fail(413, `Este video es demasiado pesado para componerlo con un outro en este entorno. ${preBudget.reason}`);

        const result = await withTempDir(async (dir) => {
            const mainPath = path.join(dir, 'main.mp4');
            const outroPath = path.join(dir, 'outro.mp4');
            const outPath = path.join(dir, 'final.mp4');

            await s3ToFile(original.bucket, original.s3Key, mainPath);
            const outroBuffer = await urlToFile(outro.url, outroPath);

            // ── Las pistas se ANALIZAN antes de unir ──
            // Lo medido manda sobre lo declarado: lo declarado es una pista,
            // lo medido es un hecho.
            const mainProbe = await probeFile(mainPath);
            const outroProbe = probeMp4(outroBuffer);
            if (mainProbe.parseError) return { error: `No se pudo leer el video principal: ${mainProbe.parseError}` };
            if (outroProbe.parseError) return { error: `No se pudo leer el outro: ${outroProbe.parseError}` };

            const plan = planLibraryOutro({
                main: mainProbe,
                outro: { ...outroProbe, durationSec: outroProbe.durationSec || outro.declared.durationSec },
                transitionType: ask.transitionType, transitionSec: ask.transitionSec,
                outroAudio: ask.outroAudio, maxMainSec: maxMainSec()
            });
            if (!plan.ok) return { error: plan.problems.join(' '), plan };

            const budget = compositionBudget({
                mainBytes: (await stat(mainPath)).size, outroBytes: outroBuffer.length,
                mainDurationSec: plan.mainDurationSec, finalDurationSec: plan.finalDurationSec, budgetBytes: budgetBytes()
            });
            if (!budget.ok) return { error: `No hay espacio temporal para componer. ${budget.reason}`, plan };

            const graph = buildLibraryOutroGraph(plan);
            const args = buildLibraryOutroArgs({ mainPath, outroPath, outputPath: outPath, plan, graph, bitrate: targetBitrate(plan.width, plan.height) });
            console.log(`[LIBRARY-OUTRO] ${claimedId}: componiendo ${original.id} + outro «${outro.title}» — ${plan.mainDurationSec}s + ${plan.outroDurationSec}s − ${plan.transition.sec}s = ${plan.finalDurationSec}s · audio: ${plan.audio.mode}`);
            const started = Date.now();
            await runFfmpeg(args, { timeoutMs: TIMEOUT_MS, label: 'composición video + outro' });
            const elapsedMs = Date.now() - started;

            const buffer = await readFile(outPath);
            const probe = probeMp4(buffer);
            const verdict = validateComposedOutro({ probe, plan });
            if (!verdict.ok) return { error: verdict.problems.join(' '), plan, probe };

            return {
                buffer, plan, probe,
                report: {
                    warnings: [...plan.warnings, ...verdict.warnings],
                    audio: plan.audio, main: { durationSec: mainProbe.durationSec, hasAudio: mainProbe.hasAudio, width: mainProbe.width, height: mainProbe.height, fps: mainProbe.fps },
                    outro: { durationSec: outroProbe.durationSec, hasAudio: outroProbe.hasAudio, width: outroProbe.width, height: outroProbe.height },
                    output: { durationSec: probe.durationSec, hasAudio: probe.hasAudio, width: probe.width, height: probe.height, sizeBytes: buffer.length, bitrateKbps: probe.bitrateKbps },
                    elapsedMs, filter: graph.filter.slice(0, 4000)
                }
            };
        });

        if (result.error) {
            return fail(422, result.error, null, { plan: result.plan || null });
        }
        const { buffer, plan, report } = result;

        // ── A S3: la clave de ESTA versión, nunca la del original ──
        const { deps, publicUrlFor } = await mediaDeps();
        const bucket = original.bucket;
        const key = existing?.s3Key || versionKeyFor(original.s3Key, claimedId);
        await deps.s3.send(new deps.PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: 'video/mp4' }));
        const url = publicUrlFor(bucket, key);
        const filename = versionFilenameFor(original.filename, outro.title);

        // ── La fila de Media de la versión ──
        let version;
        if (existing?.versionMediaId) {
            const { rows } = await db.query(
                `UPDATE "Media" SET filename = $2, url = $3, "s3Key" = $4, size = $5 WHERE id = $1 RETURNING *`,
                [existing.versionMediaId, filename, url, key, buffer.length]
            );
            version = rows[0];
        }
        if (!version) {
            const { rows } = await db.query(
                `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key",
                                      "sourceType", "sourceId", "sourceLabel", "thumbUrl", "folderId", "createdAt")
                 VALUES (gen_random_uuid(), $1, $2, 'video', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
                 RETURNING *`,
                [filename, url, buffer.length, bucket, original.region || process.env.AWS_REGION || 'us-east-1',
                 original.clubId, key, original.sourceType || 'platform', original.sourceId, original.sourceLabel,
                 original.thumbUrl || null, original.folderId || null]
            );
            version = rows[0];
        }

        const { rows: saved } = await db.query(
            `UPDATE "MediaOutroComposition"
                SET "versionMediaId" = $2, "outroId" = $3, "outroMediaId" = $4, "outroUrl" = $5, "outroTitle" = $6,
                    "transitionType" = $7, "transitionSec" = $8,
                    "originalDurationSec" = $9, "outroDurationSec" = $10, "finalDurationSec" = $11,
                    status = 'ready', "statusDetail" = NULL, plan = $12::jsonb, report = $13::jsonb,
                    "s3Key" = $14, "sizeBytes" = $15, "creditsUsed" = 0, "composedAt" = NOW(), "updatedAt" = NOW()
              WHERE id = $1 RETURNING *`,
            [claimedId, version.id, outro.id, outro.mediaId, outro.url, outro.title,
             plan.transition.type, plan.transition.sec,
             plan.mainDurationSec, plan.outroDurationSec, plan.finalDurationSec,
             JSON.stringify({ ...plan, outroPosterUrl: outro.posterUrl }), JSON.stringify(report),
             key, buffer.length]
        );
        claimedId = null;
        console.log(`[LIBRARY-OUTRO] ${saved[0].id}: listo → ${version.id} (${key}) ${plan.finalDurationSec}s en ${report.elapsedMs} ms · créditos 0`);
        res.status(existing ? 200 : 201).json({
            composition: compositionView(saved[0], { original, version }),
            version, original,
            state: await viewFor(version),
            credits: 0
        });
    } catch (e) {
        console.error('[LIBRARY-OUTRO] apply:', e);
        return fail(500, 'No se pudo componer el video con el outro. El video original quedó intacto.', e.ffmpeg?.stderrTail || e.message);
    }
};

// ─── DELETE ───────────────────────────────────────────────────────────────

export const removeMediaOutro = async (req, res) => {
    try {
        await ensureAll();
        const item = await loadMedia(req.params.id);
        if (!item) return res.status(404).json({ error: 'Archivo no encontrado' });
        if (!canTouch(req.user, item)) return res.status(403).json({ error: 'No autorizado' });

        // Sobre una VERSIÓN se quita esa; sobre un MÁSTER hay que decir cuál
        // (`compositionId`): un máster puede tener varias versiones.
        const rows = await compositionsOf(item.id);
        const target = rows.find(r => r.versionMediaId === item.id)
            || (req.query.compositionId ? rows.find(r => r.id === req.query.compositionId && r.originalMediaId === item.id) : null);
        if (!target) return res.status(400).json({ error: 'Este video no tiene un outro aplicado que se pueda quitar.' });
        if (target.status === 'processing' && !processingIsStale(target)) {
            return res.status(409).json({ error: 'Esa versión se está componiendo. Esperá a que termine.' });
        }

        const original = await loadMedia(target.originalMediaId);
        const version = target.versionMediaId ? await loadMedia(target.versionMediaId) : null;

        // El objeto de S3 se quita antes que la fila (regla del borrado de la
        // Biblioteca): una fila sin objeto no se ve, un objeto sin fila no se
        // puede volver a borrar desde el panel. Mejor esfuerzo: si S3 falla, la
        // versión desaparece igual del panel, que es lo que se pidió.
        if (version?.s3Key && version.bucket && version.s3Key !== original?.s3Key) {
            try {
                const { deps } = await mediaDeps();
                await deps.s3.send(new deps.DeleteObjectCommand({ Bucket: version.bucket, Key: version.s3Key }));
            } catch (e) {
                console.warn('[LIBRARY-OUTRO] no se pudo borrar el objeto de la versión:', e.message);
            }
        }
        if (version && version.id !== original?.id) {
            await db.query('DELETE FROM "Media" WHERE id = $1', [version.id]);
        }
        // La composición queda como rastro (`removed`): es lo que contesta
        // «¿qué outro llevó este video?» después de quitarlo.
        await db.query(
            `UPDATE "MediaOutroComposition" SET status = 'removed', "versionMediaId" = NULL, "updatedAt" = NOW() WHERE id = $1`,
            [target.id]
        );
        console.log(`[LIBRARY-OUTRO] ${target.id}: outro quitado; el máster ${target.originalMediaId} sigue intacto`);
        res.json({ removedMediaId: version?.id || null, original, state: original ? await viewFor(original) : null });
    } catch (e) {
        console.error('[LIBRARY-OUTRO] remove:', e);
        res.status(500).json({ error: 'No se pudo quitar el outro.', details: e.message });
    }
};
