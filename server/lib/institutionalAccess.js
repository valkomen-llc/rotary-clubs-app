// ════════════════════════════════════════════════════════════════════
// Accesos institucionales — EL CRITERIO
// v4.932.0
//
// Una cuenta de correo institucional (`usuario@dominio-del-sitio.org`) puede
// además ser una IDENTIDAD de acceso al panel. Este archivo decide qué puede
// hacer esa identidad, y nada más: es PURO —sin base, sin red, sin IA, sin
// DOM— por el mismo motivo que `seoRules.js` vive aparte de `seoAudit.js` y
// que `ledgerSpec.js` vive aparte de `ledger.js`: un motor de permisos que
// sólo se ejercita contra una base real termina sin pruebas, y entonces nadie
// se entera de que una regla cambió de signo.
//
// ⚠️ NO HAY UNA SEGUNDA AUTENTICACIÓN, y es la decisión de la que cuelga todo
// lo demás. El propietario de una cuenta institucional es una fila de `User`
// como cualquier otra: entra por `authenticatePlatform`, con su bcrypt, su
// audiencia `rotary-platform` y su token de siempre. Lo que este módulo agrega
// es el PERFIL y los PERMISOS de esa fila, no una forma nueva de entrar. Una
// segunda vía de acceso sería un segundo sitio donde equivocarse.
//
// ⚠️ Y NO SE LE AGREGA NI UNA COLUMNA A `User` NI A `EmailAccount`. Los dos se
// consultan con `findMany` **sin `select`** en media plataforma —el login, el
// panel de usuarios, la bandeja—, así que Prisma pide TODAS las columnas del
// esquema y una declarada y todavía inexistente en la base deja esas consultas
// en 500 desde el primer despliegue hasta que alguien corra `db:push` a mano
// (la regla de `logo_intl`, v4.699). Y el `build` no ejecuta `db push` a
// propósito desde el incidente del 2026-07-13, así que ese «hasta que alguien
// lo corra» no tiene fecha. Lo que caería en 500 acá es EL INGRESO. El perfil
// vive en `InstitutionalProfile`, creada en runtime.
// ════════════════════════════════════════════════════════════════════

/**
 * EL CATÁLOGO DE PERMISOS, y es CERRADO.
 *
 * Un permiso que no esté acá no se puede conceder, no se puede guardar y no se
 * puede comprobar: `normalizePermissions` lo descarta y lo REPORTA. Sin esa
 * puerta, un permiso inventado —o uno que sobrevivió a un renombrado— se
 * guardaría en la base y `can()` devolvería `false` para siempre sin que nadie
 * supiera por qué el botón no aparece.
 *
 * `adminOnly` marca los que NO se le pueden dar a un usuario institucional por
 * ninguna vía: son la administración del sitio misma, y concederlos convertiría
 * al usuario en administrador por la puerta de atrás. La comprobación está en
 * `normalizePermissions`, o sea en el servidor y sobre lo que se guarda, no en
 * la pantalla que ofrece las casillas.
 */
export const PERMISSIONS = [
    {
        key: 'mailbox',
        label: 'Bandeja de correo',
        help: 'Ve y responde ÚNICAMENTE su propia cuenta institucional.',
        adminOnly: false,
    },
    {
        key: 'content_studio',
        label: 'Estudio de Contenido',
        help: 'Generador de publicaciones, Reels, Aniversarios IA y las demás herramientas del estudio.',
        adminOnly: false,
    },
    {
        key: 'media_library',
        label: 'Biblioteca multimedia',
        help: 'Sube y organiza los archivos del sitio.',
        adminOnly: false,
    },
    {
        key: 'news',
        label: 'Noticias',
        help: 'Redacta y publica artículos del sitio.',
        adminOnly: false,
    },
    {
        key: 'events',
        label: 'Eventos',
        help: 'Crea y edita los eventos del calendario.',
        adminOnly: false,
    },
    {
        key: 'contacts',
        label: 'Contactos y Leads',
        help: 'Consulta la base de contactos del sitio. Son datos personales de terceros.',
        adminOnly: false,
    },
    // ── De acá para abajo, administración del sitio ──────────────────
    {
        key: 'email_accounts',
        label: 'Administración de cuentas de correo',
        help: 'Crear, editar y eliminar las cuentas institucionales del sitio, y ver su configuración técnica.',
        adminOnly: true,
    },
    {
        key: 'users',
        label: 'Administración de usuarios',
        help: 'Dar y quitar acceso al panel, cambiar roles y restablecer contraseñas de otros.',
        adminOnly: true,
    },
    {
        key: 'site_settings',
        label: 'Configuración del sitio',
        help: 'Identidad, dominio, pagos y ajustes del sitio.',
        adminOnly: true,
    },
];

