// ════════════════════════════════════════════════════════════════════
// RBAC multi-tenant — EL CRITERIO
// v4.937.0
//
// Sitio → Usuario → Rol → Permisos → Módulo/acción. Este archivo es la única
// autoridad sobre qué significa cada permiso, qué implica cada rol y qué puede
// conceder quién. Es PURO —sin base, sin red, sin IA, sin DOM— por el mismo
// motivo que `institutionalAccess.js`, `seoRules.js` y `ledgerSpec.js`: un
// motor de autorización que sólo se ejercita contra una base real termina sin
// pruebas, y entonces nadie se entera de que una regla cambió de signo.
//
// ⚠️ NO ES UN SEGUNDO SISTEMA DE AUTORIZACIÓN: ES LA GRANULARIDAD DEL QUE YA
// HABÍA. `institutionalAccess.js` (v4.932) ya trae el catálogo cerrado, `can()`,
// `requirePermission` y la auditoría, y sigue siendo la puerta. Lo que se
// agrega acá es partir cada herramienta en ACCIONES —ver, crear, editar,
// publicar, eliminar, administrar— y poder agruparlas en roles con nombre.
// El puente en los dos sentidos es `LEGACY_PERMISSION_MAP` / `legacyKeysFor`:
// un permiso viejo escrito en `InstitutionalProfile.permissions` se expande a
// su conjunto nuevo al leer, y una comprobación vieja (`can(u, 'users')`) se
// sigue contestando. Sin ese puente, desplegar esto dejaría sin herramientas a
// toda cuenta institucional existente — en silencio, que es como fallan las
// cosas en este repositorio.
//
// ⚠️ Y NO SE HARDCODEA `if (role === 'editor')` EN NINGUNA PARTE. Un rol es un
// CONJUNTO DE PERMISOS y nada más; quien decide siempre es `hasPermission`.
// Es la misma razón por la que `can()` es el único punto de decisión: escrita
// a mano en cada pantalla, la comprobación número once se escribe mal y el
// fallo es MUDO — la ruta responde de más y nadie lo ve hasta que alguien lo
// aprovecha.
// ════════════════════════════════════════════════════════════════════

// ── Las acciones ─────────────────────────────────────────────────────

/**
 * EL CATÁLOGO DE ACCIONES, y es CERRADO.
 *
 * `rank` ordena las columnas de la matriz del panel: sin un orden declarado,
 * dos módulos pintarían sus casillas en distinto orden y la matriz dejaría de
 * poder leerse de un vistazo, que es lo único que una matriz aporta.
 *
 * `scoped` marca las acciones que además existen en su variante «propio»
 * (`edit_own`). No todas la tienen: «ver» un listado propio tiene sentido para
 * un autor, «administrar lo propio» no significa nada.
 */
export const ACTIONS = [
    { key: 'view', label: 'Ver', rank: 1, scoped: true, help: 'Abrir el módulo y consultar su contenido.' },
    { key: 'create', label: 'Crear', rank: 2, scoped: false, help: 'Dar de alta contenido nuevo.' },
    { key: 'edit', label: 'Editar', rank: 3, scoped: true, help: 'Modificar contenido existente.' },
    { key: 'delete', label: 'Eliminar', rank: 4, scoped: true, help: 'Borrar contenido. No se deshace.' },
    { key: 'publish', label: 'Publicar', rank: 5, scoped: false, help: 'Poner al aire lo que ya existe. Sin esto, el contenido queda en borrador.' },
    { key: 'export', label: 'Exportar', rank: 6, scoped: false, help: 'Descargar los datos del módulo.' },
    { key: 'manage', label: 'Administrar', rank: 7, scoped: false, help: 'Configurar el módulo entero. Implica todas las demás acciones.' },
];

export const ACTION_KEYS = ACTIONS.map(a => a.key);
const ACTION_BY_KEY = new Map(ACTIONS.map(a => [a.key, a]));

/** El sufijo que marca el alcance «sólo lo propio». */
export const OWN_SUFFIX = '_own';

/** Las acciones que existen además en su variante propia. */
export const SCOPED_ACTIONS = ACTIONS.filter(a => a.scoped).map(a => a.key);

/** Todas las formas válidas de una acción: `edit` y `edit_own`. */
export const ALL_ACTION_FORMS = ACTIONS.flatMap(a => (a.scoped ? [a.key, a.key + OWN_SUFFIX] : [a.key]));

// ── Los módulos ──────────────────────────────────────────────────────

/**
 * EL REGISTRO DE MÓDULOS.
 *
 * ⚠️ ES DATOS, NO CÓDIGO, y de eso depende el criterio de aceptación del
 * pedido: «cualquier nuevo módulo puede integrarse al sistema de permisos sin
 * reconstruir la autorización». Agregar un módulo es agregar una entrada acá
 * —con sus acciones y sus rutas— y nada más: ni el guardia, ni la matriz del
 * panel, ni la barra lateral, ni el modelo de datos se tocan.
 *
 * Campos:
 *   · `key`      identidad del módulo. Es la primera mitad de cada permiso.
 *   · `group`    dónde se agrupa en la matriz. Sin agrupar, treinta módulos en
 *                una tabla plana no se pueden configurar.
 *   · `actions`  QUÉ acciones existen para este módulo. No todas para todos:
 *                ofrecer «publicar» en la Biblioteca Multimedia sería una
 *                casilla que no hace nada (regla de v4.650).
 *   · `routes`   las rutas del panel que abre. Es lo que convierte un permiso
 *                en entradas del menú.
 *   · `legacy`   el permiso de `institutionalAccess.js` que lo cubría. Es el
 *                puente de migración; `null` si el módulo es nuevo.
 *   · `scope`    'site' o 'platform'. Un módulo de plataforma NO se le puede
 *                conceder a nadie que no sea operador, por ninguna vía.
 *   · `sensitive` el módulo ES la administración: concederlo convierte a quien
 *                lo recibe en administrador por la puerta de atrás, así que
 *                sólo lo concede quien ya lo tiene.
 */
