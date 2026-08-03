// ════════════════════════════════════════════════════════════════════
// Autenticación y autorización de la plataforma
// v4.627.0
//
// La plataforma tiene TRES identidades distintas que se firman con el mismo
// secreto:
//
//   • `User`                 → panel administrativo del sitio (aud: rotary-platform)
//   • `ProjectFairAccount`   → panel del club en la feria      (aud: project-fair-portal)
//   • `EventAttendeeAccount` → panel del asistente al evento   (aud: event-attendee-portal)
//
// Hasta v4.626 `authMiddleware` verificaba la firma pero NO la audiencia. Como
// todos los tokens usan el mismo JWT_SECRET, el token del panel del club pasaba
// este middleware sin problema y alcanzaba rutas administrativas —entre ellas
// las de /api/project-fair/admin, que devuelven las postulaciones y los pagos
// de TODOS los clubes—. Aquí se cierra: un token que declara otra audiencia se
// rechaza con 403.
//
// Los tokens emitidos antes de este cambio no traen `aud`; se siguen aceptando
// para no cerrar sesiones en marcha. Duran un día, así que rotan solos.
// ════════════════════════════════════════════════════════════════════
import jwt from 'jsonwebtoken';

export const PLATFORM_AUDIENCE = 'rotary-platform';
export const PORTAL_AUDIENCE = 'project-fair-portal';

export const JWT_SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';

/**
 * Vigencia del token cuando NO se marca "Mantener la sesión iniciada".
 * Es la misma para las tres identidades: quien pide no ser recordado espera
 * que la sesión no le sobreviva al día, y no tendría sentido que dependiera de
 * con cuál de las tres entró. Marcada, cada identidad conserva la suya, así
 * que la casilla sólo puede acortar la sesión, nunca alargarla.
 */
export const SHORT_SESSION_TTL = '12h';

/**
 * Roles de la tabla `User` que pueden entrar al panel administrativo.
 * Debe coincidir con `ADMIN_ROLES` de src/App.tsx: el cliente decide qué
 * pinta, éste decide qué se responde.
 */
export const ADMIN_ROLES = [
    'administrator', 'superadmin', 'district_admin', 'club_admin',
    'editor', 'member', 'crowdfunder',
    // Agente de soporte o comunicaciones del WhatsApp CRM (v4.696). Entra al
    // panel para atender su bandeja y nada más: NO está en SITE_ADMIN_ROLES, así
    // que no administra el sitio, no toca la configuración del motor y no ve
    // datos de otros sitios. El alcance de lo que atiende lo decide
    // `scopeSiteFilter` en el controlador del CRM.
    'crm_agent',
];

/**
 * Subconjunto que administra módulos del sitio (feria de proyectos,
 * configuración, pagos). `member` y `crowdfunder` quedan fuera a propósito:
 * son roles de participación, no de administración.
 */
export const SITE_ADMIN_ROLES = [
    'administrator', 'superadmin', 'district_admin', 'club_admin', 'editor',
];

export const authMiddleware = (req, res, next) => {
    let token = req.headers.authorization?.split(' ')[1];

    // Support token in query string for image/media proxy endpoints
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) return res.status(401).json({ error: 'No token provided' });

    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
        console.error('[AUTH] Invalid token:', error.message);
        return res.status(401).json({ error: 'Invalid token' });
    }

    // Un token de otra audiencia (el del panel del club) no vale aquí, aunque
    // la firma sea válida: son identidades distintas con permisos distintos.
    if (decoded.aud && decoded.aud !== PLATFORM_AUDIENCE) {
        console.warn(`[AUTH] Token de audiencia "${decoded.aud}" rechazado en ${req.method} ${req.originalUrl}`);
        return res.status(403).json({ error: 'Access denied' });
    }

    req.user = decoded;
    next();
};

export const roleMiddleware = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            // Sin detalle de qué rol haría falta: el error no debe servir de
            // mapa del panel administrativo.
            console.warn(`[AUTH] Rol "${req.user?.role || 'ninguno'}" sin permiso en ${req.method} ${req.originalUrl}`);
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
};

/** Exige una sesión de plataforma con rol administrativo del sitio. */
export const requireSiteAdmin = roleMiddleware(SITE_ADMIN_ROLES);
