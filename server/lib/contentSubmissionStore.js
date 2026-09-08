// ════════════════════════════════════════════════════════════════════
// Aportes de contenido — la I/O — v4.972.0
//
// El CRITERIO vive en `contentSubmissionSpec.js` y es puro; acá está lo que
// necesita base y S3. Mismo reparto que `seoRules.js` frente a `seoAudit.js`.
//
// EL ESTADO NO SE ESCRIBE SIN HISTORIAL. Toda transición pasa por
// `transitionSubmission`, que comprueba que sea legítima y deja su evento con
// quién y cuándo. Es la regla de `EventRegistrationHistory` y la única forma
// de contestar «¿por qué esta solicitud está descartada?» dentro de un año.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import ensureContentSubmissionSchema from './ensureContentSubmissionSchema.js';
import {
    INITIAL_STATE, canTransitionSubmission, needsReason, stateLabel,
    isUsageChannel, buildSubmissionContext, submissionCaption,
} from './contentSubmissionSpec.js';
import { copyToLibrary, deleteStagingObject } from './submissionFiles.js';

const str = (v, max) => (v === null || v === undefined || v === '' ? null : String(v).trim().slice(0, max));

/** Deja un evento. NUNCA lanza: perder una solicitud por no poder anotar su
 *  historia sería cambiar un problema de auditoría por uno de contenido. */
export async function logEvent({ submissionId, campaignId, type, fromState = null, toState = null, channel = null, reference = '', detail = null, actor = null, actorName = null }) {
    try {
        await db.query(
            `INSERT INTO "ContributionSubmissionEvent"
                ("submissionId","campaignId",type,"fromState","toState",channel,reference,detail,actor,"actorName")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT DO NOTHING`,   // el índice del uso es PARCIAL: sin target (v4.648)
            [submissionId, campaignId, type, fromState, toState, channel, String(reference || ''), str(detail, 1000), actor, str(actorName, 160)]
        );
        return { ok: true };
    } catch (e) {
        console.warn(`[submissions] no pude anotar el evento ${type}: ${e.message}`);
        return { ok: false, reason: e.message };
    }
}

/**
 * Crea la solicitud y sus archivos.
 *
 * ⚠️ EL ESTADO INICIAL LO FIJA EL CÓDIGO, NO EL CUERPO DE LA PETICIÓN. Enviar
 * no aprueba nada (requisito 13) y lo fija una prueba.
 */
