// ════════════════════════════════════════════════════════════════════
// Archivos del Directorio Distrital de Clubes — servicio — v4.1306.0
//
// Una fila por archivo en `DistrictClubMedia` (tabla propia, fuera de Prisma,
// protegida por el guardián de `db:push` y listada en CLAUDE.md). El recorrido
// de un archivo es SIEMPRE el mismo, para el formulario público y para el
// portal del club:
//
//   presign ─► el navegador sube el ORIGINAL directo a S3 (prefijo privado)
//           ─► confirm: el servidor lee los BYTES reales, comprueba qué son
//              (no la extensión), convierte HEIC/HEIF, endereza según EXIF,
//              quita los metadatos (GPS incluido) y guarda la versión limpia
//           ─► «Guardado» SÓLO cuando esa escritura terminó y la fila quedó
//              asociada al borrador (o al perfil, desde el portal)
//           ─► al aprobar (o al guardar desde el portal) se PUBLICA copiando
//              al prefijo público, y la URL pública reemplaza a la estable.
//
// El formulario guarda la URL ESTABLE `/api/district-clubs/media/{id}`, que
// no caduca: el servidor la resuelve en cada lectura. Por eso un borrador
// retomado otro día sigue mostrando su logo, y un archivo todavía privado no
// tiene una URL pública que filtrar.
//
// Pertenencia: un archivo del formulario pertenece a UN borrador (token
// secreto generado por el servidor); uno del portal, a UN perfil (sesión del
// portal). Confirmar, eliminar o vincular un archivo exige ser su dueño:
// un club no toca lo de otro.
// ════════════════════════════════════════════════════════════════════
import { randomUUID, createHash } from 'node:crypto';
import db from './db.js';
import {
    CLUB_MEDIA_ROLES, ROLE_LABELS, ACCEPTED_FORMATS, OUTPUT_MAX_DIMENSION, MIN_DIMENSION, MAX_INPUT_PIXELS,
    checkUploadMeta, maxBytesFor, galleryMax, formatLimit, formatMB, safeDisplayName, viewPathFor,
    mediaIdsIn, rewriteMediaUrls, STATE_LABELS,
} from './clubMediaSpec.js';
import storage, { ORIGINALS_PREFIX, FILES_PREFIX, PUBLIC_PREFIX } from './clubMediaStorage.js';

// ─── Esquema ───────────────────────────────────────────────────────────
// Todo `ADD COLUMN` futuro va enumerado en `OWNED_COLUMNS` (la trampa de
// v4.908: si no, el atajo de abajo hace que el ALTER no corra nunca).
export const OWNED_COLUMNS = { DistrictClubMedia: [] };
let _ready = false;
export async function ensureClubMediaSchema() {
    if (_ready) return;
    const { rows } = await db.query(`SELECT to_regclass('public."DistrictClubMedia"') IS NOT NULL AS t`);
    if (rows[0]?.t) { _ready = true; return; }
    await db.query(`
        CREATE TABLE IF NOT EXISTS "DistrictClubMedia" (
            id TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'subiendo',
            "ownerKind" TEXT NOT NULL DEFAULT 'borrador',
            "draftToken" TEXT,
            "profileId" TEXT,
            "submissionId" TEXT,
            "uploadedBy" TEXT,
            "originalName" TEXT,
            "declaredType" TEXT,
            "declaredBytes" BIGINT,
            "originalKey" TEXT,
            "originalBytes" BIGINT,
            "detectedFormat" TEXT,
            sha256 TEXT,
            "storageKey" TEXT,
            "outputType" TEXT,
            bytes BIGINT,
            width INT,
            height INT,
            converted BOOLEAN NOT NULL DEFAULT FALSE,
            "publicKey" TEXT,
            "publicUrl" TEXT,
            "duplicateOf" TEXT,
            attempts INT NOT NULL DEFAULT 0,
            "errorCode" TEXT,
            "errorMessage" TEXT,
            history JSONB NOT NULL DEFAULT '[]'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "confirmedAt" TIMESTAMPTZ,
            "publishedAt" TIMESTAMPTZ,
            "deletedAt" TIMESTAMPTZ,
            "purgedAt" TIMESTAMPTZ
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "DistrictClubMedia_draft_idx" ON "DistrictClubMedia" ("draftToken")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "DistrictClubMedia_profile_idx" ON "DistrictClubMedia" ("profileId")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "DistrictClubMedia_submission_idx" ON "DistrictClubMedia" ("submissionId")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "DistrictClubMedia_status_idx" ON "DistrictClubMedia" (status, "updatedAt")`);
    _ready = true;
}

