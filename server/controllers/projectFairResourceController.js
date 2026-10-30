// ════════════════════════════════════════════════════════════════════
// Recursos del proyecto — Plantilla oficial de presentación (v4.1264.0)
// XII Feria de Proyectos Rotary Colombia – Valledupar 2027
//
// Un recurso OFICIAL, ADMINISTRABLE, VERSIONADO y MEDIBLE, no un archivo
// enlazado en el código:
//
//   Administrador (Postulación de Proyectos → Recursos y plantillas)
//     sube → valida el tipo REAL → publica / desactiva → reemplaza (versión
//     nueva, la anterior se conserva) → consulta quién descargó y quién no.
//
//   Club (/mi-proyecto → tarjeta «Plantilla de presentación del proyecto»)
//     pide la descarga → el servidor verifica su sesión y el recurso → registra
//     la SOLICITUD → comprueba que el archivo exista → firma un enlace que
//     caduca → registra la ENTREGA → recién entonces devuelve el enlace.
//
// ⚠️ «ENTREGADA» SIGNIFICA LO QUE EL SERVIDOR PUEDE AFIRMAR: autorizó y entregó
// un enlace válido al archivo vigente. No que el archivo se guardó o se abrió
// en el dispositivo — eso no lo puede saber nadie desde acá, y no se dice. Un
// intento que falla queda `failed` con su motivo y NO cuenta como descarga.
//
// ⚠️ INDEPENDIENTE DE TODO LO DEMÁS. Descargar no toca el pago, ni el estado del
// proyecto, ni los formularios, ni la redirección a Rotary 31A. Lo único que
// escribe fuera de sus tablas es UNA entrada en el historial de la postulación
// (`template_downloaded`), que es su identificador de auditoría.
//
// Permisos: los del módulo (`withAccess`). Ver y consultar estadísticas →
// 'view'; exportar → 'export'; subir, publicar, reemplazar y editar →
// 'config' (sólo el rol admin del módulo).
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import { ensureTables, logEvent } from './projectFairController.js';
import { withAccess, actorFrom } from './projectFairAdminController.js';
import { isApplied, projectStateOf, projectStateMeta } from '../lib/projectFairLifecycle.js';
import { ensureProjectFairResourceSchema } from '../lib/ensureProjectFairResourceSchema.js';
import {
    RESOURCE_KEYS, RESOURCE_DEFAULTS, RESOURCE_FORMATS, ACCEPTED_EXTENSIONS, DEFAULT_MAX_MB, MIN_MAX_MB, LIMIT_MAX_MB,
    DOWNLOAD_STATUS, TRACKING_FILTERS, clampMaxMb, isResourceKey, scopeOf, checkUploadMeta, judgeUploadedFile,
    downloadFileName, cardStateOf, summarizeTracking, byDistrict, filterTracking, trackingCsv,
} from '../lib/projectFairResourceSpec.js';
import {
    presignResourceUpload, inspectResourceObject, resourceKeyBelongs, resourceObjectExists,
    signedResourceDownload, deleteRejectedObject,
} from '../lib/projectFairResourceStorage.js';

console.log('[projectFairResourceController] v4.1264.0 cargado — Plantilla oficial de presentación: administrable, versionada, descarga autenticada y auditada, y seguimiento de quién la descargó y quién no.');

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const FAIL_MESSAGE = 'No fue posible descargar la plantilla. Inténtalo nuevamente.';
/** Referencia corta de un intento, para que un error se pueda rastrear. */
const refOf = (id) => String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();

// ── Lectura ──────────────────────────────────────────────────────────
const loadResource = async (scope, key) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairResource" WHERE scope = $1 AND key = $2 LIMIT 1', [scope, key]);
    return rows[0] || null;
};