export const MODULES = [
    // ── Panel y analítica ────────────────────────────────────────────
    {
        key: 'dashboard', label: 'Panel principal', group: 'Panel', scope: 'site',
        actions: ['view'], routes: ['/admin/dashboard'], legacy: null,
        help: 'La pantalla de inicio del panel con el resumen del sitio.',
    },
    {
        key: 'analytics', label: 'Analíticas', group: 'Panel', scope: 'site',
        actions: ['view', 'export'], routes: ['/admin/analytics'], legacy: null,
        help: 'Estadísticas de visitas y comportamiento del sitio.',
    },
    {
        key: 'seo', label: 'SEO Inteligente', group: 'Panel', scope: 'site',
        actions: ['view', 'edit', 'manage'], routes: ['/admin/seo'], legacy: null,
        help: 'Auditoría, metadatos y configuración de posicionamiento.',
    },
    {
        key: 'intelligence', label: 'Centro de Inteligencia', group: 'Panel', scope: 'site',
        actions: ['view', 'manage'], routes: ['/admin/inteligencia', '/admin/district-iq'], legacy: null,
        help: 'Herramientas de análisis y recomendaciones del sitio.',
    },
    {
        key: 'reports', label: 'Informes Ejecutivos', group: 'Panel', scope: 'site',
        actions: ['view', 'export'], routes: ['/admin/informes-ejecutivos'], legacy: null,
        help: 'Informes consolidados para la junta directiva.',
    },

    // ── Contenido ────────────────────────────────────────────────────
    {
        key: 'content_studio', label: 'Estudio de Contenido', group: 'Contenido', scope: 'site',
        actions: ['view', 'create', 'edit', 'edit_own', 'delete', 'delete_own', 'publish'],
        routes: ['/admin/content-studio', '/admin/aniversarios-ia'],
        legacy: 'content_studio',
        help: 'Generador de publicaciones, Reels, Aniversarios IA y las demás herramientas del estudio.',
    },
    {
        key: 'news', label: 'Noticias', group: 'Contenido', scope: 'site',
        actions: ['view', 'create', 'edit', 'edit_own', 'delete', 'delete_own', 'publish'],
        routes: ['/admin/noticias'], legacy: 'news',
        help: 'Artículos y noticias del sitio.',
    },
    {
        key: 'publications', label: 'Publicaciones / Difusión', group: 'Contenido', scope: 'site',
        actions: ['view', 'create', 'edit', 'edit_own', 'delete', 'publish'],
        routes: ['/admin/publicaciones'], legacy: 'news',
        help: 'Publicaciones centralizadas que se difunden a varios sitios.',
    },
    {
        key: 'events', label: 'Eventos', group: 'Contenido', scope: 'site',
        actions: ['view', 'create', 'edit', 'edit_own', 'delete', 'publish'],
        routes: ['/admin/eventos'], legacy: 'events',
        help: 'Calendario, fichas y registro de eventos del sitio.',
    },
    {
        key: 'projects', label: 'Proyectos', group: 'Contenido', scope: 'site',
        actions: ['view', 'create', 'edit', 'edit_own', 'delete', 'publish', 'manage'],
        // `/admin/postulaciones-pagos` es OTRA cosa: las postulaciones y los
        // pagos de la Feria de Proyectos, con su propio flujo y su propio
        // dinero. Estaba acá y hacía que «puede ver los proyectos del sitio»
        // abriera también la administración de la convocatoria.
        routes: ['/admin/proyectos'], legacy: null,
        help: 'Proyectos del sitio y su postulación.',
    },
    {
        key: 'media', label: 'Biblioteca Multimedia', group: 'Contenido', scope: 'site',
        actions: ['view', 'create', 'edit', 'delete'],
        routes: ['/admin/media', '/admin/imagenes-sitio'], legacy: 'media_library',
        help: 'Archivos del sitio: subir, organizar en carpetas, recortar y eliminar.',
    },
    {
        key: 'downloads', label: 'Centro de Descargas', group: 'Contenido', scope: 'site',
        actions: ['view', 'create', 'edit', 'delete'], routes: ['/admin/descargas'], legacy: 'media_library',
        help: 'Documentos públicos que el sitio ofrece para descargar.',
    },
    {
        key: 'members', label: 'Socios y Junta Directiva', group: 'Contenido', scope: 'site',
        actions: ['view', 'create', 'edit', 'delete'],
        routes: ['/admin/miembros'], legacy: null,
        help: 'El directorio de socios y la composición de la junta directiva.',
    },
    {
        // ⚠️ `/admin/maneras-de-contribuir` no estaba en NINGÚN módulo, así que
        // era una pantalla que nadie clasificó: invisible por omisión para todo
        // acceso acotado. Es la regla del propio registro —al registrar un
        // módulo, sumar sus rutas— aplicada al revés.
        key: 'contributions', label: 'Aportes y formas de contribuir', group: 'Contenido', scope: 'site',
        actions: ['view', 'edit', 'manage'],
        routes: ['/admin/bloques-pago', '/admin/maneras-de-contribuir'], legacy: null,
        help: 'Los bloques de pago de la página de aportes y los textos de «Maneras de Contribuir».',
    },
    {
        key: 'faqs', label: 'Preguntas Frecuentes', group: 'Contenido', scope: 'site',
        actions: ['view', 'create', 'edit', 'delete', 'publish'], routes: ['/admin/faqs'], legacy: null,
        help: 'El listado de preguntas frecuentes de la página pública.',
    },

    // ── Comunicación ─────────────────────────────────────────────────
    {
        key: 'email_inbox', label: 'Bandeja de Entrada', group: 'Comunicación', scope: 'site',
        // ⚠️ Sus acciones NO son las genéricas, y es exactamente el punto 9 del
        // pedido: `use_own` abre SU cuenta institucional y ninguna más;
        // `use_all` abre las de todo el sitio. Modelarlo con `view`/`view_own`
        // habría dejado la lectura de correo ajeno a un `view` de más.
        actions: ['use_own', 'use_all'], routes: ['/admin/email'], legacy: 'mailbox',
        help: 'Leer y responder correo institucional.',
    },
    {
        key: 'email_accounts', label: 'Cuentas de correo', group: 'Comunicación', scope: 'site',
        actions: ['view', 'create', 'edit', 'delete'], routes: ['/admin/email'],
        legacy: 'email_accounts', sensitive: true,
        help: 'Crear, editar y eliminar las cuentas institucionales del sitio.',
    },
    {
        key: 'contacts', label: 'Contactos & Leads', group: 'Comunicación', scope: 'site',
        actions: ['view', 'create', 'edit', 'delete', 'export'],
        routes: ['/admin/leads'], legacy: 'contacts',
        help: 'La base de contactos del sitio. Son datos personales de terceros.',
    },
    {
        key: 'crm', label: 'Comunicaciones CRM', group: 'Comunicación', scope: 'site',
        actions: ['view', 'create', 'edit', 'manage'],
        routes: ['/admin/crm', '/admin/whatsapp-qr'], legacy: 'contacts',
        help: 'WhatsApp, recorridos, plantillas y la bandeja de conversaciones.',
    },
    {
        key: 'social', label: 'Hub Social', group: 'Comunicación', scope: 'site',
        actions: ['view', 'create', 'publish', 'manage'], routes: ['/admin/social-hub'], legacy: 'content_studio',
        help: 'Cuentas sociales conectadas y distribución de publicaciones.',
    },
    {
        key: 'email_marketing', label: 'Email Marketing', group: 'Comunicación', scope: 'site',
        actions: ['view', 'create', 'edit', 'publish'], routes: ['/admin/email-marketing'], legacy: null,
        help: 'Campañas de correo hacia la base de contactos.',
    },

    // ── Administración del sitio ─────────────────────────────────────
    {
        key: 'users', label: 'Usuarios', group: 'Administración', scope: 'site',
        actions: ['view', 'create', 'edit', 'delete', 'manage'],
        // ⚠️ `/admin/miembros` YA NO ESTÁ ACÁ (v4.941). El directorio de socios
        // es CONTENIDO del sitio —quién es la junta, quién es socio— y estaba
        // bajo el módulo que da y quita el acceso al panel: para que un usuario
        // institucional pudiera mantener el directorio había que concederle la
        // administración de usuarios entera. Nadie pierde nada al separarlo:
        // `SITE_ADMIN_PERMISSIONS` se deriva de `SITE_MODULES`, así que un
        // administrador de sitio recibe el módulo nuevo automáticamente.
        routes: ['/admin/usuarios-permisos'], legacy: 'users', sensitive: true,
        help: 'Dar y quitar acceso al panel, cambiar roles, suspender y restablecer contraseñas.',
    },
    {
        key: 'roles', label: 'Roles y permisos', group: 'Administración', scope: 'site',
        actions: ['view', 'manage'], routes: ['/admin/usuarios-permisos'], legacy: 'users', sensitive: true,
        help: 'Crear roles, editar su matriz de permisos y asignarlos.',
    },
    {
        key: 'settings', label: 'Configuración del sitio', group: 'Administración', scope: 'site',
        actions: ['view', 'edit', 'manage'],
        routes: ['/admin/configuracion', '/admin/sistema-footer'], legacy: 'site_settings', sensitive: true,
        help: 'Identidad, dominio, secciones y ajustes del sitio.',
    },
    {
        key: 'integrations', label: 'Integraciones', group: 'Administración', scope: 'site',
        actions: ['view', 'manage'],
        routes: ['/admin/integraciones', '/admin/traducciones', '/admin/agentes'],
        legacy: 'site_settings', sensitive: true,
        help: 'Credenciales, métodos de pago, modelos de IA y traducción.',
    },
    {
        key: 'finance', label: 'Finanzas', group: 'Administración', scope: 'site',
        actions: ['view', 'export', 'manage'],
        // `/admin/bloques-pago` pasó a `contributions`: configurar QUÉ se cobra
        // es contenido de la página de aportes, no la tesorería. Un
        // administrador de sitio conserva los dos, así que nadie pierde nada.
        // ⚠️ `finance` ES LA BÓVEDA (v4.941). Las órdenes se fueron a `store`
        // —su pantalla vive en E-commerce— y los estados financieros a
        // `compliance`. Con las tres juntas, conceder «ver el saldo» abría
        // también la contabilidad y el histórico de pedidos: tres pantallas
        // distintas detrás de un permiso que dice una sola cosa.
        routes: ['/admin/boveda'],
        legacy: null, sensitive: true,
        help: 'La Bóveda de Fondos: saldo, aportes recibidos y retiros.',
    },
    {
        key: 'compliance', label: 'Estados Financieros', group: 'Administración', scope: 'site',
        actions: ['view', 'export'], routes: ['/admin/estados-financieros'], legacy: null, sensitive: true,
        help: 'La contabilidad declarada del sitio. Su pantalla depende además del módulo DIAN.',
    },
    {
        key: 'project_fair', label: 'Postulación de Proyectos', group: 'Contenido', scope: 'site',
        actions: ['view', 'edit', 'manage'], routes: ['/admin/postulaciones-pagos'], legacy: null,
        help: 'Las postulaciones y los pagos de la Feria de Proyectos.',
    },
    {
        key: 'investment', label: 'Mi Inversión', group: 'Administración', scope: 'site',
        actions: ['view'],
        routes: ['/admin/inversion'], legacy: null,
        help: 'El seguimiento de la inversión del sitio en la plataforma. Sólo lectura.',
    },
    {
        key: 'store', label: 'Tienda', group: 'Administración', scope: 'site',
        actions: ['view', 'create', 'edit', 'delete', 'manage'],
        routes: ['/admin/tienda', '/admin/ordenes'], legacy: null,
        help: 'Catálogo de productos del sitio y las órdenes de compra.',
    },
    {
        key: 'audit', label: 'Registro de auditoría', group: 'Administración', scope: 'site',
        actions: ['view', 'export'], routes: ['/admin/usuarios-permisos'], legacy: 'users', sensitive: true,
        help: 'Quién hizo qué y cuándo sobre los accesos del sitio.',
    },

    // ── Plataforma ───────────────────────────────────────────────────
    //
    // ⚠️ `scope: 'platform'` NO es una etiqueta decorativa: `filterGrantable`
    // descarta estos permisos para cualquiera que no sea operador, así que un
    // administrador de sitio no puede concedérselos ni concedérselos a otro
    // aunque escriba la petición a mano. Es el punto 12 del pedido.
    {
        key: 'platform_sites', label: 'Sitios del ecosistema', group: 'Plataforma', scope: 'platform',
        actions: ['view', 'create', 'edit', 'delete', 'manage'],
        routes: [
            '/admin/distritos', '/admin/clubes', '/admin/asociaciones', '/admin/zonas',
            '/admin/programas-intercambio', '/admin/ferias-proyectos', '/admin/eventos-convenciones',
        ],
        legacy: null, sensitive: true,
        help: 'Alta y administración de los sitios alojados en Club Platform.',
    },
    {
        key: 'platform_users', label: 'Usuarios de plataforma', group: 'Plataforma', scope: 'platform',
        actions: ['view', 'create', 'edit', 'delete', 'manage'], routes: ['/admin/usuarios'],
        legacy: null, sensitive: true,
        help: 'Los superadministradores y operadores de Club Platform.',
    },
    {
        key: 'platform_global', label: 'Contenido global', group: 'Plataforma', scope: 'platform',
        actions: ['view', 'create', 'edit', 'delete', 'publish', 'manage'],
        routes: [
            '/admin/donaciones', '/admin/campanas-contribucion', '/admin/slider-global',
            '/admin/notificaciones-aportes', '/admin/system-updates', '/admin/mission-control-vip',
        ],
        legacy: null, sensitive: true,
        help: 'Campañas, slider y avisos que alcanzan a varios sitios a la vez.',
    },
];

