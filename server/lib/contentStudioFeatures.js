// ════════════════════════════════════════════════════════════════════════════
// Control Central de Capacidades del Estudio de Contenido (v4.1134.0)
//
// Administrado centralmente desde el Administrador General de Club Platform.
// Determina por tenant cuáles de las 8 herramientas del Estudio de Contenido
// están habilitadas para cada sitio independiente:
//
//  1. video        (Creador de Video / Reels IA)
//  2. post         (Generador de Publicaciones / Copys e imágenes)
//  3. outro        (Outro IA / Motion Graphics y cierres)
//  4. pendones     (Pendones institucionales)
//  5. library      (Biblioteca de videos, reels y publicaciones)
//  6. accounts     (Cuentas Sociales / Fanpages e Instagram)
//  7. distribution (Distribución y Grupos)
//  8. queue        (Cola de Envío / Programaciones)
//
// Persiste en `Setting` (key: 'content_studio_tools', clubId).
// Los administradores de la plataforma (isGlobalAdmin) siempre conservan
// acceso irrestricto a todas las herramientas.
// ════════════════════════════════════════════════════════════════════════════

import prisma from './prisma.js';
import { resolveSocialScope } from '../controllers/socialPublishingController.js';

export const SETTING_KEY_STUDIO_TOOLS = 'content_studio_tools';

export const CONTENT_STUDIO_TOOLS_METADATA = [
    {
        key: 'video',
        tab: 'create',
        label: 'Creador de Video',
        description: 'Generación de videos y reels cinematográficos con IA',
        category: 'production',
        iconName: 'Video'
    },
    {
        key: 'post',
        tab: 'post',
        label: 'Generador de Publicaciones',
        description: 'Copys persuasivos e imágenes automáticas optimizadas para redes',
        category: 'production',
        iconName: 'ImageIcon'
    },
    {
        key: 'outro',
        tab: 'outros',
        label: 'Outro IA',
        description: 'Cierres animados y motion graphics con identidad de marca',
        category: 'branding',
        iconName: 'Clapperboard'
    },
    {
        key: 'pendones',
        tab: 'pendones',
        label: 'Pendones',
        description: 'Diseño y renderizado de pendones para eventos y programas',
        category: 'branding',
        iconName: 'Flag'
    },
    {
        key: 'library',
        tab: 'library',
        label: 'Biblioteca',
        description: 'Historial de publicaciones, videos, reels e informes respaldados',
        category: 'assets',
        iconName: 'Layers'
    },
    {
        key: 'accounts',
        tab: 'accounts',
        label: 'Cuentas Sociales',
        description: 'Vinculación y permisos de páginas de Facebook, Instagram y canales sociales',
        category: 'management',
        iconName: 'Share2'
    },
    {
        key: 'distribution',
        tab: 'distribution',
        label: 'Distribución',
        description: 'Distribución multicanal y listas de difusión a grupos',
        category: 'management',
        iconName: 'Megaphone'
    },
    {
        key: 'queue',
        tab: 'queue',
        label: 'Cola de Envío',
        description: 'Monitoreo de publicaciones programadas y pendientes',
        category: 'management',
        iconName: 'Clock'
    },
    {
        key: 'editor',
        tab: 'editor',
        label: 'Editor de Video',
        description: 'Editor multipista profesional con biblioteca multimedia, subtítulos IA y render HD',
        category: 'production',
        iconName: 'Film'
    }
];

export const DEFAULT_CONTENT_STUDIO_TOOLS = {
    video: true,
    post: true,
    outro: true,
    pendones: true,
    library: true,
    accounts: true,
    distribution: true,
    queue: true,
    editor: false
};

/**
 * Obtiene la configuración general/global de herramientas del Estudio de Contenido.
 * Persiste en Setting con key='content_studio_tools' y clubId=null.
 */
export const getGlobalStudioFeatures = async () => {
    try {
        const fila = await prisma.setting.findFirst({
            where: {
                key: SETTING_KEY_STUDIO_TOOLS,
                clubId: null
            }
        });
        if (!fila?.value) {
            return { ...DEFAULT_CONTENT_STUDIO_TOOLS };
        }
        const parsed = JSON.parse(fila.value);
        return {
            video: parsed.video !== false,
            post: parsed.post !== false,
            outro: parsed.outro !== false,
            pendones: parsed.pendones !== false,
            library: parsed.library !== false,
            accounts: parsed.accounts !== false,
            distribution: parsed.distribution !== false,
            queue: parsed.queue !== false,
            editor: Boolean(parsed.editor)
        };
    } catch (err) {
        console.error('[contentStudioFeatures] Error leyendo configuración global:', err);
        return { ...DEFAULT_CONTENT_STUDIO_TOOLS };
    }
};