export async function createSubmission({ campaignId, data, files, consentText, warnings = [], origin = {} }) {
    await ensureContentSubmissionSchema();
    const { rows } = await db.query(
        `INSERT INTO "ContributionSubmission"
            ("campaignId", status, "senderName","senderEmail","senderPhone",
             "senderPhoneCountry","senderPhoneDial","senderPhoneNational","senderPhoneE164",
             district,club,role,
             title,description,location,city,"activityDate","participatingClubs",story,extra,
             "hasPosts","consentText","consentAt",warnings,"originClubId","originHost")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW(),$23,$24,$25)
         RETURNING *`,
        [
            campaignId, INITIAL_STATE,
            data.senderName, data.senderEmail, str(data.senderPhone, 40),
            str(data.senderPhoneCountry, 2), str(data.senderPhoneDial, 5),
            str(data.senderPhoneNational, 15), str(data.senderPhoneE164, 20),
            str(data.district, 80), str(data.club, 160), str(data.role, 120),
            str(data.title, 160), str(data.description, 3000), str(data.location, 200),
            str(data.city, 120), str(data.activityDate, 40), str(data.participatingClubs, 400),
            str(data.story, 4000), str(data.extra, 2000),
            data.hasPosts === true,
            str(consentText, 4000), JSON.stringify(warnings),
            // Por qué PUERTA entró. `null` cuando el dominio no resuelve a
            // ningún sitio: un hueco es la verdad y no impide guardar nada.
            origin?.clubId || null, str(origin?.host, 200) || null,
        ]
    );
    const submission = rows[0];

    let orden = 0;
    for (const f of files) {
        await db.query(
            `INSERT INTO "ContributionSubmissionFile"
                ("submissionId","campaignId",kind,"s3Key",filename,"contentType",bytes,"sortOrder")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT ("s3Key") DO NOTHING`,
            [submission.id, campaignId, f.kind, f.key, str(f.filename, 240), str(f.contentType, 120), f.bytes || 0, orden++]
        );
    }

    // ── Los clubes participantes ──────────────────────────────────────
    //
    // Son de la ACTIVIDAD, no de quien la envía: la misma persona puede
    // documentar lo que hicieron tres clubes y no pertenecer a dos de ellos.
    // El `ON CONFLICT DO NOTHING` se apoya en el índice único de
    // (solicitud, clubKey) y sólo evita el nombre repetido dentro del mismo
    // envío — no rechaza que dos solicitudes nombren el mismo club.
    let ordenClub = 0;
    for (const c of (Array.isArray(data.clubs) ? data.clubs : [])) {
        await db.query(
            `INSERT INTO "ContributionSubmissionClub"
                ("submissionId","campaignId","districtId","clubName","clubKey",source,"sortOrder")
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT DO NOTHING`,
            [submission.id, campaignId, str(c.district, 80) || str(data.district, 80), c.name, c.key, c.source, ordenClub++]
        );
    }

    // ── Las publicaciones que el club ya había hecho ──────────────────
    //
    // Sólo si la respuesta fue que SÍ: `shapeSubmission` ya vacía la lista
    // cuando se contestó que no, así que acá no hay que volver a decidirlo.
    for (const post of (Array.isArray(data.posts) ? data.posts : [])) {
        await db.query(
            `INSERT INTO "ContributionSubmissionPost"
                ("submissionId","campaignId",platform,"platformOther",url,host,"sortOrder")
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [submission.id, campaignId, post.platform, str(post.platformOther, 80), post.url, str(post.host, 200), post.sortOrder]
        );
    }

    await logEvent({
        submissionId: submission.id, campaignId, type: 'created', toState: INITIAL_STATE,
        actorName: data.senderName, detail: `${files.length} archivo(s)`,
    });
    return submission;
}

/** Los clubes participantes de una solicitud, en el orden en que se eligieron. */
export const clubsOf = async (submissionId) => {
    const { rows } = await db.query(
        `SELECT * FROM "ContributionSubmissionClub" WHERE "submissionId" = $1 ORDER BY "sortOrder", "clubName"`,
        [submissionId]
    );
    return rows;
};

/** Las publicaciones previas de una solicitud. */
export const postsOf = async (submissionId) => {
    const { rows } = await db.query(
        `SELECT * FROM "ContributionSubmissionPost" WHERE "submissionId" = $1 ORDER BY "sortOrder", "createdAt"`,
        [submissionId]
    );
    return rows;
};

/**
 * Los clubes y las publicaciones de VARIAS solicitudes, en dos consultas.
 *
 * Agregado por solicitud, no una consulta por fila: con doscientas solicitudes
 * en la bandeja serían cuatrocientos viajes a la base para pintar una lista
 * (criterio de `disbursedByPayment`, v4.890). DEGRADA a `{}` — la bandeja
 * tiene que abrirse aunque estas tablas todavía no existan.
 */
export async function participationOf(submissionIds = []) {
    const ids = (Array.isArray(submissionIds) ? submissionIds : []).filter(Boolean);
    if (!ids.length) return { clubs: {}, posts: {} };
    try {
        const [c, p] = await Promise.all([
            db.query(`SELECT "submissionId","clubName","districtId" FROM "ContributionSubmissionClub" WHERE "submissionId" = ANY($1) ORDER BY "sortOrder"`, [ids]),
            db.query(`SELECT "submissionId",platform,"platformOther",url FROM "ContributionSubmissionPost" WHERE "submissionId" = ANY($1) ORDER BY "sortOrder"`, [ids]),
        ]);
        const clubs = {}, posts = {};
        for (const r of c.rows) (clubs[r.submissionId] ||= []).push(r);
        for (const r of p.rows) (posts[r.submissionId] ||= []).push(r);
        return { clubs, posts };
    } catch (e) {
        console.warn(`[submissions] participación degradada: ${e.message}`);
        return { clubs: {}, posts: {} };
    }
}

/** Los archivos de una solicitud, en su orden. */
export const filesOf = async (submissionId) => {
    const { rows } = await db.query(
        `SELECT * FROM "ContributionSubmissionFile" WHERE "submissionId" = $1 ORDER BY "sortOrder", "createdAt"`,
        [submissionId]
    );
    return rows;
};

/**
 * La bandeja. Los filtros se aplican en el SERVIDOR (requisito 5): con el
 * filtro también en la pantalla, «marcar todos los visibles» tomaría filas
 * fuera de la vista — la lección del panel de grupos (v4.876).
 */
export async function listSubmissions(campaignId, { status = '', club = '', city = '', from = '', to = '', kind = '', limit = 200 } = {}) {
    await ensureContentSubmissionSchema();
    const where = ['s."campaignId" = $1'];
    const params = [campaignId];
    const add = (sql, value) => { params.push(value); where.push(sql.replace('$n', `$${params.length}`)); };

    if (status) add('s.status = $n', String(status));
    if (club) add('s.club ILIKE $n', `%${String(club)}%`);
    if (city) add('(s.city ILIKE $n OR s.location ILIKE $n)', `%${String(city)}%`);
    if (from) add('s."createdAt" >= $n', new Date(from));
    // El último día entra ENTERO: acotar «hasta el 15» a las 00:00 del 15 se
    // come el día y nadie entiende por qué falta una solicitud (v4.849).
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); add('s."createdAt" <= $n', d); }
    if (kind === 'image' || kind === 'video') {
        add(`EXISTS (SELECT 1 FROM "ContributionSubmissionFile" f WHERE f."submissionId" = s.id AND f.kind = $n)`, kind);
    }

    params.push(Math.min(Number(limit) || 200, 500));
    const { rows } = await db.query(
        `SELECT s.*,
                COUNT(f.id) FILTER (WHERE f.kind = 'image') AS "imageCount",
                COUNT(f.id) FILTER (WHERE f.kind = 'video') AS "videoCount",
                COUNT(f.id) FILTER (WHERE f."mediaId" IS NOT NULL) AS "promotedCount"
           FROM "ContributionSubmission" s
           LEFT JOIN "ContributionSubmissionFile" f ON f."submissionId" = s.id
          WHERE ${where.join(' AND ')}
          GROUP BY s.id
          ORDER BY s."createdAt" DESC
          LIMIT $${params.length}`,
        params
    );
    return rows.map(r => ({
        ...r,
        imageCount: Number(r.imageCount) || 0,
        videoCount: Number(r.videoCount) || 0,
        promotedCount: Number(r.promotedCount) || 0,
    }));
}

/** Cuántas hay por estado. Es el contador del rótulo «Solicitudes (12)». */
export async function countByState(campaignId) {
    try {
        await ensureContentSubmissionSchema();
        const { rows } = await db.query(
            `SELECT status, COUNT(*)::int AS n FROM "ContributionSubmission" WHERE "campaignId" = $1 GROUP BY status`,
            [campaignId]
        );
        const porEstado = Object.fromEntries(rows.map(r => [r.status, r.n]));
        return { total: rows.reduce((a, r) => a + r.n, 0), porEstado };
    } catch (e) {
        // DEGRADA: el editor de la campaña no puede quedarse sin abrir porque
        // el contador de una sección no se pudo leer.
        console.warn(`[submissions] contador degradado: ${e.message}`);
        return { total: 0, porEstado: {}, error: e.message };
    }
}

/** El aislamiento va en el WHERE: para quien pregunta por una solicitud de
 *  otra campaña, esa solicitud no existe. */
export async function getSubmission(campaignId, id) {
    await ensureContentSubmissionSchema();
    const { rows } = await db.query(
        `SELECT * FROM "ContributionSubmission" WHERE id = $1 AND "campaignId" = $2`, [id, campaignId]
    );
    return rows[0] || null;
}

export async function eventsOf(submissionId) {
    const { rows } = await db.query(
        `SELECT * FROM "ContributionSubmissionEvent" WHERE "submissionId" = $1 ORDER BY "createdAt" ASC`,
        [submissionId]
    );
    return rows;
}

/**
 * Cambia el estado. Comprueba que la transición sea legítima y deja historial.
 *
 * `requiere_info` y `descartado` EXIGEN motivo: es lo que le llega a quien
 * envió y lo que queda en la auditoría — un descarte sin motivo es un borrado
 * con otro nombre (regla de los desembolsos, v4.885).
 */
export async function transitionSubmission({ campaignId, id, to, reason = '', actor = null, actorName = null }) {
    const actual = await getSubmission(campaignId, id);
    if (!actual) return { ok: false, reason: 'no_existe' };
    if (actual.status === to) return { ok: true, submission: actual, sinCambio: true };
    if (!canTransitionSubmission(actual.status, to)) {
        return { ok: false, reason: 'transicion_invalida', detalle: `No se puede pasar de «${stateLabel(actual.status)}» a «${stateLabel(to)}».` };
    }
    if (needsReason(to) && !String(reason || '').trim()) {
        return { ok: false, reason: 'falta_motivo', detalle: `Para dejarla en «${stateLabel(to)}» hay que escribir el motivo.` };
    }

    const sellos = [];
    if (to === 'aprobado') sellos.push('"approvedAt" = COALESCE("approvedAt", NOW())');
    if (to === 'publicado') sellos.push('"publishedAt" = COALESCE("publishedAt", NOW())');
    const { rows } = await db.query(
        `UPDATE "ContributionSubmission"
            SET status = $3, "statusDetail" = $4, "reviewedBy" = COALESCE($5, "reviewedBy"),
                "reviewedAt" = NOW(), "updatedAt" = NOW()${sellos.length ? `, ${sellos.join(', ')}` : ''}
          WHERE id = $1 AND "campaignId" = $2 AND status = $6
          RETURNING *`,
        [id, campaignId, to, str(reason, 1000), actor, actual.status]
    );
    // El UPDATE es CONDICIONAL sobre el estado leído: dos pantallas abiertas a
    // la vez no pueden aplicar dos transiciones sobre la misma lectura.
    if (!rows[0]) return { ok: false, reason: 'cambio_concurrente', detalle: 'Alguien cambió el estado mientras mirabas. Recargá.' };

    await logEvent({
        submissionId: id, campaignId, type: 'status', fromState: actual.status, toState: to,
        detail: str(reason, 1000), actor, actorName,
    });
    return { ok: true, submission: rows[0] };
}

/**
 * Aprueba y lleva los archivos a la Biblioteca Multimedia.
 *
 * ⚠️ ES IDEMPOTENTE POR ARCHIVO. Una fila que ya tiene `mediaId` se saltea, así
 * que reintentar tras un fallo a medias no duplica nada. El objeto se COPIA
 * dentro de S3 (los bytes no pasan por la función) y el de staging se borra
 * DESPUÉS de que la fila de `Media` existe — al revés, un fallo al insertar
 * perdería el archivo.
 *
 * NO ES ATÓMICO Y SE DICE: cada archivo reporta su desenlace. Envolverlo en una
 * transacción sería peor — un fallo tiraría abajo copias que sí ocurrieron.
 */
export async function promoteToLibrary({ campaignId, submission, clubId = null, folderId = null, fileIds = null, actor = null, actorName = null }) {
    const todos = await filesOf(submission.id);
    // `fileIds` acota la vuelta a UN archivo: es el «Reintentar archivo
    // pendiente» del requisito 17. Sin él se atienden todos, y los que ya
    // tienen `mediaId` se saltean solos — por eso repetir la promoción entera
    // es seguro y no duplica nada.
    const archivos = Array.isArray(fileIds) && fileIds.length
        ? todos.filter(f => fileIds.includes(f.id))
        : todos;
    const resultados = [];

    for (const f of archivos) {
        if (f.mediaId) { resultados.push({ id: f.id, estado: 'ya_estaba', mediaId: f.mediaId }); continue; }

        const copia = await copyToLibrary({ key: f.s3Key, clubId, filename: f.filename, contentType: f.contentType });
        if (!copia.ok) {
            await db.query(`UPDATE "ContributionSubmissionFile" SET "promoteError" = $2 WHERE id = $1`, [f.id, str(copia.error, 400)]);
            resultados.push({ id: f.id, estado: 'error', motivo: copia.error });
            continue;
        }

        try {
            // La fila de `Media` es la MISMA que crea la Biblioteca: mismas
            // columnas, mismo bucket, misma forma. No hay un segundo registro
            // de archivos — duplicarlo daría dos verdades sobre lo mismo.
            // ⚠️ LA CARPETA VA EN EL MISMO INSERT (v4.1004). Escribirla después
            // dejaría una ventana en la que el archivo está en la Biblioteca y
            // suelto en la raíz: si la invocación muere ahí, queda desordenado
            // y nadie se entera. `folderId` puede ser NULL —una campaña sin
            // sitio resoluble— y entonces se comporta como antes de v4.1004.
            //
            // `Media.sourceType`/`sourceId` NO se tocan a propósito: esas
            // columnas dicen de qué SITIO es el archivo y gobiernan los chips
            // de categoría del selector (v4.339). Escribirles la solicitud
            // sacaría estas fotos de su categoría sin que nadie lo pidiera; el
            // vínculo con la solicitud ya lo dan la carpeta y la fila de
            // `ContributionSubmissionFile.mediaId`, en las dos direcciones.
            const { rows } = await db.query(
                `INSERT INTO "Media" (id, filename, url, type, size, bucket, region, "clubId", "s3Key", "folderId", "createdAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id, url`,
                [copia.filename, copia.url, f.kind, Number(f.bytes) || 0, copia.bucket, process.env.AWS_REGION || 'us-east-1', clubId, copia.key, folderId]
            );
            await db.query(
                `UPDATE "ContributionSubmissionFile"
                    SET "mediaId" = $2, "mediaUrl" = $3, "promotedAt" = NOW(), "promoteError" = NULL
                  WHERE id = $1`,
                [f.id, rows[0].id, rows[0].url]
            );
            await deleteStagingObject(f.s3Key);   // mejor esfuerzo, DESPUÉS de la fila
            resultados.push({ id: f.id, estado: 'promovido', mediaId: rows[0].id, url: rows[0].url });
        } catch (e) {
            await db.query(`UPDATE "ContributionSubmissionFile" SET "promoteError" = $2 WHERE id = $1`, [f.id, str(e.message, 400)]);
            resultados.push({ id: f.id, estado: 'error', motivo: e.message });
        }
    }

    const promovidos = resultados.filter(r => r.estado === 'promovido').length;
    const fallidos = resultados.filter(r => r.estado === 'error').length;
    await logEvent({
        submissionId: submission.id, campaignId, type: 'library',
        detail: `${promovidos} archivo(s) a la Biblioteca${fallidos ? `, ${fallidos} con error` : ''}`,
        actor, actorName,
    });
    // `total` es el de la SOLICITUD, no el de esta vuelta: es lo que permite
    // decir «9 de 10 archivos sincronizados» después de reintentar uno solo.
    return { resultados, promovidos, fallidos, total: todos.length, attempted: archivos.length, files: todos };
}