export const MODULE_KEYS = MODULES.map(m => m.key);
const MODULE_BY_KEY = new Map(MODULES.map(m => [m.key, m]));

export const moduleOf = (key) => MODULE_BY_KEY.get(String(key || '')) || null;

/** Los módulos de un sitio. Los de plataforma no salen en la matriz de un sitio. */
export const SITE_MODULES = MODULES.filter(m => m.scope !== 'platform');
export const PLATFORM_MODULES = MODULES.filter(m => m.scope === 'platform');

/** Los grupos en el orden en que se pintan. Sale del registro, no de una segunda lista. */
export const MODULE_GROUPS = MODULES.reduce((acc, m) => (acc.includes(m.group) ? acc : [...acc, m.group]), []);

// ── Los permisos ─────────────────────────────────────────────────────

const str = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** `news` + `edit_own` → `news.edit_own`. */
export const permissionKey = (moduleKey, action) => `${str(moduleKey, 40)}.${str(action, 40)}`;

/** Parte un permiso. Devuelve `null` si no tiene la forma módulo.acción. */
export const parsePermission = (permission) => {
    const raw = str(permission, 120);
    const punto = raw.indexOf('.');
    if (punto <= 0 || punto === raw.length - 1) return null;
    const moduleKey = raw.slice(0, punto);
    const action = raw.slice(punto + 1);
    if (!MODULE_BY_KEY.has(moduleKey)) return null;
    const mod = MODULE_BY_KEY.get(moduleKey);
    if (!mod.actions.includes(action)) return null;
    const own = action.endsWith(OWN_SUFFIX);
    return { key: raw, moduleKey, action, base: own ? action.slice(0, -OWN_SUFFIX.length) : action, own, module: mod };
};

/** EL CATÁLOGO CERRADO: todos los permisos que existen. */
export const PERMISSION_CATALOG = MODULES.flatMap(m => m.actions.map(a => permissionKey(m.key, a)));
const CATALOG_SET = new Set(PERMISSION_CATALOG);

export const isKnownPermission = (permission) => CATALOG_SET.has(str(permission, 120));

/**
 * LO QUE UN PERMISO IMPLICA.
 *
 * Sin implicaciones habría que marcar seis casillas para decir «puede editar»,
 * y la que se olvida —`view`— deja al usuario con un botón de editar sobre una
 * pantalla que no abre. Las reglas son tres y todas se leen solas:
 *
 *   · `manage` implica TODAS las acciones de su módulo. Es lo que dice la
 *     columna «Administrar» de la matriz del pedido.
 *   · Una acción amplia implica su variante propia: quien edita todo edita lo
 *     suyo. Al revés NO: es el punto 8, y es la mitad del sentido de un rol de
 *     autor.
 *   · Cualquier acción implica `view` del mismo módulo (o `use_own` donde el
 *     módulo no tiene `view`, como la bandeja). No se puede publicar a ciegas.
 */
export const impliedBy = (permission) => {
    const p = parsePermission(permission);
    if (!p) return [];
    const mod = p.module;
    const out = new Set([p.key]);

    if (p.action === 'manage') {
        for (const a of mod.actions) out.add(permissionKey(mod.key, a));
        return [...out];
    }
    if (!p.own && mod.actions.includes(p.action + OWN_SUFFIX)) {
        out.add(permissionKey(mod.key, p.action + OWN_SUFFIX));
    }
    // `use_all` de la bandeja implica `use_own`: quien ve todas ve la suya.
    if (p.action === 'use_all' && mod.actions.includes('use_own')) {
        out.add(permissionKey(mod.key, 'use_own'));
    }
    // Ver es la condición de todo lo demás.
    if (mod.actions.includes('view') && p.action !== 'view') out.add(permissionKey(mod.key, 'view'));
    if (mod.actions.includes('view_own') && p.own) out.add(permissionKey(mod.key, 'view_own'));
    return [...out];
};