/**
 * Determina si un club tiene una personalización exclusiva de herramientas.
 */
export const hasClubCustomFeatures = async (clubId) => {
    if (!clubId || typeof clubId !== 'string' || clubId.trim() === 'global') return false;
    try {
        const fila = await prisma.setting.findFirst({
            where: {
                key: SETTING_KEY_STUDIO_TOOLS,
                clubId: clubId.trim()
            }
        });
        return !!fila;
    } catch {
        return false;
    }
};

/**
 * Obtiene la configuración de herramientas del Estudio de Contenido para un club.
 * Si el club no tiene personalización guardada, hereda la configuración general global.
 */
export const getClubStudioFeatures = async (clubId) => {
    if (!clubId || typeof clubId !== 'string' || clubId.trim() === '' || clubId.trim() === 'global') {
        return await getGlobalStudioFeatures();
    }
    try {
        const fila = await prisma.setting.findFirst({
            where: {
                key: SETTING_KEY_STUDIO_TOOLS,
                clubId: clubId.trim()
            }
        });
        if (fila?.value) {
            const parsed = JSON.parse(fila.value);
            return {
                video: parsed.video !== false,
                post: parsed.post !== false,
                outro: parsed.outro !== false,
                pendones: parsed.pendones !== false,
                library: parsed.library !== false,
                accounts: parsed.accounts !== false,
                distribution: parsed.distribution !== false,
                queue: parsed.queue !== false,
                editor: Boolean(parsed.editor)
            };
        }
        // Si no tiene fila propia, hereda la configuración general (global)
        return await getGlobalStudioFeatures();
    } catch (err) {
        console.error(`[contentStudioFeatures] Error leyendo configuración para clubId ${clubId}:`, err);
        return await getGlobalStudioFeatures();
    }
};

/**
 * Guarda o restablece la configuración de herramientas.
 * Si clubId es 'global', null o '', se guarda la configuración GENERAL de la plataforma.
 * Si clubId es un UUID de club, se guarda la personalización exclusiva de ese sitio.
 */
export const saveClubStudioFeatures = async (clubId, features, applyDefaults = false) => {
    const isGlobal = !clubId || clubId === 'global' || clubId === 'all' || clubId === 'general';
    const cleanClubId = isGlobal ? null : String(clubId).trim();

    let valor = { ...DEFAULT_CONTENT_STUDIO_TOOLS };
    if (!applyDefaults && features && typeof features === 'object') {
        valor = {
            video: features.video !== false,
            post: features.post !== false,
            outro: features.outro !== false,
            pendones: features.pendones !== false,
            library: features.library !== false,
            accounts: features.accounts !== false,
            distribution: features.distribution !== false,
            queue: features.queue !== false,
            editor: features.editor === true
        };
    }

    const valueStr = JSON.stringify(valor);
    const fila = await prisma.setting.findFirst({
        where: {
            key: SETTING_KEY_STUDIO_TOOLS,
            clubId: cleanClubId
        }
    });

    if (fila) {
        await prisma.setting.update({
            where: { id: fila.id },
            data: { value: valueStr }
        });
    } else {
        await prisma.setting.create({
            data: {
                key: SETTING_KEY_STUDIO_TOOLS,
                clubId: cleanClubId,
                value: valueStr
            }
        });
    }

    return valor;
};

/**
 * Middleware para proteger rutas según la disponibilidad de la herramienta en el tenant.
 * Los administradores de la plataforma (isGlobalAdmin) SIEMPRE tienen acceso irrestricto.
 */
