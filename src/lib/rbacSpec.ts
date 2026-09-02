// ════════════════════════════════════════════════════════════════════
// RBAC multi-tenant — ESPEJO del criterio en el navegador
// v4.937.0
//
// Está duplicado A PROPÓSITO, igual que `institutionalAccess.ts`, `designSpec`
// o `contributionSpec`: el servidor decide qué RESPONDE y éste decide qué se
// PINTA. Sin espejo, la barra lateral tendría que preguntarle al servidor por
// cada entrada antes de dibujarla —una consulta por visita para saber lo mismo—
// y la matriz de permisos no podría mostrar en vivo lo que implica una casilla.
//
// ⚠️ SI CAMBIA UNO, CAMBIA EL OTRO. Lo comprueba `npm run test:rbac`, que carga
// los dos y compara las SALIDAS de las funciones sobre una matriz de sesiones,
// permisos y rutas, no sólo las constantes: que las dos mitades coincidan en la
// lista de módulos y discrepen en `canOpenPath` sería el peor de los dos mundos.
//
// ⚠️ ACÁ NO ESTÁ `resolveGrant`, Y ES DELIBERADO. Los permisos EFECTIVOS los
// resuelve el servidor y viajan resueltos en `/api/rbac/me` — la misma regla
// que el calendario de la distribución (v4.864) y el período de la Bóveda
// (v4.849): con dos resoluciones, el menú y lo que responde la ruta podrían
// discrepar, y eso se lee como que los permisos no funcionan. El navegador
// recibe la lista ya expandida y sólo la consulta.
//
// ⚠️ Y ESTO DECIDE QUÉ SE DIBUJA, NUNCA A QUÉ SE TIENE ACCESO. Quien escriba la
// dirección de una pantalla que no le toca llega igual y no obtiene ni un dato,
// porque cada petición choca contra `requirePermission` en el servidor.
// Esconder un botón no protege un endpoint de quien lo conoce (v4.868).
// ════════════════════════════════════════════════════════════════════

export interface ActionSpec {
    key: string;
    label: string;
    rank: number;
    scoped: boolean;
    help: string;
}

export const ACTIONS: ActionSpec[] = [
    { key: 'view', label: 'Ver', rank: 1, scoped: true, help: 'Abrir el módulo y consultar su contenido.' },
    { key: 'create', label: 'Crear', rank: 2, scoped: false, help: 'Dar de alta contenido nuevo.' },
    { key: 'edit', label: 'Editar', rank: 3, scoped: true, help: 'Modificar contenido existente.' },
    { key: 'delete', label: 'Eliminar', rank: 4, scoped: true, help: 'Borrar contenido. No se deshace.' },
    { key: 'publish', label: 'Publicar', rank: 5, scoped: false, help: 'Poner al aire lo que ya existe. Sin esto, el contenido queda en borrador.' },
    { key: 'export', label: 'Exportar', rank: 6, scoped: false, help: 'Descargar los datos del módulo.' },
    { key: 'manage', label: 'Administrar', rank: 7, scoped: false, help: 'Configurar el módulo entero. Implica todas las demás acciones.' },
];

export const ACTION_KEYS = ACTIONS.map(a => a.key);
export const OWN_SUFFIX = '_own';
export const SCOPED_ACTIONS = ACTIONS.filter(a => a.scoped).map(a => a.key);
export const ALL_ACTION_FORMS = ACTIONS.flatMap(a => (a.scoped ? [a.key, a.key + OWN_SUFFIX] : [a.key]));

/**
 * Rótulo de una acción, incluida su variante propia. `edit_own` se lee «Editar
 * (propio)» y no «edit_own»: la matriz la mira una persona.
 */
export const actionLabel = (action: string): string => {
    const own = action.endsWith(OWN_SUFFIX);
    const base = own ? action.slice(0, -OWN_SUFFIX.length) : action;
    const spec = ACTIONS.find(a => a.key === base);
    if (action === 'use_own') return 'Su bandeja';
    if (action === 'use_all') return 'Todas las bandejas';
    if (!spec) return action;
    return own ? `${spec.label} (propio)` : spec.label;
};

export interface ModuleSpec {
    key: string;
    label: string;
    group: string;
    scope: 'site' | 'platform';
    actions: string[];
    routes: string[];
    legacy: string | null;
    sensitive: boolean;
    help: string;
}

export interface RolePreset {
    key: string;
    label: string;
    description: string;
    scope: 'site' | 'platform';
    protected: boolean;
    permissions: string[];
}

