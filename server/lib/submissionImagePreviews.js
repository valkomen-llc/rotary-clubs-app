// ════════════════════════════════════════════════════════════════════
// Vistas previas de las fotografías HEIC/HEIF del almacenamiento de aportes
// v4.1305.0 — ver `docs/claude/vistas-previas-heic-de-los-aportes.md`
//
// EL DEFECTO. Las fotos que un club adjunta en Visitas del Gobernador (y en el
// formulario general de Rotary en Acción) suben DIRECTO a S3 con una URL
// prefirmada, al prefijo privado `private/campaign-submissions/…`. El panel
// las mira con un enlace firmado al ORIGINAL. Un `.heic` —el formato de las
// cámaras de iPhone y de muchos Samsung— sólo lo dibuja Safari: en Chrome,
// Edge y Firefox el `<img>` queda roto y se ve el nombre del archivo. La
// Librería de Medios convierte HEIC desde v4.739, pero este camino no pasa por
// la Librería: nunca se convertía nada.
//
// LO QUE HACE ESTE MÓDULO. Para cada foto HEIC/HEIF genera, AL LADO del
// original y sin tocarlo:
//   · una VISTA PREVIA JPEG (lado mayor ≤ 2560 px, orientada, en sRGB, sin
//     EXIF/GPS) — lo que se ve en el panel y lo que se publica;
//   · una MINIATURA JPEG (≤ 480 px) — la rejilla carga rápido.
// Las dos van a `…/{campaña}/_preview/{uuid}.jpg|.thumb.jpg`, dentro del mismo
// prefijo privado: se miran con enlace firmado, igual que el original.
//
// UN REGISTRO, NO UNA SUPOSICIÓN: la tabla `SubmissionImagePreview` (una fila
// por objeto ORIGINAL) dice si la vista previa está lista, en proceso o falló
// y por qué. Es lo que hace el proceso:
//   · IDEMPOTENTE — una fila `ready` no se vuelve a convertir; las claves
//     derivadas son deterministas, así que reintentar escribe encima de lo
//     derivado y NUNCA del original (`putStagingDerivative` lo impide);
//   · SIN DUPLICADOS CONCURRENTES — se «reclama» la fila con un UPDATE
//     condicional y un candado con vencimiento (dos pestañas abiertas no
//     convierten dos veces; un proceso que murió a la mitad se retoma);
//   · REANUDABLE — el lote pide «lo que no está listo» y sigue donde quedó;
//   · CON REINTENTOS ACOTADOS — tres automáticos; después sólo a mano.
//
// Los JPG, PNG y WEBP NO pasan por acá: el navegador los dibuja tal cual y
// cambiarlos no es parte del arreglo.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { isHeicFile, jpegNameFor, convertHeicToJpeg, sniffImageBytes } from './heicImages.js';

export { sniffImageBytes };
import {
    STAGING_PREFIX, readStagingObjectDetailed, putStagingDerivative, signedSubmissionUrl, deleteStagingObject,
} from './submissionFiles.js';
import { IMAGE_MAX_BYTES } from './contentSubmissionSpec.js';

// ─── Criterio PURO ───────────────────────────────────────────────────────

export const PREVIEW_STATES = ['pending', 'processing', 'ready', 'error'];
/** Reintentos automáticos antes de exigir el botón «Reintentar». */
export const PREVIEW_MAX_AUTO_ATTEMPTS = 3;
/** Cuánto vale el candado de una conversión en curso. */
export const PREVIEW_LOCK_SECONDS = 120;
export const PREVIEW_MAX_DIMENSION = 2560;
export const THUMB_MAX_DIMENSION = 480;

