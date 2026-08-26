// ════════════════════════════════════════════════════════════════════
// Accesos institucionales — ESPEJO del criterio en el navegador
// v4.932.0
//
// Está duplicado A PROPÓSITO, igual que `ADMIN_ROLES`, `designSpec` o
// `contributionSpec`: el servidor decide qué RESPONDE y éste decide qué se
// PINTA. Sin espejo, el menú tendría que preguntarle al servidor por cada
// herramienta antes de dibujarla —una consulta por visita para saber lo mismo—.
//
// ⚠️ SI CAMBIA UNO, CAMBIA EL OTRO. Lo comprueba `npm run test:institutional`,
// que carga los dos y compara las SALIDAS de las funciones sobre una matriz de
// sesiones y permisos, no sólo las constantes: que las dos mitades coincidan en
// la lista y discrepen en `can()` sería el peor de los dos mundos.
//
// ⚠️ ESTO DECIDE QUÉ SE DIBUJA, NUNCA A QUÉ SE TIENE ACCESO. Quien escriba la
// dirección de una pantalla que no le toca choca igual contra `authMiddleware`
// + `requirePermission` en el servidor. Esconder un botón no protege un
// endpoint de quien lo conoce (v4.868).
// ════════════════════════════════════════════════════════════════════

export interface PermissionSpec {
    key: string;
    label: string;
    help: string;
    adminOnly: boolean;
}

export const PERMISSIONS: PermissionSpec[] = [
    { key: 'mailbox', label: 'Bandeja de correo', help: 'Ve y responde ÚNICAMENTE su propia cuenta institucional.', adminOnly: false },
    { key: 'content_studio', label: 'Estudio de Contenido', help: 'Generador de publicaciones, Reels, Aniversarios IA y las demás herramientas del estudio.', adminOnly: false },
    { key: 'media_library', label: 'Biblioteca multimedia', help: 'Sube y organiza los archivos del sitio.', adminOnly: false },
    { key: 'news', label: 'Noticias', help: 'Redacta y publica artículos del sitio.', adminOnly: false },
    { key: 'events', label: 'Eventos', help: 'Crea y edita los eventos del calendario.', adminOnly: false },
    { key: 'contacts', label: 'Contactos y Leads', help: 'Consulta la base de contactos del sitio. Son datos personales de terceros.', adminOnly: false },
    { key: 'email_accounts', label: 'Administración de cuentas de correo', help: 'Crear, editar y eliminar las cuentas institucionales del sitio, y ver su configuración técnica.', adminOnly: true },
    { key: 'users', label: 'Administración de usuarios', help: 'Dar y quitar acceso al panel, cambiar roles y restablecer contraseñas de otros.', adminOnly: true },
    { key: 'site_settings', label: 'Configuración del sitio', help: 'Identidad, dominio, pagos y ajustes del sitio.', adminOnly: true },
];

export const PERMISSION_KEYS = PERMISSIONS.map(p => p.key);
export const ADMIN_ONLY_PERMISSIONS = PERMISSIONS.filter(p => p.adminOnly).map(p => p.key);
export const GRANTABLE_PERMISSIONS = PERMISSIONS.filter(p => !p.adminOnly).map(p => p.key);

export const INSTITUTIONAL_ROLE = 'institutional_user';

export interface AccessRoleSpec {
    key: string;
    label: string;
    help: string;
    administrative: boolean;
}

export const ACCESS_ROLES: AccessRoleSpec[] = [
    {
        key: INSTITUTIONAL_ROLE,
        label: 'Usuario institucional',
        help: 'Entra al panel y usa únicamente las herramientas marcadas. No administra el sitio ni ve otras cuentas de correo.',
        administrative: false,
    },
    {
        key: 'club_admin',
        label: 'Administrador del sitio',
        help: 'Administra las cuentas, los usuarios y la configuración de ESTE sitio. No alcanza a otros sitios.',
        administrative: true,
    },
];

export const ACCESS_ROLE_KEYS = ACCESS_ROLES.map(r => r.key);

export const ADMINISTRATIVE_ROLES = [
    'administrator', 'superadmin', 'district_admin', 'club_admin', 'editor',
];
export const PLATFORM_ROLES = ['administrator', 'superadmin'];
export const DEFAULT_INSTITUTIONAL_PERMISSIONS = ['mailbox'];
export const PASSWORD_MIN = 8;

export interface SessionLike {
    role?: string | null;
    email?: string | null;
    mailbox?: string | null;
    permissions?: string[] | null;
}