/** El recurso de una edición, creándolo con los textos por defecto si no existe. */
const ensureResource = async (scope, key, actorName) => {
    const d = RESOURCE_DEFAULTS[key];
    await db.query(`
        INSERT INTO "ProjectFairResource" (scope, key, title, description, "maxSizeMb", "updatedBy")
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (scope, key) DO NOTHING
    `, [scope, key, d.title, d.description, DEFAULT_MAX_MB, actorName || null]);
    return loadResource(scope, key);
};

const loadVersion = async (id) => {
    if (!id) return null;
    const { rows } = await db.query('SELECT * FROM "ProjectFairResourceVersion" WHERE id = $1 LIMIT 1', [id]);
    return rows[0] || null;
};

const logResourceEvent = (resourceId, { type, title, detail = null, metadata = {}, actor = null }) =>
    db.query(`
        INSERT INTO "ProjectFairResourceEvent" ("resourceId", type, title, detail, metadata, "actorId", "actorName")
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
    `, [resourceId, type, title, detail, JSON.stringify(metadata || {}), actor?.id || null, actor?.name || null])
        .catch(err => console.warn('[project-fair-resources] no pude registrar el evento:', err?.message));

const shapeVersion = (v, currentId) => ({
    id: v.id,
    number: Number(v.versionNumber),
    fileName: v.fileName,
    format: v.format,
    formatLabel: RESOURCE_FORMATS[v.format]?.short || String(v.format || '').toUpperCase(),
    contentType: v.contentType,
    sizeBytes: Number(v.sizeBytes) || 0,
    note: v.note || null,
    publishedAt: v.publishedAt,
    publishedBy: v.publishedByName || null,
    current: v.id === currentId,
    deliveredCount: Number(v.deliveredCount) || 0,
});

/** Lo que ve el administrador de un recurso: estado, versión vigente, historial. */
const adminViewOf = async (scope, key) => {
    const d = RESOURCE_DEFAULTS[key];
    const resource = await loadResource(scope, key);
    if (!resource) {
        return {
            key, exists: false, title: d.title, description: d.description, active: false,
            maxSizeMb: DEFAULT_MAX_MB, current: null, versions: [], history: [], status: 'empty',
        };
    }
    const [versions, history] = await Promise.all([
        db.query(`
            SELECT v.*, (SELECT COUNT(*) FROM "ProjectFairResourceDownload" dl
                         WHERE dl."versionId" = v.id AND dl.status = 'delivered')::int AS "deliveredCount"
            FROM "ProjectFairResourceVersion" v
            WHERE v."resourceId" = $1
            ORDER BY v."versionNumber" DESC
        `, [resource.id]),
        db.query(`SELECT id, type, title, detail, "actorName", "createdAt" FROM "ProjectFairResourceEvent"
                  WHERE "resourceId" = $1 ORDER BY "createdAt" DESC LIMIT 50`, [resource.id]),
    ]);
    const shaped = versions.rows.map(v => shapeVersion(v, resource.currentVersionId));
    const current = shaped.find(v => v.current) || null;
    return {
        key, exists: true, id: resource.id,
        title: resource.title || d.title,
        description: resource.description || d.description,
        active: Boolean(resource.active),
        maxSizeMb: clampMaxMb(resource.maxSizeMb),
        updatedAt: resource.updatedAt,
        updatedBy: resource.updatedBy || null,
        current,
        versions: shaped,
        history: history.rows,
        // Publicada = activa y con archivo; desactivada = con archivo pero
        // apagada; vacía = todavía sin archivo.
        status: !current ? 'empty' : resource.active ? 'published' : 'inactive',
    };
};

const withSchema = (handler, capability) => withAccess(async (req, res, ctx) => {
    await ensureProjectFairResourceSchema();
    return handler(req, res, ctx);
}, capability);

const keyOr404 = (req, res) => {
    const key = clean(req.params.key, 60);
    if (!isResourceKey(key)) { res.status(404).json({ error: 'Ese recurso no existe.' }); return null; }
    return key;
};

