// ════════════════════════════════════════════════════════════════════
// Programas — el formulario institucional: el almacén — v4.1286.0
//
// Un envío (`ProgramIntake`) es una PROPUESTA. Nada de lo que se escribe acá
// toca el programa: la única puerta hacia el contenido vivo es `applyItems`,
// que convierte lo APROBADO en solicitudes de cambio del flujo editorial de
// siempre (`createChangeRequest`), con el envío como origen. Desde ahí, la
// revisión médica, la aprobación y la publicación son las que ya existían.
//
// El historial sólo crece con `history || $x::jsonb`. Las decisiones por
// ítem se escriben con `jsonb_set` sobre su clave, así que dos revisores en
// ítems distintos no se pisan.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import db from './db.js';
import ensureProgramSchema from './ensureProgramSchema.js';
import { audit, createChangeRequest, getProgram, registerFile } from './programStore.js';
import { makeRef, shapeChangeRequest, validateChangeRequest } from './programSpec.js';
import { intakeItems, planForItem, isHealthProgram, shapeIntakeConfig, INTAKE_EDITABLE, PRIVATE_PURPOSES, SENDER_RELATIONS, INTAKE_FORMATS } from './programIntakeSpec.js';
import { publishIntakeObject } from './programIntakeFiles.js';

const one = (r) => r.rows[0] || null;
const actorCols = (actor = {}) => ({ id: actor.id || null, name: actor.name || 'Administración' });
const evento = ({ type, from = null, to = null, actor = {}, detail = '' }) => JSON.stringify([{
    at: new Date().toISOString(), type, from, to, actor: actor.id || null, actorName: actor.name || null, detail: String(detail || '').slice(0, 1000),
}]);

const INTAKE_COLS = `id, "publicRef", "programId", "submissionType", sections, status, sender, "senderEmail", data, consents, "consentText", review, "reviewNote",
    "ownerUserId", "originHost", "submittedAt", "reviewedBy", "reviewedByName", "reviewedAt", "appliedAt", version, history, "lastSavedAt", "createdAt", "updatedAt"`;
const FILE_COLS = `id, "intakeId", "programId", purpose, "storageKey", filename, "contentType", bytes, format, kind, status, "uploadId", meta, "mediaId", "mediaUrl",
    "programFileId", "promotedAt", "promoteError", "createdAt", "updatedAt"`;

// ─── Envíos ───────────────────────────────────────────────────────────

export async function createIntake({ programId, submissionType, sections, sender, consents, tokenHash, ownerUserId = null, originHost = null }) {
    await ensureProgramSchema();
    let ref = makeRef('FP');
    for (let i = 0; i < 5; i++) {
        if (!(await db.query(`SELECT 1 FROM "ProgramIntake" WHERE "publicRef" = $1`, [ref])).rows.length) break;
        ref = makeRef('FP');
    }
    const row = one(await db.query(
        `INSERT INTO "ProgramIntake" ("publicRef", "programId", "submissionType", sections, sender, "senderEmail", consents, "tokenHashes", "ownerUserId", "originHost", history)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb) RETURNING ${INTAKE_COLS}`,
        [ref, programId, submissionType, JSON.stringify(sections), JSON.stringify(sender), String(sender.email || '').toLowerCase() || null, JSON.stringify(consents),
            JSON.stringify([tokenHash]), ownerUserId, originHost, evento({ type: 'created', to: 'borrador', actor: { name: 'Formulario institucional' } })]
    ));
    // En la auditoría NUNCA van los datos de quien envía: sólo la referencia.
    await audit({ programId, entityType: 'intake', entityId: row.id, action: 'created', actor: { name: 'Formulario institucional' }, detail: { ref, submissionType } });
    return row;
}

export async function getIntake(idOrRef) {
    await ensureProgramSchema();
    return one(await db.query(`SELECT ${INTAKE_COLS} FROM "ProgramIntake" WHERE id = $1 OR "publicRef" = $1 LIMIT 1`, [String(idOrRef || '')]));
}

/** El envío al que da acceso ESTE secreto (se compara su hash; el secreto no se guarda). */
export async function getIntakeByTokenHash(hash) {
    await ensureProgramSchema();
    return one(await db.query(`SELECT ${INTAKE_COLS} FROM "ProgramIntake" WHERE "tokenHashes" @> $1::jsonb LIMIT 1`, [JSON.stringify([hash])]));
}

