// ════════════════════════════════════════════════════════════════════════════
// Especificación Central de Módulos y Menús por Sitio (Club Platform SaaS)
//
// Define el catálogo estructurado de módulos, opciones y grupos de la barra lateral,
// sus rutas asociadas, sus niveles de suscripción (tiers) y la configuración
// predeterminada para todos los sitios de clubes rotarios.
// ════════════════════════════════════════════════════════════════════════════

export const ORIGEN_CLUB_ID = '857498f8-4836-4c5b-95b2-80d8c073edfc';
export const SETTING_KEY_SITE_MODULES = 'site_modules_config';

/**
 * Catálogo maestro de módulos y opciones administrables por sitio.
 */
export const SITE_MODULES_CATALOG = [
    // ── GRUPO: FINANZAS ──────────────────────────────────────────────────────
    {
        key: 'finance_investment',
        label: 'Mi Inversión',
        group: 'Finanzas',
        routes: ['/admin/inversion'],
        icon: 'Wallet',
        description: 'Seguimiento de inversiones, rentabilidad de capital y acuerdos de crowdfunding.',
        tier: 'premium',
        defaultEnabled: false, // Deshabilitado por defecto (salvo excepción Rotary E-Club Origen)
    },
    {
        key: 'finance_vault',
        label: 'Bóveda de Fondos',
        group: 'Finanzas',
        routes: ['/admin/boveda'],
        icon: 'Wallet',
        description: 'Gestión financiera de aportes recibidos, saldo disponible y solicitudes de desembolso.',
        tier: 'premium',
        defaultEnabled: false, // Deshabilitado por defecto (salvo excepción Rotary E-Club Origen)
    },

    // ── GRUPO: CONFIGURACIÓN E IDENTIDAD ─────────────────────────────────────
    {
        key: 'config_wizard',
        label: 'Resumen / Asistente',
        group: 'Configuración e Identidad',
        routes: ['/admin/dashboard?view=wizard'],
        icon: 'LayoutDashboard',
        description: 'Asistente paso a paso de puesta a punto y bienvenida al panel.',
        tier: 'basic',
        defaultEnabled: false, // Oculto por defecto para clubes
    },
    {
        key: 'config_technical',
        label: 'Solicitudes Técnicas',
        group: 'Configuración e Identidad',
        routes: ['/admin/technical-requests'],
        icon: 'ShieldCheck',
        description: 'Canal de solicitudes técnicas, migración de dominios y soporte directo con Club Platform.',
        tier: 'basic',
        defaultEnabled: true, // Visible para clubes
    },
    {
        key: 'config_identity',
        label: 'Configuración / Identidad',
        group: 'Configuración e Identidad',
        routes: ['/admin/configuracion'],
        icon: 'Settings',
        description: 'Identidad del club, logotipos, colores, redes sociales, datos de contacto y facturación.',
        tier: 'basic',
        defaultEnabled: true, // Visible para clubes
    },
    {
        key: 'config_domain',
        label: 'Dominio y Publicación',
        group: 'Configuración e Identidad',
        routes: ['/admin/configuracion?tab=avanzado'],
        icon: 'Globe',
        description: 'Ajustes avanzados de DNS, dominios personalizados y certificados SSL.',
        tier: 'pro',
        defaultEnabled: false, // Oculto por defecto para clubes
    },
    {
        key: 'config_users',
        label: 'Usuarios y permisos',
        group: 'Configuración e Identidad',
        routes: ['/admin/usuarios-permisos'],
        icon: 'UserCog',
        description: 'Administración de roles institucionales, directiva y matriz de permisos por usuario.',
        tier: 'pro',
        defaultEnabled: false, // Oculto por defecto para clubes
    },

    // ── GRUPO: GENERAL ───────────────────────────────────────────────────────
    {
        key: 'analytics',
        label: 'Analíticas',
        group: 'General',
        routes: ['/admin/analytics'],
        icon: 'PieChart',
        description: 'Estadísticas de tráfico web Google Analytics 4 e impacto en redes sociales.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'seo',
        label: 'SEO Inteligente',
        group: 'General',
        routes: ['/admin/seo'],
        icon: 'Search',
        description: 'Optimización en motores de búsqueda, metadatos, robots.txt y sitemaps.',
        tier: 'pro',
        defaultEnabled: true,
    },
    {
        key: 'intelligence',
        label: 'Centro de Inteligencia',
        group: 'General',
        routes: ['/admin/inteligencia'],
        icon: 'Brain',
        description: 'Cerebro de IA entrenado con la historia, proyectos y contexto del club.',
        tier: 'pro',
        defaultEnabled: true,
    },
    {
        key: 'content_studio',
        label: 'Content Studio',
        group: 'General',
        routes: ['/admin/content-studio'],
        icon: 'Video',
        description: 'Estudio de creación audiovisual, edición de video vertical y diseño gráfico.',
        tier: 'pro',
        defaultEnabled: true,
    },
    {
        key: 'contacts_leads',
        label: 'Contactos & Leads',
        group: 'General',
        routes: ['/admin/leads'],
        icon: 'UserPlus',
        description: 'Directorio de prospectos, remitentes de formularios y base de contactos.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'inbox_email',
        label: 'Bandeja de Entrada',
        group: 'General',
        routes: ['/admin/email'],
        icon: 'Mail',
        description: 'Correo institucional centralizado y comunicación directa con la comunidad.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'training_reserve',
        label: 'Reservar Capacitación',
        group: 'General',
        routes: ['/admin/agenda-soporte'],
        icon: 'CalendarClock',
        description: 'Agendamiento de sesiones de acompañamiento y capacitación con el equipo técnico.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'projects',
        label: 'Proyectos',
        group: 'General',
        routes: ['/admin/proyectos'],
        icon: 'FolderKanban',
        description: 'Gestión y catálogo de proyectos comunitarios y obras sociales del club.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'news',
        label: 'Noticias',
        group: 'General',
        routes: ['/admin/noticias'],
        icon: 'Newspaper',
        description: 'Publicación de artículos de blog, boletines de noticias y notas de prensa.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'events',
        label: 'Eventos',
        group: 'General',
        routes: ['/admin/eventos'],
        icon: 'Calendar',
        description: 'Calendario de actividades rotarias, reuniones semanales y jornadas.',
        tier: 'basic',
        defaultEnabled: true,
    },

    // ── GRUPO: CONTENIDO ─────────────────────────────────────────────────────
    {
        key: 'members',
        label: 'Socios y Junta Directiva',
        group: 'Contenido',
        routes: ['/admin/miembros'],
        icon: 'Users',
        description: 'Directorio público e interno de socios del club y cuadro de directiva.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'media',
        label: 'Multimedia',
        group: 'Contenido',
        routes: ['/admin/media'],
        icon: 'ImageIcon',
        description: 'Biblioteca de fotografías, videos y archivos del sitio.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'site_images',
        label: 'Imágenes del Sitio',
        group: 'Contenido',
        routes: ['/admin/imagenes-sitio'],
        icon: 'Palette',
        description: 'Banners de portada, carruseles y elementos gráficos de la web.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'payment_blocks',
        label: 'Bloques de Pago',
        group: 'Contenido',
        routes: ['/admin/bloques-pago'],
        icon: 'HeartHandshake',
        description: 'Tarjetas de aportes voluntarios, cuotas y membresías en la página pública.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'downloads',
        label: 'Centro de Descargas',
        group: 'Contenido',
        routes: ['/admin/descargas'],
        icon: 'Upload',
        description: 'Documentos, estatutos y archivos descargables para el público o socios.',
        tier: 'basic',
        defaultEnabled: true,
    },
    {
        key: 'contribution_campaigns',
        label: 'Campañas de Contribución',
        group: 'Contenido',
        routes: ['/admin/campanas-contribucion'],
        icon: 'Megaphone',
        description: 'Iniciativas de recaudo para proyectos y causas de servicio humanitario.',
        tier: 'pro',
        defaultEnabled: true,
    },
    {
        key: 'activation_campaigns',
        label: 'Campañas de Activación',
        group: 'Contenido',
        routes: ['/admin/activacion-contenido'],
        icon: 'Megaphone',
        description: 'Flujos de activación y captación de aportes de clubes para la red rotaria.',
        tier: 'pro',
        defaultEnabled: true,
    },
    {
        key: 'faqs',
        label: 'Preguntas Frecuentes',
        group: 'Contenido',
        routes: ['/admin/faqs'],
        icon: 'HelpCircle',
        description: 'Sección de preguntas frecuentes para visitantes y nuevos miembros.',
        tier: 'basic',
        defaultEnabled: true,
    },

    // ── GRUPO: E-COMMERCE ────────────────────────────────────────────────────
    {
        key: 'ecommerce_store',
        label: 'Tienda',
        group: 'E-commerce',
        routes: ['/admin/tienda'],
        icon: 'Store',
        description: 'Catálogo de productos físicos y souvenirs con pasarela de pagos integrada.',
        tier: 'pro',
        defaultEnabled: false, // Depende de contratación de tienda
    },
    {
        key: 'ecommerce_orders',
        label: 'Órdenes y Pagos',
        group: 'E-commerce',
        routes: ['/admin/ordenes'],
        icon: 'Receipt',
        description: 'Historial de compras, pedidos y despachos realizados por clientes.',
        tier: 'pro',
        defaultEnabled: false,
    },

    // ── GRUPO: PROGRAMAS ─────────────────────────────────────────────────────
    {
        key: 'rotaract',
        label: 'Club Rotaract',
        group: 'Programas',
        routes: ['/admin/rotaract'],
        icon: 'Users',
        description: 'Módulo dedicado al club Rotaract patrocinado por este club.',
        tier: 'basic',
        defaultEnabled: false,
    },
    {
        key: 'interact',
        label: 'Club Interact',
        group: 'Programas',
        routes: ['/admin/interact'],
        icon: 'Users',
        description: 'Módulo dedicado al club Interact escolar patrocinado por este club.',
        tier: 'basic',
        defaultEnabled: false,
    },
    {
        key: 'youth_exchange',
        label: 'Intercambios Jóvenes (RYE)',
        group: 'Programas',
        routes: ['/admin/intercambios-jovenes'],
        icon: 'Globe',
        description: 'Programa de intercambio de jóvenes (Rotary Youth Exchange).',
        tier: 'pro',
        defaultEnabled: false,
    },
    {
        key: 'ngse',
        label: 'Intercambios NGSE',
        group: 'Programas',
        routes: ['/admin/ngse'],
        icon: 'Briefcase',
        description: 'Programa de intercambios vocacionales para las nuevas generaciones.',
        tier: 'pro',
        defaultEnabled: false,
    },
    {
        key: 'rotex',
        label: 'ROTEX',
        group: 'Programas',
        routes: ['/admin/rotex'],
        icon: 'Award',
        description: 'Red de ex becarios y participantes del programa de intercambio.',
        tier: 'pro',
        defaultEnabled: false,
    },

    // ── GRUPO: COMPLIANCE ────────────────────────────────────────────────────
    {
        key: 'compliance_dian',
        label: 'Estados Financieros',
        group: 'Compliance',
        routes: ['/admin/estados-financieros'],
        icon: 'FileText',
        description: 'Módulo de rendición de cuentas, balances y declaraciones financieras.',
        tier: 'pro',
        defaultEnabled: false,
    },
];

