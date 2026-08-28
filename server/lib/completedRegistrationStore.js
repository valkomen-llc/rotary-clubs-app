// ════════════════════════════════════════════════════════════════════
// Inscripciones completadas — acceso a datos — v4.944.0
//
// Lo que comparten el formulario público y el panel: resolver el formulario
// por su slug (con la siembra perezosa de la XIII Conferencia), leer y guardar
// la configuración, insertar y mapear filas, asignar el código y buscar
// duplicados. El criterio vive en `completedRegistrationSpec.js`.
//
// Regla del módulo, heredada: TODO se consulta con `eventId`. Ninguna función
// devuelve registros de un evento distinto al que se le pide.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureEventRegistrationSchema } from './ensureEventRegistrationSchema.js';
import { clean, parseJson, ensureEdition, updateEdition } from './eventRegistrationStore.js';
import {
    normalizeCompletedConfig, normalizeCompletedSlug, buildCompletedCode,
    seedForSlug, matchSeedEvent, COMPLETED_SOURCE,
} from './completedRegistrationSpec.js';

// ── Configuración ────────────────────────────────────────────────────

/** La configuración del formulario de un evento, ya normalizada. */
export const getCompletedConfig = (edition) =>
    normalizeCompletedConfig(edition?.settings?.completedForm || {});

/**
 * Guarda la configuración SIN pisar el resto de `settings`. `updateEdition`
 * reemplaza el JSON entero, así que acá se mezcla contra lo guardado: perder
 * los botones o el mensaje de confirmación por guardar este formulario sería
 * el mismo defecto que este cambio corrige en `saveEdition`.
 */
export const saveCompletedConfig = async (event, edition, raw) => {
    const config = normalizeCompletedConfig(raw);
    await updateEdition(event.id, {
        settings: { ...(edition.settings || {}), completedForm: config },
    });
    return config;
};

/**
 * ¿Otro evento ya publica este slug? La dirección es UNA en toda la
 * plataforma: dos formularios con el mismo slug harían que el que resuelva
 * primero se quede con las visitas del otro, en silencio.
 */
export const slugTakenByOther = async (slug, eventId) => {
    const value = normalizeCompletedSlug(slug);
    if (!value) return null;
    const { rows } = await db.query(
        `SELECT "eventId" FROM "EventEdition"
         WHERE settings->'completedForm'->>'slug' = $1 AND "eventId" <> $2
         LIMIT 1`,
        [value, eventId || '']);
    return rows[0]?.eventId || null;
};

// ── Resolución por slug ──────────────────────────────────────────────

const loadEventById = async (eventId) => {
    const { rows } = await db.query(
        `SELECT id, slug, title, "startDate", "endDate", location, "clubId", metadata
         FROM "CalendarEvent" WHERE id = $1 LIMIT 1`, [eventId]);
    return rows[0] || null;
};

/**
 * Siembra perezosa (v4.943): ata el slug de la semilla a su evento AL LEER,
 * como `bindLegacyEdition` en Postulaciones. Sólo escribe si identifica el
 * evento SIN AMBIGÜEDAD y su edición no tiene ya un formulario con slug: atar
 * la URL al evento equivocado —o pisar una configuración que alguien guardó—
 * es peor que pedir que se configure a mano desde la pestaña. Es idempotente:
 * una vez atado, la consulta principal lo encuentra y esto no vuelve a correr.
 */
const bindSeededForm = async (slug) => {
    const seed = seedForSlug(slug);
    if (!seed) return null;

    try {
        const params = seed.titleTokens.map(t => `%${t}%`);
        const where = seed.titleTokens.map((_, i) => `title ILIKE $${i + 1}`).join(' AND ');
        const { rows: candidates } = await db.query(
            `SELECT id, slug, title, "startDate", "endDate", location, "clubId", metadata
             FROM "CalendarEvent" WHERE ${where} LIMIT 5`, params);
        const event = matchSeedEvent(seed, candidates);
        if (!event) {
            // CERO candidatos también se dice (v4.944): «el título del evento no
            // coincide con la semilla» es el diagnóstico que faltaría si esta
            // rama quedara muda — la pestaña del evento permite atar el slug a
            // mano, pero nadie va a buscarla sin esta pista en el log.
            console.warn(`[completed-registrations] semilla "${seed.slug}": ${candidates.length} evento(s) candidato(s) (${candidates.map(c => c.title).join(' | ') || 'ninguno con el título esperado'}), no se ata ninguno.`);
            return null;
        }

        const edition = await ensureEdition(event);
        const existing = getCompletedConfig(edition);
        // Una configuración con slug propio manda: la semilla no la toca.
        if (existing.slug) return null;

        const config = await saveCompletedConfig(event, edition, {
            ...existing, ...seed.config, slug: seed.slug,
        });
        console.log(`[completed-registrations] semilla atada: "${seed.slug}" → ${event.title}`);
        return { event, edition: { ...edition, settings: { ...edition.settings, completedForm: config } }, config };
    } catch (error) {
        console.error('[completed-registrations] siembra del slug:', error?.message);
        return null;
    }
};