// ── Administración ───────────────────────────────────────────────────
// GET /admin/recursos?evento=
export const adminListResources = withSchema(async (req, res, { access }) => {
    const scope = scopeOf(req.query.evento);
    const resources = await Promise.all(RESOURCE_KEYS.map(k => adminViewOf(scope, k)));
    res.json({
        scope,
        resources,
        access: { config: !!access.config, export: !!access.export, view: !!access.view },
        formats: Object.entries(RESOURCE_FORMATS).map(([key, f]) => ({ key, label: f.label })),
        accept: ACCEPTED_EXTENSIONS.join(','),
        limits: { min: MIN_MAX_MB, max: LIMIT_MAX_MB, default: DEFAULT_MAX_MB },
    });
}, 'view');

// PUT /admin/recursos/:key?evento= — título, descripción, publicación, tope.
export const adminUpdateResource = withSchema(async (req, res, { access }) => {
    const key = keyOr404(req, res); if (!key) return;
    const scope = scopeOf(req.query.evento);
    const actor = actorFrom(req, access);
    const resource = await ensureResource(scope, key, actor.name);
    const body = req.body || {};

    const next = {
        title: body.title === undefined ? resource.title : clean(body.title, 160),
        description: body.description === undefined ? resource.description : clean(body.description, 600),
        active: body.active === undefined ? resource.active : Boolean(body.active),
        maxSizeMb: body.maxSizeMb === undefined ? resource.maxSizeMb : clampMaxMb(body.maxSizeMb),
    };
    if (!next.title) return res.status(400).json({ error: 'El título no puede quedar vacío.' });
    if (!next.description) return res.status(400).json({ error: 'La descripción no puede quedar vacía.' });
    // Publicar sin archivo dejaría el botón del club activo y sin nada que
    // entregar: se exige subir primero.
    if (next.active && !resource.currentVersionId) {
        return res.status(409).json({ error: 'Sube el archivo de la plantilla antes de publicarla.' });
    }

    await db.query(`
        UPDATE "ProjectFairResource"
        SET title = $2, description = $3, active = $4, "maxSizeMb" = $5, "updatedAt" = NOW(), "updatedBy" = $6
        WHERE id = $1
    `, [resource.id, next.title, next.description, next.active, next.maxSizeMb, actor.name]);

    if (next.active !== Boolean(resource.active)) {
        await logResourceEvent(resource.id, {
            type: next.active ? 'published' : 'unpublished',
            title: next.active ? 'Plantilla publicada en «Mi proyecto»' : 'Plantilla desactivada',
            actor,
        });
    }
    if (next.title !== resource.title || next.description !== resource.description) {
        await logResourceEvent(resource.id, {
            type: 'text_updated', title: 'Título o descripción actualizados',
            metadata: { before: { title: resource.title, description: resource.description }, after: { title: next.title, description: next.description } },
            actor,
        });
    }
    if (next.maxSizeMb !== resource.maxSizeMb) {
        await logResourceEvent(resource.id, {
            type: 'limit_updated', title: `Tamaño máximo: ${next.maxSizeMb} MB`,
            metadata: { before: resource.maxSizeMb, after: next.maxSizeMb }, actor,
        });
    }
    res.json(await adminViewOf(scope, key));
}, 'config');

// POST /admin/recursos/:key/presign?evento= — URL de subida directa a S3.
export const adminPresignUpload = withSchema(async (req, res, { access }) => {
    const key = keyOr404(req, res); if (!key) return;
    const scope = scopeOf(req.query.evento);
    const resource = await ensureResource(scope, key, actorFrom(req, access).name);
    const filename = clean(req.body?.filename, 200);
    const juicio = checkUploadMeta({ filename, size: req.body?.size, maxMb: resource.maxSizeMb });
    if (!juicio.ok) return res.status(400).json({ error: juicio.errores.join(' ') });
    try {
        const signed = await presignResourceUpload({ scope, key, filename });
        res.json(signed);
    } catch (e) {
        console.error('[project-fair-resources] no pude prefirmar la subida:', e?.message);
        res.status(502).json({ error: 'No se pudo preparar la subida al almacenamiento. Inténtalo de nuevo.' });
    }
}, 'config');

