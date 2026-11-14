// ════════════════════════════════════════════════════════════════════
// Formularios del proyecto — panel del club y panel administrativo
// v4.643.0
//
// Un proyecto inscrito tiene varios formularios: la Formulación del Proyecto
// y la Solicitud de Aportes del FDD 2026-2027 (y los que se registren
// después, ver `server/lib/projectFormsRegistry.js`). Este controlador los
// atiende a TODOS con el mismo código: mismo guardado, mismo autoguardado,
// mismo historial, mismos permisos, mismos estados.
//
// Es lo que hace escalable el módulo: agregar un formulario no agrega
// endpoints ni tablas ni pantallas, sólo una entrada en el registro.
//
// EL ESPACIO INSTITUCIONAL (aprobación del Gobernador de Distrito y del
// presidente del Comité de LFRI) tiene dos modos, y la plantilla elige cuál:
//   · `districtSpace` — lo diligencian el club Y el Distrito. Es el caso del
//     FDD desde v4.643: el Gestor de Proyectos lo llena con lo que le
//     corresponde al proyecto y al club, y el Distrito lo confirma desde el
//     panel administrativo, donde queda registrado quién lo hizo y cuándo.
//     Se guarda con el resto de las respuestas.
//   · `adminOnly` — no lo escribe nunca el club: vive en la columna `approval`
//     y `stripProtected` descarta cualquier intento que llegue del panel del
//     club, aunque llame al endpoint a mano.
//
// SEGURIDAD — dos reglas que no dependen del navegador, valga el modo que
// valga:
//   1. `saveApproval` escribe SÓLO la sección institucional, y sólo los campos
//      que la plantilla declara: no puede alterar ninguna otra respuesta del
//      club. Exige rol administrativo del sitio y el permiso 'changeStatus'.
//   2. Si el formulario se puede editar lo decide siempre el servidor
//      (`editability`), con la cuenta y el estado del pago en la mano.
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
// El criterio del pago vive aparte y es PURO (v4.978): una sola pregunta
// —«¿existe un pago confirmado?»— para el cobro y para esta puerta.
// v4.1253 — La puerta de los formularios: postulación enviada y, SÓLO si la
// Convocatoria lo exige expresamente, pago confirmado.
import { formAccessOf, fairFormEditVerdict, fairPostClosePolicyOf, editRequestOf } from '../lib/projectFairLifecycle.js';
// v4.1330 — Edición después del cierre: el criterio genérico (qué campos se
// bloquean, cómo se aplica el bloqueo y qué cambió, campo a campo).
import { lockedFieldsFor, applyFieldLocks, diffAnswers, pendingFieldsOf, sameValue, formatDateEs } from '../lib/postCloseEditPolicy.js';
// La bitácora campo a campo es la del Expediente (v4.1324): no se crea otra.
import { ensureProjectDossierSchema } from '../lib/ensureProjectDossierSchema.js';
import { ensureTables, logEvent, readConfigForSubmission, APPLICANT_ROLES, sendFairEmail } from './projectFairController.js';
import { withAccess, actorFrom } from './projectFairAdminController.js';
import {
    completionOf, missingRequired, validateAnswers, stripProtected,
    withComputed, flattenFields, districtSectionOf, isProtectedSection,
} from '../lib/projectFormEngine.js';
import {
    resolveForm, resolveForms, storageOf, storageIsShared, MASTER_FORM_KEY,
} from '../lib/projectFormsRegistry.js';

console.log('[projectFormsController] v4.1330.0 cargado — Formularios del proyecto: la fecha de cierre ya no bloquea la edición de lo inscrito; la decide la política «Edición de proyectos después del cierre», con campos bloqueados en el servidor y bitácora campo a campo');

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Tablas donde pueden vivir las respuestas. Lista blanca explícita: el nombre
// de la tabla entra literal en el SQL (no se puede parametrizar un
// identificador), así que nunca puede salir de la petición.
const ALLOWED_TABLES = new Set(['ProjectFairMasterForm', 'ProjectFairProjectForm']);
const tableFor = (formKey) => {
    const table = storageOf(formKey);
    if (!ALLOWED_TABLES.has(table)) throw new Error(`Tabla no permitida para el formulario ${formKey}`);
    return table;
};

// ── Estados visibles del formulario ──────────────────────────────────
// El estado que ve el usuario no es una columna: se deriva de lo que el club
// escribió y de lo que el Distrito decidió. Así no hay dos fuentes de verdad
// que puedan discrepar (una fila "enviada" con 40% de avance, por ejemplo).
export const FORM_STATES = [
    { key: 'not_started', label: 'No iniciado', color: 'slate' },
    { key: 'in_progress', label: 'En progreso', color: 'amber' },
    { key: 'completed', label: 'Completado', color: 'sky' },
    { key: 'submitted', label: 'Enviado', color: 'emerald' },
    { key: 'in_review', label: 'En revisión', color: 'indigo' },
    { key: 'approved', label: 'Aprobado', color: 'emerald' },
    { key: 'rejected', label: 'Rechazado', color: 'red' },
];
const REVIEW_STATES = ['in_review', 'approved', 'rejected'];

export const deriveState = (record) => {
    if (!record) return 'not_started';
    if (REVIEW_STATES.includes(record.reviewStatus)) return record.reviewStatus;
    if (record.status === 'submitted') return 'submitted';
    const pct = Number(record.completionPct || 0);
    if (pct >= 100) return 'completed';
    return pct > 0 ? 'in_progress' : 'not_started';
};

// ── Acceso a las respuestas ──────────────────────────────────────────
export const readRecord = async (submissionId, formKey) => {
    const table = tableFor(formKey);
    const { rows } = storageIsShared(formKey)
        ? await db.query(`SELECT * FROM "${table}" WHERE "submissionId" = $1 AND "formKey" = $2 LIMIT 1`, [submissionId, formKey])
        : await db.query(`SELECT * FROM "${table}" WHERE "submissionId" = $1 LIMIT 1`, [submissionId]);
    return rows[0] || null;
};

/** Todas las respuestas de un proyecto, indexadas por formulario. */
export const readAllRecords = async (submissionId, forms) => {
    const out = {};
    for (const form of forms) {
        out[form.key] = await readRecord(submissionId, form.key).catch(() => null);
    }
    return out;
};

/**
 * Guarda las respuestas del club. `answers` ya viene depurado: sin la sección
 * del Distrito y sin campos derivados.
 */
