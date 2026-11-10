// ════════════════════════════════════════════════════════════════════
// Importar el comprobante de una inscripción desde una URL externa — v4.1312
//
// El FLUJO, en dos tiempos que el panel muestra como dos botones:
//
//   1. VERIFICAR (`verifyReceiptImport`): el servidor descarga el archivo
//      (`receiptUrlFetch.js`, con las reglas contra SSRF), lee QUÉ ES por sus
//      bytes, calcula su huella, comprueba que no sea ya el comprobante
//      vigente y guarda una COPIA en el prefijo privado del evento. Devuelve
//      la clave «en espera» y un enlace firmado para la vista previa. Nada
//      queda vinculado todavía.
//   2. IMPORTAR (`commitReceiptImport`): vincula esa copia a la inscripción
//      ABIERTA —por su id, nunca por nombre, correo o documento— a través del
//      MISMO camino que una subida (`replaceCompletedReceipt`): comprobación
//      del objeto real, UPDATE condicionado al comprobante anterior e
//      historial. Sin verificación previa, hace los dos pasos seguidos.
//
// ⚠️ Lo que NO hace, a propósito: no cambia el estado, no confirma el pago,
// no toca el valor ni la conciliación, no escribe en la Bóveda ni en
// `EventRegistrationPayment`. El comprobante es EVIDENCIA; validarlo sigue
// siendo «Validar inscripción» / «Marcar pago confirmado».
//
// ⚠️ Sin archivos huérfanos por un fallo propio: si la vinculación falla, la
// copia subida en ESA petición se borra. La copia de una verificación se
// conserva para poder reintentar; si nadie la reclama, la limpia la regla de
// ciclo de vida del prefijo (como una subida prefirmada abandonada).
// ════════════════════════════════════════════════════════════════════
import { createHash } from 'node:crypto';
import db from './db.js';
import { clean, recordHistory } from './eventRegistrationStore.js';
import {
    receiptKeyBelongs, headReceipt, putReceiptObject, readReceiptObject, deleteReceiptObject, signedReceiptUrl,
} from './completedReceipts.js';
import {
    fetchReceiptFromUrl, importError, redactSourceUrl, hostOf, resolveReceiptName, extensionForMime, TYPE_LABELS,
} from './receiptUrlFetch.js';
import { replaceCompletedReceipt } from './completedReceiptChange.js';

const sha256Of = (buf) => createHash('sha256').update(buf).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;

const parsePayload = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
};

/** El resumen que ve el panel del archivo traído (sin la clave de S3). */
export const describeImportedFile = ({ name, mime, bytes, sourceHost, finalHost, redirects }) => ({
    name, mime, bytes,
    typeLabel: TYPE_LABELS[mime] || mime,
    sourceHost: sourceHost || null,
    finalHost: finalHost || null,
    redirects: Number(redirects) || 0,
});

// ── Duplicados ───────────────────────────────────────────────────────

/**
 * La huella del comprobante VIGENTE de la inscripción: la que guardó el
 * historial si ese archivo se importó; si no (vino del formulario o de una
 * subida), se lee el objeto y se calcula. `null` si no hay o no se puede leer.
 */
export const currentReceiptHash = async (row) => {
    if (!row?.receiptKey) return null;
    const { rows } = await db.query(
        `SELECT payload FROM "EventRegistrationHistory"
          WHERE "registrationId" = $1 AND type = 'receipt_replaced'
          ORDER BY "createdAt" DESC LIMIT 20`, [row.id]);
    for (const h of rows) {
        const next = parsePayload(h.payload)?.next;
        if (next?.key === row.receiptKey && HEX64.test(String(next?.sha256 || ''))) return next.sha256;
    }
    const buf = await readReceiptObject(row.receiptKey);
    return buf ? sha256Of(buf) : null;
};

/** ¿Este mismo archivo fue ANTES el comprobante de esta inscripción? (aviso, no bloqueo) */
const wasPreviousReceipt = async (row, sha256) => {
    const { rows } = await db.query(
        `SELECT 1 FROM "EventRegistrationHistory"
          WHERE "registrationId" = $1 AND type = 'receipt_replaced'
            AND payload->'next'->>'sha256' = $2
            AND payload->'next'->>'key' IS DISTINCT FROM $3
          LIMIT 1`, [row.id, sha256, row.receiptKey || null]);
    return rows.length > 0;
};

/**
 * Otras inscripciones DEL MISMO EVENTO cuyo comprobante vigente es este mismo
 * archivo. Sólo es un AVISO —un participante duplicado puede compartir el
 * soporte—: el comprobante se asocia exclusivamente a la inscripción abierta
 * y las otras no se tocan.
 */