/**
 * Anota que una solicitud se usó en un canal.
 *
 * `reference` distingue una publicación concreta de otra: sin ella, dos posts
 * de Instagram con el mismo material contarían como uno. El índice único
 * impide anotar dos veces lo mismo.
 */
export async function markUsage({ campaignId, submissionId, channel, reference = '', detail = null, actor = null, actorName = null }) {
    if (!isUsageChannel(channel)) return { ok: false, reason: 'canal_desconocido' };
    await logEvent({ submissionId, campaignId, type: 'usage', channel, reference, detail, actor, actorName });
    return { ok: true };
}

/** Dónde se usó cada solicitud. Devuelve los canales con su cantidad. */
export async function usageOf(submissionIds = []) {
    const ids = (Array.isArray(submissionIds) ? submissionIds : []).filter(Boolean);
    if (!ids.length) return {};
    try {
        const { rows } = await db.query(
            `SELECT "submissionId", channel, COUNT(*)::int AS n
               FROM "ContributionSubmissionEvent"
              WHERE type = 'usage' AND "submissionId" = ANY($1)
              GROUP BY "submissionId", channel`,
            [ids]
        );
        const mapa = {};
        for (const r of rows) {
            if (!mapa[r.submissionId]) mapa[r.submissionId] = {};
            mapa[r.submissionId][r.channel] = r.n;
        }
        return mapa;
    } catch (e) {
        console.warn(`[submissions] uso degradado: ${e.message}`);
        return {};
    }
}

