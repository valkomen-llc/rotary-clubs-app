// ════════════════════════════════════════════════════════════════════════════
// Servicio de Gestión Centralizada de Módulos por Sitio (Club Platform SaaS)
//
// Almacena y resuelve la disponibilidad de módulos en la barra lateral
// y protege el acceso a endpoints según el sitio multi-tenant.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import prisma from './prisma.js';
import {
    SETTING_KEY_SITE_MODULES,
    DEFAULT_SITE_MODULES_CONFIG,
    ORIGEN_CLUB_ID,
    FOUNDATIONAL_CLUB_EXCEPTIONS,
    resolveClubModulesConfig,
    SITE_MODULES_CATALOG
} from './siteModulesSpec.js';

// Cache en memoria breve (TTL: 60 seg) para rendimiento ultrarrápido sin sobrecargar la base
const modulesCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function getCached(key) {
    const item = modulesCache.get(key);
    if (!item) return null;
    if (Date.now() > item.expires) {
        modulesCache.delete(key);
        return null;
    }
    return item.data;
}

function setCached(key, data) {
    if (modulesCache.size > 500) {
        const oldest = modulesCache.keys().next().value;
        modulesCache.delete(oldest);
    }
    modulesCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

export function invalidateModulesCache(clubId = null) {
    if (!clubId || clubId === 'global') {
        modulesCache.clear();
    } else {
        modulesCache.delete(clubId);
        modulesCache.delete('global');
    }
}

/**
 * Obtiene la configuración general predeterminada de la plataforma.
 */
export async function getGlobalSiteModules() {
    const cached = getCached('global');
    if (cached) return cached;

    try {
        const { rows } = await db.query(
            `SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL LIMIT 1`,
            [SETTING_KEY_SITE_MODULES]
        );

        let parsed = null;
        if (rows[0]?.value) {
            try {
                parsed = JSON.parse(rows[0].value);
            } catch (e) {
                console.warn('[siteModules] Error parseando setting global:', e?.message);
            }
        }

        const resolved = { ...DEFAULT_SITE_MODULES_CONFIG, ...(parsed || {}) };
        setCached('global', resolved);
        return resolved;
    } catch (err) {
        console.error('[getGlobalSiteModules] Error:', err);
        return { ...DEFAULT_SITE_MODULES_CONFIG };
    }
}

/**
 * Obtiene la configuración de módulos para un club específico, resolviendo:
 * 1. Defaults globales
 * 2. Excepción fundacional (Rotary E-Club Origen)
 * 3. Overrides específicos guardados en Setting para ese club.
 */
export async function getClubSiteModules(clubId) {
    if (!clubId || clubId === 'global') {
        const globalMods = await getGlobalSiteModules();
        return {
            clubId: 'global',
            isGlobal: true,
            hasCustomOverride: false,
            modules: globalMods,
        };
    }

    const cleanClubId = String(clubId).trim();
    const cached = getCached(cleanClubId);
    if (cached) return cached;

    try {
        const globalMods = await getGlobalSiteModules();

        // Consultar datos del club para reconocer si es Origen por subdomain o ID
        const club = await prisma.club.findUnique({
            where: { id: cleanClubId },
            select: { id: true, name: true, subdomain: true, domain: true }
        }).catch(() => null);

        const isOrigen = cleanClubId === ORIGEN_CLUB_ID ||
                         club?.subdomain === 'rotary-e-club-origen' ||
                         club?.subdomain === 'rotaryecluborigen' ||
                         (club?.name && club.name.toLowerCase().includes('origen'));

        // Consultar si el club tiene override específico en Setting
        const { rows } = await db.query(
            `SELECT value FROM "Setting" WHERE key = $1 AND "clubId" = $2 LIMIT 1`,
            [SETTING_KEY_SITE_MODULES, cleanClubId]
        );

        let savedClubConfig = null;
        let hasCustomOverride = false;
        if (rows[0]?.value) {
            try {
                savedClubConfig = JSON.parse(rows[0].value);
                hasCustomOverride = true;
            } catch (e) {
                console.warn('[siteModules] Error parseando setting de club:', e?.message);
            }
        }

        const resolved = resolveClubModulesConfig(
            savedClubConfig,
            globalMods,
            isOrigen ? ORIGEN_CLUB_ID : cleanClubId
        );

        const result = {
            clubId: cleanClubId,
            clubName: club?.name || null,
            isGlobal: false,
            hasCustomOverride: hasCustomOverride || isOrigen,
            isOrigenException: isOrigen,
            modules: resolved,
        };

        setCached(cleanClubId, result);
        return result;
    } catch (err) {
        console.error('[getClubSiteModules] Error:', err);
        const isOrigen = cleanClubId === ORIGEN_CLUB_ID || cleanClubId.toLowerCase().includes('origen');
        return {
            clubId: cleanClubId,
            isGlobal: false,
            hasCustomOverride: isOrigen,
            isOrigenException: isOrigen,
            modules: resolveClubModulesConfig(null, null, isOrigen ? ORIGEN_CLUB_ID : cleanClubId),
        };
    }
}

/**
 * Guarda la configuración de módulos a nivel global o para un club particular.
 */
export async function saveSiteModulesConfig({ clubId = 'global', modules = {}, applyDefaults = false } = {}) {
    invalidateModulesCache(clubId);

    const isGlobal = !clubId || clubId === 'global' || clubId === 'all';
    const targetModules = applyDefaults ? { ...DEFAULT_SITE_MODULES_CONFIG } : { ...modules };

    if (isGlobal) {
        await db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, NULL, NOW())
             ON CONFLICT (key) WHERE "clubId" IS NULL
             DO UPDATE SET value = $2, "updatedAt" = NOW()`,
            [SETTING_KEY_SITE_MODULES, JSON.stringify(targetModules)]
        ).catch(async () => {
            // Fallback en caso de que el constraint sea unique([key, clubId]) con NULLs
            const { rowCount } = await db.query(
                `UPDATE "Setting" SET value = $1, "updatedAt" = NOW() WHERE key = $2 AND "clubId" IS NULL`,
                [JSON.stringify(targetModules), SETTING_KEY_SITE_MODULES]
            );
            if (rowCount === 0) {
                await db.query(
                    `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt") VALUES (gen_random_uuid(), $1, $2, NULL, NOW())`,
                    [SETTING_KEY_SITE_MODULES, JSON.stringify(targetModules)]
                );
            }
        });

        return {
            ok: true,
            isGlobal: true,
            clubId: 'global',
            modules: targetModules,
        };
    }

    const cleanClubId = String(clubId).trim();
    await db.query(
        `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, NOW())
         ON CONFLICT ("clubId", key)
         DO UPDATE SET value = $2, "updatedAt" = NOW()`,
        [SETTING_KEY_SITE_MODULES, JSON.stringify(targetModules), cleanClubId]
    );

    return {
        ok: true,
        isGlobal: false,
        clubId: cleanClubId,
        hasCustomOverride: true,
        modules: targetModules,
    };
}