const othersWithSameFile = async ({ eventId, registrationId, sha256 }) => {
    const { rows } = await db.query(
        `SELECT DISTINCT r.id, r."registrationCode", r."firstName", r."lastName"
           FROM "EventRegistrationHistory" h
           JOIN "EventCompletedRegistration" r ON r.id = h."registrationId"
          WHERE h."eventId" = $1 AND h.type = 'receipt_replaced'
            AND h."registrationId" <> $2
            AND h.payload->'next'->>'sha256' = $3
            AND r."receiptKey" = h.payload->'next'->>'key'
          LIMIT 5`, [eventId, registrationId, sha256]);
    return rows.map(r => ({
        id: r.id, code: r.registrationCode || null,
        name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || null,
    }));
};

const warningsFor = async ({ row, eventId, sha256 }) => {
    const warnings = [];
    if (await wasPreviousReceipt(row, sha256)) {
        warnings.push('Este archivo ya fue antes el comprobante de esta inscripción (está en su historial). Importarlo lo vuelve a dejar vigente.');
    }
    const others = await othersWithSameFile({ eventId, registrationId: row.id, sha256 });
    if (others.length) {
        const codes = others.map(o => o.code || o.name || o.id.slice(0, 8)).join(', ');
        warnings.push(`El mismo archivo es el comprobante de otra inscripción de este evento (${codes}). Sólo se asociará a la inscripción abierta; la otra no cambia.`);
    }
    return warnings;
};

// ── Guardar la copia ─────────────────────────────────────────────────

/** Descarga, valida y guarda la copia. No vincula nada. */
const fetchAndStore = async ({ row, event, url, name }) => {
    const fetched = await fetchReceiptFromUrl(url);
    if (!fetched.ok) return fetched;

    // Ya es el comprobante vigente → no se guarda otra copia.
    const current = await currentReceiptHash(row);
    if (current && current === fetched.sha256) return importError('duplicate');

    const finalName = resolveReceiptName({ given: name, disposition: fetched.disposition, finalUrl: fetched.finalUrl, mime: fetched.mime });
    const originalName = resolveReceiptName({ given: '', disposition: fetched.disposition, finalUrl: fetched.finalUrl, mime: fetched.mime });
    const sourceUrl = redactSourceUrl(url);
    const stored = await putReceiptObject({
        eventId: event.id,
        body: fetched.buffer,
        mime: fetched.mime,
        ext: extensionForMime(fetched.mime),
        // Los metadatos ATAN la copia a esta inscripción: una clave «en
        // espera» no la puede reclamar otra (ver `loadStaged`).
        metadata: {
            origin: 'url-import',
            'registration-id': row.id,
            sha256: fetched.sha256,
            'source-host': hostOf(url) || '',
            'final-host': hostOf(fetched.finalUrl) || '',
            redirects: String(fetched.redirects),
            'original-name': encodeURIComponent(originalName),
            // La huella del enlace (redactado) ata la copia al enlace que se
            // verificó; el enlace mismo puede pasar del tope de un metadato.
            'source-url-sha256': sha256Of(Buffer.from(sourceUrl || '')),
        },
    });
    if (!stored.ok) return importError('storage');

    // Confirmar que lo guardado se puede recuperar antes de seguir.
    const head = await headReceipt(stored.key);
    if (!head.ok || head.bytes !== fetched.bytes) {
        await deleteReceiptObject(stored.key);
        return importError('storage');
    }
    return {
        ok: true,
        key: stored.key,
        name: finalName,
        originalName,
        mime: fetched.mime,
        bytes: fetched.bytes,
        sha256: fetched.sha256,
        sourceUrl,
        sourceHost: hostOf(url),
        finalHost: hostOf(fetched.finalUrl),
        redirects: fetched.redirects,
    };
};

/**
 * La copia de una verificación previa: del prefijo de ESTE evento, existente,
 * destinada a ESTA inscripción (sus metadatos) y con su huella.
 */