const writeAnswers = async (submissionId, formKey, { answers, pct, submitted = false }) => {
    const table = tableFor(formKey);
    const status = submitted ? 'submitted' : 'draft';
    const payload = JSON.stringify(answers);

    if (storageIsShared(formKey)) {
        const { rows } = await db.query(`
            INSERT INTO "${table}" ("submissionId", "formKey", answers, "completionPct", status, "submittedAt", "lastEditedAt")
            VALUES ($1,$2,$3::jsonb,$4,$5,${submitted ? 'NOW()' : 'NULL'},NOW())
            ON CONFLICT ("submissionId", "formKey") DO UPDATE
            SET answers = $3::jsonb, "completionPct" = $4,
                status = ${submitted ? `'submitted'` : `"${table}".status`},
                "submittedAt" = ${submitted ? 'NOW()' : `"${table}"."submittedAt"`},
                "lastEditedAt" = NOW(), "updatedAt" = NOW()
            RETURNING *
        `, [submissionId, formKey, payload, pct, status]);
        return rows[0];
    }

    const { rows } = await db.query(`
        INSERT INTO "${table}" ("submissionId", answers, "completionPct", status, "submittedAt", "lastEditedAt")
        VALUES ($1,$2::jsonb,$3,$4,${submitted ? 'NOW()' : 'NULL'},NOW())
        ON CONFLICT ("submissionId") DO UPDATE
        SET answers = $2::jsonb, "completionPct" = $3,
            status = ${submitted ? `'submitted'` : `"${table}".status`},
            "submittedAt" = ${submitted ? 'NOW()' : `"${table}"."submittedAt"`},
            "lastEditedAt" = NOW(), "updatedAt" = NOW()
        RETURNING *
    `, [submissionId, payload, pct, status]);
    return rows[0];
};

/** Crea el borrador inicial con la información que ya conocemos del proyecto. */
const createDraft = async (submissionId, formKey, answers, pct) => {
    const table = tableFor(formKey);
    const payload = JSON.stringify(answers);
    if (storageIsShared(formKey)) {
        const { rows } = await db.query(`
            INSERT INTO "${table}" ("submissionId", "formKey", answers, "completionPct", "lastEditedAt")
            VALUES ($1,$2,$3::jsonb,$4,NOW())
            ON CONFLICT ("submissionId", "formKey") DO NOTHING
            RETURNING *
        `, [submissionId, formKey, payload, pct]);
        return rows[0] || await readRecord(submissionId, formKey);
    }
    const { rows } = await db.query(`
        INSERT INTO "${table}" ("submissionId", answers, "completionPct", "lastEditedAt")
        VALUES ($1,$2::jsonb,$3,NOW())
        ON CONFLICT ("submissionId") DO NOTHING
        RETURNING *
    `, [submissionId, payload, pct]);
    return rows[0] || await readRecord(submissionId, formKey);
};

/**
 * Historial. Una revisión por envío, y en los autoguardados como máximo una
 * cada 10 minutos: si no, cada tecleo dejaría una fila.
 */
const saveRevision = async (submissionId, formKey, { answers, pct, action, actorType, actorName, force = false }) => {
    if (!force) {
        const last = await db.query(
            `SELECT "createdAt" FROM "ProjectFairFormRevision" WHERE "submissionId" = $1 AND COALESCE("formKey",'master') = $2 ORDER BY "createdAt" DESC LIMIT 1`,
            [submissionId, formKey]
        ).catch(() => ({ rows: [] }));
        const lastAt = last.rows[0]?.createdAt ? new Date(last.rows[0].createdAt).getTime() : 0;
        if (Date.now() - lastAt <= 10 * 60 * 1000) return;
    }
    await db.query(`
        INSERT INTO "ProjectFairFormRevision" ("submissionId", "formKey", answers, "completionPct", action, "actorType", "actorName")
        VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)
    `, [submissionId, formKey, JSON.stringify(answers), pct, action, actorType, actorName]).catch(() => {});
};

// ── Precarga ─────────────────────────────────────────────────────────
/**
 * Valores que ya conocemos del proyecto y no hay por qué volver a pedir.
 * El destino de cada dato lo decide el mapa `prefill` de cada plantilla, así
 * que reordenar o renombrar secciones no rompe la precarga.
 *
 * `prefillFrom` va un paso más allá: copia respuestas de OTRO formulario del
 * mismo proyecto ('formKey.seccion.campo'), que es lo que evita que el club
 * escriba dos veces el objetivo o los beneficiarios.
 */
export const seedAnswersFor = (template, submission, cfg, relatedAnswers = {}) => {
    const sources = {
        projectName: submission.projectName || '',
        clubName: submission.clubName || '',
        district: submission.district || '',
        // v4.677 — Ya se piden en la postulación. Antes la ciudad iba vacía y
        // el país era el de la edición, así que el club tenía que escribirlos
        // otra vez en el formulario maestro.
        city: submission.city || '',
        country: submission.country || cfg?.edition?.country || 'Colombia',
        focusArea: submission.focusAreaLabel ? [submission.focusAreaLabel] : [],
        // Misma área, en texto: para los formularios que la piden con una sola
        // opción en vez de una lista.
        focusAreaLabel: submission.focusAreaLabel || '',
        contactName: `${submission.firstName || ''} ${submission.lastName || ''}`.trim(),
        contactEmail: submission.email || '',
        contactPhone: submission.phone || '',
        budgetUsd: submission.budgetUsd ? Number(submission.budgetUsd) : '',
    };

    const answers = {};
    const put = (target, value) => {
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value) && !value.length) return;
        const [sectionKey, fieldKey] = String(target).split('.');
        if (!sectionKey || !fieldKey) return;
        answers[sectionKey] = { ...(answers[sectionKey] || {}), [fieldKey]: value };
    };

    // 1. Valores por defecto de la propia plantilla (periodos, constantes).
    flattenFields(template).forEach(field => {
        if (field.default !== undefined) put(`${field.sectionKey}.${field.key}`, field.default);
    });
    // 2. Datos de la inscripción.
    for (const [source, target] of Object.entries(template?.prefill || {})) put(target, sources[source]);
    // 3. Respuestas de otros formularios del mismo proyecto.
    for (const [path, target] of Object.entries(template?.prefillFrom || {})) {
        const [formKey, sectionKey, fieldKey] = String(path).split('.');
        if (!formKey || !sectionKey || !fieldKey) continue;
        put(target, relatedAnswers?.[formKey]?.[sectionKey]?.[fieldKey]);
    }
    return answers;
};

// ── Permisos de edición ──────────────────────────────────────────────
/**
 * ¿Puede el club editar este formulario? La convocatoria confirmada permite
 * editar hasta la fecha límite; después queda en solo lectura salvo que el
 * administrador lo reabra.
 *
 * Vivía en `projectFairPortalController`; se movió aquí en v4.642 para que la
 * decisión sea la misma para todos los formularios y haya un solo lugar donde
 * cambiarla.
 */