/**
 * Expande una lista de permisos a su cierre.
 *
 * ⚠️ Descarta lo desconocido Y LO DICE. Un permiso que se pide y no se concede
 * tiene que verse, o el administrador marca la casilla, guarda, y no entiende
 * por qué el usuario sigue sin ver la herramienta. Misma regla que `skipped` en
 * los centros de acopio y que `descartados` en `normalizePermissions`.
 */
export const expandPermissions = (input) => {
    const pedidos = Array.isArray(input) ? input : [];
    const out = new Set();
    const descartados = [];
    const vistos = new Set();
    for (const raw of pedidos) {
        const key = str(raw, 120);
        if (!key || vistos.has(key)) continue;
        vistos.add(key);
        // Un permiso LEGADO (`news`, `mailbox`) se acepta y se traduce: es lo
        // que hace que las filas escritas antes de este módulo sigan valiendo.
        if (LEGACY_PERMISSION_MAP[key]) {
            for (const p of LEGACY_PERMISSION_MAP[key]) for (const i of impliedBy(p)) out.add(i);
            continue;
        }
        if (!isKnownPermission(key)) {
            descartados.push({ key, motivo: 'No existe ese permiso.' });
            continue;
        }
        for (const i of impliedBy(key)) out.add(i);
    }
    return { permissions: [...out].sort(), descartados };
};

// ── El puente con el catálogo de v4.932 ──────────────────────────────

/**
 * ⚠️ LA MIGRACIÓN, Y NO ES UNA TABLA: ES ESTE MAPA.
 *
 * `InstitutionalProfile.permissions` guarda las llaves gruesas de v4.932
 * (`news`, `mailbox`, `site_settings`). Reescribir esas filas en el despliegue
 * está PROHIBIDO por la sección de base de datos de este proyecto —un
 * despliegue no escribe— y además sería irreversible. Se traducen AL LEER, que
 * es gratis, se autorrepara y no deja dos verdades: la fila sigue diciendo lo
 * que dijo siempre y `resolveGrant` la expande.
 *
 * Cada llave vieja se traduce a lo que ESA llave ya permitía hacer, ni un
 * permiso más. Al agregar un módulo nuevo NO se lo cuelga de una llave vieja:
 * eso le daría a las cuentas existentes una herramienta que nadie les concedió.
 */
export const LEGACY_PERMISSION_MAP = {
    mailbox: ['email_inbox.use_own'],
    content_studio: ['content_studio.view', 'content_studio.create', 'content_studio.edit', 'content_studio.publish', 'social.view'],
    media_library: ['media.view', 'media.create', 'media.edit', 'downloads.view'],
    news: ['news.view', 'news.create', 'news.edit', 'news.publish', 'publications.view'],
    events: ['events.view', 'events.create', 'events.edit', 'events.publish'],
    contacts: ['contacts.view'],
    email_accounts: ['email_accounts.view', 'email_accounts.create', 'email_accounts.edit', 'email_accounts.delete'],
    users: ['users.manage', 'roles.manage', 'audit.view'],
    site_settings: ['settings.manage', 'integrations.manage'],
};

export const LEGACY_KEYS = Object.keys(LEGACY_PERMISSION_MAP);

/**
 * ⚠️ LAS LLAVES VIEJAS QUE UNA CUENTA INSTITUCIONAL NUNCA PUDO LLEVAR.
 *
 * En v4.932 estos tres permisos estaban marcados `adminOnly`, y `can()` los
 * rechazaba **aunque estuvieran escritos en la fila** — la segunda comprobación
 * existía para cubrir las filas escritas antes de que la primera existiera. Al
 * traducir por `LEGACY_PERMISSION_MAP` esa puerta se perdería sola: una fila
 * antigua con `users` dentro pasaría a conceder `users.manage`, o sea a
 * convertir a su dueño en administrador por la puerta de atrás.
 *
 * Se descartan en la rama `legacy_permissions` de `resolveGrant`. Quien de
 * verdad tenga que administrar lleva una MEMBRESÍA con el rol que corresponda,
 * que es una decisión explícita y auditada.
 */
export const LEGACY_ADMIN_ONLY = ['email_accounts', 'users', 'site_settings'];

/**
 * El camino de vuelta: qué permisos nuevos satisfacen una comprobación vieja.
 *
 * Es lo que permite que `can(user, 'users')` —escrito en decenas de rutas desde
 * v4.932— siga contestando lo mismo sin tocar ni una de ellas. Basta CUALQUIERA
 * del conjunto: la llave vieja significaba «entra a esta herramienta», y quien
 * tiene una acción de ese módulo entra.
 */
export const satisfiesLegacy = (permissions, legacyKey) => {
    const set = permissions instanceof Set ? permissions : new Set(permissions || []);
    const mapa = LEGACY_PERMISSION_MAP[str(legacyKey, 40)];
    if (!mapa) return false;
    return mapa.some(p => set.has(p));
};

// ── Los roles ────────────────────────────────────────────────────────

const allOf = (mod, extra = []) => mod.actions.filter(a => !extra.includes(a)).map(a => permissionKey(mod.key, a));

/** Todos los permisos de los módulos de un sitio. Es lo que tiene su administrador. */
export const SITE_ADMIN_PERMISSIONS = SITE_MODULES.flatMap(m => allOf(m));

/** Todo, sitio y plataforma. Sólo el operador de Club Platform. */
export const ALL_PERMISSIONS = [...PERMISSION_CATALOG];

const CONTENT_MODULES = ['content_studio', 'news', 'publications', 'events', 'projects', 'media', 'downloads', 'faqs'];

const contentFor = (actions) => CONTENT_MODULES.flatMap(k => {
    const mod = MODULE_BY_KEY.get(k);
    return actions.filter(a => mod.actions.includes(a)).map(a => permissionKey(k, a));
});

/**
 * LOS ROLES PREDETERMINADOS.
 *
 * ⚠️ Son PRESETS DEL CÓDIGO, no filas sembradas en la base. Sembrarlos exigiría
 * que un despliegue escribiera —prohibido por la sección de base de datos— y
 * dejaría cada sitio con una copia que se separa en silencio de la siguiente
 * versión: corregir un permiso mal puesto en el preset habría que hacerlo sitio
 * por sitio. Un rol PERSONALIZADO sí es una fila (`SiteRole`); un preset se
 * lee de acá y no se puede borrar ni renombrar, sólo DUPLICAR para adaptarlo.
 *
 * `protected: true` es lo que impide que alguien vacíe «Administrador del
 * sitio» y deje el sitio sin nadie que lo administre.
 */
/**
 * ⚠️ EL MENÚ BASE DE UN USUARIO INSTITUCIONAL, DECLARADO COMO DATOS (v4.941).
 *
 * Es la lista de módulos que recibe por defecto quien entra con una cuenta
 * institucional del sitio —`presidencia@dominio.org`— y NO una navegación
 * escrita a mano en la pantalla: la barra lateral se arma con los permisos que
 * el servidor resuelve, así que agregar un módulo al menú base es agregarlo
 * acá y nada más. El orden de la barra lo decide su categoría, como el de
 * cualquier otro rol.
 *
 * QUÉ SE CONCEDE Y QUÉ NO, y por qué:
 *
 *   · Lo de LECTURA va entero: analíticas, contactos, la Bóveda y Mi Inversión.
 *     Ver el saldo no mueve dinero; PEDIR UN RETIRO sí, y eso es `finance.manage`,
 *     que el base NO trae.
 *   · Lo de CONTENIDO llega hasta publicar —un oficial de club que escribe una
 *     noticia tiene que poder publicarla— y **se queda sin `delete`**. Es el
 *     ejemplo textual del pedido: puede entrar a Noticias con permiso de
 *     lectura y no debe poder ejecutar DELETE ni llamando al endpoint.
 *   · Lo SENSIBLE no está: usuarios, roles, configuración, integraciones,
 *     auditoría, cuentas de correo y tienda. Un menú base no reparte
 *     administración.
 *
 * Es un DEFAULT, no un techo: sobre él actúa el rol del sitio, que puede
 * ampliarlo o recortarlo desde «Usuarios y permisos».
 */
