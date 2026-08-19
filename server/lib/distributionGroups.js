/**
 * Grupos declarados — la I/O.
 *
 * v4.876. El CRITERIO —estados, importación, filtros, la puerta de
 * publicación— vive en `groupSpec.js`, que es puro y se prueba sin base ni red.
 * Acá sólo se lee y se escribe.
 *
 * NADA DE ESTO LANZA: corre dentro del sondeo de una pantalla y dentro del
 * camino que crea una campaña. Toda función devuelve su resultado con el motivo
 * escrito.
 */
import crypto from 'crypto';
import db from './db.js';
import { ensureDistributionSchema } from './ensureDistributionSchema.js';
import {
    DEFAULT_GROUP_STATE, isGroupState, canTransition,
    normalizeGroup, parseImport, canPublishTo,
} from './groupSpec.js';

const uid = () => crypto.randomUUID();
const GROUPS_SETTING = 'distribution_groups';

const fila = (r) => ({
    id: r.id,
    clubId: r.clubId,
    socialAccountId: r.socialAccountId || null,
    groupId: r.groupId,
    name: r.name,
    url: r.url || null,
    avatar: r.avatar || null,
    source: r.source,
    status: r.status,
    verifiedAt: r.verifiedAt || null,
    verifiedBy: r.verifiedBy || null,
    lastPublishedAt: r.lastPublishedAt || null,
    favorite: !!r.favorite,
    tags: Array.isArray(r.tags) ? r.tags : [],
    notes: r.notes || null,
    // Lo que la pantalla necesita para pintar sin repetir el criterio.
    canPublish: canPublishTo(r),
});

/**
 * Trae los grupos del sitio, migrando la primera vez desde el `Setting`.
 *
 * La migración es PEREZOSA —ocurre al leer, no al desplegar— porque la sección
 * de base de datos de este proyecto prohíbe que un despliegue escriba. Es el
 * mismo mecanismo que `seedDistrictClubs` en la postulación de proyectos.
 */
export const listGroups = async (clubId) => {
    if (!clubId) return [];
    const ready = await ensureDistributionSchema();
    if (!ready) return [];
    try {
        const { rows } = await db.query(
            `SELECT * FROM "DistributionGroup" WHERE "clubId" = $1 ORDER BY favorite DESC, name ASC`,
            [clubId]
        );
        if (rows.length) return rows.map(fila);
        // Vacío puede significar «nunca declaró ninguno» o «todavía no se
        // migraron». Sólo se intenta migrar cuando está vacío, así que un
        // borrado deliberado no revive lo viejo en la siguiente lectura... hasta
        // que el Setting se retire. Se marca migrado vaciando el Setting.
        const migrados = await migrateFromSetting(clubId);
        return migrados;
    } catch (e) {
        console.error('[groups] listGroups:', e.message);
        return [];
    }
};

/** Una sola vez por sitio: pasa lo declarado en el Setting a filas. */
const migrateFromSetting = async (clubId) => {
    try {
        const row = await db.prisma.setting.findFirst({ where: { key: GROUPS_SETTING, clubId } });
        if (!row?.value) return [];
        const viejos = JSON.parse(row.value);
        if (!Array.isArray(viejos) || !viejos.length) return [];

        const normalizados = viejos
            .map(g => normalizeGroup({
                group_id: g.targetId, group_name: g.targetName,
                group_url: g.targetUrl, tags: g.tag ? [g.tag] : [],
            }))
            .filter(r => r.ok)
            .map(r => r.group);

        await upsertGroups({ clubId, groups: normalizados, source: 'manual' });
        // El Setting se VACÍA, no se borra: la fila sigue ahí como marca de que
        // la migración ya ocurrió, y una segunda lectura no vuelve a intentarla.
        await db.prisma.setting.update({
            where: { key_clubId: { key: GROUPS_SETTING, clubId } },
            data: { value: '[]' },
        });
        console.log(`[groups] migrados ${normalizados.length} grupos del Setting al sitio ${clubId}`);
        const { rows } = await db.query(
            `SELECT * FROM "DistributionGroup" WHERE "clubId" = $1 ORDER BY favorite DESC, name ASC`, [clubId]
        );
        return rows.map(fila);
    } catch (e) {
        console.warn('[groups] no se pudo migrar desde el Setting:', e.message);
        return [];
    }
};

/**
 * Alta o actualización en bloque.
 *
 * ⚠️ El `ON CONFLICT` NO pisa el estado ni la verificación. Reimportar un
 * archivo tiene que poder corregir un nombre sin desverificar lo que alguien ya
 * confirmó — y sin verificar lo que nadie confirmó. Sólo se actualiza lo
 * descriptivo.
 */
