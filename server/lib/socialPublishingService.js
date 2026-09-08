// ════════════════════════════════════════════════════════════════════════════
// SocialPublishingService — la difusión de una entidad a las redes (v4.1013)
//
// El servicio CENTRAL del requisito 15: obtiene las conexiones, valida los
// permisos, prepara el payload, publica, guarda la respuesta, registra los
// errores y conserva el `externalId`. Lo consumen HOY el listado de Noticias y
// la pestaña Redes Sociales del editor —las dos entradas del requisito 14—, y
// mañana Eventos, Proyectos, campañas y automatizaciones sin tocar una línea
// de acá: lo que cambia es el RESOLUTOR de la entidad.
//
// ⚠️ NO ES UN SEGUNDO MOTOR DE META, y de eso cuelga todo lo demás. Quien
// habla con la Graph API sigue siendo `services/socialPublishService.js`
// (`publishContentToTarget`), el mismo que usa la Distribución multi-destino
// desde v4.864. Con dos caminos hacia el proveedor, el día que se corrija el
// manejo de un rechazo de Meta una mitad se queda atrás y el fallo es MUDO:
// las dos siguen publicando. Lo comprueba una prueba que cuenta los llamadores.
//
// ⚠️ EL TOKEN NUNCA SALE DE ACÁ. Se descifra en el servidor, se usa en la
// llamada y no viaja a ninguna respuesta, ni recortado (regla de v4.992).
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { decryptToken } from './tokenCrypto.js';
import { auditSocial } from './socialAudit.js';
import { publishContentToTarget } from '../services/socialPublishService.js';
import { ensureContentDistributionSchema } from './ensureContentDistributionSchema.js';
import { publicUrlForPost } from './postPublicUrl.js';
import { adminScopeFor, isVisibleTo } from './postScope.js';
import {
    isEntityType, networkOf, accountReadiness, shareability,
    defaultShareMessage, buildShareContent, validateShareMessage,
    describeMetaFailure, summarizeHistory, SHARE_MESSAGE_MAX,
} from './socialShareSpec.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// ─── Resolutores de entidad ─────────────────────────────────────────────────
//
// Cada uno contesta: ¿existe?, ¿la ve este tenant?, ¿cuál es su dirección
// pública?, ¿qué texto se propone? Agregar Eventos o Proyectos es agregar una
// entrada acá — el resto del servicio no cambia (requisito 15).
//
// ⚠️ EL AISLAMIENTO VA EN EL RESOLUTOR, no en una comprobación posterior: lo
// que no es de este sitio no se devuelve, así que para quien pregunta no
// existe. Confirmar que existe es la mitad de lo que hace falta para ir a
// buscarlo (regla de v4.999) — por eso lo ajeno responde 404, no 403.

const resolvePost = async ({ id, user }) => {
    const { rows } = await db.query(
        `SELECT id, title, slug, excerpt, image, "seoImage", "socialCopy", published,
                "clubId", "targetClubIds", "createdAt"
           FROM "Post" WHERE id = $1`,
        [id]
    );
    const post = rows[0] || null;
    if (!post) return { found: false };

    const scope = adminScopeFor(user);
    if (scope.mode === 'none') return { found: false };
    // El operador ve el ecosistema entero; un sitio, sólo lo que le es
    // alcanzable — el MISMO criterio con el que el listado lo muestra.
    if (scope.mode !== 'all' && !isVisibleTo(post, scope.siteId)) return { found: false };

    const publica = await publicUrlForPost(post, scope.mode === 'all' ? (post.clubId || null) : scope.siteId);
    return {
        found: true,
        entity: {
            id: post.id,
            title: post.title || '',
            published: !!post.published,
            image: post.seoImage || post.image || null,
            excerpt: post.excerpt || '',
            socialCopy: post.socialCopy || '',
            slug: post.slug || null,
        },
        // El tenant de la DIFUSIÓN es el sitio desde el que se publica, que es
        // el mismo que resuelve la dirección: publicar el enlace de un sitio
        // desde la página de otro sería mandar tráfico a la organización
        // equivocada.
        clubId: publica.clubId || post.clubId || (scope.mode === 'all' ? null : scope.siteId),
        publicUrl: publica.url,
        publicUrlReason: publica.reason,
        raw: post,
    };
};