export const INSTITUTIONAL_BASE = [
    // GENERAL
    'analytics.view',
    'contacts.view',
    'email_inbox.use_own',
    'projects.view', 'projects.create', 'projects.edit', 'projects.publish',
    'news.view', 'news.create', 'news.edit', 'news.publish',
    // CONTENIDO
    'members.view', 'members.create', 'members.edit',
    'media.view', 'media.create', 'media.edit',
    'downloads.view', 'downloads.create', 'downloads.edit',
    // FINANZAS — sólo mirar.
    'investment.view',
    'finance.view',
];

export const ROLE_PRESETS = [
    {
        key: 'platform_superadmin',
        label: 'Superadministrador de Club Platform',
        description: 'Acceso global al ecosistema: sitios, usuarios, roles, integraciones y configuración de la plataforma.',
        scope: 'platform',
        protected: true,
        permissions: ALL_PERMISSIONS,
    },
    {
        key: 'site_admin',
        label: 'Administrador del sitio',
        description: 'Administra todo lo de SU sitio: contenido, usuarios, roles, correo, biblioteca y configuración. No alcanza a ningún otro sitio.',
        scope: 'site',
        protected: true,
        permissions: SITE_ADMIN_PERMISSIONS,
    },
    {
        key: 'editor',
        label: 'Editor',
        description: 'Crea, edita y publica el contenido del sitio y usa las herramientas de comunicación. No administra usuarios, cuentas de correo ni configuración.',
        scope: 'site',
        protected: true,
        permissions: [
            ...contentFor(['view', 'create', 'edit', 'edit_own', 'delete', 'delete_own', 'publish']),
            'email_inbox.use_own',
            'contacts.view', 'contacts.create', 'contacts.edit',
            'social.view', 'social.create', 'social.publish',
            'analytics.view', 'seo.view', 'dashboard.view',
        ],
    },
    {
        key: 'author',
        label: 'Autor',
        description: 'Crea contenido y edita LO SUYO. Puede publicar lo propio; no toca lo que escribieron otros.',
        scope: 'site',
        protected: true,
        permissions: [
            ...contentFor(['view', 'create', 'edit_own', 'delete_own', 'publish']),
            'email_inbox.use_own', 'dashboard.view',
        ],
    },
    {
        key: 'contributor',
        label: 'Colaborador',
        description: 'Crea borradores y sube archivos. NO publica ni elimina, y no modifica el contenido de otras personas.',
        scope: 'site',
        protected: true,
        permissions: [
            ...contentFor(['view', 'create', 'edit_own']),
            'email_inbox.use_own', 'dashboard.view',
        ],
    },
    {
        key: 'institutional_user',
        label: 'Usuario institucional',
        description: 'Entra al panel con el menú base de su sitio: analíticas, contactos, su correo institucional, proyectos, noticias, socios, biblioteca, descargas y las finanzas en sólo lectura.',
        scope: 'site',
        protected: true,
        permissions: INSTITUTIONAL_BASE,
    },
];

export const ROLE_PRESET_KEYS = ROLE_PRESETS.map(r => r.key);
const PRESET_BY_KEY = new Map(ROLE_PRESETS.map(r => [r.key, r]));

export const presetRole = (key) => PRESET_BY_KEY.get(str(key, 60)) || null;

/** Los presets que se le pueden asignar a alguien dentro de UN sitio. */
export const SITE_ROLE_PRESETS = ROLE_PRESETS.filter(r => r.scope === 'site');

/**
 * Los roles de `User` que ya existían y qué preset les corresponde.
 *
 * ⚠️ ES LA GARANTÍA DEL PUNTO 18: un administrador que hoy entra al panel no
 * pierde nada al desplegar esto, porque su rol de siempre se resuelve al preset
 * equivalente sin necesidad de fila en ninguna tabla nueva. Sin este mapa, el
 * despliegue dejaría a `club_admin` con cero permisos — que es exactamente la
 * clase de fallo mudo que este proyecto documenta una y otra vez.
 */
export const ROLE_FALLBACK = {
    administrator: 'platform_superadmin',
    superadmin: 'platform_superadmin',
    district_admin: 'site_admin',
    club_admin: 'site_admin',
    editor: 'site_admin',
    // ⚠️ `crowdfunder` estaba fuera y por eso resolvía a `none` (v4.939). Con
    // las rutas de contenido comprobando permiso (v4.941) eso lo habría dejado
    // sin publicar nada, cuando hoy está en `contentRoles` y `adminRoles` y
    // puede todo lo de su sitio. Se mapea a lo que YA tiene, no a más.
    crowdfunder: 'site_admin',
    institutional_user: 'institutional_user',
};

/** Los roles de `User` que son operador de la plataforma. Espejo de `PLATFORM_ROLES`. */
export const PLATFORM_ROLES = ['administrator', 'superadmin'];

export const isPlatformOperator = (user) => PLATFORM_ROLES.includes(str(user?.role, 40));

// ── La resolución ────────────────────────────────────────────────────

/**
 * QUÉ PUEDE ESTE USUARIO EN ESTE SITIO.
 *
 * ⚠️ ES EL ÚNICO PUNTO DE DECISIÓN y la cascada está pensada, no es la que
 * salía más cómoda. De arriba abajo:
 *
 *   1. **Operador de la plataforma** → todo, en cualquier sitio. Se decide por
 *      ROL y no por fila, porque los operadores existen desde antes que
 *      cualquiera de estas tablas y deducir sus permisos de una tabla vacía los
 *      habría dejado sin nada el día del despliegue.
 *
 *   2. **Membresía explícita en ESTE sitio** → los permisos de su rol, más las
 *      excepciones individuales, menos las denegaciones. Es el camino nuevo.
 *
 *   3. **Rol administrativo de siempre, sin membresía** → el preset
 *      equivalente. Es la migración: nadie pierde acceso.
 *
 *   4. **Cuenta institucional con permisos legados** → traducidos por
 *      `LEGACY_PERMISSION_MAP`.
 *
 *   5. Nada. Y «nada» es un panel vacío, no un panel completo: ante la duda no
 *      se concede.
 *
 * ⚠️ Y EL SITIO IMPORTA. Una membresía de OTRO sitio no se mira siquiera: es el
 * punto 1 del pedido —un usuario con permisos administrativos en un sitio no
 * obtiene permisos sobre otro— y es lo que hace que esto sea multi-tenant y no
 * una lista global de permisos con un nombre bonito.
 */