const str = (v: unknown, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lower = (v: unknown) => str(v, 200).toLowerCase();

export const isPlatformOperator = (user?: SessionLike | null) =>
    PLATFORM_ROLES.includes(str(user?.role, 40));

export const isSiteAdministrator = (user?: SessionLike | null) =>
    ADMINISTRATIVE_ROLES.includes(str(user?.role, 40));

export const isInstitutionalUser = (user?: SessionLike | null) =>
    str(user?.role, 40) === INSTITUTIONAL_ROLE;

/** El único punto de decisión del navegador. Espejo de `can()` del servidor. */
export const can = (user: SessionLike | null | undefined, permission: string): boolean => {
    const key = str(permission, 40);
    if (!key || !PERMISSION_KEYS.includes(key)) return false;
    if (isPlatformOperator(user)) return true;
    if (isSiteAdministrator(user)) return true;
    if (!isInstitutionalUser(user)) return false;
    if (ADMIN_ONLY_PERMISSIONS.includes(key)) return false;
    const granted = Array.isArray(user?.permissions) ? user!.permissions! : [];
    return granted.includes(key);
};

export const effectivePermissions = (user?: SessionLike | null): string[] =>
    PERMISSION_KEYS.filter(k => can(user, k));

export const normalizePermissions = (
    input: unknown,
    role: string = INSTITUTIONAL_ROLE,
): { permissions: string[]; descartados: { key: string; motivo: string }[] } => {
    const pedidos = Array.isArray(input) ? input.map(v => str(v, 40)).filter(Boolean) : [];
    const vistos = new Set<string>();
    const concedidos: string[] = [];
    const descartados: { key: string; motivo: string }[] = [];

    for (const key of pedidos) {
        if (vistos.has(key)) continue;
        vistos.add(key);
        if (!PERMISSION_KEYS.includes(key)) {
            descartados.push({ key, motivo: 'No existe ese permiso.' });
            continue;
        }
        if (role === INSTITUTIONAL_ROLE && ADMIN_ONLY_PERMISSIONS.includes(key)) {
            descartados.push({
                key,
                motivo: 'Es un permiso de administración del sitio: exige el rol de administrador, no se concede suelto.',
            });
            continue;
        }
        concedidos.push(key);
    }

    if (role !== INSTITUTIONAL_ROLE) return { permissions: [], descartados };
    return {
        permissions: concedidos.length ? concedidos : [...DEFAULT_INSTITUTIONAL_PERMISSIONS],
        descartados,
    };
};

export const localPartOf = (value: unknown) =>
    lower(value).split('@')[0].replace(/[^a-z0-9._-]/g, '');

export const buildInstitutionalEmail = (local: unknown, domain: unknown): string | null => {
    const user = localPartOf(local);
    const host = lower(domain).replace(/^www\./, '').replace(/^@/, '');
    if (!user || !host) return null;
    return `${user}@${host}`;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (value: unknown) => EMAIL_RE.test(lower(value));

export interface AccountPayload {
    local?: string;
    user?: string;
    firstName?: string;
    lastName?: string;
    position?: string;
    role?: string;
    permissions?: string[];
    grantAccess?: boolean;
    password?: string;
    passwordConfirm?: string;
    confirmPassword?: string;
    temporaryPassword?: boolean;
}

/**
 * Los avisos EN VIVO del formulario, con el mismo criterio y los mismos
 * mensajes del servidor: con dos, la pantalla diría que algo está bien y el
 * servidor lo rechazaría — que se lee como que el módulo está roto.
 */
export const validateAccountPayload = (
    input: AccountPayload = {},
    { domain = '', requireAccess = null as boolean | null } = {},
) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const local = localPartOf(input.local ?? input.user ?? '');
    const email = buildInstitutionalEmail(local, domain);

    if (!local) errors.push('Escribe la parte de la dirección que va antes de la arroba.');
    else if (local.length < 2) errors.push('La dirección es demasiado corta.');
    if (!domain) errors.push('Este sitio todavía no tiene un dominio propio configurado, así que no se puede crear una dirección institucional.');
    if (local && domain && !email) errors.push('La dirección no es válida.');
    if (email && !isEmail(email)) errors.push('La dirección no es válida.');

    const grantAccess = requireAccess !== null ? !!requireAccess : !!input.grantAccess;

    const password = String(input.password ?? '');
    const confirm = String(input.passwordConfirm ?? input.confirmPassword ?? '');

    if (!password) {
        errors.push('Escribe una contraseña inicial.');
    } else if (password.length < PASSWORD_MIN) {
        errors.push(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
    }
    if (confirm) {
        if (password !== confirm) errors.push('Las dos contraseñas no coinciden.');
    } else if (password) {
        warnings.push('Se creó sin confirmar la contraseña: comprueba que sea la que querías.');
    }

    const firstName = str(input.firstName, 80);
    const lastName = str(input.lastName, 80);
    const position = str(input.position, 120);

    if (grantAccess) {
        if (!firstName) errors.push('Escribe el nombre del propietario.');
        if (!lastName) warnings.push('Sin apellido, el usuario aparecerá sólo con su nombre.');
    }

    const role = str(input.role, 40) || INSTITUTIONAL_ROLE;
    if (grantAccess && !ACCESS_ROLE_KEYS.includes(role)) {
        errors.push('Ese rol de acceso no existe.');
    }

    const { permissions, descartados } = normalizePermissions(
        input.permissions,
        ACCESS_ROLE_KEYS.includes(role) ? role : INSTITUTIONAL_ROLE,
    );
    for (const d of descartados) warnings.push(`Permiso descartado (${d.key}): ${d.motivo}`);

    if (grantAccess && role === INSTITUTIONAL_ROLE && permissions.length === 0) {
        warnings.push('Sin ninguna herramienta marcada, el usuario entra al panel y no ve nada.');
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        value: {
            email,
            local,
            firstName,
            lastName,
            position,
            role: ACCESS_ROLE_KEYS.includes(role) ? role : INSTITUTIONAL_ROLE,
            permissions,
            grantAccess,
            password,
            temporaryPassword: input.temporaryPassword !== false,
        },
    };
};

export const mailboxScopeFor = (user?: SessionLike | null): string[] | null => {
    if (isPlatformOperator(user) || isSiteAdministrator(user)) return null;
    const propio = lower(user?.mailbox || user?.email);
    return propio && isEmail(propio) ? [propio] : [];
};

export const canUseMailbox = (user: SessionLike | null | undefined, address: unknown) => {
    const scope = mailboxScopeFor(user);
    if (scope === null) return true;
    return scope.includes(lower(address));
};

export const canManageMailAccounts = (user?: SessionLike | null) => can(user, 'email_accounts');


// ── Qué pantallas abre cada permiso ──────────────────────────────────

/**
 * EL MAPA DE HERRAMIENTAS A RUTAS DEL PANEL.
 *
 * Es lo que convierte «tiene el permiso `content_studio`» en «ve estas
 * entradas del menú». Vive acá y no dentro de `AdminLayout` por lo mismo que
 * todo el resto del criterio: el menú lo arma una función de 300 líneas con
 * decenas de `push`, y filtrar ahí a mano dejaría la entrada número treinta
 * fuera del filtro sin que nada avise.
 *
 * ⚠️ ESTO NO ES LA AUTORIZACIÓN. El servidor no enruta por dirección: guarda
 * cada endpoint con `requirePermission`. Este mapa decide qué se PINTA; quien
 * escriba la dirección a mano llega igual a la pantalla y no obtiene ni un
 * dato, porque las peticiones que hace se rechazan una por una.
 */
export const TOOL_ROUTES: Record<string, string[]> = {
    mailbox: ['/admin/email'],
    content_studio: ['/admin/content-studio', '/admin/aniversarios-ia', '/admin/social-hub'],
    media_library: ['/admin/media', '/admin/imagenes-sitio', '/admin/descargas'],
    news: ['/admin/noticias', '/admin/publicaciones'],
    events: ['/admin/eventos', '/admin/eventos-convenciones'],
    contacts: ['/admin/leads', '/admin/crm'],
    email_accounts: ['/admin/email'],
    users: ['/admin/miembros'],
    site_settings: ['/admin/configuracion', '/admin/integraciones', '/admin/imagenes-sitio'],
};

/**
 * Rutas que ve TODA sesión, tenga los permisos que tenga.
 *
 * `/admin/perfil` está acá y no puede no estarlo: es donde se cambia la
 * contraseña temporal, así que dejarla fuera encerraría a un usuario nuevo en
 * un panel vacío sin forma de cumplir lo que se le pide al entrar.
 */
export const ALWAYS_VISIBLE_ROUTES: string[] = ['/admin/perfil'];

/**
 * ¿Se le pinta esta entrada del menú a esta sesión?
 *
 * Sólo acota al usuario institucional: para cualquier rol administrativo
 * devuelve `true` sin mirar el mapa, así que el menú de todos los que ya
 * existían no cambia ni una entrada.
 */
export const canOpenPath = (user: SessionLike | null | undefined, path: string): boolean => {
    if (!isInstitutionalUser(user)) return true;
    const ruta = String(path || '').split('?')[0];
    if (ALWAYS_VISIBLE_ROUTES.some(r => ruta === r || ruta.startsWith(r + '/'))) return true;
    for (const [permiso, rutas] of Object.entries(TOOL_ROUTES)) {
        if (!rutas.some(r => ruta === r || ruta.startsWith(r + '/'))) continue;
        if (can(user, permiso)) return true;
    }
    // Lo que no está en el mapa NO se le pinta. Es el lado seguro: una pantalla
    // nueva que nadie clasificó no debe aparecerle por omisión a quien tiene el
    // acceso más acotado del sistema.
    return false;
};

export const displayNameOf = (profile: Record<string, any> = {}, fallbackEmail = '') => {
    const nombre = [str(profile.firstName, 80), str(profile.lastName, 80)].filter(Boolean).join(' ');
    return nombre || str(profile.name, 160) || lower(fallbackEmail) || 'Usuario';
};

export const initialsOf = (profile: Record<string, any> = {}, fallbackEmail = '') => {
    const nombre = displayNameOf(profile, fallbackEmail);
    const partes = nombre.split(/[\s@.]+/).filter(Boolean);
    const letras = partes.slice(0, 2).map(p => p[0]).join('');
    return (letras || nombre[0] || '?').toUpperCase();
};