// POST /admin/recursos/:key/versions?evento= — registra el archivo YA SUBIDO
// como versión nueva y la deja vigente. La anterior se conserva.
export const adminRegisterVersion = withSchema(async (req, res, { access }) => {
    const key = keyOr404(req, res); if (!key) return;
    const scope = scopeOf(req.query.evento);
    const actor = actorFrom(req, access);
    const resource = await ensureResource(scope, key, actor.name);
    const storageKey = clean(req.body?.storageKey, 400);
    const fileName = clean(req.body?.filename, 200);
    const note = clean(req.body?.note, 300) || null;

    if (!resourceKeyBelongs(storageKey, scope, key)) {
        return res.status(400).json({ error: 'El archivo no pertenece a este recurso.' });
    }
    const dup = await db.query('SELECT 1 FROM "ProjectFairResourceVersion" WHERE "storageKey" = $1 LIMIT 1', [storageKey]);
    if (dup.rows[0]) return res.status(409).json({ error: 'Ese archivo ya está registrado como versión.' });

    // El objeto REAL decide: peso de S3 y tipo por sus bytes.
    let inspected;
    try {
        inspected = await inspectResourceObject(storageKey);
    } catch (e) {
        console.error('[project-fair-resources] no pude leer el objeto subido:', e?.message);
        return res.status(422).json({ error: 'No encontramos el archivo subido. Vuelve a intentarlo.' });
    }
    const juicio = judgeUploadedFile({ filename: fileName, bytes: inspected.bytes, head: inspected.head, tail: inspected.tail, maxMb: resource.maxSizeMb });
    if (!juicio.ok) {
        await deleteRejectedObject(storageKey);
        return res.status(422).json({ error: juicio.error });
    }

    // Número de versión: el siguiente. El índice único (recurso, número)
    // impide que dos subidas simultáneas tomen el mismo; se reintenta una vez.
    let version = null;
    for (let intento = 0; intento < 2 && !version; intento++) {
        try {
            const { rows } = await db.query(`
                INSERT INTO "ProjectFairResourceVersion"
                    ("resourceId", "versionNumber", "storageKey", "fileName", "contentType", format, "sizeBytes", note, "publishedById", "publishedByName")
                SELECT $1, COALESCE(MAX("versionNumber"), 0) + 1, $2, $3, $4, $5, $6, $7, $8, $9
                FROM "ProjectFairResourceVersion" WHERE "resourceId" = $1
                RETURNING *
            `, [resource.id, storageKey, fileName, juicio.contentType, juicio.format, inspected.bytes, note, actor.id, actor.name]);
            version = rows[0];
        } catch (e) {
            if (e?.code !== '23505' || intento === 1) throw e;
        }
    }

    await db.query(`UPDATE "ProjectFairResource" SET "currentVersionId" = $2, "updatedAt" = NOW(), "updatedBy" = $3 WHERE id = $1`,
        [resource.id, version.id, actor.name]);
    const replaced = Number(version.versionNumber) > 1;
    await logResourceEvent(resource.id, {
        type: replaced ? 'version_replaced' : 'version_uploaded',
        title: replaced ? `Plantilla reemplazada por la versión ${version.versionNumber}` : 'Primera versión de la plantilla cargada',
        detail: `${fileName} · ${RESOURCE_FORMATS[juicio.format].short}`,
        metadata: { versionId: version.id, versionNumber: Number(version.versionNumber), sizeBytes: inspected.bytes, previousVersionId: resource.currentVersionId || null },
        actor,
    });
    res.status(201).json(await adminViewOf(scope, key));
}, 'config');