/**
 * El formulario detrás de un slug público: evento, edición y configuración.
 * `null` cuando ningún evento lo declara y la semilla tampoco lo resuelve.
 */
export const findCompletedFormBySlug = async (slug) => {
    // La comprobación del esquema NO puede tumbar la LECTURA (v4.944): este
    // camino sólo toca `EventEdition` y `CalendarEvent`, que existen desde
    // v4.648. Un tropiezo del ensure —el arranque en frío de la función con la
    // base despertando, o una ráfaga de DDL que no terminó— se anota y se
    // sigue; si de verdad falta una tabla, la consulta siguiente lo dirá con
    // su propio motivo, que es más específico.
    try { await ensureEventRegistrationSchema(); }
    catch (error) { console.warn('[completed-registrations] ensure en la lectura:', error?.message); }
    const value = normalizeCompletedSlug(slug);
    if (!value) return null;

    const { rows } = await db.query(
        `SELECT * FROM "EventEdition"
         WHERE settings->'completedForm'->>'slug' = $1 LIMIT 1`, [value]);

    if (rows[0]) {
        const event = await loadEventById(rows[0].eventId);
        if (!event) return null;
        const edition = await ensureEdition(event);
        return { event, edition, config: getCompletedConfig(edition) };
    }
    return bindSeededForm(value);
};

// ── Filas ────────────────────────────────────────────────────────────

export const mapCompleted = (row) => row && ({
    id: row.id,
    eventId: row.eventId,
    clubId: row.clubId,
    registrationCode: row.registrationCode,
    status: row.status,
    registrationSource: row.registrationSource || COMPLETED_SOURCE,
    firstName: row.firstName,
    lastName: row.lastName,
    documentNumber: row.documentNumber,
    email: row.email,
    phone: row.phone,
    district: row.district,
    clubName: row.clubName,
    membershipType: row.membershipType,
    clubRole: row.clubRole,
    clubRoleOther: row.clubRoleOther,
    eps: row.eps,
    foodAllergy: row.foodAllergy,
    emergencyName: row.emergencyName,
    emergencyPhone: row.emergencyPhone,
    paymentMethod: row.paymentMethod,
    // La CLAVE de S3 no viaja: con ella a la vista bastaría componer la URL
    // del bucket. El panel pide el enlace firmado a su endpoint, con permiso.
    hasReceipt: Boolean(row.receiptKey),
    receiptName: row.receiptName,
    receiptMime: row.receiptMime,
    receiptBytes: row.receiptBytes == null ? null : Number(row.receiptBytes),
    comments: row.comments,
    answers: parseJson(row.answers, {}),
    flags: parseJson(row.flags, {}),
    linkedRegistrationId: row.linkedRegistrationId,
    internalNotes: row.internalNotes,
    checkedInAt: row.checkedInAt,
    checkedInBy: row.checkedInBy,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});

export const findCompleted = async (id) => {
    await ensureEventRegistrationSchema();
    const { rows } = await db.query(
        'SELECT * FROM "EventCompletedRegistration" WHERE id = $1 LIMIT 1', [id]);
    return rows[0] || null;
};

/**
 * El MISMO participante, buscado entre las inscripciones normales del evento y
 * entre las completadas. Por correo o por documento; se reporta, jamás se
 * borra ni se fusiona nada.
 */