export const PERMISSION_KEYS = PERMISSIONS.map(p => p.key);

/** Los que nunca puede llevar un usuario institucional. */
export const ADMIN_ONLY_PERMISSIONS = PERMISSIONS.filter(p => p.adminOnly).map(p => p.key);

/** Los que sí puede llevar. Es lo que ofrece la pantalla del alta. */
export const GRANTABLE_PERMISSIONS = PERMISSIONS.filter(p => !p.adminOnly).map(p => p.key);

/**
 * El rol de la tabla `User` que se le asigna a un usuario institucional.
 *
 * Está en `ADMIN_ROLES` (entra al panel) y NO en `SITE_ADMIN_ROLES` (no
 * administra el sitio). Es exactamente la posición de `crm_agent` desde v4.696,
 * y por el mismo motivo: pinta el panel para llegar a sus herramientas, y lo
 * que responde el servidor lo decide el permiso, no el hecho de haber entrado.
 */
export const INSTITUTIONAL_ROLE = 'institutional_user';

/**
 * Los roles de acceso que el alta ofrece.
 *
 * NO es un catálogo nuevo de roles: son los de `User` que ya existen, con el
 * nombre que el administrador entiende y con lo que implica cada uno DICHO.
 * Inventar un tercer sistema de roles sería tener dos verdades sobre lo mismo.
 */
