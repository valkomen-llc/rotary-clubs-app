// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente (AI SEO Engine) — FUENTE DE VERDAD
//
// Todo lo que el módulo da por cierto vive acá: qué páginas tiene un sitio, qué
// límites respeta cada etiqueta, cuánto pesa cada señal en la nota y qué
// significa cada hallazgo. El resto de los archivos LEE de aquí; ninguno
// redeclara un límite por su cuenta.
//
// Por qué un solo archivo: el módulo es transversal —lo consumen el servidor que
// pinta el HTML, la auditoría, la IA y el panel—. Con los límites repartidos, el
// día que Google cambie la longitud del título habría que corregirlo en cinco
// sitios y el quinto se olvidaría.
//
// REGLA RECTORA DEL MÓDULO, heredada del Creador de Reels y del panel de
// auditoría del CRM: **se registra lo que se MIDE y se declara lo que se
// estima**. Un volumen de búsqueda que no consultamos a nadie es una estimación
// y se dice; un backlink que no vimos no se inventa. Un cero es una afirmación,
// un hueco es la verdad.
// ════════════════════════════════════════════════════════════════════════════

// ── Longitudes ───────────────────────────────────────────────────────────────
// No son gustos: son los anchos en píxeles con los que Google recorta el
// resultado, traducidos a caracteres. Meta description no es factor de ranking
// pero sí de CTR, y un texto cortado a mitad de palabra baja el clic.
export const LIMITS = {
    title: { min: 30, max: 60, hardMax: 70 },
    description: { min: 70, max: 155, hardMax: 200 },
    // og:title tolera más que el <title> porque no compite con el ancho del SERP
    ogTitle: { min: 20, max: 88, hardMax: 95 },
    ogDescription: { min: 50, max: 200, hardMax: 300 },
    // WhatsApp/Facebook piden 1200×630 (1.91:1). Por debajo de 200px de lado
    // Facebook directamente no muestra tarjeta.
    ogImage: { minWidth: 200, minHeight: 200, idealWidth: 1200, idealHeight: 630 },
    slug: { max: 75 },
    altText: { min: 5, max: 125 },
    h1: { expected: 1 },
};

// ── Tipos de página ──────────────────────────────────────────────────────────
// `kind` describe QUÉ es la página, no en qué módulo vive. Es lo que decide el
// Schema.org, la prioridad del sitemap y qué preguntas le hace la auditoría.
//
// `dynamic: true` = la fila sale de la base (una noticia, un proyecto). El resto
// son páginas fijas del sitio.
//
// `noindex: true` = nunca debe indexarse. Un panel privado, un checkout o un
// acuse de pago no aportan nada a un buscador y sí diluyen el sitio.
export const PAGE_KINDS = {
    home: { schema: 'WebSite', priority: 1.0, changefreq: 'daily' },
    about: { schema: 'AboutPage', priority: 0.8, changefreq: 'monthly' },
    contact: { schema: 'ContactPage', priority: 0.6, changefreq: 'yearly' },
    blog_index: { schema: 'Blog', priority: 0.9, changefreq: 'daily' },
    post: { schema: 'BlogPosting', priority: 0.7, changefreq: 'monthly', dynamic: true },
    projects_index: { schema: 'CollectionPage', priority: 0.9, changefreq: 'weekly' },
    project: { schema: 'Project', priority: 0.8, changefreq: 'weekly', dynamic: true },
    events_index: { schema: 'CollectionPage', priority: 0.8, changefreq: 'weekly' },
    event: { schema: 'Event', priority: 0.8, changefreq: 'weekly', dynamic: true },
    shop_index: { schema: 'CollectionPage', priority: 0.7, changefreq: 'weekly' },
    product: { schema: 'Product', priority: 0.7, changefreq: 'weekly', dynamic: true },
    generic: { schema: 'WebPage', priority: 0.5, changefreq: 'monthly' },
    private: { schema: null, priority: 0, changefreq: null, noindex: true },
};