// GET /admin/recursos/:key/versions/:versionId/download?evento= — el
// administrador baja una versión (la vigente o una anterior). NO cuenta como
// descarga de un club: queda en el historial del recurso.
export const adminDownloadVersion = withSchema(async (req, res, { access }) => {
    const key = keyOr404(req, res); if (!key) return;
    const scope = scopeOf(req.query.evento);
    const resource = await loadResource(scope, key);
    const version = await loadVersion(clean(req.params.versionId, 60));
    if (!resource || !version || version.resourceId !== resource.id) return res.status(404).json({ error: 'Versión no encontrada.' });
    if (!(await resourceObjectExists(version.storageKey))) {
        return res.status(503).json({ error: 'El archivo de esta versión no está disponible en el almacenamiento.' });
    }
    const fileName = downloadFileName(resource.title, version.versionNumber, version.format);
    const url = await signedResourceDownload(version.storageKey, { fileName, contentType: version.contentType });
    await logResourceEvent(resource.id, {
        type: 'admin_download', title: `Versión ${version.versionNumber} descargada desde el administrador`,
        metadata: { versionId: version.id }, actor: actorFrom(req, access),
    });
    res.json({ url, fileName });
}, 'view');

// ── Analítica ────────────────────────────────────────────────────────
/**
 * Una fila por PROYECTO de la edición: los elegibles (postulados, no
 * archivados) y, además, cualquiera que haya recibido una descarga. Los datos
 * de la persona salen de la postulación —no se copiaron a la tabla de
 * descargas—. Las fechas y la versión acotan qué descargas se cuentan.
 */
const trackingRows = async (resource, scope, query) => {
    const params = [resource.id];
    const cond = [];
    const add = (sql, v) => { params.push(v); cond.push(sql.replace('$?', `$${params.length}`)); };
    if (query.desde) add('"requestedAt" >= $?', new Date(`${clean(query.desde, 10)}T00:00:00-05:00`));
    if (query.hasta) add('"requestedAt" <= $?', new Date(`${clean(query.hasta, 10)}T23:59:59-05:00`));
    if (query.version && Number(query.version) > 0) add('"versionNumber" = $?', Number(query.version));
    const extra = cond.length ? `AND ${cond.join(' AND ')}` : '';

    params.push(scope);
    const scopeParam = `$${params.length}`;
    const { rows } = await db.query(`
        WITH dl AS (
            SELECT "submissionId",
                   COUNT(*) FILTER (WHERE status = 'delivered')::int AS "deliveredCount",
                   COUNT(*) FILTER (WHERE status = 'failed')::int AS "failedCount",
                   MIN("deliveredAt") FILTER (WHERE status = 'delivered') AS "firstDeliveredAt",
                   MAX("deliveredAt") FILTER (WHERE status = 'delivered') AS "lastDeliveredAt",
                   (ARRAY_AGG("versionNumber" ORDER BY "deliveredAt" DESC NULLS LAST) FILTER (WHERE status = 'delivered'))[1] AS "lastVersionNumber",
                   MAX("accountId") FILTER (WHERE status = 'delivered') AS "accountId"
            FROM "ProjectFairResourceDownload"
            WHERE "resourceId" = $1 ${extra}
            GROUP BY "submissionId"
        )
        SELECT s.id AS "submissionId", s."publicRef", s."firstName", s."lastName", s.email, s."clubName",
               s.district, s."projectName", s."workflowStatus", s."archivedAt",
               acc.id AS "accountRowId",
               COALESCE(dl."deliveredCount", 0) AS "deliveredCount", COALESCE(dl."failedCount", 0) AS "failedCount",
               dl."firstDeliveredAt", dl."lastDeliveredAt", dl."lastVersionNumber", dl."accountId"
        FROM "ProjectFairSubmission" s
        LEFT JOIN dl ON dl."submissionId" = s.id
        LEFT JOIN "ProjectFairAccount" acc ON acc."submissionId" = s.id
        WHERE (${scopeParam} = 'global' OR s."eventId" = ${scopeParam})
        ORDER BY s."clubName" NULLS LAST, s."projectName"
    `, params);

    return rows
        .map(r => {
            const eligible = !r.archivedAt && isApplied(r);
            const state = projectStateOf(r);
            return {
                submissionId: r.submissionId,
                accountId: r.accountId || r.accountRowId || null,
                publicRef: r.publicRef,
                responsible: [r.firstName, r.lastName].filter(Boolean).join(' '),
                email: r.email,
                clubName: r.clubName || '',
                district: r.district || '',
                projectName: r.projectName || '',
                projectState: state,
                projectStateLabel: r.archivedAt ? 'Archivada' : projectStateMeta(state).label,
                eligible,
                deliveredCount: Number(r.deliveredCount) || 0,
                failedCount: Number(r.failedCount) || 0,
                firstDeliveredAt: r.firstDeliveredAt,
                lastDeliveredAt: r.lastDeliveredAt,
                lastVersionNumber: r.lastVersionNumber === null || r.lastVersionNumber === undefined ? null : Number(r.lastVersionNumber),
            };
        })
        // Fuera del universo sólo entra quien recibió algo: su descarga existió.
        .filter(r => r.eligible || r.deliveredCount > 0);
};