/** Agrega un secreto nuevo (recuperación desde otro dispositivo) y conserva los cuatro anteriores. */
export async function addTokenHash(id, hash) {
    await db.query(
        `UPDATE "ProgramIntake" SET "tokenHashes" = (SELECT COALESCE(jsonb_agg(h), '[]'::jsonb) FROM (SELECT h FROM jsonb_array_elements("tokenHashes" || $2::jsonb) WITH ORDINALITY AS t(h, n) ORDER BY n DESC LIMIT 5) x)
          WHERE id = $1`,
        [id, JSON.stringify([hash])]
    );
}

export async function saveSection(id, key, value) {
    return one(await db.query(
        `UPDATE "ProgramIntake" SET data = jsonb_set(data, $2::text[], $3::jsonb, TRUE), version = version + 1, "lastSavedAt" = NOW(), "updatedAt" = NOW()
          WHERE id = $1 AND status = ANY($4::text[]) RETURNING ${INTAKE_COLS}`,
        [id, [key], JSON.stringify(value || {}), INTAKE_EDITABLE]
    ));
}

export async function saveMeta(id, { submissionType, sections, sender, consents, ownerUserId = null }) {
    return one(await db.query(
        `UPDATE "ProgramIntake" SET "submissionType" = $2, sections = $3::jsonb, sender = $4::jsonb, "senderEmail" = $5, consents = $6::jsonb,
            "ownerUserId" = COALESCE("ownerUserId", $7), version = version + 1, "lastSavedAt" = NOW(), "updatedAt" = NOW()
          WHERE id = $1 AND status = ANY($8::text[]) RETURNING ${INTAKE_COLS}`,
        [id, submissionType, JSON.stringify(sections), JSON.stringify(sender), String(sender.email || '').toLowerCase() || null, JSON.stringify(consents), ownerUserId, INTAKE_EDITABLE]
    ));
}

export const itemHash = (item) => crypto.createHash('sha1').update(JSON.stringify(item?.data ?? null)).digest('hex').slice(0, 16);

/**
 * Enviar (o reenviar tras ajustes). Lo que se pidió ajustar vuelve a «Sin
 * revisar», y lo aprobado que CAMBIÓ después de aprobarse pierde la
 * aprobación: nunca se aplica en silencio algo distinto de lo que se revisó.
 */
export async function submitIntake(id, { consentText }) {
    const prev = await getIntake(id);
    if (!prev || !INTAKE_EDITABLE.includes(prev.status)) return null;
    const review = { ...(prev.review || {}) };
    for (const it of intakeItems(prev)) {
        const d = review[it.key];
        if (!d || d.status === 'aplicado' || d.status === 'descartado') continue;
        if (d.status === 'ajustes' || (d.status === 'aprobado' && d.dataHash && d.dataHash !== itemHash(it))) {
            review[it.key] = { ...d, status: 'pendiente', previousStatus: d.status, previousNote: d.note || '', note: '' };
        }
    }
    const row = one(await db.query(
        `UPDATE "ProgramIntake" SET status = 'enviado', "submittedAt" = NOW(), "consentText" = $2::jsonb, review = $5::jsonb, history = history || $3::jsonb, "updatedAt" = NOW()
          WHERE id = $1 AND status = ANY($4::text[]) RETURNING ${INTAKE_COLS}`,
        [id, JSON.stringify(consentText), evento({ type: prev.status === 'ajustes' ? 'resubmitted' : 'submitted', from: prev.status, to: 'enviado', actor: { name: 'Remitente' } }), INTAKE_EDITABLE, JSON.stringify(review)]
    ));
    if (row) await audit({ programId: row.programId, entityType: 'intake', entityId: id, action: prev.status === 'ajustes' ? 'resubmitted' : 'submitted', actor: { name: 'Formulario institucional' }, detail: { ref: row.publicRef } });
    return row;
}

export async function transitionIntake(id, to, { actor, note = '' }) {
    const prev = await getIntake(id);
    if (!prev) return null;
    const a = actorCols(actor);
    const row = one(await db.query(
        `UPDATE "ProgramIntake" SET status = $2, "reviewNote" = CASE WHEN $2 = 'ajustes' THEN $3 ELSE "reviewNote" END,
            "reviewedBy" = $4, "reviewedByName" = $5, "reviewedAt" = NOW(), "appliedAt" = CASE WHEN $2 = 'aplicado' THEN NOW() ELSE "appliedAt" END,
            history = history || $6::jsonb, "updatedAt" = NOW() WHERE id = $1 RETURNING ${INTAKE_COLS}`,
        [prev.id, to, note || null, a.id, a.name, evento({ type: 'transition', from: prev.status, to, actor, detail: note })]
    ));
    await audit({ programId: row.programId, entityType: 'intake', entityId: row.id, action: `status:${to}`, actor, detail: { ref: row.publicRef, from: prev.status } });
    return row;
}