/**
 * Restablece un club a la configuración global (elimina la excepción particular en Setting).
 */
export async function resetClubToGlobal(clubId) {
    if (!clubId || clubId === 'global') return { ok: true };
    const cleanClubId = String(clubId).trim();
    invalidateModulesCache(cleanClubId);

    await db.query(
        `DELETE FROM "Setting" WHERE key = $1 AND "clubId" = $2`,
        [SETTING_KEY_SITE_MODULES, cleanClubId]
    );

    const reloaded = await getClubSiteModules(cleanClubId);
    return {
        ok: true,
        clubId: cleanClubId,
        hasCustomOverride: false,
        modules: reloaded.modules,
    };
}

/**
 * Lista todos los clubes indicando su estado de personalización de módulos.
 */
export async function getAllClubsModulesStatus() {
    const { rows: clubs } = await db.query(`
        SELECT c.id, c.name, c.city, c.domain, c.subdomain, c.type, c.status,
               s.value IS NOT NULL AS "hasCustomOverride"
        FROM "Club" c
        LEFT JOIN "Setting" s ON s."clubId" = c.id AND s.key = $1
        ORDER BY c.name ASC
    `, [SETTING_KEY_SITE_MODULES]);

    return clubs.map(c => {
        const isOrigen = c.id === ORIGEN_CLUB_ID ||
                         c.subdomain === 'rotary-e-club-origen' ||
                         c.subdomain === 'rotaryecluborigen' ||
                         (c.name && c.name.toLowerCase().includes('origen'));

        return {
            ...c,
            hasCustomOverride: Boolean(c.hasCustomOverride || isOrigen),
            isOrigenException: isOrigen,
        };
    });
}

/**
 * Middleware para proteger rutas del backend según si el módulo está habilitado para el sitio.
 */
export function requireSiteModule(moduleKey) {
    return async (req, res, next) => {
        try {
            // Superadministrador de Club Platform tiene acceso universal de supervisión
            if (req.user?.role === 'administrator' || req.user?.role === 'superadmin') {
                return next();
            }

            const clubId = req.user?.clubId || req.user?.club?.id || req.headers['x-club-id'] || null;
            if (!clubId) {
                return next();
            }

            const status = await getClubSiteModules(clubId);
            if (status.modules && status.modules[moduleKey] === false) {
                return res.status(403).json({
                    error: `El módulo '${moduleKey}' no está habilitado para este sitio.`,
                    code: 'SITE_MODULE_DISABLED',
                    moduleKey
                });
            }

            next();
        } catch (err) {
            console.error(`[requireSiteModule:${moduleKey}] Error:`, err);
            next();
        }
    };
}