const envNumber = (name, fallback) => {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Los topes, configurables por entorno. Por omisión:
 *   · 50 MB — el mismo tope de una foto en el formulario;
 *   · 64 megapíxeles — un iPhone de 48 MP (8064×6048) entra; decodificado son
 *     ~195 MB de RGBA, holgado en una función de 1-2 GB;
 *   · 45 s por foto — una de 12 MP tarda 2-4 s.
 */
export const previewLimits = () => ({
    maxBytes: envNumber('IMAGE_PREVIEW_MAX_BYTES', IMAGE_MAX_BYTES),
    maxMegapixels: envNumber('IMAGE_PREVIEW_MAX_MEGAPIXELS', 64),
    timeoutMs: envNumber('IMAGE_PREVIEW_TIMEOUT_MS', 45000),
});

/** ¿A este archivo le hace falta vista previa? Sólo fotos HEIC/HEIF. */
export function needsPreview({ filename, contentType, kind } = {}) {
    if (kind && kind !== 'image') return false;
    return isHeicFile({ filename, mimetype: contentType });
}

/**
 * Las claves derivadas de un original de staging. Deterministas: la misma
 * entrada da siempre las mismas, que es lo que hace idempotente reintentar.
 * Devuelve `null` para una clave fuera del prefijo o que ya es derivada.
 */
export function previewKeysFor(sourceKey) {
    const key = String(sourceKey || '');
    if (!key.startsWith(`${STAGING_PREFIX}/`) || key.includes('..') || key.includes('/_preview/')) return null;
    const slash = key.lastIndexOf('/');
    const dir = key.slice(0, slash);
    const base = key.slice(slash + 1).replace(/\.[^.]+$/, '') || 'archivo';
    return {
        previewKey: `${dir}/_preview/${base}.jpg`,
        thumbKey: `${dir}/_preview/${base}.thumb.jpg`,
    };
}

// `sniffImageBytes` vive en `heicImages.js` (sin dependencias) porque también
// lo usa la verificación de la subida en `submissionFiles.js`.

/**
 * El motivo de un fallo, para la persona que revisa: un código estable (para
 * agrupar y decidir) y una frase en castellano que dice qué hacer.
 */
export function classifyPreviewError(err) {
    const code = err?.code || null;
    const msg = String(err?.message || err || '');
    if (code === 'missing') return { code, message: 'El archivo original ya no está en el almacenamiento: el club tiene que volver a enviarlo.' };
    if (code === 'too_large') return { code, message: msg || 'La fotografía supera el tamaño que se puede procesar.' };
    if (code === 'timeout') return { code, message: 'La conversión tardó demasiado. Reintenta; si vuelve a fallar, pide la foto en JPG.' };
    if (code === 'not_image') return { code, message: 'El archivo dice ser HEIC pero su contenido no es una imagen reconocible (puede estar dañado o incompleto).' };
    if (code === 'storage') return { code, message: msg || 'El almacenamiento no respondió. Reintenta en unos minutos.' };
    if (/coincide|auxiliar|mapa de ganancia|no tiene tamaño/i.test(msg)) return { code: 'decode_mismatch', message: `No se pudo identificar la foto principal dentro del archivo: ${msg.slice(0, 200)}` };
    return { code: 'corrupt', message: `No se pudo decodificar la fotografía (archivo dañado o con un códec no soportado): ${msg.slice(0, 200)}` };
}

const fail = (code, message) => Object.assign(new Error(message), { code });

// ─── Esquema (tabla propia, fuera de Prisma) ─────────────────────────────
//
// Está en el guardián de `db:push` (que la protege solo: compara la base con
// el schema) y en la lista de CLAUDE.md. Todo `ADD COLUMN` futuro va en
// `OWNED_COLUMNS` (la trampa de v4.908).
export const OWNED_COLUMNS = { SubmissionImagePreview: [] };
let _ready = false;
export async function ensureSubmissionImagePreviewSchema() {
    if (_ready) return;
    const { rows } = await db.query(`SELECT to_regclass('public."SubmissionImagePreview"') IS NOT NULL AS t`);
    if (rows[0]?.t) { _ready = true; return; }
    await db.query(`
        CREATE TABLE IF NOT EXISTS "SubmissionImagePreview" (
            "sourceKey" TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'pending',
            "sourceFilename" TEXT,
            "sourceFormat" TEXT,
            "sourceBytes" BIGINT,
            "previewKey" TEXT,
            "thumbKey" TEXT,
            width INT,
            height INT,
            "previewBytes" INT,
            "thumbBytes" INT,
            "colorProfile" TEXT,
            attempts INT NOT NULL DEFAULT 0,
            "errorCode" TEXT,
            error TEXT,
            "lockedUntil" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "readyAt" TIMESTAMPTZ
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "SubmissionImagePreview_status_idx" ON "SubmissionImagePreview" (status)`);
    _ready = true;
}

/** Las filas de un conjunto de claves, en un Map por clave original. */
export async function previewRowsFor(keys = []) {
    const list = [...new Set(keys.filter(Boolean).map(String))];
    if (!list.length) return new Map();
    await ensureSubmissionImagePreviewSchema();
    const { rows } = await db.query(`SELECT * FROM "SubmissionImagePreview" WHERE "sourceKey" = ANY($1)`, [list]);
    return new Map(rows.map(r => [r.sourceKey, r]));
}

// ─── Render (bytes → vista previa + miniatura) ──────────────────────────

let _sharp = null;
const getSharp = async () => {
    if (!_sharp) { const m = await import('sharp'); _sharp = m.default || m; }
    return _sharp;
};

const withTimeout = (promise, ms) => {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(fail('timeout', `Superó ${Math.round(ms / 1000)} s.`)), ms); }),
    ]).finally(() => clearTimeout(timer));
};