/**
 * ¿Se puede ABRIR este formulario? Es una pregunta DISTINTA de si se puede
 * editar, y confundirlas rompe uno de los dos lados (v4.979).
 *
 * `canEdit` es falso por cinco motivos y sólo UNO de ellos justifica cerrar la
 * puerta: sin pago confirmado no hay nada que consultar —el borrador ni
 * siquiera se siembra—. Los otros cuatro —reembolso, cierre del comité,
 * aprobación del Distrito, plazo vencido— dejan el formulario en SOLO LECTURA
 * a propósito: el reembolso lo dice con esas palabras («puedes consultar y
 * descargar tu proyecto»), y cerrarlos ahí le quitaría al club el acceso a un
 * trabajo que ya hizo.
 *
 * Por eso la puerta se decide con el CRITERIO DEL PAGO, no con `canEdit`.
 */
//
// ⚠️ v4.1253 — EL PAGO DEJÓ DE SER LA PUERTA POR DEFECTO. El pedido es «no
// bloquear proyectos por pagos pendientes»: un club postulado formula su
// proyecto aunque todavía no haya pagado. Si la organización quiere exigir el
// pago para esta etapa, lo enciende en la Convocatoria
// (`registration.requirePaymentForForms`) y entonces vuelve a regir el
// criterio de v4.979 — el MISMO `hasConfirmedPayment`, vía `formAccessOf`.
// Lo que sí se exige siempre es que la postulación se haya ENVIADO: un
// borrador se termina en el propio perfil.
export const formIsAvailable = (submission, cfg = null) => formAccessOf(submission, cfg).available;

/**
 * ¿Puede el club editar este formulario?
 *
 * ⚠️ v4.1330 — LA FECHA DE CIERRE YA NO DECIDE SOLA. Hasta v4.1329 la última
 * regla era «pasó `cfg.deadline` → solo lectura (salvo «Reabrir edición»)»:
 * un club con la Formulación al 53 % no podía terminarla. La fecha límite
 * ahora cierra las postulaciones NUEVAS (`applicationsClosedOf`) y lo ya
 * inscrito lo gobierna la política «Edición de proyectos después del cierre»
 * de la convocatoria (`fairFormEditVerdict`): vigencia, formularios, estados
 * y, en `lockedFieldsFor`, qué campos quedan bloqueados.
 *
 * Las reglas anteriores siguen delante, en el mismo orden: pago (si la
 * Convocatoria lo exige), reembolso, cierre del comité y aprobación del
 * Distrito. «Reabrir edición» sigue siendo la autorización individual.
 *
 * `editWindow` viaja con la respuesta para que la pantalla no vuelva a
 * decidir nada: fase (antes o después del cierre), por qué, hasta cuándo y si
 * el club puede pedir la autorización.
 */
export const editability = (submission, form, cfg, account = null, formKey = MASTER_FORM_KEY) => {
    const puerta = formAccessOf(submission, cfg);
    if (!puerta.available) {
        return { canEdit: false, reason: puerta.reason, editWindow: null };
    }
    const v = fairFormEditVerdict(submission, cfg, formKey, form);
    const request = editRequestOf(submission, formKey);
    const editWindow = {
        phase: v.phase, code: v.code, restricted: !!v.restricted,
        until: v.until, deadline: v.deadline,
        requestable: false, requestedAt: null,
    };
    // Rol suspendido (reembolso): conserva consulta y descarga, pierde edición.
    if (account?.role === APPLICANT_ROLES.SUSPENDED) {
        return { canEdit: false, reason: 'Tu inscripción fue reembolsada. Puedes consultar y descargar tu proyecto, pero ya no editarlo.', editWindow };
    }
    if (form?.lockedAt && !form?.reopenedAt) {
        return { canEdit: false, reason: 'El comité cerró la edición de este formulario.', editWindow };
    }
    if (form?.reviewStatus === 'approved') {
        return { canEdit: false, reason: 'El Distrito ya aprobó esta solicitud, así que quedó en solo lectura.', editWindow };
    }
    if (!v.canEdit) {
        editWindow.requestable = !!v.requestable;
        editWindow.requestedAt = v.requestable ? (request?.at || null) : null;
        const reason = editWindow.requestedAt
            ? `${v.reason} Ya enviaste la solicitud de autorización; el comité organizador la revisará.`
            : v.reason;
        return { canEdit: false, reason, editWindow };
    }
    return { canEdit: true, reason: null, editWindow };
};

// ── Edición después del cierre: campos y bitácora (v4.1330) ──────────

/** Por qué hay campos bloqueados, en una frase para el club. */
const lockedReasonOf = (edit, cfg) => {
    const policy = fairPostClosePolicyOf(cfg);
    const cierre = edit?.editWindow?.deadline ? `Desde el cierre de postulaciones (${formatDateEs(edit.editWindow.deadline)})` : 'Desde el cierre de postulaciones';
    if (edit?.editWindow?.restricted) return `${cierre}, con tu proyecto en revisión, los datos sensibles (club, presupuesto, montos y contactos) solo se pueden cambiar con autorización del comité organizador.`;
    if (policy.scope === 'pending') return `${cierre} solo se pueden completar los campos que estaban pendientes. Para corregir un dato ya registrado, escríbele al comité organizador.`;
    if (policy.scope === 'selected') return `${cierre} solo se pueden modificar los campos habilitados por el comité organizador.`;
    return `${cierre}, algunos datos sensibles solo se pueden cambiar con autorización del comité organizador.`;
};

/**
 * Los campos que el servidor no dejará cambiar en este formulario. Para el
 * alcance «solo campos pendientes» se usa la FOTO de lo pendiente tomada la
 * primera vez que el formulario se tocó después del cierre
 * (`metadata.postCloseBaseline`): si se calculara con lo guardado en cada
 * autoguardado, un campo se bloquearía en cuanto el club terminara de
 * escribir su primera letra.
 */
const fieldLocksFor = (submission, cfg, form, record) => {
    const verdict = fairFormEditVerdict(submission, cfg, form.key, record);
    const policy = fairPostClosePolicyOf(cfg);
    const baseline = submission?.metadata?.postCloseBaseline?.[form.key];
    return lockedFieldsFor({
        template: form.template, saved: record?.answers || {}, verdict, policy, formKey: form.key,
        pendingPaths: Array.isArray(baseline) ? baseline : null,
    });
};

/**
 * Toma la foto de lo pendiente la PRIMERA vez que el formulario se abre o se
 * guarda después del cierre. Es un UPDATE condicional: no pisa una foto que
 * ya exista. Devuelve la postulación con la foto puesta.
 */
const ensurePostCloseBaseline = async (submission, cfg, form, record) => {
    const verdict = fairFormEditVerdict(submission, cfg, form.key, record);
    if (verdict.phase !== 'post_close') return submission;
    if (Array.isArray(submission?.metadata?.postCloseBaseline?.[form.key])) return submission;
    const pending = pendingFieldsOf(form.template, record?.answers || {});
    const { rows } = await db.query(`
        UPDATE "ProjectFairSubmission"
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('postCloseBaseline',
                COALESCE(metadata->'postCloseBaseline', '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb))
        WHERE id = $1 AND (metadata->'postCloseBaseline'->$2::text) IS NULL
        RETURNING *
    `, [submission.id, form.key, JSON.stringify(pending)]).catch(() => ({ rows: [] }));
    if (rows[0]) return rows[0];
    const again = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [submission.id]).catch(() => ({ rows: [] }));
    return again.rows[0] || submission;
};