export async function listIntakes(programId, { status = '', q = '', page = 1, perPage = 25 } = {}) {
    await ensureProgramSchema();
    const params = [programId, status, q];
    const where = `"programId" = $1 AND ($2 = '' OR status = $2) AND ($3 = '' OR "publicRef" ILIKE '%' || $3 || '%' OR (sender->>'firstName') ILIKE '%' || $3 || '%' OR (sender->>'lastName') ILIKE '%' || $3 || '%')`;
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramIntake" WHERE ${where}`, params)).rows[0].n;
    const { rows } = await db.query(
        `SELECT id, "publicRef", "submissionType", sections, status, sender->>'firstName' AS "firstName", sender->>'lastName' AS "lastName", sender->>'relation' AS relation,
                sender->>'organization' AS organization, review, data, "submittedAt", "reviewedByName", "appliedAt", "lastSavedAt", "createdAt", "updatedAt"
           FROM "ProgramIntake" WHERE ${where} ORDER BY COALESCE("submittedAt", "updatedAt") DESC LIMIT $4 OFFSET $5`,
        [...params, perPage, (page - 1) * perPage]
    );
    const facets = (await db.query(`SELECT status, COUNT(*)::int AS n FROM "ProgramIntake" WHERE "programId" = $1 GROUP BY status`, [programId])).rows;
    return {
        total, page, perPage, facets,
        rows: rows.map(r => {
            const items = intakeItems(r);
            const review = r.review || {};
            const count = (s) => items.filter(i => (review[i.key]?.status || 'pendiente') === s).length;
            return { ...r, data: undefined, review: undefined, items: items.length, pending: count('pendiente'), approved: count('aprobado'), applied: count('aplicado') };
        }),
    };
}

/** Los borradores de un correo, para la recuperación (nunca se responde cuáles existen). */
export async function draftsByEmail(email) {
    await ensureProgramSchema();
    const { rows } = await db.query(
        `SELECT i.id, i."publicRef", i."programId", i.status, p.name AS "programName" FROM "ProgramIntake" i JOIN "Program" p ON p.id = i."programId"
          WHERE i."senderEmail" = $1 AND i.status = ANY($2::text[]) ORDER BY i."updatedAt" DESC LIMIT 10`,
        [String(email || '').toLowerCase(), INTAKE_EDITABLE]
    );
    return rows;
}

export async function draftsByUser(userId) {
    if (!userId) return [];
    await ensureProgramSchema();
    const { rows } = await db.query(
        `SELECT i.id, i."publicRef", i."programId", i.status, i."submissionType", i."lastSavedAt", p.name AS "programName", p.slug AS "programSlug"
           FROM "ProgramIntake" i JOIN "Program" p ON p.id = i."programId" WHERE i."ownerUserId" = $1 ORDER BY i."updatedAt" DESC LIMIT 20`,
        [userId]
    );
    return rows;
}

// ─── Revisión por ítem ────────────────────────────────────────────────

export async function setItemDecision(id, key, decision, { actor }) {
    const a = actorCols(actor);
    const value = { ...decision, by: a.id, byName: a.name, at: new Date().toISOString() };
    const row = one(await db.query(
        `UPDATE "ProgramIntake" SET review = jsonb_set(review, $2::text[], COALESCE(review->$3, '{}'::jsonb) || $4::jsonb, TRUE),
            status = CASE WHEN status = 'enviado' THEN 'en_revision' ELSE status END,
            "reviewedBy" = $5, "reviewedByName" = $6, "reviewedAt" = NOW(),
            history = history || $7::jsonb, "updatedAt" = NOW() WHERE id = $1 RETURNING ${INTAKE_COLS}`,
        [id, [key], key, JSON.stringify(value), a.id, a.name, evento({ type: 'item_review', actor, detail: `${key} → ${decision.status}${decision.note ? `: ${decision.note}` : ''}` })]
    ));
    if (row) await audit({ programId: row.programId, entityType: 'intake', entityId: id, action: `item:${decision.status}`, actor, detail: { ref: row.publicRef, item: key } });
    return row;
}