export const requireStudioTool = (toolKey) => {
    return async (req, res, next) => {
        try {
            const scope = await resolveSocialScope(req);
            // El Administrador General de Club Platform conserva acceso a todas las herramientas
            if (scope.isGlobalAdmin) {
                return next();
            }

            const clubId = scope.clubId || req.user?.clubId;
            if (!clubId) {
                if (req.user?.role === 'administrator') return next();
                // Si no hay clubId, verificar con la regla general
                const globalFeatures = await getGlobalStudioFeatures();
                if (globalFeatures[toolKey] === false) {
                    return res.status(403).json({
                        error: `La herramienta '${toolKey}' no está disponible actualmente. Contacte al Administrador General de Club Platform.`,
                        code: 'STUDIO_TOOL_DISABLED',
                        tool: toolKey
                    });
                }
                return next();
            }

            const features = await getClubStudioFeatures(clubId);
            if (features[toolKey] === false) {
                return res.status(403).json({
                    error: `La herramienta '${toolKey}' no está disponible para este sitio. Contacte al Administrador General de Club Platform.`,
                    code: 'STUDIO_TOOL_DISABLED',
                    tool: toolKey
                });
            }

            next();
        } catch (err) {
            console.error(`[requireStudioTool] Error evaluando herramienta '${toolKey}':`, err);
            next();
        }
    };
};

/**
 * GET /api/content-studio/features
 * Consulta las herramientas activas.
 * Si es admin de plataforma y pasa ?clubId, devuelve las del club especificado (o 'global').
 * Si no pasa clubId o es tenant, devuelve las de su ámbito.
 */
export const getStudioFeatures = async (req, res) => {
    try {
        const scope = await resolveSocialScope(req);
        const requestedClubId = req.query?.clubId ? String(req.query.clubId).trim() : null;

        if (scope.isGlobalAdmin) {
            if (requestedClubId && requestedClubId !== 'global') {
                const features = await getClubStudioFeatures(requestedClubId);
                const hasCustom = await hasClubCustomFeatures(requestedClubId);
                return res.json({
                    clubId: requestedClubId,
                    features,
                    hasCustomConfig: hasCustom,
                    isGlobalAdmin: true,
                    defaults: DEFAULT_CONTENT_STUDIO_TOOLS,
                    toolsMetadata: CONTENT_STUDIO_TOOLS_METADATA
                });
            }

            // Administrador General en ámbito general o sin clubId
            const globalFeatures = await getGlobalStudioFeatures();
            return res.json({
                clubId: 'global',
                isGlobal: true,
                features: globalFeatures,
                isGlobalAdmin: true,
                defaults: DEFAULT_CONTENT_STUDIO_TOOLS,
                toolsMetadata: CONTENT_STUDIO_TOOLS_METADATA
            });
        }

        const effectiveClubId = scope.clubId || req.user?.clubId;
        const features = await getClubStudioFeatures(effectiveClubId);
        return res.json({
            clubId: effectiveClubId,
            features,
            isGlobalAdmin: false,
            defaults: DEFAULT_CONTENT_STUDIO_TOOLS,
            toolsMetadata: CONTENT_STUDIO_TOOLS_METADATA
        });
    } catch (err) {
        console.error('[getStudioFeatures] Error:', err);
        res.status(500).json({ error: 'Error al obtener capacidades del Estudio de Contenido' });
    }
};

/**
 * PUT /api/content-studio/features
 * Guarda la configuración de herramientas a nivel general o para un sitio específico.
 * Exclusivo para el Administrador General de Club Platform.
 */