/**
 * Bitácora de lo que cambió el club, campo a campo, en la tabla del
 * Expediente (`ProjectDossierRevision`): la pestaña «Historial» del
 * expediente ya la muestra. Los autoguardados de un mismo campo en media
 * hora se AGRUPAN en una sola fila (el «antes» es el primero, el «después» el
 * último); si el club deshizo su cambio, la fila desaparece.
 *
 * Después del cierre además marca la postulación: «actualizada después del
 * cierre» y «cambios pendientes de revisión». NUNCA toca el estado del
 * proyecto, el pago, `appliedAt` ni `createdAt`.
 */
const trackClubChanges = async ({ submission, cfg, form, before, after, phase, account, submitted = false }) => {
    const changes = diffAnswers({ template: form.template, before, after, policy: fairPostClosePolicyOf(cfg), formKey: form.key });
    const postClose = phase === 'post_close';
    if (!changes.length && !(postClose && submitted)) return changes;
    const kind = postClose ? 'club_edit_post_close' : 'club_edit';
    const actor = { id: account?.id || null, name: submission.email || 'Club', role: 'club' };
    try {
        await ensureProjectDossierSchema();
        for (const c of changes) {
            const path = `${form.key}.${c.path}`;
            const reason = [
                postClose ? 'Edición del club después del cierre de postulaciones' : 'Edición del club',
                c.sensitive ? 'campo sensible' : null,
                submitted ? 'al enviar el formulario' : null,
            ].filter(Boolean).join(' · ');
            const upd = await db.query(`
                UPDATE "ProjectDossierRevision" SET "after" = $4::jsonb, reason = $5
                WHERE id = (
                    SELECT id FROM "ProjectDossierRevision"
                    WHERE "submissionId" = $1 AND path = $2 AND kind = $3
                      AND COALESCE("actorName", '') = $6 AND "createdAt" > NOW() - INTERVAL '30 minutes'
                    ORDER BY "createdAt" DESC LIMIT 1
                )
                RETURNING id, "before"
            `, [submission.id, path, kind, JSON.stringify(c.after ?? null), reason, actor.name]);
            if (upd.rows[0]) {
                if (sameValue(upd.rows[0].before, c.after)) {
                    await db.query('DELETE FROM "ProjectDossierRevision" WHERE id = $1', [upd.rows[0].id]);
                }
                continue;
            }
            await db.query(`
                INSERT INTO "ProjectDossierRevision" ("submissionId", kind, lang, path, label, "before", "after", reason, "actorId", "actorName", "actorRole")
                VALUES ($1,$2,NULL,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10)
            `, [submission.id, kind, path, `${form.template?.shortTitle || form.template?.title || form.key} · ${c.label}`,
                JSON.stringify(c.before ?? null), JSON.stringify(c.after ?? null), reason, actor.id, actor.name, actor.role]);
        }
    } catch (err) {
        // La bitácora no puede impedir que el club guarde su trabajo.
        console.warn('[project-forms] bitácora de cambios:', err?.message);
    }

    const sensitive = changes.some(c => c.sensitive);
    await db.query(postClose ? `
        UPDATE "ProjectFairSubmission"
        SET metadata = COALESCE(metadata, '{}'::jsonb)
            || jsonb_build_object('lastClubEditAt', NOW()::text)
            || jsonb_build_object('postCloseEdit', jsonb_build_object(
                'firstAt', COALESCE(metadata->'postCloseEdit'->>'firstAt', NOW()::text),
                'lastAt', NOW()::text,
                'pendingReview', true,
                'sensitive', (COALESCE((metadata->'postCloseEdit'->>'pendingReview')::boolean, false)
                              AND COALESCE((metadata->'postCloseEdit'->>'sensitive')::boolean, false)) OR $2::boolean,
                'forms', (SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb)
                          FROM jsonb_array_elements_text(COALESCE(metadata->'postCloseEdit'->'forms', '[]'::jsonb) || jsonb_build_array($3::text)) AS x),
                'changes', COALESCE((metadata->'postCloseEdit'->>'changes')::int, 0) + $4::int,
                'reviewedAt', metadata->'postCloseEdit'->'reviewedAt',
                'reviewedBy', metadata->'postCloseEdit'->'reviewedBy'
            ))
        WHERE id = $1
    ` : `
        UPDATE "ProjectFairSubmission"
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lastClubEditAt', NOW()::text)
        WHERE id = $1
    `, postClose ? [submission.id, sensitive, form.key, changes.length] : [submission.id]).catch(err => {
        console.warn('[project-forms] marca de edición posterior al cierre:', err?.message);
    });
    return changes;
};

// ── Contexto común de las peticiones del panel del club ──────────────
const portalContext = async (req) => {
    await ensureTables();
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.portal.submissionId]);
    const submission = rows[0];
    if (!submission) return { error: { code: 404, message: 'No encontramos tu inscripción.' } };
    // v4.1253 — La convocatoria de SU edición (regla de v4.691): desde que el
    // pago puede exigirse o no por edición, leer la abierta podría abrirle o
    // cerrarle los formularios a un club con la regla de otra feria.
    const cfg = await readConfigForSubmission(submission.eventId || null);
    const { rows: accRows } = await db.query('SELECT * FROM "ProjectFairAccount" WHERE "submissionId" = $1 LIMIT 1', [submission.id]);
    return { cfg, submission, account: accRows[0] || null };
};

/**
 * Tarjeta de un formulario para el panel del proyecto: qué es, cómo va y qué
 * se puede hacer con él. Es lo que dibuja la cuadrícula de "Gestión de
 * Proyectos", así que un formulario nuevo aparece ahí sin tocar la pantalla.
 */
