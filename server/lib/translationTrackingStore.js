// ════════════════════════════════════════════════════════════════════════════
// Seguimiento de traducciones — la LECTURA por lotes y la barrida de vigencia
// (v4.1356.0)
//
// Para N proyectos del listado: UNA consulta por fuente (formulación, FDD,
// cabeceras de traducción con su versión verificada, campos traducidos) y el
// estado derivado con el MISMO criterio del expediente (`translationStatus`)
// más el seguimiento (`trackingOf`). Nada de una consulta por fila.
//
// La BARRIDA: si una verificación perdió vigencia porque cambió el original
// (un club guardó su formulario, el comité editó el expediente), se registra
// UNA vez por versión verificada —UPDATE condicional— con los campos
// afectados, y se avisa al Cadre asignado. Corre aquí (cada vez que alguien
// mira el listado o la traducción) y además tras cada guardado del club
// (`checkTranslationValidity`), así ningún camino de escritura que se olvide
// la deja sin registrar.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { resolveForms, storageIsShared } from './projectFormsRegistry.js';
import { withComputed } from './projectFormEngine.js';
import { ensureProjectDossierSchema } from './ensureProjectDossierSchema.js';
import D from './projectDossier.js';
import T from './translationTracking.js';
import {
    readConfigForSubmission, sendFairEmail, portalLinkFor, headerLogoHtml, footerBrandingHtml, logEvent,
} from '../controllers/projectFairController.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CHUNK = 500;

// La cabecera con el número de la versión verificada y cuántos campos se
// revisaron en ella (lo que dice la insignia), en la misma consulta.
export const HEADER_SQL = `
    SELECT h.*, v."versionNumber" AS "approvedVersionNumber",
           COALESCE(v."reviewedCount", (SELECT COUNT(*) FROM jsonb_object_keys(v.fields))::int) AS "approvedFieldCount"
    FROM "ProjectDossierTranslation" h
    LEFT JOIN "ProjectDossierTranslationVersion" v ON v.id = h."approvedVersionId"
    WHERE h."submissionId" = ANY($1::text[]) AND h.lang = $2`;

const configCache = new Map();
export const configForEvent = async (eventId) => {
    const key = eventId || '__open__';
    const hit = configCache.get(key);
    if (hit && Date.now() - hit.at < 30_000) return hit.cfg;
    const cfg = await readConfigForSubmission(eventId || null);
    configCache.set(key, { cfg, at: Date.now() });
    return cfg;
};

/** El expediente de una fila con sus registros de formulario ya leídos. */
export const dossierOf = (row, cfg, records) => {
    const forms = resolveForms(cfg).map(f => ({ key: f.key, template: f.template, record: records[f.key] || null }));
    const computed = Object.fromEntries(forms.map(f => [f.key, withComputed(f.template, f.record?.answers || {})]));
    return D.buildDossier({ submission: row, forms, computed, focusAreas: cfg.focusAreas || [] });
};

const chunks = (arr) => { const out = []; for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK)); return out; };
const many = async (sql, ids, extra = []) => {
    const out = [];
    for (const part of chunks(ids)) out.push(...(await db.query(sql, [part, ...extra]).catch(() => ({ rows: [] }))).rows);
    return out;
};

/**
 * El seguimiento de traducción de varias filas de `ProjectFairSubmission`.
 *
 * @returns Map<id, { tracking, status, header, items }>
 */