export const updateStudioFeatures = async (req, res) => {
    try {
        const scope = await resolveSocialScope(req);
        if (!scope.isGlobalAdmin && req.user?.role !== 'administrator') {
            return res.status(403).json({
                error: 'Solo el Administrador General de Club Platform puede modificar la disponibilidad de herramientas.',
                code: 'FORBIDDEN_PLATFORM_ADMIN_ONLY'
            });
        }

        const { clubId, features, applyDefaults, resetToGlobal } = req.body || {};
        const isGlobal = !clubId || clubId === 'global' || clubId === 'all' || clubId === 'general';

        // 1. Configuración a nivel GENERAL de la plataforma (Aplica a todos los sitios)
        if (isGlobal) {
            const updated = await saveClubStudioFeatures('global', features, !!applyDefaults);
            return res.json({
                ok: true,
                clubId: 'global',
                clubName: 'Configuración General (Todos los Sitios)',
                isGlobal: true,
                features: updated,
                message: applyDefaults
                    ? 'Configuración general predeterminada aplicada con éxito a todos los sitios'
                    : 'Configuración general de herramientas guardada para todos los sitios'
            });
        }

        // 2. Personalización para un sitio específico
        const cleanClubId = String(clubId).trim();
        const club = await prisma.club.findUnique({
            where: { id: cleanClubId },
            select: { id: true, name: true, domain: true }
        });
        if (!club) {
            return res.status(404).json({ error: 'El sitio / club especificado no existe' });
        }

        // Si se solicita restablecer a la configuración general
        if (resetToGlobal) {
            await prisma.setting.deleteMany({
                where: {
                    key: SETTING_KEY_STUDIO_TOOLS,
                    clubId: club.id
                }
            });
            const globalFeatures = await getGlobalStudioFeatures();
            return res.json({
                ok: true,
                clubId: club.id,
                clubName: club.name,
                isGlobal: false,
                hasCustomConfig: false,
                features: globalFeatures,
                message: `El sitio ${club.name} ahora hereda la configuración general.`
            });
        }

        const updated = await saveClubStudioFeatures(club.id, features, !!applyDefaults);
        return res.json({
            ok: true,
            clubId: club.id,
            clubName: club.name,
            isGlobal: false,
            hasCustomConfig: true,
            features: updated,
            message: applyDefaults
                ? `Configuración predeterminada aplicada con éxito a ${club.name}`
                : `Configuración de herramientas guardada para ${club.name}`
        });
    } catch (err) {
        console.error('[updateStudioFeatures] Error:', err);
        res.status(500).json({ error: 'Error al actualizar herramientas: ' + err.message });
    }
};

/**
 * GET /api/content-studio/features/all
 * Devuelve la configuración global y la lista de todos los clubes con su estado.
 * Exclusivo para Administrador General.
 */
export const getAllClubsStudioFeatures = async (req, res) => {
    try {
        const scope = await resolveSocialScope(req);
        if (!scope.isGlobalAdmin && req.user?.role !== 'administrator') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const [clubs, settings] = await Promise.all([
            prisma.club.findMany({
                where: { status: 'active' },
                select: { id: true, name: true, city: true, domain: true, subdomain: true, type: true },
                orderBy: { name: 'asc' }
            }),
            prisma.setting.findMany({
                where: { key: SETTING_KEY_STUDIO_TOOLS }
            })
        ]);

        const globalSettingRow = settings.find(s => !s.clubId);
        let globalFeatures = { ...DEFAULT_CONTENT_STUDIO_TOOLS };
        if (globalSettingRow?.value) {
            try {
                const parsedGlobal = JSON.parse(globalSettingRow.value);
                globalFeatures = {
                    video: parsedGlobal.video !== false,
                    post: parsedGlobal.post !== false,
                    outro: parsedGlobal.outro !== false,
                    pendones: parsedGlobal.pendones !== false,
                    library: parsedGlobal.library !== false,
                    accounts: parsedGlobal.accounts !== false,
                    distribution: parsedGlobal.distribution !== false,
                    queue: parsedGlobal.queue !== false
                };
            } catch { /* ignore */ }
        }

        const settingsMap = new Map();
        for (const s of settings) {
            if (s.clubId && s.value) {
                try {
                    settingsMap.set(s.clubId, JSON.parse(s.value));
                } catch { /* ignore */ }
            }
        }

        const result = clubs.map(c => {
            const custom = settingsMap.get(c.id);
            const features = custom ? {
                video: custom.video !== false,
                post: custom.post !== false,
                outro: custom.outro !== false,
                pendones: custom.pendones !== false,
                library: custom.library !== false,
                accounts: custom.accounts !== false,
                distribution: custom.distribution !== false,
                queue: custom.queue !== false,
                editor: custom.editor === true
            } : { ...globalFeatures };

            return {
                id: c.id,
                name: c.name,
                city: c.city,
                domain: c.domain,
                subdomain: c.subdomain,
                type: c.type,
                hasCustomConfig: !!custom,
                features
            };
        });

        res.json({
            globalFeatures,
            clubs: result,
            defaults: DEFAULT_CONTENT_STUDIO_TOOLS,
            toolsMetadata: CONTENT_STUDIO_TOOLS_METADATA
        });
    } catch (err) {
        console.error('[getAllClubsStudioFeatures] Error:', err);
        res.status(500).json({ error: 'Error al listar configuraciones de clubes' });
    }
};