export const cardFor = (form, record, { submission, cfg, account }) => {
    const edit = editability(submission, record, cfg, account, form.key);
    const state = deriveState(record);
    const pct = Number(record?.completionPct || 0);
    // v4.1330 — La acción de la tarjeta la decide el servidor con el MISMO
    // veredicto que acepta o rechaza las escrituras: la pantalla no puede
    // ofrecer «editar» si el guardado va a responder 403.
    const action = !edit.canEdit
        ? (edit.editWindow?.requestedAt
            ? { key: 'pending', label: 'Edición pendiente de autorización' }
            : { key: 'view', label: 'Ver formulario' })
        : (state === 'not_started'
            ? { key: 'start', label: 'Diligenciar formulario' }
            : (pct < 100 && record?.status !== 'submitted'
                ? { key: 'continue', label: 'Continuar formulario' }
                : { key: 'edit', label: 'Ver y editar formulario' }));
    return {
        key: form.key,
        title: form.template?.title || form.key,
        shortTitle: form.template?.shortTitle || form.template?.title || form.key,
        subtitle: form.template?.subtitle || '',
        intro: form.template?.intro || '',
        icon: form.template?.icon || 'file-text',
        sections: (form.template?.sections || []).filter(s => !s.adminOnly).length,
        state,
        status: record?.status || 'draft',
        reviewStatus: record?.reviewStatus || null,
        reviewNote: record?.reviewNote || null,
        completionPct: Number(record?.completionPct || 0),
        submittedAt: record?.submittedAt || null,
        lastEditedAt: record?.lastEditedAt || null,
        lockedAt: record?.lockedAt || null,
        canEdit: edit.canEdit,
        reason: edit.reason,
        editWindow: edit.editWindow,
        action,
        // «Se puede ABRIR» es otra pregunta que «se puede EDITAR»: un
        // reembolso o un plazo vencido dejan el formulario en solo lectura y
        // el club sigue pudiendo consultarlo. Sin pago confirmado no hay nada
        // que consultar, y la tarjeta deja de ser un enlace.
        available: formIsAvailable(submission, cfg),
        ...approvalState(form.template, record),
    };
};

/**
 * Estado del espacio institucional: si el formulario lo tiene y si ya está
 * diligenciado. Mira donde corresponda —la columna `approval` o las respuestas—
 * según cómo esté declarada la sección.
 */
const approvalState = (template, record) => {
    const section = districtSectionOf(template);
    if (!section) return { hasApproval: false, approvalFilled: false };
    const values = isProtectedSection(section)
        ? record?.approval?.[section.key]
        : record?.answers?.[section.key];
    return {
        hasApproval: true,
        approvalFilled: !!values && Object.values(values).some(v => String(v ?? '').trim() !== ''),
    };
};

// ════════════════════════════════════════════════════════════════════
// Panel del club
// ════════════════════════════════════════════════════════════════════

/** Resumen de todos los formularios del proyecto: alimenta las tarjetas. */
export const listPortalForms = async (submission, cfg, account) => {
    const forms = resolveForms(cfg);
    const records = await readAllRecords(submission.id, forms);
    return forms.map(form => cardFor(form, records[form.key], { submission, cfg, account }));
};

// GET /portal/forms
export const getForms = async (req, res) => {
    try {
        const ctx = await portalContext(req);
        if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.message });
        res.json({ forms: await listPortalForms(ctx.submission, ctx.cfg, ctx.account), states: FORM_STATES });
    } catch (error) {
        console.error('[project-forms] getForms:', error);
        res.status(500).json({ error: 'No pudimos cargar tus formularios.' });
    }
};

// GET /portal/forms/:formKey
export const getForm = async (req, res) => {
    try {
        const ctx = await portalContext(req);
        if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.message });
        const { cfg, submission, account } = ctx;

        const form = resolveForm(cfg, req.params.formKey);
        if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

        // ⚠️ SIN PAGO CONFIRMADO EL FORMULARIO NO SE ENTREGA (v4.979). Hasta
        // v4.978 la puerta estaba en las escrituras —`saveForm` y `submitForm`
        // cortan con 403— y esta lectura devolvía la plantilla ENTERA con
        // `canEdit:false`: los campos salían inhabilitados, pero el formulario
        // se podía abrir y recorrer. Se reportó como «cualquier usuario que no
        // ha completado el pago puede acceder a los formularios», y es exacto.
        // Va en el SERVIDOR y no en la tarjeta: esconder un control no protege
        // un endpoint de quien lo conoce (v4.868).
        const puerta = formAccessOf(submission, cfg);
        if (!puerta.available) {
            // 402 sólo cuando lo que falta es el pago (y la Convocatoria lo
            // exige); 409 cuando falta enviar la postulación.
            return res.status(puerta.code === 'needs_payment' ? 402 : 409).json({
                error: puerta.reason,
                needsPayment: puerta.code === 'needs_payment',
                needsApplication: puerta.code === 'not_applied',
            });
        }

        let record = await readRecord(submission.id, form.key);
        if (!record) {
            // Primera apertura: se crea el borrador ya precargado con lo que
            // la plataforma sabe del proyecto y con lo que el club respondió
            // en los otros formularios.
            const others = await readAllRecords(submission.id, resolveForms(cfg));
            const related = Object.fromEntries(Object.entries(others).map(([k, r]) => [k, r?.answers || {}]));
            const answers = seedAnswersFor(form.template, submission, cfg, related);
            record = await createDraft(submission.id, form.key, answers, completionOf(form.template, answers));
            await logEvent(submission.id, {
                type: 'form_started',
                title: `${form.template?.title || form.key}: iniciado`,
                detail: 'El club abrió el formulario por primera vez.',
                actor: { name: submission.email, role: 'club' },
                metadata: { formKey: form.key },
            });
        }

        // v4.1330 — Después del cierre: la foto de lo pendiente (para el
        // alcance «solo campos pendientes») y los campos que el servidor no
        // va a aceptar, para que la pantalla los muestre bloqueados.
        const fresh = await ensurePostCloseBaseline(submission, cfg, form, record);
        const edit = editability(fresh, record, cfg, account, form.key);
        const lockedFields = edit.canEdit ? fieldLocksFor(fresh, cfg, form, record) : [];

        const answers = record?.answers || {};
        res.json({
            formKey: form.key,
            template: form.template,
            form: record ? {
                status: record.status, completionPct: record.completionPct,
                submittedAt: record.submittedAt, lastEditedAt: record.lastEditedAt,
                lockedAt: record.lockedAt, reviewStatus: record.reviewStatus,
                reviewNote: record.reviewNote, reviewedAt: record.reviewedAt,
            } : null,
            state: deriveState(record),
            answers,
            // La sección del Distrito viaja en solo lectura: el club la ve
            // (para saber qué le aprobaron) pero no la escribe.
            approval: record?.approval || {},
            computed: withComputed(form.template, answers),
            focusAreas: cfg.focusAreas || [],
            deadline: cfg.deadline,
            submission: {
                id: submission.id, publicRef: submission.publicRef,
                projectName: submission.projectName, clubName: submission.clubName,
                district: submission.district,
            },
            ...edit,
            lockedFields,
            lockedReason: lockedFields.length ? lockedReasonOf(edit, cfg) : null,
        });
    } catch (error) {
        console.error('[project-forms] getForm:', error);
        res.status(500).json({ error: 'No pudimos cargar el formulario.' });
    }
};