export const resolveGrant = ({ user = null, siteId = null, membership = null, legacyPermissions = null } = {}) => {
    const rol = str(user?.role, 40);

    if (isPlatformOperator(user)) {
        return {
            permissions: new Set(ALL_PERMISSIONS),
            source: 'platform_operator',
            roleKey: ROLE_FALLBACK[rol] || 'platform_superadmin',
            roleLabel: presetRole(ROLE_FALLBACK[rol] || 'platform_superadmin')?.label || 'Operador de la plataforma',
            scope: 'platform',
            siteId: siteId || null,
        };
    }

    // Una membresía de otro sitio NO decide nada acá. Comparar es lo que
    // sostiene el aislamiento: sin esta línea, resolver «qué puede María» daría
    // lo mismo mirando el sitio A que el B.
    const suya = membership && (!siteId || !membership.siteId || String(membership.siteId) === String(siteId))
        ? membership
        : null;

    if (suya && suya.status === 'suspended') {
        return { permissions: new Set(), source: 'suspended', roleKey: suya.roleKey || null, roleLabel: suya.roleLabel || null, scope: 'site', siteId };
    }

    if (suya && (suya.rolePermissions || suya.roleKey)) {
        const base = Array.isArray(suya.rolePermissions) && suya.rolePermissions.length
            ? suya.rolePermissions
            : (presetRole(suya.roleKey)?.permissions || []);
        const { permissions } = expandPermissions([...base, ...(suya.extraPermissions || [])]);
        const set = new Set(permissions);
        // Las denegaciones se quitan DESPUÉS de expandir, y se llevan también
        // lo que ese permiso implicaba: denegar `news.edit` y dejar
        // `news.edit_own` colado sería una denegación que no deniega.
        for (const raw of suya.deniedPermissions || []) {
            for (const i of impliedBy(raw)) set.delete(i);
            set.delete(str(raw, 120));
        }
        // Un rol de SITIO nunca alcanza módulos de plataforma, escriba lo que
        // escriba su fila. Es la segunda puerta del punto 12: la primera está
        // en `filterGrantable`, al guardar, y ésta cubre las filas escritas
        // antes de que aquélla existiera.
        for (const p of PLATFORM_MODULES.flatMap(m => allOf(m))) set.delete(p);
        return {
            permissions: set,
            source: 'membership',
            roleKey: suya.roleKey || null,
            roleLabel: suya.roleLabel || presetRole(suya.roleKey)?.label || null,
            scope: 'site',
            siteId: suya.siteId || siteId || null,
        };
    }

    const fallback = ROLE_FALLBACK[rol];
    if (fallback && fallback !== 'institutional_user') {
        const preset = presetRole(fallback);
        return {
            permissions: new Set(expandPermissions(preset.permissions).permissions),
            source: 'legacy_role',
            roleKey: fallback,
            roleLabel: preset.label,
            scope: preset.scope,
            siteId: siteId || null,
        };
    }

    if (Array.isArray(legacyPermissions) && legacyPermissions.length) {
        // Se descartan las llaves que v4.932 ya marcaba `adminOnly`: traducirlas
        // convertiría en administrador a quien nunca lo fue. Ver LEGACY_ADMIN_ONLY.
        const limpias = legacyPermissions.filter(k => !LEGACY_ADMIN_ONLY.includes(str(k, 40)));
        // ⚠️ SE UNE CON EL MENÚ BASE, NO LO SUSTITUYE (v4.941, sección 10 del
        // pedido). Un usuario institucional creado antes de esta versión tiene
        // su lista gruesa escrita en la fila y NO pasa por el preset, así que
        // sin esta unión el menú base no le llegaría nunca: seguiría viendo
        // sólo su bandeja. Y es ADITIVO — lo que alguien le concedió a mano se
        // conserva entero, que es la otra mitad de lo que el pedido exige.
        const { permissions } = expandPermissions([...limpias, ...INSTITUTIONAL_BASE]);
        if (permissions.length) return {
            permissions: new Set(permissions),
            source: 'legacy_permissions',
            roleKey: 'institutional_user',
            roleLabel: presetRole('institutional_user').label,
            scope: 'site',
            siteId: siteId || null,
        };
    }

    if (fallback === 'institutional_user') {
        const preset = presetRole('institutional_user');
        return {
            permissions: new Set(expandPermissions(preset.permissions).permissions),
            source: 'legacy_role',
            roleKey: 'institutional_user',
            roleLabel: preset.label,
            scope: 'site',
            siteId: siteId || null,
        };
    }

    return { permissions: new Set(), source: 'none', roleKey: null, roleLabel: null, scope: 'site', siteId: siteId || null };
};

/** Un `grant` puede llegar como Set, como array o como el objeto de `resolveGrant`. */
const setOf = (grant) => {
    if (!grant) return new Set();
    if (grant instanceof Set) return grant;
    if (Array.isArray(grant)) return new Set(grant);
    if (grant.permissions instanceof Set) return grant.permissions;
    if (Array.isArray(grant.permissions)) return new Set(grant.permissions);
    return new Set();
};

/**
 * ¿PUEDE?
 *
 * Acepta las dos formas: la nueva (`news.publish`) y la vieja (`news`). Que
 * acepte la vieja no es tolerancia: es lo que permite que las decenas de rutas
 * escritas en v4.932 sigan contestando lo mismo sin tocarlas, que es la
 * condición del punto 18.
 */
export const hasPermission = (grant, permission) => {
    const set = setOf(grant);
    const key = str(permission, 120);
    if (!key) return false;
    if (set.has(key)) return true;
    if (LEGACY_PERMISSION_MAP[key]) return satisfiesLegacy(set, key);
    return false;
};

/** ¿Se le pinta este módulo? Cualquier acción suya alcanza. */
export const canAccessModule = (grant, moduleKey) => {
    const mod = moduleOf(moduleKey);
    if (!mod) return false;
    const set = setOf(grant);
    return mod.actions.some(a => set.has(permissionKey(mod.key, a)));
};

/**
 * ¿Puede hacer ESTO sobre ESTA fila?
 *
 * ⚠️ Es el punto 8 y es donde vive la diferencia entre «editar sus noticias» y
 * «editar todas las noticias». Sin `ownerId` no se puede contestar la variante
 * propia, así que ante la ausencia del dato se exige el permiso AMPLIO: ante la
 * duda no se concede. Quien llame sin `ownerId` obtiene el criterio estricto,
 * nunca el laxo.
 */
export const canActOn = (grant, moduleKey, action, { ownerId = null, actorId = null } = {}) => {
    const set = setOf(grant);
    const amplio = permissionKey(moduleKey, action);
    if (set.has(amplio)) return true;
    const mod = moduleOf(moduleKey);
    if (!mod) return false;
    const propio = permissionKey(moduleKey, `${action}${OWN_SUFFIX}`);
    if (!mod.actions.includes(`${action}${OWN_SUFFIX}`) || !set.has(propio)) return false;
    if (!ownerId || !actorId) return false;
    return String(ownerId) === String(actorId);
};

/** Los módulos que este usuario ve, agrupados como los pinta la matriz. */
export const accessibleModules = (grant) => MODULES.filter(m => canAccessModule(grant, m.key));

// ── Rutas del panel ──────────────────────────────────────────────────

/**
 * Rutas que ve TODA sesión, tenga los permisos que tenga.
 *
 * `/admin/perfil` está acá y no puede no estarlo: es donde se cambia la
 * contraseña temporal, así que dejarla fuera encerraría a un usuario nuevo en
 * un panel vacío sin forma de cumplir lo que se le pide al entrar. Es la misma
 * lista de `institutionalAccess.js`, y tiene que serlo.
 */
export const ALWAYS_VISIBLE_ROUTES = ['/admin/perfil'];

const matches = (route, path) => path === route || path.startsWith(route + '/') || path.startsWith(route + '?');

/** Qué módulos abre esta ruta. Puede ser más de uno: `/admin/email` es bandeja Y cuentas. */
export const modulesForPath = (path) => {
    const ruta = str(path, 300).split('#')[0];
    const base = ruta.split('?')[0];
    return MODULES.filter(m => m.routes.some(r => matches(r, base) || matches(r, ruta)));
};

/**
 * ¿Se le pinta esta entrada del menú?
 *
 * ⚠️ ESTO NO ES LA AUTORIZACIÓN, y decirlo importa. El servidor no enruta por
 * dirección: guarda cada endpoint con `requirePermission`. Quien escriba la
 * dirección a mano llega a la pantalla y no obtiene ni un dato, porque cada
 * petición que hace se rechaza por su cuenta.
 *
 * Lo que NO está en el registro no se pinta: una pantalla que nadie clasificó
 * no debe aparecerle por omisión a quien tiene el acceso más acotado. Es el
 * lado seguro para equivocarse.
 */
export const canOpenPath = (grant, path) => {
    const ruta = str(path, 300).split('?')[0].split('#')[0];
    if (ALWAYS_VISIBLE_ROUTES.some(r => matches(r, ruta))) return true;
    const mods = modulesForPath(path);
    if (!mods.length) return false;
    return mods.some(m => canAccessModule(grant, m.key));
};

/** ¿Tiene TODO lo que tiene un administrador de sitio? Entonces no hay nada que recortar. */
export const isFullSiteAdmin = (grant) => {
    const set = setOf(grant);
    return SITE_ADMIN_PERMISSIONS.length > 0 && SITE_ADMIN_PERMISSIONS.every(p => set.has(p));
};