// ─── Errores con código ────────────────────────────────────────────────
export class ClubMediaError extends Error {
    constructor(code, message, { status = 400, hint = null } = {}) {
        super(message);
        this.code = code;
        this.status = status;
        this.hint = hint;
    }
}

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

const historyEntry = (event, by, extra = {}) => ({ at: new Date().toISOString(), event, by: by || null, ...extra });

const appendHistory = (id, entry, client = db) =>
    client.query(`UPDATE "DistrictClubMedia" SET history = COALESCE(history, '[]'::jsonb) || $2::jsonb, "updatedAt" = NOW() WHERE id = $1`, [id, JSON.stringify([entry])]);

// ─── Pertenencia ───────────────────────────────────────────────────────
// owner = { kind: 'borrador', draftToken } | { kind: 'portal', profileId, email } | { kind: 'admin', name }
export const ownsRow = (row, owner) => {
    if (!row || !owner) return false;
    if (owner.kind === 'admin') return true;
    if (owner.kind === 'portal') return Boolean(owner.profileId) && row.profileId === owner.profileId;
    if (owner.kind === 'borrador') return Boolean(owner.draftToken) && row.draftToken === owner.draftToken;
    return false;
};

const ownerWhere = (owner, startIndex = 1) => {
    if (owner.kind === 'portal') return { sql: `"profileId" = $${startIndex}`, params: [owner.profileId] };
    return { sql: `"draftToken" = $${startIndex}`, params: [owner.draftToken] };
};

// ─── Forma pública de una fila ─────────────────────────────────────────
export const shapeMedia = (row) => {
    if (!row) return null;
    const live = row.status === 'guardado' || row.status === 'publicado';
    return {
        id: row.id,
        role: row.role,
        roleLabel: ROLE_LABELS[row.role] || row.role,
        status: row.status,
        statusLabel: STATE_LABELS[row.status] || row.status,
        name: row.originalName || 'imagen',
        url: live ? (row.publicUrl || viewPathFor(row.id)) : null,
        viewUrl: viewPathFor(row.id),
        published: Boolean(row.publicUrl),
        originalBytes: row.originalBytes != null ? Number(row.originalBytes) : (row.declaredBytes != null ? Number(row.declaredBytes) : null),
        bytes: row.bytes != null ? Number(row.bytes) : null,
        width: row.width ?? null,
        height: row.height ?? null,
        format: row.detectedFormat || null,
        outputType: row.outputType || null,
        converted: Boolean(row.converted),
        duplicateOf: row.duplicateOf || null,
        errorCode: row.errorCode || null,
        error: row.errorMessage || null,
        attempts: Number(row.attempts) || 0,
        createdAt: row.createdAt,
        confirmedAt: row.confirmedAt,
        publishedAt: row.publishedAt,
        deletedAt: row.deletedAt,
    };
};

export const getMediaRow = async (id) => {
    if (!isUuid(id)) return null;
    await ensureClubMediaSchema();
    const { rows } = await db.query(`SELECT * FROM "DistrictClubMedia" WHERE id = $1`, [String(id).toLowerCase()]);
    return rows[0] || null;
};