// PUT /portal/forms/:formKey — guardar borrador (lo llama el autoguardado)
export const saveForm = async (req, res) => {
    try {
        const ctx = await portalContext(req);
        if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.message });
        const { cfg, submission, account } = ctx;

        const form = resolveForm(cfg, req.params.formKey);
        if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

        const record = await readRecord(submission.id, form.key);
        const edit = editability(submission, record, cfg, account, form.key);
        if (!edit.canEdit) return res.status(403).json({ error: edit.reason, editWindow: edit.editWindow });

        // Aquí se cae cualquier intento de escribir la sección del Distrito.
        // v4.1330 — Y los campos bloqueados por la política posterior al
        // cierre conservan lo guardado, mande el navegador lo que mande.
        const fresh = await ensurePostCloseBaseline(submission, cfg, form, record);
        const before = record?.answers || {};
        const lockedFields = fieldLocksFor(fresh, cfg, form, record);
        const answers = applyFieldLocks(stripProtected(form.template, req.body?.answers), before, lockedFields);
        const pct = completionOf(form.template, answers);
        const saved = await writeAnswers(submission.id, form.key, { answers, pct });
        await trackClubChanges({ submission: fresh, cfg, form, before, after: answers, phase: edit.editWindow?.phase, account });

        await saveRevision(submission.id, form.key, {
            answers, pct, action: 'save', actorType: 'club', actorName: submission.email,
        });

        res.json({
            completionPct: pct, savedAt: saved.lastEditedAt, status: saved.status,
            state: deriveState(saved), computed: withComputed(form.template, answers),
            lockedFields,
        });
    } catch (error) {
        console.error('[project-forms] saveForm:', error);
        res.status(500).json({ error: 'No pudimos guardar los cambios.' });
    }
};

// POST /portal/forms/:formKey/submit
export const submitForm = async (req, res) => {
    try {
        const ctx = await portalContext(req);
        if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.message });
        const { cfg, submission, account } = ctx;

        const form = resolveForm(cfg, req.params.formKey);
        if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

        const record = await readRecord(submission.id, form.key);
        const edit = editability(submission, record, cfg, account, form.key);
        if (!edit.canEdit) return res.status(403).json({ error: edit.reason, editWindow: edit.editWindow });

        const fresh = await ensurePostCloseBaseline(submission, cfg, form, record);
        const before = record?.answers || {};
        const lockedFields = fieldLocksFor(fresh, cfg, form, record);
        const answers = req.body?.answers !== undefined
            ? applyFieldLocks(stripProtected(form.template, req.body.answers), before, lockedFields)
            : before;
        const postClose = edit.editWindow?.phase === 'post_close';

        const missing = missingRequired(form.template, answers);
        if (missing.length) {
            return res.status(400).json({ error: 'Faltan campos obligatorios por completar.', missing });
        }
        // Formato: correos, teléfonos, fechas, montos y porcentajes. Se
        // comprueba en el servidor aunque el navegador ya lo haya hecho.
        const invalid = validateAnswers(form.template, answers);
        if (invalid.length) {
            return res.status(400).json({ error: 'Hay campos con un formato incorrecto.', invalid });
        }

        const pct = completionOf(form.template, answers);
        const saved = await writeAnswers(submission.id, form.key, { answers, pct, submitted: true });

        await saveRevision(submission.id, form.key, {
            answers, pct, action: 'submit', actorType: 'club', actorName: submission.email, force: true,
        });

        await trackClubChanges({ submission: fresh, cfg, form, before, after: answers, phase: edit.editWindow?.phase, account, submitted: true });

        // La postulación entra a revisión salvo que ya esté más avanzada. Sólo
        // lo hace la Formulación: los formularios de apoyo no mueven el estado
        // general del proyecto.
        // ⚠️ v4.1330 — DESPUÉS DEL CIERRE NO SE MUEVE EL ESTADO. Un proyecto
        // «Postulado» que completa su Formulación sigue «Postulado»: lo que
        // se enciende es «Cambios pendientes de revisión» (`trackClubChanges`).
        // El estado lo decide el comité, no un guardado.
        if (form.key === MASTER_FORM_KEY && !postClose) {
            await db.query(`
                UPDATE "ProjectFairSubmission"
                SET "workflowStatus" = CASE WHEN "workflowStatus" IN ('payment_confirmed','received','pending_payment')
                                            THEN 'in_review' ELSE "workflowStatus" END,
                    "updatedAt" = NOW()
                WHERE id = $1
            `, [submission.id]);
        }

        await logEvent(submission.id, {
            type: form.key === MASTER_FORM_KEY ? 'form_submitted_master' : 'project_form_submitted',
            title: `${form.template?.title || form.key}: enviado`,
            detail: postClose
                ? `El club envió el formulario completo (${pct}%) después del cierre de postulaciones. Queda pendiente de revisión.`
                : `El club envió el formulario completo (${pct}%).`,
            actor: { name: submission.email, role: 'club' },
            metadata: { formKey: form.key, postClose },
        });

        res.json({ status: 'submitted', state: deriveState(saved), completionPct: pct, submittedAt: saved.submittedAt });
    } catch (error) {
        console.error('[project-forms] submitForm:', error);
        res.status(500).json({ error: 'No pudimos enviar el formulario.' });
    }
};

const escHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * POST /portal/forms/:formKey/edit-request — v4.1330.
 *
 * Cuando la política pide autorización (vigencia «solo con autorización
 * individual», un estado como «Aprobado», o la edición posterior al cierre
 * apagada), el club no queda sin salida: PIDE la autorización desde la
 * tarjeta. Queda en `metadata.editRequests[formKey]`, en el historial del
 * proyecto y en el filtro «Pendientes de autorización» del panel; si la
 * convocatoria tiene correos del comité, también les llega un aviso.
 *
 * Idempotente: una segunda solicitud del mismo formulario no duplica nada.
 * La resuelve el comité con «Reabrir edición» (o «Cerrar edición»), que la
 * borra. La postulación sale del TOKEN, nunca del cuerpo.
 */