export const ACCESS_ROLES = [
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

/**
 * Roles de `User` que ya traían administración del sitio antes de este módulo.
 * Debe coincidir con `SITE_ADMIN_ROLES` de server/middleware/auth.js: allá
 * decide qué responde una ruta, acá qué permisos se dan por supuestos.
 */
export const ADMINISTRATIVE_ROLES = [
    'administrator', 'superadmin', 'district_admin', 'club_admin', 'editor',
];

/** El operador de la plataforma: alcanza todos los sitios. */
export const PLATFORM_ROLES = ['administrator', 'superadmin'];

/** Permisos con los que nace una cuenta institucional si no se marca ninguno. */
export const DEFAULT_INSTITUTIONAL_PERMISSIONS = ['mailbox'];

export const PASSWORD_MIN = 8;

/** Estados de una identidad institucional. */
export const ACCESS_STATUSES = ['active', 'suspended'];

const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lower = (v) => str(v, 200).toLowerCase();

// ── Quién es quién ───────────────────────────────────────────────────

/** El operador de la plataforma. Alcanza todos los sitios. */
export const isPlatformOperator = (user) => PLATFORM_ROLES.includes(str(user?.role, 40));

/**
 * Administra ESTE sitio: sus cuentas, sus usuarios, su configuración.
 *
 * Se decide por ROL y no por la lista de permisos a propósito: los roles
 * administrativos existían antes que este módulo y ninguno tiene fila en
 * `InstitutionalProfile`. Deducir sus permisos de una tabla vacía los habría
 * dejado sin nada el día del despliegue — que es exactamente la clase de fallo
 * silencioso que este proyecto documenta una y otra vez.
 */
export const isSiteAdministrator = (user) => ADMINISTRATIVE_ROLES.includes(str(user?.role, 40));

/** Es una identidad institucional: entra al panel, no lo administra. */
export const isInstitutionalUser = (user) => str(user?.role, 40) === INSTITUTIONAL_ROLE;

/**
 * ¿Puede esta sesión hacer esto?
 *
 * ⚠️ ES EL ÚNICO PUNTO DE DECISIÓN, y tiene que serlo. Con la comprobación
 * escrita a mano en cada ruta y otra vez en cada pantalla, la número once se
 * escribe mal y el fallo es MUDO: la ruta responde de más y nadie lo ve hasta
 * que alguien lo aprovecha. Lo consumen el middleware del servidor y el menú
 * del panel, y su espejo del navegador se compara por SALIDAS en las pruebas.
 *
 * Un administrador del sitio tiene TODO sobre su sitio: no se le pide fila de
 * permisos, porque su rol ya es la concesión. Un usuario institucional tiene
 * exactamente lo que su fila enumera, y nunca un permiso `adminOnly`.
 */
export const can = (user, permission) => {
    const key = str(permission, 40);
    if (!key || !PERMISSION_KEYS.includes(key)) return false;
    if (isPlatformOperator(user)) return true;
    if (isSiteAdministrator(user)) return true;
    if (!isInstitutionalUser(user)) return false;
    // Un permiso administrativo no se concede por esta vía ni aunque esté
    // escrito en la fila: `normalizePermissions` ya lo descarta al guardar, y
    // esta segunda comprobación cubre las filas escritas antes de que la
    // primera existiera.
    if (ADMIN_ONLY_PERMISSIONS.includes(key)) return false;
    const granted = Array.isArray(user?.permissions) ? user.permissions : [];
    return granted.includes(key);
};

/**
 * Los permisos EFECTIVOS de una sesión, para pintar el menú.
 *
 * Se derivan de `can()` en vez de leerse de la fila: con dos criterios, el menú
 * ofrecería una herramienta que la ruta rechaza —o escondería una a la que sí
 * se llega escribiendo la dirección—.
 */
export const effectivePermissions = (user) => PERMISSION_KEYS.filter(k => can(user, k));

// ── Normalización ────────────────────────────────────────────────────

/**
 * Deja la lista de permisos en su forma canónica y DICE lo que descartó.
 *
 * `descartados` no es decorativo: un permiso que se pide y no se concede tiene
 * que verse, o el administrador marca la casilla, guarda, y no entiende por qué
 * el usuario sigue sin ver la herramienta. Misma regla que `skipped` en los
 * centros de acopio y que los avisos del panel de tarifas.
 */
export const normalizePermissions = (input, role = INSTITUTIONAL_ROLE) => {
    const pedidos = Array.isArray(input) ? input.map(v => str(v, 40)).filter(Boolean) : [];
    const vistos = new Set();
    const concedidos = [];
    const descartados = [];

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

    // Un administrador del sitio no lleva lista: su rol ya es la concesión, y
    // guardarle una daría dos verdades que se contradirían en cuanto alguien
    // agregue un permiso al catálogo.
    if (role !== INSTITUTIONAL_ROLE) return { permissions: [], descartados };

    return {
        permissions: concedidos.length ? concedidos : [...DEFAULT_INSTITUTIONAL_PERMISSIONS],
        descartados,
    };
};

/** La parte local de una dirección: lo que va antes de la arroba. */
export const localPartOf = (value) =>
    lower(value).split('@')[0].replace(/[^a-z0-9._-]/g, '');

/**
 * Compone la dirección institucional.
 *
 * El dominio lo pone el SERVIDOR desde el sitio, nunca el navegador: si viajara
 * en la petición, cualquiera con el endpoint crearía una cuenta —y con ella un
 * usuario— en el dominio de otro sitio.
 */
export const buildInstitutionalEmail = (local, domain) => {
    const user = localPartOf(local);
    const host = lower(domain).replace(/^www\./, '').replace(/^@/, '');
    if (!user || !host) return null;
    return `${user}@${host}`;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (value) => EMAIL_RE.test(lower(value));

// ── Validación del alta ──────────────────────────────────────────────

/**
 * Comprueba lo que llega del formulario. El administrador escribe, el CÓDIGO
 * decide — la misma regla que `templateComposer.js` y `validateEmergencyCopy`.
 *
 * Separa `errors` de `warnings` a propósito: los primeros impiden crear, los
 * segundos se dicen y se sigue. Tratarlos igual convierte cualquier
 * observación en un bloqueo y se dejan de leer (regla del panel de tarifas).
 *
 * ⚠️ Devuelve TODOS los errores, no el primero: «datos inválidos» a secas
 * obliga a probar campo por campo.
 */
export const validateAccountPayload = (input = {}, { domain = '', requireAccess = null } = {}) => {
    const errors = [];
    const warnings = [];

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
    // La confirmación sólo se exige si vino: el endpoint la pide siempre desde
    // la pantalla, pero un cliente antiguo que mande sólo `password` sigue
    // creando la cuenta —regla aditiva— y se le avisa.
    if (confirm) {
        if (password !== confirm) errors.push('Las dos contraseñas no coinciden.');
    } else if (password) {
        warnings.push('Se creó sin confirmar la contraseña: comprueba que sea la que querías.');
    }

    const firstName = str(input.firstName, 80);
    const lastName = str(input.lastName, 80);
    const position = str(input.position, 120);

    if (grantAccess) {
        // El nombre sólo se exige cuando la cuenta va a ser una IDENTIDAD: una
        // cuenta de buzón suelta —contacto@, info@— no tiene una persona detrás
        // y pedírsela sería inventar un dato.
        if (!firstName) errors.push('Escribe el nombre del propietario.');
        if (!lastName) warnings.push('Sin apellido, el usuario aparecerá sólo con su nombre.');
    }

    const role = str(input.role, 40) || INSTITUTIONAL_ROLE;
    if (grantAccess && !ACCESS_ROLE_KEYS.includes(role)) {
        errors.push('Ese rol de acceso no existe.');
    }

    const { permissions, descartados } = normalizePermissions(
        input.permissions,
        ACCESS_ROLE_KEYS.includes(role) ? role : INSTITUTIONAL_ROLE
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
            // Una contraseña que escribió el administrador es TEMPORAL por
            // omisión: la conoce alguien que no es su dueño. En el primer
            // ingreso se pide cambiarla. Quien la quiera permanente lo dice
            // expresamente; el valor por omisión es el seguro.
            temporaryPassword: input.temporaryPassword !== false,
        },
    };
};

// ── Alcance de los buzones ───────────────────────────────────────────

/**
 * QUÉ CUENTAS DE CORREO PUEDE VER ESTA SESIÓN.
 *
 * ⚠️ Es la regla central del pedido y la que decide sola el aislamiento: quien
 * tiene `secretaria@dominio.org` ve SU buzón y ninguno más. No es que se le
 * escondan los otros en la pantalla —esconder un control no protege un
 * endpoint de quien lo conoce (v4.868)—: esta función la consume el
 * controlador para armar el `WHERE`, y la pantalla sólo pinta lo que le llega.
 *
 * Devuelve `null` cuando NO hay restricción (administrador), y una lista de
 * direcciones cuando sí. `[]` es distinto de `null`: significa «tiene
 * restricción y no le corresponde ninguna cuenta», o sea que no ve nada — que
 * es lo correcto para un usuario institucional al que todavía no se le ató su
 * buzón.
 */
export const mailboxScopeFor = (user) => {
    if (isPlatformOperator(user) || isSiteAdministrator(user)) return null;
    const propio = lower(user?.mailbox || user?.email);
    return propio && isEmail(propio) ? [propio] : [];
};

/** ¿Puede esta sesión abrir el buzón de esta dirección? */
export const canUseMailbox = (user, address) => {
    const scope = mailboxScopeFor(user);
    if (scope === null) return true;
    return scope.includes(lower(address));
};

/**
 * ¿Puede administrar las cuentas del sitio? Es lo que enciende la pestaña
 * «Cuentas», el alta, el borrado y la configuración técnica del dominio.
 */
export const canManageMailAccounts = (user) => can(user, 'email_accounts');

// ── Presentación ─────────────────────────────────────────────────────

/** El nombre para mostrar. Sin datos, el correo — nunca un hueco. */
export const displayNameOf = (profile = {}, fallbackEmail = '') => {
    const nombre = [str(profile.firstName, 80), str(profile.lastName, 80)].filter(Boolean).join(' ');
    return nombre || str(profile.name, 160) || lower(fallbackEmail) || 'Usuario';
};

/** Las iniciales del avatar cuando no hay fotografía cargada. */
export const initialsOf = (profile = {}, fallbackEmail = '') => {
    const nombre = displayNameOf(profile, fallbackEmail);
    const partes = nombre.split(/[\s@.]+/).filter(Boolean);
    const letras = partes.slice(0, 2).map(p => p[0]).join('');
    return (letras || nombre[0] || '?').toUpperCase();
};

// ── El dominio de correo del sitio ───────────────────────────────────

/**
 * Hosts de la PLATAFORMA. Nunca son el dominio de correo de un sitio.
 *
 * `club.subdomain` compone `mi-sitio.clubplatform.org`, que sirve para ALCANZAR
 * el panel y no es un dominio que el sitio pueda verificar en el proveedor de
 * correo: una dirección ahí no recibiría nada. Componerla igual es lo que
 * produjo el defecto que abrió v4.933 — el modal ofrecía
 * `@distrito-4281-de-rotary-international…` en un sitio cuyo correo vive en
 * `@rotary4281.org`.
 */
export const PLATFORM_MAIL_HOSTS = ['clubplatform.org', 'localhost', 'vercel.app'];

/** ¿Es un host de la plataforma —o un subdominio suyo— en vez del del sitio? */
export const isPlatformHost = (host) => {
    const h = lower(host).replace(/^www\./, '');
    if (!h) return true;
    return PLATFORM_MAIL_HOSTS.some(p => h === p || h.endsWith('.' + p));
};

/** Deja un host en su forma canónica: minúsculas, sin `www.`, sin ruta ni puerto. */
export const apexOf = (value) => {
    const h = lower(value)
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split(':')[0]
        .replace(/^www\./, '');
    return h && h.includes('.') ? h : '';
};

/**
 * ⚠️ EN QUÉ DOMINIO SE CREA UNA DIRECCIÓN INSTITUCIONAL.
 *
 * Es una cascada y el orden está pensado, no es el que salía más cómodo:
 *
 *   1. **El dominio propio del SITIO, con conciencia de distrito.** Un distrito
 *      existe DOS VECES —la fila de `District`, que es donde vive su dominio
 *      propio, y la de `Club`, que es el sitio— y el dominio NO se duplica
 *      entre las dos: se RESUELVE al leer (v4.744). Mirar sólo `Club.domain`
 *      es exactamente el defecto reportado.
 *
 *   2. **El dominio que YA usan las cuentas del sitio.** Es la evidencia más
 *      fuerte que tenemos de qué dominio está VERIFICADO en el proveedor: si
 *      `dyazo@rotary4281.org` recibe correo, ése es el dominio de correo de
 *      este sitio. Es el mismo criterio con el que `getEmailDiagnostics`
 *      deriva los dominios que le pregunta a Resend — no un segundo criterio.
 *
 *   3. Nada. Y entonces NO se inventa uno: se dice que falta, con su causa.
 *
 * ⚠️ Un host de la plataforma se descarta en TODOS los escalones. Un
 * `sub.clubplatform.org` no se puede verificar como dominio de correo del
 * sitio, así que ofrecerlo daría una dirección que no recibe nada — y eso no
 * falla ruidosamente: falla el día que alguien le escriba.
 *
 * Devuelve también de DÓNDE salió: sin eso, «¿por qué me ofrece este dominio?»
 * no tiene dónde mirarse, que es justo lo que costó diagnosticar el reporte.
 */
export const resolveMailDomain = ({
    clubDomain = null,
    districtDomain = null,
    accountDomains = [],
    isDistrictSite = false,
} = {}) => {
    const candidatos = [];

    // El del distrito va PRIMERO cuando el sitio es de un distrito: es donde
    // vive su dominio propio y lo que el visitante escribe en la barra.
    if (isDistrictSite) candidatos.push({ host: apexOf(districtDomain), source: 'district' });
    candidatos.push({ host: apexOf(clubDomain), source: 'club' });
    if (!isDistrictSite) candidatos.push({ host: apexOf(districtDomain), source: 'district' });

    // Las cuentas ya existentes, por orden de aparición: la primera es la más
    // antigua, que es la que más tiempo lleva funcionando.
    const vistos = new Set();
    for (const dir of Array.isArray(accountDomains) ? accountDomains : []) {
        const host = apexOf(String(dir || '').includes('@') ? String(dir).split('@')[1] : dir);
        if (!host || vistos.has(host)) continue;
        vistos.add(host);
        candidatos.push({ host, source: 'accounts' });
    }

    // Se recorren TODOS los candidatos aunque el primero sirva: `descartados`
    // tiene que poder contestar «¿por qué no usó el dominio del club?», y si el
    // recorrido cortara al encontrar el bueno, el host de la plataforma que se
    // descartó no aparecería en ninguna parte — que es justo el dato que faltó
    // para diagnosticar el reporte.
    const descartados = [];
    let elegido = null;
    for (const c of candidatos) {
        if (!c.host) continue;
        if (isPlatformHost(c.host)) {
            descartados.push({ host: c.host, source: c.source, motivo: 'es un host de la plataforma, no un dominio del sitio' });
            continue;
        }
        if (!elegido) elegido = c;
    }
    if (elegido) return { domain: elegido.host, source: elegido.source, descartados };

    return {
        domain: null,
        source: null,
        descartados,
        reason: descartados.length
            ? 'Este sitio sólo tiene una dirección de la plataforma. Conecta su dominio propio para poder crear direcciones institucionales.'
            : 'Este sitio todavía no tiene un dominio propio configurado, así que no se pueden crear direcciones institucionales.',
    };
};

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
export const TOOL_ROUTES = {
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
export const ALWAYS_VISIBLE_ROUTES = ['/admin/perfil'];

/**
 * ¿Se le pinta esta entrada del menú a esta sesión?
 *
 * Sólo acota al usuario institucional: para cualquier rol administrativo
 * devuelve `true` sin mirar el mapa, así que el menú de todos los que ya
 * existían no cambia ni una entrada.
 */
export const canOpenPath = (user, path) => {
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

/**
 * LOS EVENTOS QUE SE AUDITAN, y es un catálogo cerrado por lo mismo que el de
 * permisos: un evento inventado no se puede reportar ni filtrar.
 *
 * ⚠️ NINGUNO GUARDA LA CONTRASEÑA, ni el hash, ni el token de recuperación. Lo
 * que se anota es QUÉ pasó y QUIÉN lo hizo. Un registro de auditoría que copia
 * el secreto convierte la traza en una segunda filtración.
 */
export const AUDIT_EVENTS = {
    account_created: 'Cuenta institucional creada',
    owner_assigned: 'Propietario asignado',
    access_granted: 'Acceso al panel habilitado',
    access_revoked: 'Acceso al panel retirado',
    role_changed: 'Rol modificado',
    permissions_changed: 'Permisos modificados',
    password_reset: 'Contraseña restablecida',
    password_changed: 'Contraseña cambiada por su dueño',
    account_suspended: 'Cuenta suspendida',
    account_restored: 'Cuenta reactivada',
    profile_updated: 'Perfil actualizado',
    login_ok: 'Inicio de sesión',
    login_failed: 'Intento de acceso fallido',
    login_blocked: 'Acceso bloqueado',
    instructions_sent: 'Instrucciones de acceso enviadas',
};

export const AUDIT_EVENT_KEYS = Object.keys(AUDIT_EVENTS);

export default {
    PERMISSIONS, PERMISSION_KEYS, ADMIN_ONLY_PERMISSIONS, GRANTABLE_PERMISSIONS,
    ACCESS_ROLES, ACCESS_ROLE_KEYS, INSTITUTIONAL_ROLE, ADMINISTRATIVE_ROLES,
    PLATFORM_ROLES, DEFAULT_INSTITUTIONAL_PERMISSIONS, PASSWORD_MIN, ACCESS_STATUSES,
    isPlatformOperator, isSiteAdministrator, isInstitutionalUser,
    can, effectivePermissions, normalizePermissions,
    localPartOf, buildInstitutionalEmail, isEmail, validateAccountPayload,
    mailboxScopeFor, canUseMailbox, canManageMailAccounts,
    displayNameOf, initialsOf, AUDIT_EVENTS, AUDIT_EVENT_KEYS,
    TOOL_ROUTES, ALWAYS_VISIBLE_ROUTES, canOpenPath,
    PLATFORM_MAIL_HOSTS, isPlatformHost, apexOf, resolveMailDomain,
};
