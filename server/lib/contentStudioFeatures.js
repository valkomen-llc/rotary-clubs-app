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
        key: 'image_library',
        tab: 'library_images',
        label: 'Biblioteca de Imágenes',
        description: 'Publicaciones e imágenes fotográficas generadas por IA del sitio',
        category: 'assets',
        iconName: 'ImageIcon'
    },
    {
        key: 'ai_reels',
        tab: 'library_reels',
        label: 'Reels IA',
        description: 'Videos verticales cinemáticos generados desde fotografías con IA',
        category: 'assets',
        iconName: 'Sparkles'
    },
    {
        key: 'video_library',
        tab: 'library_videos',
        label: 'Videoteca y Video Informes',
        description: 'Video informes, clips renderizados y proyectos de video',
        category: 'assets',
        iconName: 'Film'
    },
    {
        key: 'rotary_in_action',
        tab: 'rotary_in_action',
        label: 'Rotary en Acción',
        description: 'Captación de historias de clubes, banco de testimonios y trazabilidad institucional',
        category: 'production',
        iconName: 'HeartHandshake'
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
    image_library: true,
    ai_reels: true,
    video_library: true,
    editor: false,
    rotary_in_action: true,
    accounts: true,
    distribution: true,
    queue: true
};

export const getDistrictStudioFeatures = () => ({
    video: true,
    post: true,
    outro: true,
    pendones: true,
    library: true,
    image_library: true,
    ai_reels: true,
    video_library: true,
    editor: true,
    rotary_in_action: true,
    accounts: true,
    distribution: true,
    queue: true
});

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
            image_library: parsed.image_library !== false,
            ai_reels: parsed.ai_reels !== false,
            video_library: parsed.video_library !== false,
            rotary_in_action: parsed.rotary_in_action !== false,
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
 * Obtiene la configuración de herramientas del Estudio de Contenido para un club o distrito.
 * Si el club no tiene personalización guardada:
 *  - Si es un Distrito: se habilitan todas las herramientas de producción, biblioteca y Rotary en Acción.
 *  - Si es un Club: hereda la configuración general global.
 */