// ─── 1. Preparar la subida ─────────────────────────────────────────────
export async function createUpload({ owner, role, filename, contentType, size }) {
    await ensureClubMediaSchema();
    const verdict = checkUploadMeta({ role, filename, contentType, size });
    if (!verdict.ok) throw new ClubMediaError(verdict.code, verdict.error, { hint: verdict.hint });

    if (role === 'gallery') {
        const w = ownerWhere(owner);
        const { rows } = await db.query(
            `SELECT count(*)::int AS n FROM "DistrictClubMedia" WHERE ${w.sql} AND role = 'gallery' AND status IN ('guardado','publicado','subiendo','procesando') AND "createdAt" > NOW() - INTERVAL '180 days'`,
            w.params,
        );
        // Tope holgado (el doble de la galería): cuenta también fotos que la
        // persona quitó de la galería sin eliminarlas. El tope REAL se aplica
        // sobre la galería que se envía.
        if ((rows[0]?.n || 0) >= galleryMax() * 2) {
            throw new ClubMediaError('gallery_full', `La galería admite hasta ${galleryMax()} fotografías.`, { hint: 'Elimina las que no vas a usar antes de agregar más.' });
        }
    }

    const id = randomUUID();
    const { key, uploadUrl } = await storage.presignOriginalUpload({ id, ext: verdict.ext, contentType: verdict.uploadType });
    await db.query(
        `INSERT INTO "DistrictClubMedia" (id, role, status, "ownerKind", "draftToken", "profileId", "uploadedBy",
            "originalName", "declaredType", "declaredBytes", "originalKey", history)
         VALUES ($1, $2, 'subiendo', $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
        [
            id, role, owner.kind === 'portal' ? 'portal' : 'borrador',
            owner.kind === 'borrador' ? owner.draftToken : null,
            owner.kind === 'portal' ? owner.profileId : null,
            owner.email || owner.name || (owner.kind === 'borrador' ? 'formulario público' : null),
            safeDisplayName(filename), String(contentType || '').slice(0, 120) || null, Number(size) || null,
            key,
            JSON.stringify([historyEntry('subida_preparada', owner.email || owner.name || null, { role })]),
        ],
    );
    return { id, uploadUrl, contentType: verdict.uploadType, maxBytes: verdict.maxBytes, maxLabel: formatLimit(verdict.maxBytes) };
}

// ─── 2. Procesar la imagen ─────────────────────────────────────────────
let _sharp = null;
const getSharp = async () => _sharp || (_sharp = (await import('sharp')).default);

/**
 * Bytes → versión limpia para el web. Puro respecto de S3 y de la base (lo
 * prueba `test:club-media`). Lanza `ClubMediaError` con un código y un
 * mensaje para la persona.
 */
export async function processImage(buffer, role) {
    const { sniffImageBytes, convertHeicToJpeg } = await import('./heicImages.js');
    const format = sniffImageBytes(buffer);
    if (!format || !ACCEPTED_FORMATS.includes(format)) {
        throw new ClubMediaError(
            'not_image',
            format === 'avif'
                ? 'El archivo es AVIF, un formato que todavía no se admite aquí.'
                : 'El contenido del archivo no es una imagen PNG, JPG, WEBP ni HEIC (aunque su nombre lo parezca).',
            { hint: 'Exporta la imagen como PNG o JPG y vuelve a subirla.' },
        );
    }
    const sharp = await getSharp();
    let input = buffer;
    let converted = false;
    if (format === 'heif') {
        try {
            const r = await convertHeicToJpeg(buffer, { maxDimension: 4096 });
            input = r.buffer;
            converted = true;
        } catch (e) {
            throw new ClubMediaError('heic', 'No pudimos convertir esta foto HEIC de iPhone/Android.', {
                hint: 'Vuelve a intentarlo; si persiste, en el iPhone ve a Ajustes → Cámara → Formatos → «Más compatible», o comparte la foto como JPG.',
            });
        }
    }

    let meta;
    try {
        meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    } catch {
        throw new ClubMediaError('corrupt', 'La imagen está dañada o incompleta y no se puede leer.', { hint: 'Ábrela en el dispositivo para confirmar que se ve, y vuelve a subirla.' });
    }
    const swapped = (meta.orientation || 1) >= 5;
    const w = (swapped ? meta.height : meta.width) || 0;
    const h = (swapped ? meta.width : meta.height) || 0;
    if (w < MIN_DIMENSION || h < MIN_DIMENSION) {
        throw new ClubMediaError('too_small', `La imagen mide ${w}×${h} px: es demasiado pequeña para publicarse.`, { hint: 'Sube una versión de al menos 300 px de ancho.' });
    }

    const max = OUTPUT_MAX_DIMENSION[role] || 2560;
    // `.rotate()` sin argumentos endereza según EXIF; sharp NO copia los
    // metadatos a la salida (no se llama a `withMetadata`): sin GPS, sin
    // modelo de cámara, sin fecha.
    let pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
    const keepAlpha = role === 'logo' && Boolean(meta.hasAlpha);
    let outputType;
    let ext;
    if (keepAlpha) {
        // El logotipo con fondo transparente se conserva transparente.
        pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
        outputType = 'image/png';
        ext = 'png';
    } else {
        pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: role === 'logo' ? 92 : 85, mozjpeg: true });
        outputType = 'image/jpeg';
        ext = 'jpg';
    }
    let out;
    try {
        out = await pipeline.toBuffer({ resolveWithObject: true });
    } catch {
        throw new ClubMediaError('corrupt', 'La imagen está dañada o incompleta y no se puede procesar.', { hint: 'Ábrela en el dispositivo para confirmar que se ve, y vuelve a subirla.' });
    }
    return {
        buffer: out.data,
        width: out.info.width,
        height: out.info.height,
        outputType,
        ext,
        format,
        converted,
        hadAlpha: Boolean(meta.hasAlpha),
    };
}

// ─── 3. Confirmar ──────────────────────────────────────────────────────
export async function confirmUpload({ owner, id }) {
    await ensureClubMediaSchema();
    const row = await getMediaRow(id);
    if (!row || row.status === 'eliminado') throw new ClubMediaError('not_found', 'No encontramos esa subida. Vuelve a elegir el archivo.', { status: 404 });
    if (!ownsRow(row, owner)) throw new ClubMediaError('forbidden', 'Este archivo no pertenece a tu formulario.', { status: 403 });
    if (row.status === 'guardado' || row.status === 'publicado') return { media: shapeMedia(row), duplicate: false };
    if (row.status === 'duplicado' && row.duplicateOf) {
        const orig = await getMediaRow(row.duplicateOf);
        if (orig && (orig.status === 'guardado' || orig.status === 'publicado')) return { media: shapeMedia(orig), duplicate: true };
    }

    // Candado: una sola confirmación a la vez por archivo (doble clic,
    // reintento del navegador). Un `procesando` de más de 3 minutos se da por
    // muerto (la función tiene 120 s).
    const claim = await db.query(
        `UPDATE "DistrictClubMedia" SET status = 'procesando', attempts = attempts + 1, "errorCode" = NULL, "errorMessage" = NULL, "updatedAt" = NOW()
         WHERE id = $1 AND (status IN ('subiendo','error') OR (status = 'procesando' AND "updatedAt" < NOW() - INTERVAL '3 minutes'))
         RETURNING id`,
        [row.id],
    );
    if (!claim.rowCount) throw new ClubMediaError('busy', 'Este archivo ya se está procesando. Espera unos segundos.', { status: 409 });

    const by = owner.email || owner.name || null;
    const failWith = async (err) => {
        const code = err instanceof ClubMediaError ? err.code : 'storage';
        const message = err instanceof ClubMediaError ? err.message : 'No pudimos guardar el archivo en el almacenamiento.';
        await db.query(
            `UPDATE "DistrictClubMedia" SET status = 'error', "errorCode" = $2, "errorMessage" = $3, "updatedAt" = NOW() WHERE id = $1`,
            [row.id, code, message],
        );
        await appendHistory(row.id, historyEntry('error', by, { code }));
        if (!(err instanceof ClubMediaError)) console.error('[club-media] confirmación fallida', row.id, err?.message);
        throw err instanceof ClubMediaError ? err : new ClubMediaError('storage', message, { status: 502, hint: 'Vuelve a intentarlo en un momento.' });
    };

    try {
        const size = await storage.headSize(row.originalKey);
        if (size == null) {
            throw new ClubMediaError('missing', 'El archivo no llegó al almacenamiento (la subida se interrumpió).', { hint: 'Vuelve a intentarlo; tus demás datos siguen guardados.' });
        }
        const max = maxBytesFor(row.role);
        if (size <= 0) throw new ClubMediaError('empty', 'El archivo llegó vacío.', { hint: 'Vuelve a elegirlo.' });
        if (size > max) {
            await storage.deleteObject(row.originalKey);
            throw new ClubMediaError('too_large', `El archivo pesa ${formatMB(size)} y el límite para este campo es ${formatLimit(max)}.`, { hint: 'Reduce su tamaño y vuelve a subirlo.' });
        }
        const original = await storage.readObject(row.originalKey);
        const sha256 = createHash('sha256').update(original).digest('hex');

        // ¿Ya subió exactamente este archivo para este mismo campo? Se
        // devuelve el que ya estaba: ni copia nueva, ni dos fotos iguales.
        const w = ownerWhere(owner, 3);
        const { rows: dup } = await db.query(
            `SELECT * FROM "DistrictClubMedia" WHERE sha256 = $1 AND role = $2 AND ${w.sql} AND id <> $4 AND status IN ('guardado','publicado') ORDER BY "createdAt" ASC LIMIT 1`,
            [sha256, row.role, ...w.params, row.id],
        );
        if (dup[0]) {
            await db.query(
                `UPDATE "DistrictClubMedia" SET status = 'duplicado', sha256 = $2, "originalBytes" = $3, "duplicateOf" = $4, "confirmedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
                [row.id, sha256, size, dup[0].id],
            );
            await appendHistory(row.id, historyEntry('duplicado', by, { of: dup[0].id }));
            await storage.deleteObject(row.originalKey);
            return { media: shapeMedia(dup[0]), duplicate: true };
        }

        const img = await processImage(original, row.role);
        const storageKey = `${FILES_PREFIX}${row.id}.${img.ext}`;
        await storage.putObject({ key: storageKey, body: img.buffer, contentType: img.outputType });
        // Comprobación por bytes: lo escrito existe y pesa lo que debe.
        const written = await storage.headSize(storageKey);
        if (written !== img.buffer.length) {
            throw new ClubMediaError('storage', 'El almacenamiento no confirmó la escritura del archivo.', { status: 502, hint: 'Vuelve a intentarlo.' });
        }

        let publicKey = null;
        let publicUrl = null;
        if (owner.kind === 'portal') {
            // Desde el portal el club edita su perfil PUBLICADO: lo que sube se
            // publica al guardarse (no hay revisión previa en ese flujo).
            publicKey = `${PUBLIC_PREFIX}${safeSegment(owner.profileId)}/${row.id}.${img.ext}`;
            publicUrl = await storage.putObject({ key: publicKey, body: img.buffer, contentType: img.outputType, isPublic: true });
        }

        const { rows: done } = await db.query(
            `UPDATE "DistrictClubMedia" SET
                status = $2, sha256 = $3, "originalBytes" = $4, "detectedFormat" = $5, "storageKey" = $6,
                "outputType" = $7, bytes = $8, width = $9, height = $10, converted = $11,
                "publicKey" = $12, "publicUrl" = $13, "confirmedAt" = NOW(),
                "publishedAt" = CASE WHEN $13::text IS NULL THEN NULL ELSE NOW() END,
                "errorCode" = NULL, "errorMessage" = NULL, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [row.id, publicUrl ? 'publicado' : 'guardado', sha256, size, img.format, storageKey,
                img.outputType, img.buffer.length, img.width, img.height, img.converted, publicKey, publicUrl],
        );
        await appendHistory(row.id, historyEntry(publicUrl ? 'guardado_y_publicado' : 'guardado', by, { bytes: img.buffer.length, converted: img.converted }));
        return { media: shapeMedia(done[0]), duplicate: false };
    } catch (err) {
        return failWith(err);
    }
}

const safeSegment = (v) => String(v || 'sin-perfil').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'sin-perfil';

// ─── 4. Eliminar (con red de seguridad) ────────────────────────────────
// No borra bytes: marca `eliminado`. El objeto se purga 30 días después y
// SÓLO si ningún formulario ni perfil lo sigue usando (ver `cleanupClubMedia`).
export async function deleteMedia({ owner, id }) {
    await ensureClubMediaSchema();
    const row = await getMediaRow(id);
    if (!row) throw new ClubMediaError('not_found', 'Ese archivo ya no existe.', { status: 404 });
    if (!ownsRow(row, owner)) throw new ClubMediaError('forbidden', 'Este archivo no pertenece a tu formulario.', { status: 403 });
    if (row.status === 'eliminado') return shapeMedia(row);
    const { rows } = await db.query(
        `UPDATE "DistrictClubMedia" SET status = 'eliminado', "deletedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
        [row.id],
    );
    await appendHistory(row.id, historyEntry('eliminado', owner.email || owner.name || null, { previous: row.status }));
    return shapeMedia(rows[0]);
}