const timelineOf = async (resource, query) => {
    const params = [resource.id];
    const cond = [];
    const add = (sql, v) => { params.push(v); cond.push(sql.replace('$?', `$${params.length}`)); };
    if (query.desde) add('"deliveredAt" >= $?', new Date(`${clean(query.desde, 10)}T00:00:00-05:00`));
    if (query.hasta) add('"deliveredAt" <= $?', new Date(`${clean(query.hasta, 10)}T23:59:59-05:00`));
    if (query.version && Number(query.version) > 0) add('"versionNumber" = $?', Number(query.version));
    const { rows } = await db.query(`
        SELECT to_char(("deliveredAt" AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS delivered, COUNT(DISTINCT "submissionId")::int AS projects
        FROM "ProjectFairResourceDownload"
        WHERE "resourceId" = $1 AND status = 'delivered' ${cond.length ? `AND ${cond.join(' AND ')}` : ''}
        GROUP BY 1 ORDER BY 1
    `, params);
    return rows;
};

const analyticsFor = async (req, scope, key) => {
    const resource = await loadResource(scope, key);
    if (!resource) return { resource: null };
    const all = await trackingRows(resource, scope, req.query);
    const filters = {
        estado: clean(req.query.estado, 20) || 'all',
        club: clean(req.query.club, 160),
        district: clean(req.query.distrito, 160),
        project: clean(req.query.proyecto, 160),
        q: clean(req.query.q, 160),
    };
    const current = await loadVersion(resource.currentVersionId);
    const versions = await db.query('SELECT "versionNumber" FROM "ProjectFairResourceVersion" WHERE "resourceId" = $1 ORDER BY "versionNumber" DESC', [resource.id]);
    return {
        resource,
        all,
        filtered: filterTracking(all, filters),
        current,
        versions: versions.rows.map(v => Number(v.versionNumber)),
    };
};

// GET /admin/recursos/:key/analytics?evento=&estado=&club=&distrito=&proyecto=&desde=&hasta=&version=&q=
export const adminAnalytics = withSchema(async (req, res) => {
    const key = keyOr404(req, res); if (!key) return;
    const scope = scopeOf(req.query.evento);
    const a = await analyticsFor(req, scope, key);
    if (!a.resource) {
        return res.json({ exists: false, kpis: summarizeTracking([]), byDistrict: [], timeline: [], rows: [], total: 0, filters: TRACKING_FILTERS, versions: [], clubs: [], districts: [] });
    }
    const uniq = (list) => [...new Set(list.filter(Boolean))].sort((x, y) => x.localeCompare(y, 'es'));
    res.json({
        exists: true,
        currentVersion: a.current ? Number(a.current.versionNumber) : null,
        active: Boolean(a.resource.active),
        kpis: summarizeTracking(a.all),
        byDistrict: byDistrict(a.all),
        timeline: await timelineOf(a.resource, req.query),
        rows: a.filtered,
        total: a.all.length,
        filters: TRACKING_FILTERS,
        versions: a.versions,
        clubs: uniq(a.all.map(r => r.clubName)),
        districts: uniq(a.all.map(r => r.district)),
    });
}, 'view');