// ── El mapa real de rutas públicas ───────────────────────────────────────────
// Espejo de `src/App.tsx`. Está escrito a mano a propósito: el servidor no puede
// importar el árbol de rutas de React, y una ruta que exista en el navegador y
// no acá simplemente cae en `generic` — se degrada, no se rompe.
//
// OJO al agregar una ruta pública nueva: si no se declara, entra al sitemap con
// prioridad de relleno y sin Schema propio.
export const STATIC_ROUTES = [
    { path: '/', kind: 'home', label: 'Inicio' },
    { path: '/quienes-somos', kind: 'about', label: 'Quiénes somos' },
    { path: '/nuestra-historia', kind: 'about', label: 'Nuestra historia' },
    { path: '/nuestras-causas', kind: 'generic', label: 'Nuestras causas' },
    { path: '/nuestros-socios', kind: 'generic', label: 'Nuestros socios' },
    { path: '/nuestra-junta-directiva', kind: 'generic', label: 'Junta directiva' },
    { path: '/socios-honorarios', kind: 'generic', label: 'Socios honorarios' },
    { path: '/nuestros-gobernadores', kind: 'generic', label: 'Gobernadores' },
    { path: '/nuestros-autores', kind: 'generic', label: 'Autores' },
    { path: '/maneras-de-contribuir', kind: 'generic', label: 'Maneras de contribuir' },
    { path: '/involucrate', kind: 'generic', label: 'Involúcrate' },
    { path: '/intercambio-jovenes', kind: 'generic', label: 'Intercambio de jóvenes' },
    { path: '/rotaract', kind: 'generic', label: 'Rotaract' },
    { path: '/interact', kind: 'generic', label: 'Interact' },
    { path: '/rotex', kind: 'generic', label: 'Rotex' },
    { path: '/la-fundacion-rotaria', kind: 'generic', label: 'La Fundación Rotaria' },
    { path: '/blog', kind: 'blog_index', label: 'Blog' },
    { path: '/proyectos', kind: 'projects_index', label: 'Proyectos' },
    { path: '/eventos', kind: 'events_index', label: 'Eventos' },
    { path: '/shop', kind: 'shop_index', label: 'Tienda' },
    { path: '/contacto', kind: 'contact', label: 'Contacto' },
    { path: '/estados-financieros', kind: 'generic', label: 'Estados financieros' },
    { path: '/descargas', kind: 'generic', label: 'Descargas' },
    { path: '/aportes', kind: 'generic', label: 'Aportes' },
    { path: '/postular-proyecto', kind: 'generic', label: 'Postular proyecto' },
    { path: '/agendar-capacitacion', kind: 'generic', label: 'Agendar capacitación' },
    { path: '/generador-pendones', kind: 'generic', label: 'Generador de pendones' },
];

// Rutas que NUNCA se indexan. No es una lista de "páginas feas": son pantallas
// con sesión, pasos de pago y acuses. Indexarlas expone flujos privados y le
// resta peso al contenido que sí importa.
//
// Se comparan por PREFIJO, así que `/admin` cubre todo el panel.
export const PRIVATE_PREFIXES = [
    '/admin', '/login', '/registro', '/verify-email', '/checkout', '/order',
    '/donacion/exito', '/donacion/cancelada', '/mi-proyecto', '/mi-inscripcion',
    '/mi-capacitacion', '/informe', '/preview', '/system-updates',
    '/registro-feria', '/feria-proyectos', '/inscribir-proyecto',
    // v4.721 — El portal público de Plantillas IA. Es abierto a propósito, pero
    // no es CONTENIDO del sitio: es una herramienta que se abre desde un enlace
    // compartido. Indexar un `/plantillas/aniversario` por cada publicación
    // haría competir utilidades con las páginas reales del club por sus propios
    // términos de marca. Abierto y no indexado son cosas distintas.
    '/plantillas',
];