const ENTITY_RESOLVERS = {
    post: resolvePost,
    // Declarados y sin resolutor todavía. Se DICE en vez de fallar con un
    // error que no explica nada (`isEntityType` los acepta como catálogo).
    event: null,
    project: null,
    campaign: null,
    reel: null,
};

export const resolveEntity = async ({ entityType, entityId, user }) => {
    if (!isEntityType(entityType)) {
        return { ok: false, code: 400, error: `Tipo de contenido '${entityType}' desconocido.` };
    }
    const resolver = ENTITY_RESOLVERS[entityType];
    if (!resolver) {
        return { ok: false, code: 501, error: `Todavía no se puede compartir contenido de tipo '${entityType}'. Hoy sólo Noticias.` };
    }
    const found = await resolver({ id: str(entityId), user });
    if (!found.found) return { ok: false, code: 404, error: 'No se encontró ese contenido en este sitio.' };
    return { ok: true, ...found };
};

// ─── Las cuentas que este tenant puede usar ─────────────────────────────────
//
// ⚠️ EL TENANT SALE DEL TOKEN, NUNCA DEL CUERPO. Si `clubId` viniera en la
// petición, acotar las páginas a un sitio no serviría de nada: bastaría
// mandar el id de otro distrito para publicar en su página. El operador de la
// plataforma sí puede pedir un sitio por query — es lo que su rol ya permite.
export const accountsForTenant = async (clubId) => {
    if (!str(clubId)) return [];
    const { rows } = await db.query(
        `SELECT id, "clubId", platform, "platformId", "pageId", "accountName", avatar,
                status, permissions, metadata, "tokenVersion", "expiresAt", "lastVerifiedAt"
           FROM "SocialAccount"
          WHERE "clubId" = $1
          ORDER BY platform ASC, "createdAt" DESC`,
        [clubId]
    );
    return rows;
};

/** El token cifrado, leído APARTE y sólo en el momento de publicar.
 *  `accountsForTenant` no lo selecciona a propósito: así ninguna respuesta
 *  puede arrastrarlo por descuido hacia el navegador. */
const tokenOf = async (accountId) => {
    const { rows } = await db.query(`SELECT "accessToken" FROM "SocialAccount" WHERE id = $1`, [accountId]);
    return rows[0]?.accessToken || '';
};

/** Lo que la pantalla necesita para pintar el modal. **Sin un solo token.** */
export const describeTargets = async ({ clubId, kind = 'link' }) => {
    const cuentas = await accountsForTenant(clubId);
    return cuentas.map(acc => {
        const listo = accountReadiness(acc, { kind });
        const net = networkOf(acc.platform);
        return {
            id: acc.id,
            network: acc.platform,
            networkLabel: net?.label || acc.platform,
            name: acc.accountName || acc.platformId,
            pageId: acc.platformId,
            avatar: acc.avatar || null,
            status: acc.status,
            ready: listo.ok,
            reason: listo.reason,
            fix: listo.fix,
            code: listo.code,
        };
    });
};

// ─── El reclamo ─────────────────────────────────────────────────────────────
//
// ⚠️ LA PROTECCIÓN CONTRA EL DOBLE CLIC ES DE LA BASE, no una lectura previa.
// Entre un SELECT y un INSERT caben dos peticiones —el doble clic, el
// reintento del navegador, dos pestañas— y el precio de equivocarse acá es
// una publicación duplicada en la página de una institución, que hay que ir a
// borrar a mano en Facebook. El índice único `(operationKey, accountId)` NO es
// parcial, así que el `ON CONFLICT` va a secas (la trampa de v4.648).
//
// Y se reclama ANTES de llamar a Meta: un reclamo posterior no protegería de
// nada, porque las dos peticiones ya habrían publicado.
const claim = async ({ operationKey, account, entityType, entityId, clubId, message, link, user }) => {
    const { rows } = await db.query(
        `INSERT INTO "ContentDistribution"
            ("clubId","entityType","entityId",network,"accountId","accountName","pageId",
             status,message,link,"userId","userName","operationKey")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12)
         ON CONFLICT ("operationKey","accountId") DO NOTHING
         RETURNING id`,
        [clubId, entityType, entityId, account.platform, account.id,
         account.accountName || null, account.platformId || null,
         message, link, user?.id || null, str(user?.name) || str(user?.email) || null,
         operationKey]
    );
    return rows[0]?.id || null;
};