// GET /admin/recursos/:key/analytics.csv?… — mismos filtros que la tabla.
export const adminAnalyticsCsv = withSchema(async (req, res) => {
    const key = keyOr404(req, res); if (!key) return;
    const scope = scopeOf(req.query.evento);
    const a = await analyticsFor(req, scope, key);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="descargas-plantilla-presentacion.csv"');
    res.send(trackingCsv(a.resource ? a.filtered : []));
}, 'export');

// ── Panel del club (/mi-proyecto) ────────────────────────────────────
/**
 * El recurso que le toca a ESTA postulación: el de su edición y, si la edición
 * no tiene uno propio, el global. Nunca el de otra feria.
 */
const resourceForSubmission = async (submission, key) => {
    const scope = scopeOf(submission.eventId);
    const { rows } = await db.query(`
        SELECT * FROM "ProjectFairResource"
        WHERE key = $1 AND scope IN ($2, 'global')
        ORDER BY (scope = $2) DESC
        LIMIT 1
    `, [key, scope]);
    return rows[0] || null;
};

/** La postulación y la cuenta del TOKEN — nunca del cuerpo de la petición. */
const portalIdentity = async (req) => {
    await ensureTables();
    await ensureProjectFairResourceSchema();
    const { rows } = await db.query('SELECT id, "eventId", email, "projectName" FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.portal.submissionId]);
    const submission = rows[0] || null;
    if (!submission) return { submission: null, account: null };
    const acc = await db.query('SELECT id, email FROM "ProjectFairAccount" WHERE id = $1 AND "submissionId" = $2 LIMIT 1', [req.portal.sub, submission.id]);
    return { submission, account: acc.rows[0] || null };
};

const lastDeliveredFor = async (resourceId, submissionId) => {
    const { rows } = await db.query(`
        SELECT "deliveredAt" AS at, "versionNumber" FROM "ProjectFairResourceDownload"
        WHERE "resourceId" = $1 AND "submissionId" = $2 AND status = 'delivered'
        ORDER BY "deliveredAt" DESC LIMIT 1
    `, [resourceId, submissionId]);
    return rows[0] || null;
};

// GET /portal/resources — las tarjetas de recursos del panel del club.
export const portalListResources = async (req, res) => {
    try {
        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        if (!account) return res.status(403).json({ error: 'Tu cuenta no tiene acceso a este recurso.' });
        const resources = [];
        for (const key of RESOURCE_KEYS) {
            const resource = await resourceForSubmission(submission, key);
            const version = resource?.active ? await loadVersion(resource.currentVersionId) : null;
            const mine = resource ? await lastDeliveredFor(resource.id, submission.id) : null;
            resources.push(cardStateOf({ resource: resource || { key }, version, myLastDelivered: mine }));
        }
        res.json({ resources });
    } catch (error) {
        console.error('[project-fair-resources] portalListResources:', error);
        res.status(500).json({ error: 'No pudimos cargar los recursos del proyecto.' });
    }
};

// POST /portal/resources/:key/download — autoriza, registra y entrega.
export const portalDownload = async (req, res) => {
    let downloadId = null;
    const fail = async (status, code, message, extra = {}) => {
        if (downloadId) {
            await db.query(`UPDATE "ProjectFairResourceDownload" SET status = 'failed', "errorCode" = $2 WHERE id = $1`, [downloadId, code])
                .catch(err => console.error('[project-fair-resources] no pude marcar el intento fallido:', err?.message));
        }
        return res.status(status).json({ error: message, code, ref: downloadId ? refOf(downloadId) : null, ...extra });
    };
    try {
        const key = clean(req.params.key, 60);
        if (!isResourceKey(key)) return res.status(404).json({ error: 'Ese recurso no existe.', code: 'unknown_resource' });

        const { submission, account } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.', code: 'no_submission' });
        // Un token válido de una cuenta que ya no corresponde a esta
        // postulación no descarga: el permiso se valida acá, no en el botón.
        if (!account) return res.status(403).json({ error: 'Tu cuenta no tiene acceso a este recurso.', code: 'forbidden' });

        const resource = await resourceForSubmission(submission, key);
        if (!resource) return res.status(409).json({ error: 'La plantilla oficial estará disponible próximamente.', code: 'not_configured' });
        const version = resource.active ? await loadVersion(resource.currentVersionId) : null;

        // ① La SOLICITUD queda registrada antes de nada.
        const ins = await db.query(`
            INSERT INTO "ProjectFairResourceDownload" ("resourceId", "versionId", "versionNumber", scope, "submissionId", "accountId", status)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [resource.id, version?.id || null, version ? Number(version.versionNumber) : null, resource.scope, submission.id, account.id, DOWNLOAD_STATUS.REQUESTED]);
        downloadId = ins.rows[0].id;

        if (!version) return fail(409, 'not_available', 'La plantilla oficial estará disponible próximamente.');

        // ② El archivo existe de verdad en el almacenamiento.
        if (!(await resourceObjectExists(version.storageKey))) {
            console.error(`[project-fair-resources] ⚠️ falta el objeto de la versión ${version.id} (${version.storageKey}) — intento ${downloadId}`);
            return fail(503, 'storage_missing', FAIL_MESSAGE);
        }

        // ③ Enlace firmado que caduca.
        const fileName = downloadFileName(resource.title, version.versionNumber, version.format);
        let url;
        try {
            url = await signedResourceDownload(version.storageKey, { fileName, contentType: version.contentType });
        } catch (e) {
            console.error(`[project-fair-resources] no pude firmar la descarga ${downloadId}:`, e?.message);
            return fail(502, 'sign_error', FAIL_MESSAGE);
        }

        // ④ La ENTREGA queda registrada —con su evento de auditoría en el
        // historial de la postulación— ANTES de devolver el enlace. Si el
        // registro falla, el enlace no sale: nunca hay una entrega sin rastro.
        const audit = await logEvent(submission.id, {
            type: 'template_downloaded',
            title: 'Plantilla de presentación descargada',
            detail: `Versión ${version.versionNumber} · ${RESOURCE_FORMATS[version.format]?.short || version.format}`,
            actor: { id: account.id, name: account.email || submission.email, role: 'club' },
            metadata: { resourceKey: key, resourceId: resource.id, versionId: version.id, versionNumber: Number(version.versionNumber), downloadId },
        });
        const upd = await db.query(`
            UPDATE "ProjectFairResourceDownload"
            SET status = 'delivered', "deliveredAt" = NOW(), "auditEventId" = $2
            WHERE id = $1 AND status = 'requested'
            RETURNING "deliveredAt"
        `, [downloadId, audit?.id || null]);
        if (!upd.rows[0]) return fail(500, 'record_error', FAIL_MESSAGE);

        res.json({ url, fileName, versionNumber: Number(version.versionNumber), ref: refOf(downloadId), deliveredAt: upd.rows[0].deliveredAt });
    } catch (error) {
        console.error(`[project-fair-resources] portalDownload ${downloadId || ''}:`, error);
        return fail(500, 'server_error', FAIL_MESSAGE);
    }
};

// ⚠️ AL FINAL DEL ARCHIVO (`npm run check:route-handlers`): declarado antes
// de las `const`, el objeto las vería sin inicializar.
export default {
    adminListResources, adminUpdateResource, adminPresignUpload, adminRegisterVersion, adminDownloadVersion,
    adminAnalytics, adminAnalyticsCsv, portalListResources, portalDownload,
};