/**
 * El material APROBADO de una campaña, ya en la Biblioteca, con la historia de
 * quien lo envió pegada.
 *
 * Es lo que cierra el circuito con el Generador de Publicaciones (requisito
 * 10): estas fotos aparecen entre las de la campaña y su contexto entra al
 * brief. DEGRADA a `[]` — el generador tiene que seguir funcionando aunque
 * este módulo no esté disponible.
 */
export async function approvedCampaignMedia(campaignId, { limit = 60 } = {}) {
    try {
        await ensureContentSubmissionSchema();
        const { rows } = await db.query(
            `SELECT f."mediaId", f."mediaUrl", f.kind, f.filename,
                    s.id AS "submissionId", s.title, s.club, s.city, s.location,
                    s."activityDate", s.story, s.description, s."participatingClubs",
                    s.district, s.extra, s."senderName", s.status,
                    -- La difusión previa viaja al brief para que el copy no
                    -- diga «por primera vez» sobre algo que el club ya
                    -- publicó. Agregada acá y no con una consulta por fila:
                    -- son decenas de fotos por campaña.
                    COALESCE((SELECT json_agg(json_build_object('platform', p.platform, 'platformOther', p."platformOther") ORDER BY p."sortOrder")
                                FROM "ContributionSubmissionPost" p WHERE p."submissionId" = s.id), '[]'::json) AS posts
               FROM "ContributionSubmissionFile" f
               JOIN "ContributionSubmission" s ON s.id = f."submissionId"
              WHERE f."campaignId" = $1
                AND f."mediaId" IS NOT NULL
                AND s.status IN ('aprobado','listo_difusion','publicado')
              ORDER BY s."createdAt" DESC, f."sortOrder"
              LIMIT $2`,
            [campaignId, Math.min(Number(limit) || 60, 200)]
        );
        return rows.map(r => ({
            url: r.mediaUrl,
            mediaId: r.mediaId,
            kind: r.kind,
            origin: 'aporte',
            originLabel: 'Aporte de un club',
            alt: '',
            caption: submissionCaption(r),
            credit: r.club || r.senderName || '',
            submissionId: r.submissionId,
            submissionContext: buildSubmissionContext(r),
        }));
    } catch (e) {
        console.warn(`[submissions] material aprobado degradado: ${e.message}`);
        return [];
    }
}