export const requestEdit = async (req, res) => {
    try {
        const ctx = await portalContext(req);
        if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.message });
        const { cfg, submission, account } = ctx;
        const form = resolveForm(cfg, req.params.formKey);
        if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

        const record = await readRecord(submission.id, form.key);
        const edit = editability(submission, record, cfg, account, form.key);
        if (edit.canEdit) return res.status(409).json({ error: 'Este formulario ya se puede editar.', code: 'already_editable' });
        if (!edit.editWindow?.requestable) return res.status(409).json({ error: edit.reason || 'Este formulario no admite solicitudes de edición.', code: 'not_requestable' });
        if (edit.editWindow.requestedAt) {
            return res.json({ ok: true, alreadyRequested: true, card: cardFor(form, record, { submission, cfg, account }) });
        }

        const note = clean(req.body?.note, 1000) || null;
        const { rows } = await db.query(`
            UPDATE "ProjectFairSubmission"
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('editRequests',
                    COALESCE(metadata->'editRequests', '{}'::jsonb) || jsonb_build_object($2::text,
                        jsonb_build_object('at', NOW()::text, 'note', $3::text, 'by', $4::text)))
            WHERE id = $1 AND (metadata->'editRequests'->$2::text) IS NULL
            RETURNING *
        `, [submission.id, form.key, note, submission.email || '']);
        const updated = rows[0] || (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [submission.id])).rows[0];

        if (rows[0]) {
            const title = form.template?.title || form.key;
            await logEvent(submission.id, {
                type: 'form_edit_requested',
                title: `${title}: solicitud de autorización para editar`,
                detail: note ? `Motivo del club: ${note}` : 'El club pidió autorización para editar el formulario después del cierre.',
                actor: { name: submission.email, role: 'club' },
                metadata: { formKey: form.key },
            });
            const admins = Array.isArray(cfg.notifications?.adminEmails) ? cfg.notifications.adminEmails.filter(e => /^\S+@\S+\.\S+$/.test(String(e || ''))) : [];
            if (admins.length) {
                await sendFairEmail({
                    to: admins.join(','),
                    subject: `Solicitud de edición — ${submission.publicRef} · ${submission.clubName}`,
                    html: `<p>El club <strong>${escHtml(submission.clubName)}</strong> pidió autorización para editar <strong>${escHtml(title)}</strong> del proyecto <strong>${escHtml(submission.projectName)}</strong> (${escHtml(submission.publicRef)}) después del cierre de postulaciones.</p>`
                        + (note ? `<p><em>Motivo:</em> ${escHtml(note)}</p>` : '')
                        + '<p>Para autorizarla, abre la postulación en el panel de la Feria → Formularios → «Reabrir edición».</p>',
                    cfg,
                }).catch(() => {});
            }
        }
        res.json({ ok: true, card: cardFor(form, record, { submission: updated, cfg, account }) });
    } catch (error) {
        console.error('[project-forms] requestEdit:', error);
        res.status(500).json({ error: 'No pudimos enviar tu solicitud.' });
    }
};

/** Borra la solicitud de autorización de un formulario (la resolvió el comité). */
export const clearEditRequest = (submissionId, formKey) => db.query(`
    UPDATE "ProjectFairSubmission"
    SET metadata = metadata #- ARRAY['editRequests', $2::text]
    WHERE id = $1 AND (metadata->'editRequests'->$2::text) IS NOT NULL
`, [submissionId, formKey]).catch(() => {});

// ════════════════════════════════════════════════════════════════════
// Panel administrativo
// ════════════════════════════════════════════════════════════════════

/**
 * POST /admin/postulaciones/:id/post-close/reviewed — v4.1330.
 *
 * El comité revisó los cambios que el club hizo después del cierre: apaga
 * «Cambios pendientes de revisión» y deja quién y cuándo. NO toca el estado
 * del proyecto ni el pago: aprobar o pedir ajustes sigue siendo «Cambiar
 * estado». La marca «actualizado después del cierre» se conserva.
 */
export const markPostCloseReviewed = withAccess(async (req, res, { access }) => {
    const actor = actorFrom(req, access);
    const { rows } = await db.query(`
        UPDATE "ProjectFairSubmission"
        SET metadata = jsonb_set(metadata, '{postCloseEdit}', (metadata->'postCloseEdit')
                || jsonb_build_object('pendingReview', false, 'sensitive', false, 'reviewedAt', NOW()::text, 'reviewedBy', $2::text))
        WHERE id = $1 AND (metadata->'postCloseEdit') IS NOT NULL
        RETURNING id, metadata->'postCloseEdit' AS "postCloseEdit"
    `, [req.params.id, actor.name || 'Comité']);
    if (!rows[0]) return res.status(404).json({ error: 'Este proyecto no tiene cambios posteriores al cierre.' });
    await logEvent(req.params.id, {
        type: 'post_close_reviewed',
        title: 'Cambios posteriores al cierre revisados',
        detail: clean(req.body?.note, 500) || null,
        actor,
    });
    res.json({ ok: true, postCloseEdit: rows[0].postCloseEdit });
}, 'changeStatus');