const closeClaim = async (id, patch) => {
    await db.query(
        `UPDATE "ContentDistribution"
            SET status = $2, "externalId" = $3, "externalUrl" = $4,
                "errorCode" = $5, error = $6, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [id, patch.status, patch.externalId || null, patch.externalUrl || null,
         patch.errorCode || null, patch.error || null]
    );
};

// ─── Publicar ───────────────────────────────────────────────────────────────

/**
 * Difunde una entidad a una o varias cuentas.
 *
 * Devuelve un desenlace POR CUENTA. No es atómico y se dice: si la segunda
 * página falla, la primera ya publicó de verdad y deshacerlo exigiría borrar
 * un post en Facebook — cambiar un problema de difusión por uno peor.
 */
export const shareEntity = async ({
    entityType, entityId, accountIds = [], message = '', operationKey = '', user = null, ip = null,
}) => {
    await ensureContentDistributionSchema();

    if (!str(operationKey)) {
        return { ok: false, code: 400, error: 'Falta la clave de operación: es lo que impide que un doble clic publique dos veces.' };
    }
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
        return { ok: false, code: 400, error: 'Elegí al menos una página donde publicar.' };
    }

    const ent = await resolveEntity({ entityType, entityId, user });
    if (!ent.ok) return ent;

    // ⚠️ SE COMPRUEBA QUE EL ARTÍCULO ESTÉ PUBLICADO Y QUE SU URL EXISTA
    // (requisito 8). Un borrador compartido dejaría una tarjeta rota en la
    // página de la institución, y eso no se puede deshacer editando el post.
    const puede = shareability({ post: { published: ent.entity.published }, publicUrl: ent.publicUrl });
    if (!puede.ok) {
        return { ok: false, code: 409, error: puede.reason, fix: puede.fix || ent.publicUrlReason || null };
    }

    const texto = validateShareMessage(message);
    if (!texto.ok) return { ok: false, code: 400, error: texto.reason };

    const cuentas = await accountsForTenant(ent.clubId);
    const elegidas = cuentas.filter(a => accountIds.includes(a.id));
    if (elegidas.length === 0) {
        return { ok: false, code: 404, error: 'Ninguna de las páginas indicadas pertenece a este sitio.' };
    }
    // Lo que se pidió y no es de este sitio se NOMBRA: un descarte silencioso
    // deja creyendo que salió a más páginas de las que salió.
    const ajenas = accountIds.filter(id => !elegidas.some(a => a.id === id));

    const content = buildShareContent({ message, link: ent.publicUrl });

    const outcomes = await Promise.all(elegidas.map(async (acc) => {
        const base = {
            accountId: acc.id, network: acc.platform,
            accountName: acc.accountName || acc.platformId, pageId: acc.platformId,
        };

        const listo = accountReadiness(acc, { kind: content.kind });
        if (!listo.ok) return { ...base, ok: false, code: listo.code, error: listo.reason, fix: listo.fix };

        const claimId = await claim({
            operationKey, account: acc, entityType, entityId: ent.entity.id,
            clubId: ent.clubId, message: content.message, link: content.link, user,
        });
        if (!claimId) {
            // Otra vuelta ya reclamó esta misma operación para esta página.
            const { rows } = await db.query(
                `SELECT id, status, "externalId", "externalUrl", error FROM "ContentDistribution"
                  WHERE "operationKey" = $1 AND "accountId" = $2`,
                [operationKey, acc.id]
            );
            const previa = rows[0] || {};
            return {
                ...base, ok: previa.status === 'published', duplicate: true,
                externalId: previa.externalId || null, externalUrl: previa.externalUrl || null,
                error: previa.status === 'published' ? null : (previa.error || 'Esta publicación ya se estaba enviando.'),
                code: previa.status === 'published' ? null : 'in_flight',
            };
        }

        try {
            const token = decryptToken(await tokenOf(acc.id));
            const r = await publishContentToTarget({ account: acc, decryptedToken: token, content });
            if (r.ok) {
                await closeClaim(claimId, {
                    status: 'published', externalId: r.externalId || null, externalUrl: r.externalUrl || null,
                });
                // Un publish exitoso demuestra que el token sirve AHORA.
                await db.query(
                    `UPDATE "SocialAccount" SET "lastVerifiedAt" = NOW(), status = 'active' WHERE id = $1`,
                    [acc.id]
                ).catch(() => {});
                return { ...base, ok: true, distributionId: claimId, externalId: r.externalId || null, externalUrl: r.externalUrl || null };
            }
            const fallo = describeMetaFailure(r.error);
            await closeClaim(claimId, { status: 'error', errorCode: fallo.code, error: fallo.message });
            return { ...base, ok: false, distributionId: claimId, code: fallo.code, error: fallo.message, retryable: fallo.retryable };
        } catch (e) {
            const fallo = describeMetaFailure(e.message);
            await closeClaim(claimId, { status: 'error', errorCode: fallo.code, error: fallo.message });
            return { ...base, ok: false, distributionId: claimId, code: fallo.code, error: fallo.message };
        }
    }));

    const algunaOk = outcomes.some(o => o.ok);
    const todasOk = outcomes.every(o => o.ok);

    try {
        await auditSocial({
            action: 'share', clubId: ent.clubId, userId: user?.id,
            target: `${entityType}:${ent.entity.id}`, status: todasOk ? 'ok' : 'error', ip,
            detail: { cuentas: elegidas.length, ok: outcomes.filter(o => o.ok).length, operationKey },
        });
    } catch (e) { console.warn('[share] auditoría:', e.message); }

    return {
        ok: algunaOk,
        status: todasOk ? 'published' : algunaOk ? 'partial' : 'error',
        outcomes,
        ajenas,
        publicUrl: ent.publicUrl,
    };
};

// ─── Historial ──────────────────────────────────────────────────────────────

export const historyFor = async ({ entityType, entityId, user }) => {
    await ensureContentDistributionSchema();
    const ent = await resolveEntity({ entityType, entityId, user });
    if (!ent.ok) return ent;

    const { rows } = await db.query(
        `SELECT id, network, "accountName", "pageId", status, "externalId", "externalUrl",
                message, link, "errorCode", error, "userName", "createdAt"
           FROM "ContentDistribution"
          WHERE "entityType" = $1 AND "entityId" = $2 AND "clubId" = $3
          ORDER BY "createdAt" DESC
          LIMIT 100`,
        [entityType, ent.entity.id, ent.clubId]
    );
    return { ok: true, entries: rows, summary: summarizeHistory(rows) };
};

/** El resumen de difusión de VARIAS entidades, en UNA consulta. Es lo que
 *  permite pintar la insignia «Publicado en Facebook» en el listado sin pagar
 *  una consulta por fila (la lección de `originsForPosts`, v4.1000). */
export const historySummaryFor = async ({ entityType, entityIds = [], clubId }) => {
    await ensureContentDistributionSchema();
    const ids = entityIds.filter(Boolean);
    if (!ids.length || !str(clubId)) return {};
    const { rows } = await db.query(
        `SELECT "entityId", network, status, "externalUrl", "createdAt"
           FROM "ContentDistribution"
          WHERE "entityType" = $1 AND "entityId" = ANY($2::text[]) AND "clubId" = $3
          ORDER BY "createdAt" DESC`,
        [entityType, ids, clubId]
    );
    const porEntidad = {};
    for (const r of rows) {
        (porEntidad[r.entityId] ||= []).push(r);
    }
    const salida = {};
    for (const [id, filas] of Object.entries(porEntidad)) {
        salida[id] = { ...summarizeHistory(filas), lastUrl: filas.find(f => f.status === 'published')?.externalUrl || null };
    }
    return salida;
};

export default {
    resolveEntity, accountsForTenant, describeTargets,
    shareEntity, historyFor, historySummaryFor,
    SHARE_MESSAGE_MAX, defaultShareMessage,
};