export const loadTranslationTracking = async (rows, { lang = 'en', sweep = true, now = Date.now() } = {}) => {
    const map = new Map();
    if (!rows?.length) return map;
    await ensureProjectDossierSchema();
    const ids = rows.map(r => r.id);
    const [master, generic, headers, fields] = await Promise.all([
        many('SELECT * FROM "ProjectFairMasterForm" WHERE "submissionId" = ANY($1::text[])', ids),
        many('SELECT * FROM "ProjectFairProjectForm" WHERE "submissionId" = ANY($1::text[])', ids),
        many(HEADER_SQL, ids, [lang]),
        many('SELECT "submissionId", path, "sourceHash", "sourceText", text, origin, reviewed, "reviewedBy", "reviewedAt", warnings, "updatedAt", "updatedBy" FROM "ProjectDossierTranslationField" WHERE "submissionId" = ANY($1::text[]) AND lang = $2', ids, [lang]),
    ]);
    const masterBy = new Map(master.map(r => [r.submissionId, r]));
    const genericBy = new Map();
    for (const r of generic) genericBy.set(`${r.submissionId}|${r.formKey}`, r);
    const headerBy = new Map(headers.map(h => [h.submissionId, h]));
    const fieldsBy = new Map();
    for (const f of fields) { if (!fieldsBy.has(f.submissionId)) fieldsBy.set(f.submissionId, []); fieldsBy.get(f.submissionId).push(f); }

    const pendingInvalidations = [];
    for (const row of rows) {
        const cfg = await configForEvent(row.eventId);
        const records = {};
        for (const f of resolveForms(cfg)) {
            records[f.key] = storageIsShared(f.key) ? (genericBy.get(`${row.id}|${f.key}`) || null) : (masterBy.get(row.id) || null);
        }
        const dossier = dossierOf(row, cfg, records);
        const items = D.translatableItems(dossier);
        const header = headerBy.get(row.id) || null;
        const status = D.translationStatus({ items, fieldRows: fieldsBy.get(row.id) || [], header, now });
        const inv = sweep ? T.invalidationOf(status, header) : null;
        if (inv) pendingInvalidations.push({ row, cfg, header, status, items, paths: inv.paths });
        map.set(row.id, { tracking: T.trackingOf(status, header), status, header, items });
    }
    for (const p of pendingInvalidations) {
        const updated = await recordInvalidation(p).catch((err) => { console.warn('[translation-tracking] no pude registrar la pérdida de vigencia:', err?.message); return null; });
        if (updated) {
            const cur = map.get(p.row.id);
            map.set(p.row.id, { ...cur, header: updated, tracking: T.trackingOf(cur.status, updated) });
        }
    }
    return map;
};

/** Sólo los compactos: lo que necesitan el listado, los filtros y el CSV. */
export const loadTranslationCompact = async (rows, opts) => {
    const full = await loadTranslationTracking(rows, opts);
    return new Map([...full.entries()].map(([id, v]) => [id, v.tracking]));
};

// ── Pérdida de vigencia ────────────────────────────────────────────────────
const SUBJECT_INVALIDATED = 'Traducción por actualizar — Feria de Proyectos Rotary Colombia';

export const adminLinkFor = (row) => portalLinkFor(row, { portal: { path: '/admin/dashboard?panel=proyectos' } });

const invalidationHtml = ({ row, cfg, header, paths }) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:640px;margin:0 auto;padding:24px 0">
  <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#17458F;color:#fff;padding:26px 32px">${headerLogoHtml(cfg)}<div style="font-size:18px;font-weight:700">${esc(cfg.edition?.name || 'Feria de Proyectos Rotary Colombia')}</div></div>
    <div style="padding:30px 32px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hola${header.assigneeName ? ` ${esc(header.assigneeName)}` : ''}:</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">El club modificó información del proyecto <strong>${esc(row.projectName)}</strong> (${esc(row.publicRef)}) después de que su traducción al inglés fuera verificada. La verificación ya no está vigente y la traducción quedó en <strong>«Requiere actualización»</strong>.</p>
      <p style="font-size:14px;margin:0 0 6px"><strong>Campos afectados (${paths.length}):</strong></p>
      <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.5">${paths.slice(0, 20).map(p => `<li>${esc(p.label)}${p.state === 'missing' ? ' <span style="color:#64748b">(campo nuevo)</span>' : ''}</li>`).join('')}${paths.length > 20 ? `<li>… y ${paths.length - 20} más</li>` : ''}</ul>
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:#475569">Sólo hace falta revisar esos campos (filtro «Desactualizados» de la pestaña Traducción) y volver a verificar. La versión verificada anterior se conserva en el historial.</p>
      <p style="margin:22px 0"><a href="${esc(adminLinkFor(row))}" style="display:inline-block;background:#17458F;color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir Proyectos postulados</a></p>
      <p style="font-size:15px;line-height:1.6;margin:0">Equipo organizador<br>Feria de Proyectos Rotary Colombia</p>
    </div>
    ${footerBrandingHtml(cfg)}
  </div>