export default {
    logEvent, createSubmission, filesOf, clubsOf, postsOf, participationOf,
    listSubmissions, countByState, getSubmission,
    eventsOf, transitionSubmission, promoteToLibrary, markUsage, usageOf, approvedCampaignMedia,
};

// ════════════════════════════════════════════════════════════════════════════
// La bandeja TRANSVERSAL — v4.999
//
// `listSubmissions` mira UNA campaña porque nació dentro del editor de una
// campaña. La bandeja como módulo de trabajo necesita la otra pregunta: «qué
// solicitudes alcanza esta sesión», que atraviesa campañas.
//
// ⚠️ EL AISLAMIENTO VA EN EL `WHERE`, NUNCA EN LA PANTALLA. `campaignIds` es
// la lista YA RESUELTA de lo que esta sesión alcanza: con `null` significa
// «todas» y sólo el operador de la plataforma puede pasarlo. Un array VACÍO
// tiene que devolver CERO filas —no todas—, y por eso se compara contra `null`
// y no por longitud: la confusión entre «sin restricción» y «restricción que
// no alcanza a nada» es la forma clásica de abrir una bandeja entera
// (regla del `[]` de los buzones institucionales, v4.932).
// ════════════════════════════════════════════════════════════════════════════

/** Arma el WHERE compartido por el listado y por el resumen. */
const inboxWhere = (campaignIds, q = {}, { withStatus = true } = {}) => {
    const where = [];
    const params = [];
    const add = (sql, value) => { params.push(value); where.push(sql.replace(/\$n/g, `$${params.length}`)); };

    // La puerta. `null` = sin restricción (sólo el operador llega con eso).
    if (campaignIds !== null) {
        if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
            // Nada que alcanzar: se fuerza el vacío en el SQL en vez de
            // devolverlo desde JavaScript, para que la puerta viva en la
            // consulta y no en quien la llama.
            where.push('FALSE');
        } else {
            add('s."campaignId" = ANY($n::text[])', campaignIds.map(String));
        }
    }

    if (withStatus && q.status) add('s.status = $n', q.status);
    if (q.site) add('s."originClubId" = $n', q.site);
    if (q.district) add('s.district ILIKE $n', `%${q.district}%`);
    if (q.assignee) {
        if (q.assignee === '__sin__') where.push(`(s.assignee IS NULL OR s.assignee = '')`);
        else add('s.assignee = $n', q.assignee);
    }
    if (q.from) add('s."createdAt" >= $n', new Date(q.from));
    // El último día entra ENTERO: acotar «hasta el 15» a las 00:00 se come el
    // día y nadie entiende por qué falta una solicitud (v4.849).
    if (q.to) { const d = new Date(q.to); d.setHours(23, 59, 59, 999); add('s."createdAt" <= $n', d); }

    if (q.kind === 'image' || q.kind === 'video') {
        add(`EXISTS (SELECT 1 FROM "ContributionSubmissionFile" f2 WHERE f2."submissionId" = s.id AND f2.kind = $n)`, q.kind);
    } else if (q.kind === 'none') {
        where.push(`NOT EXISTS (SELECT 1 FROM "ContributionSubmissionFile" f2 WHERE f2."submissionId" = s.id)`);
    }

    // La búsqueda alcanza lo que una persona recuerda: quién lo mandó, de qué
    // club, y qué decía. El nombre de la campaña entra por el JOIN.
    if (q.q) {
        add(`(s."senderName" ILIKE $n OR s."senderEmail" ILIKE $n OR s.club ILIKE $n
              OR s.title ILIKE $n OR s.description ILIKE $n OR s.story ILIKE $n
              OR s.city ILIKE $n OR s.location ILIKE $n OR c.name ILIKE $n)`, `%${q.q}%`);
    }

    return { sql: where.length ? where.join(' AND ') : 'TRUE', params };
};