// ─── Archivos ─────────────────────────────────────────────────────────

export async function createFile({ intakeId, programId, purpose, storageKey, filename, contentType, bytes, kind, uploadId = null, status = 'uploading' }) {
    return one(await db.query(
        `INSERT INTO "ProgramIntakeFile" ("intakeId", "programId", purpose, "storageKey", filename, "contentType", bytes, kind, "uploadId", status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${FILE_COLS}`,
        [intakeId, programId, purpose, storageKey, filename, contentType, bytes, kind, uploadId, status]
    ));
}
export async function getFile(id) {
    return one(await db.query(`SELECT ${FILE_COLS} FROM "ProgramIntakeFile" WHERE id = $1 AND "deletedAt" IS NULL`, [String(id || '')]));
}
export async function filesOf(intakeId) {
    const { rows } = await db.query(`SELECT ${FILE_COLS} FROM "ProgramIntakeFile" WHERE "intakeId" = $1 AND "deletedAt" IS NULL ORDER BY "createdAt"`, [intakeId]);
    return rows;
}
export async function countFiles(intakeId) {
    return (await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramIntakeFile" WHERE "intakeId" = $1 AND "deletedAt" IS NULL`, [intakeId])).rows[0].n;
}
/** Una carga multiparte a medias del MISMO archivo (nombre + peso): se reanuda en vez de empezar de cero. */
export async function pendingUploadFor(intakeId, { filename, bytes, purpose }) {
    return one(await db.query(
        `SELECT ${FILE_COLS} FROM "ProgramIntakeFile" WHERE "intakeId" = $1 AND status = 'uploading' AND "uploadId" IS NOT NULL AND filename = $2 AND bytes = $3 AND purpose = $4 AND "deletedAt" IS NULL
          ORDER BY "createdAt" DESC LIMIT 1`,
        [intakeId, filename, bytes, purpose]
    ));
}
export async function markFileReady(id, { bytes, format, contentType }) {
    return one(await db.query(
        `UPDATE "ProgramIntakeFile" SET status = 'ready', bytes = $2, format = $3, "contentType" = COALESCE($4, "contentType"), "uploadId" = NULL, "updatedAt" = NOW() WHERE id = $1 RETURNING ${FILE_COLS}`,
        [id, bytes, format, contentType]
    ));
}
export async function markFileDeleted(id) {
    await db.query(`UPDATE "ProgramIntakeFile" SET status = 'deleted', "deletedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`, [id]);
}

// ─── Aplicar lo aprobado ──────────────────────────────────────────────

/** La carpeta «Programa · Nombre» de la Biblioteca del sitio. Idempotente; si falla, la raíz. */
async function ensureProgramFolder({ siteId, program, actor }) {
    try {
        const found = one(await db.query(`SELECT id FROM "MediaFolder" WHERE "clubId" IS NOT DISTINCT FROM $1 AND "sourceType" = 'program' AND "sourceId" = $2 LIMIT 1`, [siteId, program.id]));
        if (found) return found.id;
        for (const name of [`Programa · ${program.name}`, `Programa · ${program.name} (${program.slug})`]) {
            try {
                const r = one(await db.query(
                    `INSERT INTO "MediaFolder" (id, name, "clubId", "parentId", "createdBy", "sourceType", "sourceId") VALUES (gen_random_uuid()::text, $1, $2, NULL, $3, 'program', $4) RETURNING id`,
                    [name.slice(0, 120), siteId, actor?.id || null, program.id]
                ));
                if (r) return r.id;
            } catch (e) { if (e?.code !== '23505') throw e; }
        }
    } catch (e) { console.warn('[programas] carpeta del programa no resuelta:', e?.message); }
    return null;
}

/**
 * Publica UN archivo en la Biblioteca (versión web; el original queda
 * privado). Si ya se publicó —otro ítem lo usa—, devuelve la MISMA URL: un
 * archivo se referencia desde varios contenedores sin duplicarse.
 */
async function promoteFile(file, { siteId, program, actor, folderRef }) {
    if (file.mediaUrl) return { ok: true, url: file.mediaUrl, reused: true };
    const ext = String(file.format || '').toLowerCase();
    const kind = INTAKE_FORMATS[ext]?.kind || file.kind;
    const pub = await publishIntakeObject({ key: file.storageKey, siteId, ext, kind, bytes: file.bytes });
    if (!pub.ok) {
        await db.query(`UPDATE "ProgramIntakeFile" SET "promoteError" = $2, "updatedAt" = NOW() WHERE id = $1`, [file.id, String(pub.error).slice(0, 400)]);
        return { ok: false, error: pub.error };
    }
    if (folderRef.id === undefined) folderRef.id = await ensureProgramFolder({ siteId, program, actor });
    let mediaId = null;
    try {
        const type = kind === 'image' || kind === 'design' ? 'image' : kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'document';
        const name = `${String(file.filename || 'archivo').replace(/\.[^.]+$/, '')}${pub.optimized ? '.webp' : `.${ext}`}`;
        const m = one(await db.query(
            `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key", "folderId", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id`,
            [name.slice(0, 200), pub.url, type, Math.min(Number(pub.bytes) || 0, 2147483647), process.env.AWS_BUCKET_NAME || 'rotary-platform-assets', process.env.AWS_REGION || 'us-east-1', siteId, pub.key, folderRef.id || null]
        ));
        mediaId = m?.id || null;
    } catch (e) {
        console.warn('[programas] fila de Media no escrita (el archivo sí se publicó):', e?.message);
    }
    await db.query(`UPDATE "ProgramIntakeFile" SET "mediaId" = $2, "mediaUrl" = $3, "promotedAt" = NOW(), "promoteError" = NULL, "updatedAt" = NOW() WHERE id = $1`, [file.id, mediaId, pub.url]);
    file.mediaUrl = pub.url; file.mediaId = mediaId;
    return { ok: true, url: pub.url, mediaId, optimized: pub.optimized };
}

const PRIVATE_KIND = { authorization: 'autorizacion', document: 'documento_respaldo', support: 'documento_respaldo', brand: 'documento_respaldo', media: 'recurso', photo: 'recurso', logo: 'documento_respaldo' };

/** Un archivo PRIVADO del programa (ProgramFile) que apunta al MISMO objeto: no se copia nada. */
async function registerPrivate(file, { intake, actor, meta = {} }) {
    if (file.programFileId) return file.programFileId;
    const row = await registerFile({
        programId: file.programId, kind: PRIVATE_KIND[file.purpose] || 'documento_respaldo', storageKey: file.storageKey, filename: file.filename,
        contentType: file.contentType, bytes: Number(file.bytes) || 0, format: file.format, label: meta.title || file.filename,
        relatedType: 'intake', relatedId: intake.id, actor, meta: { ...meta, intakeRef: intake.publicRef, purpose: file.purpose },
    });
    await db.query(`UPDATE "ProgramIntakeFile" SET "programFileId" = $2, "updatedAt" = NOW() WHERE id = $1`, [file.id, row.id]);
    file.programFileId = row.id;
    return row.id;
}

/** ¿Qué archivos de un ítem pueden hacerse públicos? Lo decide la autorización de CADA pieza. */
const publicFileIds = (item) => {
    const d = item.data || {};
    const ids = (v) => (Array.isArray(v) ? v.map(x => x.id) : []);
    if (item.section === 'visual' && item.kind === 'fields') return [...ids(d.officialLogo), ...ids(d.logoVariants)];
    if (item.target === 'partners') return d.identityAuthorized ? ids(d.logo) : [];
    if (item.target === 'team') return d.publishAuthorized ? ids(d.photo) : [];
    if (item.target === 'story') return [...(d.authImage ? ids(d.photos) : []), ...(d.authVideo ? ids(d.videos) : [])];
    if (item.target === 'testimony') return d.imageAuthorized ? [...ids(d.photo), ...ids(d.media)] : [];
    if (item.target === 'resource') return ids(d.file);
    if (item.target === 'media') return d.permission === 'autorizado' ? ids(d.file) : [];
    return [];
};

/**
 * APLICA los ítems aprobados: archivos (versión web o privado), solicitudes
 * de cambio con el envío como origen, y el resultado en la revisión. Nunca
 * publica: cada solicitud nace «Enviada» (o «Borrador» si le falta algo para
 * enviarse) y sigue el flujo editorial con sus permisos de siempre.
 */
export async function applyItems(intakeId, { keys = null, actor, reviewerName = '' }) {
    const intake = await getIntake(intakeId);
    if (!intake) return { ok: false, error: 'Envío no encontrado.' };
    const program = await getProgram(intake.programId);
    const health = isHealthProgram(program, shapeIntakeConfig(program.intakeConfig));
    const review = intake.review || {};
    const items = intakeItems(intake).filter(i => (review[i.key]?.status === 'aprobado') && (!keys || keys.includes(i.key)) && (!review[i.key]?.dataHash || review[i.key].dataHash === itemHash(i)));
    if (!items.length) return { ok: false, error: 'No hay ítems aprobados pendientes de aplicar.' };
    const files = await filesOf(intake.id);
    const byId = Object.fromEntries(files.map(f => [f.id, f]));
    const siteId = program.ownerClubId || null;
    const folderRef = {};
    const sender = intake.sender || {};
    const senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ');
    const relation = SENDER_RELATIONS.find(r => r.id === sender.relation)?.label || sender.relationOther || '';
    const results = [];

    for (const item of items) {
        const out = { key: item.key, changeRequests: [], warnings: [], files: [] };
        try {
            // 1) Archivos: lo autorizado, versión web; lo demás, privado del programa.
            const publicIds = new Set(publicFileIds(item));
            const urls = {}; const privates = {};
            const referenced = JSON.stringify(item.data).match(/"id":"([A-Za-z0-9_-]{8,64})"/g)?.map(x => x.slice(6, -1)) || [];
            for (const fid of Array.from(new Set(referenced))) {
                const f = byId[fid];
                if (!f || f.status !== 'ready') continue;
                if (publicIds.has(fid) && !PRIVATE_PURPOSES.includes(f.purpose)) {
                    const p = await promoteFile(f, { siteId, program, actor, folderRef });
                    if (p.ok) { urls[fid] = p.url; out.files.push({ id: fid, url: p.url, reused: p.reused === true }); }
                    else out.warnings.push(`${f.filename}: ${p.error}`);
                }
                // El original SIEMPRE queda como archivo privado del programa (es la copia de alta calidad).
                privates[fid] = await registerPrivate(f, { intake, actor, meta: item.target === 'document' ? docMeta(item.data) : { title: f.filename } });
            }
            if (item.target === 'document') {
                out.result = 'Documento registrado como archivo PRIVADO del programa.';
                if (item.data.access === 'propuesto_publico') out.warnings.push('Se propuso hacerlo público: queda privado hasta que una persona autorizada lo decida.');
            } else if (item.target === 'media') {
                out.result = urls[(item.data.file || [])[0]?.id] ? 'Versión web en la Biblioteca del sitio; original privado.' : (item.data.externalUrl ? 'Enlace externo registrado.' : 'Guardado como material privado (sin autorización de publicación).');
            }
            // 2) Solicitudes de cambio del flujo editorial.
            const plan = planForItem(item, { program, health, urlOf: (id) => urls[id] || '', fileIdOf: (id) => privates[id] || null, reviewerFlags: review[item.key] || {} });
            out.warnings.push(...plan.notes);
            for (const r of plan.requests) {
                const shaped = shapeChangeRequest({
                    ...r, scopeType: 'central', title: String(r.title || item.label).slice(0, 150) || item.label,
                    body: `Propuesto desde el formulario institucional ${intake.publicRef} por ${senderName || 'remitente'}${relation ? ` (${relation})` : ''}. Revisado por ${reviewerName || actor?.name || 'el equipo del programa'}.`,
                    responsibleName: senderName || actor?.name || 'Formulario institucional', responsibleEmail: sender.email || '', responsiblePhone: sender.phone || '',
                    observations: review[item.key]?.note || '',
                });
                if (shaped.title.length < 5) shaped.title = `${shaped.title} · ${intake.publicRef}`;
                const full = validateChangeRequest(shaped, { submit: true });
                const status = full.ok ? 'enviado' : 'borrador';
                if (!full.ok) {
                    const draft = validateChangeRequest(shaped, { submit: false });
                    if (!draft.ok) throw new Error(draft.errors[0]?.message || 'La solicitud no se pudo preparar.');
                    out.warnings.push(`Quedó como BORRADOR en «Gestión de contenidos»: ${full.errors[0]?.message}`);
                }
                const cr = await createChangeRequest(program.id, shaped, { actor, status, origin: { intakeId: intake.id, intakeRef: intake.publicRef, itemKey: item.key } });
                out.changeRequests.push({ id: cr.id, ref: cr.publicRef, status: cr.status, kind: cr.kind, requiresMedicalReview: cr.requiresMedicalReview });
            }
            await db.query(
                `UPDATE "ProgramIntake" SET review = jsonb_set(review, $2::text[], COALESCE(review->$3, '{}'::jsonb) || $4::jsonb, TRUE), history = history || $5::jsonb, "updatedAt" = NOW() WHERE id = $1`,
                [intake.id, [item.key], item.key, JSON.stringify({ status: 'aplicado', appliedAt: new Date().toISOString(), appliedBy: actor?.name || null, changeRequests: out.changeRequests, files: out.files, warnings: out.warnings, result: out.result || null, error: null }),
                    evento({ type: 'item_applied', actor, detail: `${item.key}: ${out.changeRequests.map(c => c.ref).join(', ') || out.result || 'sin solicitud'}` })]
            );
            out.ok = true;
        } catch (e) {
            out.ok = false; out.error = e?.message || 'Error al aplicar.';
            await db.query(`UPDATE "ProgramIntake" SET review = jsonb_set(review, $2::text[], COALESCE(review->$3, '{}'::jsonb) || $4::jsonb, TRUE) WHERE id = $1`, [intake.id, [item.key], item.key, JSON.stringify({ error: out.error })]);
        }
        results.push(out);
    }
    const fresh = await getIntake(intake.id);
    const all = intakeItems(fresh);
    const done = all.every(i => ['aplicado', 'descartado'].includes(fresh.review?.[i.key]?.status));
    if (done && fresh.status !== 'aplicado') await transitionIntake(fresh.id, 'aplicado', { actor, note: 'Todos los ítems aplicados o descartados.' });
    await audit({ programId: program.id, entityType: 'intake', entityId: intake.id, action: 'applied', actor, detail: { ref: intake.publicRef, items: results.length, changeRequests: results.flatMap(r => r.changeRequests.map(c => c.ref)) } });
    return { ok: true, results, intake: await getIntake(intake.id) };
}

const docMeta = (d = {}) => ({
    title: d.title || '', docType: d.docType || '', issuer: d.issuer || '', issuedOn: d.issuedOn || '', validUntil: d.validUntil || '',
    // Privado POR DEFECTO, aunque se haya propuesto otra cosa: hacerlo público es una decisión aparte.
    access: 'privado', requestedAccess: d.access || 'privado',
});

/** Las solicitudes de cambio que salieron de un envío (para ver en qué quedó cada una). */
export async function changeRequestsOf(intakeId) {
    const { rows } = await db.query(
        `SELECT id, "publicRef", kind, operation, title, status, "requiresMedicalReview", "medicalReviewedAt", "publishedAt", "intakeItemKey" FROM "ProgramChangeRequest" WHERE "intakeId" = $1 ORDER BY "createdAt"`,
        [intakeId]
    );
    return rows;
}

/** El banco multimedia del programa: todo lo publicado desde envíos, con su uso sugerido. */
export async function mediaBank(programId) {
    await ensureProgramSchema();
    const { rows } = await db.query(
        `SELECT f.id, f.filename, f.kind, f.format, f.bytes, f."mediaUrl", f."mediaId", f."promotedAt", i."publicRef", i.data
           FROM "ProgramIntakeFile" f JOIN "ProgramIntake" i ON i.id = f."intakeId"
          WHERE f."programId" = $1 AND f."mediaUrl" IS NOT NULL AND f."deletedAt" IS NULL ORDER BY f."promotedAt" DESC LIMIT 300`,
        [programId]
    );
    return rows.map(r => {
        const piece = ((r.data?.multimedia || {}).items || []).find(x => (x.file || []).some(y => y.id === r.id)) || null;
        return {
            id: r.id, filename: r.filename, kind: r.kind, url: r.mediaUrl, mediaId: r.mediaId, promotedAt: r.promotedAt, intakeRef: r.publicRef,
            title: piece?.title || '', alt: piece?.alt || '', credit: piece?.credit || '', uses: piece?.uses || [], focus: piece?.focus || null, tags: piece?.tags || '',
        };
    });
}

export default {
    createIntake, getIntake, getIntakeByTokenHash, addTokenHash, saveSection, saveMeta, submitIntake, transitionIntake, listIntakes, draftsByEmail, draftsByUser,
    setItemDecision, itemHash, createFile, getFile, filesOf, countFiles, pendingUploadFor, markFileReady, markFileDeleted, applyItems, changeRequestsOf, mediaBank,
};