/**
 * De los bytes de una foto, la vista previa y la miniatura. No toca S3 ni la
 * base: es lo que prueba `test:heic-previews` con archivos reales.
 *
 * Lanza con `code` (`not_image`, `too_large`, `timeout`, …) si no se puede.
 */
export async function renderPreview(buffer, { limits = previewLimits() } = {}) {
    const sharp = await getSharp();
    if (!buffer?.length) throw fail('not_image', 'El archivo está vacío.');
    if (buffer.length > limits.maxBytes) throw fail('too_large', `La fotografía pesa ${(buffer.length / 1048576).toFixed(1)} MB y el tope para procesarla es ${(limits.maxBytes / 1048576).toFixed(0)} MB.`);
    const format = sniffImageBytes(buffer);
    if (!format) throw fail('not_image', 'El contenido no es una imagen reconocible.');

    // Las dimensiones ANTES de decodificar: sharp lee el contenedor HEIF aunque
    // no pueda decodificar HEVC. Es lo que impide que una foto gigantesca (o
    // un archivo manipulado que declara 100.000 × 100.000) agote la memoria.
    let meta = {};
    try { meta = await sharp(buffer, { limitInputPixels: false }).metadata(); } catch { meta = {}; }
    const mp = ((meta.width || 0) * (meta.height || 0)) / 1e6;
    if (mp > limits.maxMegapixels) {
        throw fail('too_large', `La fotografía tiene ${mp.toFixed(0)} megapíxeles y el tope para procesarla es ${limits.maxMegapixels}.`);
    }

    const work = (async () => {
        let base;
        let colorProfile = 'srgb';
        if (format === 'heif') {
            // libheif (`heic-decode`): rejilla de mosaicos, imagen primaria
            // elegida por tamaño y comprobada, orientación aplicada, P3 → sRGB.
            const out = await convertHeicToJpeg(buffer, { maxDimension: PREVIEW_MAX_DIMENSION });
            base = out.buffer;
            colorProfile = out.colorProfile || 'srgb';
        } else {
            // Un JPEG/PNG/WEBP/AVIF con extensión .heic: sharp lo decodifica.
            // `.rotate()` aplica el EXIF; sin `withMetadata` no copia EXIF/GPS.
            base = await sharp(buffer, { failOn: 'none', limitInputPixels: Math.ceil(limits.maxMegapixels * 1e6) })
                .rotate()
                .resize({ width: PREVIEW_MAX_DIMENSION, height: PREVIEW_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
                .toColourspace('srgb')
                .flatten({ background: '#ffffff' })
                .jpeg({ quality: 88, mozjpeg: true })
                .toBuffer();
        }
        // La vista previa se re-codifica desde la conversión para quedar en el
        // tamaño de panel y SIN metadatos (la de `convertHeicToJpeg` ya va sin
        // EXIF: sharp no copia metadatos si no se le pide).
        const preview = await sharp(base)
            .resize({ width: PREVIEW_MAX_DIMENSION, height: PREVIEW_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 86, mozjpeg: true, progressive: true })
            .toBuffer({ resolveWithObject: true });
        const thumb = await sharp(preview.data)
            .resize({ width: THUMB_MAX_DIMENSION, height: THUMB_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 78, mozjpeg: true, progressive: true })
            .toBuffer({ resolveWithObject: true });
        return {
            format, colorProfile,
            preview: { buffer: preview.data, width: preview.info.width, height: preview.info.height },
            thumb: { buffer: thumb.data, width: thumb.info.width, height: thumb.info.height },
        };
    })();
    return withTimeout(work, limits.timeoutMs);
}

// ─── Orquestación (base + S3) ────────────────────────────────────────────

/**
 * Se asegura de que la foto tenga su vista previa. Devuelve la fila.
 *
 *   · no es HEIC → `{ status: 'not_needed' }` (sin tocar la base);
 *   · ya está lista → la fila, sin convertir nada;
 *   · otra petición la está convirtiendo → la fila en `processing`;
 *   · falló 3 veces → la fila en `error`, salvo `force: true` (el botón).
 *
 * Nunca lanza: el error queda escrito en la fila, con su código.
 */
export async function ensurePreview({ key, filename = null, contentType = null, kind = 'image', force = false } = {}) {
    if (!key || !needsPreview({ filename: filename || key, contentType, kind })) return { sourceKey: key, status: 'not_needed' };
    const keys = previewKeysFor(key);
    if (!keys) return { sourceKey: key, status: 'error', errorCode: 'outside', error: 'La clave no pertenece al almacenamiento de aportes.' };
    await ensureSubmissionImagePreviewSchema();

    await db.query(
        `INSERT INTO "SubmissionImagePreview" ("sourceKey", "sourceFilename", status) VALUES ($1, $2, 'pending')
         ON CONFLICT ("sourceKey") DO NOTHING`,
        [key, filename ? String(filename).slice(0, 300) : null]
    );
    // Reclamar la fila es lo que impide dos conversiones de lo mismo a la vez.
    const { rows: claimed } = await db.query(
        `UPDATE "SubmissionImagePreview"
            SET status = 'processing', attempts = CASE WHEN $2 THEN 1 ELSE attempts + 1 END,
                "lockedUntil" = NOW() + make_interval(secs => $3), "updatedAt" = NOW()
          WHERE "sourceKey" = $1
            AND (status = 'pending'
                 OR (status = 'error' AND ($2 OR attempts < $4))
                 OR (status = 'processing' AND "lockedUntil" < NOW()))
          RETURNING *`,
        [key, Boolean(force), PREVIEW_LOCK_SECONDS, PREVIEW_MAX_AUTO_ATTEMPTS]
    );
    if (!claimed.length) {
        const { rows } = await db.query(`SELECT * FROM "SubmissionImagePreview" WHERE "sourceKey" = $1`, [key]);
        return rows[0] || { sourceKey: key, status: 'pending' };
    }

    const limits = previewLimits();
    const started = Date.now();
    try {
        const read = await readStagingObjectDetailed(key, { maxBytes: limits.maxBytes });
        if (!read.ok) throw fail(read.reason === 'too_large' ? 'too_large' : read.reason === 'missing' ? 'missing' : 'storage', read.error);
        const out = await renderPreview(read.buffer, { limits });
        await putStagingDerivative({ key: keys.previewKey, body: out.preview.buffer });
        await putStagingDerivative({ key: keys.thumbKey, body: out.thumb.buffer });
        const { rows } = await db.query(
            `UPDATE "SubmissionImagePreview"
                SET status = 'ready', "sourceFormat" = $2, "sourceBytes" = $3, "previewKey" = $4, "thumbKey" = $5,
                    width = $6, height = $7, "previewBytes" = $8, "thumbBytes" = $9, "colorProfile" = $10,
                    "errorCode" = NULL, error = NULL, "lockedUntil" = NULL, "updatedAt" = NOW(), "readyAt" = NOW()
              WHERE "sourceKey" = $1 RETURNING *`,
            [key, out.format, read.bytes, keys.previewKey, keys.thumbKey, out.preview.width, out.preview.height,
                out.preview.buffer.length, out.thumb.buffer.length, out.colorProfile]
        );
        console.log(`[heic-previews] lista ${key} (${out.format} → ${out.preview.width}×${out.preview.height}, ${Date.now() - started} ms)`);
        return rows[0];
    } catch (e) {
        const why = classifyPreviewError(e);
        console.error(`[heic-previews] FALLÓ ${key} (${filename || ''}) [${why.code}]: ${e?.message || e}`);
        const { rows } = await db.query(
            `UPDATE "SubmissionImagePreview"
                SET status = 'error', "errorCode" = $2, error = $3, "lockedUntil" = NULL, "updatedAt" = NOW()
              WHERE "sourceKey" = $1 RETURNING *`,
            [key, why.code, why.message.slice(0, 600)]
        );
        return rows[0] || { sourceKey: key, status: 'error', errorCode: why.code, error: why.message };
    }
}

/** El estado de una foto, tal como lo ve la pantalla. */
export function previewState(m, row) {
    if (!needsPreview({ filename: m?.filename || m?.key, contentType: m?.contentType, kind: m?.kind })) return { status: 'not_needed' };
    if (!row) return { status: 'pending' };
    const status = row.status === 'processing' && row.lockedUntil && new Date(row.lockedUntil) < new Date() ? 'pending' : row.status;
    return {
        status,
        errorCode: status === 'error' ? row.errorCode || null : null,
        error: status === 'error' ? row.error || null : null,
        attempts: Number(row.attempts) || 0,
        canRetry: status === 'error' && row.errorCode !== 'missing',
        width: row.width || null, height: row.height || null,
    };
}

/**
 * Las URLs para MIRAR un archivo de staging (enlaces firmados que caducan):
 *   · `url`        — lo que se dibuja grande (vista previa JPEG si es HEIC);
 *   · `thumbUrl`   — lo que se dibuja en la rejilla;
 *   · `originalUrl`— el archivo tal como lo envió el club, para DESCARGARLO.
 * Un HEIC sin vista previa lista NO devuelve `url`: dibujar el original sería
 * volver al recuadro roto. La pantalla muestra el estado en su lugar.
 */
export async function stagingViewUrls(m, row, { seconds = 900 } = {}) {
    const preview = previewState(m, row);
    const originalUrl = await signedSubmissionUrl(m.key, { seconds, download: m.filename || m.key.split('/').pop() });
    if (preview.status === 'not_needed') {
        const url = await signedSubmissionUrl(m.key, { seconds });
        return { url, thumbUrl: url, originalUrl, preview };
    }
    if (preview.status === 'ready' && row?.previewKey) {
        const [url, thumbUrl] = await Promise.all([
            signedSubmissionUrl(row.previewKey, { seconds }),
            signedSubmissionUrl(row.thumbKey || row.previewKey, { seconds }),
        ]);
        return { url, thumbUrl, originalUrl, preview };
    }
    return { url: null, thumbUrl: null, originalUrl, preview };
}

/**
 * La MEJOR URL para mirar un archivo de staging, para las pantallas que sólo
 * esperan una (Reels, artículo, Centro de Control): la vista previa JPEG de un
 * HEIC si está lista; si no, el enlace firmado al original, como antes.
 * Recibe `{ key | s3Key, filename, contentType, kind }`.
 */
export async function bestStagingUrl(f, { seconds = 900 } = {}) {
    const key = f?.key || f?.s3Key;
    if (!key) return null;
    if (needsPreview({ filename: f.filename || key, contentType: f.contentType, kind: f.kind })) {
        const row = (await previewRowsFor([key]).catch(() => new Map())).get(key);
        if (row?.status === 'ready' && row.previewKey) {
            const url = await signedSubmissionUrl(row.previewKey, { seconds });
            if (url) return url;
        }
    }
    return signedSubmissionUrl(key, { seconds });
}

/** Borra las versiones derivadas de un original (mejor esfuerzo). */
export async function deletePreviewObjects(sourceKey) {
    const keys = previewKeysFor(sourceKey);
    if (!keys) return;
    await Promise.all([deleteStagingObject(keys.previewKey), deleteStagingObject(keys.thumbKey)]);
}

// ─── El inventario para la recuperación ─────────────────────────────────

/**
 * Todas las fotos HEIC/HEIF del almacenamiento de aportes que todavía están
 * en staging, con a qué pertenecen y en qué estado está su vista previa:
 *   · las de las Visitas del Gobernador (galería en `GovernorVisit.media`)
 *     que no se promovieron a la Biblioteca;
 *   · las de las solicitudes de Rotary en Acción (`ContributionSubmissionFile`)
 *     sin `mediaId` (las ya promovidas se arreglan en la Biblioteca, con
 *     «Convertir a JPG»).
 * `visitRef` acota a una visita (p. ej. `VG-2026-SG53HR`).
 */
export async function heicInventory({ visitRef = null, includeSubmissions = true } = {}) {
    await ensureSubmissionImagePreviewSchema();
    const items = [];
    const visitas = await db.query(
        `SELECT v.id, v."publicRef", v."clubName", v.title, v."contributionSubmissionId",
                e->>'key' AS key, e->>'filename' AS filename, e->>'contentType' AS "contentType", e->>'kind' AS kind
           FROM "GovernorVisit" v, jsonb_array_elements(COALESCE(v.media, '[]'::jsonb)) e
          WHERE ($1::text IS NULL OR v."publicRef" = $1 OR v.id = $1)`,
        [visitRef]
    ).catch(() => ({ rows: [] }));
    const promovidas = new Set();
    const subIds = [...new Set(visitas.rows.map(r => r.contributionSubmissionId).filter(Boolean))];
    if (subIds.length) {
        const { rows } = await db.query(
            `SELECT "s3Key" FROM "ContributionSubmissionFile" WHERE "submissionId" = ANY($1) AND "mediaId" IS NOT NULL`, [subIds]
        ).catch(() => ({ rows: [] }));
        rows.forEach(r => promovidas.add(r.s3Key));
    }
    for (const r of visitas.rows) {
        if (!needsPreview(r) || promovidas.has(r.key)) continue;
        items.push({ source: 'governor_visit', ownerId: r.id, ownerRef: r.publicRef, ownerLabel: r.title || r.clubName, key: r.key, filename: r.filename, contentType: r.contentType, kind: r.kind });
    }
    if (includeSubmissions && !visitRef) {
        const { rows } = await db.query(
            `SELECT f."submissionId", f."s3Key" AS key, f.filename, f."contentType", f.kind, s.title
               FROM "ContributionSubmissionFile" f
               LEFT JOIN "ContributionSubmission" s ON s.id = f."submissionId"
              WHERE f."mediaId" IS NULL AND f.kind = 'image'`
        ).catch(() => ({ rows: [] }));
        const vistos = new Set(items.map(i => i.key));
        for (const r of rows) {
            if (vistos.has(r.key) || !needsPreview(r)) continue;
            items.push({ source: 'submission', ownerId: r.submissionId, ownerRef: r.submissionId, ownerLabel: r.title || 'Solicitud', key: r.key, filename: r.filename, contentType: r.contentType, kind: r.kind });
        }
    }
    const filas = await previewRowsFor(items.map(i => i.key));
    return items.map(i => ({ ...i, preview: previewState(i, filas.get(i.key)) }));
}

/** Cuántas hay en cada estado, y la lista de las que fallaron. */
export function summarizeInventory(items) {
    const counts = { total: items.length, ready: 0, pending: 0, processing: 0, error: 0 };
    for (const i of items) counts[i.preview.status] = (counts[i.preview.status] || 0) + 1;
    return {
        counts,
        errors: items.filter(i => i.preview.status === 'error').map(i => ({
            source: i.source, ownerRef: i.ownerRef, ownerLabel: i.ownerLabel, filename: i.filename, key: i.key,
            errorCode: i.preview.errorCode, error: i.preview.error, attempts: i.preview.attempts,
        })),
    };
}

/**
 * Un LOTE de la recuperación: convierte las siguientes `limit` fotos sin
 * vista previa, dentro de un presupuesto de tiempo (una función de Vercel
 * tiene 120 s). Devuelve lo procesado y lo que queda: quien llama repite
 * hasta que `remaining` sea 0. `retryErrors` incluye las que ya fallaron.
 */
export async function processPreviewBatch({ visitRef = null, limit = 4, budgetMs = 60000, retryErrors = false, includeSubmissions = true } = {}) {
    const started = Date.now();
    const inventario = await heicInventory({ visitRef, includeSubmissions });
    const cola = inventario.filter(i => i.preview.status === 'pending' || (retryErrors && i.preview.status === 'error' && i.preview.canRetry));
    const processed = [];
    for (const item of cola.slice(0, Math.max(1, limit))) {
        if (processed.length && Date.now() - started > budgetMs) break;
        const row = await ensurePreview({ key: item.key, filename: item.filename, contentType: item.contentType, kind: item.kind, force: retryErrors && item.preview.status === 'error' });
        processed.push({ ...item, preview: previewState(item, row) });
    }
    const hechos = new Set(processed.map(p => p.key));
    const remaining = cola.filter(i => !hechos.has(i.key)).length;
    return { processed, remaining, elapsedMs: Date.now() - started };
}

export { jpegNameFor };

export default {
    PREVIEW_STATES, needsPreview, previewKeysFor, sniffImageBytes, classifyPreviewError, previewLimits,
    ensureSubmissionImagePreviewSchema, previewRowsFor, renderPreview, ensurePreview, previewState,
    stagingViewUrls, bestStagingUrl, deletePreviewObjects, heicInventory, summarizeInventory, processPreviewBatch,
};