/**
 * Las solicitudes que alcanza esta sesión, ya filtradas y paginadas.
 *
 * Devuelve además `total` para poder decir «mostrando N de M»: sin ese número,
 * una página llena es indistinguible de la última (v4.985).
 */
export async function listInbox(campaignIds, q = {}) {
    await ensureContentSubmissionSchema();
    const { sql, params } = inboxWhere(campaignIds, q);

    const perPage = Math.max(1, Math.min(Number(q.perPage) || 50, 200));
    const page = Math.max(1, Number(q.page) || 1);
    const offset = (page - 1) * perPage;

    const { rows: totalRows } = await db.query(
        `SELECT COUNT(*)::int AS n
           FROM "ContributionSubmission" s
           LEFT JOIN "ContributionCampaign" c ON c.id = s."campaignId"
          WHERE ${sql}`,
        params
    );
    const total = totalRows[0]?.n || 0;

    const listParams = [...params, perPage, offset];
    const { rows } = await db.query(
        `SELECT s.*,
                c.name AS "campaignName", c.slug AS "campaignSlug",
                c."ownerClubId" AS "campaignOwnerClubId",
                origen.name AS "originClubName",
                COUNT(f.id) FILTER (WHERE f.kind = 'image') AS "imageCount",
                COUNT(f.id) FILTER (WHERE f.kind = 'video') AS "videoCount",
                COUNT(f.id) FILTER (WHERE f."mediaId" IS NOT NULL) AS "promotedCount"
           FROM "ContributionSubmission" s
           LEFT JOIN "ContributionCampaign" c ON c.id = s."campaignId"
           LEFT JOIN "Club" origen ON origen.id = s."originClubId"
           LEFT JOIN "ContributionSubmissionFile" f ON f."submissionId" = s.id
          WHERE ${sql}
          GROUP BY s.id, c.name, c.slug, c."ownerClubId", origen.name
          ORDER BY s."createdAt" DESC
          LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
    );

    return {
        total, page, perPage,
        rows: rows.map(r => ({
            ...r,
            imageCount: Number(r.imageCount) || 0,
            videoCount: Number(r.videoCount) || 0,
            promotedCount: Number(r.promotedCount) || 0,
        })),
    };
}

/**
 * Cuántas hay por estado dentro del alcance y de los filtros.
 *
 * ⚠️ EL FILTRO DE ESTADO NO SE APLICA ACÁ. Es lo que permite pintar la fila de
 * pestañas con su número mientras una está seleccionada: con el filtro puesto,
 * la pestaña elegida mostraría su cuenta y las demás cero, y no habría forma
 * de saber a dónde ir.
 */
export async function countInbox(campaignIds, q = {}) {
    await ensureContentSubmissionSchema();
    const { sql, params } = inboxWhere(campaignIds, q, { withStatus: false });
    const { rows } = await db.query(
        `SELECT s.status, COUNT(*)::int AS n
           FROM "ContributionSubmission" s
           LEFT JOIN "ContributionCampaign" c ON c.id = s."campaignId"
          WHERE ${sql}
          GROUP BY s.status`,
        params
    );
    return Object.fromEntries(rows.map(r => [r.status, r.n]));
}

/** Los ejes por los que se puede filtrar, sacados de lo que HAY —no de un
 *  catálogo escrito a mano—: un desplegable con opciones que no devuelven
 *  ninguna fila es peor que ninguno (v4.650). Se calcula sobre el ALCANCE
 *  entero, no sobre lo filtrado: si saliera de lo filtrado, elegir una campaña
 *  haría desaparecer a las demás del desplegable y no habría forma de volver
 *  (regla del catálogo de destinos de la Bóveda, v4.849). */
export async function inboxFacets(campaignIds) {
    await ensureContentSubmissionSchema();
    const { sql, params } = inboxWhere(campaignIds, {}, { withStatus: false });
    const { rows } = await db.query(
        `SELECT DISTINCT s."campaignId", c.name AS "campaignName",
                s."originClubId", origen.name AS "originClubName",
                s.district, s.assignee
           FROM "ContributionSubmission" s
           LEFT JOIN "ContributionCampaign" c ON c.id = s."campaignId"
           LEFT JOIN "Club" origen ON origen.id = s."originClubId"
          WHERE ${sql}`,
        params
    );
    const campanas = new Map();
    const sitios = new Map();
    const distritos = new Set();
    const responsables = new Set();
    for (const r of rows) {
        if (r.campaignId) campanas.set(String(r.campaignId), r.campaignName || 'Campaña sin nombre');
        if (r.originClubId) sitios.set(String(r.originClubId), r.originClubName || 'Sitio');
        if (r.district) distritos.add(String(r.district));
        if (r.assignee) responsables.add(String(r.assignee));
    }
    return {
        campanas: [...campanas].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
        sitios: [...sitios].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
        distritos: [...distritos].sort(),
        responsables: [...responsables].sort(),
    };
}

/** Una solicitud por id, SIN saber a qué campaña pertenece — pero acotada al
 *  alcance. Es lo que permite abrir la ficha desde la bandeja transversal sin
 *  arrastrar la campaña por la URL; para quien no la alcanza, no existe. */
export async function getInboxSubmission(campaignIds, id) {
    await ensureContentSubmissionSchema();
    const { sql, params } = inboxWhere(campaignIds, {});
    params.push(String(id));
    const { rows } = await db.query(
        `SELECT s.*, c.name AS "campaignName", c.slug AS "campaignSlug",
                c."ownerClubId" AS "campaignOwnerClubId", origen.name AS "originClubName"
           FROM "ContributionSubmission" s
           LEFT JOIN "ContributionCampaign" c ON c.id = s."campaignId"
           LEFT JOIN "Club" origen ON origen.id = s."originClubId"
          WHERE ${sql} AND s.id = $${params.length}
          LIMIT 1`,
        params
    );
    return rows[0] || null;
}

/** Quién queda a cargo. Deja historial: sin él, «¿por qué me tocó a mí?» no
 *  tiene dónde mirarse. Cadena vacía = sin responsable, que es distinto de no
 *  haberlo tocado. */
export async function assignSubmission({ campaignIds, id, assignee, actor = null, actorName = null }) {
    const actual = await getInboxSubmission(campaignIds, id);
    if (!actual) return { ok: false, reason: 'no_encontrada' };
    const valor = String(assignee ?? '').trim().slice(0, 160);
    const { rows } = await db.query(
        `UPDATE "ContributionSubmission" SET assignee = $2, "updatedAt" = NOW()
          WHERE id = $1 RETURNING *`,
        [id, valor || null]
    );
    await logEvent({
        submissionId: id, campaignId: actual.campaignId, type: 'assigned',
        detail: valor ? `Responsable: ${valor}` : 'Sin responsable',
        actor, actorName,
    });
    return { ok: true, submission: rows[0] };
}