export const upsertGroups = async ({ clubId, groups = [], source = 'manual', accountId = null }) => {
    if (!clubId) return { ok: false, reason: 'sin sitio', creados: 0, actualizados: 0 };
    const ready = await ensureDistributionSchema();
    if (!ready) return { ok: false, reason: 'esquema no disponible', creados: 0, actualizados: 0 };

    let creados = 0, actualizados = 0;
    for (const g of groups) {
        try {
            const { rows } = await db.query(
                `INSERT INTO "DistributionGroup"
                   (id,"clubId","socialAccountId","groupId",name,url,source,status,tags,notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT ("clubId","groupId") DO UPDATE SET
                   name = EXCLUDED.name,
                   url = COALESCE(EXCLUDED.url, "DistributionGroup".url),
                   "socialAccountId" = COALESCE(EXCLUDED."socialAccountId", "DistributionGroup"."socialAccountId"),
                   tags = CASE WHEN cardinality(EXCLUDED.tags) > 0 THEN EXCLUDED.tags ELSE "DistributionGroup".tags END,
                   notes = COALESCE(EXCLUDED.notes, "DistributionGroup".notes),
                   "updatedAt" = NOW()
                 RETURNING (xmax = 0) AS insertado`,
                [uid(), clubId, g.socialAccountId || accountId || null, g.groupId, g.name,
                 g.url || null, source, g.status || DEFAULT_GROUP_STATE, g.tags || [], g.notes || null]
            );
            if (rows[0]?.insertado) creados++; else actualizados++;
        } catch (e) {
            console.error('[groups] upsert:', e.message);
        }
    }
    return { ok: true, creados, actualizados };
};

/** Importa lo que llegue —JSON, CSV o líneas— y devuelve qué entró y qué no. */
export const importGroups = async ({ clubId, text, accountId = null }) => {
    const { format, groups, skipped } = parseImport(text);
    if (!groups.length) return { ok: false, reason: 'No se pudo interpretar ninguna fila.', format, skipped, creados: 0, actualizados: 0 };
    const r = await upsertGroups({ clubId, groups, source: format === 'lines' ? 'manual' : 'import', accountId });
    return { ...r, format, skipped };
};

/** Cambia el estado. La transición se valida: un catálogo cerrado evita inventos. */
export const setGroupStatus = async ({ clubId, groupRowId, status, userName = null }) => {
    if (!isGroupState(status)) return { ok: false, reason: 'Estado desconocido.' };
    try {
        const { rows } = await db.query(
            `SELECT * FROM "DistributionGroup" WHERE id = $1 AND "clubId" = $2`, [groupRowId, clubId]
        );
        const g = rows[0];
        if (!g) return { ok: false, reason: 'Ese grupo no existe.' };
        if (g.status === status) return { ok: true, sinCambio: true };
        if (!canTransition(g.status, status)) {
            return { ok: false, reason: `No se puede pasar de «${g.status}» a «${status}».` };
        }
        const verificando = status === 'verificado';
        await db.query(
            `UPDATE "DistributionGroup"
                SET status = $2,
                    "verifiedAt" = ${verificando ? 'NOW()' : '"verifiedAt"'},
                    "verifiedBy" = ${verificando ? '$3' : '"verifiedBy"'},
                    "updatedAt" = NOW()
              WHERE id = $1`,
            verificando ? [groupRowId, status, userName || 'desconocido'] : [groupRowId, status]
        );
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
};

/** Favorito, etiquetas y cuenta: lo que se edita sin cambiar el estado. */
export const patchGroup = async ({ clubId, groupRowId, favorite, tags, socialAccountId, notes }) => {
    const sets = ['"updatedAt" = NOW()'];
    const params = [groupRowId, clubId];
    const add = (frag, v) => { params.push(v); sets.push(frag.replace('$n', `$${params.length}`)); };
    if (favorite !== undefined) add('favorite = $n', !!favorite);
    if (Array.isArray(tags)) add('tags = $n', tags.map(t => String(t).trim()).filter(Boolean));
    if (socialAccountId !== undefined) add('"socialAccountId" = $n', socialAccountId || null);
    if (notes !== undefined) add('notes = $n', notes || null);
    if (sets.length === 1) return { ok: true, sinCambio: true };
    try {
        await db.query(`UPDATE "DistributionGroup" SET ${sets.join(', ')} WHERE id = $1 AND "clubId" = $2`, params);
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
};

export const removeGroup = async ({ clubId, groupRowId }) => {
    try {
        await db.query(`DELETE FROM "DistributionGroup" WHERE id = $1 AND "clubId" = $2`, [groupRowId, clubId]);
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
};

/**
 * Los grupos que una campaña quiere usar, tal como están guardados.
 *
 * Es lo que alimenta la puerta: la campaña manda identificadores y acá se lee
 * el ESTADO REAL. Confiar en el estado que mande el navegador sería dejar la
 * puerta abierta a quien conozca el endpoint.
 */
export const findGroupsByIds = async ({ clubId, groupIds = [] }) => {
    if (!clubId || !groupIds.length) return [];
    try {
        const { rows } = await db.query(
            `SELECT * FROM "DistributionGroup" WHERE "clubId" = $1 AND "groupId" = ANY($2)`,
            [clubId, groupIds]
        );
        return rows.map(fila);
    } catch (e) {
        console.error('[groups] findGroupsByIds:', e.message);
        return [];
    }
};

/** Sella la última publicación. Se llama cuando un destino de grupo se cierra. */
export const markPublished = async ({ clubId, groupId, jobId = null, at = new Date() }) => {
    try {
        await db.query(
            `UPDATE "DistributionGroup"
                SET "lastPublishedAt" = $3, "lastJobId" = $4, "updatedAt" = NOW()
              WHERE "clubId" = $1 AND "groupId" = $2`,
            [clubId, groupId, at, jobId]
        );
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
};

export default {
    listGroups, upsertGroups, importGroups, setGroupStatus,
    patchGroup, removeGroup, findGroupsByIds, markPublished,
};