// ─── 5. Lecturas ───────────────────────────────────────────────────────
/** Los archivos de un dueño (para que el formulario confirme lo que tiene). */
export async function listForOwner(owner, ids = []) {
    await ensureClubMediaSchema();
    const list = [...new Set((ids || []).filter(isUuid).map(v => String(v).toLowerCase()))].slice(0, 100);
    if (!list.length) return [];
    const { rows } = await db.query(`SELECT * FROM "DistrictClubMedia" WHERE id = ANY($1::text[])`, [list]);
    // Lo ajeno no se describe: sólo se dice que no es de este formulario.
    return rows.map(r => (ownsRow(r, owner) || r.publicUrl ? shapeMedia(r) : { id: r.id, status: 'ajeno', statusLabel: 'No pertenece a este formulario', url: null }));
}

/** Para el panel: lo referenciado por la solicitud + todo lo que se subió en
 *  su borrador (también lo que falló o se quitó: «identificar archivos que
 *  fallaron»). */
export async function listForSubmission(sub) {
    await ensureClubMediaSchema();
    const payload = typeof sub.payload === 'string' ? JSON.parse(sub.payload || '{}') : (sub.payload || {});
    const ids = mediaIdsIn(payload);
    const { rows } = await db.query(
        `SELECT * FROM "DistrictClubMedia"
          WHERE id = ANY($1::text[]) OR ("submissionId" = $2) OR ($3::text IS NOT NULL AND "draftToken" = $3)
          ORDER BY "createdAt" ASC LIMIT 300`,
        [ids, sub.id, sub.draftToken || null],
    );
    const referenced = new Set(ids);
    return rows.map(r => ({ ...shapeMedia(r), inSubmission: referenced.has(r.id) }));
}