/**
 * ¿SE RECORTA LA BARRA LATERAL DE ESTA SESIÓN?
 *
 * ⚠️ LO DECIDE EL SERVIDOR Y VIAJA RESUELTO, igual que la lista de permisos. Con
 * la clasificación escrita también en el navegador vuelve el problema que este
 * módulo existe para no tener: dos criterios sobre la misma pregunta, que se
 * separan en silencio.
 *
 * Se recorta SÓLO lo que de verdad describe un acceso acotado:
 *
 *   · `membership`         → alguien le asignó un rol EN ESTE SITIO.
 *   · `legacy_permissions` → cuenta institucional de v4.932, con su lista.
 *   · `legacy_role` de `institutional_user` → lo mismo, sin permisos escritos.
 *
 * ⚠️ `none` NO SE RECORTA, y ése fue el defecto de v4.937. Un rol que no está en
 * `ROLE_FALLBACK` —`member`, `crm_agent`, `crowdfunder`, cualquiera que se
 * agregue— resuelve ahí, y recortarlo le dejaba el panel con «Mi perfil» y nada
 * más. Antes de este módulo veían el menú entero y lo que responde cada ruta no
 * cambió: el recorte les quitó la vista, no el acceso. Ante un origen que este
 * módulo no clasificó, NO se recorta — es el lado seguro acá, porque el
 * servidor sigue rechazando por su cuenta cada petición que no les toca.
 *
 * ⚠️ `suspended` TAMPOCO. Un panel vacío no dice que la cuenta está suspendida:
 * se lee como una avería. Que vea su menú y que el servidor le conteste con su
 * motivo al primer clic — un bloqueo explicado es lo contrario de un silencio.
 *
 * Y un grant que ya tiene TODO lo de un administrador de sitio no se toca nunca,
 * venga de donde venga: el registro de módulos no cubre TODAS las rutas del
 * panel —Capacitaciones, Rotaract, ROTEX, Solicitudes Técnicas y una decena
 * más—, así que recortarle el menú a quien puede todo le borraría esas entradas
 * sin que nada avise.
 */
export const isRestrictedGrant = (grant) => {
    if (!grant) return false;
    const fuente = str(grant.source, 40);
    const acotada = fuente === 'membership'
        || fuente === 'legacy_permissions'
        || (fuente === 'legacy_role' && str(grant.roleKey, 40) === 'institutional_user');
    if (!acotada) return false;
    return !isFullSiteAdmin(grant);
};

/**
 * ⚠️ EL RÓTULO DE «BANDEJA DE ENTRADA» PARA UN USUARIO INSTITUCIONAL.
 *
 * Es un cambio de NOMBRE VISIBLE y nada más: misma ruta, mismo módulo, mismos
 * endpoints, misma bandeja, mismos borradores y mismos adjuntos. No hay un
 * módulo nuevo — crearlo habría duplicado el ecosistema de correo, que es lo
 * que el pedido prohíbe expresamente.
 *
 * Vive acá y no como una cadena suelta en el JSX porque es una DECISIÓN del
 * criterio —a quién se le muestra qué nombre— y porque la pantalla y su prueba
 * tienen que leer la misma tabla.
 */
export const MENU_LABEL_OVERRIDES = {
    institutional: {
        '/admin/email': 'Correo Institucional',
    },
};

/**
 * Cómo se rotula una entrada del menú para ESTA sesión.
 *
 * Sin `institutional` devuelve el rótulo de siempre: el menú del operador y el
 * de un administrador de sitio no cambian ni una palabra.
 */
export const menuLabelFor = (path, label, { institutional = false } = {}) => {
    if (!institutional) return label;
    const ruta = str(path, 300).split('?')[0].split('#')[0];
    return MENU_LABEL_OVERRIDES.institutional[ruta] || label;
};

// ── Escalamiento de privilegios ──────────────────────────────────────

/**
 * ⚠️ NADIE CONCEDE LO QUE NO TIENE. Es el punto 12 y es obligatorio.
 *
 * Un administrador de sitio no puede volverse superadministrador, ni crear uno,
 * ni dar acceso global, ni tocar un módulo de plataforma. La comprobación va
 * en el SERVIDOR y sobre lo que se GUARDA, no en la pantalla que ofrece las
 * casillas: esconder un control no protege un endpoint de quien lo conoce
 * (v4.868).
 *
 * Y devuelve lo RECHAZADO con su motivo: un permiso que se pide y se descarta
 * en silencio hace creer que se concedió.
 */
export const filterGrantable = (actorGrant, requested, { actorIsPlatform = false } = {}) => {
    const set = setOf(actorGrant);
    const { permissions: pedidos, descartados } = expandPermissions(requested);
    const concedidos = [];
    const rechazados = [...descartados];

    for (const key of pedidos) {
        const p = parsePermission(key);
        if (!p) { rechazados.push({ key, motivo: 'No existe ese permiso.' }); continue; }
        if (p.module.scope === 'platform' && !actorIsPlatform) {
            rechazados.push({ key, motivo: 'Es un permiso de la plataforma: sólo lo concede el equipo de Club Platform.' });
            continue;
        }
        if (!set.has(key)) {
            rechazados.push({ key, motivo: 'No puedes conceder un permiso que tú mismo no tienes.' });
            continue;
        }
        concedidos.push(key);
    }
    return { permissions: concedidos, rechazados };
};

/** Los permisos que este actor PUEDE ofrecer. Es lo que pinta la matriz. */
export const grantablePermissions = (actorGrant, { actorIsPlatform = false } = {}) => {
    const set = setOf(actorGrant);
    return PERMISSION_CATALOG.filter(key => {
        const p = parsePermission(key);
        if (!p) return false;
        if (p.module.scope === 'platform' && !actorIsPlatform) return false;
        return set.has(key);
    });
};

/**
 * ¿Puede este actor asignar este rol?
 *
 * Un rol se puede asignar sólo si el actor tiene TODOS sus permisos: si no, el
 * rol sería una vía para conceder de más. Y un rol de plataforma no lo asigna
 * nadie que no sea operador, aunque por casualidad tuviera todos sus permisos.
 */
export const canAssignRole = (actorGrant, role, { actorIsPlatform = false } = {}) => {
    if (!role) return false;
    if (role.scope === 'platform' && !actorIsPlatform) return false;
    const set = setOf(actorGrant);
    const { permissions } = expandPermissions(role.permissions || []);
    return permissions.every(p => set.has(p));
};

/** Los roles que este actor puede ofrecer en el desplegable del alta. */
export const assignableRoles = (actorGrant, roles, { actorIsPlatform = false } = {}) =>
    (roles || []).filter(r => canAssignRole(actorGrant, r, { actorIsPlatform }));

// ── Validación de un rol ─────────────────────────────────────────────

export const ROLE_NAME_MAX = 60;
export const ROLE_DESCRIPTION_MAX = 300;

/**
 * Comprueba un rol antes de guardarlo. El administrador escribe, el CÓDIGO
 * decide — la regla del sitio.
 *
 * Devuelve TODOS los errores, no el primero: «datos inválidos» a secas obliga a
 * probar campo por campo.
 */