export const MODULES: ModuleSpec[] = [
    {
        "key": "dashboard",
        "label": "Panel principal",
        "group": "Panel",
        "scope": "site",
        "actions": [
            "view"
        ],
        "routes": [
            "/admin/dashboard"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "La pantalla de inicio del panel con el resumen del sitio."
    },
    {
        "key": "analytics",
        "label": "Analíticas",
        "group": "Panel",
        "scope": "site",
        "actions": [
            "view",
            "export"
        ],
        "routes": [
            "/admin/analytics"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "Estadísticas de visitas y comportamiento del sitio."
    },
    {
        "key": "seo",
        "label": "SEO Inteligente",
        "group": "Panel",
        "scope": "site",
        "actions": [
            "view",
            "edit",
            "manage"
        ],
        "routes": [
            "/admin/seo"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "Auditoría, metadatos y configuración de posicionamiento."
    },
    {
        "key": "intelligence",
        "label": "Centro de Inteligencia",
        "group": "Panel",
        "scope": "site",
        "actions": [
            "view",
            "manage"
        ],
        "routes": [
            "/admin/inteligencia",
            "/admin/district-iq"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "Herramientas de análisis y recomendaciones del sitio."
    },
    {
        "key": "reports",
        "label": "Informes Ejecutivos",
        "group": "Panel",
        "scope": "site",
        "actions": [
            "view",
            "export"
        ],
        "routes": [
            "/admin/informes-ejecutivos"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "Informes consolidados para la junta directiva."
    },
    {
        "key": "content_studio",
        "label": "Estudio de Contenido",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "edit_own",
            "delete",
            "delete_own",
            "publish"
        ],
        "routes": [
            "/admin/content-studio",
            "/admin/aniversarios-ia"
        ],
        "legacy": "content_studio",
        "sensitive": false,
        "help": "Generador de publicaciones, Reels, Aniversarios IA y las demás herramientas del estudio."
    },
    {
        "key": "news",
        "label": "Noticias",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "edit_own",
            "delete",
            "delete_own",
            "publish"
        ],
        "routes": [
            "/admin/noticias"
        ],
        "legacy": "news",
        "sensitive": false,
        "help": "Artículos y noticias del sitio."
    },
    {
        "key": "publications",
        "label": "Publicaciones / Difusión",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "edit_own",
            "delete",
            "publish"
        ],
        "routes": [
            "/admin/publicaciones"
        ],
        "legacy": "news",
        "sensitive": false,
        "help": "Publicaciones centralizadas que se difunden a varios sitios."
    },
    {
        "key": "events",
        "label": "Eventos",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "edit_own",
            "delete",
            "publish"
        ],
        "routes": [
            "/admin/eventos"
        ],
        "legacy": "events",
        "sensitive": false,
        "help": "Calendario, fichas y registro de eventos del sitio."
    },
    {
        "key": "projects",
        "label": "Proyectos",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "edit_own",
            "delete",
            "publish",
            "manage"
        ],
        "routes": [
            "/admin/proyectos"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "Proyectos del sitio y su postulación."
    },
    {
        "key": "media",
        "label": "Biblioteca Multimedia",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "delete"
        ],
        "routes": [
            "/admin/media",
            "/admin/imagenes-sitio"
        ],
        "legacy": "media_library",
        "sensitive": false,
        "help": "Archivos del sitio: subir, organizar en carpetas, recortar y eliminar."
    },
    {
        "key": "downloads",
        "label": "Centro de Descargas",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "delete"
        ],
        "routes": [
            "/admin/descargas"
        ],
        "legacy": "media_library",
        "sensitive": false,
        "help": "Documentos públicos que el sitio ofrece para descargar."
    },
    {
        "key": "members",
        "label": "Socios y Junta Directiva",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "delete"
        ],
        "routes": [
            "/admin/miembros"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "El directorio de socios y la composición de la junta directiva."
    },
    {
        "key": "contributions",
        "label": "Bloques de pago",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "edit",
            "manage"
        ],
        "routes": [
            "/admin/bloques-pago"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "Los bloques de aporte y membresía de la página pública de aportes: qué se ofrece y por cuánto."
    },
    {
        "key": "contribution_campaigns",
        "label": "Campañas de Contribución",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "edit",
            "manage"
        ],
        "routes": [
            "/admin/campanas-contribucion",
            "/admin/maneras-de-contribuir"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "Las campañas de contribución que alcanzan a este sitio: su contacto local, su nota, su QR y sus centros de acopio. El contenido central lo define el Administrador del Sistema."
    },
    {
        "key": "faqs",
        "label": "Preguntas Frecuentes",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "delete",
            "publish"
        ],
        "routes": [
            "/admin/faqs"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "El listado de preguntas frecuentes de la página pública."
    },
    {
        "key": "email_inbox",
        "label": "Bandeja de Entrada",
        "group": "Comunicación",
        "scope": "site",
        "actions": [
            "use_own",
            "use_all"
        ],
        "routes": [
            "/admin/email"
        ],
        "legacy": "mailbox",
        "sensitive": false,
        "help": "Leer y responder correo institucional."
    },
    {
        "key": "email_accounts",
        "label": "Cuentas de correo",
        "group": "Comunicación",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "delete"
        ],
        "routes": [
            "/admin/email"
        ],
        "legacy": "email_accounts",
        "sensitive": true,
        "help": "Crear, editar y eliminar las cuentas institucionales del sitio."
    },
    {
        "key": "contacts",
        "label": "Contactos & Leads",
        "group": "Comunicación",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "delete",
            "export"
        ],
        "routes": [
            "/admin/leads"
        ],
        "legacy": "contacts",
        "sensitive": false,
        "help": "La base de contactos del sitio. Son datos personales de terceros."
    },
    {
        "key": "crm",
        "label": "Comunicaciones CRM",
        "group": "Comunicación",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "manage"
        ],
        "routes": [
            "/admin/crm",
            "/admin/whatsapp-qr"
        ],
        "legacy": "contacts",
        "sensitive": false,
        "help": "WhatsApp, recorridos, plantillas y la bandeja de conversaciones."
    },
    {
        "key": "social",
        "label": "Hub Social",
        "group": "Comunicación",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "publish",
            "manage"
        ],
        "routes": [
            "/admin/social-hub"
        ],
        "legacy": "content_studio",
        "sensitive": false,
        "help": "Cuentas sociales conectadas y distribución de publicaciones."
    },
    {
        "key": "email_marketing",
        "label": "Email Marketing",
        "group": "Comunicación",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "publish"
        ],
        "routes": [
            "/admin/email-marketing"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "Campañas de correo hacia la base de contactos."
    },
    {
        "key": "users",
        "label": "Usuarios",
        "group": "Administración",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "delete",
            "manage"
        ],
        "routes": [
            "/admin/usuarios-permisos"
        ],
        "legacy": "users",
        "sensitive": true,
        "help": "Dar y quitar acceso al panel, cambiar roles, suspender y restablecer contraseñas."
    },
    {
        "key": "roles",
        "label": "Roles y permisos",
        "group": "Administración",
        "scope": "site",
        "actions": [
            "view",
            "manage"
        ],
        "routes": [
            "/admin/usuarios-permisos"
        ],
        "legacy": "users",
        "sensitive": true,
        "help": "Crear roles, editar su matriz de permisos y asignarlos."
    },
    {
        "key": "settings",
        "label": "Configuración del sitio",
        "group": "Administración",
        "scope": "site",
        "actions": [
            "view",
            "edit",
            "manage"
        ],
        "routes": [
            "/admin/configuracion",
            "/admin/sistema-footer"
        ],
        "legacy": "site_settings",
        "sensitive": true,
        "help": "Identidad, dominio, secciones y ajustes del sitio."
    },
    {
        "key": "integrations",
        "label": "Integraciones",
        "group": "Administración",
        "scope": "site",
        "actions": [
            "view",
            "manage"
        ],
        "routes": [
            "/admin/integraciones",
            "/admin/traducciones",
            "/admin/agentes"
        ],
        "legacy": "site_settings",
        "sensitive": true,
        "help": "Credenciales, métodos de pago, modelos de IA y traducción."
    },
    {
        "key": "finance",
        "label": "Finanzas",
        "group": "Administración",
        "scope": "site",
        "actions": [
            "view",
            "export",
            "manage"
        ],
        "routes": [
            "/admin/boveda"
        ],
        "legacy": null,
        "sensitive": true,
        "help": "La Bóveda de Fondos: saldo, aportes recibidos y retiros."
    },
    {
        "key": "compliance",
        "label": "Estados Financieros",
        "group": "Administración",
        "scope": "site",
        "actions": [
            "view",
            "export"
        ],
        "routes": [
            "/admin/estados-financieros"
        ],
        "legacy": null,
        "sensitive": true,
        "help": "La contabilidad declarada del sitio. Su pantalla depende además del módulo DIAN."
    },
    {
        "key": "project_fair",
        "label": "Postulación de Proyectos",
        "group": "Contenido",
        "scope": "site",
        "actions": [
            "view",
            "edit",
            "manage"
        ],
        "routes": [
            "/admin/postulaciones-pagos"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "Las postulaciones y los pagos de la Feria de Proyectos."
    },
    {
        "key": "investment",
        "label": "Mi Inversión",
        "group": "Administración",
        "scope": "site",
        "actions": [
            "view"
        ],
        "routes": [
            "/admin/inversion"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "El seguimiento de la inversión del sitio en la plataforma. Sólo lectura."
    },
    {
        "key": "store",
        "label": "Tienda",
        "group": "Administración",
        "scope": "site",
        "actions": [
            "view",
            "create",
            "edit",
            "delete",
            "manage"
        ],
        "routes": [
            "/admin/tienda",
            "/admin/ordenes"
        ],
        "legacy": null,
        "sensitive": false,
        "help": "Catálogo de productos del sitio y las órdenes de compra."
    },
    {
        "key": "audit",
        "label": "Registro de auditoría",
        "group": "Administración",
        "scope": "site",
        "actions": [
            "view",
            "export"
        ],
        "routes": [
            "/admin/usuarios-permisos"
        ],
        "legacy": "users",
        "sensitive": true,
        "help": "Quién hizo qué y cuándo sobre los accesos del sitio."
    },
    {
        "key": "platform_sites",
        "label": "Sitios del ecosistema",
        "group": "Plataforma",
        "scope": "platform",
        "actions": [
            "view",
            "create",
            "edit",
            "delete",
            "manage"
        ],
        "routes": [
            "/admin/distritos",
            "/admin/clubes",
            "/admin/asociaciones",
            "/admin/zonas",
            "/admin/programas-intercambio",
            "/admin/ferias-proyectos",
            "/admin/eventos-convenciones"
        ],
        "legacy": null,
        "sensitive": true,
        "help": "Alta y administración de los sitios alojados en Club Platform."
    },
    {
        "key": "platform_users",
        "label": "Usuarios de plataforma",
        "group": "Plataforma",
        "scope": "platform",
        "actions": [
            "view",
            "create",
            "edit",
            "delete",
            "manage"
        ],
        "routes": [
            "/admin/usuarios"
        ],
        "legacy": null,
        "sensitive": true,
        "help": "Los superadministradores y operadores de Club Platform."
    },
    {
        "key": "platform_global",
        "label": "Contenido global",
        "group": "Plataforma",
        "scope": "platform",
        "actions": [
            "view",
            "create",
            "edit",
            "delete",
            "publish",
            "manage"
        ],
        "routes": [
            "/admin/donaciones",
            "/admin/campanas-contribucion",
            "/admin/slider-global",
            "/admin/notificaciones-aportes",
            "/admin/system-updates",
            "/admin/mission-control-vip"
        ],
        "legacy": null,
        "sensitive": true,
        "help": "Campañas, slider y avisos que alcanzan a varios sitios a la vez."
    }
];

export const ROLE_PRESETS: RolePreset[] = [
    {
        "key": "platform_superadmin",
        "label": "Superadministrador de Club Platform",
        "description": "Acceso global al ecosistema: sitios, usuarios, roles, integraciones y configuración de la plataforma.",
        "scope": "platform",
        "protected": true,
        "permissions": [
            "dashboard.view",
            "analytics.view",
            "analytics.export",
            "seo.view",
            "seo.edit",
            "seo.manage",
            "intelligence.view",
            "intelligence.manage",
            "reports.view",
            "reports.export",
            "content_studio.view",
            "content_studio.create",
            "content_studio.edit",
            "content_studio.edit_own",
            "content_studio.delete",
            "content_studio.delete_own",
            "content_studio.publish",
            "news.view",
            "news.create",
            "news.edit",
            "news.edit_own",
            "news.delete",
            "news.delete_own",
            "news.publish",
            "publications.view",
            "publications.create",
            "publications.edit",
            "publications.edit_own",
            "publications.delete",
            "publications.publish",
            "events.view",
            "events.create",
            "events.edit",
            "events.edit_own",
            "events.delete",
            "events.publish",
            "projects.view",
            "projects.create",
            "projects.edit",
            "projects.edit_own",
            "projects.delete",
            "projects.publish",
            "projects.manage",
            "media.view",
            "media.create",
            "media.edit",
            "media.delete",
            "downloads.view",
            "downloads.create",
            "downloads.edit",
            "downloads.delete",
            "members.view",
            "members.create",
            "members.edit",
            "members.delete",
            "contributions.view",
            "contributions.edit",
            "contributions.manage",
            "contribution_campaigns.view",
            "contribution_campaigns.edit",
            "contribution_campaigns.manage",
            "faqs.view",
            "faqs.create",
            "faqs.edit",
            "faqs.delete",
            "faqs.publish",
            "email_inbox.use_own",
            "email_inbox.use_all",
            "email_accounts.view",
            "email_accounts.create",
            "email_accounts.edit",
            "email_accounts.delete",
            "contacts.view",
            "contacts.create",
            "contacts.edit",
            "contacts.delete",
            "contacts.export",
            "crm.view",
            "crm.create",
            "crm.edit",
            "crm.manage",
            "social.view",
            "social.create",
            "social.publish",
            "social.manage",
            "email_marketing.view",
            "email_marketing.create",
            "email_marketing.edit",
            "email_marketing.publish",
            "users.view",
            "users.create",
            "users.edit",
            "users.delete",
            "users.manage",
            "roles.view",
            "roles.manage",
            "settings.view",
            "settings.edit",
            "settings.manage",
            "integrations.view",
            "integrations.manage",
            "finance.view",
            "finance.export",
            "finance.manage",
            "compliance.view",
            "compliance.export",
            "project_fair.view",
            "project_fair.edit",
            "project_fair.manage",
            "investment.view",
            "store.view",
            "store.create",
            "store.edit",
            "store.delete",
            "store.manage",
            "audit.view",
            "audit.export",
            "platform_sites.view",
            "platform_sites.create",
            "platform_sites.edit",
            "platform_sites.delete",
            "platform_sites.manage",
            "platform_users.view",
            "platform_users.create",
            "platform_users.edit",
            "platform_users.delete",
            "platform_users.manage",
            "platform_global.view",
            "platform_global.create",
            "platform_global.edit",
            "platform_global.delete",
            "platform_global.publish",
            "platform_global.manage"
        ]
    },
    {
        "key": "site_admin",
        "label": "Administrador del sitio",
        "description": "Administra todo lo de SU sitio: contenido, usuarios, roles, correo, biblioteca y configuración. No alcanza a ningún otro sitio.",
        "scope": "site",
        "protected": true,
        "permissions": [
            "dashboard.view",
            "analytics.view",
            "analytics.export",
            "seo.view",
            "seo.edit",
            "seo.manage",
            "intelligence.view",
            "intelligence.manage",
            "reports.view",
            "reports.export",
            "content_studio.view",
            "content_studio.create",
            "content_studio.edit",
            "content_studio.edit_own",
            "content_studio.delete",
            "content_studio.delete_own",
            "content_studio.publish",
            "news.view",
            "news.create",
            "news.edit",
            "news.edit_own",
            "news.delete",
            "news.delete_own",
            "news.publish",
            "publications.view",
            "publications.create",
            "publications.edit",
            "publications.edit_own",
            "publications.delete",
            "publications.publish",
            "events.view",
            "events.create",
            "events.edit",
            "events.edit_own",
            "events.delete",
            "events.publish",
            "projects.view",
            "projects.create",
            "projects.edit",
            "projects.edit_own",
            "projects.delete",
            "projects.publish",
            "projects.manage",
            "media.view",
            "media.create",
            "media.edit",
            "media.delete",
            "downloads.view",
            "downloads.create",
            "downloads.edit",
            "downloads.delete",
            "members.view",
            "members.create",
            "members.edit",
            "members.delete",
            "contributions.view",
            "contributions.edit",
            "contributions.manage",
            "contribution_campaigns.view",
            "contribution_campaigns.edit",
            "contribution_campaigns.manage",
            "faqs.view",
            "faqs.create",
            "faqs.edit",
            "faqs.delete",
            "faqs.publish",
            "email_inbox.use_own",
            "email_inbox.use_all",
            "email_accounts.view",
            "email_accounts.create",
            "email_accounts.edit",
            "email_accounts.delete",
            "contacts.view",
            "contacts.create",
            "contacts.edit",
            "contacts.delete",
            "contacts.export",
            "crm.view",
            "crm.create",
            "crm.edit",
            "crm.manage",
            "social.view",
            "social.create",
            "social.publish",
            "social.manage",
            "email_marketing.view",
            "email_marketing.create",
            "email_marketing.edit",
            "email_marketing.publish",
            "users.view",
            "users.create",
            "users.edit",
            "users.delete",
            "users.manage",
            "roles.view",
            "roles.manage",
            "settings.view",
            "settings.edit",
            "settings.manage",
            "integrations.view",
            "integrations.manage",
            "finance.view",
            "finance.export",
            "finance.manage",
            "compliance.view",
            "compliance.export",
            "project_fair.view",
            "project_fair.edit",
            "project_fair.manage",
            "investment.view",
            "store.view",
            "store.create",
            "store.edit",
            "store.delete",
            "store.manage",
            "audit.view",
            "audit.export"
        ]
    },
    {
        "key": "editor",
        "label": "Editor",
        "description": "Crea, edita y publica el contenido del sitio y usa las herramientas de comunicación. No administra usuarios, cuentas de correo ni configuración.",
        "scope": "site",
        "protected": true,
        "permissions": [
            "content_studio.view",
            "content_studio.create",
            "content_studio.edit",
            "content_studio.edit_own",
            "content_studio.delete",
            "content_studio.delete_own",
            "content_studio.publish",
            "news.view",
            "news.create",
            "news.edit",
            "news.edit_own",
            "news.delete",
            "news.delete_own",
            "news.publish",
            "publications.view",
            "publications.create",
            "publications.edit",
            "publications.edit_own",
            "publications.delete",
            "publications.publish",
            "events.view",
            "events.create",
            "events.edit",
            "events.edit_own",
            "events.delete",
            "events.publish",
            "projects.view",
            "projects.create",
            "projects.edit",
            "projects.edit_own",
            "projects.delete",
            "projects.publish",
            "media.view",
            "media.create",
            "media.edit",
            "media.delete",
            "downloads.view",
            "downloads.create",
            "downloads.edit",
            "downloads.delete",
            "faqs.view",
            "faqs.create",
            "faqs.edit",
            "faqs.delete",
            "faqs.publish",
            "email_inbox.use_own",
            "contacts.view",
            "contacts.create",
            "contacts.edit",
            "social.view",
            "social.create",
            "social.publish",
            "analytics.view",
            "seo.view",
            "dashboard.view"
        ]
    },
    {
        "key": "author",
        "label": "Autor",
        "description": "Crea contenido y edita LO SUYO. Puede publicar lo propio; no toca lo que escribieron otros.",
        "scope": "site",
        "protected": true,
        "permissions": [
            "content_studio.view",
            "content_studio.create",
            "content_studio.edit_own",
            "content_studio.delete_own",
            "content_studio.publish",
            "news.view",
            "news.create",
            "news.edit_own",
            "news.delete_own",
            "news.publish",
            "publications.view",
            "publications.create",
            "publications.edit_own",
            "publications.publish",
            "events.view",
            "events.create",
            "events.edit_own",
            "events.publish",
            "projects.view",
            "projects.create",
            "projects.edit_own",
            "projects.publish",
            "media.view",
            "media.create",
            "downloads.view",
            "downloads.create",
            "faqs.view",
            "faqs.create",
            "faqs.publish",
            "email_inbox.use_own",
            "dashboard.view"
        ]
    },
    {
        "key": "contributor",
        "label": "Colaborador",
        "description": "Crea borradores y sube archivos. NO publica ni elimina, y no modifica el contenido de otras personas.",
        "scope": "site",
        "protected": true,
        "permissions": [
            "content_studio.view",
            "content_studio.create",
            "content_studio.edit_own",
            "news.view",
            "news.create",
            "news.edit_own",
            "publications.view",
            "publications.create",
            "publications.edit_own",
            "events.view",
            "events.create",
            "events.edit_own",
            "projects.view",
            "projects.create",
            "projects.edit_own",
            "media.view",
            "media.create",
            "downloads.view",
            "downloads.create",
            "faqs.view",
            "faqs.create",
            "email_inbox.use_own",
            "dashboard.view"
        ]
    },
    {
        "key": "institutional_user",
        "label": "Usuario institucional",
        "description": "Entra al panel con el menú base de su sitio: analíticas, contactos, su correo institucional, proyectos, noticias, socios, biblioteca, descargas y las finanzas en sólo lectura.",
        "scope": "site",
        "protected": true,
        "permissions": [
            "analytics.view",
            "contacts.view",
            "email_inbox.use_own",
            "projects.view",
            "projects.create",
            "projects.edit",
            "projects.publish",
            "news.view",
            "news.create",
            "news.edit",
            "news.publish",
            "members.view",
            "members.create",
            "members.edit",
            "media.view",
            "media.create",
            "media.edit",
            "downloads.view",
            "downloads.create",
            "downloads.edit",
            "contribution_campaigns.view",
            "contribution_campaigns.edit",
            "investment.view",
            "finance.view"
        ]
    }
];

export const MODULE_KEYS = MODULES.map(m => m.key);
const MODULE_BY_KEY = new Map(MODULES.map(m => [m.key, m]));
export const moduleOf = (key: string): ModuleSpec | null => MODULE_BY_KEY.get(String(key || '')) || null;

export const SITE_MODULES = MODULES.filter(m => m.scope !== 'platform');
export const PLATFORM_MODULES = MODULES.filter(m => m.scope === 'platform');
export const MODULE_GROUPS = MODULES.reduce<string[]>(
    (acc, m) => (acc.includes(m.group) ? acc : [...acc, m.group]), []);

const str = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export const permissionKey = (moduleKey: string, action: string) => `${str(moduleKey, 40)}.${str(action, 40)}`;

export interface ParsedPermission {
    key: string;
    moduleKey: string;
    action: string;
    base: string;
    own: boolean;
    module: ModuleSpec;
}

export const parsePermission = (permission: string): ParsedPermission | null => {
    const raw = str(permission, 120);
    const punto = raw.indexOf('.');
    if (punto <= 0 || punto === raw.length - 1) return null;
    const moduleKey = raw.slice(0, punto);
    const action = raw.slice(punto + 1);
    const mod = MODULE_BY_KEY.get(moduleKey);
    if (!mod || !mod.actions.includes(action)) return null;
    const own = action.endsWith(OWN_SUFFIX);
    return { key: raw, moduleKey, action, base: own ? action.slice(0, -OWN_SUFFIX.length) : action, own, module: mod };
};

export const PERMISSION_CATALOG = MODULES.flatMap(m => m.actions.map(a => permissionKey(m.key, a)));
const CATALOG_SET = new Set(PERMISSION_CATALOG);
export const isKnownPermission = (permission: string) => CATALOG_SET.has(str(permission, 120));

/**
 * ⚠️ LAS MISMAS TRES REGLAS QUE EL SERVIDOR, y por eso la prueba las compara
 * permiso por permiso: `manage` implica todo su módulo, una acción amplia
 * implica la propia (nunca al revés — es el punto 8), y cualquier acción
 * implica `view`. Si esta función divergiera, la matriz enseñaría una casilla
 * marcada que la ruta no concede.
 */
export const impliedBy = (permission: string): string[] => {
    const p = parsePermission(permission);
    if (!p) return [];
    const mod = p.module;
    const out = new Set<string>([p.key]);
    if (p.action === 'manage') {
        for (const a of mod.actions) out.add(permissionKey(mod.key, a));
        return [...out];
    }
    if (!p.own && mod.actions.includes(p.action + OWN_SUFFIX)) out.add(permissionKey(mod.key, p.action + OWN_SUFFIX));
    if (p.action === 'use_all' && mod.actions.includes('use_own')) out.add(permissionKey(mod.key, 'use_own'));
    if (mod.actions.includes('view') && p.action !== 'view') out.add(permissionKey(mod.key, 'view'));
    if (mod.actions.includes('view_own') && p.own) out.add(permissionKey(mod.key, 'view_own'));
    return [...out];
};

export const LEGACY_PERMISSION_MAP: Record<string, string[]> = {
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

export const satisfiesLegacy = (permissions: Iterable<string> | Set<string>, legacyKey: string): boolean => {
    const set = permissions instanceof Set ? permissions : new Set(permissions || []);
    const mapa = LEGACY_PERMISSION_MAP[str(legacyKey, 40)];
    if (!mapa) return false;
    return mapa.some(p => set.has(p));
};

export interface ExpandResult {
    permissions: string[];
    descartados: Array<{ key: string; motivo: string }>;
}

export const expandPermissions = (input: string[] | null | undefined): ExpandResult => {
    const pedidos = Array.isArray(input) ? input : [];
    const out = new Set<string>();
    const descartados: Array<{ key: string; motivo: string }> = [];
    const vistos = new Set<string>();
    for (const raw of pedidos) {
        const key = str(raw, 120);
        if (!key || vistos.has(key)) continue;
        vistos.add(key);
        if (LEGACY_PERMISSION_MAP[key]) {
            for (const p of LEGACY_PERMISSION_MAP[key]) for (const i of impliedBy(p)) out.add(i);
            continue;
        }
        if (!isKnownPermission(key)) { descartados.push({ key, motivo: 'No existe ese permiso.' }); continue; }
        for (const i of impliedBy(key)) out.add(i);
    }
    return { permissions: [...out].sort(), descartados };
};

export const ROLE_PRESET_KEYS = ROLE_PRESETS.map(r => r.key);
const PRESET_BY_KEY = new Map(ROLE_PRESETS.map(r => [r.key, r]));
export const presetRole = (key: string): RolePreset | null => PRESET_BY_KEY.get(str(key, 60)) || null;
export const SITE_ROLE_PRESETS = ROLE_PRESETS.filter(r => r.scope === 'site');

/** El `grant` que manda el servidor: la lista YA expandida y su rol. */
/**
 * ⚠️ EL RÓTULO DE «BANDEJA DE ENTRADA» PARA UN USUARIO INSTITUCIONAL.
 *
 * Espejo de `MENU_LABEL_OVERRIDES` en el servidor. Es un cambio de NOMBRE
 * VISIBLE y nada más: misma ruta, mismo módulo, mismos endpoints. La tabla se
 * comparte para que la pantalla y su prueba lean la misma.
 */
export const MENU_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
    "institutional": {
        "/admin/email": "Correo Institucional"
    }
};

export const menuLabelFor = (path: string, label: string, opts: { institutional?: boolean } = {}): string => {
    if (!opts.institutional) return label;
    const ruta = String(path || '').split('?')[0].split('#')[0];
    return MENU_LABEL_OVERRIDES.institutional[ruta] || label;
};

export interface Grant {
    permissions: string[];
    roleKey?: string | null;
    roleLabel?: string | null;
    source?: string;
    scope?: string;
    siteId?: string | null;
    /**
     * ⚠️ Si el menú se recorta o no. Lo decide el SERVIDOR
     * (`isRestrictedGrant` en `rbacSpec.js`) y viaja resuelto, por el mismo
     * motivo que la lista de permisos: con la clasificación también acá, el
     * menú y lo que responde la ruta podrían discrepar.
     */
    restricted?: boolean;
}

const setOf = (grant: Grant | string[] | Set<string> | null | undefined): Set<string> => {
    if (!grant) return new Set();
    if (grant instanceof Set) return grant;
    if (Array.isArray(grant)) return new Set(grant);
    if (Array.isArray((grant as Grant).permissions)) return new Set((grant as Grant).permissions);
    return new Set();
};

export const hasPermission = (grant: Grant | string[] | Set<string> | null | undefined, permission: string): boolean => {
    const set = setOf(grant);
    const key = str(permission, 120);
    if (!key) return false;
    if (set.has(key)) return true;
    if (LEGACY_PERMISSION_MAP[key]) return satisfiesLegacy(set, key);
    return false;
};

export const canAccessModule = (grant: Grant | string[] | Set<string> | null | undefined, moduleKey: string): boolean => {
    const mod = moduleOf(moduleKey);
    if (!mod) return false;
    const set = setOf(grant);
    return mod.actions.some(a => set.has(permissionKey(mod.key, a)));
};

/**
 * ⚠️ Sin `ownerId` se exige el permiso AMPLIO: ante la duda no se concede.
 * Quien llame sin el dato obtiene el criterio estricto, nunca el laxo.
 */
export const canActOn = (
    grant: Grant | string[] | Set<string> | null | undefined,
    moduleKey: string,
    action: string,
    { ownerId = null, actorId = null }: { ownerId?: string | null; actorId?: string | null } = {}
): boolean => {
    const set = setOf(grant);
    if (set.has(permissionKey(moduleKey, action))) return true;
    const mod = moduleOf(moduleKey);
    if (!mod) return false;
    const propio = permissionKey(moduleKey, `${action}${OWN_SUFFIX}`);
    if (!mod.actions.includes(`${action}${OWN_SUFFIX}`) || !set.has(propio)) return false;
    if (!ownerId || !actorId) return false;
    return String(ownerId) === String(actorId);
};

export const accessibleModules = (grant: Grant | string[] | Set<string> | null | undefined) =>
    MODULES.filter(m => canAccessModule(grant, m.key));

export const ALWAYS_VISIBLE_ROUTES = ['/admin/perfil'];

const matches = (route: string, path: string) =>
    path === route || path.startsWith(route + '/') || path.startsWith(route + '?');

export const modulesForPath = (path: string): ModuleSpec[] => {
    const ruta = str(path, 300).split('#')[0];
    const base = ruta.split('?')[0];
    return MODULES.filter(m => m.routes.some(r => matches(r, base) || matches(r, ruta)));
};

export const canOpenPath = (grant: Grant | string[] | Set<string> | null | undefined, path: string): boolean => {
    const ruta = str(path, 300).split('?')[0].split('#')[0];
    if (ALWAYS_VISIBLE_ROUTES.some(r => matches(r, ruta))) return true;
    const mods = modulesForPath(path);
    if (!mods.length) return false;
    return mods.some(m => canAccessModule(grant, m.key));
};

export const MEMBERSHIP_STATUSES = [
    { key: 'active', label: 'Activo', canSignIn: true, help: 'Entra al panel con normalidad.' },
    { key: 'invited', label: 'Invitado', canSignIn: true, help: 'Tiene acceso y todavía no ha entrado por primera vez.' },
    { key: 'suspended', label: 'Suspendido', canSignIn: false, help: 'No entra, y una sesión abierta deja de servirle en el acto.' },
    { key: 'disabled', label: 'Desactivado', canSignIn: false, help: 'Retirado del sitio. Se conserva para poder explicar lo que hizo.' },
];

export const MEMBERSHIP_STATUS_KEYS = MEMBERSHIP_STATUSES.map(s => s.key);
export const canSignIn = (status: string) =>
    MEMBERSHIP_STATUSES.find(s => s.key === str(status, 20))?.canSignIn ?? true;

/**
 * «Este usuario podrá acceder a Estudio de Contenido, Biblioteca Multimedia,
 * Noticias y su Bandeja de Entrada.» Se DERIVA de los permisos: con un resumen
 * escrito junto al rol, diría una cosa y la matriz otra, y quien asigna el rol
 * confiaría en la que se lee más fácil.
 */
export const describeRole = (permissions: string[]): string => {
    const { permissions: expandidos } = expandPermissions(permissions);
    const set = new Set(expandidos);
    const nombres = MODULES.filter(m => m.actions.some(a => set.has(permissionKey(m.key, a)))).map(m => m.label);
    if (!nombres.length) return 'Este usuario entrará al panel y no verá ninguna herramienta.';
    const lista = nombres.length === 1
        ? nombres[0]
        : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
    return `Este usuario podrá acceder a ${lista}.`;
};

export interface MatrixCell { action: string; available: boolean; permission: string | null; }
export interface MatrixModule {
    key: string; label: string; help: string; sensitive: boolean; scope: string; cells: MatrixCell[];
}
export interface MatrixGroup { group: string; modules: MatrixModule[]; }

export const permissionMatrix = ({ includePlatform = false }: { includePlatform?: boolean } = {}): MatrixGroup[] =>
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

export const ROLE_NAME_MAX = 60;
export const ROLE_DESCRIPTION_MAX = 300;

export default {
    ACTIONS, ACTION_KEYS, SCOPED_ACTIONS, ALL_ACTION_FORMS, OWN_SUFFIX, actionLabel,
    MODULES, MODULE_KEYS, SITE_MODULES, PLATFORM_MODULES, MODULE_GROUPS, moduleOf,
    permissionKey, parsePermission, PERMISSION_CATALOG, isKnownPermission,
    impliedBy, expandPermissions,
    LEGACY_PERMISSION_MAP, LEGACY_KEYS, satisfiesLegacy,
    ROLE_PRESETS, ROLE_PRESET_KEYS, SITE_ROLE_PRESETS, presetRole,
    hasPermission, canAccessModule, canActOn, accessibleModules,
    ALWAYS_VISIBLE_ROUTES, modulesForPath, canOpenPath,
    MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_KEYS, canSignIn,
    describeRole, permissionMatrix, ROLE_NAME_MAX, ROLE_DESCRIPTION_MAX,
};