// ─── 6. Vincular al ENVÍO ──────────────────────────────────────────────
/**
 * Al enviar el formulario: cada archivo del módulo que el payload nombra
 * tiene que ser de ESTE borrador (o del perfil que se actualiza) y estar
 * guardado. Lo que no cumpla se QUITA del payload, con su motivo: así nadie
 * puede colgar en su solicitud un archivo de otro club.
 */
export async function bindToSubmission({ payload, draftToken, profileId, submissionId }) {
    await ensureClubMediaSchema();
    const ids = mediaIdsIn(payload);
    if (!ids.length) return { payload, removed: [] };
    const { rows } = await db.query(`SELECT * FROM "DistrictClubMedia" WHERE id = ANY($1::text[])`, [ids]);
    const byId = new Map(rows.map(r => [r.id, r]));
    const removed = [];
    const ok = new Set();
    for (const id of ids) {
        const r = byId.get(id);
        const mine = r && ((draftToken && r.draftToken === draftToken) || (profileId && r.profileId === profileId) || r.publicUrl);
        if (r && mine && (r.status === 'guardado' || r.status === 'publicado')) ok.add(id);
        else removed.push({ id, reason: !r ? 'no_existe' : (!mine ? 'ajeno' : r.status) });
    }
    const clean = rewriteMediaUrls(payload, (id) => (ok.has(id) ? undefined : ''));
    if (Array.isArray(clean.gallery) && clean.gallery.length > galleryMax()) clean.gallery = clean.gallery.slice(0, galleryMax());
    if (ok.size && submissionId) {
        await db.query(
            `UPDATE "DistrictClubMedia" SET "submissionId" = $2, "updatedAt" = NOW() WHERE id = ANY($1::text[]) AND "submissionId" IS DISTINCT FROM $2`,
            [[...ok], submissionId],
        );
    }
    return { payload: clean, removed };
}