// GET /admin/forms?formKey=…&formStatus=…&search=…
export const adminListForms = withAccess(async (req, res, { cfg, access }) => {
    const formKey = clean(req.query.formKey, 60) || MASTER_FORM_KEY;
    const form = resolveForm(cfg, formKey);
    if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

    const table = tableFor(form.key);
    const params = [];
    let join = `LEFT JOIN "${table}" f ON f."submissionId" = s.id`;
    if (storageIsShared(form.key)) {
        params.push(form.key);
        join += ` AND f."formKey" = $1`;
    }

    // v4.1311 — Un proyecto ARCHIVADO no se evalúa: sale de la revisión de
    // formularios igual que del listado de postulaciones.
    const where = ['s."archivedAt" IS NULL'];
    const formStatus = clean(req.query.formStatus, 30);
    if (formStatus === 'not_started') where.push('f.id IS NULL');
    else if (formStatus === 'draft') where.push(`f.status = 'draft'`);
    else if (formStatus === 'submitted') where.push(`f.status = 'submitted'`);
    else if (formStatus === 'paid_pending') where.push(`s.status = 'paid' AND (f.id IS NULL OR f.status = 'draft')`);

    const search = clean(req.query.search, 160);
    if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        where.push(`(s."clubName" ILIKE $${i} OR s."projectName" ILIKE $${i} OR s.email ILIKE $${i} OR s."publicRef" ILIKE $${i})`);
    }

    const { rows } = await db.query(`
        SELECT s.id, s."publicRef", s."projectName", s."clubName", s.district, s.email,
               s.status AS "paymentStatus", s."workflowStatus", s."createdAt",
               f.status AS "formStatus", f."completionPct", f."submittedAt", f."lastEditedAt",
               f."lockedAt", f."reopenedAt", f."reviewStatus", f."reviewedAt", f.approval, f.answers,
               s.metadata->'editRequests' AS "editRequests",
               (a.id IS NOT NULL) AS "hasAccount", a."lastLoginAt"
        FROM "ProjectFairSubmission" s
        ${join}
        LEFT JOIN "ProjectFairAccount" a ON a."submissionId" = s.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY f."submittedAt" DESC NULLS LAST, s."createdAt" DESC
    `, params);

    // `answers` y `approval` se leen para saber si el espacio institucional ya
    // está diligenciado, pero no se devuelven: el listado no necesita cargar
    // las respuestas completas de cada club.
    const forms = rows.map(({ answers, approval, editRequests, ...r }) => ({
        ...r,
        // v4.1330 — La solicitud de autorización del club para ESTE formulario.
        editRequest: editRequests?.[form.key] || null,
        ...approvalState(form.template, { answers, approval }),
        state: deriveState(r),
    }));
    const stats = forms.reduce((acc, r) => {
        const key = r.formStatus || 'not_started';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    res.json({
        formKey: form.key,
        available: resolveForms(cfg).map(f => ({
            key: f.key,
            title: f.template?.title,
            shortTitle: f.template?.shortTitle || f.template?.title,
            docx: !!f.docx,
            hasApproval: !!districtSectionOf(f.template),
        })),
        forms, stats, access, states: FORM_STATES,
    });
});

// GET /admin/postulaciones/:id/forms/:formKey — respuestas + plantilla + firma
export const adminGetForm = withAccess(async (req, res, { cfg }) => {
    const form = resolveForm(cfg, req.params.formKey);
    if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

    const { rows } = await db.query(
        'SELECT id, "publicRef", "projectName", "clubName", district, email, status, "workflowStatus" FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1',
        [req.params.id]
    );
    const submission = rows[0];
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada' });

    const record = await readRecord(submission.id, form.key);
    const revisions = await db.query(
        `SELECT id, action, "actorType", "actorName", "completionPct", "createdAt"
         FROM "ProjectFairFormRevision" WHERE "submissionId" = $1 AND COALESCE("formKey",'master') = $2
         ORDER BY "createdAt" DESC LIMIT 30`,
        [submission.id, form.key]
    ).catch(() => ({ rows: [] }));

    res.json({
        submission,
        formKey: form.key,
        template: form.template,
        form: record,
        answers: record?.answers || {},
        approval: record?.approval || {},
        computed: withComputed(form.template, record?.answers || {}),
        state: deriveState(record),
        focusAreas: cfg.focusAreas || [],
        revisions: revisions.rows,
    });
});

/**
 * PUT /admin/postulaciones/:id/forms/:formKey/approval
 *
 * La firma del Gobernador de Distrito y del presidente del Comité de LFRI, y
 * la decisión sobre la solicitud. Es el ÚNICO camino para escribir la sección
 * `adminOnly`: exige sesión de plataforma con rol administrativo y el permiso
 * 'changeStatus' del módulo.
 */
export const saveApproval = withAccess(async (req, res, { cfg, access }) => {
    const form = resolveForm(cfg, req.params.formKey);
    if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

    const section = districtSectionOf(form.template);
    if (!section) return res.status(400).json({ error: 'Este formulario no tiene sección de aprobación.' });

    const record = await readRecord(req.params.id, form.key);
    if (!record) return res.status(404).json({ error: 'Este club todavía no ha iniciado este formulario.' });

    const reviewStatus = REVIEW_STATES.includes(req.body?.reviewStatus) ? req.body.reviewStatus : null;
    const reviewNote = clean(req.body?.reviewNote, 1000) || null;
    const actor = actorFrom(req, access);

    // Dónde vive la sección depende de quién la puede escribir:
    //   · `adminOnly`     → columna `approval`, fuera del alcance del club.
    //   · `districtSpace` → con el resto de las respuestas, porque el club
    //                       también la diligencia (v4.643). Se mezcla campo a
    //                       campo para no borrar lo que ya hubiera escrito.
    // En los dos casos se guarda SÓLO esa sección: el cuerpo no puede tocar
    // ninguna otra respuesta del club.
    const protectedSection = isProtectedSection(section);
    const incoming = req.body?.approval?.[section.key];
    const values = isPlainObject(incoming) ? incoming : {};
    const allowed = new Set((section.fields || []).map(f => f.key));
    const clamped = Object.fromEntries(Object.entries(values).filter(([k]) => allowed.has(k)));

    const approval = protectedSection
        ? { [section.key]: clamped }
        : (record.approval || {});
    const answers = protectedSection
        ? (record.answers || {})
        : { ...(record.answers || {}), [section.key]: { ...(record.answers?.[section.key] || {}), ...clamped } };

    const table = tableFor(form.key);
    const params = [
        JSON.stringify(approval), reviewStatus, reviewNote, actor.name,
        JSON.stringify(answers), completionOf(form.template, answers), req.params.id,
    ];
    if (storageIsShared(form.key)) params.push(form.key);

    const { rows } = await db.query(`
        UPDATE "${table}"
        SET approval = $1::jsonb, "reviewStatus" = COALESCE($2, "reviewStatus"),
            "reviewNote" = COALESCE($3, "reviewNote"), "reviewedAt" = NOW(), "reviewedBy" = $4,
            answers = $5::jsonb, "completionPct" = $6, "updatedAt" = NOW()
        WHERE "submissionId" = $7${storageIsShared(form.key) ? ` AND "formKey" = $8` : ''}
        RETURNING *
    `, params);

    await logEvent(req.params.id, {
        type: 'project_form_reviewed',
        title: `${form.template?.title || form.key}: aprobación institucional`,
        detail: reviewStatus
            ? `El Distrito marcó la solicitud como ${FORM_STATES.find(s => s.key === reviewStatus)?.label || reviewStatus}.`
            : 'Se actualizó el espacio reservado al Distrito.',
        actor,
        metadata: { formKey: form.key, reviewStatus },
    });

    res.json({ form: rows[0], state: deriveState(rows[0]) });
}, 'changeStatus');

// POST /admin/postulaciones/:id/forms/:formKey/reopen | /lock
const setLock = (lock) => withAccess(async (req, res, { cfg, access }) => {
    const form = resolveForm(cfg, req.params.formKey);
    if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

    const table = tableFor(form.key);
    // v4.1330 — Reabrir YA NO devuelve el formulario a borrador: un
    // formulario enviado sigue enviado (con su fecha) mientras el club lo
    // corrige. Antes, autorizar una corrección borraba la constancia del envío.
    const set = lock
        ? `"lockedAt" = NOW(), "reopenedAt" = NULL`
        : `"reopenedAt" = NOW(), "reopenedBy" = $2, "lockedAt" = NULL`;
    const params = lock ? [req.params.id] : [req.params.id, actorFrom(req, access).name];
    if (storageIsShared(form.key)) params.push(form.key);

    const { rows } = await db.query(`
        UPDATE "${table}" SET ${set}, "updatedAt" = NOW()
        WHERE "submissionId" = $1${storageIsShared(form.key) ? ` AND "formKey" = $${params.length}` : ''}
        RETURNING *
    `, params);
    if (!rows[0]) return res.status(404).json({ error: 'Este club todavía no ha iniciado este formulario.' });
    // La solicitud de autorización del club, si había, quedó resuelta.
    await clearEditRequest(req.params.id, form.key);

    await logEvent(req.params.id, {
        type: lock ? 'form_locked' : 'form_reopened',
        title: `${form.template?.title || form.key}: ${lock ? 'edición cerrada' : 'edición reabierta'}`,
        detail: clean(req.body?.reason, 500) || null,
        actor: actorFrom(req, access),
        metadata: { formKey: form.key },
    });
    res.json({ form: rows[0], state: deriveState(rows[0]) });
}, 'changeStatus');

export const lockForm = setLock(true);
export const reopenForm = setLock(false);

export default {
    getForms, getForm, saveForm, submitForm,
    adminListForms, adminGetForm, saveApproval, lockForm, reopenForm,
    requestEdit, markPostCloseReviewed,
};