</div>`;

/**
 * Registra UNA vez que la verificación vigente perdió vigencia (UPDATE
 * condicional sobre la versión verificada) y avisa al Cadre asignado.
 * Devuelve la cabecera actualizada, o null si otro ya lo había registrado.
 */
const recordInvalidation = async ({ row, cfg, header, status, items, paths }) => {
    const { rows } = await db.query(`
        UPDATE "ProjectDossierTranslation"
        SET "invalidatedAt" = NOW(), "invalidatedVersionId" = "approvedVersionId", "invalidatedPaths" = $4::jsonb, "updatedAt" = NOW()
        WHERE "submissionId" = $1 AND lang = $2 AND "approvedVersionId" = $3
          AND "approvalKind" = '${T.VERIFICATION_KIND}'
          AND ("invalidatedVersionId" IS DISTINCT FROM "approvedVersionId")
        RETURNING *`, [row.id, header.lang || 'en', header.approvedVersionId, JSON.stringify(paths)]);
    if (!rows[0]) return null;
    const updated = { ...header, ...rows[0], approvedVersionNumber: header.approvedVersionNumber, approvedFieldCount: header.approvedFieldCount };
    const config = T.normalizeTranslationConfig(cfg.translationTracking);
    let delivery = null;
    if (config.notifyOnInvalidation && updated.assigneeEmail) {
        const r = await sendFairEmail({ to: updated.assigneeEmail, subject: SUBJECT_INVALIDATED, html: invalidationHtml({ row, cfg, header: updated, paths }), cfg }).catch(e => ({ success: false, error: e?.message }));
        delivery = { status: r?.success ? 'sent' : 'failed', error: r?.success ? null : String(r?.error || 'No se pudo enviar').slice(0, 500) };
    }
    await insertTranslationEvent(db, {
        submissionId: row.id, eventId: row.eventId, lang: updated.lang || 'en', action: 'invalidated',
        fromState: 'verified', toState: 'needs_update',
        versionId: updated.approvedVersionId, versionNumber: header.approvedVersionNumber ?? null,
        sourceFingerprint: T.sourceFingerprintOf(items), totalCount: status.total, reviewedCount: status.counts.reviewed,
        paths, reason: 'El original en español cambió después de la verificación.',
        assigneeEmail: updated.assigneeEmail || null,
        recipient: delivery ? updated.assigneeEmail : null, deliveryStatus: delivery?.status || null, deliveryError: delivery?.error || null,
        actor: { id: null, name: 'Sistema', role: 'system' },
    });
    await logEvent(row.id, {
        type: 'dossier_translation_invalidated',
        title: `La verificación de la traducción al inglés perdió vigencia (${paths.length} campo${paths.length === 1 ? '' : 's'} del original cambiaron)`,
        detail: paths.slice(0, 8).map(p => p.label).join(' · ') || null,
        actor: { id: null, name: 'Sistema', role: 'system' },
        metadata: { lang: updated.lang || 'en', versionId: updated.approvedVersionId, paths: paths.map(p => p.path), notified: delivery?.status || null },
    }).catch(() => {});
    return updated;
};

/** Una fila de la bitácora de la verificación. */
export const insertTranslationEvent = (q, e) => q.query(`
    INSERT INTO "ProjectDossierTranslationEvent" ("submissionId", "eventId", lang, action, "fromState", "toState", "versionId", "versionNumber",
        "sourceFingerprint", "translationFingerprint", "reviewedCount", "totalCount", paths, note, reason, "assigneeEmail", "previousAssignee",
        recipient, "submissionIds", "deliveryStatus", "deliveryError", "dedupeKey", "actorId", "actorName", "actorRole")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23,$24,$25)
    ON CONFLICT DO NOTHING
    RETURNING id`, [
    e.submissionId || null, e.eventId || null, e.lang || 'en', e.action, e.fromState || null, e.toState || null,
    e.versionId || null, e.versionNumber ?? null, e.sourceFingerprint || null, e.translationFingerprint || null,
    e.reviewedCount ?? null, e.totalCount ?? null, JSON.stringify(e.paths ?? null), e.note || null, e.reason || null,
    e.assigneeEmail || null, e.previousAssignee || null, e.recipient || null, JSON.stringify(e.submissionIds ?? null),
    e.deliveryStatus || null, e.deliveryError || null, e.dedupeKey || null,
    e.actor?.id || null, e.actor?.name || null, e.actor?.role || null,
]);

/**
 * Tras un guardado del CLUB o del comité: ¿la verificación de este proyecto
 * perdió vigencia? Nunca lanza ni demora la respuesta más de lo que tarda la
 * consulta (los guardados son de un proyecto).
 */
export const checkTranslationValidity = async (submissionId) => {
    try {
        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [submissionId]);
        if (!rows[0]) return null;
        // Sin verificación no hay nada que invalidar: se evita leer todo.
        const h = await db.query(`SELECT 1 FROM "ProjectDossierTranslation" WHERE "submissionId" = $1 AND "approvalKind" = '${T.VERIFICATION_KIND}' AND "approvedAt" IS NOT NULL LIMIT 1`, [submissionId]).catch(() => ({ rows: [] }));
        if (!h.rows[0]) return null;
        const map = await loadTranslationTracking(rows);
        return map.get(submissionId)?.tracking || null;
    } catch (err) {
        console.warn('[translation-tracking] checkTranslationValidity:', err?.message);
        return null;
    }
};

export default { loadTranslationTracking, loadTranslationCompact, checkTranslationValidity, insertTranslationEvent, configForEvent, dossierOf, HEADER_SQL, adminLinkFor };