export const findDuplicates = async (eventId, { email, documentNumber, excludeId = null } = {}) => {
    const mail = clean(email, 200).toLowerCase();
    const doc = clean(documentNumber, 60);
    if (!mail && !doc) return { online: [], completed: [] };

    const conditions = [];
    const params = [eventId];
    if (mail) { params.push(mail); conditions.push(`lower(email) = $${params.length}`); }
    if (doc) { params.push(doc); conditions.push(`("documentNumber" IS NOT NULL AND "documentNumber" <> '' AND lower("documentNumber") = lower($${params.length}))`); }
    const match = conditions.join(' OR ');

    const { rows: online } = await db.query(
        `SELECT id, "registrationCode", "publicRef", "firstName", "lastName", email,
                "documentNumber", status
         FROM "EventRegistration"
         WHERE "eventId" = $1 AND status <> 'draft' AND (${match})
         ORDER BY "createdAt" DESC LIMIT 10`, params);

    const completedParams = [...params];
    let completedWhere = `"eventId" = $1 AND (${match})`;
    if (excludeId) {
        completedParams.push(excludeId);
        completedWhere += ` AND id <> $${completedParams.length}`;
    }
    const { rows: completed } = await db.query(
        `SELECT id, "registrationCode", "firstName", "lastName", email,
                "documentNumber", status
         FROM "EventCompletedRegistration"
         WHERE ${completedWhere}
         ORDER BY "createdAt" DESC LIMIT 10`, completedParams);

    return { online, completed };
};

/**
 * Inserta el registro. La fila entra ANTES de mandar ningún correo (v4.669):
 * si algo falla después, queda el rastro con su motivo en vez de no quedar
 * nada.
 */
export const insertCompleted = async (data) => {
    const { rows } = await db.query(
        `INSERT INTO "EventCompletedRegistration"
            ("eventId", "clubId", status, "registrationSource",
             "firstName", "lastName", "documentNumber", email, phone,
             district, "clubName", "membershipType", "clubRole", "clubRoleOther",
             eps, "foodAllergy", "emergencyName", "emergencyPhone",
             "paymentMethod", "receiptKey", "receiptName", "receiptMime", "receiptBytes",
             comments, answers, flags, "linkedRegistrationId", "submittedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,NOW())
         RETURNING *`,
        [
            data.eventId, data.clubId || null, 'submitted', COMPLETED_SOURCE,
            clean(data.firstName, 120), clean(data.lastName, 120),
            clean(data.documentNumber, 60), clean(data.email, 200).toLowerCase(),
            clean(data.phone, 60), clean(data.district, 60), clean(data.clubName, 200),
            clean(data.membershipType, 30), clean(data.clubRole, 40), clean(data.clubRoleOther, 160),
            clean(data.eps, 200), clean(data.foodAllergy, 300),
            clean(data.emergencyName, 160), clean(data.emergencyPhone, 60),
            clean(data.paymentMethod, 40),
            data.receiptKey || null, clean(data.receiptName, 200) || null,
            clean(data.receiptMime, 100) || null, data.receiptBytes ?? null,
            clean(data.comments, 2000) || null,
            JSON.stringify(data.answers || {}),
            JSON.stringify(data.flags || {}),
            data.linkedRegistrationId || null,
        ]
    );
    return rows[0];
};

/**
 * Asigna el código único. El índice único de la base decide: si dos envíos
 * simultáneos chocan, uno reintenta con otro sufijo. Mismo patrón que
 * `assignRegistrationCode`.
 */
export const assignCompletedCode = async (id, prefix) => {
    for (let attempt = 0; attempt < 6; attempt++) {
        const code = buildCompletedCode(prefix);
        try {
            const { rows } = await db.query(
                `UPDATE "EventCompletedRegistration"
                 SET "registrationCode" = $1, "updatedAt" = NOW()
                 WHERE id = $2 AND "registrationCode" IS NULL
                 RETURNING "registrationCode"`,
                [code, id]);
            if (rows[0]) return rows[0].registrationCode;
            const existing = await findCompleted(id);
            return existing?.registrationCode || null;
        } catch (error) {
            if (!String(error?.message || '').includes('EventCompletedRegistration_code_uniq')) throw error;
        }
    }
    return null;
};

export default {
    getCompletedConfig, saveCompletedConfig, slugTakenByOther,
    findCompletedFormBySlug,
    mapCompleted, findCompleted, findDuplicates, insertCompleted, assignCompletedCode,
};