const loadStaged = async ({ row, event, stagedKey, name }) => {
    const key = clean(stagedKey, 400);
    if (!receiptKeyBelongs(key, event.id)) return importError('staged');
    const head = await headReceipt(key);
    if (!head.ok) return importError('staged');
    const meta = head.metadata || {};
    if (meta.origin !== 'url-import' || meta['registration-id'] !== row.id || !HEX64.test(String(meta.sha256 || ''))) {
        return importError('staged');
    }
    const decode = (v) => { try { return decodeURIComponent(String(v || '')); } catch { return ''; } };
    const originalName = decode(meta['original-name']) || 'comprobante';
    const mime = head.mime;
    if (!TYPE_LABELS[mime]) return importError('staged');
    return {
        ok: true,
        key,
        name: resolveReceiptName({ given: name || originalName, disposition: null, finalUrl: '', mime }),
        originalName,
        mime,
        bytes: head.bytes,
        sha256: meta.sha256,
        sourceUrlHash: String(meta['source-url-sha256'] || ''),
        sourceHost: meta['source-host'] || null,
        finalHost: meta['final-host'] || null,
        redirects: Number(meta.redirects) || 0,
    };
};

// ── Los dos tiempos ──────────────────────────────────────────────────

/**
 * VERIFICAR: trae el archivo, lo valida y deja la copia en espera.
 * @returns {Promise<{ ok: true, stagedKey, file, previewUrl, warnings } | { ok: false, code, error }>}
 */
export const verifyReceiptImport = async ({ row, event, url, name }) => {
    const staged = await fetchAndStore({ row, event, url, name });
    if (!staged.ok) return staged;
    const previewUrl = await signedReceiptUrl(staged.key, { seconds: 600 });
    return {
        ok: true,
        stagedKey: staged.key,
        file: describeImportedFile(staged),
        previewUrl,
        warnings: await warningsFor({ row, eventId: event.id, sha256: staged.sha256 }),
        replaces: row.receiptKey ? (row.receiptName || 'comprobante actual') : null,
    };
};

/**
 * IMPORTAR: vincula la copia (la verificada, o una nueva si no hubo
 * verificación) a la inscripción abierta. El éxito sólo se informa después
 * de guardar Y vincular.
 */
export const commitReceiptImport = async ({ row, event, url, name, stagedKey, actor }) => {
    const sourceHost = hostOf(url);
    const fail = async (outcome) => {
        // El intento fallido también queda escrito: «¿por qué este registro no
        // tiene comprobante?» se tiene que poder contestar después.
        await recordHistory({
            registrationId: row.id, eventId: event.id, type: 'receipt_import_failed',
            comment: `No se pudo importar el comprobante desde un enlace externo${sourceHost ? ` (${sourceHost})` : ''}: ${outcome.error}`,
            actor,
            payload: { code: outcome.code, sourceUrl: redactSourceUrl(url), sourceHost, detail: outcome.detail || null },
        });
        console.warn(`[completed-receipt-import] ${row.id} ← ${sourceHost || 'enlace no válido'}: ${outcome.code}`);
        return outcome;
    };

    let staged;
    let uploadedNow = false;
    if (stagedKey) {
        staged = await loadStaged({ row, event, stagedKey, name });
        if (!staged.ok) return staged; // el panel vuelve a verificar; no es un intento fallido
        // La copia en espera es la de ESTE enlace: si el administrador cambió
        // la URL después de verificar, se vuelve a verificar.
        const redacted = redactSourceUrl(url);
        if (!redacted || sha256Of(Buffer.from(redacted)) !== staged.sourceUrlHash) return importError('staged');
        staged.sourceUrl = redacted;
    } else {
        staged = await fetchAndStore({ row, event, url, name });
        if (!staged.ok) return fail(staged);
        uploadedNow = true;
    }

    // Entre verificar e importar pudo cambiar el comprobante vigente.
    const current = await currentReceiptHash(row);
    if (current && current === staged.sha256) {
        if (uploadedNow) await deleteReceiptObject(staged.key);
        return importError('duplicate');
    }

    const importInfo = {
        sourceUrl: staged.sourceUrl,
        sourceHost: staged.sourceHost,
        finalHost: staged.finalHost,
        redirects: staged.redirects,
        originalName: staged.originalName,
        sha256: staged.sha256,
        bytes: staged.bytes,
        mime: staged.mime,
        verifiedBeforeImport: Boolean(stagedKey),
        importedAt: new Date().toISOString(),
    };
    const result = await replaceCompletedReceipt({
        row, eventId: event.id,
        receipt: { key: staged.key, name: staged.name, contentType: staged.mime },
        actor, via: 'url_import', importInfo,
    });
    if (!result.ok) {
        if (uploadedNow) await deleteReceiptObject(staged.key);
        return fail(importError('link', { detail: result.error, httpStatus: result.status }));
    }
    if (result.unchanged) return importError('duplicate');
    return { ok: true, row: result.row, file: describeImportedFile(staged) };
};

export default { verifyReceiptImport, commitReceiptImport, currentReceiptHash, describeImportedFile };