// ─── 7. Publicar ───────────────────────────────────────────────────────
/**
 * Al aprobar una solicitud (o al guardar desde el panel o el portal): cada
 * archivo del módulo pasa al prefijo PÚBLICO y su URL pública reemplaza a la
 * estable. Si una copia falla, queda la estable —que sigue funcionando— y se
 * registra: aprobar no se cae por una foto.
 */
export async function publishMediaInPayload({ payload, profileId, by = null }) {
    await ensureClubMediaSchema();
    const ids = mediaIdsIn(payload);
    if (!ids.length) return { payload, published: 0, failed: [] };
    const { rows } = await db.query(`SELECT * FROM "DistrictClubMedia" WHERE id = ANY($1::text[])`, [ids]);
    const urls = new Map();
    const failed = [];
    let published = 0;
    for (const r of rows) {
        if (r.status === 'eliminado' && !r.publicUrl) { urls.set(r.id, ''); continue; }
        if (r.publicUrl) { urls.set(r.id, r.publicUrl); continue; }
        if (!r.storageKey) { failed.push({ id: r.id, reason: r.status }); urls.set(r.id, ''); continue; }
        const ext = r.outputType === 'image/png' ? 'png' : 'jpg';
        const publicKey = `${PUBLIC_PREFIX}${safeSegment(profileId || r.profileId)}/${r.id}.${ext}`;
        try {
            const publicUrl = await storage.copyToPublic({ fromKey: r.storageKey, toKey: publicKey, contentType: r.outputType || 'image/jpeg' });
            await db.query(
                `UPDATE "DistrictClubMedia" SET status = 'publicado', "publicKey" = $2, "publicUrl" = $3, "publishedAt" = NOW(),
                    "profileId" = COALESCE("profileId", $4), "updatedAt" = NOW() WHERE id = $1`,
                [r.id, publicKey, publicUrl, profileId || null],
            );
            await appendHistory(r.id, historyEntry('publicado', by, { profileId: profileId || null }));
            urls.set(r.id, publicUrl);
            published++;
        } catch (e) {
            console.error('[club-media] no pude publicar', r.id, e?.message);
            failed.push({ id: r.id, reason: 'storage' });
        }
    }
    const next = rewriteMediaUrls(payload, (id) => urls.get(id));
    return { payload: next, published, failed };
}