/**
 * Mapa de configuración por defecto para todos los sitios de clubes rotarios.
 */
export const DEFAULT_SITE_MODULES_CONFIG = SITE_MODULES_CATALOG.reduce((acc, mod) => {
    acc[mod.key] = mod.defaultEnabled;
    return acc;
}, {});

/**
 * Excepciones fundacionales por club (como Rotary E-Club Origen que tiene inversión activa).
 */
export const FOUNDATIONAL_CLUB_EXCEPTIONS = {
    [ORIGEN_CLUB_ID]: {
        finance_investment: true,
        finance_vault: true,
    },
    'rotaryecluborigen': {
        finance_investment: true,
        finance_vault: true,
    },
    'rotary-e-club-origen': {
        finance_investment: true,
        finance_vault: true,
    },
};

/**
 * Resuelve la configuración final de un club, aplicando:
 * 1. Defaults globales.
 * 2. Excepciones fundacionales específicas (como Origen).
 * 3. Overrides guardados en base de datos para ese club.
 */
export function resolveClubModulesConfig(savedClubConfig = null, globalDefaults = null, clubIdOrSubdomain = null) {
    const base = { ...DEFAULT_SITE_MODULES_CONFIG, ...(globalDefaults || {}) };

    // Si coincide con Rotary E-Club Origen, aplicar su excepción fundacional
    if (clubIdOrSubdomain) {
        const idKey = String(clubIdOrSubdomain).trim();
        const foundException = FOUNDATIONAL_CLUB_EXCEPTIONS[idKey];
        if (foundException) {
            Object.assign(base, foundException);
        }
    }

    // Si el club tiene configuración particular en BD, tiene precedencia
    if (savedClubConfig && typeof savedClubConfig === 'object') {
        Object.keys(savedClubConfig).forEach(key => {
            if (typeof savedClubConfig[key] === 'boolean') {
                base[key] = savedClubConfig[key];
            }
        });
    }

    return base;
}

/**
 * Lista de grupos únicos para el agrupador del panel administrativo.
 */
export const SITE_MODULE_GROUPS = Array.from(
    new Set(SITE_MODULES_CATALOG.map(m => m.group))
);