export function isPrivatePath(pathname = '/') {
    const p = String(pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
    return PRIVATE_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'));
}

// ── Pesos de la nota ─────────────────────────────────────────────────────────
// La nota es 0-100 y se reparte entre cinco ejes. Los pesos están acá y no
// dispersos en el cálculo para que se puedan discutir sin leer código.
//
// Por qué `indexability` pesa lo que pesa: es el único eje que puede dejar el
// resto en nada. Una página con el mejor contenido del mundo y un canonical
// equivocado no existe para el buscador. No es "un factor más".
export const SCORE_WEIGHTS = {
    indexability: 30,  // canonical, robots, sitemap, noindex accidental
    metadata: 25,  // title, description, OG, Twitter
    content: 20,  // H1, estructura, longitud, ALT, enlaces internos
    structured: 15,  // JSON-LD válido y del tipo correcto
    technical: 10,  // HTTPS, 404, redirecciones, velocidad
};

// ── Catálogo de hallazgos ────────────────────────────────────────────────────
// Cada regla que la auditoría sabe comprobar vive acá con su severidad, su eje,
// su esfuerzo y si la IA puede resolverla sola.
//
// `autoFixable` es una promesa: si dice true, el botón "Aplicar" del Centro de
// Recomendaciones tiene que poder resolverlo sin que nadie escriba nada. Un
// hallazgo marcado como automático que abra un formulario es peor que uno
// marcado como manual.
//
// `impact` es 0-100 y ordena el Centro de Recomendaciones. NO es un porcentaje
// de mejora de tráfico: nadie puede predecir eso y prometerlo sería justamente
// el tipo de afirmación que este módulo no hace. Es peso relativo dentro del
// propio sitio.
export const ISSUES = {
    // ── Indexabilidad ────────────────────────────────────────────────────────
    canonical_missing: {
        axis: 'indexability', severity: 'critical', impact: 90, effort: 'auto',
        autoFixable: true,
        label: 'Falta la etiqueta canonical',
        why: 'Sin canonical, dos direcciones que muestran lo mismo compiten entre sí y el buscador reparte el peso.',
    },
    canonical_fragment: {
        axis: 'indexability', severity: 'critical', impact: 100, effort: 'auto',
        autoFixable: true,
        label: 'La canonical apunta a una dirección con #',
        why: 'El buscador descarta todo lo que va después de #. Una canonical con # equivale a declarar que TODA página del sitio es la portada, y el sitio entero se indexa como una sola dirección.',
    },
    noindex_unexpected: {
        axis: 'indexability', severity: 'critical', impact: 95, effort: 'low',
        autoFixable: false,
        label: 'La página se declara no indexable',
        why: 'Una página pública marcada noindex nunca aparecerá en resultados.',
    },
    not_in_sitemap: {
        axis: 'indexability', severity: 'medium', impact: 45, effort: 'auto',
        autoFixable: true,
        label: 'La página no está en el sitemap',
        why: 'El sitemap es como el sitio le dice al buscador qué existe y cuándo cambió.',
    },
    // ── Metadatos ────────────────────────────────────────────────────────────
    title_missing: {
        axis: 'metadata', severity: 'critical', impact: 88, effort: 'auto',
        autoFixable: true,
        label: 'Falta el título SEO',
        why: 'El título es la línea azul del resultado y el factor de contenido con más peso.',
    },
    title_too_short: {
        axis: 'metadata', severity: 'medium', impact: 40, effort: 'auto',
        autoFixable: true,
        label: 'El título es demasiado corto',
        why: `Por debajo de ${LIMITS.title.min} caracteres se desaprovecha el espacio del resultado.`,
    },
    title_too_long: {
        axis: 'metadata', severity: 'medium', impact: 45, effort: 'auto',
        autoFixable: true,
        label: 'El título supera la longitud recomendada',
        why: `Por encima de ${LIMITS.title.max} caracteres el buscador lo recorta con puntos suspensivos.`,
    },
    title_duplicated: {
        axis: 'metadata', severity: 'high', impact: 65, effort: 'auto',
        autoFixable: true,
        label: 'El título se repite en otra página',
        why: 'Dos páginas con el mismo título compiten por la misma búsqueda y ninguna gana.',
    },
    description_missing: {
        axis: 'metadata', severity: 'high', impact: 70, effort: 'auto',
        autoFixable: true,
        label: 'Falta la meta descripción',
        why: 'Sin descripción el buscador improvisa un fragmento del texto, casi siempre peor que uno escrito.',
    },
    description_too_long: {
        axis: 'metadata', severity: 'low', impact: 25, effort: 'auto',
        autoFixable: true,
        label: 'La descripción supera la longitud recomendada',
        why: `Por encima de ${LIMITS.description.max} caracteres se recorta a mitad de frase.`,
    },
    description_too_short: {
        axis: 'metadata', severity: 'low', impact: 22, effort: 'auto',
        autoFixable: true,
        label: 'La descripción es demasiado corta',
        why: 'Una descripción de una línea desaprovecha el espacio que da el resultado para convencer.',
    },
    description_duplicated: {
        axis: 'metadata', severity: 'medium', impact: 38, effort: 'auto',
        autoFixable: true,
        label: 'La descripción se repite en otra página',
        why: 'Una descripción genérica repetida no distingue una página de otra en los resultados.',
    },
    og_missing: {
        axis: 'metadata', severity: 'high', impact: 72, effort: 'auto',
        autoFixable: true,
        label: 'Faltan las etiquetas Open Graph',
        why: 'Sin Open Graph, al compartir el enlace en WhatsApp, Facebook o LinkedIn no aparece ni título propio ni imagen.',
    },
    og_duplicated: {
        axis: 'metadata', severity: 'critical', impact: 92, effort: 'auto',
        autoFixable: true,
        label: 'Las etiquetas Open Graph están duplicadas',
        why: 'Cuando una etiqueta og: aparece dos veces, las redes leen la PRIMERA. Si la primera es la genérica de la plataforma, todos los sitios comparten la misma vista previa.',
    },
    og_image_missing: {
        axis: 'metadata', severity: 'high', impact: 68, effort: 'auto',
        autoFixable: true,
        label: 'Falta la imagen para compartir (og:image)',
        why: 'Un enlace sin imagen ocupa una franja de texto en el chat; con imagen ocupa una tarjeta y se pulsa mucho más.',
    },
    twitter_missing: {
        axis: 'metadata', severity: 'low', impact: 20, effort: 'auto',
        autoFixable: true,
        label: 'Faltan las Twitter Cards',
        why: 'X/Twitter usa sus propias etiquetas; sin ellas cae a Open Graph y pierde el formato grande.',
    },
    // ── Contenido ────────────────────────────────────────────────────────────
    h1_missing: {
        axis: 'content', severity: 'high', impact: 60, effort: 'low',
        autoFixable: false,
        label: 'La página no tiene H1',
        why: 'El H1 es el titular de la página; sin él, el buscador infiere el tema del resto del texto.',
    },
    h1_multiple: {
        axis: 'content', severity: 'low', impact: 22, effort: 'low',
        autoFixable: false,
        label: 'Hay más de un H1',
        why: 'Varios H1 reparten el titular en varios temas.',
    },
    heading_gap: {
        axis: 'content', severity: 'low', impact: 18, effort: 'low',
        autoFixable: false,
        label: 'La jerarquía de encabezados salta niveles',
        why: 'Un H4 colgando de un H2 rompe el esquema con el que se lee la estructura.',
    },
    content_thin: {
        axis: 'content', severity: 'medium', impact: 48, effort: 'high',
        autoFixable: false,
        label: 'Contenido demasiado breve',
        why: 'Una página con muy poco texto rara vez resuelve la búsqueda de nadie.',
    },
    alt_missing: {
        axis: 'content', severity: 'medium', impact: 42, effort: 'auto',
        autoFixable: true,
        label: 'Hay imágenes sin texto alternativo',
        why: 'El ALT es lo que lee un lector de pantalla y lo único que el buscador entiende de una imagen. Es accesibilidad antes que SEO.',
    },
    no_internal_links: {
        axis: 'content', severity: 'medium', impact: 35, effort: 'medium',
        autoFixable: false,
        label: 'La página no enlaza a ninguna otra del sitio',
        why: 'Una página sin enlaces salientes es un callejón: no reparte autoridad ni guía al lector.',
    },
    orphan_page: {
        axis: 'content', severity: 'medium', impact: 44, effort: 'medium',
        autoFixable: false,
        label: 'Ninguna página del sitio enlaza a esta',
        why: 'Una página huérfana sólo se alcanza por el sitemap; el buscador la lee como poco importante.',
    },
    duplicate_content: {
        axis: 'content', severity: 'high', impact: 58, effort: 'high',
        autoFixable: false,
        label: 'Contenido muy parecido a otra página',
        why: 'Dos páginas casi iguales se canibalizan: el buscador elige una y descarta la otra.',
    },
    // ── Datos estructurados ──────────────────────────────────────────────────
    schema_missing: {
        axis: 'structured', severity: 'medium', impact: 50, effort: 'auto',
        autoFixable: true,
        label: 'La página no tiene datos estructurados',
        why: 'El JSON-LD es lo que habilita los resultados enriquecidos: fechas de evento, migas de pan, preguntas frecuentes.',
    },
    schema_wrong_type: {
        axis: 'structured', severity: 'low', impact: 28, effort: 'auto',
        autoFixable: true,
        label: 'El tipo de dato estructurado no corresponde',
        why: 'Declarar un evento como artículo desaprovecha el resultado enriquecido que sí le tocaba.',
    },
    breadcrumb_missing: {
        axis: 'structured', severity: 'low', impact: 20, effort: 'auto',
        autoFixable: true,
        label: 'Faltan las migas de pan estructuradas',
        why: 'Con BreadcrumbList el resultado muestra la ruta en vez de la dirección cruda.',
    },
    // ── Técnico ──────────────────────────────────────────────────────────────
    robots_blocks_all: {
        axis: 'technical', severity: 'critical', impact: 100, effort: 'low',
        autoFixable: false,
        label: 'robots.txt bloquea todo el sitio',
        why: 'Un Disallow: / deja el sitio fuera de los buscadores por completo.',
    },
    robots_fragment_rule: {
        axis: 'technical', severity: 'medium', impact: 40, effort: 'auto',
        autoFixable: true,
        label: 'robots.txt tiene reglas con # que no hacen nada',
        why: 'El navegador nunca manda el fragmento al servidor, así que una regla sobre /#/algo no bloquea nada. Peor: da por protegido algo que está abierto.',
    },
    sitemap_missing: {
        axis: 'technical', severity: 'high', impact: 62, effort: 'auto',
        autoFixable: true,
        label: 'El sitio no publica sitemap',
        why: 'Sin sitemap el buscador descubre las páginas sólo siguiendo enlaces.',
    },
    slow_page: {
        axis: 'technical', severity: 'medium', impact: 46, effort: 'high',
        autoFixable: false,
        label: 'La página carga lento',
        why: 'La velocidad es factor de posicionamiento declarado y, sobre todo, de abandono.',
    },
};

// Orden de severidad, para ordenar sin repetir el criterio en cada pantalla.
export const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

// ── Estado de una medición ───────────────────────────────────────────────────
// Mismo criterio que el panel de diagnóstico del CRM: `unknown` NO es un tipo de
// "bien". Presentar "no se pudo comprobar" como verde manda a buscar el problema
// donde no está.
export const MEASUREMENT_STATES = ['ok', 'warn', 'fail', 'unknown'];

// ── Procedencia de un dato ───────────────────────────────────────────────────
// Es lo que sostiene la regla rectora del módulo. Cada número que el panel pinta
// lleva su procedencia, y la UI la muestra.
//
//   measured  — lo calculamos sobre nuestro propio contenido o nuestro HTML.
//   reported  — nos lo dio un tercero (Search Console, PageSpeed).
//   estimated — lo estimó un modelo. No es un dato de mercado.
//   unavailable — no hay forma de saberlo con lo que tenemos configurado.
export const PROVENANCE = ['measured', 'reported', 'estimated', 'unavailable'];

// ── Intención de búsqueda ────────────────────────────────────────────────────
export const SEARCH_INTENTS = {
    informational: { label: 'Informativa', hint: 'Quiere entender algo' },
    navigational: { label: 'Navegacional', hint: 'Busca un sitio concreto' },
    transactional: { label: 'Transaccional', hint: 'Quiere hacer algo: donar, inscribirse, comprar' },
    commercial: { label: 'Comercial', hint: 'Compara antes de decidir' },
};

// ── Integraciones declaradas ─────────────────────────────────────────────────
// Cada una dice qué necesita y qué aporta. El panel lee esto para pintar el
// estado real: una integración sin credencial se muestra como NO conectada, no
// como "0 impresiones". Un cero es una afirmación; un hueco es la verdad.
export const INTEGRATIONS = {
    search_console: {
        label: 'Google Search Console',
        provides: ['impresiones', 'clics', 'CTR', 'posición media', 'cobertura de indexación'],
        needs: ['GOOGLE_SEO_CLIENT_ID', 'GOOGLE_SEO_CLIENT_SECRET'],
        auth: 'oauth',
        note: 'Es la única fuente REAL de impresiones, clics y posición. Sin ella esos indicadores no se estiman: se declaran no disponibles.',
    },
    analytics4: {
        label: 'Google Analytics 4',
        provides: ['sesiones', 'usuarios', 'conversiones'],
        needs: ['GOOGLE_SEO_CLIENT_ID', 'GOOGLE_SEO_CLIENT_SECRET'],
        auth: 'oauth',
        note: 'El identificador de medición ya se guarda por sitio; esto añade la lectura de datos.',
    },
    pagespeed: {
        label: 'PageSpeed Insights',
        provides: ['LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'nota Lighthouse'],
        needs: ['PAGESPEED_API_KEY'],
        auth: 'api_key',
        note: 'Devuelve datos de laboratorio y, si el sitio tiene tráfico suficiente, datos de campo del informe CrUX.',
    },
    indexnow: {
        label: 'IndexNow (Bing, Yandex, Seznam)',
        provides: ['aviso inmediato de contenido nuevo o modificado'],
        needs: ['INDEXNOW_KEY'],
        auth: 'api_key',
        note: 'Google NO participa en IndexNow. Para Google el aviso equivalente es el sitemap con lastmod.',
    },
    bing_webmaster: {
        label: 'Bing Webmaster Tools',
        provides: ['cobertura y consultas en Bing'],
        needs: ['BING_WEBMASTER_KEY'],
        auth: 'api_key',
    },
    clarity: {
        label: 'Microsoft Clarity',
        provides: ['mapas de calor', 'grabaciones'],
        needs: [],
        auth: 'script',
        note: 'Se instala con un identificador por sitio; no expone API de lectura.',
    },
    business_profile: {
        label: 'Google Business Profile',
        provides: ['ficha local', 'reseñas'],
        needs: ['GOOGLE_SEO_CLIENT_ID', 'GOOGLE_SEO_CLIENT_SECRET'],
        auth: 'oauth',
    },
};

// ── Utilidades compartidas ───────────────────────────────────────────────────

// Recorta sin partir palabras. Un texto cortado a mitad de palabra se lee como
// un error del sistema — misma regla que los copies del Creador de Reels.
export function truncateAtWord(text, max) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
    return base.replace(/[.,;:—–-]+$/, '').trim() + '…';
}

// Quita etiquetas y entidades para poder medir y resumir el texto real.
export function stripHtml(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

// Escapa para que un texto pueda ir DENTRO de un atributo HTML.
//
// No es cosmético: hasta esta versión el servidor inyectaba
// `content="${club.description}"` sin escapar, así que una descripción con
// comillas partía la etiqueta en dos y dejaba texto suelto en el <head>. Con
// contenido que escribe el administrador, eso es además una vía de inyección.
export function escapeAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Escapa para incrustar JSON dentro de <script>. El único carácter que puede
// romper el bloque es `<` (en `</script>`); se neutraliza sin alterar el valor.
export function escapeJsonLd(obj) {
    return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// Convierte un texto en un slug limpio: sin tildes, sin signos, con guiones.
export function slugify(text, max = LIMITS.slug.max) {
    const base = String(text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (base.length <= max) return base;
    // Corta en el último guion completo para no dejar una palabra partida.
    const cut = base.slice(0, max);
    const lastDash = cut.lastIndexOf('-');
    return lastDash > max * 0.5 ? cut.slice(0, lastDash) : cut;
}

// Normaliza una ruta: sin barra final, sin query, sin fragmento. Es la clave con
// la que el módulo identifica una página, así que tiene que ser estable —
// `/blog/` y `/blog?x=1` son la misma página.
export function normalizePath(input) {
    let p = String(input || '/');
    p = p.split('#')[0].split('?')[0];
    if (!p.startsWith('/')) p = '/' + p;
    p = p.replace(/\/{2,}/g, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
}

// Clasifica una ruta en un `kind`. Es lo que ata una dirección a su Schema, su
// prioridad y sus preguntas de auditoría.
export function kindOfPath(pathname) {
    const p = normalizePath(pathname);
    if (isPrivatePath(p)) return 'private';
    const exact = STATIC_ROUTES.find(r => r.path === p);
    if (exact) return exact.kind;
    if (/^\/blog\/[^/]+$/.test(p)) return 'post';
    if (/^\/proyectos\/[^/]+$/.test(p)) return 'project';
    if (/^\/eventos\/[^/]+$/.test(p)) return 'event';
    if (/^\/shop\/product\/[^/]+$/.test(p)) return 'product';
    // Un registro de evento es un formulario con sesión: no se indexa.
    if (/^\/eventos\/[^/]+\/registro$/.test(p)) return 'private';
    return 'generic';
}

export default {
    LIMITS, PAGE_KINDS, STATIC_ROUTES, PRIVATE_PREFIXES, SCORE_WEIGHTS, ISSUES,
    SEVERITY_RANK, MEASUREMENT_STATES, PROVENANCE, SEARCH_INTENTS, INTEGRATIONS,
    isPrivatePath, truncateAtWord, stripHtml, escapeAttr, escapeJsonLd, slugify,
    normalizePath, kindOfPath,
};