export const getClubStudioFeatures = async (clubId) => {
    if (!clubId || typeof clubId !== 'string' || clubId.trim() === '' || clubId.trim() === 'global') {
        return await getGlobalStudioFeatures();
    }
    try {
        const cleanClubId = clubId.trim();
        const fila = await prisma.setting.findFirst({
            where: {
                key: SETTING_KEY_STUDIO_TOOLS,
                clubId: cleanClubId
            }
        });

        // Averiguar si el sitio es un distrito
        let isDistrict = false;
        try {
            const club = await prisma.club.findUnique({
                where: { id: cleanClubId },
                select: { id: true, type: true, name: true, domain: true, subdomain: true }
            });
            const t = String(club?.type || '').toLowerCase();
            const n = String(club?.name || '').toLowerCase();
            const sub = String(club?.subdomain || '').toLowerCase();
            const dom = String(club?.domain || '').toLowerCase();
            if (t.includes('district') || t.includes('distrito') || n.includes('distrito') || sub.includes('rotary4281') || sub.includes('d4281') || dom.includes('4281') || sub.includes('4281')) {
                isDistrict = true;
            }
        } catch { /* ignore */ }

        const baseDefaults = isDistrict ? getDistrictStudioFeatures() : await getGlobalStudioFeatures();

        if (fila?.value) {
            const parsed = JSON.parse(fila.value);
            return {
                video: parsed.video !== undefined ? Boolean(parsed.video) : baseDefaults.video,
                post: parsed.post !== undefined ? Boolean(parsed.post) : baseDefaults.post,
                outro: parsed.outro !== undefined ? Boolean(parsed.outro) : baseDefaults.outro,
                pendones: parsed.pendones !== undefined ? Boolean(parsed.pendones) : baseDefaults.pendones,
                library: parsed.library !== undefined ? Boolean(parsed.library) : baseDefaults.library,
                image_library: parsed.image_library !== undefined ? Boolean(parsed.image_library) : baseDefaults.image_library,
                ai_reels: parsed.ai_reels !== undefined ? Boolean(parsed.ai_reels) : baseDefaults.ai_reels,
                video_library: parsed.video_library !== undefined ? Boolean(parsed.video_library) : baseDefaults.video_library,
                rotary_in_action: parsed.rotary_in_action !== undefined ? Boolean(parsed.rotary_in_action) : baseDefaults.rotary_in_action,
                accounts: parsed.accounts !== undefined ? Boolean(parsed.accounts) : baseDefaults.accounts,
                distribution: parsed.distribution !== undefined ? Boolean(parsed.distribution) : baseDefaults.distribution,
                queue: parsed.queue !== undefined ? Boolean(parsed.queue) : baseDefaults.queue,
                editor: parsed.editor !== undefined ? Boolean(parsed.editor) : baseDefaults.editor
            };
        }

        // Si no tiene fila propia, devuelve la base correspondiente (Distrito o Global)
        return baseDefaults;
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
            image_library: features.image_library !== false,
            ai_reels: features.ai_reels !== false,
            video_library: features.video_library !== false,
            rotary_in_action: features.rotary_in_action !== false,
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
 * Resuelve el ámbito multi-tenant seguro para cualquier consulta del Estudio de Contenido.
 * Garantiza:
 * 1. Superadmin en Club Platform (sin club específico) -> isGlobal = true.
 * 2. Distritos (ej. Distrito 4281) -> resuelve el conjunto de identificadores del distrito
 *    (clubId distrital + districtId + clubes espejo) de modo que recupere todos sus Reels y videos
 *    sin fugar hacia otros distritos o clubes ajenos.
 * 3. Clubes individuales -> únicamente su clubId específico.
 */
export const resolveTenantScope = async (req) => {
    const scope = await resolveSocialScope(req);
    if (scope.isGlobalAdmin) {
        const reqClubId = req.query?.clubId || req.body?.clubId;
        if (reqClubId && reqClubId !== 'all' && reqClubId !== 'global') {
            return {
                isGlobal: false,
                isGlobalAdmin: true,
                clubIds: [String(reqClubId).trim()],
                primaryClubId: String(reqClubId).trim(),
                isDistrict: false
            };
        }
        return {
            isGlobal: true,
            isGlobalAdmin: true,
            clubIds: [],
            primaryClubId: null,
            isDistrict: false
        };
    }

    const clubIds = new Set();
    if (scope.clubId) clubIds.add(scope.clubId);
    if (req.user?.clubId) clubIds.add(req.user.clubId);
    if (req.user?.districtId) clubIds.add(req.user.districtId);

    let isDistrict = false;
    const callerType = String(scope.club?.type || '').toLowerCase();
    const callerName = String(scope.club?.name || '').toLowerCase();
    const callerSub = String(scope.club?.subdomain || '').toLowerCase();
    const callerDom = String(scope.club?.domain || '').toLowerCase();
    if (callerType.includes('district') || callerType.includes('distrito') || callerName.includes('distrito') || callerSub.includes('4281') || callerDom.includes('4281') || req.user?.role === 'district_admin' || req.user?.districtId) {
        isDistrict = true;
    }

    if (isDistrict) {
        const dId = req.user?.districtId;
        if (dId) clubIds.add(dId);
        try {
            const related = await prisma.club.findMany({
                where: {
                    OR: [
                        ...(dId ? [{ districtId: dId }, { id: dId }] : []),
                        ...(scope.clubId ? [{ id: scope.clubId }, { districtId: scope.clubId }] : []),
                        ...(req.user?.clubId ? [{ id: req.user.clubId }] : [])
                    ]
                },
                select: { id: true, districtId: true }
            });
            for (const r of related) {
                if (r.id) clubIds.add(r.id);
                if (r.districtId) clubIds.add(r.districtId);
            }
        } catch { /* ignore */ }
    }

    const finalIds = Array.from(clubIds).filter(Boolean);
    return {
        isGlobal: false,
        isGlobalAdmin: false,
        isDistrict,
        clubIds: finalIds.length ? finalIds : ['__UNAUTHORIZED_TENANT__'],
        primaryClubId: scope.clubId || req.user?.clubId || (finalIds.length ? finalIds[0] : null)
    };
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