export const validateRole = (input = {}, { actorGrant = null, actorIsPlatform = false, existingKeys = [] } = {}) => {
    const errors = [];
    const warnings = [];

    const name = str(input.name, ROLE_NAME_MAX);
    const description = str(input.description, ROLE_DESCRIPTION_MAX);

    if (!name) errors.push('Escribe un nombre para el rol.');
    else if (name.length < 3) errors.push('El nombre del rol es demasiado corto.');

    const key = str(input.key, 60).toLowerCase().replace(/[^a-z0-9_-]/g, '') || slugifyRole(name);
    if (!key) errors.push('No se pudo derivar un identificador del nombre.');
    if (ROLE_PRESET_KEYS.includes(key)) {
        errors.push('Ese identificador pertenece a un rol del sistema. Duplica el rol en vez de reemplazarlo.');
    }
    if (existingKeys.includes(key) && !input.allowExisting) {
        errors.push('Ya existe un rol con ese nombre en este sitio.');
    }

    const { permissions, rechazados } = filterGrantable(actorGrant, input.permissions, { actorIsPlatform });
    for (const r of rechazados) warnings.push(`Permiso descartado (${r.key}): ${r.motivo}`);

    if (!permissions.length) {
        warnings.push('Sin ningún permiso marcado, quien reciba este rol entra al panel y no ve nada.');
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        value: { key, name, description, permissions, scope: 'site' },
    };
};

export const slugifyRole = (name) =>
    str(name, ROLE_NAME_MAX)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60);

// ── Estados de un usuario ────────────────────────────────────────────

/**
 * ⚠️ `invited` NO es `active`, y la diferencia decide si se puede entrar.
 *
 * Un invitado tiene fila y todavía no estrenó su contraseña; un suspendido la
 * tiene y no puede entrar. Presentarlos igual haría imposible contestar «¿por
 * qué esta persona no entra?», que es la única pregunta para la que sirve un
 * estado.
 */
export const MEMBERSHIP_STATUSES = [
    { key: 'active', label: 'Activo', canSignIn: true, help: 'Entra al panel con normalidad.' },
    { key: 'invited', label: 'Invitado', canSignIn: true, help: 'Tiene acceso y todavía no ha entrado por primera vez.' },
    { key: 'suspended', label: 'Suspendido', canSignIn: false, help: 'No entra, y una sesión abierta deja de servirle en el acto.' },
    { key: 'disabled', label: 'Desactivado', canSignIn: false, help: 'Retirado del sitio. Se conserva para poder explicar lo que hizo.' },
];

export const MEMBERSHIP_STATUS_KEYS = MEMBERSHIP_STATUSES.map(s => s.key);

export const canSignIn = (status) =>
    MEMBERSHIP_STATUSES.find(s => s.key === str(status, 20))?.canSignIn ?? true;

// ── Protección del último administrador ──────────────────────────────

/** Un rol cuenta como administrativo si puede administrar usuarios de ese sitio. */
export const isAdministrativeRole = (role) => {
    if (!role) return false;
    const { permissions } = expandPermissions(role.permissions || []);
    return permissions.includes('users.manage') || permissions.includes('roles.manage');
};

/**
 * ⚠️ NO SE PUEDE DEJAR UN SITIO SIN ADMINISTRADOR. Punto 16 del pedido.
 *
 * `admins` son los usuarios con rol administrativo y estado que permite entrar.
 * Si quitarle el rol —o suspenderlo, o borrarlo— a `targetUserId` deja la lista
 * vacía, se impide Y SE DICE POR QUÉ, con la salida: nombrar a otro
 * administrador primero. Un bloqueo sin salida se lee como una avería.
 *
 * ⚠️ Un operador de la plataforma NO cuenta como administrador del sitio a
 * estos efectos, y es deliberado: un sitio cuyo único administrador es el
 * equipo de Club Platform está, para su organización, sin administrador — que
 * es justo lo que esta comprobación existe para impedir.
 */
export const wouldOrphanSite = ({ admins = [], targetUserId = null } = {}) => {
    const id = String(targetUserId ?? '');
    const quedan = admins.filter(a => String(a.userId ?? a.id ?? '') !== id && canSignIn(a.status));
    if (quedan.length > 0) return { blocked: false, remaining: quedan.length };
    return {
        blocked: true,
        remaining: 0,
        reason: 'Es el único administrador de este sitio. Nombra a otro administrador antes de quitarle el rol; si no, el sitio queda sin nadie que pueda administrarlo.',
    };
};

// ── Resumen legible de un rol ────────────────────────────────────────

/**
 * «Este usuario podrá acceder a Estudio de Contenido, Biblioteca Multimedia,
 * Noticias y su Bandeja de Entrada.» Es el punto 6, textual.
 *
 * Se DERIVA de los permisos en vez de escribirse junto al rol: con dos fuentes,
 * el resumen diría una cosa y la matriz otra, y quien asigna el rol confiaría
 * en la que se lee más fácil.
 */
export const describeRole = (permissions) => {
    const { permissions: expandidos } = expandPermissions(permissions);
    const set = new Set(expandidos);
    const nombres = MODULES.filter(m => m.actions.some(a => set.has(permissionKey(m.key, a)))).map(m => m.label);
    if (!nombres.length) return 'Este usuario entrará al panel y no verá ninguna herramienta.';
    const lista = nombres.length === 1
        ? nombres[0]
        : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
    return `Este usuario podrá acceder a ${lista}.`;
};

/** La matriz que pinta el panel: filas por módulo, columnas por acción. */
export const permissionMatrix = ({ includePlatform = false } = {}) =>
    MODULE_GROUPS.map(group => ({
        group,
        modules: MODULES
            .filter(m => m.group === group && (includePlatform || m.scope !== 'platform'))
            .map(m => ({
                key: m.key,
                label: m.label,
                help: m.help,
                sensitive: !!m.sensitive,
                scope: m.scope,
                cells: ALL_ACTION_FORMS.map(a => ({
                    action: a,
                    available: m.actions.includes(a),
                    permission: m.actions.includes(a) ? permissionKey(m.key, a) : null,
                })),
            })),
    })).filter(g => g.modules.length > 0);

// ── Auditoría ────────────────────────────────────────────────────────

/**
 * Los eventos que agrega este módulo. Se FUNDEN con los de
 * `institutionalAccess.AUDIT_EVENTS`, no los reemplazan: un catálogo nuevo
 * dejaría los eventos de v4.932 sin nombre en la misma pantalla.
 */
export const RBAC_AUDIT_EVENTS = {
    role_created: 'Rol creado',
    role_updated: 'Rol modificado',
    role_deleted: 'Rol eliminado',
    role_duplicated: 'Rol duplicado',
    membership_created: 'Usuario añadido al sitio',
    membership_role_changed: 'Rol del usuario cambiado',
    membership_permissions_changed: 'Excepciones de permisos modificadas',
    membership_suspended: 'Usuario suspendido',
    membership_restored: 'Usuario reactivado',
    membership_removed: 'Usuario retirado del sitio',
    sessions_revoked: 'Sesiones activas cerradas',
};

export default {
    ACTIONS, ACTION_KEYS, SCOPED_ACTIONS, ALL_ACTION_FORMS, OWN_SUFFIX,
    MODULES, MODULE_KEYS, SITE_MODULES, PLATFORM_MODULES, MODULE_GROUPS, moduleOf,
    permissionKey, parsePermission, PERMISSION_CATALOG, isKnownPermission,
    impliedBy, expandPermissions,
    LEGACY_PERMISSION_MAP, LEGACY_KEYS, LEGACY_ADMIN_ONLY, satisfiesLegacy,
    ROLE_PRESETS, ROLE_PRESET_KEYS, SITE_ROLE_PRESETS, presetRole,
    SITE_ADMIN_PERMISSIONS, ALL_PERMISSIONS, ROLE_FALLBACK, PLATFORM_ROLES, isPlatformOperator,
    resolveGrant, hasPermission, canAccessModule, canActOn, accessibleModules,
    isFullSiteAdmin, isRestrictedGrant, INSTITUTIONAL_BASE,
    MENU_LABEL_OVERRIDES, menuLabelFor,
    ALWAYS_VISIBLE_ROUTES, modulesForPath, canOpenPath,
    filterGrantable, grantablePermissions, canAssignRole, assignableRoles,
    validateRole, slugifyRole, ROLE_NAME_MAX, ROLE_DESCRIPTION_MAX,
    MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_KEYS, canSignIn,
    isAdministrativeRole, wouldOrphanSite, describeRole, permissionMatrix,
    RBAC_AUDIT_EVENTS,
};