// ─── 8. Limpieza de lo REALMENTE abandonado ───────────────────────────
// · subidas que nunca se confirmaron (o fallaron) hace más de 2 días: se
//   borra el original y la fila queda `eliminado` con el motivo;
// · archivos eliminados por la persona hace más de 30 días que NINGÚN
//   formulario ni perfil referencia: se purgan sus objetos.
// Un archivo `guardado` de un borrador NUNCA se toca, por viejo que sea.
let _lastCleanup = 0;
export async function cleanupClubMedia({ limit = 25, force = false } = {}) {
    if (!force && Date.now() - _lastCleanup < 6 * 3600 * 1000) return { skipped: true };
    _lastCleanup = Date.now();
    await ensureClubMediaSchema();
    let abandoned = 0;
    let purged = 0;
    const { rows: stale } = await db.query(
        `SELECT id, "originalKey" FROM "DistrictClubMedia"
          WHERE status IN ('subiendo','error') AND "updatedAt" < NOW() - INTERVAL '2 days'
          ORDER BY "updatedAt" ASC LIMIT $1`,
        [limit],
    );
    for (const r of stale) {
        await storage.deleteObject(r.originalKey);
        await db.query(`UPDATE "DistrictClubMedia" SET status = 'eliminado', "errorCode" = COALESCE("errorCode", 'abandonado'), "deletedAt" = NOW(), "purgedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`, [r.id]);
        abandoned++;
    }
    const { rows: gone } = await db.query(
        `SELECT m.id, m."originalKey", m."storageKey", m."publicKey" FROM "DistrictClubMedia" m
          WHERE m.status = 'eliminado' AND m."purgedAt" IS NULL AND m."deletedAt" < NOW() - INTERVAL '30 days'
          ORDER BY m."deletedAt" ASC LIMIT $1`,
        [limit],
    );
    for (const r of gone) {
        const needle = `%${r.id}%`;
        const { rows: refs } = await db.query(
            `SELECT 1 FROM "DistrictClubSubmission" WHERE payload::text LIKE $1
             UNION ALL SELECT 1 FROM "DistrictClubProfile" WHERE COALESCE("logoUrl",'') LIKE $1 OR COALESCE("coverImageUrl",'') LIKE $1 OR COALESCE(gallery::text,'') LIKE $1
             LIMIT 1`,
            [needle],
        ).catch(() => ({ rows: [{ 1: 1 }] }));
        if (refs.length) continue;
        await storage.deleteObject(r.originalKey);
        await storage.deleteObject(r.storageKey);
        if (r.publicKey) await storage.deleteObject(r.publicKey);
        await db.query(`UPDATE "DistrictClubMedia" SET "purgedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`, [r.id]);
        purged++;
    }
    return { abandoned, purged };
}

export { CLUB_MEDIA_ROLES, ORIGINALS_PREFIX };

export default {
    ensureClubMediaSchema, ClubMediaError, ownsRow, shapeMedia, getMediaRow, createUpload, processImage,
    confirmUpload, deleteMedia, listForOwner, listForSubmission, bindToSubmission, publishMediaInPayload,
    cleanupClubMedia, OWNED_COLUMNS,
};
